export type StopId = "apex-run" | "fortlite" | "buildblox" | "arcade";
export interface Point { x: number; y: number }
export interface Car extends Point { heading: number; speed: number }
export const landmarks: { id: StopId; title: string; point: Point }[] = [
  { id: "apex-run", title: "Apex Run", point: { x: 533, y: 246 } },
  { id: "fortlite", title: "FortLite", point: { x: 740, y: 527 } },
  { id: "buildblox", title: "BuildBlox", point: { x: 217, y: 481 } },
  { id: "arcade", title: "Arcade", point: { x: 531, y: 752 } },
];
export const spawnCar = (): Car => ({ x: 553, y: 272, heading: -2.42, speed: 0 });

// Centerlines traced on the 3:2 illustrated map. Both axes are in thousandths of the image.
const roads = [
  "493,400 520,404 549,408 570,420 595,426 620,436 647,440 671,445 693,455 700,465 699,475 692,489 692,499 703,511 723,521 751,528 785,541 811,557 826,575 834,596 832,614 820,632 799,649 769,672 740,692 714,713 682,732 654,746 625,756 600,759 576,758 551,754 531,752 511,756 490,760 465,761 441,757 416,750 389,741 361,734 331,729 307,722 285,710 258,692 239,677 226,659 221,646 221,628 226,613 239,598 254,582 266,564 273,550 271,537 266,524 255,514 238,502 223,491 217,481 218,474 228,465 245,457 274,449 303,446 337,443 365,438 383,428 394,417 402,400 425,398 458,398 493,400",
  "493,400 487,386 475,371 467,354 466,340 471,327 483,315 498,308 518,299 535,292 547,282 553,272 553,265 547,254 533,246 516,239 490,230 471,220 463,212 460,203 462,196 469,189 482,182 495,175 504,167 510,158 520,151 538,146 557,142 572,136 581,130",
  "493,400 493,424 490,442 484,458 473,477 466,492 465,509 467,525 475,543 482,561 484,578",
  "402,400 400,386 391,374 377,364 357,355 341,346 335,339 333,332 337,324 348,317",
  "595,426 602,412 600,402 602,395 613,383 628,372 647,363 665,354 678,346 684,337 685,329 680,321 671,313",
];
const aspect = 1.5;
const segments = roads.flatMap(road => {
  const points = road.split(" ").map(pair => pair.split(",").map(Number));
  return points.slice(1).map(([x, y], index) => {
    const [startX, startY] = points[index];
    const dx = x - startX;
    const dy = (y - startY) / aspect;
    return { startX, startY: startY / aspect, dx, dy, length2: dx * dx + dy * dy, angle: Math.atan2(dx, -dy) };
  });
});

export function stopAt(car: Point): StopId | null {
  return landmarks.find(({ point }) => Math.hypot(point.x - car.x, (point.y - car.y) / aspect) <= 34)?.id ?? null;
}

export function drive(car: Car, throttle: number, steer: number, dt: number) {
  const target = throttle >= 0 ? throttle * 117 : throttle * 58;
  const acceleration = throttle === 0 || car.speed * throttle < 0 ? 185 : 92;
  car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), acceleration * dt);
  car.heading += steer * (car.speed < -1 ? -1 : 1) * dt * 2.9;
  if (car.speed === 0) return;

  const x = car.x + Math.sin(car.heading) * car.speed * dt;
  const y = car.y / aspect - Math.cos(car.heading) * car.speed * dt;
  let nearest = Infinity;
  let cx = x, cy = y, tangent = car.heading;
  for (const segment of segments) {
    const dot = (x - segment.startX) * segment.dx + (y - segment.startY) * segment.dy;
    const fraction = Math.min(1, Math.max(0, dot / segment.length2));
    const px = segment.startX + fraction * segment.dx;
    const py = segment.startY + fraction * segment.dy;
    const distance = (px - x) ** 2 + (py - y) ** 2;
    if (distance < nearest) {
      nearest = distance;
      cx = px;
      cy = py;
      tangent = segment.angle;
    }
  }
  const radius = 4 + car.y / 230;
  const distance = Math.sqrt(nearest);
  const limit = distance > radius ? radius / distance : 1;
  car.x = cx + (x - cx) * limit;
  car.y = (cy + (y - cy) * limit) * aspect;
  // At bends, gently follow the road when the driver releases the steering.
  if (!steer && Math.abs(car.speed) > 5) {
    const difference = tangent - car.heading;
    const correction = Math.atan2(Math.sin(2 * difference), Math.cos(2 * difference)) / 2;
    car.heading += correction * Math.min(1, dt * 6);
  }
}

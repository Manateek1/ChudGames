import type { GameDefinition } from "../types/arcade";

export interface Point {
  x: number;
  z: number;
}
export interface Car extends Point {
  heading: number;
  speed: number;
}
export interface Gate extends Point {
  id: string;
  title: string;
  angle: number;
  color: string;
  approach: Point[];
}

export const GATE_HALF_WIDTH = 3.4;
export const TOP_SPEED = 22;
export const ROAD_WIDTH = 7.4;
const tau = Math.PI * 2;
const palette = [
  "#fe6b3b",
  "#edbc45",
  "#86c5cf",
  "#44bdb0",
  "#c787cd",
  "#efa14c",
  "#ed7299",
  "#858ed7",
  "#7ac37c",
  "#44abb6",
  "#ac8ad5",
  "#efab5e",
];

export function groundHeight(x: number, z: number) {
  return (
    0.6 +
    4 * Math.exp(-((z + 22) ** 2 / 380 + (x - 3) ** 2 / 900)) +
    0.55 * Math.sin(x * 0.069) * Math.cos(z * 0.052)
  );
}

function loopPoint(a: number) {
  return { x: Math.sin(a) * (43 + 3 * Math.cos(3 * a)), z: -Math.cos(a) * (28 + 2.4 * Math.sin(4 * a)) };
}
export const circuit = Array.from({ length: 97 }, (_, i) => loopPoint((i * tau) / 96));
const north = loopPoint(0),
  south = loopPoint(Math.PI);
export const crossRoad = Array.from({ length: 33 }, (_, i) => {
  const f = i / 32;
  return { x: 7 * Math.sin(f * tau) * Math.sin(f * Math.PI), z: north.z + (south.z - north.z) * f };
});

function openAngle(reserved: number[]) {
  if (!reserved.length) return 0;
  let largestGap = -1,
    midpoint = 0;
  const occupied = [...reserved].sort((a, b) => a - b);
  occupied.forEach((angle, i) => {
    const end = occupied[i + 1] ?? occupied[0] + tau;
    const mid = (angle + end) / 2;
    const a = loopPoint(angle),
      b = loopPoint(mid),
      c = loopPoint(end);
    const gap = Math.hypot(b.x - a.x, b.z - a.z) + Math.hypot(c.x - b.x, c.z - b.z);
    if (gap > largestGap) {
      largestGap = gap;
      midpoint = mid % tau;
    }
  });
  return midpoint;
}

export function makeGates(games: readonly GameDefinition[]): Gate[] {
  const angles = new Map<string, number>();
  for (const game of games) {
    if (game.islandGateDegrees !== undefined) {
      angles.set(game.id, ((((game.islandGateDegrees % 360) + 360) % 360) * tau) / 360);
    }
  }
  for (const game of games) {
    if (!angles.has(game.id)) angles.set(game.id, openAngle([...angles.values()]));
  }
  return games
    .filter((game) => game.isAvailable !== false)
    .map((game) => {
      const angle = angles.get(game.id)!;
      const index = Math.round((angle * palette.length) / tau);
      const start = loopPoint(angle);
      const length = game.id === "apex-run" ? 15 : 9.8;
      const nx = Math.sin(angle),
        nz = -Math.cos(angle);
      const x = start.x + nx * length,
        z = start.z + nz * length;
      return {
        id: game.id,
        title: game.title,
        angle,
        x,
        z,
        color: palette[index % palette.length],
        approach: [start, { x: x + nx * 3.4, z: z + nz * 3.4 }],
      };
    })
    .sort((a, b) => a.angle - b.angle);
}

export const spawnCar = (): Car => ({ x: 0, z: -24.5, heading: 0, speed: 0 });

export function parkOutside(gate: Gate): Car {
  return {
    x: gate.x - Math.sin(gate.angle) * 6.5,
    z: gate.z + Math.cos(gate.angle) * 6.5,
    heading: gate.angle + Math.PI,
    speed: 0,
  };
}

export function crossedGate(x: number, z: number, car: Point, gates: readonly Gate[]) {
  for (const gate of gates) {
    const nx = Math.sin(gate.angle),
      nz = -Math.cos(gate.angle);
    const before = (x - gate.x) * nx + (z - gate.z) * nz;
    const after = (car.x - gate.x) * nx + (car.z - gate.z) * nz;
    if (before === after || before < 0 === after < 0) continue;
    const fraction = before / (before - after);
    const side =
      (x - gate.x + (car.x - x) * fraction) * -nz + (z - gate.z + (car.z - z) * fraction) * nx;
    if (Math.abs(side) < GATE_HALF_WIDTH) return gate;
  }
}

export function makeRoads(gates: readonly Gate[]) {
  const paths = [circuit, crossRoad, ...gates.map((gate) => gate.approach)];
  const segments = paths.flatMap((path) =>
    path.slice(1).map((end, i) => {
      const { x, z } = path[i],
        dx = end.x - x,
        dz = end.z - z;
      return { x, z, dx, dz, length2: dx * dx + dz * dz };
    }),
  );
  return function closestRoad(x: number, z: number) {
    let cx = x,
      cz = z,
      best = Infinity;
    for (const seg of segments) {
      const t = Math.max(0, Math.min(1, ((x - seg.x) * seg.dx + (z - seg.z) * seg.dz) / seg.length2));
      const px = seg.x + t * seg.dx,
        pz = seg.z + t * seg.dz;
      const d2 = (px - x) ** 2 + (pz - z) ** 2;
      if (d2 < best) {
        best = d2;
        cx = px;
        cz = pz;
      }
    }
    return { x: cx, z: cz, distance: Math.sqrt(best) };
  };
}

export function drive(
  car: Car,
  throttle: number,
  steer: number,
  dt: number,
  closestRoad: ReturnType<typeof makeRoads>,
) {
  const target = throttle >= 0 ? throttle * TOP_SPEED : throttle * 9;
  const acceleration = throttle === 0 ? 7 : car.speed * throttle < 0 ? 24 : 12;
  car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), acceleration * dt);
  car.heading += steer * Math.sign(car.speed) * Math.min(1, Math.abs(car.speed) / 4) * dt * 1.85;
  if (!car.speed) return;
  const x = car.x + Math.sin(car.heading) * car.speed * dt,
    z = car.z - Math.cos(car.heading) * car.speed * dt;
  const nearest = closestRoad(x, z);
  const fraction = Math.min(1, (ROAD_WIDTH / 2 - 0.8) / Math.max(0.001, nearest.distance));
  car.x = nearest.x + (x - nearest.x) * fraction;
  car.z = nearest.z + (z - nearest.z) * fraction;
}

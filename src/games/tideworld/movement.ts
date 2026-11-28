export type Point = { x: number; y: number; z: number };
export type Bounds = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};
export interface CollisionWorld {
  bounds(x: number, y: number, z: number): readonly Bounds[];
  fluid(x: number, y: number, z: number): number;
  get(x: number, y: number, z: number): string;
}
export interface Body extends Point {
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  grounded: boolean;
  crouched: boolean;
  health: number;
  stamina: number;
  warmth: number;
  spent: number;
  exhausted: boolean;
  submerged: number;
  fallFrom: number;
}
export interface Intent {
  forward: number;
  right: number;
  jump: boolean;
  squat: boolean;
  sprint: boolean;
}
export const DT = 1 / 30;
const EPS = 0.00001,
  half = 0.31;
export function newBody(position: Point): Body {
  return {
    ...position,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    grounded: false,
    crouched: false,
    health: 100,
    stamina: 100,
    warmth: 75,
    spent: 0,
    exhausted: false,
    submerged: 0,
    fallFrom: position.y,
  };
}
export function eye(body: Body): Point {
  return { x: body.x, y: body.y + (body.crouched ? 1.03 : 1.56), z: body.z };
}
export function sight(body: Body): Point {
  return {
    x: -Math.sin(body.yaw) * Math.cos(body.pitch),
    y: Math.sin(body.pitch),
    z: -Math.cos(body.yaw) * Math.cos(body.pitch),
  };
}
export function overlaps(body: Point, height: number, x: number, y: number, z: number, b: Bounds) {
  return (
    body.x + half > x + b.minX + EPS &&
    body.x - half < x + b.maxX - EPS &&
    body.z + half > z + b.minZ + EPS &&
    body.z - half < z + b.maxZ - EPS &&
    body.y + height > y + b.minY + EPS &&
    body.y < y + b.maxY - EPS
  );
}
function clear(body: Point, height: number, world: CollisionWorld) {
  for (let y = Math.floor(body.y); y <= Math.floor(body.y + height); y++)
    for (let x = Math.floor(body.x - half); x <= Math.floor(body.x + half); x++)
      for (let z = Math.floor(body.z - half); z <= Math.floor(body.z + half); z++)
        if (world.bounds(x, y, z).some((b) => overlaps(body, height, x, y, z, b))) return false;
  return true;
}
// Sweep a body center against each cell shape expanded by the player's width and height.
function sweep(p: Point, h: number, v: Point, world: CollisionWorld) {
  let time = 1,
    axis: keyof Point | null = null;
  const axes = ["x", "y", "z"] as const;
  for (
    let x = Math.floor(Math.min(p.x, p.x + v.x) - half);
    x <= Math.floor(Math.max(p.x, p.x + v.x) + half);
    x++
  )
    for (
      let y = Math.floor(Math.min(p.y, p.y + v.y) - EPS);
      y <= Math.floor(Math.max(p.y, p.y + v.y) + h);
      y++
    )
      for (
        let z = Math.floor(Math.min(p.z, p.z + v.z) - half);
        z <= Math.floor(Math.max(p.z, p.z + v.z) + half);
        z++
      )
        for (const b of world.bounds(x, y, z)) {
          const lo = { x: x + b.minX - half, y: y + b.minY - h, z: z + b.minZ - half };
          const hi = { x: x + b.maxX + half, y: y + b.maxY, z: z + b.maxZ + half };
          let enter = -Infinity,
            exit = Infinity,
            face: keyof Point = "y";
          for (const a of axes) {
            if (!v[a]) {
              if (p[a] <= lo[a] + EPS || p[a] >= hi[a] - EPS) {
                exit = -Infinity;
                break;
              }
              continue;
            }
            const t1 = (lo[a] - p[a]) / v[a],
              t2 = (hi[a] - p[a]) / v[a];
            const near = Math.min(t1, t2);
            if (near > enter) {
              enter = near;
              face = a;
            }
            exit = Math.min(exit, Math.max(t1, t2));
          }
          if (enter >= -EPS && enter < time && enter < exit && exit > 0) {
            time = Math.max(0, enter);
            axis = face;
          }
        }
  return { time, axis };
}
export function stepBody(
  b: Body,
  input: Intent,
  world: CollisionWorld,
  building: boolean,
  flying: boolean,
  gliding = false,
) {
  const couldStep = b.grounded;
  b.crouched = !flying && (input.squat || (b.crouched && !clear(b, 1.72, world)));
  const h = b.crouched ? 1.15 : 1.72;
  const x = Math.floor(b.x),
    y = Math.floor(b.y),
    z = Math.floor(b.z);
  const immersed = world.fluid(x, y, z) >= 4;
  const eyes = eye(b).y;
  const underwater = Math.floor(eyes) + world.fluid(x, Math.floor(eyes), z) / 8 > eyes;
  const support = world.get(x, y, z);
  const climbing = support === "rope_line" || support === "ladder";
  const sprint = input.sprint && input.forward > 0 && !b.crouched && !b.exhausted && !immersed;
  const speed = flying ? 8 : gliding ? 8 : immersed ? 2.55 : b.crouched ? 2.2 : sprint ? 6.2 : 4.4;
  const length = Math.max(1, Math.hypot(input.forward, input.right));
  const forward = input.forward / length,
    right = input.right / length;
  const dx = speed * (right * Math.cos(b.yaw) - forward * Math.sin(b.yaw)) - b.vx;
  const dz = speed * (-right * Math.sin(b.yaw) - forward * Math.cos(b.yaw)) - b.vz;
  const step = Math.min(1, (DT * (couldStep || flying ? 30 : 9)) / Math.max(EPS, Math.hypot(dx, dz)));
  b.vx += dx * step;
  b.vz += dz * step;
  let verticalDistance: number;
  if (flying || ((climbing || immersed) && input.jump)) {
    b.vy = flying ? (Number(input.jump) - Number(input.squat)) * speed : climbing ? 3.2 : 3;
    verticalDistance = b.vy * DT;
  } else {
    // Integrate the velocity at both ends of the tick, including the launch tick.
    const initial = input.jump && couldStep ? Math.sqrt(2 * 20 * 1.25) : b.vy;
    const cap = gliding ? -2.5 : immersed ? -2 : climbing ? -2.2 : -45;
    b.vy = Math.max(cap, initial - 20 * DT);
    verticalDistance = (Math.max(cap, initial) + b.vy) * 0.5 * DT;
  }
  const protectedFall = climbing || immersed || flying || gliding;
  if (couldStep || protectedFall) b.fallFrom = b.y;
  const remaining = { x: b.vx * DT, y: verticalDistance, z: b.vz * DT };
  b.grounded = false;
  for (let pass = 0; pass < 3; pass++) {
    const hit = sweep(b, h, remaining, world);
    const time = hit.axis ? Math.max(0, hit.time - EPS) : 1;
    b.x += remaining.x * time;
    b.y += remaining.y * time;
    b.z += remaining.z * time;
    if (!hit.axis) break;
    for (const a of ["x", "y", "z"] as const) remaining[a] *= 1 - time;
    if (hit.axis !== "y" && couldStep && !flying && !immersed) {
      const high = { x: b.x, y: b.y + 0.551, z: b.z };
      const over = { x: remaining.x, y: 0, z: remaining.z };
      if (clear(high, h, world) && !sweep(high, h, over, world).axis) {
        high.x += over.x;
        high.z += over.z;
        const down = sweep(high, h, { x: 0, y: -0.555, z: 0 }, world);
        if (down.axis === "y") {
          b.x = high.x;
          b.z = high.z;
          b.y = high.y - 0.555 * down.time + EPS;
          b.grounded = true;
          b.vy = 0;
          break;
        }
      }
    }
    const axis = hit.axis;
    if (axis === "y") {
      b.grounded = b.vy < 0;
      b.vy = 0;
    } else if (axis === "x") b.vx = 0;
    else b.vz = 0;
    remaining[axis] = 0;
  }
  if (building) {
    b.health = b.stamina = 100;
    b.warmth = 75;
  } else {
    const spend = support === "rope_line" && input.jump ? 8 : sprint ? 12 : 0;
    b.spent = spend ? 0 : b.spent + DT;
    b.stamina = Math.max(
      0,
      Math.min(100, b.stamina + (spend ? -spend : b.spent >= 1 - EPS ? 14 : 0) * DT),
    );
    if (b.stamina < 10) b.exhausted = true;
    else if (b.stamina >= 25) b.exhausted = false;
    b.submerged = underwater ? b.submerged + DT : 0;
    if (b.submerged > 18) b.health -= 8 * DT;
    if (b.grounded && b.fallFrom - b.y > 5) b.health -= 8 * (b.fallFrom - b.y - 5);
  }
  if (b.grounded || protectedFall) b.fallFrom = b.y;
}

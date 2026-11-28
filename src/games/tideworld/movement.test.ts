import { describe, expect, it } from "vitest";
import {
  DT,
  eye,
  newBody,
  sight,
  stepBody,
  type Bounds,
  type CollisionWorld,
  type Intent,
} from "./movement";

const full: Bounds = { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 };
const still: Intent = { forward: 0, right: 0, jump: false, squat: false, sprint: false };
function arena(): CollisionWorld & { put(x: number, y: number, z: number, box: Bounds): void } {
  const cells = new Map<string, Bounds[]>();
  return {
    bounds: (x, y, z) => (y === -1 ? [full] : (cells.get(x + "," + y + "," + z) ?? [])),
    get: (_x, y) => (y === -1 ? "slate" : "air"),
    fluid: () => 0,
    put(x, y, z, box) {
      cells.set(x + "," + y + "," + z, [box]);
    },
  };
}
const start = () => Object.assign(newBody({ x: 0.5, y: 0, z: 0.5 }), { grounded: true });
const advance = (
  b: ReturnType<typeof newBody>,
  w: CollisionWorld,
  n: number,
  input: Partial<Intent> = {},
) => {
  for (let i = 0; i < n; i++) stepBody(b, { ...still, ...input }, w, false, false);
};

describe("30 Hz player movement", () => {
  it("has equal cardinal and diagonal walk speed, and distinct crouch and sprint caps", () => {
    const w = arena();
    const move = (intent: Partial<Intent>) => {
      const b = start();
      advance(b, w, 45, intent);
      return b;
    };
    for (const input of [{ forward: 1 }, { forward: 1, right: 1 }]) {
      const b = move(input);
      expect(Math.hypot(b.vx, b.vz)).toBeCloseTo(4.4, 8);
    }
    expect(move({ forward: 1, sprint: true }).vz).toBeCloseTo(-6.2, 8);
    const crouch = move({ forward: 1, squat: true });
    expect(crouch.vz).toBeCloseTo(-2.2, 8);
    expect(eye(crouch).y - crouch.y).toBeCloseTo(1.03);
  });
  it("uses 30 units/sec² grounded and 9 in air, and a 1.25-block ballistic jump", () => {
    const w = arena(),
      b = start();
    advance(b, w, 1, { right: 1 });
    expect(b.vx).toBeCloseTo(30 * DT, 8);
    const airborne = newBody({ x: 0.5, y: 4, z: 0.5 });
    advance(airborne, w, 1, { right: 1 });
    expect(airborne.vx).toBeCloseTo(9 * DT, 8);
    const jumper = start();
    advance(jumper, w, 1, { jump: true });
    let top = jumper.y;
    for (let i = 0; i < 40; i++) {
      advance(jumper, w, 1);
      top = Math.max(top, jumper.y);
    }
    expect(top).toBeGreaterThan(1.23);
    expect(top).toBeLessThan(1.27);
    expect(jumper.grounded).toBe(true);
    expect(jumper.y).toBeCloseTo(0, 4);
  });
  it("applies exact excess fall damage from the last grounded height", () => {
    for (const [height, damage] of [
      [4.9, 0],
      [5.1, 0.8],
      [8, 24],
    ]) {
      const b = newBody({ x: 0.5, y: height, z: 0.5 });
      advance(b, arena(), 100);
      expect(b.health).toBeCloseTo(100 - damage, 3);
    }
    const w = arena(),
      b = start();
    w.put(0, 4, 0, { ...full, maxY: 0.9 });
    Object.assign(b, { y: 4.9, fallFrom: 4.9 });
    advance(b, w, 1, { jump: true, right: 1 });
    advance(b, w, 100, { right: 1 });
    expect(b.grounded).toBe(true);
    expect(b.health).toBe(100);
  });
  it("auto-steps a half slab, blocks a full step, and respects low overhead clearance", () => {
    const test = (top: number, ceiling = false) => {
      const w = arena(),
        b = start();
      w.put(1, 0, 0, { ...full, maxY: top });
      if (ceiling) w.put(1, 1, 0, { ...full, minY: 0.78 });
      advance(b, w, 8, { right: 1 });
      return b;
    };
    const climbed = test(0.5);
    expect(climbed.y).toBeCloseTo(0.5, 3);
    expect(climbed.x).toBeGreaterThan(0.8);
    for (const blocked of [test(1), test(0.5, true)]) {
      expect(blocked.y).toBeCloseTo(0, 3);
      expect(blocked.x).toBeLessThan(0.7);
    }
  });
  it("holds the 1.15-block crouch under a low ceiling until the taller body fits", () => {
    const w = arena(),
      b = start();
    w.put(1, 1, 0, { ...full, minY: 0.25 });
    advance(b, w, 13, { right: 1, squat: true });
    expect(b.x).toBeGreaterThan(1);
    advance(b, w, 1);
    expect(b.crouched).toBe(true);
    advance(b, w, 30, { right: 1 });
    expect(b.x).toBeGreaterThan(2.32);
    expect(b.crouched).toBe(false);
    expect(eye(b).y - b.y).toBeCloseTo(1.56);
  });
  it("sweeps fast motion into a thin barrier and retains tangential slide", () => {
    const w = arena(),
      b = start();
    for (let z = -4; z <= 3; z++)
      for (let y = 0; y < 3; y++) w.put(1, y, z, { ...full, minX: 0.45, maxX: 0.48 });
    b.vx = 170;
    b.vz = -20;
    advance(b, w, 1);
    expect(b.x).toBeCloseTo(1.45 - 0.31, 3);
    expect(b.vx).toBe(0);
    expect(b.z).toBeLessThan(0.2);
    expect(sight({ ...b, yaw: Math.PI / 2, pitch: 0 }).x).toBeCloseTo(-1);
  });
  it("hysteretically recovers sprint stamina and protects a water landing", () => {
    const w = arena(),
      b = start();
    b.stamina = 10;
    advance(b, w, 1, { forward: 1, sprint: true });
    expect(b.exhausted).toBe(true);
    advance(b, w, 25);
    expect(b.stamina).toBeCloseTo(9.6, 5);
    advance(b, w, 45);
    expect(b.exhausted).toBe(false);
    expect(b.stamina).toBeGreaterThanOrEqual(25);
    const swimmer = newBody({ x: 0.5, y: 8, z: 0.5 });
    w.fluid = (_x, y) => (y >= 0 && y < 2 ? 8 : 0);
    advance(swimmer, w, 130);
    expect(swimmer.health).toBe(100);
  });
  it("swims across a negative-to-positive section edge and climbs ladder or rope", () => {
    const w = arena();
    w.fluid = (_x, y) => (y >= 0 && y <= 5 ? 8 : 0);
    const swimmer = start();
    swimmer.x = -0.2;
    advance(swimmer, w, 14, { right: 1, jump: true });
    expect(swimmer.x).toBeGreaterThan(0.2);
    expect(swimmer.y).toBeGreaterThan(1);
    for (const support of ["rope_line", "ladder"]) {
      const wall = arena();
      wall.get = () => support;
      const b = start();
      advance(b, wall, 30, { jump: true });
      expect(b.y).toBeCloseTo(3.2, 4);
      expect(b.stamina).toBeCloseTo(support === "rope_line" ? 92 : 100, 5);
    }
  });
});

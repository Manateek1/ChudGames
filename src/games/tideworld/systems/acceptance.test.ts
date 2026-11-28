import { describe, expect, it } from "vitest";
import { Ecology, Inventory, type Pos, type SystemWorld } from "./index";
import { Devices } from "./devices";
import { Fluids } from "./fluids";
import { groundPath } from "./pathfinding";
import { Transport } from "./transport";
import { key, roll } from "./worldTypes";
import { Population } from "./creatures";

function fixture(): SystemWorld {
  const edits = new Map<string, string>();
  return {
    get: (x, y, z) => edits.get(key({ x, y, z })) ?? (y <= 0 ? "slate" : "air"),
    set: (x, y, z, id) => {
      edits.set(key({ x, y, z }), id);
    },
    biome: () => "silt_meadow",
    surface: () => 0,
    fluid: () => 0,
  };
}

describe("handbook device and travel fixtures", () => {
  it("refuses an oversized wire network, then restores power after the network splits", () => {
    const world = fixture(),
      devices = new Devices(),
      fluids = new Fluids();
    const at = (x: number) => ({ x, y: 1, z: 0 });
    devices.edit(at(0), "switch");
    devices.at(at(0))!.enabled = true;
    for (let x = 1; x <= 257; x++) devices.edit(at(x), "wire");
    devices.edit(at(258), "lamp", 1);
    for (let t = 0; t < 3; t++) devices.tick(world, fluids, t, () => 0);
    expect(devices.at(at(100))?.overLimit).toBe(true);
    expect(devices.at(at(258))?.high).toBe(false);
    devices.edit(at(256), "lamp", 1);
    devices.tick(world, fluids, 4, () => 0);
    expect(devices.at(at(100))?.overLimit).toBe(false);
    expect(devices.at(at(256))?.high).toBe(true);
  });
  it("moves an occupied platform along a guide until the path becomes blocked", () => {
    const world = fixture(),
      devices = new Devices(),
      base = { x: 0, y: 1, z: 0 },
      actor = { x: 0.5, y: 1.5, z: 0.5, health: 100 };
    world.set(0, 1, 0, "lift_platform");
    for (let y = 1; y <= 4; y++) world.set(0, y, -1, "anchor");
    devices.edit(base, "lift_platform");
    devices.at(base)!.powered = true;
    for (let t = 0; t < 30; t++) devices.moveLifts(world, actor);
    expect(actor.y).toBe(2.5);
    expect(world.get(0, 2, 0)).toBe("lift_platform");
    world.set(0, 3, 0, "basalt");
    for (let t = 0; t < 60; t++) devices.moveLifts(world, actor);
    expect(actor.y).toBe(2.5);
    expect(world.get(0, 3, 0)).toBe("basalt");
  });
  it("finds a bounded land route around a two-block wall", () => {
    const world = fixture();
    for (let z = -1; z <= 1; z++) for (let y = 1; y <= 3; y++) world.set(1, y, z, "slate");
    const path = groundPath(world, { x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 0 }, 0.7, 1.3);
    expect(path.at(-1)?.x).toBe(3.5);
    expect(path.some((p) => p.z > 1.5 || p.z < -0.5)).toBe(true);
    expect(path.every((p) => world.get(Math.floor(p.x), p.y, Math.floor(p.z)) === "air")).toBe(true);
  });
  it("keeps a four-stage grain crop growing at night under a switched lamp", () => {
    const world = fixture(),
      eco = new Ecology("7"),
      inv = new Inventory("survival");
    const bed = { x: 0, y: 0, z: 0 },
      crop = { ...bed, y: 1 },
      actor = { x: 0, y: 1, z: 0, health: 100 };
    world.set(0, 0, 0, "loam");
    world.set(0, 4, 0, "slate");
    inv.add("field_hoe");
    inv.add("grain_seed");
    inv.add("water_flask");
    eco.use(world, bed, inv, 0, 0);
    eco.use(world, bed, inv, 1, 1);
    eco.use(world, crop, inv, 2, 2);
    // A neighboring natural canal continuously irrigates the bed.
    world.fluid = (x, y, z) => (x === 1 && y === 0 && z === 0 ? 8 : 0);
    const pos = (x: number): Pos => ({ x, y: 1, z: 2 });
    for (const [x, id] of [
      [-2, "switch"],
      [-1, "wire"],
      [0, "lamp"],
    ] as const) {
      world.set(x, 1, 2, id);
      eco.onEdit(world, pos(x), "air", id, 0, 1);
    }
    eco.devices.at(pos(-2))!.enabled = true;
    for (let tick = 30000; tick < 34900; tick += 30) eco.tick(world, actor, tick);
    expect(eco.plants.get(key(crop))?.age).toBe(4);
    expect(eco.harvest(world, crop, inv, 35000)).toMatch(/two grain/);
    expect(inv.count("grain")).toBe(2);
    expect(eco.plants.get(key(crop))?.age).toBe(1);
  });
  it("checks skiff cargo version, ownership, clear water, and safe recovery", () => {
    const world = fixture(),
      t = new Transport(),
      fluids = new Fluids(),
      inv = new Inventory("survival");
    const owner = { id: "captain", x: 0.5, y: 1, z: 0.5, health: 100 };
    inv.add("skiff");
    expect(t.deploy(world, fluids, { x: 0, y: 1, z: 0 }, inv, 0, "captain")).toMatch(/open water/);
    world.fluid = (_x, y) => (y === 1 ? 8 : 0);
    expect(t.deploy(world, fluids, { x: 0, y: 1, z: 0 }, inv, 0, "captain")).toMatch(/launched/);
    const b = t.boats[0];
    inv.add("cord", 3);
    expect(t.cargo(b.id, inv, { ...owner, id: "guest" }, 0, false, 0)).toBe(false);
    expect(t.cargo(b.id, inv, owner, 0, false, 0)).toBe(true);
    expect(t.recover(owner, inv, owner.id)).toMatch(/Empty/);
    expect(t.cargo(b.id, inv, owner, 0, true, 0)).toBe(false);
    expect(t.cargo(b.id, inv, owner, 0, true, 1)).toBe(true);
    expect(t.recover(owner, inv, owner.id)).toMatch(/recovered/);
  });
  it("bonds two hens, hatches one juvenile, and enforces parental cooldown", () => {
    const world = fixture(),
      eco = new Ecology("1"),
      inv = new Inventory("survival"),
      actor = { id: "p", x: 1, y: 1, z: 0, health: 100 };
    inv.add("grain", 10);
    const a = eco.population.spawn("marsh_hen", { x: 0, y: 1, z: 0 }, 0),
      b = eco.population.spawn("marsh_hen", { x: 2, y: 1, z: 0 }, 0);
    for (const hen of [a, b]) for (let i = 1; i <= 4; i++) eco.interactCreature(hen.id, inv, 0, actor, i);
    eco.tick(world, actor, 30);
    expect(eco.creatures.filter((c) => c.juvenile)).toHaveLength(1);
    expect(a.breedUntil).toBe(9030);
    expect(b.owner).toBe("p");
    const old = inv.count("grain");
    eco.interactCreature(a.id, inv, 0, actor, 31);
    expect(inv.count("grain")).toBe(old);
    expect(new Ecology("1", eco.save()).creatures.filter((c) => c.owner === "p")).toHaveLength(3);
  });
});

describe("alder glider canopy routes", () => {
  it("needs two visible perches before spawning a rainwood group", () => {
    const w = fixture(),
      p = new Population("92"),
      f = new Fluids(),
      actor = { x: 0.5, y: 1, z: 0.5, health: 100 };
    w.biome = () => "rainwood";
    const angle = roll("92", 60, 0, 1) * Math.PI * 2,
      radius = 24 + 40 * roll("92", 60, 0, 2);
    const x = Math.floor(actor.x + Math.cos(angle) * radius),
      z = Math.floor(actor.z + Math.sin(angle) * radius);
    w.set(x, 4, z, "foliage");
    p.candidate(w, f, actor, 60, () => 15);
    expect(p.creatures).toHaveLength(0);
    w.set(x + 4, 4, z, "foliage");
    for (let y = 4; y < 10; y++) w.set(x + 2, y, z, "slate");
    p.candidate(w, f, actor, 60, () => 15);
    expect(p.creatures).toHaveLength(0);
    for (let y = 4; y < 10; y++) w.set(x + 2, y, z, "air");
    p.candidate(w, f, actor, 60, () => 15);
    expect(p.creatures.length).toBeGreaterThan(0);
    for (const bird of p.creatures)
      expect(w.get(Math.floor(bird.x), bird.y - 1, Math.floor(bird.z))).toBe("foliage");
  });
  it("stays on its branch until a clear lower feeding perch opens, then glides and roosts", () => {
    const w = fixture(),
      p = new Population("gliders"),
      f = new Fluids(),
      actor = { x: 5.5, y: 1, z: 0.5, health: 100, heldId: "grain" };
    w.set(0, 5, 0, "foliage");
    w.set(5, 1, 0, "alder_log");
    for (let z = -2; z <= 2; z++) for (let y = 1; y <= 9; y++) w.set(2, y, z, "slate");
    const c = p.spawn("alder_glider", { x: 0.5, y: 6, z: 0.5 }, 0);
    for (let i = 1; i <= 50; i++) p.tick(w, f, actor, i, () => 15);
    expect([c.x, c.y, c.z, c.state]).toEqual([0.5, 6, 0.5, "rest"]);
    for (let z = -2; z <= 2; z++) for (let y = 1; y <= 9; y++) w.set(2, y, z, "air");
    let flew = false;
    for (let i = 51; i <= 135; i++) {
      p.tick(w, f, actor, i, () => 15);
      if (c.state === "follow grain" && c.speed > 0) flew = true;
    }
    expect(flew).toBe(true);
    expect(c.state).toBe("rest");
    expect(c.speed).toBe(0);
    expect(c.y).toBeLessThanOrEqual(2);
    expect(Math.hypot(c.x - actor.x, c.y - actor.y, c.z - actor.z)).toBeLessThan(2.2);
  });
});

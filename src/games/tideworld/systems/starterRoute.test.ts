import { expect, it } from "vitest";
import { Expedition } from "../expedition";
import { collectStation, fuelStation, queueJob, tickStation, type StationState } from "./stations";
import { type Pos } from "./worldTypes";

it("starts an empty Survival save and earns the metal hammer through the generated quarry and workshop", () => {
  const g = new Expedition({
    info: { id: "starter-test", name: "Quarry route", seed: "424242", mode: "survival" },
  });
  const w = g.world,
    inv = g.inventory;
  const idle = { forward: 0, right: 0, jump: false, squat: false, sprint: false };
  expect(inv.slots.every((s) => s === null)).toBe(true);
  // Place the test driver at each interaction. World raycasts, pickups, mining work and item transactions are real.
  for (const p of [...g.pickups]) {
    Object.assign(g.body, { x: p.x, y: p.y, z: p.z });
    g.frame(idle, false);
  }
  expect(inv.count("slate_rubble")).toBe(6);
  function hold(id: string) {
    let i = inv.slots.findIndex((s) => s?.id === id);
    expect(i).toBeGreaterThanOrEqual(0);
    if (i >= 7) {
      expect(inv.move(i, 6)).toBe(true);
      i = 6;
    }
    g.select(i);
  }
  function mine(x: number, y: number, z: number, id: string) {
    expect(w.get(x, y, z)).toBe(id);
    for (const [dx, dy, dz] of [
      [0, 1, 0],
      [0, -1, 0],
      [-1, 0, 0],
      [0, 0, -1],
      [1, 0, 0],
      [0, 0, 1],
    ]) {
      const center = { x: x + 0.38, y: y + 0.45, z: z + 0.4 };
      const eye = { x: center.x + dx * 1.1, y: center.y + dy * 1.1, z: center.z + dz * 1.1 };
      const hit = w.raycast(eye, { x: -dx, y: -dy, z: -dz }, 5.5);
      if (hit?.x !== x || hit.y !== y || hit.z !== z) continue;
      g.target = hit;
      for (let i = 0; i < 260 && w.get(x, y, z) === id; i++) {
        g.tick++;
        g.mine();
      }
      expect(w.get(x, y, z)).toBe("air");
      return;
    }
    throw Error("No exposed " + id + " at " + [x, y, z]);
  }
  const soil = (x: number, z: number) => w.height(x, z);
  mine(2, soil(2, -3) + 1, -3, "brush");
  mine(1, soil(1, -4) + 1, -4, "brush");
  mine(6, soil(6, -7) + 1, -7, "reed");
  for (let y = 1; y <= 4; y++) mine(-5, soil(-5, 1) + y, 1, "alder_log");
  expect(inv.craft("cord")).toBe(true);
  expect(inv.craft("stone_hammer")).toBe(true);
  expect(inv.craft("workbench")).toBe(true);
  function place(id: string, x: number, z: number): Pos {
    hold(id);
    const y = soil(x, z);
    const t = w.raycast({ x: x + 0.5, y: y + 1.65, z: z + 0.5 }, { x: 0, y: -1, z: 0 }, 5.5);
    expect(t?.y).toBe(y);
    Object.assign(g.body, { x: x + 2.5, y: y + 1.01, z: z + 0.5 });
    g.target = t;
    g.place();
    expect(w.get(x, y + 1, z)).toBe(id);
    return { x, y: y + 1, z };
  }
  const bench = place("workbench", 0, 1);
  expect(w.get(bench.x, bench.y, bench.z)).toBe("workbench");
  hold("stone_hammer");
  const floor = w.quarryFloor();
  for (let z = -35; z <= -32; z++) {
    mine(-9, floor, z, "basalt");
    mine(-7, floor, z, "basalt");
  }
  for (let z = -35; z <= -32; z++) {
    mine(-5, floor, z, "slate");
    mine(-10, floor + 1, z, "slate");
  }
  for (let z = -35; z <= -34; z++) mine(-8, floor, z, "ore_copper");
  mine(-6, floor, -35, "ore_tin");
  for (let x = 4; x <= 5; x++) for (let z = -9; z <= -6; z++) mine(x, soil(x, z), z, "red_clay");
  mine(-12, soil(-10, -13) + 5, -15, "clay_tile");
  for (let y = 4; y >= 1; y--) mine(-12, soil(-10, -13) + y, -15, "alder_log");
  const craft = (id: string) => expect(inv.craft(id, "workbench"), id).toBe(true);
  craft("slate_brick");
  craft("slate_brick");
  craft("basalt_brick");
  craft("basalt_brick");
  craft("kiln");
  const kiln = g.ecology.station(place("kiln", 1, 1), "kiln");
  function run(s: StationState, id: string, fuel: string) {
    expect(queueJob(s, id, inv)).toBe(true);
    while (s.queue.length) {
      if (!s.burn && !s.fuel)
        expect(
          fuelStation(
            s,
            inv,
            inv.slots.findIndex((stack) => stack?.id === fuel),
          ),
          fuel,
        ).toBe(true);
      tickStation(s);
    }
    expect(collectStation(s, inv)).toBe(true);
  }
  run(kiln, "charcoal", "alder_log");
  run(kiln, "charcoal", "alder_log");
  run(kiln, "fired_clay", "charcoal");
  run(kiln, "fired_clay", "charcoal");
  craft("smelter");
  const smelter = g.ecology.station(place("smelter", 2, 1), "smelter");
  run(smelter, "tin_ingot", "charcoal");
  run(smelter, "copper_ingot", "charcoal");
  run(smelter, "copper_ingot", "charcoal");
  craft("dry_plank");
  craft("metal_hammer");
  expect(inv.count("metal_hammer")).toBe(1);
  expect(inv.count("tin_ingot")).toBe(1);
});

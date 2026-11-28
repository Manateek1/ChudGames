import { describe, expect, it } from "vitest";
import {
  Inventory,
  ITEMS,
  RECIPES,
  canHarvest,
  Ecology,
  createStation,
  queueJob,
  cancelJob,
  fuelStation,
  tickStation,
  collectStation,
  daylight,
} from "./index";
import { Fluids } from "./fluids";
import { Devices } from "./devices";
import { key, type SystemWorld } from "./worldTypes";
import { SPECIES } from "./creatures";
function fixture(defaultBlock = "air") {
  const cells = new Map<string, string>();
  const w: SystemWorld = {
    get: (x, y, z) => cells.get(key({ x, y, z })) ?? defaultBlock,
    set: (x, y, z, id) => {
      cells.set(key({ x, y, z }), id);
    },
    surface: () => 0,
    biome: () => "silt_meadow",
    fluid: () => 0,
  };
  return w;
}
const p = { x: 0, y: 1, z: 0 },
  actor = { x: 0, y: 1, z: 0, health: 100 };
describe("handbook inventory and workshop", () => {
  it("resolves 62 base recipes and eight glazes against the complete catalogs", () => {
    expect(RECIPES.filter((r) => !r.id.startsWith("glaze_"))).toHaveLength(62);
    expect(RECIPES.filter((r) => r.id.startsWith("glaze_"))).toHaveLength(8);
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(70);
    expect(Object.keys(SPECIES)).toHaveLength(11);
    expect(Object.values(ITEMS).filter((item) => item.group !== "Block")).toHaveLength(57);
    for (const r of RECIPES) {
      expect(ITEMS[r.output.id]).toBeDefined();
      for (const ing of r.ingredients) ing.ids.forEach((id) => expect(ITEMS[id]).toBeDefined());
    }
  });
  it("makes starter tools from loose resources and gates ore by tier", () => {
    const inv = new Inventory("survival");
    inv.add("brush_fiber", 2);
    inv.add("reed_fiber");
    inv.add("slate_rubble", 3);
    inv.add("alder_log");
    expect(inv.craft("cord")).toBe(true);
    expect(inv.craft("stone_hammer")).toBe(true);
    expect(inv.count("cord")).toBe(1);
    expect(inv.count("alder_log")).toBe(0);
    expect(canHarvest("ore_tin", "stone_hammer")).toBe(true);
    expect(canHarvest("ore_iron", "stone_hammer")).toBe(false);
    expect(canHarvest("ore_iron", "metal_hammer")).toBe(true);
    const slot = inv.slots.findIndex((s) => s?.id === "stone_hammer");
    for (let i = 0; i < 100; i++) inv.wear(slot);
    expect(inv.slots[slot]).toBeNull();
  });
  it("preserves wood species and rejects stale slot transfers", () => {
    const inv = new Inventory("survival");
    inv.add("pine_log");
    expect(inv.craft("dry_plank")).toBe(false);
    expect(inv.craft("dry_plank", "workbench")).toBe(true);
    expect(inv.slots[0]?.variant).toBe("pine");
    expect(inv.craft("timber_panel", "workbench")).toBe(true);
    const idx = inv.slots.findIndex((s) => s?.id === "timber_panel");
    expect(inv.slots[idx]?.variant).toBe("pine");
    const state = inv.save();
    expect(inv.move(idx, 20, 1, inv.version - 1)).toBe(false);
    expect(inv.save()).toEqual(state);
    expect(inv.move(idx, 20, 1)).toBe(true);
    expect(inv.slots[20]?.count).toBe(1);
  });
  it("reserves log independently from ignition fuel and holds complete outputs", () => {
    const inv = new Inventory("survival"),
      st = createStation("kiln");
    inv.add("alder_log", 2);
    expect(queueJob(st, "charcoal", inv)).toBe(true);
    expect(inv.count("alder_log")).toBe(1);
    tickStation(st);
    expect(st.queue[0].remaining).toBe(240);
    fuelStation(st, inv, 0);
    st.output = [
      { id: "sand", count: 48 },
      { id: "sand", count: 48 },
    ];
    for (let i = 0; i < 240; i++) tickStation(st);
    expect(st.queue[0].remaining).toBe(0);
    expect(st.burn).toBe(0);
    expect(cancelJob(st, 0, inv)).toBe(false);
    collectStation(st, inv);
    tickStation(st);
    collectStation(st, inv);
    expect(inv.count("charcoal")).toBe(2);
    expect(st.queue).toHaveLength(0);
  });
  it("returns cancelled reservations only to their owner", () => {
    const inv = new Inventory("survival"),
      s = createStation("smelter");
    inv.add("raw_tin");
    queueJob(s, "tin_ingot", inv, "a");
    expect(cancelJob(s, 0, inv, "b")).toBe(false);
    expect(cancelJob(s, 0, inv, "a")).toBe(true);
    expect(inv.count("raw_tin")).toBe(1);
  });
});
describe("fluids, devices and ecology", () => {
  it("conserves water and brine through deterministic combined reservations", () => {
    const w = fixture("slate"),
      f = new Fluids();
    for (const x of [-1, 0, 1]) w.set(x, 1, 0, "air");
    f.set(w, { x: -1, y: 1, z: 0 }, { level: 8, kind: "water" });
    f.set(w, { x: 1, y: 1, z: 0 }, { level: 8, kind: "brine" });
    for (let t = 0; t < 30; t++) f.step(w, [], () => false, p);
    const levels = [-1, 0, 1].map((x) => f.read(w, { x, y: 1, z: 0 }));
    expect(levels.reduce((a, b) => a + b.level, 0)).toBe(16);
    expect(levels[1].kind).toBe("brine");
    expect(levels.every((v) => v.level <= 8)).toBe(true);
    f.set(w, p, { kind: "water", level: 8 });
    f.set(w, { ...p, x: -1 }, { level: 8, kind: "water" });
    f.set(w, { ...p, x: 1 }, { level: 8, kind: "water" });
    const saved = f.save();
    expect(f.displace(w, p)).toBe(false);
    expect(f.save()).toEqual(saved);
  });
  it("delivers a switch through wire to a rear-facing lamp within two ticks", () => {
    const w = fixture(),
      f = new Fluids(),
      d = new Devices();
    d.edit(p, "switch");
    d.edit({ ...p, x: 1 }, "wire");
    const lamp = { ...p, x: 2 };
    d.edit(lamp, "lamp", 1);
    d.at(p)!.enabled = true;
    d.tick(w, f, 1, () => 0);
    expect(d.at(lamp)!.high).toBe(false);
    d.tick(w, f, 2, () => 0);
    expect(d.at(lamp)!.high).toBe(true);
    d.edit({ ...p, x: 1 }, "air");
    d.tick(w, f, 3, () => 0);
    expect(d.at(lamp)!.high).toBe(false);
  });
  it("waters a bed with exactly two units and restores plant timers on load", () => {
    const w = fixture();
    w.set(0, 1, 0, "loam");
    const e = new Ecology("42"),
      inv = new Inventory("survival");
    inv.add("field_hoe");
    inv.add("grain_seed");
    inv.add("water_flask");
    e.use(w, p, inv, 0, 0);
    e.use(w, p, inv, 1, 1);
    e.use(w, p, inv, 2, 2);
    expect(w.get(0, 2, 0)).toBe("grain_crop");
    expect(inv.slots[2]?.fill).toBe(6);
    for (let i = 30; i <= 1200; i += 30) e.tick(w, actor, 4410 + i);
    const restored = new Ecology("42", e.save());
    expect(restored.plants.get("0,1,0")?.hydration).toBeGreaterThanOrEqual(2);
    expect(restored.plants.get("0,2,0")?.age).toBe(1);
    expect(restored.plants).toEqual(e.plants);
    expect(daylight(30000)).toBe(0.2);
  });
  it("preserves fish vitality and enforces shared food cooldown", () => {
    const w = fixture(),
      e = new Ecology("100"),
      inv = new Inventory("survival"),
      body = { ...actor, health: 60 };
    inv.add("water_flask");
    const fish = e.population.spawn("shoal_darter", p, 0);
    fish.health = 7;
    e.interactCreature(fish.id, inv, 0, body, 1);
    expect(inv.slots[0]?.vitality).toBe(7);
    expect(e.creatures).toHaveLength(0);
    e.fluids.set(w, p, { kind: "water", level: 8 });
    e.use(w, p, inv, 0, 2);
    expect(e.creatures[0].health).toBe(7);
    expect(inv.slots[0]?.id).toBe("empty_flask");
    inv.add("flatbread", 2);
    e.food(inv, 1, body, 3);
    e.food(inv, 1, body, 4);
    expect(body.health).toBe(72);
    expect(inv.count("flatbread")).toBe(1);
  });
  it("saves unknown stack content intact when a player moves it", () => {
    const unrecognized = { id: "future_item", count: 12, custom: { serial: 17, dyes: ["orchid"] } };
    const inv = new Inventory("survival", { slots: [unrecognized], version: 9 });
    expect(inv.move(0, 12)).toBe(true);
    expect(new Inventory("survival", inv.save()).slots[12]).toEqual(unrecognized);
  });
  it("reserves a shared pump outlet once and takes exactly eighty fluid steps in 300 game ticks", () => {
    const w = fixture("slate"),
      f = new Fluids();
    const left = { ...p, x: -2 },
      right = { ...p, x: 2 };
    for (const source of [left, right, p]) w.set(source.x, source.y, source.z, "air");
    f.set(w, p, { kind: "water", level: 7 });
    f.set(w, left, { kind: "brine", level: 8 });
    f.set(w, right, { kind: "water", level: 8 });
    const pumpA = { ...p, x: -1, face: 1 as const },
      pumpB = { ...p, x: 1, face: 3 as const };
    let steps = 0;
    for (let i = 0; i < 300; i++) if (f.step(w, [pumpA, pumpB], () => false, p)) steps++;
    expect(steps).toBe(80);
    expect(f.read(w, p)).toEqual({ kind: "brine", level: 8 });
    expect([left, right, p].reduce((n, q) => n + f.read(w, q).level, 0)).toBe(23);
  });
  it("persists a weather override and hydrates exposed beds only", () => {
    const w = fixture(),
      e = new Ecology("42");
    const underRoof = { ...p, x: 4 };
    for (const bed of [p, underRoof]) {
      w.set(bed.x, bed.y, bed.z, "plant_bed");
      e.onEdit(w, bed, "air", "plant_bed", 0);
    }
    w.set(underRoof.x, underRoof.y + 3, underRoof.z, "slate");
    e.weatherOverride = "rain";
    for (let t = 30; t <= 90; t += 30) e.tick(w, { ...actor }, t);
    expect(e.plants.get(key(p))!.hydration).toBe(4);
    expect(e.plants.get(key(underRoof))!.hydration).toBe(1);
    expect(new Ecology("42", e.save()).weatherAt(w, 0, 0, 50000)).toBe("rain");
  });
  it("moves weather to the new solar phase without advancing workstation jobs", () => {
    const w = fixture(),
      native = new Ecology("42"),
      rested = new Ecology("42");
    rested.dayOffset = 23900;
    for (const tick of [0, 10000, 35000, 40860, 65000])
      expect(rested.weatherAt(w, 0, 0, tick)).toEqual(native.weatherAt(w, 0, 0, tick + rested.dayOffset));
    const inv = new Inventory("survival"),
      kiln = rested.station(p, "kiln");
    inv.add("alder_log", 2);
    expect(queueJob(kiln, "charcoal", inv)).toBe(true);
    expect(fuelStation(kiln, inv, 0)).toBe(true);
    rested.tick(w, { ...actor }, 42);
    expect(kiln.queue[0].remaining).toBe(239);
    expect(rested.save()).not.toHaveProperty("dayOffset");
  });
});

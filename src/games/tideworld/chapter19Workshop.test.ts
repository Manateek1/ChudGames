/** @vitest-environment node */
import { expect, it, vi } from "vitest";
import { Expedition } from "./expedition";
import { cellKey, type ExpeditionSave } from "./expeditionData";
import { newBody, type Point } from "./movement";
import * as session from "./session";
import {
  encodeRecord,
  freezeRecords,
  restoreSnapshot,
  type Manifest,
  type RecordData,
} from "./session/records";

const idle = { forward: 0, right: 0, jump: false, squat: false, sprint: false };
const floor = 193;
const cell = (x: number, z: number): Point => ({ x, y: floor + 1, z });
const lever = cell(-2, 2);
const lamp = cell(0, 2);
const pump = cell(0, -1);
const sluice = cell(0, -2);
const crop = cell(1, 1);
const bed = { ...crop, y: floor };
const marker = cell(3, 2);
const launch = cell(6, 0);

function furnishWorkshop(g: Expedition) {
  for (let x = -4; x <= 8; x++) {
    for (let z = -4; z <= 4; z++) g.world.set(x, floor, z, "slate");
  }
  // Bound the aqueduct and the mooring basin on a platform above the generated terrain.
  for (let z = -2; z <= 1; z++) g.change(cell(-2, z), "slate");
  for (const [x, z] of [
    [1, 0],
    [1, -2],
    [2, -1],
    [-1, -3],
    [0, 0],
    [6, -2],
    [6, 2],
  ]) {
    g.change(cell(x, z), "slate");
  }
  for (let z = -1; z <= 1; z++) {
    g.change(cell(5, z), "slate");
    g.change(cell(7, z), "slate");
    g.ecology.fluids.set(g.sys, cell(6, z), { kind: "water", level: 8 });
  }
  g.body = newBody({ x: 3.5, y: floor + 1.001, z: 0.5 });
  g.body.yaw = -Math.PI / 2;
  g.change(marker, "marker_stand");
  g.anchor = marker;
  g.register("East workshop");
  g.change(lever, "switch");
  for (let z = -2; z <= 2; z++) g.change(cell(-1, z), "wire");
  g.change(lamp, "lamp");
  g.change(sluice, "sluice");
  g.change(pump, "pump");
  g.ecology.fluids.set(g.sys, cell(-1, -1), { kind: "water", level: 8 });
  g.change(bed, "loam");
  g.world.set(crop.x, crop.y + 4, crop.z, "slate");
}

function slot(g: Expedition, id: string) {
  const i = g.inventory.slots.findIndex((stack) => stack?.id === id);
  expect(i).toBeGreaterThanOrEqual(0);
  return i;
}

function advance(g: Expedition, frames: number) {
  for (let i = 0; i < frames; i++) g.frame(idle, false);
  expect(g.body.health).toBeGreaterThan(0);
}

// Use the Expedition save entry point and the production region codec, with in-memory record storage.
async function reopen(g: Expedition) {
  const blobs = new Map<string, RecordData>();
  const manifest: Manifest = { schema: session.SCHEMA, generator: session.GENERATOR, maps: [], records: [] };
  const writer = vi.spyOn(session, "saveLocalWorld").mockImplementationOnce(async (_info, data) => {
    const { parts, maps } = freezeRecords(data);
    manifest.maps = maps;
    for (const { key, bytes, crc } of parts) {
      const blob = await encodeRecord(bytes, crc);
      blobs.set(key, blob);
      manifest.records.push({ key, crc, length: blob.length, revision: 1 });
    }
  });
  try {
    await g.save();
    expect(writer).toHaveBeenCalledOnce();
  } finally {
    writer.mockRestore();
  }
  const saved = await restoreSnapshot<ExpeditionSave>(manifest, async (ref) => blobs.get(ref.key));
  return new Expedition({ info: { ...g.start.info }, saved });
}

it("continues a stocked Survival workshop after saving and reopening its overnight expedition", async () => {
  const g = new Expedition({
    info: { id: "chapter-19", name: "Workshop acceptance", seed: "424242", mode: "survival" },
  });
  g.tick = 30000;
  g.weatherOverride = "clear";
  furnishWorkshop(g);
  for (const id of ["field_hoe", "water_flask", "grain_seed", "skiff"]) g.inventory.add(id);
  g.inventory.add("grain", 5);
  g.inventory.add("clay_tile", 12);
  const use = (p: Point, item: string) => g.ecology.use(g.sys, p, g.inventory, slot(g, item), g.tick);
  expect(use(bed, "field_hoe")).toMatch(/prepared/i);
  expect(use(bed, "grain_seed")).toMatch(/planted/i);
  expect(use(crop, "water_flask")).toMatch(/water/i);
  expect(use(crop, "water_flask")).toMatch(/water/i);
  expect(g.ecology.light(g.sys, crop, g.tick)).toBe(0);
  expect(g.ecology.use(g.sys, lever, g.inventory, 34, g.tick)).toMatch(/on/i);
  const hen = g.ecology.population.spawn("marsh_hen", cell(4, 0), g.tick);
  for (let i = 0; i < 3; i++)
    g.ecology.interactCreature(hen.id, g.inventory, slot(g, "grain"), g.body, g.tick);
  expect(hen.owner).toBe("local");
  expect(
    g.ecology.transport.deploy(g.sys, g.ecology.fluids, launch, g.inventory, slot(g, "skiff"), "local"),
  ).toMatch(/launched/i);
  const boat = g.ecology.transport.boats[0];
  g.body.x = 4.5;
  expect(g.ecology.transport.cargo(boat.id, g.inventory, g.body, slot(g, "clay_tile"), false, 0)).toBe(true);

  advance(g, 8);
  expect(g.ecology.fluids.read(g.sys, cell(1, -1)).level).toBeGreaterThan(0);
  expect(g.ecology.light(g.sys, crop, g.tick)).toBeGreaterThanOrEqual(8);
  advance(g, 2392);
  expect(g.ecology.plants.get(cellKey(crop))?.age).toBe(2);
  const before = g.inventory.save();
  const loaded = await reopen(g);
  expect(loaded.tick).toBe(g.tick);
  expect(loaded.inventory.save()).toEqual(before);
  expect(loaded.inventory.count("grain")).toBe(2);
  expect(loaded.respawnMarker).toMatchObject({ ...marker, name: "East workshop" });
  expect(loaded.ecology.creatures.find((c) => c.id === hen.id)).toMatchObject({
    species: "marsh_hen",
    owner: "local",
    fed: 3,
  });
  expect(loaded.ecology.devices.at(lever)).toMatchObject({ enabled: true, high: true });
  for (const p of [lamp, pump, sluice])
    expect(loaded.ecology.devices.at(p)).toMatchObject({ powered: true, high: true });
  expect(loaded.world.variants[cellKey(sluice)]).toBe("open");
  expect(loaded.world.get(crop.x, crop.y, crop.z)).toBe("grain_crop");
  expect(loaded.ecology.plants.get(cellKey(crop))?.age).toBe(2);
  const restoredBoat = loaded.ecology.transport.boats.find((b) => b.id === boat.id)!;
  expect(restoredBoat).toMatchObject({ owner: "local", revision: 1 });
  expect(restoredBoat.cargo[0]).toEqual({ id: "clay_tile", count: 12 });

  advance(loaded, 2400);
  expect(loaded.ecology.harvest(loaded.sys, crop, loaded.inventory, loaded.tick)).toMatch(/two grain/i);
  expect(loaded.inventory.count("grain")).toBe(4);
  expect(loaded.ecology.transport.cargo(boat.id, loaded.inventory, loaded.body, 0, true, 0)).toBe(false);
  expect(loaded.ecology.transport.cargo(boat.id, loaded.inventory, loaded.body, 0, true, 1)).toBe(true);
  expect(loaded.inventory.count("clay_tile")).toBe(12);
  expect(restoredBoat.cargo.every((item) => item === null)).toBe(true);
  loaded.ecology.use(loaded.sys, lever, loaded.inventory, 34, loaded.tick);
  advance(loaded, 8);
  for (const p of [lamp, pump, sluice]) expect(loaded.ecology.devices.at(p)?.powered).toBe(false);
}, 30000);

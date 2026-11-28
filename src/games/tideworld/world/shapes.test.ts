import { describe, expect, it } from "vitest";
import { Expedition } from "../expedition";
import { stepBody, newBody } from "../movement";
import { VoxelWorld } from "./world";
import { textureIndex } from "./textures";
import { UPPER_HALF } from "./shapes";

describe("aimed masonry placement", () => {
  const setup = () =>
    new Expedition({ info: { id: "masonry", name: "Masonry", seed: "42", mode: "survival" } });
  it("uses a side hit above halfway, combines matching material in the same cell and charges one item per placement", () => {
    const game = setup(),
      w = game.world;
    w.set(0, 140, 0, "slate");
    game.inventory.add("half_step", 3, "basalt_brick");
    game.target = w.raycast({ x: 0.5, y: 140.8, z: 2 }, { x: 0, y: 0, z: -1 });
    expect(game.target?.point).toEqual({ x: 0.5, y: 140.8, z: 1 });
    game.place();
    expect(w.bounds(0, 140, 1)[0].minY).toBe(0.5);
    expect(w.variants["0,140,1"]).toBe("basalt_brick");
    game.target = w.raycast({ x: 0.5, y: 139, z: 1.5 }, { x: 0, y: 1, z: 0 });
    game.place();
    expect(w.get(0, 140, 1)).toBe("basalt_brick");
    expect(w.get(0, 139, 1)).toBe("air");
    expect(game.held).toMatchObject({ id: "half_step", count: 1, variant: "basalt_brick" });
  });
  it("rejects a conflicting material and honors the final collision volume before consuming a slab", () => {
    const game = setup(),
      w = game.world;
    w.set(0, 140, 0, "half_step");
    w.setVariant(0, 140, 0, "basalt_brick");
    game.inventory.add("half_step", 1, "slate_brick");
    game.target = w.raycast({ x: 0.5, y: 142, z: 0.5 }, { x: 0, y: -1, z: 0 });
    game.place();
    expect(w.get(0, 140, 0)).toBe("half_step");
    expect(game.inventory.count("half_step")).toBe(1);
    w.setVariant(0, 140, 0, "slate_brick");
    Object.assign(game.body, { x: 0.5, y: 140.5, z: 0.5 });
    game.place();
    expect(w.get(0, 140, 0)).toBe("half_step");
    expect(game.inventory.count("half_step")).toBe(1);
    Object.assign(game.body, { x: 2, y: 140.5, z: 0.5 });
    game.place();
    expect(w.get(0, 140, 0)).toBe("slate_brick");
    expect(game.inventory.count("half_step")).toBe(0);
  });
  it("selects facing and inverted stair geometry from a ceiling hit, preserving shape and brick finish across a reload", () => {
    const game = setup(),
      w = game.world;
    w.set(0, 141, 0, "slate");
    game.inventory.add("stair_step", 1, "basalt_brick");
    game.body.yaw = -Math.PI / 2;
    game.target = w.raycast({ x: 0.5, y: 139, z: 0.5 }, { x: 0, y: 1, z: 0 });
    game.place();
    const restored = new VoxelWorld(w.seed, structuredClone(w.edits));
    Object.assign(restored.facings, w.facings);
    Object.assign(restored.variants, w.variants);
    const steps = restored.bounds(0, 140, 0);
    expect(restored.facings["0,140,0"]).toBe(UPPER_HALF | 1);
    expect(steps).toEqual([
      { minX: 0, minY: 0.5, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
      { minX: 0.5, minY: 0, minZ: 0, maxX: 1, maxY: 0.5, maxZ: 1 },
    ]);
    expect(textureIndex("stair_step", 0, restored.variants["0,140,0"])).toBe(
      textureIndex("basalt_brick", 0, undefined),
    );
    restored.set(0, 140, -1, "stair_step");
    restored.setFacing(0, 140, -1, UPPER_HALF);
    restored.setVariant(0, 140, -1, "basalt_brick");
    expect(restored.shape(0, 140, 0, "stair_step")).toHaveLength(3);
    expect(restored.bounds(0, 140, 0)).toHaveLength(2);
  });
  it("walks up the two half rises in the selected direction without jumping", () => {
    const w = new VoxelWorld("stairs");
    for (let z = -3; z <= 3; z++) w.set(0, 139, z, "slate");
    for (let z = -3; z < 0; z++) w.set(0, 140, z, "slate");
    w.set(0, 140, 0, "stair_step");
    const b = newBody({ x: 0.5, y: 140, z: 2.2 });
    const move = { forward: 1, right: 0, jump: false, squat: false, sprint: false };
    for (let i = 0; i < 22; i++) stepBody(b, move, w, false, false);
    expect(b.z).toBeLessThan(0);
    expect(b.y).toBeCloseTo(141, 3);
    expect(b.grounded).toBe(true);
  });
  it("preserves step orientation when changing the supported finish and rejects an incompatible material", () => {
    const game = new Expedition({ info: { id: "paint", name: "Paint", seed: "42", mode: "building" } });
    const w = game.world;
    w.set(0, 140, 0, "half_step");
    w.setFacing(0, 140, 0, UPPER_HALF);
    game.tool = "paint";
    game.target = w.raycast({ x: 0.5, y: 142, z: 0.5 }, { x: 0, y: -1, z: 0 });
    game.paint = "basalt_brick";
    game.place();
    game.paint = "teal";
    game.place();
    expect(w.variants["0,140,0"]).toBe("basalt_brick");
    expect(w.bounds(0, 140, 0)[0].minY).toBe(0.5);
    expect(textureIndex("timber_panel", 0, "alder")).not.toBe(textureIndex("timber_panel", 0, "pine"));
  });
});
describe("fence connections", () => {
  it("updates each cardinal rail and its solid footprint across a chunk boundary", () => {
    const w = new VoxelWorld("fences"),
      id = "fence_section";
    w.set(15, 140, 0, id);
    expect(w.shape(15, 140, 0, id)).toHaveLength(1);
    w.set(16, 140, 0, id);
    w.set(15, 140, -1, "gate");
    w.set(14, 140, 0, "basalt");
    w.set(15, 140, 1, "brush");
    expect(w.fenceConnections(15, 140, 0)).toBe(0b1011);
    expect(w.fenceConnections(16, 140, 0)).toBe(0b1000);
    expect(w.shape(15, 140, 0, id)).toHaveLength(7);
    expect(w.bounds(15, 140, 0)).toHaveLength(4);
    expect(w.bounds(15, 140, 0).every((b) => b.maxY === 1.35)).toBe(true);
    expect(w.raycast({ x: 15.93, y: 140.4, z: 1.5 }, { x: 0, y: 0, z: -1 })?.id).toBe(id);
    w.set(16, 140, 0, "air");
    expect(w.fenceConnections(15, 140, 0)).toBe(0b1001);
    expect(w.raycast({ x: 15.93, y: 140.4, z: 1.5 }, { x: 0, y: 0, z: -1 }, 1.5)).toBeNull();
  });
  it("lands a descending body at 1.35 even when only the upper air cell is swept", () => {
    const w = new VoxelWorld("fence-cap");
    w.set(2, 140, 2, "fence_section");
    const b = newBody({ x: 2.5, y: 141.4, z: 2.5 });
    const neutral = { forward: 0, right: 0, jump: false, squat: false, sprint: false };
    for (let i = 0; i < 8; i++) stepBody(b, neutral, w, false, false);
    expect(b.y).toBeCloseTo(141.35, 3);
    expect(b.grounded).toBe(true);
    expect(w.raycast({ x: 2.5, y: 141.2, z: 3.5 }, { x: 0, y: 0, z: -1 }, 2)).toBeNull();
  });
});

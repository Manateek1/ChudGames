import { describe, expect, it } from "vitest";
import { BLOCKS } from "./blocks";
import { biomeRules, classify, coordHash, Generator, MAX_Y, MIN_Y, sectionAddress } from "./generation";
import { meshColumn } from "./mesh";
import { VoxelWorld } from "./world";

describe("Tideworld generator version 1", () => {
  it("uses the signed-coordinate 64-bit mixer and fixed height samples", () => {
    const seed = 0xffffffffffffffffn;
    expect(coordHash(seed, 100, -17, 5, 16).toString(16)).toBe("33be38244768c74f");
    const g = new Generator(seed.toString());
    expect(
      [
        [-17, -16],
        [0, 0],
        [257, 198],
        [-713, 300],
      ].map(([x, z]) => g.surface(x, z).h),
    ).toEqual([72, 64, 65, 76]);
  });
  it("round-trips signed column and section boundaries", () => {
    for (const x of [-17, -16, -1, 0, 15, 16])
      for (const z of [-17, -16, -1, 0, 15, 16]) {
        for (let sy = 0; sy < 10; sy++)
          for (const ly of [0, 31]) {
            const y = MIN_Y + sy * 32 + ly,
              a = sectionAddress(x, y, z)!;
            expect([a.cx * 16 + a.lx, a.sy * 32 + a.ly + MIN_Y, a.cz * 16 + a.lz, a.index]).toEqual([
              x,
              y,
              z,
              (ly * 16 + a.lz) * 16 + a.lx,
            ]);
          }
      }
    expect(sectionAddress(0, MIN_Y - 1, 0)).toBeNull();
    expect(sectionAddress(0, MAX_Y + 1, 0)).toBeNull();
  });
  it("resolves biome priority at the handbook thresholds", () => {
    const profiles = [
      [39, 0.5, 0.5],
      [47, 0.5, 0.5],
      [110, 0.35, 0.8],
      [83, 0.65, 0.39],
      [98, 0.45, 0.5],
      [64, 0.45, 0.72],
      [70, 0.28, 0.72],
      [70, 0.5, 0.21],
      [70, 0.5, 0.31],
      [70, 0.5, 0.61],
      [70, 0.5, 0.5],
    ];
    expect(profiles.map(([h, t, m]) => classify(h, t, m))).toEqual(biomeRules);
  });
  it("provides dry spawn, forage and a cave mouth for one hundred seeds", () => {
    for (let i = 0; i < 100; i++) {
      const w = new VoxelWorld(String(i));
      const y = Math.floor(w.spawn.y);
      expect(w.get(0, y - 1, 0)).toBe("loam");
      expect(w.get(0, y, 0)).toBe("air");
      expect(w.fluid(0, y, 0)).toBe(0);
      expect(w.get(-5, w.height(-5, 1) + 1, 1)).toBe("alder_log");
      expect(w.get(2, w.height(2, -3) + 1, -3)).toBe("brush");
      expect(w.get(6, w.height(6, -7) + 1, -7)).toBe("reed");
      expect(w.get(5, w.height(5, -8), -8)).toBe("red_clay");
      expect(w.get(-5, w.height(-5, -13), -13)).toBe("air");
    }
  });
  it("produces identical feature and mesh buffers across independent world instances and load orders", () => {
    const a = new VoxelWorld("817"),
      b = new VoxelWorld("817");
    meshColumn(a, -1, 0, null);
    meshColumn(b, 1, -1, null);
    const one = meshColumn(a, 0, -1, null),
      two = meshColumn(b, 0, -1, null);
    for (let i = 0; i < 3; i++) {
      expect(one.layers[i].positions).toEqual(two.layers[i].positions);
      expect(one.layers[i].indices).toEqual(two.layers[i].indices);
      expect(one.layers[i].tiles).toEqual(two.layers[i].tiles);
    }
  });
});
describe("voxel edits and shape queries", () => {
  it("covers all 54 registered blocks and protects the foundation", () => {
    const w = new VoxelWorld("1");
    expect(Object.keys(BLOCKS)).toHaveLength(54);
    expect(w.set(-1, MIN_Y + 1, -17, "air")).toBe(false);
    expect(w.set(-1, MAX_Y + 1, 0, "slate")).toBe(false);
    expect(w.set(0, 80, 0, "missing")).toBe(false);
  });
  it("preserves unknown saved IDs while exposing safe recovery geometry", () => {
    const w = new VoxelWorld("12", { "0,108,0": "retired_marker" });
    expect(w.get(0, 108, 0)).toBe("slate_brick");
    expect(w.bounds(0, 108, 0)).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(w.edits))["0,108,0"]).toBe("retired_marker");
  });
  it("makes the quarry tier route and landmark supply drawers accessible", () => {
    const w = new VoxelWorld("12"),
      floor = w.quarryFloor();
    expect(w.get(-8, floor, -33)).toBe("ore_copper");
    expect(w.get(-6, floor, -33)).toBe("ore_tin");
    expect(w.get(-9, floor, -33)).toBe("basalt");
    expect(w.get(-8, floor + 1, -33)).toBe("air");
    expect(w.generatedStashKind(-4, floor + 2, -34)).toBe("collapsed_quarry");
    expect(w.generatedStashKind(-11, w.height(-10, -13) + 1, -14)).toBe("survey_station");
  });
  it("selects the actual plate bounds, honors reach and preserves saved edits at a seam", () => {
    const w = new VoxelWorld("12");
    w.set(-16, 99, -16, "half_step");
    expect(w.raycast({ x: -15.5, y: 99.8, z: -14 }, { x: 0, y: 0, z: -1 })).toBeNull();
    expect(w.raycast({ x: -15.5, y: 99.3, z: -14 }, { x: 0, y: 0, z: -1 })).toMatchObject({
      x: -16,
      y: 99,
      z: -16,
      id: "half_step",
      normal: { x: 0, y: 0, z: 1 },
    });
    expect(w.raycast({ x: -15.5, y: 99.3, z: 0 }, { x: 0, y: 0, z: -1 })).toBeNull();
    const restored = new VoxelWorld("12", JSON.parse(JSON.stringify(w.edits)));
    expect(restored.bounds(-16, 99, -16)[0].maxY).toBe(0.5);
    restored.setVariant(-16, 99, -16, "upper");
    expect(restored.bounds(-16, 99, -16)[0].minY).toBe(0.5);
  });
  it("carries quantized RGB across a chunk seam, clears a removed emitter, and keeps surviving sources", () => {
    const w = new VoxelWorld("7");
    let east = true,
      west = false;
    w.bindSystems({ fluid: () => undefined, lit: (x) => (x === 19 ? east : west) });
    w.set(15, 98, 3, "slate");
    w.set(19, 99, 3, "lamp");
    w.set(12, 99, 3, "lamp");
    const sample = () => {
      const layer = meshColumn(w, 0, 0, null).layers[0];
      for (let i = 0; i < layer.positions.length; i += 12) {
        if (
          Array.from(layer.positions.slice(i, i + 12)).every((v, k) =>
            k % 3 === 1 ? v === 99 : k % 3 === 0 ? v >= 15 && v <= 16 : v >= 3 && v <= 4,
          )
        )
          return Array.from(layer.colors.slice(i, i + 3), (v) => Math.round(v * 15));
      }
      throw new Error("The receiver's upper face is missing");
    };
    expect(sample()).toEqual([11, 9, 4]);
    west = true;
    east = false;
    w.dirty(19, 99, 3);
    w.dirty(12, 99, 3);
    expect(sample()).toEqual([12, 10, 5]);
    west = false;
    w.dirty(12, 99, 3);
    expect(sample()).toEqual([0, 0, 0]);
  });
  it("remeshes cells and adjoining column faces when mining across a seam", () => {
    const w = new VoxelWorld("7");
    w.set(15, 111, 0, "slate");
    w.set(16, 111, 0, "slate");
    const before = meshColumn(w, 0, 0, null).layers[0];
    w.set(16, 111, 0, "air");
    const after = meshColumn(w, 0, 0, null).layers[0];
    expect(after.indices.length - before.indices.length).toBe(6);
  });
});

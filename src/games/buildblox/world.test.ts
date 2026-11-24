import { describe, expect, it } from "vitest";
import { Block, isSolid, withState } from "./blocks";
import { decodeMeshChunk, meshChunk } from "./mesh";
import type { ChunkPacket, Realm } from "./protocol";
import { packSection, unpackSection, VoxelWorld, WORLD_MAX_Y, WORLD_MIN_Y } from "./world";

describe("BuildBlox voxel world", () => {
  it("packs and decodes palette indices spanning multiple words", () => {
    const voxels = Uint16Array.from({ length: 4096 }, (_, index) => (index % 29) * 219);
    const section = packSection(-2, voxels);
    expect(section.bits).toBe(5);
    expect(section.words.byteLength).toBeLessThan(voxels.byteLength);
    expect(unpackSection(section)).toEqual(voxels);

    const uniform = new Uint16Array(4096).fill(Block.Cloudstone);
    const single = packSection(1, uniform);
    expect(single.words).toHaveLength(0);
    expect(unpackSection(single)).toEqual(uniform);
  });

  it("persists edits across negative chunk boundaries and cache eviction", () => {
    const world = new VoxelWorld("ember", "surface");
    for (let index = 0; index < 30; index++) {
      const x = -32 + (index & 15), z = -16 + Math.floor(index / 16);
      expect(world.set(x, 216, z, withState(Block.Lamp, index + 1))).toBe(true);
    }
    expect(world.set(-17, 216, -16, Block.Air)).toBe(true);
    expect(world.set(-16, WORLD_MAX_Y + 1, -16, Block.Wood)).toBe(false);
    expect(world.get(-16, WORLD_MIN_Y - 1, -16)).toBe(Block.Air);

    world.prune(3, 3, 1);
    expect(world.get(-32, 216, -16)).toBe(withState(Block.Lamp, 1));
    expect(world.get(-17, 216, -16)).toBe(Block.Air);
    expect(world.get(-18, 216, -15)).toBe(Block.Air);
    const restored = new VoxelWorld("ember", "surface", world.edits());
    expect(restored.packet(-2, -1)).toEqual(world.packet(-2, -1));
  });

  it("generates the same terrain independent of chunk access order", () => {
    const a = new VoxelWorld("53285183281281", "surface");
    const b = new VoxelWorld("53285183281281", "surface");
    const c = new VoxelWorld("53285183281282", "surface");
    const first = a.packet(-1, 0);
    b.packet(0, 0);
    expect(b.packet(-1, 0)).toEqual(first);
    expect(c.packet(-1, 0)).not.toEqual(first);
  });

  it.each<Realm>(["surface", "underdeep", "skyreach"])("provides a safe %s spawn", (realm) => {
    const world = new VoxelWorld("juniper", realm);
    const y = world.surfaceY(0, 0);
    expect(isSolid(world.get(0, y, 0))).toBe(true);
    expect(world.get(0, y + 1, 0)).toBe(Block.Air);
    expect(world.get(0, y + 2, 0)).toBe(Block.Air);
  });

  it("carves a continuous stairway from the starting trail into a cave", () => {
    const world = new VoxelWorld("juniper-vale", "surface");
    const lip = world.surfaceY(-9, -23);
    for (let distance = 0; distance < 24; distance++) {
      const x = -9 - Math.floor(distance / 10), z = -24 - distance;
      const floor = lip - Math.floor((distance + 1) / 2);
      expect(isSolid(world.get(x, floor, z))).toBe(true);
      expect(world.get(x, floor + 1, z)).toBe(Block.Air);
      expect(world.get(x, floor + 2, z)).toBe(Block.Air);
    }
    expect(world.get(-13, lip - 9, -49)).toBe(Block.Glowstone);
  });
});

const packet = (cx: number, positions: readonly [number, number, number, number][]): ChunkPacket => {
  const section = new Uint16Array(4096);
  for (const [x, y, z, code] of positions) section[(y << 8) | (z << 4) | x] = code;
  return { cx, cz: 0, sections: [packSection(0, section)] };
};

describe("BuildBlox terrain mesh", () => {
  it("culls the shared face across adjacent chunks", () => {
    const left = decodeMeshChunk(packet(-1, [[15, 2, 5, Block.Stone]]));
    const right = decodeMeshChunk(packet(0, [[0, 2, 5, Block.Stone]]));
    const adjacent = new Map([["-1,0", left], ["0,0", right]]);
    expect(meshChunk(left, "surface", new Map()).solid.indices).toHaveLength(36);
    const model = meshChunk(left, "surface", adjacent).solid;
    expect(model.indices).toHaveLength(30);
    const x = model.positions.filter((_, index) => index % 3 === 0);
    expect(Math.min(...x)).toBe(-1);
    expect(Math.max(...x)).toBe(0);
  });

  it("joins adjoining water voxels and keeps water off the solid layer", () => {
    const coasts = decodeMeshChunk(packet(0, [[1, 2, 5, Block.Water], [2, 2, 5, Block.Water]]));
    const model = meshChunk(coasts, "surface", new Map());
    expect(model.liquid.indices).toHaveLength(60);
    expect(model.solid.indices).toHaveLength(0);
  });

  it("warms a shaded face when its adjacent block emits light", () => {
    const unlit = decodeMeshChunk(packet(0, [[1, 2, 5, Block.Stone]]));
    const lit = decodeMeshChunk(packet(0, [[1, 2, 5, Block.Stone], [3, 2, 5, Block.Glowstone]]));
    const original = meshChunk(unlit, "underdeep", new Map()).solid.colors;
    const illuminated = meshChunk(lit, "underdeep", new Map()).solid.colors;
    // The first face is the stone's +X face, oriented toward the emitter.
    expect(illuminated[0]).toBeGreaterThan(original[0]);
    expect(illuminated[0] - original[0]).toBeGreaterThan(illuminated[2] - original[2]);
  });
});

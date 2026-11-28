import { BLOCKS } from "./blocks";
import { MAX_Y, MIN_Y } from "./generation";
import { textureIndex } from "./textures";
import { cellKey, type VoxelWorld } from "./world";

type Triple = [number, number, number];
export interface Layer {
  positions: Float32Array;
  uv: Float32Array;
  tiles: Float32Array;
  colors: Float32Array;
  sky: Float32Array;
  indices: Uint32Array;
}
export interface ChunkGeometry {
  layers: Layer[];
  cx: number;
  cz: number;
}
const directions: Triple[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const shading = [0.84, 0.84, 1, 0.62, 0.74, 0.74],
  occlusion = [1, 0.87, 0.75, 0.65];
export function meshColumn(world: VoxelWorld, cx: number, cz: number, eyeBand: number | null): ChunkGeometry {
  const ox = cx * 16,
    oz = cz * 16;
  const builders = Array.from({ length: 3 }, () => ({
    p: [] as number[],
    uv: [] as number[],
    tile: [] as number[],
    c: [] as number[],
    s: [] as number[],
    i: [] as number[],
  }));
  const cache = new Map<number, string>();
  const packed = (x: number, y: number, z: number) => (y - MIN_Y + 2) * 1024 + (z - oz + 4) * 32 + x - ox + 4;
  function get(x: number, y: number, z: number) {
    const key = packed(x, y, z);
    let id = cache.get(key);
    if (id === undefined) {
      id = world.get(x, y, z);
      cache.set(key, id);
    }
    return id;
  }
  const candidates = new Set<number>();
  const addRange = (x: number, z: number, lo: number, hi: number) => {
    lo = Math.max(MIN_Y, lo);
    hi = Math.min(MAX_Y, hi);
    for (let y = lo; y <= hi; y++) candidates.add((y - MIN_Y) * 256 + (z - oz) * 16 + x - ox);
  };
  const heightCache = new Int16Array(18 * 18);
  for (let dz = -1; dz <= 16; dz++)
    for (let dx = -1; dx <= 16; dx++) heightCache[(dz + 1) * 18 + dx + 1] = world.height(ox + dx, oz + dz);
  const height = (x: number, z: number) => heightCache[(z - oz + 1) * 18 + x - ox + 1] ?? world.height(x, z);
  for (let dz = 0; dz < 16; dz++)
    for (let dx = 0; dx < 16; dx++) {
      const x = ox + dx,
        z = oz + dz,
        h = height(x, z),
        f = world.featureRange(x, z);
      const low = Math.min(h, height(x + 1, z), height(x - 1, z), height(x, z - 1), height(x, z + 1));
      addRange(x, z, low - 1, Math.max(h + 1, f.max, world.waterline(x, z)));
      if (x >= -12 && x <= 1 && z >= -53 && z <= -12) addRange(x, z, h - 23, h);
      if (f.min < h - 2 && f.min > h - 10) addRange(x, z, f.min - 1, h);
      if (eyeBand !== null) addRange(x, z, eyeBand - 12, Math.min(h - 1, eyeBand + 28));
    }
  for (const key of world.changedCellsNear(cx, cz)) {
    const [x, y, z] = key.split(",").map(Number);
    for (const [dx, dy, dz] of [[0, 0, 0], ...directions]) {
      if (x + dx >= ox && x + dx < ox + 16 && z + dz >= oz && z + dz < oz + 16)
        addRange(x + dx, z + dz, y + dy, y + dy);
    }
  }
  const lightSeeds: { x: number; y: number; z: number; rgb: Triple }[] = [];
  function registerSource(x: number, y: number, z: number, id: string) {
    const rgb: Triple | undefined =
      id === "quartz_cluster"
        ? [7, 6, 3]
        : id === "geothermal_grate"
          ? [10, 5, 2]
          : id === "lamp" && world.lit(x, y, z)
            ? [15, 13, 8]
            : undefined;
    if (rgb) lightSeeds.push({ x, y, z, rgb });
  }
  for (const pos of candidates) {
    const i = pos & 255,
      x = ox + (i & 15),
      z = oz + (i >> 4),
      y = MIN_Y + Math.floor(pos / 256);
    registerSource(x, y, z, get(x, y, z));
  }
  for (const key of world.changedCellsNear(cx, cz)) {
    const [x, y, z] = key.split(",").map(Number);
    if (x < ox || x >= ox + 16 || z < oz || z >= oz + 16) registerSource(x, y, z, world.get(x, y, z));
  }
  if (eyeBand !== null && eyeBand - 12 < -22) {
    for (let x = ox - 10; x < ox + 26; x++)
      for (let z = oz - 10; z < oz + 26; z++) {
        if (x >= ox && x < ox + 16 && z >= oz && z < oz + 16) continue;
        for (let y = Math.max(MIN_Y + 2, eyeBand - 22); y <= Math.min(-23, eyeBand + 38); y++) {
          if ((((x + z) & 3) === 0 && (y & 3) === 0) || (y < -56 && (x & 7) === 0 && (z & 7) === 0))
            registerSource(x, y, z, world.get(x, y, z));
        }
      }
  }
  const light = new Map<string, Triple>();
  // Separate additions are combined with component-wise maxima. Rebuilding a dirty region clears removed sources.
  for (const seed of lightSeeds) {
    const q: [number, number, number, number][] = [[seed.x, seed.y, seed.z, 0]],
      seen = new Set<string>([cellKey(seed.x, seed.y, seed.z)]);
    for (let index = 0; index < q.length; index++) {
      const [x, y, z, d] = q[index],
        k = cellKey(x, y, z),
        old = light.get(k) ?? [0, 0, 0];
      light.set(k, [
        Math.max(old[0], seed.rgb[0] - d),
        Math.max(old[1], seed.rgb[1] - d),
        Math.max(old[2], seed.rgb[2] - d),
      ]);
      if (d + 1 >= Math.max(...seed.rgb)) continue;
      for (const [dx, dy, dz] of directions) {
        const a = x + dx,
          b = y + dy,
          c = z + dz,
          n = cellKey(a, b, c);
        if (a < ox - 14 || a > ox + 29 || c < oz - 14 || c > oz + 29 || seen.has(n)) continue;
        seen.add(n);
        if (!BLOCKS[world.get(a, b, c)]?.opaque) q.push([a, b, c, d + 1]);
      }
    }
  }
  type Face = { u: number; v: number; signature: string; tile: number; brightness: number[]; rgb: Triple };
  const planes = new Map<string, { side: number; p: number; faces: Map<number, Face> }>();
  function rect(pass: number, verts: Triple[], side: number, tile: number, br: number[], rgb: Triple) {
    const out = builders[pass],
      start = out.p.length / 3;
    for (let q = 0; q < 4; q++) {
      const [x, y, z] = verts[q];
      out.p.push(x - ox, y, z - oz);
      out.uv.push(side < 2 ? z : x, side === 2 || side === 3 ? z : y);
      out.tile.push(tile);
      out.s.push(br[q]);
      for (let k = 0; k < 3; k++) out.c.push(rgb[k] / 15);
    }
    out.i.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  function vertices(side: number, plane: number, u: number, v: number, w: number, h: number): Triple[] {
    const axis = side >> 1,
      a = (axis + 1) % 3,
      b = (axis + 2) % 3;
    const result: Triple[] = [];
    const pairs =
      side & 1
        ? [
            [0, 0],
            [0, h],
            [w, h],
            [w, 0],
          ]
        : [
            [0, 0],
            [w, 0],
            [w, h],
            [0, h],
          ];
    for (const [du, dv] of pairs) {
      const pos: Triple = [0, 0, 0];
      pos[axis] = plane;
      pos[a] = u + du;
      pos[b] = v + dv;
      result.push(pos);
    }
    return result;
  }
  const skyCache = new Map<number, number>();
  let minRoof = Infinity;
  for (let x = ox - 1; x <= ox + 16; x++)
    for (let z = oz - 1; z <= oz + 16; z++) minRoof = Math.min(minRoof, world.skyCeiling(x, z));
  function skyLevel(x: number, y: number, z: number) {
    if (y > world.skyCeiling(x, z)) return 15;
    if (y < minRoof - 15) return 0;
    const start = packed(x, y, z),
      cached = skyCache.get(start);
    if (cached !== undefined) return cached;
    const queue: [number, number, number, number][] = [[x, y, z, 0]],
      seen = new Set<string>([cellKey(x, y, z)]);
    let brightest = 0;
    for (let i = 0; i < queue.length; i++) {
      const [a, b, c, d] = queue[i];
      if (d >= 14 || brightest >= 15 - d) continue;
      for (const [dx, dy, dz] of directions) {
        const xx = a + dx,
          yy = b + dy,
          zz = c + dz;
        if (yy > world.skyCeiling(xx, zz)) {
          brightest = 14 - d;
          break;
        }
        const k = cellKey(xx, yy, zz);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!BLOCKS[world.get(xx, yy, zz)]?.opaque) queue.push([xx, yy, zz, d + 1]);
      }
      if (brightest === 14 - d) break;
    }
    skyCache.set(start, brightest);
    return brightest;
  }
  for (const encoded of candidates) {
    const i = encoded & 255,
      x = ox + (i & 15),
      z = oz + (i >> 4),
      y = MIN_Y + Math.floor(encoded / 256),
      pos: Triple = [x, y, z];
    const id = get(x, y, z),
      def = BLOCKS[id],
      biome = world.biome(x, z);
    const level = world.renderFluid(x, y, z);
    if (level > 0 && world.renderFluid(x, y + 1, z) === 0) {
      const top = y + level / 8 - 0.045;
      rect(
        2,
        vertices(2, top, z, x, 1, 1),
        2,
        textureIndex("water", 2, undefined, biome),
        [1, 1, 1, 1],
        [0, 0, 0],
      );
      for (const side of [0, 1, 4, 5]) {
        const [dx, , dz] = directions[side],
          other = world.renderFluid(x + dx, y, z + dz);
        if (other >= level || BLOCKS[get(x + dx, y, z + dz)]?.opaque) continue;
        const low = y + other / 8,
          axis = side >> 1,
          a = (axis + 1) % 3,
          b = (axis + 2) % 3;
        const p: Triple = [x, low, z],
          sizes: Triple = [1, top - low, 1];
        rect(
          2,
          vertices(side, pos[axis] + Number(!(side & 1)), p[a], p[b], sizes[a], sizes[b]),
          side,
          textureIndex("water", side, undefined, biome),
          [0.85, 0.85, 0.85, 0.85],
          [0, 0, 0],
        );
      }
    }
    if (id === "air" || !def) continue;
    const key = cellKey(x, y, z),
      variant = world.variants[key];
    const pass =
      id === "glass_panel" ? 2 : def.shape === "plant" || def.shape === "stalk" || id === "foliage" ? 1 : 0;
    if (def.shape === "plant" || def.shape === "stalk") {
      const tile = textureIndex(id, 0, variant, biome);
      const stages = id === "grain_crop" ? variant?.match(/\d+/) : undefined,
        h = stages?.[0] ? 0.3 + 0.16 * Math.min(4, Number(stages[0])) : 0.86;
      rect(
        1,
        [
          [x + 0.1, y, z + 0.1],
          [x + 0.9, y, z + 0.9],
          [x + 0.9, y + h, z + 0.9],
          [x + 0.1, y + h, z + 0.1],
        ],
        4,
        tile,
        [0.77, 0.77, 1, 1],
        [0, 0, 0],
      );
      rect(
        1,
        [
          [x + 0.9, y, z + 0.1],
          [x + 0.1, y, z + 0.9],
          [x + 0.1, y + h, z + 0.9],
          [x + 0.9, y + h, z + 0.1],
        ],
        4,
        tile,
        [0.77, 0.77, 1, 1],
        [0, 0, 0],
      );
      continue;
    }

    for (const box of world.shape(x, y, z, id)) {
      const min: Triple = [x + box.minX, y + box.minY, z + box.minZ],
        max: Triple = [x + box.maxX, y + box.maxY, z + box.maxZ];
      for (let side = 0; side < 6; side++) {
        const [dx, dy, dz] = directions[side],
          nx = x + dx,
          ny = y + dy,
          nz = z + dz;
        const axis = side >> 1,
          a = (axis + 1) % 3,
          b = (axis + 2) % 3,
          p = side & 1 ? min[axis] : max[axis];
        const adjacent = get(nx, ny, nz);
        if (Number.isInteger(p) && (BLOCKS[adjacent]?.opaque || (id === "foliage" && adjacent === id)))
          continue;
        const rgb: Triple = light.get(cellKey(nx, ny, nz)) ?? [0, 0, 0];
        const sky = 0.12 + (0.88 * skyLevel(nx, ny, nz)) / 15;
        const brightness: number[] = [];
        const vert = vertices(side, p, min[a], min[b], max[a] - min[a], max[b] - min[b]);
        for (const v of vert) {
          const n: Triple = [nx, ny, nz],
            da = v[a] === min[a] ? -1 : 1,
            db = v[b] === min[b] ? -1 : 1;
          n[a] += da;
          const first = Number(BLOCKS[get(...n)]?.opaque);
          n[b] += db;
          const diagonal = Number(BLOCKS[get(...n)]?.opaque);
          n[a] -= da;
          const second = Number(BLOCKS[get(...n)]?.opaque);
          brightness.push(sky * shading[side] * occlusion[first && second ? 3 : first + second + diagonal]);
        }
        const tile = textureIndex(id, side, id === "lamp" && !world.lit(x, y, z) ? "off" : variant, biome);
        if (pass !== 0 || def.shape !== "cube") {
          rect(pass, vert, side, tile, brightness, rgb);
          continue;
        }
        const planeKey = side + ":" + p;
        let plane = planes.get(planeKey);
        if (!plane) {
          plane = { side, p, faces: new Map() };
          planes.set(planeKey, plane);
        }
        const u = min[a],
          v = min[b];
        // Coordinates are relative to the chunk and build floor to keep face keys collision-free.
        const base: Triple = [ox, MIN_Y, oz],
          lu = u - base[a],
          lv = v - base[b];
        plane.faces.set(lu + lv * 512, {
          u,
          v,
          tile,
          brightness,
          rgb,
          signature: tile + "|" + brightness.join(",") + "|" + rgb.join(","),
        });
      }
    }
  }
  for (const { p, side, faces } of planes.values()) {
    for (const [key, f] of faces) {
      let w = 1,
        h = 1;
      while (faces.get(key + w)?.signature === f.signature) w++;
      outer: while (true) {
        for (let dx = 0; dx < w; dx++)
          if (faces.get(key + h * 512 + dx)?.signature !== f.signature) break outer;
        h++;
      }
      for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) faces.delete(key + j * 512 + k);
      rect(0, vertices(side, p, f.u, f.v, w, h), side, f.tile, f.brightness, f.rgb);
    }
  }
  return {
    cx,
    cz,
    layers: builders.map((o) => ({
      positions: new Float32Array(o.p),
      uv: new Float32Array(o.uv),
      tiles: new Float32Array(o.tile),
      colors: new Float32Array(o.c),
      sky: new Float32Array(o.s),
      indices: new Uint32Array(o.i),
    })),
  };
}

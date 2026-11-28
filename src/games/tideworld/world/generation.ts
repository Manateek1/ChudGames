export const GENERATOR_VERSION = 1;
export const MIN_Y = -96,
  MAX_Y = 223,
  SEA_LEVEL = 44,
  WORLD_EDGE = 1048576;
const MASK = (1n << 64n) - 1n;
export function mix64(value: bigint) {
  let v = value & MASK;
  v = ((v ^ (v >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  v = ((v ^ (v >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return v ^ (v >> 31n);
}
export function coordHash(seed: bigint, salt: number, x: number, y: number, z: number) {
  return mix64(mix64(mix64(mix64(seed ^ BigInt(salt)) ^ BigInt(x)) ^ BigInt(y)) ^ BigInt(z));
}
export function parseSeed(seed: string) {
  if (/^(?:[0-9]+|0x[0-9a-f]+)$/i.test(seed)) return BigInt(seed) & MASK;
  let h = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(seed)) h = ((h ^ BigInt(byte)) * 1099511628211n) & MASK;
  return h;
}
export function sectionAddress(x: number, y: number, z: number) {
  if (
    ![x, y, z].every(Number.isSafeInteger) ||
    y < MIN_Y ||
    y > MAX_Y ||
    Math.abs(x) > WORLD_EDGE ||
    Math.abs(z) > WORLD_EDGE
  )
    return null;
  const cx = Math.floor(x / 16),
    cz = Math.floor(z / 16),
    sy = Math.floor((y - MIN_Y) / 32);
  const lx = x - cx * 16,
    lz = z - cz * 16,
    ly = y - MIN_Y - 32 * sy;
  return { cx, cz, sy, lx, ly, lz, index: (ly * 16 + lz) * 16 + lx };
}
export const biomeRules = [
  "brine_bay",
  "storm_coast",
  "frost_crown",
  "cinder_shelf",
  "wind_ridge",
  "lantern_fen",
  "frostwood",
  "salt_basin",
  "red_scrub",
  "rainwood",
  "silt_meadow",
] as const;
export type SurfaceBiome = (typeof biomeRules)[number];
export function classify(h: number, t: number, m: number): SurfaceBiome {
  if (h <= 39) return "brine_bay";
  if (h <= 47) return "storm_coast";
  if (h >= 110 && t < 0.36) return "frost_crown";
  if (h >= 83 && t > 0.62 && m < 0.4) return "cinder_shelf";
  if (h >= 98) return "wind_ridge";
  if (h <= 64 && m >= 0.72) return "lantern_fen";
  if (t < 0.3) return "frostwood";
  if (m < 0.22) return "salt_basin";
  if (m < 0.37) return "red_scrub";
  if (m >= 0.61) return "rainwood";
  return "silt_meadow";
}
export const BIOME_MATERIAL: Record<SurfaceBiome, string> = {
  brine_bay: "gravel",
  storm_coast: "sand",
  frost_crown: "snow_crust",
  cinder_shelf: "basalt",
  wind_ridge: "slate",
  lantern_fen: "peat",
  frostwood: "peat",
  salt_basin: "salt_crust",
  red_scrub: "red_clay",
  rainwood: "loam",
  silt_meadow: "loam",
};
const fade = (u: number) => u * u * u * (u * (u * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const quantize = (n: number) => Math.round(n * 4096) / 4096;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const gradients2 = Array.from({ length: 8 }, (_, i) => [
  Math.cos((i * Math.PI) / 4),
  Math.sin((i * Math.PI) / 4),
]);
const gradients3 = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];
export interface Surface {
  h: number;
  t: number;
  m: number;
  biome: SurfaceBiome;
  material: string;
}
interface Anchor {
  x: number;
  y: number;
  z: number;
}
interface Tunnel {
  from: Anchor;
  to: Anchor;
  r: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}
export class Generator {
  readonly seed: bigint;
  private gradients = new Map<string, number>();
  private tunnels = new Map<string, Tunnel[]>();
  private veins = new Map<string, Map<number, string>>();
  private columns = new Map<string, Map<number, Surface>>();
  constructor(seed: string) {
    this.seed = parseSeed(seed);
  }
  sample(salt: number, x: number, y: number, z: number) {
    return Number(coordHash(this.seed, salt, x, y, z) >> 11n) / 9007199254740992;
  }
  private gradientIndex(salt: number, x: number, y: number, z: number) {
    const key = salt + ":" + x + "," + y + "," + z;
    let value = this.gradients.get(key);
    if (value === undefined) {
      value = Number(coordHash(this.seed, salt, x, y, z) & 0xffffffffn);
      if (this.gradients.size > 65536) this.gradients.clear();
      this.gradients.set(key, value);
    }
    return value;
  }
  noise2(salt: number, x: number, z: number) {
    const ix = Math.floor(x),
      iz = Math.floor(z),
      dx = x - ix,
      dz = z - iz;
    const corner = (a: number, b: number) => {
      const g = gradients2[this.gradientIndex(salt, ix + a, 0, iz + b) & 7];
      return g[0] * (dx - a) + g[1] * (dz - b);
    };
    return quantize(
      clamp(
        1.41421356 *
          lerp(
            lerp(corner(0, 0), corner(1, 0), fade(dx)),
            lerp(corner(0, 1), corner(1, 1), fade(dx)),
            fade(dz),
          ),
        -1,
        1,
      ),
    );
  }
  noise3(salt: number, x: number, y: number, z: number) {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      iz = Math.floor(z),
      dx = x - ix,
      dy = y - iy,
      dz = z - iz,
      fx = fade(dx),
      fy = fade(dy);
    const dot = (a: number, b: number, c: number) => {
      const g = gradients3[this.gradientIndex(salt, ix + a, iy + b, iz + c) % 12];
      return g[0] * (dx - a) + g[1] * (dy - b) + g[2] * (dz - c);
    };
    const slice = (c: number) =>
      lerp(lerp(dot(0, 0, c), dot(1, 0, c), fx), lerp(dot(0, 1, c), dot(1, 1, c), fx), fy);
    return quantize(clamp(lerp(slice(0), slice(1), fade(dz)), -1, 1));
  }
  private octave(salt: number, x: number, z: number, f: number) {
    let v = 0,
      amplitude = 1;
    for (let i = 0; i < 5; i++) {
      v += amplitude * this.noise2(salt + i, x * f, z * f);
      amplitude *= 0.5;
      f *= 2;
    }
    return quantize(v / 1.9375);
  }
  surface(x: number, z: number): Surface {
    const cx = Math.floor(x / 16),
      cz = Math.floor(z / 16),
      key = cx + "," + cz,
      index = (z - cz * 16) * 16 + x - cx * 16;
    let column = this.columns.get(key);
    if (!column) {
      column = new Map();
      if (this.columns.size > 1536) this.columns.clear();
      this.columns.set(key, column);
    }
    const prior = column.get(index);
    if (prior) return prior;
    const result = this.profile(x, z);
    // Only a four-cell material fringe crosses a biome boundary; ecology always uses the owning cell.
    const dx = (x & 1 ? 1 : -1) * 4,
      dz = (z & 1 ? 1 : -1) * 4;
    const closeToBoundary =
      [39, 47, 64, 83, 98, 110].some((edge) => Math.abs(result.h - edge) <= 2) ||
      [0.22, 0.37, 0.4, 0.61, 0.72].some((edge) => Math.abs(result.m - edge) < 0.008) ||
      [0.3, 0.36, 0.62].some((edge) => Math.abs(result.t - edge) < 0.008);
    if (closeToBoundary && this.sample(147, x, 0, z) < 0.4) {
      const neighboring = this.profile(x + dx, z + dz);
      if (neighboring.biome !== result.biome) result.material = neighboring.material;
    }
    column.set(index, result);
    return result;
  }
  private profile(x: number, z: number): Surface {
    const c = this.octave(100, x, z, 0.0012),
      d = this.octave(110, x, z, 0.006),
      r = 1 - Math.abs(this.noise2(120, x * 0.003, z * 0.003));
    const h = clamp(Math.floor(64 + 48 * c + 28 * d + 32 * r * r * Math.max(c, 0) + 0.5), 12, 168);
    const t = clamp(
      0.5 + 0.35 * this.noise2(130, x * 0.0016, z * 0.0016) - 0.003 * Math.max(h - 64, 0),
      0,
      1,
    );
    const m = clamp(0.5 + 0.45 * this.noise2(140, x * 0.0022, z * 0.0022), 0, 1);
    const biome = classify(h, t, m);
    return { h, t, m, biome, material: BIOME_MATERIAL[biome] };
  }
  caveBiome(x: number, y: number, z: number, s = this.surface(x, z)) {
    if (y < -56 && this.noise3(208, x * 0.017, y * 0.017, z * 0.017) > 0.4) return "thermal_hollows";
    if (y < -22 && this.noise3(209, x * 0.021, y * 0.021, z * 0.021) > 0.48) return "crystal_fault";
    if ((s.biome === "lantern_fen" || s.biome === "rainwood") && s.h - y <= 24) return "root_vault";
    return "slate_galleries";
  }
  private macroTunnels(mx: number, my: number, mz: number) {
    const key = mx + "," + my + "," + mz;
    const prior = this.tunnels.get(key);
    if (prior) return prior;
    const segments: Tunnel[] = [];
    const anchor = (a: number, b: number, c: number): Anchor => ({
      x: a * 64 + 8 + 48 * this.sample(212, a, b, c),
      y: b * 64 + 8 + 48 * this.sample(213, a, b, c),
      z: c * 64 + 8 + 48 * this.sample(214, a, b, c),
    });
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const a = mx + dx,
            b = my + dy,
            c = mz + dz,
            from = anchor(a, b, c);
          for (let axis = 0; axis < 3; axis++) {
            if (this.sample(218 + axis, a, b, c) >= 0.41) continue;
            const to = anchor(a + Number(axis === 0), b + Number(axis === 1), c + Number(axis === 2));
            const mid = {
              x: (from.x + to.x) / 2 + 5 * (this.sample(226, a, b, c) - 0.5),
              y: (from.y + to.y) / 2 + 8 * (this.sample(227, a, b, c) - 0.5),
              z: (from.z + to.z) / 2 + 5 * (this.sample(228, a, b, c) - 0.5),
            };
            const r = 1.5 + 2 * this.sample(222 + axis, a, b, c);
            for (const [p, q] of [
              [from, mid],
              [mid, to],
            ]) {
              segments.push({
                from: p,
                to: q,
                r,
                minX: Math.min(p.x, q.x) - r,
                maxX: Math.max(p.x, q.x) + r,
                minY: Math.min(p.y, q.y) - r,
                maxY: Math.max(p.y, q.y) + r,
                minZ: Math.min(p.z, q.z) - r,
                maxZ: Math.max(p.z, q.z) + r,
              });
            }
          }
        }
    if (this.tunnels.size > 128) this.tunnels.clear();
    this.tunnels.set(key, segments);
    return segments;
  }
  carved(x: number, y: number, z: number, s: Surface) {
    // The survey trail descends from a marked cave mouth to a starter quarry.
    if (z < -12 && z >= -51 && Math.abs(x + 5 + Math.sin(z * 0.13) * 2) < 3) {
      const d = -z - 13,
        floor = this.surface(-5, -13).h - Math.floor(d * 0.48) - 1;
      if (y > floor && y <= floor + 4) return true;
    }
    if (y > s.h - 5 || y <= MIN_Y + 1) return false;
    if (
      this.noise3(200, x * 0.032, y * 0.032, z * 0.032) + 0.2 * clamp((20 - y) / 80, 0, 1) > 0.51 &&
      this.noise3(201, x * 0.071, y * 0.071, z * 0.071) > 0.06
    )
      return true;
    for (const t of this.macroTunnels(Math.floor(x / 64), Math.floor(y / 64), Math.floor(z / 64))) {
      if (x < t.minX || x > t.maxX || y < t.minY || y > t.maxY || z < t.minZ || z > t.maxZ) continue;
      const dx = t.to.x - t.from.x,
        dy = t.to.y - t.from.y,
        dz = t.to.z - t.from.z;
      const u = clamp(
        ((x - t.from.x) * dx + (y - t.from.y) * dy + (z - t.from.z) * dz) / (dx * dx + dy * dy + dz * dz),
        0,
        1,
      );
      if (
        (t.from.x + dx * u - x) ** 2 + (t.from.y + dy * u - y) ** 2 + (t.from.z + dz * u - z) ** 2 <
        t.r * t.r
      )
        return true;
    }
    return false;
  }
  ore(x: number, y: number, z: number) {
    const a = Math.floor(x / 8),
      b = Math.floor(y / 8),
      c = Math.floor(z / 8),
      key = a + "," + b + "," + c;
    let cell = this.veins.get(key);
    if (!cell) {
      cell = new Map();
      const minerals = [
        ["ore_tin", 8, 82, 0.12],
        ["ore_copper", -20, 55, 0.15],
        ["ore_iron", -80, 12, 0.11],
      ] as const;
      minerals.forEach(([id, low, high, chance], i) => {
        const salt = 300 + i * 32;
        if (b * 8 + 7 < low || b * 8 > high || this.sample(salt, a, b, c) >= chance) return;
        let lx = Math.floor(this.sample(salt + 1, a, b, c) * 8),
          ly = Math.floor(this.sample(salt + 2, a, b, c) * 8),
          lz = Math.floor(this.sample(salt + 3, a, b, c) * 8);
        const count = 3 + Math.floor(this.sample(salt + 4, a, b, c) * 6);
        for (let j = 0; j < count; j++) {
          if (b * 8 + ly >= low && b * 8 + ly <= high) cell!.set((ly * 8 + lz) * 8 + lx, id);
          const n = Math.floor(this.sample(salt + 5 + j, a, b, c) * 6),
            dir = (n % 2) * 2 - 1;
          if (n < 2) lx = clamp(lx + dir, 0, 7);
          else if (n < 4) ly = clamp(ly + dir, 0, 7);
          else lz = clamp(lz + dir, 0, 7);
        }
      });
      if (this.veins.size > 8192) this.veins.clear();
      this.veins.set(key, cell);
    }
    return cell.get(((((y % 8) + 8) % 8) * 8 + (((z % 8) + 8) % 8)) * 8 + (((x % 8) + 8) % 8));
  }
}

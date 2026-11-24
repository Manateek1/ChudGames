import { Block, withState } from "./blocks";
import type { Realm, TerrainRevision } from "./protocol";

export const WORLD_MIN_Y = -64;
export const WORLD_MAX_Y = 319;
export const CHUNK_SIZE = 16;
const WATERLINE = 63;

type Profile = {
  y: number;
  bottom: number;
  ceiling: number;
  cover: number;
  name: string;
  cave: number;
  damp: boolean;
};

function mix(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function seed64(text: string): bigint {
  if (/^[+-]?\d+$/.test(text) && text.length < 100) return BigInt.asUintN(64, BigInt(text));
  let value = 0xcbf29ce484222325n;
  for (const digit of text) {
    value = BigInt.asUintN(64, (value ^ BigInt(digit.codePointAt(0)!)) * 0x100000001b3n);
  }
  return value;
}

const relax = (n: number) => n * n * (3 - 2 * n);
const blend = (a: number, b: number, t: number) => a + (b - a) * t;
const ramp = (v: number, lo: number, hi: number) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

export class Terrain {
  private readonly seed: number;
  private readonly salt: number;
  private readonly realm: Realm;
  private readonly revised: boolean;
  constructor(seed: string, realm: Realm, revision: TerrainRevision) {
    this.realm = realm;
    this.revised = revision >= 2;
    const value = seed64(seed);
    this.seed = mix(Number(value & 0xffffffffn) ^ 0xca5e743b);
    this.salt = mix(Number(value >> 32n) ^ 0x01dad263);
  }

  private hash(x: number, z: number, salt: number, y = 0): number {
    return mix(Math.imul(x, 0x714ac817) ^ Math.imul(z, 0x59edac61) ^ Math.imul(y, this.salt | 1) ^
      Math.imul(salt, 0x6d2b79f5) ^ this.seed ^ Math.imul(x - z, this.salt));
  }

  private unit(x: number, z: number, salt: number, y = 0): number {
    return this.hash(x, z, salt, y) / 4294967296;
  }

  private gradient(x: number, z: number, salt: number): number {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const dot = (cx: number, cz: number, dx: number, dz: number) => {
      const d = this.hash(cx, cz, salt);
      return ((d & 1) ? dx : -dx) + ((d & 2) ? dz : -dz);
    };
    return blend(
      blend(dot(ix, iz, fx, fz), dot(ix + 1, iz, fx - 1, fz), relax(fx)),
      blend(dot(ix, iz + 1, fx, fz - 1), dot(ix + 1, iz + 1, fx - 1, fz - 1), relax(fx)),
      relax(fz),
    );
  }

  private field(x: number, z: number, scale: number, salt: number): number {
    const a = x / scale, b = z / scale;
    return this.gradient(a + 13.1, b + 29.8, salt) * 0.68
      + this.gradient(a * 2.1 + 1.9, b * 2.1 + 47.2, salt + 1) * 0.23
      + this.gradient(a * 4 + 48, b * 4 + 12, salt + 2) * 0.09;
  }

  private density(x: number, y: number, z: number, salt: number): number {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = relax(x - ix), fy = relax(y - iy), fz = relax(z - iz);
    const slice = (at: number) => blend(
      blend(this.unit(ix, iz, salt, at), this.unit(ix + 1, iz, salt, at), fx),
      blend(this.unit(ix, iz + 1, salt, at), this.unit(ix + 1, iz + 1, salt, at), fx), fz,
    );
    return blend(slice(iy), slice(iy + 1), fy);
  }

  profile(x: number, z: number): Profile {
    const near = Math.hypot(x, z);
    if (this.realm === "skyreach") {
      const cell = 76;
      const cx = Math.floor((x + cell / 2) / cell);
      const cz = Math.floor((z + cell / 2) / cell);
      const center = cx === 0 && cz === 0;
      const px = cx * cell + (center ? 0 : (this.unit(cx, cz, 123) - 0.5) * 16);
      const pz = cz * cell + (center ? 0 : (this.unit(cx, cz, 167) - 0.5) * 16);
      const radius = center ? 33 : 19 + this.unit(cx, cz, 127) * 10;
      const core = 1 - Math.hypot(x - px, z - pz) / radius + this.field(x, z, 17, 168) * 0.29;
      const summit = center ? 125 : 117 + Math.floor(this.unit(cx, cz, 998) * 31);
      const height = Math.floor(blend(near < 6 ? 125 : summit, summit - 8 + Math.max(0, core) * 11, ramp(near, 6, 18)));
      return {
        y: core > 0 ? height : WORLD_MIN_Y - 1, bottom: height - Math.ceil(3 + 29 * Math.max(0, core)),
        ceiling: WORLD_MAX_Y + 1, cover: Block.Cloudstone, name: "Skyreach", cave: core, damp: false,
      };
    }
    if (this.realm === "underdeep") {
      const floor = Math.floor(blend(34, 31 + this.field(x, z, 104, 193) * 35 + this.field(x, z, 23, 318) * 16, ramp(near, 6, 32)));
      return {
        y: floor, bottom: WORLD_MIN_Y, ceiling: 68 + Math.floor(this.field(x, z, 62, 269) * 22),
        cover: Block.Basalt, name: floor < 29 ? "Ember basin" : "Basalt galleries",
        cave: this.field(x, z, 45, 512) * 2, damp: floor < 29,
      };
    }
    const continental = this.field(x, z, 380, 11);
    const weirdness = this.field(x, z, 126, 41);
    const erosion = this.field(x, z, 70, 75);
    const temperature = this.field(x, z, 308, 99);
    const moisture = this.field(x, z, 211, 137);
    const depth = this.field(x, z, 37, 167);
    const mountain = Math.max(0, weirdness * 0.72 + continental * 0.30 - 0.046);
    const ordinary = 64 + continental * 43 + erosion * 13 + mountain * 64 + depth * 10;
    // A meadow path descends past the ruined arch toward a sheltered cove.
    const meadow = 71 + this.field(x, z, 33, 42) * 12 + Math.max(0, -z - 9) * 0.12;
    const field = blend(blend(71, meadow, ramp(near, 6, 12)), ordinary, ramp(near, 12, 80));
    const pathX = Math.sin((-z - 3) / 15) * 1.3;
    const pathGrade = ramp(-z, 5, 10) * (1 - ramp(-z, 37, 63)) * (1 - ramp(Math.abs(x - pathX), 4, 16));
    const pathHeight = 71 - ramp(-z, 6, 37) * 5;
    const cove = 1 - ramp(Math.hypot((x + 6) * 0.81, (z + 69) * 0.87), 13, 34);
    let height = blend(blend(field, pathHeight, pathGrade), 60 + continental * 9, cove);
    if (this.revised) {
      const eastRidge = 1 - ramp(Math.hypot((x - 24) * 0.75, (z + 43) * 0.92), 3, 29);
      const westRidge = 1 - ramp(Math.hypot((x + 39) * 0.80, (z + 66) * 0.70), 4, 35);
      height += (eastRidge * 43 + westRidge * 39) * (0.82 + depth * 0.65);
      const lake = 1 - ramp(Math.hypot((x + 25) * 0.88, (z + 37) * 1.10), 9, 21);
      height = blend(height, 57 + depth * 8, lake * (1 - pathGrade));
    }
    const y = Math.floor(height);
    const warm = temperature + weirdness * 0.15 > 0.19;
    const high = y > 94 - temperature * 18;
    const dry = warm && moisture < -0.045;
    const coastal = y <= WATERLINE + 2;
    const woodland = moisture + depth * 0.12 > 0.015 || near < 43;
    const onPath = -z >= 5 && -z <= 32 && Math.abs(x - pathX) < 1.4 + depth * 2;
    const alpine = this.revised && y >= 91 + depth * 9;
    const grove = this.revised && x < 11 && z < 5 && z > -57 && !coastal && !dry;
    const cover = alpine ? (y > 98 && depth > 0.13 ? Block.Frostglass : Block.Snow) :
      coastal || dry ? Block.Sand : onPath ? Block.Gravel : high ? Block.Stone :
      moisture > 0.22 && y < 75 ? Block.Moss : Block.Sod;
    const name = y < WATERLINE - 5 ? "Tidal shallows" : coastal ? "Sandy inlets" :
      alpine ? "Frostglass Ridge" : high ? "Pale ridges" : dry ? "Glass dunes" : grove ? "Silverbloom Grove" :
        woodland ? "Juniper basin" : "Amber steppe";
    return {
      y, bottom: WORLD_MIN_Y, ceiling: WORLD_MAX_Y + 1, cover, name, cave: depth * 2,
      damp: moisture + continental * 0.3 > 0.08,
    };
  }

  top(profile: Profile): number {
    if (this.realm === "surface") return Math.max(profile.y, WATERLINE);
    if (this.realm === "underdeep") return profile.ceiling + 10;
    return profile.y;
  }

  block(x: number, y: number, z: number, profile: Profile): number {
    if (y < profile.bottom || y > WORLD_MAX_Y) return Block.Air;
    if (this.realm === "skyreach") {
      if (y > profile.y) return Block.Air;
      if (y >= profile.y - 3) return Block.Cloudstone;
      return this.unit(x, z, 732, y) < 0.072 ? Block.Crystal : Block.Stone;
    }
    if (y === WORLD_MIN_Y) return Block.Bedrock;
    if (this.realm === "underdeep") {
      if (y >= profile.ceiling) {
        if (y > profile.ceiling + 10) return Block.Air;
        if (y > profile.ceiling + 8) return Block.Bedrock;
        return y === profile.ceiling && this.unit(x, z, 482, y) < 0.021 ? Block.Glowstone : Block.Basalt;
      }
      if (y > profile.y) {
        if (y <= 29) return Block.Ember;
        if (y >= profile.ceiling - 2 && this.density(x / 4, y / 9, z / 4, 491) > 0.71) return Block.Basalt;
        return Block.Air;
      }
      const ore = this.unit(x, z, 609, y);
      return ore < 0.021 ? Block.Crystal : ore > 0.984 ? Block.CopperOre : Block.Basalt;
    }
    if (y > profile.y) return y <= WATERLINE ? Block.Water : Block.Air;

    const ground = profile.y - y;
    if (ground <= 3) {
      if (ground === 0) return profile.cover;
      if (profile.cover === Block.Snow || profile.cover === Block.Frostglass) return Block.Stone;
      if (profile.cover === Block.Sand) return ground < 3 ? Block.Sand : Block.Sandstone;
      if (profile.cover === Block.Stone) return Block.Stone;
      return Block.Soil;
    }

    // The heightfield provides the terrain envelope. Two branching 3D density
    // fields carve chambers inside it and open lateral entrances along cliffs.
    const cavernY = 29 + profile.cave * 26;
    if (ground >= 4 && y > -54 && (Math.abs(y - cavernY) < 17 || Math.abs(y + 20 + profile.cave * 33) < 12)) {
      const field = this.density(x / 19, y / 12, z / 19, 522);
      if (field > 0.64 || (field > 0.44 && this.density(x / 11, y / 8, z / 11, 612) > 0.77)) {
        return y < -10 && profile.damp ? Block.Water : Block.Air;
      }
    }

    const ore = this.unit(x, z, 338, y);
    if (ore < (ground < 12 ? 0.053 : 0.021) && this.density(x / 8, y / 5, z / 8, 373) > 0.36) return Block.CopperOre;
    if (y < 12 && ore > 0.989) return Block.Glowstone;
    if (ground < 8 && ore > 0.962) return Block.Gravel;
    return y < -20 ? Block.Basalt : Block.Stone;
  }

  decorate(
    cx: number,
    cz: number,
    write: (x: number, y: number, z: number, block: number) => void,
  ): void {
    const minX = cx * CHUNK_SIZE, minZ = cz * CHUNK_SIZE;
    const maxX = minX + CHUNK_SIZE - 1, maxZ = minZ + CHUNK_SIZE - 1;
    const put = (x: number, y: number, z: number, block: number) => {
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) write(x, y, z, block);
    };
    if (this.realm === "underdeep") {
      for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
        if ((x * x + z * z) > 49 && this.unit(x, z, 729) < 0.014) {
          const ground = this.profile(x, z);
          if (ground.y >= 29) put(x, ground.y + 1, z, this.unit(x, z, 741) < 0.40 ? Block.Crystal : Block.Glowstone);
        }
      }
      return;
    }

    if (this.realm === "skyreach") {
      for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
        if ((x * x + z * z) > 43 && this.unit(x, z, 1222) < 0.013) {
          const ground = this.profile(x, z);
          if (ground.y >= 100) put(x, ground.y + 1, z, Block.Crystal);
        }
      }
      return;
    }

    for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
      if (Math.hypot(x, z) < 5 || this.unit(x, z, 1092) > 0.017) continue;
      const ground = this.profile(x, z);
      if (ground.y >= WATERLINE + 2 && (ground.cover === Block.Sod || ground.cover === Block.Moss)) {
        put(x, ground.y + 1, z, Block.BerryBush);
      }
    }
    const tree = (x: number, z: number, size: number) => {
      const ground = this.profile(x, z);
      if (ground.y <= WATERLINE || ground.cover === Block.Stone || ground.cover === Block.Sand) return;
      if (ground.cover === Block.Frostglass) return;
      const crown = ground.y + size;
      const lean = this.unit(x, z, 736) < 0.5 ? -1 : 1;
      if (this.revised) {
        const blossom = ground.name === "Silverbloom Grove" && this.unit(x, z, 824) > 0.24;
        const fir = !blossom && (ground.y > 77 || this.unit(x, z, 825) < 0.31);
        const leaf = blossom ? 3 : fir ? 4 : 5;
        const trunk = withState(Block.Timber, blossom ? 1 : fir ? 2 : 0);
        const top = crown + (fir ? 2 : 0);
        for (let dy = -3; dy <= 2; dy++) {
          const radius = fir ? (dy === 2 ? 0 : (dy & 1) === 0 ? 1 : dy === -3 ? 3 : 2) : [1, 2, 3, 3, 2, 0][dy + 3];
          const offset = blossom && dy >= -1 ? lean : 0;
          for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
            if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
            if ((dx || dz) && this.unit(x + dx, z + dz, 302, top + dy) < 0.14) continue;
            put(x + dx + offset, top + dy, z + dz, withState(Block.Leaves, leaf));
          }
        }
        for (let y = ground.y + 1; y <= top; y++) put(x, y, z, trunk);
        if (blossom) {
          put(x + lean, crown - 2, z, trunk);
          put(x + lean * 2, crown - 1, z, trunk);
          put(x, crown - 2, z + 1, trunk);
        }
        return;
      }
      for (let dy = -2; dy <= 2; dy++) {
        const radius = dy === 2 ? 0 : (dy === -2 || dy === 1 ? 1 : 2);
        const offset = dy >= 1 ? lean : 0;
        for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > radius + Number(dy === 0)) continue;
          const shade = this.unit(x + dx, z + dz, 302, crown + dy);
          if ((dx || dz) && shade < 0.10) continue;
          put(x + dx + offset, crown + dy, z + dz, withState(Block.Leaves, Math.floor(shade * 3)));
        }
      }
      for (let i = 1; i <= size; i++) put(x, ground.y + i, z, Block.Timber);
      put(x + lean, crown - 2, z, Block.Timber);
    };
    const cell = this.revised ? 7 : 8;
    const treeReach = this.revised ? 4 : 2;
    for (let gz = Math.floor((minZ - treeReach) / cell); gz <= Math.floor((maxZ + treeReach) / cell); gz++) {
      for (let gx = Math.floor((minX - treeReach) / cell); gx <= Math.floor((maxX + treeReach) / cell); gx++) {
        const x = gx * cell + 2 + Math.floor(this.unit(gx, gz, 709) * 4);
        const z = gz * cell + 2 + Math.floor(this.unit(gx, gz, 710) * 4);
        if (Math.hypot(x, z) < (this.revised ? 20 : 25) || this.revised && z > -30 && z < 0 && Math.abs(x) < 5) continue;
        if (this.field(x, z, 39, 808) + this.unit(gx, gz, 711) * 0.58 > (this.revised ? 0.22 : 0.30)) {
          tree(x, z, 4 + Math.floor(this.unit(x, z, 712) * 3));
        }
      }
    }
    for (const [x, z, size] of [[-10, -10, 5], [9, -13, 5], [-14, -19, 6], [6, -26, 4], [-14, 8, 4], [11, 10, 5]]) {
      if (x + treeReach >= minX && x - treeReach <= maxX && z + treeReach >= minZ && z - treeReach <= maxZ) tree(x, z, size);
    }

    const ruin = (x: number, z: number) => {
      if (x + 3 < minX || x - 3 > maxX || z + 3 < minZ || z - 3 > maxZ) return;
      const base = this.profile(x, z).y;
      if (base < WATERLINE + 3) return;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > 5) continue;
        const ground = this.profile(x + dx, z + dz).y;
        for (let y = Math.min(ground + 1, base); y <= base; y++) put(x + dx, y, z + dz, Block.Brick);
        if (ground > base) for (let y = base + 1; y <= Math.min(ground, base + 5); y++) put(x + dx, y, z + dz, Block.Air);
      }
      for (const side of [-1, 1]) {
        for (let y = 1; y <= 4; y++) put(x + side * 2, base + y, z, Block.Brick);
        put(x + side, base + 4, z, Block.Sandstone);
        put(x + side * 2, base + 4, z - 1, Block.Moss);
      }
      put(x, base + 4, z, Block.Glowstone);
    };
    ruin(1, -17);
    for (let rz = Math.floor((minZ - 9) / 64); rz <= Math.floor((maxZ + 9) / 64); rz++) {
      for (let rx = Math.floor((minX - 9) / 64); rx <= Math.floor((maxX + 9) / 64); rx++) {
        if (this.unit(rx, rz, 925) > 0.23) continue;
        const x = rx * 64 + 6 + Math.floor(this.unit(rx, rz, 926) * 50);
        const z = rz * 64 + 6 + Math.floor(this.unit(rx, rz, 927) * 50);
        if (Math.hypot(x, z) > 31) ruin(x, z);
      }
    }

    // A weathered fissure near the trail gives players a walkable way
    // into their first cavern, with a chamber tucked behind the bend.
    const mouthX = -9, mouthZ = -24;
    if (maxX >= mouthX - 6 && minX <= mouthX + 4 && maxZ >= mouthZ - 29 && minZ <= mouthZ + 1) {
      const lip = this.profile(mouthX, mouthZ + 1).y;
      if (lip > WATERLINE + 1) {
        for (let distance = 0; distance <= 24; distance++) {
          const center = mouthX - Math.floor(distance / 10);
          const z = mouthZ - distance;
          const floor = lip - Math.floor((distance + 1) / 2);
          for (let dx = -1; dx <= 1; dx++) {
            put(center + dx, floor, z, distance < 3 ? Block.Gravel : Block.Stone);
            for (let dy = 1; dy <= (distance < 5 ? 6 : 3); dy++) put(center + dx, floor + dy, z, Block.Air);
          }
        }
        const floor = lip - 12;
        for (let dz = -4; dz <= 1; dz++) for (let dx = -3; dx <= 4; dx++) {
          if (Math.abs(dx) + Math.abs(dz + 1) > 5) continue;
          const x = mouthX - 2 + dx, z = mouthZ - 24 + dz;
          const height = Math.abs(dx) + Math.abs(dz + 1) < 3 ? 5 : 3;
          put(x, floor, z, Block.Stone);
          for (let dy = 1; dy <= height; dy++) put(x, floor + dy, z, Block.Air);
          if (height === 3 && this.unit(x, z, 2512) < 0.18) put(x, floor + 1, z, Block.CopperOre);
        }
        put(mouthX - 4, floor + 3, mouthZ - 25, Block.Glowstone);
        put(mouthX - 7, lip + 1, mouthZ + 1, Block.Brick);
        put(mouthX + 2, lip + 1, mouthZ, Block.Glowstone);
      }
    }

    for (const [x, z] of [[-5, -4], [-6, -5], [5, -4], [6, -4]]) {
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
        const y = this.profile(x, z).y + 1;
        put(x, y, z, x < 0 ? Block.CopperOre : Block.Stone);
      }
    }
  }
}

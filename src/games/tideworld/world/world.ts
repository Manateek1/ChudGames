import { BLOCKS } from "./blocks";
import {
  cardinal,
  fullCube,
  UPPER_HALF,
  localBounds,
  upperHalf,
  masonryMaterial,
  isMasonryStep,
} from "./shapes";
export { localBounds } from "./shapes";
import { Generator, MAX_Y, MIN_Y, SEA_LEVEL, WORLD_EDGE, sectionAddress } from "./generation";
export interface Vec {
  x: number;
  y: number;
  z: number;
}
export interface Hit extends Vec {
  id: string;
  normal: Vec;
  point: Vec;
}
export interface Bounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}
type Systems = {
  fluid(x: number, y: number, z: number): number | undefined;
  lit(x: number, y: number, z: number): boolean;
};
export const cellKey = (x: number, y: number, z: number) => x + "," + y + "," + z;
const within = (n: number, a: number, b: number) => n >= a && n <= b;
interface Section {
  cells: Uint16Array;
  palette: string[];
  codes: Map<string, number>;
}
type Landmark = "survey_station" | "tide_mill" | "collapsed_quarry" | "crystal_observatory";
interface Features {
  wheels: Vec[];
  stashes: Map<number, Landmark>;
  states: Map<number, string>;
  maxY: Int16Array;
  minY: Int16Array;
}
export class VoxelWorld {
  readonly seed: string;
  readonly generator: Generator;
  readonly edits: Record<string, string>;
  readonly variants: Record<string, string> = Object.create(null);
  readonly facings: Record<string, number> = Object.create(null);
  readonly spawn: Vec;
  private updates = new Map<string, Set<string>>();
  private features = new Map<string, Features>();
  private sections = new Map<string, Section>();
  private ceilings = new Map<string, number>();
  private listeners = new Set<(x: number, y: number, z: number) => void>();
  private systems?: Systems;
  constructor(seed: string, edits: Record<string, string> = {}) {
    this.seed = seed;
    this.generator = new Generator(seed);
    this.edits = Object.assign(Object.create(null), edits);
    Object.keys(this.edits).forEach((key) => {
      const [x, y, z] = key.split(",").map(Number);
      this.trackChange(x, y, z);
    });
    this.spawn = { x: 0.5, y: this.height(0, 0) + 1.001, z: 0.5 };
  }
  bindSystems(systems: Systems) {
    this.systems = systems;
  }
  onDirty(fn: (x: number, y: number, z: number) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private trackChange(x: number, y: number, z: number) {
    const chunk = Math.floor(x / 16) + "," + Math.floor(z / 16),
      k = cellKey(x, y, z);
    let cells = this.updates.get(chunk);
    if (!cells) {
      cells = new Set();
      this.updates.set(chunk, cells);
    }
    cells.add(k);
  }
  *allChanges() {
    for (const cells of this.updates.values()) yield* cells;
  }
  *changedCellsNear(cx: number, cz: number) {
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let z = cz - 1; z <= cz + 1; z++) {
        const cells = this.updates.get(x + "," + z);
        if (cells) yield* cells;
      }
  }
  dirty(x: number, y: number, z: number) {
    const a = sectionAddress(x, y, z);
    if (a) {
      this.ceilings.delete(x + "," + z);
      const section = this.sections.get(a.cx + "," + a.sy + "," + a.cz);
      if (section) section.cells[a.index] = 65535;
    }
    this.trackChange(x, y, z);
    for (const fn of this.listeners) fn(x, y, z);
  }
  surface(x: number, z: number) {
    return this.height(x, z);
  }
  private wetlandFloor(x: number, z: number, h: number) {
    const gx = Math.floor(x / 24),
      gz = Math.floor(z / 24);
    const cx = gx * 24 + 12,
      cz = gz * 24 + 12;
    const d = ((x - cx) / 8) ** 2 + ((z - cz) / 9) ** 2;
    if (d >= 1) return h;
    const profile = this.generator.surface(cx, cz);
    if (profile.biome !== "lantern_fen" || this.generator.sample(491, gx, 0, gz) > 0.62) return h;
    return Math.min(h, profile.h - 1 - Math.floor(3 * (1 - d)));
  }
  height(x: number, z: number) {
    x = Math.floor(x);
    z = Math.floor(z);
    const s = this.generator.surface(x, z);
    const r = ((x - 10) / 5) ** 2 + ((z + 8) / 6) ** 2;
    if (r < 1) return Math.min(s.h, this.generator.surface(10, -8).h - 1 - Math.floor((1 - r) * 2));
    return s.biome === "lantern_fen" ? this.wetlandFloor(x, z, s.h) : s.h;
  }
  waterline(x: number, z: number) {
    const s = this.generator.surface(x, z);
    if (((x - 10) / 5) ** 2 + ((z + 8) / 6) ** 2 < 1) return this.generator.surface(10, -8).h - 1;
    if (s.biome === "lantern_fen" && this.wetlandFloor(x, z, s.h) < s.h)
      return this.generator.surface(Math.floor(x / 24) * 24 + 12, Math.floor(z / 24) * 24 + 12).h - 1;
    return SEA_LEVEL;
  }
  biome(x: number, z: number) {
    return this.generator.surface(Math.floor(x), Math.floor(z)).biome;
  }
  private featureColumn(cx: number, cz: number): Features {
    const key = cx + "," + cz,
      prior = this.features.get(key);
    if (prior) return prior;
    const wheels: Vec[] = [];
    const stashes = new Map<number, Landmark>(),
      states = new Map<number, string>(),
      maxY = new Int16Array(256).fill(MIN_Y),
      minY = new Int16Array(256).fill(MAX_Y);
    const set = (x: number, y: number, z: number, id: string) => {
      const lx = x - cx * 16,
        lz = z - cz * 16;
      if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16 || y < MIN_Y || y > MAX_Y) return;
      const i = lz * 16 + lx;
      if (id === "water_wheel") wheels.push({ x, y, z });
      states.set((y - MIN_Y) * 256 + i, id);
      maxY[i] = Math.max(maxY[i], y);
      minY[i] = Math.min(minY[i], y);
    };
    const stash = (x: number, y: number, z: number, kind: Landmark) => {
      if (Math.floor(x / 16) !== cx || Math.floor(z / 16) !== cz) return;
      set(x, y, z, "storage_drawer");
      stashes.set((y - MIN_Y) * 256 + (z & 15) * 16 + (x & 15), kind);
    };
    const tree = (x: number, y: number, z: number, h: number, pine: boolean) => {
      for (let yy = 1; yy <= h + 2; yy++) {
        const crown = pine ? Math.min(3, Math.floor((h + 3 - yy) * 0.59)) : yy <= h + 1 ? 2 : 1;
        if (yy < h - 2) continue;
        for (let dx = -crown; dx <= crown; dx++)
          for (let dz = -crown; dz <= crown; dz++) {
            if (Math.abs(dx) + Math.abs(dz) > crown + 1) continue;
            if (!pine && Math.abs(dx) === 2 && Math.abs(dz) === 1 && (x + z + dx + dz + yy) % 3 === 0)
              continue;
            set(x + dx, y + yy, z + dz, "foliage");
          }
      }
      for (let i = 1; i <= h; i++) set(x, y + i, z, pine ? "pine_log" : "alder_log");
    };
    const structure = (x: number, z: number, type: number) => {
      const y = this.height(x, z) + 1;
      if (type === 0) {
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++) {
            if (Math.abs(dx) === 2 && Math.abs(dz) === 2) {
              for (let yy = 0; yy < 4; yy++) set(x + dx, y + yy, z + dz, "alder_log");
            }
            set(x + dx, y + 4, z + dz, "clay_tile");
          }
        set(x, y, z, "marker_stand");
        stash(x - 1, y, z - 1, "survey_station");
      } else if (type === 1) {
        for (let i = -3; i <= 3; i++) {
          set(x + i, y, z + 1, "slate_brick");
          set(x + i, y, z - 1, "slate_brick");
          set(x + i, y - 1, z, "slate_brick");
        }
        set(x, y, z, "water_wheel");
        stash(x + 1, y, z + 2, "tide_mill");
        set(x + 2, y, z + 1, "timber_panel");
      } else if (type === 2) {
        for (let dx = -3; dx <= 3; dx++)
          for (let dz = -3; dz <= 3; dz++) {
            const depth = 1 + Math.min(3 - Math.abs(dx), 3 - Math.abs(dz));
            for (let j = 0; j < depth; j++) set(x + dx, y - 1 - j, z + dz, "air");
            set(x + dx, y - depth - 1, z + dz, (dx + dz) % 5 === 0 ? "ore_tin" : "slate");
          }
        stash(x, y - 3, z, "collapsed_quarry");
      } else {
        const floor = -33;
        for (let dx = -3; dx <= 3; dx++)
          for (let dz = -3; dz <= 3; dz++)
            for (let j = 0; j < 5; j++) {
              const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3;
              set(
                x + dx,
                floor + j,
                z + dz,
                j === 0 || j === 4 || (edge && !(dx === 0 && dz === 3)) ? "slate_brick" : "air",
              );
            }
        set(x, floor + 1, z, "quartz_cluster");
        stash(x + 1, floor + 1, z - 1, "crystal_observatory");
      }
    };
    for (let gx = cx * 2 - 1; gx <= cx * 2 + 2; gx++)
      for (let gz = cz * 2 - 1; gz <= cz * 2 + 2; gz++) {
        const x = gx * 8 + Math.floor(this.generator.sample(400, gx, 0, gz) * 8),
          z = gz * 8 + Math.floor(this.generator.sample(401, gx, 0, gz) * 8);
        const profile = this.generator.surface(x, z),
          y = this.height(x, z),
          p = this.generator.sample(402, gx, 0, gz);
        if ((Math.abs(x) < 4 && Math.abs(z) < 4) || (x > -13 && x < -3 && z > -22 && z < -10)) continue;
        if (y <= SEA_LEVEL - 2) {
          if (p < 0.38) set(x, y + 1, z, "kelp");
          continue;
        }
        if (y < profile.h && profile.biome !== "lantern_fen") continue;
        if (profile.biome === "lantern_fen") {
          // Reed clumps follow the rim of each depression. Every overlapping column replays its anchors.
          const poolX = Math.floor(x / 24) * 24 + 12,
            poolZ = Math.floor(z / 24) * 24 + 12;
          if (this.generator.sample(491, Math.floor(x / 24), 0, Math.floor(z / 24)) < 0.62) {
            const dx = x - poolX,
              dz = z - poolZ,
              dist = Math.max(1, Math.hypot(dx, dz));
            const ax = Math.round(poolX + (dx / dist) * 8),
              az = Math.round(poolZ + (dz / dist) * 9);
            for (let j = 0; j < 4; j++) {
              const xx = ax + (j & 1),
                zz = az + (j >> 1),
                yy = this.height(xx, zz) + 1;
              set(xx, yy, zz, "reed");
              if (j === 0) set(xx, yy + 1, zz, "reed");
            }
          }
        }
        const forest = profile.biome === "rainwood" || profile.biome === "frostwood";
        if (
          p < (forest ? 0.83 : 0.21) &&
          !["brine_bay", "salt_basin", "cinder_shelf", "storm_coast"].includes(profile.biome)
        ) {
          tree(
            x,
            y,
            z,
            4 + Math.floor(3 * this.generator.sample(403, gx, 0, gz)),
            profile.biome === "wind_ridge" ||
              profile.biome === "frostwood" ||
              profile.biome === "frost_crown",
          );
        } else if (p < 0.91) {
          const plant =
            profile.biome === "lantern_fen" || profile.biome === "storm_coast"
              ? "reed"
              : p > 0.78
                ? "grain_crop"
                : "brush";
          set(x, y + 1, z, plant);
        }
      }
    for (let rx = Math.floor((cx * 16 - 4) / 128); rx <= Math.floor((cx * 16 + 19) / 128); rx++)
      for (let rz = Math.floor((cz * 16 - 4) / 128); rz <= Math.floor((cz * 16 + 19) / 128); rz++) {
        const x = rx * 128 + 10 + Math.floor(108 * this.generator.sample(450, rx, 0, rz)),
          z = rz * 128 + 10 + Math.floor(108 * this.generator.sample(451, rx, 0, rz));
        if (this.height(x, z) < SEA_LEVEL) continue;
        const choice = this.generator.sample(452, rx, 0, rz);
        structure(x, z, choice < 0.43 ? 0 : choice < 0.59 ? 1 : choice < 0.91 ? 2 : 3);
      }
    if (Math.abs(cx) <= 2 && Math.abs(cz) <= 3) {
      structure(-10, -13, 0);
      if (cx >= -1 && cx <= 0 && cz >= -3 && cz <= -2) {
        const floor = this.quarryFloor();
        for (let x = -11; x <= -3; x++)
          for (let z = -37; z <= -29; z++) {
            const rim = Math.min(x + 11, -3 - x, z + 37, -29 - z),
              shelf = floor + Math.max(0, 2 - rim);
            for (let y = shelf + 1; y <= this.height(x, z) + 6; y++) set(x, y, z, "air");
            const ore =
              x === -8 && z >= -35 && z <= -32
                ? "ore_copper"
                : x === -6 && z >= -35 && z <= -32
                  ? "ore_tin"
                  : x >= -9 && x <= -7
                    ? "basalt"
                    : "slate";
            set(x, shelf, z, ore);
          }
        stash(-4, floor + 2, -34, "collapsed_quarry");
      }
      const entryY = this.height(-5, -13) - 1;
      for (let z = -13; z >= -29; z--) {
        const d = (-z - 13) / 16,
          floor = Math.round(entryY + (this.quarryFloor() + 2 - entryY) * d);
        const center = -5 + Math.round(Math.sin(d * Math.PI) * 1.4);
        for (let x = center - 1; x <= center + 1; x++) {
          set(x, floor, z, "slate");
          for (let y = floor + 1; y <= floor + 4; y++) set(x, y, z, "air");
        }
      }
      for (let x = 4; x <= 6; x++) for (let z = -9; z <= -6; z++) set(x, this.height(x, z), z, "red_clay");
      tree(-5, this.height(-5, 1), 1, 5, false);
      for (const [x, z, id] of [
        [2, -3, "brush"],
        [1, -4, "brush"],
        [-2, -3, "brush"],
        [6, -7, "reed"],
        [7, -5, "reed"],
        [9, -2, "reed"],
        [5, -8, "red_clay"],
        [5, -7, "red_clay"],
        [4, -5, "grain_crop"],
        [-4, -9, "brush"],
      ] as const)
        set(x, this.height(x, z) + (id === "red_clay" ? 0 : 1), z, id);
    }
    const out = { states, maxY, minY, stashes, wheels };
    if (this.features.size > 1024) this.features.clear();
    this.features.set(key, out);
    return out;
  }
  millWheels(cx: number, cz: number) {
    return this.featureColumn(cx, cz).wheels;
  }
  quarryFloor() {
    return Math.min(53, this.height(-7, -33) - 4, this.height(-5, -13) - 11);
  }
  generatedStashKind(x: number, y: number, z: number): Landmark | undefined {
    if (this.edits[cellKey(x, y, z)] !== undefined || this.get(x, y, z) !== "storage_drawer") return;
    return this.featureColumn(Math.floor(x / 16), Math.floor(z / 16)).stashes.get(
      (y - MIN_Y) * 256 + (z & 15) * 16 + (x & 15),
    );
  }
  featureRange(x: number, z: number) {
    const cx = Math.floor(x / 16),
      cz = Math.floor(z / 16),
      f = this.featureColumn(cx, cz),
      i = (z - cz * 16) * 16 + x - cx * 16;
    return { min: f.minY[i], max: f.maxY[i] };
  }
  get(x: number, y: number, z: number): string {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (y <= MIN_Y + 1 || Math.abs(x) > WORLD_EDGE || Math.abs(z) > WORLD_EDGE) return "foundation";
    if (y > MAX_Y) return "air";
    const cx = Math.floor(x / 16),
      sy = Math.floor((y - MIN_Y) / 32),
      cz = Math.floor(z / 16),
      k = cx + "," + sy + "," + cz;
    let section = this.sections.get(k);
    if (!section) {
      // 65,535 marks an unmaterialized entry. Reading a growing stream of columns uses bounded memory.
      section = { cells: new Uint16Array(8192).fill(65535), palette: [], codes: new Map() };
      if (this.sections.size >= 384) this.sections.delete(this.sections.keys().next().value!);
      this.sections.set(k, section);
    }
    const index = (((y - MIN_Y) & 31) * 16 + (z & 15)) * 16 + (x & 15),
      code = section.cells[index];
    if (code !== 65535) return section.palette[code];
    const id = this.baseCell(x, y, z);
    let paletteIndex = section.codes.get(id);
    if (paletteIndex === undefined) {
      paletteIndex = section.palette.length;
      section.palette.push(id);
      section.codes.set(id, paletteIndex);
    }
    section.cells[index] = paletteIndex;
    return id;
  }
  private baseCell(x: number, y: number, z: number): string {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    if (Math.abs(x) > WORLD_EDGE || Math.abs(z) > WORLD_EDGE || y <= MIN_Y + 1) return "foundation";
    if (y > MAX_Y) return "air";
    const edited = this.edits[cellKey(x, y, z)];
    if (edited !== undefined) return Object.hasOwn(BLOCKS, edited) ? edited : "slate_brick";
    const cx = Math.floor(x / 16),
      cz = Math.floor(z / 16),
      i = (z - cz * 16) * 16 + x - cx * 16,
      f = this.featureColumn(cx, cz);
    if (y >= f.minY[i] && y <= f.maxY[i]) {
      const code = f.states.get((y - MIN_Y) * 256 + i);
      if (code !== undefined) return code;
    }
    const h = this.height(x, z);
    if (y > h) return "air";
    const s = this.generator.surface(x, z);
    if (this.generator.carved(x, y, z, s)) {
      if (
        y < -22 &&
        (x + z) % 4 === 0 &&
        (y & 3) === 0 &&
        this.generator.caveBiome(x, y, z, s) === "crystal_fault" &&
        this.generator.sample(351, Math.floor(x / 4), Math.floor(y / 4), Math.floor(z / 4)) < 0.07 &&
        !this.generator.carved(x, y - 1, z, s)
      )
        return "quartz_cluster";
      if (
        y < -56 &&
        (x & 7) === 0 &&
        (z & 7) === 0 &&
        this.generator.caveBiome(x, y, z, s) === "thermal_hollows" &&
        !this.generator.carved(x, y - 1, z, s)
      )
        return "geothermal_grate";
      if (
        s.h - y < 24 &&
        (s.biome === "rainwood" || s.biome === "lantern_fen") &&
        ((x * 17 + y * 13 + z * 7) & 31) === 0 &&
        !this.generator.carved(x, y - 1, z, s)
      )
        return "fungus";
      return "air";
    }
    if (y === h) return h < s.h ? "red_clay" : s.material;
    if (y >= h - 2)
      return s.material === "snow_crust" ? "slate" : s.material === "salt_crust" ? "sand" : s.material;
    return this.generator.ore(x, y, z) ?? (y <= -40 ? "basalt" : "slate");
  }
  isSolid(x: number, y: number, z: number) {
    return BLOCKS[this.get(x, y, z)]?.solid ?? false;
  }
  fenceConnections(x: number, y: number, z: number) {
    let mask = 0;
    for (let side = 0; side < 4; side++) {
      const [dx, dz] = cardinal[side];
      const neighbor = this.get(x + dx, y, z + dz);
      const block = BLOCKS[neighbor];
      if (neighbor === "fence_section" || neighbor === "gate" || (block?.shape === "cube" && block.solid))
        mask |= 1 << side;
    }
    return mask;
  }
  shape(
    x: number,
    y: number,
    z: number,
    id: string,
    mode: "visual" | "collision" = "visual",
  ): readonly Bounds[] {
    if (id !== "air" && BLOCKS[id]?.shape === "cube") return fullCube;
    const key = cellKey(x, y, z);
    const facing = this.facings[key] ?? 0;
    const variant = this.variants[key];
    let connections = 0;
    if (id === "fence_section") connections = this.fenceConnections(x, y, z);
    if (id === "stair_step" && mode === "visual") {
      for (const [bit, dir] of [
        [1, 3],
        [2, 1],
      ]) {
        const side = (dir + facing) & 3;
        const [dx, dz] = cardinal[side];
        if (this.get(x + dx, y, z + dz) !== id) continue;
        const neighbor = cellKey(x + dx, y, z + dz);
        const other = this.facings[neighbor] ?? 0;
        if (
          (facing ^ other) & 1 &&
          upperHalf(facing, variant) === upperHalf(other, this.variants[neighbor]) &&
          masonryMaterial(variant) === masonryMaterial(this.variants[neighbor])
        )
          connections |= bit;
      }
    }
    return localBounds(id, facing, variant, connections, mode);
  }
  bounds(x: number, y: number, z: number): readonly Bounds[] {
    const id = this.get(x, y, z);
    const own = BLOCKS[id]?.solid ? this.shape(x, y, z, id, "collision") : [];
    // Broad-phase movement visits the cell containing the feet, including the air just above a fence.
    if (BLOCKS[id]?.shape !== "cube" || !BLOCKS[id]?.solid) {
      if (this.get(x, y - 1, z) === "fence_section") {
        const cap = localBounds("fence_section", 0, "", this.fenceConnections(x, y - 1, z), "cap");
        return own.length ? [...own, ...cap] : cap;
      }
    }
    return own;
  }
  set(x: number, y: number, z: number, id: string) {
    if (!Object.hasOwn(BLOCKS, id) || !sectionAddress(x, y, z) || y <= MIN_Y + 1 || id === "foundation")
      return false;
    const key = cellKey(x, y, z);
    if (this.get(x, y, z) === id) return true;
    this.edits[key] = id;
    delete this.variants[key];
    delete this.facings[key];
    this.dirty(x, y, z);
    return true;
  }
  setVariant(x: number, y: number, z: number, variant: string) {
    const key = cellKey(x, y, z);
    const prior = this.variants[key];
    if ((prior === "upper" || prior === "inverted") && isMasonryStep(this.get(x, y, z))) {
      this.facings[key] = (this.facings[key] ?? 0) | UPPER_HALF;
    }
    this.variants[key] = variant;
    this.dirty(x, y, z);
  }
  setFacing(x: number, y: number, z: number, quarterTurns: number) {
    this.facings[cellKey(x, y, z)] = quarterTurns & (isMasonryStep(this.get(x, y, z)) ? 7 : 3);
    this.dirty(x, y, z);
  }
  skyCeiling(x: number, z: number) {
    const k = x + "," + z,
      prior = this.ceilings.get(k);
    if (prior !== undefined) return prior;
    let h = Math.max(this.height(x, z), this.featureRange(x, z).max);
    const updates = this.updates.get(Math.floor(x / 16) + "," + Math.floor(z / 16));
    if (updates)
      for (const key of updates) {
        const [xx, yy, zz] = key.split(",").map(Number);
        if (x === xx && z === zz && yy > h && BLOCKS[this.get(x, yy, z)]?.opaque) h = yy;
      }
    while (h > MIN_Y + 1 && !BLOCKS[this.get(x, h, z)]?.opaque) h--;
    if (this.ceilings.size > 16384) this.ceilings.clear();
    this.ceilings.set(k, h);
    return h;
  }
  fluid(x: number, y: number, z: number) {
    const h = this.height(x, z);
    if (y <= h || y > this.waterline(x, z)) return 0;
    return BLOCKS[this.get(x, y, z)]?.solid ? 0 : 8;
  }
  renderFluid(x: number, y: number, z: number) {
    return this.systems?.fluid(x, y, z) ?? this.fluid(x, y, z);
  }
  lit(x: number, y: number, z: number) {
    return this.systems?.lit(x, y, z) ?? false;
  }
  raycast(origin: Vec, direction: Vec, reach = 5.5): Hit | null {
    const len = Math.hypot(direction.x, direction.y, direction.z);
    if (!len) return null;
    const d = [direction.x / len, direction.y / len, direction.z / len],
      o = [origin.x, origin.y, origin.z],
      p = o.map(Math.floor);
    const step = d.map(Math.sign),
      delta = d.map((v) => (v === 0 ? Infinity : Math.abs(1 / v)));
    const next = d.map((v, i) => (v === 0 ? Infinity : (p[i] + Number(v > 0) - o[i]) / v));
    let traveled = 0;
    while (traveled <= reach) {
      const [x, y, z] = p,
        id = this.get(x, y, z);
      if (id !== "air") {
        let closest = Infinity,
          normal: Vec = { x: 0, y: 0, z: 0 };
        for (const bounds of this.shape(x, y, z, id)) {
          const lo = [bounds.minX, bounds.minY, bounds.minZ],
            hi = [bounds.maxX, bounds.maxY, bounds.maxZ];
          let enter = -Infinity,
            exit = Infinity,
            axis = 0;
          for (let i = 0; i < 3; i++) {
            if (d[i] === 0) {
              if (!within(o[i] - p[i], lo[i], hi[i])) {
                exit = -Infinity;
                break;
              }
              continue;
            }
            const a = (p[i] + lo[i] - o[i]) / d[i],
              b = (p[i] + hi[i] - o[i]) / d[i];
            const t = Math.min(a, b);
            if (t > enter) {
              enter = t;
              axis = i;
            }
            exit = Math.min(exit, Math.max(a, b));
          }
          if (exit >= Math.max(enter, 0) && enter <= reach && enter < closest) {
            closest = enter;
            normal = {
              x: axis === 0 ? -step[0] : 0,
              y: axis === 1 ? -step[1] : 0,
              z: axis === 2 ? -step[2] : 0,
            };
          }
        }
        if (closest !== Infinity) {
          const distance = Math.max(0, closest);
          return {
            x,
            y,
            z,
            id,
            normal,
            point: { x: o[0] + d[0] * distance, y: o[1] + d[1] * distance, z: o[2] + d[2] * distance },
          };
        }
      }
      const axis = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
      traveled = next[axis];
      next[axis] += delta[axis];
      p[axis] += step[axis];
    }
    return null;
  }
}

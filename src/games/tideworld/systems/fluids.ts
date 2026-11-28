import { ahead, faceOffset, fromKey, key, type Face, type Pos, type SystemWorld } from "./worldTypes";

export interface Liquid {
  kind: "water" | "brine";
  level: number;
}
export interface FluidSave {
  cells: [string, Liquid][];
  frontier: string[];
  credit: number;
  exchange?: number;
}
export interface Pump extends Pos {
  face: Face;
}
const openBlocks = new Set(["air", "kelp", "reed", "wire", "ladder", "water_wheel", "grain_crop", "fungus"]);
const pos = (x: number, y: number, z: number) => ({ x, y, z });
export class Fluids {
  private cells: Map<string, Liquid>;
  private frontier: Set<string>;
  private credit: number;
  exchange: number;
  private discovered = new Map<string, Pos>();
  private focusColumn = "";
  private survey = 0;
  constructor(saved?: FluidSave) {
    this.cells = new Map(saved?.cells);
    this.frontier = new Set(saved?.frontier);
    this.credit = saved?.credit ?? 0;
    this.exchange = saved?.exchange ?? 0;
  }
  peek(x: number, y: number, z: number) {
    return this.cells.get(x + "," + y + "," + z);
  }
  read(w: SystemWorld, p: Pos): Liquid {
    const c = this.peek(p.x, p.y, p.z);
    if (c) return c;
    const level = w.fluid?.(p.x, p.y, p.z) ?? 0;
    return {
      level,
      kind: level && ["brine_bay", "storm_coast"].includes(w.biome(p.x, p.z)) ? "brine" : "water",
    };
  }
  public open(w: SystemWorld, p: Pos, valve?: (p: Pos) => boolean) {
    if (p.y < -96 || p.y > 223) return false;
    const id = w.get(p.x, p.y, p.z);
    return openBlocks.has(id) || (id === "sluice" && !!valve?.(p));
  }
  touch(p: Pos) {
    this.frontier.add(key(p));
    this.frontier.add(key({ ...p, y: p.y + 1 }));
    this.frontier.add(key({ ...p, y: p.y - 1 }));
    for (const [dx, dz] of faceOffset) this.frontier.add(key(pos(p.x + dx, p.y, p.z + dz)));
  }
  set(w: SystemWorld, p: Pos, value: Liquid) {
    this.cells.set(key(p), { level: Math.min(8, Math.max(0, Math.trunc(value.level))), kind: value.kind });
    this.touch(p);
    w.dirty?.(p.x, p.y, p.z);
  }
  displace(w: SystemWorld, p: Pos) {
    const fluid = this.read(w, p);
    if (!fluid.level) return true;
    let left = fluid.level;
    const reservations: { p: Pos; v: Liquid }[] = [];
    for (const target of [
      { ...p, y: p.y - 1 },
      ...faceOffset.map(([x, z]) => pos(p.x + x, p.y, p.z + z)),
      { ...p, y: p.y + 1 },
    ]) {
      if (!this.open(w, target)) continue;
      const old = this.read(w, target),
        n = Math.min(left, 8 - old.level);
      if (!n) continue;
      reservations.push({
        p: target,
        v: { level: old.level + n, kind: old.level && old.kind === "brine" ? "brine" : fluid.kind },
      });
      if ((left -= n) === 0) break;
    }
    if (left) return false;
    reservations.forEach((r) => this.set(w, r.p, r.v));
    this.set(w, p, { ...fluid, level: 0 });
    return true;
  }
  // Exchange only tagged source cells with the environment. Player-dug inland reservoirs always conserve volume.
  replenish(w: SystemWorld, focus: Pos, tick: number, raining: boolean) {
    const cx = Math.floor(focus.x / 16),
      cz = Math.floor(focus.z / 16),
      region = cx + "," + cz;
    if (region !== this.focusColumn) {
      this.focusColumn = region;
      this.survey = 0;
      this.discovered.clear();
    }
    if (this.survey < 25) {
      const i = this.survey++,
        x = (cx + (i % 5) - 2) * 16 + 8,
        z = (cz + Math.floor(i / 5) - 2) * 16 + 8;
      const h = w.surface(x, z),
        biome = w.biome(x, z);
      if (biome === "brine_bay" && h <= 39)
        for (let y = 43; y <= 45; y++) {
          const p = { x, y, z };
          this.discovered.set(key(p), p);
        }
      // Storm catchments are low spots joined to an existing natural surface pool.
      if (biome === "lantern_fen" && h <= 44 && h >= 41) {
        const p = { x, y: h + 1, z };
        this.discovered.set(key(p), p);
      }
      if (i === 0 && Math.abs(cx) < 4 && Math.abs(cz) < 4) {
        const x = 10,
          z = -8,
          y = w.surface(x, z) + 1;
        if ((w.fluid?.(x, y, z) ?? 0) > 0) this.discovered.set(key({ x, y, z }), { x, y, z });
      }
    }
    const tide = 44 + Math.sin((tick * Math.PI * 2) / 21600);
    for (const p of this.discovered.values()) {
      if (!this.open(w, p)) continue;
      const spring = p.x === 10 && p.z === -8,
        bay = !spring && w.biome(p.x, p.z) === "brine_bay";
      if (!spring && !bay && !raining) continue;
      const old = this.read(w, p);
      const want = bay ? Math.min(8, Math.max(0, Math.round((tide - p.y + 1) * 8))) : 8;
      if (old.level === want) continue;
      const delta = Math.sign(want - old.level);
      this.set(w, p, { kind: bay ? "brine" : old.level ? old.kind : "water", level: old.level + delta });
      this.exchange += delta;
    }
  }
  step(w: SystemWorld, pumps: Pump[], valve: (p: Pos) => boolean, focus: Pos) {
    if ((this.credit += 8) < 30) return null;
    this.credit -= 30;
    const live: string[] = [];
    for (const k of this.frontier) {
      const p = fromKey(k);
      if (Math.abs(p.x - focus.x) > 80 || Math.abs(p.z - focus.z) > 80) continue;
      live.push(k);
      if (live.length >= 380) break;
    }
    for (const k of live) this.frontier.delete(k);
    live.sort();
    const outgoing = new Map<string, number>(),
      incoming = new Map<string, number>(),
      brine = new Set<string>();
    const old = new Map<string, Liquid>();
    const read = (p: Pos) => {
      const k = key(p);
      let f = old.get(k);
      if (!f) {
        f = this.read(w, p);
        old.set(k, f);
      }
      return f;
    };
    const transfer = (a: Pos, b: Pos, max: number) => {
      if (!this.open(w, b, valve)) return 0;
      const ak = key(a),
        bk = key(b),
        fa = read(a),
        fb = read(b);
      const used = outgoing.get(ak) ?? 0,
        added = incoming.get(bk) ?? 0;
      const n = Math.min(max, fa.level - used, 8 - fb.level - added);
      if (n <= 0) return 0;
      outgoing.set(ak, used + n);
      incoming.set(bk, added + n);
      if (fa.kind === "brine") brine.add(bk);
      return n;
    };
    for (const k of live) {
      const p = fromKey(k);
      if (read(p).level && this.open(w, p, valve)) transfer(p, { ...p, y: p.y - 1 }, 8);
    }
    for (const p of pumps) transfer(ahead(p, p.face, -1), ahead(p, p.face), 2);
    for (const k of live) {
      const p = fromKey(k),
        f = read(p);
      if (!f.level || !this.open(w, p, valve)) continue;
      for (const [dx, dz] of faceOffset) {
        const b = pos(p.x + dx, p.y, p.z + dz);
        if (f.level - (outgoing.get(k) ?? 0) > read(b).level + (incoming.get(key(b)) ?? 0) + 1)
          transfer(p, b, 1);
      }
    }
    for (const k of new Set([...outgoing.keys(), ...incoming.keys()])) {
      const orig = old.get(k)!;
      const level = orig.level - (outgoing.get(k) ?? 0) + (incoming.get(k) ?? 0);
      this.set(w, fromKey(k), { level, kind: brine.has(k) ? "brine" : orig.kind });
    }
    return outgoing;
  }
  save(): FluidSave {
    return {
      cells: Array.from(this.cells, ([k, f]) => [k, { ...f }]),
      frontier: [...this.frontier],
      credit: this.credit,
      exchange: this.exchange,
    };
  }
}

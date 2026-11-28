import { ahead, key, fromKey, faceOffset, type Pos, type Face, type Actor } from "./worldTypes";
import type { Fluids } from "./fluids";
import type { SystemWorld } from "./worldTypes";

export const deviceIds = new Set([
  "switch",
  "wire",
  "relay",
  "timer",
  "sensor",
  "pump",
  "water_wheel",
  "lamp",
  "sluice",
  "gate",
  "lift_platform",
]);
export type Sense = "depth" | "light" | "container" | "entity";
export interface Device {
  id: string;
  face: Face;
  enabled: boolean;
  powered: boolean;
  high: boolean;
  delay: number;
  period: number;
  invert: boolean;
  sense: Sense;
  threshold: number;
  transitions: boolean[];
  flow: number;
  overLimit: boolean;
  lift?: number;
  liftTicks?: number;
  counter?: number;
}
export const makeDevice = (id: string, face: Face = 0): Device => ({
  id,
  face,
  enabled: false,
  powered: false,
  high: false,
  delay: 3,
  period: 30,
  invert: false,
  sense: "depth",
  threshold: 6,
  transitions: [],
  flow: 0,
  overLimit: false,
});
type Network = { wires: string[]; sources: Set<string>; sinks: Set<string>; overflow: boolean };
export class Devices {
  private cells: Map<string, Device>;
  private nets: Network[] = [];
  private dirty = true;
  constructor(saved?: [string, Device][]) {
    this.cells = new Map(saved);
  }
  at(p: Pos) {
    const direct = this.cells.get(key(p));
    if (direct) return direct;
    for (const [k, d] of this.cells)
      if (d.id === "lift_platform" && d.lift) {
        const base = fromKey(k);
        if (base.x === p.x && base.z === p.z && base.y + d.lift === p.y) return d;
      }
  }
  entries() {
    return this.cells.entries();
  }
  edit(p: Pos, id: string, face: Face = 0) {
    if (id === "air") {
      for (const [k, d] of this.cells)
        if (d.id === "lift_platform" && d.lift) {
          const base = fromKey(k);
          if (base.x === p.x && base.z === p.z && base.y + d.lift === p.y) this.cells.delete(k);
        }
    }
    if (deviceIds.has(id)) this.cells.set(key(p), makeDevice(id, face));
    else this.cells.delete(key(p));
    this.dirty = true;
  }
  configure(
    p: Pos,
    settings: Partial<Pick<Device, "face" | "invert" | "delay" | "period" | "sense" | "threshold">>,
  ) {
    const d = this.at(p);
    if (!d) return false;
    Object.assign(d, settings);
    d.delay = Math.min(30, Math.max(1, Math.trunc(d.delay)));
    d.period = Math.min(300, Math.max(15, Math.trunc(d.period)));
    d.face = (((d.face % 4) + 4) % 4) as Face;
    d.transitions = [];
    this.dirty = true;
    return true;
  }
  private reaches(src: string, dst: string, output: boolean) {
    const d = this.cells.get(src);
    if (!d) return false;
    if (d.id === "wire") return true;
    const generators = ["switch", "water_wheel", "relay", "timer", "sensor"];
    if (output && !generators.includes(d.id)) return false;
    if (!output && ["switch", "water_wheel", "sensor"].includes(d.id)) return false;
    const source = fromKey(src),
      dest = fromKey(dst);
    if (source.y !== dest.y) return d.id === "relay" && dest.y === source.y + (output ? 1 : -1);
    if (d.id === "switch" || d.id === "water_wheel") return true;
    return key(ahead(fromKey(src), d.face, output ? 1 : -1)) === dst;
  }
  connectionMask(p: Pos) {
    const k = key(p);
    return faceOffset.reduce((mask, [dx, dz], i) => {
      const other = key({ x: p.x + dx, y: p.y, z: p.z + dz });
      return (this.reaches(k, other, true) && this.reaches(other, k, false)) ||
        (this.reaches(other, k, true) && this.reaches(k, other, false))
        ? mask | (1 << i)
        : mask;
    }, 0);
  }
  private rebuild() {
    this.nets = [];
    const seen = new Set<string>();
    const links = (k: string) => {
      const p = fromKey(k);
      return [
        ...faceOffset.map(([x, z]) => key({ x: p.x + x, y: p.y, z: p.z + z })),
        key({ ...p, y: p.y + 1 }),
        key({ ...p, y: p.y - 1 }),
      ];
    };
    for (const d of this.cells.values()) d.overLimit = false;
    for (const [k, d] of this.cells) {
      if (d.id !== "wire" || seen.has(k)) continue;
      const net: Network = { wires: [k], sources: new Set(), sinks: new Set(), overflow: false };
      seen.add(k);
      for (let i = 0; i < net.wires.length; i++)
        for (const n of links(net.wires[i])) {
          const next = this.cells.get(n);
          if (!next) continue;
          if (next.id === "wire") {
            if (fromKey(n).y !== fromKey(net.wires[i]).y) continue;
            if (!seen.has(n)) {
              seen.add(n);
              net.wires.push(n);
            }
            continue;
          }
          if (this.reaches(n, net.wires[i], true)) net.sources.add(n);
          if (this.reaches(n, net.wires[i], false)) net.sinks.add(n);
        }
      net.overflow = net.wires.length > 256;
      if (net.overflow)
        for (const p of [...net.wires, ...net.sources, ...net.sinks])
          this.cells.get(p)!.overLimit = true;
      this.nets.push(net);
    }
    for (const [k, d] of this.cells) {
      if (d.id === "wire") continue;
      for (const n of links(k)) {
        const next = this.cells.get(n);
        if (!next || next.id === "wire" || !this.reaches(k, n, true) || !this.reaches(n, k, false))
          continue;
        this.nets.push({ wires: [], sources: new Set([k]), sinks: new Set([n]), overflow: false });
      }
    }
    this.dirty = false;
  }
  tick(w: SystemWorld, fluids: Fluids, _tick: number, sense: (d: Device, p: Pos) => number) {
    if (this.dirty) this.rebuild();
    const input = new Set<string>();
    for (const net of this.nets) {
      const high = !net.overflow && [...net.sources].some((k) => this.cells.get(k)?.high);
      if (high) for (const k of net.sinks) input.add(k);
      for (const k of net.wires) this.cells.get(k)!.powered = high;
    }
    for (const [k, d] of this.cells) {
      if (d.id === "wire") continue;
      const prior = d.powered,
        oldHigh = d.high;
      d.powered = input.has(k);
      switch (d.id) {
        case "switch":
          d.high = d.enabled;
          break;
        case "water_wheel":
          break;
        case "relay":
          d.transitions.push(d.invert ? !d.powered : d.powered);
          if (d.transitions.length >= d.delay) d.high = d.transitions.shift()!;
          break;
        case "timer":
          d.counter = d.powered ? (d.counter ?? 0) + 1 : 0;
          d.high = d.counter >= d.period;
          if (d.high) d.counter = 0;
          break;
        case "sensor": {
          const p = ahead(fromKey(k), d.face, -1);
          const value = d.sense === "depth" ? fluids.read(w, p).level : sense(d, p);
          d.high = value >= d.threshold;
          break;
        }
        default:
          d.high = d.powered || ((d.id === "gate" || d.id === "sluice") && d.enabled);
          break;
      }
      if (d.id === "gate" && oldHigh && !d.high && w.occupied?.(fromKey(k))) d.high = true;
      if (d.high !== oldHigh || prior !== d.powered) {
        const p = fromKey(k);
        w.dirty?.(p.x, p.y, p.z);
        if (d.id === "sluice") fluids.touch(p);
        if (d.id === "gate" || d.id === "sluice")
          w.setVariant?.(p.x, p.y, p.z, d.high ? "open" : "closed");
      }
    }
  }
  moveLifts(w: SystemWorld, actor: Actor) {
    for (const [k, d] of this.cells) {
      if (d.id !== "lift_platform") continue;
      const base = fromKey(k),
        offset = d.lift ?? 0,
        car = { ...base, y: base.y + offset };
      const direction = d.powered ? 1 : -1;
      if ((direction > 0 && offset === 8) || (direction < 0 && offset === 0)) {
        d.liftTicks = 0;
        continue;
      }
      const next = { ...car, y: car.y + direction },
        guide = ahead(car, d.face),
        nextGuide = ahead(next, d.face);
      if (
        w.get(guide.x, guide.y, guide.z) !== "anchor" ||
        w.get(nextGuide.x, nextGuide.y, nextGuide.z) !== "anchor" ||
        w.get(next.x, next.y, next.z) !== "air"
      ) {
        d.liftTicks = 0;
        continue;
      }
      const passenger =
        actor.x >= car.x - 0.12 &&
        actor.x < car.x + 1.12 &&
        actor.z >= car.z - 0.12 &&
        actor.z < car.z + 1.12 &&
        Math.abs(actor.y - (car.y + 0.5)) < 0.17;
      if (passenger && direction > 0 && w.get(next.x, next.y + 2, next.z) !== "air") {
        d.liftTicks = 0;
        continue;
      }
      d.liftTicks = (d.liftTicks ?? 0) + 1;
      if (d.liftTicks < 30) continue;
      d.liftTicks = 0;
      if (w.set(next.x, next.y, next.z, "lift_platform") === false) continue;
      w.set(car.x, car.y, car.z, "air");
      d.lift = offset + direction;
      if (passenger) actor.y += direction;
    }
  }
  flow(w: SystemWorld, fluids: Fluids, focus: Pos, tick = 0, raining = false) {
    const pumps = [...this.cells]
      .filter(([, d]) => d.id === "pump" && d.powered)
      .map(([k, d]) => ({ ...fromKey(k), face: d.face }));
    const changes = fluids.step(w, pumps, (p) => this.at(p)?.high === true, focus);
    if (!changes) return;
    fluids.replenish(w, focus, tick, raining);
    for (const [k, d] of this.cells)
      if (d.id === "water_wheel") {
        const active = (changes.get(key(ahead(fromKey(k), d.face))) ?? 0) > 0;
        d.flow = active ? Math.min(3, Math.max(0, d.flow) + 1) : Math.max(-3, Math.min(0, d.flow) - 1);
        if (Math.abs(d.flow) === 3) d.high = active;
      }
  }
  save(): [string, Device][] {
    return Array.from(this.cells, ([k, d]) => [k, { ...d, transitions: [...d.transitions] }]);
  }
}

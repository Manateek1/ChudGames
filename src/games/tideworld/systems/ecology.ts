import { BLOCKS } from "../world/blocks";
import { ITEMS, canHarvest, makeStack, type Stack, type Processor } from "./catalog";
import { Inventory, STORAGE } from "./inventory";
import { Devices, deviceIds } from "./devices";
import { Fluids } from "./fluids";
import { Population, type Creature, type Payload } from "./creatures";
import { Transport } from "./transport";
import { createStation, tickStation, type StationState } from "./stations";
import {
  fromKey,
  key,
  roll,
  separation,
  faceOffset,
  type Actor,
  type Face,
  type Pos,
  type SystemWorld,
  type Weather,
} from "./worldTypes";

interface Plant {
  id: string;
  age: number;
  hydration: number;
  elapsed: number;
  dry: number;
}
export interface EcologySave {
  stations: [string, StationState][];
  plants: [string, Plant][];
  fluids: ReturnType<Fluids["save"]>;
  devices: ReturnType<Devices["save"]>;
  creatures: Creature[];
  drops: Payload[];
  next: number;
  transport: ReturnType<Transport["save"]>;
  foodTicks: [string, number][];
  falling?: string[];
  weatherOverride?: string;
}
const processors = new Set(["kiln", "smelter", "stove"]);
export function daylight(tick: number) {
  const phase = (((tick % 43200) + 43200) % 43200) / 43200;
  return phase < 0.1 ? 0.2 + 8 * phase : phase < 0.55 ? 1 : phase < 0.65 ? 1 - 8 * (phase - 0.55) : 0.2;
}
export class Ecology {
  readonly seed: string;
  dayOffset = 0;
  weatherOverride: string;
  fluids: Fluids;
  devices: Devices;
  population: Population;
  transport: Transport;
  plants: Map<string, Plant>;
  stations: Map<string, StationState>;
  private foodTicks: Map<string, number>;
  private falling: Set<string>;
  constructor(seed: string, saved?: EcologySave) {
    this.seed = String(seed);
    this.weatherOverride = saved?.weatherOverride ?? "auto";
    this.fluids = new Fluids(saved?.fluids);
    this.devices = new Devices(saved?.devices);
    this.population = new Population(this.seed, saved);
    this.transport = new Transport(saved?.transport);
    this.plants = new Map(saved?.plants);
    this.stations = new Map(saved?.stations);
    this.foodTicks = new Map(saved?.foodTicks);
    this.falling = new Set(saved?.falling);
  }
  get creatures() {
    return this.population.creatures;
  }
  get skiffs() {
    return this.transport.boats;
  }
  station(p: Pos, type: Processor) {
    const k = key(p);
    let s = this.stations.get(k);
    if (!s) {
      s = createStation(type);
      this.stations.set(k, s);
    }
    return s;
  }
  canBreak(p: Pos) {
    const s = this.stations.get(key(p));
    return !s || (!s.queue.length && !s.input.some(Boolean) && !s.output.some(Boolean) && !s.fuel);
  }
  lit(x: number, y: number, z: number) {
    const d = this.devices.at({ x, y, z });
    return d?.id === "lamp" && d.high;
  }
  fluid(w: SystemWorld, x: number, y: number, z: number) {
    return this.fluids.read(w, { x, y, z });
  }
  private sheltered(w: SystemWorld, p: Pos) {
    if (w.surface(p.x, p.z) > p.y + 1) return true;
    for (let i = 1; i <= 12; i++) if (BLOCKS[w.get(p.x, p.y + i, p.z)]?.solid) return true;
    return false;
  }
  light(w: SystemWorld, p: Pos, tick: number) {
    const cell = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
    let value = this.sheltered(w, cell) ? 0 : Math.floor(daylight(tick + this.dayOffset) * 15);
    for (const [k, d] of this.devices.entries())
      if (d.id === "lamp" && d.high) {
        const l = fromKey(k),
          dist = Math.abs(cell.x - l.x) + Math.abs(cell.y - l.y) + Math.abs(cell.z - l.z);
        if (dist > 14 || 15 - dist <= value) continue;
        let blocked = false;
        const length = Math.max(Math.abs(cell.x - l.x), Math.abs(cell.y - l.y), Math.abs(cell.z - l.z));
        for (let i = 1; i < length; i++)
          if (
            BLOCKS[
              w.get(
                Math.round(l.x + ((cell.x - l.x) * i) / length),
                Math.round(l.y + ((cell.y - l.y) * i) / length),
                Math.round(l.z + ((cell.z - l.z) * i) / length),
              )
            ]?.solid
          ) {
            blocked = true;
            break;
          }
        if (!blocked) value = Math.max(value, 15 - dist);
      }
    return value;
  }
  weatherAt(w: SystemWorld, x: number, z: number, tick: number): Weather {
    if (["clear", "fog", "rain", "snow", "storm"].includes(this.weatherOverride))
      return this.weatherOverride as Weather;
    const b = w.biome(x, z);
    const weights = b === "lantern_fen" ? [28, 34, 27] : b === "salt_basin" ? [82, 10, 7] : [55, 15, 24];
    const n =
      roll(
        this.seed,
        Math.floor(x / 128),
        Math.floor((tick + this.dayOffset) / 10800),
        Math.floor(z / 128),
      ) * 100;
    if (n < weights[0]) return "clear";
    if (n < weights[0] + weights[1]) return "fog";
    if (b === "frostwood" || b === "frost_crown") return "snow";
    return n < weights[0] + weights[1] + weights[2] ? "rain" : "storm";
  }
  onEdit(w: SystemWorld, p: Pos, oldId: string, id: string, _tick: number, face: Face = 0) {
    if (oldId === id) return;
    const k = key(p);
    this.plants.delete(k);
    if (id === "sand" || id === "gravel") this.falling.add(k);
    if (id === "air") this.falling.add(key({ ...p, y: p.y + 1 }));
    if (processors.has(oldId)) this.stations.delete(k);
    if (processors.has(id)) this.station(p, id as Processor);
    if (deviceIds.has(oldId) || deviceIds.has(id)) this.devices.edit(p, id, face);
    if (["grain_crop", "reed", "kelp", "plant_bed"].includes(id))
      this.plants.set(k, { id, age: 0, hydration: 1, elapsed: 0, dry: 0 });
    if (id === "grain_crop") w.setVariant?.(p.x, p.y, p.z, "age0");
    this.fluids.touch(p);
    w.dirty?.(p.x, p.y, p.z);
  }
  minedDrops(
    w: SystemWorld,
    p: Pos,
    id: string,
    toolId: string | undefined,
    tick: number,
    variant?: string,
  ): Stack[] {
    if (!canHarvest(id, toolId)) return [];
    if (id === "grain_crop") {
      const age = this.plants.get(key(p))?.age ?? 4;
      return age >= 4 ? [makeStack("grain", 2), makeStack("grain_seed")] : [makeStack("grain_seed")];
    }
    if (id === "geothermal_grate") return [makeStack("basalt_rubble", 2), makeStack("glow_quartz")];
    if (id === "foliage") {
      if (roll(this.seed, p.x, p.y + tick, p.z) >= 0.18) return [];
      const pine = w.biome(p.x, p.z) === "frostwood" || w.biome(p.x, p.z) === "wind_ridge";
      return [makeStack(pine ? "pine_seed" : "alder_seed")];
    }
    const drop = BLOCKS[id]?.drop;
    if (!drop || !ITEMS[drop]) return [];
    return [makeStack(drop, 1, drop === id ? variant : undefined)];
  }
  harvest(w: SystemWorld, p: Pos, inv: Inventory, tick: number) {
    const id = w.get(p.x, p.y, p.z),
      plant = this.plants.get(key(p));
    if (id === "grain_crop") {
      if (plant && plant.age < 4) return "The grain is still growing.";
      const left = inv.add("grain", 2);
      if (left) this.population.drop("grain", p, tick, left);
      this.plants.set(key(p), { id, age: 1, hydration: plant?.hydration ?? 2, elapsed: 0, dry: 0 });
      w.setVariant?.(p.x, p.y, p.z, "age1");
      w.dirty?.(p.x, p.y, p.z);
      return "Harvested two grain. Roots left in place.";
    }
    return null;
  }
  private set(w: SystemWorld, p: Pos, id: string, tick: number) {
    const old = w.get(p.x, p.y, p.z);
    if (old === id || w.set(p.x, p.y, p.z, id) === false) return false;
    this.onEdit(w, p, old, id, tick);
    return true;
  }
  use(w: SystemWorld, p: Pos, inv: Inventory, slot: number, tick: number, actorId = "local") {
    const block = w.get(p.x, p.y, p.z),
      held = inv.slots[slot],
      id = held?.id,
      above = { ...p, y: p.y + 1 };
    if (id === "field_hoe" && (block === "loam" || block === "plant_bed")) {
      if (block === "loam") this.set(w, p, "plant_bed", tick);
      const plant = this.plants.get(key(p));
      if (plant) plant.hydration = Math.max(1, plant.hydration);
      inv.wear(slot);
      return "Prepared a planting bed.";
    }
    if (id === "reed_fiber" || id === "kelp_frond" || id === "fungus_cap") {
      const liquid = this.fluids.read(w, above).level;
      const wet = faceOffset.some(
        ([dx, dz]) => this.fluids.read(w, { x: p.x + dx, y: p.y, z: p.z + dz }).level > 0,
      );
      const light = id === "fungus_cap" ? this.light(w, above, tick) : 0;
      const allowed =
        id === "reed_fiber"
          ? ["red_clay", "peat"].includes(block) && wet
          : id === "kelp_frond"
            ? ["gravel", "sand"].includes(block) && liquid >= 6
            : ["red_clay", "peat"].includes(block) && light >= 2 && light <= 7;
      if (!allowed || w.get(above.x, above.y, above.z) !== "air")
        return "This plant needs its native planting conditions.";
      if (
        this.set(
          w,
          above,
          id === "reed_fiber" ? "reed" : id === "kelp_frond" ? "kelp" : "fungus",
          tick,
        ) &&
        inv.mode !== "building"
      )
        inv.take(slot);
      return "Planted.";
    }
    if (
      id === "grain_seed" &&
      block === "plant_bed" &&
      w.get(above.x, above.y, above.z) === "air" &&
      this.set(w, above, "grain_crop", tick)
    ) {
      if (inv.mode !== "building") inv.take(slot);
      return "Planted grain.";
    }
    if (
      id === "water_flask" &&
      (block === "grain_crop" || block === "plant_bed") &&
      (held!.fill ?? 8) >= 2
    ) {
      const cell = block === "grain_crop" ? { ...p, y: p.y - 1 } : p,
        k = key(cell);
      const bed = this.plants.get(k) ?? { id: "plant_bed", age: 0, hydration: 0, dry: 0, elapsed: 0 };
      bed.hydration = Math.min(4, bed.hydration + 2);
      bed.dry = 0;
      this.plants.set(k, bed);
      if (inv.mode !== "building") {
        held!.fill = (held!.fill ?? 8) - 2;
        if (!held!.fill) inv.slots[slot] = { id: "empty_flask", count: 1 };
        inv.version++;
      }
      return "Watered the planting bed.";
    }
    if (
      (id === "alder_seed" || id === "pine_seed") &&
      ["loam", "peat", "plant_bed"].includes(block) &&
      w.get(above.x, above.y, above.z) === "air"
    ) {
      this.set(w, above, "brush", tick);
      this.plants.set(key(above), { id, age: 0, hydration: 2, elapsed: 0, dry: 0 });
      if (inv.mode !== "building") inv.take(slot);
      return "Planted a tree seed.";
    }
    if (id === "brush_knife" && block === "alder_log") {
      const k = key(p),
        old = this.plants.get(k);
      if (old && old.elapsed < 43200) return "This alder needs time to produce resin.";
      if (inv.add("amber_resin")) return "Your pack is full.";
      this.plants.set(k, { id: "alder_tap", age: 1, hydration: 0, elapsed: 0, dry: 0 });
      inv.wear(slot);
      return "Collected amber resin.";
    }
    if (id === "brush_knife" && ["reed", "kelp", "brush", "fungus"].includes(block)) {
      const k = key(p),
        old = this.plants.get(k);
      if (old?.id === "clipped" && old.elapsed < 1200) return "The plant is regrowing.";
      const resource = {
        reed: "reed_fiber",
        kelp: "kelp_frond",
        brush: "brush_fiber",
        fungus: "fungus_cap",
      }[block as "reed"];
      if (inv.add(resource)) return "Your pack is full.";
      inv.wear(slot);
      this.plants.set(k, { id: "clipped", age: 0, hydration: 1, elapsed: 0, dry: 0 });
      return "Clipped the plant.";
    }
    if (id === "rope_line") return this.transport.attachRope(w, p, inv, slot);
    if (id === "skiff")
      return this.transport.deploy(
        w,
        this.fluids,
        this.fluids.read(w, p).level ? p : above,
        inv,
        slot,
        actorId,
      );
    if (block === "anchor") {
      const msg = this.transport.toggleAnchor(p, actorId) ?? this.transport.detachRope(p, inv);
      if (msg) return msg;
    }
    if (id === "scoop") {
      const cell = this.fluids.read(w, p).level ? p : above;
      const f = this.fluids.read(w, cell);
      if (f.level === 8) {
        const idx = inv.slots.findIndex((s, i) => i < STORAGE && s?.id === "empty_flask");
        if (idx < 0) return "Carry an empty flask.";
        const draft = new Inventory(inv.mode, inv.save());
        draft.take(idx);
        if (draft.add(f.kind === "brine" ? "brine_flask" : "water_flask"))
          return "Make room for a filled flask.";
        draft.wear(slot);
        inv.slots = draft.slots;
        inv.version++;
        this.fluids.set(w, cell, { ...f, level: 0 });
        return "Scooped eight fluid units.";
      }
      return "Scoop a full cell with an empty flask in your pack.";
    }
    if (id === "water_flask" || id === "brine_flask" || id === "fish_flask") {
      const targets = [
        above,
        p,
        ...faceOffset.map(([dx, dz]) => ({ ...above, x: above.x + dx, z: above.z + dz })),
      ];
      const cell = targets.find((t) => this.fluids.open(w, t) && this.fluids.read(w, t).level < 8);
      if (!cell) return "No fluid capacity here.";
      const orig = this.fluids.read(w, cell),
        n = Math.min(8 - orig.level, held!.fill ?? 8);
      if (id === "fish_flask") {
        if (n !== 8 || !targets.some((t) => this.fluids.read(w, t).level >= 6))
          return "Release the fish into water with room for eight units.";
        const fish = this.population.spawn("shoal_darter", cell, tick);
        fish.health = held!.vitality ?? 12;
      }
      this.fluids.set(w, cell, {
        level: orig.level + n,
        kind: (orig.level && orig.kind === "brine") || id === "brine_flask" ? "brine" : "water",
      });
      if (inv.mode !== "building") {
        held!.fill = (held!.fill ?? 8) - n;
        if (!held!.fill) inv.slots[slot] = { id: "empty_flask", count: 1 };
        inv.version++;
      }
      return id === "fish_flask" ? "Fish released." : "Poured " + n + " fluid units.";
    }
    if (block === "switch" || block === "gate" || block === "sluice") {
      if (!this.devices.at(p)) this.devices.edit(p, block);
      const device = this.devices.at(p)!;
      device.enabled = !device.enabled;
      return device.enabled ? "Switched on." : "Switched off.";
    }
    return this.harvest(w, p, inv, tick);
  }
  food(inv: Inventory, slot: number, actor: Actor, tick: number) {
    const s = inv.slots[slot],
      heal = s && ITEMS[s.id]?.heal;
    if (!heal) return null;
    if (actor.health >= 100) return "Health is full.";
    const id = actor.id ?? "local";
    if ((this.foodTicks.get(id) ?? -Infinity) + 120 > tick) return "Wait before eating again.";
    if (inv.mode !== "building") inv.take(slot);
    this.foodTicks.set(id, tick);
    actor.health = Math.min(100, actor.health + heal);
    return "Ate " + ITEMS[s.id].title + ".";
  }
  target(eye: Pos, dir: Pos, reach = 5.5) {
    return this.population.target(eye, dir, reach);
  }
  attack(id: string, inv: Inventory, slot: number, actor: Actor, tick: number) {
    const c = this.creatures.find((e) => e.id === id);
    if (!c || separation(actor, c) > 5.5) return "Out of reach.";
    const tool = inv.slots[slot],
      amount = tool?.id.endsWith("_hammer") ? 18 : tool ? 12 : 6;
    this.population.resolveDamage(c, amount, tick);
    if (tool?.durability) inv.wear(slot);
    return "Hit " + c.species.replaceAll("_", " ") + ".";
  }
  shoot(eye: Pos, dir: Pos, inv: Inventory, slot: number, tick: number) {
    const pellet = inv.slots.findIndex((s, i) => i < STORAGE && s?.id === "sling_pellet");
    if (inv.slots[slot]?.id !== "sling") return "Select a sling.";
    if (pellet < 0 && inv.mode !== "building") return "Carry sling pellets.";
    if (inv.mode !== "building") inv.take(pellet);
    inv.wear(slot);
    this.population.shots.push({
      ...eye,
      vx: dir.x * 23,
      vy: dir.y * 23,
      vz: dir.z * 23,
      until: tick + 150,
    });
    return "Fired sling.";
  }
  interactCreature(id: string, inv: Inventory, slot: number, actor: Actor, tick: number) {
    return this.population.interact(id, inv, slot, actor, tick) ?? "This creature watches you.";
  }
  board(w: SystemWorld, a: Actor) {
    return this.transport.board(w, a);
  }
  sail(w: SystemWorld, a: Actor, forward: number, turn: number, dt: number) {
    return this.transport.sail(w, this.fluids, a, forward, turn, dt);
  }
  glide(inv: Inventory, v: Pos, heading: number, tick: number) {
    return this.transport.glide(inv, v, heading, tick);
  }
  ropeAt(p: Pos) {
    return this.transport.ropeAt(p);
  }
  nearStove(p: Pos) {
    for (const [k, s] of this.stations)
      if (s.kind === "stove" && s.burn > 0 && s.queue.length && separation(fromKey(k), p) <= 6)
        return true;
    return false;
  }
  tick(w: SystemWorld, actor: Actor, tick: number, heldId?: string, immune = false) {
    for (const [k, s] of this.stations) if (separation(fromKey(k), actor) < 82) tickStation(s);
    if (tick % 3 === 0) {
      const candidates = [];
      for (const k of this.falling) {
        if (separation(fromKey(k), actor) < 82) candidates.push(k);
        if (candidates.length >= 32) break;
      }
      for (const k of candidates) {
        this.falling.delete(k);
        const p = fromKey(k),
          below = { ...p, y: p.y - 1 },
          material = w.get(p.x, p.y, p.z);
        if (
          (material === "sand" || material === "gravel") &&
          w.get(below.x, below.y, below.z) === "air" &&
          below.y > -95 &&
          this.fluids.displace(w, below)
        ) {
          this.set(w, p, "air", tick);
          this.set(w, below, material, tick);
        }
      }
    }
    this.devices.tick(w, this.fluids, tick, (d, p) =>
      d.sense === "light"
        ? this.light(w, p, tick)
        : d.sense === "entity"
          ? Number(separation(actor, p) < 2 || this.creatures.some((c) => separation(c, p) < 1.5))
          : (w.itemCount?.(p) ??
            this.stations.get(key(p))?.output.reduce((n, s) => n + (s?.count ?? 0), 0) ??
            0),
    );
    this.devices.moveLifts(w, actor);
    const weather = this.weatherAt(w, actor.x, actor.z, tick);
    this.devices.flow(
      w,
      this.fluids,
      actor,
      tick + this.dayOffset,
      weather === "rain" || weather === "storm",
    );
    const sensed = { ...actor, heldId, immune };
    this.population.tick(
      w,
      this.fluids,
      sensed,
      tick,
      (p) => this.light(w, p, tick),
      weather === "storm",
      tick + this.dayOffset,
    );
    actor.health = sensed.health;
    if (tick % 30 !== 0) return;
    // Each active second selects a deterministic nearby surface for local weathering.
    const wx = Math.floor(actor.x) + (Math.floor(roll(this.seed, tick, 0, 51) * 17) - 8);
    const wz = Math.floor(actor.z) + (Math.floor(roll(this.seed, tick, 0, 52) * 17) - 8);
    const wy = w.surface(wx, wz),
      material = w.get(wx, wy, wz),
      biome = w.biome(wx, wz);
    if (material === "snow_crust" && !["frostwood", "frost_crown"].includes(biome))
      this.set(w, { x: wx, y: wy, z: wz }, "air", tick);
    if (
      ["sand", "gravel", "red_clay"].includes(material) &&
      biome === "salt_basin" &&
      w.get(wx, wy + 1, wz) === "air" &&
      faceOffset.some(([dx, dz]) => {
        const f = this.fluids.read(w, { x: wx + dx, y: wy + 1, z: wz + dz });
        return f.kind === "brine" && f.level >= 2;
      })
    )
      this.set(w, { x: wx, y: wy + 1, z: wz }, "salt_crust", tick);
    for (const [k, s] of this.plants) {
      const p = fromKey(k);
      if (separation(p, actor) > 82) continue;
      s.elapsed += 30;
      s.dry += 30;
      if (s.id === "plant_bed") {
        const weather = this.weatherAt(w, p.x, p.z, tick);
        const rain =
          (weather === "rain" || weather === "storm") && !this.sheltered(w, { ...p, y: p.y + 1 });
        const wet = faceOffset.some(([dx, dz]) => {
          const f = this.fluids.read(w, { ...p, x: p.x + dx, z: p.z + dz });
          return f.level >= 2 && f.kind === "water";
        });
        if (wet || rain) {
          s.hydration = Math.min(4, s.hydration + 1);
          s.dry = 0;
        } else if (s.dry >= 3600) {
          s.hydration = Math.max(0, s.hydration - 1);
          s.dry = 0;
        }
      }
      if (s.elapsed < 1200) continue;
      if (s.id === "grain_crop") {
        const bed = this.plants.get(key({ ...p, y: p.y - 1 }));
        if (bed && bed.hydration >= 2 && s.age < 4 && this.light(w, p, tick) >= 8) {
          s.age++;
          w.setVariant?.(p.x, p.y, p.z, "age" + s.age);
          w.dirty?.(p.x, p.y, p.z);
        }
        s.elapsed = 0;
      } else if (s.id === "alder_seed" || s.id === "pine_seed") {
        s.elapsed = 0;
        if (++s.age < 3) continue;
        const cells: { p: Pos; id: string }[] = [];
        for (let i = 0; i < 4; i++)
          cells.push({ p: { ...p, y: p.y + i }, id: s.id === "alder_seed" ? "alder_log" : "pine_log" });
        for (let dx = -1; dx <= 1; dx++)
          for (let dz = -1; dz <= 1; dz++)
            if (dx || dz) cells.push({ p: { x: p.x + dx, y: p.y + 3, z: p.z + dz }, id: "foliage" });
        cells.push({ p: { ...p, y: p.y + 4 }, id: "foliage" });
        if (cells.slice(1).every((v) => w.get(v.p.x, v.p.y, v.p.z) === "air")) {
          cells.forEach((v) => this.set(w, v.p, v.id, tick));
          this.plants.delete(k);
        }
      }
    }
    for (const c of this.creatures) {
      if (!c.ready || (!c.owner && c.species !== "cave_slug") || separation(c, actor) > 80) continue;
      const mate = this.creatures.find(
        (m) =>
          m !== c && m.species === c.species && m.owner === c.owner && m.ready && separation(c, m) < 5,
      );
      const p = { x: Math.floor(c.x + 1), y: Math.floor(c.y), z: Math.floor(c.z) };
      if (!mate || w.get(p.x, p.y, p.z) !== "air" || !BLOCKS[w.get(p.x, p.y - 1, p.z)]?.solid) continue;
      this.population.spawn(c.species, p, tick, true).owner = c.owner;
      c.ready = mate.ready = false;
      c.breedUntil = mate.breedUntil = tick + 9000;
    }
  }
  save(): EcologySave {
    return structuredClone({
      stations: [...this.stations],
      plants: [...this.plants],
      devices: this.devices.save(),
      fluids: this.fluids.save(),
      creatures: this.creatures,
      drops: this.population.drops,
      next: this.population.next,
      transport: this.transport.save(),
      foodTicks: [...this.foodTicks],
      falling: [...this.falling],
      weatherOverride: this.weatherOverride,
    });
  }
}

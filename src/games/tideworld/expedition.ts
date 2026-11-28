import { BLOCKS, VoxelWorld, localBounds } from "./world";
import { isMasonryStep } from "./world/shapes";
import { masonryPlacement } from "./world/masonry";
import { GLAZE_IDS } from "./world/textures";
import { Ecology, Inventory, ITEMS, miningRate } from "./systems";
import { landmarkStock } from "./systems/stock";
import { SPECIES } from "./systems/creatures";
import { deposit } from "./systems/inventory";
import type { Stack } from "./systems/catalog";
import type { Face, SystemWorld } from "./systems/worldTypes";
import {
  DT,
  eye,
  newBody,
  overlaps,
  sight,
  stepBody,
  type CollisionWorld,
  type Intent,
  type Point,
} from "./movement";
import {
  cellKey,
  type Drawer,
  type ExpeditionSave,
  type ExpeditionStart,
  type Marker,
  type Pickup,
} from "./expeditionData";
import { starterPickups } from "./session/starterPickups";
import { saveLocalWorld } from "./session";

export type Panel =
  | "pack"
  | "palette"
  | "station"
  | "drawer"
  | "inspector"
  | "marker"
  | "settings"
  | "handbook"
  | "world"
  | "build"
  | "rest";
const box = { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 };
const allowed = (p: Point) =>
  [p.x, p.y, p.z].every(Number.isSafeInteger) &&
  Math.abs(p.x) <= 1048576 &&
  Math.abs(p.z) <= 1048576 &&
  p.y >= -94 &&
  p.y <= 223;
const offset = (p: Point, d: Point) => ({ x: p.x + d.x, y: p.y + d.y, z: p.z + d.z });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export type Hit = NonNullable<ReturnType<VoxelWorld["raycast"]>>;
export class Expedition {
  readonly start: ExpeditionStart;
  readonly world: VoxelWorld;
  readonly sys: SystemWorld;
  readonly collision: CollisionWorld;
  readonly ecology: Ecology;
  body: ReturnType<typeof newBody>;
  inventory: Inventory;
  dayOffset: number;
  tick: number;
  selected: number;
  last: number;
  flying: boolean;
  weather: string;
  weatherOverride: string;
  cotPartners: Record<string, Point>;
  markers: Marker[];
  pickups: Pickup[];
  drawers: Record<string, Drawer>;
  discovered: Set<string>;
  target: Hit | null = null;
  notice = "";
  status = "";
  progress = 0;
  anchor: Point | null = null;
  paint = "teal";
  tool: "place" | "paint" | "fill" | "replace" = "place";
  corner: Point | null = null;
  revision = 0;
  preview: {
    token: number;
    revision: number;
    cells: { p: Point; was: string; blocked: string }[];
    from: Point;
    to: Point;
    block: string;
  } | null = null;
  cause = "";
  private mineKey = "";
  private serial = 0;
  private activeColumn = "";
  private supports: Record<string, Point>;
  panel: (p: Panel) => void = () => {};
  cue: (kind: string, material?: string) => void = () => {};
  constructor(start: ExpeditionStart) {
    this.start = start;
    const saved = start.saved;
    this.world = new VoxelWorld(start.info.seed, saved?.edits);
    const w = this.world;
    Object.assign(w.variants, saved?.variants);
    Object.assign(w.facings, saved?.facings);
    this.body = Object.assign(newBody(w.spawn), saved?.body);
    this.sys = {
      get: (x, y, z) => w.get(x, y, z),
      set: (x, y, z, id) => w.set(x, y, z, id),
      surface: (x, z) => w.height(x, z),
      biome: (x, z) => w.biome(x, z),
      itemCount: (p) => this.drawerAt(p)?.slots.reduce((n, s) => n + (s?.count ?? 0), 0),
      occupied: (p) => !this.canBuild(p),
      fluid: (x, y, z) => w.fluid(x, y, z),
      dirty: (x, y, z) => w.dirty(x, y, z),
      setVariant: (x, y, z, v) => w.setVariant(x, y, z, v),
    };
    this.inventory = new Inventory(start.info.mode, saved?.inventory);
    this.ecology = new Ecology(start.info.seed, saved?.ecology);
    this.collision = {
      bounds: (x, y, z) => w.bounds(x, y, z),
      fluid: (x, y, z) => this.ecology.fluids.peek(x, y, z)?.level ?? w.fluid(x, y, z),
      get: (x, y, z) => (this.ecology.ropeAt({ x, y, z }) ? "rope_line" : w.get(x, y, z)),
    };
    w.bindSystems({
      fluid: (x, y, z) => this.ecology.fluids.peek(x, y, z)?.level,
      lit: (x, y, z) => this.ecology.lit(x, y, z),
    });
    for (const [key] of saved?.ecology?.fluids.cells ?? []) {
      const [x, y, z] = key.split(",").map(Number);
      w.dirty(x, y, z);
    }
    for (const key of Object.keys(w.edits)) {
      if (w.edits[key] === "lamp") {
        const [x, y, z] = key.split(",").map(Number);
        w.dirty(x, y, z);
      }
    }

    this.cause = saved?.cause ?? "";
    this.dayOffset = saved?.dayOffset ?? 0;
    this.ecology.dayOffset = this.dayOffset;
    this.tick = saved?.tick ?? 4320;
    this.selected = saved?.selected ?? 0;
    this.last = saved?.last ?? 0;
    this.flying = saved?.flying ?? this.building;
    this.weatherOverride = saved?.weather ?? "auto";
    this.weather = "clear";
    this.supports = saved?.supports ?? {};
    this.cotPartners = saved?.cotPartners ?? {};
    this.markers = saved?.markers ?? [];
    this.drawers = saved?.drawers ?? {};
    this.discovered = new Set(saved?.discovered);
    if (this.building && !saved)
      ["timber_panel", "slate_brick", "half_step", "clay_tile", "lamp", "switch", "wire"].forEach(
        (id, i) => this.inventory.grant(i, id),
      );
    this.pickups = saved?.pickups ?? starterPickups(w);
    this.status = start.recovered ? "Recovered local save" : "Local world";
  }
  get building() {
    return this.start.info.mode === "building";
  }

  get held() {
    return this.inventory.slots[this.selected];
  }
  get heading() {
    return (360 - (((this.body.yaw * 180) / Math.PI) % 360)) % 360;
  }
  get facing(): Face {
    return (Math.round(this.heading / 90) % 4) as Face;
  }
  get targetCreature() {
    return this.ecology.target(
      eye(this.body),
      sight(this.body),
      this.target ? Math.min(5.5, dist(eye(this.body), this.target)) : 5.5,
    );
  }
  message(text: string) {
    this.notice = text;
  }

  select(slot: number, relative = false) {
    const next = ((relative ? this.selected + slot : slot) + 7) % 7;
    if (next !== this.selected) {
      this.last = this.selected;
      this.selected = next;
      this.resetMine();
      this.cue("select");
    }
  }
  resetMine() {
    this.progress = 0;
    this.mineKey = "";
  }
  hit() {
    this.target = this.world.raycast(eye(this.body), sight(this.body), 5.5);
  }
  frame(input: Intent, mining: boolean) {
    this.tick++;
    if (this.body.health <= 0) return;
    const b = this.body,
      e = this.ecology;
    this.cause = "";
    const sailing = e.sail(this.sys, b, input.forward, input.right, DT);
    if (!sailing) {
      const velocity = { x: b.vx, y: b.vy, z: b.vz };
      const gliding =
        !b.grounded && b.vy < 0 && input.jump && e.glide(this.inventory, velocity, b.yaw, this.tick);
      if (gliding) {
        b.vx = velocity.x;
        b.vy = velocity.y;
        b.vz = velocity.z;
      }
      stepBody(b, input, this.collision, this.building, this.flying, !!gliding);
    }
    this.hit();
    if (this.tick % 30 === 0 || this.tick === 4321) {
      this.weather =
        this.weatherOverride === "auto"
          ? e.weatherAt(this.sys, b.x, b.z, this.tick)
          : this.weatherOverride;
      const cx = Math.floor(b.x / 16),
        cz = Math.floor(b.z / 16),
        col = cx + "," + cz;
      this.discovered.add(col);
      if (this.activeColumn !== col) {
        this.activeColumn = col;
        for (let x = cx - 1; x <= cx + 1; x++)
          for (let z = cz - 1; z <= cz + 1; z++)
            for (const wheel of this.world.millWheels(x, z)) {
              if (this.world.get(wheel.x, wheel.y, wheel.z) === "water_wheel" && !e.devices.at(wheel))
                e.devices.edit(wheel, "water_wheel", 0);
            }
      }
    }
    {
      e.weatherOverride = this.weatherOverride;
      e.tick(this.sys, b, this.tick, this.held?.id, this.building);
      e.population.collect(this.inventory, b, this.tick);
      if (!this.building) {
        const exposed =
          b.y >= this.world.height(Math.floor(b.x), Math.floor(b.z)) + 0.6 && !this.roof(b);
        const cold = /frost|wind_ridge/.test(this.world.biome(b.x, b.z));
        const rain = exposed && ["rain", "storm", "snow"].includes(this.weather);
        const clothing = this.inventory.slots[35]?.id;
        let change = rain
          ? (this.weather === "snow" ? -3 : -1) * (clothing === "rain_cape" ? 0.5 : 1)
          : cold
            ? -0.5 * (clothing === "insulated_coat" ? 0.5 : 1)
            : 0.6;
        if (e.nearStove?.(b)) change += 4;
        b.warmth = Math.max(0, Math.min(100, b.warmth + change * DT));
        if (b.warmth < 10) b.health -= 4 * DT;
        const vent = [1, 2].some(
          (d) =>
            this.world.get(Math.floor(b.x), Math.floor(b.y) - d, Math.floor(b.z)) === "geothermal_grate",
        );
        if (vent && this.tick % 270 >= 210) {
          b.health -= 6 * DT;
          this.cause = "Steam vent";
        }
        if (vent && this.tick % 270 === 180) this.message("The vent is starting to hiss.");
        if (b.y < -95) b.health = 0;
        this.collect();
      }
      if (b.health <= 0) this.defeat();
    }
    if (mining) this.mine();
    else this.resetMine();
    if (this.tick % 30 === 0) {
      for (const p of this.pickups) if (p.expires && dist(p, b) > 80) p.expires += 30;
      this.pickups = this.pickups.filter((p) => !p.expires || p.expires > this.tick);
      for (const [k, d] of Object.entries(this.drawers)) {
        if (!d.expires) continue;
        const [x, y, z] = k.split(",").map(Number);
        if (Math.hypot(x - b.x, z - b.z) > 80) d.expires += 30;
        else if (d.expires <= this.tick && this.world.get(x, y, z) === "recovery_crate")
          this.change({ x, y, z }, "air");
      }
    }
  }
  private roof(p: Point) {
    for (let dy = 2; dy <= 10; dy++)
      if (this.world.isSolid(Math.floor(p.x), Math.floor(p.y) + dy, Math.floor(p.z))) return true;
    return false;
  }
  private collect() {
    for (const p of this.pickups) {
      if (p.available > this.tick || dist(p, this.body) > 1.5) continue;
      p.stack.count = this.inventory.addStack(p.stack);
      if (!p.stack.count) {
        this.message("Collected " + (ITEMS[p.stack.id]?.title ?? p.stack.id));
        this.cue("pickup");
      }
    }
    this.pickups = this.pickups.filter((p) => p.stack.count > 0);
  }
  drop(stack: Stack, p: Point, delay = 0) {
    this.pickups.push({
      ...p,
      id: "drop-" + this.tick + "-" + ++this.serial,
      stack: { ...stack },
      expires: this.tick + 36000,
      available: this.tick + delay,
    });
  }
  dropSlot(slot: number) {
    const s = this.inventory.take(slot);
    if (s) this.drop(s, this.body, 45);
  }
  private defeat() {
    const b = this.body;
    b.health = 0;
    this.cause =
      this.cause || (b.warmth < 10 ? "Cold exposure" : b.submerged > 18 ? "Out of breath" : "Injury");
    const pack = this.inventory.slots.slice(7, 35);
    if (!pack.some(Boolean)) return;
    for (let r = 0; r < 8; r++)
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const x = Math.floor(b.x) + dx,
            z = Math.floor(b.z) + dz;
          if (x === Math.floor(this.world.spawn.x) && z === Math.floor(this.world.spawn.z)) continue;
          const base = Math.floor(b.y);
          const y = [base, base - 1, base + 1, base - 2, this.world.height(x, z) + 1].find(
            (y) =>
              allowed({ x, y, z }) &&
              this.world.isSolid(x, y - 1, z) &&
              this.world.get(x, y, z) === "air" &&
              !this.ecology.fluids.read(this.sys, { x, y, z }).level,
          );
          if (y === undefined) continue;
          this.world.set(x, y, z, "recovery_crate");
          this.drawers[cellKey({ x, y, z })] = { slots: pack, expires: this.tick + 54000 };
          this.inventory.slots.fill(null, 7, 35);
          this.inventory.version++;
          this.markers.push({ x, y, z, name: "Recovery crate", color: "#efaf55" });
          return;
        }
  }
  get compassMarker() {
    return [...this.markers].reverse().find((m) => m.visible !== false);
  }
  get crateMarker() {
    return [...this.markers].reverse().find((m) => this.world.get(m.x, m.y, m.z) === "recovery_crate");
  }
  get respawnMarker() {
    return [...this.markers]
      .reverse()
      .find(
        (m) =>
          this.world.get(m.x, m.y, m.z) === "marker_stand" &&
          this.world.isSolid(m.x, m.y - 1, m.z) &&
          !this.world.isSolid(m.x, m.y + 1, m.z) &&
          !this.world.isSolid(m.x, m.y + 2, m.z) &&
          !this.ecology.fluids.read(this.sys, m).level,
      );
  }
  restUntilMorning() {
    const phase = (this.tick + this.dayOffset) % 43200;
    this.dayOffset += (43200 + 4320 - phase) % 43200;
    this.ecology.dayOffset = this.dayOffset;
    this.message("Rested until morning.");
  }
  respawn() {
    this.cause = "";
    const camp = this.world.spawn,
      m = this.respawnMarker;
    let p = m ? { x: m.x + 0.5, y: m.y + 1.05, z: m.z + 0.5 } : { ...camp };
    // Construction may have covered the original spawn since the last visit.
    if (!m) {
      const x = Math.floor(p.x),
        z = Math.floor(p.z);
      while (
        p.y < 224 &&
        (this.world.isSolid(x, Math.floor(p.y), z) || this.world.isSolid(x, Math.floor(p.y + 1.71), z))
      )
        p = { ...p, y: Math.floor(p.y) + 1.01 };
    }
    this.body = newBody(p);
    this.message("Returned to camp");
  }
  mine() {
    const t = this.target,
      actor = this.targetCreature;

    if (actor) {
      if (this.tick % 15 === 0)
        this.message(this.ecology.attack(actor.id, this.inventory, this.selected, this.body, this.tick));
      return;
    }
    if (!t) return this.resetMine();
    const def = BLOCKS[t.id],
      key = cellKey(t) + ":" + this.selected + ":" + t.id;
    if (!def || !Number.isFinite(def.work)) return;
    if (key !== this.mineKey) {
      this.mineKey = key;
      this.progress = 0;
    }
    this.progress += this.building ? 1 : (miningRate(t.id, this.held?.id) * DT) / def.work;
    if (this.progress < 1) return;
    this.resetMine();
    if (!this.ecology.canBreak(t) || this.drawerAt(t)?.slots.some(Boolean)) {
      this.message("Empty the station or container first.");
      return;
    }

    const loot = this.building
      ? []
      : this.ecology.minedDrops(
          this.sys,
          t,
          t.id,
          this.held?.id,
          this.tick,
          this.world.variants[cellKey(t)],
        );
    this.change(t, "air");
    for (const stack of loot) {
      const remaining = this.inventory.addStack(stack);
      if (remaining) this.drop({ ...stack, count: remaining }, t);
    }
    this.inventory.wear(this.selected);
    this.cue("break", t.id);
  }
  change(p: Point, id: string) {
    const was = this.world.get(p.x, p.y, p.z);
    if (!this.world.set(p.x, p.y, p.z, id)) return;
    this.revision++;
    this.ecology.onEdit(this.sys, p, was, id, this.tick, this.facing);
    delete this.supports[cellKey(p)];
    if (was === "anchor") {
      const transport = this.ecology.transport;
      for (const b of transport.boats) if (b.tether === cellKey(p)) b.tether = undefined;
      const index = transport.ropes.findIndex((r) => r.x === p.x && r.z === p.z && r.y === p.y - 1);
      if (index >= 0) {
        transport.ropes.splice(index, 1);
        if (!this.building) this.drop({ id: "rope_line", count: 1 }, p);
      }
    }
    if (!BLOCKS[id]?.solid)
      for (const delta of [
        { x: 1, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: -1, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: -1 },
      ]) {
        const neighbor = offset(p, delta),
          support = this.supports[cellKey(neighbor)];
        if (!support || cellKey(support) !== cellKey(p)) continue;
        const attached = this.world.get(neighbor.x, neighbor.y, neighbor.z);
        this.change(neighbor, "air");
        if (!this.building && ITEMS[attached]) this.drop({ id: attached, count: 1 }, neighbor);
      }
    if (was === "camp_cot") {
      const other = this.cotPartners[cellKey(p)];
      delete this.cotPartners[cellKey(p)];
      if (other) {
        delete this.cotPartners[cellKey(other)];
        if (this.world.get(other.x, other.y, other.z) === "camp_cot") this.change(other, "air");
      }
    }
    if (id !== "air") this.world.setFacing(p.x, p.y, p.z, this.facing);
    if (id === "air") {
      delete this.drawers[cellKey(p)];
      this.markers = this.markers.filter((m) => cellKey(m) !== cellKey(p));
    }
  }
  private drawerAt(p: Point) {
    const key = cellKey(p);
    const block = this.world.get(p.x, p.y, p.z);
    if (block !== "storage_drawer" && block !== "recovery_crate") return;
    if (!this.drawers[key]) {
      const kind = this.world.generatedStashKind(p.x, p.y, p.z);
      this.drawers[key] = {
        slots: kind ? landmarkStock(kind, this.world.seed, p) : Array(24).fill(null),
      };
    }
    return this.drawers[key];
  }
  canBuild(p: Point, bounds = box) {
    if (!allowed(p) || overlaps(this.body, this.body.crouched ? 1.15 : 1.72, p.x, p.y, p.z, bounds))
      return false;
    return !this.ecology.creatures.some((c) => {
      const species = SPECIES[c.species],
        scale = c.juvenile ? 0.65 : 1,
        half = (species.width * scale) / 2;
      return (
        c.health > 0 &&
        c.x + half > p.x + bounds.minX &&
        c.x - half < p.x + bounds.maxX &&
        c.z + half > p.z + bounds.minZ &&
        c.z - half < p.z + bounds.maxZ &&
        c.y + species.height * scale > p.y + bounds.minY &&
        c.y < p.y + bounds.maxY
      );
    });
  }
  place() {
    const held = this.held,
      t = this.target,
      w = this.world;

    if (held) {
      const food = this.ecology.food(this.inventory, this.selected, this.body, this.tick);
      if (food) {
        this.message(food);
        return;
      }
      if (held.id === "sling") {
        this.message(
          this.ecology.shoot(eye(this.body), sight(this.body), this.inventory, this.selected, this.tick),
        );
        return;
      }
    }
    if (!t) return;

    if (held && !ITEMS[held.id]?.block) {
      const used = this.ecology.use(this.sys, t, this.inventory, this.selected, this.tick);
      if (used) {
        this.message(used);
        return;
      }
    }
    if (this.building && this.tool !== "place") {
      if (this.tool === "paint") {
        if (!["clay_tile", "timber_panel", "half_step", "stair_step"].includes(t.id))
          return this.message("Select a finished tile, panel or step.");
        if (isMasonryStep(t.id) && this.paint !== "slate_brick" && this.paint !== "basalt_brick")
          return this.message("Choose slate or basalt masonry for this step.");
        if (t.id === "timber_panel" && this.paint !== "alder" && this.paint !== "pine")
          return this.message("Choose alder or pine for this panel.");
        if (t.id === "clay_tile" && !GLAZE_IDS.includes(this.paint))
          return this.message("Choose a glaze color for this tile.");
        w.setVariant(t.x, t.y, t.z, this.paint);
        this.cue("place");
        return;
      }
      if (!held || !ITEMS[held.id]?.block) return this.message("Choose a block for this fill.");
      const p = this.tool === "replace" ? t : offset(t, t.normal);
      if (!this.corner) {
        this.corner = { x: p.x, y: p.y, z: p.z };
        return this.message("First corner set. Select the opposite corner.");
      }
      const a = this.corner;
      this.corner = null;
      this.planFill(a, p, held.id);
      if (!this.preview) return;
      this.panel("build");
      return;
    }
    const id = held && ITEMS[held.id]?.block;
    if (!id) return;
    if (isMasonryStep(id)) {
      const placement = masonryPlacement(w, t, id, held?.variant, this.facing);
      if (!placement) return this.message("Choose an empty half or matching masonry.");
      const { p, id: placedId, variant, facing } = placement;
      if (!localBounds(placedId, facing, variant).every((bounds) => this.canBuild(p, bounds)))
        return this.message("A body occupies this step.");
      if (!this.ecology.fluids.displace(this.sys, p))
        return this.message("There is no room for the displaced fluid.");
      this.change(p, placedId);
      w.setFacing(p.x, p.y, p.z, facing);
      if (variant) w.setVariant(p.x, p.y, p.z, variant);
      if (!this.building) this.inventory.take(this.selected);
      this.cue("place", placedId);
      return;
    }
    const p = offset(t, t.normal),
      old = w.get(p.x, p.y, p.z);
    if (old !== "air" || !this.canBuild(p)) return this.message("The placement needs a clear cell.");

    let backing: Point | null = null;
    if (id === "anchor" || id === "ladder") {
      if (id === "ladder" && t.normal.y !== 0 && t.id === "ladder")
        backing = this.supports[cellKey(t)]
          ? offset(p, {
              x: this.supports[cellKey(t)].x - t.x,
              y: 0,
              z: this.supports[cellKey(t)].z - t.z,
            })
          : null;
      else if (id === "anchor" || !t.normal.y) backing = { x: t.x, y: t.y, z: t.z };
      if (!backing || !w.isSolid(backing.x, backing.y, backing.z))
        return this.message("Attach this to a solid supporting face.");
    }
    const second =
      id === "camp_cot"
        ? offset(p, { x: [0, 1, 0, -1][this.facing], y: 0, z: [-1, 0, 1, 0][this.facing] })
        : null;
    if (
      second &&
      (!w.isSolid(p.x, p.y - 1, p.z) ||
        !this.canBuild(second) ||
        w.get(second.x, second.y, second.z) !== "air" ||
        !w.isSolid(second.x, second.y - 1, second.z) ||
        this.ecology.fluids.read(this.sys, second).level)
    )
      return this.message("A cot needs two clear, supported cells.");
    if (!this.ecology.fluids.displace(this.sys, p))
      return this.message("There is no room for the displaced fluid.");
    this.change(p, id);
    if (backing) {
      this.supports[cellKey(p)] = backing;
      if (id === "ladder")
        w.setFacing(p.x, p.y, p.z, backing.z > p.z ? 0 : backing.x < p.x ? 1 : backing.z < p.z ? 2 : 3);
    }
    if (second) {
      this.change(second, id);
      this.cotPartners[cellKey(p)] = second;
      this.cotPartners[cellKey(second)] = p;
    }
    if (held?.variant) w.setVariant(p.x, p.y, p.z, held.variant);
    if (!this.building) this.inventory.take(this.selected);
    this.cue("place", id);
  }
  planFill(a: Point, p: Point, block: string) {
    this.preview = null;
    if (
      !this.building ||
      !allowed(a) ||
      !allowed(p) ||
      !BLOCKS[block] ||
      ["air", "foundation", "recovery_crate", "camp_cot"].includes(block)
    )
      return this.message("Choose valid corners and a single-cell building material.");
    const count = (Math.abs(a.x - p.x) + 1) * (Math.abs(a.y - p.y) + 1) * (Math.abs(a.z - p.z) + 1);
    if (count > 4096) return this.message("A fill can cover up to 4,096 cells.");
    const source = this.tool === "replace" ? this.world.get(a.x, a.y, a.z) : "air";
    const cells = [];
    for (let x = Math.min(a.x, p.x); x <= Math.max(a.x, p.x); x++)
      for (let y = Math.min(a.y, p.y); y <= Math.max(a.y, p.y); y++)
        for (let z = Math.min(a.z, p.z); z <= Math.max(a.z, p.z); z++) {
          const was = this.world.get(x, y, z);
          if (was === source) {
            const cell = { x, y, z };
            cells.push({ p: cell, was, blocked: this.fillBlocker(cell, was) });
          }
        }
    this.preview = { token: ++this.serial, revision: this.revision, cells, from: a, to: p, block };
  }
  cancelFill() {
    this.preview = null;
    this.corner = null;
  }
  private fillBlocker(p: Point, was: string) {
    if (!this.canBuild(p)) return "A body occupies the selection.";
    if (was === "foundation" || was === "camp_cot" || was === "recovery_crate")
      return "The selection contains a protected block.";
    if (this.world.get(p.x, p.y, p.z) !== was) return "A selected cell changed.";
    if (!this.ecology.canBreak(p) || this.drawerAt(p)?.slots.some(Boolean))
      return "Empty the selected containers first.";
    if (this.ecology.fluids.read(this.sys, p).level) return "Drain the selected cells first.";
    return "";
  }
  applyFill() {
    const preview = this.preview;
    this.preview = null;
    if (!preview || !this.building) return;
    if (preview.revision !== this.revision)
      return this.message("The world changed. Preview the selection again.");
    const problem = preview.cells.map(({ p, was }) => this.fillBlocker(p, was)).find(Boolean);
    if (problem) return this.message("Fill rejected. " + problem);
    for (const { p } of preview.cells) this.change(p, preview.block);
    this.message("Filled " + preview.cells.length + " cells.");
  }
  interact() {
    const t = this.target,
      e = this.ecology,
      b = this.body;
    {
      if (t?.id === "anchor") {
        this.anchor = { x: t.x, y: t.y, z: t.z };
        this.panel("inspector");
        return;
      }
      const boat = e.board(this.sys, b);
      if (boat) {
        this.message(boat);
        return;
      }
      const actor = this.targetCreature;
      if (actor) {
        this.message(e.interactCreature(actor.id, this.inventory, this.selected, b, this.tick));
        return;
      }
    }

    if (!t) return;
    this.anchor = { x: t.x, y: t.y, z: t.z };
    if (["workbench", "stove", "kiln", "smelter"].includes(t.id)) {
      this.panel("station");
      return;
    }

    if (["storage_drawer", "recovery_crate"].includes(t.id)) {
      this.drawerAt(t);
      this.panel("drawer");
      return;
    }
    if (t.id === "marker_stand") {
      this.panel("marker");
      return;
    }
    if (t.id === "camp_cot") {
      if (
        !this.roof(t) ||
        !this.world.isSolid(t.x, t.y - 1, t.z) ||
        this.world.isSolid(t.x, t.y + 1, t.z) ||
        this.world.isSolid(t.x, t.y + 2, t.z)
      )
        return this.message("The cot needs a sheltered roof.");
      b.stamina = b.warmth = 100;
      this.message("Stamina and warmth restored.");
      this.panel("rest");
      return;
    }
    const used = e.use(this.sys, t, this.inventory, this.selected, this.tick);
    if (used) this.message(used);
    if (
      !used ||
      [
        "switch",
        "relay",
        "timer",
        "sensor",
        "pump",
        "water_wheel",
        "sluice",
        "gate",
        "lamp",
        "wire",
      ].includes(t.id)
    )
      this.panel("inspector");
  }
  transferDrawer(slot: number, withdraw: boolean) {
    if (!this.anchor) return;
    const d = this.drawers[cellKey(this.anchor)];
    if (!d) return;
    const source = withdraw ? d.slots : this.inventory.slots,
      s = source[slot];
    if (!s) return;
    const left = withdraw ? this.inventory.addStack(s) : deposit(d.slots, s);
    if (left === s.count) return;
    if (left) s.count = left;
    else source[slot] = null;
    this.inventory.version++;
    const a = this.anchor;
    if (withdraw && !d.slots.some(Boolean) && this.world.get(a.x, a.y, a.z) === "recovery_crate")
      this.change(a, "air");
  }
  register(name: string, color = "#76d2bb", visible = true) {
    const p = this.anchor;
    if (
      !p ||
      this.world.get(p.x, p.y, p.z) !== "marker_stand" ||
      !this.world.isSolid(p.x, p.y - 1, p.z) ||
      this.world.isSolid(p.x, p.y + 1, p.z) ||
      this.world.isSolid(p.x, p.y + 2, p.z)
    )
      return this.message("Clear the space above the marker and support its base.");
    this.markers = this.markers.filter((m) => cellKey(m) !== cellKey(p));
    this.markers.push({ ...p, name: name.trim().slice(0, 32) || "Camp", color, visible });
    this.message("Recovery point registered.");
  }
  save() {
    const data: ExpeditionSave = {
      tick: this.tick,
      dayOffset: this.dayOffset,
      cause: this.cause,
      body: { ...this.body },
      inventory: this.inventory.save(),
      ecology: this.ecology.save(),
      selected: this.selected,
      last: this.last,
      edits: this.world.edits,
      variants: this.world.variants,
      facings: this.world.facings,
      supports: this.supports,
      cotPartners: this.cotPartners,
      markers: this.markers,
      pickups: this.pickups,
      drawers: this.drawers,
      discovered: [...this.discovered],
      weather: this.weatherOverride,
      flying: this.flying,
    };
    return saveLocalWorld(this.start.info, data).then(() => {
      this.status = "Saved on this device";
    });
  }
}

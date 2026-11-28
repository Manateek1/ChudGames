import { BLOCKS } from "../world/blocks";
import { groundPath } from "./pathfinding";
import { Inventory } from "./inventory";
import { roll, separation, type Actor, type Pos, type SystemWorld } from "./worldTypes";
import type { Fluids } from "./fluids";

type Role = "land" | "aquatic" | "threat" | "ambient";
type Style = "walk" | "swim" | "fly";
interface Species {
  id: string;
  health: number;
  speed: number;
  min: number;
  max: number;
  width: number;
  height: number;
  biomes: string[];
  role: Role;
  style: Style;
  color: number;
  accent: number;
}
function species(
  id: string,
  health: number,
  speed: number,
  min: number,
  max: number,
  width: number,
  height: number,
  biomes: string,
  role: Role,
  style: Style,
  color: number,
  accent: number,
): Species {
  return {
    id,
    health,
    speed,
    min,
    max,
    width,
    height,
    biomes: biomes.split(" "),
    role,
    style,
    color,
    accent,
  };
}
export const SPECIES: Record<string, Species> = Object.fromEntries(
  [
    species(
      "dune_runner",
      18,
      3.8,
      2,
      4,
      0.54,
      0.52,
      "storm_coast salt_basin silt_meadow",
      "land",
      "walk",
      0xbe825a,
      0x6a3d38,
    ),
    species("marsh_hen", 20, 2.1, 2, 3, 0.47, 0.62, "lantern_fen", "land", "walk", 0x547c70, 0xdaa44f),
    species(
      "cliff_grazer",
      60,
      2.6,
      2,
      4,
      0.95,
      1.38,
      "wind_ridge frost_crown frostwood",
      "land",
      "walk",
      0xc0b4a0,
      0x6b5d58,
    ),
    species("alder_glider", 22, 4.6, 1, 2, 0.63, 0.43, "rainwood", "land", "fly", 0xa76240, 0xe0bd79),
    species(
      "lantern_moth",
      8,
      1.8,
      2,
      5,
      0.31,
      0.23,
      "lantern_fen root_vault",
      "ambient",
      "fly",
      0x9aa180,
      0xfbd46c,
    ),
    species(
      "shellback",
      26,
      1.5,
      1,
      3,
      0.66,
      0.38,
      "storm_coast brine_bay",
      "land",
      "walk",
      0x92555c,
      0xe7b690,
    ),
    species(
      "shoal_darter",
      12,
      3.1,
      3,
      6,
      0.34,
      0.21,
      "storm_coast brine_bay lantern_fen",
      "aquatic",
      "swim",
      0x5a9998,
      0xf9c35c,
    ),
    species("cave_slug", 16, 0.7, 1, 3, 0.42, 0.29, "root_vault", "ambient", "walk", 0x77a8a4, 0xb4e9b6),
    species(
      "husk_beetle",
      36,
      2.4,
      1,
      2,
      0.72,
      0.48,
      "red_scrub cinder_shelf",
      "threat",
      "walk",
      0xaf6447,
      0xe5a856,
    ),
    species(
      "slate_stalker",
      48,
      3.6,
      1,
      1,
      0.77,
      1.25,
      "slate_galleries crystal_fault",
      "threat",
      "walk",
      0x454f69,
      0xb3aff1,
    ),
    species(
      "ember_crawler",
      44,
      2.9,
      1,
      2,
      0.82,
      0.57,
      "thermal_hollows",
      "threat",
      "walk",
      0x814853,
      0xfc9c54,
    ),
  ].map((def) => [def.id, def]),
);
export interface Creature extends Pos {
  id: string;
  species: string;
  health: number;
  heading: number;
  speed: number;
  state: string;
  born: number;
  juvenile: boolean;
  owner?: string;
  fed: number;
  breedUntil: number;
  ready: boolean;
  shedAt: number;
  egg: boolean;
  attackAt: number;
  phaseUntil: number;
  unseen: number;
  active: number;
  perchScanAfter?: number;
  flight?: { start: Pos; end: Pos; distance: number; fraction: number; returning?: boolean };
  flashUntil?: number;
  alert?: Pos;
  lastHurt?: number;
}
export interface Payload extends Pos {
  stack: { id: string; count: number };
  owner?: string;
  unlock: number;
  expire: number;
}
export interface Shot extends Pos {
  vx: number;
  vy: number;
  vz: number;
  until: number;
}
const limits: Record<Role, number> = { land: 60, aquatic: 36, threat: 24, ambient: 30 };
const solid = (w: SystemWorld, x: number, y: number, z: number) =>
  Boolean(BLOCKS[w.get(Math.floor(x), Math.floor(y), Math.floor(z))]?.solid);
const rand = (c: Creature, tick: number, salt: number) => roll(c.id, tick, 0, salt);
const canopy = (id: string) => id === "foliage" || id === "alder_log";

function clearGliderBody(w: SystemWorld, p: Pos) {
  const half = SPECIES.alder_glider.width / 2;
  for (let x = Math.floor(p.x - half); x <= Math.floor(p.x + half); x++) {
    for (let z = Math.floor(p.z - half); z <= Math.floor(p.z + half); z++) {
      for (let y = Math.floor(p.y + 0.005); y <= Math.floor(p.y + SPECIES.alder_glider.height); y++) {
        const block = w.get(x, y, z);
        if (block === "foliage" || BLOCKS[block]?.solid) return false;
      }
    }
  }
  return true;
}
function canopyPerches(w: SystemWorld, center: Pos, radius: number, low: boolean) {
  const spots: Pos[] = [];
  const ox = Math.floor(center.x),
    oz = Math.floor(center.z);
  for (let ring = 0; ring <= radius; ring++)
    for (let dx = -ring; dx <= ring; dx++)
      for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const x = ox + dx,
          z = oz + dz,
          terrain = w.surface(x, z);
        for (let y = terrain + 1; y <= terrain + 10; y++) {
          const id = w.get(x, y, z);
          if (!canopy(id)) continue;
          const add = (px: number, py: number, pz: number) => {
            const candidate = { x: px + 0.5, y: py, z: pz + 0.5 };
            if (clearGliderBody(w, candidate)) spots.push(candidate);
          };
          add(x, y + 1, z);
          // An exposed trunk also provides a low feeding perch for a glider clinging to its side.
          if (low && id === "alder_log" && Math.abs(y - center.y) <= 1.8) {
            add(x - 1, y, z);
            add(x + 1, y, z);
            add(x, y, z - 1);
            add(x, y, z + 1);
          }
        }
        if (spots.length >= 48) return spots;
      }
  return spots;
}
function gliderPosition(a: Pos, b: Pos, distance: number, fraction: number): Pos {
  return {
    x: a.x + (b.x - a.x) * fraction,
    z: a.z + (b.z - a.z) * fraction,
    y: a.y + (b.y - a.y) * fraction + Math.sin(fraction * Math.PI) * Math.min(1.4, distance * 0.25),
  };
}
function hasSupport(w: SystemWorld, p: Pos) {
  const x = Math.floor(p.x),
    y = Math.floor(p.y),
    z = Math.floor(p.z);
  return (
    canopy(w.get(x, y - 1, z)) ||
    w.get(x - 1, y, z) === "alder_log" ||
    w.get(x + 1, y, z) === "alder_log" ||
    w.get(x, y, z - 1) === "alder_log" ||
    w.get(x, y, z + 1) === "alder_log"
  );
}
function clearFlight(w: SystemWorld, from: Pos, to: Pos) {
  const distance = separation(from, to),
    steps = Math.ceil(distance * 3);
  if (distance < 1 || distance > 15 || !hasSupport(w, to)) return false;
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    const sightCell = w.get(
      Math.floor(from.x + (to.x - from.x) * f),
      Math.floor(from.y + (to.y - from.y) * f + 0.3),
      Math.floor(from.z + (to.z - from.z) * f),
    );
    if (
      sightCell === "foliage" ||
      BLOCKS[sightCell]?.solid ||
      !clearGliderBody(w, gliderPosition(from, to, distance, f))
    )
      return false;
  }
  return true;
}
export class Population {
  creatures: Creature[];
  drops: Payload[];
  shots: Shot[] = [];
  next: number;
  seed: string;
  private paths = new Map<string, Pos[]>();
  constructor(seed: string, saved?: { creatures: Creature[]; drops: Payload[]; next: number }) {
    this.seed = seed;
    this.creatures = saved?.creatures ?? [];
    this.drops = saved?.drops ?? [];
    this.next = saved?.next ?? 1;
  }
  spawn(species: string, p: Pos, tick: number, juvenile = false) {
    const d = SPECIES[species],
      id = String(this.next++);
    const c: Creature = {
      ...p,
      id,
      species,
      health: d.health,
      heading: roll(this.seed, this.next, 0, 4) * Math.PI * 2,
      speed: 0,
      state: "rest",
      born: tick,
      juvenile,
      fed: 0,
      breedUntil: 0,
      ready: false,
      shedAt: 0,
      egg: false,
      attackAt: 0,
      phaseUntil: 0,
      unseen: 0,
      active: 0,
    };
    this.creatures.push(c);
    return c;
  }
  candidate(world: SystemWorld, fluids: Fluids, actor: Actor, tick: number, light: (p: Pos) => number) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const a = roll(this.seed, tick, attempt, 1) * Math.PI * 2,
        r = 24 + 40 * roll(this.seed, tick, attempt, 2);
      const x = Math.floor(actor.x + Math.cos(a) * r),
        z = Math.floor(actor.z + Math.sin(a) * r);
      const ground = world.surface(x, z);
      let y = ground + 1;
      const cave = actor.y < ground - 5;
      if (cave) {
        y = Math.floor(actor.y);
        for (let i = 0; i < 7 && !solid(world, x, y - 1, z); i++) y--;
        if (solid(world, x, y, z) || !solid(world, x, y - 1, z)) continue;
      }
      const biome = cave
        ? y < -56
          ? "thermal_hollows"
          : y < -22
            ? "crystal_fault"
            : world.biome(x, z) === "rainwood"
              ? "root_vault"
              : "slate_galleries"
        : world.biome(x, z);
      const p = { x: x + 0.5, y, z: z + 0.5 },
        level = fluids.read(world, { x, y, z }).level;
      const candidates = Object.values(SPECIES).filter(
        (s) =>
          s.biomes.includes(biome) &&
          (s.style === "swim" ? level >= 7 : s.style === "fly" || level < 7) &&
          (s.id !== "slate_stalker" || light(p) <= 5) &&
          (s.id !== "lantern_moth" || light(p) <= 7),
      );
      if (!candidates.length) continue;
      const d = candidates[Math.floor(roll(this.seed, tick, attempt, 3) * candidates.length)];
      const room =
        limits[d.role] - this.creatures.filter((c) => !c.owner && SPECIES[c.species].role === d.role).length;
      const count = Math.min(
        room,
        d.min + Math.floor(roll(this.seed, tick, attempt, 4) * (d.max - d.min + 1)),
      );
      if (d.id === "alder_glider") {
        if (!count) return;
        const canopy = canopyPerches(world, p, 4, false);
        let pair: Pos[] | undefined;
        // Look for two distinct landings with a clear flight path before populating the canopy.
        for (const start of canopy.slice(0, 5)) {
          const other = canopy.find((end) => separation(start, end) >= 2.5 && clearFlight(world, start, end));
          if (other) {
            pair = [start, other];
            break;
          }
        }
        if (!pair) continue;
        for (let i = 0; i < count; i++) {
          const glider = this.spawn(d.id, pair[i], tick);
          glider.phaseUntil = tick + 45 + i * 30;
        }
        return;
      }
      for (let i = 0; i < count; i++) {
        const sx = x + (i % 3) * 1.2,
          sz = z + Math.floor(i / 3) * 1.2;
        let sy = cave ? y : world.surface(Math.floor(sx), Math.floor(sz)) + 1;
        if (d.style === "fly") sy += 1.4;
        if (solid(world, sx, sy, sz) || solid(world, sx, sy + d.height * 0.9, sz)) continue;
        if (
          d.style === "swim" &&
          fluids.read(world, { x: Math.floor(sx), y: Math.floor(sy), z: Math.floor(sz) }).level < 7
        )
          continue;
        this.spawn(d.id, { x: sx + 0.5, y: sy, z: sz + 0.5 }, tick);
      }
      return;
    }
  }
  drop(id: string, p: Pos, tick: number, count = 1) {
    this.drops.push({ x: p.x, y: p.y, z: p.z, stack: { id, count }, unlock: tick, expire: tick + 36000 });
  }
  resolveDamage(c: Creature, damage: number, tick: number) {
    if (c.health <= 0) return;
    const reduction = c.species === "shellback" && c.state === "shelled" ? 0.5 : 1;
    c.lastHurt = tick;
    c.health -= damage * reduction;
    c.state = "hurt";
    c.phaseUntil = tick + 15;
    if (c.health > 0) return;
    const loot: Record<string, string> = {
      cliff_grazer: "hide",
      shellback: "tide_shell",
      husk_beetle: "amber_resin",
      slate_stalker: "hide",
    };
    if (loot[c.species]) this.drop(loot[c.species], c, tick);
    if (c.species === "slate_stalker" && rand(c, tick, 13) < 0.12) this.drop("raw_iron", c, tick);
    this.creatures = this.creatures.filter((e) => e !== c);
    this.paths.delete(c.id);
  }
  target(eye: Pos, dir: Pos, reach: number) {
    let best: Creature | undefined,
      nearest = reach;
    for (const c of this.creatures) {
      const d = SPECIES[c.species],
        half = (d.width * (c.juvenile ? 0.65 : 1)) / 2,
        height = d.height * (c.juvenile ? 0.65 : 1);
      let lo = 0,
        hi = nearest;
      for (const [axis, min, max] of [
        ["x", c.x - half, c.x + half],
        ["y", c.y, c.y + height],
        ["z", c.z - half, c.z + half],
      ] as const) {
        const v = dir[axis],
          o = eye[axis];
        if (!v) {
          if (o < min || o > max) {
            hi = -1;
            break;
          }
          continue;
        }
        const t = (min - o) / v,
          u = (max - o) / v;
        lo = Math.max(lo, Math.min(t, u));
        hi = Math.min(hi, Math.max(t, u));
      }
      if (hi >= lo) {
        best = c;
        nearest = lo;
      }
    }
    return best;
  }
  private sight(w: SystemWorld, c: Creature, actor: Actor) {
    const target = { ...actor, y: actor.y + 1 },
      eye = { ...c, y: c.y + SPECIES[c.species].height * 0.8 },
      steps = Math.ceil(separation(eye, target) * 1.5);
    for (let i = 1; i < steps; i++)
      if (
        solid(
          w,
          eye.x + ((target.x - eye.x) * i) / steps,
          eye.y + ((target.y - eye.y) * i) / steps,
          eye.z + ((target.z - eye.z) * i) / steps,
        )
      )
        return false;
    return true;
  }
  private seek(c: Creature, point: Pos, state: string, speed: number, tick: number) {
    c.heading = Math.atan2(point.x - c.x, point.z - c.z);
    c.state = state;
    c.speed = speed;
    c.phaseUntil = tick + 24;
  }
  private towardGround(c: Creature, tick: number, w: SystemWorld, test: (p: Pos) => boolean) {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Number(c.id) * 0.4,
        r = 2 + rand(c, Math.floor(tick / 60), i) * 3;
      const x = Math.floor(c.x + Math.sin(a) * r),
        z = Math.floor(c.z + Math.cos(a) * r),
        y = Math.floor(c.y);
      const p = { x, y, z };
      if (!solid(w, x, y, z) && test(p)) return p;
    }
  }
  private glide(w: SystemWorld, c: Creature, actor: Actor, tick: number, decision: number) {
    const grain = actor.heldId === "grain" && separation(actor, c) < 12;
    if (!c.flight) {
      c.speed = 0;
      c.state = "rest";
      if ((tick + Number(c.id)) % decision !== 0 || tick < (c.perchScanAfter ?? 0)) return;
      if (grain ? separation(c, actor) <= 2.15 && hasSupport(w, c) : tick < c.phaseUntil) return;
      c.perchScanAfter = tick + 45;
      const origin = grain ? actor : c;
      const candidates = canopyPerches(w, origin, grain ? 3 : 6, grain).filter(
        (p) => separation(c, p) >= 1.5 && (!grain || (p.y <= c.y && separation(actor, p) <= 2.5)),
      );
      // Lower perches must be within feeding reach. Wild gliders favor a farther branch.
      candidates.sort((a, b) =>
        grain ? separation(a, actor) - separation(b, actor) : separation(b, c) - separation(a, c),
      );
      const end = candidates.find(
        (p) =>
          clearFlight(w, c, p) &&
          !this.creatures.some(
            (other) =>
              other !== c &&
              other.species === "alder_glider" &&
              separation(other.flight?.end ?? other, p) < 0.68,
          ),
      );
      if (!end) return;
      const start = { x: c.x, y: c.y, z: c.z };
      c.flight = { start, end, distance: separation(start, end), fraction: 0 };
      c.state = grain ? "follow grain" : "glide";
      c.heading = Math.atan2(end.x - c.x, end.z - c.z);
    }
    const flight = c.flight;
    if (!flight.returning && !hasSupport(w, flight.end)) {
      flight.returning = true;
      c.heading += Math.PI;
    }
    c.speed = SPECIES.alder_glider.speed;
    const step = c.speed / (30 * flight.distance);
    const next = Math.max(0, Math.min(1, flight.fraction + (flight.returning ? -step : step)));
    const p = gliderPosition(flight.start, flight.end, flight.distance, next);
    if (!clearGliderBody(w, p)) {
      if (!flight.returning) {
        flight.returning = true;
        c.heading += Math.PI;
        return;
      }
      c.flight = undefined;
      c.speed = 0;
      c.state = "rest";
      c.phaseUntil = tick + 6;
      return;
    }
    c.x = p.x;
    c.y = p.y;
    c.z = p.z;
    flight.fraction = next;
    if (next === 0 || next === 1) {
      c.flight = undefined;
      c.speed = 0;
      c.state = "rest";
      c.phaseUntil = tick + 75 + Math.floor(rand(c, tick, 5) * 60);
    }
  }
  tick(
    w: SystemWorld,
    fluids: Fluids,
    actor: Actor,
    tick: number,
    light: (p: Pos) => number,
    storm = false,
    solarTick = tick,
  ) {
    if (tick % 60 === 0) this.candidate(w, fluids, actor, tick, light);
    let remainingPaths = 2;
    for (const c of this.creatures) {
      const d = SPECIES[c.species],
        dist = separation(actor, c);
      if (dist > 80) {
        c.unseen++;
        continue;
      }
      c.unseen = 0;
      c.active++;
      const decision = dist < 40 ? 6 : 30;
      if (c.species === "alder_glider") {
        this.glide(w, c, actor, tick, decision);
        continue;
      }
      if ((tick + Number(c.id)) % decision === 0) {
        const toward = Math.atan2(actor.x - c.x, actor.z - c.z);
        const food = c.species === "dune_runner" ? "grain" : c.species === "cave_slug" ? "fungus_cap" : null;
        if (food && tick >= c.breedUntil) {
          const morsel = this.drops.find(
            (d) => d.stack.id === food && d.stack.count > 0 && separation(d, c) < 3,
          );
          if (morsel) {
            if (separation(morsel, c) < 1.3) {
              morsel.stack.count--;
              c.ready = c.species === "cave_slug";
            } else {
              c.heading = Math.atan2(morsel.x - c.x, morsel.z - c.z);
              c.speed = d.speed;
              c.state = "forage";
              c.phaseUntil = tick + 30;
            }
          }
        }
        const fluid = fluids.read(w, { x: Math.floor(c.x), y: Math.floor(c.y), z: Math.floor(c.z) });
        const coldLiquid = d.id === "ember_crawler" && fluid.level >= 2;
        const runnerFast = Math.hypot(actor.vx ?? 0, actor.vz ?? 0) > 4.5;
        const species = c.species;
        let responding = true;
        if (coldLiquid) {
          c.heading = toward + Math.PI;
          c.state = "retreat";
          c.speed = d.speed;
          c.phaseUntil = tick + 30;
        } else if (species === "slate_stalker" && (light(c) > 11 || tick < (c.flashUntil ?? 0))) {
          if (light(c) > 11) c.flashUntil = tick + 120;
          c.heading = toward + Math.PI;
          c.speed = d.speed;
          c.state = "seek shade";
        } else if (
          (d.role === "threat" && dist < (species === "husk_beetle" ? 6 : 12)) ||
          (species === "cliff_grazer" && tick - (c.lastHurt ?? -10000) < 120 && dist < 5)
        ) {
          const visible = this.sight(w, c, actor),
            heard = runnerFast && dist < 8;
          if (visible || heard) c.alert = { x: actor.x, y: actor.y, z: actor.z };
          const target = c.alert;
          if (c.attackAt > tick) {
            c.speed = species === "ember_crawler" ? d.speed * 0.75 : 0;
            c.state = species === "ember_crawler" ? "retreat" : "recover";
            if (species === "ember_crawler") c.heading = toward + Math.PI;
          } else if (visible && dist < 2) {
            if (c.state === "warn" && tick >= c.phaseUntil) {
              const damage =
                species === "husk_beetle"
                  ? 15
                  : species === "slate_stalker"
                    ? 22
                    : species === "cliff_grazer"
                      ? 18
                      : 16;
              if (!actor.immune) actor.health = Math.max(0, actor.health - damage);
              c.attackAt = tick + (species === "husk_beetle" ? 45 : species === "slate_stalker" ? 21 : 30);
              c.state = species === "ember_crawler" ? "leap" : "strike";
              c.phaseUntil = tick + 9;
            } else if (c.state !== "warn") {
              c.phaseUntil = tick + (species === "husk_beetle" ? 18 : species === "slate_stalker" ? 1 : 12);
              c.state = "warn";
              c.speed = 0;
            }
          } else if (target && separation(target, c) > 0.8)
            this.seek(c, target, visible ? "pursue" : "investigate", d.speed, tick);
          else {
            c.alert = undefined;
            responding = false;
          }
        } else if (
          species === "shellback" &&
          dist < 2 &&
          (c.state !== "shelled" ? tick >= c.attackAt : tick < c.phaseUntil)
        ) {
          if (c.state !== "shelled") {
            c.phaseUntil = tick + 180;
            c.attackAt = tick + 240;
          }
          c.state = "shelled";
          c.speed = 0;
        } else if (species === "lantern_moth" && light(c) > 11) {
          const shade = this.towardGround(c, tick, w, (p) => light(p) <= 9);
          if (shade) this.seek(c, shade, "seek shade", d.speed, tick);
          else {
            c.state = "rest";
            c.speed = 0;
          }
        } else if (
          species === "marsh_hen" &&
          this.creatures.some((other) => SPECIES[other.species].role === "threat" && separation(other, c) < 5)
        ) {
          const chaser = this.creatures.find(
            (other) => SPECIES[other.species].role === "threat" && separation(other, c) < 5,
          )!;
          c.heading = Math.atan2(c.x - chaser.x, c.z - chaser.z);
          c.speed = d.speed;
          c.state = "flee";
        } else if (
          (species === "dune_runner" && runnerFast && dist < 5) ||
          (species === "shoal_darter" && runnerFast && dist < 6)
        ) {
          c.heading = toward + Math.PI;
          c.speed = d.speed;
          c.state = "flee";
        } else if (species === "cliff_grazer" && storm) {
          const roof = this.towardGround(
            c,
            tick,
            w,
            (p) => solid(w, p.x, p.y + 2, p.z) || solid(w, p.x, p.y + 3, p.z),
          );
          if (roof) this.seek(c, roof, "shelter", d.speed * 0.6, tick);
          else responding = false;
        } else if (species === "shellback" && Math.cos((solarTick * Math.PI * 2) / 21600) < 0) {
          const wet = this.towardGround(c, tick, w, (p) => {
            const l = fluids.read(w, p);
            return l.kind === "brine" && l.level >= 2 && l.level <= 6;
          });
          if (wet) this.seek(c, wet, "follow tide", d.speed * 0.7, tick);
          else responding = false;
        } else if (c.owner && dist > 6 && dist < 24) this.seek(c, actor, "follow", d.speed, tick);
        else responding = false;
        if (
          !responding &&
          (tick >= c.phaseUntil || c.state === "follow" || c.state === "flee" || c.state === "shelled")
        ) {
          c.heading += (rand(c, tick, 0) - 0.5) * 2.8;
          c.speed = rand(c, tick, 1) > 0.55 ? d.speed * 0.42 : 0;
          c.state = c.speed ? "wander" : "rest";
          c.phaseUntil = tick + 45 + rand(c, tick, 2) * 75;
        }
        if (c.juvenile && c.active >= 9000 && !solid(w, c.x, c.y + d.height, c.z)) c.juvenile = false;
        if (
          c.species === "marsh_hen" &&
          c.owner &&
          !c.juvenile &&
          c.active - c.shedAt >= 5400 &&
          ["peat", "loam"].includes(w.get(Math.floor(c.x), Math.floor(c.y) - 1, Math.floor(c.z))) &&
          Array.from({ length: 8 }, (_, i) => i + 1).some((dy) => solid(w, c.x, c.y + dy, c.z))
        ) {
          c.egg = true;
          c.shedAt = c.active;
        }
        if (c.species === "lantern_moth" && c.active - c.shedAt >= 600 && light(c) <= 7) {
          const x = Math.floor(c.x),
            z = Math.floor(c.z),
            y = Math.floor(c.y);
          if (["peat", "red_clay"].includes(w.get(x, y - 1, z)) && w.get(x, y, z) === "air") {
            w.set(x, y, z, "fungus");
            c.shedAt = c.active;
          }
        }
        const shed: Record<string, [number, string]> = {
          dune_runner: [7200, "brush_fiber"],
          cliff_grazer: [14400, "hide"],
          shellback: [10800, "tide_shell"],
        };
        const reward = shed[c.species];
        if (reward && c.active - c.shedAt >= reward[0]) {
          this.drop(reward[1], c, tick);
          c.shedAt = c.active;
        }
      }
      if (!c.speed) continue;
      const path = this.paths.get(c.id),
        node = path?.[0];
      if (node && d.style === "walk") {
        if (Math.hypot(c.x - node.x, c.z - node.z) < 0.22) path!.shift();
        else c.heading = Math.atan2(node.x - c.x, node.z - c.z);
      }
      if ((tick + Number(c.id)) % 6 === 0 && d.style !== "walk") {
        for (const other of this.creatures) {
          if (other.id === c.id || Math.abs(other.y - c.y) > 1) continue;
          const dx = c.x - other.x,
            dz = c.z - other.z,
            r2 = dx * dx + dz * dz;
          if (r2 > 0 && r2 < 0.25) {
            c.heading = Math.atan2(dx, dz);
            break;
          }
        }
      }
      const nx = c.x + (Math.sin(c.heading) * c.speed) / 30,
        nz = c.z + (Math.cos(c.heading) * c.speed) / 30;
      let ny = c.y;
      if (d.style === "walk") {
        if (solid(w, nx, ny + 0.05, nz)) ny += 1;
        if (!solid(w, nx, ny - 0.05, nz)) ny -= 0.2;
      } else if (
        d.style === "swim" &&
        fluids.read(w, { x: Math.floor(nx), y: Math.floor(ny), z: Math.floor(nz) }).level < 4
      ) {
        c.heading += 1.2;
        continue;
      } else if (d.style === "fly") {
        ny += Math.sin(tick * 0.035 + Number(c.id)) * 0.013;

        if (c.y >= w.surface(Math.floor(nx), Math.floor(nz)) - 1)
          ny = Math.max(w.surface(Math.floor(nx), Math.floor(nz)) + 1, ny);
      }
      if (!solid(w, nx, ny + 0.05, nz) && !solid(w, nx, ny + d.height - 0.02, nz)) {
        c.x = nx;
        c.y = ny;
        c.z = nz;
      } else {
        if (d.style === "walk" && remainingPaths > 0 && (tick + Number(c.id)) % 6 === 0) {
          const dest =
            c.state === "pursue" || c.state === "follow"
              ? actor
              : { x: c.x + Math.sin(c.heading) * 5, y: c.y, z: c.z + Math.cos(c.heading) * 5 };
          this.paths.set(c.id, groundPath(w, c, dest, d.width, d.height));
          remainingPaths--;
        }
        c.heading += 1.35;
      }
    }
    if (tick % 60 === 0) {
      this.creatures = this.creatures.filter((c) => c.owner || c.unseen < 2700);
      this.drops = this.drops.filter((d) => d.expire > tick && d.stack.count > 0);
    }
    this.shots = this.shots.filter((s) => {
      if (tick >= s.until) return false;
      const length = Math.hypot(s.vx, s.vy, s.vz),
        dir = { x: s.vx / length, y: s.vy / length, z: s.vz / length };
      const reach = length / 30;
      for (let dist = 0.1; dist <= reach + 0.099; dist += 0.1) {
        const step = Math.min(reach, dist),
          p = { x: s.x + dir.x * step, y: s.y + dir.y * step, z: s.z + dir.z * step };
        if (solid(w, p.x, p.y, p.z)) return false;
        const hit = this.target(s, dir, step);
        if (hit) {
          this.resolveDamage(hit, 14, tick);
          return false;
        }
      }
      s.x += s.vx / 30;
      s.y += s.vy / 30;
      s.z += s.vz / 30;
      s.vy -= 20 / 30;
      return true;
    });
  }
  collect(inv: Inventory, p: Actor, tick: number) {
    this.drops = this.drops.filter((d) => {
      if ((d.owner !== p.id && tick < d.unlock) || separation(p, d) > 1.8) return true;
      d.stack.count = inv.add(d.stack.id, d.stack.count);
      return d.stack.count > 0;
    });
  }
  interact(id: string, inv: Inventory, slot: number, actor: Actor, tick: number) {
    const c = this.creatures.find((e) => e.id === id);
    if (!c || separation(actor, c) > 2.8) return null;
    const held = inv.slots[slot];
    if (c.egg) {
      if (inv.add("egg")) return "Your pack is full.";
      c.egg = false;
      return "Collected an egg.";
    }
    if (
      c.species === "shoal_darter" &&
      held?.id === "water_flask" &&
      held.fill === 8 &&
      separation(actor, c) <= 2.2
    ) {
      inv.slots[slot] = { id: "fish_flask", count: 1, fill: 8, variant: c.species, vitality: c.health };
      inv.version++;
      this.creatures = this.creatures.filter((e) => e !== c);
      return "Captured a shoal darter.";
    }
    if ((c.species === "marsh_hen" || c.species === "alder_glider") && held?.id === "grain") {
      if (c.owner && c.owner !== (actor.id ?? "local")) return "This animal belongs to another explorer.";
      if (c.species === "alder_glider") {
        if (c.active - c.shedAt < 2700 && c.shedAt > 0) return "Already fed.";
        inv.take(slot);
        c.shedAt = c.active;
        this.drop("alder_seed", c, tick);
        return "The glider scattered a seed.";
      }
      if (c.juvenile) return "This hen is still growing.";
      if (c.owner && tick < c.breedUntil) return "The hen is resting.";
      inv.take(slot);
      if (!c.owner) {
        c.fed++;
        if (c.fed >= 3) c.owner = actor.id ?? "local";
        return c.owner ? "Marsh hen bonded." : "The hen accepts the grain.";
      }
      c.ready = true;
      return "Hen ready to breed.";
    }
    return null;
  }
}

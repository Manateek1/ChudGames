import { Block, Item, blockOf, definition, isItem, isPlaceable, isSolid, itemInfo, recipes, stateOf, toolStats, withState } from "./blocks";
import type { Recipe } from "./blocks";
import { blockNeighbors, Circuits, interactedCircuit, placedCircuit, pointKey, shifted } from "./circuits";
import { Creatures } from "./creatures";
import { copyInventory, craftInto, HOTBAR_COUNT, matchGrid, moveSlot, restoreInventory, spend, stash, startingInventory } from "./inventory";
import type { Inventory } from "./inventory";
import { realmNames } from "./protocol";
import type { ClientMessage, Controls, HudState, MachineSave, MobView, Mode, PlayerAction, PlayerSave, Realm, SaveData, ServerMessage, Station } from "./protocol";
import { canOccupy, EYE_HEIGHT, lookVector, moveAxis, overlapsBlock, raycastVoxel } from "./spatial";
import type { Position, VoxelHit } from "./spatial";
import { VoxelWorld } from "./world";

export const TICK_MS = 50;
const DAY_TICKS = 24_000;
const SMELT_TICKS = 200;
const REACH = 5.5;
const START_NOTICE = "Gather cedar, craft tools, and explore the illuminated ruins.";
const realms: Realm[] = ["surface", "underdeep", "skyreach"];
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const finite = (value: number, fallback = 0): number => Number.isFinite(value) ? value : fallback;
const neutral: Controls = { forward: 0, strafe: 0, jump: false, sprint: false, descend: false, mine: false, yaw: 0, pitch: 0 };
const hazardBlocks = new Set<number>([Block.Water, Block.Ember]);
const damageableBlocks = new Set<number>([Block.Stone, Block.Sandstone, Block.CopperOre, Block.Basalt, Block.Crystal, Block.Cloudstone, Block.Glowstone, Block.Brick, Block.Furnace]);
const adventureHarvest = new Set<number>([Block.Timber, Block.Leaves, Block.BerryBush, Block.Stone, Block.CopperOre, Block.Glowstone, Block.Basalt, Block.Crystal, Block.Sand, Block.Sod, Block.Soil]);
const adventurePlace = new Set<number>([Block.Wood, Block.Soil, Block.Bench, Block.Furnace, Block.RiftGate, Block.SkyGate]);
const refining = new Map<number, number>([[Block.CopperOre, Item.CopperIngot], [Block.Sand, Block.Glass], [Block.Soil, Block.Brick], [Item.Ration, Item.HearthStew]]);
const food = new Map<number, [hunger: number, saturation: number, recovery: number]>([[Item.Ration, [5, 4, 0]], [Item.HearthStew, [9, 7, 2]], [Item.TrailTonic, [2, 2, 8]]]);

interface LocalRealm {
  world: VoxelWorld;
  circuits: Circuits;
  events: Map<string, { point: Position; at: number }>;
}

type QueuedIntent = { message: ClientMessage; yaw: number; pitch: number };

function pseudoRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x9e3779b9) | 0;
    let mixed = Math.imul(seed ^ (seed >>> 16), 0x21f0aaad);
    mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97);
    return ((mixed ^ (mixed >>> 15)) >>> 0) / 4_294_967_296;
  };
}

export class Simulation {
  readonly seed: string;
  readonly mode: Mode;
  private readonly seedHash: number;
  private readonly send: (message: ServerMessage) => void;
  private readonly localRealms = new Map<Realm, LocalRealm>();
  private readonly mobs = new Creatures();
  private readonly machines = new Map<string, MachineSave>();
  private readonly queued: QueuedIntent[] = [];
  private readonly loaded = new Set<string>();
  private readonly dirty = new Set<string>();
  private readonly savedEdits: SaveData["realms"];
  private readonly terrainRevision: NonNullable<SaveData["terrainRevision"]>;
  private realm: Realm;
  private position: Position;
  private velocity: Position = [0, 0, 0];
  private controls: Controls = { ...neutral };
  private inventory: Inventory;
  private selected = 0;
  private health = 20;
  private hunger = 20;
  private saturation = 6;
  private exhaustion = 0;
  private xp = 0;
  private air = 240;
  private damageCooldown = 0;
  private attackCooldown = 0;
  private tonicUntil = 0;
  private travelCooldown = 0;
  private fly = false;
  private paused = false;
  private dead = false;
  private tickNumber: number;
  private radius: number;
  private center: string | null = null;
  private notice = START_NOTICE;
  private noticeUntil = 220;
  private target: VoxelHit | null = null;
  private miningPoint = "";
  private mining = 0;
  private grounded = false;
  private fallDistance = 0;

  constructor(message: Extract<ClientMessage, { type: "init" }>, send: (message: ServerMessage) => void) {
    const saved = message.saved?.version === 1 ? message.saved : undefined;
    this.seed = (saved?.seed || message.seed || "juniper").slice(0, 80);
    this.mode = saved?.mode ?? message.mode;
    this.send = send;
    this.seedHash = [...this.seed].reduce((hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619), 2166136261);
    this.realm = saved && realms.includes(saved.realm) ? saved.realm : "surface";
    this.savedEdits = saved?.realms ?? { surface: [], underdeep: [], skyreach: [] };
    this.terrainRevision = saved ? saved.terrainRevision ?? 1 : 2;
    this.radius = clamp(Math.round(finite(message.radius, 2)), 1, 5);
    this.tickNumber = Math.max(0, Math.floor(finite(saved?.tick ?? 0)));
    const player = saved?.player;
    this.inventory = player && Array.isArray(player.inventory) ? restoreInventory(player.inventory) : startingInventory(this.creative);
    this.position = player && [player.x, player.y, player.z].every(Number.isFinite) && player.y >= -67 && player.y < 321
      ? [player.x, player.y, player.z] : this.safeSpawn();
    if (!canOccupy(this.world, ...this.position)) this.position = this.safeSpawn();
    if (player) {
      this.health = clamp(finite(player.health, 20), 0, 20);
      this.hunger = clamp(finite(player.hunger, 20), 0, 20);
      this.xp = Math.max(0, Math.floor(finite(player.xp)));
      this.selected = clamp(Math.floor(finite(player.selected)), 0, HOTBAR_COUNT - 1);
      this.dead = Boolean(player.dead) || this.health === 0;
      this.controls.yaw = finite(player.yaw) % (2 * Math.PI);
      this.controls.pitch = clamp(finite(player.pitch), -1.56, 1.56);
      this.noticeUntil += this.tickNumber;
    }
    for (const machine of saved?.machines ?? []) {
      if (realms.includes(machine.realm) && machine.point.length === 3 &&
        machine.point.every(Number.isInteger) && isItem(machine.item) && Number.isFinite(machine.remaining)) {
        this.machines.set(this.machineKey(machine.point, machine.realm), { ...machine, point: [...machine.point] });
      }
    }
    this.send({ type: "reset", realm: this.realm });
    this.refreshTarget();
    this.send({ type: "ready", state: this.state() });
    this.streamChunks();
  }

  private get creative(): boolean { return this.mode === "creative"; }
  private get active(): LocalRealm {
    let local = this.localRealms.get(this.realm);
    if (!local) {
      const edits = this.savedEdits[this.realm] ?? [];
      local = { world: new VoxelWorld(this.seed, this.realm, edits, this.terrainRevision), circuits: new Circuits(edits), events: new Map() };
      for (const [x, y, z, code] of edits) if (blockOf(code) === Block.BerryBush && stateOf(code) === 1) {
        local.events.set(pointKey([x, y, z]), { point: [x, y, z], at: this.tickNumber + 240 });
      }
      this.localRealms.set(this.realm, local);
    }
    return local;
  }
  private get world(): VoxelWorld { return this.active.world; }
  private get daylight(): boolean { return this.realm === "surface" && this.tickNumber % DAY_TICKS < 13_400; }
  private get stack() { return this.inventory[this.selected]; }

  receive(message: ClientMessage): void {
    if (message.type === "input") {
      const { value } = message;
      this.controls = {
        forward: clamp(finite(value.forward), -1, 1),
        strafe: clamp(finite(value.strafe), -1, 1),
        yaw: finite(value.yaw, this.controls.yaw) % (2 * Math.PI),
        pitch: clamp(finite(value.pitch, this.controls.pitch), -1.56, 1.56),
        jump: Boolean(value.jump), sprint: Boolean(value.sprint), descend: Boolean(value.descend), mine: Boolean(value.mine),
      };
      return;
    }
    if (message.type === "pause") {
      this.processQueued();
      this.paused = message.value;
      if (this.paused) {
        Object.assign(this.controls, { forward: 0, strafe: 0, jump: false, sprint: false, descend: false, mine: false });
        this.mining = 0;
        this.miningPoint = "";
        this.save();
      }
      return;
    }
    if (message.type === "save") {
      this.processQueued();
      this.save();
      return;
    }
    if (message.type !== "init" && this.queued.length < 64) {
      this.queued.push({ message, yaw: this.controls.yaw, pitch: this.controls.pitch });
    }
  }

  private processQueued(): boolean {
    const intents = this.queued.splice(0);
    for (const { message, yaw, pitch } of intents) {
      const previousRealm = this.realm;
      const view = { yaw: this.controls.yaw, pitch: this.controls.pitch };
      if (message.type === "action") Object.assign(this.controls, { yaw, pitch });
      this.process(message);
      if (this.realm !== previousRealm) break;
      Object.assign(this.controls, view);
    }
    return intents.length > 0;
  }

  step(): void {
    const changed = this.processQueued();
    if (!this.paused && !this.dead) {
      this.tickNumber++;
      this.damageCooldown = Math.max(0, this.damageCooldown - 1);
      this.attackCooldown = Math.max(0, this.attackCooldown - 1);
      this.travelCooldown = Math.max(0, this.travelCooldown - 1);
      const random = pseudoRandom(this.seedHash ^ Math.imul(this.tickNumber, 3571) ^ realms.indexOf(this.realm));
      this.scheduledTicks();
      if (this.tickNumber % 20 === 0) this.randomTick(random);
      if (this.tickNumber % 2 === 0) this.active.circuits.tick(
        this.world, this.position, [this.position, ...this.mobs.all.map(({ pos }) => pos)],
        this.tickNumber, this.daylight, (point, code) => this.write(point, code),
      );
      this.move();
      this.updateHealth();
      this.refreshTarget();
      if (!this.dead) this.mine();
      const underground = Math.floor(this.position[1]) + 7 < this.world.surfaceY(Math.floor(this.position[0]), Math.floor(this.position[2]));
      const dangerous = !this.creative && (underground || this.realm !== "surface" || !this.daylight);
      const sentinelAllowed = !this.creative && !this.inventory.some((slot) => slot?.id === Item.AmberShard && slot.count >= 4);
      if (!this.dead) this.mobs.tick(this.world, this.position, this.realm, this.tickNumber, dangerous, random,
        (amount) => this.hurt(this.mode === "hardcore" ? amount * 1.5 : amount), sentinelAllowed);
      this.tickMachines();
      if (this.tickNumber % 200 === 0) this.save();
    }
    this.streamChunks();
    if (!this.paused || changed) this.send({ type: "state", state: this.state() });
  }

  private process(message: ClientMessage): void {
    if (message.type === "radius") this.radius = clamp(Math.round(finite(message.radius, this.radius)), 1, 5);
    if (this.dead && (message.type !== "action" || message.action !== "respawn")) return;
    switch (message.type) {
      case "select":
        if (Number.isInteger(message.slot) && message.slot >= 0 && message.slot < HOTBAR_COUNT) this.selected = message.slot;
        break;
      case "moveSlot": moveSlot(this.inventory, message.from, message.to); break;
      case "give": {
        if (!this.creative || !isItem(message.item)) break;
        this.inventory[this.selected] = toolStats[message.item]
          ? { id: message.item, count: 1, durability: toolStats[message.item].durability }
          : { id: message.item, count: message.item === Item.GuardCoat ? 1 : 64 };
        this.announce(itemInfo(message.item).name);
        break;
      }
      case "craft": this.craft(recipes.find((recipe) => recipe.id === message.recipe)); break;
      case "grid": {
        const recipe = matchGrid(message.grid, message.size);
        if (message.size === 3 && this.station().type !== "bench") this.announce("A workbench is needed for the 3×3 grid.");
        else this.craft(recipe);
        break;
      }
      case "action": this.action(message.action, message.item); break;
    }
  }

  private safeSpawn(x = 0, z = 0): Position {
    const candidates: Position[] = [[x, 0, z], [x + 1, 0, z], [x - 1, 0, z], [x, 0, z + 1], [x, 0, z - 1], [0, 0, 0], [1, 0, 0]];
    for (const [bx, , bz] of candidates) {
      const base = this.world.surfaceY(Math.floor(bx), Math.floor(bz));
      for (let step = 0; step <= 10; step++) {
        const site: Position = [Math.floor(bx) + 0.5, base + 1 + step, Math.floor(bz) + 0.5];
        const ground = this.world.get(Math.floor(site[0]), Math.floor(site[1]) - 1, Math.floor(site[2]));
        if (isSolid(ground) && canOccupy(this.world, ...site) && !hazardBlocks.has(blockOf(this.world.get(Math.floor(site[0]), Math.floor(site[1]), Math.floor(site[2]))))) {
          return site;
        }
      }
    }
    return [0.5, this.world.surfaceY(0, 0) + 13, 0.5];
  }

  private announce(text: string, ticks = 80): void {
    this.notice = text;
    this.noticeUntil = this.tickNumber + ticks;
  }

  private resetMotion(): void {
    this.velocity = [0, 0, 0];
    this.fallDistance = 0;
    this.grounded = false;
    this.miningPoint = "";
    this.mining = 0;
    this.air = 240;
  }

  private move(): void {
    const { yaw, forward, strafe, sprint, jump, descend } = this.controls;
    const [x, y, z] = this.position;
    const fluid = blockOf(this.world.get(Math.floor(x), Math.floor(y + 0.45), Math.floor(z)));
    const wet = hazardBlocks.has(fluid);
    const inputLength = Math.max(1, Math.hypot(forward, strafe));
    const running = sprint && forward > 0 && (this.creative || this.hunger > 5);
    const rate = (this.fly ? (running ? 0.73 : 0.43) : wet ? 0.15 : running ? 0.35 : 0.24) *
      (this.tickNumber < this.tonicUntil ? 1.2 : 1);
    const desiredX = (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) / inputLength * rate;
    const desiredZ = (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) / inputLength * rate;
    const control = this.fly || this.grounded || wet ? 0.65 : 0.29;
    this.velocity[0] += (desiredX - this.velocity[0]) * control;
    this.velocity[2] += (desiredZ - this.velocity[2]) * control;
    if (this.fly) this.velocity[1] = (Number(jump) - Number(descend)) * rate;
    else if (wet) this.velocity[1] = jump ? 0.18 : descend ? -0.19 : Math.max(-0.10, this.velocity[1] * 0.68 - 0.025);
    else if (jump && this.grounded) {
      this.velocity[1] = 0.45;
      this.grounded = false;
      this.exhaustion += 0.11;
    } else this.velocity[1] = Math.max(-1.3, (this.velocity[1] - 0.08) * 0.98);

    if (moveAxis(this.world, this.position, 0, this.velocity[0])) this.velocity[0] = 0;
    if (moveAxis(this.world, this.position, 2, this.velocity[2])) this.velocity[2] = 0;
    const vy = this.velocity[1];
    const collision = moveAxis(this.world, this.position, 1, vy);
    if (collision) this.velocity[1] = 0;
    if (!this.fly && !wet && vy < 0) this.fallDistance += Math.max(0, y - this.position[1]);
    else if (this.fly || wet || vy > 0) this.fallDistance = 0;
    if (collision && vy < 0) {
      if (this.fallDistance > 3.3) this.hurt(Math.floor(this.fallDistance - 2.4));
      this.fallDistance = 0;
    }
    this.grounded = !this.fly && !canOccupy(this.world, this.position[0], this.position[1] - 0.055, this.position[2]);
    if (this.fly) this.position[1] = clamp(this.position[1], -64, 318);
    if (this.position[1] < -68) this.hurt(40, true);
    if (Math.abs(forward) + Math.abs(strafe) > 0) this.exhaustion += running ? 0.045 : 0.011;
  }

  private updateHealth(): void {
    if (this.creative || this.dead) return;
    const [x, y, z] = this.position.map(Math.floor);
    const body = blockOf(this.world.get(x, y, z));
    const [ex, ey, ez] = this.eye().map(Math.floor);
    const head = blockOf(this.world.get(ex, ey, ez));
    if (head === Block.Water) {
      this.air--;
      if (this.air <= 0 && this.tickNumber % 20 === 0) this.hurt(2);
    } else this.air = Math.min(240, this.air + 12);
    if (this.tickNumber % 15 === 0 && (body === Block.Ember || head === Block.Ember)) this.hurt(4);
    if (this.tickNumber % 20 === 0 && isSolid(this.world.get(ex, ey, ez))) this.hurt(2);
    while (this.exhaustion >= 3) {
      this.exhaustion -= 3;
      if (this.saturation > 0) this.saturation--;
      else this.hunger = Math.max(0, this.hunger - 1);
    }
    if (this.hunger >= 18 && this.health < 20 && this.tickNumber % 65 === 0) {
      this.health = Math.min(20, this.health + 1);
      this.exhaustion += 2;
    } else if (this.hunger === 0 && this.tickNumber % 75 === 0) this.hurt(1);
  }

  private armored(): boolean { return this.inventory.some((slot) => slot?.id === Item.GuardCoat); }

  private hurt(amount: number, bypass = false): void {
    if (this.creative || this.dead || (this.damageCooldown && !bypass)) return;
    this.health = Math.max(0, this.health - (this.armored() ? Math.ceil(amount * 0.68) : amount));
    this.damageCooldown = 10;
    if (this.health > 0) return;
    this.dead = true;
    this.resetMotion();
    this.announce(this.mode === "hardcore" ? "This Hardcore expedition has ended." : "You fell in the wilds.", 900);
    this.save();
  }

  private eye(): Position { return [this.position[0], this.position[1] + EYE_HEIGHT, this.position[2]]; }
  private aim(): Position { return lookVector(this.controls.yaw, this.controls.pitch); }

  private refreshTarget(): void {
    this.target = this.dead ? null : raycastVoxel(this.world, this.eye(), this.aim(), this.creative ? REACH + 1 : REACH);
  }

  private mine(): void {
    const hit = this.target;
    const id = hit ? blockOf(hit.code) : Block.Air;
    const hardness = definition(id).hardness;
    if (!this.controls.mine || !hit || !Number.isFinite(hardness) || hardness <= 0 ||
      (this.mode === "adventure" && !adventureHarvest.has(id))) {
      this.miningPoint = "";
      this.mining = 0;
      return;
    }
    const signature = `${pointKey(hit.point)}:${id}:${this.selected}`;
    if (this.miningPoint !== signature) {
      this.miningPoint = signature;
      this.mining = 0;
    }
    const stats = this.stack && toolStats[this.stack.id];
    const underwater = blockOf(this.world.get(...this.eye().map(Math.floor) as Position)) === Block.Water;
    const speed = (stats && damageableBlocks.has(id) ? stats.speed * (this.stack?.tempered ? 1.24 : 1) : 1) *
      (underwater ? 0.46 : 1) * (this.grounded ? 1 : 0.65);
    this.mining += this.creative ? 1 : speed / (20 * hardness);
    if (this.mining < 1) return;
    this.mining = 0;
    this.miningPoint = "";
    if (!this.write(hit.point, Block.Air)) return;
    if (!this.creative) {
      const drop = definition(id).drops;
      if (drop && stash(this.inventory, drop, 1)) this.announce("Your pack is full.");
      if (id === Block.BerryBush) stash(this.inventory, Item.Seed, 1);
      if (id === Block.CopperOre || id === Block.Crystal || id === Block.Glowstone) this.xp += 2;
      this.exhaustion += 0.34;
      if (stats && damageableBlocks.has(id)) this.wearTool();
    }
    this.refreshTarget();
  }

  private wearTool(): void {
    const item = this.stack;
    if (!item || !toolStats[item.id] || this.creative) return;
    item.durability = (item.durability ?? toolStats[item.id].durability) - 1;
    if (item.durability <= 0) {
      this.inventory[this.selected] = null;
      this.announce(`${itemInfo(item.id).name} wore out.`);
    }
  }

  private action(action: PlayerAction, item?: number): void {
    if (action === "respawn") {
      if (this.dead && this.mode !== "hardcore") this.respawn();
      return;
    }
    if (this.paused || this.dead) return;
    this.refreshTarget();
    switch (action) {
      case "place": this.place(); break;
      case "interact": this.interact(); break;
      case "eat": this.eat(item); break;
      case "attack": this.attack(); break;
      case "smelt": this.smelt(item); break;
      case "trade": this.trade(item); break;
      case "temper": this.temper(item); break;
      case "flight":
        if (this.creative) {
          this.fly = !this.fly;
          this.resetMotion();
          this.announce(this.fly ? "Flight enabled. Space climbs, Ctrl descends." : "Flight disabled.");
        }
        break;
    }
  }

  private place(): void {
    const stack = this.stack;
    if (!stack || !this.target || (!isPlaceable(stack.id) && stack.id !== Item.Seed)) return;
    const id = stack.id === Item.Seed ? Block.BerryBush : stack.id;
    if (this.mode === "adventure" && !adventurePlace.has(id) && id !== Block.BerryBush) return;
    const point = this.target.adjacent;
    const current = blockOf(this.world.get(...point));
    if (current !== Block.Air && current !== Block.Water) return;
    if (isSolid(id) && (overlapsBlock(this.position, point) ||
      this.mobs.all.some(({ pos }) => overlapsBlock(pos, point, 0.27, 1.23)))) return;
    if (id === Block.BerryBush) {
      const below = blockOf(this.world.get(point[0], point[1] - 1, point[2]));
      if (below !== Block.Sod && below !== Block.Soil && below !== Block.Moss) {
        this.announce("Bramble seeds need earth.");
        return;
      }
    }
    if (!this.write(point, placedCircuit(id, this.controls.yaw))) return;
    if (!this.creative && --stack.count === 0) this.inventory[this.selected] = null;
    this.refreshTarget();
  }

  private interact(): void {
    if (!this.target) {
      if (this.station().type === "furnace") this.smelt();
      return;
    }
    const { point, code } = this.target;
    const id = blockOf(code);
    if (id === Block.RiftGate || id === Block.SkyGate) {
      if (this.travelCooldown) return;
      const next = id === Block.RiftGate ? "underdeep" : "skyreach";
      this.changeRealm(this.realm === next ? "surface" : next, id);
    } else if (id === Block.Relay || id === Block.Switch) {
      const updated = interactedCircuit(code);
      if (!this.write(point, updated)) return;
      this.announce(id === Block.Relay ? `Relay delay ${(stateOf(updated) >> 3) + 1}.`
        : stateOf(updated) ? "Switch on." : "Switch off.");
    } else if (id === Block.Furnace) this.smelt();
    else if (id === Block.Bench) this.announce("Workbench ready. Open your pack to craft.");
    else if (id === Block.BerryBush && !this.creative) {
      if (stateOf(code) === 0) {
        const next = copyInventory(this.inventory);
        if (stash(next, Item.Ration, 2)) {
          this.announce("Your pack is full.");
          return;
        }
        this.inventory = next;
        this.write(point, withState(id, 1));
        this.active.events.delete(pointKey(point));
        this.schedule(point, 240);
        this.announce("Picked two trailberries.");
      } else this.announce("These berries are still growing.");
    } else if (this.station().type === "furnace") this.smelt();
  }

  private changeRealm(next: Realm, gate?: number): void {
    const previous = this.realm;
    const [x, , z] = this.position;
    this.realm = next;
    if (previous === "surface" && next === "underdeep") this.position = this.safeSpawn(x / 8, z / 8);
    else if (previous === "underdeep" && next === "surface") this.position = this.safeSpawn(x * 8, z * 8);
    else this.position = this.safeSpawn();
    this.resetMotion();
    this.mobs.clear();
    this.travelCooldown = 20;
    this.loaded.clear();
    this.dirty.clear();
    this.center = null;
    this.fly = false;
    let returnGate = false;
    if (next !== "surface" && gate) {
      const [arrivalX, arrivalY, arrivalZ] = this.position.map(Math.floor);
      for (const [dx, , dz] of blockNeighbors.slice(0, 4)) {
        const point: Position = [arrivalX + dx * 2, arrivalY, arrivalZ + dz * 2];
        if (blockOf(this.world.get(...point)) === gate || (this.world.get(...point) === Block.Air && this.write(point, gate))) {
          returnGate = true;
          this.controls.yaw = Math.atan2(-dx, -dz);
          this.controls.pitch = -0.38;
          break;
        }
      }
      if (!returnGate && !this.creative) stash(this.inventory, gate, 1);
    }
    this.announce(`Entered ${realmNames[next]}.${returnGate ? " Use the nearby gate to return." : ""}`, 155);
    this.refreshTarget();
    this.send({ type: "reset", realm: this.realm });
    this.send({ type: "state", state: this.state() });
    this.save();
  }

  private respawn(): void {
    this.health = 20;
    this.hunger = 20;
    this.saturation = 6;
    this.exhaustion = 0;
    this.damageCooldown = 40;
    this.dead = false;
    if (this.realm === "surface") {
      this.position = this.safeSpawn();
      this.resetMotion();
      this.mobs.clear();
    } else this.changeRealm("surface");
    this.announce("Back at camp.", 100);
    this.save();
  }

  private eat(item?: number): void {
    const selected = item ?? this.stack?.id;
    const id = selected !== undefined && food.has(selected) ? selected
      : this.inventory.find((slot) => slot && food.has(slot.id))?.id;
    if (id === undefined) {
      this.announce("Gather trailberries to eat.");
      return;
    }
    const [hunger, saturation, recovery] = food.get(id)!;
    if (this.hunger >= 20 && (recovery === 0 || this.health >= 20)) return;
    if (!this.creative && !spend(this.inventory, id, 1)) return;
    this.hunger = Math.min(20, this.hunger + hunger);
    this.saturation = Math.min(12, this.saturation + saturation);
    this.health = Math.min(20, this.health + recovery);
    if (id === Item.TrailTonic) this.tonicUntil = this.tickNumber + 600;
    this.announce(`Used ${itemInfo(id).name.toLowerCase()}.`);
  }

  private attack(): void {
    if (this.attackCooldown > 0) return;
    const stats = this.stack && toolStats[this.stack.id];
    const damage = (stats ? stats.attack : 1) + (this.stack?.tempered ? 2 : 0);
    const hit = this.mobs.strike(this.eye(), this.aim(), Math.min(3.4, this.target?.distance ?? 3.4), damage);
    if (!hit) return;
    this.attackCooldown = 8;
    this.wearTool();
    if (!hit.killed) return;
    const { kind } = hit.mob;
    this.xp += kind === "sentinel" ? 45 : kind === "lurker" ? 8 : 3;
    if (kind === "grazer") stash(this.inventory, Item.Ration, 2);
    else stash(this.inventory, Item.AmberShard, kind === "sentinel" ? 4 : 1);
    if (kind === "sentinel") this.announce("Skyreach sentinel defeated. Four amber shards recovered.", 200);
  }

  private craft(recipe?: Recipe): void {
    if (!recipe) {
      this.announce("No recipe matches.");
      return;
    }
    if (recipe.bench && this.station().type !== "bench") {
      this.announce("Move closer to a workbench.");
      return;
    }
    const next = craftInto(this.inventory, recipe);
    if (!next) {
      this.announce("Check your ingredients and pack space.");
      return;
    }
    this.inventory = next;
    this.announce(`Crafted ${itemInfo(recipe.result).name.toLowerCase()}.`);
  }

  private station(): { type: Station; point?: Position } {
    const [px, py, pz] = this.position.map(Math.floor);
    let nearby: { type: Station; point?: Position } = { type: null };
    let distance = 4.2;
    for (let x = px - 4; x <= px + 4; x++) for (let z = pz - 4; z <= pz + 4; z++) {
      for (let y = py - 1; y <= py + 2; y++) {
        const id = blockOf(this.world.get(x, y, z));
        if (id !== Block.Bench && id !== Block.Furnace) continue;
        const range = Math.hypot(x + 0.5 - this.position[0], y + 0.5 - this.position[1], z + 0.5 - this.position[2]);
        if (range >= distance) continue;
        distance = range;
        nearby = { type: id === Block.Bench ? "bench" : "furnace", point: [x, y, z] };
      }
    }
    const trader = this.trader();
    if (trader && Math.hypot(trader.x - this.position[0], trader.y - this.position[1], trader.z - this.position[2]) < Math.min(distance, 4)) {
      return { type: "trader" };
    }
    return nearby;
  }

  private trader(): MobView | null {
    if (this.realm !== "surface" || Math.hypot(this.position[0] - 4.5, this.position[2] + 16.5) > 42) return null;
    return { id: "outfitter", kind: "trader", x: 4.5, y: this.world.surfaceY(4, -17) + 1, z: -16.5, yaw: 0.55, health: 20, maxHealth: 20 };
  }

  private trade(item?: number): void {
    if (this.station().type !== "trader") return;
    const next = copyInventory(this.inventory);
    const result = item === Block.Glowstone || item === Item.HearthStew || item === Item.CopperIngot ? item : Item.Ration;
    const price = result === Block.Glowstone ? 2 : 1;
    if (!spend(next, Item.AmberShard, price) || stash(next, result, result === Item.Ration ? 6 : 1)) {
      this.announce("Trade requires amber shards and pack space.");
      return;
    }
    this.inventory = next;
    this.announce(`Traded for ${itemInfo(result).name.toLowerCase()}.`);
  }

  private temper(item?: number): void {
    const stack = item === undefined || this.stack?.id === item ? this.stack : this.inventory.find((slot) => slot?.id === item);
    if (this.station().type !== "bench" || !stack || !toolStats[stack.id]) {
      this.announce("Select a tool beside a workbench.");
      return;
    }
    if (this.xp < 6 || !spend(this.inventory, Item.AmberShard, 1)) {
      this.announce("Tempering uses 6 XP and one amber shard.");
      return;
    }
    this.xp -= 6;
    stack.tempered = true;
    stack.durability = toolStats[stack.id].durability;
    this.announce(`${itemInfo(stack.id).name} tempered and repaired.`);
  }

  private machineKey(point: Position, realm = this.realm): string { return `${realm}:${pointKey(point)}`; }

  private smelt(item?: number): void {
    const nearby = this.station();
    const point = this.target && blockOf(this.target.code) === Block.Furnace ? this.target.point
      : nearby.type === "furnace" ? nearby.point : undefined;
    if (!point) {
      this.announce("Move closer to a kiln.");
      return;
    }
    const key = this.machineKey(point);
    const machine = this.machines.get(key);
    if (machine) {
      if (!machine.ready) this.announce("The kiln is refining.");
      else if (!stash(this.inventory, machine.item, 1)) {
        this.machines.delete(key);
        this.write(point, Block.Furnace);
        this.announce(`Collected ${itemInfo(machine.item).name.toLowerCase()}.`);
      } else this.announce("Make space to collect the refined item.");
      return;
    }
    const source = item !== undefined && refining.has(item) ? item
      : this.stack && refining.has(this.stack.id) ? this.stack.id
        : this.inventory.find((stack) => stack && refining.has(stack.id))?.id;
    const next = copyInventory(this.inventory);
    if (source === undefined || !spend(next, source, 1) ||
      !(spend(next, Block.Timber, 1) || spend(next, Block.Wood, 1))) {
      this.announce("Use copper ore, sand, earth, or berries with cedar fuel.");
      return;
    }
    this.inventory = next;
    this.machines.set(key, { realm: this.realm, point: [...point], item: refining.get(source)!, remaining: SMELT_TICKS });
    this.write(point, withState(Block.Furnace, 1));
    this.announce("Kiln lit. Collect the result when it is ready.");
  }

  private tickMachines(): void {
    for (const machine of this.machines.values()) {
      if (machine.realm !== this.realm || machine.ready) continue;
      if (--machine.remaining <= 0) {
        machine.ready = true;
        this.xp += 2;
        this.write(machine.point, Block.Furnace);
      }
    }
  }

  private write(point: Position, code: number): boolean {
    const before = this.world.get(...point);
    if (before === code || !this.world.set(...point, code)) return false;
    const [x, , z] = point;
    this.dirty.add(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
    this.active.circuits.track(point, code);
    if (blockOf(before) !== blockOf(code)) {
      if (blockOf(before) === Block.Furnace) {
        const machine = this.machines.get(this.machineKey(point));
        if (machine?.ready) stash(this.inventory, machine.item, 1);
        this.machines.delete(this.machineKey(point));
      }
      this.schedule(point, 3);
      for (const direction of blockNeighbors) this.schedule(shifted(point, direction), 3);
    }
    return true;
  }

  private schedule(point: Position, delay: number): void {
    const events = this.active.events;
    if (events.size >= 2048 || point[1] < -64 || point[1] > 319) return;
    const key = pointKey(point);
    const at = this.tickNumber + delay;
    const old = events.get(key);
    if (!old || old.at > at) events.set(key, { point, at });
  }

  private scheduledTicks(): void {
    const events = this.active.events;
    const due: { point: Position; at: number }[] = [];
    for (const [key, event] of events) {
      if (event.at > this.tickNumber) continue;
      events.delete(key);
      if (Math.abs(event.point[0] - this.position[0]) > 48 || Math.abs(event.point[2] - this.position[2]) > 48) continue;
      due.push(event);
      if (due.length === 72) break;
    }
    for (const { point } of due) {
      const code = this.world.get(...point);
      const id = blockOf(code);
      if (id === Block.Gravel || id === Block.Sand) {
        const below = shifted(point, [0, -1, 0]);
        const ground = blockOf(this.world.get(...below));
        if ((ground === Block.Air || ground === Block.Water) && !overlapsBlock(this.position, below) && this.write(below, code)) {
          this.write(point, ground === Block.Water ? Block.Water : Block.Air);
        }
      } else if (id === Block.Air) {
        for (const direction of [[0, 1, 0], ...blockNeighbors.slice(0, 4)] as Position[]) {
          const source = this.world.get(...shifted(point, direction));
          if (!hazardBlocks.has(blockOf(source)) || stateOf(source) >= 3) continue;
          this.write(point, withState(blockOf(source), stateOf(source) + 1));
          break;
        }
      } else if (id === Block.BerryBush && stateOf(code) === 1) {
        this.write(point, Block.BerryBush);
      }
    }
  }

  private randomTick(random: () => number): void {
    if (this.realm !== "surface") return;
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(this.position[0] + (random() - 0.5) * 18);
      const z = Math.floor(this.position[2] + (random() - 0.5) * 18);
      const y = this.world.surfaceY(x, z);
      if (blockOf(this.world.get(x, y, z)) !== Block.Soil || this.world.get(x, y + 1, z) !== Block.Air) continue;
      if (blockNeighbors.slice(0, 4).some(([dx, , dz]) => blockOf(this.world.get(x + dx, y, z + dz)) === Block.Sod)) {
        this.write([x, y, z], Block.Sod);
      }
    }
  }

  private streamChunks(): void {
    const cx = Math.floor(this.position[0] / 16);
    const cz = Math.floor(this.position[2] / 16);
    const center = `${cx},${cz},${this.radius}`;
    if (center !== this.center) {
      this.center = center;
      const remove: string[] = [];
      for (const key of this.loaded) {
        const [x, z] = key.split(",").map(Number);
        if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) <= this.radius) continue;
        this.loaded.delete(key);
        remove.push(key);
      }
      if (remove.length) this.send({ type: "remove", realm: this.realm, keys: remove });
      for (const key of this.dirty) {
        const [x, z] = key.split(",").map(Number);
        if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) > this.radius) this.dirty.delete(key);
      }
      this.world.prune(cx, cz, this.radius + 2);
    }
    const pending: { x: number; z: number; key: string; weight: number }[] = [];
    for (let x = cx - this.radius; x <= cx + this.radius; x++) {
      for (let z = cz - this.radius; z <= cz + this.radius; z++) {
        const key = `${x},${z}`;
        if (!this.loaded.has(key) || this.dirty.has(key)) {
          const distance = (cx - x) ** 2 + (cz - z) ** 2;
          pending.push({ x, z, key, weight: this.dirty.has(key) ? distance - 100 : distance });
        }
      }
    }
    if (!pending.length) return;
    const selected = pending.sort((a, b) => a.weight - b.weight).slice(0, 2);
    const chunks = selected.map(({ x, z, key }) => {
      this.loaded.add(key);
      this.dirty.delete(key);
      return this.world.packet(x, z);
    });
    this.send({ type: "chunks", realm: this.realm, chunks });
  }

  private state(): HudState {
    const nearby = this.station();
    const machine = nearby.point && this.machines.get(this.machineKey(nearby.point));
    const mobs: MobView[] = this.mobs.all.map(({ id, kind, pos, yaw, health }) => ({
      id: String(id), kind, x: pos[0], y: pos[1], z: pos[2], yaw, health,
      maxHealth: kind === "grazer" ? 8 : kind === "lurker" ? 14 : 40,
    }));
    const trader = this.trader();
    if (trader) mobs.push(trader);
    return {
      realm: this.realm, tick: this.tickNumber, position: { x: this.position[0], y: this.position[1], z: this.position[2] },
      yaw: this.controls.yaw, pitch: this.controls.pitch,
      health: this.health, hunger: this.hunger, xp: this.xp, selected: this.selected,
      inventory: copyInventory(this.inventory), target: this.target?.point ?? null,
      targetCode: this.target?.code ?? 0, mining: this.mining, notice: this.tickNumber <= this.noticeUntil ? this.notice : "",
      dead: this.dead, flying: this.fly, armored: this.armored(), mobs,
      biome: this.world.biome(Math.floor(this.position[0]), Math.floor(this.position[2])),
      station: nearby.type, stationProgress: machine ? 1 - machine.remaining / SMELT_TICKS : undefined,
    };
  }

  private save(): void {
    const player: PlayerSave = {
      x: this.position[0], y: this.position[1], z: this.position[2], yaw: this.controls.yaw, pitch: this.controls.pitch,
      health: this.health, hunger: this.hunger, xp: this.xp, inventory: copyInventory(this.inventory),
      selected: this.selected, dead: this.dead,
    };
    this.send({ type: "save", data: {
      version: 1, terrainRevision: this.terrainRevision, seed: this.seed, mode: this.mode, realm: this.realm, tick: this.tickNumber, player,
      realms: {
        surface: this.localRealms.get("surface")?.world.edits() ?? this.savedEdits.surface,
        underdeep: this.localRealms.get("underdeep")?.world.edits() ?? this.savedEdits.underdeep,
        skyreach: this.localRealms.get("skyreach")?.world.edits() ?? this.savedEdits.skyreach,
      },
      machines: [...this.machines.values()].map((machine) => ({ ...machine, point: [...machine.point] })),
    } });
  }
}

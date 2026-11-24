import { Block, blockOf } from "./blocks";
import type { Realm } from "./protocol";
import { canOccupy, moveAxis } from "./spatial";
import type { BlockReader, Position } from "./spatial";

type SpawnGround = BlockReader & { surfaceY(x: number, z: number): number };
export type CreatureKind = "grazer" | "lurker" | "sentinel";

export interface Creature {
  id: number;
  kind: CreatureKind;
  pos: Position;
  health: number;
  yaw: number;
  vertical: number;
  cooldown: number;
  provoked: number;
  route: Position[];
  destination: Position | null;
}

const healthFor = { grazer: 8, lurker: 14, sentinel: 40 };
const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function standable(world: BlockReader, x: number, y: number, z: number): boolean {
  if (!canOccupy(world, x + 0.5, y, z + 0.5, 0.27, 1.23)) return false;
  const floor = blockOf(world.get(x, y - 1, z));
  return floor !== Block.Ember && floor !== Block.Water && !canOccupy(world, x + 0.5, y - 0.05, z + 0.5, 0.27, 1.23);
}

interface RouteNode {
  point: Position;
  cost: number;
  estimate: number;
  parent?: RouteNode;
}

// Search the nearby walkable voxels. The bounded frontier lets a creature
// keep moving toward a distant target without scanning an entire chunk.
function findRoute(world: BlockReader, from: Position, target: Position): Position[] {
  const estimate = ([x, y, z]: Position) => Math.abs(Math.floor(target[0]) - x) +
    Math.abs(Math.floor(target[1]) - y) + Math.abs(Math.floor(target[2]) - z);
  const point: Position = [Math.floor(from[0]), Math.floor(from[1] + 0.1), Math.floor(from[2])];
  const first: RouteNode = { point, cost: 0, estimate: estimate(point) };
  const open: RouteNode[] = [first];
  const scores = new Map<string, number>([[point.join(","), 0]]);
  let closest = first;
  for (let attempt = 0; open.length && attempt < 92; attempt++) {
    let bestIndex = 0;
    for (let index = 1; index < open.length; index++) {
      if (open[index].estimate + open[index].cost < open[bestIndex].estimate + open[bestIndex].cost) bestIndex = index;
    }
    const [node] = open.splice(bestIndex, 1);
    if (node.estimate < closest.estimate) closest = node;
    if (node.estimate <= 1) break;
    const [x, y, z] = node.point;
    for (const [dx, dz] of neighbors) {
      const nextX = x + dx;
      const nextZ = z + dz;
      for (const dy of [0, 1, -1, -2]) {
        if (dy === 1 && !canOccupy(world, x + 0.5, y + 1, z + 0.5, 0.27, 1.23)) continue;
        if (!standable(world, nextX, y + dy, nextZ)) continue;
        const next: Position = [nextX, y + dy, nextZ];
        const key = next.join(",");
        const cost = node.cost + 1 + Math.abs(dy) * 0.24;
        if ((scores.get(key) ?? Infinity) > cost) {
          scores.set(key, cost);
          open.push({ point: next, cost, estimate: estimate(next), parent: node });
        }
        break;
      }
    }
  }
  const route: Position[] = [];
  for (let node = closest; node.parent; node = node.parent) {
    route.push([node.point[0] + 0.5, node.point[1], node.point[2] + 0.5]);
  }
  return route.reverse();
}

export class Creatures {
  private readonly active = new Map<number, Creature>();
  private nextId = 1;

  clear(): void { this.active.clear(); }

  get all(): Creature[] { return [...this.active.values()]; }

  private spawn(world: SpawnGround, player: Position, realm: Realm, kind: CreatureKind, random: () => number): void {
    for (let attempt = 0; attempt < 9; attempt++) {
      const angle = random() * 2 * Math.PI;
      const radius = realm === "skyreach" ? 8 + random() * 15 : 9 + random() * 16;
      const x = Math.floor(player[0] + Math.cos(angle) * radius);
      const z = Math.floor(player[2] + Math.sin(angle) * radius);
      const surface = world.surfaceY(x, z) + 1;
      // Creatures can also spawn on shelves near a player who has gone underground.
      const near = Math.floor(player[1]);
      const floors = [surface, near, near - 1, near + 1, near - 2, near + 2];
      const y = floors.find((floor) => Math.abs(floor - player[1]) < 12 && standable(world, x, floor, z));
      if (y === undefined) continue;
      const point: Position = [x + 0.5, y, z + 0.5];
      if ([...this.active.values()].some(({ pos }) => Math.hypot(pos[0] - point[0], pos[2] - point[2]) < 2.8)) continue;
      const id = this.nextId++;
      this.active.set(id, { id, kind, pos: point, health: healthFor[kind], yaw: angle, vertical: 0, cooldown: 0, provoked: 0, route: [], destination: null });
      return;
    }
  }

  tick(
    world: SpawnGround, player: Position, realm: Realm, tick: number, dangerous: boolean,
    random: () => number, hurt: (amount: number) => void, allowSentinel: boolean,
  ): void {
    if (tick % 40 === 1) {
      const mobs = this.all;
      if (realm === "surface" && mobs.filter((mob) => mob.kind === "grazer").length < 4) {
        this.spawn(world, player, realm, "grazer", random);
      }
      if (dangerous && mobs.filter((mob) => mob.kind === "lurker").length < 4) {
        this.spawn(world, player, realm, "lurker", random);
      }
      if (realm === "skyreach" && allowSentinel && !mobs.some((mob) => mob.kind === "sentinel")) {
        this.spawn(world, player, realm, "sentinel", random);
      }
    }

    for (const mob of this.active.values()) {
      const distance = Math.hypot(player[0] - mob.pos[0], player[2] - mob.pos[2]);
      if (distance > 65 || mob.pos[1] < -65) {
        this.active.delete(mob.id);
        continue;
      }
      mob.cooldown = Math.max(0, mob.cooldown - 1);
      mob.provoked = Math.max(0, mob.provoked - 1);
      const chasing = mob.kind !== "grazer" && distance < (mob.kind === "sentinel" ? 25 : 15);
      const fleeing = mob.kind === "grazer" && mob.provoked > 0;
      if ((tick + mob.id * 11) % 17 === 0) {
        if (chasing) mob.destination = player;
        else if (fleeing) mob.destination = [mob.pos[0] * 2 - player[0], mob.pos[1], mob.pos[2] * 2 - player[2]];
        else if (random() < 0.4 || !mob.destination) {
          mob.destination = [mob.pos[0] + random() * 12 - 6, mob.pos[1], mob.pos[2] + random() * 12 - 6];
        }
        if (mob.destination) mob.route = findRoute(world, mob.pos, mob.destination);
      }
      if (chasing && distance < (mob.kind === "sentinel" ? 2.1 : 1.35) &&
        Math.abs(player[1] - mob.pos[1]) < 1.2 && mob.cooldown === 0) {
        hurt(mob.kind === "sentinel" ? (mob.health < 20 ? 5 : 3) : 2);
        mob.cooldown = mob.kind === "sentinel" && mob.health < 20 ? 14 : 24;
      }
      const destination = mob.route[0];
      const grounded = !canOccupy(world, mob.pos[0], mob.pos[1] - 0.07, mob.pos[2], 0.27, 1.23);
      if (destination) {
        const dx = destination[0] - mob.pos[0];
        const dz = destination[2] - mob.pos[2];
        const length = Math.hypot(dx, dz);
        if (length < 0.12) mob.route.shift();
        else {
          mob.yaw = Math.atan2(dx, dz);
          const speed = fleeing ? 0.145 : chasing ? 0.11 : 0.055;
          if (destination[1] > mob.pos[1] + 0.3 && grounded) mob.vertical = 0.48;
          const distancePerTick = Math.min(length, speed);
          moveAxis(world, mob.pos, 0, dx / length * distancePerTick, 0.27, 1.23);
          moveAxis(world, mob.pos, 2, dz / length * distancePerTick, 0.27, 1.23);
        }
      }
      mob.vertical = Math.max(-0.65, mob.vertical - 0.08);
      if (moveAxis(world, mob.pos, 1, mob.vertical, 0.27, 1.23)) mob.vertical = 0;
    }
  }

  strike(origin: Position, direction: Position, reach: number, damage: number): { mob: Creature; killed: boolean } | null {
    let nearest: Creature | undefined;
    let distance = reach;
    for (const mob of this.active.values()) {
      const dx = mob.pos[0] - origin[0];
      const dy = mob.pos[1] + 0.61 - origin[1];
      const dz = mob.pos[2] - origin[2];
      const projection = dx * direction[0] + dy * direction[1] + dz * direction[2];
      if (projection < 0 || projection >= distance ||
        Math.hypot(dx - projection * direction[0], dy - projection * direction[1], dz - projection * direction[2]) > 0.65) {
        continue;
      }
      distance = projection;
      nearest = mob;
    }
    if (!nearest) return null;
    nearest.health -= damage;
    nearest.provoked = 80;
    const killed = nearest.health <= 0;
    if (killed) this.active.delete(nearest.id);
    return { mob: nearest, killed };
  }
}

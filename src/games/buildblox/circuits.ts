import { Block, blockOf, isSolid, stateOf, withState } from "./blocks";
import type { BlockEdit } from "./protocol";
import { overlapsBlock } from "./spatial";
import type { BlockReader, Position } from "./spatial";

const directions: Position[] = [[0, 0, -1], [-1, 0, 0], [0, 0, 1], [1, 0, 0]];
export const blockNeighbors: Position[] = [...directions, [0, -1, 0], [0, 1, 0]];
export const pointKey = (point: Position): string => point.join(",");
export const shifted = (point: Position, delta: Position, steps = 1): Position => [
  point[0] + delta[0] * steps, point[1] + delta[1] * steps, point[2] + delta[2] * steps,
];
const circuitBlocks = new Set<number>([
  Block.Wire, Block.Switch, Block.Lamp, Block.Door, Block.Relay, Block.Piston, Block.Plate, Block.Inverter, Block.Sensor,
]);

export function placedCircuit(id: number, yaw: number): number {
  if (id !== Block.Relay && id !== Block.Piston && id !== Block.Inverter) return id;
  return withState(id, Math.round(yaw / (Math.PI / 2)) & 3);
}

export function interactedCircuit(code: number): number {
  const id = blockOf(code);
  const state = stateOf(code);
  if (id === Block.Switch) return withState(id, state ? 0 : 1);
  if (id === Block.Relay) return withState(id, (state & 7) | (((state >> 3) + 1) % 4) << 3);
  return code;
}

export class Circuits {
  private readonly points = new Map<string, Position>();
  private readonly relayDelays = new Map<string, { powered: boolean; at: number }>();

  constructor(edits: BlockEdit[]) {
    for (const [x, y, z, code] of edits) this.track([x, y, z], code);
  }

  track(point: Position, code: number): void {
    const key = pointKey(point);
    if (circuitBlocks.has(blockOf(code))) this.points.set(key, point);
    else {
      this.points.delete(key);
      this.relayDelays.delete(key);
    }
  }

  tick(
    world: BlockReader, player: Position, entities: Position[], tick: number, daylight: boolean,
    write: (point: Position, code: number) => boolean,
  ): void {
    const updates: [point: Position, code: number][] = [];
    const pushes: [point: Position, direction: Position][] = [];
    const signal = (source: Position, target: Position): number => {
      const code = world.get(...source);
      const state = stateOf(code);
      switch (blockOf(code)) {
        case Block.Wire: return state;
        case Block.Switch:
        case Block.Plate:
        case Block.Sensor: return state ? 15 : 0;
        case Block.Relay:
        case Block.Inverter: {
          const front = shifted(source, directions[state & 3]);
          return (state & 4) && front.every((value, index) => value === target[index]) ? 15 : 0;
        }
        default: return 0;
      }
    };

    for (const [key, point] of this.points) {
      if (Math.abs(point[0] - player[0]) > 52 || Math.abs(point[2] - player[2]) > 52) continue;
      const code = world.get(...point);
      const id = blockOf(code);
      const state = stateOf(code);
      if (!circuitBlocks.has(id) || id === Block.Switch) continue;
      let next = state;
      if (id === Block.Plate) {
        next = Number(entities.some((entity) =>
          entity[1] >= point[1] - 0.1 && entity[1] < point[1] + 0.65 &&
          entity[0] >= point[0] && entity[0] <= point[0] + 1 &&
          entity[2] >= point[2] && entity[2] <= point[2] + 1));
      } else if (id === Block.Sensor) {
        next = Number(daylight);
      } else if (id === Block.Relay || id === Block.Inverter) {
        const input = signal(shifted(point, directions[state & 3], -1), point) > 0;
        if (id === Block.Inverter) next = (state & 3) | (input ? 0 : 4);
        else {
          const active = (state & 4) > 0;
          const pending = this.relayDelays.get(key);
          if (input === active) this.relayDelays.delete(key);
          else if (pending?.powered !== input) this.relayDelays.set(key, { powered: input, at: tick + 2 + (state >> 3) * 2 });
          else if (pending.at <= tick) {
            next = (state & ~4) | (input ? 4 : 0);
            this.relayDelays.delete(key);
          }
        }
      } else {
        let power = 0;
        for (const delta of blockNeighbors) {
          const source = shifted(point, delta);
          const received = signal(source, point);
          const decay = id === Block.Wire && blockOf(world.get(...source)) === Block.Wire ? 1 : 0;
          power = Math.max(power, received - decay);
        }
        if (id === Block.Wire) next = power;
        else if (id === Block.Piston) {
          if (power && !(state & 4)) pushes.push([point, directions[state & 3]]);
          next = (state & 3) | (power ? 4 : 0);
        } else {
          next = Number(power > 0);
          if (id === Block.Door && next === 0 && state && entities.some((entity) => overlapsBlock(entity, point))) next = state;
        }
      }
      if (next !== state) updates.push([point, withState(id, next)]);
    }
    for (const [point, code] of updates) write(point, code);
    for (const [point, direction] of pushes) {
      const row: [Position, number][] = [];
      let space: Position | undefined;
      for (let distance = 1; distance <= 7; distance++) {
        const target = shifted(point, direction, distance);
        const code = world.get(...target);
        const id = blockOf(code);
        if (id === Block.Air) {
          space = target;
          break;
        }
        if (!isSolid(code) || circuitBlocks.has(id) ||
          id === Block.Bedrock || id === Block.Bench || id === Block.Furnace || id === Block.RiftGate || id === Block.SkyGate) break;
        row.push([target, code]);
      }
      if (!space || row.length > 6 || entities.some((entity) => overlapsBlock(entity, space!))) continue;
      for (let index = row.length - 1; index >= 0; index--) {
        const [target, code] = row[index];
        if (!write(space, code)) break;
        write(target, Block.Air);
        space = target;
      }
    }
  }
}

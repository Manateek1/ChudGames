import { Block, blockOf, isSolid } from "./blocks";

export type Position = [number, number, number];
export type BlockReader = { get(x: number, y: number, z: number): number };

const epsilon = 0.0001;
export const PLAYER_HALF_WIDTH = 0.30;
export const PLAYER_HEIGHT = 1.76;
export const EYE_HEIGHT = 1.58;

export function canOccupy(
  world: BlockReader, x: number, y: number, z: number,
  halfWidth = PLAYER_HALF_WIDTH, height = PLAYER_HEIGHT,
): boolean {
  const maxX = Math.floor(x + halfWidth - epsilon);
  const maxY = Math.floor(y + height - epsilon);
  const maxZ = Math.floor(z + halfWidth - epsilon);
  for (let bx = Math.floor(x - halfWidth + epsilon); bx <= maxX; bx++) {
    for (let by = Math.floor(y + epsilon); by <= maxY; by++) {
      for (let bz = Math.floor(z - halfWidth + epsilon); bz <= maxZ; bz++) {
        if (isSolid(world.get(bx, by, bz))) return false;
      }
    }
  }
  return true;
}

export function moveAxis(
  world: BlockReader, pos: Position, axis: 0 | 1 | 2, delta: number,
  halfWidth = PLAYER_HALF_WIDTH, height = PLAYER_HEIGHT,
): boolean {
  if (delta === 0) return false;
  const steps = Math.ceil(Math.abs(delta) / 0.28);
  const distance = delta / steps;
  const next: Position = [...pos];
  for (let step = 0; step < steps; step++) {
    next[axis] += distance;
    if (canOccupy(world, ...next, halfWidth, height)) {
      pos[axis] = next[axis];
      continue;
    }
    let limit = 1;
    let safe = 0;
    for (let i = 0; i < 8; i++) {
      const fraction = (safe + limit) * 0.5;
      next[axis] = pos[axis] + fraction * distance;
      if (canOccupy(world, ...next, halfWidth, height)) safe = fraction;
      else limit = fraction;
    }
    pos[axis] += safe * distance;
    return true;
  }
  return false;
}

export function overlapsBlock(
  [x, y, z]: Position, [bx, by, bz]: Position,
  halfWidth = PLAYER_HALF_WIDTH, height = PLAYER_HEIGHT,
): boolean {
  return x - halfWidth < bx + 1 && x + halfWidth > bx &&
    y < by + 1 && y + height > by &&
    z - halfWidth < bz + 1 && z + halfWidth > bz;
}

export function lookVector(yaw: number, pitch: number): Position {
  return [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
}

export interface VoxelHit {
  point: Position;
  adjacent: Position;
  distance: number;
  code: number;
}

export function raycastVoxel(
  world: BlockReader, origin: Position, direction: Position, reach: number,
): VoxelHit | null {
  const point = origin.map(Math.floor) as Position;
  let adjacent: Position = [...point];
  const step = direction.map(Math.sign);
  const next = direction.map((axis, i) =>
    axis === 0 ? Infinity : (point[i] + (axis > 0 ? 1 : 0) - origin[i]) / axis,
  );
  const increment = direction.map((axis) => axis === 0 ? Infinity : Math.abs(1 / axis));
  let distance = 0;
  while (distance <= reach) {
    const code = world.get(...point);
    if (blockOf(code) !== Block.Air && blockOf(code) !== Block.Water) {
      return { point, adjacent, distance, code };
    }
    const axis = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
    distance = next[axis];
    if (!Number.isFinite(distance)) return null;
    adjacent = [...point];
    point[axis] += step[axis];
    next[axis] += increment[axis];
  }
  return null;
}

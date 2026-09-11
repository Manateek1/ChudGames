import {
  FLOOR_SIZE,
  FLOOR_THICKNESS,
  RAMP_HEIGHT,
  RAMP_LENGTH,
  RAMP_WIDTH,
  WALL_HEIGHT,
  WALL_THICKNESS,
  WALL_WIDTH
} from './constants';
import type { BuildPieceType } from './types';

export interface BuildFootprint {
  width: number;
  depth: number;
  height: number;
}

export interface BuildBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface BuildPosition {
  x: number;
  y: number;
  z: number;
}

/** Returns the world-space footprint of a build piece at the given yaw. */
export function getBuildFootprint(pieceType: BuildPieceType, yaw: number): BuildFootprint {
  if (pieceType === 'floor') {
    return { width: FLOOR_SIZE, depth: FLOOR_SIZE, height: FLOOR_THICKNESS };
  }

  const alongX = Math.abs(Math.cos(yaw)) > 0.5;
  if (pieceType === 'ramp') {
    return {
      width: alongX ? RAMP_WIDTH : RAMP_LENGTH,
      depth: alongX ? RAMP_LENGTH : RAMP_WIDTH,
      height: RAMP_HEIGHT
    };
  }

  return {
    width: alongX ? WALL_WIDTH : WALL_THICKNESS,
    depth: alongX ? WALL_THICKNESS : WALL_WIDTH,
    height: WALL_HEIGHT
  };
}

/** Returns the highest support point used when stacking another piece. */
export function getBuildSupportHeight(pieceType: BuildPieceType, centerY: number): number {
  return centerY + getBuildFootprint(pieceType, 0).height * 0.5;
}

/** Returns an axis-aligned build volume after rotating the piece on the Y axis. */
export function getBuildBounds(pieceType: BuildPieceType, position: BuildPosition, yaw: number): BuildBounds {
  const footprint = getBuildFootprint(pieceType, yaw);
  return {
    minX: position.x - footprint.width * 0.5,
    maxX: position.x + footprint.width * 0.5,
    minY: position.y - footprint.height * 0.5,
    maxY: position.y + footprint.height * 0.5,
    minZ: position.z - footprint.depth * 0.5,
    maxZ: position.z + footprint.depth * 0.5
  };
}

/** Tests horizontal overlap while allowing a small seam between adjacent pieces. */
export function buildBoundsOverlap(
  a: Pick<BuildBounds, 'minX' | 'maxX' | 'minZ' | 'maxZ'>,
  b: Pick<BuildBounds, 'minX' | 'maxX' | 'minZ' | 'maxZ'>,
  padding: number
): boolean {
  return a.minX < b.maxX - padding
    && a.maxX > b.minX + padding
    && a.minZ < b.maxZ - padding
    && a.maxZ > b.minZ + padding;
}

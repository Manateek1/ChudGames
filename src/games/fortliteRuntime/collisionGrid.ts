import type { ObstacleBox } from './types';

/**
 * Broad-phase index for the small axis-aligned collision boxes used by FortLite.
 * The returned result array is reused because callers consume it synchronously.
 */
export class ObstacleSpatialIndex {
  private readonly cellSize: number;
  private readonly cells = new Map<string, ObstacleBox[]>();
  private readonly queryResults: ObstacleBox[] = [];
  private readonly querySet = new Set<ObstacleBox>();

  constructor(cellSize = 32) {
    this.cellSize = cellSize;
  }

  rebuild(obstacles: readonly ObstacleBox[]): void {
    this.cells.clear();

    for (const obstacle of obstacles) {
      const minCellX = this.toCell(obstacle.minX);
      const maxCellX = this.toCell(obstacle.maxX);
      const minCellZ = this.toCell(obstacle.minZ);
      const maxCellZ = this.toCell(obstacle.maxZ);

      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
          const key = this.key(cellX, cellZ);
          const entries = this.cells.get(key);
          if (entries) {
            entries.push(obstacle);
          } else {
            this.cells.set(key, [obstacle]);
          }
        }
      }
    }
  }

  queryCircle(x: number, z: number, radius: number): readonly ObstacleBox[] {
    return this.queryBounds(x - radius, z - radius, x + radius, z + radius);
  }

  queryBounds(minX: number, minZ: number, maxX: number, maxZ: number): readonly ObstacleBox[] {
    this.queryResults.length = 0;
    this.querySet.clear();

    const minCellX = this.toCell(minX);
    const maxCellX = this.toCell(maxX);
    const minCellZ = this.toCell(minZ);
    const maxCellZ = this.toCell(maxZ);

    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        const entries = this.cells.get(this.key(cellX, cellZ));
        if (!entries) {
          continue;
        }

        for (const obstacle of entries) {
          if (!this.querySet.has(obstacle)) {
            this.querySet.add(obstacle);
            this.queryResults.push(obstacle);
          }
        }
      }
    }

    return this.queryResults;
  }

  private toCell(value: number): number {
    return Math.floor(value / this.cellSize);
  }

  private key(cellX: number, cellZ: number): string {
    return `${cellX}:${cellZ}`;
  }
}

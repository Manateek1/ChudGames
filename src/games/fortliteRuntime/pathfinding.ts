import * as THREE from 'three';
import type { ObstacleBox } from './types';

interface Node {
  x: number;
  z: number;
  cost: number;
  priority: number;
}

export class GridPathfinder {
  readonly size: number;
  readonly cellSize: number;
  readonly halfExtent: number;
  private readonly blocked: boolean[][];

  constructor(size: number, cellSize: number) {
    this.size = size;
    this.cellSize = cellSize;
    this.halfExtent = (size * cellSize) * 0.5;
    this.blocked = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  }

  rebuild(obstacles: readonly ObstacleBox[]): void {
    for (let z = 0; z < this.size; z += 1) {
      for (let x = 0; x < this.size; x += 1) {
        this.blocked[z][x] = false;
      }
    }

    for (const obstacle of obstacles) {
      const min = this.worldToCell(new THREE.Vector3(obstacle.minX, 0, obstacle.minZ));
      const max = this.worldToCell(new THREE.Vector3(obstacle.maxX, 0, obstacle.maxZ));
      for (let z = Math.max(0, min.z); z <= Math.min(this.size - 1, max.z); z += 1) {
        for (let x = Math.max(0, min.x); x <= Math.min(this.size - 1, max.x); x += 1) {
          this.blocked[z][x] = true;
        }
      }
    }
  }

  worldToCell(position: THREE.Vector3): { x: number; z: number } {
    const x = Math.floor((position.x + this.halfExtent) / this.cellSize);
    const z = Math.floor((position.z + this.halfExtent) / this.cellSize);
    return {
      x: THREE.MathUtils.clamp(x, 0, this.size - 1),
      z: THREE.MathUtils.clamp(z, 0, this.size - 1)
    };
  }

  cellToWorld(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(
      -this.halfExtent + x * this.cellSize + this.cellSize * 0.5,
      0,
      -this.halfExtent + z * this.cellSize + this.cellSize * 0.5
    );
  }

  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const start = this.worldToCell(from);
    const goal = this.worldToCell(to);
    if (this.blocked[goal.z][goal.x]) {
      return [];
    }

    const frontier: Node[] = [{ x: start.x, z: start.z, cost: 0, priority: 0 }];
    const cameFrom = new Map<string, string | null>();
    const costSoFar = new Map<string, number>();
    const startKey = this.key(start.x, start.z);
    cameFrom.set(startKey, null);
    costSoFar.set(startKey, 0);

    while (frontier.length > 0) {
      frontier.sort((a, b) => a.priority - b.priority);
      const current = frontier.shift()!;
      if (current.x === goal.x && current.z === goal.z) {
        break;
      }

      for (const neighbor of this.getNeighbors(current.x, current.z)) {
        const newCost = (costSoFar.get(this.key(current.x, current.z)) ?? 0) + neighbor.cost;
        const key = this.key(neighbor.x, neighbor.z);
        if ((costSoFar.get(key) ?? Number.POSITIVE_INFINITY) <= newCost) {
          continue;
        }

        costSoFar.set(key, newCost);
        const priority = newCost + Math.hypot(goal.x - neighbor.x, goal.z - neighbor.z);
        frontier.push({ x: neighbor.x, z: neighbor.z, cost: newCost, priority });
        cameFrom.set(key, this.key(current.x, current.z));
      }
    }

    const goalKey = this.key(goal.x, goal.z);
    if (!cameFrom.has(goalKey)) {
      return [];
    }

    const path: THREE.Vector3[] = [];
    let currentKey: string | null = goalKey;
    while (currentKey) {
      const [xString, zString] = currentKey.split(':');
      path.push(this.cellToWorld(Number.parseInt(xString, 10), Number.parseInt(zString, 10)));
      currentKey = cameFrom.get(currentKey) ?? null;
    }

    path.reverse();
    return path;
  }

  isBlocked(position: THREE.Vector3): boolean {
    const cell = this.worldToCell(position);
    return this.blocked[cell.z][cell.x];
  }

  private getNeighbors(x: number, z: number): Array<{ x: number; z: number; cost: number }> {
    const neighbors: Array<{ x: number; z: number; cost: number }> = [];
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dz === 0) {
          continue;
        }

        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= this.size || nz >= this.size || this.blocked[nz][nx]) {
          continue;
        }

        neighbors.push({
          x: nx,
          z: nz,
          cost: dx !== 0 && dz !== 0 ? 1.41 : 1
        });
      }
    }

    return neighbors;
  }

  private key(x: number, z: number): string {
    return `${x}:${z}`;
  }
}

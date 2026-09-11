import { describe, expect, it } from 'vitest';
import { ObstacleSpatialIndex } from '../collisionGrid';
import type { ObstacleBox } from '../types';

function obstacle(minX: number, maxX: number, minZ: number, maxZ: number): ObstacleBox {
  return { minX, maxX, minZ, maxZ, height: 2, mesh: {} as ObstacleBox['mesh'] };
}

describe('ObstacleSpatialIndex', () => {
  it('returns only boxes in the queried broad-phase cells', () => {
    const near = obstacle(-2, 2, -2, 2);
    const far = obstacle(100, 104, 100, 104);
    const index = new ObstacleSpatialIndex(16);
    index.rebuild([near, far]);

    expect(index.queryCircle(0, 0, 1)).toEqual([near]);
    expect(index.queryBounds(96, 96, 110, 110)).toEqual([far]);
  });

  it('deduplicates boxes spanning multiple cells', () => {
    const large = obstacle(-40, 40, -40, 40);
    const index = new ObstacleSpatialIndex(16);
    index.rebuild([large]);

    expect(index.queryBounds(-20, -20, 20, 20)).toEqual([large]);
  });
});

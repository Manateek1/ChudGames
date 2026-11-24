import { describe, expect, it } from 'vitest';
import { MAP_RADIUS } from '../content';
import { findOpenLootPoint, getFieldWeaponPoints } from '../lootDistribution';
import { SeededRandom } from '../math';
import { IslandTerrain } from '../terrain';

describe('FortLite field weapons', () => {
  it.each([42, 1337, 777])('supplies spaced weapons on dry ground for seed %s', (seed) => {
    const terrain = new IslandTerrain(new SeededRandom(seed), MAP_RADIUS, 'low');
    try {
      const dry = (x: number, z: number) => terrain.sampleHeight(x, z) > 0.23;
      const points = getFieldWeaponPoints(dry);
      expect(points.length).toBeGreaterThanOrEqual(45);
      for (const [index, point] of points.entries()) {
        expect(dry(point.x, point.z)).toBe(true);
        expect(Math.hypot(point.x, point.z)).toBeLessThan(MAP_RADIUS - 10);
        for (const other of points.slice(index + 1)) {
          expect(Math.hypot(other.x - point.x, other.z - point.z)).toBeGreaterThan(12);
        }
      }
    } finally {
      terrain.dispose();
    }
  });

  it('shifts a blocked drop to nearby open ground with a bounded search', () => {
    const point = findOpenLootPoint(0, 0, (x, z) => x > 2 && z >= 0, 9);
    expect(point).toEqual({ x: 3, z: 0 });
    expect(findOpenLootPoint(0, 0, () => false, 9)).toBeNull();
  });
});

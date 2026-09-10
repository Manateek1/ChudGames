import { describe, expect, it } from 'vitest';
import { IslandTerrain } from '../terrain';
import { SeededRandom } from '../math';
import { MAP_RADIUS } from '../content';

describe('IslandTerrain Procedural Generation', () => {
  it('generates valid terrain with no NaN vertices, colors, or normals', () => {
    const rng = new SeededRandom(42);
    const terrain = new IslandTerrain(rng, MAP_RADIUS, 'low');

    const pos = terrain.terrainMesh.geometry.attributes.position;
    const col = terrain.terrainMesh.geometry.attributes.color;
    const norm = terrain.terrainMesh.geometry.attributes.normal;

    expect(pos.count).toBeGreaterThan(0);
    expect(col.count).toBe(pos.count);
    expect(norm.count).toBe(pos.count);

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      expect(Number.isFinite(y)).toBe(true);
      expect(isNaN(y)).toBe(false);

      const r = col.getX(i);
      const g = col.getY(i);
      const b = col.getZ(i);
      expect(Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)).toBe(true);

      const ny = norm.getY(i);
      expect(Number.isFinite(ny)).toBe(true);
    }

    terrain.dispose();
  });

  it('samples valid heights at center, points of interest, and map edge', () => {
    const rng = new SeededRandom(1337);
    const terrain = new IslandTerrain(rng, MAP_RADIUS, 'medium');

    const centerH = terrain.sampleHeight(0, 0);
    expect(Number.isFinite(centerH)).toBe(true);
    expect(isNaN(centerH)).toBe(false);

    // Hill Settlement (North)
    const northH = terrain.sampleHeight(0, -MAP_RADIUS * 0.5);
    expect(Number.isFinite(northH)).toBe(true);
    expect(northH).toBeGreaterThan(5); // hill elevation

    // Lighthouse Overlook (West)
    const westH = terrain.sampleHeight(-MAP_RADIUS * 0.6, 0);
    expect(Number.isFinite(westH)).toBe(true);
    expect(westH).toBeGreaterThan(8); // cliff elevation

    // Far out in the ocean (beyond map radius)
    const oceanH = terrain.sampleHeight(MAP_RADIUS * 1.5, MAP_RADIUS * 1.5);
    expect(oceanH).toBe(-2);

    terrain.dispose();
  });

  it('computes valid normalized normals', () => {
    const rng = new SeededRandom(999);
    const terrain = new IslandTerrain(rng, MAP_RADIUS, 'low');

    const normal = terrain.getNormal(0, 0);
    expect(Number.isFinite(normal.x)).toBe(true);
    expect(Number.isFinite(normal.y)).toBe(true);
    expect(Number.isFinite(normal.z)).toBe(true);
    expect(normal.length()).toBeCloseTo(1.0, 2);

    terrain.dispose();
  });

  it('places instanced trees on valid ground elevation', () => {
    const rng = new SeededRandom(777);
    const terrain = new IslandTerrain(rng, MAP_RADIUS, 'low');

    expect(terrain.treeTrunks.count).toBeGreaterThan(50);
    expect(terrain.treeCanopies.count).toBe(terrain.treeTrunks.count);

    terrain.dispose();
  });
});

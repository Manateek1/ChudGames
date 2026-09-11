import { describe, expect, it } from 'vitest';
import { buildBoundsOverlap, getBuildBounds, getBuildFootprint, getBuildSupportHeight } from '../buildPlacement';

describe('FortLite build placement geometry', () => {
  it('keeps stacked pieces aligned while preserving separate vertical bounds', () => {
    const lowerWall = getBuildBounds('wall', { x: 0, y: 2, z: 0 }, 0);
    const upperWall = getBuildBounds('wall', { x: 0, y: 6, z: 0 }, 0);

    expect(getBuildSupportHeight('wall', 2)).toBe(4);
    expect(lowerWall.maxY).toBe(4);
    expect(upperWall.minY).toBe(4);
    expect(buildBoundsOverlap(lowerWall, upperWall, 0.12)).toBe(true);
    expect(Math.abs(lowerWall.minY - upperWall.minY)).toBeGreaterThan(0.45);
  });

  it('swaps a ramp footprint when rotated without changing its height', () => {
    const ramp = getBuildFootprint('ramp', Math.PI * 0.5);

    expect(ramp.width).toBeCloseTo(5.2);
    expect(ramp.depth).toBeCloseTo(4);
    expect(ramp.height).toBe(3);
  });
});

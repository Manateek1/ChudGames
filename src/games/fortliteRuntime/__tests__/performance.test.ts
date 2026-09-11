import { describe, expect, it } from 'vitest';
import {
  BotSimulationScheduler,
  getFortLiteQualityProfile,
  getFortLiteRenderIntervalMs,
  getFortLiteWorldRenderBudget
} from '../performance';

interface TestActor {
  alive: boolean;
  spawnState: 'parachuting' | 'grounded';
  priority: boolean;
}

describe('FortLite performance budgets', () => {
  it('gives the low preset a bounded world-render budget', () => {
    const low = getFortLiteWorldRenderBudget('low', 396);
    const medium = getFortLiteWorldRenderBudget('medium', 396);

    expect(low.maxVisibleActors).toBe(10);
    expect(low.cameraFar).toBeLessThan(medium.cameraFar);
    expect(low.fogDistance).toBeLessThanOrEqual(low.cameraFar);
    expect(getFortLiteRenderIntervalMs('low')).toBeCloseTo(1000 / 30);
  });

  it('keeps the low preset bot decision budget bounded', () => {
    const scheduler = new BotSimulationScheduler<TestActor>();
    const actors = Array.from({ length: 49 }, (_, index) => ({
      alive: true,
      spawnState: 'grounded' as const,
      priority: index < 3
    }));

    const selected = scheduler.select(
      actors,
      'low',
      () => 3,
      (actor) => actor.priority,
      () => false
    );

    expect(selected).toHaveLength(getFortLiteQualityProfile('low').botSimulationBudget);
    expect(selected.slice(0, 3).every(({ actor }) => actor.priority)).toBe(true);
  });

  it('always keeps living airborne actors responsive', () => {
    const scheduler = new BotSimulationScheduler<TestActor>();
    const actors = [
      ...Array.from({ length: 20 }, () => ({ alive: true, spawnState: 'parachuting' as const, priority: false })),
      ...Array.from({ length: 40 }, () => ({ alive: true, spawnState: 'grounded' as const, priority: false }))
    ];

    const selected = scheduler.select(actors, 'low', () => 6, () => false, () => false);
    expect(selected.filter(({ actor }) => actor.spawnState === 'parachuting')).toHaveLength(20);
  });
});

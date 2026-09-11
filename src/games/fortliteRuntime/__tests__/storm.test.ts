import { describe, expect, it } from 'vitest';
import { STORM_DAMAGE_PER_SECOND, STORM_PHASES } from '../content';

describe('FortLite storm tuning', () => {
  it('deals exactly 2 HP per second in every phase', () => {
    expect(STORM_DAMAGE_PER_SECOND).toBe(2);
    expect(STORM_PHASES.every((phase) => phase.damagePerSecond === STORM_DAMAGE_PER_SECOND)).toBe(true);
  });
});

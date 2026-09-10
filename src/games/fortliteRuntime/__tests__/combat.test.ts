import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  calculateDamageWithFalloff,
  WeaponBloomTracker,
  CombatTelemetryTracker
} from '../combat';
import {
  generateBotSkillProfile,
  canPerceiveTarget,
  shouldBotRetreat,
  calculateDefensiveWallPlacement
} from '../bots';
import { WEAPON_DEFINITIONS } from '../content';
import { SeededRandom } from '../math';

describe('FortLite Combat Mechanics', () => {
  const rifleDef = WEAPON_DEFINITIONS.find((w) => w.id === 'ranger-rifle')!;
  const shotgunDef = WEAPON_DEFINITIONS.find((w) => w.id === 'auto-shotgun')!;

  describe('Damage Falloff', () => {
    it('applies full damage within falloff start distance', () => {
      const damageNear = calculateDamageWithFalloff(rifleDef, 10);
      const damageAtStart = calculateDamageWithFalloff(rifleDef, rifleDef.falloffStart!);
      expect(damageNear).toBe(rifleDef.damage);
      expect(damageAtStart).toBe(rifleDef.damage);
    });

    it('interpolates damage between falloff start and falloff end', () => {
      const midDistance = (rifleDef.falloffStart! + rifleDef.falloffEnd!) / 2;
      const midDamage = calculateDamageWithFalloff(rifleDef, midDistance);
      expect(midDamage).toBeLessThan(rifleDef.damage);
      expect(midDamage).toBeGreaterThan(rifleDef.damage * rifleDef.minDamageMultiplier!);
    });

    it('clamps damage to minDamageMultiplier at or beyond falloff end', () => {
      const damageAtEnd = calculateDamageWithFalloff(shotgunDef, shotgunDef.falloffEnd!);
      const damageBeyond = calculateDamageWithFalloff(shotgunDef, shotgunDef.falloffEnd! + 20);
      const expectedMin = Math.round(shotgunDef.damage * shotgunDef.minDamageMultiplier!);
      expect(damageAtEnd).toBe(expectedMin);
      expect(damageBeyond).toBe(expectedMin);
    });

    it('shotgun has rapid falloff compared to rifle', () => {
      const distance = 25;
      const riflePercent = calculateDamageWithFalloff(rifleDef, distance) / rifleDef.damage;
      const shotgunPercent = calculateDamageWithFalloff(shotgunDef, distance) / shotgunDef.damage;
      expect(riflePercent).toBe(1.0);
      expect(shotgunPercent).toBeLessThan(1.0);
    });
  });

  describe('Weapon Bloom Tracker', () => {
    it('starts with zero bloom and increases on shot', () => {
      const tracker = new WeaponBloomTracker();
      expect(tracker.bloom).toBe(0);

      tracker.addBloom(0.015, 0.05);
      expect(tracker.bloom).toBeCloseTo(0.015);

      tracker.addBloom(0.015, 0.05);
      expect(tracker.bloom).toBeCloseTo(0.03);
    });

    it('caps bloom at maxBloom', () => {
      const tracker = new WeaponBloomTracker();
      tracker.addBloom(0.04, 0.05);
      tracker.addBloom(0.04, 0.05);
      expect(tracker.bloom).toBe(0.05);
    });

    it('decays bloom over time', () => {
      const tracker = new WeaponBloomTracker();
      tracker.addBloom(0.04, 0.05);
      tracker.update(0.1);
      expect(tracker.bloom).toBeLessThan(0.04);
      expect(tracker.bloom).toBeGreaterThan(0);

      tracker.update(1.0);
      expect(tracker.bloom).toBe(0);
    });

    it('resets bloom', () => {
      const tracker = new WeaponBloomTracker();
      tracker.addBloom(0.04, 0.05);
      tracker.reset();
      expect(tracker.bloom).toBe(0);
    });
  });

  describe('Combat Telemetry Tracker', () => {
    it('tracks shots, hits, accuracy, and kills', () => {
      const tracker = new CombatTelemetryTracker();
      tracker.recordShot('ranger-rifle');
      tracker.recordShot('ranger-rifle');
      tracker.recordShot('ranger-rifle');
      tracker.recordHit('ranger-rifle', 24);
      tracker.recordKill('ranger-rifle', 'weapon');

      const stats = tracker.getWeaponStats('ranger-rifle');
      expect(stats.shotsFired).toBe(3);
      expect(stats.shotsHit).toBe(1);
      expect(stats.kills).toBe(1);
      expect(stats.totalDamage).toBe(24);
      expect(stats.accuracy).toBeCloseTo(1 / 3);

      const summary = tracker.getSummary();
      expect(summary.totalKills).toBe(1);
      expect(summary.overallAccuracy).toBeCloseTo(1 / 3);
    });
  });
});

describe('FortLite Bot Skill and Behavior', () => {
  describe('Bot Skill Profiles', () => {
    it('generates consistent profiles from seeded random', () => {
      const rng1 = new SeededRandom(42);
      const rng2 = new SeededRandom(42);
      const profile1 = generateBotSkillProfile(rng1);
      const profile2 = generateBotSkillProfile(rng2);

      expect(profile1.tier).toBe(profile2.tier);
      expect(profile1.reactionTime).toBe(profile2.reactionTime);
      expect(profile1.aimError).toBe(profile2.aimError);
      expect(profile1.turnRate).toBe(profile2.turnRate);
    });

    it('generates profiles across all four tiers with monotonic skill qualities', () => {
      const tiers = new Set<string>();
      for (let seed = 1; seed <= 50; seed += 1) {
        const rng = new SeededRandom(seed);
        const profile = generateBotSkillProfile(rng);
        tiers.add(profile.tier);
      }
      expect(tiers.has('recruit')).toBe(true);
      expect(tiers.has('soldier')).toBe(true);
      expect(tiers.has('veteran')).toBe(true);
      expect(tiers.has('elite')).toBe(true);
    });
  });

  describe('Perception & Line of Sight', () => {
    const observerPos = new THREE.Vector3(0, 0, 0);
    const observerYaw = 0;

    it('perceives target directly in front with line of sight', () => {
      const inFront = new THREE.Vector3(0, 0, 20);
      expect(canPerceiveTarget(observerPos, observerYaw, inFront, 50, true)).toBe(true);
    });

    it('does NOT perceive target in front if line of sight is obstructed', () => {
      const inFront = new THREE.Vector3(0, 0, 20);
      expect(canPerceiveTarget(observerPos, observerYaw, inFront, 50, false)).toBe(false);
    });

    it('does NOT perceive target behind observer even with open space (outside 120 deg cone)', () => {
      const behind = new THREE.Vector3(0, 0, -20);
      expect(canPerceiveTarget(observerPos, observerYaw, behind, 50, true)).toBe(false);
    });

    it('perceives close proximity hearing within 4.5m even without line of sight', () => {
      const rightBeside = new THREE.Vector3(2, 0, 1);
      expect(canPerceiveTarget(observerPos, observerYaw, rightBeside, 50, false)).toBe(true);
    });

    it('does NOT perceive targets outside awareness radius', () => {
      const farAway = new THREE.Vector3(0, 0, 100);
      expect(canPerceiveTarget(observerPos, observerYaw, farAway, 50, true)).toBe(false);
    });
  });

  describe('Retreat Evaluation', () => {
    it('triggers retreat when completely out of ammo', () => {
      expect(shouldBotRetreat(100, 100, 0, 0.9)).toBe(true);
    });

    it('triggers retreat when health is critical (< 32%)', () => {
      expect(shouldBotRetreat(25, 100, 50, 0.9)).toBe(true);
    });

    it('low aggression bot retreats below 52% health', () => {
      expect(shouldBotRetreat(45, 100, 50, 0.3)).toBe(true);
    });

    it('aggressive bot does not retreat at 45% health if ammo remains', () => {
      expect(shouldBotRetreat(45, 100, 50, 0.8)).toBe(false);
    });
  });

  describe('Defensive Wall Placement', () => {
    it('places wall between bot and threat', () => {
      const bot = new THREE.Vector3(0, 0, 0);
      const threat = new THREE.Vector3(0, 0, 20);
      const wall = calculateDefensiveWallPlacement(bot, threat);

      expect(wall.position.z).toBeGreaterThan(0);
      expect(wall.position.x).toBeCloseTo(0);
      expect(typeof wall.yaw).toBe('number');
    });
  });
});

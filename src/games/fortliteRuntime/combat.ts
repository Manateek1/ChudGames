import type { WeaponDefinition } from './types';

/**
 * Calculates damage considering weapon effective range and falloff brackets.
 */
export function calculateDamageWithFalloff(
  weapon: WeaponDefinition,
  distance: number
): number {
  const falloffStart = weapon.falloffStart ?? weapon.range * 0.45;
  const falloffEnd = weapon.falloffEnd ?? weapon.range;
  const minMultiplier = weapon.minDamageMultiplier ?? 0.5;

  if (distance <= falloffStart) {
    return weapon.damage;
  }

  if (distance >= falloffEnd) {
    return Math.max(1, Math.round(weapon.damage * minMultiplier));
  }

  const progress = (distance - falloffStart) / Math.max(1, falloffEnd - falloffStart);
  const multiplier = 1 - progress * (1 - minMultiplier);
  return Math.max(1, Math.round(weapon.damage * multiplier));
}

/**
 * Tracks weapon spread bloom during sustained automatic fire and recoil recovery.
 */
export class WeaponBloomTracker {
  private currentBloom = 0;

  /**
   * Increases bloom on trigger pull.
   */
  addBloom(perShot: number, maxBloom: number): void {
    this.currentBloom = Math.min(maxBloom, this.currentBloom + perShot);
  }

  /**
   * Recovers bloom towards zero when not actively firing.
   */
  update(dt: number, recoverySpeed = 0.08): void {
    if (this.currentBloom > 0) {
      this.currentBloom = Math.max(0, this.currentBloom - dt * recoverySpeed);
    }
  }

  get bloom(): number {
    return this.currentBloom;
  }

  reset(): void {
    this.currentBloom = 0;
  }
}

export interface WeaponCombatStats {
  shotsFired: number;
  shotsHit: number;
  kills: number;
  totalDamage: number;
  accuracy: number;
}

export interface CombatStatsSummary {
  playerShots: number;
  playerHits: number;
  playerAccuracy: number;
  botShots: number;
  botHits: number;
  botAccuracy: number;
  totalKills: number;
  overallAccuracy: number;
  killsByWeapon: Record<string, number>;
  killsByCause: Record<string, number>;
  averageFightDurationSeconds: number;
  totalFightsRecorded: number;
}

/**
 * Telemetry tracker recording combat performance, hit accuracy, and weapon usage.
 */
export class CombatTelemetryTracker {
  private playerShots = 0;
  private playerHits = 0;
  private botShots = 0;
  private botHits = 0;

  private readonly weaponShots: Record<string, number> = {};
  private readonly weaponHits: Record<string, number> = {};
  private readonly weaponDamage: Record<string, number> = {};
  private readonly killsByWeapon: Record<string, number> = {};
  private readonly killsByCause: Record<string, number> = {};

  private readonly completedFightDurations: number[] = [];
  private readonly activeFights = new Map<string, number>();

  recordShot(actorKindOrWeapon: 'player' | 'bot' | string, maybeWeaponId?: string): void {
    if (actorKindOrWeapon === 'player') {
      this.playerShots += 1;
      if (maybeWeaponId) {
        this.weaponShots[maybeWeaponId] = (this.weaponShots[maybeWeaponId] ?? 0) + 1;
      }
    } else if (actorKindOrWeapon === 'bot') {
      this.botShots += 1;
      if (maybeWeaponId) {
        this.weaponShots[maybeWeaponId] = (this.weaponShots[maybeWeaponId] ?? 0) + 1;
      }
    } else {
      // Direct weaponId passed
      this.playerShots += 1;
      this.weaponShots[actorKindOrWeapon] = (this.weaponShots[actorKindOrWeapon] ?? 0) + 1;
    }
  }

  recordHit(actorKindOrWeapon: 'player' | 'bot' | string, damageOrWeapon?: number | string, maybeDamage?: number): void {
    if (actorKindOrWeapon === 'player') {
      this.playerHits += 1;
      if (typeof damageOrWeapon === 'string') {
        this.weaponHits[damageOrWeapon] = (this.weaponHits[damageOrWeapon] ?? 0) + 1;
        if (typeof maybeDamage === 'number') {
          this.weaponDamage[damageOrWeapon] = (this.weaponDamage[damageOrWeapon] ?? 0) + maybeDamage;
        }
      }
    } else if (actorKindOrWeapon === 'bot') {
      this.botHits += 1;
    } else {
      // Direct weaponId passed
      this.playerHits += 1;
      this.weaponHits[actorKindOrWeapon] = (this.weaponHits[actorKindOrWeapon] ?? 0) + 1;
      if (typeof damageOrWeapon === 'number') {
        this.weaponDamage[actorKindOrWeapon] = (this.weaponDamage[actorKindOrWeapon] ?? 0) + damageOrWeapon;
      }
    }
  }

  recordKill(weaponId: string, cause: string): void {
    this.killsByWeapon[weaponId] = (this.killsByWeapon[weaponId] ?? 0) + 1;
    this.killsByCause[cause] = (this.killsByCause[cause] ?? 0) + 1;
  }

  recordFightEngagement(actorAId: string, actorBId: string, currentTime: number): void {
    const key = [actorAId, actorBId].sort().join(':');
    if (!this.activeFights.has(key)) {
      this.activeFights.set(key, currentTime);
    }
  }

  recordFightConclusion(actorAId: string, actorBId: string, currentTime: number): void {
    const key = [actorAId, actorBId].sort().join(':');
    const startTime = this.activeFights.get(key);
    if (startTime !== undefined) {
      const duration = Math.max(0.2, currentTime - startTime);
      this.completedFightDurations.push(duration);
      this.activeFights.delete(key);
    }
  }

  getWeaponStats(weaponId: string): WeaponCombatStats {
    const shotsFired = this.weaponShots[weaponId] ?? 0;
    const shotsHit = this.weaponHits[weaponId] ?? 0;
    const kills = this.killsByWeapon[weaponId] ?? 0;
    const totalDamage = this.weaponDamage[weaponId] ?? 0;
    const accuracy = shotsFired > 0 ? shotsHit / shotsFired : 0;
    return { shotsFired, shotsHit, kills, totalDamage, accuracy };
  }

  getSummary(): CombatStatsSummary {
    const totalShots = this.playerShots + this.botShots;
    const totalHits = this.playerHits + this.botHits;
    const playerAccuracy = this.playerShots > 0 ? (this.playerHits / this.playerShots) * 100 : 0;
    const botAccuracy = this.botShots > 0 ? (this.botHits / this.botShots) * 100 : 0;
    const overallAccuracy = totalShots > 0 ? totalHits / totalShots : 0;
    const totalKills = Object.values(this.killsByWeapon).reduce((sum, count) => sum + count, 0);

    const avgDuration =
      this.completedFightDurations.length > 0
        ? this.completedFightDurations.reduce((a, b) => a + b, 0) / this.completedFightDurations.length
        : 0;

    return {
      playerShots: this.playerShots,
      playerHits: this.playerHits,
      playerAccuracy: Math.round(playerAccuracy * 10) / 10,
      botShots: this.botShots,
      botHits: this.botHits,
      botAccuracy: Math.round(botAccuracy * 10) / 10,
      totalKills,
      overallAccuracy,
      killsByWeapon: { ...this.killsByWeapon },
      killsByCause: { ...this.killsByCause },
      averageFightDurationSeconds: Math.round(avgDuration * 10) / 10,
      totalFightsRecorded: this.completedFightDurations.length,
    };
  }
}

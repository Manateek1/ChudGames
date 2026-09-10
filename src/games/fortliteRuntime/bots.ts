import * as THREE from 'three';
import { SeededRandom } from './math';

export type BotSkillTier = 'recruit' | 'soldier' | 'veteran' | 'elite';

export interface BotSkillProfile {
  tier: BotSkillTier;
  reactionTime: number; // Seconds delay before reacting to stimulus
  aimError: number; // Maximum angular aim offset in radians
  burstMinShots: number;
  burstMaxShots: number;
  burstCooldown: number;
  aggression: number; // 0 to 1 scale
  turnRate: number; // Radians per second maximum rotation speed
  awarenessRadius: number; // Visual / engagement detection distance
  buildFrequency: number; // Chance to build defensive piece under fire
  memoryDuration: number; // Seconds a bot tracks last seen position after line-of-sight is lost
}

/**
 * Generates a calibrated skill profile for an opponent bot.
 */
export function generateBotSkillProfile(rng: SeededRandom): BotSkillProfile {
  const roll = rng.next();

  if (roll < 0.25) {
    // Recruit (25%): Forgiving, slower reactions, larger spread
    return {
      tier: 'recruit',
      reactionTime: 0.52,
      aimError: 0.082,
      burstMinShots: 2,
      burstMaxShots: 3,
      burstCooldown: 0.45,
      aggression: 0.35,
      turnRate: 3.6,
      awarenessRadius: 52,
      buildFrequency: 0.18,
      memoryDuration: 2.0,
    };
  }

  if (roll < 0.7) {
    // Soldier (45%): Standard combatant, balanced aim and building
    return {
      tier: 'soldier',
      reactionTime: 0.34,
      aimError: 0.046,
      burstMinShots: 3,
      burstMaxShots: 5,
      burstCooldown: 0.32,
      aggression: 0.55,
      turnRate: 5.2,
      awarenessRadius: 68,
      buildFrequency: 0.45,
      memoryDuration: 3.5,
    };
  }

  if (roll < 0.9) {
    // Veteran (20%): Fast reaction, disciplined bursts, active builder
    return {
      tier: 'veteran',
      reactionTime: 0.22,
      aimError: 0.026,
      burstMinShots: 4,
      burstMaxShots: 6,
      burstCooldown: 0.24,
      aggression: 0.72,
      turnRate: 7.0,
      awarenessRadius: 82,
      buildFrequency: 0.72,
      memoryDuration: 5.0,
    };
  }

  // Elite (10%): Sharp reflexes, tight aim, high defensive building
  return {
    tier: 'elite',
    reactionTime: 0.14,
    aimError: 0.014,
    burstMinShots: 5,
    burstMaxShots: 7,
    burstCooldown: 0.18,
    aggression: 0.88,
    turnRate: 8.8,
    awarenessRadius: 94,
    buildFrequency: 0.88,
    memoryDuration: 6.5,
  };
}

/**
 * Checks if a target is perceived via forward vision cone or close proximity hearing.
 * Prevents tracking unseen players through terrain and solid structures.
 */
export function canPerceiveTarget(
  observerPosition: THREE.Vector3,
  observerYaw: number,
  targetPosition: THREE.Vector3,
  awarenessRadius: number,
  hasLineOfSight: boolean
): boolean {
  const dx = targetPosition.x - observerPosition.x;
  const dz = targetPosition.z - observerPosition.z;
  const distSq = dx * dx + dz * dz;

  if (distSq > awarenessRadius * awarenessRadius) {
    return false;
  }

  const distance = Math.sqrt(distSq);

  // Very close hearing range (audible footsteps / close movement)
  if (distance < 9) {
    return hasLineOfSight || distance < 4.5;
  }

  if (!hasLineOfSight) {
    return false;
  }

  // Forward vision cone (120 degrees total: 60 degrees left/right)
  const toTargetAngle = Math.atan2(dx, dz);
  let angleDiff = Math.abs(toTargetAngle - observerYaw);
  while (angleDiff > Math.PI) {
    angleDiff = Math.abs(angleDiff - Math.PI * 2);
  }

  return angleDiff <= (Math.PI / 3); // 60 degrees
}

/**
 * Evaluates whether a bot should transition to the retreat state.
 */
export function shouldBotRetreat(
  health: number,
  maxHealth: number,
  totalAmmo: number,
  aggression: number
): boolean {
  const healthRatio = health / maxHealth;
  if (totalAmmo <= 0) {
    return true;
  }
  if (healthRatio < 0.32) {
    return true;
  }
  if (healthRatio < 0.52 && aggression < 0.45) {
    return true;
  }
  return false;
}

/**
 * Calculates a defensive wall placement perpendicular to an incoming threat direction.
 */
export function calculateDefensiveWallPlacement(
  botPosition: THREE.Vector3,
  threatPosition: THREE.Vector3
): { position: THREE.Vector3; yaw: number } {
  const toThreat = threatPosition.clone().sub(botPosition).setY(0);
  if (toThreat.lengthSq() < 0.01) {
    toThreat.set(0, 0, 1);
  } else {
    toThreat.normalize();
  }

  const wallPosition = botPosition.clone().addScaledVector(toThreat, 2.6);
  // Wall yaw perpendicular to threat
  const wallYaw = Math.atan2(-toThreat.x, -toThreat.z);

  return {
    position: wallPosition,
    yaw: wallYaw
  };
}

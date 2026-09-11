import type { GraphicsQuality } from '../../types/arcade';

export interface FortLiteQualityProfile {
  pixelRatio: number;
  minimumPixelRatio: number;
  toneMappingExposure: number;
  maxShotEffects: number;
  maxLandingDustEffects: number;
  botSimulationBudget: number;
  preciseBotSightDistance: number;
  hudUpdateIntervalMs: number;
}

export interface FortLiteWorldRenderBudget {
  cameraFar: number;
  fogDistance: number;
  skyRadius: number;
  maxVisibleActors: number;
}

const QUALITY_PROFILES: Record<GraphicsQuality, Omit<FortLiteQualityProfile, 'pixelRatio' | 'minimumPixelRatio'>> = {
  low: {
    toneMappingExposure: 1.08,
    maxShotEffects: 8,
    maxLandingDustEffects: 3,
    botSimulationBudget: 14,
    preciseBotSightDistance: 38,
    hudUpdateIntervalMs: 320
  },
  medium: {
    toneMappingExposure: 1.04,
    maxShotEffects: 14,
    maxLandingDustEffects: 6,
    botSimulationBudget: 24,
    preciseBotSightDistance: 58,
    hudUpdateIntervalMs: 220
  },
  high: {
    toneMappingExposure: 1.02,
    maxShotEffects: 20,
    maxLandingDustEffects: 10,
    botSimulationBudget: 50,
    preciseBotSightDistance: 120,
    hudUpdateIntervalMs: 160
  }
};

export function getFortLiteQualityProfile(quality: GraphicsQuality, devicePixelRatio = 1): FortLiteQualityProfile {
  const profile = QUALITY_PROFILES[quality];
  // Keep the low preset readable on normal hardware. Adaptive scaling only
  // moves below this floor when the device is genuinely struggling.
  const pixelRatioTarget = quality === 'low' ? 0.9 : quality === 'medium' ? 0.98 : 1;
  const pixelRatioMinimum = quality === 'low' ? 0.68 : quality === 'medium' ? 0.76 : 0.84;

  return {
    ...profile,
    pixelRatio: Math.min(devicePixelRatio || 1, pixelRatioTarget),
    minimumPixelRatio: Math.min(devicePixelRatio || 1, pixelRatioMinimum)
  };
}

export function getPreciseBotSightDistance(quality: GraphicsQuality): number {
  return QUALITY_PROFILES[quality].preciseBotSightDistance;
}

export function getHudUpdateIntervalMs(quality: GraphicsQuality): number {
  return QUALITY_PROFILES[quality].hudUpdateIntervalMs;
}

export function getFortLiteRenderIntervalMs(quality: GraphicsQuality): number {
  // The low preset keeps its reduced scene, actor, and effect budgets, but it
  // must not feel like a 30 FPS game. Simulation remains fixed at 30 Hz while
  // the presentation can use the display refresh rate and interpolate motion.
  if (quality === 'low') {
    return 1000 / 60;
  }
  if (quality === 'medium') {
    return 1000 / 45;
  }
  return 1000 / 60;
}

/**
 * Keeps the low preset focused on the playable area around the camera. The
 * scene fades into fog before the far plane, so hiding distant world detail
 * does not create a visible pop-in boundary.
 */
export function getFortLiteWorldRenderBudget(
  quality: GraphicsQuality,
  mapRadius: number
): FortLiteWorldRenderBudget {
  if (quality === 'low') {
    return {
      cameraFar: Math.min(186, mapRadius * 0.5),
      fogDistance: Math.min(180, mapRadius * 0.48),
      skyRadius: Math.min(166, mapRadius * 0.44),
      maxVisibleActors: 10
    };
  }

  if (quality === 'medium') {
    return {
      cameraFar: Math.min(284, mapRadius * 0.76),
      fogDistance: Math.min(246, mapRadius * 0.66),
      skyRadius: Math.min(236, mapRadius * 0.63),
      maxVisibleActors: 24
    };
  }

  return {
    cameraFar: mapRadius * 2.6,
    fogDistance: mapRadius,
    skyRadius: mapRadius * 2.2,
    maxVisibleActors: Number.POSITIVE_INFINITY
  };
}

export class AdaptiveResolutionController {
  private quality: GraphicsQuality;
  private devicePixelRatio: number;
  private currentPixelRatio: number;
  private lowFpsTime = 0;
  private highFpsTime = 0;
  private applyRatio: (ratio: number) => void;

  constructor(
    quality: GraphicsQuality,
    devicePixelRatio: number,
    applyRatio: (ratio: number) => void
  ) {
    this.quality = quality;
    this.devicePixelRatio = devicePixelRatio;
    this.applyRatio = applyRatio;
    this.currentPixelRatio = getFortLiteQualityProfile(quality, devicePixelRatio).pixelRatio;
  }

  get ratio(): number {
    return this.currentPixelRatio;
  }

  reset(quality: GraphicsQuality, devicePixelRatio = this.devicePixelRatio): void {
    this.quality = quality;
    this.devicePixelRatio = devicePixelRatio;
    const profile = getFortLiteQualityProfile(quality, devicePixelRatio);
    this.currentPixelRatio = profile.pixelRatio;
    this.lowFpsTime = 0;
    this.highFpsTime = 0;
    this.applyRatio(this.currentPixelRatio);
  }

  update(fps: number, dt: number): void {
    const profile = getFortLiteQualityProfile(this.quality, this.devicePixelRatio);

    if (fps <= 42 && this.currentPixelRatio > profile.minimumPixelRatio + 0.01) {
      this.lowFpsTime += dt;
      this.highFpsTime = 0;
      if (this.lowFpsTime >= 0.4) {
        this.currentPixelRatio = Math.max(profile.minimumPixelRatio, this.currentPixelRatio - 0.1);
        this.lowFpsTime = 0;
        this.applyRatio(this.currentPixelRatio);
      }
      return;
    }

    if (fps >= 56 && this.currentPixelRatio < profile.pixelRatio - 0.01) {
      this.highFpsTime += dt;
      this.lowFpsTime = 0;
      if (this.highFpsTime >= 1.5) {
        this.currentPixelRatio = Math.min(profile.pixelRatio, this.currentPixelRatio + 0.04);
        this.highFpsTime = 0;
        this.applyRatio(this.currentPixelRatio);
      }
      return;
    }

    this.lowFpsTime = 0;
    this.highFpsTime = 0;
  }
}

export interface BotScheduleEntry<T> {
  actor: T;
  index: number;
  step: number;
}

interface SchedulableActor {
  alive: boolean;
  spawnState: string;
}

/**
 * Keeps airborne actors responsive while putting a hard cap on expensive grounded AI.
 * The cursor rotates the background work so distant bots still receive regular turns.
 */
export class BotSimulationScheduler<T extends SchedulableActor> {
  private priorityCursor = 0;
  private backgroundCursor = 0;

  select(
    actors: readonly T[],
    quality: GraphicsQuality,
    getStep: (actor: T) => number,
    isPriority: (actor: T) => boolean,
    isPlayer: (actor: T) => boolean
  ): BotScheduleEntry<T>[] {
    const profile = getFortLiteQualityProfile(quality);
    const airborne: BotScheduleEntry<T>[] = [];
    const priority: BotScheduleEntry<T>[] = [];
    const background: BotScheduleEntry<T>[] = [];

    for (let index = 0; index < actors.length; index += 1) {
      const actor = actors[index];
      if (!actor.alive || isPlayer(actor)) {
        continue;
      }

      const entry = { actor, index, step: getStep(actor) };
      if (actor.spawnState !== 'grounded') {
        airborne.push(entry);
      } else if (isPriority(actor)) {
        priority.push(entry);
      } else {
        background.push(entry);
      }
    }

    const selected = airborne.slice();
    const remainingBudget = Math.max(0, profile.botSimulationBudget - selected.length);
    if (remainingBudget > 0 && priority.length > 0) {
      const start = this.priorityCursor % priority.length;
      for (let offset = 0; offset < priority.length && selected.length < profile.botSimulationBudget; offset += 1) {
        selected.push(priority[(start + offset) % priority.length]);
      }
      this.priorityCursor = (start + remainingBudget) % priority.length;
    }

    const backgroundBudget = Math.max(0, profile.botSimulationBudget - selected.length);
    if (backgroundBudget > 0 && background.length > 0) {
      const start = this.backgroundCursor % background.length;
      for (let offset = 0; offset < background.length && selected.length < profile.botSimulationBudget; offset += 1) {
        selected.push(background[(start + offset) % background.length]);
      }
      this.backgroundCursor = (start + backgroundBudget) % background.length;
    } else if (background.length > 0) {
      this.backgroundCursor = (this.backgroundCursor + 1) % background.length;
    }

    return selected;
  }
}

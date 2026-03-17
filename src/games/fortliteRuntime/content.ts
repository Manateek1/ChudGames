import type { MaterialType, StormPhase, WeaponDefinition } from './types';

export const BASE_MAP_RADIUS = 240;
export const MAP_SCALE = 3;
export const STORM_SPEED_MULTIPLIER = 4;
export const MAP_RADIUS = BASE_MAP_RADIUS * MAP_SCALE;
export const PLAYER_EYE_HEIGHT = 1.7;
export const ACTOR_RADIUS = 1;
export const BOT_COUNT = 50;
export const BUILD_GRID_SIZE = 4;
export const BUILD_COST = 20;
export const MAX_WEAPON_SLOTS = 2;
export const RESOURCE_RESPAWN_COUNT = 88 * MAP_SCALE;
export const PATHFINDING_GRID_SIZE = 128;
export const PATHFINDING_CELL_SIZE = 12;
export const FIXED_TIMESTEP = 1 / 60;
const SHRINK_DURATION_SCALE = MAP_SCALE / STORM_SPEED_MULTIPLIER;
const PAUSE_DURATION_SCALE = MAP_SCALE / STORM_SPEED_MULTIPLIER;

export const WEAPON_DEFINITIONS: readonly WeaponDefinition[] = [
  {
    id: 'ranger-rifle',
    name: 'Rifle',
    ammoType: 'light',
    damage: 25,
    range: 86,
    fireInterval: 0.16,
    magSize: 24,
    reloadDuration: 1.4,
    spread: 0.009,
    pellets: 1,
    reservePickup: 36,
    color: 0x47b6ff
  },
  {
    id: 'auto-shotgun',
    name: 'Shotgun',
    ammoType: 'shells',
    damage: 10,
    range: 26,
    fireInterval: 0.72,
    magSize: 6,
    reloadDuration: 1.9,
    spread: 0.082,
    pellets: 5,
    reservePickup: 12,
    color: 0xf6ae2d
  },
  {
    id: 'tactical-smg',
    name: 'SMG',
    ammoType: 'light',
    damage: 15,
    range: 54,
    fireInterval: 0.08,
    magSize: 30,
    reloadDuration: 1.65,
    spread: 0.015,
    pellets: 1,
    reservePickup: 40,
    color: 0x4ade80
  }
];

export const STORM_PHASES: readonly StormPhase[] = [
  { pauseDuration: 24 * PAUSE_DURATION_SCALE, shrinkDuration: 26 * SHRINK_DURATION_SCALE, targetRadius: 184 * MAP_SCALE, damagePerSecond: 1 },
  { pauseDuration: 20 * PAUSE_DURATION_SCALE, shrinkDuration: 22 * SHRINK_DURATION_SCALE, targetRadius: 136 * MAP_SCALE, damagePerSecond: 2 },
  { pauseDuration: 16 * PAUSE_DURATION_SCALE, shrinkDuration: 20 * SHRINK_DURATION_SCALE, targetRadius: 84 * MAP_SCALE, damagePerSecond: 4 },
  { pauseDuration: 12 * PAUSE_DURATION_SCALE, shrinkDuration: 18 * SHRINK_DURATION_SCALE, targetRadius: 40 * MAP_SCALE, damagePerSecond: 7 },
  { pauseDuration: 8 * PAUSE_DURATION_SCALE, shrinkDuration: 14 * SHRINK_DURATION_SCALE, targetRadius: 12 * MAP_SCALE, damagePerSecond: 12 }
];

export const RESOURCE_COLORS: Record<MaterialType, number> = {
  wood: 0x8c5a30,
  stone: 0x88919a,
  metal: 0x8aa1b8
};

export const MATERIAL_DISPLAY_NAMES: Record<MaterialType, string> = {
  wood: 'Wood',
  stone: 'Stone',
  metal: 'Metal'
};

export const MATERIAL_PRIORITY: readonly MaterialType[] = ['wood', 'stone', 'metal'];

export const HELP_TEXT =
  'W forward, A left, S back, D right. Mouse aim, Shift sprint, Space jump, F fullscreen. Hold right click to zoom. Walk over ammo and materials to auto-pick them up, use E to pick up guns, Q enters or exits build mode, Z wall, Y floor, X ramp, 1/2/3 regular hotbar, R reload or rotate, Enter restarts.';

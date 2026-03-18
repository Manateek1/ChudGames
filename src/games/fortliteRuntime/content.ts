import type { MaterialType, StormPhase, WeaponDefinition } from './types';

export const BASE_MAP_RADIUS = 180;
export const MAP_SCALE = 3;
export const STORM_SPEED_MULTIPLIER = 4;
const RELOAD_TIME_MULTIPLIER = 2.5;
export const MAP_RADIUS = BASE_MAP_RADIUS * MAP_SCALE;
export const PLAYER_EYE_HEIGHT = 1.7;
export const ACTOR_RADIUS = 1;
export const BOT_COUNT = 99;
export const BUILD_GRID_SIZE = 4;
export const BUILD_COST = 20;
export const MAX_WEAPON_SLOTS = 3;
export const RESOURCE_RESPAWN_COUNT = 30 * MAP_SCALE;
export const PATHFINDING_GRID_SIZE = 96;
export const PATHFINDING_CELL_SIZE = 12;
export const FIXED_TIMESTEP = 1 / 60;
const SHRINK_DURATION_SCALE = MAP_SCALE / STORM_SPEED_MULTIPLIER;
const PAUSE_DURATION_SCALE = MAP_SCALE / STORM_SPEED_MULTIPLIER;

export const WEAPON_DEFINITIONS: readonly WeaponDefinition[] = [
  {
    id: 'ranger-rifle',
    name: 'Rifle',
    ammoType: 'light',
    damage: 13,
    range: 86,
    fireInterval: 0.2,
    magSize: 24,
    reloadDuration: 1.4 * RELOAD_TIME_MULTIPLIER,
    spread: 0.009,
    pellets: 1,
    reservePickup: 36,
    color: 0xe3b341
  },
  {
    id: 'auto-shotgun',
    name: 'Shotgun',
    ammoType: 'shells',
    damage: 11,
    range: 24,
    fireInterval: 0.76,
    magSize: 8,
    reloadDuration: 1.7 * RELOAD_TIME_MULTIPLIER,
    spread: 0.068,
    pellets: 5,
    reservePickup: 14,
    color: 0xe14b52
  },
  {
    id: 'tactical-smg',
    name: 'SMG',
    ammoType: 'light',
    damage: 20,
    range: 54,
    fireInterval: 0.08,
    magSize: 30,
    reloadDuration: 1.65 * RELOAD_TIME_MULTIPLIER,
    spread: 0.015,
    pellets: 1,
    reservePickup: 40,
    color: 0x3d8dff
  }
];

export const STORM_PHASES: readonly StormPhase[] = [
  { pauseDuration: 16 * PAUSE_DURATION_SCALE, shrinkDuration: 26 * SHRINK_DURATION_SCALE, targetRadius: 184 * MAP_SCALE, damagePerSecond: 0.5 },
  { pauseDuration: 13 * PAUSE_DURATION_SCALE, shrinkDuration: 22 * SHRINK_DURATION_SCALE, targetRadius: 136 * MAP_SCALE, damagePerSecond: 1 },
  { pauseDuration: 10 * PAUSE_DURATION_SCALE, shrinkDuration: 20 * SHRINK_DURATION_SCALE, targetRadius: 84 * MAP_SCALE, damagePerSecond: 2 },
  { pauseDuration: 8 * PAUSE_DURATION_SCALE, shrinkDuration: 18 * SHRINK_DURATION_SCALE, targetRadius: 40 * MAP_SCALE, damagePerSecond: 3.5 },
  { pauseDuration: 5 * PAUSE_DURATION_SCALE, shrinkDuration: 14 * SHRINK_DURATION_SCALE, targetRadius: 12 * MAP_SCALE, damagePerSecond: 5 }
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
  'W forward, A left, S back, D right. Mouse aim, Shift sprint, Space jump. FortLite now starts in third-person and holding right click swaps to first-person aim. The match begins in the sky with a parachute, and you can steer your own landing with WASD before touchdown. Walk over ammo, materials, and medkits to auto-pick them up, use E to pick up guns, Q enters or exits build mode, Z wall, X floor, C ramp, G pickaxe, 1 rifle, 2 shotgun, 3 SMG, R reload or rotate, Enter restarts.';

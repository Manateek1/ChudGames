import type { MaterialType, StormPhase, WeaponDefinition } from './types';

export const MAP_RADIUS = 120;
export const PLAYER_EYE_HEIGHT = 1.7;
export const ACTOR_RADIUS = 1;
export const BOT_COUNT = 12;
export const BUILD_GRID_SIZE = 4;
export const BUILD_COST = 20;
export const MAX_WEAPON_SLOTS = 2;
export const RESOURCE_RESPAWN_COUNT = 30;
export const FIXED_TIMESTEP = 1 / 60;

export const WEAPON_DEFINITIONS: readonly WeaponDefinition[] = [
  {
    id: 'ranger-rifle',
    name: 'Ranger Rifle',
    ammoType: 'light',
    damage: 18,
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
    name: 'Auto Shotgun',
    ammoType: 'shells',
    damage: 6,
    range: 26,
    fireInterval: 0.72,
    magSize: 6,
    reloadDuration: 1.9,
    spread: 0.075,
    pellets: 8,
    reservePickup: 12,
    color: 0xf6ae2d
  },
  {
    id: 'tactical-smg',
    name: 'Tactical SMG',
    ammoType: 'light',
    damage: 9,
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
  { pauseDuration: 18, shrinkDuration: 20, targetRadius: 92, damagePerSecond: 1 },
  { pauseDuration: 14, shrinkDuration: 18, targetRadius: 68, damagePerSecond: 2 },
  { pauseDuration: 12, shrinkDuration: 16, targetRadius: 42, damagePerSecond: 4 },
  { pauseDuration: 10, shrinkDuration: 14, targetRadius: 20, damagePerSecond: 7 },
  { pauseDuration: 6, shrinkDuration: 12, targetRadius: 6, damagePerSecond: 12 }
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
  'W forward, A left, S back, D right. Mouse aim, Shift sprint, Space jump, left click fire/harvest, E loot, Q build, 1/2/3 switch hotbar slot, R reload or rotate, right click exits build mode, Enter restarts.';

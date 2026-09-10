import type { BuildPieceType, MaterialType, AmmoType } from '../types';

/**
 * 6-character room code characters (excludes visually ambiguous 0, O, 1, I).
 */
export const ROOM_CODE_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 6;

export function generateRandomRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const idx = Math.floor(Math.random() * ROOM_CODE_CHARSET.length);
    code += ROOM_CODE_CHARSET[idx];
  }
  return code;
}

export function isValidRoomCode(code: string): boolean {
  if (typeof code !== 'string' || code.length !== ROOM_CODE_LENGTH) {
    return false;
  }
  for (let i = 0; i < code.length; i += 1) {
    if (!ROOM_CODE_CHARSET.includes(code[i])) {
      return false;
    }
  }
  return true;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  ping: number;
}

export interface PlayerInputMessage {
  type: 'player_input';
  seq: number;
  move: { x: number; z: number };
  yaw: number;
  pitch: number;
  sprint: boolean;
  jump: boolean;
  ads: boolean;
}

export interface FireWeaponMessage {
  type: 'fire_weapon';
  weaponId: string;
  origin: [number, number, number];
  direction: [number, number, number];
  clientTime: number;
}

export interface PlaceBuildMessage {
  type: 'place_build';
  pieceType: BuildPieceType;
  position: [number, number, number];
  yaw: number;
}

export interface SwitchSlotMessage {
  type: 'switch_slot';
  slotIndex: number;
}

export interface ReloadMessage {
  type: 'reload';
}

export interface PingMessage {
  type: 'ping';
  clientTime: number;
}

export interface CreateRoomMessage {
  type: 'create_room';
  playerName: string;
  mode: 'solo' | 'duos';
}

export interface JoinRoomMessage {
  type: 'join_room';
  roomCode: string;
  playerName: string;
  reconnectToken?: string;
}

export interface ToggleReadyMessage {
  type: 'toggle_ready';
  isReady: boolean;
}

export interface StartMatchMessage {
  type: 'start_match';
}

export type ClientMessage =
  | CreateRoomMessage
  | JoinRoomMessage
  | ToggleReadyMessage
  | StartMatchMessage
  | PlayerInputMessage
  | FireWeaponMessage
  | PlaceBuildMessage
  | SwitchSlotMessage
  | ReloadMessage
  | PingMessage;

export interface PlayerSnapshot {
  id: string;
  name: string;
  position: [number, number, number];
  yaw: number;
  pitch: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  spawnState: 'skydive' | 'gliding' | 'grounded';
  currentWeaponId: string | null;
  ammoInMag: number;
  materials: Record<MaterialType, number>;
  ammo: Record<AmmoType, number>;
  isReloading: boolean;
  isAiming: boolean;
  isGrounded: boolean;
  eliminationCount: number;
}

export interface BotSnapshot {
  id: string;
  position: [number, number, number];
  yaw: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  spawnState: 'skydive' | 'gliding' | 'grounded';
  currentWeaponId: string | null;
}

export interface StormSnapshot {
  center: [number, number, number];
  radius: number;
  targetCenter: [number, number, number];
  targetRadius: number;
  phaseIndex: number;
  timer: number;
  damagePerSecond: number;
}

export interface BuildSnapshot {
  id: string;
  pieceType: BuildPieceType;
  materialType: MaterialType;
  position: [number, number, number];
  yaw: number;
  health: number;
}

export interface LootSnapshot {
  id: string;
  kind: 'weapon' | 'ammo' | 'material' | 'medkit';
  position: [number, number, number];
  itemId?: string;
  amount?: number;
}

export interface WorldSnapshotMessage {
  type: 'world_snapshot';
  tick: number;
  timestamp: number;
  players: PlayerSnapshot[];
  bots: BotSnapshot[];
  storm: StormSnapshot;
  builds: BuildSnapshot[];
  loot: LootSnapshot[];
}

export interface RoomCreatedMessage {
  type: 'room_created';
  roomCode: string;
  playerId: string;
  reconnectToken: string;
  isHost: boolean;
}

export interface RoomJoinedMessage {
  type: 'room_joined';
  roomCode: string;
  playerId: string;
  reconnectToken: string;
  isHost: boolean;
  players: LobbyPlayer[];
}

export interface LobbyUpdateMessage {
  type: 'lobby_update';
  players: LobbyPlayer[];
  countdown: number | null;
}

export interface MatchStartingMessage {
  type: 'match_starting';
  seed: number;
  dropStartPositions: Record<string, [number, number, number]>;
}

export interface ShotBroadcastMessage {
  type: 'shot_broadcast';
  actorId: string;
  weaponId: string;
  origin: [number, number, number];
  direction: [number, number, number];
  impact: [number, number, number] | null;
}

export interface DamageEventMessage {
  type: 'damage_event';
  targetId: string;
  amount: number;
  attackerId: string | null;
  isCritical: boolean;
  newHealth: number;
}

export interface EliminationEventMessage {
  type: 'elimination_event';
  targetId: string;
  attackerId: string | null;
  weaponId: string;
  remainingAlive: number;
}

export interface BuildEventMessage {
  type: 'build_event';
  action: 'placed' | 'damaged' | 'destroyed';
  piece: BuildSnapshot;
}

export interface LootEventMessage {
  type: 'loot_event';
  action: 'spawned' | 'collected';
  lootId: string;
  collectorId?: string;
}

export interface MatchPlacement {
  id: string;
  name: string;
  placement: number;
  eliminations: number;
  survivalTime: number;
}

export interface MatchEndedMessage {
  type: 'match_ended';
  winnerId: string;
  winnerName: string;
  placements: MatchPlacement[];
}

export interface PongMessage {
  type: 'pong';
  clientTime: number;
  serverTime: number;
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export type ServerMessage =
  | RoomCreatedMessage
  | RoomJoinedMessage
  | LobbyUpdateMessage
  | MatchStartingMessage
  | WorldSnapshotMessage
  | ShotBroadcastMessage
  | DamageEventMessage
  | EliminationEventMessage
  | BuildEventMessage
  | LootEventMessage
  | MatchEndedMessage
  | PongMessage
  | ErrorMessage;

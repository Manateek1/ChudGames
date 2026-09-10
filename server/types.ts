import type { WebSocket } from 'ws';
import type { BuildPieceType, MaterialType, AmmoType } from '../src/games/fortliteRuntime/types';
import type { BotSkillProfile } from '../src/games/fortliteRuntime/bots';

export interface ServerClient {
  id: string;
  ws: WebSocket | null;
  name: string;
  reconnectToken: string;
  isHost: boolean;
  isReady: boolean;
  ping: number;
  lastPingTime: number;
  lastSeenTime: number;
  disconnectedAt: number | null;
}

export interface ServerInventory {
  weapons: {
    definitionId: string;
    magAmmo: number;
  }[];
  activeWeaponIndex: number;
  ammo: Record<AmmoType, number>;
  materials: Record<MaterialType, number>;
  mode: 'weapon' | 'build' | 'harvest';
}

export interface ServerActor {
  id: string;
  isBot: boolean;
  name: string;
  position: [number, number, number];
  velocity: [number, number, number];
  yaw: number;
  pitch: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  spawnState: 'skydive' | 'gliding' | 'grounded';
  spawnTimer: number;
  fireCooldown: number;
  reloadTimer: number;
  reloadWeaponId: string | null;
  inventory: ServerInventory;
  eliminations: number;
  survivalTime: number;
  clientId?: string;
  botBrain?: {
    profile: BotSkillProfile;
    state: 'roam' | 'seekLoot' | 'seekSafeZone' | 'engage' | 'retreat' | 'heal' | 'harvest';
    targetActorId?: string;
    targetPosition: [number, number, number];
    decisionTimer: number;
    strafeDirection: number;
    strafeTimer: number;
    burstShotsRemaining: number;
    burstCooldownTimer: number;
    buildCooldown: number;
    healTimer: number;
    retreatTimer: number;
  };
}

export interface ServerBuildPiece {
  id: string;
  pieceType: BuildPieceType;
  materialType: MaterialType;
  position: [number, number, number];
  yaw: number;
  health: number;
  ownerId: string;
}

export interface ServerLootPickup {
  id: string;
  kind: 'weapon' | 'ammo' | 'material' | 'medkit';
  position: [number, number, number];
  itemId?: string;
  amount?: number;
}

export interface ServerStorm {
  phaseIndex: number;
  timer: number;
  mode: 'pause' | 'shrink' | 'done';
  currentCenter: [number, number, number];
  currentRadius: number;
  startCenter: [number, number, number];
  startRadius: number;
  targetCenter: [number, number, number];
  targetRadius: number;
  damagePerSecond: number;
}

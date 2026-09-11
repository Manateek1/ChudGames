import type * as THREE from 'three';
import type { AudioManager } from '../../engine/audio';
import type { GraphicsQuality } from '../../types/arcade';
import type { FortLiteNetworkClient } from './multiplayer/client';
import type { BotSkillProfile } from './bots';
import type {
  ActorKind,
  BotState,
  BuildPiece,
  InventoryState,
  ResourceNode
} from './types';

export type MatchState = 'boot' | 'inProgress' | 'ended';
export type StormMode = 'pause' | 'shrink' | 'done';
export type Biome = 'regular' | 'forest' | 'desert';
export type FortLiteMode = 'solo' | 'duos';
export type SpawnState = 'parachuting' | 'grounded';

export interface Actor {
  id: string;
  name?: string;
  kind: ActorKind;
  teamId: number;
  group: THREE.Group;
  visualRoot: THREE.Group;
  bodyMesh: THREE.Mesh;
  headMesh: THREE.Mesh;
  ringMesh: THREE.Mesh;
  shadowMesh: THREE.Mesh;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  healthBarRoot: THREE.Group;
  healthBarFill: THREE.Mesh;
  bodyParts: THREE.Object3D[];
  detailParts: THREE.Object3D[];
  heldItemRoot: THREE.Group;
  heldItemMesh: THREE.Object3D | null;
  heldItemKey: string;
  parachuteGroup: THREE.Group;
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  lastPosition: THREE.Vector3;
  verticalVelocity: number;
  yaw: number;
  radius: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  grounded: boolean;
  inventory: InventoryState;
  fireCooldown: number;
  reloadTimer: number;
  reloadWeaponId: string | null;
  harvestCooldown: number;
  eliminationCount: number;
  moveBlend: number;
  stepTime: number;
  spawnState: SpawnState;
  spawnTimer: number;
  dropStart: THREE.Vector3;
  dropTarget: THREE.Vector3;
  ai?: BotBrain;
}

export interface BotBrain {
  state: BotState;
  profile: BotSkillProfile;
  targetLootId?: string;
  targetNodeId?: string;
  targetActorId?: string;
  lastSeenTargetPosition?: THREE.Vector3;
  targetMemoryTimer: number;
  destination: THREE.Vector3;
  path: THREE.Vector3[];
  pathIndex: number;
  decisionTimer: number;
  repathTimer: number;
  senseTimer: number;
  strafeDirection: number;
  strafeTimer: number;
  buildCooldown: number;
  harvestTimer: number;
  burstShotsRemaining: number;
  burstCooldownTimer: number;
  healTimer: number;
  retreatTimer: number;
}

export interface StormRuntime {
  mode: StormMode;
  phaseIndex: number;
  timer: number;
  currentCenter: THREE.Vector3;
  currentRadius: number;
  startCenter: THREE.Vector3;
  startRadius: number;
  targetCenter: THREE.Vector3;
  targetRadius: number;
  currentDamagePerSecond: number;
}

export interface TimedMessage {
  text: string;
  timeRemaining: number;
}

export interface WaterZone {
  center: THREE.Vector3;
  radiusX: number;
  radiusZ: number;
  rotation: number;
  moveMultiplier: number;
}

export interface WalkableSurface {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  minApproachY: number;
}

export interface TerrainMound {
  center: THREE.Vector3;
  radiusX: number;
  radiusZ: number;
  height: number;
}

export interface ShotEffect {
  group: THREE.Group;
  lineMaterial: THREE.LineBasicMaterial;
  sparkMaterial: THREE.MeshStandardMaterial;
  timeRemaining: number;
  duration: number;
}

export type HarvestTarget =
  | { kind: 'resource'; node: ResourceNode }
  | { kind: 'build'; piece: BuildPiece };

export interface FortLiteMatchResult {
  won: boolean;
  placement: number;
  eliminations: number;
  survivalTime: number;
}

export interface FortLiteGameOptions {
  audio?: AudioManager;
  graphicsQuality?: GraphicsQuality;
  mode?: FortLiteMode;
  onFpsChange?: (fps: number) => void;
  seedBase?: number;
  onPlacementChange?: (placement: number) => void;
  onMatchEnd?: (result: FortLiteMatchResult) => void;
  showEndScreen?: boolean;
  networkClient?: FortLiteNetworkClient;
  localPlayerName?: string;
  matchSeed?: number;
  dropStartPositions?: Record<string, [number, number, number]>;
  onPauseToggle?: () => void;
}

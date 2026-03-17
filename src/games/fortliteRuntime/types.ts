import * as THREE from 'three';

export type AmmoType = 'light' | 'shells';
export type MaterialType = 'wood' | 'stone' | 'metal';
export type BuildPieceType = 'wall' | 'floor' | 'ramp';
export type ActorKind = 'player' | 'bot';
export type LootKind = 'weapon' | 'ammo' | 'material';
export type EquipmentMode = 'harvest' | 'weapon';
export type BotState = 'roam' | 'seekLoot' | 'seekSafeZone' | 'engage' | 'harvest';

export interface WeaponDefinition {
  id: string;
  name: string;
  ammoType: AmmoType;
  damage: number;
  range: number;
  fireInterval: number;
  magSize: number;
  reloadDuration: number;
  spread: number;
  pellets: number;
  reservePickup: number;
  color: number;
}

export interface WeaponInstance {
  definition: WeaponDefinition;
  magAmmo: number;
}

export interface InventoryState {
  mode: EquipmentMode;
  weapons: WeaponInstance[];
  weaponIndex: number;
  ammo: Record<AmmoType, number>;
  materials: Record<MaterialType, number>;
}

export interface ObstacleBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  mesh: THREE.Object3D;
}

export interface LootPickup {
  id: string;
  kind: LootKind;
  mesh: THREE.Group;
  position: THREE.Vector3;
  weapon?: WeaponDefinition;
  ammoType?: AmmoType;
  amount?: number;
  materialType?: MaterialType;
  bobOffset: number;
}

export interface ResourceNode {
  id: string;
  mesh: THREE.Group;
  position: THREE.Vector3;
  materialType: MaterialType;
  health: number;
  totalYield: number;
  yieldPerHit: number;
  obstacle: ObstacleBox;
}

export interface BuildPiece {
  id: string;
  pieceType: BuildPieceType;
  materialType: MaterialType;
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  yaw: number;
  health: number;
  obstacle?: ObstacleBox;
}

export interface StormPhase {
  pauseDuration: number;
  shrinkDuration: number;
  targetRadius: number;
  damagePerSecond: number;
}

export interface PlacementPreview {
  pieceType: BuildPieceType;
  valid: boolean;
  position: THREE.Vector3;
  yaw: number;
}

import type { Stack } from "./blocks";
export type { Stack } from "./blocks";

export type Realm = "surface" | "underdeep" | "skyreach";
export type Mode = "survival" | "creative" | "adventure" | "hardcore";
export type TerrainRevision = 1 | 2;
export interface Point { x: number; y: number; z: number }
export interface Pose extends Point { yaw: number; pitch: number }
export type BlockPoint = [number, number, number];
export type BlockEdit = [number, number, number, number];
export interface SectionPacket { sy: number; palette: Uint16Array; bits: number; words: Uint32Array }
export interface ChunkPacket { cx: number; cz: number; sections: SectionPacket[] }
export interface MeshLayer {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  uvs: Uint8Array;
  tiles: Uint8Array;
}
export interface MeshMessage { type: "mesh"; realm: Realm; key: string; solid: MeshLayer; liquid: MeshLayer }
export type MeshRequest =
  | { type: "reset"; realm: Realm }
  | { type: "chunks"; realm: Realm; chunks: ChunkPacket[] }
  | { type: "remove"; realm: Realm; keys: string[] };

export interface Controls {
  forward: number;
  strafe: number;
  jump: boolean;
  sprint: boolean;
  descend: boolean;
  mine: boolean;
  yaw: number;
  pitch: number;
}
export interface MobView extends Point {
  id: string;
  kind: "grazer" | "lurker" | "sentinel" | "trader";
  yaw: number;
  health: number;
  maxHealth: number;
}
export type Station = "bench" | "furnace" | "trader" | null;
export interface PlayerSave extends Pose {
  health: number;
  hunger: number;
  xp: number;
  inventory: (Stack | null)[];
  selected: number;
  dead: boolean;
}
export interface MachineSave { realm: Realm; point: BlockPoint; item: number; remaining: number; ready?: boolean }
export interface SaveData {
  version: 1;
  terrainRevision?: TerrainRevision;
  seed: string;
  mode: Mode;
  realm: Realm;
  tick: number;
  player: PlayerSave;
  realms: Record<Realm, BlockEdit[]>;
  machines?: MachineSave[];
}
export interface HudState {
  realm: Realm;
  tick: number;
  position: Point;
  yaw: number;
  pitch: number;
  health: number;
  hunger: number;
  xp: number;
  inventory: (Stack | null)[];
  selected: number;
  target: BlockPoint | null;
  targetCode: number;
  mining: number;
  notice: string;
  dead: boolean;
  flying: boolean;
  mobs: MobView[];
  biome: string;
  station: Station;
  stationProgress?: number;
  armored?: boolean;
}

export type PlayerAction = "place" | "interact" | "eat" | "respawn" | "attack" | "smelt" | "trade" | "temper" | "flight";
export type ClientMessage =
  | { type: "init"; seed: string; mode: Mode; radius: number; saved?: SaveData }
  | { type: "input"; value: Controls }
  | { type: "action"; action: PlayerAction; item?: number }
  | { type: "select"; slot: number }
  | { type: "moveSlot"; from: number; to: number }
  | { type: "craft"; recipe: string }
  | { type: "grid"; grid: number[]; size: 2 | 3 }
  | { type: "give"; item: number }
  | { type: "radius"; radius: number }
  | { type: "pause"; value: boolean }
  | { type: "save" };

export type ServerMessage =
  | MeshRequest
  | { type: "ready"; state: HudState }
  | { type: "state"; state: HudState }
  | { type: "save"; data: SaveData }
  | { type: "error"; message: string };

export const realmNames: Record<Realm, string> = {
  surface: "Juniper Vale", underdeep: "Underdeep", skyreach: "Skyreach",
};

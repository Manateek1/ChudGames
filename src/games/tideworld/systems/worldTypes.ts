export interface Pos {
  x: number;
  y: number;
  z: number;
}
export type Face = 0 | 1 | 2 | 3;
export type Weather = "clear" | "fog" | "rain" | "storm" | "snow";
export interface SystemWorld {
  get(x: number, y: number, z: number): string;
  set(x: number, y: number, z: number, id: string): unknown;
  surface(x: number, z: number): number;
  biome(x: number, z: number): string;
  itemCount?(p: Pos): number | undefined;
  occupied?(p: Pos): boolean;
  fluid?(x: number, y: number, z: number): number;
  setVariant?(x: number, y: number, z: number, variant: string): void;
  dirty?(x: number, y: number, z: number): void;
}
export interface Actor extends Pos {
  id?: string;
  health: number;
  vx?: number;
  vz?: number;
  heldId?: string;
  immune?: boolean;
}
export const key = (p: Pos) => p.x + "," + p.y + "," + p.z;
export function fromKey(k: string): Pos {
  const [x, y, z] = k.split(",").map(Number);
  return { x, y, z };
}
export const faceOffset = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
export function ahead(p: Pos, f: Face, n = 1): Pos {
  return { x: p.x + faceOffset[f][0] * n, y: p.y, z: p.z + faceOffset[f][1] * n };
}
export const separation = (a: Pos, b: Pos) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function roll(seed: string, x: number, y: number, z: number) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = Math.imul(h ^ (x | 0), 0x45d9f3b);
  h = Math.imul(h ^ (y | 0), 0x45d9f3b);
  h = Math.imul(h ^ (z | 0), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

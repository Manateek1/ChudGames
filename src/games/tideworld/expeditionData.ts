import type { Body, Point } from "./movement";
import type { EcologySave, InventorySave, Stack } from "./systems";
import type { LocalWorldInfo } from "./session";

export interface Marker extends Point {
  name: string;
  color: string;
  visible?: boolean;
}
export interface Pickup extends Point {
  id: string;
  stack: Stack;
  expires: number;
  available: number;
}
export interface Drawer {
  slots: (Stack | null)[];
  expires?: number;
}
export interface ExpeditionSave {
  tick: number;
  dayOffset?: number;
  cause?: string;
  body: Body;
  inventory: InventorySave;
  ecology: EcologySave;
  selected: number;
  last: number;
  edits: Record<string, string>;
  variants: Record<string, string>;
  facings: Record<string, number>;
  supports?: Record<string, Point>;
  cotPartners?: Record<string, Point>;
  markers: Marker[];
  pickups: Pickup[];
  drawers: Record<string, Drawer>;
  discovered: string[];
  weather: string;
  flying: boolean;
}
export interface ExpeditionStart {
  info: LocalWorldInfo;
  saved?: ExpeditionSave;
  recovered?: boolean;
}
export const cellKey = (p: Point) => [p.x, p.y, p.z].join(",");
export function parseSeed(text: string) {
  if (!text.trim()) {
    const a = crypto.getRandomValues(new Uint32Array(2));
    return ((BigInt(a[0]) << 32n) | BigInt(a[1])).toString();
  }
  if (!/^\d{1,20}$/.test(text.trim()) || BigInt(text.trim()) > 0xffffffffffffffffn)
    throw new Error("Enter a whole seed from 0 to 18446744073709551615.");
  return BigInt(text.trim()).toString();
}

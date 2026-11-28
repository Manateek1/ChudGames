export const SCHEMA = 1;
export const GENERATOR = 1;
export type Mode = "survival" | "building";
export interface LocalWorldInfo {
  id: string;
  name: string;
  seed: string;
  mode: Mode;
  revision?: number;
  updatedAt?: number;
}

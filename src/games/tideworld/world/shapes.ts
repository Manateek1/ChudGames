import { BLOCKS, type Box } from "./blocks";
import type { Bounds } from "./world";

export const UPPER_HALF = 4;
export const cardinal = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
export const isMasonryStep = (id: string) => id === "half_step" || id === "stair_step";
export const masonryMaterial = (variant?: string) =>
  variant === "basalt_brick" ? "basalt_brick" : "slate_brick";
export const upperHalf = (facing: number, variant?: string) =>
  Boolean(facing & UPPER_HALF) || variant === "upper" || variant === "inverted";

export const fullCube: readonly Bounds[] = [{ minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 }];
const shapeCache = new Map<string, readonly Bounds[]>();

function rails(mask: number, collision: boolean, cap: boolean): Box[] {
  const top = cap ? 0.35 : 1.35;
  const pieces: Box[] = [[0.36, 0, 0.36, 0.64, collision ? top : 1, 0.64]];
  for (let side = 0; side < 4; side++) {
    if (!(mask & (1 << side))) continue;
    const [dx, dz] = cardinal[side];
    const x0 = dx < 0 ? 0 : dx > 0 ? 0.64 : 0.44;
    const x1 = dx > 0 ? 1 : dx < 0 ? 0.36 : 0.56;
    const z0 = dz < 0 ? 0 : dz > 0 ? 0.64 : 0.44;
    const z1 = dz > 0 ? 1 : dz < 0 ? 0.36 : 0.56;
    if (collision) pieces.push([x0, 0, z0, x1, top, z1]);
    else pieces.push([x0, 0.3, z0, x1, 0.46, z1], [x0, 0.71, z0, x1, 0.87, z1]);
  }
  return pieces;
}

export function localBounds(
  id: string,
  facing = 0,
  variant = "",
  connections = 0,
  mode: "visual" | "collision" | "cap" = "visual",
): readonly Bounds[] {
  if (id === "air") return [];
  if (BLOCKS[id]?.shape === "cube") return fullCube;
  const masonry = isMasonryStep(id);
  const flipped = masonry && upperHalf(facing, variant);
  const rotation = id === "fence_section" ? 0 : facing & 3;
  const open = id === "gate" && variant === "open";
  const key = [id, rotation, Number(flipped), Number(open), connections, mode].join("|");
  const found = shapeCache.get(key);
  if (found) return found;
  let pieces: readonly Box[] = BLOCKS[id]?.boxes ?? [];
  if (open) pieces = [[0, 0, 0, 0.15, 1, 1]];
  if (id === "fence_section") pieces = rails(connections, mode !== "visual", mode === "cap");
  if (id === "stair_step" && connections && mode === "visual") {
    // A small bevel continues the tread at the adjoining perpendicular flight.
    const trim: Box[] = [];
    if (connections & 1) trim.push([0, 0.5, 0.5, 0.18, 0.55, 0.56]);
    if (connections & 2) trim.push([0.82, 0.5, 0.5, 1, 0.55, 0.56]);
    pieces = [...pieces, ...trim];
  }
  const result = pieces.map((box) => {
    const minY = flipped ? 1 - box[4] : box[1];
    const maxY = flipped ? 1 - box[1] : box[4];
    let [minX, , minZ, maxX, , maxZ] = box;
    for (let i = 0; i < rotation; i++) [minX, minZ, maxX, maxZ] = [1 - maxZ, minX, 1 - minZ, maxX];
    return { minX, minY, minZ, maxX, maxY, maxZ };
  });
  shapeCache.set(key, result);
  return result;
}

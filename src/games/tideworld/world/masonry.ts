import { cellKey, type Hit, type VoxelWorld } from "./world";
import { masonryMaterial, upperHalf, UPPER_HALF } from "./shapes";

/** Resolve the half selected by a ray's contact with the actual face, including an exposed slab midplane. */
export function masonryPlacement(
  world: VoxelWorld,
  hit: Hit,
  id: string,
  heldVariant: string | undefined,
  facing: number,
) {
  const material = masonryMaterial(heldVariant);
  const key = cellKey(hit.x, hit.y, hit.z);
  const hitIsUpper = upperHalf(world.facings[key] ?? 0, world.variants[key]);
  const innerFace = id === "half_step" && hit.id === "half_step" && hit.normal.y === (hitIsUpper ? -1 : 1);
  const p = innerFace
    ? { x: hit.x, y: hit.y, z: hit.z }
    : { x: hit.x + hit.normal.x, y: hit.y + hit.normal.y, z: hit.z + hit.normal.z };
  const upper = innerFace
    ? !hitIsUpper
    : hit.normal.y < 0 || (hit.normal.y === 0 && hit.point.y - hit.y >= 0.5);
  const old = world.get(p.x, p.y, p.z);
  if (old === "air") return { p, id, variant: material, facing: (facing & 3) | (upper ? UPPER_HALF : 0) };
  if (id !== "half_step" || old !== "half_step") return null;
  const occupiedKey = cellKey(p.x, p.y, p.z);
  if (
    masonryMaterial(world.variants[occupiedKey]) !== material ||
    upperHalf(world.facings[occupiedKey] ?? 0, world.variants[occupiedKey]) === upper
  )
    return null;
  return { p, id: material, variant: undefined, facing: 0 };
}

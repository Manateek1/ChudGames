import { MAP_RADIUS } from './content';

export interface LootPoint {
  x: number;
  z: number;
}

// The first ring covers the interior paths. Two wider rings serve drop
// positions near the shoreline and take pressure off the main landmarks.
const rings = [
  { scale: 0.25, count: 10 },
  { scale: 0.46, count: 16 },
  { scale: 0.66, count: 20 },
  { scale: 0.79, count: 16 }
];
const FIELD_WEAPON_LIMIT = rings.reduce((total, ring) => total + ring.count, 0);

export function findOpenLootPoint(
  x: number,
  z: number,
  accepts: (x: number, z: number) => boolean,
  maxOffset: number
): LootPoint | null {
  if (accepts(x, z)) return { x, z };
  for (const radius of [maxOffset / 3, maxOffset * 2 / 3, maxOffset]) {
    for (let step = 0; step < 12; step += 1) {
      const angle = step * Math.PI / 6;
      const candidateX = x + Math.cos(angle) * radius;
      const candidateZ = z + Math.sin(angle) * radius;
      if (accepts(candidateX, candidateZ)) return { x: candidateX, z: candidateZ };
    }
  }
  return null;
}

export function getFieldWeaponPoints(accepts: (x: number, z: number) => boolean): LootPoint[] {
  const points: LootPoint[] = [];
  const isOpen = (x: number, z: number) =>
    Math.hypot(x, z) < MAP_RADIUS - 10 &&
    points.every((point) => (point.x - x) ** 2 + (point.z - z) ** 2 > 12 ** 2) &&
    accepts(x, z);
  for (const [index, ring] of rings.entries()) {
    for (let i = 0; i < ring.count; i += 1) {
      const angle = (i + index * 0.43) * Math.PI * 2 / ring.count;
      const radius = MAP_RADIUS * ring.scale;
      const point = findOpenLootPoint(Math.cos(angle) * radius, Math.sin(angle) * radius, isOpen, 24);
      if (point) points.push(point);
    }
  }
  // Some seeds flood much of a ring. Fill the remaining budget with a
  // deterministic sweep that interleaves near and far candidates.
  const sweepSize = 512;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < sweepSize && points.length < FIELD_WEAPON_LIMIT; i += 1) {
    const radius = MAP_RADIUS * 0.8 * Math.sqrt((((i * 181) % sweepSize) + 0.5) / sweepSize);
    const angle = goldenAngle * i;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isOpen(x, z)) points.push({ x, z });
  }
  return points;
}

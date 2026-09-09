import * as THREE from "three";

export const ROAD_WIDTH = 13;
export const TRACK_VERSION = "solstice-2";
const controlPoints = [
  [0, 28, 0],
  [0, 30, 180],
  [85, 42, 325],
  [250, 65, 340],
  [365, 76, 235],
  [330, 66, 90],
  [220, 48, -15],
  [295, 37, -175],
  [230, 28, -330],
  [35, 20, -395],
  [-155, 25, -315],
  [-245, 40, -155],
  [-235, 53, 55],
  [-140, 40, 50],
  [-70, 30, -120],
  [0, 28, -120],
];
export const curve = new THREE.CatmullRomCurve3(
  controlPoints.map((p) => new THREE.Vector3(...p)),
  true,
  "catmullrom",
  0.35,
);
curve.arcLengthDivisions = 3000;
export const TRACK_LENGTH = curve.getLength();
export const SAMPLE_COUNT = 1400;
export const samples = Array.from({ length: SAMPLE_COUNT + 1 }, (_, i) => {
  const p = curve.getPointAt(i / SAMPLE_COUNT);
  const t = curve.getTangentAt(i / SAMPLE_COUNT);
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    heading: Math.atan2(t.x, t.z),
    nx: t.z / Math.hypot(t.x, t.z),
    nz: -t.x / Math.hypot(t.x, t.z),
  };
});
export interface RoadLocation {
  index: number;
  progress: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  lateral: number;
  distance: number;
  heading: number;
}
export function locateRoad(x: number, z: number, hint = -1): RoadLocation {
  let best = Infinity,
    index = 0,
    fraction = 0;
  const start = hint < 0 ? 0 : hint - 35,
    end = hint < 0 ? SAMPLE_COUNT : hint + 36;
  for (let j = start; j < end; j++) {
    const i = (j + SAMPLE_COUNT) % SAMPLE_COUNT,
      a = samples[i],
      b = samples[i + 1];
    const dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)),
    );
    const d = (x - a.x - dx * t) ** 2 + (z - a.z - dz * t) ** 2;
    if (d < best) {
      best = d;
      index = i;
      fraction = t;
    }
  }
  if (hint >= 0 && best > 900) return locateRoad(x, z);
  const a = samples[index],
    b = samples[index + 1],
    px = a.x + (b.x - a.x) * fraction,
    pz = a.z + (b.z - a.z) * fraction;
  return {
    index,
    progress: (index + fraction) / SAMPLE_COUNT,
    x: px,
    y: a.y + (b.y - a.y) * fraction,
    z: pz,
    nx: a.nx,
    nz: a.nz,
    lateral: (x - px) * a.nx + (z - pz) * a.nz,
    distance: Math.sqrt(best),
    heading: a.heading,
  };
}
export function trackPoint(progress: number) {
  return samples[Math.floor((((progress % 1) + 1) % 1) * SAMPLE_COUNT)];
}
export const mapPoints = samples
  .filter((_, i) => i % 10 === 0)
  .map((p) => `${(p.x + 280) / 4.5},${(p.z + 420) / 4.5}`)
  .join(" ");

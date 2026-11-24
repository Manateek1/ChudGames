import * as THREE from "three";
import { apexCourses, getApexCourse } from "./courses";
import type { ApexCourseId } from "./courses";

export const ROAD_WIDTH = 13;
export const TRACK_VERSION = apexCourses[0].version;
const solsticePoints = [
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
const whitecapPoints = [
  [0, 182, 0], [-20, 190, 155], [37, 225, 265], [168, 261, 310],
  [293, 281, 246], [275, 304, 137], [162, 317, 117], [133, 328, 37],
  [239, 336, -35], [326, 307, -147], [257, 266, -271], [121, 234, -314],
  [-35, 215, -257], [-111, 190, -143], [-30, 182, -94],
];
const breakwaterPoints = [
  [-136, 8, 0], [-159, 8, 142], [-136, 9, 281], [-40, 14, 331],
  [102, 28, 302], [241, 39, 190], [257, 27, 54], [191, 17, 50],
  [136, 11, -53], [243, 10, -151], [151, 7, -269], [14, 6, -306],
  [-91, 7, -256], [-147, 8, -147],
];

export interface TrackObstacle {
  progress: number;
  lateral: number;
  width: number;
  depth: number;
}

const snowbanks: TrackObstacle[] = [
  { progress: 0.067, lateral: -3.7, width: 5.0, depth: 4.3 },
  { progress: 0.29, lateral: 3.5, width: 5.3, depth: 4.1 },
  { progress: 0.54, lateral: -3.4, width: 5.4, depth: 4.8 },
  { progress: 0.79, lateral: 3.8, width: 5.0, depth: 3.8 },
];
const barricades: TrackObstacle[] = [
  { progress: 0.057, lateral: 3.65, width: 4.8, depth: 0.9 },
  { progress: 0.083, lateral: -3.65, width: 4.8, depth: 0.9 },
  { progress: 0.38, lateral: -3.5, width: 5.2, depth: 0.9 },
  { progress: 0.57, lateral: 3.55, width: 5.0, depth: 0.9 },
  { progress: 0.80, lateral: -3.65, width: 4.8, depth: 0.9 },
  { progress: 0.826, lateral: 3.65, width: 4.8, depth: 0.9 },
];

export const SAMPLE_COUNT = 1400;

function makeTrack(id: ApexCourseId, points: number[][], obstacles: TrackObstacle[] = []) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), true, "catmullrom", 0.35);
  curve.arcLengthDivisions = 3000;
  const length = curve.getLength();
  const samples = Array.from({ length: SAMPLE_COUNT + 1 }, (_, i) => {
    const p = curve.getPointAt(i / SAMPLE_COUNT);
    const t = curve.getTangentAt(i / SAMPLE_COUNT);
    const horizontal = Math.hypot(t.x, t.z);
    return { x: p.x, y: p.y, z: p.z, heading: Math.atan2(t.x, t.z), nx: t.z / horizontal, nz: -t.x / horizontal };
  });
  const minX = Math.min(...samples.map((p) => p.x));
  const maxX = Math.max(...samples.map((p) => p.x));
  const minZ = Math.min(...samples.map((p) => p.z));
  const maxZ = Math.max(...samples.map((p) => p.z));
  const mapScale = Math.min(128 / (maxX - minX), 158 / (maxZ - minZ));
  const mapX = (x: number) => 75 + (x - (minX + maxX) / 2) * mapScale;
  const mapY = (z: number) => 90 + (z - (minZ + maxZ) / 2) * mapScale;
  const mapPoints = samples.filter((_, i) => i % 10 === 0)
    .map((point) => `${mapX(point.x)},${mapY(point.z)}`).join(" ");
  return { id, version: getApexCourse(id).version, length, samples, mapPoints, mapX, mapY, obstacles };
}

export type ApexTrack = ReturnType<typeof makeTrack>;
const solstice = makeTrack("solstice", solsticePoints);
const tracks = new Map<ApexCourseId, ApexTrack>([["solstice", solstice]]);

export function getApexTrack(id: ApexCourseId): ApexTrack {
  const existing = tracks.get(id);
  if (existing) return existing;
  const track = id === "whitecap"
    ? makeTrack(id, whitecapPoints, snowbanks)
    : makeTrack(id, breakwaterPoints, barricades);
  tracks.set(id, track);
  return track;
}

export const TRACK_LENGTH = solstice.length;
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
export function locateRoad(x: number, z: number, hint = -1, track = solstice): RoadLocation {
  const { samples } = track;
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
  if (hint >= 0 && best > 900) return locateRoad(x, z, -1, track);
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
export function trackPoint(progress: number, track = solstice) {
  return track.samples[Math.floor((((progress % 1) + 1) % 1) * SAMPLE_COUNT)];
}

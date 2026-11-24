import { Block, blockOf, definition, stateOf } from "./blocks";
import type { ChunkPacket, MeshLayer, Realm } from "./protocol";
import { chunkKey, unpackSection, WORLD_MAX_Y, WORLD_MIN_Y } from "./world";

type Vec = readonly [number, number, number];
type Bounds = readonly [number, number, number, number, number, number];
type ReadBlock = (x: number, y: number, z: number) => number;
const faces: readonly { normal: Vec; vertices: readonly Vec[]; shade: number }[] = [
  { normal: [1, 0, 0], vertices: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.91 },
  { normal: [-1, 0, 0], vertices: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.77 },
  { normal: [0, 1, 0], vertices: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1 },
  { normal: [0, -1, 0], vertices: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.59 },
  { normal: [0, 0, 1], vertices: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.86 },
  { normal: [0, 0, -1], vertices: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.72 },
];
const cube: Bounds = [0, 0, 0, 1, 1, 1];
const fluidTop: Bounds = [0, 0, 0, 1, 0.9, 1];
const doorClosed: Bounds = [0, 0, 0.43, 1, 1, 0.57];
const doorOpen: Bounds = [0, 0, 0, 0.14, 1, 1];
const fixtures: Readonly<Partial<Record<number, Bounds>>> = {
  [Block.Wire]: [0, 0.008, 0.34, 1, 0.045, 0.66],
  [Block.Switch]: [0.24, 0, 0.31, 0.76, 0.26, 0.69],
  [Block.Plate]: [0.12, 0, 0.12, 0.88, 0.08, 0.88],
  [Block.Relay]: [0.14, 0, 0.12, 0.86, 0.20, 0.88],
  [Block.Inverter]: [0.16, 0, 0.16, 0.84, 0.27, 0.84],
  [Block.Sensor]: [0.07, 0, 0.07, 0.93, 0.14, 0.93],
  [Block.BerryBush]: [0.13, 0, 0.13, 0.87, 0.64, 0.87],
  [Block.SkyGate]: [0.13, 0, 0.25, 0.87, 1, 0.75],
  [Block.RiftGate]: [0.13, 0, 0.25, 0.87, 1, 0.75],
};
const liquid = (id: number): boolean => id === Block.Water || id === Block.Ember;
const emission = (code: number): number => blockOf(code) === Block.Lamp && stateOf(code) > 0 ? 15 : definition(code).emission;

interface LightSource { x: number; y: number; z: number; value: number }
export interface MeshChunk {
  cx: number;
  cz: number;
  sections: ReadonlyMap<number, Uint16Array>;
  sky: Int16Array;
  sources: LightSource[];
}

function readLocal(sections: ReadonlyMap<number, Uint16Array>, x: number, y: number, z: number): number {
  return sections.get(Math.floor(y / 16))?.[((y & 15) << 8) + (z << 4) + x] ?? Block.Air;
}

export function decodeMeshChunk(packet: ChunkPacket): MeshChunk {
  const sections = new Map(packet.sections.map((section) => [section.sy, unpackSection(section)]));
  const sky = new Int16Array(256).fill(WORLD_MIN_Y - 1);
  const sources: LightSource[] = [];
  for (const [sy, blocks] of sections) {
    for (let index = 0; index < blocks.length; index++) {
      const code = blocks[index];
      if (!code) continue;
      const y = sy * 16 + (index >>> 8);
      const column = index & 255;
      if (definition(code).opaque && y > sky[column]) sky[column] = y;
      const value = emission(code);
      if (!value) continue;
      const x = index & 15, z = (index >>> 4) & 15;
      if (blockOf(code) === Block.Ember && ((x + z) & 3) !== 0) continue;
      const exposed = faces.some(({ normal: [dx, dy, dz] }) => {
        // Chunks at a border are measured once neighbouring voxels are present.
        if (x + dx < 0 || x + dx > 15 || z + dz < 0 || z + dz > 15) return false;
        const adjacent = readLocal(sections, x + dx, y + dy, z + dz);
        return !definition(adjacent).opaque && blockOf(adjacent) !== Block.Ember;
      });
      if (exposed || x === 0 || x === 15 || z === 0 || z === 15) sources.push({ x, y, z, value });
    }
  }
  return { cx: packet.cx, cz: packet.cz, sections, sky, sources };
}

function blockLighting(neighbors: readonly (MeshChunk | undefined)[], cx: number, cz: number, get: ReadBlock): ReadBlock {
  // A source reaches at most 14 cells. A halo on both sides includes all
  // contributing sources and leaves room for light to turn a corner.
  const margin = 14;
  const width = 16 + 2 * margin;
  const slice = width * width;
  let floor = WORLD_MAX_Y;
  let ceiling = WORLD_MIN_Y;
  const sources: LightSource[] = [];
  for (const neighbor of neighbors) {
    if (!neighbor) continue;
    for (const point of neighbor.sources) {
      const x = point.x + (neighbor.cx - cx) * 16;
      const z = point.z + (neighbor.cz - cz) * 16;
      const distance = Math.max(0, -x, x - 15) + Math.max(0, -z, z - 15);
      if (distance >= point.value) continue;
      if (faces.every(({ normal: [dx, dy, dz] }) => {
        const adjacent = get(x + dx, point.y + dy, z + dz);
        return definition(adjacent).opaque || blockOf(adjacent) === Block.Ember;
      })) continue;
      sources.push({ x, z, y: point.y, value: point.value });
      floor = Math.min(floor, point.y - point.value + 1);
      ceiling = Math.max(ceiling, point.y + point.value - 1);
    }
  }
  if (sources.length === 0) return () => 0;
  floor = Math.max(floor, WORLD_MIN_Y);
  ceiling = Math.min(ceiling, WORLD_MAX_Y);
  const light = new Uint8Array((ceiling - floor + 1) * slice);
  const queue: number[] = [];
  for (const { x, y, z, value } of sources) {
    const index = (y - floor) * slice + (z + margin) * width + x + margin;
    light[index] = value;
    queue.push(index);
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const value = light[index] - 1;
    if (value <= 0) continue;
    const x = index % width - margin, y = Math.floor(index / slice) + floor;
    const z = Math.floor(index % slice / width) - margin;
    for (const { normal: [dx, dy, dz] } of faces) {
      const nextX = x + dx, nextY = y + dy, nextZ = z + dz;
      if (nextX < -margin || nextX >= width - margin || nextZ < -margin || nextZ >= width - margin || nextY < floor || nextY > ceiling) continue;
      const to = index + dx + dy * slice + dz * width;
      if (light[to] >= value || definition(get(nextX, nextY, nextZ)).opaque) continue;
      light[to] = value;
      queue.push(to);
    }
  }
  return (x, y, z) => y < floor || y > ceiling ? 0 : light[(y - floor) * slice + (z + margin) * width + x + margin];
}

function colorChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

const colors = new Map<number, Vec>();
function faceColor(hex: number): Vec {
  let color = colors.get(hex);
  if (!color) {
    color = [colorChannel(hex >>> 16), colorChannel((hex >>> 8) & 255), colorChannel(hex & 255)];
    colors.set(hex, color);
  }
  return color;
}

interface DraftLayer { positions: number[]; normals: number[]; colors: number[]; indices: number[] }
function draft(): DraftLayer {
  return { positions: [], normals: [], colors: [], indices: [] };
}
function pack(layer: DraftLayer): MeshLayer {
  return {
    positions: Float32Array.from(layer.positions),
    normals: Float32Array.from(layer.normals),
    colors: Float32Array.from(layer.colors),
    indices: Uint32Array.from(layer.indices),
  };
}

function cornerOcclusion(
  get: ReadBlock, x: number, y: number, z: number, [nx, ny, nz]: Vec, [vx, vy, vz]: Vec,
): number {
  const dx = nx ? 0 : vx * 2 - 1, dy = ny ? 0 : vy * 2 - 1, dz = nz ? 0 : vz * 2 - 1;
  const first = nx
    ? definition(get(x, y + dy, z)).opaque
    : definition(get(x + dx, y, z)).opaque;
  const second = nz
    ? definition(get(x, y + dy, z)).opaque
    : definition(get(x, y, z + dz)).opaque;
  if (first && second) return 0;
  const corner = definition(get(x + dx, y + dy, z + dz)).opaque;
  return 3 - Number(first) - Number(second) - Number(corner);
}

export function meshChunk(
  chunk: MeshChunk, realm: Realm, chunks: ReadonlyMap<string, MeshChunk>,
): { solid: MeshLayer; liquid: MeshLayer } {
  const { cx, cz, sections } = chunk;
  const neighbors = new Array<MeshChunk | undefined>(9);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    neighbors[(dz + 1) * 3 + dx + 1] = chunks.get(chunkKey(cx + dx, cz + dz));
  }
  neighbors[4] = chunk;
  const at = (x: number, z: number): MeshChunk | undefined => neighbors[((z >> 4) + 1) * 3 + (x >> 4) + 1];
  const get: ReadBlock = (x, y, z) => {
    const neighbor = at(x, z);
    return neighbor ? readLocal(neighbor.sections, x & 15, y, z & 15) : Block.Air;
  };
  const lightAt = blockLighting(neighbors, cx, cz, get);
  const stone = draft(), water = draft();
  const baseX = cx * 16, baseZ = cz * 16;
  for (const [sy, blocks] of sections) {
    for (let index = 0; index < blocks.length; index++) {
      const code = blocks[index];
      const id = blockOf(code);
      if (id === Block.Air) continue;
      const x = index & 15, z = (index >>> 4) & 15, y = (sy * 16) + (index >>> 8);
      const info = definition(code);
      const fluid = liquid(id);
      const target = fluid || id === Block.Glass ? water : stone;
      const bounds = fluid && blockOf(get(x, y + 1, z)) !== id ? fluidTop :
        id === Block.Door ? (stateOf(code) > 0 ? doorOpen : doorClosed) : fixtures[id] ?? cube;
      const glow = emission(code) / 15;
      const powered = stateOf(code) > 0;
      const variation = 0.94 + (((baseX + x) * 73856093 ^ y * 19349663 ^ (baseZ + z) * 83492791) & 7) * 0.018;

      for (const { normal, vertices, shade } of faces) {
        const [nx, ny, nz] = normal;
        const fx = x + nx, fy = y + ny, fz = z + nz;
        if (fy < WORLD_MIN_Y) continue;
        const next = get(fx, fy, fz);
        const other = blockOf(next);
        if (fluid) {
          if (other === id || definition(next).opaque) continue;
        } else if (bounds === cube) {
          // A transparent neighbour needs the face behind it. Its own face,
          // however, is hidden against a full opaque voxel.
          if (definition(next).opaque || (other === id && !info.opaque)) continue;
        } else if (ny === -1 && definition(next).opaque) continue;

        const hex = id === Block.Lamp && powered ? 0xffde9b :
          id === Block.Wire && powered ? 0xf8a655 :
          id === Block.Leaves && powered ? (stateOf(code) === 1 ? 0xcda04c : 0xdab166) :
            ny === 1 ? info.top ?? info.color : ny === -1 ? info.bottom ?? info.color : info.color;
        const [red, green, blue] = faceColor(hex);
        const current = target.positions.length / 3;
        const faceSky = at(fx, fz)?.sky[((fz & 15) << 4) + (fx & 15)] ?? WORLD_MIN_Y;
        const daylight = realm !== "underdeep" && fy >= faceSky;
        const ambient = daylight ? 1 : (realm === "underdeep" ? 0.47 : 0.67);
        const warm = Math.max(lightAt(fx, fy, fz) / 15, glow);
        const ao: number[] = [];
        for (const vertex of vertices) {
          const [vx, vy, vz] = vertex;
          const occlusion = fluid || bounds !== cube ? 3 : cornerOcclusion(get, fx, fy, fz, normal, vertex);
          ao.push(occlusion);
          const brightness = Math.max(ambient, glow * 0.88) * shade * (0.68 + occlusion * 0.106) * variation;
          target.positions.push(baseX + x + bounds[vx * 3], y + bounds[1 + vy * 3], baseZ + z + bounds[2 + vz * 3]);
          target.normals.push(nx, ny, nz);
          target.colors.push(
            red * (brightness + warm * 0.34) + warm * 0.055,
            green * (brightness + warm * 0.25) + warm * 0.026,
            blue * (brightness + warm * 0.13),
          );
        }
        if (ao[0] + ao[2] > ao[1] + ao[3]) {
          target.indices.push(current, current + 1, current + 3, current + 1, current + 2, current + 3);
        } else {
          target.indices.push(current, current + 1, current + 2, current, current + 2, current + 3);
        }
      }
    }
  }
  return { solid: pack(stone), liquid: pack(water) };
}

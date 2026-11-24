import { Block } from "./blocks";
import type { BlockEdit, ChunkPacket, Realm, SectionPacket } from "./protocol";
import { CHUNK_SIZE, Terrain, WORLD_MAX_Y, WORLD_MIN_Y } from "./terrain";

export { CHUNK_SIZE, WORLD_MAX_Y, WORLD_MIN_Y } from "./terrain";

const SECTION_VOLUME = CHUNK_SIZE ** 3;
const COLUMN_AREA = CHUNK_SIZE ** 2;
const SECTION_MASK = CHUNK_SIZE - 1;

export const chunkKey = (cx: number, cz: number): string => `${cx},${cz}`;

function sectionIndex(x: number, y: number, z: number): number {
  return (y & SECTION_MASK) * COLUMN_AREA + (z & SECTION_MASK) * CHUNK_SIZE + (x & SECTION_MASK);
}

function readIndex(words: Uint32Array, bits: number, index: number): number {
  if (bits === 0) return 0;
  const start = index * bits;
  const word = start >>> 5, offset = start & 31;
  const value = offset + bits > 32
    ? (words[word] >>> offset) | (words[word + 1] << (32 - offset))
    : words[word] >>> offset;
  return value & ((1 << bits) - 1);
}

function writeIndex(words: Uint32Array, bits: number, index: number, value: number): void {
  if (bits === 0) return;
  const start = index * bits;
  const word = start >>> 5, offset = start & 31;
  const mask = (1 << bits) - 1;
  words[word] = (words[word] & ~(mask << offset)) | (value << offset);
  if (offset + bits > 32) {
    const spill = 32 - offset;
    words[word + 1] = (words[word + 1] & ~(mask >>> spill)) | (value >>> spill);
  }
}

export function unpackSection(section: SectionPacket): Uint16Array {
  const voxels = new Uint16Array(SECTION_VOLUME);
  if (section.bits === 0) return voxels.fill(section.palette[0]);
  for (let index = 0; index < voxels.length; index++) {
    voxels[index] = section.palette[readIndex(section.words, section.bits, index)];
  }
  return voxels;
}

class PackedSection {
  private readonly sy: number;
  private readonly palette: number[] = [];
  private readonly lookup = new Map<number, number>();
  private bits = 0;
  private words = new Uint32Array(0);
  private snapshot?: Uint16Array;
  count = 0;

  constructor(sy: number, voxels: Uint16Array) {
    this.sy = sy;
    for (const block of voxels) {
      this.add(block);
      this.count += Number(block !== Block.Air);
    }
    this.bits = Math.ceil(Math.log2(this.palette.length));
    this.words = new Uint32Array(Math.ceil(SECTION_VOLUME * this.bits / 32));
    if (this.bits === 0) return;
    for (let index = 0; index < voxels.length; index++) {
      writeIndex(this.words, this.bits, index, this.lookup.get(voxels[index]) ?? 0);
    }
  }

  private add(block: number): number {
    const previous = this.lookup.get(block);
    if (previous !== undefined) return previous;
    const index = this.palette.length;
    this.palette.push(block);
    this.lookup.set(block, index);
    this.snapshot = undefined;
    return index;
  }

  get(index: number): number {
    return this.palette[readIndex(this.words, this.bits, index)];
  }

  set(index: number, block: number): void {
    const previous = this.get(index);
    if (previous === block) return;
    this.count += Number(block !== Block.Air) - Number(previous !== Block.Air);
    const target = this.add(block);
    if (target >= 2 ** this.bits) {
      const bits = this.bits + 1;
      const words = new Uint32Array(Math.ceil(SECTION_VOLUME * bits / 32));
      for (let cell = 0; cell < SECTION_VOLUME; cell++) {
        writeIndex(words, bits, cell, readIndex(this.words, this.bits, cell));
      }
      this.bits = bits;
      this.words = words;
    }
    writeIndex(this.words, this.bits, index, target);
  }

  packet(): SectionPacket {
    this.snapshot ??= Uint16Array.from(this.palette);
    return { sy: this.sy, palette: this.snapshot, bits: this.bits, words: this.words };
  }
}

export function packSection(sy: number, voxels: Uint16Array): SectionPacket {
  return new PackedSection(sy, voxels).packet();
}

interface GeneratedChunk {
  cx: number;
  cz: number;
  sections: Map<number, PackedSection>;
}

export class VoxelWorld {
  private readonly terrain: Terrain;
  private readonly chunks = new Map<string, GeneratedChunk>();
  private readonly changes = new Map<string, Map<number, BlockEdit>>();

  constructor(seed: string, realm: Realm, edits: BlockEdit[] = []) {
    this.terrain = new Terrain(seed, realm);
    for (const [x, y, z, code] of edits) {
      if (this.valid(x, y, z, code)) this.record(x, y, z, code);
    }
  }

  private valid(x: number, y: number, z: number, code: number): boolean {
    return Number.isSafeInteger(x) && Number.isSafeInteger(z) && Number.isInteger(y)
      && y >= WORLD_MIN_Y && y <= WORLD_MAX_Y && Number.isInteger(code) && code >= 0 && code <= 65535;
  }

  private record(x: number, y: number, z: number, code: number): void {
    const key = chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    let edits = this.changes.get(key);
    if (!edits) this.changes.set(key, edits = new Map());
    const index = (y - WORLD_MIN_Y) * COLUMN_AREA + (z & SECTION_MASK) * CHUNK_SIZE + (x & SECTION_MASK);
    edits.set(index, [x, y, z, code]);
  }

  private chunk(cx: number, cz: number): GeneratedChunk {
    const key = chunkKey(cx, cz);
    const cached = this.chunks.get(key);
    if (cached) return cached;

    const generated = new Map<number, Uint16Array>();
    const write = (x: number, y: number, z: number, code: number) => {
      if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) return;
      const sy = Math.floor(y / CHUNK_SIZE);
      let voxels = generated.get(sy);
      if (!voxels) {
        if (code === Block.Air) return;
        generated.set(sy, voxels = new Uint16Array(SECTION_VOLUME));
      }
      voxels[sectionIndex(x, y, z)] = code;
    };

    for (let z = cz * CHUNK_SIZE; z < (cz + 1) * CHUNK_SIZE; z++) {
      for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
        const profile = this.terrain.profile(x, z);
        const end = Math.min(WORLD_MAX_Y, this.terrain.top(profile));
        for (let y = Math.max(WORLD_MIN_Y, profile.bottom); y <= end; y++) {
          write(x, y, z, this.terrain.block(x, y, z, profile));
        }
      }
    }
    this.terrain.decorate(cx, cz, write);
    const edits = this.changes.get(key);
    if (edits) for (const [x, y, z, code] of edits.values()) write(x, y, z, code);

    const sections = new Map<number, PackedSection>();
    for (const [sy, voxels] of generated) {
      const section = new PackedSection(sy, voxels);
      if (section.count) sections.set(sy, section);
    }
    const chunk = { cx, cz, sections };
    this.chunks.set(key, chunk);
    return chunk;
  }

  get(x: number, y: number, z: number): number {
    if (y < WORLD_MIN_Y || y > WORLD_MAX_Y) return Block.Air;
    const chunk = this.chunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    return chunk.sections.get(Math.floor(y / CHUNK_SIZE))?.get(sectionIndex(x, y, z)) ?? Block.Air;
  }

  set(x: number, y: number, z: number, code: number): boolean {
    if (!this.valid(x, y, z, code)) return false;
    const chunk = this.chunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    const sy = Math.floor(y / CHUNK_SIZE);
    let section = chunk.sections.get(sy);
    const index = sectionIndex(x, y, z);
    if ((section?.get(index) ?? Block.Air) === code) return false;
    if (!section) chunk.sections.set(sy, section = new PackedSection(sy, new Uint16Array(SECTION_VOLUME)));
    section.set(index, code);
    if (section.count === 0) chunk.sections.delete(sy);
    this.record(x, y, z, code);
    return true;
  }

  packet(cx: number, cz: number): ChunkPacket {
    const found = this.chunk(cx, cz);
    return { cx, cz, sections: Array.from(found.sections.values(), (section) => section.packet()) };
  }

  surfaceY(x: number, z: number): number {
    return this.terrain.profile(x, z).y;
  }

  biome(x: number, z: number): string {
    return this.terrain.profile(x, z).name;
  }

  edits(): BlockEdit[] {
    return Array.from(this.changes.values()).flatMap((chunk) => Array.from(chunk.values(), (edit): BlockEdit => [...edit]));
  }

  prune(cx: number, cz: number, radius: number): void {
    for (const [key, chunk] of this.chunks) {
      if (Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz)) > radius) this.chunks.delete(key);
    }
  }
}

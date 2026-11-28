import { VoxelWorld, cellKey } from "./world";
import { meshColumn, type ChunkGeometry } from "./mesh";
export type WorkerCommand =
  | {
      type: "init";
      seed: string;
      edits: Record<string, string>;
      facings: Record<string, number>;
      variants: Record<string, string>;
    }
  | {
      type: "changes";
      cells: {
        x: number;
        y: number;
        z: number;
        id: string;
        variant?: string;
        facing?: number;
        fluid?: number;
        lit: boolean;
      }[];
    }
  | { type: "mesh"; cx: number; cz: number; band: number | null; version: number };
export type WorkerResult = { result: ChunkGeometry; band: number | null; version: number };
let world: VoxelWorld;
const fluids = new Map<string, number>(),
  lamps = new Set<string>();
self.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const msg = event.data;
  if (msg.type === "init") {
    world = new VoxelWorld(msg.seed, msg.edits);
    Object.assign(world.facings, msg.facings);
    Object.assign(world.variants, msg.variants);
    world.bindSystems({
      fluid: (x, y, z) => fluids.get(cellKey(x, y, z)),
      lit: (x, y, z) => lamps.has(cellKey(x, y, z)),
    });
    return;
  }
  if (msg.type === "changes") {
    for (const c of msg.cells) {
      const key = cellKey(c.x, c.y, c.z);
      if (c.fluid === undefined) fluids.delete(key);
      else fluids.set(key, c.fluid);
      if (c.lit) lamps.add(key);
      else lamps.delete(key);
      world.edits[key] = c.id;
      if (c.variant === undefined) delete world.variants[key];
      else world.variants[key] = c.variant;
      if (c.facing === undefined) delete world.facings[key];
      else world.facings[key] = c.facing;
      world.dirty(c.x, c.y, c.z);
    }
    return;
  }
  const result = meshColumn(world, msg.cx, msg.cz, msg.band);
  const payload: WorkerResult = { result, band: msg.band, version: msg.version };
  self.postMessage(payload, {
    transfer: result.layers.flatMap((l) => [
      l.positions.buffer,
      l.indices.buffer,
      l.uv.buffer,
      l.tiles.buffer,
      l.colors.buffer,
      l.sky.buffer,
    ]),
  });
};

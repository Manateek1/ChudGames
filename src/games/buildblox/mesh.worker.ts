import { decodeMeshChunk, meshChunk, type MeshChunk } from "./mesh";
import type { MeshLayer, MeshMessage, MeshRequest, Realm } from "./protocol";
import { chunkKey } from "./world";

const endpoint = self as unknown as {
  addEventListener: (type: "message", listener: (event: MessageEvent<MeshRequest>) => void) => void;
  postMessage: (message: MeshMessage, transfer: Transferable[]) => void;
};

const chunks = new Map<string, MeshChunk>();
const pending = new Set<string>();
let realm: Realm = "surface";
let scheduled = false;

function buffers(layer: MeshLayer): ArrayBuffer[] {
  return [layer.positions.buffer, layer.normals.buffer, layer.colors.buffer, layer.indices.buffer] as ArrayBuffer[];
}

function schedule(): void {
  if (scheduled || pending.size === 0) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    const key = pending.values().next().value;
    if (key === undefined) return;
    pending.delete(key);
    const chunk = chunks.get(key);
    if (chunk) {
      const layers = meshChunk(chunk, realm, chunks);
      endpoint.postMessage({ type: "mesh", realm, key, ...layers }, [...buffers(layers.solid), ...buffers(layers.liquid)]);
    }
    schedule();
  }, 0);
}

function invalidate(cx: number, cz: number): void {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const key = chunkKey(cx + dx, cz + dz);
    if (chunks.has(key)) pending.add(key);
  }
}

endpoint.addEventListener("message", ({ data }) => {
  if (data.type === "reset") {
    realm = data.realm;
    chunks.clear();
    pending.clear();
    return;
  }
  if (data.realm !== realm) return;
  if (data.type === "chunks") {
    for (const chunk of data.chunks) chunks.set(chunkKey(chunk.cx, chunk.cz), decodeMeshChunk(chunk));
    for (const chunk of data.chunks) invalidate(chunk.cx, chunk.cz);
  } else {
    for (const key of data.keys) {
      chunks.delete(key);
      pending.delete(key);
    }
    for (const key of data.keys) {
      const [cx, cz] = key.split(",").map(Number);
      invalidate(cx, cz);
    }
  }
  schedule();
});

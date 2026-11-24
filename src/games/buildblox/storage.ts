import type { BlockEdit, Realm, SaveData } from "./protocol";

const realms: Realm[] = ["surface", "underdeep", "skyreach"];
const regionWidth = 32 * 16;
const writes = new Map<string, Promise<void>>();
let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("chudgames-buildblox", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("worlds");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error: unknown) => {
    database = undefined;
    throw error;
  });
  return database;
}

interface RegionPacket { realm: Realm; x: number; z: number; data: ArrayBuffer }
type StoredWorld = Omit<SaveData, "realms"> & { regions: RegionPacket[] };

export function encodeRegions(edits: SaveData["realms"]): RegionPacket[] {
  const packets: RegionPacket[] = [];
  for (const realm of realms) {
    const groups = new Map<string, { x: number; z: number; edits: BlockEdit[] }>();
    for (const edit of edits[realm]) {
      const x = Math.floor(edit[0] / regionWidth);
      const z = Math.floor(edit[2] / regionWidth);
      const key = x + "," + z;
      const group = groups.get(key) ?? { x, z, edits: [] };
      group.edits.push(edit);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const data = new ArrayBuffer(group.edits.length * 8);
      const view = new DataView(data);
      group.edits.forEach(([x, y, z, code], index) => {
        const offset = index * 8;
        view.setUint16(offset, x - group.x * regionWidth, true);
        view.setInt16(offset + 2, y, true);
        view.setUint16(offset + 4, z - group.z * regionWidth, true);
        view.setUint16(offset + 6, code, true);
      });
      packets.push({ realm, x: group.x, z: group.z, data });
    }
  }
  return packets;
}

export function decodeRegions(packets: RegionPacket[]): SaveData["realms"] {
  const edits: SaveData["realms"] = { surface: [], underdeep: [], skyreach: [] };
  for (const { realm, x, z, data } of packets) {
    const view = new DataView(data);
    for (let offset = 0; offset + 8 <= view.byteLength; offset += 8) {
      edits[realm].push([
        x * regionWidth + view.getUint16(offset, true),
        view.getInt16(offset + 2, true),
        z * regionWidth + view.getUint16(offset + 4, true),
        view.getUint16(offset + 6, true),
      ]);
    }
  }
  return edits;
}

export async function readWorld(key: string): Promise<SaveData | undefined> {
  await writes.get(key)?.catch(() => undefined);
  const db = await openDatabase();
  const record = await new Promise<StoredWorld | undefined>((resolve, reject) => {
    const request = db.transaction("worlds", "readonly").objectStore("worlds").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (record) {
    const { regions, ...data } = record;
    return { ...data, realms: decodeRegions(regions) };
  }
}

export function writeWorld(key: string, world: SaveData): Promise<void> {
  const previous = writes.get(key);
  const write = (previous?.catch(() => undefined) ?? Promise.resolve()).then(async () => {
    const db = await openDatabase();
    const { realms: edits, ...data } = world;
    const record: StoredWorld = { ...data, regions: encodeRegions(edits) };
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("worlds", "readwrite");
      transaction.objectStore("worlds").put(record, key);
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  });
  writes.set(key, write);
  const clear = (): void => {
    if (writes.get(key) === write) writes.delete(key);
  };
  void write.then(clear, clear);
  return write;
}

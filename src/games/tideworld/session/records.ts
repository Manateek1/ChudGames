import { GENERATOR, SCHEMA } from "./types";

export interface RecordData {
  schema: number;
  generator: number;
  length: number;
  crc: number;
  encoding: "json" | "gzip";
  bytes: ArrayBuffer;
}
export interface RecordRef {
  key: string;
  revision: number;
  crc: number;
  length: number;
}
export interface Manifest {
  schema: number;
  generator: number;
  records: RecordRef[];
  maps: string[];
}
export type Snapshot = Manifest | RecordData;
export const isManifest = (value: Snapshot): value is Manifest => "records" in value;
const spatialFields = ["edits", "variants", "facings", "drawers"] as const;
type Dictionary = Record<string, unknown>;
const dictionary = (value: unknown): value is Dictionary =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function checksum(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export class UnsupportedSave extends Error {}
export function compatible(value: { schema: number; generator: number }) {
  if (value.schema !== SCHEMA || value.generator !== GENERATOR)
    throw new UnsupportedSave(
      "This world needs save schema " + value.schema + " and generator " + value.generator + ".",
    );
}

export async function encodeRecord(
  bytes: Uint8Array<ArrayBuffer>,
  crc = checksum(bytes),
): Promise<RecordData> {
  const meta = { schema: SCHEMA, generator: GENERATOR, length: bytes.length, crc };
  if (bytes.length >= 4096 && typeof CompressionStream !== "undefined") {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    return { ...meta, encoding: "gzip", bytes: await new Response(stream).arrayBuffer() };
  }
  return { ...meta, encoding: "json", bytes: bytes.buffer };
}
export async function decodeRecord<T>(record: RecordData): Promise<T> {
  compatible(record);
  if (record.encoding !== "gzip" && record.encoding !== "json")
    throw new UnsupportedSave("Unknown save encoding.");
  const data =
    record.encoding === "gzip"
      ? await new Response(
          new Blob([record.bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
        ).arrayBuffer()
      : record.bytes;
  const bytes = new Uint8Array(data);
  if (bytes.length !== record.length || checksum(bytes) !== record.crc)
    throw new Error("BuildBlox record checksum mismatch.");
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

// Regions contain sixteen columns in X and Z. Keep the player, clock, inventories and ecology
// in one record; the manifest commits them alongside every edited terrain region.
export function freezeRecords(data: unknown) {
  const encoder = new TextEncoder(),
    groups = new Map<string, unknown>(),
    maps: string[] = [];
  if (dictionary(data)) {
    const core = { ...data };
    for (const field of spatialFields) {
      const cells = data[field];
      if (!dictionary(cells)) continue;
      maps.push(field);
      delete core[field];
      for (const [key, value] of Object.entries(cells)) {
        const [x, , z] = key.split(",").map(Number);
        const region =
          Number.isInteger(x) && Number.isInteger(z)
            ? "r/" + Math.floor(x / 256) + "/" + Math.floor(z / 256)
            : "r/unknown";
        const fields = (groups.get(region) ?? Object.create(null)) as Record<string, Dictionary>;
        (fields[field] ??= Object.create(null))[key] = value;
        groups.set(region, fields);
      }
    }
    groups.set("world", core);
  } else groups.set("world", data);
  const parts = Array.from(groups, ([key, value]) => {
    const bytes = encoder.encode(JSON.stringify(value));
    return { key, bytes, crc: checksum(bytes) };
  });
  return { parts, maps };
}
export async function restoreSnapshot<T>(
  snapshot: Snapshot,
  fetch: (ref: RecordRef) => Promise<RecordData | undefined>,
): Promise<T> {
  compatible(snapshot);
  if (!isManifest(snapshot)) return decodeRecord<T>(snapshot);
  if (!snapshot.records.some((ref) => ref.key === "world")) throw new Error("Incomplete world manifest.");
  const data = await Promise.all(
    snapshot.records.map(async (ref) => {
      const record = await fetch(ref);
      if (!record || record.length !== ref.length || record.crc !== ref.crc)
        throw new Error("Missing or inconsistent world region.");
      return [ref.key, await decodeRecord<unknown>(record)] as const;
    }),
  );
  const core = data.find(([key]) => key === "world")![1];
  if (!dictionary(core)) return core as T;
  for (const field of snapshot.maps) core[field] = Object.create(null);
  for (const [key, region] of data) {
    if (key === "world") continue;
    if (!dictionary(region)) throw new Error("Invalid region record.");
    for (const field of snapshot.maps) {
      const entries = region[field];
      if (dictionary(entries)) Object.assign(core[field] as Dictionary, entries);
    }
  }
  return core as T;
}
export async function recoverSnapshot<T>(
  latest: Snapshot,
  previous: Snapshot | undefined,
  fetch: (ref: RecordRef) => Promise<RecordData | undefined>,
) {
  try {
    return { data: await restoreSnapshot<T>(latest, fetch), recovered: false };
  } catch (e) {
    if (e instanceof UnsupportedSave || !previous) throw e;
    return { data: await restoreSnapshot<T>(previous, fetch), recovered: true };
  }
}

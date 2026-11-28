/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import {
  checksum,
  encodeRecord,
  freezeRecords,
  recoverSnapshot,
  restoreSnapshot,
  UnsupportedSave,
  type Manifest,
  type RecordData,
} from "./records";

async function fixture(data: unknown, revision = 1) {
  const { parts, maps } = freezeRecords(data);
  const blobs = new Map<string, RecordData>();
  const manifest: Manifest = { schema: 1, generator: 1, records: [], maps };
  for (const p of parts) {
    const blob = await encodeRecord(p.bytes, p.crc);
    blobs.set(p.key + "@" + revision, blob);
    manifest.records.push({ key: p.key, revision, crc: p.crc, length: blob.length });
  }
  return { manifest, blobs };
}
describe("BuildBlox world records", () => {
  it("round trips signed regional keys, unknown content payloads, player inventory and ecology", async () => {
    const save = {
      tick: 4802,
      edits: { "-1,-94,-257": "future_timber", "255,120,0": "lamp", "256,120,0": "air" },
      variants: { "-1,-94,-257": "custom_color" },
      facings: {},
      drawers: { "-1,-94,-257": { slots: [{ id: "future_item", count: 2, custom: [1, 3] }] } },
      inventory: { slots: [{ id: "slate_brick", count: 5 }] },
      ecology: { clock: 120 },
      future: { notes: ["retained"] },
    };
    const { manifest, blobs } = await fixture(save);
    expect(manifest.records.map((r) => r.key).sort()).toEqual(["r/-1/-2", "r/0/0", "r/1/0", "world"]);
    expect(await restoreSnapshot(manifest, async (r) => blobs.get(r.key + "@1"))).toEqual(save);
    expect(checksum(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("recovers both pack and terrain from the same prior commit when one region is truncated", async () => {
    const original = { inventory: 5, edits: { "-258,10,3": "air", "256,10,3": "air" } };
    const first = await fixture(original, 1);
    const next = await fixture({ inventory: 3, edits: { "-258,10,3": "lamp", "256,10,3": "lamp" } }, 2);
    const disk = new Map([...first.blobs, ...next.blobs]);
    disk.get("r/1/0@2")!.bytes = new Uint8Array([123]).buffer;
    const result = await recoverSnapshot(next.manifest, first.manifest, async (r) =>
      disk.get(r.key + "@" + r.revision),
    );
    expect(result).toEqual({ recovered: true, data: original });
    await expect(
      recoverSnapshot(next.manifest, undefined, async (r) => disk.get(r.key + "@" + r.revision)),
    ).rejects.toThrow(/checksum/);
  });
  it("opens the single-record encoding and refuses newer schemas or generators even with a usable backup", async () => {
    const saved = { tick: 43200, edits: {}, inventory: {}, text: "red scrub ".repeat(1600) };
    const old = await encodeRecord(new TextEncoder().encode(JSON.stringify(saved)));
    expect(old.encoding).toBe("gzip");
    expect(await restoreSnapshot(old, async () => undefined)).toEqual(saved);
    for (const change of [{ schema: 2 }, { generator: 2 }])
      await expect(recoverSnapshot({ ...old, ...change }, old, async () => undefined)).rejects.toBeInstanceOf(
        UnsupportedSave,
      );
  });
});

import { GENERATOR, SCHEMA, type LocalWorldInfo } from "./types";
import {
  compatible,
  encodeRecord,
  freezeRecords,
  isManifest,
  restoreSnapshot,
  recoverSnapshot,
  UnsupportedSave,
  type Manifest,
  type RecordData,
  type RecordRef,
  type Snapshot,
} from "./records";

interface WorldRecord {
  info: LocalWorldInfo;
  latest: Snapshot;
  previous?: Snapshot;
  compactAt?: number;
}
interface JournalEntry {
  sequence: number;
  base: number;
  commit: Manifest;
  changes: { ref: RecordRef; data: RecordData }[];
}
const writes = new Map<string, Promise<void>>();
const recoveredHeaders = new WeakSet<object>();
let database: Promise<IDBDatabase> | undefined;
function open() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("chudgames-buildblox-handbook", 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ["worlds", "headers", "records", "journal"])
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    database = undefined;
    throw error;
  });
  return database;
}
function read<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
const refs = (s?: Snapshot) => (s && isManifest(s) ? s.records : []);
const refKey = (r: RecordRef) => r.key + "@" + r.revision;
const idbKey = (id: string, r: RecordRef) => [id, r.key, r.revision];
export async function listLocalWorlds(): Promise<LocalWorldInfo[]> {
  const db = await open();
  const rows: LocalWorldInfo[] = await read(db.transaction("headers").objectStore("headers").getAll());
  return rows.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}
export async function loadLocalWorld<T>(id: string) {
  await writes.get(id)?.catch(() => undefined);
  const db = await open();
  // Issue all referenced reads in the same transaction as the manifest read. A different tab
  // can compact old records immediately after the read transaction completes.
  const snapshot = await new Promise<{ row: WorldRecord; records: Map<string, RecordData> } | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(["worlds", "records"]);
      const head = tx.objectStore("worlds").get(id);
      const records = new Map<string, RecordData>();
      let row: WorldRecord | undefined;
      head.onsuccess = () => {
        row = head.result;
        if (!row) return;
        const needed = new Map([...refs(row.latest), ...refs(row.previous)].map((r) => [refKey(r), r]));
        const store = tx.objectStore("records");
        for (const [key, ref] of needed) {
          const request = store.get(idbKey(id, ref));
          request.onsuccess = () => {
            if (request.result) records.set(key, request.result);
          };
        }
      };
      tx.oncomplete = () => resolve(row ? { row, records } : undefined);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("World read interrupted."));
    },
  );
  if (!snapshot) return;
  const { row, records } = snapshot;
  const primary = (ref: RecordRef) => Promise.resolve(records.get(refKey(ref)));
  try {
    return { info: row.info, data: await restoreSnapshot<T>(row.latest, primary), recovered: false };
  } catch (error) {
    if (error instanceof UnsupportedSave) throw error;
    // Replay sealed write batches at their recorded revisions before falling back a whole commit.
    // Fetch journal copies only on recovery so an ordinary open reads each region once.
    const journal = db.transaction("journal").objectStore("journal");
    const revisions = new Set([
      row.info.revision ?? 0,
      ...[...refs(row.latest), ...refs(row.previous)].map((r) => r.revision),
    ]);
    const batches = await Promise.all(
      [...revisions].map(async (revision) => {
        const batch = await read<JournalEntry | undefined>(journal.get([id, revision]));
        return batch?.sequence === revision && batch.base === revision - 1 ? batch : undefined;
      }),
    );
    const replayed = new Map(records);
    for (const batch of batches) {
      for (const change of batch?.changes ?? []) {
        if (change.ref.revision === batch!.sequence) replayed.set(refKey(change.ref), change.data);
      }
    }
    const reader = (ref: RecordRef) => Promise.resolve(replayed.get(refKey(ref)));
    const commit = batches.find((b) => b?.sequence === row.info.revision)?.commit;
    let data: T;
    try {
      data = (await recoverSnapshot<T>(commit ?? row.latest, row.previous, reader)).data;
    } catch (failure) {
      if (failure instanceof UnsupportedSave || !row.previous) throw failure;
      data = await restoreSnapshot<T>(row.previous, primary);
    }
    recoveredHeaders.add(row.info);
    return { info: row.info, data, recovered: true };
  }
}
export function saveLocalWorld<T>(info: LocalWorldInfo, data: T): Promise<void> {
  // Freeze the transaction at invocation, before an outstanding write or compression job can yield.
  const frozen = freezeRecords(data);
  const write = (writes.get(info.id)?.catch(() => undefined) ?? Promise.resolve()).then(async () => {
    const db = await open();
    const row: WorldRecord | undefined = await read(
      db.transaction("worlds").objectStore("worlds").get(info.id),
    );
    const expected = info.revision ?? 0;
    if ((row?.info.revision ?? 0) !== expected)
      throw new Error("This world was saved in another tab. Reopen it to continue.");
    if (row) compatible(row.latest);
    const prior = recoveredHeaders.has(info) ? row?.previous : row?.latest;
    const previous = new Map(refs(prior).map((ref) => [ref.key, ref]));
    const next: Manifest = { schema: SCHEMA, generator: GENERATOR, maps: frozen.maps, records: [] };
    const changed: { ref: RecordRef; data: RecordData }[] = [];
    for (const part of frozen.parts) {
      const old = previous.get(part.key);
      if (!recoveredHeaders.has(info) && old && old.crc === part.crc && old.length === part.bytes.length) {
        next.records.push(old);
        continue;
      }
      const ref = { key: part.key, revision: expected + 1, length: part.bytes.length, crc: part.crc };
      changed.push({ ref, data: await encodeRecord(part.bytes, part.crc) });
      next.records.push(ref);
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["worlds", "headers", "records", "journal"], "readwrite", {
        durability: "strict",
      });
      const worlds = tx.objectStore("worlds"),
        records = tx.objectStore("records");
      const head = worlds.get(info.id);
      let conflict = false;
      const header = { ...info, updatedAt: Date.now(), revision: expected + 1 };
      head.onsuccess = () => {
        const current = head.result as WorldRecord | undefined;
        if ((current?.info.revision ?? 0) !== expected) {
          conflict = true;
          tx.abort();
          return;
        }
        const retain = new Set([...refs(prior), ...next.records].map(refKey));
        for (const ref of [...refs(current?.previous), ...refs(current?.latest)])
          if (!retain.has(refKey(ref))) records.delete(idbKey(info.id, ref));
        for (const item of changed) records.put(item.data, idbKey(info.id, item.ref));
        const journal = tx.objectStore("journal");
        const sequence = expected + 1,
          now = Date.now();
        journal.put({ sequence, base: expected, commit: next, changes: changed } satisfies JournalEntry, [
          info.id,
          sequence,
        ]);
        let compactAt = current?.compactAt ?? 0;
        if (now - compactAt >= 60000) {
          // Retain journal segments needed to heal every region still referenced by either snapshot.
          const needed = new Set([
            expected,
            sequence,
            ...[...refs(prior), ...next.records].map((r) => r.revision),
          ]);
          const old = journal.getAllKeys(IDBKeyRange.bound([info.id, 0], [info.id, sequence]));
          old.onsuccess = () => {
            for (const key of old.result)
              if (Array.isArray(key) && !needed.has(Number(key[1]))) journal.delete(key);
          };
          compactAt = now;
        }
        worlds.put({ info: header, latest: next, previous: prior, compactAt }, info.id);
        tx.objectStore("headers").put(header, info.id);
      };
      tx.oncomplete = () => {
        Object.assign(info, header);
        recoveredHeaders.delete(info);
        resolve();
      };
      tx.onabort = () =>
        reject(
          conflict
            ? new Error("This world was saved in another tab. Reopen it to continue.")
            : (tx.error ?? new Error("Save interrupted.")),
        );
      tx.onerror = () => reject(tx.error);
    });
  });
  writes.set(info.id, write);
  const clear = () => {
    if (writes.get(info.id) === write) writes.delete(info.id);
  };
  void write.then(clear, clear);
  return write;
}

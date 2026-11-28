import { type Processor, type Stack } from "./catalog";
import { Inventory, deposit, STORAGE } from "./inventory";
import { RECIPES } from "./recipes";

export interface Job {
  recipe: string;
  owner: string;
  remaining: number;
  reserved: Stack[];
  output: Stack;
}
export interface StationState {
  kind: Processor;
  input: (Stack | null)[];
  fuel: Stack | null;
  output: (Stack | null)[];
  queue: Job[];
  burn: number;
  version: number;
}
export const createStation = (kind: Processor): StationState => ({
  kind,
  input: Array(4).fill(null),
  fuel: null,
  output: [null, null],
  queue: [],
  burn: 0,
  version: 0,
});
export function queueJob(station: StationState, id: string, inv: Inventory, owner = "local") {
  const r = RECIPES.find((x) => x.id === id);
  if (r?.station !== station.kind || station.queue.length >= 4) return false;
  const bench = new Inventory("survival", { slots: station.input, version: 0 });
  const useBench = bench.canCraft(r);
  const materials = (useBench ? bench : inv).reserve(r);
  if (!materials) return false;
  if (useBench) station.input = bench.slots.slice(0, 4);
  station.queue.push({ recipe: id, owner, remaining: r.ticks, ...materials });
  station.version++;
  return true;
}
export function loadStationInput(station: StationState, inv: Inventory, slot: number, count = 1) {
  const s = inv.slots[slot];
  if (!s || slot >= STORAGE || !Number.isSafeInteger(count) || count < 1 || count > s.count) return false;
  const copy = station.input.map((existing) => existing && { ...existing });
  if (deposit(copy, { ...s, count })) return false;
  inv.take(slot, count);
  station.input = copy;
  station.version++;
  return true;
}
export function withdrawStationSlot(station: StationState, inv: Inventory, slot: number | "fuel") {
  const s = slot === "fuel" ? station.fuel : station.input[slot];
  if (!s) return false;
  const left = inv.addStack(s);
  if (left === s.count) return false;
  if (slot === "fuel") station.fuel = left ? { ...s, count: left } : null;
  else station.input[slot] = left ? { ...s, count: left } : null;
  station.version++;
  return true;
}
export function cancelJob(station: StationState, index: number, inv: Inventory, owner = "local") {
  const job = station.queue[index];
  if (!job || job.owner !== owner || !job.remaining) return false;
  const draft = inv.save().slots;
  if (job.reserved.some((s) => deposit(draft, s, STORAGE) > 0)) return false;
  inv.slots = draft;
  inv.version++;
  station.queue.splice(index, 1);
  station.version++;
  return true;
}
function burnTime(kind: Processor, id: string) {
  if (id === "charcoal") return 600;
  if (kind === "kiln" && (id === "alder_log" || id === "pine_log")) return 240;
  if (kind === "stove" && id === "oil") return 750;
  return 0;
}
export function fuelStation(station: StationState, inv: Inventory, slot: number) {
  const s = inv.slots[slot];
  if (
    slot >= STORAGE ||
    !s ||
    !burnTime(station.kind, s.id) ||
    (station.fuel && (station.fuel.id !== s.id || station.fuel.count >= 48))
  )
    return false;
  const unit = inv.take(slot);
  if (!unit) return false;
  if (station.fuel) station.fuel.count++;
  else station.fuel = unit;
  station.version++;
  return true;
}
export function collectStation(station: StationState, inv: Inventory) {
  let changed = false;
  for (let i = 0; i < station.output.length; i++) {
    const s = station.output[i];
    if (!s) continue;
    const left = inv.addStack(s);
    if (left === s.count) continue;
    station.output[i] = left ? { ...s, count: left } : null;
    changed = true;
  }
  if (changed) station.version++;
  return changed;
}
export function tickStation(station: StationState) {
  const job = station.queue[0];
  if (!job) return;
  if (job.remaining) {
    if (!station.burn) {
      const fuel = station.fuel;
      if (!fuel) return;
      station.burn = burnTime(station.kind, fuel.id);
      if (!station.burn) return;
      if (!--fuel.count) station.fuel = null;
    }
    job.remaining--;
    station.burn--;
  }
  if (!job.remaining) {
    const draft = station.output.map((s) => s && { ...s });
    if (deposit(draft, job.output)) return;
    station.output = draft;
    station.queue.shift();
  }
  station.version++;
}

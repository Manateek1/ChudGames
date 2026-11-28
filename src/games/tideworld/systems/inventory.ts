import { ITEMS, makeStack, type Recipe, type Stack } from "./catalog";
import { RECIPES } from "./recipes";

export const BELT = 7,
  STORAGE = 35,
  CLOTHING = 35,
  EQUIPMENT = 36;
export interface InventorySave {
  slots: (Stack | null)[];
  version: number;
}
const same = (a: Stack, b: Stack) =>
  a.id === b.id &&
  a.variant === b.variant &&
  a.durability === b.durability &&
  a.fill === b.fill &&
  a.vitality === b.vitality;
const copy = (slots: (Stack | null)[]) => slots.map((s) => (s ? { ...s } : null));

export function deposit(slots: (Stack | null)[], stack: Stack, limit = slots.length) {
  let left = stack.count;
  if (!Number.isSafeInteger(left) || left <= 0) return left;
  if (!ITEMS[stack.id]) {
    const slot = slots.slice(0, limit).findIndex((s) => s === null);
    if (slot < 0) return left;
    slots[slot] = structuredClone(stack);
    return 0;
  }
  const cap = ITEMS[stack.id].limit;
  for (let i = 0; i < limit && left; i++) {
    const s = slots[i];
    if (!s || !same(s, stack)) continue;
    const n = Math.min(left, cap - s.count);
    s.count += n;
    left -= n;
  }
  for (let i = 0; i < limit && left; i++) {
    if (slots[i]) continue;
    const n = Math.min(left, cap);
    slots[i] = { ...stack, count: n };
    left -= n;
  }
  return left;
}
export class Inventory {
  slots: (Stack | null)[];
  version: number;
  readonly mode: "survival" | "building";
  constructor(mode: "survival" | "building" = "survival", saved?: InventorySave) {
    this.mode = mode;
    this.slots = Array.from({ length: 37 }, (_, i) => {
      const s = saved?.slots[i];
      if (!s || typeof s.id !== "string" || !Number.isSafeInteger(s.count) || s.count <= 0) return null;
      // Preserve an unrecognized item's payload so a later compatible build can restore it.
      return ITEMS[s.id] ? { ...s, count: Math.min(s.count, ITEMS[s.id].limit) } : structuredClone(s);
    });
    this.version = saved?.version ?? 0;
  }
  save(): InventorySave {
    return { slots: copy(this.slots), version: this.version };
  }
  count(id: string) {
    return this.slots.slice(0, STORAGE).reduce((n, s) => n + (s?.id === id ? s.count : 0), 0);
  }
  add(id: string, count = 1, variant?: string) {
    return this.addStack(makeStack(id, count, variant));
  }
  addStack(stack: Stack) {
    const left = deposit(this.slots, stack, STORAGE);
    if (left !== stack.count) this.version++;
    return left;
  }
  grant(slot: number, id: string) {
    if (this.mode !== "building" || !Number.isInteger(slot) || slot < 0 || slot >= BELT || !ITEMS[id])
      return false;
    this.slots[slot] = makeStack(id, ITEMS[id].limit);
    this.version++;
    return true;
  }
  take(slot: number, count = 1): Stack | null {
    const s = this.slots[slot];
    if (!s || !Number.isInteger(count) || count < 1 || s.count < count) return null;
    const out = { ...s, count };
    s.count -= count;
    if (!s.count) this.slots[slot] = null;
    this.version++;
    return out;
  }
  wear(slot: number, amount = 1) {
    const s = this.slots[slot];
    if (
      this.mode !== "survival" ||
      !s ||
      !ITEMS[s.id]?.durability ||
      s.durability === undefined ||
      amount < 1
    )
      return;
    s.durability -= amount;
    if (s.durability <= 0) this.slots[slot] = null;
    this.version++;
  }
  move(from: number, to: number, count?: number, expectedVersion = this.version) {
    const s = this.slots[from],
      dest = this.slots[to];
    if (
      expectedVersion !== this.version ||
      !s ||
      !Number.isInteger(to) ||
      to < 0 ||
      to >= this.slots.length ||
      from === to
    )
      return false;
    const fits = (slot: number, stack: Stack | null) =>
      !stack || slot < STORAGE || ITEMS[stack.id]?.equip === (slot === CLOTHING ? "clothing" : "equipment");
    if (!fits(to, s)) return false;
    const n = count ?? s.count;
    if (!Number.isInteger(n) || n < 1 || n > s.count) return false;
    if (!ITEMS[s.id] && n !== s.count) return false;
    if (dest && (!ITEMS[s.id] || !same(s, dest))) {
      if (n !== s.count || !fits(from, dest)) return false;
      this.slots[from] = dest;
      this.slots[to] = s;
    } else {
      const moved = Math.min(n, (ITEMS[s.id]?.limit ?? s.count) - (dest?.count ?? 0));
      if (moved <= 0) return false;
      this.slots[to] = { ...s, count: (dest?.count ?? 0) + moved };
      s.count -= moved;
      if (!s.count) this.slots[from] = null;
    }
    this.version++;
    return true;
  }
  equip(slot: number) {
    const s = this.slots[slot],
      dest = s && ITEMS[s.id]?.equip;
    return Boolean(dest && this.move(slot, dest === "clothing" ? CLOTHING : EQUIPMENT));
  }
  private plan(recipe: Recipe) {
    const draft = copy(this.slots),
      reserved: Stack[] = [];
    for (const ingredient of recipe.ingredients) {
      const id = ingredient.ids.find(
        (id) =>
          draft.slice(0, STORAGE).reduce((n, s) => n + (s?.id === id ? s.count : 0), 0) >= ingredient.count,
      );
      if (!id) return null;
      let left = ingredient.count;
      for (let i = 0; i < STORAGE && left; i++) {
        const s = draft[i];
        if (s?.id !== id) continue;
        const n = Math.min(left, s.count);
        reserved.push({ ...s, count: n });
        s.count -= n;
        left -= n;
        if (!s.count) draft[i] = null;
      }
    }
    let variant = recipe.output.variant;
    if (recipe.id === "dry_plank") variant = reserved[0].id.split("_")[0];
    if (recipe.id === "timber_panel") variant = reserved[0].variant;
    if (recipe.id === "stair_step" || recipe.id === "half_step") variant = reserved[0].id;
    return { draft, reserved, output: makeStack(recipe.output.id, recipe.output.count, variant) };
  }
  canCraft(recipe: Recipe) {
    return this.plan(recipe) !== null;
  }
  reserve(recipe: Recipe) {
    const plan = this.plan(recipe);
    if (!plan) return null;
    this.slots = plan.draft;
    this.version++;
    return { reserved: plan.reserved, output: plan.output };
  }
  craft(recipeId: string, station: "quick" | "workbench" = "quick", expectedVersion = this.version) {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (
      expectedVersion !== this.version ||
      !recipe ||
      recipe.ticks ||
      (recipe.station !== "quick" && recipe.station !== station)
    )
      return false;
    const plan = this.plan(recipe);
    // Capacity is checked before inputs are consumed; a rejected action leaves every slot intact.
    if (!plan || deposit(copy(this.slots), plan.output, STORAGE) || deposit(plan.draft, plan.output, STORAGE))
      return false;
    this.slots = plan.draft;
    this.version++;
    return true;
  }
}

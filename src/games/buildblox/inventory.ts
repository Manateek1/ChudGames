import { Block, Item, isItem, recipes, toolStats } from "./blocks";
import type { Recipe, Stack } from "./blocks";

export const SLOT_COUNT = 36;
export const HOTBAR_COUNT = 9;
export type Inventory = (Stack | null)[];

const stackLimit = (id: number): number => toolStats[id] || id === Item.GuardCoat ? 1 : 64;

export function stash(inventory: Inventory, id: number, quantity: number): number {
  const limit = stackLimit(id);
  if (limit > 1) {
    for (const cell of inventory) {
      if (cell?.id !== id || cell.count === limit) continue;
      const count = Math.min(limit - cell.count, quantity);
      cell.count += count;
      quantity -= count;
      if (!quantity) return 0;
    }
  }
  for (let index = 0; index < inventory.length && quantity > 0; index++) {
    if (inventory[index]) continue;
    const count = Math.min(limit, quantity);
    inventory[index] = toolStats[id] ? { id, count, durability: toolStats[id].durability } : { id, count };
    quantity -= count;
  }
  return quantity;
}

export function spend(inventory: Inventory, id: number, quantity: number): boolean {
  const count = inventory.reduce((sum, slot) => sum + (slot?.id === id ? slot.count : 0), 0);
  if (count < quantity) return false;
  for (let index = inventory.length - 1; index >= 0 && quantity > 0; index--) {
    const slot = inventory[index];
    if (slot?.id !== id) continue;
    const consumed = Math.min(slot.count, quantity);
    slot.count -= consumed;
    quantity -= consumed;
    if (!slot.count) inventory[index] = null;
  }
  return true;
}

export const copyInventory = (source: Inventory): Inventory => source.map((slot) => slot && { ...slot });

export function craftInto(inventory: Inventory, recipe: Recipe): Inventory | null {
  const next = copyInventory(inventory);
  if (!recipe.ingredients.every(([id, quantity]) => spend(next, id, quantity))) return null;
  return stash(next, recipe.result, recipe.count) === 0 ? next : null;
}

export function matchGrid(grid: number[], size: 2 | 3): Recipe | undefined {
  if (grid.length !== size * size || grid.some((id) => id !== 0 && !isItem(id))) return;
  const occupied = grid.flatMap((id, index) => id ? [[index % size, Math.floor(index / size)]] : []);
  if (!occupied.length) return;
  const left = Math.min(...occupied.map(([x]) => x));
  const top = Math.min(...occupied.map(([, y]) => y));
  const width = Math.max(...occupied.map(([x]) => x)) - left + 1;
  const height = Math.max(...occupied.map(([, y]) => y)) - top + 1;
  return recipes.find(({ pattern, ingredients }) => {
    if (!pattern) {
      return ingredients.length === 1 && ingredients[0][1] === occupied.length &&
        grid.every((id) => id === 0 || id === ingredients[0][0]);
    }
    if (pattern.length !== height || pattern[0].length !== width) return false;
    return [false, true].some((flip) => pattern.every((row, y) =>
      row.every((id, x) => grid[(y + top) * size + left + (flip ? width - x - 1 : x)] === id)));
  });
}

export function startingInventory(creative: boolean): Inventory {
  const inventory: Inventory = Array.from({ length: SLOT_COUNT }, () => null);
  const starter = creative
    ? [[Block.Wood, 64], [Block.Stone, 64], [Block.Glass, 64], [Block.Switch, 64],
      [Block.Wire, 64], [Block.Lamp, 64], [Block.RiftGate, 64], [Block.SkyGate, 64], [Block.Door, 64]]
    : [[Block.Wood, 8], [Block.Soil, 12], [Item.Ration, 4]];
  for (const [id, count] of starter) stash(inventory, id, count);
  return inventory;
}

export function restoreInventory(saved: Inventory): Inventory {
  return Array.from({ length: SLOT_COUNT }, (_, index) => {
    const slot = saved[index];
    if (!slot || !isItem(slot.id) || !Number.isFinite(slot.count) || slot.count < 1) return null;
    const result: Stack = { id: slot.id, count: Math.min(stackLimit(slot.id), Math.floor(slot.count)) };
    if (toolStats[slot.id]) {
      const limit = toolStats[slot.id].durability;
      result.durability = Number.isFinite(slot.durability) ? Math.min(limit, Math.max(1, Math.floor(slot.durability!))) : limit;
      if (slot.tempered) result.tempered = true;
    }
    return result;
  });
}

export function moveSlot(inventory: Inventory, from: number, to: number): void {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to ||
    from < 0 || from >= inventory.length || to < 0 || to >= inventory.length) return;
  const source = inventory[from];
  const target = inventory[to];
  if (source && target?.id === source.id && stackLimit(source.id) > 1) {
    const count = Math.min(stackLimit(source.id) - target.count, source.count);
    target.count += count;
    source.count -= count;
    if (source.count === 0) inventory[from] = null;
  } else {
    inventory[to] = source;
    inventory[from] = target;
  }
}

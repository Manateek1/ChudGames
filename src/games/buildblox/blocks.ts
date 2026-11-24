export const Block = {
  Air: 0, Sod: 1, Soil: 2, Stone: 3, Sand: 4, Water: 5, Timber: 6, Leaves: 7,
  CopperOre: 8, Glowstone: 9, Bedrock: 10, Basalt: 11, Crystal: 12,
  Cloudstone: 13, Wood: 14, Glass: 15, Wire: 16, Switch: 17, Lamp: 18,
  Door: 19, Relay: 20, Piston: 21, Plate: 22, Inverter: 23, Sensor: 24,
  Bench: 25, Furnace: 26, RiftGate: 27, SkyGate: 28, Ember: 29, Moss: 30,
  BerryBush: 31, Brick: 32, Gravel: 33, Sandstone: 34, Snow: 35, Frostglass: 36,
} as const;

export const Item = {
  WoodPick: 128, StonePick: 129, CopperPick: 130, PrismPick: 131,
  Ration: 132, CopperIngot: 133, AmberShard: 134, Seed: 135, HearthStew: 136,
  CopperBlade: 137, TrailTonic: 138, GuardCoat: 139,
} as const;

export interface BlockDefinition {
  name: string;
  color: number;
  top?: number;
  bottom?: number;
  solid: boolean;
  opaque: boolean;
  hardness: number;
  emission: number;
  drops: number;
}

function block(name: string, color: number, hardness: number, drops: number, options: Partial<BlockDefinition> = {}): BlockDefinition {
  return Object.freeze({ name, color, hardness, drops, solid: true, opaque: true, emission: 0, ...options });
}

const definitions: readonly BlockDefinition[] = [
  block("Air", 0, 0, 0, { solid: false, opaque: false }),
  block("Juniper turf", 0x728b50, 0.5, Block.Soil, { top: 0x8ba95b, bottom: 0x926844 }),
  block("Earth", 0x926844, 0.5, Block.Soil),
  block("Fieldstone", 0x827e79, 1.9, Block.Stone),
  block("Beach sand", 0xd6b887, 0.55, Block.Sand),
  block("Water", 0x3a94aa, Infinity, 0, { solid: false, opaque: false }),
  block("Cedar log", 0x805238, 1.15, Block.Timber, { top: 0xbc8c54, bottom: 0x976842 }),
  block("Amber leaves", 0xc59543, 0.2, Block.Leaves, { opaque: false }),
  block("Copper ore", 0xae735d, 2.2, Block.CopperOre),
  block("Lumen stone", 0xe8ba66, 1.15, Block.Glowstone, { emission: 13 }),
  block("Foundation", 0x474452, Infinity, 0),
  block("Black basalt", 0x574653, 2.1, Block.Basalt),
  block("Prism crystal", 0x98b3ed, 2.6, Block.Crystal, { emission: 8 }),
  block("Cloudstone", 0xbab4d5, 1.3, Block.Cloudstone),
  block("Cedar boards", 0xbe9160, 0.8, Block.Wood),
  block("Glass", 0x94d1dc, 0.4, Block.Glass, { opaque: false }),
  block("Copper trace", 0x9a5942, 0.18, Block.Wire, { solid: false, opaque: false }),
  block("Toggle switch", 0xd4a675, 0.38, Block.Switch, { solid: false, opaque: false }),
  block("Signal lantern", 0xb9995d, 0.75, Block.Lamp),
  block("Signal hatch", 0x8f6f55, 0.8, Block.Door, { opaque: false }),
  block("Timing relay", 0xa4a29d, 0.55, Block.Relay, { solid: false, opaque: false }),
  block("Push ram", 0x93836d, 1.25, Block.Piston),
  block("Pressure plate", 0xa88868, 0.4, Block.Plate, { solid: false, opaque: false }),
  block("Inverter", 0x9c80a0, 0.48, Block.Inverter, { solid: false, opaque: false }),
  block("Daylight panel", 0x5c819d, 0.52, Block.Sensor, { solid: false, opaque: false }),
  block("Workbench", 0xb1774d, 1.15, Block.Bench, { top: 0xc89d68 }),
  block("Kiln", 0x69636a, 1.65, Block.Furnace),
  block("Underdeep gate", 0xd96a47, 1.2, Block.RiftGate, { opaque: false, emission: 11 }),
  block("Skyreach gate", 0x9283e3, 1.3, Block.SkyGate, { opaque: false, emission: 12 }),
  block("Ember flow", 0xe36e45, Infinity, 0, { solid: false, opaque: false, emission: 14 }),
  block("Mossbank", 0x608b75, 0.5, Block.Moss, { top: 0x80a889, bottom: 0x6a604c }),
  block("Berry bramble", 0x974c62, 0.22, Item.Ration, { solid: false, opaque: false }),
  block("Kiln brick", 0xb57763, 1.1, Block.Brick),
  block("Gravel", 0x9f8e7d, 0.48, Block.Gravel),
  block("Dune stone", 0xba966b, 1.2, Block.Sandstone),
  block("Alpine snow", 0xe7edf4, 0.45, Block.Snow),
  block("Frostglass", 0x83b9d1, 1.2, Block.Frostglass),
];

export const blockOf = (code: number): number => code & 255;
export const stateOf = (code: number): number => code >>> 8;
export const withState = (id: number, state: number): number => id | (state << 8);
export const definition = (code: number): BlockDefinition => definitions[blockOf(code)] ?? definitions[0];
export const isSolid = (code: number): boolean =>
  blockOf(code) === Block.Door && stateOf(code) > 0 ? false : definition(code).solid;

const items: Record<number, { name: string; color: number }> = {
  [Item.WoodPick]: { name: "Cedar pick", color: 0xc3946b },
  [Item.StonePick]: { name: "Stone pick", color: 0xa59b90 },
  [Item.CopperPick]: { name: "Copper pick", color: 0xe99569 },
  [Item.PrismPick]: { name: "Prism pick", color: 0xb1baff },
  [Item.Ration]: { name: "Trailberries", color: 0xd07382 },
  [Item.CopperIngot]: { name: "Copper ingot", color: 0xe09a75 },
  [Item.AmberShard]: { name: "Amber shard", color: 0xffc87a },
  [Item.Seed]: { name: "Bramble seed", color: 0x8ab879 },
  [Item.HearthStew]: { name: "Hearth stew", color: 0xcf8359 },
  [Item.CopperBlade]: { name: "Copper blade", color: 0xde9d7e },
  [Item.TrailTonic]: { name: "Trail tonic", color: 0x8fc2db },
  [Item.GuardCoat]: { name: "Guard coat", color: 0xa28583 },
};

export const itemInfo = (id: number): { name: string; color: number } => items[id] ?? definition(id);
export const isItem = (id: number): boolean => Number.isInteger(id) && (id > 0 && id < definitions.length || Object.hasOwn(items, id));
export const isPlaceable = (id: number): boolean => Number.isInteger(id) && id > 0 && id < definitions.length &&
  id !== Block.Bedrock && id !== Block.Water && id !== Block.Ember;
export const catalog = [
  ...definitions.map((_, id) => id).filter(isPlaceable),
  ...Object.keys(items).map(Number),
];

export const toolStats: Record<number, { speed: number; attack: number; durability: number }> = {
  [Item.WoodPick]: { speed: 2, attack: 2, durability: 70 },
  [Item.StonePick]: { speed: 3, attack: 3, durability: 125 },
  [Item.CopperPick]: { speed: 4.2, attack: 4, durability: 185 },
  [Item.PrismPick]: { speed: 6, attack: 6, durability: 280 },
  [Item.CopperBlade]: { speed: 1.1, attack: 7, durability: 165 },
};

export interface Recipe {
  id: string;
  result: number;
  count: number;
  ingredients: readonly [number, number][];
  pattern?: readonly (readonly number[])[];
  bench?: boolean;
}

const wood = Block.Wood;
const stone = Block.Stone;
const copper = Item.CopperIngot;
export const recipes: readonly Recipe[] = [
  { id: "boards", result: wood, count: 4, ingredients: [[Block.Timber, 1]] },
  { id: "bench", result: Block.Bench, count: 1, ingredients: [[wood, 4]], pattern: [[wood, wood], [wood, wood]] },
  { id: "cedar-pick", result: Item.WoodPick, count: 1, ingredients: [[wood, 3]], pattern: [[wood, wood], [wood, 0]] },
  { id: "stone-pick", result: Item.StonePick, count: 1, ingredients: [[stone, 3], [wood, 2]], pattern: [[stone, stone, stone], [0, wood, 0], [0, wood, 0]], bench: true },
  { id: "copper-pick", result: Item.CopperPick, count: 1, ingredients: [[copper, 3], [wood, 2]], pattern: [[copper, copper, copper], [0, wood, 0], [0, wood, 0]], bench: true },
  { id: "prism-pick", result: Item.PrismPick, count: 1, ingredients: [[Block.Crystal, 3], [wood, 2]], pattern: [[Block.Crystal, Block.Crystal, Block.Crystal], [0, wood, 0], [0, wood, 0]], bench: true },
  { id: "blade", result: Item.CopperBlade, count: 1, ingredients: [[copper, 2], [wood, 1]], bench: true },
  { id: "kiln", result: Block.Furnace, count: 1, ingredients: [[stone, 6]], bench: true },
  { id: "trace", result: Block.Wire, count: 8, ingredients: [[copper, 1]] },
  { id: "switch", result: Block.Switch, count: 2, ingredients: [[wood, 1], [Block.Wire, 1]] },
  { id: "lamp", result: Block.Lamp, count: 1, ingredients: [[Block.Glowstone, 1], [Block.Wire, 1]] },
  { id: "hatch", result: Block.Door, count: 1, ingredients: [[wood, 4], [Block.Wire, 1]] },
  { id: "relay", result: Block.Relay, count: 1, ingredients: [[stone, 1], [Block.Wire, 2]] },
  { id: "ram", result: Block.Piston, count: 1, ingredients: [[wood, 2], [stone, 1], [copper, 1]], bench: true },
  { id: "plate", result: Block.Plate, count: 1, ingredients: [[wood, 2], [Block.Wire, 1]] },
  { id: "inverter", result: Block.Inverter, count: 1, ingredients: [[Block.Glowstone, 1], [Block.Wire, 2]] },
  { id: "sensor", result: Block.Sensor, count: 1, ingredients: [[Block.Glass, 1], [Block.Wire, 2]] },
  { id: "underdeep", result: Block.RiftGate, count: 1, ingredients: [[stone, 4], [Block.Glowstone, 1]], bench: true },
  { id: "skyreach", result: Block.SkyGate, count: 1, ingredients: [[Block.Basalt, 4], [Block.Crystal, 2]], bench: true },
  { id: "tonic", result: Item.TrailTonic, count: 1, ingredients: [[Item.Ration, 1], [Block.Crystal, 1], [Block.Glass, 1]], bench: true },
  { id: "coat", result: Item.GuardCoat, count: 1, ingredients: [[copper, 4], [Item.AmberShard, 1]], bench: true },
];

export interface Stack { id: number; count: number; durability?: number; tempered?: boolean }

import { blockDescriptions, itemDescriptions } from "./encyclopedia";
import { BLOCKS } from "../world/blocks";

export type Station = "quick" | "workbench" | "kiln" | "smelter" | "stove";
export type Processor = Exclude<Station, "quick" | "workbench">;
export type Group = "Block" | "Harvested" | "Processed" | "Food" | "Tool" | "Equipment";
export interface Stack {
  id: string;
  count: number;
  variant?: string;
  durability?: number;
  fill?: number;
  vitality?: number;
}
export interface ItemDef {
  id: string;
  title: string;
  group: Group;
  description: string;
  limit: number;
  block?: string;
  durability?: number;
  tier?: number;
  speed?: number;
  heal?: number;
  equip?: "clothing" | "equipment";
}
export interface Recipe {
  id: string;
  station: Station;
  ingredients: { ids: string[]; count: number }[];
  output: Stack;
  ticks: number;
}

export const titleOf = (id: string) =>
  id
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
const itemGroups: Record<Exclude<Group, "Block">, string> = {
  Harvested:
    "slate_rubble basalt_rubble clay_lump brush_fiber reed_fiber kelp_frond fungus_cap salt_flake grain grain_seed alder_seed pine_seed raw_tin raw_copper raw_iron glow_quartz amber_resin hide egg tide_shell",
  Processed:
    "cord charcoal fired_clay quicklime tin_ingot copper_ingot iron_ingot copper_spool gear bearing glass_sheet dry_plank oil survey_kit sling_pellet",
  Food: "flatbread kelp_stew roasted_fungus salted_egg",
  Tool: "stone_hammer metal_hammer reinforced_hammer hand_saw trowel brush_knife field_hoe scoop sling",
  Equipment:
    "rain_cape insulated_coat rope_line hand_glider empty_flask water_flask brine_flask fish_flask skiff",
};
const tuning: Record<string, Partial<ItemDef>> = {
  stone_hammer: { tier: 1, speed: 1.6, durability: 100 },
  metal_hammer: { tier: 2, speed: 2.4, durability: 230 },
  reinforced_hammer: { tier: 3, speed: 3.2, durability: 450 },
  hand_saw: { speed: 2.7, durability: 160 },
  trowel: { speed: 2.4, durability: 140 },
  brush_knife: { durability: 100 },
  field_hoe: { durability: 120 },
  scoop: { durability: 120 },
  sling: { durability: 160 },
  flatbread: { heal: 12 },
  kelp_stew: { heal: 25 },
  roasted_fungus: { heal: 8 },
  salted_egg: { heal: 15 },
  rain_cape: { equip: "clothing" },
  insulated_coat: { equip: "clothing" },
  rope_line: { equip: "equipment" },
  hand_glider: { equip: "equipment", durability: 300 },
  empty_flask: { limit: 16 },
  clay_lump: { block: "red_clay" },
};
export const ITEMS: Record<string, ItemDef> = Object.create(null);
for (const [id, description] of Object.entries(blockDescriptions)) {
  if (["air", "foundation", "grain_crop", "recovery_crate", "geothermal_grate"].includes(id)) continue;
  ITEMS[id] = { id, title: titleOf(id), description, limit: 48, group: "Block", block: id };
}
for (const [group, ids] of Object.entries(itemGroups) as [Exclude<Group, "Block">, string][]) {
  for (const id of ids.split(" ")) {
    const limit = { Harvested: 64, Processed: 48, Food: 16, Tool: 1, Equipment: 1 }[group];
    ITEMS[id] = {
      id,
      title: titleOf(id),
      group,
      description: itemDescriptions[id as keyof typeof itemDescriptions],
      limit,
      ...tuning[id],
    };
  }
}
export function makeStack(id: string, count = 1, variant?: string): Stack {
  const item = ITEMS[id];
  if (!item) throw new Error("Unknown item " + id);
  const stack: Stack = { id, count };
  if (item.durability) stack.durability = item.durability;
  if (variant) stack.variant = variant;
  if (id === "water_flask" || id === "brine_flask") stack.fill = 8;
  return stack;
}
export function miningRate(blockId: string, toolId?: string) {
  const rock = /^(slate|basalt|ore_|quartz_|geothermal_|kiln|smelter)/.test(blockId);
  if (toolId?.endsWith("_hammer") && rock) return ITEMS[toolId]?.speed ?? 1;
  if (toolId === "hand_saw" && /log|panel|fence|ladder|gate|drawer|workbench/.test(blockId)) return 2.7;
  if (toolId === "trowel" && /loam|clay|sand|peat|gravel|snow/.test(blockId)) return 2.4;
  return rock ? 0.45 : 1;
}
export function canHarvest(blockId: string, toolId?: string) {
  const block = BLOCKS[blockId];
  return Boolean(block) && (ITEMS[toolId ?? ""]?.tier ?? 0) >= block.tier;
}

import { makeStack, type Stack } from "./catalog";
import { roll, type Pos } from "./worldTypes";
export type Landmark = "survey_station" | "tide_mill" | "collapsed_quarry" | "crystal_observatory";
const supplies: Record<Landmark, { fixed: [string, number][]; bonus: [string, number, number][] }> = {
  survey_station: {
    fixed: [
      ["cord", 2],
      ["dry_plank", 2],
    ],
    bonus: [
      ["slate_rubble", 6, 5],
      ["water_flask", 1, 3],
      ["survey_kit", 1, 1],
    ],
  },
  tide_mill: {
    fixed: [
      ["dry_plank", 2],
      ["wire", 4],
    ],
    bonus: [
      ["bearing", 1, 3],
      ["fired_clay", 2, 4],
      ["copper_spool", 1, 2],
    ],
  },
  collapsed_quarry: {
    fixed: [["basalt_rubble", 8]],
    bonus: [
      ["raw_tin", 2, 4],
      ["raw_copper", 2, 4],
      ["iron_ingot", 1, 1],
    ],
  },
  crystal_observatory: {
    fixed: [["glow_quartz", 2]],
    bonus: [
      ["sensor", 1, 2],
      ["relay", 1, 3],
      ["iron_ingot", 1, 4],
    ],
  },
};
export function landmarkStock(landmark: Landmark, seed: string, anchor: Pos): (Stack | null)[] {
  const { fixed, bonus } = supplies[landmark],
    slots: (Stack | null)[] = fixed.map(([id, n]) => makeStack(id, n));
  let pick =
    roll(seed + "-stock-" + landmark, anchor.x, anchor.y, anchor.z) * bonus.reduce((sum, b) => sum + b[2], 0);
  for (const [id, n, weight] of bonus) {
    pick -= weight;
    if (pick < 0) {
      slots.push(makeStack(id, n));
      break;
    }
  }
  while (slots.length < 24) slots.push(null);
  return slots;
}

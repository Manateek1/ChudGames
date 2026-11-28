import { clamp } from "../../engine/math";

export const stations = [
  {
    id: "grass",
    name: "Grass carp",
    cost: 35,
    detail: "Bank grass grows your first crop. Leftover feed nourishes the algae.",
  },
  {
    id: "silver",
    name: "Silver carp",
    cost: 65,
    detail: "Filter the algae bloom into a second crop of fish.",
  },
  {
    id: "bighead",
    name: "Bighead carp",
    cost: 150,
    detail: "Graze the water fleas that thrive on pond algae.",
  },
  {
    id: "common",
    name: "Common carp",
    cost: 320,
    detail: "Forage in bottom silt and stir nutrients back into the pond.",
  },
  {
    id: "ducks",
    name: "Duck house",
    cost: 650,
    detail: "Sell eggs. Duck manure feeds the bloom and spilled grain feeds carp.",
  },
  {
    id: "nursery",
    name: "Four-inch nursery",
    cost: 900,
    detail: "Raise fingerlings to four inches before release, safe from hungry ducks.",
  },
  {
    id: "wheel",
    name: "Paddle wheel",
    cost: 1450,
    detail: "Aerate the pond at night. Higher levels protect larger schools.",
  },
  {
    id: "dike",
    name: "Mulberry dike",
    cost: 2400,
    detail: "Dredged silt feeds mulberries. Leaves feed silkworms, whose litter returns to the pond.",
  },
] as const;
export type Station = (typeof stations)[number]["id"];
type Levels = Record<Station, number>;
export const MAX_LEVEL = 5;
export const DAY = 144;
export const OFFLINE_CAP = 4 * 3600;
export const SAVE_KEY = "chudgames.mulberry-pond.v1";
export type Manure = 0 | 1 | 2;
export interface Farm {
  levels: Levels;
  coins: number;
  sales: number;
  time: number;
  algae: number;
  fleas: number;
  silt: number;
  oxygen: number;
  compost: number;
  manure: Manure;
  fed: number;
  harvest: number;
  silk: number;
  seasons: number;
}

export const newFarm = (): Farm => ({
  levels: { grass: 1, silver: 0, bighead: 0, common: 0, ducks: 0, nursery: 0, wheel: 0, dike: 0 },
  coins: 65,
  sales: 0,
  time: 0,
  algae: 44,
  fleas: 30,
  silt: 12,
  oxygen: 86,
  compost: 0,
  manure: 1,
  fed: 0,
  harvest: 0,
  silk: 0,
  seasons: 0,
});
export const night = (f: Farm) => f.time % DAY >= DAY * 0.58;
export const clarity = (f: Farm) => Math.round(26 - f.algae * 0.24);
export function price(f: Farm, index: number) {
  const s = stations[index];
  return Math.ceil(s.cost * 1.85 ** f.levels[s.id]);
}
export function unlocked(f: Farm, i: number) {
  return i === 0 || f.levels[stations[i - 1].id] > 0;
}
export function saleRate(f: Farm) {
  const l = f.levels;
  const oxygenFactor = 0.4 + 0.6 * Math.min(1, f.oxygen / 60);
  const survival = l.ducks && !l.nursery ? 0.75 : 1;
  const fish =
    2 * l.grass +
    l.silver * (1 + f.algae / 18) +
    l.bighead * (2 + f.fleas / 10) +
    l.common * (4 + f.silt / 12);
  const fishSales = fish * oxygenFactor * survival * (f.fed ? 1.7 : 1) * (1 + 0.08 * l.nursery);
  return (fishSales + 6 * l.ducks + (f.compost > 0 ? 10 * l.dike : 0)) * (1 + 0.2 * f.seasons);
}
export const orderSize = (f: Farm) => 24 + 8 * Object.values(f.levels).reduce((sum, level) => sum + level, 0);
export const harvestValue = (f: Farm) =>
  Math.floor(f.harvest) + (f.harvest >= orderSize(f) ? Math.floor(orderSize(f) / 2) : 0);
export type Action =
  | { type: "buy"; index: number }
  | { type: "manure"; value: Manure }
  | { type: "feed" | "ship" | "dredge" | "fair" };
export const fairReady = (f: Farm) => f.levels.dike > 0 && f.silk >= 40 && f.coins >= 3000;
export function act(f: Farm, a: Action): Farm {
  switch (a.type) {
    case "buy": {
      const s = stations[a.index];
      if (!s || !unlocked(f, a.index) || f.levels[s.id] >= MAX_LEVEL || f.coins < price(f, a.index)) return f;
      return {
        ...f,
        coins: f.coins - price(f, a.index),
        levels: { ...f.levels, [s.id]: f.levels[s.id] + 1 },
      };
    }
    case "feed":
      return f.fed > 0 ? f : { ...f, fed: 12 };
    case "ship": {
      const bonus = harvestValue(f);
      return bonus < 1
        ? f
        : {
            ...f,
            coins: f.coins + bonus,
            sales: f.sales + bonus,
            harvest: f.harvest - Math.floor(f.harvest),
          };
    }
    case "manure":
      return f.levels.ducks ? { ...f, manure: a.value } : f;
    case "dredge":
      return f.silt < 20 ? f : { ...f, silt: 5, compost: Math.min(100, f.compost + f.silt - 5) };
    case "fair":
      return fairReady(f) ? { ...newFarm(), seasons: f.seasons + 1 } : f;
  }
}

// One-second steps keep active and offline production identical across day boundaries.
export function advance(farm: Farm, seconds: number): Farm {
  const steps = Number.isFinite(seconds) ? clamp(Math.floor(seconds), 0, OFFLINE_CAP) : 0;
  if (!steps) return farm;
  const f = { ...farm };
  const l = f.levels;
  for (let i = 0; i < steps; i++) {
    const dark = night(f);
    const cloudy = Math.floor(f.time / DAY) % 3 === 2;
    const worms = l.dike > 0 && f.compost > 0;
    const bloom = 44 + l.grass * 4 + l.ducks * f.manure * 9 - l.silver * 6 + l.common * 1.5 + (worms ? 6 : 0);
    f.algae = clamp(f.algae + (bloom - f.algae) * 0.024, 3, 98);
    f.fleas = clamp(f.fleas + (f.algae * 0.85 - l.bighead * 4 - f.fleas) * 0.035, 2, 98);
    f.silt = clamp(f.silt + 0.11 * l.grass + 0.05 * l.ducks * f.manure - 0.07 * l.common, 0, 100);
    const demand = 0.14 + f.algae * 0.005 + f.silt * 0.003 + (cloudy ? 0.36 : 0);
    f.oxygen = clamp(
      f.oxygen + (dark ? -demand + l.wheel * 0.95 : (cloudy ? 0.52 : 0.92) - f.silt * 0.002),
      8,
      100,
    );
    if (worms) {
      f.silk += 0.45 * l.dike;
      f.compost = Math.max(0, f.compost - 0.13 * l.dike);
    }
    const income = saleRate(f);
    f.coins += income;
    f.sales += income;
    f.harvest = Math.min(500 * (1 + l.common + l.dike), f.harvest + income * 0.24);
    f.fed = Math.max(0, f.fed - 1);
    f.time++;
  }
  return f;
}

export function encode(farm: Farm, at: number) {
  return JSON.stringify({ version: 1, at, farm });
}
export function restore(raw: string | null, now: number) {
  const fresh = () => ({ farm: newFarm(), away: 0 });
  try {
    const data = JSON.parse(raw ?? "null");
    if (data?.version !== 1 || !Number.isFinite(data.at) || !data.farm) return fresh();
    const f = data.farm as Farm;
    const numbers = Object.keys(newFarm()).filter((k) => k !== "levels") as Exclude<keyof Farm, "levels">[];
    if (numbers.some((k) => !Number.isFinite(f[k]) || f[k] < 0 || f[k] > Number.MAX_SAFE_INTEGER))
      return fresh();
    if (
      ![0, 1, 2].includes(f.manure) ||
      !Number.isInteger(f.time) ||
      !Number.isInteger(f.seasons) ||
      [f.algae, f.fleas, f.silt, f.oxygen, f.compost].some((x) => x > 100) ||
      f.fed > 12
    )
      return fresh();
    if (
      stations.some(
        ({ id }, i) =>
          !Number.isInteger(f.levels[id]) ||
          f.levels[id] < 0 ||
          f.levels[id] > MAX_LEVEL ||
          (f.levels[id] > 0 && !unlocked(f, i)),
      ) ||
      !f.levels.grass
    )
      return fresh();
    const elapsed = Math.min(OFFLINE_CAP, Math.max(0, Math.floor((now - data.at) / 1000)));
    const farm = advance(f, elapsed);
    return { farm, away: elapsed >= 60 ? Math.floor(farm.sales - f.sales) : 0 };
  } catch {
    return fresh();
  }
}

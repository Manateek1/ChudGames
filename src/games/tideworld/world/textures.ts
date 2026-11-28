import { isMasonryStep, masonryMaterial } from "./shapes";
import { BLOCK_IDS, BLOCKS, BLOCK_CODE } from "./blocks";
export const TILE = 24;
export const WATER_LAYER = BLOCK_IDS.length * 3;
export const GLAZES: Record<string, string> = {
  cream: "#e3d6b3",
  ochre: "#c99a50",
  copper: "#bb8056",
  red: "#b86558",
  plum: "#956d8a",
  indigo: "#727d9e",
  teal: "#5a9992",
  charcoal: "#51525c",
};
export const GLAZE_IDS = Object.keys(GLAZES);
const regional = [
  { id: "peat", color: "#537d70" },
  { id: "reed", color: "#77ab90" },
  { id: "foliage", color: "#3d6258" },
  { id: "snow_crust", color: "#e9e7d7" },
  { id: "water", color: "#4d7192" },
  { id: "foliage", color: "#507665" },
  { id: "water", color: "#538890" },
  { id: "lamp", color: "#7b7e79" },
  { id: "timber_panel", color: "#80664e" },
];
const regionStart = WATER_LAYER + 1 + GLAZE_IDS.length;
const rgb = (hex: string) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const salt = (x: number, z: number, seed: number) => {
  let n = Math.imul(x + 37, 73856093) ^ Math.imul(z + 11, 19349663) ^ Math.imul(seed + 3, 83492791);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
};
export function textureIndex(id: string, side: number, variant: string | undefined, biome?: string) {
  if (isMasonryStep(id)) id = masonryMaterial(variant);
  if (id === "timber_panel" && variant === "pine") return regionStart + 8;
  if (id === "peat" && biome === "lantern_fen") return regionStart;
  if (id === "reed" && biome === "lantern_fen") return regionStart + 1;
  if (id === "foliage" && ["frost_crown", "frostwood", "wind_ridge"].includes(biome ?? ""))
    return regionStart + 2;
  if (id === "snow_crust" && side === 2) return regionStart + 3;
  if (id === "water" && biome === "lantern_fen") return regionStart + 4;
  if (id === "foliage" && biome === "lantern_fen") return regionStart + 5;
  if (id === "water" && biome === "brine_bay") return regionStart + 6;
  if (id === "lamp" && variant === "off") return regionStart + 7;
  if (id === "water") return WATER_LAYER;
  if (id === "clay_tile" && variant && GLAZE_IDS.includes(variant))
    return WATER_LAYER + 1 + GLAZE_IDS.indexOf(variant);
  return (BLOCK_CODE[id] ?? 0) * 3 + (side === 2 ? 0 : side === 3 ? 2 : 1);
}
export function texturePixels() {
  const layers = regionStart + regional.length,
    data = new Uint8Array(TILE * TILE * 4 * layers);
  for (let layer = 0; layer < layers; layer++) {
    const special = regional[layer - regionStart];
    const id =
      special?.id ??
      (layer < WATER_LAYER
        ? BLOCK_IDS[Math.floor(layer / 3)]
        : layer === WATER_LAYER
          ? "water"
          : "clay_tile");
    const side = layer % 3,
      def = BLOCKS[id],
      base = rgb(
        special?.color ??
          (id === "water"
            ? "#638c9d"
            : layer > WATER_LAYER
              ? GLAZES[GLAZE_IDS[layer - WATER_LAYER - 1]]
              : def.color),
      );
    const stone = id.startsWith("ore_") || id === "slate" || id === "basalt" || id === "foundation";
    const wood =
      id.endsWith("_log") ||
      id === "timber_panel" ||
      id === "workbench" ||
      id.includes("drawer") ||
      id.includes("crate") ||
      id === "marker_stand";
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const i = ((layer * TILE + y) * TILE + x) * 4,
          n = salt(x, y, layer),
          cluster = salt(x >> 1, y >> 1, layer) % 11;
        let tone = 1,
          alpha = 255,
          pigment = base;
        if (wood) {
          const rings = Math.max(Math.abs(x - 10), Math.abs(y - 13));
          tone =
            id.endsWith("_log") && side === 0
              ? rings % 4 === 0
                ? 0.75
                : 1.08
              : (x + Math.floor(2 * Math.sin(y * 0.21 + x * 0.24))) % 7 < 2
                ? 0.73
                : cluster < 3
                  ? 0.9
                  : 1.06;
          if (
            (id === "workbench" || id === "storage_drawer" || id === "recovery_crate") &&
            side === 1 &&
            (y % 11 === 0 || x === 1 || x === 22)
          )
            tone = 0.56;
        } else if (stone) {
          if (id.startsWith("ore_")) {
            const speck =
              (x - 7) ** 2 + (y - 13) ** 2 < 6 ||
              (x - 16) ** 2 + (y - 5) ** 2 < 4 ||
              (x - 18) ** 2 + (y - 19) ** 2 < 6;
            pigment = speck ? base : [106, 116, 125];
            tone = speck ? (n % 3 === 0 ? 1.3 : 1.08) : cluster < 2 ? 0.84 : 1;
          } else tone = cluster < 2 ? 0.77 : cluster > 8 ? 1.13 : y === ((x >> 2) + 8) % 24 ? 0.79 : 1;
        } else if (id === "loam" && side !== 0) {
          pigment = side === 2 || y < 16 + (salt(x >> 1, 2, 0) % 5) ? [131, 100, 75] : base;
          tone = cluster < 3 ? 0.82 : 1;
        } else if (id === "foliage") {
          tone = cluster < 3 ? 0.69 : cluster > 7 ? 1.15 : 0.91;
          if (cluster === 0 && n % 5 === 0) alpha = 0;
          if (layer === regionStart + 2) {
            tone = (x + Math.floor(y * 0.5)) % 7 === 0 ? 0.68 : cluster < 2 ? 0.85 : 1.04;
            if (y === 21 && cluster > 6) pigment = [162, 186, 167];
          }
        } else if (
          id === "brush" ||
          id === "reed" ||
          id === "kelp" ||
          id === "grain_crop" ||
          id === "fungus"
        ) {
          const stem =
            (x >= 10 && x <= 12) || x === 6 + Math.floor(y * 0.16) || x === 18 - Math.floor(y * 0.19);
          const leaf = (y + Math.floor(x * 0.7)) % 10 < 3 && Math.abs(x - 11) < 9;
          if (id === "fungus") {
            if (
              !(
                (y > 8 && y < 15 && Math.abs(x - 12) < 10 - Math.abs(y - 10)) ||
                (y <= 9 && Math.abs(x - 12) < 2)
              )
            )
              alpha = 0;
          } else if (!stem && !leaf) alpha = 0;
          if (id === "reed" && y > 15 && Math.abs(x - 11) < 4) {
            pigment = [229, 188, 91];
            alpha = 255;
          }
          if (id === "reed" && y < 8 && Math.abs(x - 11) < 2) alpha = 255;
          tone = cluster > 6 ? 1.2 : 0.86;
        } else if (
          id.includes("brick") ||
          id === "clay_tile" ||
          id === "kiln" ||
          id === "smelter" ||
          id === "stove"
        ) {
          const joint = y % 8 === 0 || (x + 8 * (Math.floor(y / 8) % 2)) % 16 === 0;
          tone = joint ? 0.65 : cluster < 3 ? 0.89 : 1.02;
          if (["kiln", "smelter", "stove"].includes(id) && side === 1 && x > 4 && x < 19 && y > 3 && y < 12)
            pigment = y < 7 ? [188, 107, 62] : [63, 61, 63];
        } else if (id === "glass_panel") {
          alpha = (x + y) % 18 === 0 ? 175 : 90;
          tone = (x + y) % 18 < 2 ? 1.15 : 1;
        } else if (id === "snow_crust") {
          tone = cluster < 2 ? 0.945 : cluster > 8 ? 1.018 : 1;
        } else if (id === "peat" && layer === regionStart) {
          tone = cluster < 2 ? 0.84 : 1;
          if (x % 11 === 0 && y % 8 < 3) pigment = [164, 157, 97];
        } else if (id === "water") {
          tone = (y + Math.floor(Math.sin(x * 0.32) * 1.6)) % 11 === 0 && x % 9 > 2 ? 1.12 : 1;
          alpha = 170;
        } else if (
          ["lamp", "pump", "timer", "switch", "sensor", "relay", "geothermal_grate", "wire"].includes(id)
        ) {
          const frame = x < 2 || x > 21 || y < 2 || y > 21;
          tone = frame ? 0.63 : cluster < 3 ? 0.9 : 1.07;
          if (!frame && id === "geothermal_grate" && x % 5 < 2) pigment = [219, 137, 74];
          if (id === "lamp" && (x % 11 === 0 || y % 11 === 0)) pigment = [100, 89, 72];
          if (
            ["pump", "timer", "sensor", "relay"].includes(id) &&
            side === 1 &&
            x > 5 &&
            x < 19 &&
            y > 6 &&
            y < 16
          )
            pigment = [73, 97, 96];
        } else {
          tone = cluster < 2 ? 0.84 : cluster > 8 ? 1.1 : 1;
          if (id === "plant_bed" && x % 5 < 2) tone *= 0.72;
        }
        if (n % 29 === 0) tone *= 1.08;
        data[i] = Math.min(255, pigment[0] * tone);
        data[i + 1] = Math.min(255, pigment[1] * tone);
        data[i + 2] = Math.min(255, pigment[2] * tone);
        data[i + 3] = alpha;
      }
  }
  return { data, layers };
}

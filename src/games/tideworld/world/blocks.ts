/** Generator and save IDs are permanent. A box is expressed in local cell coordinates. */
export type Box = readonly [number, number, number, number, number, number];
export const cube: Box = [0, 0, 0, 1, 1, 1];
type Shape =
  | "cube"
  | "plant"
  | "stalk"
  | "slab"
  | "step"
  | "pane"
  | "fence"
  | "plate"
  | "ladder"
  | "cot"
  | "post"
  | "crystal"
  | "thin"
  | "wheel"
  | "lever"
  | "bench"
  | "pump"
  | "lantern";
export interface BlockDef {
  id: string;
  title: string;
  work: number;
  tier: number;
  drop: string;
  color: string;
  solid: boolean;
  opaque: boolean;
  shape: Shape;
  boxes: readonly Box[];
}
const shapes: Record<Shape, readonly Box[]> = {
  cube: [cube],
  plant: [[0.12, 0, 0.12, 0.88, 0.77, 0.88]],
  stalk: [
    [0.31, 0, 0.35, 0.45, 0.97, 0.49],
    [0.55, 0, 0.48, 0.69, 0.79, 0.62],
  ],
  slab: [[0, 0, 0, 1, 0.5, 1]],
  step: [
    [0, 0, 0, 1, 0.5, 1],
    [0, 0.5, 0, 1, 1, 0.5],
  ],
  pane: [[0, 0, 0.44, 1, 1, 0.56]],
  fence: [[0.36, 0, 0.36, 0.64, 1, 0.64]],
  plate: [[0.15, 0, 0.15, 0.85, 0.13, 0.85]],
  ladder: [
    [0.09, 0, 0.86, 0.2, 1, 1],
    [0.8, 0, 0.86, 0.91, 1, 1],
    [0.2, 0.16, 0.87, 0.8, 0.28, 0.98],
    [0.2, 0.65, 0.87, 0.8, 0.77, 0.98],
  ],
  cot: [[0.04, 0.11, 0.02, 0.96, 0.52, 0.98]],
  post: [
    [0.33, 0, 0.33, 0.67, 0.83, 0.67],
    [0.13, 0.74, 0.17, 0.87, 1, 0.83],
  ],
  crystal: [
    [0.15, 0, 0.19, 0.38, 0.55, 0.44],
    [0.42, 0, 0.33, 0.67, 0.91, 0.6],
    [0.64, 0, 0.56, 0.87, 0.42, 0.83],
  ],
  thin: [[0, 0, 0, 1, 0.125, 1]],
  wheel: [
    [0.04, 0.24, 0.35, 0.21, 0.76, 0.65],
    [0.79, 0.24, 0.35, 0.96, 0.76, 0.65],
    [0.21, 0.07, 0.35, 0.79, 0.23, 0.65],
    [0.21, 0.77, 0.35, 0.79, 0.93, 0.65],
    [0.08, 0.44, 0.42, 0.92, 0.56, 0.58],
    [0.44, 0.1, 0.42, 0.56, 0.9, 0.58],
    [0.38, 0.38, 0.12, 0.62, 0.62, 0.87],
  ],
  lever: [
    [0.12, 0, 0.16, 0.88, 0.15, 0.84],
    [0.42, 0.15, 0.38, 0.58, 0.62, 0.56],
    [0.33, 0.54, 0.32, 0.67, 0.68, 0.61],
  ],
  bench: [
    [0, 0.75, 0, 1, 1, 1],
    [0.06, 0, 0.06, 0.22, 0.75, 0.22],
    [0.78, 0, 0.06, 0.94, 0.75, 0.22],
    [0.06, 0, 0.78, 0.22, 0.75, 0.94],
    [0.78, 0, 0.78, 0.94, 0.75, 0.94],
    [0.08, 0.25, 0.1, 0.92, 0.38, 0.9],
  ],
  pump: [
    [0.12, 0.05, 0.12, 0.88, 0.82, 0.88],
    [0.28, 0.2, 0, 0.72, 0.63, 1],
    [0.36, 0.82, 0.37, 0.64, 1, 0.63],
  ],
  lantern: [
    [0.15, 0.08, 0.15, 0.85, 0.21, 0.85],
    [0.23, 0.21, 0.23, 0.77, 0.84, 0.77],
    [0.15, 0.84, 0.15, 0.85, 0.96, 0.85],
  ],
};
type Row = [string, number, string, Shape?, number?, string?];
const rows: Row[] = [
  ["air", Infinity, "#c0dad5"],
  ["foundation", Infinity, "#41414b"],
  ["loam", 0.5, "#879760"],
  ["peat", 0.6, "#675448"],
  ["sand", 0.5, "#dcc59b"],
  ["gravel", 0.6, "#9f9b93"],
  ["red_clay", 0.7, "#b8785d", "cube", 0, "clay_lump"],
  ["snow_crust", 0.2, "#e8e5d8", "thin"],
  ["salt_crust", 0.4, "#d8cfc4", "thin", 0, "salt_flake"],
  ["slate", 2, "#747f88", "cube", 1, "slate_rubble"],
  ["basalt", 2.7, "#484a55", "cube", 1, "basalt_rubble"],
  ["ore_tin", 2.1, "#c6cccc", "cube", 1, "raw_tin"],
  ["ore_copper", 2.3, "#bb825b", "cube", 1, "raw_copper"],
  ["ore_iron", 3.2, "#ceb598", "cube", 2, "raw_iron"],
  ["quartz_cluster", 1.8, "#e4cc88", "crystal", 2, "glow_quartz"],
  ["alder_log", 1.6, "#85644e"],
  ["pine_log", 1.8, "#665548"],
  ["foliage", 0.3, "#5b895f", "cube", 0, "alder_seed"],
  ["brush", 0.2, "#b4aa73", "plant", 0, "brush_fiber"],
  ["reed", 0.3, "#b1b36a", "stalk", 0, "reed_fiber"],
  ["kelp", 0.3, "#4b8277", "stalk", 0, "kelp_frond"],
  ["fungus", 0.2, "#c98460", "plant", 0, "fungus_cap"],
  ["grain_crop", 0.2, "#d2b16a", "stalk", 0, "grain_seed"],
  ["plant_bed", 0.5, "#705940", "cube", 0, "loam"],
  ["timber_panel", 1.1, "#a37e56"],
  ["slate_brick", 2.4, "#7c8993"],
  ["basalt_brick", 3, "#535769"],
  ["clay_tile", 1.1, "#b97c61"],
  ["glass_panel", 0.4, "#9ad6cf", "pane"],
  ["half_step", 1.5, "#88939b", "slab"],
  ["stair_step", 1.5, "#88939b", "step"],
  ["fence_section", 1, "#ab8155", "fence"],
  ["gate", 1, "#936f50", "pane"],
  ["ladder", 0.5, "#c5985f", "ladder"],
  ["anchor", 1.8, "#696e72", "post"],
  ["marker_stand", 1, "#bd8c55", "post"],
  ["camp_cot", 0.6, "#6e9b94", "cot"],
  ["workbench", 1.2, "#b08456", "bench"],
  ["kiln", 2.2, "#a66950"],
  ["smelter", 2.6, "#686875"],
  ["stove", 1.7, "#79584a"],
  ["storage_drawer", 1.1, "#a37d55"],
  ["recovery_crate", 0.8, "#ac9167"],
  ["lamp", 0.8, "#f3c975", "lantern"],
  ["switch", 0.5, "#bba26c", "lever"],
  ["wire", 0.3, "#b3724d", "plate"],
  ["relay", 0.6, "#8ca393", "plate"],
  ["timer", 0.6, "#b09667", "plate"],
  ["sensor", 0.8, "#669c98", "plate"],
  ["pump", 2, "#638b88", "pump"],
  ["water_wheel", 1.6, "#97724b", "wheel"],
  ["sluice", 1.4, "#78918b", "pane"],
  ["lift_platform", 2.2, "#a68e68", "slab"],
  ["geothermal_grate", 3.6, "#b97153", "cube", 3, "basalt_rubble"],
];
export const BLOCKS: Record<string, BlockDef> = Object.fromEntries(
  rows.map(([id, work, color, shape = "cube", tier = 0, drop = id]) => {
    const solid = ![
      "air",
      "foliage",
      "brush",
      "reed",
      "kelp",
      "fungus",
      "grain_crop",
      "ladder",
      "wire",
    ].includes(id);
    return [
      id,
      Object.freeze({
        id,
        title: id.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()),
        work,
        color,
        shape,
        tier,
        drop,
        solid,
        opaque: solid && shape === "cube",
        boxes: id === "air" ? [] : shapes[shape],
      }),
    ];
  }),
);
export const BLOCK_IDS = Object.keys(BLOCKS);
export const BLOCK_CODE = Object.fromEntries(BLOCK_IDS.map((id, i) => [id, i])) as Record<string, number>;

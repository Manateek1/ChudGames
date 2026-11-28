import type { Face } from "../../systems/worldTypes";
import type { Expedition } from "../../expedition";
import type { Vec, VoxelWorld } from "../world";

/** Reproducible surface, long-view and dusk reference cameras for generator v1. */
export const fixtureSeed = "630217";
export type SceneId = "workshop" | "wetland" | "ridge";
export const fixtureAnchors: Record<SceneId, { x: number; z: number }> = {
  workshop: { x: 0, z: -8 },
  wetland: { x: 37566, z: -31645 },
  ridge: { x: 37974, z: -1447 },
};
export function buildFixtureWorkshop(game: Expedition) {
  const world = game.world,
    x0 = 0,
    z0 = -8,
    y = world.height(x0, z0) + 1;
  const put = (x: number, dy: number, z: number, id: string, facing: Face = 0) => {
    const p = { x: x0 + x, y: y + dy, z: z0 + z },
      before = world.get(p.x, p.y, p.z);
    if (before === id) return;
    world.set(p.x, p.y, p.z, id);
    game.ecology.onEdit(game.sys, p, before, id, game.tick, facing);
    if (id !== "air") world.setFacing(p.x, p.y, p.z, facing);
  };
  for (let x = -6; x <= 6; x++)
    for (let z = -5; z <= 4; z++) {
      for (let dy = world.height(x + x0, z + z0) - y; dy < 0; dy++) put(x, dy, z, "slate_brick");
      for (let dy = 0; dy <= 7; dy++) put(x, dy, z, "air");
      put(x, -1, z, "slate_brick");
      if ((Math.abs(x) === 6 || z === -5) && z !== 4) {
        for (let dy = 0; dy < 4; dy++)
          put(x, dy, z, dy === 0 ? "slate_brick" : dy === 2 && z % 3 !== 0 ? "glass_panel" : "timber_panel");
      }
      if (Math.abs(x) === 6 && (z === 4 || z === -5))
        for (let dy = 0; dy < 5; dy++) put(x, dy, z, "alder_log");
    }
  for (let x = -7; x <= 7; x++)
    for (let z = -6; z <= 5; z++) put(x, 4 + Math.floor((7 - Math.abs(x)) / 3), z, "clay_tile");
  for (const x of [-4, -2, 1, 3])
    put(x, 0, -3, x === -4 ? "workbench" : x === -2 ? "kiln" : x === 1 ? "smelter" : "storage_drawer");
  for (let x = -4; x <= 2; x++)
    for (let z = -1; z <= 2; z++) {
      put(x, 0, z, Math.abs(x + 1) === 3 || z === -1 || z === 2 ? "slate_brick" : "air");
      if (x > -4 && x < 2 && z >= 0 && z < 2)
        game.ecology.fluids.set(game.sys, { x, y, z: z0 + z }, { kind: "water", level: x < 0 ? 7 : 3 });
    }
  put(-3, 0, 0, "switch", 1);
  put(-2, 0, 0, "wire");
  put(-1, 0, 0, "pump", 1);
  put(-2, 0, -1, "lamp", 0);
  put(1, 0, 1, "water_wheel");
  const control = game.ecology.devices.at({ x: -3, y, z: z0 });
  if (control) control.enabled = true;
  for (let z = -4; z <= 3; z++)
    for (let x = 4; x <= 5; x++) {
      put(x, -1, z, "plant_bed");
      put(x, 0, z, "grain_crop");
      world.setVariant(x, y, z + z0, "age" + ((z + 5) % 5));
    }
  for (let i = 0; i < 30; i++) game.ecology.tick(game.sys, game.body, game.tick + i);
}
export function fixtureCamera(world: VoxelWorld, id: SceneId, kind: "surface" | "distance" | "dusk") {
  const a = fixtureAnchors[id],
    y = world.height(a.x, a.z);
  const offsets =
    id === "workshop"
      ? { near: [5.6, 2.1, 8.1], far: [12, 7.5, 18], look: [-0.9, 1.1, -0.8] }
      : id === "wetland"
        ? { near: [7, 2.7, 5.2], far: [18, 8.5, 16], look: [1, 1, -1] }
        : { near: [4, 3, 5], far: [15, 10, 18], look: [-7, 0, -9] };
  const [dx, dy, dz] = kind === "distance" ? offsets.far : offsets.near;
  const eye: Vec = {
    x: a.x + dx,
    y: Math.max(y + dy, world.height(Math.floor(a.x + dx), Math.floor(a.z + dz)) + 1.72),
    z: a.z + dz,
  };
  const [tx, ty, tz] = offsets.look,
    t = { x: a.x + tx - eye.x, y: y + ty - eye.y, z: a.z + tz - eye.z };
  return {
    eye,
    yaw: Math.atan2(-t.x, -t.z),
    pitch: Math.atan2(t.y, Math.hypot(t.x, t.z)),
    ticks: kind === "dusk" ? 26100 : 11400,
  };
}

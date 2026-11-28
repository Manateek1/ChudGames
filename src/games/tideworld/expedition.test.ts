import { describe, expect, it } from "vitest";
import { Expedition } from "./expedition";
import { cellKey } from "./expeditionData";
import { eye, newBody, type Point } from "./movement";

const idle = { forward: 0, right: 0, jump: false, squat: false, sprint: false };
function expedition(mode: "building" | "survival" = "survival") {
  return new Expedition({ info: { id: "fixture", seed: "12345", name: "Expedition fixtures", mode } });
}
function aimAt(game: Expedition, point: Point) {
  const camera = eye(game.body);
  const dx = point.x - camera.x,
    dy = point.y - camera.y,
    dz = point.z - camera.z;
  game.body.yaw = Math.atan2(-dx, -dz);
  game.body.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  game.hit();
}
function makePlatform(game: Expedition, y: number) {
  for (let x = -2; x <= 2; x++) for (let z = -4; z <= 4; z++) game.world.set(x, y - 1, z, "slate");
  game.body = newBody({ x: 0.5, y: y + 0.001, z: 3.5 });
}

describe("BuildBlox expedition transactions", () => {
  it.each([
    { half: "foot", playerZ: 3.5, blockZ: 0 },
    { half: "head", playerZ: -3.5, blockZ: -1 },
  ])("places a two-cell cot and returns one item when its $half is mined", ({ playerZ, blockZ }) => {
    const g = expedition(),
      y = 194;
    makePlatform(g, y);
    g.inventory.add("camp_cot");
    aimAt(g, { x: 0.5, y: y - 0.01, z: 0.5 });
    expect(g.target).toMatchObject({ id: "slate", x: 0, y: y - 1, z: 0, normal: { x: 0, y: 1, z: 0 } });
    g.place();

    expect(g.inventory.count("camp_cot")).toBe(0);
    expect(g.world.get(0, y, 0)).toBe("camp_cot");
    expect(g.world.get(0, y, -1)).toBe("camp_cot");
    expect(g.cotPartners[cellKey({ x: 0, y, z: 0 })]).toEqual({ x: 0, y, z: -1 });

    g.body = newBody({ x: 0.5, y: y + 0.001, z: playerZ });
    aimAt(g, { x: 0.5, y: y + 0.35, z: blockZ + 0.5 });
    expect(g.target).toMatchObject({ id: "camp_cot", x: 0, y, z: blockZ });
    for (let i = 0; i < 60 && g.world.get(0, y, -1) === "camp_cot"; i++) g.frame(idle, true);
    expect(g.world.get(0, y, 0)).toBe("air");
    expect(g.world.get(0, y, -1)).toBe("air");
    expect(g.inventory.count("camp_cot")).toBe(1);
    expect(g.cotPartners).toEqual({});
  });
  it("rejects a cot whose second cell is occupied without changing terrain, inventory or revision", () => {
    const g = expedition(),
      y = 194;
    makePlatform(g, y);
    g.world.set(0, y, -1, "slate_brick");
    g.inventory.add("camp_cot");
    aimAt(g, { x: 0.5, y: y - 0.01, z: 0.5 });
    const inventory = g.inventory.save(),
      edits = { ...g.world.edits },
      revision = g.revision;
    g.place();
    expect(g.notice).toMatch(/two clear, supported cells/);
    expect(g.inventory.save()).toEqual(inventory);
    expect(g.world.edits).toEqual(edits);
    expect(g.revision).toBe(revision);
    expect(g.cotPartners).toEqual({});
  });
  it("keeps belt and clothing through defeat and transfers unsecured pack contents once via the recovery crate", () => {
    const g = expedition();
    g.body = newBody({ x: 4.5, y: g.world.height(4, 0) + 1.001, z: 0.5 });
    g.inventory.add("stone_hammer");
    g.inventory.add("slate_brick", 8);
    expect(g.inventory.move(1, 7)).toBe(true);
    g.inventory.add("rain_cape");
    expect(g.inventory.equip(1)).toBe(true);
    const belt = g.inventory.save().slots[0];
    g.body.health = 0.05;
    g.body.warmth = 0;
    g.frame(idle, false);

    expect(g.body.health).toBe(0);
    expect(g.inventory.slots[0]).toEqual(belt);
    expect(g.inventory.slots[35]?.id).toBe("rain_cape");
    expect(g.inventory.count("slate_brick")).toBe(0);
    const crate = g.markers.find((m) => m.name === "Recovery crate")!;
    expect(crate).toBeDefined();
    const key = cellKey(crate);
    expect(g.world.get(crate.x, crate.y, crate.z)).toBe("recovery_crate");
    expect(g.drawers[key].expires).toBe(g.tick + 54000);
    expect(g.drawers[key].slots[0]).toEqual({ id: "slate_brick", count: 8 });

    g.respawn();
    expect(g.body.health).toBe(100);
    g.body = newBody({ x: crate.x + 0.5, y: crate.y + 0.001, z: crate.z + 2.4 });
    aimAt(g, { x: crate.x + 0.5, y: crate.y + 0.45, z: crate.z + 0.5 });
    expect(g.target?.id).toBe("recovery_crate");
    g.interact();
    g.transferDrawer(0, true);
    g.transferDrawer(0, true);
    expect(g.inventory.count("slate_brick")).toBe(8);
    expect(g.drawers[key]).toBeUndefined();
    expect(g.world.get(crate.x, crate.y, crate.z)).toBe("air");
    expect(g.markers).not.toContainEqual(crate);
  });
  it("leaves a clear respawn position when the player dies at camp with a populated pack", () => {
    const g = expedition();
    g.inventory.add("timber_panel", 2);
    expect(g.inventory.move(0, 7)).toBe(true);
    g.body.health = 0.05;
    g.body.warmth = 0;
    g.frame(idle, false);
    expect(g.body.health).toBe(0);
    expect(g.markers.some((m) => m.name === "Recovery crate")).toBe(true);
    g.respawn();
    const b = g.body;
    const atFeet = g.world.bounds(Math.floor(b.x), Math.floor(b.y), Math.floor(b.z));
    expect(atFeet).toHaveLength(0);
    const atHead = g.world.bounds(Math.floor(b.x), Math.floor(eye(b).y), Math.floor(b.z));
    expect(atHead).toHaveLength(0);
  });
  it("validates every selected cell before applying a cross-region fill and rejects stale previews", () => {
    const g = expedition("building"),
      a = { x: 255, y: 190, z: 0 },
      last = { x: 257, y: 190, z: 0 };
    g.planFill(a, last, "timber_panel");
    expect(g.preview?.cells).toHaveLength(3);
    g.world.set(last.x, last.y, last.z, "slate_brick");
    g.applyFill();
    expect(g.world.get(255, 190, 0)).toBe("air");
    expect(g.world.get(256, 190, 0)).toBe("air");
    expect(g.world.get(257, 190, 0)).toBe("slate_brick");
    expect(g.preview).toBeNull();
    g.change(last, "air");
    g.planFill(a, last, "timber_panel");
    g.change({ x: 258, y: 190, z: 0 }, "half_step");
    g.applyFill();
    expect(g.notice).toMatch(/Preview the selection again/);
    expect(g.world.get(255, 190, 0)).toBe("air");
    expect(g.world.get(256, 190, 0)).toBe("air");
    g.planFill(a, last, "timber_panel");
    g.applyFill();
    for (let x = a.x; x <= last.x; x++) expect(g.world.get(x, 190, 0)).toBe("timber_panel");
    const revision = g.revision;
    g.applyFill();
    expect(g.revision).toBe(revision);
  });
  it("detaches a wall-mounted ladder as one item when its backing is removed", () => {
    const g = expedition(),
      y = 194;
    makePlatform(g, y);
    g.change({ x: 0, y, z: 0 }, "slate_brick");
    g.inventory.add("ladder");
    aimAt(g, { x: 0.5, y: y + 0.5, z: 1 });
    g.place();
    expect(g.world.get(0, y, 1)).toBe("ladder");
    expect(g.inventory.count("ladder")).toBe(0);
    g.change({ x: 0, y, z: 0 }, "air");
    expect(g.world.get(0, y, 1)).toBe("air");
    expect(g.pickups.filter((p) => p.stack.id === "ladder").map((p) => p.stack.count)).toEqual([1]);
  });
  it("samples real drawer contents and holds a closing gate open while a player occupies it", () => {
    const g = expedition("building"),
      y = 194;
    makePlatform(g, y);
    const sensor = { x: 0, y, z: 0 },
      store = { x: 0, y, z: 1 },
      gate = { x: 1, y, z: 0 };
    g.change(sensor, "sensor");
    g.change(store, "storage_drawer");
    g.change(gate, "gate");
    g.drawers[cellKey(store)] = { slots: [{ id: "cord", count: 4 }] };
    g.ecology.devices.configure(sensor, { face: 0, sense: "container", threshold: 3 });
    g.body = newBody({ x: 1.5, y: y + 0.01, z: 0.5 });
    const door = g.ecology.devices.at(gate)!;
    door.high = true;
    door.enabled = false;
    g.ecology.tick(g.sys, g.body, g.tick);
    expect(g.ecology.devices.at(sensor)?.high).toBe(true);
    expect(door.high).toBe(true);
    g.body.x = 3.5;
    g.drawers[cellKey(store)].slots = [];
    g.ecology.tick(g.sys, g.body, g.tick + 1);
    expect(door.high).toBe(false);
    expect(g.ecology.devices.at(sensor)?.high).toBe(false);
  });
});

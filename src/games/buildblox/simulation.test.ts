import { describe, expect, it } from "vitest";
import { Block, Item, stateOf, withState } from "./blocks";
import { Circuits, pointKey } from "./circuits";
import { matchGrid } from "./inventory";
import type { ClientMessage, Controls, HudState, SaveData, ServerMessage } from "./protocol";
import { Simulation } from "./simulation";
import { moveAxis, raycastVoxel } from "./spatial";
import type { Position } from "./spatial";

const still: Controls = { forward: 0, strafe: 0, jump: false, sprint: false, descend: false, mine: false, yaw: 0, pitch: 0 };

function run(options: Partial<Extract<ClientMessage, { type: "init" }>> = {}) {
  let latest: HudState | undefined;
  let saved: SaveData | undefined;
  let maxPackets = 0;
  const messages: ServerMessage[] = [];
  const sim = new Simulation({ type: "init", seed: "test-vale", mode: "survival", radius: 1, ...options }, (message) => {
    if (message.type === "ready" || message.type === "state") latest = message.state;
    if (message.type === "save") saved = message.data;
    if (message.type === "chunks") maxPackets = Math.max(maxPackets, message.chunks.length);
    messages.push(message);
  });
  return {
    sim,
    messages,
    get state() { return latest!; },
    get maxPackets() { return maxPackets; },
    get save() {
      sim.receive({ type: "save" });
      return saved!;
    },
    input(value: Partial<Controls>) { sim.receive({ type: "input", value: { ...still, ...value } }); },
    step(count = 1) { for (let i = 0; i < count; i++) sim.step(); },
  };
}

describe("BuildBlox world authority", () => {
  it("clips collision movement and derives the placement face from the block ray", () => {
    const world = { get: (x: number, y: number, z: number) => x === 1 && y === 0 && z === 0 ? Block.Stone : Block.Air };
    const pos: Position = [0.5, 0, 0.5];
    expect(moveAxis(world, pos, 0, 2)).toBe(true);
    expect(pos[0]).toBeCloseTo(0.7, 2);
    expect(raycastVoxel(world, [0.5, 0.5, 0.5], [1, 0, 0], 3)).toEqual({
      code: Block.Stone, point: [1, 0, 0], adjacent: [0, 0, 0], distance: 0.5,
    });
  });

  it("crafts, places, and restores a workbench in a seeded survival world", () => {
    const game = run();
    game.sim.receive({ type: "craft", recipe: "bench" });
    game.step();
    const slot = game.state.inventory.findIndex((cell) => cell?.id === Block.Bench);
    expect(slot).toBeGreaterThanOrEqual(0);
    game.sim.receive({ type: "select", slot });
    game.input({ pitch: -0.54 });
    game.step();
    expect(game.state.target).not.toBeNull();
    game.sim.receive({ type: "action", action: "place" });
    game.step();
    expect(game.state.station).toBe("bench");
    expect(game.state.inventory[slot]).toBeNull();
    const saved = game.save;
    expect(saved.realms.surface).toEqual(expect.arrayContaining([expect.arrayContaining([Block.Bench])]));
    const restored = run({ saved });
    expect(restored.state.position).toEqual(game.state.position);
    expect(restored.state.station).toBe("bench");
    expect(restored.state.inventory).toEqual(game.state.inventory);
    expect(game.maxPackets).toBeLessThanOrEqual(2);
  });

  it("uses a gate to load the Underdeep and provides a return gate", () => {
    const initial = run().save;
    initial.realms.surface.push([0, initial.player.y, -2, Block.RiftGate]);
    const game = run({ saved: initial });
    game.input({ pitch: -0.38 });
    game.sim.receive({ type: "action", action: "interact" });
    game.step();
    expect(game.state.realm).toBe("underdeep");
    expect(game.state.targetCode).toBe(Block.RiftGate);
    expect(game.save.realms.underdeep.some((edit) => edit[3] === Block.RiftGate)).toBe(true);
    game.step(22);
    game.sim.receive({ type: "action", action: "interact" });
    game.step();
    expect(game.state.realm).toBe("surface");
  });

  it("keeps creative blocks available and bounds horizontal and flight motion", () => {
    const game = run({ mode: "creative" });
    game.sim.receive({ type: "give", item: Block.Brick });
    game.sim.receive({ type: "action", action: "flight" });
    game.input({ jump: true, forward: 999, strafe: 999 });
    game.step(8);
    expect(game.state.flying).toBe(true);
    expect(game.state.position.y).toBeGreaterThan(73);
    expect(Math.hypot(game.state.position.x - 0.5, game.state.position.z - 0.5)).toBeLessThan(4);
    expect(game.state.inventory[0]).toEqual({ id: Block.Brick, count: 64 });
    expect(game.state.health).toBe(20);
  });

  it("does not allow a dead Hardcore character to respawn", () => {
    const saved = run({ mode: "hardcore" }).save;
    saved.player.dead = true;
    saved.player.health = 0;
    const game = run({ saved });
    game.sim.receive({ type: "action", action: "respawn" });
    game.step();
    expect(game.state.dead).toBe(true);
    expect(game.state.health).toBe(0);
  });
});

describe("BuildBlox crafting and signals", () => {
  it("matches translated and mirrored patterns with exact occupied cells", () => {
    expect(matchGrid([0, 0, 0, 0, Block.Wood, Block.Wood, 0, 0, Block.Wood], 3)?.result).toBe(Item.WoodPick);
    expect(matchGrid([Block.Timber, 0, 0, 0], 2)?.result).toBe(Block.Wood);
    expect(matchGrid([Block.Wood, Block.Wood, Block.Wood, Block.Stone], 2)).toBeUndefined();
  });

  it("attenuates traces and drops linked power after the source is disabled", () => {
    const points: Position[] = [[0, 1, 0], [1, 1, 0], [2, 1, 0], [3, 1, 0]];
    const codes = [withState(Block.Switch, 1), Block.Wire, Block.Wire, Block.Lamp];
    const blocks = new Map(points.map((point, index) => [pointKey(point), codes[index]]));
    const world = { get: (x: number, y: number, z: number) => blocks.get(pointKey([x, y, z])) ?? Block.Air };
    const circuits = new Circuits(points.map((point, index) => [...point, codes[index]]));
    const write = (point: Position, code: number) => {
      blocks.set(pointKey(point), code);
      return true;
    };
    for (let tick = 2; tick <= 8; tick += 2) circuits.tick(world, [0, 2, 0], [], tick, true, write);
    expect(points.map((p) => stateOf(world.get(...p)))).toEqual([1, 15, 14, 1]);
    write(points[0], Block.Switch);
    for (let tick = 10; tick <= 46; tick += 2) circuits.tick(world, [0, 2, 0], [], tick, true, write);
    expect(points.map((p) => stateOf(world.get(...p)))).toEqual([0, 0, 0, 0]);
  });
});

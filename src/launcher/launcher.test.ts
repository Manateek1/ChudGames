import { describe, expect, it } from "vitest";
import { gameRegistry } from "../games/registry";
import { featuredIds, selectGames } from "./catalog";
import { crossedGate, drive, makeRoads, makeGates, parkOutside, spawnCar } from "./islandRoads";

describe("game shelf", () => {
  it("includes every registered game once and leads with the three featured games", () => {
    const games = selectGames(gameRegistry, "", "All", "featured");
    expect(games.map(game => game.id).slice(0, 3)).toEqual(featuredIds);
    expect(new Set(games.map(game => game.id)).size).toBe(gameRegistry.length);
  });

  it("combines search, type filters and alphabetical sorting", () => {
    expect(selectGames(gameRegistry, "  bLoX ", "Building", "title").map(game => game.id)).toEqual(["buildblox"]);
    expect(selectGames(gameRegistry, "BuildBlox", "Racing", "title")).toHaveLength(0);
    const puzzles = selectGames(gameRegistry, "", "Puzzle", "title");
    expect(puzzles.map(game => game.title)).toEqual(["Fusion 2048", "Memory Match"]);
  });
});

describe("island driving", () => {
  const gates = makeGates(gameRegistry);
  const closestRoad = makeRoads(gates);

  it("gives every available game a reachable gate from the circuit", () => {
    expect(gates.map(gate => gate.id).sort()).toEqual(gameRegistry.filter(game => game.isAvailable !== false).map(game => game.id).sort());
    for (const gate of gates) {
      const car = { ...gate.approach[0], heading: gate.angle, speed: 0 };
      let entered;
      for (let tick = 0; tick < 240 && !entered; tick++) {
        const { x, z } = car;
        drive(car, 1, 0, 1/60, closestRoad);
        entered = crossedGate(x, z, car, gates);
      }
      expect(entered?.id).toBe(gate.id);
    }
  });

  it("adds a new registry game to an open approach and preserves all existing gates", () => {
    const newGame = { ...gameRegistry[0], id: "new-game", title: "New Game", islandGateDegrees: undefined };
    const expanded = makeGates([newGame, ...gameRegistry]);
    expect(expanded.filter(gate => gate.id !== newGame.id)).toEqual(gates);
    const gate = expanded.find(gate => gate.id === newGame.id)!;
    expect(gates.every(old => Math.hypot(old.x-gate.x, old.z-gate.z) > 8)).toBe(true);
    const roads = makeRoads(expanded);
    const car = { ...gate.approach[0], heading: gate.angle, speed: 0 };
    let entered;
    for (let tick = 0; tick < 240 && !entered; tick++) {
      const { x,z } = car;
      drive(car,1,0,1/60,roads);
      entered = crossedGate(x,z,car,expanded);
    }
    expect(entered?.title).toBe(newGame.title);
    expect(makeGates([...gameRegistry, { ...newGame, isAvailable: false }])).toEqual(gates);
  });

  it("requires crossing the open span and parks returning drivers facing the circuit", () => {
    const gate = gates[0];
    const car = spawnCar();
    expect(crossedGate(car.x, car.z, car, gates)).toBeUndefined();
    expect(crossedGate(8, gate.z+2, { x: 8, z: gate.z-2 }, gates)).toBeUndefined();
    const parked = parkOutside(gate);
    for (let tick = 0; tick < 90; tick++) {
      const { x, z } = parked;
      drive(parked, 1, 0, 1/60, closestRoad);
      expect(crossedGate(x, z, parked, gates)).toBeUndefined();
    }
    expect(Math.hypot(parked.x, parked.z)).toBeLessThan(Math.abs(gate.z)-10);
  });

  it("can coast to rest and reverse", () => {
    const car = spawnCar();
    drive(car, 1, 0, .1, closestRoad);
    expect(car.z).toBeLessThan(spawnCar().z);
    for (let tick = 0; tick < 60; tick++) drive(car, 0, 0, 1/60, closestRoad);
    expect(car.speed).toBe(0);
    drive(car, -1, 0, .1, closestRoad);
    expect(car.speed).toBeLessThan(0);
  });
});

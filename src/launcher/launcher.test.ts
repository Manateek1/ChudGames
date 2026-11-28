import { describe, expect, it } from "vitest";
import { gameRegistry } from "../games/registry";
import { featuredIds, selectGames } from "./catalog";
import { drive, landmarks, spawnCar, stopAt } from "./islandRoads";

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
  it("maps each parking spot to its own destination and leaves intersections open", () => {
    for (const stop of landmarks) expect(stopAt(stop.point)).toBe(stop.id);
    expect(stopAt({ x: 493, y: 400 })).toBeNull();
  });

  it("lets the driver leave the alpine gate, coast to rest, and reverse", () => {
    const car = spawnCar();
    expect(stopAt(car)).toBe("apex-run");
    for (let tick = 0; tick < 60; tick++) drive(car, 1, 0, 1 / 60);
    expect(car.x).toBeLessThan(spawnCar().x - 20);
    expect(stopAt(car)).toBeNull();
    for (let tick = 0; tick < 90; tick++) drive(car, 0, 0, 1 / 60);
    expect(car.speed).toBe(0);
    drive(car, -1, 1, 1 / 60);
    expect(car.speed).toBeLessThan(0);
  });
});

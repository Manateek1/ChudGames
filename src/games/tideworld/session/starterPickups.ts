interface StarterTerrain {
  spawn: { x: number; z: number };
  height(x: number, z: number): number;
}
export function starterPickups(world: StarterTerrain) {
  return Array.from({ length: 6 }, (_, i) => {
    const x = Math.floor(world.spawn.x) + (i % 3) - 1,
      z = Math.floor(world.spawn.z) - 2 - Math.floor(i / 3);
    return {
      x: x + 0.5,
      y: world.height(x, z) + 1.12,
      z: z + 0.5,
      id: "camp-" + i,
      stack: { id: "slate_rubble", count: 1 },
      expires: 0,
      available: 0,
    };
  });
}

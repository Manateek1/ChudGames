import { BLOCKS } from "../world/blocks";
import { faceOffset, key, type Pos, type SystemWorld } from "./worldTypes";

// A small search budget prevents an enclosed predator from monopolizing the simulation.
export function groundPath(
  world: SystemWorld,
  from: Pos,
  target: Pos,
  width: number,
  height: number,
  budget = 48,
): Pos[] {
  const solid = (x: number, y: number, z: number) => Boolean(BLOCKS[world.get(x, y, z)]?.solid);
  function fits(x: number, y: number, z: number) {
    const half = Math.max(0.01, width * 0.5 - 0.001);
    for (const dx of [-half, half])
      for (const dz of [-half, half]) {
        const bx = Math.floor(x + 0.5 + dx),
          bz = Math.floor(z + 0.5 + dz);
        if (!solid(bx, y - 1, bz)) return false;
        for (let by = y; by < Math.ceil(y + height); by++) if (solid(bx, by, bz)) return false;
      }
    return true;
  }
  const start = { x: Math.floor(from.x), y: Math.floor(from.y + 0.1), z: Math.floor(from.z) };
  const goal = { x: Math.floor(target.x), z: Math.floor(target.z) };
  const heuristic = (p: Pos) => Math.abs(goal.x - p.x) + Math.abs(goal.z - p.z);
  type Node = { p: Pos; cost: number; score: number; parent: Node | null };
  const first: Node = { p: start, cost: 0, score: heuristic(start), parent: null };
  const open = [first],
    costs = new Map([[key(start), 0]]);
  let best = first;
  for (let i = 0; i < budget && open.length; i++) {
    let next = 0;
    for (let n = 1; n < open.length; n++) if (open[n].score < open[next].score) next = n;
    const current = open.splice(next, 1)[0];
    if (heuristic(current.p) < heuristic(best.p)) best = current;
    if (!heuristic(current.p)) break;
    for (const [dx, dz] of faceOffset) {
      const x = current.p.x + dx,
        z = current.p.z + dz;
      for (const dy of [0, 1, -1]) {
        const y = current.p.y + dy,
          p = { x, y, z };
        if (!fits(x, y, z)) continue;
        const cost = current.cost + 1 + Math.abs(dy) * 0.3,
          k = key(p);
        if (cost < (costs.get(k) ?? Infinity)) {
          costs.set(k, cost);
          open.push({ p, cost, score: cost + heuristic(p), parent: current });
        }
        break;
      }
    }
  }
  const out: Pos[] = [];
  for (let n: Node | null = best; n?.parent; n = n.parent)
    out.push({ ...n.p, x: n.p.x + 0.5, z: n.p.z + 0.5 });
  return out.reverse();
}

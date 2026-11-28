import { BLOCKS } from "../world/blocks";
import { type Stack } from "./catalog";
import { deposit, EQUIPMENT, Inventory, STORAGE } from "./inventory";
import { type Fluids } from "./fluids";
import { separation, type Actor, type Pos, type SystemWorld } from "./worldTypes";

export interface Skiff extends Pos {
  id: string;
  heading: number;
  speed: number;
  owner: string;
  seats: string[];
  cargo: (Stack | null)[];
  tether?: string;
  revision?: number;
}
export class Transport {
  boats: Skiff[];
  ropes: (Pos & { length?: number })[];
  private next: number;
  constructor(saved?: { boats: Skiff[]; ropes: Pos[]; next: number }) {
    this.boats = saved?.boats ?? [];
    this.ropes = saved?.ropes ?? [];
    this.next = saved?.next ?? 1;
  }
  save() {
    return { boats: this.boats, ropes: this.ropes, next: this.next };
  }
  private wet(w: SystemWorld, f: Fluids, p: Pos) {
    let depth = 0;
    for (const dx of [-0.48, 0.48])
      for (const dz of [-0.8, 0.8]) {
        const cell = { x: Math.floor(p.x + dx), y: Math.floor(p.y), z: Math.floor(p.z + dz) };
        if (
          BLOCKS[w.get(cell.x, cell.y, cell.z)]?.solid ||
          BLOCKS[w.get(cell.x, cell.y + 1, cell.z)]?.solid
        )
          return false;
        depth += f.read(w, cell).level;
      }
    return depth >= 16;
  }
  deploy(w: SystemWorld, f: Fluids, p: Pos, inv: Inventory, slot: number, owner: string) {
    const water = { x: p.x + 0.5, y: p.y, z: p.z + 0.5 };
    if (!this.wet(w, f, water)) return "The skiff needs open water beneath its hull.";
    if (inv.mode !== "building") inv.take(slot);
    this.boats.push({
      ...water,
      id: "skiff-" + this.next++,
      owner,
      seats: [],
      cargo: Array(12).fill(null),
      heading: 0,
      speed: 0,
    });
    return "Skiff launched. Use nearby to board.";
  }
  board(w: SystemWorld, actor: Actor) {
    const id = actor.id ?? "local",
      current = this.boats.find((b) => b.seats.includes(id));
    if (current) {
      for (const [dx, dz] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ]) {
        const x = Math.floor(current.x + dx),
          z = Math.floor(current.z + dz),
          y = Math.floor(current.y) + 1;
        if (!BLOCKS[w.get(x, y, z)]?.solid && !BLOCKS[w.get(x, y + 1, z)]?.solid) {
          current.seats = current.seats.filter((s) => s !== id);
          Object.assign(actor, { x: x + 0.5, y, z: z + 0.5 });
          return "Left skiff.";
        }
      }
      return "No clear dismount.";
    }
    const boat = this.boats.find((b) => b.seats.length < 2 && separation(actor, b) < 3);
    if (!boat) return null;
    boat.seats.push(id);
    return "Aboard skiff.";
  }
  sail(w: SystemWorld, f: Fluids, actor: Actor, forward: number, turn: number, dt: number) {
    const id = actor.id ?? "local",
      b = this.boats.find((b) => b.seats.includes(id));
    if (!b) return false;
    if (b.seats[0] === id) {
      const desired = b.tether ? 0 : forward * (forward >= 0 ? 5.2 : 2);
      b.speed += Math.sign(desired - b.speed) * Math.min(Math.abs(desired - b.speed), 2.5 * dt);
      if (Math.abs(b.speed) > 0.01) b.heading += turn * ((75 * Math.PI) / 180) * dt * Math.sign(b.speed);
      const p = {
        x: b.x + Math.sin(b.heading) * b.speed * dt,
        y: b.y,
        z: b.z - Math.cos(b.heading) * b.speed * dt,
      };
      if (this.wet(w, f, p)) Object.assign(b, p);
      else b.speed = 0;
    }
    Object.assign(actor, { x: b.x, y: b.y + 1, z: b.z });
    return true;
  }
  cargo(
    boatId: string,
    inv: Inventory,
    actor: Actor,
    slot: number,
    withdraw: boolean,
    expectedRevision: number,
  ) {
    const boat = this.boats.find((b) => b.id === boatId);
    if (
      !boat ||
      boat.owner !== (actor.id ?? "local") ||
      (boat.revision ?? 0) !== expectedRevision ||
      separation(boat, actor) > 3 ||
      !Number.isSafeInteger(slot) ||
      slot < 0 ||
      slot >= (withdraw ? 12 : STORAGE)
    )
      return false;
    const source = withdraw ? boat.cargo : inv.slots,
      item = source[slot];
    if (!item) return false;
    const left = withdraw ? inv.addStack(item) : deposit(boat.cargo, item);
    if (left === item.count) return false;
    if (!left) source[slot] = null;
    else item.count = left;
    if (!withdraw) inv.version++;
    boat.revision = expectedRevision + 1;
    return true;
  }
  toggleAnchor(p: Pos, actorId: string) {
    const boat = this.boats.find((b) => b.owner === actorId && separation(b, p) <= 5);
    if (!boat) return null;
    const anchor = [p.x, p.y, p.z].join(",");
    if (this.ropes.some((r) => r.x === p.x && r.z === p.z && r.y === p.y - 1))
      return "Retrieve the rope before tying a skiff.";
    if (boat.tether && boat.tether !== anchor) return "Release the skiff at its current anchor.";
    if (this.boats.some((b) => b !== boat && b.tether === anchor)) return "This anchor is occupied.";
    boat.tether = boat.tether ? undefined : anchor;
    boat.speed = 0;
    return boat.tether ? "Skiff tethered." : "Skiff released.";
  }
  recover(p: Pos, inv: Inventory, owner: string) {
    const b = this.boats.find((b) => b.owner === owner && separation(b, p) < 3);
    if (!b) return null;
    if (b.tether || b.seats.length || b.cargo.some(Boolean))
      return "Empty and untether the skiff first.";
    if (inv.add("skiff")) return "Your pack is full.";
    this.boats = this.boats.filter((other) => other !== b);
    return "Skiff recovered.";
  }
  ropeAt(p: Pos) {
    return this.ropes.some(
      (r) =>
        r.x === Math.floor(p.x) &&
        r.z === Math.floor(p.z) &&
        p.y <= r.y + 1 &&
        p.y >= r.y - (r.length ?? 12) + 1,
    );
  }
  detachRope(p: Pos, inv: Inventory) {
    const index = this.ropes.findIndex(
      (r) => r.x === p.x && r.z === p.z && (r.y === p.y || r.y === p.y - 1),
    );
    if (index < 0) return null;
    if (inv.mode !== "building" && inv.add("rope_line")) return "Make room for the rope.";
    this.ropes.splice(index, 1);
    return "Rope retrieved.";
  }
  attachRope(w: SystemWorld, p: Pos, inv: Inventory, slot: number) {
    if (w.get(p.x, p.y, p.z) !== "anchor") return "A rope line needs an anchor.";
    if (this.boats.some((b) => b.tether === [p.x, p.y, p.z].join(",")))
      return "Release the skiff before attaching a rope.";
    const pos = { ...p, y: p.y - 1 };
    if (w.get(pos.x, pos.y, pos.z) !== "air") return "Clear the space below the anchor.";
    if (this.ropes.some((r) => separation(r, pos) < 0.1)) return "A line is already attached.";
    if (inv.mode !== "building") inv.take(slot);
    let length = 1;
    while (length < 12 && w.get(pos.x, pos.y - length, pos.z) === "air") length++;
    this.ropes.push({ ...pos, length });
    return "Rope line attached.";
  }
  glide(inv: Inventory, v: Pos, heading: number, tick: number) {
    if (inv.slots[EQUIPMENT]?.id !== "hand_glider" || v.y > 0) return false;
    v.y = Math.max(v.y, -2.5);
    v.x += (-Math.sin(heading) * 8 - v.x) * 0.12;
    v.z += (-Math.cos(heading) * 8 - v.z) * 0.12;
    if (tick % 30 === 0) inv.wear(EQUIPMENT);
    return true;
  }
}

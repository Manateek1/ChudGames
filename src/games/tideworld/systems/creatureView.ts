import * as THREE from "three";
import { SPECIES, type Creature, type Payload, type Shot } from "./creatures";
import type { Skiff } from "./transport";

interface Rig {
  root: THREE.Group;
  legs: THREE.Mesh[];
  wings: THREE.Mesh[];
  tail?: THREE.Mesh;
  head?: THREE.Group;
  shell?: THREE.Mesh;
  steam: THREE.Mesh[];
}
// The renderer follows the simulation tick so attack tells and impacts pause with the world.
function animateCreature(rig: Rig, c: Creature, seconds: number) {
  const def = SPECIES[c.species],
    state = c.state,
    moving = c.speed > 0;
  const size = c.juvenile ? 0.65 : 1,
    seed = Number(c.id) || 0;
  const phase = seconds * (moving ? 9 : 2) + seed,
    wave = Math.sin(phase);
  const progress = (ticks: number) => THREE.MathUtils.clamp(1 - (c.phaseUntil - seconds * 30) / ticks, 0, 1);
  const { root, head, shell, legs, wings, tail } = rig;
  root.scale.set(def.width * size, def.height * size, def.width * size);
  root.position.set(c.x, c.y + (moving ? Math.abs(wave) * 0.035 : 0), c.z);
  root.rotation.set(0, c.heading, 0, "YXZ");
  if (head) {
    head.rotation.set(0, 0, 0);
    head.scale.setScalar(1);
  }
  if (shell) shell.rotation.set(0, 0, 0);
  for (let i = 0; i < legs.length; i++) {
    legs[i].rotation.set(Math.sin(phase + (i % 3) * 2.3) * (moving ? 0.4 : 0.04), 0, 0);
    legs[i].visible = true;
  }
  for (let i = 0; i < wings.length; i++) {
    wings[i].rotation.z = (i === 0 ? -1 : 1) * 0.06 * wave;
  }
  if (tail) tail.rotation.set(0, wave * 0.22, 0);

  const lunge = (distance: number) => {
    root.position.x += Math.sin(c.heading) * distance;
    root.position.z += Math.cos(c.heading) * distance;
  };
  switch (c.species) {
    case "husk_beetle":
      if (state === "warn") {
        const intensity = progress(18);
        const rattle = Math.sin(seconds * 56) * (0.045 + intensity * 0.11);
        shell!.rotation.z = rattle;
        head!.rotation.x = 0.22 + intensity * 0.22;
        root.scale.y *= 1 - 0.22 * intensity;
        legs.forEach((leg, i) => {
          leg.rotation.z = (i % 2 ? 1 : -1) * (0.36 + rattle);
        });
      } else if (state === "strike") {
        const thrust = Math.sin(progress(9) * Math.PI);
        lunge(thrust * 0.38);
        root.rotation.x = -thrust * 0.26;
      }
      break;
    case "cliff_grazer":
      if (state === "warn" || state === "strike") {
        const strike = state === "strike";
        const tell = strike ? 1 : progress(12);
        head!.rotation.x = 0.85 * tell;
        root.rotation.x = 0.13 * tell;
        if (strike) lunge(Math.sin(progress(9) * Math.PI) * 0.46);
        else legs[0].rotation.x = Math.sin(seconds * 19) * tell * 0.65;
      } else if (state === "rest") {
        head!.rotation.x = 0.45 + 0.27 * Math.sin(phase * 0.6);
      }
      break;
    case "slate_stalker":
      if (state === "warn" || state === "strike") {
        const reach = state === "warn" ? 0.35 : Math.sin(progress(9) * Math.PI);
        legs[0].rotation.x = -0.45 - reach * 1.05;
        root.rotation.z = -reach * 0.24;
        head!.rotation.y = reach * 0.22;
        lunge(reach * 0.14);
      } else if (state === "seek shade" || state === "investigate" || state === "pursue") {
        root.scale.y *= state === "seek shade" ? 0.72 : 0.83;
        tail!.rotation.x = state === "seek shade" ? 0.75 : 0.24;
      }
      break;
    case "ember_crawler": {
      const jump = state === "leap" ? Math.sin(progress(9) * Math.PI) : 0;
      if (state === "warn") root.scale.y *= 1 - progress(12) * 0.42;
      if (state === "leap") {
        root.position.y += jump * 0.68;
        root.rotation.x = -Math.cos(progress(9) * Math.PI) * 0.34;
        lunge(jump * 0.3);
      }
      if (state === "retreat") {
        root.scale.y *= 0.74;
        shell!.rotation.z = Math.sin(phase * 2) * 0.12;
      }
      for (let i = 0; i < rig.steam.length; i++) {
        const puff = rig.steam[i];
        const sinceContact = 1 - (c.attackAt - seconds * 30) / 30;
        puff.visible = sinceContact >= 0 && sinceContact < 0.6 && (state === "leap" || state === "retreat");
        if (!puff.visible) continue;
        puff.position.set(
          (i - 1) * (0.12 + sinceContact * 0.26),
          0.72 + sinceContact * 1.6 + i * 0.13,
          0.48 - sinceContact * 0.75,
        );
        puff.scale.setScalar((0.6 - sinceContact) * 0.25);
      }
      break;
    }
    case "shellback":
      if (state === "shelled") {
        head!.scale.setScalar(0.12);
        head!.rotation.x = 1.05;
        legs.forEach((leg) => {
          leg.visible = false;
        });
        root.position.y -= def.height * size * 0.12;
      }
      break;
    case "alder_glider":
    case "lantern_moth": {
      const roost = state === "rest" && !moving,
        moth = c.species === "lantern_moth";
      for (let i = 0; i < wings.length; i++) {
        const side = i === 0 ? -1 : 1;
        const angle = roost
          ? (moth ? 1.2 : -0.88) + 0.03 * wave
          : moth
            ? 0.2 + 0.85 * Math.sin(seconds * 22 + seed)
            : -0.08 + 0.14 * Math.sin(phase * 0.72);
        wings[i].rotation.z = side * angle;
        wings[i].rotation.y = side * (roost ? 0.85 : 0.36);
      }
      root.rotation.x = roost ? -0.1 : state === "follow grain" ? 0.23 : -0.05;
      if (roost) head!.rotation.y = 0.25 * Math.sin(phase * 0.55);
      tail!.rotation.x = roost ? 0.42 : 0.08;
      break;
    }
    case "marsh_hen":
      head!.rotation.x = state === "rest" ? 0.2 + Math.max(0, Math.sin(phase * 0.85)) * 0.64 : wave * 0.14;
      if (state === "flee")
        wings.forEach((wing, i) => {
          wing.rotation.z = (i ? 1 : -1) * (0.5 + wave * 0.38);
        });
      break;
    case "shoal_darter":
      tail!.rotation.y = Math.sin(seconds * (state === "flee" ? 21 : 9) + seed) * (moving ? 0.55 : 0.2);
      root.rotation.z = tail!.rotation.y * 0.12;
      break;
    case "dune_runner":
      if (state === "flee") {
        const bound = Math.abs(wave);
        root.position.y += bound * 0.15;
        root.rotation.x = wave * 0.15;
        tail!.rotation.x = 0.5;
      } else if (state === "forage") head!.rotation.x = 0.4 + wave * 0.18;
      break;
    case "cave_slug":
      root.scale.z *= 1 + (moving ? 0.09 : 0.025) * wave;
      root.scale.y *= 1 - (moving ? 0.08 : 0.02) * wave;
      head!.rotation.z = Math.sin(phase * 0.5) * 0.1;
      break;
  }
}
export class CreatureView {
  readonly root = new THREE.Group();
  private rigs = new Map<string, Rig>();
  private hulls = new Map<string, THREE.Group>();
  private particles = new Map<string, THREE.Mesh>();
  private geo = new THREE.BoxGeometry();
  private readonly batchMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  private batch: THREE.InstancedMesh;
  private parts = new THREE.Group();
  private materials = new Map<number, THREE.MeshLambertMaterial>();
  constructor(scene: THREE.Object3D) {
    this.batch = this.makeBatch(512);
    this.root.add(this.batch);
    scene.add(this.root);
  }
  private makeBatch(size: number) {
    const mesh = new THREE.InstancedMesh(this.geo, this.batchMat, size);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    return mesh;
  }
  private renderParts() {
    this.parts.updateMatrixWorld(true);
    const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>[] = [];
    this.parts.traverse((part) => {
      if (part instanceof THREE.Mesh && part.visible) meshes.push(part);
    });
    if (meshes.length > this.batch.instanceMatrix.count) {
      this.batch.removeFromParent();
      this.batch.dispose();
      this.batch = this.makeBatch(2 ** Math.ceil(Math.log2(meshes.length)));
      this.root.add(this.batch);
    }
    this.batch.count = meshes.length;
    meshes.forEach((part, i) => {
      this.batch.setMatrixAt(i, part.matrixWorld);
      this.batch.setColorAt(i, part.material.color);
    });
    this.batch.instanceMatrix.needsUpdate = true;
    if (this.batch.instanceColor) this.batch.instanceColor.needsUpdate = true;
  }
  private part(
    parent: THREE.Object3D,
    color: number,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
  ) {
    let mat = this.materials.get(color);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
      this.materials.set(color, mat);
    }
    const part = new THREE.Mesh(this.geo, mat);
    part.scale.set(w, h, d);
    part.position.set(x, y, z);
    part.castShadow = true;
    parent.add(part);
    return part;
  }
  private rig(id: string): Rig {
    const def = SPECIES[id],
      g = new THREE.Group(),
      limbs: THREE.Mesh[] = [],
      wings: THREE.Mesh[] = [];
    const body = def.color,
      trim = def.accent,
      eye = 0x19272b;
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, col = body) =>
      this.part(g, col, w, h, d, x, y, z);
    const headParts: THREE.Mesh[] = [];
    const steam: THREE.Mesh[] = [];
    const headPart = (...dimensions: Parameters<typeof add>) => {
      const mesh = add(...dimensions);
      headParts.push(mesh);
      return mesh;
    };
    const eyes = (y: number, z: number, x = 0.27) => {
      for (const side of [-1, 1]) headPart(0.1, 0.11, 0.1, side * x, y, z, eye);
    };
    const legs = (y: number, height: number, forward: number, back: number, width = 0.12) => {
      for (const z of [forward, back])
        for (const side of [-1, 1]) limbs.push(add(width, height, 0.14, side * 0.26, y, z, trim));
    };
    let tail: THREE.Mesh | undefined, shell: THREE.Mesh | undefined;
    switch (id) {
      case "marsh_hen":
        add(0.76, 0.46, 0.88, 0, 0.45, 0);
        headPart(0.4, 0.34, 0.36, 0, 0.78, 0.26);
        headPart(0.23, 0.14, 0.24, 0, 0.74, 0.51, trim);
        for (const side of [-1, 1]) {
          limbs.push(add(0.1, 0.23, 0.1, side * 0.18, 0.12, 0, trim));
          wings.push(add(0.1, 0.28, 0.55, side * 0.39, 0.48, 0, 0x426357));
        }
        eyes(0.83, 0.42, 0.18);
        break;
      case "cliff_grazer":
        add(0.74, 0.42, 1.27, 0, 0.57, -0.09);
        headPart(0.3, 0.37, 0.33, 0, 0.76, 0.39);
        headPart(0.47, 0.26, 0.48, 0, 0.88, 0.54);
        for (const side of [-1, 1]) {
          const horn = headPart(0.1, 0.23, 0.15, side * 0.19, 0.99, 0.4, trim);
          horn.rotation.x = 0.45;
        }
        legs(0.225, 0.45, 0.34, -0.51, 0.14);
        eyes(0.91, 0.65, 0.22);
        break;
      case "alder_glider":
      case "lantern_moth":
        add(0.32, 0.37, 0.76, 0, 0.51, 0);
        headPart(0.39, 0.32, 0.36, 0, 0.61, 0.37, trim);
        for (const side of [-1, 1]) {
          const wing = add(id === "lantern_moth" ? 0.68 : 0.75, 0.08, 0.56, side * 0.42, 0.57, -0.04, trim);
          wing.rotation.y = side * 0.36;
          wings.push(wing);
        }
        tail = add(0.16, 0.13, 0.54, 0, 0.44, -0.54);
        eyes(0.67, 0.52, 0.16);
        break;
      case "shoal_darter":
        add(0.49, 0.52, 1.28, 0, 0.5, 0);
        headPart(0.33, 0.3, 0.34, 0, 0.48, 0.67, trim);
        tail = add(0.13, 0.66, 0.39, 0, 0.48, -0.76, trim);
        add(0.08, 0.22, 0.35, 0, 0.85, 0, trim);
        eyes(0.58, 0.46, 0.24);
        break;
      case "shellback":
      case "husk_beetle":
      case "ember_crawler":
        add(0.91, 0.42, 1.0, 0, 0.44, -0.05);
        shell = add(0.7, 0.23, 0.69, 0, 0.72, -0.07, trim);
        headPart(0.36, 0.25, 0.36, 0, 0.41, 0.48);
        for (let i = 0; i < 3; i++)
          for (const side of [-1, 1]) limbs.push(add(0.38, 0.1, 0.12, side * 0.46, 0.16, i * 0.28 - 0.31));
        if (id === "shellback")
          for (const side of [-1, 1]) headPart(0.24, 0.19, 0.39, side * 0.41, 0.39, 0.53, trim);
        if (id === "ember_crawler") {
          for (let i = 0; i < 3; i++) steam.push(add(0.1, 0.1, 0.1, 0, 0, 0, 0xbec9c7));
        }
        eyes(0.5, 0.6, 0.16);
        break;
      case "cave_slug":
        add(0.8, 0.32, 1.23, 0, 0.25, 0);
        add(0.62, 0.46, 0.78, 0, 0.46, -0.08, trim);
        for (const side of [-1, 1]) headPart(0.08, 0.3, 0.08, side * 0.22, 0.54, 0.49);
        eyes(0.71, 0.5, 0.22);
        break;
      case "slate_stalker":
        add(0.66, 0.47, 0.96, 0, 0.53, -0.07);
        headPart(0.48, 0.35, 0.52, 0, 0.78, 0.4);
        legs(0.225, 0.45, 0.32, -0.37);
        for (const side of [-1, 1]) headPart(0.12, 0.22, 0.13, side * 0.17, 0.98, 0.26, trim);
        eyes(0.82, 0.62, 0.22);
        tail = add(0.16, 0.15, 0.66, 0, 0.55, -0.7, trim);
        break;
      default:
        add(0.74, 0.4, 0.98, 0, 0.51, -0.06);
        headPart(0.36, 0.31, 0.42, 0, 0.65, 0.47);
        legs(0.21, 0.37, 0.28, -0.38);
        eyes(0.7, 0.63, 0.16);
        tail = add(0.2, 0.13, 0.61, 0, 0.49, -0.73, trim);
    }
    let head: THREE.Group | undefined;
    if (headParts.length) {
      head = new THREE.Group();
      head.position.copy(headParts[0].position);
      head.position.z -= 0.18;
      g.add(head);
      for (const part of headParts) head.attach(part);
    }
    this.parts.add(g);
    return { root: g, legs: limbs, wings, tail, head, shell, steam };
  }
  update(
    creatures: readonly Creature[],
    boats: readonly Skiff[],
    seconds: number,
    drops: readonly Payload[] = [],
    shots: readonly Shot[] = [],
  ) {
    const living = new Set<string>();
    for (const c of creatures) {
      const def = SPECIES[c.species];
      if (!def) continue;
      living.add(c.id);
      let rig = this.rigs.get(c.id);
      if (!rig) {
        rig = this.rig(c.species);
        this.rigs.set(c.id, rig);
      }
      animateCreature(rig, c, seconds);
    }
    for (const [id, rig] of this.rigs)
      if (!living.has(id)) {
        rig.root.removeFromParent();
        this.rigs.delete(id);
      }
    const ships = new Set<string>();
    for (const b of boats) {
      let hull = this.hulls.get(b.id);
      if (!hull) {
        hull = new THREE.Group();
        this.hulls.set(b.id, hull);
        this.parts.add(hull);
        this.part(hull, 0x925a3d, 1.26, 0.2, 2.3, 0, 0, 0);
        for (const side of [-1, 1]) this.part(hull, 0xbb8b54, 0.16, 0.38, 2.16, side * 0.58, 0.15, 0);
        for (const z of [-0.89, 0, 0.89]) this.part(hull, 0xc99762, 1.04, 0.16, 0.23, 0, 0.21, z);
      }
      ships.add(b.id);
      hull.position.set(b.x, b.y + 0.67 + Math.sin(seconds * 1.8) * 0.035, b.z);
      hull.rotation.y = -b.heading;
    }
    for (const [id, h] of this.hulls)
      if (!ships.has(id)) {
        h.removeFromParent();
        this.hulls.delete(id);
      }
    const particles = new Set<string>();
    const particle = (id: string, x: number, y: number, z: number, color: number, size: number) => {
      particles.add(id);
      let mesh = this.particles.get(id);
      if (!mesh) {
        mesh = this.part(this.parts, color, size, size, size, 0, 0, 0);
        this.particles.set(id, mesh);
      }
      mesh.position.set(x, y, z);
      mesh.rotation.y = seconds;
    };
    drops.forEach((drop, i) =>
      particle("d" + i, drop.x, drop.y + 0.2 + Math.sin(seconds * 2 + i) * 0.055, drop.z, 0xefc481, 0.2),
    );
    shots.forEach((shot, i) => particle("s" + i, shot.x, shot.y, shot.z, 0xaeb6b0, 0.14));
    for (const [id, mesh] of this.particles)
      if (!particles.has(id)) {
        mesh.removeFromParent();
        this.particles.delete(id);
      }
    this.renderParts();
  }
  dispose() {
    this.batch.dispose();
    this.batchMat.dispose();
    this.parts.clear();
    this.root.removeFromParent();
    this.root.clear();
    this.geo.dispose();
    this.materials.forEach((m) => m.dispose());
    this.rigs.clear();
    this.hulls.clear();
    this.particles.clear();
  }
}

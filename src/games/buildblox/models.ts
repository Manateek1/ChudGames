import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Item, isPlaceable, itemInfo } from "./blocks";
import type { MobView } from "./protocol";

type Part = [x: number, y: number, z: number, width: number, height: number, depth: number, color: number];

interface Model {
  body: Part[];
  feet?: { places: [number, number, number][]; size: [number, number, number]; color: number };
}

const models: Record<MobView["kind"], Model> = {
  grazer: {
    body: [
      [0, 0.51, -0.11, 0.62, 0.48, 0.89, 0x755743],
      [0, 0.69, -0.18, 0.69, 0.26, 0.80, 0x466b54],
      [0, 0.89, -0.29, 0.44, 0.23, 0.43, 0x71956b],
      [0, 0.59, 0.37, 0.47, 0.38, 0.38, 0xb18258],
      [0, 0.54, 0.58, 0.34, 0.20, 0.14, 0xe8c28e],
      [0, 0.56, 0.656, 0.10, 0.08, 0.025, 0x654134],
      [-0.16, 0.68, 0.567, 0.065, 0.07, 0.037, 0x251d27],
      [0.16, 0.68, 0.567, 0.065, 0.07, 0.037, 0x251d27],
      [-0.21, 0.86, 0.35, 0.12, 0.19, 0.14, 0xda9972],
      [0.21, 0.86, 0.35, 0.12, 0.19, 0.14, 0xda9972],
      [-0.14, 0.95, -0.14, 0.11, 0.12, 0.12, 0xf4b761],
      [0.12, 0.99, -0.31, 0.12, 0.14, 0.12, 0xdc8b54],
    ],
    feet: { places: [[-0.22, 0.37, -0.38], [0.22, 0.37, -0.38], [-0.22, 0.37, 0.20], [0.22, 0.37, 0.20]], size: [0.15, 0.36, 0.17], color: 0x634939 },
  },
  lurker: {
    body: [
      [0, 0.48, -0.11, 0.66, 0.33, 0.91, 0x43354e],
      [0, 0.66, -0.22, 0.48, 0.27, 0.59, 0x685069],
      [0, 0.46, 0.41, 0.60, 0.31, 0.39, 0x564257],
      [0, 0.39, 0.64, 0.43, 0.14, 0.17, 0x2d283d],
      [-0.19, 0.52, 0.612, 0.12, 0.07, 0.042, 0xffad79],
      [0.19, 0.52, 0.612, 0.12, 0.07, 0.042, 0xffad79],
      [-0.20, 0.67, 0.33, 0.15, 0.24, 0.16, 0x765368],
      [0.20, 0.67, 0.33, 0.15, 0.24, 0.16, 0x765368],
      [0, 0.54, -0.64, 0.18, 0.18, 0.32, 0x493a58],
      [0, 0.63, -0.80, 0.14, 0.14, 0.14, 0xb87d8c],
    ],
    feet: { places: [[-0.27, 0.37, -0.41], [0.27, 0.37, -0.41], [-0.27, 0.37, 0.14], [0.27, 0.37, 0.14]], size: [0.16, 0.36, 0.19], color: 0x352b45 },
  },
  sentinel: {
    body: [
      [0, 1.07, 0, 0.66, 1.01, 0.54, 0x746c9b],
      [0, 1.82, 0.01, 0.55, 0.41, 0.52, 0x9b8ab4],
      [0, 1.86, 0.29, 0.37, 0.14, 0.06, 0x4b3b6d],
      [0, 1.86, 0.328, 0.20, 0.065, 0.024, 0xe2c8ff],
      [0, 1.12, 0.30, 0.26, 0.38, 0.084, 0x9e89ca],
      [0, 1.12, 0.36, 0.105, 0.23, 0.048, 0xddcbf9],
      [-0.49, 1.18, 0, 0.32, 0.60, 0.41, 0x7e6b9c],
      [0.49, 1.18, 0, 0.32, 0.60, 0.41, 0x7e6b9c],
      [0, 0.48, 0, 0.41, 0.36, 0.39, 0x5a527f],
      [0, 0.26, 0, 0.18, 0.18, 0.19, 0xb3b8eb],
    ],
  },
  trader: {
    body: [
      [0, 0.78, 0, 0.61, 0.59, 0.36, 0x376d6e],
      [0, 0.62, 0.199, 0.62, 0.12, 0.058, 0xac8158],
      [0, 0.90, -0.27, 0.48, 0.51, 0.24, 0x9d664c],
      [-0.27, 0.88, -0.31, 0.13, 0.36, 0.14, 0xc79262],
      [0.39, 0.80, 0, 0.20, 0.44, 0.25, 0x2b565d],
      [-0.39, 0.80, 0, 0.20, 0.44, 0.25, 0x2b565d],
      [0.39, 0.57, 0, 0.17, 0.15, 0.22, 0xc68b68],
      [-0.39, 0.57, 0, 0.17, 0.15, 0.22, 0xc68b68],
      [0, 1.26, 0.04, 0.43, 0.38, 0.38, 0xc38d6a],
      [0, 1.00, 0.08, 0.50, 0.17, 0.43, 0xe2a059],
      [0, 1.40, 0.03, 0.58, 0.10, 0.53, 0x684941],
      [0, 1.50, 0.01, 0.44, 0.15, 0.39, 0x8f6351],
      [-0.105, 1.27, 0.235, 0.06, 0.06, 0.024, 0x2b2934],
      [0.105, 1.27, 0.235, 0.06, 0.06, 0.024, 0x2b2934],
    ],
    feet: { places: [[-0.16, 0.47, 0], [0.16, 0.47, 0]], size: [0.21, 0.45, 0.26], color: 0x503f42 },
  },
};

function shadeBox(geometry: THREE.BoxGeometry, hex: number) {
  const color = new THREE.Color(hex);
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) {
    const shade = 0.74 + 0.22 * normal.getY(i) + 0.16 * normal.getZ(i) - 0.10 * normal.getX(i);
    colors.set([color.r * shade, color.g * shade, color.b * shade], i * 3);
  }
  return geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

function createPart([x, y, z, width, height, depth, hex]: Part) {
  return shadeBox(new THREE.BoxGeometry(width, height, depth), hex).translate(x, y, z);
}

export interface Actor {
  root: THREE.Group;
  body: THREE.Mesh;
  feet: THREE.Mesh[];
  stamp: number;
  stride: number;
  health: number;
  damage: number;
}

export class VoxelActors {
  readonly material = new THREE.MeshBasicMaterial({ vertexColors: true });
  private readonly geometries = new Map<MobView["kind"], {
    body: THREE.BufferGeometry;
    foot?: THREE.BufferGeometry;
  }>();

  create(kind: MobView["kind"]): Actor {
    const model = models[kind];
    let cache = this.geometries.get(kind);
    if (!cache) {
      const pieces = model.body.map(createPart);
      cache = { body: mergeGeometries(pieces) };
      for (const geometry of pieces) geometry.dispose();
      if (model.feet) {
        cache.foot = createPart([0, -model.feet.size[1] * 0.5, 0, ...model.feet.size, model.feet.color]);
      }
      this.geometries.set(kind, cache);
    }
    const root = new THREE.Group();
    const body = new THREE.Mesh(cache.body, this.material);
    root.add(body);
    const feet: THREE.Mesh[] = [];
    if (model.feet) {
      for (const place of model.feet.places) {
        const foot = new THREE.Mesh(cache.foot, this.material);
        foot.position.set(...place);
        feet.push(foot);
        root.add(foot);
      }
    }
    return { root, body, feet, stamp: 0, stride: 0, health: 0, damage: 0 };
  }

  dispose() {
    for (const value of this.geometries.values()) {
      value.body.dispose();
      value.foot?.dispose();
    }
    this.geometries.clear();
    this.material.dispose();
  }
}

const handledChunks = {
  grip: 0x503733, cuff: 0x35676b, trim: 0xa97c53, glove: 0xb88766,
};

export class VoxelHand {
  readonly root = new THREE.Group();
  private readonly geometry = shadeBox(new THREE.BoxGeometry(1, 1, 1), 0xffffff);
  private readonly materials: THREE.MeshBasicMaterial[] = [];
  private readonly tint = this.makeMaterial(0xcb9475);
  private readonly carried: THREE.Mesh;
  private readonly haft: THREE.Group;
  private readonly pick: THREE.Group;
  private readonly blade: THREE.Group;
  private held = -1;
  private lastMining = 0;
  private followThrough = 0;

  constructor() {
    const { grip, cuff, trim, glove } = handledChunks;
    this.part(this.root, [0.086, -0.215, 0.14, 0.19, 0.22, 0.43, cuff]);
    this.part(this.root, [0.063, -0.139, -0.034, 0.194, 0.20, 0.12, trim]);
    this.part(this.root, [0.021, -0.097, -0.118, 0.135, 0.133, 0.15, glove]);
    this.carried = this.part(this.root, [-0.035, 0.035, -0.19, 0.23, 0.23, 0.23, 0xffffff], this.tint);
    this.carried.rotation.set(0.23, 0.5, -0.16);
    this.haft = new THREE.Group();
    this.haft.position.set(-0.058, -0.09, -0.15);
    this.haft.rotation.z = -0.62;
    this.root.add(this.haft);
    this.part(this.haft, [0, 0.095, 0, 0.059, 0.48, 0.058, grip]);
    this.part(this.haft, [0, 0.185, 0.008, 0.039, 0.231, 0.063, 0xad7952]);
    this.part(this.haft, [0, 0.03, 0.024, 0.067, 0.085, 0.065, trim]);
    this.pick = new THREE.Group();
    this.haft.add(this.pick);
    this.part(this.pick, [-0.016, 0.326, 0.017, 0.26, 0.083, 0.115, 0xffffff], this.tint);
    this.part(this.pick, [-0.14, 0.292, 0.009, 0.082, 0.091, 0.105, 0xffffff], this.tint);
    this.part(this.pick, [0.111, 0.291, 0.016, 0.070, 0.082, 0.105, 0xffffff], this.tint);
    this.part(this.pick, [0, 0.331, 0.079, 0.13, 0.035, 0.016, 0xdcc6a3]);
    this.blade = new THREE.Group();
    this.haft.add(this.blade);
    this.part(this.blade, [0, 0.345, 0, 0.13, 0.41, 0.072, 0xffffff], this.tint);
    this.part(this.blade, [0, 0.562, 0, 0.082, 0.069, 0.071, 0xffffff], this.tint);
    this.part(this.blade, [0, 0.182, 0, 0.204, 0.051, 0.081, trim]);
    this.select(0);
  }

  private makeMaterial(color: number) {
    const material = new THREE.MeshBasicMaterial({
      color, vertexColors: true, fog: false, transparent: true, depthTest: false, depthWrite: false,
    });
    this.materials.push(material);
    return material;
  }

  private part(root: THREE.Group, [x, y, z, width, height, depth, color]: Part, shared?: THREE.MeshBasicMaterial) {
    const mesh = new THREE.Mesh(this.geometry, shared ?? this.makeMaterial(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    mesh.renderOrder = 1000;
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  }

  private select(id: number) {
    this.held = id;
    const tool = id >= Item.WoodPick && id <= Item.PrismPick;
    const blade = id === Item.CopperBlade;
    this.haft.visible = tool || blade;
    this.pick.visible = tool;
    this.blade.visible = blade;
    this.carried.visible = id > 0 && !tool && !blade;
    this.carried.scale.setScalar(isPlaceable(id) ? 0.23 : 0.13);
    this.tint.color.setHex(itemInfo(id).color);
  }

  update(id: number, moving: number, time: number, mining: number, dt: number, hidden: boolean, aspect: number) {
    if (id !== this.held) this.select(id);
    if (mining < this.lastMining - 0.3) this.followThrough = 1;
    this.lastMining = mining;
    this.followThrough = Math.max(0, this.followThrough - dt * 7);
    const swing = mining > 0 ? (0.52 + 0.28 * Math.sin(time * 22)) : this.followThrough * 0.80;
    this.root.visible = !hidden;
    this.root.position.set(
      Math.min(0.49, aspect * 0.36) + Math.sin(time * 9) * moving * 0.014 - swing * 0.11,
      -0.475 + Math.abs(Math.sin(time * 9)) * moving * 0.018 + swing * 0.065,
      -0.82 - swing * 0.11,
    );
    this.root.rotation.set(swing * 0.34, -0.16 - swing * 0.31, -swing * 0.42);
  }

  dispose() {
    this.geometry.dispose();
    for (const material of this.materials) material.dispose();
  }
}

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { VehicleState } from "./physics";

// Original Solstice GT bodywork. Longitudinal cross sections make a continuous
// sculpted shell rather than a stack of boxes; +Z is the front of the vehicle.
function shell(sections: number[][]): THREE.BufferGeometry {
  const positions: number[] = [],
    indices: number[] = [];
  for (const [z, width, shoulder, crown] of sections) {
    for (const [x, y] of [
      [-width * 0.9, 0.32],
      [-width, shoulder * 0.78],
      [-width * 0.97, shoulder],
      [-width * 0.65, crown],
      [0, crown + 0.025],
      [width * 0.65, crown],
      [width * 0.97, shoulder],
      [width, shoulder * 0.78],
      [width * 0.9, 0.32],
    ])
      positions.push(x, y, z);
  }
  for (let i = 0; i < sections.length - 1; i++)
    for (let j = 0; j < 8; j++) {
      const a = i * 9 + j,
        b = a + 9;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
export interface CarModel {
  root: THREE.Group;
  body: THREE.Group;
  wheels: THREE.Group[];
  hubs: THREE.Group[];
  paint: THREE.MeshPhysicalMaterial;
  brake: THREE.MeshStandardMaterial;
  reverse: THREE.MeshStandardMaterial;
  animate: (s: VehicleState, brake: number, dt: number) => void;
}
export function createCar(color: string, ghost = false): CarModel {
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.78,
    roughness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    side: THREE.DoubleSide,
  });
  const carbon = new THREE.MeshStandardMaterial({
    color: 0x11161a,
    metalness: 0.3,
    roughness: 0.42,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x26363d,
    metalness: 0.35,
    roughness: 0.08,
    clearcoat: 1,
    transparent: true,
    opacity: 0.84,
    side: THREE.DoubleSide,
  });
  const rubber = new THREE.MeshStandardMaterial({
    color: 0x141519,
    roughness: 0.87,
  });
  const alloy = new THREE.MeshStandardMaterial({
    color: 0x9b9b94,
    metalness: 0.95,
    roughness: 0.24,
  });
  const brake = new THREE.MeshStandardMaterial({
    color: 0xff2414,
    emissive: 0xff1808,
    emissiveIntensity: 1.4,
  });
  const reverse = new THREE.MeshStandardMaterial({
    color: 0xcdd9dd,
    emissive: 0xe9f6ff,
    emissiveIntensity: 0.1,
  });
  const headlight = new THREE.MeshStandardMaterial({
    color: 0xfff4d3,
    emissive: 0xffedc2,
    emissiveIntensity: 3,
  });
  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = body,
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = !ghost;
    m.receiveShadow = !ghost;
    parent.add(m);
    return m;
  };
  const box = (
    w: number,
    h: number,
    d: number,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
    radius = 0.03,
    parent: THREE.Object3D = body,
  ) => add(new RoundedBoxGeometry(w, h, d, 2, radius), m, x, y, z, parent);
  add(
    shell([
      [-2.28, 0.84, 0.64, 0.72],
      [-2.05, 1.02, 0.85, 0.88],
      [-1.38, 1.04, 0.93, 0.86],
      [-0.72, 0.96, 0.84, 0.84],
      [0.35, 0.93, 0.76, 0.78],
      [1.25, 1.01, 0.83, 0.75],
      [1.91, 0.97, 0.64, 0.61],
      [2.26, 0.81, 0.49, 0.52],
    ]),
    paint,
    0,
    0,
    0,
  );
  add(
    shell([
      [-1.22, 0.76, 0.84, 0.88],
      [-0.62, 0.7, 1.22, 1.38],
      [0.18, 0.68, 1.26, 1.4],
      [0.92, 0.81, 0.77, 0.8],
    ]),
    glass,
    0,
    0,
    0,
  );
  box(1.34, 0.065, 0.83, paint, 0, 1.405, -0.2, 0.03);
  // Roof rails and pillars.
  for (const side of [-1, 1]) {
    const pillar = box(0.065, 0.07, 1.08, paint, side * 0.72, 1.08, 0.58);
    pillar.rotation.x = 0.63;
    const rearPillar = box(0.15, 0.08, 0.82, paint, side * 0.74, 1.13, -0.9);
    rearPillar.rotation.x = -0.66;
    box(0.055, 0.52, 0.06, carbon, side * 0.73, 1.04, -0.38);
    box(0.12, 0.1, 3.6, carbon, side * 0.99, 0.3, 0);
    box(0.32, 0.12, 0.22, paint, side * 1.04, 1.0, 0.56, 0.045);
    box(0.05, 0.035, 0.25, carbon, side * 0.965, 0.78, -0.26);
    box(0.1, 0.23, 0.65, carbon, side * 1.002, 0.52, -0.62);
    box(0.5, 0.055, 0.07, headlight, side * 0.64, 0.61, 2.02);
    box(0.66, 0.055, 0.075, brake, side * 0.56, 0.79, -2.12);
    box(0.22, 0.035, 0.06, reverse, side * 0.67, 0.5, -2.24);
    const exhaust = add(
      new THREE.CylinderGeometry(0.075, 0.085, 0.19, 16),
      alloy,
      side * 0.68,
      0.34,
      -2.22,
    );
    exhaust.rotation.x = Math.PI / 2;
    box(0.43, 0.52, 0.42, carbon, side * 0.39, 0.88, -0.44, 0.1);
    box(0.12, 0.18, 0.75, carbon, side * 0.48, 0.91, -1.68);
  }
  box(1.64, 0.19, 0.12, carbon, 0, 0.39, 2.19);
  box(1.88, 0.055, 0.45, carbon, 0, 0.28, 2.04);
  box(1.88, 0.06, 0.4, carbon, 0, 0.27, -2.09);
  box(1.7, 0.055, 0.24, paint, 0, 1.03, -1.88);
  for (let i = -3; i <= 3; i++)
    box(0.035, 0.16, 0.37, carbon, i * 0.19, 0.34, -2.16);
  box(0.48, 0.15, 0.035, carbon, 0, 0.59, -2.255);
  const badge = box(0.19, 0.025, 0.018, alloy, 0, 0.84, -2.155);
  badge.rotation.z = -0.2;
  const steeringWheel = add(
    new THREE.TorusGeometry(0.16, 0.022, 6, 24),
    carbon,
    0.38,
    1.02,
    0.44,
  );
  steeringWheel.rotation.x = -0.4;
  const wheels: THREE.Group[] = [],
    hubs: THREE.Group[] = [];
  for (const z of [1.32, -1.35])
    for (const side of [-1, 1]) {
      const hub = new THREE.Group();
      hub.position.set(side * 1.005, 0.38, z);
      root.add(hub);
      hubs.push(hub);
      const wheel = new THREE.Group();
      hub.add(wheel);
      wheels.push(wheel);
      const tire = add(
        new THREE.CylinderGeometry(0.365, 0.365, 0.285, 40, 1),
        rubber,
        0,
        0,
        0,
        wheel,
      );
      tire.rotation.z = Math.PI / 2;
      const rim = add(
        new THREE.CylinderGeometry(0.267, 0.267, 0.29, 32),
        carbon,
        0,
        0,
        0,
        wheel,
      );
      rim.rotation.z = Math.PI / 2;
      const lip = add(
        new THREE.TorusGeometry(0.268, 0.018, 8, 40),
        alloy,
        side * 0.154,
        0,
        0,
        wheel,
      );
      lip.rotation.y = Math.PI / 2;
      const disc = add(
        new THREE.CylinderGeometry(0.22, 0.22, 0.02, 32),
        alloy,
        side * 0.115,
        0,
        0,
        hub,
      );
      disc.rotation.z = Math.PI / 2;
      box(0.035, 0.16, 0.075, paint, side * 0.145, 0.035, -0.17, 0.01, hub);
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2,
          spoke = box(
            0.025,
            0.22,
            0.024,
            alloy,
            side * 0.161,
            Math.cos(a) * 0.135,
            Math.sin(a) * 0.135,
            0.006,
            wheel,
          );
        spoke.rotation.x = a;
      }
      const cap = add(
        new THREE.CylinderGeometry(0.065, 0.065, 0.035, 16),
        alloy,
        side * 0.17,
        0,
        0,
        wheel,
      );
      cap.rotation.z = Math.PI / 2;
    }
  // Batch rigid parts by material. Wheel rotation and steering remain separate
  // transforms, while spokes and trim no longer cost a draw call per piece.
  const batch = (group: THREE.Group) => {
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of [...group.children])
      if (child instanceof THREE.Mesh && !Array.isArray(child.material)) {
        child.updateMatrix();
        const geometry = (
          child.geometry.index
            ? child.geometry.toNonIndexed()
            : child.geometry.clone()
        ).applyMatrix4(child.matrix);
        geometry.deleteAttribute("uv");
        const bucket = buckets.get(child.material) ?? [];
        bucket.push(geometry);
        buckets.set(child.material, bucket);
        group.remove(child);
        child.geometry.dispose();
      }
    for (const [material, geometries] of buckets) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
      mesh.castShadow = !ghost;
      mesh.receiveShadow = !ghost;
      group.add(mesh);
      geometries.forEach((g) => g.dispose());
    }
  };
  batch(body);
  wheels.forEach(batch);
  hubs.forEach(batch);
  // Soft contact shadow stays stable even on the low preset.
  if (!ghost) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, "rgba(0,0,0,.6)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const m = add(
      new THREE.PlaneGeometry(3.6, 6),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        depthWrite: false,
      }),
      0,
      0.08,
      0,
      root,
    );
    m.rotation.x = -Math.PI / 2;
    m.castShadow = false;
  } else
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.MeshStandardMaterial;
        m.transparent = true;
        m.opacity = 0.22;
        m.depthWrite = false;
        m.color.set(0x9de1dc);
      }
    });
  return {
    root,
    body,
    wheels,
    hubs,
    paint,
    brake,
    reverse,
    animate(s, braking, dt) {
      body.rotation.z = THREE.MathUtils.damp(
        body.rotation.z,
        -s.yaw * Math.abs(s.speed) * 0.0025,
        7,
        dt,
      );
      body.rotation.x = THREE.MathUtils.damp(
        body.rotation.x,
        -s.acceleration * 0.004,
        7,
        dt,
      );
      body.position.y =
        Math.sin(s.x * 2.2 + s.z * 1.6) *
        Math.min(0.013, Math.abs(s.speed) * 0.0003);
      for (let i = 0; i < wheels.length; i++) {
        wheels[i].rotation.x += (s.speed / 0.365) * dt;
        if (i < 2) hubs[i].rotation.y = s.steering;
      }
      brake.emissiveIntensity = braking > 0.05 ? 5 : 1.2;
      reverse.emissiveIntensity = s.speed < -0.3 ? 3 : 0.05;
    },
  };
}

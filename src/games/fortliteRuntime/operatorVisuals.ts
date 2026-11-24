import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type PaintedPart = [geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation];

function makePaintedMesh(parts: PaintedPart[], material: THREE.Material): THREE.Mesh {
  const geometries = parts.map(([geometry, value]) => {
    const color = new THREE.Color(value);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      color.toArray(colors, i);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
  for (const geometry of geometries) geometry.dispose();
  return mesh;
}

export function createOperatorAppearance(color: number, accent: number) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const jacket = new THREE.Color(color).lerp(new THREE.Color(0x555a57), 0.60);
  const marker = new THREE.Color(accent).lerp(new THREE.Color(0xad9570), 0.45);
  const trousers = 0x3b403b;
  const canvas = 0x6b634d;
  const harness = 0x292f31;

  const torso = makePaintedMesh([
    [new THREE.CylinderGeometry(0.37, 0.31, 0.88, 8).scale(1.12, 1, 0.72).translate(0, 0.12, 0), jacket],
    [new THREE.CylinderGeometry(0.31, 0.29, 0.41, 8).scale(1.05, 1, 0.76).translate(0, -0.40, 0), trousers],
    [new THREE.BoxGeometry(0.48, 0.62, 0.28).translate(0, 0.05, -0.31), canvas],
    [new THREE.BoxGeometry(0.40, 0.20, 0.07).translate(0, -0.10, -0.474), 0x55513d],
    [new THREE.BoxGeometry(0.07, 0.80, 0.055).translate(-0.15, 0.04, -0.478), harness],
    [new THREE.BoxGeometry(0.07, 0.80, 0.055).translate(0.15, 0.04, -0.478), harness],
    [new THREE.BoxGeometry(0.20, 0.085, 0.042).translate(0, 0.22, -0.48), marker],
    [new THREE.BoxGeometry(0.36, 0.34, 0.09).translate(0, 0.03, 0.23), harness]
  ], material);

  const helmet = makePaintedMesh([
    [new THREE.SphereGeometry(0.265, 10, 7).scale(0.87, 1.07, 0.88).translate(0, -0.07, 0.035), 0xb68f72],
    [new THREE.SphereGeometry(0.31, 12, 7, 0, Math.PI * 2, 0, 1.98).scale(1, 0.89, 1.02).translate(0, 0.02, -0.025), 0x4e594d],
    [new THREE.BoxGeometry(0.39, 0.108, 0.08).translate(0, -0.035, 0.25), 0x26343a],
    [new THREE.BoxGeometry(0.21, 0.07, 0.032).translate(0, -0.055, -0.309), marker]
  ], material);

  const sleeve = makePaintedMesh([
    [new THREE.CylinderGeometry(0.125, 0.09, 0.67, 6).translate(0, -0.33, 0), jacket],
    [new THREE.BoxGeometry(0.19, 0.24, 0.17).translate(0, -0.74, 0.02), harness]
  ], material);
  const boot = makePaintedMesh([
    [new THREE.CylinderGeometry(0.138, 0.095, 0.78, 6).translate(0, -0.36, 0), trousers],
    [new THREE.BoxGeometry(0.205, 0.24, 0.29).translate(0, -0.79, 0.05), harness]
  ], material);

  // Torso and helmet hang from the original animated hit targets.
  // The raycaster can skip these purely visual meshes.
  torso.raycast = () => {};
  helmet.raycast = () => {};
  return { torso, helmet, sleeve, boot };
}

function canopyPoint(u: number, v: number, target: THREE.Vector3): THREE.Vector3 {
  const span = 2 * u - 1;
  const chord = 2 * v - 1;
  const cell = Math.cos(2 * Math.PI * u * 8);
  return target.set(
    span * (2.5 - 0.14 * chord * chord),
    4.23 + (1 - span * span) * 0.92 + (1 - chord * chord) * (0.31 - 0.065 * cell),
    chord * (0.90 - 0.17 * span * span) - 0.41 * span * span
  );
}

export function createParafoil(color: number, accent: number, detailed: boolean): THREE.Group {
  const geometry = new THREE.PlaneGeometry(1, 1, detailed ? 32 : 24, detailed ? 6 : 4);
  const positions = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const colors = new Float32Array(positions.count * 3);
  const fabric = new THREE.Color(color).lerp(new THREE.Color(0x456168), 0.43);
  const stripe = new THREE.Color(0xd7ad70);
  const hem = new THREE.Color(accent).lerp(new THREE.Color(0x31464b), 0.72);
  const shade = new THREE.Color();
  const point = new THREE.Vector3();

  for (let i = 0; i < positions.count; i += 1) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    canopyPoint(u, v, point);
    positions.setXYZ(i, point.x, point.y, point.z);
    const span = Math.abs(2 * u - 1);
    const stitch = 0.88 - 0.12 * Math.cos(2 * Math.PI * u * 8);
    shade.copy(fabric)
      .lerp(stripe, THREE.MathUtils.smoothstep(span, 0.55, 0.68) * (1 - THREE.MathUtils.smoothstep(span, 0.79, 0.89)))
      .lerp(hem, (v === 0 || v === 1) ? 0.58 : 0)
      .multiplyScalar(stitch)
      .toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const canopy = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide
  }));

  const ends: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    for (const span of [0.24, 0.45]) {
      for (const chord of [0.17, 0.83]) {
        ends.push(
          new THREE.Vector3(side * 0.31, 1.77, (chord - 0.5) * 0.36),
          canopyPoint(0.5 + side * span, chord, new THREE.Vector3())
        );
      }
    }
  }
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(ends),
    new THREE.LineBasicMaterial({ color: 0xdde2d9, transparent: true, opacity: 0.74 })
  );

  const group = new THREE.Group();
  group.add(canopy, lines);
  group.visible = false;
  return group;
}

import * as THREE from "three";

// Longitudinal sections describe the shell from the rear toward the front (+Z).
export function shell(sections: number[][], capped = false): THREE.BufferGeometry {
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
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  if (capped) {
    // The bumper faces need their own vertices so their flat normals don't
    // distort the reflections across the curved fenders.
    for (const ring of [0, sections.length - 1]) {
      const start = positions.length / 3;
      positions.push(...positions.slice(ring * 27, ring * 27 + 27));
      for (let j = 1; j < 8; j += 1) {
        if (ring === 0) indices.push(start, start + j, start + j + 1);
        else indices.push(start, start + j + 1, start + j);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function roofPanel(sections: number[][]): THREE.BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const [z, width, height] of sections) {
    vertices.push(-width, height - 0.035, z, 0, height, z, width, height - 0.035, z);
  }
  for (let i = 0; i < sections.length - 1; i += 1) {
    const a = i * 3;
    indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const panel = new THREE.BufferGeometry();
  panel.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  panel.setIndex(indices);
  panel.computeVertexNormals();
  return panel;
}

interface BodyParts {
  add: (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => THREE.Mesh;
  box: (width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number, radius?: number) => THREE.Mesh;
  paint: THREE.Material;
  carbon: THREE.Material;
  glass: THREE.Material;
  alloy: THREE.Material;
  brake: THREE.Material;
  reverse: THREE.Material;
  headlight: THREE.Material;
}

export function buildRidgeBody(parts: BodyParts): void {
  const { add, box, paint, carbon, glass, alloy, brake, reverse, headlight } = parts;
  add(shell([
    [-2.24, 0.84, 0.69, 0.79],
    [-2.05, 0.98, 0.85, 0.88],
    [-1.28, 1.075, 0.97, 0.92],
    [-0.66, 1.01, 0.91, 0.91],
    [0.12, 0.90, 0.84, 0.87],
    [0.81, 0.93, 0.86, 0.80],
    [1.31, 1.025, 0.92, 0.77],
    [1.78, 0.96, 0.82, 0.70],
    [2.14, 0.84, 0.60, 0.62],
  ], true), paint, 0, 0, 0);
  add(shell([
    [-1.86, 0.75, 0.82, 0.88],
    [-1.43, 0.74, 0.97, 1.02],
    [-0.94, 0.70, 1.10, 1.22],
    [-0.48, 0.68, 1.18, 1.35],
    [0.03, 0.66, 1.17, 1.35],
    [0.46, 0.70, 1.05, 1.17],
    [0.81, 0.75, 0.81, 0.86],
  ]), glass, 0, 0, 0);
  add(roofPanel([[-0.67, 0.41, 1.332], [-0.48, 0.46, 1.389], [-0.04, 0.455, 1.389], [0.15, 0.415, 1.333]]),
    paint, 0, 0, 0);
  box(1.73, 0.08, 0.36, carbon, 0, 0.27, 2.00);
  box(1.69, 0.1, 0.23, carbon, 0, 0.34, -2.16);
  box(1.56, 0.043, 0.046, brake, 0, 0.746, -2.25, 0.012);
  box(1.27, 0.053, 0.038, carbon, 0, 0.32, -2.246, 0.012);
  box(0.26, 0.055, 0.05, reverse, 0, 0.54, -2.258);

  const wing = box(1.96, 0.075, 0.42, carbon, 0, 1.57, -1.92);
  wing.rotation.x = -0.12;
  for (const side of [-1, 1]) {
    // Oval headlamps sit over the rounded front fenders.
    const lamp = new THREE.SphereGeometry(1, 16, 8).scale(0.155, 0.075, 0.22).rotateX(-0.22);
    add(lamp, headlight, side * 0.72, 0.793, 1.74);
    box(0.31, 0.095, 0.07, carbon, side * 0.62, 0.42, 2.15);
    box(0.12, 0.028, 0.30, carbon, side * 0.41, 0.765, 1.36);
    box(0.26, 0.10, 0.21, paint, side * 0.89, 1.03, 0.38, 0.045);
    box(0.065, 0.18, 0.42, carbon, side * 0.991, 0.45, -0.67);
    box(0.11, 0.09, 2.55, carbon, side * 0.953, 0.31, 0.03);
    box(0.07, 0.19, 0.047, carbon, side * 0.675, 1.13, -0.38);
    const upright = box(0.062, 0.56, 0.12, carbon, side * 0.57, 1.27, -1.81);
    upright.rotation.x = -0.36;
    box(0.052, 0.17, 0.45, carbon, side * 0.965, 1.55, -1.918);
    add(new THREE.CylinderGeometry(0.066, 0.073, 0.20, 14).rotateX(Math.PI / 2),
      alloy, side * 0.145, 0.39, -2.25);
  }
  for (let i = -2; i <= 2; i += 1) {
    box(0.032, 0.13, 0.28, carbon, i * 0.22, 0.30, -2.18);
  }
}

export function buildVentoBody(parts: BodyParts): void {
  const { add, box, paint, carbon, glass, alloy, brake, reverse, headlight } = parts;
  add(shell([
    [-2.30, 0.86, 0.75, 0.82],
    [-2.10, 1.04, 0.86, 0.88],
    [-1.26, 1.095, 0.86, 0.84],
    [-0.60, 1.035, 0.79, 0.80],
    [0.38, 0.98, 0.74, 0.75],
    [1.29, 1.04, 0.70, 0.66],
    [1.89, 0.96, 0.56, 0.56],
    [2.30, 0.79, 0.45, 0.47],
  ], true), paint, 0, 0, 0);
  add(shell([
    [-1.68, 0.80, 0.79, 0.82],
    [-0.86, 0.72, 0.99, 1.10],
    [-0.42, 0.65, 1.09, 1.22],
    [0.13, 0.63, 1.10, 1.21],
    [0.92, 0.77, 0.72, 0.78],
  ]), glass, 0, 0, 0);
  add(roofPanel([[-0.57, 0.39, 1.218], [-0.42, 0.435, 1.26], [0.07, 0.42, 1.25], [0.24, 0.39, 1.185]]),
    paint, 0, 0, 0);
  box(0.29, 0.07, 0.52, carbon, 0, 1.269, -0.24);
  const fin = box(0.065, 0.24, 1.13, paint, 0, 1.067, -1.03);
  fin.rotation.x = -0.24;
  box(1.86, 0.075, 0.46, carbon, 0, 0.27, 2.12);
  box(1.97, 0.11, 0.39, carbon, 0, 0.29, -2.18);
  box(1.27, 0.14, 0.055, carbon, 0, 0.65, -2.30);
  box(1.94, 0.066, 0.36, carbon, 0, 1.14, -1.99);
  box(0.24, 0.035, 0.057, reverse, 0, 0.48, -2.27);

  for (const side of [-1, 1]) {
    const front = box(0.28, 0.042, 0.073, headlight, side * 0.65, 0.541, 2.155, 0.012);
    front.rotation.y = side * -0.34;
    const frontHook = box(0.064, 0.039, 0.23, headlight, side * 0.76, 0.583, 2.06, 0.012);
    frontHook.rotation.y = side * -0.62;
    box(0.39, 0.115, 0.11, carbon, side * 0.55, 0.37, 2.205);
    const intake = box(0.115, 0.26, 0.68, carbon, side * 1.011, 0.56, -0.59, 0.05);
    intake.rotation.x = -0.25;
    box(0.105, 0.09, 2.68, carbon, side * 1.0, 0.32, 0.04);
    box(0.29, 0.092, 0.18, paint, side * 0.925, 0.96, 0.46, 0.034);
    box(0.09, 0.36, 0.14, carbon, side * 0.57, 0.99, -1.87);
    box(0.05, 0.19, 0.37, carbon, side * 0.96, 1.11, -1.98);

    // Three segments make the rear lamp fork visible from the chase camera.
    box(0.26, 0.036, 0.049, brake, side * 0.51, 0.765, -2.314, 0.012);
    for (const arm of [-1, 1]) {
      const segment = box(0.225, 0.036, 0.049, brake, side * 0.72, 0.765 + arm * 0.046, -2.296, 0.012);
      segment.rotation.z = arm * side * 0.43;
    }
    add(new THREE.CylinderGeometry(0.087, 0.078, 0.16, 6).rotateX(Math.PI / 2),
      alloy, side * 0.32, 0.58, -2.315);
  }
  for (let i = -3; i <= 3; i += 1) {
    box(0.035, 0.17, 0.36, carbon, i * 0.22, 0.31, -2.21);
  }
}

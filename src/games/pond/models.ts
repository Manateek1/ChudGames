import * as T from "three";
import { seededRandom } from "../../engine/math";

// Static pieces share geometry, material and a draw call per primitive.
export function sculpt(parent: T.Object3D) {
  const shapes = {
    box: new T.BoxGeometry(),
    stone: new T.DodecahedronGeometry(0.5),
    ball: new T.IcosahedronGeometry(0.5, 1),
    post: new T.CylinderGeometry(0.5, 0.54, 1, 9),
    cone: new T.ConeGeometry(0.5, 1, 7),
    pad: new T.CylinderGeometry(0.5, 0.48, 1, 14, 1, false, 0.18, 5.95),
  };
  const material = new T.MeshStandardMaterial({ roughness: 0.93, flatShading: true });
  type Shape = keyof typeof shapes;
  const batches = new Map<Shape, { matrix: T.Matrix4; color: T.Color }[]>();
  const dummy = new T.Object3D();
  function put(
    shape: Shape,
    color: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    dummy.position.set(x, y, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.set(rx, ry, rz);
    dummy.updateMatrix();
    const batch = batches.get(shape) ?? [];
    batch.push({ matrix: dummy.matrix.clone(), color: new T.Color(color) });
    batches.set(shape, batch);
  }
  function finish() {
    for (const [key, items] of batches) {
      const mesh = new T.InstancedMesh(shapes[key], material, items.length);
      items.forEach((item, i) => {
        mesh.setMatrixAt(i, item.matrix);
        mesh.setColorAt(i, item.color);
      });
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
    }
    // Unused primitives have no scene node to own their disposal.
    for (const [key, geo] of Object.entries(shapes)) if (!batches.has(key as Shape)) geo.dispose();
  }
  return { put, finish };
}
type Put = ReturnType<typeof sculpt>["put"];

const wood = "#875334",
  rail = "#c99059",
  cream = "#ffe7b2";
export function house(p: Put, x: number, z: number, s: number, roof: string, base = 0.13) {
  const add: Put = (shape, c, dx, y, dz, w, h, d, rx, ry, rz) =>
    p(shape, c, x + dx * s, base + y * s, z + dz * s, w * s, h * s, d * s, rx, ry, rz);
  add("box", "#ac8253", 0, 0.14, 0, 3.2, 0.28, 2.65);
  add("box", cream, 0, 1.05, 0, 2.85, 1.85, 2.25);
  add("box", wood, 0, 0.85, 1.14, 0.75, 1.48, 0.09);
  for (const dx of [-1.35, -0.87, 0.87, 1.35]) add("box", wood, dx, 1, 1.15, 0.12, 1.84, 0.13);
  add("box", wood, 0, 1.65, 1.18, 2.86, 0.14, 0.12);
  for (const dx of [-0.85, 0.85]) {
    add("box", "#427774", dx, 1.09, 1.18, 0.64, 0.64, 0.09);
    add("box", cream, dx, 1.09, 1.24, 0.055, 0.65, 0.03);
    add("box", cream, dx, 1.09, 1.24, 0.65, 0.055, 0.03);
  }
  for (const side of [-1, 1]) {
    add("box", wood, 1.45, 1.05, side * 0.74, 0.1, 1.75, 0.1);
    add("box", wood, -1.45, 1.05, side * 0.74, 0.1, 1.75, 0.1);
    add("post", "#a03429", side * 1.59, 1.57, 1.33, 0.34, 0.4, 0.34);
    add("post", "#ebba59", side * 1.59, 1.31, 1.33, 0.12, 0.14, 0.12);
    add("box", roof, 0, 2.19, side * 0.72, 3.65, 0.19, 1.8, side * 0.43);
    for (let i = -7; i <= 7; i++)
      add("box", roof, i * 0.244, 2.3, side * 0.72, 0.071, 0.11, 1.83, side * 0.43);
    add("box", wood, 0, 1.83, side * 1.52, 3.65, 0.12, 0.14);
  }
  add("box", "#37544c", 0, 2.62, 0, 3.85, 0.17, 0.24);
  for (const dx of [-1.85, 1.85]) add("box", roof, dx, 2.72, 0, 0.28, 0.17, 0.24, 0, 0, Math.sign(dx) * 0.45);
}
export function tree(p: Put, x: number, z: number, s: number, fruit = false) {
  p("post", wood, x, 0.9 * s, z, 0.36 * s, 1.8 * s, 0.4 * s);
  p("post", wood, x + 0.25 * s, 1.4 * s, z, 0.18 * s, 0.9 * s, 0.19 * s, 0, 0, -0.55);
  for (const [dx, dy, dz, size, color] of [
    [-0.48, 1.9, -0.15, 1.4, "#43875c"],
    [0.47, 2.05, 0.1, 1.65, "#68a154"],
    [0, 2.62, -0.07, 1.55, "#84af57"],
    [-0.25, 2, 0.53, 1.3, "#579e65"],
  ] as const)
    p("stone", color, x + dx * s, dy * s, z + dz * s, size * s, size * 0.95 * s, size * s, 0, x);
  if (fruit)
    for (let j = 0; j < 8; j++)
      p(
        "ball",
        "#883f58",
        x + Math.sin(j * 4) * s * 0.75,
        (2 + 0.24 * Math.sin(j)) * s,
        z + Math.cos(j * 4) * s * 0.72,
        0.16 * s,
        0.22 * s,
        0.16 * s,
      );
}
export function dock(p: Put, x: number, z: number, n: number) {
  for (let i = 0; i < n; i++) p("box", i % 2 ? rail : "#d9a973", x, 0.37, z + i * 0.32, 1.43, 0.16, 0.29);
  for (const dx of [-0.65, 0.65])
    for (const dz of [0, (n - 1) * 0.32]) {
      p("post", wood, x + dx, 0.25, z + dz, 0.18, 1, 0.18);
      p("post", "#e7bd80", x + dx, 0.77, z + dz, 0.22, 0.08, 0.22);
    }
}
export function crate(p: Put, x: number, z: number, s = 1) {
  p("box", "#c98c47", x, 0.41 * s, z, 0.9 * s, 0.82 * s, 0.76 * s);
  for (const dy of [0.12, 0.69]) p("box", wood, x, dy * s, z, 0.94 * s, 0.09 * s, 0.8 * s);
  p("box", "#edd39b", x, 0.42 * s, z + 0.39 * s, 0.1 * s, 0.92 * s, 0.06 * s, 0, 0, -0.86);
}
export function landscape(p: Put) {
  house(p, -5, -4.9, 1.13, "#427a73");
  dock(p, -4.95, -3.6, 9);
  crate(p, -2.6, -4.1);
  crate(p, -2, -4.8, 0.75);
  // A striped market awning and the harvest waiting at the roadside.
  for (const x of [3.75, 6]) for (const z of [4.4, 5.65]) p("post", wood, x, 0.96, z, 0.14, 1.9, 0.14);
  p("box", wood, 4.87, 0.58, 5.06, 2.48, 0.18, 1.4);
  for (let i = 0; i < 7; i++) {
    const c = i % 2 ? "#fff0cd" : "#d87045";
    p("box", c, 3.7 + i * 0.39, 1.97, 5.03, 0.4, 0.15, 1.92, 0.12);
    p("box", c, 3.7 + i * 0.39, 1.77, 5.96, 0.4, 0.24, 0.09);
  }
  for (const dx of [4.1, 4.9, 5.7]) {
    p("box", rail, dx, 0.82, 5.1, 0.67, 0.32, 0.72);
    for (let j = 0; j < 4; j++)
      p(
        "stone",
        j % 2 ? "#e6bc57" : "#de8e48",
        dx + ((j % 2) - 0.5) * 0.22,
        1.02,
        4.95 + Math.floor(j / 2) * 0.25,
        0.23,
        0.18,
        0.23,
      );
  }
  for (const [x, z, s] of [
    [-8, -4.7, 1.2],
    [-7, -6.35, 1.16],
    [-0.85, -6.2, 1.03],
    [6, -5.8, 1.13],
    [8, -4.5, 1.42],
    [-8, 3, 1.15],
    [8, 2.4, 0.92],
  ])
    tree(p, x, z, s);
  for (const z of [-6.55, 6.3]) {
    for (let i = -3; i <= 3; i++) {
      const x = i * 2;
      if (z > 0 && x > 2) continue;
      p("box", rail, x, 0.57, z, 0.16, 1.05, 0.17);
      if (i < 3 && !(z > 0 && x === 2))
        for (const y of [0.38, 0.75]) p("box", "#d5aa71", x + 1, y, z, 2, 0.13, 0.12);
    }
  }
  for (let j = 0; j < 4; j++) {
    p("box", "#a9784b", -5.1, 0.13, 3.12 + j * 0.48, 3.5, 0.12, 0.38);
    for (let i = 0; i < 10; i++) {
      const x = -6.6 + i * 0.33,
        z = 3.12 + j * 0.48;
      p("cone", j % 2 ? "#93bd59" : "#77a852", x, 0.38, z, 0.29, 0.52, 0.34, 0, i, 0.16);
    }
  }
  for (let i = 0; i < 60; i++) {
    const a = i * 2.39996,
      x = Math.cos(a) * 7.05,
      z = Math.sin(a) * 3.74;
    if ((x < -4 && z < -1) || (x > 3.3 && z > 2.4)) continue;
    if (i % 3 === 0) p("stone", "#a9b7a0", x, 0.16, z, 0.54, 0.36, 0.42, 0, i);
    else
      for (let j = 0; j < 3; j++)
        p(
          "cone",
          j % 2 ? "#819e4f" : "#a6b951",
          x + j * 0.08,
          0.28,
          z,
          0.14,
          0.6,
          0.14,
          0,
          0,
          (j - 1) * 0.28,
        );
  }
  const random = seededRandom(238);
  // Scatter stone edging and flower clusters along the curving banks.
  for (let i = 0; i < 92; i++) {
    const a = (i * 2 * Math.PI) / 92,
      c = Math.cos(a),
      t = Math.sin(a);
    const r = 1 + 0.022 * Math.sin(a * 5) + 0.014 * Math.cos(a * 3);
    const x = 6.94 * Math.sign(c) * Math.abs(c) ** 0.87 * r,
      z = 3.69 * Math.sign(t) * Math.abs(t) ** 0.83 * r;
    if ((Math.abs(x + 4.95) < 0.86 && z < 0) || (Math.abs(x - 4.9) < 0.75 && z < 0)) continue;
    const size = 0.22 + random() * 0.32;
    p(
      "stone",
      ["#a8ad88", "#b7b195", "#b4b798", "#979e88"][i % 4],
      x,
      0.17,
      z,
      size * 1.25,
      size * 0.73,
      size,
      0,
      a,
    );
  }
  for (let i = 0; i < 38; i++) {
    const x = random() * 17.4 - 8.7,
      z = random() * 12.9 - 6.45;
    if ((x / 7.4) ** 2 + (z / 4.2) ** 2 < 1.05 || Math.abs(z - 5.45) < 0.75 || Math.abs(z + 4.56) < 0.55)
      continue;
    for (let j = 0; j < 4; j++) {
      const dx = x + random() * 0.45,
        dz = z + random() * 0.5;
      p("cone", "#67904e", dx, 0.21, dz, 0.18, 0.35, 0.19, 0, 0, 0.21);
      p("ball", i % 2 ? "#f6ce66" : "#c78db8", dx, 0.39, dz, 0.13, 0.12, 0.14);
    }
  }
  for (let i = 0; i < 42; i++) {
    const x = random() * 15 - 7,
      z = 5.45 + (random() - 0.5) * 1.17;
    p("stone", "#c4ad7a", x, 0.13, z, 0.14 + random() * 0.28, 0.025, 0.09 + random() * 0.16, 0, i);
  }
  for (let i = 0; i < 15; i++) {
    const a = i * 1.7,
      x = Math.cos(a) * (5.9 + (i % 3) * 0.12),
      z = Math.sin(a) * 2.62;
    p("pad", "#6eab75", x, 0.18, z, 0.47, 0.045, 0.4, 0, a);
    if (i % 4 === 0) p("ball", "#f7bac1", x, 0.24, z, 0.19, 0.15, 0.18);
  }
}

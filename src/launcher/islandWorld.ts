import * as T from "three";
import { addLandmarks } from "./islandLandmarks";
import { addClouds, addLandscape, addOcean, addRiver, addVegetation, islandLight, reserveScenery } from "./islandLandscape";
import { circuit, crossRoad, groundHeight, makeRoads, ROAD_WIDTH, type Gate, type Point } from "./islandRoads";
import { createScenery, type Scenery } from "./islandScenery";

function signTexture(title: string, accent: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#19242d";
  ctx.fillRect(0, 0, 1024, 160);
  ctx.strokeStyle = "#ffe6b4";
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, 1008, 144);
  ctx.fillStyle = accent;
  ctx.fillRect(21, 19, 9, 122);
  ctx.fillRect(994, 19, 9, 122);
  ctx.fillStyle = "#fff5dc";
  ctx.font = "italic 900 111px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title.toUpperCase(), 512, 79, 920);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addRoads(scene: T.Scene, gates: readonly Gate[]) {
  const positions: number[] = [], colors: number[] = [];
  const half = ROAD_WIDTH / 2;
  const asphalt = "#4d505b";
  const paths = [circuit, crossRoad, ...gates.map((gate) => gate.approach)];
  const junctions = [crossRoad[0], crossRoad.at(-1)!, ...gates.map((gate) => gate.approach[0])];

  for (const [pathIndex, path] of paths.entries()) {
    const closed = pathIndex === 0;
    const lift = closed ? .25 : pathIndex === 1 ? .30 : .35;
    const points = path.flatMap((point, i) => {
      if (i === 0) return [point];
      const from = path[i - 1];
      const pieces = Math.ceil(Math.hypot(point.x - from.x, point.z - from.z) / .8);
      return Array.from({ length: pieces }, (_, j) => ({
        x: T.MathUtils.lerp(from.x, point.x, (j + 1) / pieces),
        z: T.MathUtils.lerp(from.z, point.z, (j + 1) / pieces),
      }));
    });
    const normals = points.map((point, i) => {
      const a = points[i - 1] ?? (closed ? points.at(-2)! : point);
      const b = points[i + 1] ?? (closed ? points[1] : point);
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      return { x: (b.z - a.z) / length, z: (a.x - b.x) / length };
    });
    function surface(point: Point, normal: Point, offset: number) {
      const x = point.x + offset * normal.x;
      const z = point.z + offset * normal.z;
      return [x, groundHeight(x, z) + lift, z];
    }
    let traveled = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const an = normals[i - 1], bn = normals[i];
      traveled += Math.hypot(b.x - a.x, b.z - a.z);
      const clip = junctions.some((point) => Math.hypot((a.x + b.x) / 2 - point.x, (a.z + b.z) / 2 - point.z) < half + .6);
      const kerb = Math.floor(traveled / 1.15) % 2 === 0 ? "#be5c50" : "#efdbbe";
      const paint = Math.floor(traveled / 2.05) % 2 === 0 ? "#f8e9c9" : asphalt;
      const lines = ["#c4a587", kerb, "#eee2c9", asphalt, paint, asphalt, "#eee2c9", kerb, "#c4a587"];
      const offsets = [-half - .42, -half - .17, -half + .03, -half + .15, -.07, .07,
        half - .15, half - .03, half + .17, half + .42];
      for (const [strip, color] of lines.entries()) {
        if (clip && (strip === 0 || strip === lines.length - 1)) continue;
        const [r, g, blue] = new T.Color(clip ? asphalt : color).toArray();
        const al = surface(a, an, offsets[strip]);
        const ar = surface(a, an, offsets[strip + 1]);
        const bl = surface(b, bn, offsets[strip]);
        const br = surface(b, bn, offsets[strip + 1]);
        for (const vertex of [al, bl, ar, ar, bl, br]) {
          positions.push(...vertex);
          colors.push(r, g, blue);
        }
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const road = new T.Mesh(geometry, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }));
  road.receiveShadow = true;
  scene.add(road);
}

function addGate(scene: T.Scene, scenery: Scenery, gate: Gate) {
  const { add } = scenery;
  const { x, z, color, angle } = gate;
  const y = groundHeight(x, z) + .32;
  const checkered = gate.id === "apex-run";
  const fort = gate.id === "fortlite";
  const frame = fort ? "#c0a180" : checkered ? "#353840" : color;
  const c = Math.cos(angle), s = Math.sin(angle);
  for (const side of [-1, 1]) {
    const px = x + side * c * 4.43, pz = z + side * s * 4.43;
    add("box", frame, px, y + 1.93, pz, .81, 3.86, 1.1, -angle);
    add("box", "#ddbd99", px, y + .28, pz, 1.08, .53, 1.34, -angle);
    for (const h of [.75, 3.29]) add("box", "#f6dcaa", px, y + h, pz, .87, .14, 1.16, -angle);
    add("box", frame, px, y + 4.07, pz, 1.12, .4, 1.4, -angle);
    if (checkered || fort) {
      add("post", "#9f733e", px + side * .6, y + 3.6, pz, .103, 3.9, .103);
      add("flag", "#d74b44", px + side * 1.35, y + 5.19, pz, 1.45, .84, 1.4, side < 0 ? Math.PI : 0);
    }
  }
  add("box", frame, x, y + 3.75, z, 9.65, .96, 1.32, -angle);
  add("box", checkered ? "#e9e2d9" : "#e5c4a2", x, y + 4.17, z, 9.83, .18, 1.42, -angle);
  if (checkered) {
    for (let row = 0; row < 2; row++) for (let col = 0; col < 18; col++) {
      add("box", (row + col) % 2 ? "#f6efdf" : "#30313b", x + (col - 8.5) * .49, y + 3.51 + row * .34,
        z + .674, .49, .34, .06);
    }
  }
  const sign = new T.Mesh(
    new T.PlaneGeometry(gate.title.length > 12 ? 12.25 : 9.85, 1.76),
    new T.MeshBasicMaterial({ map: signTexture(gate.title, color) }),
  );
  sign.position.set(x, y + 4.62, z);
  sign.rotation.x = -.88;
  scene.add(sign);
}

export function buildIsland(scene: T.Scene, gates: readonly Gate[]) {
  let seed = 8142;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  islandLight(scene);
  addOcean(scene);
  addClouds(scene);
  const closestRoad = makeRoads(gates);
  const landHeight = addLandscape(scene, closestRoad, random);
  addRoads(scene, gates);
  addRiver(scene);

  const scenery = createScenery(scene);
  const occupied = reserveScenery();
  addLandmarks(scene, scenery, landHeight, occupied.reserve);
  for (const gate of gates) {
    occupied.reserve(gate.x, gate.z, 6);
    addGate(scene, scenery, gate);
  }
  addVegetation(scenery, landHeight, closestRoad, occupied.contains, random);
  scenery.finish();
}

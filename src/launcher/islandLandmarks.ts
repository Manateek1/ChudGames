import * as T from "three";
import { creekAt, SEA_LEVEL } from "./islandLandscape";
import { circuit, groundHeight } from "./islandRoads";
import type { LandHeight, Reserve, Scenery } from "./islandScenery";

const stone = "#cbaa83";
const mortar = "#e1c7a0";
const wood = "#93613f";
const warm = "#ffe7af";
const dark = "#32343d";
const clay = "#b55036";

function stoneArch(
  scenery: Scenery, x: number, y: number, z: number, radius: number, depth: number,
  palette: readonly string[],
) {
  const slices = 15;
  const length = radius * Math.PI / slices + .09;
  for (let i = 0; i < slices; i++) {
    const a = (i + .5) * Math.PI / slices;
    scenery.add("box", palette[i % palette.length], x + Math.cos(a) * radius,
      y + Math.sin(a) * radius, z, length, .48, depth, 0, a - Math.PI / 2);
  }
}

function flag(scenery: Scenery, x: number, y: number, z: number, color: string, direction = 1) {
  const { add } = scenery;
  add("post", "#755a49", x, y + 1.36, z, .09, 2.73, .09);
  add("crown", "#efbf62", x, y + 2.73, z, .21, .25, .21);
  add("flag", color, x + direction * .85, y + 2.08, z + .1, 1.7, .95, 2, direction < 0 ? Math.PI : 0);
}

function arcadeVillage(scenery: Scenery, height: LandHeight, reserve: Reserve) {
  const { add, beam } = scenery;
  const x = 12.1, z = 35.9;
  const y = groundHeight(x, z) + .32;
  reserve(x, z + 2, 10.5);
  reserve(x + 1, 46, 5);
  add("post", "#c8a278", x, y - .36, z + 3.3, 19, .68, 13.9);
  add("post", "#e4be93", x, y - .01, z + 3.3, 18.8, .17, 13.65);
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 11; col++) {
      const px = (col - 5 + (row % 2) * .45) * 1.24;
      const pz = (row - 4.7) * .86;
      if (Math.hypot(px / 8.9, pz / 6.2) > .94) continue;
      add("box", ["#e4be93", "#dbb58d", "#ecc6a0"][(row * 11 + col) % 3], x + px,
        y + .09, z + 4 + pz, 1.19, .08, .81);
    }
  }
  for (const [offset, floors, awning] of [[-6.5, 2, "#d34283"], [6.35, 2, "#dc6c34"], [3.8, 3, "#d3445b"]] as const) {
    const bx = x + offset, bz = z - (floors === 3 ? 1.8 : .25);
    const h = floors * 1.83 + .5;
    add("box", stone, bx, y + h / 2, bz, 2.9, h, 3.9);
    add("roof", clay, bx, y + h + .46, bz, 3.45, .91, 4.45);
    add("box", mortar, bx, y + h - .21, bz, 3.04, .22, 4.05);
    for (let floor = 0; floor < floors; floor++) {
      for (const side of [-1, 1]) {
        add("box", "#825940", bx + side * .71, y + .88 + floor * 1.74, bz + 1.98, .62, .88, .15);
        add("box", floor % 2 ? "#476976" : "#ffd175", bx + side * .71, y + .93 + floor * 1.74,
          bz + 2.08, .42, .68, .14);
        add("box", mortar, bx + side * .71, y + .42 + floor * 1.74, bz + 2.03, .72, .12, .27);
      }
    }
    for (let i = 0; i < 8; i++) {
      add("box", i % 2 ? "#fff1cd" : awning, bx + (i - 3.5) * .387, y + 1.69,
        bz + 2.48, .39, .18, 1.3);
      add("box", i % 2 ? "#e6c99b" : awning, bx + (i - 3.5) * .387, y + 1.54, bz + 3.11, .39, .26, .14);
    }
    if (floors === 3) {
      const cy = y + h - .68;
      add("box", "#795832", bx, cy, bz + 2.0, .9, .9, .17);
      add("box", warm, bx, cy, bz + 2.1, .77, .77, .12);
      beam("#54464a", new T.Vector3(bx, cy + .28, bz + 2.19), new T.Vector3(bx, cy - .03, bz + 2.19), .075);
      beam("#54464a", new T.Vector3(bx, cy, bz + 2.19), new T.Vector3(bx + .24, cy - .08, bz + 2.19), .065);
    }
  }
  add("box", "#55436f", x, y + 2.06, z - .25, 9.5, 4.12, 3.5);
  add("box", "#331f40", x, y + 1.69, z + 1.55, 8.75, 3.38, .15);
  add("box", "#8d547f", x, y + .15, z + 2.09, 9.4, .16, 1.75);
  for (const side of [-1, 1]) {
    add("box", "#b07097", x + side * 4.73, y + 1.6, z + 1.69, .58, 3.2, .79);
    add("box", "#e09a56", x + side * 4.73, y + 1.53, z + 2.11, .24, 2.97, .14);
    add("box", "#a76690", x + side * 4.73, y + 3.15, z + 1.74, .85, .36, .99);
    add("post", "#ba6940", x + side * 5.25, y + .35, z + 2.26, .68, .59, .68);
    add("crown", "#8aab44", x + side * 5.25, y + .81, z + 2.24, .82, .62, .82);
  }
  const arcHeight = y + 1.8;
  stoneArch(scenery, x, arcHeight, z + .7, 4.65, 2.4, ["#664776", "#765086"]);
  stoneArch(scenery, x, arcHeight, z + 1.97, 4.59, .34, ["#af547f", "#b65b84"]);
  stoneArch(scenery, x, arcHeight, z + 2.14, 4.25, .17, ["#c47749", "#e7a358"]);
  for (let i = 2; i <= 26; i++) {
    const a = i * Math.PI / 28;
    add("crown", warm, x + Math.cos(a) * 4.25, arcHeight + Math.sin(a) * 4.25, z + 2.28, .18, .19, .19);
  }
  for (let i = -2; i <= 2; i++) {
    const px = x + i * 1.48;
    const color = ["#339ec4", "#df7cb6", "#f2ad3e", "#5ca5d4", "#a988d7"][i + 2];
    add("box", "#211e37", px, y + .83, z + 1.9, 1.02, 1.66, .91);
    add("box", color, px, y + 1.19, z + 2.39, .77, .6, .14);
    add("box", "#aef6ee", px, y + 1.23, z + 2.48, .52, .38, .08);
    add("box", color, px, y + .63, z + 2.39, .77, .16, .31);
  }

  const fx = x + .1, fz = z + 7.12;
  add("post", "#bd956b", fx, y + .19, fz, 4.25, .46, 4.25);
  add("post", "#f7d6a2", fx, y + .43, fz, 4.02, .22, 4.02);
  add("post", "#40bac0", fx, y + .56, fz, 3.62, .11, 3.62);
  add("post", warm, fx, y + .84, fz, .58, .72, .58);
  add("tower", "#ecd1a1", fx, y + 1.18, fz, 1.88, .29, 1.88);
  add("post", "#78d8d4", fx, y + 1.34, fz, 1.42, .09, 1.42);
  add("cone", "#b8f3ec", fx, y + 1.75, fz, .35, .9, .35);
  for (const dx of [-6, 5.9]) {
    const lx = x + dx, lz = z + 6.1;
    add("post", "#433f40", lx, y + 1.25, lz, .17, 2.45, .17);
    add("box", "#51483d", lx, y + 2.17, lz, 1.1, .11, .1);
    for (const offset of [-.49, .49]) {
      add("box", "#ffdf92", lx + offset, y + 2.16, lz, .24, .37, .25);
      add("roof", "#51483d", lx + offset, y + 2.4, lz, .38, .21, .39);
    }
  }
  const px = x + 2.7, pz = 46.8;
  const deck = height(px, pz) + .07;
  for (let j = 0; j < 20; j++) {
    const p = pz + j * .54;
    add("box", j % 3 ? "#a47045" : "#bb8551", px, deck, p, 2.55, .22, .52);
    if (j % 4 === 0) for (const side of [-1, 1]) {
      const pile = deck - SEA_LEVEL + .21;
      add("post", wood, px + side * 1.17, deck - pile / 2 + .35, p, .29, pile, .29);
      add("post", "#e0b67d", px + side * 1.17, deck + .44, p, .34, .16, .34);
    }
  }
  add("box", wood, px, deck - .24, pz + 5.13, 2.4, .21, 10.65);
}

function blockVillage(scenery: Scenery, height: LandHeight, reserve: Reserve) {
  const { add, beam } = scenery;
  reserve(-30, -1, 10.8);
  for (const [i, [x, z, stories]] of [
    [-33.6, -5.2, 2], [-28.1, -6.1, 3], [-25.3, -1.4, 2], [-30.7, -.1, 3],
    [-34.8, 1.7, 2], [-28.7, 4.6, 1], [-33.4, 6.2, 1],
  ].entries()) {
    const palettes = [["#eaad3c", "#ffcb63"], ["#bf595a", "#ed8c77"], ["#41a5ab", "#7dc7bd"],
      ["#d98239", "#f6b45f"], ["#e4bb90", "#f9d7b3"]];
    const [wall, edge] = palettes[i % palettes.length];
    const y = height(x, z);
    const h = 1.45 * stories;
    add("box", stone, x, y + .12, z, 4.15, .99, 4.06);
    add("box", mortar, x, y + .6, z, 4.24, .17, 4.17);
    add("box", wall, x, y + .58 + h / 2, z, 3.24, h, 3.18);
    for (let row = 0; row < stories; row++) {
      add("box", edge, x, y + .63 + (row + 1) * 1.45, z, 3.42, .21, 3.37);
      for (const side of [-1, 1]) {
        const frameY = y + 1.36 + row * 1.45;
        add("box", "#3c4c56", x + side * .77, frameY, z + 1.613, .78, .81, .11);
        add("box", "#ffdd92", x + side * .77, frameY, z + 1.68, .5, .5, .12);
        add("box", "#465859", x + 1.626, frameY, z + side * .77, .11, .79, .76);
      }
    }
    add("box", edge, x - .97, y + .93 + h, z - .85, .78, .63, .79);
    add("box", edge, x + .97, y + .93 + h, z - .85, .78, .63, .79);
    for (let j = 0; j < 4; j++) {
      add("box", mortar, x, y + .44 - j * .16, z + 2.07 + j * .29, 1.86, .24, .32);
    }
  }
  const x = -33.7, z = -9.4;
  const y = height(x, z) + .25;
  const brass = "#eeb447", shadedBrass = "#bd7930";
  reserve(x, z, 2.5);
  add("box", stone, x, y, z, 2.55, .56, 2.54);
  for (const dx of [-.51, .51]) {
    for (const dz of [-.51, .51]) add("box", brass, x + dx, y + 5, z + dz, .22, 10.2, .22);
    for (let j = 0; j < 9; j++) {
      const bh = y + .36 + j * 1.08;
      add("box", brass, x + dx, bh, z, .18, .13, 1.15);
      add("box", brass, x, bh, z + dx, 1.15, .13, .18);
      beam(shadedBrass, new T.Vector3(x - .51, bh, z + dx),
        new T.Vector3(x + .51, bh + 1.08, z + dx), .1);
      beam(shadedBrass, new T.Vector3(x + dx, bh, z + .51),
        new T.Vector3(x + dx, bh + 1.08, z - .51), .1);
    }
  }
  add("box", brass, x + 2.8, y + 9.52, z, 13.4, .32, .61);
  add("box", brass, x + 2.8, y + 10.47, z, 13.4, .23, .39);
  add("box", shadedBrass, x - 3.42, y + 9.19, z, 1.46, .72, .89);
  for (let j = 0; j < 11; j++) {
    const dx = x - 3.5 + j * 1.16;
    beam(brass, new T.Vector3(dx, y + 9.61, z + .21), new T.Vector3(dx + 1.1, y + 10.45, z + .17), .13);
  }
  beam(shadedBrass, new T.Vector3(x + 7.55, y + 9.5, z), new T.Vector3(x + 7.55, y + 6.29, z), .062);
  add("box", "#d28a31", x + 7.55, y + 5.8, z, 1.38, .92, 1.27);
  add("box", brass, x + 7.55, y + 6.24, z, 1.47, .18, 1.41);
}

function fort(scenery: Scenery, height: LandHeight, reserve: Reserve) {
  const { add } = scenery;
  const x = 28, z = 1.5, y = height(x, z) + .03;
  reserve(x, z, 9);
  add("box", "#aa896c", x, y - .11, z, 12.2, 1.03, 10.4);
  for (const side of [-1, 1]) {
    add("box", stone, x + side * 4.05, y + 2.05, z, 1.6, 3.75, 7.9);
    for (const end of [-1, 1]) {
      const tx = x + side * 4.11, tz = z + end * 3.8;
      const h = end === 1 ? 5.8 : 5.22;
      add("box", stone, tx, y + h / 2, tz, 3, h, 3);
      add("box", mortar, tx, y + h - .14, tz, 3.24, .29, 3.24);
      add("box", "#9f836b", tx, y + h + .06, tz, 2.91, .23, 2.91);
      for (const dx of [-1.19, 0, 1.19]) {
        for (const dz of [-1.19, 1.19]) add("box", mortar, tx + dx, y + h + .41, tz + dz, .65, .78, .61);
      }
      for (const dx of [-1.19, 1.19]) add("box", mortar, tx + dx, y + h + .41, tz, .61, .78, .65);
      for (let j = 0; j < 4; j++) {
        add("box", j % 2 ? "#b69679" : "#ddbd98", tx + (j % 2 ? .68 : -.71), y + .76 + j * .83,
          tz + 1.51, .65, .16, .13);
      }
      add("box", dark, tx, y + h - 1.31, tz + 1.51, .42, .9, .12);
      add("box", mortar, tx, y + h - 1.75, tz + 1.57, .62, .13, .24);
      if (end < 0) flag(scenery, tx, y + h + .15, tz, "#cf5446", side);
    }
  }
  for (const end of [-1, 1]) {
    const wz = z + end * 3.8;
    add("box", stone, x, y + 1.89, wz, 8.1, 3.78, 1.38);
    add("box", mortar, x, y + 3.83, wz, 8.2, .24, 1.58);
    for (let i = -3; i <= 3; i++) add("box", mortar, x + i * 1.03, y + 4.21, wz, .56, .71, 1.23);
  }
  add("box", "#4b3c39", x, y + .89, z + 4.58, 2.24, 1.83, .2);
  add("post", "#4b3c39", x, y + 1.79, z + 4.58, 2.25, .18, 2.25, 0, Math.PI / 2);
  stoneArch(scenery, x, y + 1.45, z + 4.67, 1.25, .32, [mortar, "#c09c78"]);
  for (const side of [-1, 1]) {
    add("flag", "#ae473e", x + side * 2.81, y + 2.33, z + 4.53, .74, 2.37, .55);
    add("box", warm, x + side * 2.81, y + 2.55, z + 4.62, .15, .53, .07);
    add("box", warm, x + side * 2.81, y + 2.57, z + 4.62, .45, .12, .07);
  }
}

function addBoat(scene: T.Scene, scenery: Scenery, x: number, z: number, yaw: number) {
  const { add, beam } = scenery;
  add("crown", "#824c36", x, SEA_LEVEL + .16, z, 2.38, 1.07, 5.3, yaw);
  add("crown", "#fff0c5", x, SEA_LEVEL + .42, z, 2.27, .76, 5.09, yaw);
  add("crown", "#aa754d", x, SEA_LEVEL + .72, z, 1.96, .38, 4.45, yaw);
  add("post", "#705343", x, SEA_LEVEL + 2.82, z, .13, 4.33, .13);
  beam("#91674a", new T.Vector3(x, SEA_LEVEL + 4.74, z),
    new T.Vector3(x - Math.sin(yaw) * 2.05, SEA_LEVEL + .75, z - Math.cos(yaw) * 2.05), .046);
  const sail = new T.BufferGeometry();
  sail.setAttribute("position", new T.Float32BufferAttribute([
    0,.86,.12, 0,4.68,.06, .44,1.06,1.92,
    .03,.85,-1.85, 0,3.89,-.12, 0,.84,-.17,
    .44,1.06,1.92, 0,4.68,.06, .35,1.97,1.12,
  ], 3));
  sail.setAttribute("color", new T.Float32BufferAttribute([
    ...Array(3).fill(new T.Color("#fff2ce").toArray()).flat(),
    ...Array(3).fill(new T.Color("#e17960").toArray()).flat(),
    ...Array(3).fill(new T.Color("#fffbeb").toArray()).flat(),
  ], 3));
  sail.computeVertexNormals();
  const rig = new T.Mesh(sail, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }));
  rig.position.set(x, SEA_LEVEL, z);
  rig.rotation.y = yaw;
  scene.add(rig);
}

export function addLandmarks(scene: T.Scene, scenery: Scenery, height: LandHeight, reserve: Reserve) {
  const { add } = scenery;
  arcadeVillage(scenery, height, reserve);
  blockVillage(scenery, height, reserve);
  fort(scenery, height, reserve);

  // Masonry sides follow the circuit where it crosses above the creek.
  const crossing = circuit.reduce((best, point) =>
    point.z > 16 && Math.abs(point.x - creekAt(point.z).x) < Math.abs(best.x - creekAt(best.z).x) ? point : best,
  { x: 0, z: 24 });
  const bx = crossing.x, bz = crossing.z;
  const by = groundHeight(bx, bz);
  for (const side of [-1, 1]) {
    const z = bz + side * 3.75;
    stoneArch(scenery, bx, by - 1.41, z, 1.32, .68, [stone, mortar, "#b69678"]);
    for (const end of [-1, 1]) {
      add("box", stone, bx + end * 1.88, by - .75, z, 1.07, 2.36, .74);
      add("box", mortar, bx + end * 2.72, by + .51, z, .44, .67, .82);
    }
    add("box", "#d1a980", bx, by + .42, z, 5.9, .34, .63);
    add("box", mortar, bx, by + .61, z, 5.95, .12, .71);
  }

  const lx = 46, lz = 27;
  const ly = Math.max(1.5, height(lx, lz));
  reserve(lx, lz, 4);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    add("rock", ["#8e8278", "#a2927d", "#7b7878"][i % 3], lx + Math.cos(a) * 2.8, SEA_LEVEL + 2.2,
      lz + Math.sin(a) * 2.3, 4.2, ly - SEA_LEVEL + 1.15, 4.1, a, .23);
  }
  add("post", "#83a648", lx, ly -.32, lz, 6.45, .46, 5.7);
  add("post", "#d8bd92", lx, ly, lz, 3.77, .43, 3.77);
  add("tower", "#f7e4c5", lx, ly + 2.9, lz, 2.93, 5.7, 2.93);
  for (let i = 0; i < 3; i++) add("box", "#49595c", lx, ly + 1.16 + i * 1.48,
    lz + 1.39 - i * .115, .4, .58, .13);
  add("post", "#bf5547", lx, ly + 5.76, lz, 3.57, .53, 3.57);
  add("post", "#eb9b5a", lx, ly + 6.48, lz, 2.13, 1.06, 2.13);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    add("post", "#653c3b", lx + Math.sin(a) * 1.02, ly + 6.52, lz + Math.cos(a) * 1.02, .14, 1.11, .14);
  }
  add("cone", "#b2493b", lx, ly + 7.55, lz, 3.19, 1.32, 3.19);
  add("crown", warm, lx, ly + 8.28, lz, .34, .39, .34);
  addBoat(scene, scenery, 20, 54.7, -.42);
  addBoat(scene, scenery, -10.4, 51.9, .8);
}

import * as T from "three";
import {
  circuit,
  crossRoad,
  groundHeight,
  makeRoads,
  ROAD_WIDTH,
  type Gate,
  type Point,
} from "./islandRoads";

const cylinder = (top: number, base: number, sides: number) =>
  new T.CylinderGeometry(top, base, 1, sides);

// Batch static scenery by shape. Per-instance transforms and colors keep the island inexpensive to draw.
function scenery(scene: T.Scene) {
  const geometries = {
    box: new T.BoxGeometry(),
    post: cylinder(0.5, 0.5, 12),
    pine: cylinder(0, 0.5, 6),
    rock: new T.IcosahedronGeometry(0.5),
  };
  type Shape = keyof typeof geometries;
  const batches = new Map<Shape, { matrix: T.Matrix4; color: T.Color }[]>();
  const transform = new T.Object3D();
  return {
    add(
      shape: Shape,
      color: string,
      x: number,
      y: number,
      z: number,
      width: number,
      height: number,
      depth: number,
      yaw = 0,
      tilt = 0,
    ) {
      transform.position.set(x, y, z);
      transform.rotation.set(0, yaw, tilt, "YXZ");
      transform.scale.set(width, height, depth);
      transform.updateMatrix();
      const items = batches.get(shape) ?? [];
      items.push({ matrix: transform.matrix.clone(), color: new T.Color(color) });
      batches.set(shape, items);
    },
    finish() {
      const material = new T.MeshLambertMaterial({ flatShading: true });
      for (const [shape, instances] of batches) {
        const mesh = new T.InstancedMesh(geometries[shape], material, instances.length);
        instances.forEach(({ matrix, color }, i) => {
          mesh.setMatrixAt(i, matrix);
          mesh.setColorAt(i, color);
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
      }
    },
  };
}

function signTexture(title: string, accent: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#18272d";
  ctx.fillRect(0, 0, 1024, 160);
  ctx.fillStyle = accent;
  ctx.fillRect(14, 14, 8, 132);
  ctx.fillRect(1002, 14, 8, 132);
  ctx.fillStyle = "#fff3d7";
  ctx.font = "italic 900 112px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title.toUpperCase(), 512, 77, 922);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function coastline(angle: number) {
  return 1 + 0.035 * Math.sin(5 * angle) + 0.03 * Math.cos(7 * angle) + 0.018 * Math.sin(13 * angle);
}

// Concentric triangulated rings form one continuous grassy plateau, cliff face, beach and surf edge.
function terrain(scene: T.Scene, random: () => number) {
  const coords: number[] = [],
    colors: number[] = [];
  const count = 112;
  const top = Array.from({ length: 22 }, (_, i) => (i + 0.01) / 22);
  const rings = [...top, 0.989, 1.004, 1.026, 1.052, 1.067];
  const layers: T.Vector3[][] = [];
  for (const [j, r] of rings.entries()) {
    layers.push(
      Array.from({ length: count }, (_, i) => {
        const a = ((i + (j % 2) * 0.46) * Math.PI * 2) / count;
        const k = r * coastline(a);
        const x = 61.5 * k * Math.sin(a),
          z = -51 * k * Math.cos(a);
        const land = groundHeight(x, z);
        const y =
          j < top.length
            ? land
            : [land - 0.12, land - 1.3 - random(), -2.9 - random() * 0.45, -3.44, -3.57][j - top.length];
        return new T.Vector3(x, y, z);
      }),
    );
  }
  const color = new T.Color();
  for (let j = 1; j < rings.length; j++) {
    for (let i = 0; i < count; i++) {
      const k = (i + 1) % count;
      const a = layers[j - 1][i],
        b = layers[j][i],
        c = layers[j][k],
        d = layers[j - 1][k];
      for (const face of [
        [a, c, b],
        [a, d, c],
      ]) {
        const t = j - top.length;
        const tint = t <= 0 ? "#8eae54" : ["#8eae54", "#a69678", "#817b70", "#e9c486", "#b5f1da"][t];
        color.set(tint).multiplyScalar((t <= 0 ? 0.94 : 0.81) + random() * (t <= 0 ? 0.095 : 0.26));
        for (const v of face) {
          coords.push(v.x, v.y, v.z);
          colors.push(color.r, color.g, color.b);
        }
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(coords, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const island = new T.Mesh(
    geometry,
    new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }),
  );
  island.receiveShadow = true;
  scene.add(island);
}

function road(scene: T.Scene, path: Point[], lift: number, closed = false) {
  const points = path.flatMap((p, i) => {
    if (!i) return [p];
    const from = path[i - 1],
      n = Math.ceil(Math.hypot(p.x - from.x, p.z - from.z) / 1.8);
    return Array.from({ length: n }, (_, k) => ({
      x: from.x + ((p.x - from.x) * (k + 1)) / n,
      z: from.z + ((p.z - from.z) * (k + 1)) / n,
    }));
  });
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const width = ROAD_WIDTH / 2;
  let distance = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i) distance += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    const a = points[i - 1] ?? (closed ? points.at(-2)! : p);
    const b = points[i + 1] ?? (closed ? points[1] : p);
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.z - a.z) / length,
      dz = (a.x - b.x) / length;
    const strips = [
      [-width - 0.24, -width],
      [-width, -width + 0.14],
      [-width + 0.14, -0.07],
      [-0.07, 0.07],
      [0.07, width - 0.14],
      [width - 0.14, width],
      [width, width + 0.24],
    ];
    const paint = [
      "#d1aa7e",
      "#fff1c7",
      "#545968",
      Math.floor(distance / 2) % 2 ? "#545968" : "#f4d7a0",
      "#545968",
      "#fff1c7",
      "#d1aa7e",
    ];
    strips.forEach(([left, right], j) => {
      const color = new T.Color(paint[j]);
      for (const offset of [left, right]) {
        const x = p.x + offset * dx,
          z = p.z + offset * dz;
        positions.push(x, groundHeight(x, z) + lift, z);
        colors.push(color.r, color.g, color.b);
      }
      if (i) {
        const k = positions.length / 3 - 2,
          prev = k - strips.length * 2;
        indices.push(prev, k, prev + 1, k, k + 1, prev + 1);
      }
    });
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }));
  mesh.receiveShadow = true;
  scene.add(mesh);
}

export function buildIsland(scene: T.Scene, gates: readonly Gate[]) {
  let seed = 8142;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  scene.background = new T.Color(0x177a84);
  scene.add(new T.HemisphereLight(0xf2faff, 0xadbbb9, 1.8));
  const sun = new T.DirectionalLight(0xffefd6, 2.25);
  sun.position.set(-48, 88, -45);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -88, right: 88, top: 83, bottom: -80, far: 240 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.12;
  sun.shadow.bias = -0.00025;
  scene.add(sun);

  const sea = new T.Mesh(
    new T.PlaneGeometry(700, 700),
    new T.ShaderMaterial({
      vertexShader: `varying vec2 water; void main(){water=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec2 water;void main(){
      float r=length(water/vec2(62.,51.));
      float ripple=sin(water.y*.9+sin(water.x*.4)*.8)+sin(water.x*.7-water.y*1.24);
      vec3 c=mix(vec3(.018,.39,.38),vec3(.006,.13,.18),smoothstep(.96,1.47,r));
      c+=.019*smoothstep(1.2,2.,ripple);
      gl_FragColor=vec4(c,1.);
      #include <colorspace_fragment>
    }`,
    }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -3.65;
  scene.add(sea);
  terrain(scene, random);
  road(scene, circuit, 0.25, true);
  road(scene, crossRoad, 0.3);
  gates.forEach((g) => road(scene, g.approach, 0.34));

  const props = scenery(scene),
    add = props.add;
  const closest = makeRoads(gates);
  function tree(x: number, z: number, h: number, round = false) {
    const y = groundHeight(x, z);
    add("post", "#76583b", x, y + h * 0.18, z, h * 0.12, h * 0.43, h * 0.12);
    if (round) {
      add(
        "rock",
        random() > 0.72 ? "#d7939d" : "#79a343",
        x,
        y + h * 0.64,
        z,
        h * 0.83,
        h * 0.81,
        h * 0.81,
        x,
      );
    } else {
      add("pine", "#347453", x, y + h * 0.44, z, h * 0.72, h * 0.67, h * 0.72, x);
      add("pine", "#609340", x, y + h * 0.73, z, h * 0.54, h * 0.61, h * 0.54, x + 0.2);
    }
  }
  const occupied: { x: number; z: number; r: number }[] = [];
  function building(x: number, z: number, w: number, h: number, d: number, color: string, roof: string) {
    const y = groundHeight(x, z);
    add("box", color, x, y + h * 0.5, z, w, h, d);
    add("box", roof, x, y + h, z, w + 0.45, 0.55, d + 0.45);
    for (const side of [-1, 1]) {
      add(
        "box",
        "#25424b",
        x + w * 0.26 * side,
        y + h * 0.57,
        z + d * 0.5 + 0.03,
        w * 0.2,
        h * 0.33,
        0.1,
      );
    }
    occupied.push({ x, z, r: Math.max(w, d) * 0.64 });
  }
  // BuildBlox village, coastal fort and harbor storefronts give the junctions distinct silhouettes.
  for (const [i, [x, z]] of [
    [-27, -5],
    [-32, -2],
    [-24, 1],
    [-28, 5],
    [-35, 5],
  ].entries()) {
    const colors = ["#e9ad47", "#d67961", "#7fbfb2", "#e6cf83", "#c58c9c"];
    building(x, z, 4, 3 + (i % 3), 3.7, colors[i], "#ffdf95");
    if (i % 2 === 0) building(x + 0.45, z, 2.6, 5 + (i % 3), 2.4, colors[i], "#e8c97d");
  }
  const fortX = 28,
    fortZ = -4;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = fortX + sx * 4.1,
        z = fortZ + sz * 3.6,
        y = groundHeight(x, z);
      building(x, z, 3.3, 5.2, 3.3, "#c7a986", "#e0c596");
      for (const a of [-1, 1])
        for (const b of [-1, 1])
          add("box", "#ecd0a4", x + a * 1.24, y + 5.75, z + b * 1.24, 0.72, 0.95, 0.72);
    }
  building(fortX, fortZ - 3.6, 8, 3, 1.5, "#ba9673", "#d8bf96");
  building(fortX - 4.1, fortZ, 1.4, 3, 7, "#ba9673", "#d8bf96");
  building(fortX + 4.1, fortZ, 1.4, 3, 7, "#ba9673", "#d8bf96");
  for (let i = 0; i < 5; i++)
    building(
      7 + i * 3.3,
      17.5 - i * 0.8,
      2.8,
      2.8 + (i % 3),
      3.3,
      "#f0c381",
      i % 2 ? "#ba6154" : "#c97741",
    );
  // Asymmetric mountain groups rise inside the northern loop, away from the alpine road.
  for (const [x, z, h, r] of [
    [-19, -17, 15, 15],
    [-10, -21, 11, 10],
    [15, -17, 14, 15],
    [23, -15, 9, 10],
  ]) {
    const y = groundHeight(x, z);
    // Offset and vary the snowline around each ridge for a faceted mountain silhouette.
    const coords: number[] = [],
      colors: number[] = [];
    const summit = new T.Vector3(x + r * 0.075, y + h, z - r * 0.08);
    const base: T.Vector3[] = [],
      snow: T.Vector3[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5,
        size = r * (0.46 + random() * 0.18);
      const foot = new T.Vector3(x + Math.sin(a) * size, y - 0.7, z + Math.cos(a) * size);
      base.push(foot);
      const line = foot.clone().lerp(summit, 0.56 + random() * 0.26);
      line.x += Math.sin(a) * 0.47;
      snow.push(line);
    }
    for (let i = 0; i < 10; i++) {
      const j = (i + 1) % 10;
      for (const [n, face] of [
        [base[i], base[j], snow[i]],
        [snow[i], base[j], snow[j]],
        [snow[i], snow[j], summit],
      ].entries()) {
        const tint = new T.Color(n === 2 ? "#f2f6fa" : i % 3 ? "#88909a" : "#a79d8b").multiplyScalar(
          0.88 + random() * 0.19,
        );
        for (const v of face) {
          coords.push(v.x, v.y, v.z);
          colors.push(tint.r, tint.g, tint.b);
        }
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(coords, 3));
    geo.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mountain = new T.Mesh(
      geo,
      new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }),
    );
    mountain.castShadow = mountain.receiveShadow = true;
    scene.add(mountain);
    occupied.push({ x, z, r: r * 0.47 });
  }
  // Timber pier, moored sailboats and striped shop awnings on the southern waterfront.
  const pierX = 4;
  for (let j = 0; j < 18; j++) {
    const z = 46 + j * 0.62;
    add("box", j % 3 ? "#a77a54" : "#b88b61", pierX, -0.12, z, 2.6, 0.32, 0.58);
    if (j % 4 === 0)
      for (const side of [-1, 1]) add("post", "#795b45", pierX + side * 1.18, -1.64, z, 0.44, 4.1, 0.44);
  }
  function sailboat(x: number, z: number, yaw: number) {
    add("rock", "#f9ebd0", x, -3.05, z, 2.45, 1.55, 5.5, yaw);
    add("box", "#cd8459", x, -2.39, z, 1.45, 0.22, 3.55, yaw);
    add("post", "#6a5746", x, -0.32, z, 0.14, 4.35, 0.14);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(
        [0, 0, 0, 0, 3.85, 0, 0, 0.28, 1.75, 0, 0.2, -1.4, 0, 3.2, -0.08, 0, 0.2, -0.08],
        3,
      ),
    );
    geometry.computeVertexNormals();
    const sail = new T.Mesh(
      geometry,
      new T.MeshLambertMaterial({ color: 0xffefd0, side: T.DoubleSide }),
    );
    sail.position.set(x, -2.1, z);
    sail.rotation.y = yaw;
    scene.add(sail);
  }
  sailboat(7.2, 56, 0.5);
  sailboat(-11, 57, -0.84);
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) {
      const x = 7 + i * 3.3,
        z = 17.5 - i * 0.8;
      add(
        "box",
        j % 2 ? "#fff3c8" : i % 2 ? "#d55549" : "#37a1a4",
        x + (j - 2) * 0.54,
        groundHeight(x, z) + 1.8,
        z + 1.92,
        0.54,
        0.28,
        1.1,
      );
    }
  for (const gate of gates) {
    const { x, z, angle, color } = gate,
      y = groundHeight(x, z) + 0.33;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    for (const side of [-1, 1]) {
      add("box", color, x + c * side * 4.15, y + 1.85, z + s * side * 4.15, 0.8, 3.7, 1.1, -angle);
      add(
        "box",
        "#f7e8bf",
        x + c * side * 4.15,
        y + 0.65,
        z + s * side * 4.15,
        0.86,
        0.48,
        1.18,
        -angle,
      );
    }
    add("box", color, x, y + 3.7, z, 9.2, 1.0, 1.3, -angle);
    // A tilted overhead marquee faces the aerial camera from every direction.
    const sign = new T.Mesh(
      new T.PlaneGeometry(gate.title.length > 12 ? 13 : 10, 1.95),
      new T.MeshBasicMaterial({ map: signTexture(gate.title, color) }),
    );
    sign.position.set(x, y + 4.48, z);
    sign.rotation.x = -0.88;
    scene.add(sign);
  }
  for (let i = 0; i < 1150; i++) {
    const x = (random() - 0.5) * 121,
      z = (random() - 0.5) * 100;
    const radius = Math.hypot(x / 61.5, z / 51),
      angle = Math.atan2(x / 61.5, -z / 51);
    if (
      radius > coastline(angle) * 0.935 ||
      closest(x, z).distance < 5.9 ||
      occupied.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + 1)
    )
      continue;
    const h = 1.8 + random() * 3.6;
    if (i % 6 === 0)
      add("rock", "#9e9d80", x, groundHeight(x, z) + 0.35, z, h, 0.7 + h * 0.34, h * 0.7, x);
    else tree(x, z, h, z > 6 || x < -32);
  }
  const lx = 40,
    lz = 27,
    ly = groundHeight(lx, lz);
  for (let i = 0; i < 4; i++)
    add("post", i % 2 ? "#cc5944" : "#fff1d0", lx, ly + 1 + i * 1.8, lz, 3 - i * 0.2, 1.8, 3 - i * 0.2);
  add("post", "#29404b", lx, ly + 7.6, lz, 3.55, 0.45, 3.55);
  add("post", "#ffdfa0", lx, ly + 8.4, lz, 1.9, 1.3, 1.9);
  add("pine", "#ae4b39", lx, ly + 9.6, lz, 3.3, 1.4, 3.3);
  for (let i = 0; i < 100; i++) {
    const a = random() * Math.PI * 2,
      r = coastline(a) * (1.045 + random() * 0.25),
      w = 1 + random() * 3.1;
    add(
      "rock",
      "#a49a84",
      61.5 * Math.sin(a) * r,
      -3.6,
      -51 * Math.cos(a) * r,
      w,
      w * 0.77,
      w * 0.72,
      a,
    );
  }
  props.finish();
}

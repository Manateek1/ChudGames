import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Sky } from "three/addons/objects/Sky.js";
import { seededRandom } from "../../engine/math";
import { samples, SAMPLE_COUNT, TRACK_LENGTH, trackPoint } from "./track";
import { presets } from "./settings";
import type { Quality } from "./settings";

const sunDirection = new THREE.Vector3(-0.7, 0.2, 0.52).normalize();
export function makeSky(): THREE.Mesh {
  const sky = new Sky();
  sky.scale.setScalar(10000);
  sky.frustumCulled = false;
  const u = sky.material.uniforms;
  u.sunPosition.value.copy(sunDirection).multiplyScalar(450000);
  u.turbidity.value = 7;
  u.rayleigh.value = 2.2;
  u.mieCoefficient.value = 0.006;
  if (u.cloudCoverage) {
    u.cloudCoverage.value = 0.3;
    u.cloudDensity.value = 0.32;
  }
  return sky;
}
function noise(x: number, z: number) {
  return (
    Math.sin(x * 0.008 + Math.cos(z * 0.006) * 1.5) *
      Math.cos(z * 0.007) *
      0.55 +
    Math.sin(x * 0.021 + z * 0.017) * 0.1 +
    Math.cos(z * 0.042 - x * 0.038) * 0.035
  );
}
function nearest(x: number, z: number) {
  let distance = Infinity,
    height = 0;
  for (let i = 0; i < SAMPLE_COUNT; i += 8) {
    const p = samples[i],
      d = (x - p.x) ** 2 + (z - p.z) ** 2;
    if (d < distance) {
      distance = d;
      height = p.y;
    }
  }
  return { distance: Math.sqrt(distance), height };
}
function terrainHeight(x: number, z: number) {
  const r = nearest(x, z),
    radius = Math.hypot(x - 40, z + 30);
  const mountains =
    Math.max(0, radius - 380) * 0.18 +
    Math.max(0, noise(x, z) + 0.3) * Math.min(180, radius * 0.25);
  const base = radius < 240 ? 5 + noise(x, z) * 12 : 13 + mountains;
  const blend = THREE.MathUtils.smoothstep(r.distance, 24, 120);
  // The coarse terrain must remain below the exact road ribbon, including on
  // crests where interpolating the heightfield can otherwise cover the asphalt.
  return THREE.MathUtils.lerp(r.height - 3, base, blend);
}
function asphaltTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const ctx = c.getContext("2d")!,
    random = seededRandom(7342);
  const data = ctx.createImageData(512, 512);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 60 + random() * 35;
    data.data[i] = v;
    data.data[i + 1] = v + 2;
    data.data[i + 2] = v + 3;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  for (let i = 0; i < 45; i++) {
    ctx.strokeStyle = `rgba(17,19,20,${random() * 0.2})`;
    ctx.lineWidth = random() * 3 + 1;
    ctx.beginPath();
    const x = random() * 512,
      y = random() * 512;
    ctx.moveTo(x, y);
    ctx.lineTo(x + random() * 30 - 15, y + 30 + random() * 90);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
function ribbon(
  offset: number,
  width: number,
  height: number,
  dashed = false,
): THREE.BufferGeometry {
  const v: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= SAMPLE_COUNT; i++) {
    const p = samples[i];
    for (const side of [-1, 1]) {
      v.push(
        p.x + p.nx * (offset + (side * width) / 2),
        p.y + height,
        p.z + p.nz * (offset + (side * width) / 2),
      );
      uv.push(
        side < 0 ? 0 : width / 9,
        ((i / SAMPLE_COUNT) * TRACK_LENGTH) / 9,
      );
    }
    if (i < SAMPLE_COUNT && (!dashed || i % 9 < 4)) {
      const k = i * 2;
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function textTexture(
  text: string,
  subtitle: string,
  dark = false,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = dark ? "#1e2828" : "#d6e8de";
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = dark ? "#f5d9a0" : "#193834";
  ctx.font = "bold 94px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, 512, 124);
  ctx.font = "32px sans-serif";
  ctx.fillText(subtitle, 512, 194);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export interface World {
  sun: THREE.DirectionalLight;
  sky: THREE.Mesh;
  vegetation: THREE.InstancedMesh[];
  gates: THREE.Mesh[];
  setQuality: (q: Quality) => void;
}
export function buildWorld(scene: THREE.Scene, quality: Quality): World {
  const random = seededRandom(45817),
    sky = makeSky();
  scene.add(sky);
  scene.fog = new THREE.FogExp2(0xb7b5a4, 0.00085);
  scene.add(new THREE.HemisphereLight(0xc4dce8, 0x746447, 1.3));
  const sun = new THREE.DirectionalLight(0xffcc93, 3.4);
  sun.castShadow = true;
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.00012;
  Object.assign(sun.shadow.camera, {
    left: -45,
    right: 45,
    top: 45,
    bottom: -45,
    near: 1,
    far: 240,
  });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun, sun.target);
  const terrainGeo = new THREE.PlaneGeometry(4300, 4300, 300, 300);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.getAttribute("position"),
    colors = new Float32Array(pos.count * 3),
    c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i),
      y = terrainHeight(x, z);
    pos.setY(i, y);
    c.set(y > 200 ? 0x92918b : y > 90 ? 0x73796a : 0x74764b);
    c.multiplyScalar(0.83 + (noise(x * 3, z * 3) + 0.8) * 0.18);
    c.toArray(colors, i * 3);
  }
  terrainGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();
  const groundDetail = asphaltTexture();
  groundDetail.repeat.set(210, 210);
  const groundCanvas = groundDetail.image as HTMLCanvasElement,
    groundCtx = groundCanvas.getContext("2d")!;
  groundCtx.fillStyle = "rgba(232,229,208,.68)";
  groundCtx.fillRect(0, 0, 512, 512);
  groundDetail.needsUpdate = true;
  const terrainMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    map: groundDetail,
    bumpMap: groundDetail,
    bumpScale: 0.35,
    color: 0xc4c7af,
    envMapIntensity: 0.28,
  });
  terrainMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec3 vGround;\n" +
      shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvGround=(modelMatrix*vec4(transformed,1.)).xyz;",
      );
    shader.fragmentShader =
      `varying vec3 vGround;
      float groundHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float groundNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(groundHash(i),groundHash(i+vec2(1,0)),f.x),mix(groundHash(i+vec2(0,1)),groundHash(i+1.),f.x),f.y);}
      ` +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        "#include <color_fragment>\nvec2 terrainUV=vGround.xz*.15+vGround.y*.12;float grain=groundNoise(terrainUV)+groundNoise(terrainUV*3.7)*.35;diffuseColor.rgb*=.65+grain*.35;",
      );
  };
  const terrain = new THREE.Mesh(terrainGeo, terrainMaterial);
  terrain.receiveShadow = true;
  scene.add(terrain);
  const roadBench = new THREE.Mesh(
    ribbon(0, 32, -0.24),
    new THREE.MeshStandardMaterial({
      color: 0x74764b,
      roughness: 1,
      map: groundDetail,
      envMapIntensity: 0.28,
    }),
  );
  roadBench.receiveShadow = true;
  scene.add(roadBench);
  const lake = new THREE.Mesh(
    new THREE.CircleGeometry(238, 96),
    new THREE.MeshPhysicalMaterial({
      color: 0x3c7376,
      metalness: 0.52,
      roughness: 0.2,
      clearcoat: 0.8,
    }),
  );
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(40, 10, -50);
  scene.add(lake);
  const asphalt = asphaltTexture();
  const road = new THREE.Mesh(
    ribbon(0, 13, 0.035),
    new THREE.MeshStandardMaterial({
      map: asphalt,
      roughnessMap: asphalt,
      roughness: 0.94,
      color: 0x777b80,
      metalness: 0.04,
    }),
  );
  road.receiveShadow = true;
  scene.add(road);
  const marking = new THREE.MeshStandardMaterial({
    color: 0xe9e4c9,
    roughness: 0.85,
  });
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(ribbon(side * 6.07, 0.13, 0.052), marking);
    scene.add(edge);
    const shoulder = new THREE.Mesh(
      ribbon(side * 6.95, 0.88, -0.03),
      new THREE.MeshStandardMaterial({ color: 0x9f9581, roughness: 1 }),
    );
    shoulder.receiveShadow = true;
    scene.add(shoulder);
  }
  scene.add(
    new THREE.Mesh(
      ribbon(0, 0.13, 0.052, true),
      new THREE.MeshStandardMaterial({ color: 0xe2c88a, roughness: 0.8 }),
    ),
  );
  // The rail is a continuous ribbon; posts and reflectors share instanced draws.
  const steel = new THREE.MeshStandardMaterial({
    color: 0x91978f,
    metalness: 0.8,
    roughness: 0.4,
  });
  for (const side of [-1, 1]) {
    const railGeo = ribbon(side * 7.95, 0.14, 0.88);
    const rail2 = ribbon(side * 7.95, 0.17, 0.69);
    scene.add(new THREE.Mesh(railGeo, steel), new THREE.Mesh(rail2, steel));
  }
  const matrix = new THREE.Object3D(),
    posts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.14, 1, 0.13),
      steel,
      700,
    ),
    reflectors = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.12, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0xffdf92,
        emissive: 0xda8b21,
        emissiveIntensity: 0.35,
      }),
      700,
    );
  for (let i = 0; i < 350; i++)
    for (let side = 0; side < 2; side++) {
      const p = trackPoint(i / 350),
        offset = side === 0 ? -7.95 : 7.95;
      matrix.position.set(p.x + p.nx * offset, p.y + 0.45, p.z + p.nz * offset);
      matrix.rotation.set(0, p.heading, 0);
      matrix.updateMatrix();
      posts.setMatrixAt(i * 2 + side, matrix.matrix);
      matrix.position.y += 0.47;
      matrix.updateMatrix();
      reflectors.setMatrixAt(i * 2 + side, matrix.matrix);
    }
  scene.add(posts, reflectors);
  // Multi-tier, irregular silhouettes with shared geometry and per-instance hues.
  const tiers: THREE.BufferGeometry[] = [];
  for (let j = 0; j < 6; j++) {
    const radius = 1.65 - j * 0.23,
      g = new THREE.ConeGeometry(radius * 0.2, 2.2, 8, 1);
    g.translate(0, 2.4 + j * 0.84, 0);
    tiers.push(g);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + j * 1.3,
        branch = new THREE.PlaneGeometry(radius * 1.45, 2.2);
      branch.rotateY(a);
      branch.rotateZ(Math.sin(a) * 0.22);
      branch.rotateX(Math.cos(a) * 0.22);
      branch.translate(
        Math.sin(a) * radius * 0.66,
        1.75 + j * 0.86 + Math.sin(k * 8) * 0.16,
        Math.cos(a) * radius * 0.66,
      );
      tiers.push(branch);
    }
  }
  const pineGeo = mergeGeometries(tiers);
  tiers.forEach((g) => g.dispose());
  const needles = document.createElement("canvas");
  needles.width = 128;
  needles.height = 256;
  const needleCtx = needles.getContext("2d")!,
    leafRandom = seededRandom(838);
  needleCtx.fillStyle = "#667659";
  needleCtx.fillRect(60, 0, 8, 256);
  for (let i = 0; i < 750; i++) {
    const y = leafRandom() * 256,
      spread = 12 + Math.sin((y / 256) * Math.PI) * 48,
      x = 64 + (leafRandom() * 2 - 1) * spread;
    needleCtx.strokeStyle = ["#81916d", "#6b805f", "#a3ab85", "#526a4c"][i % 4];
    needleCtx.lineWidth = 1 + leafRandom() * 2;
    needleCtx.beginPath();
    needleCtx.moveTo(x, y);
    needleCtx.lineTo(x + (x - 64) * 0.2, y - 8 - leafRandom() * 12);
    needleCtx.stroke();
  }
  const needleTexture = new THREE.CanvasTexture(needles);
  needleTexture.colorSpace = THREE.SRGBColorSpace;
  const trees = new THREE.InstancedMesh(
    pineGeo,
    new THREE.MeshStandardMaterial({
      color: 0x769278,
      roughness: 1,
      map: needleTexture,
      alphaTest: 0.35,
      side: THREE.DoubleSide,
      envMapIntensity: 0.18,
    }),
    1700,
  );
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.12, 0.2, 3.3, 5),
    new THREE.MeshStandardMaterial({ color: 0x5d5040, roughness: 1 }),
    1700,
  );
  let placed = 0;
  while (placed < 1700) {
    const roadside = placed % 3 !== 0,
      p = trackPoint(random()),
      offset = (random() < 0.5 ? 1 : -1) * (15 + random() * 100);
    const x = roadside ? p.x + p.nx * offset : -660 + random() * 1390,
      z = roadside ? p.z + p.nz * offset : -820 + random() * 1420,
      near = nearest(x, z),
      y = terrainHeight(x, z);
    if (near.distance < 13 || y < 13 || y > 190) continue;
    const scale = 0.85 + random() * 1.3;
    matrix.position.set(x, y, z);
    matrix.rotation.set(0, random() * 6.28, 0);
    matrix.scale.set(
      scale * (0.8 + random() * 0.3),
      scale * (1 + random() * 0.5),
      scale,
    );
    matrix.updateMatrix();
    trees.setMatrixAt(placed, matrix.matrix);
    c.setHSL(
      0.23 + random() * 0.08,
      0.17 + random() * 0.16,
      0.2 + random() * 0.1,
    );
    trees.setColorAt(placed, c);
    matrix.position.y += scale * 1.5;
    matrix.updateMatrix();
    trunks.setMatrixAt(placed, matrix.matrix);
    placed++;
  }
  trees.castShadow = true;
  scene.add(trees, trunks);
  const rockGeometry = new THREE.IcosahedronGeometry(1, 2),
    rockPositions = rockGeometry.getAttribute("position");
  for (let i = 0; i < rockPositions.count; i++) {
    const x = rockPositions.getX(i),
      y = rockPositions.getY(i),
      z = rockPositions.getZ(i),
      scale = 1 + Math.sin(x * 13 + z * 7) * Math.cos(y * 11) * 0.13;
    rockPositions.setXYZ(i, x * scale, y * scale, z * scale);
  }
  rockGeometry.computeVertexNormals();
  const rocks = new THREE.InstancedMesh(
    rockGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x77796d,
      roughness: 0.96,
      map: groundDetail,
      envMapIntensity: 0.2,
    }),
    220,
  );
  for (let i = 0; i < 220; i++) {
    const p = trackPoint(random()),
      offset = (random() > 0.5 ? 1 : -1) * (13 + random() * 40),
      x = p.x + p.nx * offset,
      z = p.z + p.nz * offset;
    matrix.position.set(x, terrainHeight(x, z), z);
    matrix.rotation.set(random(), random() * 6, random());
    matrix.scale.set(1 + random() * 4, 1 + random() * 3, 1 + random() * 4);
    matrix.updateMatrix();
    rocks.setMatrixAt(i, matrix.matrix);
  }
  scene.add(rocks);
  const gates: THREE.Mesh[] = [];
  const structure = new THREE.MeshStandardMaterial({
    color: 0x253935,
    roughness: 0.65,
    metalness: 0.4,
  });
  for (let i = 0; i < 8; i++) {
    const p = trackPoint(i / 8),
      gate = new THREE.Group();
    gate.position.set(p.x, p.y, p.z);
    gate.rotation.y = p.heading;
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 5.3, 0.2),
        structure,
      );
      pole.position.set(side * 7, 2.65, 0);
      gate.add(pole);
    }
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(14.25, 1.0, 0.12),
      new THREE.MeshStandardMaterial({
        map: textTexture(
          i === 0 ? "APEX RUN" : `SECTOR 0${i}`,
          i === 0
            ? "SOLSTICE PASS  /  START · FINISH"
            : "SOLSTICE PASS  /  TIME ATTACK",
          true,
        ),
        roughness: 0.7,
      }),
    );
    banner.position.y = 5.05;
    gate.add(banner);
    gates.push(banner);
    scene.add(gate);
    if (i === 0) {
      const checker = document.createElement("canvas");
      checker.width = 256;
      checker.height = 32;
      const ctx = checker.getContext("2d")!;
      for (let x = 0; x < 16; x++)
        for (let y = 0; y < 2; y++) {
          ctx.fillStyle = (x + y) % 2 ? "#d6d4be" : "#303936";
          ctx.fillRect(x * 16, y * 16, 16, 16);
        }
      const texture = new THREE.CanvasTexture(checker);
      texture.colorSpace = THREE.SRGBColorSpace;
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(13, 1.1),
        new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }),
      );
      line.rotation.x = -Math.PI / 2;
      line.position.y = 0.065;
      gate.add(line);
    }
  }
  // An elevated viaduct and a stone gallery give the circuit distinct landmarks.
  const concrete = new THREE.MeshStandardMaterial({
      color: 0x9f9b8c,
      roughness: 0.9,
    }),
    bridgeParts: THREE.BufferGeometry[] = [];
  for (let i = 230; i < 320; i += 5) {
    const p = samples[i],
      g = new THREE.BoxGeometry(
        15.8,
        1.3,
        (TRACK_LENGTH / SAMPLE_COUNT) * 5 + 0.5,
      );
    g.rotateY(p.heading);
    g.translate(p.x, p.y - 0.75, p.z);
    bridgeParts.push(g);
    if (i % 15 === 5)
      for (const side of [-1, 1]) {
        const support = new THREE.BoxGeometry(1.5, 24, 2);
        support.translate(
          p.x + p.nx * side * 5,
          p.y - 13,
          p.z + p.nz * side * 5,
        );
        bridgeParts.push(support);
      }
  }
  const bridge = new THREE.Mesh(mergeGeometries(bridgeParts), concrete);
  bridgeParts.forEach((g) => g.dispose());
  scene.add(bridge);
  const galleryParts: THREE.BufferGeometry[] = [];
  for (let i = 810; i < 860; i += 3) {
    const p = samples[i];
    for (const side of [-1, 1]) {
      const col = new THREE.BoxGeometry(0.6, 7, 0.65);
      col.rotateY(p.heading);
      col.translate(
        p.x + p.nx * side * 8.5,
        p.y + 3.5,
        p.z + p.nz * side * 8.5,
      );
      galleryParts.push(col);
    }
    const roof = new THREE.BoxGeometry(
      18,
      0.7,
      (TRACK_LENGTH / SAMPLE_COUNT) * 3 + 0.3,
    );
    roof.rotateY(p.heading);
    roof.translate(p.x, p.y + 7.1, p.z);
    galleryParts.push(roof);
  }
  const gallery = new THREE.Mesh(mergeGeometries(galleryParts), concrete);
  gallery.castShadow = true;
  gallery.receiveShadow = true;
  galleryParts.forEach((g) => g.dispose());
  scene.add(gallery);
  const signMat = new THREE.MeshStandardMaterial({
    map: textTexture("‹  ‹  ‹", "SLOW / CORNER"),
    roughness: 0.8,
  });
  for (const t of [0.17, 0.31, 0.43, 0.62, 0.82, 0.91]) {
    const p = trackPoint(t),
      sign = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.4, 0.12), signMat);
    sign.position.set(p.x + p.nx * 9, p.y + 2.1, p.z + p.nz * 9);
    sign.rotation.y = p.heading + Math.PI;
    scene.add(sign);
  }
  const world: World = {
    sun,
    sky,
    vegetation: [trees, trunks],
    gates,
    setQuality(q) {
      trees.count = trunks.count = presets[q].trees;
      trees.castShadow = q === "high" || q === "ultra";
    },
  };
  world.setQuality(quality);
  return world;
}
export function updateSun(
  sun: THREE.DirectionalLight,
  x: number,
  y: number,
  z: number,
) {
  sun.target.position.set(x, y, z);
  sun.position.set(
    x + sunDirection.x * 140,
    y + sunDirection.y * 140,
    z + sunDirection.z * 140,
  );
}

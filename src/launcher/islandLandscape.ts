import * as T from "three";
import { groundHeight, ROAD_WIDTH, type makeRoads } from "./islandRoads";
import type { LandHeight, Reserve, Scenery } from "./islandScenery";

export const COAST_X = 61.5;
export const COAST_Z = 51;
export const SEA_LEVEL = -3.65;
const tau = Math.PI * 2;
const smooth = T.MathUtils.smoothstep;

function coastline(angle: number) {
  return 1 + 0.042 * Math.sin(5 * angle) + 0.038 * Math.cos(7 * angle) + 0.025 * Math.sin(13 * angle);
}

function shore(x: number, z: number) {
  const angle = Math.atan2(x / COAST_X, -z / COAST_Z);
  return Math.hypot(x / COAST_X, z / COAST_Z) / coastline(angle);
}

function shelteredBeach(x: number, z: number) {
  return z > 31 && x > -9 && x < 24 || x < -39 && z > 20 && z < 34;
}

export function islandLight(scene: T.Scene) {
  scene.background = new T.Color("#126580");
  scene.add(new T.HemisphereLight(0xe3f1ff, 0xc9b69c, 1.72));
  const sun = new T.DirectionalLight(0xffe3b1, 2.35);
  sun.position.set(-55, 88, 53);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -81, right: 81, top: 82, bottom: -82, far: 240 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = 0.12;
  sun.shadow.bias = -0.0003;
  scene.add(sun);
}

export function addOcean(scene: T.Scene) {
  const sea = new T.Mesh(new T.PlaneGeometry(700, 700), new T.ShaderMaterial({
    vertexShader: `
      varying vec2 water;
      void main() {
        water = vec2(position.x, -position.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      varying vec2 water;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 f = fract(p), i = floor(p);
        vec2 u = f*f*(3.-2.*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)),u.x),
          mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
      }

      void main() {
        vec2 p = water / vec2(${COAST_X}, ${COAST_Z}.);
        float a = atan(p.x, -p.y);
        float coast = 1. + .042 * sin(5.*a) + .038 * cos(7.*a) + .025 * sin(13.*a);
        float distanceToBeach = (length(p) / coast - 1.053) * 51.;
        float shallows = exp(-max(distanceToBeach, 0.) * .164);
        vec3 color = mix(vec3(.006,.094,.154),vec3(.016,.51,.42),shallows*.91);
        float swell = noise(water*vec2(.18,.41))*.7 + noise(water*vec2(.42,1.12))*.3;
        color += vec3(.012,.043,.047) * (swell - .23);
        float drift = noise(water*.45) - .5;
        float breakers = sin((distanceToBeach + drift*.84) * 3.35);
        float whitecaps = smoothstep(.7,.91,swell) * .09;
        float foam = (smoothstep(.88,1.,breakers) * .75 + exp(-abs(distanceToBeach)*4.) * .24)
          * exp(-max(distanceToBeach,0.)*.41) * smoothstep(.12,.55,noise(water*.61));
        gl_FragColor = vec4(mix(color,vec3(.64,.93,.91),max(foam,whitecaps)),1.);
        #include <colorspace_fragment>
      }
    `,
  }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_LEVEL;
  scene.add(sea);
}

export function addClouds(scene: T.Scene) {
  const canvas = document.createElement("canvas");
  canvas.width = 448;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  for (const [x, y, width, height] of [
    [77, 152, 58, 38], [139, 149, 86, 48], [224, 161, 111, 47], [321, 155, 92, 45], [384, 145, 47, 27],
    [106, 130, 57, 42], [151, 97, 63, 56], [208, 76, 69, 61], [259, 110, 69, 49], [299, 98, 59, 51],
    [347, 130, 74, 44], [198, 133, 88, 57], [275, 149, 86, 44], [132, 153, 59, 31],
  ]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(width, height);
    const puff = ctx.createRadialGradient(-.17, -.25, 0, 0, 0, 1);
    puff.addColorStop(0, "rgba(255,246,224,.91)");
    puff.addColorStop(.43, "rgba(237,244,238,.80)");
    puff.addColorStop(.76, "rgba(191,219,223,.49)");
    puff.addColorStop(1, "rgba(151,185,205,0)");
    ctx.fillStyle = puff;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.restore();
  }
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  const geometry = new T.PlaneGeometry(1, 1);
  const material = new T.MeshBasicMaterial({ map, transparent: true, opacity: .91, depthWrite: false });
  for (const [x, z, width, yaw] of [
    [-86, -39, 32, -.23], [78, -57, 35, .27], [85, 39, 32, -.22],
    [-80, 60, 37, .37], [-34, -99, 41, -.16], [29, 90, 39, .19],
  ]) {
    const cloud = new T.Mesh(geometry, material);
    cloud.rotation.x = -Math.PI / 2;
    cloud.rotateZ(yaw);
    cloud.position.set(x, 8, z);
    cloud.scale.set(width, width * .58, 1);
    scene.add(cloud);
  }
}

const peaks = [
  { x: -19, z: -18, width: 15, depth: 10, height: 18 },
  { x: -10, z: -20, width: 10, depth: 12, height: 25 },
  { x: 10, z: -19, width: 11, depth: 12, height: 23 },
  { x: 19, z: -17, width: 14, depth: 11, height: 26 },
  { x: 25, z: -13, width: 12, depth: 11, height: 15 },
  { x: 12, z: -47, width: 10, depth: 8, height: 11 },
  { x: -16, z: -44, width: 13, depth: 8, height: 10 },
] as const;

// The creek crosses under the coastal circuit. Its four spillways form part of
// the same channel, so pools meet each other and the sea without floating edges.
const creek = [
  { x: -20, z: -11, halfWidth: 1.55, y: 2.93 },
  { x: -19, z: -5, halfWidth: 1.8, y: 2.87 },
  { x: -18, z: -3.4, halfWidth: 1.9, y: 1.65 },
  { x: -18.3, z: 2, halfWidth: 3, y: 1.58 },
  { x: -19.1, z: 3.6, halfWidth: 2.9, y: 0.05 },
  { x: -21, z: 9, halfWidth: 3.8, y: -0.02 },
  { x: -21.7, z: 10.8, halfWidth: 3.2, y: -1.82 },
  { x: -20, z: 17, halfWidth: 4.3, y: -1.94 },
  { x: -19, z: 23, halfWidth: 2.25, y: -2.02 },
  { x: -20, z: 29, halfWidth: 2.2, y: -2.15 },
  { x: -21.5, z: 34, halfWidth: 2.6, y: -2.26 },
  { x: -22, z: 36, halfWidth: 3, y: -3.67 },
  { x: -21, z: 53, halfWidth: 5.2, y: -3.69 },
] as const;

export function creekAt(z: number) {
  const index = creek.findIndex((point) => point.z >= z);
  if (index < 1) return index === 0 ? creek[0] : creek.at(-1)!;
  const from = creek[index - 1];
  const to = creek[index];
  const t = (z - from.z) / (to.z - from.z);
  const lerp = T.MathUtils.lerp;
  return { x: lerp(from.x, to.x, t), z, halfWidth: lerp(from.halfWidth, to.halfWidth, t), y: lerp(from.y, to.y, t) };
}

function ridgeHeight(x: number, z: number) {
  let height = 0;
  for (const peak of peaks) {
    const dx = (x - peak.x) / peak.width;
    const dz = (z - peak.z) / peak.depth;
    const angle = Math.atan2(dz, dx);
    const radius = Math.hypot(dx, dz) * (1 + .19 * Math.sin(angle * 5 + peak.x) + .09 * Math.cos(angle * 9));
    height = Math.max(height, peak.height * Math.max(0, 1 - radius) ** 1.31);
  }
  return height;
}

export function addLandscape(scene: T.Scene, road: ReturnType<typeof makeRoads>, random: () => number): LandHeight {
  const landscape = (x: number, z: number) => {
    const base = groundHeight(x, z);
    const clearance = road(x, z).distance;
    const margin = smooth(clearance, ROAD_WIDTH / 2 + 0.5, ROAD_WIDTH / 2 + 4.8);
    const texture = Math.sin(x * .71 + z * .5) * Math.cos(z * .49 - x * .26);
    const hills = 3.8 * Math.max(0, Math.sin(x * .115 + z * .076) * Math.cos(z * .14 - x * .045)) ** 2;
    const ridge = ridgeHeight(x, z);
    const shoreRadius = shore(x, z);
    const creekPoint = creekAt(z);
    const bank = Math.abs(x - creekPoint.x) - creekPoint.halfWidth;
    const river = 1 - smooth(bank, 0.25, 2.4);
    const ends = smooth(z, -12.3, -10.5);
    const beforeBridge = smooth(z, -10, -6) * (1 - smooth(z, 16, 20));
    const canyonRim = beforeBridge * smooth(bank, 0.5, 2.4) * (1 - smooth(bank, 2.4, 5.1)) * 2.9;
    const headland = shelteredBeach(x, z) ? 0 : smooth(shoreRadius, .74, .96)
      * (2.2 + 1.3 * Math.sin(x * .28 + z * .19) + Math.cos(z * .37) * .85);
    const dry = base + margin * ((hills + ridge + texture * (ridge > 1 ? .95 : .49) + canyonRim)
      * (1 - smooth(shoreRadius, .94, 1.02)) + headland);
    const carved = T.MathUtils.lerp(Math.max(dry, creekPoint.y + .35), creekPoint.y - .56, ends * river);
    return ends * river > 0 ? carved : dry;
  };
  const positions: number[] = [], colors: number[] = [];
  const tint = new T.Color();
  const pointCount = 172;
  const topCount = 50;
  const rings = [...Array.from({ length: topCount }, (_, i) => (i + .015) / topCount), .993, 1.007, 1.025, 1.05, 1.063];
  const layers = rings.map((radius, band) => Array.from({ length: pointCount }, (_, i) => {
    const a = ((i + (band % 2) * .45) * tau) / pointCount;
    const k = radius * coastline(a);
    const x = COAST_X * k * Math.sin(a);
    const z = -COAST_Z * k * Math.cos(a);
    const ground = landscape(x, z);
    const cliff = band - topCount;
    const beach = shelteredBeach(x, z);
    const cliffHeight = [
      ground,
      beach ? -1.24 + random() * .44 : ground - .68 - random() * .95,
      beach ? -2.23 + random() * .22 : -2.87 + random() * .38,
      -3.48,
      -3.7,
    ];
    const y = cliff < 1 ? ground : Math.min(cliffHeight[cliff], ground);
    return new T.Vector3(x, y, z);
  }));
  const rising = new T.Vector3();
  const across = new T.Vector3();
  const grassDark = new T.Color("#719443");
  const grassLight = new T.Color("#a6bd51");
  const slate = ["#777880", "#898177", "#9c8d7d", "#797477", "#aa977e", "#83766d"];
  const sand = ["#ddae72", "#efd097", "#e9ba7e", "#f4d5a2"];
  const snow = ["#fff2dd", "#e5eaf1", "#edebdf", "#d7e1ee"];
  for (let j = 1; j < rings.length; j++) {
    for (let i = 0; i < pointCount; i++) {
      const k = (i + 1) % pointCount;
      const a = layers[j - 1][i], b = layers[j][i], c = layers[j][k], d = layers[j - 1][k];
      for (const [v, w, u] of [[a, c, b], [a, d, c]]) {
        const altitude = (v.y + w.y + u.y) / 3;
        const x = (v.x + w.x + u.x) / 3;
        const z = (v.z + w.z + u.z) / 3;
        const normalY = Math.abs(rising.subVectors(w, v).cross(across.subVectors(u, v)).normalize().y);
        const line = 11.3 + Math.sin(x * .62 + z * .74) * 2.33 + Math.cos(x * .93 - z * .46) * 1.19;
        const onBeach = j >= topCount + 1 && shelteredBeach(x, z);
        const field = Math.sin(x * .22 + z * .19) + Math.cos(z * .31 - x * .13);
        const surface = altitude > line && normalY > .31 ? snow
          : onBeach ? sand
          : j > topCount || normalY < .73 || altitude > 8 && normalY < .93 ? slate
          : null;
        if (surface) tint.set(surface[Math.floor(random() * surface.length)]);
        else tint.copy(grassDark).lerp(grassLight, .47 + field * .21 + random() * .1);
        tint.multiplyScalar(.95 + random() * .10);
        for (const p of [v, w, u]) {
          positions.push(p.x, p.y, p.z);
          colors.push(tint.r, tint.g, tint.b);
        }
      }
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const land = new T.Mesh(geometry, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }));
  land.castShadow = land.receiveShadow = true;
  scene.add(land);
  return landscape;
}

export function addRiver(scene: T.Scene) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i <= 180; i++) {
    const z = -11 + (i / 180) * 62;
    const point = creekAt(z);
    for (const side of [-1, 1]) {
      const edge = point.halfWidth * (1.095 + .085 * Math.sin(z * 1.3 + side * 2));
      positions.push(point.x + side * edge, point.y, z);
      uv.push((side + 1) / 2, z);
    }
    if (i) {
      const a = i * 2;
      indices.push(a - 2, a, a - 1, a - 1, a, a + 1);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  const water = new T.Mesh(geometry, new T.ShaderMaterial({
    side: T.DoubleSide,
    vertexShader: `
      varying vec2 channel;
      void main() {
        channel = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
      }
    `,
    fragmentShader: `
      varying vec2 channel;
      void main() {
        float x = channel.x, z = channel.y;
        float spill = max(max(smoothstep(-5.2,-4.8,z)*(1.-smoothstep(-3.4,-2.,z)),
          smoothstep(1.8,2.1,z)*(1.-smoothstep(3.6,4.6,z))),
          max(smoothstep(8.8,9.1,z)*(1.-smoothstep(10.8,12.0,z)),
          smoothstep(33.8,34.1,z)*(1.-smoothstep(36.,37.1,z))));
        float edges = smoothstep(.37,.5,abs(x-.5));
        float turbulence = sin(z*1.4+x*19.) * .7 + sin(z*2.65-x*46.) * .26;
        float streaks = pow(.5+.5*sin(x*69.+turbulence+sin(x*23.)*1.13),2.3);
        float pool = sin(z*3.8+sin(x*13.+z*.36)*.89) * sin(x*22.5-z*.7);
        vec3 base = mix(vec3(.008,.29,.34),vec3(.029,.54,.68),spill);
        base += vec3(.018,.08,.09) * pool * (1.-spill*.65);
        float foam = streaks * (.025 + spill*.59) + edges*.26 + spill*.16;
        gl_FragColor = vec4(mix(base,vec3(.78,.96,1.),foam),1.);
        #include <colorspace_fragment>
      }
    `,
  }));
  scene.add(water);
}

export function addVegetation(
  scenery: Scenery, height: LandHeight, road: ReturnType<typeof makeRoads>,
  occupied: (x: number, z: number) => boolean, random: () => number,
) {
  const { add, beam } = scenery;
  const leaves = ["#91ae37", "#a8bd41", "#708e32", "#627e36", "#d0bd45", "#759f42"];
  const rocks = ["#9a8c7a", "#887b70", "#a79a84", "#7b7774", "#b3a28b"];
  function tree(x: number, y: number, z: number, size: number, species: number) {
    const a = random() * tau;
    if (species === 2) {
      const top = new T.Vector3(x + size * .16, y + size, z - size * .13);
      beam("#856044", new T.Vector3(x, y, z), top, size * .12);
      for (let i = 0; i < 6; i++) {
        const angle = a + i * tau / 6;
        add("crown", i % 2 ? "#648b3e" : "#94a943", top.x + Math.sin(angle) * size * .24,
          top.y + (i % 3) * .055 * size, top.z + Math.cos(angle) * size * .24, size * .2,
          size * .1, size * .64, angle);
      }
    } else if (species === 0) {
      add("post", "#76543a", x, y + size * .24, z, size * .12, size * .49, size * .12);
      for (let j = 0; j < 3; j++) {
        const width = (0.73 - j * .14) * size;
        add("cone", ["#3b673a", "#527b3b", "#718b3c"][j], x, y + size * (.42 + j * .21), z,
          width, size * (.62 - j * .074), width * .94, a + j * .47);
      }
    } else {
      const pink = species === 3;
      const top = new T.Vector3(x, y + size * .81, z);
      add("post", "#78533a", x, y + size * .28, z, size * .13, size * .56, size * .13);
      for (let i = 0; i < 4; i++) {
        const angle = a + i * tau / 4;
        const dx = Math.cos(angle) * size * .27;
        const dz = Math.sin(angle) * size * .27;
        const h = top.y - random() * size * .19;
        if (i < 2) beam("#896240", new T.Vector3(x, y + size * .34, z), new T.Vector3(x + dx, h, z + dz), size * .067);
        add("crown", pink ? ["#ea9da6", "#efb3b7", "#d97e9a", "#f3c7bd"][i]
          : leaves[Math.floor(random() * leaves.length)], x + dx, h, z + dz, size * .68, size * .52, size * .63, angle);
      }
      add("crown", pink ? "#f5b8c0" : "#a0b944", x, top.y + size * .075, z, size * .64, size * .53, size * .61, a);
    }
  }

  for (let i = 0; i < 1580; i++) {
    const x = (random() - .5) * 125;
    const z = (random() - .5) * 103;
    const radius = shore(x, z);
    const stream = creekAt(z);
    const riparian = z > -10.8 && Math.abs(x - stream.x) < stream.halfWidth + .75;
    const distance = road(x, z).distance;
    if (radius > .97 || distance < ROAD_WIDTH / 2 + 1 || riparian || occupied(x, z)) continue;
    const y = height(x, z);
    if (y > 13.2 || y < -.85) continue;
    const size = 1.35 + random() * 3.15;
    const slope = Math.max(Math.abs(height(x + .55, z) - y), Math.abs(height(x, z + .55) - y));
    if (i % 7 === 0 || slope > .63) {
      add("rock", rocks[i % rocks.length], x, y + size * .13, z, size, size * .8, size * .75, x, .3);
    } else if (i % 5 === 0 || distance < ROAD_WIDTH / 2 + 2) {
      add("crown", leaves[i % leaves.length], x, y + .17, z, size * .63, .4, size * .51, z);
      if (i % 3 === 0) for (let j = 0; j < 3; j++) {
        add("rock", i % 2 ? "#f3bb45" : "#e998a0", x + j * .26 - .25, y + .41 + .045 * j,
          z + .12 * j, .21, .19, .21);
      }
    } else {
      const alpine = z < -10 || y > 5.5;
      const coastal = z > 33 && radius > .83;
      tree(x, y, z, size, alpine ? 0 : coastal && i % 3 === 0 ? 2 : i % 17 === 0 ? 3 : 1);
    }
  }

  // Clusters extend from the rocky headlands into the shallow water.
  for (let i = 0; i < 75; i++) {
    const angle = random() * tau;
    const radius = coastline(angle) * (1.04 + random() ** 1.7 * .17);
    const x = COAST_X * Math.sin(angle) * radius;
    const z = -COAST_Z * Math.cos(angle) * radius;
    if ((x > 1 && x < 26 && z > 44) || (x > 42 && z > 22 && z < 38)) continue;
    const size = 1.25 + random() * 3.5;
    add("rock", rocks[i % rocks.length], x, SEA_LEVEL + .08, z, size, size * .86, size * .81, angle, .34);
    if (i % 2 === 0 && size > 2.45) {
      add("foam", "#b5eee1", x, SEA_LEVEL + .018, z, size * 1.29, 1, size * 1.1, angle);
      add("foam", "#a0dadb", x, SEA_LEVEL + .022, z, size * 1.63, 1, size * 1.33, angle + 1.1);
    }
  }
}

export function reserveScenery() {
  const areas: { x: number; z: number; radius: number }[] = [];
  const reserve: Reserve = (x, z, radius) => { areas.push({ x, z, radius }); };
  return {
    reserve,
    contains: (x: number, z: number) => areas.some((area) => Math.hypot(x - area.x, z - area.z) < area.radius),
  };
}

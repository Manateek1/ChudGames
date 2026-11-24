import * as THREE from "three";
import type { Realm } from "./protocol";
import { createTilePixels, TILE_SIZE } from "./tiles";

const color = (hex: number) => new THREE.Color(hex);

interface Atmosphere {
  zenith: THREE.Color;
  horizon: THREE.Color;
  night: THREE.Color;
  nightHorizon: THREE.Color;
  sunlight: THREE.Color;
  cloud: THREE.Color;
}

export const atmospheres: Record<Realm, Atmosphere> = {
  surface: {
    zenith: color(0x518fcb), horizon: color(0xc6dfe9), night: color(0x152137),
    nightHorizon: color(0x374c66), sunlight: color(0xfff0d4), cloud: color(0xfff9f0),
  },
  underdeep: {
    zenith: color(0x292238), horizon: color(0x543a46), night: color(0x292238),
    nightHorizon: color(0x543a46), sunlight: color(0xf8bd93), cloud: color(0x8e586b),
  },
  skyreach: {
    zenith: color(0x7a93c6), horizon: color(0xe7d4e2), night: color(0x2a274b),
    nightHorizon: color(0x5b587e), sunlight: color(0xffe4de), cloud: color(0xffedf9),
  },
};

const surfacePosition = `
  varying vec3 vVoxelPosition;
  varying vec3 vVoxelNormal;
`;

export function createVoxelMaterials() {
  const terrainLight = { value: new THREE.Color(1.65, 1.52, 1.40) };
  const pixels = createTilePixels();
  const palette = new THREE.DataArrayTexture(pixels, TILE_SIZE, TILE_SIZE, pixels.length / (4 * TILE_SIZE ** 2));
  palette.colorSpace = THREE.SRGBColorSpace;
  palette.magFilter = THREE.NearestFilter;
  palette.minFilter = THREE.NearestMipmapLinearFilter;
  palette.generateMipmaps = true;
  palette.needsUpdate = true;
  const solid = new THREE.MeshBasicMaterial({ vertexColors: true });
  solid.customProgramCacheKey = () => "buildblox-pixel-voxel";
  solid.onBeforeCompile = (shader) => {
    shader.uniforms.voxelTiles = { value: palette };
    shader.uniforms.terrainLight = terrainLight;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        attribute vec2 tileUv;
        attribute float tileIndex;
        varying vec2 vTileUv;
        varying float vTileIndex;`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvTileUv = tileUv;\nvTileIndex = tileIndex;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform highp sampler2DArray voxelTiles;
        uniform vec3 terrainLight;
        varying vec2 vTileUv;
        varying float vTileIndex;`)
      .replace("#include <color_fragment>", `
        #include <color_fragment>
        vec4 texel = texture(voxelTiles, vec3(vTileUv, vTileIndex));
        if (texel.a < 0.43) discard;
        diffuseColor.rgb *= texel.rgb * terrainLight;
      `);
  };

  const waterTime = { value: 0 };
  const waterSky = { value: new THREE.Color(0x87c6ee) };
  const waterSun = { value: new THREE.Vector3() };
  const liquid = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false, side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  liquid.customProgramCacheKey = () => "buildblox-liquid";
  liquid.onBeforeCompile = (shader) => {
    shader.uniforms.voxelTime = waterTime;
    shader.uniforms.waterSky = waterSky;
    shader.uniforms.waterSun = waterSun;
    shader.uniforms.terrainLight = terrainLight;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vVoxelPosition;\nvarying vec3 vVoxelNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvVoxelPosition = position;\nvVoxelNormal = normal;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${surfacePosition}
        uniform vec3 terrainLight;
        uniform vec3 waterSky;
        uniform vec3 waterSun;
        uniform float voxelTime;`)
      .replace("#include <color_fragment>", `
        #include <color_fragment>
        vec2 uv = floor(vVoxelPosition.xz * 15.0) / 15.0;
        float waveA = sin(dot(uv, vec2(2.8, 3.9)) + voxelTime * 1.45);
        float waveB = cos(dot(uv, vec2(4.7, -2.3)) - voxelTime * 1.27);
        float ripple = waveA + waveB;
        float isWater = step(diffuseColor.r, diffuseColor.b * 0.28);
        float isEmber = step(diffuseColor.b * 2.0, diffuseColor.r);
        diffuseColor.rgb *= terrainLight;
        vec3 eye = normalize(cameraPosition - vVoxelPosition);
        vec3 rippleNormal = normalize(vec3(waveA * 0.12, 1.0, waveB * 0.12));
        float fresnel = pow(1.0 - max(dot(rippleNormal, eye), 0.0), 4.0);
        float gleam = pow(max(dot(reflect(-waterSun, rippleNormal), eye), 0.0), 52.0);
        float top = max(vVoxelNormal.y, 0.0) * isWater;
        vec3 reflected = mix(diffuseColor.rgb * (0.93 + ripple * 0.06), waterSky, 0.24 + fresnel * 0.64);
        diffuseColor.rgb = mix(diffuseColor.rgb, reflected + vec3(0.52, 0.42, 0.30) * gleam, top);
        diffuseColor.rgb += vec3(0.38, 0.12, 0.048) * (0.38 + ripple * 0.09) * isEmber;
        diffuseColor.a *= 0.48 + (0.21 + fresnel * 0.25) * isWater + 0.70 * isEmber;
      `);
  };

  return { solid, liquid, palette, waterTime, waterSky, waterSun, terrainLight };
}

export function createSky() {
  const uniforms = {
    zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
    sunDirection: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() },
    daylight: { value: 1 }, celestial: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, toneMapped: false,
    vertexShader: `
      varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: `
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      uniform float daylight;
      uniform float celestial;
      varying vec3 skyDirection;
      float sparkle(vec2 tile) { return fract(sin(dot(tile, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 ray = normalize(skyDirection);
        vec3 skyColor = mix(horizon, zenith, smoothstep(-0.09, 0.70, ray.y));
        float mainLight = dot(ray, sunDirection);
        float glow = pow(max(mainLight, 0.0), 16.0) * daylight;
        float sunDisc = smoothstep(0.99910, 0.99955, mainLight) * daylight;
        float moonDisc = smoothstep(0.99930, 0.99964, -mainLight) * (1.0 - daylight);
        float star = 0.0;
        if (daylight < 0.95 && celestial > 0.0 && ray.y > 0.02) {
          vec2 stars = vec2(atan(ray.z, ray.x), asin(ray.y)) * 58.0;
          star = step(0.991, sparkle(floor(stars))) * (1.0 - smoothstep(0.055, 0.13, length(fract(stars) - 0.5)));
        }
        skyColor += (sunColor * (glow * 0.20 + sunDisc * 0.81) + vec3(0.65, 0.71, 0.92) * moonDisc
          + vec3(star * 0.62 * (1.0 - daylight) * smoothstep(0.02, 0.35, ray.y))) * celestial;
        gl_FragColor = vec4(skyColor, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 18, 12), material);
  sky.renderOrder = 100;
  sky.frustumCulled = false;
  return { sky, skyUniforms: uniforms };
}

export function createClouds() {
  // Overlapping slabs shape the clouds in one draw call.
  const shapes = [
    [-56, -24, 16, 14, 5.6], [-39, -72, 18, 17, 7.8], [37, -68, 14, 14, 6.2],
    [7, -92, 22, 22, 7.6], [66, -16, 21, 21, 7.4], [55, 35, 14, 15, 6.3],
    [11, 64, 20, 18, 8.3], [-73, 48, 12, 14, 6.2], [-88, -62, 23, 19, 8.4],
  ];
  const material = new THREE.MeshBasicMaterial({ fog: false, vertexColors: true });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const normals = geometry.attributes.normal;
  const colors = new Float32Array(normals.count * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < normals.count; i++) {
    tint.setHex(normals.getY(i) < 0 ? 0xe0dbdc : normals.getY(i) > 0 ? 0xfff9ef : 0xf3e9e3);
    tint.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const clouds = new THREE.InstancedMesh(geometry, material, shapes.length * 4);
  const slab = new THREE.Object3D();
  const shades = [0xf9ffff, 0xffffff, 0xfffbf5, 0xfffffc].map(color);
  let index = 0;
  for (const [x, z, lift, width, depth] of shapes) {
    const sizes = [
      [0, 0, 0, width, 1.48, depth],
      [width * 0.10, 1.34, -depth * 0.06, width * 0.65, 1.70, depth * 0.86],
      [-width * 0.27, 0.58, depth * 0.19, width * 0.43, 1.76, depth * 0.75],
      [width * 0.48, -0.19, depth * 0.22, width * 0.25, 0.84, depth * 0.66],
    ];
    for (const [part, [dx, dy, dz, sx, sy, sz]] of sizes.entries()) {
      slab.position.set(x + dx, lift + dy, z + dz);
      slab.scale.set(sx, sy, sz);
      slab.updateMatrix();
      clouds.setMatrixAt(index, slab.matrix);
      clouds.setColorAt(index++, shades[part]);
    }
  }
  clouds.computeBoundingSphere();
  return clouds;
}

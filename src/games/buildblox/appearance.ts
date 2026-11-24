import * as THREE from "three";
import type { Realm } from "./protocol";

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
    zenith: color(0x73b8cb), horizon: color(0xdfe8d3), night: color(0x152137),
    nightHorizon: color(0x374c66), sunlight: color(0xffe5b7), cloud: color(0xfffaf1),
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
  float grain(vec2 texel) {
    vec3 p = fract(vec3(texel.xyx) * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
`;

export function createVoxelMaterials() {
  const terrainLight = { value: new THREE.Color(1.65, 1.52, 1.40) };
  const solid = new THREE.MeshBasicMaterial({ vertexColors: true });
  solid.customProgramCacheKey = () => "buildblox-voxel";
  solid.onBeforeCompile = (shader) => {
    shader.uniforms.terrainLight = terrainLight;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vVoxelPosition;\nvarying vec3 vVoxelNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvVoxelPosition = position;\nvVoxelNormal = normal;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${surfacePosition}\nuniform vec3 terrainLight;`)
      .replace("#include <color_fragment>", `
        #include <color_fragment>
        vec3 axis = abs(vVoxelNormal);
        vec2 tile = axis.y > 0.5 ? vVoxelPosition.xz : (axis.x > 0.5 ? vVoxelPosition.zy : vVoxelPosition.xy);
        vec2 inner = fract(tile);
        vec2 texel = floor((tile + 0.0001) * 11.0);
        float fleck = grain(texel);
        float clump = grain(floor(tile * vec2(3.5, 4.25)));
        float pattern = 0.88 + fleck * 0.12 + clump * 0.14;
        float edge = min(min(inner.x, 1.0 - inner.x), min(inner.y, 1.0 - inner.y));
        float keepDetail = 1.0 - smoothstep(0.10, 0.32, max(fwidth(tile.x), fwidth(tile.y)));
        float beveled = 1.0 - 0.085 * (1.0 - smoothstep(0.0, 0.045, edge)) * keepDetail;
        diffuseColor.rgb *= mix(1.0, pattern, keepDetail) * beveled;
        diffuseColor.rgb = mix(diffuseColor.rgb, sqrt(diffuseColor.rgb), 0.08) * terrainLight;
      `);
  };

  const waterTime = { value: 0 };
  const liquid = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  liquid.customProgramCacheKey = () => "buildblox-liquid";
  liquid.onBeforeCompile = (shader) => {
    shader.uniforms.voxelTime = waterTime;
    shader.uniforms.terrainLight = terrainLight;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vVoxelPosition;\nvarying vec3 vVoxelNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvVoxelPosition = position;\nvVoxelNormal = normal;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${surfacePosition}\nuniform vec3 terrainLight;\nuniform float voxelTime;`)
      .replace("#include <color_fragment>", `
        #include <color_fragment>
        vec2 waveCell = floor(vVoxelPosition.xz * 13.0) / 13.0;
        float ripple = sin(waveCell.x * 2.8 + waveCell.y * 5.4 + voxelTime * 1.45)
          + sin(waveCell.x * 3.8 - waveCell.y * 1.5 - voxelTime * 0.85);
        float foam = smoothstep(1.69, 1.96, ripple) * abs(vVoxelNormal.y);
        float distanceFade = 1.0 - smoothstep(0.08, 0.30, length(fwidth(vVoxelPosition.xz)));
        float isWater = step(diffuseColor.r, diffuseColor.b * 0.28);
        float isEmber = step(diffuseColor.b * 2.0, diffuseColor.r);
        diffuseColor.rgb *= mix(1.0, 0.91 + ripple * 0.042, isWater);
        diffuseColor.rgb += vec3(0.24, 0.32, 0.28) * foam * distanceFade * isWater;
        diffuseColor.rgb *= terrainLight;
        diffuseColor.rgb += vec3(0.38, 0.12, 0.048) * (0.38 + ripple * 0.09) * isEmber;
        diffuseColor.a *= 0.48 + 0.52 * isWater + 0.70 * isEmber;
      `);
  };

  return { solid, liquid, waterTime, terrainLight };
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

import * as THREE from 'three';
import { createTileTexture, tileNoise } from './surfaceTextures';

export const ISLAND_HAZE = 0xb7c9d1;
const SUN_DIRECTION = new THREE.Vector3(-0.6, 0.52, -0.61).normalize();

/**
 * Shared Material Palette for FortLite.
 * Lazily creates and caches reusable THREE.MeshStandardMaterial instances.
 */
export class MaterialPalette {
  private materials: Map<string, THREE.MeshStandardMaterial> = new Map();

  private getMaterial(name: string, params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    let mat = this.materials.get(name);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial(params);
      mat.name = name;
      this.materials.set(name, mat);
    }
    return mat;
  }

  get grass() { return this.getMaterial('grass', { color: 0x5c7650, roughness: 1 }); }
  get dirtPath() { return this.getMaterial('dirtPath', { color: 0x7b6549, roughness: 0.92 }); }
  get sand() { return this.getMaterial('sand', { color: 0xd0aa66, roughness: 0.95 }); }
  get rock() { return this.getMaterial('rock', { color: 0x6f7a80, roughness: 0.92, metalness: 0.06 }); }
  get woodPlank() { return this.getMaterial('woodPlank', { color: 0x8c5a30, roughness: 0.85 }); }
  get metalSiding() { return this.getMaterial('metalSiding', { color: 0x8aa1b8, roughness: 0.55, metalness: 0.45 }); }
  get concrete() { return this.getMaterial('concrete', { color: 0x9f917d, roughness: 0.82 }); }
  get roofTile() { return this.getMaterial('roofTile', { color: 0xa0785a, roughness: 0.78, metalness: 0.04 }); }
  get water() { return this.getMaterial('water', { color: 0x3a8fbf, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.72 }); }
  get glassTint() { return this.getMaterial('glassTint', { color: 0xeef7ff, roughness: 0.35, metalness: 0.08, emissive: 0x92b9d5, emissiveIntensity: 0.16 }); }
  get cliffStone() { return this.getMaterial('cliffStone', { color: 0x68727d, roughness: 0.88 }); }
  get foliage() { return this.getMaterial('foliage', { color: 0x4a6d3a, roughness: 0.9 }); }

  /**
   * Disposes all created materials to free memory.
   */
  dispose(): void {
    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();
  }
}

export function createSkyDome(radius: number) {
  const geometry = new THREE.SphereGeometry(radius, 24, 12);
  const cloudMap = createTileTexture(128, (u, v) =>
    tileNoise(u, v, 4) * 0.57 + tileNoise(u, v, 9) * 0.25 +
    tileNoise(u, v, 20) * 0.12 + tileNoise(u, v, 43) * 0.06,
  'Coastal cloud cover');
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      cloudMap: { value: cloudMap },
      sunDirection: { value: SUN_DIRECTION },
      horizon: { value: new THREE.Color(ISLAND_HAZE) },
      zenith: { value: new THREE.Color(0x326b9d) },
      cloudShadow: { value: new THREE.Color(0x9caeb8) },
      cloudLight: { value: new THREE.Color(0xf5efe0) }
    },
    vertexShader: /* glsl */ `
      varying vec3 skyRay;
      void main() {
        skyRay = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D cloudMap;
      uniform vec3 sunDirection;
      uniform vec3 horizon;
      uniform vec3 zenith;
      uniform vec3 cloudShadow;
      uniform vec3 cloudLight;
      varying vec3 skyRay;

      void main() {
        vec3 ray = normalize(skyRay);
        float elevation = max(ray.y, 0.0);
        vec3 sky = mix(horizon, zenith, pow(smoothstep(0.0, 0.84, elevation), 0.55));
        float facingSun = max(0.0, dot(ray, sunDirection));
        sky = mix(sky, cloudLight, 0.34 * pow(facingSun, 9.0) * smoothstep(0.0, 0.22, elevation));
        sky = mix(sky, cloudLight, smoothstep(0.99945, 0.9998, facingSun));

        vec2 uv = ray.xz * (0.14 / max(elevation, 0.055)) + vec2(0.32, 0.17);
        float density = texture2D(cloudMap, uv).r;
        float litEdge = density - texture2D(cloudMap, uv + sunDirection.xz * 0.017).r;
        float light = smoothstep(-0.06, 0.06, litEdge);
        float cover = smoothstep(0.52, 0.67, density) * smoothstep(0.035, 0.19, elevation);
        gl_FragColor = vec4(mix(sky, mix(cloudShadow, cloudLight, light), cover * 0.94), 1.0);
        #include <colorspace_fragment>
      }
    `
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.frustumCulled = false;
  sky.renderOrder = 100;
  return sky;
}

/**
 * Creates atmospheric exponential fog.
 * @param mapRadius The radius of the playable map area.
 * @returns A THREE.FogExp2 instance.
 */
export function createAtmosphericFog(mapRadius: number): THREE.FogExp2 {
  // We want objects at mapRadius to be nearly invisible.
  // Formula: fog effect = 1 - exp(- (distance * density)^2 )
  // If we want effect ~ 0.95 at mapRadius:
  // exp(-(R*d)^2) = 0.05
  // -(R*d)^2 = ln(0.05) ~ -3
  // R*d ~ sqrt(3) ~ 1.732
  // density = 1.732 / mapRadius
  const density = 1.732 / mapRadius;
  return new THREE.FogExp2(ISLAND_HAZE, density);
}

/**
 * Creates the lighting setup for the island.
 * @param scene The scene to add the lights to.
 * @param quality The graphics quality setting.
 * @returns An object containing the created lights.
 */
export function createIslandLighting(scene: THREE.Scene): THREE.DirectionalLight {
  const hemisphere = new THREE.HemisphereLight(0xe4f1ff, 0x686350, 1.35);
  scene.add(hemisphere);
  
  const sun = new THREE.DirectionalLight(0xffefce, 1.75);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(116);
  sun.shadow.camera.left = -64;
  sun.shadow.camera.right = 64;
  sun.shadow.camera.top = 64;
  sun.shadow.camera.bottom = -64;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 240;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.10;
  sun.shadow.bias = -0.0003;
  scene.add(sun, sun.target);

  return sun;
}

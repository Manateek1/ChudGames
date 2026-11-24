import * as THREE from 'three';
import { createTileTexture, tileNoise } from './surfaceTextures';

const SEA_LEVEL = 0.08;

export function createIslandWater(size: number, heights: Float32Array, gridSize: number) {
  // The height grid is already available on the CPU. A single channel stores
  // the shallow band around sea level for sandbars and foam.
  const depth = new Uint8Array(heights.length);
  for (let i = 0; i < heights.length; i += 1) {
    depth[i] = Math.round(255 * THREE.MathUtils.clamp((SEA_LEVEL - heights[i]) * 0.48 + 0.06, 0, 1));
  }
  const shoreMap = new THREE.DataTexture(depth, gridSize, gridSize, THREE.RedFormat);
  shoreMap.magFilter = THREE.LinearFilter;
  shoreMap.minFilter = THREE.LinearFilter;
  shoreMap.needsUpdate = true;

  const rippleMap = createTileTexture(64, (u, v) => {
    const swell = Math.sin(2 * Math.PI * v * 5 + tileNoise(u, v, 5) * 6);
    return 0.42 + swell * 0.23 + tileNoise(u, v, 23) * 0.35;
  }, 'Wind ripples');
  const material = new THREE.ShaderMaterial({
    fog: true,
    side: THREE.DoubleSide,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      shoreMap: { value: shoreMap },
      rippleMap: { value: rippleMap },
      shoreScale: { value: (gridSize - 1) / (gridSize * size) },
      elapsed: { value: 0 },
      deep: { value: new THREE.Color(0x194861) },
      shoal: { value: new THREE.Color(0x528e84) },
      foam: { value: new THREE.Color(0xd2e1d7) },
      reflection: { value: new THREE.Color(0x89aebf) }
    },
    vertexShader: /* glsl */ `
      varying vec3 surfacePoint;
      #include <fog_pars_vertex>
      void main() {
        surfacePoint = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D shoreMap;
      uniform sampler2D rippleMap;
      uniform float shoreScale;
      uniform float elapsed;
      uniform vec3 deep;
      uniform vec3 shoal;
      uniform vec3 foam;
      uniform vec3 reflection;
      varying vec3 surfacePoint;
      #include <fog_pars_fragment>

      void main() {
        vec2 xz = surfacePoint.xz;
        float depth = texture2D(shoreMap, xz * shoreScale + 0.5).r;
        float mainWave = texture2D(rippleMap, xz * vec2(0.046, 0.071) + vec2(0.015, -0.027) * elapsed).r;
        float crossingWave = texture2D(rippleMap, (xz + xz.yx * vec2(0.34, -0.34)) * 0.12 + vec2(0.019, 0.012) * elapsed).r;
        float wave = mix(mainWave, crossingWave, 0.42);
        vec3 viewRay = normalize(cameraPosition - surfacePoint);
        float grazing = 1.0 - abs(viewRay.y);
        vec3 water = mix(shoal, deep, smoothstep(0.13, 0.95, depth));
        water = mix(water, reflection, 0.56 * pow(grazing, 4.0));
        water *= 0.84 + wave * 0.33;
        float breakers = 1.0 - smoothstep(0.1, 0.26, abs(depth - (0.13 + (mainWave - 0.5) * 0.17)));
        float whitecaps = smoothstep(0.61, 0.79, wave);
        water = mix(water, foam, breakers * whitecaps * 0.64);
        gl_FragColor = vec4(water, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `
  });
  const geometry = new THREE.PlaneGeometry(size * 1.25, size * 1.25);
  geometry.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(geometry, material);
  water.position.y = SEA_LEVEL;
  return water;
}

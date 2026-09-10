import * as THREE from 'three';
import type { GraphicsQuality } from '../../types/arcade';

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

/**
 * Creates a sky dome mesh with vertex colors forming a gradient.
 * @param radius The radius of the sky dome sphere.
 * @returns A THREE.Mesh representing the sky dome.
 */
export function createSkyDome(radius: number): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 64, 32);
  
  const positionAttribute = geometry.getAttribute('position');
  const colors = new Float32Array(positionAttribute.count * 3);
  
  const zenithColor = new THREE.Color(0x1a3c6e);
  const midColor = new THREE.Color(0x6bb3e0);
  const horizonColor = new THREE.Color(0xf0d4a0);
  const groundColor = new THREE.Color(0xc8d8e8);
  
  const color = new THREE.Color();
  
  for (let i = 0; i < positionAttribute.count; i++) {
    const y = positionAttribute.getY(i);
    const normalizedY = y / radius; // -1 to 1
    
    if (normalizedY > 0.5) {
      // Mid to Zenith
      const t = (normalizedY - 0.5) * 2;
      color.lerpColors(midColor, zenithColor, t);
    } else if (normalizedY > 0) {
      // Horizon to Mid
      const t = normalizedY * 2;
      color.lerpColors(horizonColor, midColor, t);
    } else {
      // Below horizon
      const t = Math.min(1, -normalizedY * 2);
      color.lerpColors(horizonColor, groundColor, t);
    }
    
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  
  const material = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    vertexColors: true,
    fog: false
  });
  
  return new THREE.Mesh(geometry, material);
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
  return new THREE.FogExp2(0xc6dff0, density);
}

/**
 * Creates the lighting setup for the island.
 * @param scene The scene to add the lights to.
 * @param quality The graphics quality setting.
 * @returns An object containing the created lights.
 */
export function createIslandLighting(
  scene: THREE.Scene, 
  quality: GraphicsQuality
): { sun: THREE.DirectionalLight; hemisphere: THREE.HemisphereLight; fill: THREE.DirectionalLight } {
  
  const hemisphere = new THREE.HemisphereLight(0xf8f6e9, 0x31402a, 1.5);
  scene.add(hemisphere);
  
  const sun = new THREE.DirectionalLight(0xffefc8, 1.32);
  sun.position.set(-34, 44, 20);
  
  if (quality === 'medium' || quality === 'high') {
    sun.castShadow = true;
    sun.shadow.mapSize.width = quality === 'high' ? 2048 : 1024;
    sun.shadow.mapSize.height = quality === 'high' ? 2048 : 1024;
    
    sun.shadow.camera.left = -60;
    sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60;
    sun.shadow.camera.bottom = -60;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.bias = -0.001;
  }
  
  scene.add(sun);
  
  const fill = new THREE.DirectionalLight(0x9fdcff, 0.42);
  fill.position.set(26, 18, -16);
  scene.add(fill);
  
  return { sun, hemisphere, fill };
}

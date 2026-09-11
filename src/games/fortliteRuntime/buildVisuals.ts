import * as THREE from 'three';
import { RAMP_HEIGHT, RAMP_LENGTH, RAMP_THICKNESS, RAMP_WIDTH } from './constants';
import { getBuildFootprint } from './buildPlacement';
import type { BuildPieceType, MaterialType } from './types';

/** Creates the low-poly geometry used by the build preview and placed pieces. */
export function createBuildGeometry(pieceType: BuildPieceType): THREE.BufferGeometry {
  if (pieceType === 'ramp') {
    return createRampGeometry();
  }

  const footprint = getBuildFootprint(pieceType, 0);
  return new THREE.BoxGeometry(footprint.width, footprint.height, footprint.depth);
}

/** Gives placed pieces a readable, lightly emissive material without extra textures. */
export function createBuildMaterial(color: number, transparent: boolean): THREE.MeshStandardMaterial {
  const baseColor = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: baseColor,
    emissive: baseColor.clone().multiplyScalar(transparent ? 0.24 : 0.08),
    emissiveIntensity: transparent ? 1.15 : 0.7,
    transparent,
    opacity: transparent ? 0.46 : 0.94,
    depthWrite: !transparent,
    roughness: transparent ? 0.62 : 0.78,
    metalness: transparent ? 0.12 : 0.08,
    flatShading: true,
    side: THREE.DoubleSide
  });
}

export function getBuildMaterialColor(materialType: MaterialType): number {
  if (materialType === 'wood') {
    return 0xc18b43;
  }
  if (materialType === 'stone') {
    return 0xa9b4bf;
  }
  return 0x93b0c5;
}

function createRampGeometry(): THREE.BufferGeometry {
  const halfWidth = RAMP_WIDTH * 0.5;
  const halfLength = RAMP_LENGTH * 0.5;
  const bottomY = -RAMP_HEIGHT * 0.5;
  const highY = RAMP_HEIGHT * 0.5;
  const lowY = bottomY + RAMP_THICKNESS;

  const vertices = [
    -halfWidth, bottomY, -halfLength,
    halfWidth, bottomY, -halfLength,
    -halfWidth, highY, -halfLength,
    halfWidth, highY, -halfLength,
    -halfWidth, bottomY, halfLength,
    halfWidth, bottomY, halfLength,
    -halfWidth, lowY, halfLength,
    halfWidth, lowY, halfLength
  ];
  const indices = [
    2, 3, 7, 2, 7, 6,
    0, 4, 5, 0, 5, 1,
    0, 1, 3, 0, 3, 2,
    4, 6, 7, 4, 7, 5,
    0, 2, 6, 0, 6, 4,
    1, 5, 7, 1, 7, 3
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  const nonIndexed = geometry.toNonIndexed();
  geometry.dispose();
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}


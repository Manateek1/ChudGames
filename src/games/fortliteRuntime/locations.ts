import * as THREE from 'three';
import type { ObstacleBox } from './types';
import { SeededRandom } from './math';

export interface WalkableSurface {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  minApproachY: number;
}

export interface LocationResult {
  meshes: THREE.Object3D[];
  obstacles: ObstacleBox[];
  lootSpawnPoints: THREE.Vector3[];
  walkableSurfaces: WalkableSurface[];
  raycastTargets: THREE.Object3D[];
  cameraObstacles: THREE.Object3D[];
}

function createBoxMesh(width: number, height: number, depth: number, color: number): THREE.Mesh {
  const geom = new THREE.BoxGeometry(width, height, depth);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeWall(pos: THREE.Vector3, width: number, height: number, thickness: number, color: number, yaw: number = 0) {
  const mesh = createBoxMesh(width, height, thickness, color);
  mesh.position.copy(pos);
  mesh.position.y += height / 2;
  mesh.rotation.y = yaw;
  
  // Create a container to handle obstacle rotation properly if it's axis aligned, but for this simple version we assume axis aligned if yaw is 0, 90.
  // Actually, ObstacleBox is AABB. We need to calculate bounds properly.
  const isRotated = Math.abs(Math.sin(yaw)) > 0.5;
  const boundX = isRotated ? thickness : width;
  const boundZ = isRotated ? width : thickness;
  
  const obstacle: ObstacleBox = {
    minX: pos.x - boundX / 2,
    maxX: pos.x + boundX / 2,
    minZ: pos.z - boundZ / 2,
    maxZ: pos.z + boundZ / 2,
    height: pos.y + height,
    mesh
  };
  return { mesh, obstacle };
}

function makeFloor(pos: THREE.Vector3, sizeX: number, sizeZ: number, thickness: number, color: number) {
  const mesh = createBoxMesh(sizeX, thickness, sizeZ, color);
  mesh.position.copy(pos);
  const obstacle: ObstacleBox = {
    minX: pos.x - sizeX / 2,
    maxX: pos.x + sizeX / 2,
    minZ: pos.z - sizeZ / 2,
    maxZ: pos.z + sizeZ / 2,
    height: pos.y + thickness / 2,
    mesh
  };
  const walkable: WalkableSurface = {
    minX: pos.x - sizeX / 2,
    maxX: pos.x + sizeX / 2,
    minZ: pos.z - sizeZ / 2,
    maxZ: pos.z + sizeZ / 2,
    height: pos.y + thickness / 2,
    minApproachY: pos.y - thickness / 2 - 1
  };
  return { mesh, obstacle, walkable };
}

function makeRoof(pos: THREE.Vector3, sizeX: number, sizeZ: number, thickness: number, color: number) {
  const mesh = createBoxMesh(sizeX, thickness, sizeZ, color);
  mesh.position.copy(pos);
  return { mesh };
}

function makePitchedRoof(pos: THREE.Vector3, sizeX: number, sizeZ: number, peakHeight: number, color: number, yaw: number = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(-sizeX / 2, 0);
  shape.lineTo(sizeX / 2, 0);
  shape.lineTo(0, peakHeight);
  shape.lineTo(-sizeX / 2, 0);

  const extrudeSettings = {
    depth: sizeZ,
    bevelEnabled: false
  };
  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geom.center();
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.copy(pos);
  mesh.rotation.y = yaw;
  return { mesh };
}

function buildBasicStructure(center: THREE.Vector3, width: number, depth: number, height: number, wallColor: number, hasPitchedRoof: boolean = false): LocationResult {
  const result: LocationResult = {
    meshes: [], obstacles: [], lootSpawnPoints: [], walkableSurfaces: [], raycastTargets: [], cameraObstacles: []
  };

  const thickness = 0.4;
  
  // Floor
  const floor = makeFloor(new THREE.Vector3(center.x, center.y + thickness / 2, center.z), width, depth, thickness, 0x5a5a5a);
  result.meshes.push(floor.mesh);
  result.obstacles.push(floor.obstacle);
  result.walkableSurfaces.push(floor.walkable);
  result.raycastTargets.push(floor.mesh);

  // Walls (North, South, East, West)
  const nWall = makeWall(new THREE.Vector3(center.x, center.y + thickness, center.z - depth / 2 + thickness / 2), width, height, thickness, wallColor, 0);
  const sWall = makeWall(new THREE.Vector3(center.x, center.y + thickness, center.z + depth / 2 - thickness / 2), width, height, thickness, wallColor, 0);
  const eWall = makeWall(new THREE.Vector3(center.x + width / 2 - thickness / 2, center.y + thickness, center.z), depth, height, thickness, wallColor, Math.PI / 2);
  const wWall = makeWall(new THREE.Vector3(center.x - width / 2 + thickness / 2, center.y + thickness, center.z), depth, height, thickness, wallColor, Math.PI / 2);

  // Leave gaps for doors manually or just use simple walls for now, simplified for the assignment
  for (const w of [nWall, sWall, eWall, wWall]) {
    result.meshes.push(w.mesh);
    result.obstacles.push(w.obstacle);
    result.raycastTargets.push(w.mesh);
    result.cameraObstacles.push(w.mesh);
  }

  // Roof
  if (hasPitchedRoof) {
    const roof = makePitchedRoof(new THREE.Vector3(center.x, center.y + height + thickness + 1.5, center.z), width + 1, depth + 1, 3, 0x4a4a4a);
    result.meshes.push(roof.mesh);
    result.raycastTargets.push(roof.mesh);
  } else {
    const roof = makeRoof(new THREE.Vector3(center.x, center.y + height + thickness + 0.2, center.z), width + 1, depth + 1, 0.4, 0x4a4a4a);
    result.meshes.push(roof.mesh);
    result.raycastTargets.push(roof.mesh);
  }

  // Loot inside
  result.lootSpawnPoints.push(new THREE.Vector3(center.x, center.y + thickness + 0.5, center.z));

  return result;
}

export function createHarborDistrict(center: THREE.Vector3, rng: SeededRandom, heightSampler: (x: number, z: number) => number): LocationResult {
  const result: LocationResult = {
    meshes: [], obstacles: [], lootSpawnPoints: [], walkableSurfaces: [], raycastTargets: [], cameraObstacles: []
  };

  const merge = (r: LocationResult) => {
    result.meshes.push(...r.meshes);
    result.obstacles.push(...r.obstacles);
    result.lootSpawnPoints.push(...r.lootSpawnPoints);
    result.walkableSurfaces.push(...r.walkableSurfaces);
    result.raycastTargets.push(...r.raycastTargets);
    result.cameraObstacles.push(...r.cameraObstacles);
  };

  // Warehouses
  const y1 = heightSampler(center.x - 15, center.z - 15);
  merge(buildBasicStructure(new THREE.Vector3(center.x - 15, y1, center.z - 15), 20, 14, 7, 0x7a8a96, false));
  
  const y2 = heightSampler(center.x + 15, center.z - 15);
  merge(buildBasicStructure(new THREE.Vector3(center.x + 15, y2, center.z - 15), 20, 14, 7, 0x7a8a96, false));

  // Dock
  const dockY = Math.min(heightSampler(center.x, center.z + 10), -0.5);
  const dock = makeFloor(new THREE.Vector3(center.x, dockY, center.z + 20), 6, 30, 1, 0x8c6a3e);
  result.meshes.push(dock.mesh);
  result.obstacles.push(dock.obstacle);
  result.walkableSurfaces.push(dock.walkable);
  result.raycastTargets.push(dock.mesh);
  result.lootSpawnPoints.push(new THREE.Vector3(center.x, dockY + 1, center.z + 25));

  // Crates
  for (let i = 0; i < 4; i++) {
    const cx = center.x + rng.range(-2, 2);
    const cz = center.z + 10 + rng.range(0, 20);
    const crate = makeWall(new THREE.Vector3(cx, dockY + 1.5, cz), 2, 2, 2, 0x664422);
    result.meshes.push(crate.mesh);
    result.obstacles.push(crate.obstacle);
    result.raycastTargets.push(crate.mesh);
    result.cameraObstacles.push(crate.mesh);
  }

  // Crane
  const craneGeom = new THREE.CylinderGeometry(0.5, 0.5, 18);
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xccaa11 });
  const craneMesh = new THREE.Mesh(craneGeom, craneMat);
  craneMesh.position.set(center.x - 4, dockY + 9, center.z + 30);
  craneMesh.castShadow = true;
  result.meshes.push(craneMesh);
  result.raycastTargets.push(craneMesh);

  const boomGeom = new THREE.BoxGeometry(1, 12, 0.4);
  const boomMesh = new THREE.Mesh(boomGeom, craneMat);
  boomMesh.position.set(center.x - 4, dockY + 17, center.z + 25);
  boomMesh.rotation.x = Math.PI / 4;
  boomMesh.castShadow = true;
  result.meshes.push(boomMesh);
  result.raycastTargets.push(boomMesh);

  // Boathouses
  const by1 = heightSampler(center.x - 25, center.z + 5);
  merge(buildBasicStructure(new THREE.Vector3(center.x - 25, by1, center.z + 5), 8, 6, 4, 0x8c5a30, true));

  const by2 = heightSampler(center.x + 25, center.z + 5);
  merge(buildBasicStructure(new THREE.Vector3(center.x + 25, by2, center.z + 5), 8, 6, 4, 0x8c5a30, true));

  return result;
}

export function createHillSettlement(center: THREE.Vector3, rng: SeededRandom, heightSampler: (x: number, z: number) => number): LocationResult {
  const result: LocationResult = {
    meshes: [], obstacles: [], lootSpawnPoints: [], walkableSurfaces: [], raycastTargets: [], cameraObstacles: []
  };

  const merge = (r: LocationResult) => {
    result.meshes.push(...r.meshes);
    result.obstacles.push(...r.obstacles);
    result.lootSpawnPoints.push(...r.lootSpawnPoints);
    result.walkableSurfaces.push(...r.walkableSurfaces);
    result.raycastTargets.push(...r.raycastTargets);
    result.cameraObstacles.push(...r.cameraObstacles);
  };

  // 4 Residential buildings
  const offsets = [
    new THREE.Vector3(-10, 0, -10),
    new THREE.Vector3(10, 0, -10),
    new THREE.Vector3(-10, 0, 10),
    new THREE.Vector3(10, 0, 10)
  ];

  for (const offset of offsets) {
    const pos = center.clone().add(offset);
    pos.y = heightSampler(pos.x, pos.z);
    merge(buildBasicStructure(pos, 8, 7, 5, 0x9a9080, true));
  }

  // Stone walls
  const wallPos = new THREE.Vector3(center.x, heightSampler(center.x, center.z) + 0.75, center.z);
  const stoneWall = makeWall(wallPos, 6, 1.5, 0.4, 0x88919a, 0);
  result.meshes.push(stoneWall.mesh);
  result.obstacles.push(stoneWall.obstacle);
  result.raycastTargets.push(stoneWall.mesh);
  
  // Central well
  const wellGeom = new THREE.CylinderGeometry(1.2, 1.2, 1.5);
  const wellMat = new THREE.MeshLambertMaterial({ color: 0x5a5a5a });
  const wellMesh = new THREE.Mesh(wellGeom, wellMat);
  wellMesh.position.set(center.x, heightSampler(center.x, center.z) + 0.75, center.z);
  wellMesh.castShadow = true;
  result.meshes.push(wellMesh);
  result.raycastTargets.push(wellMesh);

  // Winding path patches
  const pathMat = new THREE.MeshLambertMaterial({ color: 0x9e8a6c });
  for (let i = 0; i < 4; i++) {
    const pathGeom = new THREE.CircleGeometry(3, 16);
    const pathMesh = new THREE.Mesh(pathGeom, pathMat);
    pathMesh.rotation.x = -Math.PI / 2;
    const px = center.x + rng.range(-15, 15);
    const pz = center.z + rng.range(-15, 15);
    pathMesh.position.set(px, heightSampler(px, pz) + 0.1, pz);
    pathMesh.receiveShadow = true;
    result.meshes.push(pathMesh);
  }

  return result;
}

export function createLighthouseOverlook(center: THREE.Vector3, rng: SeededRandom, heightSampler: (x: number, z: number) => number): LocationResult {
  const result: LocationResult = {
    meshes: [], obstacles: [], lootSpawnPoints: [], walkableSurfaces: [], raycastTargets: [], cameraObstacles: []
  };

  const merge = (r: LocationResult) => {
    result.meshes.push(...r.meshes);
    result.obstacles.push(...r.obstacles);
    result.lootSpawnPoints.push(...r.lootSpawnPoints);
    result.walkableSurfaces.push(...r.walkableSurfaces);
    result.raycastTargets.push(...r.raycastTargets);
    result.cameraObstacles.push(...r.cameraObstacles);
  };

  const baseHeight = heightSampler(center.x, center.z);

  // Lighthouse Tower
  const towerGeom = new THREE.CylinderGeometry(2.5, 3.5, 22, 8);
  const towerMat = new THREE.MeshLambertMaterial({ color: 0xe8e2d8 });
  const towerMesh = new THREE.Mesh(towerGeom, towerMat);
  towerMesh.position.set(center.x, baseHeight + 11, center.z);
  towerMesh.castShadow = true;
  towerMesh.receiveShadow = true;
  result.meshes.push(towerMesh);
  result.raycastTargets.push(towerMesh);
  result.cameraObstacles.push(towerMesh);
  
  const obstacle: ObstacleBox = {
    minX: center.x - 3.5,
    maxX: center.x + 3.5,
    minZ: center.z - 3.5,
    maxZ: center.z + 3.5,
    height: baseHeight + 22,
    mesh: towerMesh
  };
  result.obstacles.push(obstacle);

  // Red accent band
  const bandGeom = new THREE.CylinderGeometry(2.6, 2.6, 1, 8);
  const bandMat = new THREE.MeshLambertMaterial({ color: 0xff4444 });
  const bandMesh = new THREE.Mesh(bandGeom, bandMat);
  bandMesh.position.set(center.x, baseHeight + 19, center.z);
  result.meshes.push(bandMesh);

  // Beacon Light
  const beaconGeom = new THREE.SphereGeometry(1.2);
  const beaconMat = new THREE.MeshLambertMaterial({ color: 0xffd385, emissive: 0xffd385, emissiveIntensity: 0.8 });
  const beaconMesh = new THREE.Mesh(beaconGeom, beaconMat);
  beaconMesh.position.set(center.x, baseHeight + 23, center.z);
  result.meshes.push(beaconMesh);

  // Keeper's House
  const houseX = center.x + 12;
  const houseZ = center.z + 5;
  const houseY = heightSampler(houseX, houseZ);
  merge(buildBasicStructure(new THREE.Vector3(houseX, houseY, houseZ), 10, 8, 4.5, 0xb8a888, true));
  
  result.lootSpawnPoints.push(new THREE.Vector3(center.x - 4, baseHeight + 1, center.z));

  // Rocks
  const rockGeom = new THREE.DodecahedronGeometry(1);
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
  for (let i = 0; i < 6; i++) {
    const rx = center.x + rng.range(-20, 20);
    const rz = center.z + rng.range(-20, 20);
    const ry = heightSampler(rx, rz);
    const scale = rng.range(1.5, 4);
    
    const rockMesh = new THREE.Mesh(rockGeom, rockMat);
    rockMesh.position.set(rx, ry + scale / 2, rz);
    rockMesh.scale.set(scale, scale, scale);
    rockMesh.rotation.set(rng.range(0, Math.PI), rng.range(0, Math.PI), rng.range(0, Math.PI));
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;
    
    result.meshes.push(rockMesh);
    result.raycastTargets.push(rockMesh);
    result.cameraObstacles.push(rockMesh);
    
    result.obstacles.push({
      minX: rx - scale,
      maxX: rx + scale,
      minZ: rz - scale,
      maxZ: rz + scale,
      height: ry + scale * 2,
      mesh: rockMesh
    });
  }

  // Winding staircase
  for (let i = 0; i < 12; i++) {
    const stepX = center.x - 15 + i * 1.2;
    const stepZ = center.z + i * 0.5;
    const stepY = heightSampler(stepX, stepZ) + i * 0.4;
    const step = makeFloor(new THREE.Vector3(stepX, stepY, stepZ), 3, 2, 0.4, 0x888888);
    result.meshes.push(step.mesh);
    result.obstacles.push(step.obstacle);
    result.walkableSurfaces.push(step.walkable);
    result.raycastTargets.push(step.mesh);
  }

  return result;
}

export function createSmallOutpost(center: THREE.Vector3, rng: SeededRandom, heightSampler: (x: number, z: number) => number): LocationResult {
  const result: LocationResult = {
    meshes: [], obstacles: [], lootSpawnPoints: [], walkableSurfaces: [], raycastTargets: [], cameraObstacles: []
  };

  const merge = (r: LocationResult) => {
    result.meshes.push(...r.meshes);
    result.obstacles.push(...r.obstacles);
    result.lootSpawnPoints.push(...r.lootSpawnPoints);
    result.walkableSurfaces.push(...r.walkableSurfaces);
    result.raycastTargets.push(...r.raycastTargets);
    result.cameraObstacles.push(...r.cameraObstacles);
  };

  const numBuildings = rng.int(1, 2);
  
  for (let i = 0; i < numBuildings; i++) {
    const bx = center.x + (i === 0 ? -5 : 5);
    const bz = center.z + rng.range(-2, 2);
    const by = heightSampler(bx, bz);
    merge(buildBasicStructure(new THREE.Vector3(bx, by, bz), 8, 6, 4.5, 0x778877, true));
  }
  
  // Low perimeter wall
  const pY = heightSampler(center.x, center.z);
  const wall1 = makeWall(new THREE.Vector3(center.x, pY + 0.5, center.z - 12), 20, 1, 0.4, 0x555555, 0);
  const wall2 = makeWall(new THREE.Vector3(center.x, pY + 0.5, center.z + 12), 20, 1, 0.4, 0x555555, 0);
  
  for (const w of [wall1, wall2]) {
    result.meshes.push(w.mesh);
    result.obstacles.push(w.obstacle);
    result.raycastTargets.push(w.mesh);
  }

  return result;
}

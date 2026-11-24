import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { seededRandom } from "../../engine/math";
import { trackPoint } from "./track";
import type { ApexTrack } from "./track";

function batch(scene: THREE.Scene, parts: THREE.BufferGeometry[], color: number): void {
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  parts.forEach((part) => part.dispose());
}

export function addCourseObstacles(scene: THREE.Scene, track: ApexTrack): void {
  const snow = track.id === "whitecap";
  const obstacles: THREE.BufferGeometry[] = [];
  const markers: THREE.BufferGeometry[] = [];
  for (const obstacle of track.obstacles) {
    const p = trackPoint(obstacle.progress, track);
    const place = (geometry: THREE.BufferGeometry, lateral = 0) => geometry.rotateY(p.heading)
      .translate(p.x + p.nx * (obstacle.lateral + lateral), p.y, p.z + p.nz * (obstacle.lateral + lateral));
    if (snow) {
      // Several lumpy drifts fit within the same footprint used by the car.
      for (const lobe of [-1, 0, 1]) {
        obstacles.push(place(new THREE.IcosahedronGeometry(1, 1)
          .scale(obstacle.width * 0.27, 0.75 + (1 - Math.abs(lobe)) * 0.42, obstacle.depth * 0.46)
          .translate(lobe * obstacle.width * 0.22, 0.25, 0)));
      }
    } else {
      obstacles.push(place(new THREE.BoxGeometry(obstacle.width, 0.79, obstacle.depth).translate(0, 0.40, 0)));
      for (const stripe of [-1, 0, 1]) {
        markers.push(place(new THREE.BoxGeometry(0.43, 0.20, obstacle.depth + 0.012)
          .rotateZ(-0.45).translate(stripe * obstacle.width * 0.29, 0.50, 0)));
      }
    }
    for (const side of [-1, 1]) {
      const height = snow ? 1.45 : 0.60;
      markers.push(place(new THREE.CylinderGeometry(snow ? 0.045 : 0.04, snow ? 0.045 : 0.20, height, 7)
        .translate(0, height / 2, -obstacle.depth * 0.65), side * obstacle.width * 0.44));
    }
  }
  batch(scene, obstacles, snow ? 0xe0edf5 : 0xba6838);
  batch(scene, markers, snow ? 0xe75931 : 0xffdfaa);
}

export function addCoastPalms(scene: THREE.Scene, track: ApexTrack, ground: (x: number, z: number) => number): void {
  const random = seededRandom(90217);
  const fronds: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i += 1) {
    const frond = new THREE.PlaneGeometry(0.68, 2.9, 2, 5);
    const points = frond.attributes.position;
    for (let j = 0; j < points.count; j += 1) {
      const t = points.getY(j) / 2.9 + 0.5;
      points.setXYZ(j, points.getX(j) * Math.sin(Math.PI * t), Math.sin(t * Math.PI) * 0.68 - t * 0.55, t * 2.9);
    }
    frond.computeVertexNormals();
    fronds.push(frond.rotateY(i * Math.PI * 2 / 9).translate(0, 5.0, 0.35));
  }
  const crowns = new THREE.InstancedMesh(mergeGeometries(fronds), new THREE.MeshLambertMaterial({
    color: 0x416a3e,
    side: THREE.DoubleSide,
  }), 55);
  fronds.forEach((frond) => frond.dispose());
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.14, 0.26, 5.06, 7).translate(0, 2.52, 0).rotateX(0.07),
    new THREE.MeshLambertMaterial({ color: 0x86704e }),
    55,
  );
  const transform = new THREE.Object3D();
  let count = 0;
  for (let i = 0; i < 120 && count < crowns.count; i += 1) {
    const p = trackPoint(random() * 0.28, track);
    const offset = (14 + random() * 18) * (i % 3 === 0 ? -1 : 1);
    const x = p.x + p.nx * offset;
    const z = p.z + p.nz * offset;
    const y = ground(x, z);
    if (y < 2 || y > 19) continue;
    transform.position.set(x, y, z);
    transform.rotation.y = random() * Math.PI * 2;
    transform.scale.setScalar(0.75 + random() * 0.64);
    transform.updateMatrix();
    crowns.setMatrixAt(count, transform.matrix);
    trunks.setMatrixAt(count, transform.matrix);
    count += 1;
  }
  crowns.count = trunks.count = count;
  scene.add(crowns, trunks);
}

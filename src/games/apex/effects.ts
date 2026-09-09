import * as THREE from "three";
import type { VehicleState } from "./physics";

export class RoadEffects {
  readonly points: THREE.Points;
  readonly marks: THREE.InstancedMesh;
  private positions = new Float32Array(220 * 3);
  private velocities = new Float32Array(220 * 3);
  private ages = new Float32Array(220);
  private cursor = 0;
  private markCursor = 0;
  private emission = 0;
  private markDistance = 0;
  private matrix = new THREE.Object3D();
  limit = 150;
  constructor(scene: THREE.Scene) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(215,210,197,.32)");
    g.addColorStop(0.4, "rgba(200,197,189,.18)");
    g.addColorStop(1, "rgba(200,197,189,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    this.positions.fill(-10000);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: new THREE.CanvasTexture(canvas),
        color: 0xe9ded1,
        size: 2.5,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
    const markGeo = new THREE.PlaneGeometry(0.21, 0.85);
    markGeo.rotateX(-Math.PI / 2);
    this.marks = new THREE.InstancedMesh(
      markGeo,
      new THREE.MeshBasicMaterial({
        color: 0x18191a,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
      700,
    );
    this.marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.marks.frustumCulled = false;
    this.matrix.scale.setScalar(0);
    this.matrix.updateMatrix();
    for (let i = 0; i < 700; i++) this.marks.setMatrixAt(i, this.matrix.matrix);
    this.matrix.scale.setScalar(1);
    scene.add(this.marks);
  }
  update(s: VehicleState, sliding: boolean, dt: number): void {
    for (let i = 0; i < 220; i++)
      if (this.ages[i] > 0) {
        this.ages[i] -= dt;
        const j = i * 3;
        if (this.ages[i] <= 0) this.positions[j + 1] = -10000;
        else {
          this.positions[j] += this.velocities[j] * dt;
          this.positions[j + 1] += this.velocities[j + 1] * dt;
          this.positions[j + 2] += this.velocities[j + 2] * dt;
        }
      }
    const active =
      (sliding || Math.abs(s.road.lateral) > 6.15 || s.impact > 0.3) &&
      Math.abs(s.speed) > 5;
    if (active) {
      this.emission += dt * 35;
      this.markDistance += Math.abs(s.speed) * dt;
      while (this.emission >= 1) {
        this.emission--;
        const i = this.cursor++ % this.limit,
          j = i * 3,
          side = this.cursor % 2 ? 1 : -1;
        this.ages[i] = 0.8 + Math.random() * 0.8;
        this.positions[j] =
          s.x - Math.sin(s.heading) * 1.4 + Math.cos(s.heading) * side;
        this.positions[j + 1] = s.y + 0.3;
        this.positions[j + 2] =
          s.z - Math.cos(s.heading) * 1.4 - Math.sin(s.heading) * side;
        this.velocities[j] = (Math.random() - 0.5) * 2;
        this.velocities[j + 1] = 0.6 + Math.random();
        this.velocities[j + 2] = (Math.random() - 0.5) * 2;
      }
      if (this.markDistance > 0.65 && Math.abs(s.road.lateral) < 6.15) {
        this.markDistance = 0;
        for (const side of [-1, 1]) {
          this.matrix.position.set(
            s.x - Math.sin(s.heading) * 1.35 + Math.cos(s.heading) * side,
            s.y + 0.07,
            s.z - Math.cos(s.heading) * 1.35 - Math.sin(s.heading) * side,
          );
          this.matrix.rotation.set(0, s.heading, 0);
          this.matrix.updateMatrix();
          this.marks.setMatrixAt(this.markCursor++ % 700, this.matrix.matrix);
        }
        this.marks.instanceMatrix.needsUpdate = true;
      }
    }
    this.points.geometry.getAttribute("position").needsUpdate = true;
  }
}

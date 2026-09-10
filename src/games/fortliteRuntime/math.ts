import * as THREE from 'three';

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state += 0x6d2b79f5;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)];
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function horizontalDistance(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function snap(value: number, size: number): number {
  return Math.round(value / size) * size;
}

export function snapXZ(target: THREE.Vector3, size: number): THREE.Vector3 {
  return new THREE.Vector3(snap(target.x, size), target.y, snap(target.z, size));
}

export function clampToCircle(point: THREE.Vector3, center: THREE.Vector3, radius: number, padding = 0): THREE.Vector3 {
  const offset = new THREE.Vector2(point.x - center.x, point.z - center.z);
  const length = offset.length();
  const limit = Math.max(0, radius - padding);
  if (length <= limit) {
    return new THREE.Vector3(point.x, point.y, point.z);
  }

  offset.setLength(limit);
  return new THREE.Vector3(center.x + offset.x, point.y, center.z + offset.y);
}

export function randomPointInCircle(rng: SeededRandom, radius: number): THREE.Vector3 {
  const angle = rng.range(0, Math.PI * 2);
  const distance = Math.sqrt(rng.next()) * radius;
  return new THREE.Vector3(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
}

export function yawToDirection(yaw: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
}

export function angleLerp(current: number, target: number, factor: number): number {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * factor;
}

import { clamp } from "../../engine/math";
import { locateRoad, trackPoint } from "./track";
import type { RoadLocation } from "./track";

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}
export interface VehicleState {
  x: number;
  y: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  speed: number;
  steering: number;
  yaw: number;
  slip: number;
  acceleration: number;
  gear: number;
  rpm: number;
  shift: number;
  impact: number;
  road: RoadLocation;
}
export const FIXED_STEP = 1 / 120;
export function createVehicle(progress = 0): VehicleState {
  const p = trackPoint(progress);
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    heading: p.heading,
    vx: 0,
    vz: 0,
    speed: 0,
    steering: 0,
    yaw: 0,
    slip: 0,
    acceleration: 0,
    gear: 1,
    rpm: 950,
    shift: 0,
    impact: 0,
    road: locateRoad(p.x, p.z),
  };
}
const damp = (a: number, b: number, rate: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-rate * dt));
const ratios = [0, 3.2, 2.15, 1.58, 1.21, 0.96, 0.79];

// A bicycle steering model with a friction-limited lateral force. Velocities are
// world-space; steering changes the tire force, never the position directly.
export function stepVehicle(
  s: VehicleState,
  input: DriveInput,
  dt: number,
  assists = true,
  gripScale = 1,
): void {
  const sin = Math.sin(s.heading),
    cos = Math.cos(s.heading);
  let forward = s.vx * sin + s.vz * cos,
    lateral = s.vx * cos - s.vz * sin;
  const abs = Math.abs(forward),
    offroad = Math.abs(s.road.lateral) > 6.15;
  s.steering = damp(
    s.steering,
    input.steer * (0.72 / (1 + abs * 0.021)),
    10,
    dt,
  );
  const grip =
    (offroad ? 7.5 : 29 + abs * abs * 0.0008) *
    (input.handbrake ? 0.47 : 1) *
    gripScale;
  const desiredYaw = (forward / 2.72) * Math.tan(s.steering);
  const limitedYaw = clamp(
    desiredYaw,
    -grip / Math.max(abs, 3),
    grip / Math.max(abs, 3),
  );
  s.yaw = damp(s.yaw, limitedYaw * (input.handbrake ? 1.35 : 1), 9, dt);
  s.heading += s.yaw * dt;
  s.shift = Math.max(0, s.shift - dt);
  const torque = Math.max(2.6, 11.5 - abs * 0.095) * (s.shift > 0 ? 0.25 : 1);
  let force =
    input.throttle * torque -
    forward * Math.abs(forward) * 0.0012 -
    forward * (offroad ? 0.18 : 0.014);
  if (input.brake > 0)
    force -= input.brake * (forward > 0.6 ? 16 : forward > -9 ? 5 : 0);
  if (input.handbrake && abs > 0.2) force -= Math.sign(forward) * 5.5;
  if (input.throttle === 0 && input.brake === 0 && abs < 0.12) forward = 0;
  force -=
    Math.sin(
      Math.atan2(trackPoint(s.road.progress + 0.002).y - s.road.y, 4.5),
    ) * 9.81;
  s.acceleration = damp(s.acceleration, force, 8, dt);
  forward = clamp(forward + force * dt, -9, 86);
  // Slip is retained during handbrake turns; stability assist damps recovery.
  const lateralForce = clamp(
    -lateral * (input.handbrake ? 2.4 : assists ? 16 : 9),
    -grip,
    grip,
  );
  lateral += lateralForce * dt;
  const ns = Math.sin(s.heading),
    nc = Math.cos(s.heading);
  s.vx = ns * forward + nc * lateral;
  s.vz = nc * forward - ns * lateral;
  // Inertia opposes the rotation of the chassis into a new direction.
  s.vx += (sin - ns) * forward * 0.18;
  s.vz += (cos - nc) * forward * 0.18;
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  s.road = locateRoad(s.x, s.z, s.road.index);
  s.y = s.road.y;
  s.impact = Math.max(0, s.impact - dt * 2.5);
  if (Math.abs(s.road.lateral) > 7.15) {
    const side = Math.sign(s.road.lateral),
      normalSpeed = (s.vx * s.road.nx + s.vz * s.road.nz) * side;
    s.x = s.road.x + s.road.nx * side * 7.15;
    s.z = s.road.z + s.road.nz * side * 7.15;
    if (normalSpeed > 0) {
      s.vx -= s.road.nx * side * normalSpeed * 1.18;
      s.vz -= s.road.nz * side * normalSpeed * 1.18;
      s.vx *= 0.97;
      s.vz *= 0.97;
      s.impact = Math.min(1, normalSpeed / 10);
    }
  }
  s.speed = s.vx * ns + s.vz * nc;
  s.slip = Math.abs(
    Math.atan2(s.vx * nc - s.vz * ns, Math.max(3, Math.abs(s.speed))),
  );
  const wheelRpm = (Math.abs(s.speed) / (2 * Math.PI * 0.36)) * 60;
  let rpm = wheelRpm * ratios[s.gear] * 3.45;
  if (s.shift === 0 && rpm > 7100 && s.gear < 6) {
    s.gear++;
    s.shift = 0.18;
  } else if (s.shift === 0 && rpm < 2800 && s.gear > 1) {
    s.gear--;
    s.shift = 0.12;
  }
  rpm = wheelRpm * ratios[s.gear] * 3.45;
  s.rpm = damp(s.rpm, clamp(rpm + input.throttle * 500, 950, 7800), 12, dt);
}

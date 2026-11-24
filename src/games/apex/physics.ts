import { clamp } from "../../engine/math";
import { getApexTrack, locateRoad, trackPoint, TRACK_LENGTH } from "./track";
import type { ApexTrack, RoadLocation } from "./track";
import { DEFAULT_CAR_ID, getApexCar, MIN_DRIVE_FORCE, ROAD_ROLLING_RESISTANCE } from "./vehicles";
import type { ApexCar } from "./vehicles";

export interface DriveInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}
export interface VehicleState {
  track: ApexTrack;
  car: ApexCar;
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
export function createVehicle(progress = 0, track = getApexTrack("solstice"), car = getApexCar(DEFAULT_CAR_ID)): VehicleState {
  const p = trackPoint(progress, track);
  return {
    track,
    car,
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
    road: locateRoad(p.x, p.z, -1, track),
  };
}
const damp = (a: number, b: number, rate: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-rate * dt));

// A bicycle steering model with a friction-limited lateral force. Velocities are
// world-space; steering changes the tire force, never the position directly.
export function stepVehicle(
  s: VehicleState,
  input: DriveInput,
  dt: number,
  assists = true,
  gripScale = 1,
): void {
  const { car } = s;
  const sin = Math.sin(s.heading),
    cos = Math.cos(s.heading);
  let forward = s.vx * sin + s.vz * cos,
    lateral = s.vx * cos - s.vz * sin;
  const abs = Math.abs(forward),
    offroad = Math.abs(s.road.lateral) > 6.15;
  s.steering = damp(
    s.steering,
    input.steer * (car.steering / (1 + abs * 0.021)),
    car.steeringResponse,
    dt,
  );
  const grip =
    (offroad ? 7.5 : car.tireGrip + abs * abs * car.aeroGrip) *
    (input.handbrake ? 0.47 : 1) *
    gripScale * (s.track.id === "whitecap" ? 0.85 : 1);
  const desiredYaw = (forward / car.wheelbase) * Math.tan(s.steering);
  const limitedYaw = clamp(
    desiredYaw,
    -grip / Math.max(abs, 3),
    grip / Math.max(abs, 3),
  );
  s.yaw = damp(s.yaw, limitedYaw * (input.handbrake ? 1.35 : 1), 9, dt);
  s.heading += s.yaw * dt;
  s.shift = Math.max(0, s.shift - dt);
  const torque = Math.max(MIN_DRIVE_FORCE, car.launchForce - abs * car.powerTaper) * (s.shift > 0 ? 0.25 : 1);
  let force =
    input.throttle * torque -
    forward * Math.abs(forward) * car.drag -
    forward * (offroad ? 0.18 : ROAD_ROLLING_RESISTANCE);
  if (input.brake > 0)
    force -= input.brake * (forward > 0.6 ? car.braking : forward > -9 ? 5 : 0);
  if (input.handbrake && abs > 0.2) force -= Math.sign(forward) * 5.5;
  if (input.throttle === 0 && input.brake === 0 && abs < 0.12) forward = 0;
  force -=
    Math.sin(
      Math.atan2(trackPoint(s.road.progress + 0.002, s.track).y - s.road.y, 4.5 * s.track.length / TRACK_LENGTH),
    ) * 9.81;
  s.acceleration = damp(s.acceleration, force, 8, dt);
  forward = clamp(forward + force * dt, -9, car.speedLimit);
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
  const nextX = s.x + s.vx * dt;
  const nextZ = s.z + s.vz * dt;
  const road = locateRoad(nextX, nextZ, s.road.index, s.track);
  s.impact = Math.max(0, s.impact - dt * 2.5);
  const obstacle = s.track.obstacles.find(({ progress, lateral, width, depth }) =>
    Math.abs(road.progress - progress) * s.track.length < depth / 2 + car.halfLength &&
    Math.abs(road.lateral - lateral) < width / 2 + car.halfWidth
  );
  if (obstacle) {
    s.impact = Math.max(s.impact, Math.min(1, Math.abs(forward) / 10));
    s.vx *= -0.22;
    s.vz *= -0.22;
  } else {
    s.x = nextX;
    s.z = nextZ;
    s.road = road;
    s.y = road.y;
  }
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
  const wheelRpm = (Math.abs(s.speed) / (2 * Math.PI * car.wheelRadius)) * 60;
  let rpm = wheelRpm * car.gearRatios[s.gear - 1] * car.finalDrive;
  if (s.shift === 0 && rpm > car.shiftRpm && s.gear < car.gearRatios.length) {
    s.gear++;
    s.shift = car.shiftTime;
  } else if (s.shift === 0 && rpm < 2800 && s.gear > 1) {
    s.gear--;
    s.shift = car.shiftTime * (2 / 3);
  }
  rpm = wheelRpm * car.gearRatios[s.gear - 1] * car.finalDrive;
  s.rpm = damp(s.rpm, clamp(rpm + input.throttle * 500, 950, car.redline), 12, dt);
}

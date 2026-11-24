export type ApexCarId = "solstice-gt" | "ridge-rs" | "vento-gt";

export interface ApexCar {
  id: ApexCarId;
  name: string;
  color: string;
  colorName: string;
  engine: string;
  cylinders: number;
  handling: string;
  wheelbase: number;
  wheelRadius: number;
  halfWidth: number;
  halfLength: number;
  launchForce: number;
  powerTaper: number;
  drag: number;
  speedLimit: number;
  braking: number;
  tireGrip: number;
  aeroGrip: number;
  steering: number;
  steeringResponse: number;
  gearRatios: readonly number[];
  finalDrive: number;
  shiftRpm: number;
  redline: number;
  shiftTime: number;
}

export const DEFAULT_CAR_ID: ApexCarId = "solstice-gt";

export const apexCars: readonly ApexCar[] = [
  {
    id: DEFAULT_CAR_ID,
    name: "Solstice GT",
    color: "#c73d26",
    colorName: "Carmine red",
    engine: "Twin turbo",
    cylinders: 4,
    handling: "Progressive steering and balanced grip.",
    wheelbase: 2.72,
    wheelRadius: 0.36,
    halfWidth: 0.95,
    halfLength: 2.15,
    launchForce: 11.5,
    powerTaper: 0.095,
    drag: 0.0012,
    speedLimit: 86,
    braking: 16,
    tireGrip: 29,
    aeroGrip: 0.0008,
    steering: 0.72,
    steeringResponse: 10,
    gearRatios: [3.2, 2.15, 1.58, 1.21, 0.96, 0.79],
    finalDrive: 3.45,
    shiftRpm: 7100,
    redline: 7800,
    shiftTime: 0.18,
  },
  {
    id: "ridge-rs",
    name: "Ridge RS",
    color: "#edbc3c",
    colorName: "Racing yellow",
    engine: "Flat-six",
    cylinders: 6,
    handling: "Sharp turn-in, strong brakes, and the most grip through fast corners.",
    wheelbase: 2.47,
    wheelRadius: 0.366,
    halfWidth: 1.02,
    halfLength: 2.28,
    launchForce: 14.30,
    powerTaper: 0.04,
    drag: 0.00142,
    speedLimit: 296 / 3.6,
    braking: 20.7,
    tireGrip: 35,
    aeroGrip: 0.0018,
    steering: 0.76,
    steeringResponse: 12.5,
    gearRatios: [3.75, 2.38, 1.72, 1.32, 1.08, 0.89, 0.73],
    finalDrive: 3.72,
    shiftRpm: 8500,
    redline: 9000,
    shiftTime: 0.115,
  },
  {
    id: "vento-gt",
    name: "Vento GT",
    color: "#654de1",
    colorName: "Violet",
    engine: "V10",
    cylinders: 10,
    handling: "Hardest launch and highest top speed. Brake early for tight bends.",
    wheelbase: 2.62,
    wheelRadius: 0.378,
    halfWidth: 1.06,
    halfLength: 2.30,
    launchForce: 15.85,
    powerTaper: 0.035,
    drag: 0.00125,
    speedLimit: 310 / 3.6,
    braking: 18.6,
    tireGrip: 31.5,
    aeroGrip: 0.00116,
    steering: 0.66,
    steeringResponse: 9,
    gearRatios: [3.13, 2.59, 1.88, 1.40, 1.10, 0.88, 0.72],
    finalDrive: 3.52,
    shiftRpm: 8120,
    redline: 8500,
    shiftTime: 0.105,
  },
];

export function getApexCar(id: unknown): ApexCar {
  return apexCars.find((car) => car.id === id) ?? apexCars[0];
}

export const MIN_DRIVE_FORCE = 2.6;
export const ROAD_ROLLING_RESISTANCE = 0.014;

export function getCarTopSpeed(car: ApexCar): number {
  // Equilibrium of the full-throttle force and dry asphalt drag on a level road.
  let low = 0;
  let high = car.speedLimit;
  for (let i = 0; i < 22; i += 1) {
    const speed = (low + high) / 2;
    const thrust = Math.max(MIN_DRIVE_FORCE, car.launchForce - speed * car.powerTaper);
    const resistance = car.drag * speed ** 2 + ROAD_ROLLING_RESISTANCE * speed;
    if (thrust > resistance) low = speed;
    else high = speed;
  }
  return Math.round(low * 3.6);
}

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createCar } from "../car";
import { createVehicle, FIXED_STEP, stepVehicle } from "../physics";
import { loadBest, saveBest } from "../race";
import { loadApexSettings, persistSettings } from "../settings";
import { getApexTrack, SAMPLE_COUNT } from "../track";
import { createViaductDeck } from "../trackStructures";
import { apexCars, DEFAULT_CAR_ID, getCarTopSpeed } from "../vehicles";

const straight = {
  ...getApexTrack("solstice"),
  length: SAMPLE_COUNT * 4,
  samples: Array.from({ length: SAMPLE_COUNT + 1 }, (_, index) => ({
    x: 0, y: 0, z: index * 4, heading: 0, nx: 1, nz: 0,
  })),
};

describe("Apex garage", () => {
  it("ignores old paint values and persists a car selection", () => {
    localStorage.setItem("apex:settings:2", JSON.stringify({ paint: "#0beafa", quality: "high" }));
    const settings = loadApexSettings("medium", false);
    expect(settings.carId).toBe(DEFAULT_CAR_ID);
    expect(settings.quality).toBe("high");
    expect(settings.volume).toBe(100);
    persistSettings({ ...settings, carId: "ridge-rs" });
    expect(loadApexSettings("low", false).carId).toBe("ridge-rs");
  });

  it("persists volume, including mute, and clamps out-of-range saved values", () => {
    const settings = loadApexSettings("low", false);
    persistSettings({ ...settings, volume: 35 });
    expect(loadApexSettings("low", false).volume).toBe(35);
    persistSettings({ ...settings, volume: 0 });
    expect(loadApexSettings("low", false).volume).toBe(0);
    persistSettings({ ...settings, volume: 150 });
    expect(loadApexSettings("low", false).volume).toBe(100);
  });

  it("gives the V10 the quickest launch and top speed, and the flat-six the best braking and turn-in", () => {
    const cars = apexCars.map((profile) => createVehicle(0.2, straight, profile));
    for (const car of cars) {
      for (let i = 0; i < 360; i += 1) {
        stepVehicle(car, { throttle: 1, brake: 0, steer: 0, handbrake: false }, FIXED_STEP);
      }
    }
    expect(cars[2].speed).toBeGreaterThan(cars[1].speed);
    expect(cars[1].speed).toBeGreaterThan(cars[0].speed);

    for (const car of cars) {
      for (let i = 0; i < 4700; i += 1) {
        stepVehicle(car, { throttle: 1, brake: 0, steer: 0, handbrake: false }, FIXED_STEP);
      }
      expect(Math.abs(car.speed * 3.6 - getCarTopSpeed(car.car))).toBeLessThan(4);
      car.vz = car.speed = 50;
      stepVehicle(car, { throttle: 0, brake: 1, steer: 0.5, handbrake: false }, FIXED_STEP);
    }
    expect(cars[1].speed).toBeLessThan(cars[2].speed);
    expect(cars[1].speed).toBeLessThan(cars[0].speed);
    expect(cars[1].yaw).toBeGreaterThan(cars[0].yaw);
    expect(cars[1].yaw).toBeGreaterThan(cars[2].yaw);
  });

  it("keeps the original ghost and new car records separate on the same course", () => {
    const version = getApexTrack("whitecap").version;
    saveBest("normal", { time: 115, frames: [] }, version);
    saveBest("normal", { time: 102, frames: [] }, version, "vento-gt");
    expect(loadBest("normal", version, DEFAULT_CAR_ID)?.time).toBe(115);
    expect(loadBest("normal", version, "vento-gt")?.time).toBe(102);
    expect(loadBest("normal", version, "ridge-rs")).toBeNull();
  });

  it("builds taller winged and lower wedge models with each car's own dimensions", () => {
    const models = apexCars.map((profile) => createCar(profile, true));
    try {
      const sizes = models.map((model) => new THREE.Box3().setFromObject(model.root).getSize(new THREE.Vector3()));
      expect(sizes[1].y).toBeGreaterThan(sizes[0].y);
      expect(sizes[2].y).toBeLessThan(sizes[0].y);
      expect(new Set(models.map((model) => model.hubs[0].position.z)).size).toBe(3);
      expect(new Set(apexCars.map((profile) => profile.color)).size).toBe(3);
    } finally {
      for (const model of models) {
        const materials = new Set<THREE.Material>();
        model.root.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            materials.add(object.material);
          }
        });
        materials.forEach((material) => material.dispose());
      }
    }
  });
});

describe("Apex viaduct deck", () => {
  it.each([["solstice", 230], ["breakwater", 1000]] as const)(
    "stays below the road along %s, including the joins on a grade",
    (id, start) => {
      const track = getApexTrack(id);
      const geometry = createViaductDeck(track, start, start + 90);
      const material = new THREE.MeshBasicMaterial();
      const mesh = new THREE.Mesh(geometry, material);
      const cast = new THREE.Raycaster();
      try {
        for (let index = start; index < start + 90; index += 1) {
          const a = track.samples[index];
          const b = track.samples[index + 1];
          const y = (a.y + b.y) / 2;
          for (const lateral of [-5, 0, 5]) {
            const x = (a.x + b.x + (a.nx + b.nx) * lateral) / 2;
            const z = (a.z + b.z + (a.nz + b.nz) * lateral) / 2;
            cast.set(new THREE.Vector3(x, y + 2, z), new THREE.Vector3(0, -1, 0));
            const [hit] = cast.intersectObject(mesh);
            expect(hit?.point.y).toBeLessThan(y - 0.12);
            expect(hit?.point.y).toBeGreaterThan(y - 0.24);
          }
        }
      } finally {
        geometry.dispose();
        material.dispose();
      }
    },
  );
});

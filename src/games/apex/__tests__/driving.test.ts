import { describe, expect, it } from "vitest";
import { keyboardSteer } from "../runtime";
import { createVehicle, stepVehicle, FIXED_STEP } from "../physics";
import {
  advanceRace,
  createRace,
  formatTime,
  loadBest,
  resetRacePosition,
  saveBest,
} from "../race";
import { TRACK_LENGTH, trackPoint, locateRoad, TRACK_VERSION } from "../track";

describe("Solstice Pass racing", () => {
  it("maps A / left input to left steering and D / right input to right steering", () => {
    expect(keyboardSteer(true, false)).toBe(1);
    expect(keyboardSteer(false, true)).toBe(-1);
    expect(keyboardSteer(false, false)).toBe(0);
  });

  it("projects road elevation and lateral offsets consistently", () => {
    for (const progress of [0, 0.17, 0.45, 0.72, 0.99]) {
      const p = trackPoint(progress),
        road = locateRoad(p.x + p.nx * 4, p.z + p.nz * 4);
      expect(road.lateral).toBeCloseTo(4, 0);
      expect(road.y).toBeCloseTo(p.y, 0);
    }
  });
  it("accelerates, brakes, reverses and remains finite at the barrier", () => {
    const s = createVehicle();
    for (let i = 0; i < 360; i++)
      stepVehicle(
        s,
        { throttle: 1, brake: 0, steer: 0, handbrake: false },
        FIXED_STEP,
      );
    expect(s.speed).toBeGreaterThan(20);
    const speed = s.speed;
    for (let i = 0; i < 120; i++)
      stepVehicle(
        s,
        { throttle: 0, brake: 1, steer: 0, handbrake: false },
        FIXED_STEP,
      );
    expect(s.speed).toBeLessThan(speed - 10);
    for (let i = 0; i < 500; i++)
      stepVehicle(
        s,
        { throttle: 0, brake: 1, steer: 0.8, handbrake: false },
        FIXED_STEP,
      );
    expect(s.speed).toBeLessThan(0);
    expect(Number.isFinite(s.heading)).toBe(true);
    for (let i = 0; i < 1800; i++)
      stepVehicle(
        s,
        { throttle: 1, brake: 0, steer: 1, handbrake: false },
        FIXED_STEP,
      );
    expect(Number.isFinite(s.x)).toBe(true);
    expect(locateRoad(s.x, s.z).distance).toBeLessThan(7.3);
  });
  it("keyboard steering builds progressively instead of snapping heading", () => {
    const s = createVehicle();
    s.speed = 20;
    s.vz = 20;
    s.heading = 0;
    const initial = s.heading;
    stepVehicle(
      s,
      { throttle: 0.5, brake: 0, steer: 1, handbrake: false },
      FIXED_STEP,
    );
    expect(s.heading - initial).toBeGreaterThan(0);
    expect(s.heading - initial).toBeLessThan(0.01);
    expect(s.steering).toBeLessThan(0.05);
  });
  it("cannot finish by reversing over the line, teleporting or skipping sectors", () => {
    const r = createRace();
    advanceRace(r, 0.999, 0, 1, -10);
    expect(r.checkpoint).toBe(0);
    advanceRace(r, 0.5, 0, 1, 30);
    expect(r.finished).toBe(false);
    expect(r.checkpoint).toBe(0);
  });
  it("completes exactly one forward circuit after eight sectors", () => {
    const r = createRace();
    for (let i = 1; i <= 1001; i++) advanceRace(r, (i / 1000) % 1, 0, 0.1, 30);
    expect(r.finished).toBe(true);
    expect(r.checkpoint).toBe(8);
    expect(r.splits).toHaveLength(8);
    expect(r.distance).toBeGreaterThanOrEqual(TRACK_LENGTH);
    const time = r.time;
    advanceRace(r, 0.01, 0, 1, 30);
    expect(r.time).toBe(time);
  });
  it("recovery returns to the last completed sector and adds a penalty", () => {
    const r = createRace();
    for (let i = 1; i <= 160; i++) advanceRace(r, i / 1000, 0, 0.1, 30);
    const time = r.time;
    expect(resetRacePosition(r)).toBe(0.125);
    expect(r.time).toBeCloseTo(time + 3);
    expect(r.resets).toBe(1);
    expect(r.distance).toBeCloseTo(TRACK_LENGTH / 8);
  });
  it("stores a validated personal best per difficulty and rejects corrupted ghosts", () => {
    localStorage.clear();
    expect(
      saveBest("normal", {
        time: 100,
        frames: [
          [0, 0, 28, 0, 0],
          [1, 0, 28, 10, 0],
        ],
      }),
    ).toBe(true);
    expect(loadBest("normal")?.time).toBe(100);
    expect(loadBest("hard")).toBeNull();
    localStorage.setItem(
      `apex:${TRACK_VERSION}:normal`,
      JSON.stringify({
        time: 100,
        frames: [
          [1, 0, 0, 0, 0],
          [0, 0, 0, 0, 0],
        ],
      }),
    );
    expect(loadBest("normal")).toBeNull();
  });
  it("formats race time across minute boundaries", () => {
    expect(formatTime(61.234)).toBe("1:01.234");
    expect(formatTime(Infinity)).toBe("—:——.———");
  });
});

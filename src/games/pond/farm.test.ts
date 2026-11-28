import { describe, expect, it } from "vitest";
import {
  act,
  advance,
  clarity,
  DAY,
  encode,
  fairReady,
  MAX_LEVEL,
  newFarm,
  OFFLINE_CAP,
  price,
  restore,
  saleRate,
  stations,
  type Farm,
} from "./farm";

describe("Mulberry Pond", () => {
  it("lets the first crop buy silver carp immediately and enforces purchase limits", () => {
    const start = newFarm();
    expect(act(start, { type: "buy", index: 2 })).toBe(start);
    const f = act(start, { type: "buy", index: 1 });
    expect(f.coins).toBe(0);
    expect(f.levels.silver).toBe(1);
    expect(act(f, { type: "buy", index: 1 })).toBe(f);
    expect(saleRate(f)).toBeGreaterThan(saleRate(start));
    let wealthy = { ...f, coins: 1e6 };
    for (let i = 1; i < MAX_LEVEL; i++) wealthy = act(wealthy, { type: "buy", index: 1 });
    expect(act(wealthy, { type: "buy", index: 1 })).toBe(wealthy);
  });
  it("rewards active play without repeat payouts", () => {
    const f = act(newFarm(), { type: "feed" });
    expect(act(f, { type: "feed" })).toBe(f);
    const grown = advance(f, 12);
    expect(grown.fed).toBe(0);
    expect(grown.sales).toBeGreaterThan(advance(newFarm(), 12).sales);
    const sold = act(grown, { type: "ship" });
    expect(sold.coins - grown.coins).toBeCloseTo(Math.floor(grown.harvest));
    expect(act(sold, { type: "ship" })).toBe(sold);
  });
  it("pays a filled market order only once and keeps fractional crate progress", () => {
    const full = { ...newFarm(), harvest: 32.75 };
    const sold = act(full, { type: "ship" });
    expect(sold.coins - full.coins).toBe(48);
    expect(sold.harvest).toBe(.75);
    expect(act(sold, { type: "ship" })).toBe(sold);
  });
  it("changes pond clarity, dawn oxygen and silk output as the farm is managed", () => {
    const f = newFarm();
    for (const s of stations) f.levels[s.id] = 2;
    const full = advance({ ...f, manure: 2 }, DAY);
    const lean = advance({ ...f, manure: 0 }, DAY);
    expect(clarity(full)).toBeLessThan(clarity(lean));
    const stalled = advance({ ...f, levels: { ...f.levels, wheel: 0 } }, DAY);
    expect(stalled.oxygen).toBeLessThan(full.oxygen);
    expect(full.silk).toBe(0);
    const dredged = act(full, { type: "dredge" });
    expect(dredged.silt).toBe(5);
    expect(advance(dredged, 20).silk).toBeGreaterThan(0);
    expect(act(dredged, { type: "dredge" })).toBe(dredged);
  });
  it("delivers consistent bounded offline earnings across day and clock boundaries", () => {
    const start = act(newFarm(), { type: "feed" });
    expect(advance(advance(start, 41), 223)).toEqual(advance(start, 264));
    const raw = encode(start, 10000);
    expect(restore(raw, 1000).farm).toEqual(start);
    expect(restore(raw, 10000 + 1e10).farm).toEqual(advance(start, OFFLINE_CAP));
    expect(restore(encode(advance(start, 900), 910000), 910000).away).toBe(0);
    for (const input of [
      "{",
      "null",
      JSON.stringify({ version: 1, at: 0, farm: { ...start, levels: null } }),
      encode({ ...start, oxygen: -1 }, 0),
    ]) {
      expect(restore(input, 2000).farm).toEqual(newFarm());
    }
  });
  it("reaches the fair from a fresh pond without gifting currency", () => {
    let f = newFarm();
    for (let t = 0; t < 3600 && !fairReady(f); t++) {
      const next = stations.findIndex((s) => !f.levels[s.id]);
      if (next >= 0) f = act(f, { type: "buy", index: next });
      f = advance(f, 1);
      if (t % 12 === 0) f = act(f, { type: "feed" });
      if (t % 19 === 0) f = act(f, { type: "ship" });
      if (f.silt >= 35) f = act(f, { type: "dredge" });
    }
    expect(fairReady(f)).toBe(true);
    const season = act(f, { type: "fair" });
    expect(season.seasons).toBe(1);
    expect(saleRate(season)).toBeCloseTo(saleRate(newFarm()) * 1.2);
    expect(act(season, { type: "fair" })).toBe(season);
  });
  it("remains finite through a year of maximum-stock day/night cycles and repeated trades", () => {
    let f: Farm = newFarm();
    for (const station of stations) f.levels[station.id] = MAX_LEVEL;
    for (let day = 0; day < 365; day++) {
      f = advance(act(f, { type: "dredge" }), DAY);
      f = act(f, { type: "ship" });
      expect(f.coins).toBeGreaterThan(0);
      expect(f.oxygen).toBeGreaterThanOrEqual(8);
      expect(f.silt).toBeLessThanOrEqual(100);
      expect(price(f, 0)).toBeGreaterThan(0);
    }
    expect(restore(encode(f, 0), 0).farm).toEqual(f);
  });
});

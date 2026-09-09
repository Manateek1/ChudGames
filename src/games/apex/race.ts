import { TRACK_LENGTH, TRACK_VERSION } from "./track";
export type GhostFrame = [number, number, number, number, number];
export interface BestRun {
  time: number;
  frames: GhostFrame[];
}
export interface RaceState {
  time: number;
  distance: number;
  lastProgress: number;
  checkpoint: number;
  splits: number[];
  finished: boolean;
  topSpeed: number;
  resets: number;
}
export const createRace = (): RaceState => ({
  time: 0,
  distance: 0,
  lastProgress: 0,
  checkpoint: 0,
  splits: [],
  finished: false,
  topSpeed: 0,
  resets: 0,
});
export function advanceRace(
  r: RaceState,
  progress: number,
  lateral: number,
  dt: number,
  speed: number,
): boolean {
  if (r.finished) return false;
  r.time += dt;
  r.topSpeed = Math.max(r.topSpeed, Math.abs(speed) * 3.6);
  let delta = progress - r.lastProgress;
  if (delta < -0.5) delta++;
  if (delta > 0.5) delta--;
  r.lastProgress = progress;
  // Reject teleports and require all eight sectors in order, including start/finish.
  if (Math.abs(delta) < 0.025) r.distance += delta * TRACK_LENGTH;
  if (
    r.distance >= ((r.checkpoint + 1) * TRACK_LENGTH) / 8 &&
    Math.abs(lateral) < 6.8
  ) {
    r.splits.push(r.time);
    r.checkpoint++;
    if (r.checkpoint === 8) r.finished = true;
    return true;
  }
  return false;
}
export function resetRacePosition(r: RaceState): number {
  const progress = r.checkpoint / 8;
  r.time += 3;
  r.resets++;
  r.distance = progress * TRACK_LENGTH;
  r.lastProgress = progress;
  return progress;
}
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—:——.———";
  const ms = Math.floor(Math.max(0, seconds) * 1000);
  return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}
export function loadBest(difficulty: string): BestRun | null {
  try {
    const value = JSON.parse(
      localStorage.getItem(`apex:${TRACK_VERSION}:${difficulty}`) ?? "null",
    ) as BestRun | null;
    if (
      !value ||
      !Number.isFinite(value.time) ||
      value.time <= 0 ||
      !Array.isArray(value.frames) ||
      value.frames.length > 18000
    )
      return null;
    if (
      !value.frames.every(
        (f, i) =>
          Array.isArray(f) &&
          f.length === 5 &&
          f.every(Number.isFinite) &&
          (i === 0 || f[0] > value.frames[i - 1][0]),
      )
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export function saveBest(difficulty: string, run: BestRun): boolean {
  try {
    localStorage.setItem(
      `apex:${TRACK_VERSION}:${difficulty}`,
      JSON.stringify(run),
    );
    return true;
  } catch {
    return false;
  }
}

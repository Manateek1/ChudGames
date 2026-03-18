import type { AppSettings, Difficulty, ProgressState } from "../types/arcade";

const SETTINGS_KEY = "arcade_hub_settings";
const PROGRESS_KEY = "arcade_hub_progress";

export const defaultSettings: AppSettings = {
  sound: true,
  music: true,
  reducedMotion: false,
  theme: "neon",
  graphicsQuality: "medium",
  showFps: false,
  scanlines: true,
};

export const defaultProgress: ProgressState = {
  highScores: {},
  tutorialsSeen: {},
  achievements: [],
  stats: {},
  dailyBest: {},
  ebtBucks: 0,
};

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) {
    return fallback;
  }

  try {
    return {
      ...fallback,
      ...JSON.parse(raw),
    } as T;
  } catch {
    return fallback;
  }
};

export const loadSettings = (): AppSettings => {
  if (typeof window === "undefined") {
    return defaultSettings;
  }
  return safeParse(window.localStorage.getItem(SETTINGS_KEY), defaultSettings);
};

export const saveSettings = (value: AppSettings): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
};

export const loadProgress = (): ProgressState => {
  if (typeof window === "undefined") {
    return defaultProgress;
  }
  return safeParse(window.localStorage.getItem(PROGRESS_KEY), defaultProgress);
};

export const saveProgress = (value: ProgressState): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(value));
};

export const getBestScore = (
  progress: ProgressState,
  gameId: string,
  difficulty?: Difficulty,
): number => {
  const scores = progress.highScores[gameId] ?? {};
  if (difficulty) {
    return scores[difficulty] ?? 0;
  }
  return Math.max(0, ...Object.values(scores));
};

export const markTutorialSeen = (progress: ProgressState, gameId: string): ProgressState => ({
  ...progress,
  tutorialsSeen: {
    ...progress.tutorialsSeen,
    [gameId]: true,
  },
});

export const withGameResult = (
  progress: ProgressState,
  params: {
    gameId: string;
    difficulty: Difficulty;
    score: number;
    won: boolean;
    combo?: number;
    tile?: number;
    run?: number;
  },
): ProgressState => {
  const next: ProgressState = {
    ...progress,
    highScores: {
      ...progress.highScores,
      [params.gameId]: {
        ...(progress.highScores[params.gameId] ?? {}),
      },
    },
    stats: {
      ...progress.stats,
    },
    ebtBucks: progress.ebtBucks + (params.won ? 1 : 0),
  };

  const currentHigh = next.highScores[params.gameId][params.difficulty] ?? 0;
  next.highScores[params.gameId][params.difficulty] = Math.max(currentHigh, params.score);

  const previousStats = next.stats[params.gameId] ?? {
    plays: 0,
    wins: 0,
    bestCombo: 0,
    bestTile: 0,
    longestRun: 0,
    totalScore: 0,
  };

  next.stats[params.gameId] = {
    plays: previousStats.plays + 1,
    wins: previousStats.wins + (params.won ? 1 : 0),
    bestCombo: Math.max(previousStats.bestCombo, params.combo ?? 0),
    bestTile: Math.max(previousStats.bestTile, params.tile ?? 0),
    longestRun: Math.max(previousStats.longestRun, params.run ?? 0),
    totalScore: previousStats.totalScore + params.score,
  };

  return next;
};

export const withDailyBest = (
  progress: ProgressState,
  dateKey: string,
  gameId: string,
  score: number,
): ProgressState => {
  const current = progress.dailyBest[dateKey];
  if (current && current.gameId === gameId && current.score >= score) {
    return progress;
  }

  return {
    ...progress,
    dailyBest: {
      ...progress.dailyBest,
      [dateKey]: {
        gameId,
        score,
      },
    },
  };
};

export const withUnlockedAchievements = (
  progress: ProgressState,
  ids: string[],
): ProgressState => {
  if (ids.length === 0) {
    return progress;
  }
  const merged = new Set(progress.achievements);
  ids.forEach((id) => merged.add(id));
  return {
    ...progress,
    achievements: Array.from(merged),
  };
};

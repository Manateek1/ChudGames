import type { ComponentType } from "react";
import type { AudioManager } from "../engine/audio";
import type { InputManager } from "../engine/input";

export type GameGenre = "action" | "reflex" | "puzzle";
export type Difficulty = "easy" | "normal" | "hard";
export type GraphicsQuality = "low" | "medium" | "high";
export type ThemeName = "neon" | "sunset" | "matrix";

export interface AppSettings {
  sound: boolean;
  music: boolean;
  reducedMotion: boolean;
  theme: ThemeName;
  graphicsQuality: GraphicsQuality;
  showFps: boolean;
  scanlines: boolean;
}

export interface GameMode {
  id: string;
  label: string;
  description: string;
}

export interface GameResult {
  score: number;
  won?: boolean;
  stats?: Record<string, number>;
}

export interface GameComponentProps {
  gameId: string;
  difficulty: Difficulty;
  mode: string;
  seed: number;
  settings: AppSettings;
  paused: boolean;
  input: InputManager;
  audio: AudioManager;
  onScore: (score: number) => void;
  onFps: (fps: number) => void;
  onPauseToggle: () => void;
  onGameOver: (result: GameResult) => void;
}

export type ThumbnailRenderer = (
  ctx: CanvasRenderingContext2D,
  elapsed: number,
  width: number,
  height: number,
) => void;

export interface GameDefinition {
  id: string;
  title: string;
  genre: GameGenre;
  shortDescription: string;
  description: string;
  controls: string[];
  tutorial: string[];
  tags: string[];
  difficulties: Difficulty[];
  modes?: GameMode[];
  defaultMode?: string;
  isNew?: boolean;
  usesCanvas: boolean;
  thumbnail: ThumbnailRenderer;
  component: ComponentType<GameComponentProps>;
}

export interface GameStats {
  plays: number;
  wins: number;
  bestCombo: number;
  bestTile: number;
  longestRun: number;
  totalScore: number;
}

export interface ProgressState {
  highScores: Record<string, Partial<Record<Difficulty, number>>>;
  tutorialsSeen: Record<string, boolean>;
  achievements: string[];
  stats: Record<string, GameStats>;
  dailyBest: Record<string, { gameId: string; score: number }>;
  ebtBucks: number;
}

export interface DailyChallenge {
  dateKey: string;
  gameId: string;
  seed: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
}

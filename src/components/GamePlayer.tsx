import { useCallback, useEffect, useRef, useState } from "react";
import { AudioManager } from "../engine/audio";
import { InputManager } from "../engine/input";
import { TouchControls } from "./TouchControls";
import type { AppSettings, Difficulty, GameDefinition, GameResult } from "../types/arcade";

interface GamePlayerProps {
  game: GameDefinition;
  difficulty: Difficulty;
  mode: string;
  seed: number;
  settings: AppSettings;
  bestScore: number;
  tutorialOpenByDefault: boolean;
  onSettingsChange: (next: AppSettings) => void;
  onTutorialDismiss: () => void;
  onQuit: () => void;
  onComplete: (result: GameResult) => void;
}

export const GamePlayer = ({
  game,
  difficulty,
  mode,
  seed,
  settings,
  bestScore,
  tutorialOpenByDefault,
  onSettingsChange,
  onTutorialDismiss,
  onQuit,
  onComplete,
}: GamePlayerProps): React.JSX.Element => {
  const [input] = useState(() => new InputManager());
  const [audio] = useState(() => new AudioManager());
  const submittedRef = useRef(false);

  const [runId, setRunId] = useState(0);
  const [score, setScore] = useState(0);
  const [fps, setFps] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(tutorialOpenByDefault);
  const [finalResult, setFinalResult] = useState<GameResult | null>(null);

  useEffect(() => {
    input.attach();
    return () => {
      input.detach();
    };
  }, [input]);

  useEffect(() => {
    audio.setEnabled(settings.sound);
    audio.setMusicEnabled(settings.music);
  }, [settings.sound, settings.music, audio]);

  useEffect(() => {
    if (!settings.music) {
      audio.stopMusic();
      return;
    }

    if (!paused && !tutorialOpen && !finalResult) {
      audio.startMusic(seed);
    } else {
      audio.stopMusic();
    }
  }, [settings.music, paused, tutorialOpen, finalResult, seed, audio]);

  useEffect(() => {
    return () => {
      audio.dispose();
    };
  }, [audio]);

  useEffect(() => {
    if (!finalResult || submittedRef.current) {
      return;
    }
    submittedRef.current = true;
    onComplete(finalResult);
  }, [finalResult, onComplete]);

  const effectivePause = paused || tutorialOpen || Boolean(finalResult);

  const restart = (): void => {
    submittedRef.current = false;
    setRunId((value) => value + 1);
    setScore(0);
    setFps(0);
    setPaused(false);
    setFinalResult(null);
  };

  const dismissTutorial = async (): Promise<void> => {
    onTutorialDismiss();
    setTutorialOpen(false);
    await audio.unlock();
    audio.ui();
  };

  const handlePauseToggle = useCallback(() => {
    setPaused((value) => !value);
  }, []);

  const handleGameOver = useCallback(
    (result: GameResult) => {
      setFinalResult((current) => current ?? result);
      setPaused(true);
      audio.hit();
    },
    [audio],
  );

  const componentKey = `${game.id}-${difficulty}-${mode}-${seed}-${runId}`;
  const GameComponent = game.component;
  const isFortlite = game.id === "fortlite";
  const placementText = score > 0 ? `#${score}` : "--";
  const finalPlacement = finalResult?.stats?.placement ?? 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-300/55 bg-white/82 px-4 py-3 shadow-[0_20px_48px_-30px_rgba(52,168,221,0.4)]">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl text-sky-950">{game.title}</h2>
          <span className="rounded-full border border-sky-300/60 bg-sky-50/80 px-3 py-1 text-xs uppercase tracking-[0.2em] text-sky-800">
            {difficulty}
          </span>
          {game.modes && (
            <span className="rounded-full border border-lime-300/70 bg-lime-50/80 px-3 py-1 text-xs uppercase tracking-[0.2em] text-lime-900">
              {mode}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-sky-900">
          {isFortlite ? (
            <>
              <span>Placement: <strong className="text-sky-950">{placementText}</strong></span>
              <span>Wins: <strong className="text-sky-950">{bestScore}</strong></span>
            </>
          ) : (
            <>
              <span>Score: <strong className="text-sky-950">{score}</strong></span>
              <span>Best: <strong className="text-sky-950">{bestScore}</strong></span>
            </>
          )}
          {settings.showFps && <span>FPS: <strong className="text-sky-950">{fps.toFixed(0)}</strong></span>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="arcade-btn-secondary px-4 py-2" onClick={handlePauseToggle}>
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" className="arcade-btn-secondary px-4 py-2" onClick={restart}>
            Restart
          </button>
          <button type="button" className="arcade-btn-secondary px-4 py-2" onClick={onQuit}>
            Quit
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-sky-300/55 bg-white/72 p-3 shadow-[0_22px_48px_-34px_rgba(52,168,221,0.34)]">
        <GameComponent
          key={componentKey}
          gameId={game.id}
          difficulty={difficulty}
          mode={mode}
          seed={seed}
          settings={settings}
          paused={effectivePause}
          input={input}
          audio={audio}
          onScore={setScore}
          onFps={setFps}
          onPauseToggle={handlePauseToggle}
          onGameOver={handleGameOver}
        />

        {paused && !finalResult && !tutorialOpen && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-[rgba(194,242,255,0.82)]">
            <div className="w-[min(480px,90%)] space-y-4 rounded-2xl border border-sky-300/60 bg-white/95 p-5 text-sky-900">
              <h3 className="font-display text-3xl text-sky-950">Paused</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="arcade-btn-secondary"
                  onClick={() => onSettingsChange({ ...settings, showFps: !settings.showFps })}
                >
                  FPS {settings.showFps ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  className="arcade-btn-secondary"
                  onClick={() => onSettingsChange({ ...settings, sound: !settings.sound })}
                >
                  Sound {settings.sound ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  className="arcade-btn-secondary"
                  onClick={() => onSettingsChange({ ...settings, music: !settings.music })}
                >
                  Music {settings.music ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  className="arcade-btn-secondary"
                  onClick={() => onSettingsChange({ ...settings, reducedMotion: !settings.reducedMotion })}
                >
                  Motion {settings.reducedMotion ? "Reduced" : "Full"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="arcade-btn-primary" onClick={() => setPaused(false)}>
                  Resume
                </button>
                <button type="button" className="arcade-btn-secondary" onClick={restart}>
                  Restart
                </button>
                <button type="button" className="arcade-btn-secondary" onClick={onQuit}>
                  Quit to Menu
                </button>
              </div>
            </div>
          </div>
        )}

        {finalResult && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(194,242,255,0.86)]">
            <div className="w-[min(460px,90%)] space-y-3 rounded-2xl border border-sky-300/65 bg-white/95 p-6 text-center">
              <p className="arcade-kicker">Run Complete</p>
              <h3 className="font-display text-4xl text-sky-950">{finalResult.won ? "Victory" : "Game Over"}</h3>
              {isFortlite ? (
                <div className="space-y-1 text-sky-900">
                  <p>Placement: <strong className="text-sky-950">{finalPlacement > 0 ? `#${finalPlacement}` : "--"}</strong></p>
                  <p>Elims: <strong className="text-sky-950">{finalResult.stats?.eliminations ?? 0}</strong></p>
                </div>
              ) : (
                <p className="text-sky-900">Score: <strong className="text-sky-950">{finalResult.score}</strong></p>
              )}
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button type="button" className="arcade-btn-primary" onClick={restart}>
                  Play Again
                </button>
                <button type="button" className="arcade-btn-secondary" onClick={onQuit}>
                  Back to Library
                </button>
              </div>
            </div>
          </div>
        )}

        {tutorialOpen && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(194,242,255,0.88)]">
            <div className="w-[min(560px,92%)] space-y-3 rounded-2xl border border-sky-300/65 bg-white/95 p-6">
              <p className="arcade-kicker">First-Time Tutorial</p>
              <h3 className="font-display text-3xl text-sky-950">{game.title}</h3>
              <ul className="space-y-2 text-sky-900/90">
                {game.tutorial.map((line) => (
                  <li key={line} className="rounded-lg border border-sky-300/50 bg-sky-50/85 px-3 py-2">
                    {line}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2 pt-2">
                <button type="button" className="arcade-btn-primary" onClick={() => void dismissTutorial()}>
                  Start Run
                </button>
                <button type="button" className="arcade-btn-secondary" onClick={onQuit}>
                  Back
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {game.usesCanvas && (
        <TouchControls
          input={input}
          onPause={handlePauseToggle}
          mode={game.id === "pong-neon" && mode === "duel" ? "pong-duel" : "default"}
        />
      )}
    </section>
  );
};

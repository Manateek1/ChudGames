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

  const restart = useCallback((): void => {
    submittedRef.current = false;
    setRunId((value) => value + 1);
    setScore(0);
    setFps(0);
    setPaused(false);
    setFinalResult(null);
  }, []);

  useEffect(() => {
    if (!finalResult) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.code !== "Enter") {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      event.preventDefault();
      restart();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [finalResult, restart]);

  const effectivePause = paused || tutorialOpen || Boolean(finalResult);

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
      if (game.id !== "fortlite") {
        audio.hit();
      }
    },
    [audio, game.id],
  );

  const componentKey = `${game.id}-${difficulty}-${mode}-${seed}-${runId}`;
  const GameComponent = game.component;
  const isFortLite = game.id === "fortlite";
  const placementText = score > 0 ? `#${score}` : "--";
  const finalPlacement = finalResult?.stats?.placement ?? 0;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-sky-200/24 bg-[rgba(7,18,34,0.82)] px-4 py-3 text-slate-50 shadow-[0_24px_54px_-32px_rgba(7,18,34,0.96)]">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl text-white">{game.title}</h2>
          <span className="rounded-full border border-sky-100/16 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-sky-50/78">
            {difficulty}
          </span>
          {game.modes && (
            <span className="rounded-full border border-amber-200/18 bg-amber-300/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-amber-50">
              {mode}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-sky-50/82">
          {isFortLite ? (
            <>
              <span>Placement: <strong className="text-white">{placementText}</strong></span>
              <span>Wins: <strong className="text-white">{bestScore}</strong></span>
            </>
          ) : (
            <>
              <span>Score: <strong className="text-white">{score}</strong></span>
              <span>Best: <strong className="text-white">{bestScore}</strong></span>
            </>
          )}
          {settings.showFps && <span>FPS: <strong className="text-white">{fps.toFixed(0)}</strong></span>}
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

      <div className="relative overflow-hidden rounded-[1.5rem] border border-sky-200/24 bg-[rgba(7,18,34,0.72)] p-3 shadow-[0_26px_60px_-38px_rgba(7,18,34,0.96)]">
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
          <div className="absolute inset-0 z-10 grid place-items-center bg-[rgba(3,9,20,0.76)]">
            <div className="w-[min(480px,90%)] space-y-4 rounded-[1.5rem] border border-sky-100/14 bg-[rgba(7,18,34,0.96)] p-5 text-sky-50">
              <h3 className="font-display text-3xl text-white">Paused</h3>
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
          <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(3,9,20,0.82)]">
            <div className="w-[min(460px,90%)] space-y-4 rounded-[1.6rem] border border-sky-100/14 bg-[rgba(7,18,34,0.96)] p-6 text-center text-sky-50">
              <p className="arcade-kicker">Run Complete</p>
              <h3 className="font-display text-4xl text-white">{finalResult.won ? "Victory" : "Game Over"}</h3>
              {isFortLite ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-sky-100/12 bg-white/5 px-4 py-4">
                    <p className="arcade-kicker">Placement</p>
                    <p className="font-display text-4xl text-white">{finalPlacement > 0 ? `#${finalPlacement}` : "--"}</p>
                  </div>
                  <div className="rounded-2xl border border-sky-100/12 bg-white/5 px-4 py-4">
                    <p className="arcade-kicker">Elims</p>
                    <p className="font-display text-4xl text-white">{finalResult.stats?.eliminations ?? 0}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sky-50">Score: <strong className="text-white">{finalResult.score}</strong></p>
              )}
              <p className="text-sm text-sky-50/72">Press Enter to start a new round.</p>
              {isFortLite ? (
                <div className="space-y-3 pt-1">
                  <div className="flex justify-center">
                    <button type="button" className="arcade-btn-primary min-w-[220px]" onClick={restart}>
                      Play Again
                    </button>
                  </div>
                  <div className="flex justify-center">
                    <button type="button" className="text-sm font-semibold text-sky-100 transition hover:text-white" onClick={onQuit}>
                      Back to Library
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  <button type="button" className="arcade-btn-primary" onClick={restart}>
                    Play Again
                  </button>
                  <button type="button" className="arcade-btn-secondary" onClick={onQuit}>
                    Back to Library
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {tutorialOpen && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-[rgba(3,9,20,0.84)]">
            <div className="w-[min(560px,92%)] space-y-3 rounded-[1.6rem] border border-sky-100/14 bg-[rgba(7,18,34,0.96)] p-6 text-sky-50">
              <p className="arcade-kicker">First-Time Tutorial</p>
              <h3 className="font-display text-3xl text-white">{game.title}</h3>
              <ul className="space-y-2 text-sky-50/88">
                {game.tutorial.map((line) => (
                  <li key={line} className="rounded-xl border border-sky-100/12 bg-white/5 px-3 py-2">
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

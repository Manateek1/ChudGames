import { useEffect, useRef, useState } from "react";
import type { GameComponentProps } from "../types/arcade";
import { FortliteGame } from "./fortliteRuntime/game";
import "./fortlite.css";

export const Fortlite = ({
  seed,
  paused,
  onScore,
  onFps,
  onGameOver,
}: GameComponentProps): React.JSX.Element => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<FortliteGame | null>(null);
  const scoreRef = useRef(onScore);
  const gameOverRef = useRef(onGameOver);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    scoreRef.current = onScore;
    gameOverRef.current = onGameOver;
  }, [onScore, onGameOver]);

  useEffect(() => {
    const onFullscreenChange = (): void => {
      setIsFullscreen(document.fullscreenElement === viewportRef.current);
      window.dispatchEvent(new Event("resize"));
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    onFullscreenChange();

    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const game = new FortliteGame(mount, {
      seedBase: seed,
      showEndScreen: false,
      onPlacementChange: (placement) => {
        scoreRef.current(placement);
      },
      onMatchEnd: (result) => {
        gameOverRef.current({
          score: result.won ? 1 : 0,
          won: result.won,
          stats: {
            placement: result.placement,
            eliminations: result.eliminations,
            run: result.survivalTime,
          },
        });
      },
    });

    gameRef.current = game;
    game.start();
    game.setPaused(paused);

    return () => {
      if (document.fullscreenElement === viewportRef.current) {
        void document.exitFullscreen();
      }
      gameRef.current = null;
      game.dispose();
    };
  }, [seed]);

  useEffect(() => {
    gameRef.current?.setPaused(paused);
    onFps(paused ? 0 : 60);
  }, [paused, onFps]);

  const fullscreenSupported = typeof document !== "undefined" && document.fullscreenEnabled;

  const toggleFullscreen = async (): Promise<void> => {
    const viewport = viewportRef.current;
    if (!viewport || !fullscreenSupported) {
      return;
    }

    try {
      if (document.fullscreenElement === viewport) {
        await document.exitFullscreen();
        return;
      }

      await viewport.requestFullscreen();
    } catch {
      setIsFullscreen(document.fullscreenElement === viewport);
    }
  };

  return (
    <div ref={viewportRef} className="fortlite-viewport">
      {fullscreenSupported && (
        <button
          type="button"
          className="fortlite-fullscreen-btn"
          onClick={() => void toggleFullscreen()}
          aria-pressed={isFullscreen}
        >
          {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        </button>
      )}
      <div ref={mountRef} className="fortlite-mount" />
    </div>
  );
};

import { useEffect, useRef, useState } from "react";
import type { GameComponentProps } from "../types/arcade";
import { FortLiteGame } from "./fortliteRuntime/game";
import "./fortlite.css";

export const FortLite = ({
  seed,
  mode,
  settings,
  paused,
  onScore,
  onFps,
  onGameOver,
}: GameComponentProps): React.JSX.Element => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<FortLiteGame | null>(null);
  const scoreRef = useRef(onScore);
  const fpsRef = useRef(onFps);
  const fpsVisibleRef = useRef(settings.showFps);
  const graphicsQualityRef = useRef(settings.graphicsQuality);
  const gameOverRef = useRef(onGameOver);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenSupported = typeof document !== "undefined" && document.fullscreenEnabled;

  useEffect(() => {
    scoreRef.current = onScore;
    fpsRef.current = onFps;
    gameOverRef.current = onGameOver;
  }, [onScore, onFps, onGameOver]);

  useEffect(() => {
    fpsVisibleRef.current = settings.showFps;
    if (!settings.showFps) {
      onFps(0);
    }
  }, [settings.showFps, onFps]);

  useEffect(() => {
    graphicsQualityRef.current = settings.graphicsQuality;
  }, [settings.graphicsQuality]);

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
    if (!fullscreenSupported) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.code !== "KeyF") {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        return;
      }

      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }

      event.preventDefault();

      void (async () => {
        try {
          if (document.fullscreenElement === viewport) {
            await document.exitFullscreen();
            return;
          }

          await viewport.requestFullscreen();
        } catch {
          setIsFullscreen(document.fullscreenElement === viewport);
        }
      })();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreenSupported]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const viewport = viewportRef.current;
    const game = new FortLiteGame(mount, {
      seedBase: seed,
      mode: mode === "duos" ? "duos" : "solo",
      graphicsQuality: graphicsQualityRef.current,
      showEndScreen: false,
      onFpsChange: (fps) => {
        if (fpsVisibleRef.current) {
          fpsRef.current(fps);
        }
      },
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

    return () => {
      if (document.fullscreenElement === viewport) {
        void document.exitFullscreen();
      }
      gameRef.current = null;
      game.dispose();
    };
  }, [seed, mode]);

  useEffect(() => {
    gameRef.current?.setPaused(paused);
    if (paused) {
      onFps(0);
    }
  }, [paused, onFps]);

  useEffect(() => {
    gameRef.current?.setGraphicsQuality(settings.graphicsQuality);
  }, [settings.graphicsQuality]);

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
          {isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
        </button>
      )}
      <div ref={mountRef} className="fortlite-mount" />
    </div>
  );
};

import { useEffect, useRef } from "react";
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
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<FortliteGame | null>(null);
  const scoreRef = useRef(onScore);
  const gameOverRef = useRef(onGameOver);

  useEffect(() => {
    scoreRef.current = onScore;
    gameOverRef.current = onGameOver;
  }, [onScore, onGameOver]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const game = new FortliteGame(mount, {
      seedBase: seed,
      showEndScreen: false,
      onScoreChange: (score) => {
        scoreRef.current(score);
      },
      onMatchEnd: (result) => {
        gameOverRef.current({
          score: result.score,
          won: result.won,
          stats: {
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
      gameRef.current = null;
      game.dispose();
    };
  }, [seed]);

  useEffect(() => {
    gameRef.current?.setPaused(paused);
    onFps(paused ? 0 : 60);
  }, [paused, onFps]);

  return <div ref={mountRef} className="fortlite-viewport" />;
};

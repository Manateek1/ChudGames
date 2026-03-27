import { useEffect, useRef } from "react";
import { setupCanvas } from "../engine/canvas";
import { RollingFps, TARGET_FRAME_DELTA_SECONDS, shouldSkipFrame } from "../engine/fps";
import { circleHitsRect, randRange, seededRandom } from "../engine/math";
import { ParticleSystem } from "../engine/particles";
import type { GameComponentProps } from "../types/arcade";

interface Obstacle {
  x: number;
  w: number;
  h: number;
  passed: boolean;
}

const WIDTH = 900;
const HEIGHT = 540;
const GROUND_Y = 430;

const difficultyConfig = {
  easy: { speed: 250, jump: 490, spawnEvery: 1.2 },
  normal: { speed: 290, jump: 520, spawnEvery: 0.98 },
  hard: { speed: 330, jump: 560, spawnEvery: 0.84 },
};

export const PrecisionRunner = ({
  difficulty,
  seed,
  paused,
  settings,
  input,
  audio,
  onScore,
  onFps,
  onPauseToggle,
  onGameOver,
}: GameComponentProps): React.JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(paused);
  const endedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = setupCanvas(canvas, WIDTH, HEIGHT);
    const fpsMeter = new RollingFps();
    const particles = new ParticleSystem();
    particles.setQuality(settings.graphicsQuality);
    const random = seededRandom(seed);

    const config = difficultyConfig[difficulty];
    const player = { x: 160, y: GROUND_Y - 44, w: 34, h: 44, vy: 0, grounded: true };
    const obstacles: Obstacle[] = [];

    let spawnTimer = 0;
    let distance = 0;
    let streak = 0;
    let bestStreak = 0;
    let score = 0;
    let uiTimer = 0;
    let raf = 0;

    const jump = (): void => {
      if (!player.grounded) {
        return;
      }
      player.vy = -config.jump;
      player.grounded = false;
      audio.ui();
    };

    const finish = (): void => {
      if (endedRef.current) {
        return;
      }
      endedRef.current = true;
      audio.explosion();
      onGameOver({
        score: Math.round(score),
        won: false,
        stats: {
          run: bestStreak,
        },
      });
    };

    const update = (dt: number): void => {
      if (input.consumePress("pause")) {
        onPauseToggle();
      }

      if (input.consumePress("action") || input.consumePress("up")) {
        jump();
      }

      spawnTimer += dt;
      const speed = config.speed + distance * 0.04;

      if (spawnTimer >= config.spawnEvery) {
        spawnTimer = 0;
        obstacles.push({
          x: WIDTH + 20,
          w: randRange(28, 58, random),
          h: randRange(34, 82, random),
          passed: false,
        });
      }

      player.vy += 1300 * dt;
      player.y += player.vy * dt;
      if (player.y >= GROUND_Y - player.h) {
        player.y = GROUND_Y - player.h;
        player.vy = 0;
        player.grounded = true;
      }

      for (let i = obstacles.length - 1; i >= 0; i -= 1) {
        const obstacle = obstacles[i];
        obstacle.x -= speed * dt;

        if (!obstacle.passed && obstacle.x + obstacle.w < player.x) {
          obstacle.passed = true;
          streak += 1;
          bestStreak = Math.max(bestStreak, streak);
          score += 25 + streak * 3;
          particles.burst({
            x: player.x + player.w * 0.5,
            y: player.y + player.h,
            color: "#52fff0",
            count: 8,
            minSpeed: 60,
            maxSpeed: 130,
            life: 0.25,
            size: 2,
          });
        }

        if (
          circleHitsRect(
            player.x + player.w * 0.5,
            player.y + player.h * 0.5,
            player.w * 0.45,
            obstacle.x,
            GROUND_Y - obstacle.h,
            obstacle.w,
            obstacle.h,
          )
        ) {
          finish();
          return;
        }

        if (obstacle.x + obstacle.w < -20) {
          obstacles.splice(i, 1);
        }
      }

      distance += speed * dt * 0.08;
      score += dt * 10;
      particles.update(dt);
    };

    const draw = (): void => {
      ctx.fillStyle = "#070c1b";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.fillStyle = "rgba(80,250,255,0.07)";
      for (let i = 0; i < 20; i += 1) {
        const x = ((i * 80 - distance * 2) % WIDTH + WIDTH) % WIDTH;
        ctx.fillRect(x, 40, 42, 4);
      }

      ctx.fillStyle = "#111c3a";
      ctx.fillRect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y);

      ctx.fillStyle = "#ff6482";
      for (const obstacle of obstacles) {
        ctx.fillRect(obstacle.x, GROUND_Y - obstacle.h, obstacle.w, obstacle.h);
      }

      ctx.fillStyle = "#54fff2";
      ctx.fillRect(player.x, player.y, player.w, player.h);

      particles.render(ctx);

      ctx.fillStyle = "#dff8ff";
      ctx.font = "14px Rajdhani";
      ctx.fillText(`Streak: ${streak}`, 16, 24);
      ctx.fillText(`Best: ${bestStreak}`, 16, 42);
    };

    let previous = 0;

    const frame = (now: number): void => {
      if (shouldSkipFrame(now, previous)) {
        if (!endedRef.current) {
          raf = requestAnimationFrame(frame);
        }
        return;
      }

      const dt = previous === 0 ? 0 : Math.min(TARGET_FRAME_DELTA_SECONDS, (now - previous) / 1000);
      previous = now;

      if (!pausedRef.current && !endedRef.current) {
        update(dt);
      }

      draw();

      uiTimer += dt;
      if (uiTimer >= 0.1) {
        uiTimer = 0;
        onScore(Math.round(score));
        onFps(fpsMeter.next(now));
      }

      if (!endedRef.current) {
        raf = requestAnimationFrame(frame);
      }
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [difficulty, seed, settings.graphicsQuality, input, audio, onScore, onFps, onPauseToggle, onGameOver]);

  return <canvas ref={canvasRef} className="mx-auto w-full max-w-[900px] rounded-xl" />;
};

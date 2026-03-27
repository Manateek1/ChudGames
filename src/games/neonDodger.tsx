import { useEffect, useRef } from "react";
import { RollingFps, TARGET_FRAME_DELTA_SECONDS, shouldSkipFrame } from "../engine/fps";
import { ParticleSystem } from "../engine/particles";
import { circleHitsCircle, circleHitsRect, clamp, randRange, seededRandom } from "../engine/math";
import { createBackBuffer, drawNeonGrid, setupCanvas } from "../engine/canvas";
import type { GameComponentProps } from "../types/arcade";

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
}

interface Pickup {
  x: number;
  y: number;
  radius: number;
  speed: number;
}

const WIDTH = 900;
const HEIGHT = 540;

const difficultyConfig = {
  easy: { playerSpeed: 320, spawnEvery: 1.1, speed: 120, ramp: 16 },
  normal: { playerSpeed: 350, spawnEvery: 0.9, speed: 150, ramp: 22 },
  hard: { playerSpeed: 380, spawnEvery: 0.72, speed: 180, ramp: 30 },
};

export const NeonDodger = ({
  difficulty,
  seed,
  paused,
  settings,
  input,
  audio,
  onScore,
  onPauseToggle,
  onGameOver,
  onFps,
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
    const back = createBackBuffer(WIDTH, HEIGHT);
    const particles = new ParticleSystem();
    particles.setQuality(settings.graphicsQuality);

    const random = seededRandom(seed);
    const fpsMeter = new RollingFps();
    const config = difficultyConfig[difficulty];

    const player = { x: WIDTH * 0.5, y: HEIGHT * 0.84, radius: 14 };
    const obstacles: Obstacle[] = [];
    const pickups: Pickup[] = [];

    let obstacleTimer = 0;
    let pickupTimer = 0;
    let elapsed = 0;
    let score = 0;
    let uiTimer = 0;
    let shake = 0;
    let animation = 0;

    const endGame = (): void => {
      if (endedRef.current) {
        return;
      }
      endedRef.current = true;
      audio.explosion();
      onGameOver({ score: Math.round(score), won: false });
    };

    const update = (dt: number): void => {
      if (input.consumePress("pause")) {
        onPauseToggle();
      }

      const moveX = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
      const moveY = (input.isDown("down") ? 1 : 0) - (input.isDown("up") ? 1 : 0);

      player.x = clamp(player.x + moveX * config.playerSpeed * dt, player.radius + 10, WIDTH - player.radius - 10);
      player.y = clamp(player.y + moveY * config.playerSpeed * dt, player.radius + 10, HEIGHT - player.radius - 10);

      elapsed += dt;
      obstacleTimer += dt;
      pickupTimer += dt;

      const levelSpeed = config.speed + elapsed * config.ramp;

      if (obstacleTimer >= config.spawnEvery) {
        obstacleTimer = 0;
        const width = randRange(24, 78, random);
        const height = randRange(18, 90, random);
        obstacles.push({
          x: randRange(10, WIDTH - width - 10, random),
          y: -height,
          w: width,
          h: height,
          speed: levelSpeed * randRange(0.8, 1.35, random),
        });
      }

      if (pickupTimer >= 2.6) {
        pickupTimer = 0;
        pickups.push({
          x: randRange(28, WIDTH - 28, random),
          y: -15,
          radius: 8,
          speed: levelSpeed * 0.7,
        });
      }

      for (let i = obstacles.length - 1; i >= 0; i -= 1) {
        const obstacle = obstacles[i];
        obstacle.y += obstacle.speed * dt;

        if (circleHitsRect(player.x, player.y, player.radius, obstacle.x, obstacle.y, obstacle.w, obstacle.h)) {
          shake = 10;
          particles.burst({
            x: player.x,
            y: player.y,
            color: "#ff5873",
            count: 28,
            minSpeed: 110,
            maxSpeed: 380,
            life: 0.6,
            size: 3,
          });
          endGame();
          return;
        }

        if (obstacle.y > HEIGHT + obstacle.h) {
          obstacles.splice(i, 1);
          score += 15;
        }
      }

      for (let i = pickups.length - 1; i >= 0; i -= 1) {
        const pickup = pickups[i];
        pickup.y += pickup.speed * dt;

        if (circleHitsCircle(player.x, player.y, player.radius, pickup.x, pickup.y, pickup.radius)) {
          pickups.splice(i, 1);
          score += 120;
          audio.power();
          particles.burst({
            x: pickup.x,
            y: pickup.y,
            color: "#ffe761",
            count: 16,
            minSpeed: 80,
            maxSpeed: 260,
            life: 0.48,
            size: 3,
          });
          continue;
        }

        if (pickup.y > HEIGHT + 20) {
          pickups.splice(i, 1);
        }
      }

      score += dt * 40;
      particles.update(dt);
      shake = Math.max(0, shake - dt * 20);
    };

    const draw = (time: number): void => {
      drawNeonGrid(back.ctx, WIDTH, HEIGHT, time);
      ctx.save();
      if (shake > 0) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      }
      ctx.drawImage(back.canvas as CanvasImageSource, 0, 0, WIDTH, HEIGHT);

      ctx.fillStyle = "rgba(255, 90, 114, 0.95)";
      ctx.shadowColor = "#ff5d8c";
      ctx.shadowBlur = 20;
      for (const obstacle of obstacles) {
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
      }

      ctx.fillStyle = "#ffe95c";
      ctx.shadowColor = "#ffe95c";
      ctx.shadowBlur = 18;
      for (const pickup of pickups) {
        ctx.beginPath();
        ctx.arc(pickup.x, pickup.y, pickup.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "#3efff0";
      ctx.shadowColor = "#3efff0";
      ctx.shadowBlur = 26;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
      ctx.fill();

      particles.render(ctx);
      ctx.restore();
    };

    let previous = 0;
    let raf = 0;

    const frame = (now: number): void => {
      if (shouldSkipFrame(now, previous)) {
        if (!endedRef.current) {
          raf = requestAnimationFrame(frame);
        }
        return;
      }

      const dt = previous === 0 ? 0 : Math.min(TARGET_FRAME_DELTA_SECONDS, (now - previous) / 1000);
      previous = now;
      animation += dt;

      if (!pausedRef.current && !endedRef.current) {
        update(dt);
      }

      draw(animation * 1000);

      uiTimer += dt;
      if (uiTimer >= 0.1) {
        uiTimer = 0;
        onScore(Math.floor(score));
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
  }, [difficulty, seed, settings.graphicsQuality, input, onFps, onGameOver, onPauseToggle, onScore, audio]);

  return <canvas ref={canvasRef} className="mx-auto w-full max-w-[900px] rounded-xl" />;
};

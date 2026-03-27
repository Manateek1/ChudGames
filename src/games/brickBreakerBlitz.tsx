import { useEffect, useRef } from "react";
import { setupCanvas } from "../engine/canvas";
import { RollingFps, TARGET_FRAME_DELTA_SECONDS, shouldSkipFrame } from "../engine/fps";
import { circleHitsRect, clamp, randRange, seededRandom } from "../engine/math";
import { ParticleSystem } from "../engine/particles";
import type { GameComponentProps } from "../types/arcade";

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  color: string;
}

interface PowerUp {
  x: number;
  y: number;
  type: "wide" | "multi" | "slow";
  speed: number;
}

const WIDTH = 900;
const HEIGHT = 540;

const difficultyConfig = {
  easy: { lives: 4, speed: 230, rows: 4, maxLevel: 3 },
  normal: { lives: 3, speed: 260, rows: 5, maxLevel: 4 },
  hard: { lives: 2, speed: 300, rows: 6, maxLevel: 5 },
};

const brickPalette = ["#49fff0", "#60ffa2", "#ffd34f", "#ff9966", "#ff6180", "#b181ff"];

export const BrickBreakerBlitz = ({
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
    const random = seededRandom(seed);
    const particles = new ParticleSystem();
    particles.setQuality(settings.graphicsQuality);

    const config = difficultyConfig[difficulty];

    const paddle = {
      x: WIDTH * 0.5,
      y: HEIGHT - 38,
      w: 128,
      h: 14,
      speed: 470,
      wideTimer: 0,
    };

    const balls: Ball[] = [];
    const bricks: Brick[] = [];
    const powerUps: PowerUp[] = [];

    let slowTimer = 0;
    let level = 1;
    let lives = config.lives;
    let score = 0;
    let uiTimer = 0;
    let raf = 0;

    const launchBall = (): void => {
      balls.push({
        x: paddle.x,
        y: paddle.y - 16,
        vx: randRange(-180, 180, random),
        vy: -config.speed,
        r: 7,
      });
    };

    const buildLevel = (): void => {
      bricks.length = 0;
      const rows = Math.min(config.rows + level - 1, 8);
      const cols = 12;
      const marginX = 42;
      const top = 56;
      const gap = 6;
      const brickWidth = (WIDTH - marginX * 2 - gap * (cols - 1)) / cols;
      const brickHeight = 22;

      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          bricks.push({
            x: marginX + c * (brickWidth + gap),
            y: top + r * (brickHeight + gap),
            w: brickWidth,
            h: brickHeight,
            hp: r > 3 ? 2 : 1,
            color: brickPalette[r % brickPalette.length],
          });
        }
      }
    };

    buildLevel();
    launchBall();

    const finish = (won: boolean): void => {
      if (endedRef.current) {
        return;
      }
      endedRef.current = true;
      onGameOver({
        score: Math.round(score),
        won,
        stats: {
          level,
        },
      });
    };

    const update = (dt: number): void => {
      if (input.consumePress("pause")) {
        onPauseToggle();
      }

      paddle.wideTimer = Math.max(0, paddle.wideTimer - dt);
      slowTimer = Math.max(0, slowTimer - dt);
      paddle.w = paddle.wideTimer > 0 ? 180 : 128;

      const move = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
      paddle.x = clamp(paddle.x + move * paddle.speed * dt, paddle.w * 0.5, WIDTH - paddle.w * 0.5);

      for (let i = balls.length - 1; i >= 0; i -= 1) {
        const ball = balls[i];
        const speedFactor = slowTimer > 0 ? 0.72 : 1;

        ball.x += ball.vx * dt * speedFactor;
        ball.y += ball.vy * dt * speedFactor;

        if (ball.x - ball.r <= 0 || ball.x + ball.r >= WIDTH) {
          ball.vx *= -1;
          ball.x = clamp(ball.x, ball.r + 1, WIDTH - ball.r - 1);
        }

        if (ball.y - ball.r <= 0) {
          ball.vy = Math.abs(ball.vy);
        }

        if (ball.y - ball.r > HEIGHT) {
          balls.splice(i, 1);
          continue;
        }

        if (circleHitsRect(ball.x, ball.y, ball.r, paddle.x - paddle.w * 0.5, paddle.y, paddle.w, paddle.h) && ball.vy > 0) {
          const hitOffset = (ball.x - paddle.x) / (paddle.w * 0.5);
          ball.vx = hitOffset * 320;
          ball.vy = -Math.abs(ball.vy) - 16;
          audio.ui();
        }

        for (let j = bricks.length - 1; j >= 0; j -= 1) {
          const brick = bricks[j];
          if (!circleHitsRect(ball.x, ball.y, ball.r, brick.x, brick.y, brick.w, brick.h)) {
            continue;
          }

          ball.vy *= -1;
          brick.hp -= 1;
          score += 30;

          if (brick.hp <= 0) {
            bricks.splice(j, 1);
            score += 55;
            particles.burst({
              x: brick.x + brick.w * 0.5,
              y: brick.y + brick.h * 0.5,
              color: brick.color,
              count: 14,
              minSpeed: 70,
              maxSpeed: 220,
              life: 0.45,
              size: 2.4,
            });
            if (random() < 0.12) {
              const types: Array<PowerUp["type"]> = ["wide", "multi", "slow"];
              powerUps.push({
                x: brick.x + brick.w * 0.5,
                y: brick.y + brick.h * 0.5,
                type: types[Math.floor(random() * types.length)],
                speed: 130,
              });
            }
          }

          audio.hit();
          break;
        }
      }

      for (let i = powerUps.length - 1; i >= 0; i -= 1) {
        const item = powerUps[i];
        item.y += item.speed * dt;

        if (item.y > HEIGHT + 20) {
          powerUps.splice(i, 1);
          continue;
        }

        const hitPaddle =
          item.x >= paddle.x - paddle.w * 0.5 &&
          item.x <= paddle.x + paddle.w * 0.5 &&
          item.y >= paddle.y - 8 &&
          item.y <= paddle.y + paddle.h + 8;

        if (!hitPaddle) {
          continue;
        }

        powerUps.splice(i, 1);
        audio.power();

        if (item.type === "wide") {
          paddle.wideTimer = 8;
        } else if (item.type === "multi") {
          const cloneBalls = balls.map((ball) => ({
            ...ball,
            vx: -ball.vx,
            vy: ball.vy,
          }));
          balls.push(...cloneBalls.slice(0, 2));
        } else {
          slowTimer = 6;
        }
      }

      if (balls.length === 0) {
        lives -= 1;
        audio.explosion();
        if (lives <= 0) {
          finish(false);
          return;
        }
        launchBall();
      }

      if (bricks.length === 0) {
        level += 1;
        score += 300;
        audio.power();
        if (level > config.maxLevel) {
          finish(true);
          return;
        }
        buildLevel();
        launchBall();
      }

      particles.update(dt);
    };

    const draw = (): void => {
      ctx.fillStyle = "#040715";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.strokeStyle = "rgba(80,240,255,0.12)";
      for (let y = 0; y < HEIGHT; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(WIDTH, y);
        ctx.stroke();
      }

      for (const brick of bricks) {
        ctx.fillStyle = brick.color;
        ctx.globalAlpha = brick.hp === 2 ? 0.7 : 1;
        ctx.fillRect(brick.x, brick.y, brick.w, brick.h);
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#f4fbff";
      for (const ball of balls) {
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "#57fff2";
      ctx.fillRect(paddle.x - paddle.w * 0.5, paddle.y, paddle.w, paddle.h);

      for (const item of powerUps) {
        ctx.fillStyle = item.type === "wide" ? "#73ff99" : item.type === "multi" ? "#ffaf57" : "#9db0ff";
        ctx.beginPath();
        ctx.arc(item.x, item.y, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      particles.render(ctx);

      ctx.fillStyle = "#dff8ff";
      ctx.font = "14px Rajdhani";
      ctx.fillText(`Lives: ${Math.max(0, lives)}`, 16, 24);
      ctx.fillText(`Level: ${level}`, 16, 42);
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
  }, [difficulty, seed, settings.graphicsQuality, input, audio, onFps, onGameOver, onPauseToggle, onScore]);

  return <canvas ref={canvasRef} className="mx-auto w-full max-w-[900px] rounded-xl" />;
};

import { useEffect, useRef } from "react";
import { setupCanvas } from "../engine/canvas";
import { RollingFps, TARGET_FRAME_DELTA_SECONDS, shouldSkipFrame } from "../engine/fps";
import { clamp, randRange, seededRandom } from "../engine/math";
import type { GameComponentProps } from "../types/arcade";

const WIDTH = 900;
const HEIGHT = 540;

const difficultyConfig = {
  easy: { ballSpeed: 240, aiSpeed: 180 },
  normal: { ballSpeed: 280, aiSpeed: 240 },
  hard: { ballSpeed: 320, aiSpeed: 300 },
};

const MAX_BALL_SPEED = 640;

export const PongNeon = ({
  difficulty,
  mode,
  seed,
  paused,
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
    const config = difficultyConfig[difficulty];
    const touchPreferred = window.matchMedia("(pointer: coarse)").matches;

    const paddleHeight = 110;
    const paddleWidth = 14;

    const left = { y: HEIGHT * 0.5 - paddleHeight * 0.5, score: 0 };
    const right = { y: HEIGHT * 0.5 - paddleHeight * 0.5, score: 0 };

    const ball = {
      x: WIDTH * 0.5,
      y: HEIGHT * 0.5,
      vx: config.ballSpeed * (random() > 0.5 ? 1 : -1),
      vy: randRange(-120, 120, random),
      r: 8,
    };

    let rally = 0;
    let longestRally = 0;
    let uiTimer = 0;
    let raf = 0;

    const keyboard = {
      leftUp: false,
      leftDown: false,
      rightUp: false,
      rightDown: false,
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === "w") {
        keyboard.leftUp = true;
      }
      if (event.key.toLowerCase() === "s") {
        keyboard.leftDown = true;
      }
      if (event.key === "ArrowUp") {
        keyboard.rightUp = true;
      }
      if (event.key === "ArrowDown") {
        keyboard.rightDown = true;
      }
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === "w") {
        keyboard.leftUp = false;
      }
      if (event.key.toLowerCase() === "s") {
        keyboard.leftDown = false;
      }
      if (event.key === "ArrowUp") {
        keyboard.rightUp = false;
      }
      if (event.key === "ArrowDown") {
        keyboard.rightDown = false;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const resetBall = (towardRight: boolean): void => {
      ball.x = WIDTH * 0.5;
      ball.y = HEIGHT * 0.5;
      ball.vx = Math.abs(config.ballSpeed) * (towardRight ? 1 : -1);
      ball.vy = randRange(-140, 140, random);
      rally = 0;
    };

    const finish = (): void => {
      if (endedRef.current) {
        return;
      }
      endedRef.current = true;
      const leftWon = left.score > right.score;
      onGameOver({
        score: left.score * 100 + longestRally,
        won: leftWon,
        stats: {
          run: longestRally,
        },
      });
    };

    const movePaddle = (paddle: { y: number }, direction: number, speed: number, dt: number): void => {
      paddle.y = clamp(paddle.y + direction * speed * dt, 16, HEIGHT - paddleHeight - 16);
    };

    const update = (dt: number): void => {
      if (input.consumePress("pause")) {
        onPauseToggle();
      }

      const p1KeyboardDirection = (keyboard.leftDown ? 1 : 0) - (keyboard.leftUp ? 1 : 0);
      const p1TouchDirection =
        touchPreferred ? (input.isDown("down") ? 1 : 0) - (input.isDown("up") ? 1 : 0) : 0;
      const p1Direction =
        mode === "single"
          ? (keyboard.leftDown || input.isDown("down") ? 1 : 0) - (keyboard.leftUp || input.isDown("up") ? 1 : 0)
          : p1KeyboardDirection !== 0
            ? p1KeyboardDirection
            : p1TouchDirection;
      movePaddle(left, p1Direction, 360, dt);

      if (mode === "single") {
        const center = right.y + paddleHeight * 0.5;
        const aiDirection = ball.y > center + 8 ? 1 : ball.y < center - 8 ? -1 : 0;
        movePaddle(right, aiDirection, config.aiSpeed, dt);
      } else {
        const p2KeyboardDirection = (keyboard.rightDown ? 1 : 0) - (keyboard.rightUp ? 1 : 0);
        const p2TouchDirection =
          touchPreferred ? (input.isDown("action2") ? 1 : 0) - (input.isDown("action") ? 1 : 0) : 0;
        const p2Direction = p2KeyboardDirection !== 0 ? p2KeyboardDirection : p2TouchDirection;
        movePaddle(right, p2Direction, 360, dt);
      }

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      if (ball.y - ball.r <= 0 || ball.y + ball.r >= HEIGHT) {
        ball.vy *= -1;
        ball.y = clamp(ball.y, ball.r + 1, HEIGHT - ball.r - 1);
        audio.ui();
      }

      const hitLeft =
        ball.x - ball.r <= 30 + paddleWidth &&
        ball.x + ball.r >= 30 &&
        ball.y + ball.r >= left.y &&
        ball.y - ball.r <= left.y + paddleHeight;

      if (hitLeft && ball.vx < 0) {
        const offset = (ball.y - (left.y + paddleHeight * 0.5)) / (paddleHeight * 0.5);
        ball.x = 30 + paddleWidth + ball.r + 0.5;
        ball.vx = Math.min(Math.abs(ball.vx) * 1.04 + 8, MAX_BALL_SPEED);
        ball.vy = clamp(ball.vy + offset * 140, -420, 420);
        rally += 1;
        longestRally = Math.max(longestRally, rally);
        audio.hit();
      }

      const hitRight =
        ball.x + ball.r >= WIDTH - 30 - paddleWidth &&
        ball.x - ball.r <= WIDTH - 30 &&
        ball.y + ball.r >= right.y &&
        ball.y - ball.r <= right.y + paddleHeight;

      if (hitRight && ball.vx > 0) {
        const offset = (ball.y - (right.y + paddleHeight * 0.5)) / (paddleHeight * 0.5);
        ball.x = WIDTH - 30 - paddleWidth - ball.r - 0.5;
        ball.vx = -Math.min(Math.abs(ball.vx) * 1.04 + 8, MAX_BALL_SPEED);
        ball.vy = clamp(ball.vy + offset * 140, -420, 420);
        rally += 1;
        longestRally = Math.max(longestRally, rally);
        audio.hit();
      }

      if (ball.x < -20) {
        right.score += 1;
        audio.explosion();
        resetBall(true);
      } else if (ball.x > WIDTH + 20) {
        left.score += 1;
        audio.explosion();
        resetBall(false);
      }

      if (left.score >= 7 || right.score >= 7) {
        finish();
      }
    };

    const draw = (): void => {
      ctx.fillStyle = "#060914";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.strokeStyle = "rgba(90,255,241,0.2)";
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      ctx.moveTo(WIDTH * 0.5, 0);
      ctx.lineTo(WIDTH * 0.5, HEIGHT);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#58fff2";
      ctx.fillRect(30, left.y, paddleWidth, paddleHeight);
      ctx.fillStyle = "#ffb45b";
      ctx.fillRect(WIDTH - 30 - paddleWidth, right.y, paddleWidth, paddleHeight);

      ctx.fillStyle = "#f4fcff";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#dff8ff";
      ctx.font = "36px Orbitron";
      ctx.fillText(String(left.score), WIDTH * 0.5 - 80, 64);
      ctx.fillText(String(right.score), WIDTH * 0.5 + 52, 64);
      ctx.font = "14px Rajdhani";
      ctx.fillText(`Rally ${rally} (best ${longestRally})`, WIDTH * 0.5 - 70, 92);
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
        onScore(left.score * 100 + longestRally);
        onFps(fpsMeter.next(now));
      }

      if (!endedRef.current) {
        raf = requestAnimationFrame(frame);
      }
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [difficulty, mode, seed, input, audio, onFps, onGameOver, onPauseToggle, onScore]);

  return <canvas ref={canvasRef} className="mx-auto w-full max-w-[900px] rounded-xl" />;
};

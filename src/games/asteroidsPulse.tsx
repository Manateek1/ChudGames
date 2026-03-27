import { useEffect, useRef } from "react";
import { setupCanvas } from "../engine/canvas";
import { RollingFps, TARGET_FRAME_DELTA_SECONDS, shouldSkipFrame } from "../engine/fps";
import { circleHitsCircle, clamp, randRange, seededRandom, wrap } from "../engine/math";
import { ParticleSystem } from "../engine/particles";
import type { GameComponentProps } from "../types/arcade";

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Asteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  radius: number;
}

const WIDTH = 900;
const HEIGHT = 540;

const difficultyConfig = {
  easy: { asteroids: 5, speed: 55 },
  normal: { asteroids: 7, speed: 74 },
  hard: { asteroids: 9, speed: 92 },
};

export const AsteroidsPulse = ({
  difficulty,
  seed,
  paused,
  input,
  audio,
  settings,
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
    const particles = new ParticleSystem();
    particles.setQuality(settings.graphicsQuality);
    const random = seededRandom(seed);
    const fpsMeter = new RollingFps();
    const config = difficultyConfig[difficulty];

    const ship = {
      x: WIDTH * 0.5,
      y: HEIGHT * 0.5,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      invulnerable: 2,
      lives: difficulty === "hard" ? 2 : 3,
    };

    const bullets: Bullet[] = [];
    const asteroids: Asteroid[] = [];

    const spawnAsteroid = (size = 3, x?: number, y?: number): void => {
      const radius = size === 3 ? 34 : size === 2 ? 24 : 14;
      const speed = config.speed * randRange(0.9, 1.35, random) * (size === 1 ? 1.5 : 1);
      const angle = randRange(0, Math.PI * 2, random);

      asteroids.push({
        x: x ?? randRange(0, WIDTH, random),
        y: y ?? randRange(0, HEIGHT, random),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size,
        radius,
      });
    };

    for (let i = 0; i < config.asteroids; i += 1) {
      spawnAsteroid(3);
    }

    let score = 0;
    let uiTimer = 0;
    let shootCooldown = 0;
    let raf = 0;

    const endGame = (): void => {
      if (endedRef.current) {
        return;
      }
      endedRef.current = true;
      onGameOver({ score: Math.round(score), won: false });
    };

    const splitAsteroid = (asteroid: Asteroid): void => {
      if (asteroid.size <= 1) {
        return;
      }
      for (let i = 0; i < 2; i += 1) {
        spawnAsteroid(asteroid.size - 1, asteroid.x, asteroid.y);
      }
    };

    const resetShip = (): void => {
      ship.x = WIDTH * 0.5;
      ship.y = HEIGHT * 0.5;
      ship.vx = 0;
      ship.vy = 0;
      ship.invulnerable = 2;
    };

    const update = (dt: number): void => {
      if (input.consumePress("pause")) {
        onPauseToggle();
      }

      shootCooldown = Math.max(0, shootCooldown - dt);
      ship.invulnerable = Math.max(0, ship.invulnerable - dt);

      const rotate = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
      const thrust = input.isDown("up") ? 1 : 0;

      ship.angle += rotate * 4.2 * dt;
      if (thrust > 0) {
        ship.vx += Math.cos(ship.angle) * 210 * dt;
        ship.vy += Math.sin(ship.angle) * 210 * dt;
      }
      if (input.isDown("down")) {
        ship.vx *= 0.96;
        ship.vy *= 0.96;
      }

      ship.vx = clamp(ship.vx, -280, 280);
      ship.vy = clamp(ship.vy, -280, 280);

      ship.x = wrap(ship.x + ship.vx * dt, WIDTH);
      ship.y = wrap(ship.y + ship.vy * dt, HEIGHT);
      ship.vx *= 0.992;
      ship.vy *= 0.992;

      if ((input.isDown("action") || input.consumePress("action")) && shootCooldown <= 0) {
        shootCooldown = 0.19;
        bullets.push({
          x: ship.x + Math.cos(ship.angle) * 14,
          y: ship.y + Math.sin(ship.angle) * 14,
          vx: Math.cos(ship.angle) * 420 + ship.vx,
          vy: Math.sin(ship.angle) * 420 + ship.vy,
          life: 1.2,
        });
        audio.ui();
      }

      for (let i = bullets.length - 1; i >= 0; i -= 1) {
        const bullet = bullets[i];
        bullet.life -= dt;
        if (bullet.life <= 0) {
          bullets.splice(i, 1);
          continue;
        }
        bullet.x = wrap(bullet.x + bullet.vx * dt, WIDTH);
        bullet.y = wrap(bullet.y + bullet.vy * dt, HEIGHT);
      }

      for (let i = asteroids.length - 1; i >= 0; i -= 1) {
        const asteroid = asteroids[i];
        asteroid.x = wrap(asteroid.x + asteroid.vx * dt, WIDTH);
        asteroid.y = wrap(asteroid.y + asteroid.vy * dt, HEIGHT);

        for (let j = bullets.length - 1; j >= 0; j -= 1) {
          const bullet = bullets[j];
          if (!circleHitsCircle(asteroid.x, asteroid.y, asteroid.radius, bullet.x, bullet.y, 2)) {
            continue;
          }

          bullets.splice(j, 1);
          asteroids.splice(i, 1);
          splitAsteroid(asteroid);
          score += asteroid.size === 3 ? 120 : asteroid.size === 2 ? 180 : 260;
          audio.hit();
          particles.burst({
            x: asteroid.x,
            y: asteroid.y,
            color: "#6efff0",
            count: 22,
            minSpeed: 80,
            maxSpeed: 260,
            life: 0.5,
            size: 2.5,
          });
          break;
        }
      }

      if (ship.invulnerable <= 0) {
        for (const asteroid of asteroids) {
          if (circleHitsCircle(asteroid.x, asteroid.y, asteroid.radius, ship.x, ship.y, 12)) {
            ship.lives -= 1;
            audio.explosion();
            particles.burst({
              x: ship.x,
              y: ship.y,
              color: "#ff5a7a",
              count: 30,
              minSpeed: 110,
              maxSpeed: 320,
              life: 0.7,
              size: 3,
            });
            if (ship.lives <= 0) {
              endGame();
              return;
            }
            resetShip();
            break;
          }
        }
      }

      if (asteroids.length === 0) {
        for (let i = 0; i < config.asteroids; i += 1) {
          spawnAsteroid(3);
        }
        score += 500;
      }

      particles.update(dt);
    };

    const drawShip = (): void => {
      ctx.save();
      ctx.translate(ship.x, ship.y);
      ctx.rotate(ship.angle + Math.PI / 2);

      ctx.strokeStyle = ship.invulnerable > 0 ? "#ffe266" : "#42fff0";
      ctx.lineWidth = 2;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 14;

      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(-10, 10);
      ctx.lineTo(0, 6);
      ctx.lineTo(10, 10);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    };

    const draw = (): void => {
      ctx.fillStyle = "#050813";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.fillStyle = "rgba(255,255,255,0.3)";
      for (let i = 0; i < 80; i += 1) {
        const x = (i * 137.21) % WIDTH;
        const y = (i * 89.7) % HEIGHT;
        ctx.fillRect(x, y, 1, 1);
      }

      ctx.strokeStyle = "#ff6f95";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#ff6f95";
      ctx.shadowBlur = 12;
      for (const asteroid of asteroids) {
        ctx.beginPath();
        for (let i = 0; i < 8; i += 1) {
          const angle = (Math.PI * 2 * i) / 8;
          const wobble = 1 + Math.sin(i * 1.8 + asteroid.x * 0.01) * 0.16;
          const px = asteroid.x + Math.cos(angle) * asteroid.radius * wobble;
          const py = asteroid.y + Math.sin(angle) * asteroid.radius * wobble;
          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();
        ctx.stroke();
      }

      ctx.fillStyle = "#e7fcff";
      ctx.shadowColor = "#9dfbff";
      ctx.shadowBlur = 10;
      for (const bullet of bullets) {
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      drawShip();
      particles.render(ctx);

      ctx.shadowBlur = 0;
      ctx.fillStyle = "#dff8ff";
      ctx.font = "14px Rajdhani";
      ctx.fillText(`Lives: ${ship.lives}`, 16, 24);
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
      if (uiTimer > 0.1) {
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

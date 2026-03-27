import { useEffect, useRef } from "react";
import { setupCanvas } from "../engine/canvas";
import { RollingFps, TARGET_FRAME_DELTA_SECONDS, shouldSkipFrame } from "../engine/fps";
import { circleHitsCircle, clamp, dist, randRange, seededRandom } from "../engine/math";
import { ParticleSystem } from "../engine/particles";
import type { GameComponentProps } from "../types/arcade";

interface Enemy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  radius: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Orb {
  x: number;
  y: number;
  value: number;
}

const WIDTH = 900;
const HEIGHT = 540;

const difficultyConfig = {
  easy: { enemySpeed: 55, spawnRate: 1.1, enemyHp: 24 },
  normal: { enemySpeed: 70, spawnRate: 0.85, enemyHp: 32 },
  hard: { enemySpeed: 86, spawnRate: 0.72, enemyHp: 42 },
};

export const VoidSurvival = ({
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

    const player = {
      x: WIDTH * 0.5,
      y: HEIGHT * 0.5,
      radius: 14,
      speed: 250,
      hp: 100,
      maxHp: 100,
      fireRate: 0.4,
      fireTimer: 0,
      bulletSpeed: 340,
      damage: 16,
    };

    const enemies: Enemy[] = [];
    const bullets: Bullet[] = [];
    const orbs: Orb[] = [];

    let spawnTimer = 0;
    let timeSurvived = 0;
    let kills = 0;
    let score = 0;
    let xp = 0;
    let nextUpgradeXp = 120;
    let uiTimer = 0;
    let levelFlash = 0;
    let raf = 0;

    const spawnEnemy = (): void => {
      const edge = Math.floor(random() * 4);
      let x = 0;
      let y = 0;
      if (edge === 0) {
        x = randRange(0, WIDTH, random);
        y = -20;
      } else if (edge === 1) {
        x = WIDTH + 20;
        y = randRange(0, HEIGHT, random);
      } else if (edge === 2) {
        x = randRange(0, WIDTH, random);
        y = HEIGHT + 20;
      } else {
        x = -20;
        y = randRange(0, HEIGHT, random);
      }

      const radius = randRange(12, 20, random);
      enemies.push({
        x,
        y,
        vx: 0,
        vy: 0,
        hp: config.enemyHp + timeSurvived * 0.3,
        radius,
      });
    };

    const findTarget = (): Enemy | undefined => {
      let nearest: Enemy | undefined;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const enemy of enemies) {
        const d = dist(player.x, player.y, enemy.x, enemy.y);
        if (d < bestDistance) {
          bestDistance = d;
          nearest = enemy;
        }
      }
      return nearest;
    };

    const applyUpgrade = (): void => {
      const options = ["speed", "fire", "damage", "hp"] as const;
      const choice = options[Math.floor(random() * options.length)];
      if (choice === "speed") {
        player.speed += 18;
      } else if (choice === "fire") {
        player.fireRate = Math.max(0.15, player.fireRate - 0.03);
      } else if (choice === "damage") {
        player.damage += 4;
      } else {
        player.maxHp += 8;
        player.hp = Math.min(player.maxHp, player.hp + 12);
      }
      levelFlash = 1;
      audio.power();
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
          time: Math.round(timeSurvived),
          kills,
        },
      });
    };

    const update = (dt: number): void => {
      if (input.consumePress("pause")) {
        onPauseToggle();
      }

      timeSurvived += dt;
      spawnTimer += dt;
      player.fireTimer -= dt;
      levelFlash = Math.max(0, levelFlash - dt * 1.4);

      const moveX = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
      const moveY = (input.isDown("down") ? 1 : 0) - (input.isDown("up") ? 1 : 0);

      player.x = clamp(player.x + moveX * player.speed * dt, 20, WIDTH - 20);
      player.y = clamp(player.y + moveY * player.speed * dt, 20, HEIGHT - 20);

      if (spawnTimer >= config.spawnRate) {
        spawnTimer = 0;
        spawnEnemy();
      }

      const target = findTarget();
      if (target && player.fireTimer <= 0) {
        const angle = Math.atan2(target.y - player.y, target.x - player.x);
        bullets.push({
          x: player.x,
          y: player.y,
          vx: Math.cos(angle) * player.bulletSpeed,
          vy: Math.sin(angle) * player.bulletSpeed,
          life: 1.3,
        });
        player.fireTimer = player.fireRate;
        audio.ui();
      }

      for (let i = bullets.length - 1; i >= 0; i -= 1) {
        const bullet = bullets[i];
        bullet.life -= dt;
        if (bullet.life <= 0) {
          bullets.splice(i, 1);
          continue;
        }

        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;

        if (bullet.x < -10 || bullet.x > WIDTH + 10 || bullet.y < -10 || bullet.y > HEIGHT + 10) {
          bullets.splice(i, 1);
          continue;
        }

        for (let j = enemies.length - 1; j >= 0; j -= 1) {
          const enemy = enemies[j];
          if (!circleHitsCircle(enemy.x, enemy.y, enemy.radius, bullet.x, bullet.y, 3)) {
            continue;
          }

          bullets.splice(i, 1);
          enemy.hp -= player.damage;
          if (enemy.hp <= 0) {
            enemies.splice(j, 1);
            kills += 1;
            score += 40;
            orbs.push({ x: enemy.x, y: enemy.y, value: 22 });
            particles.burst({
              x: enemy.x,
              y: enemy.y,
              color: "#ff6f84",
              count: 16,
              minSpeed: 80,
              maxSpeed: 240,
              life: 0.5,
              size: 2.8,
            });
            audio.hit();
          }
          break;
        }
      }

      for (const enemy of enemies) {
        const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
        const speed = config.enemySpeed + timeSurvived * 0.45;
        enemy.vx = Math.cos(angle) * speed;
        enemy.vy = Math.sin(angle) * speed;
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;

        if (circleHitsCircle(enemy.x, enemy.y, enemy.radius, player.x, player.y, player.radius)) {
          player.hp -= 20 * dt;
          particles.burst({
            x: player.x,
            y: player.y,
            color: "#ffd166",
            count: 4,
            minSpeed: 40,
            maxSpeed: 120,
            life: 0.2,
            size: 2,
          });
        }
      }

      for (let i = orbs.length - 1; i >= 0; i -= 1) {
        const orb = orbs[i];
        const dx = player.x - orb.x;
        const dy = player.y - orb.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 110) {
          orb.x += (dx / Math.max(1, distance)) * 180 * dt;
          orb.y += (dy / Math.max(1, distance)) * 180 * dt;
        }

        if (distance < player.radius + 6) {
          xp += orb.value;
          score += 12;
          orbs.splice(i, 1);
        }
      }

      if (xp >= nextUpgradeXp) {
        xp -= nextUpgradeXp;
        nextUpgradeXp += 70;
        applyUpgrade();
      }

      if (player.hp <= 0) {
        finish();
        return;
      }

      score += dt * 24 + kills * dt * 2;
      particles.update(dt);
    };

    const draw = (): void => {
      ctx.fillStyle = "#070b19";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.strokeStyle = "rgba(83, 255, 233, 0.14)";
      for (let x = 0; x < WIDTH; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, HEIGHT);
        ctx.stroke();
      }

      ctx.fillStyle = "#ff6f87";
      for (const enemy of enemies) {
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "#f4fcff";
      for (const bullet of bullets) {
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "#79ff69";
      for (const orb of orbs) {
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = levelFlash > 0 ? "#ffe17e" : "#46fff0";
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
      ctx.fill();

      particles.render(ctx);

      ctx.fillStyle = "#dff8ff";
      ctx.font = "14px Rajdhani";
      ctx.fillText(`HP ${Math.max(0, player.hp).toFixed(0)} / ${player.maxHp}`, 16, 24);
      ctx.fillText(`Kills ${kills}`, 16, 42);
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

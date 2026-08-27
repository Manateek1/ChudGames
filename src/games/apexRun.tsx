import { useEffect, useRef } from "react";
import highwayUrl from "../assets/apex-highway.png";
import carUrl from "../assets/apex-car.png";
import { setupCanvas } from "../engine/canvas";
import { RollingFps, TARGET_FRAME_DELTA_SECONDS, shouldSkipFrame } from "../engine/fps";
import { clamp, randRange, seededRandom } from "../engine/math";
import type { GameComponentProps } from "../types/arcade";

interface Traffic { x: number; y: number; speed: number; color: string }

const WIDTH = 900;
const HEIGHT = 540;
const config = {
  easy: { pace: 190, traffic: 1.45, lives: 3 },
  normal: { pace: 225, traffic: 1.1, lives: 2 },
  hard: { pace: 260, traffic: 0.8, lives: 1 },
};

export const ApexRun = ({ difficulty, seed, paused, input, audio, onScore, onFps, onPauseToggle, onGameOver }: GameComponentProps): React.JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(paused);
  const endedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = setupCanvas(canvas, WIDTH, HEIGHT);
    const background = new Image(); background.src = highwayUrl;
    const playerImage = new Image(); playerImage.src = carUrl;
    const random = seededRandom(seed);
    const fps = new RollingFps();
    const tuning = config[difficulty];
    const traffic: Traffic[] = [];
    const player = { x: WIDTH / 2, y: HEIGHT - 116, vx: 0, boost: 1, lives: tuning.lives };
    let score = 0, distance = 0, timer = 0, flash = 0, previous = 0, raf = 0, uiTimer = 0;

    const finish = (): void => {
      if (endedRef.current) return;
      endedRef.current = true;
      onGameOver({ score: Math.round(score), won: false, stats: { distance: Math.round(distance), topSpeed: Math.round(tuning.pace * player.boost) } });
    };
    const spawn = (): void => {
      traffic.push({ x: randRange(215, 685, random), y: -90, speed: randRange(0.7, 1.1, random), color: ["#137ec4", "#ffc21d", "#f5f7fb", "#1d2736"][Math.floor(random() * 4)] });
    };
    const update = (dt: number): void => {
      if (input.consumePress("pause")) onPauseToggle();
      const steer = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
      const accelerate = input.isDown("up");
      const brake = input.isDown("down");
      player.boost = clamp(player.boost + ((accelerate ? 1 : brake ? -2 : -0.35) * dt), 0.42, 1.45);
      player.vx += steer * 720 * dt;
      player.vx *= 0.88;
      player.x = clamp(player.x + player.vx * dt, 220, 680);
      const speed = tuning.pace * player.boost;
      distance += speed * dt; score += speed * dt * 0.18;
      timer += dt;
      if (timer > tuning.traffic / Math.max(0.75, player.boost)) { timer = 0; spawn(); }
      for (let i = traffic.length - 1; i >= 0; i -= 1) {
        const car = traffic[i]; car.y += (speed * 0.76 + 115 * car.speed) * dt;
        if (Math.abs(car.x - player.x) < 57 && Math.abs(car.y - player.y) < 67) {
          traffic.splice(i, 1); player.lives -= 1; flash = 0.55; audio.explosion();
          if (player.lives <= 0) { finish(); return; }
          player.x = WIDTH / 2; player.vx = 0; player.boost = 0.55;
          continue;
        }
        if (car.y > HEIGHT + 100) { traffic.splice(i, 1); score += 65; audio.power(); }
      }
      flash = Math.max(0, flash - dt);
      uiTimer += dt; if (uiTimer > 0.16) { onScore(Math.round(score)); uiTimer = 0; }
    };
    const roadOverlay = (time: number): void => {
      ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = "#071226"; ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.globalAlpha = 0.78; ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 5;
      const scroll = (time * (0.15 + player.boost * 0.25)) % 78;
      for (let y = 255 - scroll; y < HEIGHT; y += 78) { const p = (y - 190) / 350; const half = 21 + p * 10; ctx.beginPath(); ctx.moveTo(WIDTH/2-half, y); ctx.lineTo(WIDTH/2+half, y); ctx.stroke(); }
      ctx.restore();
    };
    const drawTraffic = (car: Traffic): void => {
      const scale = clamp(0.33 + car.y / 800, 0.25, 0.85); const w = 80 * scale, h = 120 * scale;
      ctx.save(); ctx.translate(car.x, car.y); ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(-w*.5+6,h*.38,w-12,h*.18);
      ctx.fillStyle = car.color; ctx.beginPath(); ctx.roundRect(-w/2,-h/2,w,h,10*scale); ctx.fill();
      ctx.fillStyle = "#c9efff"; ctx.fillRect(-w*.29,-h*.3,w*.58,h*.24); ctx.fillStyle = "#ff3d3d"; ctx.fillRect(-w*.32,h*.29,w*.18,h*.1); ctx.fillRect(w*.14,h*.29,w*.18,h*.1); ctx.restore();
    };
    const draw = (time: number): void => {
      if (background.complete) ctx.drawImage(background, 0, 0, WIDTH, HEIGHT); else { ctx.fillStyle = "#587eb5"; ctx.fillRect(0,0,WIDTH,HEIGHT); }
      roadOverlay(time); traffic.forEach(drawTraffic);
      ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.vx / 155);
      ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 10;
      if (playerImage.complete) ctx.drawImage(playerImage, -70, -72, 140, 112); else { ctx.fillStyle = "#e63946"; ctx.fillRect(-34,-48,68,96); }
      ctx.restore();
      ctx.fillStyle = "rgba(4,11,23,.78)"; ctx.fillRect(22, 20, 204, 69); ctx.fillStyle = "#f7fbff"; ctx.font = "700 15px Inter, sans-serif"; ctx.fillText(`SPEED  ${Math.round(tuning.pace * player.boost)} km/h`, 38, 47); ctx.fillStyle = "#f5bd39"; ctx.fillRect(38, 60, 160 * player.boost / 1.45, 7); ctx.fillStyle = "#f7fbff"; ctx.fillText(`LIVES  ${"●".repeat(player.lives)}${"○".repeat(tuning.lives-player.lives)}`, 38, 81);
      ctx.textAlign = "right"; ctx.fillStyle = "rgba(4,11,23,.78)"; ctx.fillRect(684,20,194,69); ctx.fillStyle = "#f7fbff"; ctx.font = "700 15px Inter, sans-serif"; ctx.fillText(`DISTANCE  ${Math.floor(distance / 10)} m`, 862, 47); ctx.fillStyle = "#8de4ff"; ctx.fillText("WASD  DRIVE  •  P  PAUSE", 862, 76); ctx.textAlign = "left";
      if (flash > 0) { ctx.fillStyle = `rgba(255,66,56,${flash * .36})`; ctx.fillRect(0,0,WIDTH,HEIGHT); }
    };
    const loop = (now: number): void => { const dt = Math.min((now - previous) / 1000 || TARGET_FRAME_DELTA_SECONDS, TARGET_FRAME_DELTA_SECONDS * 2); const skip = shouldSkipFrame(now, previous); previous = now; if (!pausedRef.current && !endedRef.current && !skip) update(dt); draw(now); onFps(fps.next(now)); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [difficulty, seed, input, audio, onScore, onFps, onPauseToggle, onGameOver]);
  return <canvas ref={canvasRef} className="mx-auto block max-w-full rounded-[1rem]" aria-label="Apex Run racing game" />;
};

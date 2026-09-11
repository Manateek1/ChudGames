import type { GameDefinition, ThumbnailRenderer } from "../types/arcade";
import { AsteroidsPulse } from "./asteroidsPulse";
import { ApexRun } from "./apexRun";
import { BrickBreakerBlitz } from "./brickBreakerBlitz";
import { FortLite } from "./fortlite";
import { Game2048 } from "./game2048";
import { MemoryMatch } from "./memoryMatch";
import { NeonDodger } from "./neonDodger";
import { PongNeon } from "./pongNeon";
import { PrecisionRunner } from "./precisionRunner";
import { RhythmTap } from "./rhythmTap";
import { VoidSurvival } from "./voidSurvival";

const simpleBackground = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#090f27");
  gradient.addColorStop(1, "#111f4f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
};

const createThumbnail = (draw: ThumbnailRenderer): ThumbnailRenderer =>
  (ctx, elapsed, width, height) => {
    simpleBackground(ctx, width, height);
    draw(ctx, elapsed, width, height);
  };

const neonThumb = createThumbnail((ctx, elapsed, width, height) => {
  const t = elapsed * 0.002;
  ctx.strokeStyle = "rgba(78,255,238,0.24)";
  for (let x = -24; x < width + 24; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x + (t % 24), 0);
    ctx.lineTo(x + (t % 24), height);
    ctx.stroke();
  }

  ctx.fillStyle = "#ff6b84";
  ctx.fillRect(width * 0.25, height * 0.2 + Math.sin(t) * 8, 56, 56);
  ctx.fillStyle = "#50fff0";
  ctx.beginPath();
  ctx.arc(width * 0.68, height * 0.72, 16, 0, Math.PI * 2);
  ctx.fill();
});

const apexThumb = createThumbnail((ctx, elapsed, width, height) => {
  const t = elapsed * 0.0014;
  const horizon = height * 0.47;
  const roadY = height * 0.72;

  ctx.save();

  const sky = ctx.createLinearGradient(0, 0, 0, horizon + 20);
  sky.addColorStop(0, "#253845");
  sky.addColorStop(0.58, "#6d929b");
  sky.addColorStop(1, "#e6b779");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizon + 24);

  ctx.fillStyle = "rgba(247, 196, 121, 0.28)";
  ctx.beginPath();
  ctx.arc(width * 0.76, height * 0.27, height * 0.15, 0, Math.PI * 2);
  ctx.fill();

  const rearMountain = (offset: number, color: string, peak: number): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, horizon + 10);
    for (let x = 0; x <= width; x += 26) {
      const y = horizon - peak * (0.48 + 0.52 * Math.sin(x * 0.035 + offset));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, horizon + 10);
    ctx.closePath();
    ctx.fill();
  };

  rearMountain(0.9, "#677464", 42);
  rearMountain(2.5, "#4c5c58", 30);

  ctx.fillStyle = "#202d2e";
  ctx.beginPath();
  ctx.moveTo(0, horizon + 14);
  ctx.lineTo(width * 0.12, horizon - 18);
  ctx.lineTo(width * 0.22, horizon - 2);
  ctx.lineTo(width * 0.35, horizon - 38);
  ctx.lineTo(width * 0.48, horizon + 2);
  ctx.lineTo(width * 0.62, horizon - 26);
  ctx.lineTo(width * 0.78, horizon - 8);
  ctx.lineTo(width * 0.92, horizon - 30);
  ctx.lineTo(width, horizon + 12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#172126";
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(width * 0.38, roadY - 14);
  ctx.quadraticCurveTo(width * 0.49, roadY - 28, width * 0.59, roadY - 8);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(238, 218, 178, 0.82)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.39, roadY - 10);
  ctx.quadraticCurveTo(width * 0.5, roadY - 27, width * 0.61, roadY - 5);
  ctx.lineTo(width * 0.8, height);
  ctx.moveTo(width * 0.59, roadY - 5);
  ctx.quadraticCurveTo(width * 0.5, roadY - 27, width * 0.39, roadY - 10);
  ctx.lineTo(width * 0.1, height);
  ctx.stroke();

  ctx.setLineDash([11, 10]);
  ctx.strokeStyle = "rgba(245, 231, 199, 0.74)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, roadY - 18);
  ctx.lineTo(width * (0.5 + Math.sin(t) * 0.02), height);
  ctx.stroke();
  ctx.setLineDash([]);

  const drawTree = (x: number, y: number, scale: number): void => {
    ctx.fillStyle = "#283b34";
    ctx.fillRect(x - scale * 0.08, y, scale * 0.16, scale * 0.6);
    ctx.fillStyle = "#18332f";
    ctx.beginPath();
    ctx.moveTo(x, y - scale);
    ctx.lineTo(x - scale * 0.42, y + scale * 0.24);
    ctx.lineTo(x + scale * 0.42, y + scale * 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#285044";
    ctx.beginPath();
    ctx.moveTo(x, y - scale * 0.58);
    ctx.lineTo(x - scale * 0.34, y + scale * 0.48);
    ctx.lineTo(x + scale * 0.34, y + scale * 0.48);
    ctx.closePath();
    ctx.fill();
  };

  [
    [0.1, 0.56, 13], [0.19, 0.53, 10], [0.27, 0.57, 8],
    [0.72, 0.56, 10], [0.82, 0.51, 14], [0.94, 0.56, 9],
  ].forEach(([x, y, scale]) => drawTree(width * x, height * y, scale));

  ctx.save();
  ctx.translate(width * 0.5, height * 0.1);
  ctx.rotate(-0.035);
  ctx.fillStyle = "rgba(8, 15, 20, 0.9)";
  ctx.fillRect(-width * 0.64, -height * 0.12, width * 1.28, height * 0.16);
  ctx.fillStyle = "rgba(234, 220, 182, 0.9)";
  ctx.font = "700 13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("APEX RUN", 0, -height * 0.01);
  ctx.restore();

  const carX = width * (0.5 + Math.sin(t * 0.9) * 0.018);
  const carY = height * 0.74 + Math.sin(t * 2.1) * 1.2;
  ctx.save();
  ctx.translate(carX, carY);
  ctx.fillStyle = "#13181b";
  ctx.fillRect(-width * 0.075, 6, width * 0.03, 14);
  ctx.fillRect(width * 0.045, 6, width * 0.03, 14);
  ctx.fillStyle = "#c9362f";
  ctx.beginPath();
  ctx.moveTo(-width * 0.11, 10);
  ctx.lineTo(-width * 0.085, -5);
  ctx.lineTo(-width * 0.035, -13);
  ctx.lineTo(width * 0.055, -13);
  ctx.lineTo(width * 0.105, -4);
  ctx.lineTo(width * 0.125, 10);
  ctx.quadraticCurveTo(0, 18, -width * 0.11, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#253942";
  ctx.beginPath();
  ctx.moveTo(-width * 0.045, -10);
  ctx.lineTo(width * 0.045, -10);
  ctx.lineTo(width * 0.07, -2);
  ctx.lineTo(-width * 0.065, -2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f4e4c7";
  ctx.fillRect(-width * 0.102, 5, width * 0.035, 3);
  ctx.fillRect(width * 0.067, 5, width * 0.035, 3);
  ctx.restore();

  ctx.restore();
});

const asteroidThumb = createThumbnail((ctx, elapsed, width, height) => {
  const t = elapsed * 0.003;
  ctx.strokeStyle = "#ff7a9f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.28, height * 0.25);
  ctx.lineTo(width * 0.18, height * 0.55);
  ctx.lineTo(width * 0.3, height * 0.48);
  ctx.lineTo(width * 0.4, height * 0.55);
  ctx.closePath();
  ctx.stroke();

  ctx.strokeStyle = "#4affef";
  ctx.beginPath();
  ctx.arc(width * 0.72, height * 0.5, 30 + Math.sin(t) * 4, 0, Math.PI * 2);
  ctx.stroke();
});

const brickThumb = createThumbnail((ctx, elapsed, width, height) => {
  const t = elapsed * 0.002;
  ctx.fillStyle = "#4efff0";
  ctx.fillRect(width * 0.4 + Math.sin(t) * 20, height * 0.78, 92, 12);
  ctx.fillStyle = "#ffe16b";
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.66, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff6785";
  for (let i = 0; i < 4; i += 1) {
    ctx.fillRect(width * 0.2 + i * 42, height * 0.28, 32, 14);
  }
});

const survivalThumb = createThumbnail((ctx, elapsed, width, height) => {
  const t = elapsed * 0.003;
  ctx.fillStyle = "#54fff2";
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.5, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff6b83";
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI * 2 * i) / 6 + t;
    ctx.beginPath();
    ctx.arc(width * 0.5 + Math.cos(angle) * 60, height * 0.5 + Math.sin(angle) * 40, 10, 0, Math.PI * 2);
    ctx.fill();
  }
});

const rhythmThumb = createThumbnail((ctx, elapsed, width, height) => {
  const t = elapsed * 0.001;
  const lane = width / 4;
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "#101a3f" : "#0d1434";
    ctx.fillRect(i * lane, 0, lane, height);
  }
  ctx.fillStyle = "#4efff0";
  ctx.fillRect(0, height - 34, width, 4);
  for (let i = 0; i < 4; i += 1) {
    ctx.fillStyle = "#ff8d61";
    const y = (height - 40) - ((t * 180 + i * 40) % (height - 60));
    ctx.fillRect(i * lane + 10, y, lane - 20, 12);
  }
});

const runnerThumb = createThumbnail((ctx, elapsed, width, height) => {
  const t = elapsed * 0.005;
  ctx.fillStyle = "#14203f";
  ctx.fillRect(0, height * 0.75, width, height * 0.25);
  ctx.fillStyle = "#4dfff1";
  ctx.fillRect(width * 0.18, height * 0.58 - Math.abs(Math.sin(t)) * 22, 18, 34);
  ctx.fillStyle = "#ff6e89";
  ctx.fillRect(width * 0.7, height * 0.62, 24, 30);
});

const gridThumb = createThumbnail((ctx, elapsed, width, height) => {
  const t = elapsed * 0.002;
  const size = 4;
  const pad = 16;
  const cell = (height - pad * 2) / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      ctx.fillStyle = "#1a2756";
      ctx.fillRect(pad + x * cell, pad + y * cell, cell - 4, cell - 4);
    }
  }
  ctx.fillStyle = "#ffbc5e";
  ctx.fillRect(pad + ((Math.floor(t) % 4) * cell), pad + cell, cell - 4, cell - 4);
  ctx.fillStyle = "#4dfff1";
  ctx.fillRect(pad + cell * 2, pad + cell * 2, cell - 4, cell - 4);
});

const memoryThumb = createThumbnail((ctx, elapsed, width, height) => {
  const t = Math.floor(elapsed * 0.003);
  const cols = 4;
  const rows = 3;
  const gap = 8;
  const cardW = (width - gap * (cols + 1)) / cols;
  const cardH = (height - gap * (rows + 1)) / rows;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const index = y * cols + x;
      const faceUp = index % 5 === t % 5;
      ctx.fillStyle = faceUp ? "#55fff1" : "#1a2756";
      ctx.fillRect(gap + x * (cardW + gap), gap + y * (cardH + gap), cardW, cardH);
    }
  }
});

const pongThumb = createThumbnail((ctx, elapsed, width, height) => {
  const t = elapsed * 0.002;
  ctx.fillStyle = "#4efff0";
  ctx.fillRect(20, height * 0.35 + Math.sin(t) * 22, 10, 56);
  ctx.fillStyle = "#ffb866";
  ctx.fillRect(width - 30, height * 0.45 + Math.cos(t * 1.2) * 22, 10, 56);
  ctx.fillStyle = "#f4fbff";
  ctx.beginPath();
  ctx.arc(width * 0.5 + Math.sin(t * 2) * 70, height * 0.52, 7, 0, Math.PI * 2);
  ctx.fill();
});

const fortLiteThumb = createThumbnail((ctx, elapsed, width, height) => {
  const t = elapsed * 0.0012;

  ctx.save();

  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#9bdcff");
  sky.addColorStop(0.54, "#e5e5d5");
  sky.addColorStop(1, "#8db9c8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255, 224, 158, 0.24)";
  ctx.beginPath();
  ctx.arc(width * 0.16, height * 0.16, height * 0.16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(89, 170, 198, 0.46)";
  ctx.fillRect(0, height * 0.69, width, height * 0.31);
  ctx.fillStyle = "rgba(245, 248, 236, 0.28)";
  ctx.beginPath();
  ctx.moveTo(0, height * 0.72);
  ctx.quadraticCurveTo(width * 0.32, height * 0.68, width * 0.56, height * 0.73);
  ctx.quadraticCurveTo(width * 0.8, height * 0.78, width, height * 0.69);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.translate(width * 0.5, height * 0.8);
  ctx.rotate(Math.sin(t * 0.8) * 0.025);
  ctx.scale(1.2, 0.46);
  ctx.fillStyle = "#d6bf84";
  ctx.beginPath();
  ctx.moveTo(-width * 0.4, 0);
  ctx.lineTo(-width * 0.26, -height * 0.34);
  ctx.lineTo(-width * 0.02, -height * 0.44);
  ctx.lineTo(width * 0.24, -height * 0.33);
  ctx.lineTo(width * 0.42, -height * 0.05);
  ctx.lineTo(width * 0.29, height * 0.22);
  ctx.lineTo(-width * 0.18, height * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#6f9b63";
  ctx.beginPath();
  ctx.moveTo(-width * 0.28, -height * 0.18);
  ctx.lineTo(-width * 0.04, -height * 0.42);
  ctx.lineTo(width * 0.2, -height * 0.27);
  ctx.lineTo(width * 0.24, 0);
  ctx.lineTo(-width * 0.12, height * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#4d7b56";
  ctx.beginPath();
  ctx.moveTo(-width * 0.13, -height * 0.26);
  ctx.lineTo(width * 0.08, -height * 0.16);
  ctx.lineTo(width * 0.17, height * 0.05);
  ctx.lineTo(-width * 0.08, height * 0.13);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#bd9a66";
  ctx.fillRect(-width * 0.02, -height * 0.1, width * 0.09, height * 0.1);
  ctx.fillRect(width * 0.12, -height * 0.05, width * 0.05, height * 0.06);
  ctx.restore();

  const drawTinyParachute = (x: number, y: number, scale: number): void => {
    ctx.fillStyle = "rgba(74, 163, 174, 0.58)";
    ctx.beginPath();
    ctx.arc(x, y, scale, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x - scale * 0.7, y);
    ctx.lineTo(x, y + scale * 2.2);
    ctx.lineTo(x + scale * 0.7, y);
    ctx.stroke();
  };
  drawTinyParachute(width * 0.17, height * 0.54, 4);
  drawTinyParachute(width * 0.83, height * 0.56, 3.5);

  const canopyX = width * (0.5 + Math.sin(t) * 0.018);
  const canopyY = height * 0.31 + Math.sin(t * 1.6) * 1.4;
  ctx.fillStyle = "#31c6a7";
  ctx.beginPath();
  ctx.moveTo(canopyX - width * 0.22, canopyY + height * 0.06);
  ctx.quadraticCurveTo(canopyX - width * 0.17, canopyY - height * 0.15, canopyX, canopyY - height * 0.16);
  ctx.quadraticCurveTo(canopyX + width * 0.17, canopyY - height * 0.15, canopyX + width * 0.22, canopyY + height * 0.06);
  ctx.quadraticCurveTo(canopyX, canopyY + height * 0.17, canopyX - width * 0.22, canopyY + height * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(157, 255, 224, 0.42)";
  ctx.beginPath();
  ctx.moveTo(canopyX - width * 0.17, canopyY + height * 0.02);
  ctx.quadraticCurveTo(canopyX - width * 0.12, canopyY - height * 0.11, canopyX, canopyY - height * 0.13);
  ctx.quadraticCurveTo(canopyX + width * 0.12, canopyY - height * 0.11, canopyX + width * 0.17, canopyY + height * 0.02);
  ctx.quadraticCurveTo(canopyX, canopyY + height * 0.08, canopyX - width * 0.17, canopyY + height * 0.02);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(canopyX - width * 0.17, canopyY + height * 0.04);
  ctx.lineTo(width * 0.47, height * 0.75);
  ctx.moveTo(canopyX + width * 0.17, canopyY + height * 0.04);
  ctx.lineTo(width * 0.53, height * 0.75);
  ctx.stroke();

  ctx.fillStyle = "#e7c690";
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.76, width * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1e9d9d";
  ctx.fillRect(width * 0.47, height * 0.78, width * 0.06, height * 0.13);
  ctx.fillStyle = "#172d37";
  ctx.fillRect(width * 0.467, height * 0.89, width * 0.025, height * 0.08);
  ctx.fillRect(width * 0.508, height * 0.89, width * 0.025, height * 0.08);

  ctx.fillStyle = "rgba(20, 45, 50, 0.7)";
  ctx.fillRect(width * 0.04, height * 0.05, width * 0.22, height * 0.06);
  ctx.fillStyle = "rgba(245, 255, 246, 0.92)";
  ctx.font = "700 9px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("FORTLITE", width * 0.055, height * 0.09);

  ctx.restore();
});

export const gameRegistry: GameDefinition[] = [
  {
    id: "apex-run", title: "Apex Run", genre: "action",
    shortDescription: "Chase your perfect lap through a golden-hour mountain pass.",
    description: "Take the original Solstice GT through an alpine circuit of climbing bends, a lakeside viaduct, and a covered mountain gallery. Beat eight sectors, save your best lap, and race your own ghost. Sculpted bodywork, cinematic cameras, and responsive simcade handling bring Solstice Pass to life.",
    controls: ["Accelerate: W / Up", "Brake / Reverse: S / Down", "Steer: A / D or Left / Right", "Handbrake: Space", "Camera: C · Recover: R (+3 sec)", "Pause / Resume: Esc / P", "Gamepad: left stick, RT / LT, A handbrake"],
    tutorial: ["Brake before corners, steer toward the apex, then ease onto the throttle.", "Pass eight sectors in order to set a lap. Your best run becomes a ghost.", "Use R to recover to the last sector with a three-second penalty. Graphics and paint are adjustable in the game menu."],
    tags: ["time-attack", "racing", "cars", "3d", "ghost"], difficulties: ["normal"], usesCanvas: true, isNew: true, thumbnail: apexThumb, component: ApexRun,
  },
  {
    id: "neon-dodger",
    title: "Neon Dodger",
    genre: "action",
    shortDescription: "Dodge accelerating obstacles in a neon storm.",
    description: "High-speed survival with pickups, escalating tempo, and precise movement.",
    controls: ["Move: Arrow Keys / WASD", "Pause: Esc / P", "Mobile: virtual d-pad"],
    tutorial: [
      "Stay alive as long as possible while obstacle speed ramps every few seconds.",
      "Collect yellow cores for score spikes and particle bursts.",
      "Near misses are tempting, but collisions end the run instantly.",
    ],
    tags: ["survival", "neon", "dodge"],
    difficulties: ["easy", "normal", "hard"],
    usesCanvas: true,
    isNew: true,
    thumbnail: neonThumb,
    component: NeonDodger,
  },
  {
    id: "asteroids-pulse",
    title: "Asteroids Pulse",
    genre: "action",
    shortDescription: "Vector ship combat with splits, wraps, and lives.",
    description: "Rotate, thrust, and blast asteroid clusters before they overwhelm your hull.",
    controls: ["Rotate: Left/Right", "Thrust: Up", "Shoot: Space/Enter", "Brake: Down"],
    tutorial: [
      "Destroy large asteroids to split them into faster fragments.",
      "Keep momentum; your ship drifts and wraps across screen edges.",
      "You only have a few lives, so avoid direct collisions.",
    ],
    tags: ["spaceship", "arcade", "shoot"],
    difficulties: ["easy", "normal", "hard"],
    usesCanvas: true,
    thumbnail: asteroidThumb,
    component: AsteroidsPulse,
  },
  {
    id: "brick-breaker-blitz",
    title: "Brick Breaker Blitz",
    genre: "action",
    shortDescription: "Multi-level brick breaker with powerups.",
    description: "Clear layered brick fields while collecting wide paddle, slow-ball, and multi-ball boosts.",
    controls: ["Move Paddle: Left/Right", "Pause: Esc / P", "Mobile: d-pad"],
    tutorial: [
      "Break all bricks to advance levels and claim bonus points.",
      "Catch falling powerups to alter paddle and ball behavior.",
      "Lose all reserve balls and the run ends.",
    ],
    tags: ["paddle", "powerups", "levels"],
    difficulties: ["easy", "normal", "hard"],
    usesCanvas: true,
    thumbnail: brickThumb,
    component: BrickBreakerBlitz,
  },
  {
    id: "fortlite",
    title: "FortLite",
    genre: "action",
    shortDescription: "Offline battle royale with bots, building, and third-person combat.",
    description: "Drop into FortLite inside ChudGames, loot weapons, harvest materials, build cover, and outlast the bot lobby in solo or duos.",
    controls: [
      "Move: WASD",
      "Look / Aim: Mouse after clicking the arena",
      "Shoot / Harvest: Left Mouse",
      "Sprint: Left Shift, Jump: Space, Loot: Auto Pickup, Zoom: Hold Right Mouse or E",
      "Weapons: 1 Rifle, 2 Shotgun, 3 SMG",
      "Build: Q to enter/exit, Z wall, X floor, C ramp, R to rotate",
    ],
    tutorial: [
      "Click into the arena to capture the mouse, steer your drop, and fight in third-person until you aim with right click or E.",
      "Run through loot to collect weapons and ammo automatically, then harvest materials so you can build under pressure.",
      "Stay ahead of the storm and be the last player or last duo alive to win the match.",
    ],
    tags: ["battle-royale", "third-person", "building"],
    difficulties: ["normal"],
    modes: [
      {
        id: "solo",
        label: "Solo",
        description: "Classic every-player-for-themselves FortLite."
      },
      {
        id: "duos",
        label: "Duos",
        description: "25 teams of two with double floor-loot spawns."
      }
    ],
    defaultMode: "solo",
    isAvailable: true,
    usesCanvas: false,
    isNew: true,
    thumbnail: fortLiteThumb,
    component: FortLite,
  },
  {
    id: "void-survival",
    title: "Void Survival",
    genre: "action",
    shortDescription: "Top-down wave survival with auto-upgrades.",
    description: "Kite enemies, gather XP, and evolve your build in real time to survive longer waves.",
    controls: ["Move: Arrow Keys / WASD", "Auto-fire at nearest enemy", "Pause: Esc / P"],
    tutorial: [
      "Stay mobile while enemies scale in speed and health.",
      "Collect green orbs for XP and random upgrades.",
      "Your health drains on contact, so spacing is everything.",
    ],
    tags: ["waves", "survival", "upgrades"],
    difficulties: ["easy", "normal", "hard"],
    usesCanvas: true,
    thumbnail: survivalThumb,
    component: VoidSurvival,
  },
  {
    id: "rhythm-tap",
    title: "Rhythm Tap",
    genre: "reflex",
    shortDescription: "Hit notes on-time and build huge combos.",
    description: "A lane-based timing challenge with perfect/good windows and combo pressure.",
    controls: ["Keys: D F J K", "Tap lanes on mobile", "Pause: Esc"],
    tutorial: [
      "Tap notes when they reach the hit line.",
      "Perfect timing boosts score and combo growth.",
      "Missed notes reset combo and reduce accuracy.",
    ],
    tags: ["timing", "combo", "music"],
    difficulties: ["easy", "normal", "hard"],
    usesCanvas: true,
    thumbnail: rhythmThumb,
    component: RhythmTap,
  },
  {
    id: "precision-runner",
    title: "Precision Runner",
    genre: "reflex",
    shortDescription: "One-button jumps with streak pressure.",
    description: "Thread tight obstacle gaps, maintain streak chains, and chase higher speed tiers.",
    controls: ["Jump: Space / Up", "Pause: Esc", "Mobile: Action button"],
    tutorial: [
      "Your runner auto-sprints; only jump timing matters.",
      "Each obstacle cleared extends your streak multiplier.",
      "One collision ends the run, so read distance not panic.",
    ],
    tags: ["runner", "timing", "streak"],
    difficulties: ["easy", "normal", "hard"],
    usesCanvas: true,
    thumbnail: runnerThumb,
    component: PrecisionRunner,
  },
  {
    id: "game-2048",
    title: "Fusion 2048",
    genre: "puzzle",
    shortDescription: "Swipe and merge tiles into huge values.",
    description: "A polished 2048-style board with keyboard/swipe controls and progression targets.",
    controls: ["Move: Arrow Keys / WASD", "Swipe on mobile", "Pause: Esc"],
    tutorial: [
      "Slide all tiles in one direction each move.",
      "Equal tiles merge into bigger values when they collide.",
      "Keep open spaces or the board locks up quickly.",
    ],
    tags: ["merge", "strategy", "numbers"],
    difficulties: ["easy", "normal", "hard"],
    usesCanvas: false,
    thumbnail: gridThumb,
    component: Game2048,
  },
  {
    id: "memory-match",
    title: "Memory Match",
    genre: "puzzle",
    shortDescription: "Timed card matching with combo bonus.",
    description: "Flip, memorize, and chain matches quickly to maximize your end-run bonus.",
    controls: ["Tap cards to reveal", "Match all pairs before timer runs out", "Pause: Esc"],
    tutorial: [
      "Reveal two cards and remember symbol locations.",
      "Consecutive matches increase combo scoring.",
      "Beat the timer for a bonus and confetti finish.",
    ],
    tags: ["memory", "timer", "match"],
    difficulties: ["easy", "normal", "hard"],
    usesCanvas: false,
    thumbnail: memoryThumb,
    component: MemoryMatch,
  },
  {
    id: "pong-neon",
    title: "Pong Neon",
    genre: "action",
    shortDescription: "Classic pong with single-player and local versus.",
    description: "Play against adaptive AI or switch to local duel mode for two-player battles.",
    controls: [
      "Single: W/S or Up/Down (left paddle)",
      "Duel: P1 W/S, P2 ArrowUp/ArrowDown",
      "Mobile Duel: P1 Up/Down + P2 Up/Down buttons",
    ],
    tutorial: [
      "In single-player mode, the right paddle is AI-controlled.",
      "In duel mode, both paddles are player-controlled on the same device.",
      "First to 7 points wins the match.",
    ],
    tags: ["pong", "duel", "classic"],
    difficulties: ["easy", "normal", "hard"],
    modes: [
      {
        id: "single",
        label: "Single Player",
        description: "Play against AI.",
      },
      {
        id: "duel",
        label: "Two Player",
        description: "Local versus on one screen.",
      },
    ],
    defaultMode: "single",
    usesCanvas: true,
    isNew: true,
    thumbnail: pongThumb,
    component: PongNeon,
  },
];

export const gameMap = new Map(gameRegistry.map((game) => [game.id, game]));

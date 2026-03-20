import type { GameDefinition, ThumbnailRenderer } from "../types/arcade";
import { AsteroidsPulse } from "./asteroidsPulse";
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
  const t = elapsed * 0.0016;
  const horizon = height * 0.62;

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#86d7ff");
  sky.addColorStop(1, "#1d3d5d");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizon);

  const ground = ctx.createLinearGradient(0, horizon, 0, height);
  ground.addColorStop(0, "#446f3b");
  ground.addColorStop(1, "#20341f");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, width, height - horizon);

  ctx.fillStyle = "rgba(255, 202, 120, 0.18)";
  ctx.beginPath();
  ctx.arc(width * 0.16, height * 0.18, 44, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(81, 224, 255, 0.75)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(width * 0.7, horizon + 12, 42 + Math.sin(t) * 6, Math.PI, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#7f6b54";
  ctx.fillRect(width * 0.28, horizon - 28, 54, 28);
  ctx.fillRect(width * 0.62, horizon - 40, 42, 40);

  ctx.fillStyle = "#b49a7d";
  ctx.fillRect(width * 0.52, horizon - 56, 14, 56);
  ctx.fillRect(width * 0.48, horizon - 12, 72, 12);

  ctx.strokeStyle = "rgba(255, 246, 234, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.5 - 12, height * 0.48);
  ctx.lineTo(width * 0.5 + 12, height * 0.48);
  ctx.moveTo(width * 0.5, height * 0.48 - 12);
  ctx.lineTo(width * 0.5, height * 0.48 + 12);
  ctx.stroke();
});

export const gameRegistry: GameDefinition[] = [
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
        description: "40 teams of two with double floor-loot spawns."
      }
    ],
    defaultMode: "solo",
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

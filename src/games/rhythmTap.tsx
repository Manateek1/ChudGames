import { useEffect, useRef } from "react";
import { setupCanvas } from "../engine/canvas";
import { RollingFps, TARGET_FRAME_DELTA_SECONDS, shouldSkipFrame } from "../engine/fps";
import { seededRandom } from "../engine/math";
import type { GameComponentProps } from "../types/arcade";

interface Note {
  lane: number;
  time: number;
  judged: boolean;
  hit: boolean;
}

const WIDTH = 900;
const HEIGHT = 540;
const LANE_COUNT = 4;
const HIT_Y = HEIGHT - 96;
const TRAVEL_TIME = 1.8;

const difficultyConfig = {
  easy: { bpm: 96, density: 0.82, length: 42 },
  normal: { bpm: 118, density: 0.9, length: 50 },
  hard: { bpm: 136, density: 0.98, length: 58 },
};

export const RhythmTap = ({
  difficulty,
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

    const beat = 60 / config.bpm;
    const notes: Note[] = [];
    for (let time = 1.2; time < config.length; time += beat) {
      if (random() <= config.density) {
        notes.push({
          lane: Math.floor(random() * LANE_COUNT),
          time,
          judged: false,
          hit: false,
        });
      }
    }

    let currentTime = 0;
    let combo = 0;
    let maxCombo = 0;
    let score = 0;
    let misses = 0;
    let uiTimer = 0;
    let comboGlow = 0;
    let raf = 0;

    const judgeWindow = 0.15;

    const handleInputLane = (lane: number): void => {
      if (endedRef.current) {
        return;
      }

      let closest: Note | undefined;
      let closestDelta = Number.POSITIVE_INFINITY;

      for (const note of notes) {
        if (note.judged || note.lane !== lane) {
          continue;
        }
        const delta = Math.abs(note.time - currentTime);
        if (delta < closestDelta) {
          closestDelta = delta;
          closest = note;
        }
      }

      if (!closest || closestDelta > judgeWindow) {
        combo = 0;
        misses += 1;
        audio.hit();
        return;
      }

      closest.judged = true;
      closest.hit = true;
      combo += 1;
      maxCombo = Math.max(maxCombo, combo);
      comboGlow = 1;

      if (closestDelta <= 0.06) {
        score += 180 + combo * 3;
      } else {
        score += 110 + combo * 2;
      }
      audio.ui();
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (key === "d") {
        handleInputLane(0);
      } else if (key === "f") {
        handleInputLane(1);
      } else if (key === "j") {
        handleInputLane(2);
      } else if (key === "k") {
        handleInputLane(3);
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const laneWidth = rect.width / LANE_COUNT;
      const lane = Math.max(0, Math.min(LANE_COUNT - 1, Math.floor(x / laneWidth)));
      handleInputLane(lane);
    };

    window.addEventListener("keydown", onKeyDown);
    canvas.addEventListener("pointerdown", onPointerDown);

    const finish = (): void => {
      if (endedRef.current) {
        return;
      }

      endedRef.current = true;
      const hitCount = notes.filter((note) => note.hit).length;
      const accuracy = notes.length > 0 ? hitCount / notes.length : 0;
      onGameOver({
        score: Math.round(score),
        won: accuracy > 0.65,
        stats: {
          combo: maxCombo,
          misses,
        },
      });
    };

    const update = (dt: number): void => {
      if (input.consumePress("pause")) {
        onPauseToggle();
      }

      currentTime += dt;
      comboGlow = Math.max(0, comboGlow - dt * 2);

      for (const note of notes) {
        if (!note.judged && currentTime - note.time > judgeWindow) {
          note.judged = true;
          combo = 0;
          misses += 1;
        }
      }

      if (currentTime > config.length + 1 || notes.every((note) => note.judged && currentTime > note.time + 0.2)) {
        finish();
      }
    };

    const draw = (): void => {
      ctx.fillStyle = "#070916";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const laneWidth = WIDTH / LANE_COUNT;
      for (let lane = 0; lane < LANE_COUNT; lane += 1) {
        ctx.fillStyle = lane % 2 === 0 ? "#0e1633" : "#0b1228";
        ctx.fillRect(lane * laneWidth, 0, laneWidth, HEIGHT);
      }

      ctx.strokeStyle = "rgba(80,255,238,0.22)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, HIT_Y);
      ctx.lineTo(WIDTH, HIT_Y);
      ctx.stroke();

      for (const note of notes) {
        if (note.judged && !note.hit) {
          continue;
        }
        const laneCenter = note.lane * laneWidth + laneWidth * 0.5;
        const progress = (note.time - currentTime) / TRAVEL_TIME;
        const y = HIT_Y - (1 - progress) * (HIT_Y - 40);

        if (y < -30 || y > HEIGHT + 30) {
          continue;
        }

        ctx.fillStyle = note.hit ? "#8cff9a" : "#4cfff0";
        ctx.shadowColor = note.hit ? "#8cff9a" : "#4cfff0";
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.roundRect(laneCenter - 48, y - 14, 96, 24, 8);
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      ctx.fillStyle = comboGlow > 0 ? "#ffe765" : "#dff8ff";
      ctx.font = "22px Orbitron";
      ctx.fillText(`COMBO ${combo}`, 20, 36);
      ctx.font = "14px Rajdhani";
      ctx.fillStyle = "#dff8ff";
      ctx.fillText(`Misses ${misses}`, 20, 58);
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
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  }, [difficulty, seed, input, audio, onScore, onFps, onPauseToggle, onGameOver]);

  return <canvas ref={canvasRef} className="mx-auto w-full max-w-[900px] rounded-xl" />;
};

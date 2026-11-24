import { GameThumbnail } from "./GameThumbnail";
import { apexCourses, getApexCourse } from "../games/apex/courses";
import { formatTime, loadBest } from "../games/apex/race";
import { loadApexSettings } from "../games/apex/settings";
import { getApexCar } from "../games/apex/vehicles";
import type { Difficulty, GameDefinition } from "../types/arcade";
import "./GameDetail.css";

interface GameDetailProps {
  game: GameDefinition;
  difficulty: Difficulty;
  mode: string;
  bestScore: number;
  ebtBucks: number;
  reducedMotion: boolean;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onModeChange: (mode: string) => void;
  onStart: () => void;
  onBack: () => void;
}

const apexControls = [
  ["W / ↑", "Accelerate"],
  ["S / ↓", "Brake or reverse"],
  ["A D / ← →", "Steer"],
  ["Space", "Handbrake"],
  ["C", "Change camera"],
  ["R", "Recover (+3 sec) · Double-tap to restart"],
  ["Esc", "Return to course menu"],
  ["P", "Pause or resume"],
  ["Gamepad", "Left stick · RT / LT · A handbrake"],
];

const fortLiteControls = [
  ["W A S D", "Move or steer your parachute"],
  ["Mouse", "Look and aim after clicking the arena"],
  ["Left click", "Shoot or harvest"],
  ["Hold right click / E", "Aim down sights"],
  ["Shift / Space", "Sprint / Jump"],
  ["1 2 3", "Rifle / Shotgun / SMG"],
  ["Q · Z X C · R", "Build mode · Wall, floor, ramp · Rotate"],
];

export function GameDetail({
  game, difficulty, mode, bestScore, ebtBucks, reducedMotion,
  onDifficultyChange, onModeChange, onStart, onBack,
}: GameDetailProps): React.JSX.Element {
  const fortLite = game.id === "fortlite";
  const course = game.id === "apex-run" ? getApexCourse(mode) : null;
  const car = course ? getApexCar(loadApexSettings("low", false).carId) : null;
  const best = course && loadBest(difficulty, course.version, car?.id);
  const available = game.isAvailable !== false;
  const controls = course ? apexControls : fortLite ? fortLiteControls : null;

  return (
    <section className="game-launch" aria-labelledby="game-launch-title">
      <button type="button" className="game-launch-back" onClick={onBack}>
        <span aria-hidden="true">←</span> Back to games
      </button>

      <div className={`game-launch-hero${typeof game.thumbnail === "string" ? "" : " game-launch-hero-compact"}`}>
        <GameThumbnail renderer={course?.image ?? game.thumbnail} reducedMotion={reducedMotion} />
        <div className="game-launch-intro">
          <div>
            <h1 id="game-launch-title">{game.title}</h1>
            <p>{game.description}</p>
          </div>
          <button type="button" className="arcade-btn-primary game-launch-start" onClick={onStart} disabled={!available}>
            {available ? (course ? "Start race" : fortLite ? "Start match" : "Start game") : "Temporarily unavailable"}
            {available && <span aria-hidden="true">→</span>}
          </button>
        </div>
      </div>

      <div className="game-launch-panels">
        <section className="game-launch-panel" aria-labelledby="game-launch-options">
          <h2 id="game-launch-options">{course ? "Choose a course" : game.modes?.length ? "Match mode" : "Game setup"}</h2>
          {course ? (
            <div className="game-launch-courses" role="group" aria-label="Course">
              {apexCourses.map((option) => (
                <button type="button" key={option.id} aria-pressed={option.id === course.id} className="game-launch-option game-launch-course"
                  onClick={() => onModeChange(option.id)}>
                  <GameThumbnail renderer={option.image} reducedMotion={reducedMotion} />
                  <span><strong>{option.label}</strong><small>{option.description}</small></span>
                </button>
              ))}
            </div>
          ) : (
            <>
              {game.modes && (
                <div className="game-launch-modes" role="group" aria-label="Match mode">
                  {game.modes.map((option) => (
                    <button type="button" key={option.id} aria-pressed={option.id === mode} className="game-launch-option"
                      onClick={() => onModeChange(option.id)}>
                      <strong>{option.label}</strong><small>{option.description}</small>
                    </button>
                  ))}
                </div>
              )}
              {game.difficulties.length > 1 && (
                <div className="game-launch-difficulties" role="group" aria-label="Difficulty">
                  {game.difficulties.map((option) => (
                    <button type="button" key={option} aria-pressed={option === difficulty} className="game-launch-option"
                      onClick={() => onDifficultyChange(option)}>{option}</button>
                  ))}
                </div>
              )}
              <dl className="game-launch-stats">
                <div><dt>{fortLite ? "Wins" : "Personal best"}</dt><dd>{bestScore.toLocaleString()}</dd></div>
                <div><dt>EBT Bucks</dt><dd>{ebtBucks.toLocaleString()}</dd></div>
              </dl>
            </>
          )}
        </section>

        <section className="game-launch-panel game-launch-controls" aria-labelledby="game-launch-controls">
          <h2 id="game-launch-controls">Controls</h2>
          {controls ? (
            <dl>
              {controls.map(([keys, action]) => <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>)}
            </dl>
          ) : <ul>{game.controls.map((item) => <li key={item}>{item}</li>)}</ul>}
          {course && (
            <div className="game-launch-record">
              <h3>Course best</h3>
              <p><span>{car?.name}</span><strong>{best ? formatTime(best.time) : "No lap yet"}</strong></p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

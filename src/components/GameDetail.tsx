import { GameThumbnail } from "./GameThumbnail";
import type { Difficulty, GameDefinition } from "../types/arcade";

interface GameDetailProps {
  game: GameDefinition;
  difficulty: Difficulty;
  mode: string;
  bestScore: number;
  daily: boolean;
  reducedMotion: boolean;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onModeChange: (mode: string) => void;
  onStart: () => void;
  onBack: () => void;
}

export const GameDetail = ({
  game,
  difficulty,
  mode,
  bestScore,
  daily,
  reducedMotion,
  onDifficultyChange,
  onModeChange,
  onStart,
  onBack,
}: GameDetailProps): React.JSX.Element => {
  const isFortlite = game.id === "fortlite";

  return (
    <section className="grid gap-6 lg:grid-cols-[1.1fr,1fr]">
      <article className="rounded-3xl border border-sky-300/55 bg-white/80 p-4 shadow-[0_22px_50px_-34px_rgba(53,169,223,0.42)]">
        <GameThumbnail renderer={game.thumbnail} reducedMotion={reducedMotion} />
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <p className="arcade-kicker">{game.genre} cabinet</p>
            <h2 className="font-display text-3xl text-sky-950">{game.title}</h2>
          </div>
          {daily && <span className="rounded-full bg-lime-300 px-3 py-1 text-xs font-semibold text-sky-950">Daily</span>}
        </div>
        <p className="mt-3 text-sky-800/85">{game.description}</p>

        <div className="mt-4 space-y-4 rounded-2xl border border-sky-300/50 bg-sky-50/80 p-4">
          <div>
            <p className="arcade-kicker">Difficulty</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {game.difficulties.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onDifficultyChange(option)}
                  className={`rounded-lg px-3 py-2 text-sm font-semibold uppercase tracking-[0.2em] ${
                    option === difficulty
                      ? "bg-sky-300 text-sky-950"
                      : "border border-sky-300/70 bg-white/75 text-sky-900"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {game.modes && game.modes.length > 0 && (
            <div>
              <p className="arcade-kicker">Mode</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {game.modes.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onModeChange(option.id)}
                    aria-label={option.description}
                    className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                      option.id === mode
                        ? "bg-lime-300 text-sky-950"
                        : "border border-lime-300/70 bg-white/75 text-lime-900"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-sky-300/55 bg-white/85 p-3">
            <p className="arcade-kicker">{isFortlite ? "Wins" : "Personal Best"}</p>
            <p className="font-display text-4xl text-sky-950">{bestScore}</p>
          </div>
        </div>
      </article>

      <article className="rounded-3xl border border-sky-300/55 bg-white/80 p-5 shadow-[0_22px_50px_-34px_rgba(53,169,223,0.42)]">
        <p className="arcade-kicker">Controls</p>
        <ul className="mt-2 space-y-2">
          {game.controls.map((item) => (
            <li key={item} className="rounded-lg border border-sky-300/50 bg-sky-50/85 px-3 py-2 text-sky-900">
              {item}
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap gap-3">
          <button type="button" onClick={onStart} className="arcade-btn-primary">
            Start Game
          </button>
          <button type="button" onClick={onBack} className="arcade-btn-secondary">
            Back
          </button>
        </div>
      </article>
    </section>
  );
};

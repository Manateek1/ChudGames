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
  const isFortLite = game.id === "fortlite";

  return (
    <section className="grid gap-6 lg:grid-cols-[1.1fr,1fr]">
      <article className="rounded-[1.9rem] border border-sky-200/24 bg-[rgba(7,18,34,0.82)] p-4 text-slate-50 shadow-[0_28px_60px_-38px_rgba(7,18,34,0.95)]">
        <GameThumbnail renderer={game.thumbnail} reducedMotion={reducedMotion} />
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <p className="arcade-kicker">{game.genre} cabinet</p>
            <h2 className="font-display text-3xl text-white">{game.title}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {isFortLite && <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-semibold text-slate-950">Main Feature</span>}
            {daily && <span className="rounded-full bg-sky-300 px-3 py-1 text-xs font-semibold text-slate-950">Daily</span>}
          </div>
        </div>
        <p className="mt-3 text-sky-50/80">{game.description}</p>

        <div className="mt-4 space-y-4 rounded-[1.5rem] border border-sky-100/12 bg-[rgba(255,255,255,0.05)] p-4">
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
                      ? "bg-sky-300 text-slate-950"
                      : "border border-sky-100/18 bg-white/5 text-sky-50"
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
                      ? "bg-amber-300 text-slate-950"
                      : "border border-amber-200/24 bg-white/5 text-amber-50"
                  }`}
                >
                  {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-sky-100/14 bg-[rgba(255,255,255,0.06)] p-3">
            <p className="arcade-kicker">{isFortLite ? "Wins" : "Personal Best"}</p>
            <p className="font-display text-4xl text-white">{bestScore}</p>
          </div>
        </div>
      </article>

      <article className="rounded-[1.9rem] border border-sky-200/24 bg-[rgba(7,18,34,0.82)] p-5 text-slate-50 shadow-[0_28px_60px_-38px_rgba(7,18,34,0.95)]">
        <p className="arcade-kicker">Controls</p>
        <ul className="mt-2 space-y-2">
          {game.controls.map((item) => (
            <li key={item} className="rounded-xl border border-sky-100/12 bg-[rgba(255,255,255,0.06)] px-3 py-2 text-sky-50/84">
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

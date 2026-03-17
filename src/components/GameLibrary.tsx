import { GameThumbnail } from "./GameThumbnail";
import type { GameDefinition, GameGenre } from "../types/arcade";

interface GameLibraryProps {
  games: GameDefinition[];
  search: string;
  setSearch: (value: string) => void;
  filter: GameGenre | "all";
  setFilter: (value: GameGenre | "all") => void;
  onOpen: (gameId: string) => void;
  reducedMotion: boolean;
  dailyGameId: string;
}

const filters: Array<{ value: GameGenre | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "action", label: "Action" },
  { value: "reflex", label: "Reflex" },
  { value: "puzzle", label: "Puzzle" },
];

export const GameLibrary = ({
  games,
  search,
  setSearch,
  filter,
  setFilter,
  onOpen,
  reducedMotion,
  dailyGameId,
}: GameLibraryProps): React.JSX.Element => (
  <section className="space-y-6">
    <div className="rounded-2xl border border-sky-300/55 bg-white/80 p-4 shadow-[0_20px_44px_-32px_rgba(60,170,220,0.45)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="w-full md:max-w-sm">
          <label htmlFor="game-search" className="sr-only">
            Search games
          </label>
          <input
            id="game-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search games, tags, controls"
            className="w-full rounded-lg border border-sky-300/60 bg-white/85 px-4 py-3 text-sky-950 placeholder:text-sky-700/40 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setFilter(item.value)}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                filter === item.value
                  ? "bg-lime-300 text-sky-950"
                  : "border border-sky-300/70 bg-white/60 text-sky-900"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {games.map((game) => (
        <article
          key={game.id}
          className="group rounded-2xl border border-sky-300/45 bg-white/80 p-3 shadow-[0_18px_36px_-24px_rgba(51,166,221,0.35)] transition duration-300 hover:-translate-y-1 hover:border-lime-400/70"
        >
          <div className="relative">
            <GameThumbnail renderer={game.thumbnail} reducedMotion={reducedMotion} />
            <div className="absolute left-2 top-2 flex gap-2">
              {game.isNew && (
                <span className="rounded-full bg-lime-300 px-2 py-1 text-[11px] font-bold text-sky-950">
                  NEW
                </span>
              )}
              {game.id === dailyGameId && (
                <span className="rounded-full bg-sky-300 px-2 py-1 text-[11px] font-bold text-sky-950">
                  DAILY
                </span>
              )}
            </div>
          </div>
          <div className="space-y-2 p-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl text-sky-950">{game.title}</h3>
              <span className="rounded-full border border-sky-300/60 bg-sky-50/70 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-sky-700/85">
                {game.genre}
              </span>
            </div>
            <p className="text-sm text-sky-800/85">{game.shortDescription}</p>
            <div className="flex flex-wrap gap-2">
              {game.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-lime-300/60 bg-lime-50/80 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-lime-800/90"
                >
                  {tag}
                </span>
              ))}
            </div>
            <button type="button" onClick={() => onOpen(game.id)} className="arcade-btn-primary mt-2 w-full">
              Open Cabinet
            </button>
          </div>
        </article>
      ))}
    </div>
  </section>
);

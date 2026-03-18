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
}: GameLibraryProps): React.JSX.Element => {
  const featuredGame = games.find((game) => game.id === "fortlite");
  const miniGames = games.filter((game) => game.id !== "fortlite");

  return (
    <section className="space-y-6">
      <div className="rounded-[1.6rem] border border-sky-200/28 bg-[rgba(7,18,34,0.78)] p-4 shadow-[0_24px_54px_-34px_rgba(7,18,34,0.96)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full md:max-w-sm">
            <label htmlFor="game-search" className="sr-only">
              Search games
            </label>
            <input
              id="game-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search FortLite or mini games"
              className="w-full rounded-xl border border-sky-100/18 bg-[rgba(255,255,255,0.08)] px-4 py-3 text-slate-50 placeholder:text-sky-100/38 focus:border-sky-200/42 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                  filter === item.value
                    ? "bg-amber-300 text-slate-950"
                    : "border border-sky-100/18 bg-[rgba(255,255,255,0.06)] text-sky-50"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {featuredGame && (
        <article className="group overflow-hidden rounded-[2rem] border border-sky-200/30 bg-[linear-gradient(140deg,rgba(8,20,38,0.96),rgba(18,39,66,0.92))] p-4 shadow-[0_36px_90px_-42px_rgba(7,18,34,0.96)]">
          <div className="grid gap-5 lg:grid-cols-[1.15fr,0.85fr]">
            <div className="relative">
              <GameThumbnail renderer={featuredGame.thumbnail} reducedMotion={reducedMotion} />
              <div className="absolute left-3 top-3 flex gap-2">
                <span className="rounded-full bg-amber-300 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-950">
                  Main Feature
                </span>
                {featuredGame.id === dailyGameId && (
                  <span className="rounded-full bg-sky-300 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-950">
                    Daily
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col justify-between gap-4 rounded-[1.6rem] border border-sky-100/12 bg-[rgba(255,255,255,0.05)] p-5 text-slate-50">
              <div className="space-y-3">
                <p className="arcade-kicker">Featured Drop</p>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-4xl text-white">{featuredGame.title}</h3>
                  <span className="rounded-full border border-emerald-200/24 bg-emerald-300/18 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
                    {featuredGame.genre}
                  </span>
                </div>
                <p className="text-base text-sky-50/82">{featuredGame.description}</p>
                <div className="flex flex-wrap gap-2">
                  {featuredGame.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-amber-200/20 bg-amber-300/12 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-amber-100"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => onOpen(featuredGame.id)} className="arcade-btn-primary">
                  Play FortLite
                </button>
                <span className="self-center text-sm text-sky-100/70">
                  Battle royale first. Mini games below.
                </span>
              </div>
            </div>
          </div>
        </article>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="arcade-kicker">Mini Games</p>
          <h3 className="font-display text-3xl text-slate-50">Side Cabinets</h3>
        </div>
        <span className="rounded-full border border-sky-100/16 bg-[rgba(255,255,255,0.06)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-sky-100/72">
          {miniGames.length} loaded
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {miniGames.map((game) => (
          <article
            key={game.id}
            className="group rounded-[1.6rem] border border-sky-200/18 bg-[rgba(7,18,34,0.8)] p-3 text-slate-50 shadow-[0_22px_48px_-30px_rgba(7,18,34,0.92)] transition duration-300 hover:-translate-y-1 hover:border-amber-200/36"
          >
            <div className="relative">
              <GameThumbnail renderer={game.thumbnail} reducedMotion={reducedMotion} />
              <div className="absolute left-2 top-2 flex gap-2">
                <span className="rounded-full bg-[rgba(7,18,34,0.82)] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-50">
                  Mini
                </span>
                {game.isNew && (
                  <span className="rounded-full bg-amber-300 px-2 py-1 text-[11px] font-bold text-slate-950">
                    NEW
                  </span>
                )}
                {game.id === dailyGameId && (
                  <span className="rounded-full bg-sky-300 px-2 py-1 text-[11px] font-bold text-slate-950">
                    DAILY
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-2 p-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-2xl text-white">{game.title}</h3>
                <span className="rounded-full border border-sky-100/16 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-sky-100/78">
                  {game.genre}
                </span>
              </div>
              <p className="text-sm text-sky-50/78">{game.shortDescription}</p>
              <div className="flex flex-wrap gap-2">
                {game.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-emerald-200/16 bg-emerald-300/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-emerald-100/84"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <button type="button" onClick={() => onOpen(game.id)} className="arcade-btn-secondary mt-2 w-full">
                Open Mini Game
              </button>
            </div>
          </article>
        ))}
      </div>

      {games.length === 0 && (
        <div className="rounded-[1.4rem] border border-sky-100/14 bg-[rgba(7,18,34,0.72)] px-5 py-6 text-center text-sky-50/78">
          No games matched that filter.
        </div>
      )}
    </section>
  );
};

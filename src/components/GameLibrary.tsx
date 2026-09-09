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
}: GameLibraryProps): React.JSX.Element => {
  const featuredGame = games.find((game) => game.id === "apex-run");
  const miniGames = games.filter((game) => game.id !== "apex-run");

  return (
    <section className="library-page space-y-6">
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
              placeholder="Search the collection"
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
            </div>
            <div className="flex flex-col justify-between gap-4 rounded-[1.6rem] border border-sky-100/12 bg-[rgba(255,255,255,0.05)] p-5 text-slate-50">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-4xl text-white">{featuredGame.title}</h3>
                </div>
                <p className="text-base text-sky-50/82">{featuredGame.description}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => onOpen(featuredGame.id)} className="arcade-btn-primary">
                  Play Apex Run
                </button>
                <span className="self-center text-sm text-sky-100/70">
                  Mountain time attack. More games below.
                </span>
              </div>
            </div>
          </div>
        </article>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-3xl text-slate-50">More games</h3>
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
            </div>
            <div className="space-y-2 p-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-2xl text-white">{game.title}</h3>
              </div>
              <p className="text-sm text-sky-50/78">{game.shortDescription}</p>
              <button type="button" onClick={() => onOpen(game.id)} className="arcade-btn-secondary mt-2 w-full">
                Open game
              </button>
            </div>
          </article>
        ))}
      </div>

      {games.length === 0 && (
        <div className="rounded-[1.4rem] border border-sky-100/14 bg-[rgba(7,18,34,0.72)] px-5 py-8 text-center flex flex-col items-center gap-4">
          <p className="text-sky-50/78 text-lg">No games matched that filter.</p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFilter("all");
            }}
            className="arcade-btn-secondary"
            aria-label="Clear all search and genre filters"
          >
            Clear Filters
          </button>
        </div>
      )}
    </section>
  );
};

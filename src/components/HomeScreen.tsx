import type { DailyChallenge, GameDefinition, ProgressState } from "../types/arcade";

interface HomeScreenProps {
  onPlay: () => void;
  onDaily: () => void;
  daily: DailyChallenge;
  dailyGame?: GameDefinition;
  progress: ProgressState;
}

export const HomeScreen = ({ onPlay, onDaily, daily, dailyGame, progress }: HomeScreenProps): React.JSX.Element => {
  const sessions = Object.values(progress.stats).reduce((sum, item) => sum + item.plays, 0);
  const wins = Object.values(progress.stats).reduce((sum, item) => sum + item.wins, 0);
  const ebtBucks = progress.ebtBucks ?? 0;

  return (
    <section className="space-y-8">
      <div className="relative overflow-hidden rounded-[2rem] border border-sky-200/28 bg-[linear-gradient(145deg,rgba(8,20,38,0.94),rgba(18,39,66,0.9))] p-8 shadow-[0_36px_90px_-42px_rgba(7,20,42,0.92)] md:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(113,202,255,0.3),transparent_42%),radial-gradient(circle_at_82%_26%,rgba(255,205,124,0.22),transparent_36%),radial-gradient(circle_at_50%_100%,rgba(110,167,89,0.22),transparent_44%)]" />
        <div className="absolute inset-y-0 right-0 w-[40%] bg-[linear-gradient(180deg,rgba(153,214,255,0.12),rgba(255,198,103,0.06),transparent)]" />
        <div className="relative z-10 space-y-5 text-slate-50">
          <p className="arcade-kicker">CHUDGAMES</p>
          <h1 className="font-display text-4xl text-white md:text-6xl">
            FortLite leads the drop. The rest are quick-hit mini games.
          </h1>
          <p className="max-w-2xl text-lg text-sky-50/82">
            Jump into the featured battle royale, then cool down with the smaller arcade cabinets.
            Everything stays local, fast, and ready on desktop or mobile.
          </p>
          <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.22em] text-sky-100/72">
            <span>Featured FortLite</span>
            <span>Mini-Game Library</span>
            <span>Daily Seeds</span>
            <span>Offline Progress</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onPlay} className="arcade-btn-primary">
              Open Library
            </button>
            <button type="button" onClick={onDaily} className="arcade-btn-secondary">
              Daily Challenge
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <article className="arcade-card">
          <p className="arcade-kicker">Daily Challenge</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-50">{dailyGame?.title ?? "Loading"}</h3>
          <p className="mt-1 text-sm text-sky-100/72">{daily.dateKey}</p>
          <p className="mt-3 text-sm text-sky-50/82">Best today: {progress.dailyBest[daily.dateKey]?.score ?? 0}</p>
        </article>
        <article className="arcade-card">
          <p className="arcade-kicker">Achievements</p>
          <h3 className="mt-2 font-display text-4xl text-slate-50">{progress.achievements.length}</h3>
          <p className="mt-2 text-sm text-sky-100/72">Unlocked badges</p>
        </article>
        <article className="arcade-card">
          <p className="arcade-kicker">EBT Bucks</p>
          <h3 className="mt-2 font-display text-4xl text-slate-50">{ebtBucks}</h3>
          <p className="mt-2 text-sm text-sky-100/72">Earn 1 for every win</p>
        </article>
        <article className="arcade-card">
          <p className="arcade-kicker">Sessions</p>
          <h3 className="mt-2 font-display text-4xl text-slate-50">{sessions}</h3>
          <p className="mt-2 text-sm text-sky-100/72">Total drops and runs</p>
        </article>
        <article className="arcade-card">
          <p className="arcade-kicker">Wins</p>
          <h3 className="mt-2 font-display text-4xl text-slate-50">{wins}</h3>
          <p className="mt-2 text-sm text-sky-100/72">Victory screens hit</p>
        </article>
      </div>
    </section>
  );
};

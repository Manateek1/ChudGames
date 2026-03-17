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

  return (
    <section className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-sky-300/55 bg-white/78 p-8 shadow-[0_30px_80px_-38px_rgba(69,171,255,0.38)] md:p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_15%,rgba(119,212,255,0.28),transparent_45%),radial-gradient(circle_at_82%_28%,rgba(186,255,112,0.2),transparent_42%)]" />
        <div className="relative z-10 space-y-5">
          <p className="arcade-kicker">CHUDGAMES</p>
          <h1 className="font-display text-4xl text-sky-950 md:text-6xl">
            Bright arcade chaos you can carry in your pocket.
          </h1>
          <p className="max-w-2xl text-lg text-sky-800/85">
            High-response controls, polished mini-games, daily challenge seeds, and local achievements.
            Play on desktop or mobile with no server required.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onPlay} className="arcade-btn-primary">
              Play
            </button>
            <button type="button" onClick={onDaily} className="arcade-btn-secondary">
              Daily Challenge
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <article className="arcade-card">
          <p className="arcade-kicker">Daily Challenge</p>
          <h3 className="mt-2 text-xl font-semibold text-sky-950">{dailyGame?.title ?? "Loading"}</h3>
          <p className="mt-1 text-sm text-sky-700/80">{daily.dateKey}</p>
          <p className="mt-3 text-sm text-sky-800/85">Best today: {progress.dailyBest[daily.dateKey]?.score ?? 0}</p>
        </article>
        <article className="arcade-card">
          <p className="arcade-kicker">Achievements</p>
          <h3 className="mt-2 font-display text-4xl text-sky-950">{progress.achievements.length}</h3>
          <p className="mt-2 text-sm text-sky-700/80">Unlocked badges</p>
        </article>
        <article className="arcade-card">
          <p className="arcade-kicker">Sessions</p>
          <h3 className="mt-2 font-display text-4xl text-sky-950">{sessions}</h3>
          <p className="mt-2 text-sm text-sky-700/80">Total runs</p>
        </article>
        <article className="arcade-card">
          <p className="arcade-kicker">Wins</p>
          <h3 className="mt-2 font-display text-4xl text-sky-950">{wins}</h3>
          <p className="mt-2 text-sm text-sky-700/80">Victory screens hit</p>
        </article>
      </div>
    </section>
  );
};

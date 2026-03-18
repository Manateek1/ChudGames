import { ACHIEVEMENTS } from "../engine/achievements";

interface AchievementPanelProps {
  unlocked: string[];
}

export const AchievementPanel = ({ unlocked }: AchievementPanelProps): React.JSX.Element => (
  <section className="rounded-[1.6rem] border border-sky-200/24 bg-[rgba(7,18,34,0.8)] p-5 text-slate-50 shadow-[0_24px_56px_-34px_rgba(7,18,34,0.94)]">
    <div className="mb-3 flex items-center justify-between">
      <h3 className="font-display text-2xl text-white">Achievements</h3>
      <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-slate-950">
        {unlocked.length}/{ACHIEVEMENTS.length}
      </span>
    </div>

    <div className="grid gap-2">
      {ACHIEVEMENTS.map((achievement) => {
        const isUnlocked = unlocked.includes(achievement.id);
        return (
          <article
            key={achievement.id}
            className={`rounded-lg border px-3 py-2 ${
              isUnlocked
                ? "border-emerald-200/35 bg-emerald-300/12"
                : "border-sky-100/10 bg-white/5"
            }`}
          >
            <p className="font-semibold text-white">{achievement.title}</p>
            <p className="text-sm text-sky-50/74">{achievement.description}</p>
          </article>
        );
      })}
    </div>
  </section>
);

import { ACHIEVEMENTS } from "../engine/achievements";

interface AchievementPanelProps {
  unlocked: string[];
}

export const AchievementPanel = ({ unlocked }: AchievementPanelProps): React.JSX.Element => (
  <section className="rounded-2xl border border-sky-300/55 bg-white/80 p-5 shadow-[0_18px_40px_-26px_rgba(61,169,220,0.4)]">
    <div className="mb-3 flex items-center justify-between">
      <h3 className="font-display text-2xl text-sky-950">Achievements</h3>
      <span className="rounded-full bg-lime-300 px-3 py-1 text-xs font-bold text-sky-950">
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
                ? "border-lime-300/75 bg-lime-100/85"
                : "border-sky-300/40 bg-sky-50/70"
            }`}
          >
            <p className="font-semibold text-sky-950">{achievement.title}</p>
            <p className="text-sm text-sky-800/80">{achievement.description}</p>
          </article>
        );
      })}
    </div>
  </section>
);

import type { AppSettings } from "../types/arcade";

interface AnimatedBackgroundProps {
  settings: AppSettings;
}

export const AnimatedBackground = ({ settings }: AnimatedBackgroundProps): React.JSX.Element => (
  <>
    <div className="pointer-events-none fixed inset-0 -z-40 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(112,201,255,0.22),transparent_42%),radial-gradient(circle_at_85%_18%,rgba(255,198,120,0.2),transparent_38%),radial-gradient(circle_at_50%_100%,rgba(115,163,92,0.18),transparent_44%)]" />
      <div className={`arcade-grid ${settings.reducedMotion ? "" : "arcade-grid-motion"}`} />
      <div className={`arcade-orb ${settings.reducedMotion ? "" : "arcade-orb-motion"}`} />
    </div>
    {settings.scanlines && <div className="scanlines pointer-events-none fixed inset-0 -z-30 opacity-35" />}
  </>
);

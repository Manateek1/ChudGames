import type { AppSettings } from "../types/arcade";

interface AnimatedBackgroundProps {
  settings: AppSettings;
}

export const AnimatedBackground = ({ settings }: AnimatedBackgroundProps): React.JSX.Element => (
  <>
    <div className="pointer-events-none fixed inset-0 -z-40 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(108,213,255,0.3),transparent_42%),radial-gradient(circle_at_88%_18%,rgba(170,255,98,0.24),transparent_40%),radial-gradient(circle_at_50%_100%,rgba(255,238,125,0.22),transparent_45%)]" />
      <div className={`arcade-grid ${settings.reducedMotion ? "" : "arcade-grid-motion"}`} />
      <div className={`arcade-orb ${settings.reducedMotion ? "" : "arcade-orb-motion"}`} />
    </div>
    {settings.scanlines && <div className="scanlines pointer-events-none fixed inset-0 -z-30 opacity-35" />}
  </>
);

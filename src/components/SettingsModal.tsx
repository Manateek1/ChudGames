import type { AppSettings, GraphicsQuality, ThemeName } from "../types/arcade";

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onClose: () => void;
}

const themes: ThemeName[] = ["neon", "sunset", "matrix"];
const qualityLevels: GraphicsQuality[] = ["low", "medium", "high"];

export const SettingsModal = ({ open, settings, onChange, onClose }: SettingsModalProps): React.JSX.Element | null => {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(189,240,255,0.78)] p-4 backdrop-blur-sm" role="presentation">
      <section role="dialog" aria-modal="true" aria-label="Global settings" className="w-full max-w-2xl rounded-2xl border border-sky-300/65 bg-white/95 p-6 shadow-[0_28px_60px_-36px_rgba(55,167,220,0.45)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-3xl text-sky-950">Settings</h2>
          <button type="button" onClick={onClose} className="arcade-btn-secondary px-4 py-2">
            Close
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ToggleRow label="Sound" checked={settings.sound} onChange={(checked) => onChange({ ...settings, sound: checked })} />
          <ToggleRow label="Music" checked={settings.music} onChange={(checked) => onChange({ ...settings, music: checked })} />
          <ToggleRow label="Reduced Motion" checked={settings.reducedMotion} onChange={(checked) => onChange({ ...settings, reducedMotion: checked })} />
          <ToggleRow label="Scanlines" checked={settings.scanlines} onChange={(checked) => onChange({ ...settings, scanlines: checked })} />
          <ToggleRow label="FPS Overlay" checked={settings.showFps} onChange={(checked) => onChange({ ...settings, showFps: checked })} />

          <div className="rounded-xl border border-sky-300/50 bg-sky-50/80 p-3">
            <p className="arcade-kicker">Theme</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {themes.map((theme) => (
                <button
                  key={theme}
                  type="button"
                  onClick={() => onChange({ ...settings, theme })}
                  className={`rounded-md px-3 py-2 text-sm font-semibold uppercase tracking-[0.2em] ${
                    settings.theme === theme
                      ? "bg-sky-300 text-sky-950"
                      : "border border-sky-300/70 bg-white/70 text-sky-900"
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-lime-300/60 bg-lime-50/75 p-3 md:col-span-2">
            <p className="arcade-kicker">Graphics Quality</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {qualityLevels.map((quality) => (
                <button
                  key={quality}
                  type="button"
                  onClick={() => onChange({ ...settings, graphicsQuality: quality })}
                  className={`rounded-md px-3 py-2 text-sm font-semibold uppercase tracking-[0.2em] ${
                    settings.graphicsQuality === quality
                      ? "bg-lime-300 text-sky-950"
                      : "border border-lime-300/70 bg-white/70 text-lime-900"
                  }`}
                >
                  {quality}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-sky-800/75">
              Higher quality increases particles, glow, and visual effects in canvas games.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

const ToggleRow = ({ label, checked, onChange }: ToggleRowProps): React.JSX.Element => (
  <label className="flex items-center justify-between rounded-xl border border-sky-300/50 bg-sky-50/80 px-4 py-3 text-sky-900">
    <span>{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full border ${checked ? "bg-lime-300 border-lime-400" : "bg-white border-sky-300/70"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? "left-6" : "left-0.5"}`} />
    </button>
  </label>
);

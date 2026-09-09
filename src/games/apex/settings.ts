export type Quality = "low" | "medium" | "high" | "ultra";
export interface ApexSettings {
  quality: Quality;
  paint: string;
  assists: boolean;
  sound: boolean;
  reducedMotion: boolean;
  ghost: boolean;
}
export const presets = {
  low: {
    scale: 0.7,
    shadow: 0,
    trees: 250,
    particles: 48,
    reflection: 64,
    distance: 950,
  },
  medium: {
    scale: 0.9,
    shadow: 1024,
    trees: 650,
    particles: 90,
    reflection: 128,
    distance: 1400,
  },
  high: {
    scale: 1,
    shadow: 2048,
    trees: 1100,
    particles: 150,
    reflection: 128,
    distance: 1900,
  },
  ultra: {
    scale: 1.35,
    shadow: 4096,
    trees: 1700,
    particles: 220,
    reflection: 256,
    distance: 2400,
  },
};
export function loadApexSettings(
  quality: Quality,
  reducedMotion: boolean,
): ApexSettings {
  const defaults = {
    quality,
    paint: "#c73d26",
    assists: true,
    sound: true,
    reducedMotion,
    ghost: true,
  };
  try {
    const s = JSON.parse(localStorage.getItem("apex:settings:2") ?? "{}");
    return {
      quality: Object.hasOwn(presets, s.quality) ? s.quality : quality,
      paint: /^#[0-9a-f]{6}$/i.test(s.paint) ? s.paint : defaults.paint,
      assists: typeof s.assists === "boolean" ? s.assists : true,
      sound: typeof s.sound === "boolean" ? s.sound : true,
      reducedMotion: reducedMotion || s.reducedMotion === true,
      ghost: s.ghost !== false,
    };
  } catch {
    return defaults;
  }
}
export function persistSettings(settings: ApexSettings) {
  try {
    localStorage.setItem("apex:settings:2", JSON.stringify(settings));
  } catch {
    /* Play remains available with storage disabled. */
  }
}

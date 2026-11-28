import type { Options } from "./controls";
export class WorldAudio {
  private ctx?: AudioContext;
  private noise?: AudioBuffer;
  private lastMusic = -1;
  unlock() {
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume().catch(() => {});
    } catch {
      /* silent device */
    }
  }
  play(kind: string, material: string, opts: Options, underwater = false) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const vol =
      kind === "voice"
        ? opts.voice
        : kind === "select"
          ? opts.interfaceVolume
          : kind === "ambience"
            ? opts.ambience
            : kind === "music"
              ? opts.music
              : opts.effects;
    if (vol <= 0) return;
    const gain = ctx.createGain(),
      filter = ctx.createBiquadFilter(),
      t = ctx.currentTime;
    const duration = kind === "ambience" ? 0.7 : kind === "music" ? 0.75 : kind === "step" ? 0.09 : 0.18;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, vol * (kind === "step" ? 0.045 : 0.1)),
      t + 0.012,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    filter.type = "lowpass";
    filter.frequency.value = underwater
      ? 460
      : /stone|slate|basalt|ore/.test(material)
        ? 2300
        : /log|panel/.test(material)
          ? 850
          : 1300;
    filter.connect(gain).connect(ctx.destination);
    const callPitch = 190 + (Array.from(material).reduce((n, c) => n + c.charCodeAt(0), 0) % 480);
    let source: AudioBufferSourceNode | OscillatorNode;
    if (["break", "step", "place", "ambience"].includes(kind)) {
      if (!this.noise) {
        this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        let s = 917;
        for (let i = 0; i < data.length; i++) {
          s = (Math.imul(s, 1664525) + 1013904223) | 0;
          data[i] = s / 2147483648;
        }
      }
      source = ctx.createBufferSource();
      source.buffer = this.noise;
      source.playbackRate.value = kind === "ambience" ? 0.5 : kind === "step" ? 1.25 : 0.85;
    } else {
      source = ctx.createOscillator();
      source.type = kind === "music" ? "sine" : "triangle";
      source.frequency.setValueAtTime(
        kind === "voice"
          ? callPitch
          : kind === "pickup"
            ? 550
            : kind === "music"
              ? Number(material)
              : 280,
        t,
      );
      source.frequency.exponentialRampToValueAtTime(
        kind === "voice"
          ? callPitch * 0.72
          : kind === "pickup"
            ? 730
            : kind === "music"
              ? Number(material)
              : 210,
        t + duration,
      );
    }
    source.connect(filter);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(t);
    source.stop(t + duration + 0.01);
  }
  atmosphere(tick: number, opts: Options, music: boolean) {
    if (tick % 120 !== 0 || tick === this.lastMusic) return;
    this.lastMusic = tick;
    this.play("ambience", "", opts);
    if (music) this.play("music", String([196, 246.94, 293.66, 220][Math.floor(tick / 120) % 4]), opts);
  }
  dispose() {
    void this.ctx?.close().catch(() => {});
  }
}

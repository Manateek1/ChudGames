export class AudioManager {
  private context: AudioContext | null = null;

  private master: GainNode | null = null;

  private musicBus: GainNode | null = null;

  private musicTimer: number | null = null;

  private beat = 0;

  enabled = true;

  musicEnabled = true;

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") {
      return null;
    }

    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.musicBus = this.context.createGain();
      this.master.gain.value = 0.45;
      this.musicBus.gain.value = 0.16;
      this.musicBus.connect(this.master);
      this.master.connect(this.context.destination);
    }

    return this.context;
  }

  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (!context) {
      return;
    }
    if (context.state === "suspended") {
      await context.resume();
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    if (!enabled) {
      this.stopMusic();
    }
  }

  private tone(
    frequency: number,
    duration: number,
    gainLevel: number,
    type: OscillatorType,
    attack = 0.01,
    release = 0.12,
  ): void {
    if (!this.enabled) {
      return;
    }

    const context = this.ensureContext();
    if (!context || !this.master) {
      return;
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainLevel), now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);

    oscillator.connect(gain);
    gain.connect(this.master);

    oscillator.start(now);
    oscillator.stop(now + duration + release + 0.02);
  }

  ui(): void {
    this.tone(660, 0.05, 0.055, "triangle", 0.002, 0.05);
  }

  hit(): void {
    this.tone(210, 0.08, 0.065, "square", 0.003, 0.07);
  }

  power(): void {
    this.tone(420, 0.1, 0.05, "triangle", 0.005, 0.08);
    this.tone(740, 0.06, 0.03, "sine", 0.005, 0.05);
  }

  explosion(): void {
    if (!this.enabled) {
      return;
    }
    const context = this.ensureContext();
    if (!context || !this.master) {
      return;
    }

    const bufferSize = Math.floor(context.sampleRate * 0.16);
    const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const source = context.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 720;

    const gain = context.createGain();
    gain.gain.value = 0.14;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);

    source.start();
    source.stop(context.currentTime + 0.18);
  }

  fortliteFire(weaponId: string): void {
    if (weaponId === "auto-shotgun") {
      this.tone(110, 0.07, 0.08, "square", 0.001, 0.05);
      this.tone(72, 0.08, 0.04, "triangle", 0.001, 0.07);
      return;
    }

    if (weaponId === "tactical-smg") {
      this.tone(260, 0.03, 0.034, "square", 0.001, 0.03);
      this.tone(180, 0.035, 0.018, "triangle", 0.001, 0.04);
      return;
    }

    this.tone(170, 0.05, 0.05, "sawtooth", 0.001, 0.04);
    this.tone(98, 0.06, 0.026, "triangle", 0.001, 0.05);
  }

  fortlitePickup(): void {
    this.tone(720, 0.04, 0.04, "triangle", 0.002, 0.04);
    this.tone(980, 0.035, 0.025, "sine", 0.002, 0.05);
  }

  fortliteBuild(): void {
    this.tone(210, 0.045, 0.042, "square", 0.001, 0.04);
    this.tone(280, 0.04, 0.024, "triangle", 0.001, 0.05);
  }

  fortliteHarvest(): void {
    this.tone(150, 0.05, 0.038, "triangle", 0.001, 0.04);
    this.tone(220, 0.035, 0.024, "square", 0.001, 0.03);
  }

  fortliteHeal(): void {
    this.tone(360, 0.08, 0.03, "sine", 0.003, 0.08);
    this.tone(620, 0.11, 0.038, "triangle", 0.003, 0.1);
  }

  fortliteLand(): void {
    this.tone(124, 0.06, 0.052, "triangle", 0.001, 0.06);
    this.tone(186, 0.05, 0.022, "square", 0.001, 0.04);
  }

  fortliteDamage(): void {
    this.tone(160, 0.055, 0.05, "sawtooth", 0.001, 0.06);
  }

  fortliteVictory(): void {
    this.tone(523.25, 0.08, 0.04, "triangle", 0.002, 0.08);
    this.tone(783.99, 0.12, 0.03, "sine", 0.01, 0.12);
  }

  fortliteDefeat(): void {
    this.tone(220, 0.08, 0.04, "triangle", 0.002, 0.08);
    this.tone(146.83, 0.12, 0.03, "sawtooth", 0.01, 0.12);
  }

  startMusic(seed = 1): void {
    if (!this.musicEnabled || this.musicTimer !== null || typeof window === "undefined") {
      return;
    }

    const context = this.ensureContext();
    if (!context || !this.musicBus) {
      return;
    }

    const notes = [220, 246.94, 261.63, 293.66, 329.63, 392, 440, 493.88];
    const jump = Math.max(1, seed % 4);
    this.beat = seed % notes.length;

    this.musicTimer = window.setInterval(() => {
      if (!this.enabled || !this.musicEnabled || !this.musicBus) {
        return;
      }

      const now = context.currentTime;
      const frequency = notes[this.beat % notes.length];
      this.beat += jump;

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(frequency, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

      oscillator.connect(gain);
      gain.connect(this.musicBus);

      oscillator.start(now);
      oscillator.stop(now + 0.25);
    }, 280);
  }

  stopMusic(): void {
    if (this.musicTimer !== null && typeof window !== "undefined") {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  dispose(): void {
    this.stopMusic();
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
  }
}

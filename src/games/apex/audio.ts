import type { VehicleState, DriveInput } from "./physics";

// A combustion pulse wave plus intake, drivetrain, road and wind layers. All
// nodes are persistent; the render loop only schedules smooth parameter changes.
export class ApexAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode[] = [];
  private engineGains: GainNode[] = [];
  private intake: BiquadFilterNode | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private wind: GainNode | null = null;
  private tires: GainNode | null = null;
  private squeal: OscillatorNode | null = null;
  private squealGain: GainNode | null = null;
  private impact: GainNode | null = null;
  private previousImpact = 0;
  start(): void {
    if (this.context) {
      void this.context.resume().catch(() => {});
      return;
    }
    try {
      const c = new AudioContext();
      this.context = c;
      const master = c.createGain();
      master.gain.value = 0;
      const compressor = c.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.ratio.value = 5;
      master.connect(compressor);
      compressor.connect(c.destination);
      this.master = master;
      const intake = c.createBiquadFilter();
      intake.type = "lowpass";
      intake.frequency.value = 1200;
      intake.Q.value = 0.7;
      intake.connect(master);
      this.intake = intake;
      const real = new Float32Array(24),
        imag = new Float32Array(24);
      for (let i = 1; i < 24; i++)
        imag[i] = (i % 3 === 0 ? 0.4 : 1) / Math.pow(i, 1.1);
      const wave = c.createPeriodicWave(real, imag);
      for (let i = 0; i < 3; i++) {
        const osc = c.createOscillator(),
          gain = c.createGain();
        osc.setPeriodicWave(wave);
        osc.detune.value = (i - 1) * 9;
        gain.gain.value = 0.06 / (i + 1);
        osc.connect(gain);
        gain.connect(intake);
        osc.start();
        this.engine.push(osc);
        this.engineGains.push(gain);
      }
      const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate),
        data = buffer.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        brown = (brown + (Math.random() * 2 - 1) * 0.05) / 1.02;
        data[i] = brown * 3;
      }
      const source = c.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.start();
      this.noise = source;
      const layer = (frequency: number, type: BiquadFilterType) => {
        const filter = c.createBiquadFilter(),
          gain = c.createGain();
        filter.type = type;
        filter.frequency.value = frequency;
        gain.gain.value = 0;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        return gain;
      };
      this.wind = layer(700, "highpass");
      this.tires = layer(420, "bandpass");
      this.impact = layer(170, "lowpass");
      const squeal = c.createOscillator(),
        squealGain = c.createGain();
      squeal.type = "triangle";
      squeal.frequency.value = 700;
      squealGain.gain.value = 0;
      squeal.connect(squealGain);
      squealGain.connect(master);
      squeal.start();
      this.squeal = squeal;
      this.squealGain = squealGain;
      void c.resume().catch(() => {});
    } catch {
      /* Audio is optional on browsers without an available audio device. */
    }
  }
  update(s: VehicleState, input: DriveInput, audible: boolean): void {
    const c = this.context;
    if (!c || !this.master) return;
    const t = c.currentTime;
    this.master.gain.setTargetAtTime(audible ? 0.6 : 0, t, 0.05);
    if (!audible) return;
    for (let i = 0; i < this.engine.length; i++) {
      this.engine[i].frequency.setTargetAtTime(
        (s.rpm / 60) * (i === 2 ? 4 : 2),
        t,
        0.03,
      );
      this.engineGains[i].gain.setTargetAtTime(
        ((0.055 + input.throttle * 0.075) / (i + 1)) * (s.shift > 0 ? 0.35 : 1),
        t,
        0.025,
      );
    }
    this.intake?.frequency.setTargetAtTime(
      450 + input.throttle * 1500 + s.rpm * 0.13,
      t,
      0.07,
    );
    this.wind?.gain.setTargetAtTime(
      Math.pow(Math.abs(s.speed) / 86, 2) * 0.65,
      t,
      0.12,
    );
    this.tires?.gain.setTargetAtTime(
      Math.abs(s.speed) * (Math.abs(s.road.lateral) > 6.1 ? 0.013 : 0.003),
      t,
      0.08,
    );
    this.squealGain?.gain.setTargetAtTime(
      Math.min(
        0.07,
        Math.max(0, s.slip - 0.045) * 0.35 +
          (input.handbrake && s.speed > 8 ? 0.035 : 0),
      ),
      t,
      0.04,
    );
    this.squeal?.frequency.setTargetAtTime(
      620 + s.slip * 900 + Math.sin(t * 33) * 35,
      t,
      0.03,
    );
    if (s.impact > this.previousImpact + 0.1 && this.impact) {
      this.impact.gain.cancelScheduledValues(t);
      this.impact.gain.setValueAtTime(s.impact * 1.5, t);
      this.impact.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    }
    this.previousImpact = s.impact;
  }
  cue(finish = false): void {
    const c = this.context;
    if (!c || !this.master) return;
    const osc = c.createOscillator(),
      gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(finish ? 660 : 440, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      finish ? 1320 : 880,
      c.currentTime + 0.12,
    );
    gain.gain.setValueAtTime(0.05, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(c.currentTime + 0.32);
  }
  dispose(): void {
    this.engine.forEach((o) => o.stop());
    this.noise?.stop();
    this.squeal?.stop();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}

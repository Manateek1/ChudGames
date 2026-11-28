export function startDriveAudio() {
  const context = new AudioContext();
  const gain = context.createGain();
  const bass = context.createOscillator();
  const overtone = context.createOscillator();
  const overtoneGain = context.createGain();
  bass.type = "sine";
  overtone.type = "triangle";
  bass.frequency.value = 48;
  overtone.frequency.value = 120;
  overtoneGain.gain.value = 0.16;
  gain.gain.value = 0;
  bass.connect(gain);
  overtone.connect(overtoneGain).connect(gain);
  gain.connect(context.destination);
  bass.start();
  overtone.start();
  void context.resume().catch(() => {});
  let previousSpeed = NaN;
  return {
    update(speed: number) {
      if (previousSpeed === speed) return;
      previousSpeed = speed;
      const amount = Math.min(1, Math.abs(speed) / 117);
      const now = context.currentTime;
      bass.frequency.setTargetAtTime(48 + 74 * amount, now, 0.09);
      overtone.frequency.setTargetAtTime(120 + 290 * amount, now, 0.14);
      gain.gain.setTargetAtTime(0.032 + 0.035 * amount, now, 0.12);
    },
    stop() {
      bass.stop();
      overtone.stop();
      void context.close().catch(() => {});
    },
  };
}

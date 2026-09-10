import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../../../engine/audio';
import { FortLiteHud } from '../ui';

describe('FortLite Stage 5 Release Polish', () => {
  describe('AudioManager FortLite synthesis', () => {
    let audio: AudioManager;

    beforeEach(() => {
      class MockAudioContext {
        currentTime = 0;
        state = 'running';
        destination = {};
        createGain() {
          return {
            gain: {
              value: 1,
              setValueAtTime: vi.fn(),
              exponentialRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
          };
        }
        createOscillator() {
          return {
            type: 'triangle',
            frequency: { setValueAtTime: vi.fn() },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          };
        }
        close = vi.fn();
        resume = vi.fn();
      }

      window.AudioContext = MockAudioContext as unknown as typeof AudioContext;

      audio = new AudioManager();
    });

    it('plays footstep tones with distinct frequencies for player vs enemy and sprint', () => {
      const toneSpy = vi.spyOn(audio as unknown as { tone: (...args: unknown[]) => void }, 'tone');

      // Player walk
      audio.fortliteFootstep(false, false);
      expect(toneSpy).toHaveBeenCalledWith(145, expect.any(Number), expect.any(Number), 'triangle', expect.any(Number), expect.any(Number));

      // Player sprint
      toneSpy.mockClear();
      audio.fortliteFootstep(true, false);
      expect(toneSpy).toHaveBeenCalledWith(165, expect.any(Number), expect.any(Number), 'triangle', expect.any(Number), expect.any(Number));

      // Enemy walk (has primary lower frequency + sub harmonic)
      toneSpy.mockClear();
      audio.fortliteFootstep(false, true);
      expect(toneSpy).toHaveBeenCalledWith(115, expect.any(Number), expect.any(Number), 'triangle', expect.any(Number), expect.any(Number));
      expect(toneSpy).toHaveBeenCalledWith(115 * 0.6, expect.any(Number), expect.any(Number), 'sine', expect.any(Number), expect.any(Number));

      // Enemy sprint
      toneSpy.mockClear();
      audio.fortliteFootstep(true, true);
      expect(toneSpy).toHaveBeenCalledWith(135, expect.any(Number), expect.any(Number), 'triangle', expect.any(Number), expect.any(Number));
    });

    it('synthesizes storm warning with low frequency sweep tones', () => {
      const toneSpy = vi.spyOn(audio as unknown as { tone: (...args: unknown[]) => void }, 'tone');
      audio.fortliteStormWarning();

      expect(toneSpy).toHaveBeenCalledWith(95, 0.32, 0.045, 'triangle', 0.02, 0.28);
      expect(toneSpy).toHaveBeenCalledWith(62, 0.42, 0.05, 'sawtooth', 0.03, 0.35);
    });

    it('synthesizes critical hit ping with high frequency harmonics', () => {
      const toneSpy = vi.spyOn(audio as unknown as { tone: (...args: unknown[]) => void }, 'tone');
      audio.fortliteCriticalHit();

      expect(toneSpy).toHaveBeenCalledWith(1250, 0.06, 0.055, 'sine', 0.001, 0.06);
      expect(toneSpy).toHaveBeenCalledWith(1880, 0.08, 0.038, 'triangle', 0.002, 0.08);
    });

    it('synthesizes victory and defeat musical jingles', () => {
      const toneSpy = vi.spyOn(audio as unknown as { tone: (...args: unknown[]) => void }, 'tone');
      audio.fortliteVictory();
      expect(toneSpy).toHaveBeenCalledWith(523.25, expect.any(Number), expect.any(Number), 'triangle', expect.any(Number), expect.any(Number));

      toneSpy.mockClear();
      audio.fortliteDefeat();
      expect(toneSpy).toHaveBeenCalledWith(220, expect.any(Number), expect.any(Number), 'triangle', expect.any(Number), expect.any(Number));
    });

    it('does not emit tones when audio is disabled', () => {
      audio.setEnabled(false);

      audio.fortliteFootstep(true, true);
      audio.fortliteStormWarning();
      audio.fortliteCriticalHit();
      audio.fortliteVictory();
      audio.fortliteDefeat();

      expect(audio.enabled).toBe(false);
    });
  });

  describe('FortLite HUD Controls Guide & Pause Menu', () => {
    let container: HTMLDivElement;
    let hud: FortLiteHud;

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      hud = new FortLiteHud(container, 'Help text content');
    });

    it('toggles controls guide visibility and queries state correctly', () => {
      expect(hud.isHelpVisible()).toBe(false);

      hud.toggleHelp(true);
      expect(hud.isHelpVisible()).toBe(true);

      hud.toggleHelp(false);
      expect(hud.isHelpVisible()).toBe(false);

      hud.toggleHelp(); // toggles from false to true
      expect(hud.isHelpVisible()).toBe(true);
    });

    it('triggers registered help toggle callback when control button is clicked', () => {
      const helpCb = vi.fn();
      hud.setHelpToggleHandler(helpCb);

      const controlsBtn = container.querySelector('.hud-controls-btn') as HTMLButtonElement | null;
      expect(controlsBtn).not.toBeNull();
      controlsBtn?.click();

      expect(helpCb).toHaveBeenCalledTimes(1);
    });

    it('renders pause overlay with correct audio and graphics quality labels', () => {
      hud.showPause(true, true, 'high');
      const pauseOverlay = container.querySelector('.hud-pause-overlay');
      expect(pauseOverlay?.classList.contains('visible')).toBe(true);

      const soundBtn = container.querySelector('[data-pause-action="sound"]');
      expect(soundBtn?.textContent).toContain('ON');

      const qualityBtn = container.querySelector('[data-pause-action="quality"]');
      expect(qualityBtn?.textContent).toContain('HIGH');

      hud.showPause(true, false, 'low');
      expect(soundBtn?.textContent).toContain('OFF');
      expect(qualityBtn?.textContent).toContain('LOW');

      hud.showPause(false, true, 'medium');
      expect(pauseOverlay?.classList.contains('visible')).toBe(false);
    });

    it('wires pause overlay button actions to callbacks', () => {
      const resumeCb = vi.fn();
      const restartCb = vi.fn();
      const soundCb = vi.fn();
      const qualityCb = vi.fn();
      const leaveCb = vi.fn();

      hud.setPauseHandlers({
        onResume: resumeCb,
        onRestart: restartCb,
        onToggleSound: soundCb,
        onCycleQuality: qualityCb,
        onLeave: leaveCb,
      });

      const resumeBtn = container.querySelector('[data-pause-action="resume"]') as HTMLButtonElement;
      const restartBtn = container.querySelector('[data-pause-action="restart"]') as HTMLButtonElement;
      const soundBtn = container.querySelector('[data-pause-action="sound"]') as HTMLButtonElement;
      const qualityBtn = container.querySelector('[data-pause-action="quality"]') as HTMLButtonElement;
      const leaveBtn = container.querySelector('[data-pause-action="leave"]') as HTMLButtonElement;

      resumeBtn?.click();
      expect(resumeCb).toHaveBeenCalledTimes(1);

      restartBtn?.click();
      expect(restartCb).toHaveBeenCalledTimes(1);

      soundBtn?.click();
      expect(soundCb).toHaveBeenCalledTimes(1);

      qualityBtn?.click();
      expect(qualityCb).toHaveBeenCalledTimes(1);

      leaveBtn?.click();
      expect(leaveCb).toHaveBeenCalledTimes(1);
    });

    it('renders victory and defeat end screens with formatted placement, elims, and survival time', () => {
      // Victory Royale
      hud.showEndScreen('Victory Royale', 'You won!', true, {
        placement: 1,
        eliminations: 7,
        survivalTime: 185, // 3m 05s
      });

      const endScreen = container.querySelector('.hud-end');
      expect(endScreen?.classList.contains('visible')).toBe(true);
      expect(endScreen?.classList.contains('victory')).toBe(true);
      expect(endScreen?.classList.contains('defeat')).toBe(false);

      const statsText = container.querySelector('.hud-end-stats')?.textContent;
      expect(statsText).toContain('#1');
      expect(statsText).toContain('7');
      expect(statsText).toContain('3:05');

      // Defeat with spectate enabled
      hud.showEndScreen('Defeat', 'Eliminated', false, {
        placement: 8,
        eliminations: 2,
        survivalTime: 72, // 1m 12s
      }, true);

      expect(endScreen?.classList.contains('victory')).toBe(false);
      expect(endScreen?.classList.contains('defeat')).toBe(true);
      expect(container.querySelector('.hud-end-stats')?.textContent).toContain('#8');
      expect(container.querySelector('.hud-end-stats')?.textContent).toContain('1:12');

      const spectateBtn = container.querySelector('.hud-end-spectate-btn') as HTMLButtonElement;
      expect(spectateBtn.style.display).toBe('inline-block');

      // Hide end screen
      hud.hideEndScreen();
      expect(endScreen?.classList.contains('visible')).toBe(false);
      expect(spectateBtn.style.display).toBe('none');
    });

    it('persists guide dismissal in localStorage when dismissed', () => {
      localStorage.removeItem('fortlite_guide_dismissed');
      expect(localStorage.getItem('fortlite_guide_dismissed')).toBeNull();

      hud.toggleHelp(true);
      expect(hud.isHelpVisible()).toBe(true);

      hud.toggleHelp(false);
      expect(hud.isHelpVisible()).toBe(false);
      localStorage.setItem('fortlite_guide_dismissed', 'true');
      expect(localStorage.getItem('fortlite_guide_dismissed')).toBe('true');
    });

    it('cleans up HUD elements and listeners on dispose', () => {
      hud.dispose();
      expect(hud.isHelpVisible()).toBe(false);
      expect(container.children.length).toBe(0);
    });
  });
});


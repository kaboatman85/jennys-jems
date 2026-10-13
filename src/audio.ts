import { loadJSON, saveJSON } from './storage.ts';

export type SfxKind = 'swap' | 'invalid' | 'match' | 'shuffle';

// C major pentatonic, so stacked cascades always sound pleasant.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98];

type WebkitWindow = { webkitAudioContext?: typeof AudioContext };

class Sfx {
  private ac: AudioContext | null = null;
  muted: boolean = loadJSON<boolean>('jj.muted', false);

  setMuted(m: boolean): void {
    this.muted = m;
    saveJSON('jj.muted', m);
  }

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock(): void {
    this.ensure();
  }

  private ensure(): AudioContext | null {
    if (!this.ac) {
      const AC = window.AudioContext ?? (window as unknown as WebkitWindow).webkitAudioContext;
      if (!AC) return null;
      try {
        this.ac = new AC();
      } catch {
        return null;
      }
    }
    if (this.ac.state === 'suspended') void this.ac.resume();
    return this.ac;
  }

  private tone(
    ac: AudioContext,
    when: number,
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    endFreq?: number,
  ): void {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, when + dur);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(vol, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(when);
    osc.stop(when + dur + 0.03);
  }

  play(kind: SfxKind, combo = 1): void {
    if (this.muted) return;
    const ac = this.ensure();
    if (!ac) return;
    const t = ac.currentTime;
    switch (kind) {
      case 'swap':
        this.tone(ac, t, 380, 0.09, 'sine', 0.12, 520);
        break;
      case 'invalid':
        this.tone(ac, t, 220, 0.16, 'triangle', 0.13, 150);
        break;
      case 'match': {
        const i = Math.min(combo - 1, SCALE.length - 3);
        this.tone(ac, t, SCALE[i]!, 0.22, 'sine', 0.16);
        this.tone(ac, t + 0.06, SCALE[i + 1]!, 0.22, 'sine', 0.13);
        this.tone(ac, t + 0.12, SCALE[i + 2]!, 0.3, 'triangle', 0.1);
        break;
      }
      case 'shuffle':
        this.tone(ac, t, 300, 0.35, 'triangle', 0.1, 900);
        break;
    }
  }
}

export const sfx = new Sfx();

import type { BgmTheme } from '../engine/WorldTypes.ts';

export type SynthWaveform = 'square' | 'triangle' | 'sine' | 'chime';

export type SoundPreset =
  | 'jump'
  | 'star'
  | 'stomp'
  | 'hurt'
  | 'laser'
  | 'key'
  | 'win'
  | 'bounce'
  | 'explode'
  | 'ignite'
  | 'snap'
  | 'charge'
  | 'rail';

export type TactileSwitchProfile = 'face' | 'dpad' | 'bumper' | 'system' | 'ui' | 'stick';
export type TactilePhase = 'down' | 'up';

interface TactileAcousticSpec {
  filterHz: number;
  q: number;
  clickMs: number;
  noiseGain: number;
  thumpStartHz: number;
  thumpEndHz: number;
  thumpMs: number;
  thumpGain: number;
  thumpWave: OscillatorType;
}

const TACTILE_SPECS: Record<TactileSwitchProfile, Record<TactilePhase, TactileAcousticSpec>> = {
  face: {
    down: { filterHz: 3600, q: 2.4, clickMs: 7, noiseGain: 0.44, thumpStartHz: 180, thumpEndHz: 65, thumpMs: 18, thumpGain: 0.34, thumpWave: 'triangle' },
    up: { filterHz: 4600, q: 2.8, clickMs: 4.5, noiseGain: 0.19, thumpStartHz: 240, thumpEndHz: 135, thumpMs: 10, thumpGain: 0.11, thumpWave: 'sine' },
  },
  dpad: {
    down: { filterHz: 1950, q: 1.6, clickMs: 9, noiseGain: 0.38, thumpStartHz: 135, thumpEndHz: 54, thumpMs: 22, thumpGain: 0.42, thumpWave: 'sine' },
    up: { filterHz: 2700, q: 1.8, clickMs: 5, noiseGain: 0.14, thumpStartHz: 180, thumpEndHz: 110, thumpMs: 10, thumpGain: 0.08, thumpWave: 'sine' },
  },
  bumper: {
    down: { filterHz: 4300, q: 2.6, clickMs: 6, noiseGain: 0.46, thumpStartHz: 210, thumpEndHz: 82, thumpMs: 15, thumpGain: 0.29, thumpWave: 'triangle' },
    up: { filterHz: 5200, q: 2.6, clickMs: 4, noiseGain: 0.2, thumpStartHz: 260, thumpEndHz: 145, thumpMs: 9, thumpGain: 0.11, thumpWave: 'sine' },
  },
  system: {
    down: { filterHz: 3100, q: 2.2, clickMs: 6, noiseGain: 0.36, thumpStartHz: 165, thumpEndHz: 72, thumpMs: 16, thumpGain: 0.28, thumpWave: 'sine' },
    up: { filterHz: 3900, q: 2.2, clickMs: 4, noiseGain: 0.15, thumpStartHz: 215, thumpEndHz: 120, thumpMs: 9, thumpGain: 0.09, thumpWave: 'sine' },
  },
  ui: {
    down: { filterHz: 2700, q: 2.0, clickMs: 6.5, noiseGain: 0.32, thumpStartHz: 150, thumpEndHz: 68, thumpMs: 16, thumpGain: 0.25, thumpWave: 'triangle' },
    up: { filterHz: 3450, q: 2.0, clickMs: 4, noiseGain: 0.13, thumpStartHz: 205, thumpEndHz: 115, thumpMs: 9, thumpGain: 0.08, thumpWave: 'sine' },
  },
  stick: {
    down: { filterHz: 1600, q: 1.4, clickMs: 6, noiseGain: 0.28, thumpStartHz: 120, thumpEndHz: 58, thumpMs: 14, thumpGain: 0.24, thumpWave: 'sine' },
    up: { filterHz: 2100, q: 1.5, clickMs: 3.5, noiseGain: 0.1, thumpStartHz: 145, thumpEndHz: 95, thumpMs: 8, thumpGain: 0.06, thumpWave: 'sine' },
  },
};

export interface PentatonicKey {
  note: string;
  label: string;
  freq: number;
  color: string;
}

export const TOY_PIANO_KEYS: readonly PentatonicKey[] = [
  { note: 'C4', label: 'Do', freq: 261.63, color: '#ff708d' },
  { note: 'D4', label: 'Re', freq: 293.66, color: '#ffa552' },
  { note: 'E4', label: 'Mi', freq: 329.63, color: '#ffd447' },
  { note: 'G4', label: 'Sol', freq: 392.0, color: '#56d39c' },
  { note: 'A4', label: 'La', freq: 440.0, color: '#5ec2f7' },
  { note: 'C5', label: 'Do2', freq: 523.25, color: '#9e82f3' },
  { note: 'D5', label: 'Re2', freq: 587.33, color: '#ff8ec6' },
  { note: 'E5', label: 'Mi2', freq: 659.25, color: '#ffd447' },
];

const PENTATONIC_RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2];

interface BgmPattern {
  stepSec: number;
  lead: readonly number[];
  bass: readonly number[];
  leadWave: OscillatorType;
}

const BGM_PATTERNS: Record<BgmTheme, BgmPattern> = {
  meadow: {
    stepSec: 0.16,
    leadWave: 'triangle',
    lead: [72, 0, 76, 79, 84, 0, 79, 76, 74, 0, 79, 76, 72, 74, 76, 0],
    bass: [48, 0, 55, 0, 52, 0, 55, 0, 50, 0, 55, 0, 48, 0, 55, 0],
  },
  starlight: {
    stepSec: 0.135,
    leadWave: 'square',
    lead: [76, 79, 83, 0, 81, 79, 76, 74, 72, 76, 79, 0, 84, 83, 79, 0],
    bass: [45, 45, 52, 45, 48, 48, 55, 48, 43, 43, 50, 43, 45, 52, 57, 0],
  },
  dungeon: {
    stepSec: 0.22,
    leadWave: 'sine',
    lead: [64, 0, 67, 0, 69, 0, 67, 64, 62, 0, 64, 0, 60, 0, 59, 0],
    bass: [40, 0, 0, 47, 45, 0, 0, 40, 38, 0, 43, 0, 40, 0, 0, 0],
  },
  boss: {
    stepSec: 0.115,
    leadWave: 'square',
    lead: [69, 72, 76, 75, 76, 0, 79, 76, 74, 72, 71, 72, 76, 74, 72, 71],
    bass: [45, 45, 57, 45, 43, 43, 55, 43, 41, 41, 53, 41, 40, 40, 52, 40],
  },
};

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const PRESET_COOLDOWN_MS: Record<SoundPreset, number> = {
  jump: 35,
  bounce: 45,
  star: 30,
  stomp: 28,
  hurt: 90,
  laser: 38,
  key: 120,
  win: 250,
  explode: 55,
  ignite: 60,
  snap: 20,
  charge: 75,
  rail: 70,
};

export class ToySynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private waveform: SynthWaveform = 'triangle';
  private volume = 0.26;
  private jitterStep = 0;

  private pendingQueue = new Map<SoundPreset, number>();
  private lastPlayedAt = new Map<SoundPreset, number>();
  private lastTactileAt = new Map<string, number>();
  private bgmTheme: BgmTheme | null = null;
  private bgmStep = 0;
  private bgmTimer = 0;

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtor) {
        this.ctx = new AudioCtor();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 1.0;

        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(12, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.004, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.12, this.ctx.currentTime);

        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);

        const len = Math.max(256, Math.floor(this.ctx.sampleRate * 0.04));
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          const hash = Math.sin((i + 1) * 12.9898) * 43758.5453;
          ch[i] = (hash - Math.floor(hash)) * 2 - 1;
        }
        this.noiseBuffer = buf;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public getWaveform(): SynthWaveform {
    return this.waveform;
  }

  public setWaveform(wave: SynthWaveform): void {
    this.waveform = wave;
  }

  private nextPitchJitter(spread = 0.06): number {
    this.jitterStep = (this.jitterStep + 1) % 16;
    const hash = Math.sin(this.jitterStep * 12.9898) * 43758.5453;
    const frac = hash - Math.floor(hash); // 0..1
    return 1 + (frac * 2 - 1) * spread;
  }

  /** Queue an event to deduplicate same-frame bursts cleanly before flushing. */
  public queueEvent(preset: SoundPreset, comboIndex = 0): void {
    const prev = this.pendingQueue.get(preset);
    if (prev === undefined || comboIndex > prev) {
      this.pendingQueue.set(preset, comboIndex);
    }
  }

  public flushQueue(): void {
    if (this.pendingQueue.size === 0) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    for (const [preset, combo] of this.pendingQueue.entries()) {
      const last = this.lastPlayedAt.get(preset) ?? -Infinity;
      if (now - last >= PRESET_COOLDOWN_MS[preset]) {
        this.lastPlayedAt.set(preset, now);
        this.playPreset(preset, combo);
      }
    }
    this.pendingQueue.clear();
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    delaySec = 0,
    waveOverride?: OscillatorType,
    gainScale = 1,
  ): void {
    if (this.muted || typeof window === 'undefined') return;
    if (!this.ctx) this.unlock();
    const ctx = this.ctx;
    const dest = this.masterGain ?? ctx?.destination;
    if (!ctx || !dest || ctx.state !== 'running') return;

    const start = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const oscType: OscillatorType =
      waveOverride ?? (this.waveform === 'chime' ? 'sine' : this.waveform);
    osc.type = oscType;
    osc.frequency.setValueAtTime(Math.max(40, freqStart), start);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), start + durationSec);
    }

    const peak = Math.max(0.001, this.volume * gainScale);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(start);
    osc.stop(start + durationSec + 0.02);

    if (this.waveform === 'chime' && !waveOverride) {
      const overtone = ctx.createOscillator();
      const overGain = ctx.createGain();
      overtone.type = 'triangle';
      overtone.frequency.setValueAtTime(freqStart * 2, start);
      overGain.gain.setValueAtTime(0.0001, start);
      overGain.gain.linearRampToValueAtTime(peak * 0.45, start + 0.008);
      overGain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec * 0.75);
      overtone.connect(overGain);
      overGain.connect(dest);
      overtone.start(start);
      overtone.stop(start + durationSec);
    }
  }

  public playNote(freq: number, durationSec = 0.34): void {
    this.unlock();
    this.playTone(freq, freq, durationSec, 0, undefined, 0.9);
  }

  public playPreset(preset: SoundPreset, comboIndex = 0): void {
    if (this.muted || typeof window === 'undefined') return;
    if (!this.ctx) this.unlock();

    const ratio = PENTATONIC_RATIOS[Math.max(0, Math.min(PENTATONIC_RATIOS.length - 1, comboIndex))];
    const jit = this.nextPitchJitter(0.06);

    switch (preset) {
      case 'jump':
        this.playTone(250 * jit, 560 * jit, 0.14, 0, 'square', 0.42);
        break;
      case 'bounce':
        this.playTone(300 * jit, 740 * jit, 0.17, 0, 'triangle', 0.68);
        break;
      case 'star':
        this.playTone(587 * ratio, 587 * ratio, 0.08, 0, 'sine', 0.65);
        this.playTone(880 * ratio, 932 * ratio, 0.18, 0.055, 'sine', 0.72);
        break;
      case 'stomp':
        this.playTone(380 * jit, 130, 0.12, 0, 'square', 0.55);
        this.playTone(520 * ratio, 740 * ratio, 0.11, 0.05, 'triangle', 0.52);
        break;
      case 'hurt':
        this.playTone(240, 95, 0.24, 0, 'sawtooth', 0.55);
        break;
      case 'laser':
        this.playTone(880 * jit, 300 * jit, 0.09, 0, 'square', 0.3);
        break;
      case 'explode':
        this.playTone(170 * jit, 48, 0.26, 0, 'sawtooth', 0.75);
        this.playTone(120 * jit, 42, 0.22, 0.03, 'square', 0.52);
        break;
      case 'ignite':
        this.playTone(460 * jit, 880 * jit, 0.11, 0, 'triangle', 0.48);
        break;
      case 'key':
        this.playTone(523.25, 523.25, 0.09, 0, 'triangle', 0.7);
        this.playTone(659.25, 659.25, 0.09, 0.07, 'triangle', 0.75);
        this.playTone(783.99, 783.99, 0.16, 0.14, 'triangle', 0.8);
        this.playTone(1046.5, 1046.5, 0.26, 0.22, 'sine', 0.85);
        break;
      case 'win':
        this.playTone(523.25, 523.25, 0.11, 0, 'triangle', 0.75);
        this.playTone(659.25, 659.25, 0.11, 0.1, 'triangle', 0.75);
        this.playTone(783.99, 783.99, 0.11, 0.2, 'triangle', 0.75);
        this.playTone(1046.5, 1046.5, 0.34, 0.3, 'sine', 0.9);
        this.playTone(1318.5, 1318.5, 0.34, 0.4, 'sine', 0.65);
        break;
      case 'snap':
        this.playTone(760 * jit, 520 * jit, 0.035, 0, 'sine', 0.3);
        break;
      case 'charge':
        this.playTone(440 * ratio, 740 * ratio, 0.09, 0, 'triangle', 0.42);
        this.playTone(660 * ratio, 1180 * ratio, 0.11, 0.02, 'sine', 0.38);
        break;
      case 'rail':
        this.playTone(760 * jit, 130, 0.2, 0, 'triangle', 0.72);
        this.playTone(260 * jit, 62, 0.24, 0.01, 'sawtooth', 0.54);
        this.playTone(1280 * jit, 460, 0.16, 0.015, 'sine', 0.42);
        break;
    }
  }

  /**
   * Two-stage mechanical/rubber-dome tactile click (crisp bandpass noise snap + housing thump).
   * Fires independently of game SFX queue with zero GC noise allocation.
   */
  public playTactile(profile: TactileSwitchProfile, phase: TactilePhase = 'down'): void {
    if (this.muted || typeof window === 'undefined') return;
    if (!this.ctx) this.unlock();
    const ctx = this.ctx;
    const dest = this.masterGain ?? ctx?.destination;
    if (!ctx || !dest || ctx.state !== 'running') return;

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const key = `${profile}:${phase}`;
    const last = this.lastTactileAt.get(key) ?? -Infinity;
    if (nowMs - last < 12) return;
    this.lastTactileAt.set(key, nowMs);

    const spec = TACTILE_SPECS[profile][phase];
    const jit = this.nextPitchJitter(0.045);
    const t0 = ctx.currentTime;
    const baseGain = this.volume * 1.15;

    if (this.noiseBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(spec.filterHz * jit, t0);
      bp.Q.setValueAtTime(spec.q, t0);

      const nGain = ctx.createGain();
      const dur = spec.clickMs / 1000;
      nGain.gain.setValueAtTime(0.0001, t0);
      nGain.gain.linearRampToValueAtTime(Math.max(0.002, baseGain * spec.noiseGain), t0 + 0.0012);
      nGain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      src.connect(bp);
      bp.connect(nGain);
      nGain.connect(dest);
      src.start(t0);
      src.stop(t0 + dur + 0.005);
    }

    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    const oDur = spec.thumpMs / 1000;
    osc.type = spec.thumpWave;
    osc.frequency.setValueAtTime(spec.thumpStartHz * jit, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(35, spec.thumpEndHz), t0 + oDur);
    oGain.gain.setValueAtTime(0.0001, t0);
    oGain.gain.linearRampToValueAtTime(Math.max(0.002, baseGain * spec.thumpGain), t0 + 0.0015);
    oGain.gain.exponentialRampToValueAtTime(0.0001, t0 + oDur);
    osc.connect(oGain);
    oGain.connect(dest);
    osc.start(t0);
    osc.stop(t0 + oDur + 0.005);
  }

  public setBgmTheme(theme: BgmTheme | null): void {
    if (this.bgmTheme === theme) return;
    this.bgmTheme = theme;
    this.bgmStep = 0;
    this.bgmTimer = 0;
  }

  public tickBgm(dt: number): void {
    if (this.muted || !this.bgmTheme || typeof window === 'undefined') return;
    if (!this.ctx || this.ctx.state !== 'running') return;
    const pat = BGM_PATTERNS[this.bgmTheme];
    this.bgmTimer += dt;
    if (this.bgmTimer < pat.stepSec) return;
    this.bgmTimer -= pat.stepSec;

    const idx = this.bgmStep % pat.lead.length;
    const leadNote = pat.lead[idx];
    const bassNote = pat.bass[idx];
    if (leadNote > 0) {
      const f = midiToFreq(leadNote);
      this.playTone(f, f, pat.stepSec * 0.85, 0, pat.leadWave, 0.14);
    }
    if (bassNote > 0) {
      const bf = midiToFreq(bassNote);
      this.playTone(bf, bf, pat.stepSec * 0.9, 0, 'triangle', 0.16);
    }
    this.bgmStep = (this.bgmStep + 1) % pat.lead.length;
  }
}

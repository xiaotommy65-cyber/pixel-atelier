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
  | 'snap';

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
};

export class ToySynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private muted = false;
  private waveform: SynthWaveform = 'triangle';
  private volume = 0.26;
  private jitterStep = 0;

  private pendingQueue = new Map<SoundPreset, number>();
  private lastPlayedAt = new Map<SoundPreset, number>();

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
    }
  }
}

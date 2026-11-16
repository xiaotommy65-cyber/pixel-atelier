import {
  TOY_PIANO_KEYS,
  type SoundPreset,
  type SynthWaveform,
  type ToySynth,
} from '../audio/ToySynth.ts';
import { bindMomentaryButton, btn, el } from './dom.ts';

const WAVE_OPTIONS: { id: SynthWaveform; label: string }[] = [
  { id: 'triangle', label: '🍦 奶霜三角波' },
  { id: 'square', label: '👾 復古方波' },
  { id: 'sine', label: '🫧 圓潤正弦波' },
  { id: 'chime', label: '🔔 八音盒鈴聲' },
];

const SFX_LIST: { preset: SoundPreset; label: string }[] = [
  { preset: 'jump', label: '🦘 彈跳音效' },
  { preset: 'star', label: '⭐ 吃星星鈴響' },
  { preset: 'stomp', label: '🍮 踩扁果凍' },
  { preset: 'laser', label: '⚡ 星糖光束' },
  { preset: 'key', label: '🔑 鑰匙和弦' },
  { preset: 'win', label: '🎉 通關慶祝曲' },
];

export class SynthPianoView {
  public readonly element: HTMLElement;
  private synth: ToySynth;
  private waveBtns = new Map<SynthWaveform, HTMLButtonElement>();
  private onPlayReact?: () => void;

  constructor(synth: ToySynth, onPlayReact?: () => void) {
    this.synth = synth;
    this.onPlayReact = onPlayReact;

    this.element = el('section', 'studio-card');

    const head = el('div', 'studio-head');
    head.innerHTML = `
      <div>
        <h2>🎹 晶片音效琴（Web Audio 零相依合成器）</h2>
        <p class="studio-sub">切換不同波形試彈五聲音階木琴，遊戲裡的所有音效都會即時跟著變色喔！</p>
      </div>
    `;

    // Waveform voices
    const waveRow = el('div', 'tool-row');
    for (const w of WAVE_OPTIONS) {
      const b = btn('toy-btn', w.label, undefined, () => {
        this.synth.unlock();
        this.synth.setWaveform(w.id);
        this.syncWaveButtons();
        this.synth.playNote(523.25, 0.25);
      });
      this.waveBtns.set(w.id, b);
      waveRow.appendChild(b);
    }

    // 8 Rainbow Piano Keys
    const keysGrid = el('div', 'piano-keys');
    for (const k of TOY_PIANO_KEYS) {
      const keyBtn = btn('piano-key', '');
      keyBtn.style.backgroundColor = k.color;
      keyBtn.innerHTML = `<span>${k.label}</span><span class="piano-note">${k.note}</span>`;
      bindMomentaryButton(keyBtn, () => {
        this.synth.unlock();
        this.synth.playNote(k.freq, 0.36);
        this.onPlayReact?.();
      });
      keysGrid.appendChild(keyBtn);
    }

    // SFX Preview Pads
    const sfxTitle = el('strong', undefined, '遊戲音效試聽鈕');
    const sfxGrid = el('div', 'sfx-grid');
    for (const sfx of SFX_LIST) {
      sfxGrid.appendChild(
        btn('toy-btn', sfx.label, undefined, () => {
          this.synth.unlock();
          this.synth.playPreset(sfx.preset);
          this.onPlayReact?.();
        }),
      );
    }

    this.element.append(head, waveRow, keysGrid, sfxTitle, sfxGrid);
    this.syncWaveButtons();
  }

  private syncWaveButtons(): void {
    const cur = this.synth.getWaveform();
    for (const [id, btn] of this.waveBtns.entries()) {
      btn.classList.toggle('is-active', id === cur);
    }
  }
}

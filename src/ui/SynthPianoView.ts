import {
  TOY_PIANO_KEYS,
  type SoundPreset,
  type SynthWaveform,
  type ToySynth,
} from '../audio/ToySynth.ts';

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

    this.element = document.createElement('section');
    this.element.className = 'studio-card';

    const head = document.createElement('div');
    head.className = 'studio-head';
    head.innerHTML = `
      <div>
        <h2>🎹 晶片音效琴（Web Audio 零相依合成器）</h2>
        <p class="studio-sub">切換不同波形試彈五聲音階木琴，遊戲裡的所有音效都會即時跟著變色喔！</p>
      </div>
    `;

    // Waveform voices
    const waveRow = document.createElement('div');
    waveRow.className = 'tool-row';
    for (const w of WAVE_OPTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toy-btn';
      btn.textContent = w.label;
      btn.addEventListener('click', () => {
        this.synth.unlock();
        this.synth.setWaveform(w.id);
        this.syncWaveButtons();
        this.synth.playNote(523.25, 0.25);
      });
      this.waveBtns.set(w.id, btn);
      waveRow.appendChild(btn);
    }

    // 8 Rainbow Piano Keys
    const keysGrid = document.createElement('div');
    keysGrid.className = 'piano-keys';
    for (const k of TOY_PIANO_KEYS) {
      const keyBtn = document.createElement('button');
      keyBtn.type = 'button';
      keyBtn.className = 'piano-key';
      keyBtn.style.backgroundColor = k.color;
      keyBtn.innerHTML = `<span>${k.label}</span><span class="piano-note">${k.note}</span>`;
      const playKey = () => {
        this.synth.unlock();
        this.synth.playNote(k.freq, 0.36);
        keyBtn.classList.add('is-ringing');
        setTimeout(() => keyBtn.classList.remove('is-ringing'), 180);
        this.onPlayReact?.();
      };
      keyBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        playKey();
      });
      keysGrid.appendChild(keyBtn);
    }

    // SFX Preview Pads
    const sfxTitle = document.createElement('strong');
    sfxTitle.textContent = '遊戲音效試聽鈕';
    const sfxGrid = document.createElement('div');
    sfxGrid.className = 'sfx-grid';
    for (const sfx of SFX_LIST) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toy-btn';
      btn.textContent = sfx.label;
      btn.addEventListener('click', () => {
        this.synth.unlock();
        this.synth.playPreset(sfx.preset);
        this.onPlayReact?.();
      });
      sfxGrid.appendChild(btn);
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

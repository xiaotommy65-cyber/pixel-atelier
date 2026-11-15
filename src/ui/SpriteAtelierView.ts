import type { ToySynth } from '../audio/ToySynth.ts';
import type { GpuEngine } from '../gpu/GpuEngine.ts';
import {
  DEFAULT_HERO_FRAME_A,
  DEFAULT_HERO_FRAME_B,
  PALETTE_RGB,
  TILE_PX,
  TOYBOX_PALETTE,
} from '../gpu/TextureAtlas.ts';

const HERO_STORAGE_KEY = 'pixel-atelier-hero-v1';

const BUNNY_PRESET_A: string[] = [
  '..11........11..',
  '.1441......1441.',
  '.1431......1341.',
  '.14411111111441.',
  '1222222222222221',
  '1221122222211221',
  '1233222442223321',
  '.12222222222221.',
  '..111448844111..',
  '..144448844441..',
  '..144224422441..',
  '...1444444441...',
  '...1122112211...',
  '...1221..1221...',
  '..1111....1111..',
  '................',
];

const BUNNY_PRESET_B: string[] = [
  '..11........11..',
  '.1441......1441.',
  '.1431......1341.',
  '.14411111111441.',
  '1222222222222221',
  '1221122222211221',
  '1233222442223321',
  '.12222222222221.',
  '..111448844111..',
  '.14444488444441.',
  '..144224422441..',
  '...1444444441...',
  '..11221..12211..',
  '..1221....1221..',
  '.1111......1111.',
  '................',
];

const BEAR_PRESET_A: string[] = [
  '.111........111.',
  '1898111111118981',
  '1888888888888881',
  '1882288888822881',
  '1881188338811881',
  '1888883113888881',
  '.18888333388881.',
  '..111aaaaa1111..',
  '..1aaaaaaaaaa1..',
  '..1aaa8888aaa1..',
  '...1aaaaaaaa1...',
  '...1199119911...',
  '...1991..1991...',
  '..1111....1111..',
  '................',
  '................',
];

const BEAR_PRESET_B: string[] = [
  '.111........111.',
  '1898111111118981',
  '1888888888888881',
  '1882288888822881',
  '1881188338811881',
  '1888883113888881',
  '.18888333388881.',
  '..111aaaaa1111..',
  '.1aaaaaaaaaaaa1.',
  '..1aaa8888aaa1..',
  '...1aaaaaaaa1...',
  '..11991..19911..',
  '..1991....1991..',
  '.1111......1111.',
  '................',
  '................',
];

const CHAR_IDX: Record<string, number> = {
  '.': 0,
  '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, a: 10, b: 11, c: 12, d: 13, e: 14, f: 15,
};

export class SpriteAtelierView {
  public readonly element: HTMLElement;

  private gpu: GpuEngine;
  private synth: ToySynth;
  private onHeroSaved?: () => void;

  private activeFrame: 'A' | 'B' = 'A';
  private selectedColor = 4; // strawberry coral default
  private mirrorX = false;
  private fillMode = false;
  private isDrawing = false;

  private cellEls: HTMLDivElement[] = [];
  private paletteEls: HTMLButtonElement[] = [];
  private frameABtn: HTMLButtonElement;
  private frameBBtn: HTMLButtonElement;
  private mirrorBtn: HTMLButtonElement;
  private fillBtn: HTMLButtonElement;
  private previewCanvas: HTMLCanvasElement;
  private animPhase = 0;

  constructor(gpu: GpuEngine, synth: ToySynth, onHeroSaved?: () => void) {
    this.gpu = gpu;
    this.synth = synth;
    this.onHeroSaved = onHeroSaved;
    this.restoreFromStorage();

    this.element = document.createElement('section');
    this.element.className = 'studio-card';

    const head = document.createElement('div');
    head.className = 'studio-head';
    head.innerHTML = `
      <div>
        <h2>🎨 精靈畫室（16×16 主角造型工作台）</h2>
        <p class="studio-sub">手繪的主角動作會即時上傳到 GPU 紋理圖集，立刻在遊戲裡奔跑跳躍！</p>
      </div>
    `;

    const frameSwitch = document.createElement('div');
    frameSwitch.className = 'tool-row';
    this.frameABtn = document.createElement('button');
    this.frameABtn.type = 'button';
    this.frameABtn.className = 'toy-btn is-active';
    this.frameABtn.textContent = '動作 A（站立）';
    this.frameABtn.addEventListener('click', () => {
      this.activeFrame = 'A';
      this.syncToolbarState();
      this.renderBoard();
    });

    this.frameBBtn = document.createElement('button');
    this.frameBBtn.type = 'button';
    this.frameBBtn.className = 'toy-btn';
    this.frameBBtn.textContent = '動作 B（跑步/跳躍）';
    this.frameBBtn.addEventListener('click', () => {
      this.activeFrame = 'B';
      this.syncToolbarState();
      this.renderBoard();
    });
    frameSwitch.append(this.frameABtn, this.frameBBtn);
    head.appendChild(frameSwitch);

    const layout = document.createElement('div');
    layout.className = 'atelier-grid-layout';

    // 16x16 Pixel Canvas Grid
    const board = document.createElement('div');
    board.className = 'pixel-board';
    board.addEventListener('pointerleave', () => {
      this.isDrawing = false;
    });
    window.addEventListener('pointerup', () => {
      this.isDrawing = false;
    });

    for (let i = 0; i < TILE_PX * TILE_PX; i++) {
      const cell = document.createElement('div');
      cell.className = 'pixel-cell';
      const x = i % TILE_PX;
      const y = Math.floor(i / TILE_PX);
      cell.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.synth.unlock();
        this.isDrawing = true;
        this.applyPaintAt(x, y);
      });
      cell.addEventListener('pointerenter', () => {
        if (this.isDrawing && !this.fillMode) {
          this.applyPaintAt(x, y);
        }
      });
      this.cellEls.push(cell);
      board.appendChild(cell);
    }

    // Sidebar controls
    const sidebar = document.createElement('div');
    sidebar.className = 'atelier-sidebar';

    const previewStrip = document.createElement('div');
    previewStrip.className = 'preview-strip';
    this.previewCanvas = document.createElement('canvas');
    this.previewCanvas.className = 'preview-canvas';
    this.previewCanvas.width = 16;
    this.previewCanvas.height = 16;
    const previewInfo = document.createElement('div');
    previewInfo.innerHTML =
      '<strong>即時動畫預覽</strong><div class="studio-sub">自動循環播放 A / B 動作影格</div>';
    previewStrip.append(this.previewCanvas, previewInfo);

    // 16-Color Master Palette
    const paletteGrid = document.createElement('div');
    paletteGrid.className = 'palette-grid';
    TOYBOX_PALETTE.forEach((hex, idx) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = idx === 0 ? 'palette-chip is-eraser' : 'palette-chip';
      chip.title = idx === 0 ? '透明橡皮擦' : `色票 ${idx} (${hex})`;
      if (idx > 0) chip.style.backgroundColor = hex;
      chip.addEventListener('click', () => {
        this.synth.playPreset('snap');
        this.selectedColor = idx;
        this.syncPaletteSelection();
      });
      this.paletteEls.push(chip);
      paletteGrid.appendChild(chip);
    });

    // Paint Tools
    const tools = document.createElement('div');
    tools.className = 'tool-row';

    this.mirrorBtn = document.createElement('button');
    this.mirrorBtn.type = 'button';
    this.mirrorBtn.className = 'toy-btn';
    this.mirrorBtn.textContent = '🪞 左右對稱';
    this.mirrorBtn.addEventListener('click', () => {
      this.mirrorX = !this.mirrorX;
      this.syncToolbarState();
    });

    this.fillBtn = document.createElement('button');
    this.fillBtn.type = 'button';
    this.fillBtn.className = 'toy-btn';
    this.fillBtn.textContent = '🪣 油漆桶填色';
    this.fillBtn.addEventListener('click', () => {
      this.fillMode = !this.fillMode;
      this.syncToolbarState();
    });

    const copyABtn = document.createElement('button');
    copyABtn.type = 'button';
    copyABtn.className = 'toy-btn';
    copyABtn.textContent = '📋 複製 A→B';
    copyABtn.addEventListener('click', () => {
      this.gpu.atlas.heroPixelsB.set(this.gpu.atlas.heroPixelsA);
      this.commitAtlasUpdate();
      this.renderBoard();
    });

    tools.append(this.mirrorBtn, this.fillBtn, copyABtn);

    // Character Presets
    const presetRow = document.createElement('div');
    presetRow.className = 'tool-row';
    const addPresetBtn = (label: string, gridA: string[], gridB: string[]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toy-btn is-mint';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        this.synth.unlock();
        this.synth.playPreset('star');
        this.writeGridToBuffer(gridA, this.gpu.atlas.heroPixelsA);
        this.writeGridToBuffer(gridB, this.gpu.atlas.heroPixelsB);
        this.commitAtlasUpdate();
        this.renderBoard();
      });
      presetRow.appendChild(btn);
    };
    addPresetBtn('🌱 嫩芽騎士', DEFAULT_HERO_FRAME_A, DEFAULT_HERO_FRAME_B);
    addPresetBtn('🍓 草莓小兔', BUNNY_PRESET_A, BUNNY_PRESET_B);
    addPresetBtn('🍯 蜂蜜小熊', BEAR_PRESET_A, BEAR_PRESET_B);

    sidebar.append(previewStrip, paletteGrid, tools, presetRow);
    layout.append(board, sidebar);
    this.element.append(head, layout);

    this.syncPaletteSelection();
    this.syncToolbarState();
    this.renderBoard();
  }

  private writeGridToBuffer(grid: string[], out: Uint8Array): void {
    for (let y = 0; y < TILE_PX; y++) {
      const row = grid[y] ?? '';
      for (let x = 0; x < TILE_PX; x++) {
        out[y * TILE_PX + x] = CHAR_IDX[row[x] ?? '.'] ?? 0;
      }
    }
  }

  private getCurrentBuffer(): Uint8Array {
    return this.activeFrame === 'A' ? this.gpu.atlas.heroPixelsA : this.gpu.atlas.heroPixelsB;
  }

  private applyPaintAt(x: number, y: number): void {
    const buf = this.getCurrentBuffer();
    if (this.fillMode) {
      this.floodFill(buf, x, y, this.selectedColor);
      this.synth.playPreset('bounce');
    } else {
      buf[y * TILE_PX + x] = this.selectedColor;
      if (this.mirrorX) {
        buf[y * TILE_PX + (TILE_PX - 1 - x)] = this.selectedColor;
      }
      this.synth.playPreset('snap');
    }
    this.commitAtlasUpdate();
    this.renderBoard();
  }

  private floodFill(buf: Uint8Array, sx: number, sy: number, targetColor: number): void {
    const orig = buf[sy * TILE_PX + sx];
    if (orig === targetColor) return;
    const queue: [number, number][] = [[sx, sy]];
    while (queue.length > 0) {
      const [cx, cy] = queue.pop()!;
      const idx = cy * TILE_PX + cx;
      if (buf[idx] !== orig) continue;
      buf[idx] = targetColor;
      if (cx > 0) queue.push([cx - 1, cy]);
      if (cx < TILE_PX - 1) queue.push([cx + 1, cy]);
      if (cy > 0) queue.push([cx, cy - 1]);
      if (cy < TILE_PX - 1) queue.push([cx, cy + 1]);
    }
  }

  private commitAtlasUpdate(): void {
    this.gpu.syncAtlasToGpu();
    try {
      const payload = {
        a: Array.from(this.gpu.atlas.heroPixelsA),
        b: Array.from(this.gpu.atlas.heroPixelsB),
      };
      localStorage.setItem(HERO_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota issues cleanly
    }
    this.onHeroSaved?.();
  }

  private restoreFromStorage(): void {
    try {
      const raw = localStorage.getItem(HERO_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { a?: number[]; b?: number[] };
      if (Array.isArray(parsed.a) && parsed.a.length === TILE_PX * TILE_PX) {
        this.gpu.atlas.heroPixelsA.set(parsed.a);
      }
      if (Array.isArray(parsed.b) && parsed.b.length === TILE_PX * TILE_PX) {
        this.gpu.atlas.heroPixelsB.set(parsed.b);
      }
      this.gpu.syncAtlasToGpu();
    } catch {
      // Ignore corrupted local cache
    }
  }

  private syncPaletteSelection(): void {
    this.paletteEls.forEach((chip, i) => {
      chip.classList.toggle('is-selected', i === this.selectedColor);
    });
  }

  private syncToolbarState(): void {
    this.frameABtn.classList.toggle('is-active', this.activeFrame === 'A');
    this.frameBBtn.classList.toggle('is-active', this.activeFrame === 'B');
    this.mirrorBtn.classList.toggle('is-active', this.mirrorX);
    this.fillBtn.classList.toggle('is-active', this.fillMode);
  }

  public renderBoard(): void {
    const buf = this.getCurrentBuffer();
    for (let i = 0; i < TILE_PX * TILE_PX; i++) {
      const idx = buf[i];
      this.cellEls[i].style.backgroundColor = idx === 0 ? 'transparent' : TOYBOX_PALETTE[idx];
    }
  }

  public tickPreview(dt: number): void {
    this.animPhase += dt * 4;
    const buf =
      Math.floor(this.animPhase) % 2 === 0
        ? this.gpu.atlas.heroPixelsA
        : this.gpu.atlas.heroPixelsB;
    const ctx = this.previewCanvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(TILE_PX, TILE_PX);
    for (let i = 0; i < TILE_PX * TILE_PX; i++) {
      const [r, g, b, a] = PALETTE_RGB[buf[i]] ?? [0, 0, 0, 0];
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
  }
}

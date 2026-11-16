import type { ToySynth } from '../audio/ToySynth.ts';
import type { SaveService } from '../engine/SaveService.ts';
import type { GpuEngine } from '../gpu/GpuEngine.ts';
import {
  DEFAULT_HERO_FRAME_A,
  DEFAULT_HERO_FRAME_B,
  parseGridToIndices,
  TILE_PX,
  TOYBOX_PALETTE,
} from '../gpu/TextureAtlas.ts';
import { drawIndexBufferToCanvas } from './MomoMascot.ts';
import { btn, el } from './dom.ts';

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

export class SpriteAtelierView {
  public readonly element: HTMLElement;

  private gpu: GpuEngine;
  private synth: ToySynth;
  private save: SaveService;
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

  constructor(gpu: GpuEngine, synth: ToySynth, save: SaveService, onHeroSaved?: () => void) {
    this.gpu = gpu;
    this.synth = synth;
    this.save = save;
    this.onHeroSaved = onHeroSaved;
    this.restoreFromStorage();

    this.element = el('section', 'studio-card');

    const head = el('div', 'studio-head');
    head.innerHTML = `
      <div>
        <h2>🎨 精靈畫室（16×16 主角造型工作台）</h2>
        <p class="studio-sub">手繪的主角動作會即時上傳到 GPU 紋理圖集，立刻在遊戲裡奔跑跳躍！</p>
      </div>
    `;

    const frameSwitch = el('div', 'tool-row');
    this.frameABtn = btn('toy-btn is-active', '動作 A（站立）', undefined, () => {
      this.activeFrame = 'A';
      this.syncToolbarState();
      this.renderBoard();
    });
    this.frameBBtn = btn('toy-btn', '動作 B（跑步/跳躍）', undefined, () => {
      this.activeFrame = 'B';
      this.syncToolbarState();
      this.renderBoard();
    });
    frameSwitch.append(this.frameABtn, this.frameBBtn);
    head.appendChild(frameSwitch);

    const layout = el('div', 'atelier-grid-layout');

    // 16x16 Pixel Canvas Grid
    const board = el('div', 'pixel-board');
    board.addEventListener('pointerleave', () => {
      this.isDrawing = false;
    });
    window.addEventListener('pointerup', () => {
      this.isDrawing = false;
    });

    for (let i = 0; i < TILE_PX * TILE_PX; i++) {
      const cell = el('div', 'pixel-cell');
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
    const sidebar = el('div', 'atelier-sidebar');

    const previewStrip = el('div', 'preview-strip');
    this.previewCanvas = el('canvas', 'preview-canvas');
    this.previewCanvas.width = 16;
    this.previewCanvas.height = 16;
    const previewInfo = el('div');
    previewInfo.innerHTML =
      '<strong>即時動畫預覽</strong><div class="studio-sub">自動循環播放 A / B 動作影格</div>';
    previewStrip.append(this.previewCanvas, previewInfo);

    // 16-Color Master Palette
    const paletteGrid = el('div', 'palette-grid');
    TOYBOX_PALETTE.forEach((hex, idx) => {
      const chip = btn(
        idx === 0 ? 'palette-chip is-eraser' : 'palette-chip',
        '',
        idx === 0 ? '透明橡皮擦' : `色票 ${idx} (${hex})`,
        () => {
          this.selectedColor = idx;
          this.syncPaletteSelection();
        },
      );
      if (idx > 0) chip.style.backgroundColor = hex;
      this.paletteEls.push(chip);
      paletteGrid.appendChild(chip);
    });

    // Paint Tools
    const tools = el('div', 'tool-row');

    this.mirrorBtn = btn('toy-btn', '🪞 左右對稱', undefined, () => {
      this.mirrorX = !this.mirrorX;
      this.syncToolbarState();
    });

    this.fillBtn = btn('toy-btn', '🪣 油漆桶填色', undefined, () => {
      this.fillMode = !this.fillMode;
      this.syncToolbarState();
    });

    const copyABtn = btn('toy-btn', '📋 複製 A→B', undefined, () => {
      this.gpu.atlas.heroPixelsB.set(this.gpu.atlas.heroPixelsA);
      this.commitAtlasUpdate();
      this.renderBoard();
    });

    tools.append(this.mirrorBtn, this.fillBtn, copyABtn);

    // Character Presets
    const presetRow = el('div', 'tool-row');
    const addPresetBtn = (label: string, gridA: string[], gridB: string[]) => {
      presetRow.appendChild(
        btn('toy-btn is-mint', label, undefined, () => {
          this.synth.unlock();
          this.synth.playPreset('star');
          parseGridToIndices(gridA, this.gpu.atlas.heroPixelsA);
          parseGridToIndices(gridB, this.gpu.atlas.heroPixelsB);
          this.commitAtlasUpdate();
          this.renderBoard();
        }),
      );
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
    this.save.saveHeroSprites(this.gpu.atlas.heroPixelsA, this.gpu.atlas.heroPixelsB);
    this.onHeroSaved?.();
  }

  private restoreFromStorage(): void {
    const parsed = this.save.getHeroSprites();
    if (!parsed) return;
    if (Array.isArray(parsed.a) && parsed.a.length === TILE_PX * TILE_PX) {
      this.gpu.atlas.heroPixelsA.set(parsed.a);
    }
    if (Array.isArray(parsed.b) && parsed.b.length === TILE_PX * TILE_PX) {
      this.gpu.atlas.heroPixelsB.set(parsed.b);
    }
    this.gpu.syncAtlasToGpu();
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
    drawIndexBufferToCanvas(buf, this.previewCanvas);
  }
}

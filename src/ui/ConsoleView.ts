import type { ToySynth } from '../audio/ToySynth.ts';
import { CARTRIDGES, getCartridgeMeta } from '../engine/CartridgeRegistry.ts';
import type { CartridgeRunner } from '../engine/CartridgeRunner.ts';
import type { CartridgeId, InputState, RenderSceneSnapshot } from '../engine/WorldTypes.ts';
import type { GpuFrameStats } from '../gpu/GpuTypes.ts';
import type { TextureAtlas } from '../gpu/TextureAtlas.ts';
import { renderCardArt } from './CardArt.ts';

export type ConsolePhase = 'empty' | 'booting' | 'running';

const BOOT_SEC = 1.35;
const SLOT_CARD_W = 46;

type Dir = 'left' | 'right' | 'up' | 'down';

function blankInput(): InputState {
  return { left: false, right: false, up: false, down: false, jump: false, action: false, restart: false };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Switch-style handheld: Joy-Con (L) | screen body | Joy-Con (R),
 * with a top cartridge slot and a game card case you tap or drag cards from.
 */
export class ConsoleView {
  public readonly element: HTMLElement;
  public readonly canvas: HTMLCanvasElement;

  private runner: CartridgeRunner;
  private synth: ToySynth;
  private atlas: TextureAtlas;
  private onMomoReact?: () => void;

  private phase: ConsolePhase = 'empty';
  private inserted: CartridgeId | null = null;
  private bootTimer = 0;
  private busy = false;
  private captureRequested = false;
  private lastBannerState: 'playing' | 'won' | 'lost' = 'playing';

  private cardEls = new Map<CartridgeId, HTMLElement>();
  private cardArtImgs = new Map<CartridgeId, HTMLImageElement[]>();
  private slotEl: HTMLElement;
  private slotWindow: HTMLElement;
  private slotCardEl: HTMLElement | null = null;
  private slotHint: HTMLElement;
  private ejectBtn: HTMLButtonElement;
  private screenFrame: HTMLElement;
  private insertPrompt: HTMLElement;
  private bootLayer: HTMLElement | null = null;
  private resultOverlay: HTMLElement;
  private resultTitle: HTMLElement;
  private resultDesc: HTMLElement;
  private benchBtn: HTMLButtonElement;
  private scoreTag: HTMLElement;
  private starTag: HTMLElement;
  private spriteStatTag: HTMLElement;
  private fpsTag: HTMLElement;
  private statusHintEl: HTMLElement;

  private touchInput = blankInput();
  private keyInput = blankInput();
  private stickInput: Record<Dir, boolean> = { left: false, right: false, up: false, down: false };

  constructor(runner: CartridgeRunner, synth: ToySynth, atlas: TextureAtlas, onMomoReact?: () => void) {
    this.runner = runner;
    this.synth = synth;
    this.atlas = atlas;
    this.onMomoReact = onMomoReact;

    this.element = el('section', 'switch-stage');
    const consoleEl = el('div', 'switch-console');

    // ---------- Joy-Con L ----------
    const left = el('div', 'joycon is-left');
    const lTop = el('div', 'jc-row');
    const minusBtn = el('button', 'jc-sys-btn', '−');
    minusBtn.type = 'button';
    minusBtn.title = '− 換下一張卡匣';
    minusBtn.addEventListener('click', () => this.cycleCard());
    lTop.appendChild(minusBtn);

    const lStick = this.buildStick();
    const dirs = el('div', 'diamond');
    dirs.append(
      this.holdButton('dia-btn dia-n', '▲', 'up', '上'),
      this.holdButton('dia-btn dia-w', '◀', 'left', '左'),
      this.holdButton('dia-btn dia-e', '▶', 'right', '右'),
      this.holdButton('dia-btn dia-s', '▼', 'down', '下'),
    );

    const lBottom = el('div', 'jc-row');
    const captureBtn = el('button', 'jc-sys-btn is-square', '◉');
    captureBtn.type = 'button';
    captureBtn.title = '截圖：把現在的遊戲畫面存成 PNG';
    captureBtn.addEventListener('click', () => this.requestCapture());
    lBottom.appendChild(captureBtn);
    left.append(lTop, lStick, dirs, lBottom);

    // ---------- Console body ----------
    const body = el('div', 'console-body');
    const vol = el('div', 'top-vol');
    vol.append(el('span'), el('span'));

    this.slotEl = el('div', 'cart-slot is-empty');
    this.slotWindow = el('div', 'slot-window');
    this.slotEl.append(this.slotWindow, el('div', 'slot-mouth'));

    const slotSide = el('div', 'slot-side');
    this.slotHint = el('span', 'slot-hint', '◀ 卡槽：把下面的卡匣拖進來！');
    this.ejectBtn = el('button', 'eject-btn panel-hidden', '⏏ 退出卡匣');
    this.ejectBtn.type = 'button';
    this.ejectBtn.addEventListener('click', () => this.eject());
    slotSide.append(this.slotHint, this.ejectBtn);

    const topbar = el('div', 'screen-topbar');
    const mLeft = el('div', 'screen-metrics');
    this.scoreTag = el('span', 'metric-tag', '分數 0');
    this.starTag = el('span', 'metric-tag', '★ 0/0');
    mLeft.append(this.scoreTag, this.starTag);
    const mRight = el('div', 'screen-metrics');
    this.spriteStatTag = el('span', 'metric-tag', '精靈 0 · 0 draws');
    this.fpsTag = el('span', 'metric-tag', '60 FPS');
    mRight.append(this.spriteStatTag, this.fpsTag);
    topbar.append(mLeft, mRight);

    this.screenFrame = el('div', 'screen-frame');
    this.canvas = el('canvas', 'game-canvas');
    this.canvas.width = 960;
    this.canvas.height = 540;

    this.insertPrompt = el('div', 'screen-overlay insert-prompt');
    this.insertPrompt.appendChild(el('div', 'insert-pill', '⬆ 請插入遊戲卡匣'));

    this.resultOverlay = el('div', 'screen-overlay is-dim panel-hidden');
    const card = el('div', 'overlay-card');
    this.resultTitle = el('h3');
    this.resultDesc = el('p');
    const replayBtn = el('button', 'toy-btn is-primary', '✨ 再玩一次！');
    replayBtn.type = 'button';
    replayBtn.addEventListener('click', () => {
      this.synth.unlock();
      this.synth.playPreset('snap');
      this.runner.restart();
    });
    card.append(this.resultTitle, this.resultDesc, replayBtn);
    this.resultOverlay.appendChild(card);
    this.screenFrame.append(this.canvas, this.insertPrompt, this.resultOverlay);

    this.statusHintEl = el('div', 'screen-status-hint', '從卡匣收納盒挑一張遊戲卡插進主機吧！');

    const footer = el('div', 'body-footer');
    const speakerL = el('div', 'speaker');
    const speakerR = el('div', 'speaker');
    for (let i = 0; i < 8; i++) {
      speakerL.appendChild(el('span'));
      speakerR.appendChild(el('span'));
    }
    const legend = el('div', 'body-legend', 'B 跳躍 · A 星光 · X 精靈派對 · + 重開 · ⌂ 退卡 · ◉ 截圖');
    this.benchBtn = el('button', 'bench-btn', '✨ 1,150+ GPU 精靈派對');
    this.benchBtn.type = 'button';
    this.benchBtn.addEventListener('click', () => this.toggleBenchmark());
    footer.append(speakerL, legend, this.benchBtn, speakerR);

    body.append(vol, this.slotEl, slotSide, topbar, this.screenFrame, this.statusHintEl, footer);

    // ---------- Joy-Con R ----------
    const right = el('div', 'joycon is-right');
    const rTop = el('div', 'jc-row');
    const plusBtn = el('button', 'jc-sys-btn', '+');
    plusBtn.type = 'button';
    plusBtn.title = '+ 重新開始這張卡匣';
    plusBtn.addEventListener('click', () => {
      this.synth.unlock();
      this.synth.playPreset('snap');
      if (this.phase !== 'empty') this.runner.restart();
    });
    rTop.appendChild(plusBtn);

    const abxy = el('div', 'diamond');
    const xBtn = el('button', 'dia-btn is-x dia-n', 'X');
    xBtn.type = 'button';
    xBtn.title = 'X：1,150+ GPU 精靈派對';
    xBtn.addEventListener('click', () => this.toggleBenchmark());
    abxy.append(
      xBtn,
      this.holdButton('dia-btn is-y dia-w', 'Y', 'jump', 'Y：跳躍'),
      this.holdButton('dia-btn is-a dia-e', 'A', 'action', 'A：星光 / 特技'),
      this.holdButton('dia-btn is-b dia-s', 'B', 'jump', 'B：跳躍 / 發射'),
    );
    const rStick = this.buildStick();
    const rBottom = el('div', 'jc-row');
    const homeBtn = el('button', 'jc-sys-btn is-home', '⌂');
    homeBtn.type = 'button';
    homeBtn.title = 'HOME：退出卡匣回到主畫面';
    homeBtn.addEventListener('click', () => this.eject());
    rBottom.appendChild(homeBtn);
    right.append(rTop, abxy, rStick, rBottom);

    consoleEl.append(left, body, right);

    // ---------- Game card case ----------
    const caseEl = el('div', 'card-case');
    const caseHead = el('div', 'case-head');
    caseHead.append(
      el('strong', undefined, '🗂️ 卡匣收納盒'),
      el('span', undefined, '點一下，或把卡匣拖到主機上方卡槽插入'),
    );
    const row = el('div', 'card-row');
    for (const meta of CARTRIDGES) {
      const c = el('div', 'game-card');
      c.dataset.cartridge = meta.id;
      c.style.setProperty('--card-accent', meta.accentHex);
      c.title = `${meta.title}｜${meta.goalHint}`;
      const art = el('img', 'card-art');
      art.alt = meta.title;
      art.draggable = false;
      c.append(
        el('span', 'card-code', meta.code),
        art,
        el('span', 'card-title', meta.title),
        el('span', 'card-genre', meta.genre),
      );
      this.registerArt(meta.id, art);
      this.bindCardDrag(c, meta.id);
      this.cardEls.set(meta.id, c);
      row.appendChild(c);
    }
    caseEl.append(caseHead, row);

    this.element.append(consoleEl, caseEl);
    this.refreshCardArt();
    this.installKeyboard();
  }

  // ================= public API =================

  public getPhase(): ConsolePhase {
    return this.phase;
  }

  public getInserted(): CartridgeId | null {
    return this.inserted;
  }

  public tick(dt: number): void {
    if (this.phase !== 'booting') return;
    this.bootTimer -= dt;
    if (this.bootTimer <= 0) {
      this.phase = 'running';
      this.bootLayer?.remove();
      this.bootLayer = null;
    }
  }

  public getInput(): InputState {
    const t = this.touchInput;
    const k = this.keyInput;
    const s = this.stickInput;
    return {
      left: t.left || k.left || s.left,
      right: t.right || k.right || s.right,
      up: t.up || k.up || s.up,
      down: t.down || k.down || s.down,
      jump: t.jump || k.jump,
      action: t.action || k.action,
      restart: t.restart || k.restart,
    };
  }

  public requestCapture(): void {
    this.synth.unlock();
    this.synth.playPreset('snap');
    this.captureRequested = true;
    const flash = el('div', 'capture-flash');
    this.screenFrame.appendChild(flash);
    setTimeout(() => flash.remove(), 420);
  }

  public consumeCaptureRequest(): boolean {
    const r = this.captureRequested;
    this.captureRequested = false;
    return r;
  }

  /** Re-draws card labels (e.g. after the hero sprite was repainted). */
  public refreshCardArt(): void {
    for (const meta of CARTRIDGES) {
      const url = renderCardArt(this.atlas, meta.id);
      for (const img of this.cardArtImgs.get(meta.id) ?? []) img.src = url;
    }
  }

  public insertCartridge(id: CartridgeId, instant = false): void {
    if (this.busy) return;
    if (this.inserted === id) {
      // Same card: just reboot it.
      this.runner.switchCartridge(id);
      this.startBoot(id);
      return;
    }
    const doInsert = () => {
      const src = this.cardEls.get(id);
      if (!src) return;
      const finish = () => {
        src.classList.add('is-out');
        this.inserted = id;
        this.mountSlotCard(id);
        this.runner.switchCartridge(id);
        this.startBoot(id);
        this.busy = false;
      };
      this.synth.unlock();
      this.synth.playPreset('snap');
      if (instant) {
        src.style.transform = '';
        finish();
      } else {
        this.busy = true;
        this.flyCard(src, finish);
      }
    };
    if (this.inserted) this.eject(doInsert, instant);
    else doInsert();
  }

  public eject(after?: () => void, instant = false): void {
    if (this.busy) return;
    const id = this.inserted;
    if (!id) {
      after?.();
      return;
    }
    this.synth.unlock();
    this.synth.playPreset('bounce');
    this.inserted = null;
    this.phase = 'empty';
    this.bootLayer?.remove();
    this.bootLayer = null;
    const slotCard = this.slotCardEl;
    const done = () => {
      slotCard?.remove();
      if (this.slotCardEl === slotCard) this.slotCardEl = null;
      const c = this.cardEls.get(id);
      if (c) {
        c.classList.remove('is-out');
        c.classList.add('is-returning');
        setTimeout(() => c.classList.remove('is-returning'), 400);
      }
      this.showEmptyState();
      this.busy = false;
      after?.();
    };
    if (instant || !slotCard) {
      done();
    } else {
      this.busy = true;
      slotCard.classList.add('is-ejecting');
      setTimeout(done, 300);
    }
  }

  public updateHud(snap: RenderSceneSnapshot, stats: GpuFrameStats, fps: number): void {
    this.scoreTag.textContent = `分數 ${snap.score}`;
    this.starTag.textContent = `★ ${snap.starsCollected}/${snap.starsTotal}`;
    this.updateStats(stats, fps);
    this.statusHintEl.textContent = snap.statusBanner;

    if (snap.status !== this.lastBannerState) {
      this.lastBannerState = snap.status;
      if (snap.status === 'won') {
        this.resultTitle.textContent = '🎉 太棒了！卡匣過關！';
        this.resultDesc.textContent = `本次分數 ${snap.score} 分，Momo 開心到在卡槽旁邊跳舞！`;
        this.resultOverlay.classList.remove('panel-hidden');
        this.onMomoReact?.();
      } else if (snap.status === 'lost') {
        this.resultTitle.textContent = '💫 愛心用完囉～';
        this.resultDesc.textContent = '再挑戰一次，或去積木工房把重力調輕一點！';
        this.resultOverlay.classList.remove('panel-hidden');
      } else {
        this.resultOverlay.classList.add('panel-hidden');
      }
    }
  }

  public updateStats(stats: GpuFrameStats, fps: number): void {
    this.spriteStatTag.textContent = `精靈 ${stats.spriteCount} · ${stats.drawCalls} draws`;
    this.fpsTag.textContent = `${Math.round(fps)} FPS`;
  }

  // ================= internals =================

  private registerArt(id: CartridgeId, img: HTMLImageElement): void {
    const list = this.cardArtImgs.get(id) ?? [];
    list.push(img);
    this.cardArtImgs.set(id, list);
  }

  private startBoot(id: CartridgeId): void {
    const meta = getCartridgeMeta(id);
    this.phase = 'booting';
    this.bootTimer = BOOT_SEC;
    this.lastBannerState = 'playing';
    this.resultOverlay.classList.add('panel-hidden');
    this.insertPrompt.classList.add('panel-hidden');
    this.slotEl.classList.remove('is-empty');
    this.slotHint.classList.add('panel-hidden');
    this.ejectBtn.classList.remove('panel-hidden');
    this.statusHintEl.textContent = meta.controlsHint;

    this.bootLayer?.remove();
    const boot = el('div', 'screen-overlay boot-splash');
    boot.style.setProperty('--boot-accent', meta.accentHex);
    const art = el('img', 'boot-art');
    art.alt = meta.title;
    art.src = renderCardArt(this.atlas, id);
    const bar = el('div', 'boot-bar');
    bar.appendChild(el('span'));
    boot.append(art, el('h3', 'boot-title', meta.title), el('span', 'boot-brand', 'PIXEL ATELIER · GAME CARD'), bar);
    this.screenFrame.appendChild(boot);
    this.bootLayer = boot;
    this.synth.playPreset('key');
    this.onMomoReact?.();
  }

  private showEmptyState(): void {
    this.insertPrompt.classList.remove('panel-hidden');
    this.resultOverlay.classList.add('panel-hidden');
    this.slotEl.classList.add('is-empty');
    this.slotHint.classList.remove('panel-hidden');
    this.ejectBtn.classList.add('panel-hidden');
    this.scoreTag.textContent = '分數 0';
    this.starTag.textContent = '★ 0/0';
    this.statusHintEl.textContent = '從卡匣收納盒挑一張遊戲卡插進主機吧！';
  }

  private mountSlotCard(id: CartridgeId): void {
    const meta = getCartridgeMeta(id);
    this.slotCardEl?.remove();
    const mini = el('div', 'slot-card', meta.code);
    mini.style.setProperty('--card-accent', meta.accentHex);
    mini.title = `${meta.title}（點一下退出）`;
    mini.addEventListener('click', () => this.eject());
    this.slotWindow.appendChild(mini);
    this.slotCardEl = mini;
  }

  /** FLIP-style flight of a cloned card from the case into the top slot. */
  private flyCard(from: HTMLElement, done: () => void): void {
    const a = from.getBoundingClientRect();
    const b = this.slotWindow.getBoundingClientRect();
    const ghost = from.cloneNode(true) as HTMLElement;
    ghost.classList.remove('is-dragging');
    ghost.classList.add('card-ghost');
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${a.left}px`,
      top: `${a.top}px`,
      width: `${a.width}px`,
      height: `${a.height}px`,
      margin: '0',
      transform: 'none',
      zIndex: '60',
    });
    from.style.transform = '';
    from.classList.add('is-flying');
    document.body.appendChild(ghost);

    const scale = SLOT_CARD_W / a.width;
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + (a.height * scale) / 2 - (a.top + a.height / 2);
    void ghost.offsetWidth;
    ghost.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;

    let finished = false;
    const fin = () => {
      if (finished) return;
      finished = true;
      ghost.remove();
      from.classList.remove('is-flying');
      done();
    };
    ghost.addEventListener('transitionend', fin, { once: true });
    setTimeout(fin, 650);
  }

  private isOverDropZone(x: number, y: number): boolean {
    const zones = [this.slotEl.getBoundingClientRect(), this.screenFrame.getBoundingClientRect()];
    return zones.some((r) => x >= r.left - 24 && x <= r.right + 24 && y >= r.top - 24 && y <= r.bottom + 24);
  }

  private bindCardDrag(card: HTMLElement, id: CartridgeId): void {
    card.addEventListener('pointerdown', (e) => {
      if (this.busy || card.classList.contains('is-out')) return;
      e.preventDefault();
      this.synth.unlock();
      const sx = e.clientX;
      const sy = e.clientY;
      let dragging = false;
      card.setPointerCapture(e.pointerId);

      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!dragging && Math.hypot(dx, dy) > 8) {
          dragging = true;
          card.classList.add('is-dragging');
        }
        if (dragging) {
          card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.04}deg) scale(1.06)`;
          this.slotEl.classList.toggle('is-hot', this.isOverDropZone(ev.clientX, ev.clientY));
        }
      };
      const up = (ev: PointerEvent) => {
        card.removeEventListener('pointermove', move);
        card.removeEventListener('pointerup', up);
        card.removeEventListener('pointercancel', up);
        this.slotEl.classList.remove('is-hot');
        if (!dragging) {
          this.insertCartridge(id);
          return;
        }
        card.classList.remove('is-dragging');
        if (ev.type === 'pointerup' && this.isOverDropZone(ev.clientX, ev.clientY)) {
          this.insertCartridge(id);
          if (!this.busy) card.style.transform = '';
        } else {
          card.style.transform = '';
        }
      };
      card.addEventListener('pointermove', move);
      card.addEventListener('pointerup', up);
      card.addEventListener('pointercancel', up);
    });
  }

  private cycleCard(): void {
    const idx = CARTRIDGES.findIndex((c) => c.id === this.inserted);
    const next = CARTRIDGES[(idx + 1) % CARTRIDGES.length];
    this.insertCartridge(next.id);
  }

  private toggleBenchmark(): void {
    this.synth.unlock();
    this.synth.playPreset('star');
    const on = this.runner.toggleBenchmark();
    this.benchBtn.classList.toggle('is-on', on);
    this.benchBtn.textContent = on ? '🎉 派對中 1,150+ 精靈' : '✨ 1,150+ GPU 精靈派對';
    this.onMomoReact?.();
  }

  private holdButton(cls: string, label: string, key: keyof InputState, title: string): HTMLButtonElement {
    const btn = el('button', cls, label);
    btn.type = 'button';
    btn.title = title;
    const press = (e: Event) => {
      e.preventDefault();
      this.synth.unlock();
      this.touchInput[key] = true;
      btn.classList.add('is-pressed');
    };
    const release = (e: Event) => {
      e.preventDefault();
      this.touchInput[key] = false;
      btn.classList.remove('is-pressed');
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    return btn;
  }

  private buildStick(): HTMLElement {
    const base = el('div', 'stick');
    const knob = el('div', 'stick-knob');
    base.appendChild(knob);
    const maxR = 14;
    let pid: number | null = null;

    const apply = (cx: number, cy: number) => {
      const r = base.getBoundingClientRect();
      let dx = cx - (r.left + r.width / 2);
      let dy = cy - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > maxR) {
        dx = (dx / len) * maxR;
        dy = (dy / len) * maxR;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / maxR;
      const ny = dy / maxR;
      this.stickInput.left = nx < -0.38;
      this.stickInput.right = nx > 0.38;
      this.stickInput.up = ny < -0.45;
      this.stickInput.down = ny > 0.45;
    };
    const reset = () => {
      pid = null;
      base.classList.remove('is-active');
      knob.style.transform = '';
      this.stickInput = { left: false, right: false, up: false, down: false };
    };

    base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.synth.unlock();
      pid = e.pointerId;
      base.setPointerCapture(e.pointerId);
      base.classList.add('is-active');
      apply(e.clientX, e.clientY);
    });
    base.addEventListener('pointermove', (e) => {
      if (pid === e.pointerId) apply(e.clientX, e.clientY);
    });
    base.addEventListener('pointerup', reset);
    base.addEventListener('pointercancel', reset);
    return base;
  }

  private installKeyboard(): void {
    const handle = (e: KeyboardEvent, down: boolean) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
      if (this.element.closest('.panel-hidden') || this.element.classList.contains('panel-hidden')) return;
      const k = this.keyInput;
      let matched = true;
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          k.left = down;
          break;
        case 'ArrowRight':
        case 'KeyD':
          k.right = down;
          break;
        case 'ArrowUp':
        case 'KeyW':
          k.up = down;
          break;
        case 'ArrowDown':
        case 'KeyS':
          k.down = down;
          break;
        case 'Space':
        case 'KeyZ':
        case 'KeyJ':
          k.jump = down;
          break;
        case 'KeyX':
        case 'KeyK':
          k.action = down;
          break;
        case 'KeyR':
          k.restart = down;
          break;
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
          if (down && !e.repeat) {
            const meta = CARTRIDGES[Number(e.code.slice(-1)) - 1];
            if (meta) this.insertCartridge(meta.id);
          }
          break;
        case 'KeyE':
          if (down && !e.repeat) this.eject();
          break;
        default:
          matched = false;
      }
      if (matched) {
        if (down) this.synth.unlock();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', (e) => handle(e, true));
    window.addEventListener('keyup', (e) => handle(e, false));
  }
}

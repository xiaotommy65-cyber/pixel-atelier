import type { ToySynth } from '../audio/ToySynth.ts';
import { CARTRIDGES, getCartridgeMeta } from '../engine/CartridgeRegistry.ts';
import type { CartridgeRunner } from '../engine/CartridgeRunner.ts';
import type { CartridgeId, InputState, RenderSceneSnapshot } from '../engine/WorldTypes.ts';
import type { GpuFrameStats } from '../gpu/GpuTypes.ts';

export class ConsoleView {
  public readonly element: HTMLElement;
  public readonly canvas: HTMLCanvasElement;

  private cartButtons = new Map<CartridgeId, HTMLButtonElement>();
  private scoreTag: HTMLElement;
  private starTag: HTMLElement;
  private spriteStatTag: HTMLElement;
  private fpsTag: HTMLElement;
  private statusHintEl: HTMLElement;
  private overlayEl: HTMLElement;
  private overlayTitle: HTMLElement;
  private overlayDesc: HTMLElement;
  private benchBtn: HTMLButtonElement;

  private touchInput: InputState = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    action: false,
    restart: false,
  };
  private keyInput: InputState = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    action: false,
    restart: false,
  };

  private runner: CartridgeRunner;
  private synth: ToySynth;
  private onMomoReact?: () => void;
  private lastBannerState: 'playing' | 'won' | 'lost' = 'playing';

  constructor(runner: CartridgeRunner, synth: ToySynth, onMomoReact?: () => void) {
    this.runner = runner;
    this.synth = synth;
    this.onMomoReact = onMomoReact;

    this.element = document.createElement('section');
    this.element.className = 'handheld-console';

    // Cartridge bay bar
    const bay = document.createElement('div');
    bay.className = 'cartridge-bay';
    const cartList = document.createElement('div');
    cartList.className = 'cartridge-list';

    for (const meta of CARTRIDGES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cart-chip';
      btn.dataset.cartridge = meta.id;
      btn.innerHTML = `<span class="cart-code">${meta.code}</span><span>${meta.title}</span>`;
      btn.addEventListener('click', () => {
        this.synth.unlock();
        this.synth.playPreset('snap');
        this.runner.switchCartridge(meta.id);
        this.syncCartridgeChips();
        this.onMomoReact?.();
      });
      this.cartButtons.set(meta.id, btn);
      cartList.appendChild(btn);
    }

    const restartBtn = document.createElement('button');
    restartBtn.type = 'button';
    restartBtn.className = 'mini-pill-btn';
    restartBtn.textContent = '↺ 重開卡匣';
    restartBtn.addEventListener('click', () => {
      this.synth.unlock();
      this.synth.playPreset('snap');
      this.runner.restart();
    });

    bay.append(cartList, restartBtn);

    // LCD Screen bezel
    const bezel = document.createElement('div');
    bezel.className = 'screen-bezel';

    const topbar = document.createElement('div');
    topbar.className = 'screen-topbar';
    const metricsLeft = document.createElement('div');
    metricsLeft.className = 'screen-metrics';
    this.scoreTag = document.createElement('span');
    this.scoreTag.className = 'metric-tag';
    this.scoreTag.textContent = '分數 0';
    this.starTag = document.createElement('span');
    this.starTag.className = 'metric-tag';
    this.starTag.textContent = '★ 0/5';
    metricsLeft.append(this.scoreTag, this.starTag);

    const metricsRight = document.createElement('div');
    metricsRight.className = 'screen-metrics';
    this.spriteStatTag = document.createElement('span');
    this.spriteStatTag.className = 'metric-tag';
    this.spriteStatTag.textContent = '精靈 0 · 2 draws';
    this.fpsTag = document.createElement('span');
    this.fpsTag.className = 'metric-tag';
    this.fpsTag.textContent = '60 FPS';
    metricsRight.append(this.spriteStatTag, this.fpsTag);
    topbar.append(metricsLeft, metricsRight);

    const screenFrame = document.createElement('div');
    screenFrame.className = 'screen-frame';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.canvas.width = 960;
    this.canvas.height = 540;

    // Overlay for Win / Lost celebration
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'screen-overlay panel-hidden';
    const card = document.createElement('div');
    card.className = 'overlay-card';
    this.overlayTitle = document.createElement('h3');
    this.overlayDesc = document.createElement('p');
    const replayBtn = document.createElement('button');
    replayBtn.type = 'button';
    replayBtn.className = 'toy-btn is-primary';
    replayBtn.textContent = '✨ 再玩一次！';
    replayBtn.addEventListener('click', () => {
      this.synth.unlock();
      this.synth.playPreset('snap');
      this.runner.restart();
    });
    card.append(this.overlayTitle, this.overlayDesc, replayBtn);
    this.overlayEl.appendChild(card);

    screenFrame.append(this.canvas, this.overlayEl);

    this.statusHintEl = document.createElement('div');
    this.statusHintEl.className = 'screen-status-hint';
    this.statusHintEl.textContent = getCartridgeMeta(this.runner.getCartridgeId()).goalHint;

    bezel.append(topbar, screenFrame, this.statusHintEl);

    // Tactile Handheld Controls Deck
    const deck = document.createElement('div');
    deck.className = 'controls-deck';

    const dpad = document.createElement('div');
    dpad.className = 'dpad';
    const makePadBtn = (label: string, key: keyof InputState) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dpad-btn';
      btn.textContent = label;
      this.bindHoldControl(btn, key);
      return btn;
    };
    const spacer = () => document.createElement('div');
    const center = document.createElement('div');
    center.className = 'dpad-center';

    dpad.append(
      spacer(),
      makePadBtn('▲', 'up'),
      spacer(),
      makePadBtn('◀', 'left'),
      center,
      makePadBtn('▶', 'right'),
      spacer(),
      makePadBtn('▼', 'down'),
      spacer(),
    );

    const mid = document.createElement('div');
    mid.className = 'deck-middle';
    const miniRow = document.createElement('div');
    miniRow.className = 'deck-mini-row';

    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.className = 'mini-pill-btn';
    selectBtn.textContent = 'SELECT 換卡';
    selectBtn.addEventListener('click', () => {
      this.synth.unlock();
      this.synth.playPreset('snap');
      const idx = CARTRIDGES.findIndex((c) => c.id === this.runner.getCartridgeId());
      const next = CARTRIDGES[(idx + 1) % CARTRIDGES.length];
      this.runner.switchCartridge(next.id);
      this.syncCartridgeChips();
      this.onMomoReact?.();
    });

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'mini-pill-btn';
    startBtn.textContent = 'START 重開';
    startBtn.addEventListener('click', () => {
      this.synth.unlock();
      this.synth.playPreset('snap');
      this.runner.restart();
    });
    miniRow.append(selectBtn, startBtn);

    this.benchBtn = document.createElement('button');
    this.benchBtn.type = 'button';
    this.benchBtn.className = 'bench-btn';
    this.benchBtn.textContent = '✨ 1,150+ GPU 精靈派對';
    this.benchBtn.addEventListener('click', () => {
      this.synth.unlock();
      this.synth.playPreset('star');
      const active = this.runner.toggleBenchmark();
      this.benchBtn.classList.toggle('is-on', active);
      this.benchBtn.textContent = active ? '🎉 派對模式開啟中 (1,150+ 精靈!)' : '✨ 1,150+ GPU 精靈派對';
      this.onMomoReact?.();
    });

    const footerNote = document.createElement('div');
    footerNote.className = 'console-footer-note';
    footerNote.textContent = '鍵盤：方向鍵 / WASD 移動 · Z / 空白鍵 跳躍 · X 特技 · R 重開';

    mid.append(miniRow, this.benchBtn, footerNote);

    const abCluster = document.createElement('div');
    abCluster.className = 'ab-cluster';
    const bWrap = document.createElement('div');
    bWrap.className = 'ab-wrap';
    const bBtn = document.createElement('button');
    bBtn.type = 'button';
    bBtn.className = 'ab-btn is-b';
    bBtn.textContent = 'B';
    this.bindHoldControl(bBtn, 'jump');
    const bCap = document.createElement('span');
    bCap.className = 'ab-caption';
    bCap.textContent = '跳躍 / 發射';
    bWrap.append(bBtn, bCap);

    const aWrap = document.createElement('div');
    aWrap.className = 'ab-wrap';
    const aBtn = document.createElement('button');
    aBtn.type = 'button';
    aBtn.className = 'ab-btn is-a';
    aBtn.textContent = 'A';
    this.bindHoldControl(aBtn, 'action');
    const aCap = document.createElement('span');
    aCap.className = 'ab-caption';
    aCap.textContent = '星光 / 特技';
    aWrap.append(aBtn, aCap);

    abCluster.append(bWrap, aWrap);
    deck.append(dpad, mid, abCluster);

    this.element.append(bay, bezel, deck);
    this.syncCartridgeChips();
    this.installKeyboardListeners();
  }

  private bindHoldControl(btn: HTMLButtonElement, key: keyof InputState): void {
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
  }

  private installKeyboardListeners(): void {
    const handleKey = (e: KeyboardEvent, down: boolean) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;

      let matched = true;
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.keyInput.left = down;
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.keyInput.right = down;
          break;
        case 'ArrowUp':
        case 'KeyW':
          this.keyInput.up = down;
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.keyInput.down = down;
          break;
        case 'Space':
        case 'KeyZ':
        case 'KeyJ':
          this.keyInput.jump = down;
          break;
        case 'KeyX':
        case 'KeyK':
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keyInput.action = down;
          break;
        case 'KeyR':
          this.keyInput.restart = down;
          break;
        default:
          matched = false;
      }
      if (matched) {
        if (down) this.synth.unlock();
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));
  }

  public syncCartridgeChips(): void {
    const current = this.runner.getCartridgeId();
    for (const [id, btn] of this.cartButtons.entries()) {
      btn.classList.toggle('is-inserted', id === current);
    }
  }

  public getInput(): InputState {
    return {
      left: this.touchInput.left || this.keyInput.left,
      right: this.touchInput.right || this.keyInput.right,
      up: this.touchInput.up || this.keyInput.up,
      down: this.touchInput.down || this.keyInput.down,
      jump: this.touchInput.jump || this.keyInput.jump,
      action: this.touchInput.action || this.keyInput.action,
      restart: this.touchInput.restart || this.keyInput.restart,
    };
  }

  public updateHud(snap: RenderSceneSnapshot, stats: GpuFrameStats, fps: number): void {
    this.scoreTag.textContent = `分數 ${snap.score}`;
    this.starTag.textContent = `★ ${snap.starsCollected}/${snap.starsTotal}`;
    this.spriteStatTag.textContent = `精靈 ${stats.spriteCount} · ${stats.drawCalls} draws`;
    this.fpsTag.textContent = `${Math.round(fps)} FPS`;
    this.statusHintEl.textContent = snap.statusBanner;

    if (snap.status !== this.lastBannerState) {
      this.lastBannerState = snap.status;
      if (snap.status === 'won') {
        this.overlayTitle.textContent = '🎉 太棒了！卡匣過關！';
        this.overlayDesc.textContent = `本次分數 ${snap.score} 分，Momo 與你的自畫角色開心跳躍中！`;
        this.overlayEl.classList.remove('panel-hidden');
        this.onMomoReact?.();
      } else if (snap.status === 'lost') {
        this.overlayTitle.textContent = '💫 愛心用完囉～';
        this.overlayDesc.textContent = '沒關係！再挑戰一次，或者去秘密基地調整彈跳重力手感！';
        this.overlayEl.classList.remove('panel-hidden');
      } else {
        this.overlayEl.classList.add('panel-hidden');
      }
    }
  }
}

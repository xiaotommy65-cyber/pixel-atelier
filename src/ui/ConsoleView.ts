import { CARTRIDGES, getCartridgeMeta } from '../engine/CartridgeRegistry.ts';
import type { EngineHost } from '../engine/EngineHost.ts';
import type { CartridgeId, InputState, RenderSceneSnapshot, RpgHudSnapshot } from '../engine/WorldTypes.ts';
import type { GpuFrameStats } from '../gpu/GpuTypes.ts';
import type { TextureAtlas } from '../gpu/TextureAtlas.ts';
import { renderCardArt } from './CardArt.ts';
import { bindMomentaryButton, bindPointerDrag, btn, el } from './dom.ts';

export type ConsolePhase = 'empty' | 'booting' | 'running';

const BOOT_SEC = 1.35;
const SLOT_CARD_W = 46;
const DEFAULT_SLOT_HINT = '◀ 卡槽：點選或拖曳卡匣插入！';

type Dir = 'left' | 'right' | 'up' | 'down';

function blankInput(): InputState {
  return { left: false, right: false, up: false, down: false, jump: false, action: false, restart: false };
}

function pulseHaptic(ms = 9): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(ms);
    } catch {
      // Ignore haptic blocks on restricted browsers
    }
  }
}

type SlotState =
  | { phase: 'empty' }
  | { phase: 'booting'; id: CartridgeId; timer: number }
  | { phase: 'running'; id: CartridgeId };

/**
 * Switch-style handheld: Joy-Con (L) | screen body | Joy-Con (R),
 * with L/R shoulder bumpers, thumb-slide D-Pad, haptic tactile press travel,
 * top cartridge slot, RPG HUD overlay for turn-based cartridges, and game card case.
 */
export class ConsoleView {
  public readonly element: HTMLElement;
  public canvas: HTMLCanvasElement;

  private host: EngineHost;
  private atlas: TextureAtlas;
  private onExitLandscape?: () => void;

  private slotState: SlotState = { phase: 'empty' };
  private busy = false;
  private dropHot = false;
  private captureRequested = false;
  private lastBannerState: 'playing' | 'won' | 'lost' = 'playing';

  private consoleEl: HTMLElement;
  private ledStrips: HTMLElement[] = [];
  private cardEls = new Map<CartridgeId, HTMLElement>();
  private cardArtImgs = new Map<CartridgeId, HTMLImageElement[]>();
  private recordEls = new Map<CartridgeId, HTMLElement>();
  private slotEl: HTMLElement;
  private slotLed: HTMLElement;
  private slotWindow: HTMLElement;
  private slotCardEl: HTMLElement | null = null;
  private slotHint: HTMLElement;
  private ejectBtn: HTMLButtonElement;
  private exitLandscapeBtn: HTMLButtonElement;
  private screenFrame: HTMLElement;
  private rpgHudEl: HTMLElement;
  private rpgFloorEl: HTMLElement;
  private rpgStatsEl: HTMLElement;
  private rpgEnemyEl: HTMLElement;
  private rpgAgentBtn: HTMLButtonElement;
  private rpgLogEl: HTMLElement;
  private rpgDialogEl: HTMLElement;
  private rpgActionsEl: HTMLElement;
  private lastRpgActionsKey = '';
  private insertPrompt: HTMLElement;
  private bootLayer: HTMLElement | null = null;
  private resultOverlay: HTMLElement;
  private resultTitle: HTMLElement;
  private resultDesc: HTMLElement;
  private clearSaveBtn: HTMLButtonElement;
  private benchBtn: HTMLButtonElement;
  private stageTag: HTMLElement;
  private scoreTag: HTMLElement;
  private starTag: HTMLElement;
  private spriteStatTag: HTMLElement;
  private fpsTag: HTMLElement;
  private statusHintEl: HTMLElement;

  private touchInput = blankInput();
  private padInput: Record<Dir, boolean> = { left: false, right: false, up: false, down: false };
  private keyInput = blankInput();
  private stickInput: Record<Dir, boolean> = { left: false, right: false, up: false, down: false };

  constructor(host: EngineHost, atlas: TextureAtlas, onExitLandscape?: () => void) {
    this.host = host;
    this.atlas = atlas;
    this.onExitLandscape = onExitLandscape;

    this.element = el('section', 'switch-stage');
    const consoleEl = el('div', 'switch-console');
    this.consoleEl = consoleEl;

    const makeLeds = (): HTMLElement => {
      const box = el('div', 'jc-leds');
      for (let i = 0; i < 4; i++) box.appendChild(el('span'));
      this.ledStrips.push(box);
      return box;
    };

    // ---------- Joy-Con L ----------
    const left = el('div', 'joycon is-left');
    left.appendChild(el('div', 'jc-rail-glow'));

    const lBumper = btn('jc-bumper is-l', 'L', 'L：重試當前關卡');
    bindMomentaryButton(lBumper, () => {
      pulseHaptic(10);
      this.host.playUiSound('snap');
      if (this.slotState.phase !== 'empty') this.host.retryStage();
    });

    const lTop = el('div', 'jc-row');
    lTop.appendChild(
      btn('jc-sys-btn', '−', '− 換下一張卡匣', () => {
        pulseHaptic(10);
        this.cycleCard();
      }),
    );

    const lStick = this.buildStick();
    const dirs = this.buildSlideDpad();

    const lBottom = el('div', 'jc-row');
    lBottom.append(
      makeLeds(),
      btn('jc-sys-btn is-square', '◉', '截圖：儲存 PICO-8 風紀念卡匣 PNG', () => {
        pulseHaptic(12);
        this.requestCapture();
      }),
    );
    left.append(lBumper, lTop, lStick, dirs, lBottom);

    // ---------- Console body ----------
    const body = el('div', 'console-body');
    const vol = el('div', 'top-vol');
    vol.append(el('span'), el('span'));

    this.slotEl = el('div', 'cart-slot is-empty');
    this.slotWindow = el('div', 'slot-window');
    this.slotEl.append(this.slotWindow, el('div', 'slot-mouth'));

    const slotSide = el('div', 'slot-side');
    this.slotLed = el('span', 'slot-led');
    this.slotLed.title = '卡槽狀態指示燈';
    this.slotHint = el('span', 'slot-hint', DEFAULT_SLOT_HINT);
    this.ejectBtn = btn('eject-btn panel-hidden', '⏏ 退出卡匣', undefined, () => {
      pulseHaptic(10);
      this.eject();
    });
    this.clearSaveBtn = btn('eject-btn is-clear-save panel-hidden', '🗑 重頭', '清除這張卡匣的電池存檔並從第一關重開', () => {
      const id = this.getInserted();
      if (!id) return;
      pulseHaptic(12);
      this.host.playUiSound('snap');
      this.host.restartFresh();
      this.renderRecordBadge(id);
      this.showCaptureToast('🗑 已清除電池存檔，從第一關重新開始！');
    });
    slotSide.append(this.slotLed, this.slotHint, this.clearSaveBtn, this.ejectBtn);

    const topbar = el('div', 'screen-topbar');
    const mLeft = el('div', 'screen-metrics');
    this.stageTag = el('span', 'metric-tag is-stage panel-hidden', '');
    this.scoreTag = el('span', 'metric-tag', '分數 0');
    this.starTag = el('span', 'metric-tag', '★ 0/0');
    mLeft.append(this.stageTag, this.scoreTag, this.starTag);
    const mRight = el('div', 'screen-metrics');
    this.spriteStatTag = el('span', 'metric-tag', '精靈 0 · 0 draws');
    this.fpsTag = el('span', 'metric-tag', '60 FPS');
    this.exitLandscapeBtn = btn('handheld-exit-btn', '↩ 離開橫屏', '離開全螢幕橫屏掌機模式', () => {
      pulseHaptic(10);
      this.host.playUiSound('snap');
      this.onExitLandscape?.();
    });
    mRight.append(this.spriteStatTag, this.fpsTag, this.exitLandscapeBtn);
    topbar.append(mLeft, mRight);

    this.screenFrame = el('div', 'screen-frame');
    this.canvas = el('canvas', 'game-canvas');
    this.canvas.width = 960;
    this.canvas.height = 540;

    // Structured CRPG HUD Overlay (only active when cartridge returns rpgHud, e.g. PA-04 D&D)
    this.rpgHudEl = el('div', 'rpg-hud panel-hidden');
    const rpgTop = el('div', 'rpg-top');
    const rpgTopLeft = el('div', 'rpg-cluster');
    this.rpgFloorEl = el('span', 'rpg-pill is-floor');
    this.rpgStatsEl = el('span', 'rpg-pill is-stats');
    rpgTopLeft.append(this.rpgFloorEl, this.rpgStatsEl);
    const rpgTopRight = el('div', 'rpg-cluster');
    this.rpgEnemyEl = el('span', 'rpg-pill is-enemy panel-hidden');
    this.rpgAgentBtn = btn('rpg-agent-btn', '🤖 AI 託管', '開啟／關閉內建探索戰鬥 AI 代理', () => {
      pulseHaptic(8);
      this.host.unlockAudio();
      this.host.runner.dispatchCommand('toggle_agent');
    });
    rpgTopRight.append(this.rpgEnemyEl, this.rpgAgentBtn);
    rpgTop.append(rpgTopLeft, rpgTopRight);

    const rpgBottom = el('div', 'rpg-bottom');
    this.rpgLogEl = el('div', 'rpg-log');
    this.rpgDialogEl = el('div', 'rpg-dialog panel-hidden');
    this.rpgActionsEl = el('div', 'rpg-actions');
    rpgBottom.append(this.rpgLogEl, this.rpgDialogEl, this.rpgActionsEl);
    this.rpgHudEl.append(rpgTop, rpgBottom);

    this.insertPrompt = el('div', 'screen-overlay insert-prompt');
    this.insertPrompt.appendChild(el('div', 'insert-pill', '⬇ 請從下方點選遊戲卡匣插入'));

    this.resultOverlay = el('div', 'screen-overlay is-dim panel-hidden');
    const card = el('div', 'overlay-card');
    this.resultTitle = el('h3');
    this.resultDesc = el('p');
    const resultActions = el('div', 'overlay-actions');
    const retryStageBtn = btn('toy-btn is-primary', '✨ 重試本關', undefined, () => {
      pulseHaptic(10);
      this.host.playUiSound('snap');
      this.host.retryStage();
    });
    const replayFreshBtn = btn('toy-btn', '🔄 從頭開始', undefined, () => {
      pulseHaptic(10);
      this.host.playUiSound('snap');
      this.host.restartFresh();
    });
    resultActions.append(retryStageBtn, replayFreshBtn);
    card.append(this.resultTitle, this.resultDesc, resultActions);
    this.resultOverlay.appendChild(card);
    this.screenFrame.append(this.canvas, this.rpgHudEl, this.insertPrompt, this.resultOverlay);

    this.statusHintEl = el('div', 'screen-status-hint', '從卡匣收納盒挑一張遊戲卡插進主機吧！');

    const footer = el('div', 'body-footer');
    const speakerL = el('div', 'speaker');
    const speakerR = el('div', 'speaker');
    for (let i = 0; i < 8; i++) {
      speakerL.appendChild(el('span'));
      speakerR.appendChild(el('span'));
    }
    const legend = el('div', 'body-legend', 'B 跳躍 · A/R 火花 · X 精靈派對 · F3 碰撞框 · L/+ 重試 · ⌂ 退卡');
    this.benchBtn = btn('bench-btn', '✨ 1,150+ GPU 精靈派對', undefined, () => {
      pulseHaptic(10);
      this.toggleBenchmark();
    });
    footer.append(speakerL, legend, this.benchBtn, speakerR);

    body.append(vol, this.slotEl, slotSide, topbar, this.screenFrame, this.statusHintEl, footer);

    // ---------- Joy-Con R ----------
    const right = el('div', 'joycon is-right');
    right.appendChild(el('div', 'jc-rail-glow'));

    const rBumper = this.holdButton('jc-bumper is-r', 'R', 'action', 'R：火花 / 發射星光（等同 A 鍵）');

    const rTop = el('div', 'jc-row');
    rTop.appendChild(
      btn('jc-sys-btn', '+', '+ 重試本關', () => {
        pulseHaptic(10);
        this.host.playUiSound('snap');
        if (this.slotState.phase !== 'empty') this.host.retryStage();
      }),
    );

    const abxy = el('div', 'diamond is-abxy');
    abxy.append(
      btn('dia-btn is-x dia-n', 'X', 'X：1,150+ GPU 精靈派對', () => {
        pulseHaptic(10);
        this.toggleBenchmark();
      }),
      this.holdButton('dia-btn is-y dia-w', 'Y', 'jump', 'Y：跳躍'),
      this.holdButton('dia-btn is-a dia-e', 'A', 'action', 'A：火花 / 引爆 / 特技'),
      this.holdButton('dia-btn is-b dia-s', 'B', 'jump', 'B：跳躍 / 發射'),
    );
    const rStick = this.buildStick();
    const rBottom = el('div', 'jc-row');
    rBottom.append(
      btn('jc-sys-btn is-home', '⌂', 'HOME：退出卡匣回到主畫面', () => {
        pulseHaptic(12);
        this.eject();
      }),
      makeLeds(),
    );
    right.append(rBumper, rTop, abxy, rStick, rBottom);

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
      const recBadge = el('span', 'card-record');
      this.recordEls.set(meta.id, recBadge);
      c.append(
        el('span', 'card-code', meta.code),
        art,
        el('span', 'card-title', meta.title),
        el('span', 'card-genre', meta.genre),
        recBadge,
      );
      this.renderRecordBadge(meta.id);
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
    return this.slotState.phase;
  }

  public getInserted(): CartridgeId | null {
    return this.slotState.phase === 'empty' ? null : this.slotState.id;
  }

  public isAwakeIdle(): boolean {
    return this.dropHot;
  }

  public playRailSnap(): void {
    this.consoleEl.classList.remove('is-snapping');
    void this.consoleEl.offsetWidth;
    this.consoleEl.classList.add('is-snapping');
  }

  public tick(dt: number): void {
    if (this.slotState.phase !== 'booting') return;
    this.slotState.timer -= dt;
    if (this.slotState.timer <= 0) {
      this.slotState = { phase: 'running', id: this.slotState.id };
      this.bootLayer?.remove();
      this.bootLayer = null;
      this.syncStatusLights();
    }
  }

  public getInput(): InputState {
    const t = this.touchInput;
    const p = this.padInput;
    const k = this.keyInput;
    const s = this.stickInput;
    return {
      left: t.left || p.left || k.left || s.left,
      right: t.right || p.right || k.right || s.right,
      up: t.up || p.up || k.up || s.up,
      down: t.down || p.down || k.down || s.down,
      jump: t.jump || k.jump,
      action: t.action || k.action,
      restart: t.restart || k.restart,
    };
  }

  public requestCapture(): void {
    this.host.playUiSound('snap');
    this.captureRequested = true;
    const flash = el('div', 'capture-flash');
    this.screenFrame.appendChild(flash);
    setTimeout(() => flash.remove(), 420);
  }

  public showCaptureToast(msg: string): void {
    const toast = el('div', 'capture-toast', msg);
    this.screenFrame.appendChild(toast);
    setTimeout(() => toast.remove(), 1850);
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
    const currentId = this.getInserted();
    if (currentId === id) {
      const resumed = this.host.insertWithSram(id);
      this.startBoot(id, resumed);
      return;
    }
    const doInsert = () => {
      const src = this.cardEls.get(id);
      if (!src) return;
      const finish = () => {
        src.classList.add('is-out');
        this.mountSlotCard(id);
        const resumed = this.host.insertWithSram(id);
        this.startBoot(id, resumed);
        this.busy = false;
      };
      pulseHaptic(14);
      this.host.playUiSound('snap');
      if (instant) {
        src.style.transform = '';
        finish();
      } else {
        this.busy = true;
        this.flyCard(src, finish);
      }
    };
    if (currentId) this.eject(doInsert, instant);
    else doInsert();
  }

  public eject(after?: () => void, instant = false): void {
    if (this.busy) return;
    const id = this.getInserted();
    if (!id) {
      after?.();
      return;
    }
    this.host.saveActiveSram();
    this.host.stopBgm();
    this.host.playUiSound('bounce');
    this.slotState = { phase: 'empty' };
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
      this.renderRecordBadge(id);
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
    if (snap.stage) {
      this.stageTag.classList.remove('panel-hidden');
      this.stageTag.textContent = `${snap.stage.index}/${snap.stage.total} · ${snap.stage.name}`;
    } else {
      this.stageTag.classList.add('panel-hidden');
    }
    const comboStr = snap.comboCount && snap.comboCount > 1 ? ` · ×${snap.comboCount}` : '';
    this.scoreTag.textContent = `分數 ${snap.score}${comboStr}`;
    this.starTag.textContent = `★ ${snap.starsCollected}/${snap.starsTotal}`;
    this.updateStats(stats, fps);
    this.statusHintEl.textContent = snap.statusBanner;
    this.renderRpgHud(snap.rpgHud);

    const insertedId = this.getInserted();
    if (insertedId) {
      this.clearSaveBtn.classList.toggle('panel-hidden', !this.host.hasSram(insertedId));
      if (this.host.saveRecord(insertedId, snap)) {
        this.renderRecordBadge(insertedId);
      }
    }

    if (snap.status !== this.lastBannerState) {
      this.lastBannerState = snap.status;
      if (snap.status === 'won') {
        this.resultTitle.textContent = snap.rpgHud ? '🐉 餘燼深淵制霸通關！' : '🎉 太棒了！全關卡制霸！';
        this.resultDesc.textContent = `總分 ${snap.score} 分，Momo 開心到在卡槽旁邊跳舞！`;
        this.resultOverlay.classList.remove('panel-hidden');
        this.host.reactMomo();
      } else if (snap.status === 'lost') {
        this.resultTitle.textContent = snap.rpgHud ? '💀 冒險者力竭倒下…' : '💫 愛心用完囉～';
        this.resultDesc.textContent = snap.rpgHud
          ? '英雄在餘燼迷宮力竭了，可重試本層營火點或從 B1 重頭攻略！'
          : '點擊「重試本關」可直接從檢查點／本關繼續，或調整積木工房參數！';
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

  private renderRpgHud(hud?: RpgHudSnapshot): void {
    if (!hud || this.slotState.phase !== 'running') {
      if (!this.rpgHudEl.classList.contains('panel-hidden')) {
        this.rpgHudEl.classList.add('panel-hidden');
        this.lastRpgActionsKey = '';
      }
      return;
    }

    this.rpgHudEl.classList.remove('panel-hidden');
    this.rpgFloorEl.textContent = `${hud.floorName} · T${hud.turnCount}`;
    const equipTxt = hud.weaponName ? ` ⚔️${hud.weaponName}` : '';
    const statusTxt = hud.statuses && hud.statuses.length > 0 ? ` [${hud.statuses.join(',')}]` : '';
    this.rpgStatsEl.textContent = `Lv.${hud.level} ❤️${hud.hp}/${hud.maxHp} ✨${hud.mp}/${hud.maxMp} 🛡️${hud.ac} 🪙${hud.gold} 🔑${hud.keys} 🧪${hud.potions}${equipTxt}${statusTxt}`;

    if (hud.combat) {
      this.rpgEnemyEl.classList.remove('panel-hidden');
      this.rpgEnemyEl.textContent = `🐉 ${hud.combat.enemyName} HP ${hud.combat.enemyHp}/${hud.combat.enemyMaxHp} AC${hud.combat.enemyAc}`;
    } else {
      this.rpgEnemyEl.classList.add('panel-hidden');
    }

    this.rpgAgentBtn.classList.toggle('is-on', hud.agentAuto);
    this.rpgAgentBtn.textContent = hud.agentAuto ? '🤖 AI 託管中' : '🤖 AI 託管';

    const logText = hud.combatLog.slice(0, 2).join('\n');
    if (this.rpgLogEl.textContent !== logText) {
      this.rpgLogEl.textContent = logText;
    }

    const opts = hud.dialog ? hud.dialog.choices : hud.actions;
    const selIdx = hud.dialog ? hud.dialog.selectedIdx : hud.selectedActionIdx;
    const dialogKey = hud.dialog ? `${hud.dialog.speaker}:${hud.dialog.text}` : '';
    const renderKey = `${hud.mode}|${selIdx}|${dialogKey}|${opts.map((o) => `${o.id}:${o.label}:${o.enabled}`).join(',')}`;

    if (renderKey !== this.lastRpgActionsKey) {
      this.lastRpgActionsKey = renderKey;
      if (hud.dialog) {
        this.rpgDialogEl.classList.remove('panel-hidden');
        this.rpgDialogEl.textContent = `【${hud.dialog.speaker}】${hud.dialog.text}`;
      } else {
        this.rpgDialogEl.classList.add('panel-hidden');
      }

      this.rpgActionsEl.textContent = '';
      opts.forEach((opt, i) => {
        const b = btn(`rpg-act-btn${i === selIdx ? ' is-selected' : ''}`, opt.label, undefined, () => {
          pulseHaptic(8);
          this.host.unlockAudio();
          this.host.runner.dispatchCommand(opt.id);
        });
        b.disabled = !opt.enabled;
        this.rpgActionsEl.appendChild(b);
      });
    }
  }

  private syncStatusLights(): void {
    const isBoot = this.slotState.phase === 'booting';
    const isRun = this.slotState.phase === 'running';
    this.slotLed.classList.toggle('is-boot', isBoot);
    this.slotLed.classList.toggle('is-run', isRun);
    for (const strip of this.ledStrips) {
      strip.classList.toggle('is-boot', isBoot);
      strip.classList.toggle('is-run', isRun);
    }
  }

  private renderRecordBadge(id: CartridgeId): void {
    const badge = this.recordEls.get(id);
    if (!badge) return;
    const rec = this.host.getRecord(id);
    const hasSave = this.host.hasSram(id);
    if (!rec && !hasSave) {
      badge.textContent = 'NEW';
      badge.classList.remove('is-played');
    } else if (hasSave && rec) {
      badge.textContent = `💾 續關 · ★${rec.bestStars}/${rec.starsTotal}`;
      badge.classList.add('is-played');
    } else if (hasSave) {
      badge.textContent = '💾 續關中';
      badge.classList.add('is-played');
    } else if (rec) {
      badge.textContent = `★${rec.bestStars}/${rec.starsTotal} · ${rec.bestScore}`;
      badge.classList.add('is-played');
    }
  }

  private setDropHot(hot: boolean): void {
    if (this.dropHot === hot) return;
    this.dropHot = hot;
    this.slotEl.classList.toggle('is-hot', hot);
    this.slotHint.textContent = hot ? '✨ 放開馬上插卡！' : DEFAULT_SLOT_HINT;
  }

  private registerArt(id: CartridgeId, img: HTMLImageElement): void {
    const list = this.cardArtImgs.get(id) ?? [];
    list.push(img);
    this.cardArtImgs.set(id, list);
  }

  private startBoot(id: CartridgeId, resumedSram = false): void {
    const meta = getCartridgeMeta(id);
    this.slotState = { phase: 'booting', id, timer: BOOT_SEC };
    this.lastBannerState = 'playing';
    this.rpgHudEl.classList.add('panel-hidden');
    this.lastRpgActionsKey = '';
    this.resultOverlay.classList.add('panel-hidden');
    this.insertPrompt.classList.add('panel-hidden');
    this.slotEl.classList.remove('is-empty');
    this.slotHint.classList.add('panel-hidden');
    this.ejectBtn.classList.remove('panel-hidden');
    this.clearSaveBtn.classList.toggle('panel-hidden', !this.host.hasSram(id));
    this.statusHintEl.textContent = resumedSram ? `💾 已讀取 SRAM 續關進度｜${meta.controlsHint}` : meta.controlsHint;
    this.syncStatusLights();
    this.playRailSnap();

    this.bootLayer?.remove();
    const boot = el('div', 'screen-overlay boot-splash');
    boot.style.setProperty('--boot-accent', meta.accentHex);
    const art = el('img', 'boot-art');
    art.alt = meta.title;
    art.src = renderCardArt(this.atlas, id);
    const bar = el('div', 'boot-bar');
    bar.appendChild(el('span'));
    boot.append(
      art,
      el('h3', 'boot-title', meta.title),
      el('span', 'boot-brand', resumedSram ? 'SRAM 電池存檔續關中…' : 'PIXEL ATELIER · GAME CARD'),
      bar,
    );
    this.screenFrame.appendChild(boot);
    this.bootLayer = boot;
    this.host.playUiSound('key');
    this.host.reactMomo();
  }

  private showEmptyState(): void {
    this.rpgHudEl.classList.add('panel-hidden');
    this.lastRpgActionsKey = '';
    this.stageTag.classList.add('panel-hidden');
    this.insertPrompt.classList.remove('panel-hidden');
    this.resultOverlay.classList.add('panel-hidden');
    this.slotEl.classList.add('is-empty');
    this.slotHint.textContent = DEFAULT_SLOT_HINT;
    this.slotHint.classList.remove('panel-hidden');
    this.ejectBtn.classList.add('panel-hidden');
    this.clearSaveBtn.classList.add('panel-hidden');
    this.scoreTag.textContent = '分數 0';
    this.starTag.textContent = '★ 0/0';
    this.statusHintEl.textContent = '從卡匣收納盒挑一張遊戲卡插進主機吧！';
    this.syncStatusLights();
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
    let sx = 0;
    let sy = 0;
    let dragging = false;

    bindPointerDrag(card, {
      onStart: (e) => {
        if (this.busy || card.classList.contains('is-out')) return false;
        this.host.unlockAudio();
        sx = e.clientX;
        sy = e.clientY;
        dragging = false;
      },
      onMove: (ev) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!dragging && Math.hypot(dx, dy) > 8) {
          dragging = true;
          card.classList.add('is-dragging');
        }
        if (dragging) {
          card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx * 0.04}deg) scale(1.06)`;
          this.setDropHot(this.isOverDropZone(ev.clientX, ev.clientY));
        }
      },
      onEnd: (ev) => {
        this.setDropHot(false);
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
      },
    });
  }

  private cycleCard(): void {
    const insertedId = this.getInserted();
    const idx = CARTRIDGES.findIndex((c) => c.id === insertedId);
    const next = CARTRIDGES[(idx + 1) % CARTRIDGES.length];
    this.insertCartridge(next.id);
  }

  private toggleBenchmark(): void {
    this.host.playUiSound('star');
    const on = this.host.runner.toggleBenchmark();
    this.benchBtn.classList.toggle('is-on', on);
    this.benchBtn.textContent = on ? '🎉 派對中 1,150+ 精靈' : '✨ 1,150+ GPU 精靈派對';
    this.host.reactMomo();
  }

  private localDeltaFromCenter(rect: DOMRect, clientX: number, clientY: number): { dx: number; dy: number; halfW: number; halfH: number } {
    const sx = clientX - (rect.left + rect.width / 2);
    const sy = clientY - (rect.top + rect.height / 2);
    if (this.element.closest('.is-rotated-90')) {
      return { dx: sy, dy: -sx, halfW: rect.height / 2, halfH: rect.width / 2 };
    }
    return { dx: sx, dy: sy, halfW: rect.width / 2, halfH: rect.height / 2 };
  }

  /**
   * Tactile Switch D-Pad with thumb-slide support:
   * sliding your thumb across directions updates Left/Right/Up/Down seamlessly without lifting.
   */
  private buildSlideDpad(): HTMLElement {
    const pad = el('div', 'diamond is-dpad');
    const upBtn = btn('dia-btn dia-n', '▲', '上');
    const leftBtn = btn('dia-btn dia-w', '◀', '左');
    const rightBtn = btn('dia-btn dia-e', '▶', '右');
    const downBtn = btn('dia-btn dia-s', '▼', '下');
    pad.append(upBtn, leftBtn, rightBtn, downBtn);

    const syncVisual = () => {
      upBtn.classList.toggle('is-pressed', this.padInput.up);
      leftBtn.classList.toggle('is-pressed', this.padInput.left);
      rightBtn.classList.toggle('is-pressed', this.padInput.right);
      downBtn.classList.toggle('is-pressed', this.padInput.down);
    };

    const applyAt = (cx: number, cy: number) => {
      const loc = this.localDeltaFromCenter(pad.getBoundingClientRect(), cx, cy);
      const dx = loc.dx / Math.max(1, loc.halfW);
      const dy = loc.dy / Math.max(1, loc.halfH);
      const prevL = this.padInput.left;
      const prevR = this.padInput.right;
      const prevU = this.padInput.up;
      const prevD = this.padInput.down;

      this.padInput.left = dx < -0.22;
      this.padInput.right = dx > 0.22;
      this.padInput.up = dy < -0.26;
      this.padInput.down = dy > 0.26;

      if (
        this.padInput.left !== prevL ||
        this.padInput.right !== prevR ||
        this.padInput.up !== prevU ||
        this.padInput.down !== prevD
      ) {
        pulseHaptic(6);
      }
      syncVisual();
    };

    bindPointerDrag(pad, {
      onStart: (e) => {
        this.host.unlockAudio();
        applyAt(e.clientX, e.clientY);
      },
      onMove: (e) => applyAt(e.clientX, e.clientY),
      onEnd: () => {
        this.padInput = { left: false, right: false, up: false, down: false };
        syncVisual();
      },
    });
    return pad;
  }

  private holdButton(cls: string, label: string, key: keyof InputState, title: string): HTMLButtonElement {
    const b = btn(cls, label, title);
    bindMomentaryButton(
      b,
      () => {
        this.host.unlockAudio();
        if (!this.touchInput[key]) pulseHaptic(8);
        this.touchInput[key] = true;
      },
      () => {
        this.touchInput[key] = false;
      },
    );
    return b;
  }

  private buildStick(): HTMLElement {
    const base = el('div', 'stick');
    const knob = el('div', 'stick-knob');
    base.appendChild(knob);
    const maxR = 14;

    const apply = (cx: number, cy: number) => {
      const loc = this.localDeltaFromCenter(base.getBoundingClientRect(), cx, cy);
      let dx = loc.dx;
      let dy = loc.dy;
      const len = Math.hypot(dx, dy);
      if (len > maxR) {
        dx = (dx / len) * maxR;
        dy = (dy / len) * maxR;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / maxR;
      const ny = dy / maxR;
      this.stickInput.left = nx < -0.35;
      this.stickInput.right = nx > 0.35;
      this.stickInput.up = ny < -0.42;
      this.stickInput.down = ny > 0.42;
    };

    bindPointerDrag(base, {
      onStart: (e) => {
        this.host.unlockAudio();
        pulseHaptic(6);
        base.classList.add('is-active');
        apply(e.clientX, e.clientY);
      },
      onMove: (e) => apply(e.clientX, e.clientY),
      onEnd: () => {
        base.classList.remove('is-active');
        knob.style.transform = '';
        this.stickInput = { left: false, right: false, up: false, down: false };
      },
    });
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
        case 'F3':
          if (down && !e.repeat) {
            const on = this.host.runner.toggleDebugHitboxes();
            this.showCaptureToast(on ? '🧪 除錯碰撞框：開啟' : '🧪 除錯碰撞框：關閉');
          }
          break;
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
        case 'Digit4':
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
        if (down) this.host.unlockAudio();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', (e) => handle(e, true));
    window.addEventListener('keyup', (e) => handle(e, false));
  }
}

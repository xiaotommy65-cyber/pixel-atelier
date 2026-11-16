import './styles/atelier.css';
import './styles/switch.css';

import { ToySynth } from './audio/ToySynth.ts';
import { getCartridgeMeta } from './engine/CartridgeRegistry.ts';
import { CartridgeRunner } from './engine/CartridgeRunner.ts';
import { createAgentBridge, type PixelAtelierAgentApi } from './engine/core/AgentBridge.ts';
import { EngineHost } from './engine/EngineHost.ts';
import { SaveService } from './engine/SaveService.ts';
import { SceneGpuBridge } from './engine/SceneGpuBridge.ts';
import type { CartridgeId } from './engine/WorldTypes.ts';
import { GpuEngine } from './gpu/GpuEngine.ts';
import type { GpuBackendKind } from './gpu/GpuTypes.ts';
import { TextureAtlas } from './gpu/TextureAtlas.ts';
import { exportCartridgeCardPng } from './ui/CardArt.ts';
import { ConsoleView } from './ui/ConsoleView.ts';
import { installGlobalTactileFeedback } from './ui/dom.ts';
import { drawAtlasSpriteToCanvas } from './ui/MomoMascot.ts';
import { SpriteAtelierView } from './ui/SpriteAtelierView.ts';
import { WorkshopView } from './ui/WorkshopView.ts';

declare global {
  interface Window {
    __PIXEL_ATELIER_AGENT__?: PixelAtelierAgentApi;
  }
}

type StationId = 'play' | 'sprite' | 'workshop';
type ShellTheme = 'mint' | 'berry' | 'honey' | 'sky';

const SHELL_THEMES: { id: ShellTheme; label: string; left: string; right: string }[] = [
  { id: 'mint', label: '薄荷 × 草莓', left: '#7fdcb4', right: '#ff8fa8' },
  { id: 'berry', label: '草莓牛奶', left: '#ffb3c6', right: '#ffb3c6' },
  { id: 'honey', label: '蜂蜜 × 汽水', left: '#ffdd6e', right: '#7fcdf5' },
  { id: 'sky', label: '藍莓 × 葡萄', left: '#8fc8ff', right: '#c9a8ff' },
];

const STATIONS: { id: StationId; icon: string; label: string }[] = [
  { id: 'play', icon: '🎮', label: '遊玩台' },
  { id: 'sprite', icon: '🎨', label: '精靈畫室' },
  { id: 'workshop', icon: '🧱', label: '積木工房' },
];

function createApp() {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) return;

  const synth = new ToySynth();
  const runner = new CartridgeRunner('cloudberry-hop');
  const save = new SaveService();
  const bridge = new SceneGpuBridge();

  const shell = document.createElement('div');
  shell.className = 'atelier-shell';

  // Restore saved handheld colorway via SaveService
  const savedShell = save.getShellTheme('mint') as ShellTheme;
  let activeShell: ShellTheme = SHELL_THEMES.some((t) => t.id === savedShell) ? savedShell : 'mint';
  if (activeShell !== 'mint') {
    document.documentElement.setAttribute('data-shell', activeShell);
  }

  // Header
  const header = document.createElement('header');
  header.className = 'atelier-header';

  const brandCluster = document.createElement('div');
  brandCluster.className = 'brand-cluster';

  const momoBtn = document.createElement('button');
  momoBtn.type = 'button';
  momoBtn.className = 'momo-badge';
  momoBtn.title = '摸摸 Momo 小兔！';
  const momoCanvas = document.createElement('canvas');
  momoCanvas.className = 'momo-canvas';
  momoCanvas.width = 16;
  momoCanvas.height = 16;
  momoBtn.appendChild(momoCanvas);

  const brandTitles = document.createElement('div');
  brandTitles.className = 'brand-titles';
  brandTitles.innerHTML = `
    <h1 class="brand-title">Pixel Atelier</h1>
    <span class="brand-sub">可愛工房風 GPU 幻想主機</span>
  `;
  brandCluster.append(momoBtn, brandTitles);

  // Header utilities
  const headerTools = document.createElement('div');
  headerTools.className = 'header-tools';

  const gpuPill = document.createElement('span');
  gpuPill.className = 'gpu-pill';
  const gpuDot = document.createElement('span');
  gpuDot.className = 'gpu-dot';
  const gpuLabel = document.createElement('span');
  gpuLabel.textContent = 'GPU 啟動中…';
  gpuPill.append(gpuDot, gpuLabel);

  // Momo Mascot Happy Hop animation helper
  let momoHappyTimer = 0;
  const triggerMomoHappy = () => {
    momoHappyTimer = 1.4;
    momoBtn.classList.remove('is-hopping');
    void momoBtn.offsetWidth;
    momoBtn.classList.add('is-hopping');
  };

  const host = new EngineHost(runner, synth, save, triggerMomoHappy);
  installGlobalTactileFeedback(shell, (profile, phase) => host.playTactile(profile, phase));

  const swatchBox = document.createElement('div');
  swatchBox.className = 'shell-swatches';
  const swatchBtns = new Map<ShellTheme, HTMLButtonElement>();
  const syncSwatches = () => {
    for (const [id, btn] of swatchBtns.entries()) {
      btn.classList.toggle('is-active', id === activeShell);
    }
  };
  for (const theme of SHELL_THEMES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shell-swatch';
    btn.style.background = `linear-gradient(90deg, ${theme.left} 50%, ${theme.right} 50%)`;
    btn.title = `外殼換色：${theme.label}`;
    btn.addEventListener('click', () => {
      activeShell = theme.id;
      if (theme.id === 'mint') {
        document.documentElement.removeAttribute('data-shell');
      } else {
        document.documentElement.setAttribute('data-shell', theme.id);
      }
      save.saveShellTheme(theme.id);
      syncSwatches();
      consoleView.playRailSnap();
    });
    swatchBtns.set(theme.id, btn);
    swatchBox.appendChild(btn);
  }
  syncSwatches();

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.className = 'toy-btn';
  muteBtn.textContent = '🔊 音效開';
  muteBtn.addEventListener('click', () => {
    host.unlockAudio();
    const muted = synth.toggleMute();
    muteBtn.textContent = muted ? '🔇 靜音中' : '🔊 音效開';
    if (!muted) synth.playTactile('ui', 'down');
  });

  let activeStation: StationId = 'play';
  let switchStation: (next: StationId) => void = () => {};
  let handheldLandscape = false;

  const landscapeBtn = document.createElement('button');
  landscapeBtn.type = 'button';
  landscapeBtn.className = 'toy-btn is-mint';
  landscapeBtn.title = '一鍵切換橫屏掌機（即使手機開啟直立鎖定也可 90° 全螢幕遊玩）';
  landscapeBtn.textContent = '⛶ 橫屏掌機';

  const syncHandheldOrientation = () => {
    shell.classList.toggle('is-handheld-landscape', handheldLandscape);
    document.body.classList.toggle('is-handheld-lock', handheldLandscape);
    const isPortraitViewport = window.innerHeight > window.innerWidth;
    shell.classList.toggle('is-rotated-90', handheldLandscape && isPortraitViewport);
    landscapeBtn.classList.toggle('is-active', handheldLandscape);
    landscapeBtn.textContent = handheldLandscape ? '↩ 離開橫屏' : '⛶ 橫屏掌機';
  };

  const setHandheldLandscape = (next: boolean) => {
    handheldLandscape = next;
    if (next && activeStation !== 'play') {
      switchStation('play');
    }
    syncHandheldOrientation();

    const ori = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    if (next) {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        void document.documentElement.requestFullscreen().catch(() => {});
      }
      if (ori?.lock) {
        void ori.lock('landscape').catch(() => {});
      }
    } else {
      if (ori?.unlock) {
        try {
          ori.unlock();
        } catch {
          // Ignore browsers rejecting unlock
        }
      }
      if (document.fullscreenElement && document.exitFullscreen) {
        void document.exitFullscreen().catch(() => {});
      }
    }
  };

  landscapeBtn.addEventListener('click', () => {
    setHandheldLandscape(!handheldLandscape);
  });

  window.addEventListener('resize', syncHandheldOrientation);
  window.addEventListener('orientationchange', syncHandheldOrientation);

  headerTools.append(gpuPill, swatchBox, muteBtn, landscapeBtn);
  header.append(brandCluster, headerTools);

  momoBtn.addEventListener('click', () => {
    host.playUiSound('bounce');
    triggerMomoHappy();
  });

  // Expose structured CRPG / Sandbox Agent API cleanly for browser DevTools & external AI coding Agents
  window.__PIXEL_ATELIER_AGENT__ = createAgentBridge(runner);

  // Create Views
  const nav = document.createElement('nav');
  nav.className = 'station-nav';
  const tabBtns = new Map<StationId, HTMLButtonElement>();

  const atlas = new TextureAtlas();
  const consoleView = new ConsoleView(host, atlas, () => setHandheldLandscape(false));

  const updateGpuBadge = (kind: GpuBackendKind, activeCanvas?: HTMLCanvasElement) => {
    if (activeCanvas) {
      consoleView.canvas = activeCanvas;
    }
    gpuDot.classList.toggle('is-webgpu', kind === 'webgpu');
    gpuLabel.textContent =
      kind === 'webgpu' ? 'WebGPU WGSL' : kind === 'webgl2' ? 'WebGL2 GLSL' : '初始化中';
  };

  const gpuEngine = new GpuEngine(consoleView.canvas, updateGpuBadge, atlas);

  const spriteAtelierView = new SpriteAtelierView(gpuEngine, synth, save, triggerMomoHappy);
  const workshopView = new WorkshopView(host, (targetId: CartridgeId = 'sandbox-toybox') => {
    switchStation('play');
    consoleView.insertCartridge(targetId);
  });

  switchStation = (next: StationId) => {
    activeStation = next;
    if (next === 'play') {
      consoleView.refreshCardArt();
    }
    consoleView.element.classList.toggle('panel-hidden', next !== 'play');
    spriteAtelierView.element.classList.toggle('panel-hidden', next !== 'sprite');
    workshopView.element.classList.toggle('panel-hidden', next !== 'workshop');

    for (const [id, btn] of tabBtns.entries()) {
      btn.classList.toggle('is-active', id === next);
    }
  };

  for (const st of STATIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'station-tab';
    btn.dataset.station = st.id;
    btn.innerHTML = `<span class="tab-icon">${st.icon}</span><span>${st.label}</span>`;
    btn.addEventListener('click', () => {
      switchStation(st.id);
    });
    tabBtns.set(st.id, btn);
    nav.appendChild(btn);
  }

  shell.append(
    header,
    nav,
    consoleView.element,
    spriteAtelierView.element,
    workshopView.element,
  );
  root.appendChild(shell);
  switchStation('play');

  // Initial Momo pixel draw
  let lastMomoMood: 'idle' | 'happy' = 'idle';
  drawAtlasSpriteToCanvas(gpuEngine.atlas, 'momo_idle', momoCanvas);

  // Initialize WebGPU -> WebGL2 backend
  void gpuEngine.init().then((kind) => {
    updateGpuBadge(kind);
    gpuEngine.syncAtlasToGpu();
  });

  // Main 60Hz Fixed-Timestep Loop + Audio EventQueue Flush + GPU Batch Render
  let lastTs = performance.now();
  let fpsSmooth = 60;

  const frame = (now: number) => {
    const dt = Math.min(0.1, Math.max(0.001, (now - lastTs) / 1000));
    lastTs = now;
    fpsSmooth = fpsSmooth * 0.9 + (1 / dt) * 0.1;

    if (momoHappyTimer > 0) {
      momoHappyTimer = Math.max(0, momoHappyTimer - dt);
    }
    const desiredMood: 'idle' | 'happy' = momoHappyTimer > 0 ? 'happy' : 'idle';
    if (desiredMood !== lastMomoMood) {
      lastMomoMood = desiredMood;
      drawAtlasSpriteToCanvas(
        gpuEngine.atlas,
        desiredMood === 'happy' ? 'momo_happy' : 'momo_idle',
        momoCanvas,
      );
    }

    if (activeStation === 'play') {
      consoleView.tick(dt);
      const phase = consoleView.getPhase();
      if (phase === 'running') {
        const input = consoleView.getInput();
        host.stepFrame(dt, input);
        const snap = runner.getSnapshot();
        const stats = bridge.render(
          gpuEngine,
          snap,
          runner.sparkleBenchmark ? runner.benchmarkSprites : null,
        );
        consoleView.updateHud(snap, stats, fpsSmooth);
      } else if (phase === 'booting') {
        const stats = bridge.render(gpuEngine, runner.getSnapshot(), null);
        consoleView.updateStats(stats, fpsSmooth);
      } else {
        const stats = bridge.renderIdle(gpuEngine, now / 1000, consoleView.isAwakeIdle());
        consoleView.updateStats(stats, fpsSmooth);
      }

      if (consoleView.consumeCaptureRequest()) {
        const insertedId = consoleView.getInserted();
        const meta = insertedId ? getCartridgeMeta(insertedId) : null;
        const snap = runner.getSnapshot();
        const dataUrl = exportCartridgeCardPng(
          consoleView.canvas,
          meta,
          snap.score,
          snap.starsCollected,
          snap.starsTotal,
        );
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `pixel-atelier-${meta?.code.toLowerCase() ?? 'home'}-${Date.now()}.png`;
        link.click();
        consoleView.showCaptureToast(
          meta ? `📸 已匯出「${meta.code}」紀念卡匣截圖！` : '📸 已匯出主畫面紀念圖卡！',
        );
      }
    } else if (activeStation === 'sprite') {
      spriteAtelierView.tickPreview(dt);
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

createApp();

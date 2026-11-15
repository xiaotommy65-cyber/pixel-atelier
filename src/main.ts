import './styles/atelier.css';

import { ToySynth } from './audio/ToySynth.ts';
import { CartridgeRunner } from './engine/CartridgeRunner.ts';
import { SceneGpuBridge } from './engine/SceneGpuBridge.ts';
import type { SimEvent } from './engine/WorldTypes.ts';
import { GpuEngine } from './gpu/GpuEngine.ts';
import type { GpuBackendKind } from './gpu/GpuTypes.ts';
import { ConsoleView } from './ui/ConsoleView.ts';
import { drawAtlasSpriteToCanvas } from './ui/MomoMascot.ts';
import { SpriteAtelierView } from './ui/SpriteAtelierView.ts';
import { SynthPianoView } from './ui/SynthPianoView.ts';
import { WorkshopView } from './ui/WorkshopView.ts';

type StationId = 'play' | 'sprite' | 'workshop' | 'synth';
type ShellTheme = 'mint' | 'berry' | 'honey' | 'sky';

const SHELL_STORAGE_KEY = 'pixel-atelier-shell-v1';

const SHELL_THEMES: { id: ShellTheme; label: string; hex: string }[] = [
  { id: 'mint', label: '薄荷奶油', hex: '#8ae3bc' },
  { id: 'berry', label: '草莓牛奶', hex: '#ffacc0' },
  { id: 'honey', label: '蜂蜜檸檬', hex: '#ffe280' },
  { id: 'sky', label: '星空藍莓', hex: '#94d7ff' },
];

const STATIONS: { id: StationId; icon: string; label: string }[] = [
  { id: 'play', icon: '🎮', label: '遊玩台' },
  { id: 'sprite', icon: '🎨', label: '精靈畫室' },
  { id: 'workshop', icon: '🧱', label: '積木工房' },
  { id: 'synth', icon: '🎹', label: '音效琴' },
];

function createApp() {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) return;

  const synth = new ToySynth();
  const runner = new CartridgeRunner('cloudberry-hop');
  const bridge = new SceneGpuBridge();

  const shell = document.createElement('div');
  shell.className = 'atelier-shell';

  // Restore saved handheld colorway
  const savedShell = (localStorage.getItem(SHELL_STORAGE_KEY) as ShellTheme | null) ?? 'mint';
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
    btn.style.backgroundColor = theme.hex;
    btn.title = `外殼換色：${theme.label}`;
    btn.addEventListener('click', () => {
      synth.unlock();
      synth.playPreset('snap');
      activeShell = theme.id;
      if (theme.id === 'mint') {
        document.documentElement.removeAttribute('data-shell');
      } else {
        document.documentElement.setAttribute('data-shell', theme.id);
      }
      localStorage.setItem(SHELL_STORAGE_KEY, theme.id);
      syncSwatches();
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
    synth.unlock();
    const muted = synth.toggleMute();
    muteBtn.textContent = muted ? '🔇 靜音中' : '🔊 音效開';
    if (!muted) synth.playPreset('snap');
  });

  headerTools.append(gpuPill, swatchBox, muteBtn);
  header.append(brandCluster, headerTools);

  // Momo Mascot Happy Hop animation helper
  let momoHappyTimer = 0;
  const triggerMomoHappy = () => {
    momoHappyTimer = 1.4;
    momoBtn.classList.remove('is-hopping');
    void momoBtn.offsetWidth;
    momoBtn.classList.add('is-hopping');
  };

  momoBtn.addEventListener('click', () => {
    synth.unlock();
    synth.playPreset('bounce');
    triggerMomoHappy();
  });

  // Forward simulation events to ToySynth & Momo reactions
  runner.setEventListener((ev: SimEvent) => {
    synth.playPreset(ev);
    if (ev === 'star' || ev === 'key' || ev === 'win') {
      triggerMomoHappy();
    }
  });

  // Create Views
  let activeStation: StationId = 'play';
  const nav = document.createElement('nav');
  nav.className = 'station-nav';
  const tabBtns = new Map<StationId, HTMLButtonElement>();

  const consoleView = new ConsoleView(runner, synth, triggerMomoHappy);

  const updateGpuBadge = (kind: GpuBackendKind) => {
    gpuDot.classList.toggle('is-webgpu', kind === 'webgpu');
    gpuLabel.textContent =
      kind === 'webgpu' ? 'WebGPU WGSL' : kind === 'webgl2' ? 'WebGL2 GLSL' : '初始化中';
  };

  const gpuEngine = new GpuEngine(consoleView.canvas, updateGpuBadge);

  const spriteAtelierView = new SpriteAtelierView(gpuEngine, synth, triggerMomoHappy);
  const workshopView = new WorkshopView(runner, synth, () => switchStation('play'));
  const synthPianoView = new SynthPianoView(synth, triggerMomoHappy);

  const switchStation = (next: StationId) => {
    activeStation = next;
    consoleView.syncCartridgeChips();
    consoleView.element.classList.toggle('panel-hidden', next !== 'play');
    spriteAtelierView.element.classList.toggle('panel-hidden', next !== 'sprite');
    workshopView.element.classList.toggle('panel-hidden', next !== 'workshop');
    synthPianoView.element.classList.toggle('panel-hidden', next !== 'synth');

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
      synth.unlock();
      synth.playPreset('snap');
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
    synthPianoView.element,
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

  // Main 60Hz Fixed-Timestep Loop + GPU Batch Render
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
      const input = consoleView.getInput();
      runner.update(dt, input);
      const snap = runner.getSnapshot();
      const stats = bridge.render(
        gpuEngine,
        snap,
        runner.sparkleBenchmark ? runner.benchmarkSprites : null,
      );
      consoleView.updateHud(snap, stats, fpsSmooth);
    } else if (activeStation === 'sprite') {
      spriteAtelierView.tickPreview(dt);
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

createApp();

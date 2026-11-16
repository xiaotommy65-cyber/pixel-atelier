import type { TactilePhase, TactileSwitchProfile } from '../audio/ToySynth.ts';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function btn(
  cls: string,
  text: string,
  title?: string,
  onClick?: (e: MouseEvent) => void,
): HTMLButtonElement {
  const node = el('button', cls, text);
  node.type = 'button';
  if (title) node.title = title;
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

export function pulseHaptic(ms = 9): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(ms);
    } catch {
      // Ignore haptic blocks on restricted browsers
    }
  }
}

const impactTimers = new WeakMap<HTMLElement, number>();

/** Fires a brief physical contact shockwave class (`is-impact`) without blocking rapid taps. */
export function triggerImpactRing(target: HTMLElement): void {
  const prev = impactTimers.get(target);
  if (prev !== undefined) window.clearTimeout(prev);
  target.classList.remove('is-impact');
  void target.offsetWidth;
  target.classList.add('is-impact');
  const id = window.setTimeout(() => {
    target.classList.remove('is-impact');
    impactTimers.delete(target);
  }, 240);
  impactTimers.set(target, id);
}

export interface PointerDragHandlers {
  onStart: (e: PointerEvent) => boolean | void;
  onMove?: (e: PointerEvent) => void;
  onEnd?: (e: PointerEvent) => void;
}

/**
 * Attaches pointer drag tracking with guarded setPointerCapture across card drag, D-Pad slide, and sticks.
 */
export function bindPointerDrag(target: HTMLElement, handlers: PointerDragHandlers): void {
  let activePid: number | null = null;

  target.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (handlers.onStart(e) === false) return;
    e.preventDefault();
    activePid = e.pointerId;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture errors on synthetic or unsupported pointer events
    }
  });

  target.addEventListener('pointermove', (e) => {
    if (activePid === e.pointerId) handlers.onMove?.(e);
  });

  const finish = (e: PointerEvent) => {
    if (activePid === null) return;
    if (e.type !== 'lostpointercapture' && e.pointerId !== activePid && e.pointerId !== 0) return;
    activePid = null;
    handlers.onEnd?.(e);
  };

  target.addEventListener('pointerup', finish);
  target.addEventListener('pointercancel', finish);
  target.addEventListener('lostpointercapture', finish);
}

/**
 * Binds momentary press/release tactile state (`is-pressed` + `is-impact`) using pointer capture
 * so thumb micro-drift on touchscreens never accidentally cancels a held Jump or Action button.
 */
export function bindMomentaryButton(
  target: HTMLElement,
  onPress: (e: PointerEvent) => void,
  onRelease?: (e: PointerEvent) => void,
): void {
  let activePid: number | null = null;

  target.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (activePid !== null) return;
    activePid = e.pointerId;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture failures in headless or synthetic tests
    }
    target.classList.add('is-pressed');
    triggerImpactRing(target);
    onPress(e);
  });

  const release = (e: PointerEvent) => {
    if (activePid === null) return;
    if (e.type !== 'lostpointercapture' && e.pointerId !== activePid && e.pointerId !== 0) return;
    const pid = activePid;
    activePid = null;
    try {
      if (target.hasPointerCapture(pid)) target.releasePointerCapture(pid);
    } catch {
      // Ignore release errors
    }
    target.classList.remove('is-pressed');
    onRelease?.(e);
  };

  target.addEventListener('pointerup', release);
  target.addEventListener('pointercancel', release);
  target.addEventListener('lostpointercapture', release);
}

interface TactileTargetSpec {
  profile: TactileSwitchProfile;
  sound: boolean;
  hapticMs: number;
}

const TACTILE_SELECTOR =
  '.jc-sys-btn, .eject-btn, .handheld-exit-btn, .rpg-agent-btn, .rpg-act-btn, .toy-btn, .station-tab, .bench-btn, .shell-swatch, .palette-chip, .piano-key, .momo-badge';

function classifyTactileTarget(node: HTMLElement): TactileTargetSpec | null {
  if ((node as HTMLButtonElement).disabled || node.matches(':disabled')) return null;
  if (node.closest('.diamond, .jc-bumper, .stick')) return null;
  if (node.matches('.jc-sys-btn, .eject-btn, .handheld-exit-btn, .rpg-agent-btn')) {
    return { profile: 'system', sound: true, hapticMs: 10 };
  }
  if (node.matches('.piano-key')) {
    return { profile: 'ui', sound: false, hapticMs: 8 };
  }
  return { profile: 'ui', sound: true, hapticMs: 9 };
}

/**
 * Single delegated tactile controller for all standard UI/RPG/nav buttons:
 * fires instant `.is-pressed` depression + acoustic down-click on pointerdown
 * without suppressing native `click`, followed by spring-return up-click on release.
 */
export function installGlobalTactileFeedback(
  root: HTMLElement,
  onTactile: (profile: TactileSwitchProfile, phase: TactilePhase) => void,
): void {
  let pressedEl: HTMLElement | null = null;
  let pressedSpec: TactileTargetSpec | null = null;
  let pressedPid: number | null = null;

  root.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const raw = e.target instanceof Element ? e.target.closest<HTMLElement>(TACTILE_SELECTOR) : null;
    if (!raw) return;
    const spec = classifyTactileTarget(raw);
    if (!spec) return;

    if (pressedEl && pressedEl !== raw) {
      pressedEl.classList.remove('is-pressed');
    }
    pressedEl = raw;
    pressedSpec = spec;
    pressedPid = e.pointerId;

    raw.classList.add('is-pressed');
    triggerImpactRing(raw);
    pulseHaptic(spec.hapticMs);
    if (spec.sound) onTactile(spec.profile, 'down');
  });

  const release = (e?: PointerEvent) => {
    if (!pressedEl) return;
    if (e && pressedPid !== null && e.pointerId !== pressedPid && e.pointerId !== 0) return;
    if (pressedEl.isConnected) {
      pressedEl.classList.remove('is-pressed');
    }
    if (pressedSpec?.sound) {
      onTactile(pressedSpec.profile, 'up');
    }
    pressedEl = null;
    pressedSpec = null;
    pressedPid = null;
  };

  window.addEventListener('pointerup', (e) => release(e));
  window.addEventListener('pointercancel', (e) => release(e));
  window.addEventListener('blur', () => release());
}

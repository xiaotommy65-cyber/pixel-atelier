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
    if (activePid === null || (e.pointerId !== activePid && e.pointerId !== 0)) return;
    activePid = null;
    handlers.onEnd?.(e);
  };

  target.addEventListener('pointerup', finish);
  target.addEventListener('pointercancel', finish);
}

/**
 * Binds momentary press/release tactile state (`is-pressed`) across bumpers and face buttons.
 */
export function bindMomentaryButton(
  target: HTMLElement,
  onPress: (e: Event) => void,
  onRelease?: (e: Event) => void,
): void {
  const down = (e: Event) => {
    e.preventDefault();
    target.classList.add('is-pressed');
    onPress(e);
  };
  const up = (e: Event) => {
    e.preventDefault();
    target.classList.remove('is-pressed');
    onRelease?.(e);
  };
  target.addEventListener('pointerdown', down);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
  target.addEventListener('pointerleave', up);
}

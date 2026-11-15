import { SANDBOX_DEFAULT_SCRIPT, WORKSHOP_RECIPES } from '../engine/CartridgeRegistry.ts';
import type { EngineHost } from '../engine/EngineHost.ts';
import { CARTRIDGE_PARAM_DEFS, DEFAULT_RUNTIME_PARAMS } from '../engine/WorldTypes.ts';
import { btn, el } from './dom.ts';

export class WorkshopView {
  public readonly element: HTMLElement;

  private host: EngineHost;
  private onGoPlay?: () => void;

  private sliders = new Map<string, { input: HTMLInputElement; valEl: HTMLElement; unit: string }>();
  private filterCheck: HTMLInputElement;
  private codeBox: HTMLTextAreaElement;
  private errorBox: HTMLElement;

  constructor(host: EngineHost, onGoPlay?: () => void) {
    this.host = host;
    this.onGoPlay = onGoPlay;

    const runner = this.host.runner;

    this.element = el('section', 'studio-card');

    const head = el('div', 'studio-head');
    head.innerHTML = `
      <div>
        <h2>🧱 積木工房（即時物理手感＆系統化關卡）</h2>
        <p class="studio-sub">微調物理手感滑桿，或點選右側「連鎖爆破」「暗影地牢」積木配方後套用開玩！</p>
      </div>
    `;
    head.appendChild(
      btn('toy-btn', '↺ 恢復原廠參數', undefined, () => {
        this.host.playUiSound('snap');
        Object.assign(runner.getParams(), DEFAULT_RUNTIME_PARAMS);
        this.syncSliders();
      }),
    );

    const cols = el('div', 'workshop-columns');

    // Left: Physics, Glow & Screen-Shake Dials
    const paramList = el('div', 'param-list');

    const params = runner.getParams();
    for (const def of CARTRIDGE_PARAM_DEFS) {
      const box = el('div', 'param-item');
      const row = el('div', 'param-row');
      const valEl = el('span', 'param-val', `${params[def.key]}${def.unit}`);
      row.append(el('span', undefined, def.label), valEl);

      const input = el('input', 'atelier-range');
      input.type = 'range';
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.value = String(params[def.key]);
      input.addEventListener('input', () => {
        const num = Number(input.value);
        runner.setParam(def.key, num);
        valEl.textContent = `${num}${def.unit}`;
      });
      this.sliders.set(def.key, { input, valEl, unit: def.unit });
      box.append(row, input);
      paramList.appendChild(box);
    }

    // Scanline cozy LCD toggle
    const filterItem = el('label', 'param-item');
    Object.assign(filterItem.style, {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      cursor: 'pointer',
    });
    const filterText = el('span', undefined, '✨ 掌機暖光 LCD 掃描紋理');
    filterText.style.fontSize = '0.84rem';
    filterText.style.fontWeight = '800';
    this.filterCheck = el('input');
    this.filterCheck.type = 'checkbox';
    this.filterCheck.checked = params.cozyFilter > 0.5;
    this.filterCheck.addEventListener('change', () => {
      runner.setParam('cozyFilter', this.filterCheck.checked ? 1 : 0);
    });
    filterItem.append(filterText, this.filterCheck);
    paramList.appendChild(filterItem);

    // Right: Sandbox Code Editor
    const scriptPane = el('div', 'script-pane');

    const recipeRow = el('div', 'tool-row');
    for (const r of WORKSHOP_RECIPES) {
      recipeRow.appendChild(
        btn('toy-btn is-honey', r.label, undefined, () => {
          this.host.playUiSound('snap');
          this.codeBox.value = r.code;
        }),
      );
    }
    recipeRow.appendChild(
      btn('toy-btn', '📄 預設基地', undefined, () => {
        this.host.playUiSound('snap');
        this.codeBox.value = SANDBOX_DEFAULT_SCRIPT;
      }),
    );

    this.codeBox = el('textarea', 'atelier-code');
    this.codeBox.spellcheck = false;
    this.codeBox.value = runner.getSandboxScript();

    this.errorBox = el('div', 'script-error panel-hidden');

    const applyBtn = btn('toy-btn is-primary', '▶ 套用積木程式並切換到遊玩台', undefined, () => {
      this.host.unlockAudio();
      const err = runner.applySandboxScript(this.codeBox.value);
      if (err) {
        this.errorBox.textContent = `積木執行小錯誤：${err}`;
        this.errorBox.classList.remove('panel-hidden');
        this.host.playUiSound('hurt');
      } else {
        this.errorBox.classList.add('panel-hidden');
        this.host.playUiSound('key');
        this.onGoPlay?.();
      }
    });

    scriptPane.append(recipeRow, this.codeBox, this.errorBox, applyBtn);
    cols.append(paramList, scriptPane);
    this.element.append(head, cols);
  }

  private syncSliders(): void {
    const params = this.host.runner.getParams();
    const keys = Object.keys(params) as (keyof typeof DEFAULT_RUNTIME_PARAMS)[];
    for (const key of keys) {
      const item = this.sliders.get(key);
      if (item) {
        item.input.value = String(params[key]);
        item.valEl.textContent = `${params[key]}${item.unit}`;
      }
    }
    this.filterCheck.checked = params.cozyFilter > 0.5;
  }
}

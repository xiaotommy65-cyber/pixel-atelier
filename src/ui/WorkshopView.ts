import { SANDBOX_DEFAULT_SCRIPT, WORKSHOP_RECIPES } from '../engine/CartridgeRegistry.ts';
import type { EngineHost } from '../engine/EngineHost.ts';
import { CARTRIDGE_PARAM_DEFS, DEFAULT_RUNTIME_PARAMS } from '../engine/WorldTypes.ts';

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

    this.element = document.createElement('section');
    this.element.className = 'studio-card';

    const head = document.createElement('div');
    head.className = 'studio-head';
    head.innerHTML = `
      <div>
        <h2>🧱 積木工房（即時物理手感＆系統化關卡）</h2>
        <p class="studio-sub">微調物理手感滑桿，或點選右側「連鎖爆破」「暗影地牢」積木配方後套用開玩！</p>
      </div>
    `;
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'toy-btn';
    resetBtn.textContent = '↺ 恢復原廠參數';
    resetBtn.addEventListener('click', () => {
      this.host.playUiSound('snap');
      const params = runner.getParams();
      Object.assign(params, DEFAULT_RUNTIME_PARAMS);
      this.syncSliders();
    });
    head.appendChild(resetBtn);

    const cols = document.createElement('div');
    cols.className = 'workshop-columns';

    // Left: Physics, Glow & Screen-Shake Dials
    const paramList = document.createElement('div');
    paramList.className = 'param-list';

    const params = runner.getParams();
    for (const def of CARTRIDGE_PARAM_DEFS) {
      const box = document.createElement('div');
      box.className = 'param-item';
      const row = document.createElement('div');
      row.className = 'param-row';
      const label = document.createElement('span');
      label.textContent = def.label;
      const valEl = document.createElement('span');
      valEl.className = 'param-val';
      valEl.textContent = `${params[def.key]}${def.unit}`;
      row.append(label, valEl);

      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'atelier-range';
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
    const filterItem = document.createElement('label');
    filterItem.className = 'param-item';
    filterItem.style.flexDirection = 'row';
    filterItem.style.justifyContent = 'space-between';
    filterItem.style.alignItems = 'center';
    filterItem.style.cursor = 'pointer';
    const filterText = document.createElement('span');
    filterText.style.fontSize = '0.84rem';
    filterText.style.fontWeight = '800';
    filterText.textContent = '✨ 掌機暖光 LCD 掃描紋理';
    this.filterCheck = document.createElement('input');
    this.filterCheck.type = 'checkbox';
    this.filterCheck.checked = params.cozyFilter > 0.5;
    this.filterCheck.addEventListener('change', () => {
      runner.setParam('cozyFilter', this.filterCheck.checked ? 1 : 0);
    });
    filterItem.append(filterText, this.filterCheck);
    paramList.appendChild(filterItem);

    // Right: Sandbox Code Editor
    const scriptPane = document.createElement('div');
    scriptPane.className = 'script-pane';

    const recipeRow = document.createElement('div');
    recipeRow.className = 'tool-row';
    for (const r of WORKSHOP_RECIPES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toy-btn is-honey';
      btn.textContent = r.label;
      btn.addEventListener('click', () => {
        this.host.playUiSound('snap');
        this.codeBox.value = r.code;
      });
      recipeRow.appendChild(btn);
    }
    const defaultBtn = document.createElement('button');
    defaultBtn.type = 'button';
    defaultBtn.className = 'toy-btn';
    defaultBtn.textContent = '📄 預設基地';
    defaultBtn.addEventListener('click', () => {
      this.host.playUiSound('snap');
      this.codeBox.value = SANDBOX_DEFAULT_SCRIPT;
    });
    recipeRow.appendChild(defaultBtn);

    this.codeBox = document.createElement('textarea');
    this.codeBox.className = 'atelier-code';
    this.codeBox.spellcheck = false;
    this.codeBox.value = runner.getSandboxScript();

    this.errorBox = document.createElement('div');
    this.errorBox.className = 'script-error panel-hidden';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'toy-btn is-primary';
    applyBtn.textContent = '▶ 套用積木程式並切換到遊玩台';
    applyBtn.addEventListener('click', () => {
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

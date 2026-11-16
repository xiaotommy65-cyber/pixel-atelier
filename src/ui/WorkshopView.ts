import { DND_DEFAULT_MODULE_JSON, SANDBOX_DEFAULT_SCRIPT, WORKSHOP_RECIPES } from '../engine/CartridgeRegistry.ts';
import type { EngineHost } from '../engine/EngineHost.ts';
import type { CartridgeId } from '../engine/WorldTypes.ts';
import { CARTRIDGE_PARAM_DEFS, DEFAULT_RUNTIME_PARAMS } from '../engine/WorldTypes.ts';
import { btn, el } from './dom.ts';

type WorkshopScriptMode = 'sandbox' | 'dnd';

export class WorkshopView {
  public readonly element: HTMLElement;

  private host: EngineHost;
  private onGoPlay?: (targetId?: CartridgeId) => void;

  private sliders = new Map<string, { input: HTMLInputElement; valEl: HTMLElement; unit: string }>();
  private filterCheck: HTMLInputElement;
  private codeBox: HTMLTextAreaElement;
  private errorBox: HTMLElement;
  private mode: WorkshopScriptMode = 'sandbox';
  private sandboxDraft: string;
  private dndDraft: string;

  constructor(host: EngineHost, onGoPlay?: (targetId?: CartridgeId) => void) {
    this.host = host;
    this.onGoPlay = onGoPlay;

    const runner = this.host.runner;
    this.sandboxDraft = runner.getSandboxScript();
    this.dndDraft = runner.getDndModuleJson();

    this.element = el('section', 'studio-card');

    const head = el('div', 'studio-head');
    head.innerHTML = `
      <div>
        <h2>🧱 積木工房（物理手感＆系統化劇本）</h2>
        <p class="studio-sub">可微調物理參數、編寫 2D 積木腳本，或切換到 D&amp;D 地牢 JSON 劇本即時生成迷宮！</p>
      </div>
    `;
    head.appendChild(
      btn('toy-btn', '↺ 恢復原廠參數', undefined, () => {
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

    // Right: Sandbox Code / D&D JSON Editor
    const scriptPane = el('div', 'script-pane');

    const modeRow = el('div', 'tool-row');
    const sandboxTab = btn('toy-btn is-active', '🧱 2D 物理積木');
    const dndTab = btn('toy-btn', '🐉 D&D 地牢 JSON 劇本');
    modeRow.append(sandboxTab, dndTab);

    const recipeRow = el('div', 'tool-row');
    const dndRecipeRow = el('div', 'tool-row panel-hidden');
    for (const r of WORKSHOP_RECIPES) {
      recipeRow.appendChild(
        btn('toy-btn is-honey', r.label, undefined, () => {
          this.codeBox.value = r.code;
          this.sandboxDraft = r.code;
        }),
      );
    }
    recipeRow.appendChild(
      btn('toy-btn', '📄 預設基地', undefined, () => {
        this.codeBox.value = SANDBOX_DEFAULT_SCRIPT;
        this.sandboxDraft = SANDBOX_DEFAULT_SCRIPT;
      }),
    );

    dndRecipeRow.appendChild(
      btn('toy-btn is-honey', '🐉 恢復預設餘燼迷宮 JSON', undefined, () => {
        this.codeBox.value = DND_DEFAULT_MODULE_JSON;
        this.dndDraft = DND_DEFAULT_MODULE_JSON;
      }),
    );

    this.codeBox = el('textarea', 'atelier-code');
    this.codeBox.spellcheck = false;
    this.codeBox.value = this.sandboxDraft;

    this.errorBox = el('div', 'script-error panel-hidden');
    const applyBtn = btn('toy-btn is-primary', '▶ 套用積木程式並切換到遊玩台');

    const setMode = (next: WorkshopScriptMode) => {
      if (this.mode === next) return;
      if (this.mode === 'sandbox') this.sandboxDraft = this.codeBox.value;
      else this.dndDraft = this.codeBox.value;

      this.mode = next;
      sandboxTab.classList.toggle('is-active', next === 'sandbox');
      dndTab.classList.toggle('is-active', next === 'dnd');
      recipeRow.classList.toggle('panel-hidden', next !== 'sandbox');
      dndRecipeRow.classList.toggle('panel-hidden', next !== 'dnd');
      this.errorBox.classList.add('panel-hidden');
      this.codeBox.value = next === 'sandbox' ? this.sandboxDraft : this.dndDraft;
      applyBtn.textContent =
        next === 'sandbox' ? '▶ 套用積木程式並切換到遊玩台' : '🐉 套用 D&D 劇本並插卡開玩！';
    };

    sandboxTab.addEventListener('click', () => {
      setMode('sandbox');
    });
    dndTab.addEventListener('click', () => {
      setMode('dnd');
    });

    applyBtn.addEventListener('click', () => {
      this.host.unlockAudio();
      if (this.mode === 'sandbox') {
        this.sandboxDraft = this.codeBox.value;
        const err = runner.applySandboxScript(this.codeBox.value);
        if (err) {
          this.errorBox.textContent = `積木執行小錯誤：${err}`;
          this.errorBox.classList.remove('panel-hidden');
          this.host.playUiSound('hurt');
        } else {
          this.errorBox.classList.add('panel-hidden');
          this.host.playUiSound('key');
          this.onGoPlay?.('sandbox-toybox');
        }
      } else {
        this.dndDraft = this.codeBox.value;
        const err = runner.applyDndModuleJson(this.codeBox.value);
        if (err) {
          this.errorBox.textContent = `D&D JSON 解析錯誤：${err}`;
          this.errorBox.classList.remove('panel-hidden');
          this.host.playUiSound('hurt');
        } else {
          this.errorBox.classList.add('panel-hidden');
          this.host.playUiSound('key');
          this.onGoPlay?.('emberkeep-dnd');
        }
      }
    });

    scriptPane.append(modeRow, recipeRow, dndRecipeRow, this.codeBox, this.errorBox, applyBtn);
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

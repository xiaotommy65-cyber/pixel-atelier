import type { ToySynth } from '../audio/ToySynth.ts';
import type { CartridgeRunner } from '../engine/CartridgeRunner.ts';
import { DEFAULT_SANDBOX_SCRIPT } from '../engine/cartridges/sandboxToybox.ts';
import { CARTRIDGE_PARAM_DEFS, DEFAULT_RUNTIME_PARAMS } from '../engine/WorldTypes.ts';

const SCRIPT_RECIPES: { label: string; code: string }[] = [
  {
    label: '⭐ 黃金星雨配方',
    code: `// 滿滿黃金星星與粉紫晚霞！
api.setSky('#5979d6', '#ffd9e8');
api.setHeroSpawn(30, 118);
api.addCloud(70, 122, 3);
api.addCloud(176, 94, 4);
api.addStar(84, 98);
api.addStar(118, 98);
api.addStar(190, 70);
api.addStar(224, 70);
api.addStar(258, 70);
api.addStar(284, 124);
api.addSlime(152, 134);`,
  },
  {
    label: '🍮 史萊姆派對',
    code: `// 果凍史萊姆大遊行！踩扁牠們！
api.setSky('#8ce0c4', '#fff5dc');
api.setHeroSpawn(24, 120);
api.addCloud(112, 114, 4);
api.addStar(132, 90);
api.addStar(166, 90);
api.addSlime(96, 134);
api.addSlime(156, 134);
api.addSlime(216, 134);
api.addSlime(276, 134);`,
  },
];

export class WorkshopView {
  public readonly element: HTMLElement;

  private runner: CartridgeRunner;
  private synth: ToySynth;
  private onGoPlay?: () => void;

  private sliders = new Map<string, { input: HTMLInputElement; valEl: HTMLElement; unit: string }>();
  private filterCheck: HTMLInputElement;
  private codeBox: HTMLTextAreaElement;
  private errorBox: HTMLElement;

  constructor(runner: CartridgeRunner, synth: ToySynth, onGoPlay?: () => void) {
    this.runner = runner;
    this.synth = synth;
    this.onGoPlay = onGoPlay;

    this.element = document.createElement('section');
    this.element.className = 'studio-card';

    const head = document.createElement('div');
    head.className = 'studio-head';
    head.innerHTML = `
      <div>
        <h2>🧱 積木工房（即時物理手感＆關卡程式）</h2>
        <p class="studio-sub">拖曳滑桿微調三款卡匣物理，或改寫右側秘密基地積木腳本後點「套用開玩」！</p>
      </div>
    `;
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'toy-btn';
    resetBtn.textContent = '↺ 恢復原廠參數';
    resetBtn.addEventListener('click', () => {
      this.synth.playPreset('snap');
      const params = this.runner.getParams();
      Object.assign(params, DEFAULT_RUNTIME_PARAMS);
      this.syncSliders();
    });
    head.appendChild(resetBtn);

    const cols = document.createElement('div');
    cols.className = 'workshop-columns';

    // Left: Physics & Glow Dials
    const paramList = document.createElement('div');
    paramList.className = 'param-list';

    const params = this.runner.getParams();
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
        this.runner.setParam(def.key, num);
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
      this.runner.setParam('cozyFilter', this.filterCheck.checked ? 1 : 0);
    });
    filterItem.append(filterText, this.filterCheck);
    paramList.appendChild(filterItem);

    // Right: Sandbox Code Editor
    const scriptPane = document.createElement('div');
    scriptPane.className = 'script-pane';

    const recipeRow = document.createElement('div');
    recipeRow.className = 'tool-row';
    for (const r of SCRIPT_RECIPES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toy-btn is-honey';
      btn.textContent = r.label;
      btn.addEventListener('click', () => {
        this.synth.playPreset('snap');
        this.codeBox.value = r.code;
      });
      recipeRow.appendChild(btn);
    }
    const defaultBtn = document.createElement('button');
    defaultBtn.type = 'button';
    defaultBtn.className = 'toy-btn';
    defaultBtn.textContent = '📄 預設基地';
    defaultBtn.addEventListener('click', () => {
      this.codeBox.value = DEFAULT_SANDBOX_SCRIPT;
    });
    recipeRow.appendChild(defaultBtn);

    this.codeBox = document.createElement('textarea');
    this.codeBox.className = 'atelier-code';
    this.codeBox.spellcheck = false;
    this.codeBox.value = this.runner.getSandboxScript();

    this.errorBox = document.createElement('div');
    this.errorBox.className = 'script-error panel-hidden';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'toy-btn is-primary';
    applyBtn.textContent = '▶ 套用積木程式並切換到遊玩台';
    applyBtn.addEventListener('click', () => {
      this.synth.unlock();
      const err = this.runner.applySandboxScript(this.codeBox.value);
      if (err) {
        this.errorBox.textContent = `積木執行小錯誤：${err}`;
        this.errorBox.classList.remove('panel-hidden');
        this.synth.playPreset('hurt');
      } else {
        this.errorBox.classList.add('panel-hidden');
        this.synth.playPreset('key');
        this.onGoPlay?.();
      }
    });

    scriptPane.append(recipeRow, this.codeBox, this.errorBox, applyBtn);
    cols.append(paramList, scriptPane);
    this.element.append(head, cols);
  }

  private syncSliders(): void {
    const params = this.runner.getParams();
    for (const def of CARTRIDGES_KEY_HELPER(params, this.sliders)) {
      void def;
    }
    this.filterCheck.checked = params.cozyFilter > 0.5;
  }
}

function CARTRIDGES_KEY_HELPER(
  params: typeof DEFAULT_RUNTIME_PARAMS,
  sliders: Map<string, { input: HTMLInputElement; valEl: HTMLElement; unit: string }>,
): string[] {
  const keys = Object.keys(params) as (keyof typeof DEFAULT_RUNTIME_PARAMS)[];
  for (const key of keys) {
    const item = sliders.get(key);
    if (item) {
      item.input.value = String(params[key]);
      item.valEl.textContent = `${params[key]}${item.unit}`;
    }
  }
  return keys;
}

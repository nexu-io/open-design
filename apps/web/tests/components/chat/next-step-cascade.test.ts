/**
 * 「下一步引导」(交付稿第 #41 / #42 格)的层叠与计算值。
 *
 * 这一族只能从**层叠**上守,守不住就在产线上悄悄错:
 *
 *   稿子     `.nexts button:hover { background: var(--bg-panel); color: var(--text-strong) }`
 *   我们(旧) `.toolboxRow:hover  { … }`                                    → (0,2,0)
 *   全局      `button:hover:not(:disabled) { background: var(--bg-subtle) }` → (0,2,1)
 *
 * `:not(:disabled)` 里的 `:disabled` 照样计入 b 档,再加上元素名 `button` 的 c 档 ——
 * 全局那条是 (0,2,1),**压过**只写了一个类的 (0,2,0)。搬稿子时把 `.nexts` 这个祖先省掉,
 * 特异性就从「类 + 祖先 + 伪类」掉到「类 + 伪类」,hover 底色于是变成 `--bg-subtle`(#ededed)
 * 而不是稿子要的 `--bg-panel`(#fafafa)。
 *
 * 在真客户端量到过:`background rgb(237, 237, 237)`。
 * 陈列页照不出来 —— 那一页把 module 关进 `.cage-next-step` 的笼子里,选择器凭空多了一个祖先,
 * 变成 (0,3,0) 正好赢,bug 被笼子盖住了。所以这条只能按**规则文本 + 特异性**钉。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { specificityTuple } from '../../helpers/chat-mirror-cascade';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const MODULE_CSS = strip(
  readFileSync(resolve(HERE, '../../../src/components/NextStepActions.module.css'), 'utf-8'),
);
/** 全局裸按钮基线。面板里每一颗 `<button>` 都活在它下面,组件写规则时必须先赢过它。 */
const PRIMITIVES_CSS = strip(readFileSync(resolve(HERE, '../../../src/styles/primitives.css'), 'utf-8'));
const COMPONENT_TSX = readFileSync(resolve(HERE, '../../../src/components/NextStepActions.tsx'), 'utf-8');

/**
 * 全局那条按钮 hover 现在包在 `:where()` 里,特异性为 0 —— 它退回成**默认值**,
 * 谁都能覆盖(见 `tests/styles/button-hover-default.test.ts` 的原委)。
 * 所以这一族原来那个「必须严格大于全局」的判据没有对象了;真正要守的变成两条:
 *   · 全局那条确实还是零特异性(不许有人把它改回裸选择器);
 *   · 我们自己那条确实把底色刷成稿子要的 `--bg-panel`。
 */
function expectGlobalHoverIsZeroSpecificity() {
  const zeroed = PRIMITIVES.some(
    (r) => /^:where\(button:hover/.test(r.sel) && /background:/.test(r.body),
  );
  expect(zeroed, '全局 button:hover 又变回会赢的裸选择器了').toBe(true);
}

type Rule = { sel: string; body: string };

function rules(css: string): Rule[] {
  const out: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = (m[2] ?? '').replace(/\s+/g, ' ').trim();
    for (const one of (m[1] ?? '').split(',')) {
      const sel = one.split(/\s+/).join(' ').trim();
      if (sel && !sel.startsWith('@')) out.push({ sel, body });
    }
  }
  return out;
}

/**
 * (b, c) 两档 —— 这一族里没有 id。
 *  b = 类 / 属性 / 伪类   c = 元素名 / 伪元素
 * 具体怎么算一律以 `tests/helpers/chat-mirror-cascade.ts` 的共享量尺为准
 * (逐条对 CSS 规范校过,用例见 `chat-mirror-cascade.specificity.test.ts`)。
 */
function specificity(selector: string): [number, number] {
  const [ids, classes, types] = specificityTuple(selector);
  // 校准过的共享量尺没有的那一档:id。这几张表里没有 id 选择器,少一档不影响判决;
  // 真出现了就**当场抛**,不许悄悄按 0 处理 —— 那会让一条 id 规则凭空输掉。
  if (ids > 0) throw new Error(`两元组量尺遇到 id 选择器,请改用三元组:${selector}`);
  return [classes, types];
}

const gt = (a: [number, number], b: [number, number]) => a[0] !== b[0] ? a[0] > b[0] : a[1] > b[1];

function findRule(list: Rule[], match: (r: Rule) => boolean, what: string): Rule {
  const hit = list.find(match);
  if (!hit) throw new Error(`找不到规则:${what}`);
  return hit;
}

const MODULE = rules(MODULE_CSS);
const PRIMITIVES = rules(PRIMITIVES_CSS);

describe('下一步引导 · 层叠', () => {
  it('hover 底色必须压过全局 button:hover', () => {
    expectGlobalHoverIsZeroSpecificity();
    findRule(
      MODULE,
      (r) => /toolboxRow:hover$/.test(r.sel) && /background:\s*var\(--bg-panel\)/.test(r.body),
      '把行底刷成 --bg-panel 的那条 hover 规则',
    );
  });

  it('「更多」那一行的 hover 同样要压过全局 button:hover', () => {
    expectGlobalHoverIsZeroSpecificity();
    findRule(
      MODULE,
      (r) => /moreRow:hover$/.test(r.sel) && /background:\s*var\(--bg-panel\)/.test(r.body),
      '「更多」行的 hover 规则',
    );
  });

  it('禁用行的 hover 不掉底 —— 它要压过刚被抬高的那条', () => {
    const ourHover = findRule(
      MODULE,
      (r) => /toolboxRow:hover$/.test(r.sel) && /background:\s*var\(--bg-panel\)/.test(r.body),
      '普通 hover',
    );
    const disabled = findRule(
      MODULE,
      (r) => /toolboxRow:disabled:hover$/.test(r.sel),
      '禁用行的 hover',
    );
    expect(gt(specificity(disabled.sel), specificity(ourHover.sel))).toBe(true);
  });
});

describe('下一步引导 · 稿子的计算值', () => {
  /** 稿子 `.nexts button svg { flex: none; width: 12px; height: 12px; color: var(--text-soft) }` */
  it('行内图标是 12px 且取 --text-soft', () => {
    const icon = findRule(
      MODULE,
      (r) => /toolboxList\b/.test(r.sel) && /\bsvg$/.test(r.sel),
      '行内 svg 的尺寸 / 颜色规则(要关在 toolboxList 这个笼子里,免得波及浮层)',
    );
    expect(icon.body).toMatch(/width:\s*12px/);
    expect(icon.body).toMatch(/height:\s*12px/);
    expect(icon.body).toMatch(/color:\s*var\(--text-soft\)/);
    expect(icon.body).toMatch(/flex:\s*none/);
  });

  /** 稿子 `.nexts button:hover svg { color: var(--text-strong) }` —— 图标跟着字一起转深 */
  it('hover 时图标跟着字一起转 --text-strong', () => {
    const hoverIcon = findRule(
      MODULE,
      (r) => /:hover\s+svg$/.test(r.sel) && /toolboxRow|moreRow/.test(r.sel),
      'hover 时的 svg 颜色规则',
    );
    expect(hoverIcon.body).toMatch(/color:\s*var\(--text-strong\)/);
  });

  /**
   * 稿子:`transition: background-color var(--duration-faster) var(--ease-out),
   *                    color var(--duration-faster) var(--ease-out)`
   * 换底和换字色是**同一件事**,得一起走。原来只过渡 `background` 和 `border-color`
   * —— 行上根本没有边框,而字色是硬跳的。
   */
  it('过渡逐字照抄稿子:换底和换字色一起走,不过渡不存在的边框', () => {
    const row = findRule(
      MODULE,
      (r) => /toolboxRow$/.test(r.sel) && /padding:\s*9px 11px/.test(r.body),
      '行本体规则',
    );
    const transition = /transition:([^;]*)/.exec(row.body)?.[1] ?? '';
    expect(transition).toMatch(/background-color\s+var\(--duration-faster\)\s+var\(--ease-out\)/);
    expect(transition).toMatch(/\bcolor\s+var\(--duration-faster\)\s+var\(--ease-out\)/);
    expect(transition).not.toMatch(/border-color/);
  });

  /** 图标的固有尺寸也要是 12 —— 只靠 CSS 压 presentation attribute,SVG 会先按 14 布一次 */
  it('列表行的 Icon 固有尺寸是 12', () => {
    const listRowIcons = [...COMPONENT_TSX.matchAll(/<Icon[^>]*className=\{[^}]*toolboxRow(?:Icon|Arrow)[^}]*\}[^>]*\/>/g)]
      .map((m) => m[0]);
    expect(listRowIcons.length).toBeGreaterThan(0);
    // 浮层里的行仍旧是 14 —— 只有关在 toolboxList 里的那些改成 12。
    const listRowSection = COMPONENT_TSX.slice(
      COMPONENT_TSX.indexOf('styles.toolboxList'),
      COMPONENT_TSX.indexOf('styles.detail'),
    );
    const sizes = [...listRowSection.matchAll(/<Icon[^>]*?size=\{(\d+)\}[^>]*?className=\{[^}]*toolboxRow(?:Icon|Arrow)[^}]*\}/gs)]
      .map((m) => Number(m[1]));
    expect(sizes.length, '在 toolboxList 那一段里找不到行内 Icon').toBeGreaterThan(0);
    expect(sizes.every((s) => s === 12), `行内 Icon 尺寸:${sizes.join(',')}`).toBe(true);
  });
});

/**
 * 第 #41 / #42 格现在挂的是 **agent 现写的三条建议**(产品裁决 2026-08-26:
 * 固定的工具箱目录不要了)。稿子 `.nexts` 那几条规则现在落在 `.suggestions`
 * 这一族上,层叠的坑和上面那族一模一样,所以照样得钉。
 */
describe('下一步引导 · 三条建议', () => {
  it('hover 底色必须压过全局 button:hover', () => {
    expectGlobalHoverIsZeroSpecificity();
    findRule(
      MODULE,
      (r) => /suggestionRow:hover$/.test(r.sel) && /background:\s*var\(--bg-panel\)/.test(r.body),
      '把建议行刷成 --bg-panel 的那条 hover 规则',
    );
  });

  /** 稿子 `.nexts button { padding: 9px 11px; gap: 8px; font-size: var(--t-mini) }` */
  it('行的度量逐值照抄稿子', () => {
    const row = findRule(
      MODULE,
      (r) => /suggestionRow$/.test(r.sel) && /padding:/.test(r.body),
      '建议行本体规则',
    );
    expect(row.body).toMatch(/padding:\s*9px 11px/);
    expect(row.body).toMatch(/gap:\s*8px/);
    expect(row.body).toMatch(/font-size:\s*12px/);
    const transition = /transition:([^;]*)/.exec(row.body)?.[1] ?? '';
    expect(transition).toMatch(/background-color\s+var\(--duration-faster\)\s+var\(--ease-out\)/);
    expect(transition).toMatch(/\bcolor\s+var\(--duration-faster\)\s+var\(--ease-out\)/);
    expect(transition).not.toMatch(/border-color/);
  });

  /** 稿子 `.nexts button svg { flex:none; width:12px; height:12px; color: var(--text-soft) }` */
  it('箭头是 12px 且取 --text-soft,hover 时跟着字转 --text-strong', () => {
    const icon = findRule(
      MODULE,
      (r) => /suggestions\b/.test(r.sel) && /suggestionRow svg$/.test(r.sel),
      '建议行内 svg 的尺寸 / 颜色规则',
    );
    expect(icon.body).toMatch(/width:\s*12px/);
    expect(icon.body).toMatch(/height:\s*12px/);
    expect(icon.body).toMatch(/color:\s*var\(--text-soft\)/);
    expect(icon.body).toMatch(/flex:\s*none/);

    const hoverIcon = findRule(
      MODULE,
      (r) => /suggestionRow:hover svg$/.test(r.sel),
      'hover 时建议行 svg 的颜色规则',
    );
    expect(hoverIcon.body).toMatch(/color:\s*var\(--text-strong\)/);
  });

  /**
   * 稿子里每行只有**一枚箭头**,行尾没有 chevron —— 点一条是直接把那句话发出去,
   * 没有下一层可展开。多画一个指向别处的箭头,是承诺一个不存在的东西。
   */
  it('行里只有一枚箭头,没有行尾 chevron', () => {
    const start = COMPONENT_TSX.indexOf('styles.suggestions');
    expect(start, '组件里找不到建议列表那一段').toBeGreaterThan(-1);
    const section = COMPONENT_TSX.slice(start, COMPONENT_TSX.indexOf('styles.toolboxList'));
    expect(section.match(/<svg/g) ?? []).toHaveLength(1);
    expect(section).not.toMatch(/chevron-right/);
    expect(section).not.toMatch(/<Icon\b/);
  });
});

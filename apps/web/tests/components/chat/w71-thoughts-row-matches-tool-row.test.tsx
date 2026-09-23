// @vitest-environment jsdom
/**
 * W71:**「思考过程」那一行的每一轴,都等于同一层级的标准工具行。**
 *
 * ## 判据是「相等」,不是某个字面值
 *
 * 这一格**稿子里没有** —— 用户 2026-09-02 逐字:「思考过程这个是我自己加的,但是跟
 * 设计同学同步过,这个只要保证跟 toolrow 标准样式一模一样就行」。
 * 所以下面每一条断言都写成**两边相比**,不给任何一轴钉字面值:工具行今天已经变过一次
 * (`.tool .nm` 的字重 500 → 400),再变的时候思考行要跟着一起动,而不是又分叉一次。
 *
 * 「标准工具行」= `ToolRow` 渲染出来的 `div.tool`(不是可折叠命令那一支,那一支是
 * `details.fold`,和步骤共用折叠头的一档)。
 *
 * ## 改之前量到的(两层级 × 四轴,`.name` 那一格)
 *
 * | | 颜色 | 字体 | 字号 | 字重 |
 * |---|---|---|---|---|
 * | 顶层 思考行 | #202020 | Albert Sans… | 13px | **500** |
 * | 顶层 工具行 | #202020 | Albert Sans… | 13px | **400** |
 * | 抽屉 思考行 | #202020 | Albert Sans… | **12px** | **500** |
 * | 抽屉 工具行 | #202020 | Albert Sans… | **13px** | **400** |
 *
 * 成因:思考行是 `details.fold.thoughts`,吃的是折叠行那一族的通用规则
 * (顶层 `.fold.flat > .body.stack > .fold > summary` 给 13px/500;抽屉里只剩
 * `.fold > summary` 的 12px,字重则一路继承到 `ChatRoot` 的 500);工具行是 `.tool`,
 * 自己那一族给 13px + `.tool .name` 的 400。
 *
 * ## 三类假绿,这个仓库都真实发生过
 *
 *  1. vitest 的 CSS Module 代理对**任何**键都返回类名 —— 拼错也能过;
 *  2. jsdom 不自动加载样式表,`getComputedStyle` 读不到层叠结果;
 *  3. `toBe` 在两边都读成默认值时**空过** —— 而这份文件全是相等断言,正是这一类的
 *     高危区。所以第一节先证明**工具行那一侧读得出非默认值**(字重确实是 `400`,
 *     不是 `<unset>`),再比相等。
 *
 * 量尺用共享的 `tests/helpers/chat-mirror-cascade.ts`(只读)。它的 `expand()` 是
 * **属性白名单**,`font-family` 不在名单里会被静默丢掉 —— 所以字体那一轴用它**导出的**
 * `parseRules` / `specificity` 另拼一把小尺,决胜规则(特异性,源码顺序)照抄,
 * 和 `w66-tool-ref-underline.test.tsx` 同一条路子。
 *
 * 四轴都是**可继承**属性,所以每一轴都按「自己没写就往上找」求值 —— 工具行的字号写在
 * 行盒 `.tool` 上、标题只是继承,只读元素自己那条会把它读成 `<unset>`。
 */
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';
import recordStyles from '../../../src/components/chat/primitives/record.module.css';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import thinkingStyles from '../../../src/components/chat/ThinkingMarkdown.module.css';
import {
  UNSET,
  createResolver,
  hashed,
  parseRules,
  specificity,
  stripComments,
} from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../src');
const read = (p: string): string => readFileSync(resolve(SRC, p), 'utf-8');

/* ── 样式表:按产品 `index.css` 的导入顺序装,CSS Module 排在全局之后 ────── */

const NUL = String.fromCharCode(0);

/**
 * `hashed()` 会把**所有** `.foo` 改写成哈希名,`:global()` 里的全局类也不例外,
 * 而改写后的 `:global(...)` jsdom 认不出来,共享量尺对认不出的选择器是**抛异常**
 * (它拒绝静默丢规则)。所以先把 `:global(X)` 摘成占位符,哈希之后原样填回。
 */
function scopeModule(css: string, mod: unknown): string {
  const globals: string[] = [];
  const stashed = css.replace(/:global\(([^()]*)\)/g, (_m, inner: string) => {
    globals.push(inner.trim());
    return `${NUL}${globals.length - 1}${NUL}`;
  });
  return hashed(stashed, mod as Record<string, string>)
    .replace(new RegExp(`${NUL}(\\d+)${NUL}`, 'g'), (_m, i: string) => globals[Number(i)] ?? '');
}

/** 从真文件里按「哪个块声明了这枚变量」抠出来包成 `:root`,不写死副本 */
function varBlock(css: string, probe: string): string {
  const m = new RegExp(`\\{([^{}]*${probe}\\s*:[^{}]*)\\}`).exec(stripComments(css));
  if (!m?.[1]) throw new Error(`抠不到声明 \`${probe}\` 的那个块`);
  return `:root {${m[1]}}`;
}

/** 产品 `index.css` 的导入顺序**就是**层叠顺序 —— 不能手抄 */
function globalSheets(): string[] {
  const index = read('index.css');
  return [...index.matchAll(/@import\s+'([^']+)'/g)]
    .map((m) => resolve(SRC, m[1] ?? ''))
    .flatMap((file) => {
      try { return [readFileSync(file, 'utf-8')]; } catch { return []; }
    });
}

const RECORD_CSS = read('components/chat/primitives/record.module.css');
const CHAT_ROOT_CSS = read('components/chat/ChatRoot.module.css');

const SHEETS = [
  ...globalSheets(),
  // 打包器把 module CSS 排在全局层之后
  scopeModule(CHAT_ROOT_CSS, chatRootStyles),
  scopeModule(RECORD_CSS, recordStyles),
  scopeModule(read('components/chat/ThinkingMarkdown.module.css'), thinkingStyles),
];

const TOKEN_SHEETS = [
  read('styles/tokens.css'),
  // 字号阶梯(--font-size-12 / 13)住在 base.css,不在 tokens.css
  read('styles/base.css'),
  varBlock(CHAT_ROOT_CSS, '--chat-bg-panel'),
  varBlock(CHAT_ROOT_CSS, '--chat-t-body'),
  varBlock(CHAT_ROOT_CSS, '--chat-font-mono'),
  varBlock(RECORD_CSS, '--chat-progress-detail-ink'),
];

const { resolved } = createResolver(SHEETS, TOKEN_SHEETS, ['color', 'font-size', 'font-weight']);

/* ── 字体那一轴:共享量尺的白名单里没有,自己拼一把 ───────────────────── */

const RULES = SHEETS.flatMap((css, i) => parseRules(css, i * 100_000).rules);

const TOKENS: Record<string, string> = {};
for (const css of TOKEN_SHEETS) {
  const root = /:root\s*\{([\s\S]*?)\}/.exec(stripComments(css));
  for (const decl of (root?.[1] ?? '').split(';')) {
    const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
    if (m) TOKENS[m[1]!] = m[2]!.trim();
  }
}

function deref(value: string): string {
  let out = value;
  for (let i = 0; i < 4; i += 1) {
    const next = out.replace(
      /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g,
      (whole, name: string, fallback?: string) => TOKENS[name] ?? fallback?.trim() ?? whole,
    );
    if (next === out) break;
    out = next;
  }
  return out.trim();
}

/** 这枚元素**自己**那条规则里胜出的 `font-family`;没人写就是 {@link UNSET} */
function ownFamily(el: Element): string {
  let best: { spec: number; order: number; value: string } | null = null;
  for (const rule of RULES) {
    let value: string | null = null;
    for (const decl of rule.body.split(';')) {
      const m = /^\s*([\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
      if (m && m[1]!.toLowerCase() === 'font-family') value = m[2]!.trim();
    }
    if (value == null) continue;
    for (const branch of rule.selector.split(/,(?![^()]*\))/)) {
      const plain = branch.trim();
      if (!plain || plain.includes('::')) continue;
      let hit = false;
      try { hit = el.matches(plain); } catch { continue; }
      if (!hit) continue;
      const spec = specificity(plain);
      if (!best || spec > best.spec || (spec === best.spec && rule.order >= best.order)) {
        best = { spec, order: rule.order, value };
      }
    }
  }
  return best ? deref(best.value).toLowerCase() : UNSET;
}

/* ── 四轴取值:可继承,所以自己没写就往上找 ─────────────────────────── */

/**
 * 一次层叠要扫完全部规则,而四轴 × 一路祖先会把同一枚元素反复扫上十几遍 ——
 * 在并行跑的机器上足够把单条用例推过 5s 超时(踩过一次)。按元素记一次就够:
 * 每次 `render` 都是新元素,`WeakMap` 不会跨用例串味。
 */
const OWN_CACHE = new WeakMap<Element, Record<string, string>>();
const ownAxis = (el: Element, prop: string): string => {
  let row = OWN_CACHE.get(el);
  if (!row) {
    row = { ...resolved(el), 'font-family': ownFamily(el) };
    OWN_CACHE.set(el, row);
  }
  return row[prop] ?? UNSET;
};

function inherited(el: Element, prop: string): string {
  let node: Element | null = el;
  while (node) {
    const got = ownAxis(node, prop);
    if (got && got !== UNSET && got.toLowerCase() !== 'inherit') return got.toLowerCase();
    node = node.parentElement;
  }
  return UNSET;
}

interface Axes {
  color: string;
  family: string;
  size: string;
  weight: string;
}

const axes = (el: Element): Axes => ({
  color: inherited(el, 'color'),
  family: inherited(el, 'font-family'),
  size: inherited(el, 'font-size'),
  weight: inherited(el, 'font-weight'),
});

/* ── 夹具:顶层一格思考 + 一条工具行,步骤抽屉里同样各一 ────────────────── */

const R = recordStyles as unknown as Record<string, string>;
const cls = (name: string): string => {
  const got = R[name];
  if (!got) throw new Error(`record.module.css 没有 \`${name}\` 这个类`);
  return got;
};

const think = (text: string, elapsedMs: number): ShellItem => ({
  kind: 'text', text, thinking: true, elapsedMs,
} as unknown as ShellItem);
const readRow = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'read', title: `读取 ${id}`, name: 'Read', rawTitle: false,
  file: { path: id, label: id }, delta: null, hits: null, pattern: null, elapsedMs: 400,
  failed: false, failReason: null, command: null, terminal: null,
} as unknown as ShellItem);
const step = (content: string, items: ShellItem[]): ShellItem => ({
  kind: 'todo',
  segment: {
    content, status: 'completed', recalled: false, abandoned: false, implicit: false,
    items, elapsedMs: 9_000,
  },
} as unknown as ShellItem);

const SHELL = {
  kind: 'shell', seq: 0, status: 'succeeded', segments: [],
  thinking: false, stopped: false, elapsedMs: 72_000, quietMs: null,
  items: [
    think('顶层的一段推理。', 2_500),
    readRow('顶层.png'),
    step('复刻商品列表页', [think('抽屉里的一段推理。', 1_200), readRow('抽屉.png')]),
  ],
} as unknown as Shell;

/** 壳挂在真的接缝下面,否则一半规则根本不参赛 */
function mount(): HTMLElement {
  const { container } = render(
    <I18nProvider initial="zh-CN">
      <ExecutionShell shell={SHELL} deferCollapsedBodies={false} />
    </I18nProvider>,
  );
  const app = document.createElement('div');
  app.className = 'app';
  const seam = document.createElement('div');
  seam.className = (chatRootStyles as unknown as Record<string, string>).root as string;
  seam.setAttribute('data-chat-root', '');
  app.appendChild(seam);
  seam.appendChild(container);
  document.body.appendChild(app);
  return seam;
}

function need<T extends Element>(el: T | null | undefined, what: string): T {
  if (!el) throw new Error(`夹具里没有${what}`);
  return el;
}

interface Slots {
  /** 折叠头的标题 / 工具行的标题 */
  title: Element;
  /** 耗时 */
  meta: Element;
  /** 行首图标 */
  icon: Element;
}

interface Picked {
  topThoughts: Slots;
  topTool: Slots;
  subThoughts: Slots;
  subTool: Slots;
}

function pick(): Picked {
  const root = mount();
  const shellBody = need(
    root.querySelector(`.${cls('flat')} > .${cls('body')}.${cls('stack')}`),
    '扁平壳的 body',
  );
  const topThoughts = need(shellBody.querySelector(`:scope > .${cls('thoughts')}`), '顶层的思考那一格');
  const topTool = need(shellBody.querySelector(`:scope > .${cls('tool')}`), '顶层的工具行');
  const stepBody = need(
    shellBody.querySelector(`:scope > .${cls('stepRow')} > .${cls('body')}.${cls('stack')}`),
    '步骤抽屉的 body',
  );
  const subThoughts = need(stepBody.querySelector(`:scope > .${cls('thoughts')}`), '抽屉里的思考那一格');
  const subTool = need(stepBody.querySelector(`:scope > .${cls('tool')}`), '抽屉里的工具行');

  const foldSlots = (fold: Element, what: string): Slots => ({
    title: need(fold.querySelector(`summary .${cls('name')}`), `${what}的标题`),
    meta: need(fold.querySelector(`summary > .${cls('meta')}`), `${what}的耗时`),
    icon: need(fold.querySelector(`summary .${cls('icon')}`), `${what}的图标`),
  });
  const rowSlots = (row: Element, what: string): Slots => ({
    title: need(row.querySelector(`.${cls('name')}`), `${what}的标题`),
    meta: need(row.querySelector(`.${cls('meta')}`), `${what}的耗时`),
    icon: need(row.querySelector(`.${cls('icon')}`), `${what}的图标`),
  });

  return {
    topThoughts: foldSlots(topThoughts, '顶层思考行'),
    topTool: rowSlots(topTool, '顶层工具行'),
    subThoughts: foldSlots(subThoughts, '抽屉思考行'),
    subTool: rowSlots(subTool, '抽屉工具行'),
  };
}

/* ── 第一节:防真空 ───────────────────────────────────────────────── */

describe('这把尺子看得见缺陷', () => {
  it('哈希改写是真的在做事 —— 不是 CSS Module 代理在瞎发类名', () => {
    expect(cls('thoughts')).not.toBe('thoughts');
    expect(cls('tool')).not.toBe('tool');
    expect(cls('name')).not.toBe('name');
  });

  it('夹具里两个层级的四行都在', () => {
    const p = pick();
    expect(p.topThoughts.title.textContent).toBe('思考过程');
    expect(p.subThoughts.title.textContent).toBe('思考过程');
    expect(p.topTool.title.textContent).toContain('顶层.png');
    expect(p.subTool.title.textContent).toContain('抽屉.png');
  });

  /**
   * **相等断言在「两边都读不出值」时恒真** —— 所以先钉死参照系那一侧读得出的是
   * 真值,不是 `<unset>`。这几个数是**参照物的现状**,不是思考行的期望值:
   * 工具行哪天再改一次,这一节会先红,提示上面那张表要重量。
   */
  it('参照系读得出非默认值 —— 工具行的四轴都不是 `<unset>`', () => {
    const p = pick();
    for (const [what, slots] of [['顶层', p.topTool], ['抽屉', p.subTool]] as const) {
      const a = axes(slots.title);
      expect(a.weight, `${what}工具行标题的字重`).toBe('400');
      expect(a.size, `${what}工具行标题的字号`).toBe('13px');
      expect(a.color, `${what}工具行标题的颜色`).toBe('#202020');
      expect(a.family, `${what}工具行标题的字体`).not.toBe(UNSET);
      expect(a.family, `${what}工具行标题的字体`).toContain('albert sans');
    }
  });

  it('字体那一轴真的在量,不是到处读回同一个常数', () => {
    const p = pick();
    // 耗时是等宽,标题是无衬线 —— 量得出这两者不同,说明这一轴没有空转
    expect(axes(p.topTool.meta).family).toContain('monospace');
    expect(axes(p.topTool.meta).family).not.toBe(axes(p.topTool.title).family);
  });

  it('两个层级确实是两套层叠 —— 抽屉里的思考行不吃顶层那条规则', () => {
    const p = pick();
    const top = p.topThoughts.title as Element;
    const sub = p.subThoughts.title as Element;
    const topRule = `.${cls('fold')}.${cls('flat')} > .${cls('body')}.${cls('stack')} > .${cls('fold')} > summary .${cls('name')}`;
    expect(top.matches(topRule)).toBe(true);
    expect(sub.matches(topRule)).toBe(false);
  });
});

/* ── 第二节:逐轴相等 ─────────────────────────────────────────────── */

describe('「思考过程」那一行 = 同层级的标准工具行(用户裁决 2026-09-02)', () => {
  const LEVELS = [
    ['顶层(直接挂在壳里)', (p: Picked) => [p.topThoughts, p.topTool] as const],
    ['嵌套(在步骤抽屉里)', (p: Picked) => [p.subThoughts, p.subTool] as const],
  ] as const;

  for (const [level, take] of LEVELS) {
    describe(level, () => {
      it('标题:颜色 / 字体 / 字号 / 字重四轴逐值相同', () => {
        const [thoughts, tool] = take(pick());
        expect(axes(thoughts.title)).toEqual(axes(tool.title));
      });

      it('耗时:四轴逐值相同', () => {
        const [thoughts, tool] = take(pick());
        expect(axes(thoughts.meta)).toEqual(axes(tool.meta));
      });

      it('图标那一格:四轴逐值相同', () => {
        const [thoughts, tool] = take(pick());
        expect(axes(thoughts.icon)).toEqual(axes(tool.icon));
      });
    });
  }
});

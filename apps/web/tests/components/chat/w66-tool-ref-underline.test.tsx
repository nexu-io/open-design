// @vitest-environment jsdom
/**
 * 工具行里的文件名引用 —— **下划线是静止态,不是 hover 态**。
 *
 * ## 稿子基线
 *
 * `729fa43ce7`(`origin/design/chat-cards-surface` 头)。动刀的是它下面的
 * `e8726686ae`「underline tool references by default」,原文两处:
 *
 * ```
 * -.tool .fn code { font-family: var(--mono); font-size: var(--t-mini); color: inherit;
 * -  text-underline-offset: 2px; transition: text-decoration-color …; }
 * -.tool .fn:hover code { text-decoration: underline; text-decoration-color: #A3A3A3; }
 * +.tool .fn code { font-family: var(--mono); font-size: var(--t-mini); color: inherit;
 * +  text-decoration: underline; text-decoration-color: currentColor; text-underline-offset: 2px; }
 * ```
 * 同一次还删掉了 `.fold.mod-flat .tool .fn:hover code { text-decoration-color: currentColor }`
 * —— hover 那一档整个退场了,`currentColor` 挪进静止态。
 *
 * 稿子自己写明了理由:「用真的 `<button>` 并让 `<code>` **默认带下划线**:这是个能点的
 * 东西,**不需要先 hover 才发现**」。
 *
 * ## 为什么必须真跑层叠,而不是 grep 规则文本
 *
 * 三类假绿这个仓库都真实发生过:
 *  1. vitest 的 CSS Module 代理对**任何**键都返回类名 —— `toMatch(/underline/)` 连拼错都能过;
 *  2. jsdom 不自动加载样式表,`getComputedStyle` 读不到层叠结果;
 *  3. `toBe` 在两边都落在 `none` / 默认值时空过。
 *
 * 所以这里按 `index.css` 的真实导入顺序把样式表读进来,用 `element.matches()` 匹配、
 * 按 (特异性, 源码顺序) 决胜 —— 决胜规则照抄共享量尺
 * `tests/helpers/chat-mirror-cascade.ts`(只读),用的是它导出的 `parseRules` /
 * `specificity`。共享量尺的 `expand()` 是**属性白名单**,`text-decoration*` 不在名单里
 * 会被静默丢掉,所以这一族属性只能自己拼一把小的 —— 和
 * `record-progress-ink-latest-spec.test.tsx` 里的 `hoverDecoColor` 同一条路子。
 *
 * ⚠️ **不摘 `:hover`**。这一条要断的正是「静止态就有」,而 jsdom 里 `:hover` 恒为假,
 * 于是 hover 分支天然不参赛 —— 量到的就是手不放上去时的样子。
 * (`hoverDecoColor` 那把尺是**摘掉** `:hover` 的,断的是另一件事,别混用。)
 */
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../../../src/i18n';
import { ToolRow } from '../../../src/components/chat/primitives/ToolRow';
import type { ToolRow as ToolRowData } from '../../../src/runtime/chat/contract';
import recordStyles from '../../../src/components/chat/primitives/record.module.css';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import { hashed, parseRules, specificity, stripComments, UNSET } from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../src');
const read = (p: string): string => readFileSync(resolve(SRC, p), 'utf-8');

/* ── 稿子那几个字面值 —— 判据的锚,不从实现里读回来 ───────────────────── */

/** `e8726686ae` 把它挪进静止态 */
const DESIGN_DECORATION = 'underline';
/** 同一次把 hover 那条的 `#A3A3A3` 换成了 `currentColor` */
const DESIGN_DECORATION_COLOR = 'currentcolor';
/** 这一条 `e8726686ae` 没动,原样留在静止态里 */
const DESIGN_UNDERLINE_OFFSET = '2px';
/** 改之前静止态就是「没有下划线」—— 反向锚,坏掉的实现读出来的就是这个 */
const BEFORE_RESTING = UNSET;

/* ── CSS Module 哈希改写 ─────────────────────────────────────────── */

const NUL = String.fromCharCode(0);
function scopeModule(css: string, mod: unknown): string {
  const globals: string[] = [];
  const stashed = css.replace(/:global\(([^()]*)\)/g, (_m, inner: string) => {
    globals.push(inner.trim());
    return `${NUL}${globals.length - 1}${NUL}`;
  });
  return hashed(stashed, mod as Record<string, string>)
    .replace(new RegExp(`${NUL}(\\d+)${NUL}`, 'g'), (_m, i: string) => globals[Number(i)] ?? '');
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

const SHEETS = [
  ...globalSheets(),
  // 打包器把 module CSS 排在全局层之后
  scopeModule(read('components/chat/ChatRoot.module.css'), chatRootStyles),
  scopeModule(read('components/chat/primitives/record.module.css'), recordStyles),
];

const RULES = SHEETS.flatMap((css, i) => parseRules(css, i * 100_000).rules);

/**
 * 这枚元素**静止时**某个 `text-decoration-*` 的胜出值。
 *
 * 决胜完全照共享量尺:(特异性, 源码顺序)。`:hover` 分支在 jsdom 里 `matches()`
 * 恒为假,所以自动出局 —— 这正是「静止态」的定义。
 * 简写 `text-decoration: underline` 会同时喂给 `text-decoration-line`。
 */
function restingDecoration(el: Element, prop: 'line' | 'color' | 'offset'): string {
  const longhand = prop === 'line' ? 'text-decoration-line'
    : prop === 'color' ? 'text-decoration-color'
      : 'text-underline-offset';
  let best: { spec: number; order: number; value: string } | null = null;
  for (const rule of RULES) {
    const decls: Array<[string, string]> = [];
    for (const decl of rule.body.split(';')) {
      const m = /^\s*([\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
      if (!m) continue;
      const name = m[1]!.toLowerCase();
      const value = m[2]!.trim();
      if (name === longhand) decls.push([name, value]);
      // `text-decoration: underline` / `text-decoration: none` 这类简写喂给 -line
      else if (name === 'text-decoration' && longhand === 'text-decoration-line') {
        decls.push([longhand, value.split(/\s+/)[0]!]);
      }
    }
    if (!decls.length) continue;
    for (const branch of rule.selector.split(/,(?![^()]*\))/)) {
      const plain = branch.trim();
      if (!plain || plain.includes('::')) continue;
      let hit = false;
      try { hit = el.matches(plain); } catch { continue; }
      if (!hit) continue;
      const spec = specificity(plain);
      if (!best || spec > best.spec || (spec === best.spec && rule.order >= best.order)) {
        best = { spec, order: rule.order, value: decls[decls.length - 1]![1] };
      }
    }
  }
  return best ? best.value.toLowerCase() : UNSET;
}

/* ── 夹具:一条能点的写文件行 + 一条打不开的读文件行 ─────────────────── */

const PROJECT_DIR = '/Users/me/.od/projects/p1';
const SCOPE = {
  projectId: 'p1',
  projectResolvedDir: PROJECT_DIR,
  projectFileNames: new Set(['product-list.html']),
};

function row(over: Partial<ToolRowData> = {}): ToolRowData {
  return {
    kind: 'tool', id: 't1', tool: 'write', name: 'Write', title: '新建', rawTitle: false,
    pending: false, file: null, pattern: null, hits: null, delta: null,
    elapsedMs: 100, failed: false, failReason: null, command: null, terminal: null,
    ...over,
  } as ToolRowData;
}

/** 壳里那一份 —— 产线上工具行永远坐在扁平壳的接缝下面 */
function mount(data: ToolRowData): HTMLElement {
  const { container } = render(
    <I18nProvider initial="zh-CN">
      <ToolRow row={data} fileScope={SCOPE} onOpenFile={() => {}} />
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

const clickableCode = (): Element => {
  const root = mount(row({
    tool: 'write', title: '新建 product-list.html',
    file: { path: `${PROJECT_DIR}/product-list.html`, label: 'product-list.html' },
  } as Partial<ToolRowData>));
  const btn = root.querySelector('button code');
  if (!btn) throw new Error('夹具里没有可点的文件名');
  return btn;
};

const staticCode = (): Element => {
  const root = mount(row({
    tool: 'read', title: '读取 外部.pdf', name: 'Read',
    file: { path: '/somewhere/else/外部.pdf', label: '外部.pdf' },
  } as Partial<ToolRowData>));
  const span = root.querySelector(`span.${(recordStyles as unknown as Record<string, string>).fileStatic} code`);
  if (!span) throw new Error('夹具里没有打不开的那一档文件名');
  return span;
};

describe('这把尺子看得见缺陷', () => {
  it('哈希改写是真的在做事 —— 不是 CSS Module 代理在瞎发类名', () => {
    const R = recordStyles as unknown as Record<string, string>;
    expect(R.file).toBeTruthy();
    expect(R.file).not.toBe('file');
    expect(R.fileStatic).toBeTruthy();
    expect(R.fileStatic).not.toBe('fileStatic');
  });

  it('量法读得出非默认值 —— `text-underline-offset` 这一格本来就写着 2px', () => {
    expect(restingDecoration(clickableCode(), 'offset')).toBe(DESIGN_UNDERLINE_OFFSET);
  });

  it('hover 分支在 jsdom 里不参赛 —— 所以量到的确实是静止态', () => {
    const R = recordStyles as unknown as Record<string, string>;
    const el = clickableCode();
    expect(el.matches(`.${R.file}:hover code`)).toBe(false);
  });
});

describe('工具行文件名:静止态就带下划线(稿子 729fa43ce7 · e8726686ae)', () => {
  it('可点的文件名,手不放上去也是 underline', () => {
    const got = restingDecoration(clickableCode(), 'line');
    expect(got).not.toBe(BEFORE_RESTING);
    expect(got).toBe(DESIGN_DECORATION);
  });

  it('下划线颜色跟着这一行的字色走 —— currentColor,不是写死的灰', () => {
    const got = restingDecoration(clickableCode(), 'color');
    expect(got).toBe(DESIGN_DECORATION_COLOR);
    expect(got).not.toBe('#a3a3a3');
  });

  it('下划线离基线 2px —— 这一条稿子没动,不许被顺手删掉', () => {
    expect(restingDecoration(clickableCode(), 'offset')).toBe(DESIGN_UNDERLINE_OFFSET);
  });
});

describe('反向:打不开的那一档不许长成链接(产品 2026-08-27 裁决)', () => {
  /**
   * 稿子里**没有**这一档 —— 它的 `.fn` 全是能点的 `<button>`。产品 2026-08-27
   * 把读取到的项目外文件、搜索模式、命令拆回纯文本,理由写在 `FileButton.tsx`:
   * 「看起来能点、点了没反应比一开始就不像链接更糟」。
   * 稿子给下划线的理由恰好是「**这是个能点的东西**,不需要先 hover 才发现」——
   * 把它发给一个点不动的 span,等于用稿子的记号说一句假话。
   *
   * ⚠️ 这条是**待拍板**:要不要连不可点那一档一起加下划线,归产品定。
   */
  it('静止态没有下划线', () => {
    expect(restingDecoration(staticCode(), 'line')).toBe('none');
  });

  it('反向对照:同一张表里可点那一档确实有 —— 不是整条规则都没生效', () => {
    expect(restingDecoration(clickableCode(), 'line')).toBe(DESIGN_DECORATION);
  });
});

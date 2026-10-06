// @vitest-environment jsdom
/**
 * W79 · 执行记录**顶层壳头**的四态同号(13px)。
 *
 * ## ⚠️ 这是一次**有意偏离稿子**,不是对齐 —— 对稿的下一位请先读完这一段
 *
 * 稿子(`729fa43ce7`)给壳头的字号是 **12px**,出处只有一条:
 *     `.fold > summary { font-size: var(--t-mini) }`
 * 扁平壳那条 `.fold.mod-flat > summary` 只改外距 / 内距 / 圆角 / 字重,**不写字号**,
 * 所以壳头跟着基础规则吃 12。我们这边逐值一致,一个字没抄错。
 *
 * **但稿子里同一个壳头,运行中和跑完不是一个字号。** 在真浏览器里逐档量过:
 *
 * | 壳头 | 稿子实测 | 成因 |
 * |---|---|---|
 * | 「进行中 31s」 | **13px** / 600 | 那三个字住在 `.shimmer` 里(扫光要靠它做 `background-clip`),而 `.shimmer` 自带 `font-size: var(--t-body)` |
 * | 「已完成 1m 12s」 | **12px** / 600 | 跑完 shimmer 撤掉,变回 summary 里的纯文字,吃 `--t-mini` |
 * | 「运行失败 4.0s」 | 12px / 600 | 同上 |
 *
 * 于是 run 结束的那一瞬间,壳头这行标题会**缩小 1px**。
 *
 * **2026-09-02 产品裁决:提到 13px,让两个状态同号。**
 * 所以产品这边给 `.fold.flat > summary` 补了一条 `font-size: var(--chat-t-body)`。
 *
 * ⚠️ **这不是「稿子写错了」,也不是「设计忘了改」** —— 稿子那两档各自都说得通
 * (扫光那一档天然要 13,静态那一档跟着通用折叠头走 12)。是产品选了「同号」这个结果。
 * 谁按稿子把这一条改回 12px / 删掉,这个文件会当场红,请先去找产品,不要"对齐修复"。
 *
 * ## 只动一层,反向对照比正向值更要紧
 *
 * 改的是 `.fold.flat > summary`(0,2,1)—— 够得着的只有**顶层壳自己那一行**。
 * 基础规则 `.fold > summary`(0,1,1)一个字没动,所以:
 *   · 步骤抽屉里的折叠头(命令行 / 输出块)**仍然是 12px**
 *   · 壳头右边那枚总耗时 `.meta` **仍然是 12px**(它自己写着 `--chat-t-cap`)
 *   · 步骤行 / 思考行 / 工具行一格没动
 * 下半场那几条反向对照就是拦「改到基础规则上去」的,少一条这次改动就会悄悄铺开一片。
 *
 * ## 量法与防真空
 *
 * jsdom 不做层叠、不解 `var()`,`getComputedStyle` 在这里恒为空串,所以走共享量尺
 * `tests/helpers/chat-mirror-cascade`(只读)。`--chat-*` 住在 `ChatRoot.module.css`
 * 的 `.vars` / `.root` 类上、不在 `:root`,所以按 `record-progress-ink-latest-spec`
 * 那条路子从真文件里把声明块抠出来包成 `:root` 喂给量尺 —— 这样读回来的是 `13px`
 * 这样的真值,而不是 `var(--chat-t-body)` 这个别名。
 *
 * 防真空分两步,两步都过才算量尺看得见这一格:
 *   ① 读回来的必须是 `\d+px`,不是 `<unset>`、不是没解开的 `var(…)`;
 *   ② 量尺必须读得出**非默认的另一个值** —— 同一把尺子在嵌套抽屉那一格读回 12px。
 *      两边都读 `<unset>` 的相等断言等于没量。
 *
 * 三态同号那条写成**等式**(`已完成 === 进行中`),不是两边各钉一个 13px:
 * 以后谁改了其中一边,另一边会跟着红。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';
import recordStyles from '../../../src/components/chat/primitives/record.module.css';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import {
  UNSET,
  createResolver,
  hashed,
  stripComments,
} from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../src');
const read = (p: string): string => readFileSync(resolve(SRC, p), 'utf-8');

/* ── 判据的锚 —— 字面值,不从实现里读回来 ───────────────────────────── */

/** `--chat-t-body` → `--font-size-13`。产品裁决后壳头四态都落在这一档 */
const BODY_SIZE = '13px';
/** `--chat-t-mini` / `--chat-t-cap` → `--font-size-12`。稿子给壳头的那一档,现在只留给别处 */
const MINI_SIZE = '12px';
/** 壳头字重 —— 这次一个字没动,反向锚 */
const HEAD_WEIGHT = '600';

/* ── CSS Module:哈希改写 + `:global()` 保护(与 record-progress-ink 同一条路子)── */

const NUL = String.fromCharCode(0);

/**
 * `hashed()` 会把**所有** `.foo` 改写成哈希名,`:global()` 里的全局类也不例外,
 * 而改写后的 `:global(...)` jsdom 的 `matches()` 认不出来 —— 量尺对认不出来的选择器
 * 是**抛异常**(它拒绝静默丢规则)。所以先把 `:global(X)` 摘成占位符,哈希之后原样填回。
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

const RECORD_CSS = read('components/chat/primitives/record.module.css');
const CHAT_ROOT_CSS = read('components/chat/ChatRoot.module.css');

/**
 * 量尺的 `var()` 解析只认 token 表的 `:root` 块,而 `--chat-*` 住在
 * `ChatRoot.module.css` 的 `.vars, .root` 上。**从真文件里按「哪个块声明了这枚变量」
 * 抠出来**再包成 `:root` —— 写死一份副本的话,改了产品定义这里照样绿。
 */
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
      try {
        return [readFileSync(file, 'utf-8')];
      } catch {
        return [];
      }
    });
}

const TARGETS = ['font-size', 'font-weight'] as const;

const SHEETS = [
  ...globalSheets(),
  // 打包器把 module CSS 排在全局层之后
  scopeModule(CHAT_ROOT_CSS, chatRootStyles),
  scopeModule(RECORD_CSS, recordStyles),
];

const TOKEN_SHEETS = [
  read('styles/tokens.css'),
  // 字号阶梯(--font-size-12 / 13)住在 base.css,不在 tokens.css
  read('styles/base.css'),
  varBlock(CHAT_ROOT_CSS, '--chat-t-body'),
];

const { resolved, declaring } = createResolver(SHEETS, TOKEN_SHEETS, TARGETS);

/* ── 夹具 ─────────────────────────────────────────────────────────── */

const R = recordStyles as unknown as Record<string, string>;
const cls = (name: string): string => {
  const got = R[name];
  if (!got) throw new Error(`record.module.css 没有 \`${name}\` 这个类`);
  return got;
};

const readRow = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'read', title: `读取 ${id}`, name: 'Read', rawTitle: false,
  file: { path: id, label: id }, delta: null, hits: null, pattern: null, elapsedMs: 400,
  failed: false, failReason: null, command: null, terminal: null,
} as unknown as ShellItem);
/** 跑命令的**可折叠**那一支 —— 它就是「步骤抽屉里的折叠头」,反向对照全靠它 */
const cmdRow = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'bash', title: '构建产物,看能不能跑通', name: 'Bash', rawTitle: false,
  file: null, delta: null, hits: null, pattern: null, elapsedMs: 8400,
  failed: false, failReason: null,
  command: 'npm run build',
  terminal: '✓ built in 2.14s (2 pages)',
} as unknown as ShellItem);
const step = (content: string, items: ShellItem[]): ShellItem => ({
  kind: 'todo',
  segment: {
    content, status: 'completed', recalled: false, abandoned: false, implicit: false,
    items, elapsedMs: 18_200,
  },
} as unknown as ShellItem);

/** 四态共用同一份内容 —— 只有 `status` / `stopped` 在变,别的变量全部按住 */
const shellOf = (status: string, stopped = false): Shell => ({
  kind: 'shell', seq: 0, status, segments: [],
  thinking: false, stopped, elapsedMs: 72_000, quietMs: null,
  items: [
    { kind: 'text', text: '两张图是同一套栅格,先复刻列表页。', thinking: false } as ShellItem,
    step('复刻商品列表页', [readRow('首页.png'), cmdRow('c1')]),
  ],
} as unknown as Shell);

/** 壳挂在真的接缝下面,否则一半规则根本不参赛 */
function mount(shell: Shell): HTMLElement {
  const { container } = render(
    <I18nProvider initial="zh-CN">
      <ExecutionShell shell={shell} deferCollapsedBodies={false} />
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

/**
 * 字号 / 字重都是**可继承**属性 —— 壳头那几个字自己没有规则,值来自 `summary`。
 * 只读元素自己那条会把它读成 `<unset>`,所以按「自己没写就往上找」求值。
 */
function typo(el: Element, prop: 'font-size' | 'font-weight'): string {
  let node: Element | null = el;
  while (node) {
    const got = resolved(node)[prop];
    if (got && got !== UNSET && got.toLowerCase() !== 'inherit') return got.toLowerCase();
    node = node.parentElement;
  }
  return UNSET;
}

/** 顶层壳自己那一行 */
const flatOf = (root: HTMLElement): HTMLElement =>
  need(root.querySelector<HTMLElement>(`details.${cls('flat')}`), '扁平壳');

/**
 * 壳头那个状态词。运行态是 `span.shimmer.head`(旁边还有个 `span[data-orb]` 的球),
 * 终态是一枚纯 `<span>`(失败那一态多戴一枚 `.stFail`)。
 * 排掉球是因为它是同级的 `<span>`,不是文字。
 */
function headWord(root: HTMLElement): HTMLElement {
  const content = need(
    flatOf(root).querySelector<HTMLElement>(`:scope > summary > .${cls('summaryContent')}`),
    '壳头',
  );
  const spans = [...content.querySelectorAll<HTMLElement>(':scope > span:not([data-orb])')];
  return need(spans[spans.length - 1], '壳头的状态词');
}

/** 壳头右边那枚总耗时 */
const headMeta = (root: HTMLElement): HTMLElement =>
  need(flatOf(root).querySelector<HTMLElement>(`:scope > summary > .${cls('meta')}`), '壳头的总耗时');

/** 步骤那一行的折叠头(`.fold.flat > .body.stack > .fold > summary`) */
function stepSummary(root: HTMLElement): HTMLElement {
  const flat = flatOf(root);
  const stepEl = need(
    flat.querySelector<HTMLElement>(`:scope > .${cls('body')} > details.${cls('stepRow')}`),
    '步骤抽屉',
  );
  return need(stepEl.querySelector<HTMLElement>(':scope > summary'), '步骤的折叠头');
}

/** 步骤**里面**那条可折叠命令行的折叠头 —— 基础规则 `.fold > summary` 的落点 */
function drawerSummary(root: HTMLElement): HTMLElement {
  const inner = need(
    stepSummary(root).parentElement?.querySelector<HTMLElement>(`.${cls('body')} details`),
    '步骤抽屉里的折叠头',
  );
  return need(inner.querySelector<HTMLElement>(':scope > summary'), '抽屉折叠头的 summary');
}

/** 步骤里的工具行(`div.tool`) */
const toolRow = (root: HTMLElement): HTMLElement =>
  need(stepSummary(root).parentElement?.querySelector<HTMLElement>(`.${cls('tool')}`), '工具行');

/** 壳 body 直接挂着的那段开场白 */
const openingProse = (root: HTMLElement): HTMLElement =>
  need(
    flatOf(root).querySelector<HTMLElement>(`:scope > .${cls('body')} > .${cls('think')}`),
    '开场白',
  );

const RUNNING = (): HTMLElement => mount(shellOf('running'));
const DONE = (): HTMLElement => mount(shellOf('succeeded'));
const STOPPED = (): HTMLElement => mount(shellOf('running', true));
const FAILED = (): HTMLElement => mount(shellOf('failed'));

/* ══ 防真空:先证明这把尺子看得见这一格,也看得见**另一个**值 ═══════════ */

describe('防真空 —— 量尺读得出非默认值', () => {
  it('壳头的字号解得开 var(),不是 <unset>、不是没解开的别名', () => {
    const size = typo(headWord(DONE()), 'font-size');
    expect(size, '样式链没盖到壳头').not.toBe(UNSET);
    expect(size, 'token 没解开 —— 下面的比较都不成立').toMatch(/^\d+px$/);
  });

  it('同一把尺子在**别的**折叠头上读回 12px —— 证明它分得出两档', () => {
    // 这一格就是下半场的反向对照本身:它读回 12 而壳头读回 13,
    // 「相等断言两边都空过」这类假绿在这里就被挡住了。
    expect(typo(drawerSummary(DONE()), 'font-size')).toBe(MINI_SIZE);
  });

  it('四态的夹具都真的渲染出了状态词', () => {
    expect(headWord(RUNNING()).textContent).toBe('进行中');
    expect(headWord(DONE()).textContent).toBe('已完成');
    // OPEND-2626:手动停止那一档的词从「进行中」换成「已取消」。
    // 字号那件事没变(仍和另外三态同号),这里只是把夹具的读数对上。
    expect(headWord(STOPPED()).textContent).toBe('已取消');
    expect(headWord(FAILED()).textContent).toBe('运行失败');
    // 运行态那三个字确实住在 `.shimmer` 里 —— 「同一个壳头两个字号」的成因就在这
    expect(headWord(RUNNING()).className).toContain(cls('shimmer'));
    expect(headWord(DONE()).className).not.toContain(cls('shimmer'));
  });
});

/* ══ 正向:三个终态都提到 13px ═══════════════════════════════════════ */

describe('正向 · 顶层壳头的三个终态提到 13px(2026-09-02 产品裁决)', () => {
  it('「已完成」是 13px', () => {
    expect(typo(headWord(DONE()), 'font-size')).toBe(BODY_SIZE);
  });

  it('「已停止」是 13px', () => {
    expect(typo(headWord(STOPPED()), 'font-size')).toBe(BODY_SIZE);
  });

  it('「运行失败」是 13px', () => {
    expect(typo(headWord(FAILED()), 'font-size')).toBe(BODY_SIZE);
  });

  /**
   * 裁决的**结果**是「同号」,不是「都等于 13」—— 所以这一条写成等式。
   * 以后谁把其中一边改了(比如 `.shimmer` 换档,或者壳头再被对稿改回 12),
   * 另一边会跟着红,而不是只有被改的那一边红。
   */
  it('四态同号 —— 用等式钉住,不是两边各写一个 13px', () => {
    const running = typo(headWord(RUNNING()), 'font-size');
    expect(typo(headWord(DONE()), 'font-size')).toBe(running);
    expect(typo(headWord(STOPPED()), 'font-size')).toBe(running);
    expect(typo(headWord(FAILED()), 'font-size')).toBe(running);
  });

  /**
   * 改在**最窄的那一层**:`.fold.flat > summary`。
   * 谁把这条字号搬到基础的 `.fold > summary` 上(那样壳头也是 13,正向全绿),
   * 这一条会当场红 —— 下半场的反向对照才是真正拦住那件事的,这条只是把意图写死。
   */
  it('字号写在 `.fold.flat > summary` 这一层,不是基础规则', () => {
    const winners = declaring(headWord(DONE()).closest('summary')!, 'font-size');
    const last = winners[winners.length - 1];
    expect(last, '没有任何规则给壳头字号').toBeTruthy();
    expect(last!.selector).toContain(`.${cls('flat')} > summary`);
  });
});

/* ══ 反向对照:一格都不许扩散 ═══════════════════════════════════════ */

describe('反向对照 · 只动了顶层壳头这一格', () => {
  it('基础规则 `.fold > summary` 仍然是 12px —— 整片折叠头没被带走', () => {
    const base = new RegExp(
      `\\.${cls('fold')} > summary \\{[^{}]*font-size: var\\(--chat-t-mini\\)`,
    );
    expect(stripComments(scopeModule(RECORD_CSS, recordStyles))).toMatch(base);
  });

  it('步骤抽屉里的折叠头仍然是 12px', () => {
    expect(typo(drawerSummary(DONE()), 'font-size')).toBe(MINI_SIZE);
    expect(typo(drawerSummary(RUNNING()), 'font-size')).toBe(MINI_SIZE);
  });

  it('壳头右边那枚总耗时仍然是 12px(它自己写着 --chat-t-cap)', () => {
    expect(typo(headMeta(DONE()), 'font-size')).toBe(MINI_SIZE);
    expect(typo(headMeta(RUNNING()), 'font-size')).toBe(MINI_SIZE);
  });

  it('「进行中」那一档一个字没动:仍是 13px,字重仍是 600', () => {
    expect(typo(headWord(RUNNING()), 'font-size')).toBe(BODY_SIZE);
    expect(typo(headWord(RUNNING()), 'font-weight')).toBe(HEAD_WEIGHT);
  });

  it('壳头字重四态都还是 600 —— 这次只动字号', () => {
    for (const root of [RUNNING(), DONE(), STOPPED(), FAILED()]) {
      expect(typo(headWord(root), 'font-weight')).toBe(HEAD_WEIGHT);
    }
  });

  it('步骤行仍是 13px / 500', () => {
    expect(typo(stepSummary(DONE()), 'font-size')).toBe(BODY_SIZE);
    expect(typo(stepSummary(DONE()), 'font-weight')).toBe('500');
  });

  it('工具行仍是 13px', () => {
    expect(typo(toolRow(DONE()), 'font-size')).toBe(BODY_SIZE);
  });

  it('开场白仍是 13px', () => {
    expect(typo(openingProse(DONE()), 'font-size')).toBe(BODY_SIZE);
  });
});

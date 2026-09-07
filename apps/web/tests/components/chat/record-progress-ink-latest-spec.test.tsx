// @vitest-environment jsdom
/**
 * 任务进度那一族的墨色 / 字号 / 字重,按**最新稿**逐字节对齐。
 *
 * ## 稿子基线
 *
 * `361b78253e`(`origin/design/chat-cards-surface` 头),真正动刀的是它上面那个
 * `104fc5c5dc`。那一次**把「任务进度整族退到静音灰」整条掉头了** —— 不是补丁,是反转:
 *
 * | 稿子出处(`docs/design/chat-panel/src/components.css` @ 361b78253e) | 原文 |
 * |---|---|
 * | 1042 | `.fold.mod-flat > summary .ms { color: var(--text-strong) }` |
 * | 1064 | `.fold.mod-flat > .body.mod-stack > .fold > summary .ms { color: var(--text-strong); font-weight: 500 }` |
 * | 1066 | `.fold.mod-flat { --progress-detail-ink: var(--text-strong) }` |
 * | 1071-1076 | 步骤间小结 `font-size: var(--t-body); font-weight: 400; color: var(--progress-detail-ink)` |
 * | 1107 | `.fold.mod-flat .fold > summary:has(> .ti) > :is(.nm, .ms) { color: var(--text-strong) }` |
 * | 2144-2147 | `.tool .nm { … font-weight: 400 }` |
 * | 2196 | `.tool .fn code { … color: inherit }` |
 * | 2236-2240 | `.fold.mod-flat .tool:not(.is-fail), … :is(.ti, .ti > svg, .pk, .nm code, .ms, .dst), .fold.mod-flat .tool.is-fail, .fold.mod-flat .tool.is-fail :is(.nm code, .ms, .dst) { color: var(--text-strong) }` |
 * | 2241 | `.fold.mod-flat .tool .fn:hover code { text-decoration-color: currentColor }` |
 * | 2419 / 2439 / 2450 | `.term` / `.term.mod-cmd` / `.term .er` —— **仍是字面 `#A3A3A3`** |
 *
 * 稿子的 `--text-strong` 在浅色主题是 `#202020`(稿子 `tokens.css:62`),和产品
 * `styles/tokens.css:37` 逐字节相同 —— 所以下面的期望值一律写**稿子的字面值**,
 * 不写「用了哪个变量」。
 *
 * ## 这个文件同时钉两边,少一边就等于没防住
 *
 * 稿子要**任务进度那一族变深**(#202020),同时要**终端块留在浅灰**(#A3A3A3);
 * 而产品这两边原来挂在**同一枚**共用变量 `--chat-progress-detail-ink` 上。
 * 只钉「进度变深」的话,把那枚变量整个翻深就能全绿,终端块会被顺手一起染深而没人看见;
 * 只钉「终端仍浅」的话,不动那枚变量也全绿。**两条都在,才是一道能挡住事的判据。**
 *
 * ## 为什么必须真跑层叠
 *
 * 三类假绿在这个仓库都真实发生过:
 *  1. vitest 的 CSS Module 代理对**任何**键都返回类名 —— `toMatch(/xxx/)` 连拼错都能过;
 *  2. jsdom 不自动加载样式表,`getComputedStyle` 读不到层叠结果;
 *  3. `expect(a).toBe(b)` 在两边都算出 `inherit` / `currentcolor` 这类**非值**时空过 ——
 *     文件名那一条要断的正好是 `inherit`,所以它断的是「文件名的**计算色**等于整行的色」,
 *     并且**先证明整行的色是 #202020**(不是某个默认值),再比相等。
 *
 * 量尺用共享的 `tests/helpers/chat-mirror-cascade.ts`(只读)。
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

/* ── 稿子那几个字面值 —— 判据的锚,不从实现里读回来 ─────────────────── */

/** `--text-strong` 浅色主题值。任务进度整族(标题 / 耗时 / 图标 / 文件名 / 改动量)都是它 */
const DESIGN_INK = '#202020';
/** 终端块那三行仍是字面 `#A3A3A3` —— **没有**跟着任务进度一起变深 */
const DESIGN_TERMINAL_INK = '#a3a3a3';
/** 失败那一格的红只标记号,不染整行 */
const DESIGN_RED = '#f04142';
/** `--t-body` → `--font-size-13` */
const DESIGN_BODY_SIZE = '13px';
/** `--t-cap` / `--t-mini` → `--font-size-12` */
const DESIGN_CAP_SIZE = '12px';
/** 稿子 `--mono`(稿子 `tokens.css:156`),等宽那几格全走它 */
const DESIGN_MONO = '"JiduMono Pro", ui-monospace, "SFMono-Regular", monospace';

/** 掉头之前落在这几档 —— 反向锚,用来确认「量尺真的看得见这处偏差」 */
const BEFORE = {
  /** 掉头前的 `--chat-progress-detail-ink` */
  mutedInk: '#a3a3a3',
  /** `--chat-text-soft` */
  soft: '#848484',
  /** `--chat-text` */
  text: '#494949',
} as const;

/* ── CSS Module:哈希改写 + `:global()` 保护 ───────────────────────── */

const NUL = String.fromCharCode(0);

/**
 * `hashed()` 会把**所有** `.foo` 改写成哈希名,`:global()` 里的全局类也不例外,
 * 而改写后的 `:global(...)` jsdom 的 `matches()` 认不出来 —— 量尺对认不出来的选择器
 * 是**抛异常**(它拒绝静默丢规则)。所以先把 `:global(X)` 摘成占位符,哈希之后原样填回。
 *
 * 占位符用 NUL 包住,不用空格:样式表注释里有「29 / 7 这两个数」这种写法,
 * 拿空格包数字会把 ` 29 ` 和 ` 7 ` 一并吃掉、拼出一个提前闭合的注释,
 * 后面一整条规则会被读成选择器(共享量尺随即抛异常)。
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
 * 量尺的 `var()` 解析只认 token 表里的 `:root` 块,而 `--chat-*` 住在
 * `ChatRoot.module.css` 的 `.vars, .root` 上、执行记录那两枚墨色 token 住在
 * `record.module.css` 的普通规则上。**从真文件里按「哪个块声明了这枚变量」抠出来**
 * 再包成 `:root` —— 写死一份副本的话,改了产品定义这里照样绿。
 */
function varBlock(css: string, probe: string): string {
  const m = new RegExp(`\\{([^{}]*${probe}\\s*:[^{}]*)\\}`).exec(stripComments(css));
  if (!m?.[1]) throw new Error(`抠不到声明 \`${probe}\` 的那个块`);
  return `:root {${m[1]}}`;
}

/** 这枚 token 还不存在时,让下面的断言逐条报出来,而不是整个文件在加载期挂掉 */
function maybeVarBlock(css: string, probe: string): string[] {
  try {
    return [varBlock(css, probe)];
  } catch {
    return [];
  }
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

const TARGETS = ['color', 'font-size', 'font-weight'] as const;

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
  ...maybeVarBlock(RECORD_CSS, '--chat-progress-detail-ink'),
  ...maybeVarBlock(RECORD_CSS, '--chat-terminal-ink'),
];

const { resolved } = createResolver(SHEETS, TOKEN_SHEETS, TARGETS);

/**
 * 下划线颜色量尺。共享量尺的 `expand()` 只展开一张固定属性表,里面没有
 * `text-decoration-color`,而这一格的判据正是它;共享量尺是只读的,所以这里用它
 * **导出**的 `parseRules` / `specificity` 拼一把小的,决胜规则完全照它那套
 * (特异性, 源码顺序)。`:hover` 在 jsdom 里永远不匹配,所以先把它从选择器上摘掉 ——
 * 摘的是同一条规则的悬停分支,不是换一条规则。
 */
const HOVER_RULES = SHEETS.flatMap((css, i) => parseRules(css, i * 100_000).rules);
function hoverDecoColor(el: Element): string {
  let best: { spec: number; order: number; value: string } | null = null;
  for (const rule of HOVER_RULES) {
    const m = /(?:^|;)\s*text-decoration-color\s*:\s*([^;]+)/.exec(rule.body);
    if (!m?.[1]) continue;
    for (const branch of rule.selector.split(',')) {
      const plain = branch.trim().replace(/:hover\b/g, '');
      if (!plain || plain.includes('::')) continue;
      let hit = false;
      try {
        hit = el.matches(plain);
      } catch {
        continue;
      }
      if (!hit) continue;
      const spec = specificity(plain);
      if (!best || spec > best.spec || (spec === best.spec && rule.order >= best.order)) {
        best = { spec, order: rule.order, value: m[1].trim() };
      }
    }
  }
  if (!best) throw new Error('没有任何规则给这一格的下划线上色 —— 断言会空过');
  return best.value.toLowerCase();
}

/* ── 夹具 ─────────────────────────────────────────────────────────── */

const R = recordStyles as unknown as Record<string, string>;
const cls = (name: string): string => {
  const got = R[name];
  if (!got) throw new Error(`record.module.css 没有 \`${name}\` 这个类`);
  return got;
};

const prose = (text: string): ShellItem => ({ kind: 'text', text, thinking: false } as ShellItem);
const readRow = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'read', title: `读取 ${id}`, name: 'Read', rawTitle: false,
  file: { path: id, label: id }, delta: null, hits: null, pattern: null, elapsedMs: 400,
  failed: false, failReason: null, command: null, terminal: null,
} as unknown as ShellItem);
const writeRow = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'write', title: `新建 ${id}`, name: 'Write', rawTitle: false,
  file: { path: id, label: id }, delta: { added: 182, removed: 0 },
  hits: null, pattern: null, elapsedMs: 100,
  failed: false, failReason: null, command: null, terminal: null,
} as unknown as ShellItem);
const failRow = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'read', title: `读取 ${id}`, name: 'Read', rawTitle: false,
  file: { path: id, label: id }, delta: null, hits: null, pattern: null, elapsedMs: 1200,
  failed: true, failReason: null, command: null, terminal: null,
} as unknown as ShellItem);
/** 跑命令的**可折叠**那一支(组件 11)—— 稿子 1107 那条规则唯一的落点 */
const cmdRow = (id: string, failed = false): ShellItem => ({
  kind: 'tool', id, tool: 'bash', title: '构建产物,看能不能跑通', name: 'Bash', rawTitle: false,
  file: null, delta: null, hits: null, pattern: null, elapsedMs: 8400,
  failed, failReason: null,
  command: 'npm run build',
  terminal: '✓ built in 2.14s (2 pages)\n✗ Could not resolve "./ProductCard"\nplain output line',
} as unknown as ShellItem);
const step = (content: string, items: ShellItem[], elapsedMs: number): ShellItem => ({
  kind: 'todo',
  segment: {
    content, status: 'completed', recalled: false, abandoned: false, implicit: false, items, elapsedMs,
  },
} as unknown as ShellItem);

const SHELL = {
  kind: 'shell', seq: 0, status: 'succeeded', segments: [],
  thinking: false, stopped: false, elapsedMs: 72_000, quietMs: null,
  items: [
    prose('两张图是同一套栅格,先复刻列表页。'),
    { kind: 'plan', steps: ['复刻商品列表页', '抽出商品卡为共享组件'] } as unknown as ShellItem,
    step('复刻商品列表页', [readRow('首页.png'), writeRow('product-list.html'), cmdRow('c1')], 18_200),
    prose('截图是 4 列、24px 沟槽,和现成的栅格对得上。'),
    step('接上两页之间的跳转', [failRow('规范.pdf'), cmdRow('c2', true)], 4_100),
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

/** 字色允许从祖先继承(稿子里「整行同色」有一半是靠继承实现的) */
function ink(el: Element): string {
  let node: Element | null = el;
  while (node) {
    const got = resolved(node)['color'];
    if (got && got !== UNSET && got.toLowerCase() !== 'inherit') return got.toLowerCase();
    node = node.parentElement;
  }
  throw new Error('这一路上没有任何规则上色 —— 断言会空过');
}
/** 字号 / 字重同样可继承 */
function typo(el: Element, prop: 'font-size' | 'font-weight'): string {
  let node: Element | null = el;
  while (node) {
    const got = resolved(node)[prop];
    if (got && got !== UNSET && got.toLowerCase() !== 'inherit') return got.toLowerCase();
    node = node.parentElement;
  }
  throw new Error(`这一路上没有任何规则给 ${prop} 赋值 —— 断言会空过`);
}
/** 这枚元素**自己**那条规则写的值(用来区分「写死一个色」和「跟着整行走」) */
function own(el: Element, prop: string): string {
  return (resolved(el)[prop] ?? UNSET).toLowerCase();
}

interface Picked {
  shellMeta: HTMLElement;
  planKey: HTMLElement;
  interlude: HTMLElement;
  stepMeta: HTMLElement;
  toolRow: HTMLElement;
  toolIcon: HTMLElement;
  toolName: HTMLElement;
  toolFile: HTMLElement;
  toolFileCode: HTMLElement;
  toolMeta: HTMLElement;
  delta: HTMLElement;
  cmdIcon: HTMLElement;
  cmdName: HTMLElement;
  cmdMeta: HTMLElement;
  termCmd: HTMLElement;
  termOut: HTMLElement;
  termEr: HTMLElement;
  termOk: HTMLElement;
  failRowEl: HTMLElement;
  failIcon: HTMLElement;
  failFileCode: HTMLElement;
  failWhy: HTMLElement;
  failCmdIcon: HTMLElement;
  failCmdName: HTMLElement;
  failCmdMeta: HTMLElement;
}

function pick(): Picked {
  const root = mount();
  const flat = need(root.querySelector<HTMLElement>(`details.${cls('flat')}`), '扁平壳');
  const q = <T extends Element>(el: Element, sel: string, what: string): T =>
    need(el.querySelector<T>(sel), what);

  /*
   * 执行计划那一格也戴 `.stepRow`(它渲染的是一摞带序号的 `.tool`),所以不能按
   * 下标取步骤 —— 按「这条抽屉里装着什么」找,漏了这一层会取到计划,
   * 于是「夹具里没有带文件名的工具行」。
   */
  const steps = [...flat.querySelectorAll<HTMLElement>(
    `:scope > .${cls('body')} > details.${cls('stepRow')}`,
  )];
  const first = need(steps.find((s) => s.querySelector(`.${cls('file')}`)), '装着文件名工具行的步骤');
  const second = need(
    steps.find((s) => s.querySelector(`.${cls('tool')}.${cls('fail')}`)),
    '装着失败工具行的步骤',
  );

  const tools = [...first.querySelectorAll<HTMLElement>(`.${cls('tool')}`)];
  const toolRow = need(tools.find((t) => t.querySelector(`.${cls('file')}`)), '带文件名的工具行');
  const withDelta = need(tools.find((t) => t.querySelector(`.${cls('delta')}`)), '带改动量的工具行');

  const summaryIcon = `:scope > summary > .${cls('summaryContent')} > .${cls('icon')}`;
  const summaryName = `:scope > summary > .${cls('summaryContent')} > .${cls('name')}`;
  const summaryMeta = `:scope > summary > .${cls('meta')}`;

  const cmdFold = need(
    [...first.querySelectorAll<HTMLElement>('details')].find((d) => d.querySelector(summaryIcon)),
    '可折叠的命令行',
  );
  const failCmdFold = need(second.querySelector<HTMLElement>(`details.${cls('fail')}`), '失败的命令行');
  const code = q<HTMLElement>(cmdFold, `.${cls('code')}`, '终端块');
  const failCode = q<HTMLElement>(failCmdFold, `.${cls('code')}`, '失败命令行的终端块');
  const failTool = q<HTMLElement>(second, `.${cls('tool')}.${cls('fail')}`, '失败的工具行');

  const interlude = need(
    [...flat.querySelectorAll<HTMLElement>(`:scope > .${cls('body')} > .${cls('think')}`)][1],
    '夹在两步之间的小结',
  );

  return {
    shellMeta: q(flat, `:scope > summary > .${cls('meta')}`, '壳头的总耗时'),
    planKey: q(flat, `.${cls('step')}`, '执行计划的序号'),
    interlude,
    stepMeta: q(first, summaryMeta, '步骤耗时'),
    toolRow,
    toolIcon: q(toolRow, `.${cls('icon')}`, '工具行图标'),
    toolName: q(toolRow, `.${cls('name')}`, '工具行标题'),
    toolFile: q(toolRow, `.${cls('file')}`, '文件名按钮'),
    toolFileCode: q(toolRow, `.${cls('file')} code`, '工具行文件名'),
    toolMeta: q(toolRow, `.${cls('meta')}`, '工具行耗时'),
    delta: q(withDelta, `.${cls('delta')}`, '改动量'),
    cmdIcon: q(cmdFold, summaryIcon, '命令行图标'),
    cmdName: q(cmdFold, summaryName, '命令行标题'),
    cmdMeta: q(cmdFold, summaryMeta, '命令行耗时'),
    termCmd: q(code, `.${cls('term')}.${cls('cmd')}`, '终端命令块'),
    termOut: q(code, `.${cls('term')}:not(.${cls('cmd')})`, '终端输出块'),
    termEr: q(failCode, `.${cls('er')}`, '终端报错行'),
    termOk: q(code, `.${cls('ok')}`, '终端成功行'),
    failRowEl: failTool,
    failIcon: q(failTool, `.${cls('icon')}`, '失败行图标'),
    failFileCode: q(failTool, `.${cls('file')} code`, '失败行文件名'),
    failWhy: q(failTool, `.${cls('why')}`, '「失败」标记'),
    failCmdIcon: q(failCmdFold, summaryIcon, '失败命令行图标'),
    failCmdName: q(failCmdFold, summaryName, '失败命令行标题'),
    failCmdMeta: q(failCmdFold, summaryMeta, '失败命令行耗时'),
  };
}

/* ── ① 折叠命令行:标题和耗时跟着任务进度走深色 ────────────────────── */

describe('① 可折叠命令行(稿子 1107)', () => {
  /**
   * 稿子 1107 这一版**去掉了** `:not(.is-fail)` —— 失败行的标题和耗时同样是深色,
   * 红只留给行首那枚图标(`.fold.is-fail > summary .ti`)。
   */
  it('成功那一档:图标 / 标题 / 耗时三格都是 #202020', () => {
    const p = pick();
    expect(ink(p.cmdName)).toBe(DESIGN_INK);
    expect(ink(p.cmdMeta)).toBe(DESIGN_INK);
    expect(ink(p.cmdIcon)).toBe(DESIGN_INK);
    // 掉头前这三格是静音灰
    expect(ink(p.cmdName)).not.toBe(BEFORE.mutedInk);
    expect(ink(p.cmdMeta)).not.toBe(BEFORE.mutedInk);
  });

  it('失败那一档:标题和耗时照样深色,红只剩行首那枚图标', () => {
    const p = pick();
    expect(ink(p.failCmdName)).toBe(DESIGN_INK);
    expect(ink(p.failCmdMeta)).toBe(DESIGN_INK);
    expect(ink(p.failCmdIcon)).toBe(DESIGN_RED);
    // 掉头前失败行的耗时落在 --chat-text-soft
    expect(ink(p.failCmdMeta)).not.toBe(BEFORE.soft);
  });

  it('耗时那一格是 12px 等宽,字体表和稿子同一份', () => {
    const p = pick();
    expect(typo(p.cmdMeta, 'font-size')).toBe(DESIGN_CAP_SIZE);
    expect(stripComments(read('styles/tokens.css'))).toContain(`--mono: ${DESIGN_MONO}`);
    expect(stripComments(CHAT_ROOT_CSS)).toContain('--chat-font-mono: var(--mono)');
  });
});

/* ── ② 工具行文件名跟着整行走 ─────────────────────────────────────── */

describe('② 工具行的文件名(稿子 2196)', () => {
  /**
   * 稿子写的是 `color: inherit` —— 文件名**没有自己的一档**,它就是整行那个颜色。
   * 断言分三步走,少一步就会空过:
   *   ① 整行的色是 #202020(证明它不是某个默认值,比较才有意义);
   *   ② 文件名的**计算色等于整行的色**(这是 `inherit` 的语义,不是断字符串);
   *   ③ 文件名**自己**那条规则写的就是 `inherit`(1:1 照抄稿子那一格)。
   */
  it('文件名的计算色 = 整行的色 = #202020', () => {
    const p = pick();
    expect(ink(p.toolRow)).toBe(DESIGN_INK);
    expect(ink(p.toolFileCode)).toBe(ink(p.toolRow));
    // 掉头前整行是静音灰、文件名反而比整行深一档 —— 两者不等
    expect(ink(p.toolRow)).not.toBe(BEFORE.mutedInk);
  });

  it('文件名自己那条规则写的是 inherit,不是再钉一个色号', () => {
    expect(own(pick().toolFileCode, 'color')).toBe('inherit');
  });

  it('文件名是 12px 等宽,行文字是 13px —— 两档没有被拉平', () => {
    const p = pick();
    expect(typo(p.toolFileCode, 'font-size')).toBe(DESIGN_CAP_SIZE);
    expect(typo(p.toolRow, 'font-size')).toBe(DESIGN_BODY_SIZE);
  });
});

/* ── ③ 文件名的悬停下划线 ─────────────────────────────────────────── */

describe('③ 文件名悬停时的下划线(稿子 2241)', () => {
  /**
   * 稿子把这一格从固定色号换成了 `currentColor` —— 下划线跟着**这一行**走,
   * 不再自己另挑一档灰。产品原来钉的是 `--chat-text-soft`(#848484),
   * 在深色的行上会比字浅两档。
   */
  it('下划线取 currentColor,而那个 current 是 #202020', () => {
    const p = pick();
    expect(hoverDecoColor(p.toolFileCode)).toBe('currentcolor');
    // 不是空过:currentColor 指向的那个色必须是稿子那一档
    expect(ink(p.toolFile)).toBe(DESIGN_INK);
    expect(ink(p.toolFile)).not.toBe(BEFORE.soft);
  });
});

/* ── ④ 失败行的文件名 ─────────────────────────────────────────────── */

describe('④ 失败工具行的文件名(稿子 2239)', () => {
  /**
   * 稿子把失败行的 `.nm code` 也列进了那条深色规则 —— 失败是**状态**,
   * 由行首图标和「失败」二字标;文件名是内容,不跟着染。
   */
  it('失败行的文件名也是 #202020,不是 --chat-text', () => {
    const p = pick();
    expect(ink(p.failFileCode)).toBe(DESIGN_INK);
    expect(ink(p.failFileCode)).not.toBe(BEFORE.text);
  });

  it('这一行只有图标和「失败」二字是红的,整行文字不红', () => {
    const p = pick();
    expect(ink(p.failIcon)).toBe(DESIGN_RED);
    expect(ink(p.failWhy)).toBe(DESIGN_RED);
    expect(ink(p.failRowEl)).toBe(DESIGN_INK);
  });
});

/* ── ⑤ 任务进度整族一起变深(那枚共用变量翻过来了)──────────────────── */

describe('⑤ 任务进度那一族(稿子 1042 / 1064 / 1066 / 2236)', () => {
  it('壳头总耗时、步骤耗时、计划序号、工具行的每一格都是 #202020', () => {
    const p = pick();
    expect(ink(p.shellMeta)).toBe(DESIGN_INK);
    expect(ink(p.stepMeta)).toBe(DESIGN_INK);
    expect(ink(p.planKey)).toBe(DESIGN_INK);
    expect(ink(p.toolIcon)).toBe(DESIGN_INK);
    expect(ink(p.toolMeta)).toBe(DESIGN_INK);
    expect(ink(p.delta)).toBe(DESIGN_INK);
    // 掉头前:壳头耗时 / 序号是 soft,其余是静音灰
    expect(ink(p.shellMeta)).not.toBe(BEFORE.soft);
    expect(ink(p.planKey)).not.toBe(BEFORE.soft);
    expect(ink(p.toolMeta)).not.toBe(BEFORE.mutedInk);
    expect(ink(p.delta)).not.toBe(BEFORE.mutedInk);
  });

  it('夹在两步之间的小结:13px / 400 / #202020', () => {
    const p = pick();
    expect(typo(p.interlude, 'font-size')).toBe(DESIGN_BODY_SIZE);
    expect(typo(p.interlude, 'font-weight')).toBe('400');
    expect(ink(p.interlude)).toBe(DESIGN_INK);
    // 掉头前是 12px 静音灰
    expect(typo(p.interlude, 'font-size')).not.toBe(DESIGN_CAP_SIZE);
    expect(ink(p.interlude)).not.toBe(BEFORE.mutedInk);
  });

  it('工具行标题压到常规字重(稿子 2146),不跟着步骤标题的 500', () => {
    expect(typo(pick().toolName, 'font-weight')).toBe('400');
  });
});

/* ── ⑥ 终端块**不**跟着变深 ───────────────────────────────────────── */

describe('⑥ 终端块仍是 #A3A3A3(稿子 2419 / 2439 / 2450)', () => {
  /**
   * 这一条和上面 ⑤ 是**一对**:产品原来把两边挂在同一枚 `--chat-progress-detail-ink` 上,
   * 只钉一边的话,把那枚变量整个翻深就能全绿 —— 终端块被顺手染深而没人看见。
   * 最新稿在浏览器里量过:终端块 `rgb(163, 163, 163)`。
   */
  it('命令 / 输出 / 报错三行都还是浅灰', () => {
    const p = pick();
    expect(ink(p.termCmd)).toBe(DESIGN_TERMINAL_INK);
    expect(ink(p.termOut)).toBe(DESIGN_TERMINAL_INK);
    expect(ink(p.termEr)).toBe(DESIGN_TERMINAL_INK);
    // 没有跟着任务进度一起翻深
    expect(ink(p.termCmd)).not.toBe(DESIGN_INK);
    expect(ink(p.termOut)).not.toBe(DESIGN_INK);
    expect(ink(p.termEr)).not.toBe(DESIGN_INK);
  });

  it('成功行仍是品牌绿 —— 三档同灰没有顺手把语义色也抹平', () => {
    const p = pick();
    expect(ink(p.termOk)).not.toBe(DESIGN_TERMINAL_INK);
    expect(ink(p.termOk)).not.toBe(DESIGN_INK);
  });

  it('两边各有各的出处,不再共用一枚变量', () => {
    const css = stripComments(RECORD_CSS);
    expect(css).toMatch(/--chat-terminal-ink:\s*#a3a3a3/i);
    expect(css).toMatch(/--chat-progress-detail-ink:\s*var\(--chat-text-strong\)/);
  });
});

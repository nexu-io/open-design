// @vitest-environment jsdom
/**
 * 组件 11「工具调用-代码执行」的**默认状态**:始终展开。
 *
 * 稿子的 `cmp-meta` 写的是「执行中展开 → 完成收起」;2026-11-07 的裁决把完成态也
 * 改成摊开 —— 命令输出是记录的一部分,跑完不该消失。下面保留稿子基线说明,便于
 * 对照哪些形态是有意偏离。
 *
 * ── 稿子怎么说的(基线 `729fa43ce7`,PR #7170)────────────────────────────
 *
 * `docs/design/chat-panel/src/body-components.html:1002-1021`,组件 11 的 `cmp-meta`
 * 逐字写着:
 *   `<div><b>出现时机</b> 执行命令时</div>`
 *   `<div><b>默认状态</b> 执行中展开 → 完成收起</div>`
 *
 * 三格样例各自的原件:
 *   · `:1010-1011` 执行中 —— 状态标注是「执行中 · 终端实时追加,限高滚动自动贴底」,
 *     折叠块**带 `open`**,行首是 `mk is-run`,body 里是
 *     `div.code` > `div.term.mod-cmd`(`npm run build`)+ `div.term`(三行实时输出)。
 *   · `:1014-1015` 成功 —— `<details class="fold">`,**不带 `open`**。
 *   · `:1018-1019` 失败 —— `<details class="fold is-fail" open>`。
 *
 * ⚠️ 稿子在执行中那一格给的 `<span class="ms"></span>` 是**空的**;产品 2026-09-02
 * 裁决「进行中的 toolrow 都得有计时」,有意偏离(理由见 `ToolRow.tsx` 文件头
 * 与 `live-row-elapsed.test.tsx`)。**这个文件不碰秒数**,只钉折叠态与正文。
 *
 * ── 修之前是什么样 ────────────────────────────────────────────────────
 *
 * `ToolRow` 那一支写的是 `defaultOpen={row.failed}` —— 只有失败展开,执行中漏了。
 * 叠上 `deferBody`(收起的折叠块**连 body 都不挂载**),后果是:一条跑了 57 秒的
 * 命令,这 57 秒里 DOM 上**一个字的输出都没有** —— 哪怕 `row.terminal` 此刻
 * 已经躺着在途输出(`build-turn-blocks.ts` 的 `inFlightOutputOf`)。
 *
 * ── 防假绿 ───────────────────────────────────────────────────────────
 *
 * 断言的是**输出的文字本身在不在 DOM 里**,不是「有没有一个 details」、
 * 也不是「有没有某个 class」—— vitest 的 CSS Module 代理对任何 key 都返回类名,
 * 断言 class 证明不了任何事。
 *
 * ⚠️ **`running` 现在必须显式传**(2026-09-03)。这个文件测的是「**轮次还在跑**」
 * 那一档,而在此之前它只给了 `pending: true` 就断言摊开 —— `row.pending` 的定义是
 * `result == null`(「从来没回来过」),用户按停止之后它永远为真。也就是说这些用例
 * 原来喂进去的数据**同时**符合「正在跑」和「被停掉之后的残行」两种情形,断言的却只是
 * 前者。自动摊开改成认 `row.pending && running` 之后,「正在跑」这层意思必须自己说出来。
 * 那个洞与不变量本身钉在 `stopped-run-row-collapse.test.tsx`。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ToolRow } from '../../../src/components/chat/primitives/ToolRow';
import type { ToolRow as ToolRowData } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

/** 断言用的是稿子的中文原文,所以显式挂 zh-CN(不挂 provider 时 useT 回落英文) */
function render(ui: ReactElement) {
  const wrap = (node: ReactElement) => <I18nProvider initial="zh-CN">{node}</I18nProvider>;
  const result = rtlRender(wrap(ui));
  return { ...result, rerender: (next: ReactElement) => result.rerender(wrap(next)) };
}

/** 稿子 `:1010-1011` 那一格的数据形态:人话标题 + 命令 + 实时输出 */
const LIVE_OUT = [
  'vite v5.4.2 building for production...',
  'transforming (142) src/components/ProductCard.tsx',
  'rendering chunks...',
].join('\n');

function cmd(over: Partial<ToolRowData> = {}): ToolRowData {
  return {
    kind: 'tool',
    id: 'c1',
    tool: 'exec',
    name: 'Bash',
    /* 人话标题 = agent 给了 description,走折叠块那一支 */
    title: '构建产物,看能不能跑通',
    rawTitle: false,
    file: null,
    pattern: null,
    hits: null,
    delta: null,
    elapsedMs: null,
    pending: false,
    failed: false,
    failReason: null,
    command: 'npm run build',
    terminal: null,
    ...over,
  };
}

/** 执行中:调用发出去了、结果没回来,在途输出已经有三行 */
const running = (over: Partial<ToolRowData> = {}): ToolRowData =>
  cmd({ pending: true, terminal: LIVE_OUT, elapsedMs: 4100, ...over });

/** 跑完(成功):同一次调用换状态 —— id 不变 */
const settled = (over: Partial<ToolRowData> = {}): ToolRowData =>
  cmd({ pending: false, terminal: '✓ built in 8.42s · dist/ 已更新', elapsedMs: 8420, ...over });

const fold = (): HTMLDetailsElement => {
  const el = document.querySelector<HTMLDetailsElement>('details');
  if (!el) throw new Error('折叠块没渲染出来 —— 有人话标题的命令行本该是 <details>');
  return el;
};

/** 浏览器在 `open` 属性被写回时派发的那一次 —— 不是用户点的(OPEND-2557) */
const echoToggle = (el: HTMLDetailsElement): void => {
  fireEvent(el, new Event('toggle', { bubbles: false }));
};

/** 真人点标题行:DOM 先自己翻面,浏览器随后才派发 toggle */
const clickSummary = (el: HTMLDetailsElement): void => {
  const s = el.querySelector<HTMLElement>('summary');
  if (!s) throw new Error('summary 没渲染出来');
  fireEvent.click(s);
  echoToggle(el);
};

describe('执行中的命令行:默认展开,输出当场看得见(稿子 body-components.html:1010-1011)', () => {
  it('命令还在跑的时候,终端输出的每一行都真的在 DOM 里', () => {
    const { container } = render(<ToolRow running row={running()} />);

    // ① 折叠块是开着的
    expect(fold().open, '稿子这一格的 <details> 带 open').toBe(true);

    // ② 命令原文在
    expect(container.innerHTML).toContain('npm run build');

    // ③ **输出的文字**在 —— 这一条才是 bug 的判据:
    //    修之前 deferBody 让 body 根本不挂载,这三行一个字都到不了 DOM
    for (const line of LIVE_OUT.split('\n')) {
      expect(screen.getByText(line), `在途输出缺了这一行:${line}`).toBeTruthy();
    }
  });

  it('deferBody 默认开着也拦不住 —— 展开的折叠块首帧就挂 body', () => {
    // 生产默认就是 deferBody=true(ExecutionShell 的 deferCollapsedBodies 默认 true)
    const { container } = render(<ToolRow running row={running()} deferBody />);
    expect(container.textContent).toContain('rendering chunks...');
  });

  it('还没有任何输出时也照样展开 —— 至少能看见「它在跑什么命令」', () => {
    const { container } = render(<ToolRow running row={running({ terminal: null })} />);
    expect(fold().open).toBe(true);
    expect(container.innerHTML).toContain('npm run build');
  });
});

describe('跑完保持展开(2026-11-07:不再自动收起)', () => {
  it('同一行从 pending 翻成成功,折叠块保持开着的', () => {
    const { rerender, container } = render(<ToolRow running row={running()} />);
    expect(fold().open).toBe(true);
    // 摊开那一帧浏览器会为「open 被写上」派发一次 toggle —— 不算用户点过
    echoToggle(fold());

    rerender(<ToolRow row={settled()} />);
    expect(fold().open, '跑完不该把命令现场收走').toBe(true);
    expect(container.textContent).toContain('✓ built in 8.42s');
  });

  it('首屏:一条已完成的成功命令行也默认展开,正文直接挂载', () => {
    // 重载老会话就是这一档:没有正在跑的,所有行一上来就是完成态
    const { container } = render(<ToolRow row={settled()} deferBody />);
    expect(fold().open).toBe(true);
    expect(container.querySelector('div[class*="code"]'), '默认展开 → 正文挂载').not.toBeNull();
    expect(container.textContent).toContain('✓ built in 8.42s');
  });

  it('跑完翻成失败,同样保持展开', () => {
    const { rerender, container } = render(<ToolRow running row={running()} />);
    echoToggle(fold());

    rerender(<ToolRow row={settled({ failed: true, terminal: '✗ Could not resolve "./ProductCard"' })} />);
    expect(fold().open).toBe(true);
    expect(container.textContent).toContain('✗ Could not resolve "./ProductCard"');
  });
});

describe('用户自己动过的,生命周期不许拨回去', () => {
  it('用户在跑的时候手动收起了,跑完不许替他打开', () => {
    const { rerender } = render(<ToolRow running row={running()} />);
    echoToggle(fold());

    clickSummary(fold());
    expect(fold().open, '用户点了收起').toBe(false);

    rerender(<ToolRow row={settled()} />);
    expect(fold().open).toBe(false);
  });

  it('用户手动收起的已完成行,后续重渲染不许把它打开', () => {
    const { rerender } = render(<ToolRow row={settled()} />);
    expect(fold().open).toBe(true);

    clickSummary(fold());
    expect(fold().open).toBe(false);

    rerender(<ToolRow row={settled({ elapsedMs: 8430 })} />);
    expect(fold().open, '用户收起的不许被拨回去').toBe(false);
  });
});

describe('反向对照:别的状态一个都没改坏', () => {
  it('成功且用户没动过的,默认展开 —— 输出是记录的一部分', () => {
    const { container } = render(<ToolRow row={settled()} />);
    expect(fold().open).toBe(true);
    expect(container.textContent).toContain('✓ built in 8.42s');
  });

  it('失败的默认展开,报错原文在 DOM 里(稿子 :1018-1019 是 `fold is-fail` + open)', () => {
    const { container } = render(
      <ToolRow row={settled({ failed: true, terminal: '✗ Could not resolve "./ProductCard"', elapsedMs: 2100 })} />,
    );
    expect(fold().open).toBe(true);
    expect(container.textContent).toContain('✗ Could not resolve "./ProductCard"');
    expect(screen.getByText('失败')).toBeTruthy();
  });

  it('点标题行仍然能手动收起、再展开', () => {
    const { container } = render(<ToolRow row={settled()} />);
    clickSummary(fold());
    expect(fold().open).toBe(false);
    clickSummary(fold());
    expect(fold().open).toBe(true);
    expect(container.textContent).toContain('✓ built in 8.42s');
  });
});

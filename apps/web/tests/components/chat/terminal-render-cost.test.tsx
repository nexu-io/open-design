// @vitest-environment jsdom
/**
 * 终端输出块的**成本**:节点数、重渲次数、以及秒表跳动会不会连带它重算。
 *
 * 产品原话(2026-09-03):
 *   「装依赖能吐几百行,会把一屏刷满 —— 这个记得要有最高高度,并且**性能也要提前
 *     考虑**,比如满屏都是这种命令调用,**DOM 数量**、**首屏加载**、**高频刷新**
 *     之类的,都要考虑一下」
 *
 * 组件 11 改成「执行中默认展开」之后,这几笔账才第一次真的发生 —— 在那之前
 * 执行中的折叠块是收起的,`deferBody` 让正文根本不挂载,几百行输出一个节点都没有。
 *
 * ── 三笔账各自的来源 ──────────────────────────────────────────────────
 *
 * ① **节点数**:终端是**一行一个 `<div>`**,500 行输出 = 500 个节点,而
 *    `.term` 只有 `max-height: 104px`,一屏只露 5 行左右,其余全挂着。
 * ② **高频刷新**:ACP 在途输出的节流是 **250ms + 内容变化门**
 *    (`apps/daemon/src/agent-protocol/acp/constants.ts`),即每秒最多 4 批。
 * ③ **秒表连带**:轮次跑着的时候 `AssistantMessage` 每秒 tick 一次
 *    (`useTickingNow` → `setInterval(sample, 1000)`),整棵树跟着重渲。
 *    `Terminal` 没有记忆化的话,这 500 个节点**每秒白重算一遍**,
 *    而那一秒里输出可能一个字都没变。
 *
 * ── 防假绿 ───────────────────────────────────────────────────────────
 *
 * 「重渲了几次」在 DOM 上**看不出来**:React 重渲一个输出相同的子树不会产生任何
 * DOM 变更,MutationObserver 一声不吭。所以这里 `vi.mock` 掉 `TerminalOutput` 那个
 * 模块,在**记忆化边界之内**放一个计数器 —— `ToolRow` 是 `memo(TerminalOutput)`,
 * memo 挡住的那些次数就真的不会进到计数器里。
 *
 * ⚠️ **`running` 现在必须显式传**(2026-09-03)。这个文件测的是「**轮次还在跑**」
 * 那一档,而在此之前它只给了 `pending: true` 就断言摊开 —— `row.pending` 的定义是
 * `result == null`(「从来没回来过」),用户按停止之后它永远为真。也就是说这些用例
 * 原来喂进去的数据**同时**符合「正在跑」和「被停掉之后的残行」两种情形,断言的却只是
 * 前者。自动摊开改成认 `row.pending && running` 之后,「正在跑」这层意思必须自己说出来。
 * 那个洞与不变量本身钉在 `stopped-run-row-collapse.test.tsx`。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render as rtlRender } from '@testing-library/react';
import { createElement, type ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ToolRow } from '../../../src/components/chat/primitives/ToolRow';
import type { ToolRow as ToolRowData } from '../../../src/runtime/chat/contract';

const probe = vi.hoisted(() => ({ renders: [] as string[] }));

vi.mock('../../../src/components/chat/primitives/TerminalOutput', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/components/chat/primitives/TerminalOutput')>();
  return {
    ...actual,
    /*
     * 计数器放在**被 memo 包住的那一层**:`ToolRow` 做的是 `memo(TerminalOutput)`,
     * 所以 memo 跳过的每一次,这里一次都不会被调用 —— 这正是我们要量的东西。
     */
    TerminalOutput: (props: { text: string }): ReactElement => {
      probe.renders.push(props.text);
      return createElement(actual.TerminalOutput, props);
    },
  };
});

beforeEach(() => { probe.renders = []; });
afterEach(cleanup);

function render(ui: ReactElement) {
  const wrap = (node: ReactElement) => <I18nProvider initial="zh-CN">{node}</I18nProvider>;
  const result = rtlRender(wrap(ui));
  return { ...result, rerender: (next: ReactElement) => result.rerender(wrap(next)) };
}

/** 一条 `npm install` 的真实体量:几百行 */
const outputOf = (n: number): string =>
  Array.from({ length: n }, (_, i) => `added package-${i} in ${i}ms`).join('\n');

function row(over: Partial<ToolRowData> = {}): ToolRowData {
  return {
    kind: 'tool', id: 'c1', tool: 'exec', name: 'Bash',
    title: '装依赖', rawTitle: false,
    file: null, pattern: null, hits: null, delta: null,
    elapsedMs: 4100, pending: true, failed: false, failReason: null,
    command: 'npm install', terminal: outputOf(500),
    ...over,
  };
}

describe('终端输出的成本', () => {
  it('【量一下】500 行输出展开时的节点数', () => {
    const { container } = render(<ToolRow running row={row()} />);
    const all = container.querySelectorAll('*').length;
    const termLines = container.querySelectorAll('div[class*="term"] > div').length;

    // 500 行输出 + 1 行命令
    expect(termLines).toBe(501);
    // 整行的节点总数 = 输出行 + 命令行 + 折叠块骨架。骨架是常数级的。
    expect(all - termLines).toBeLessThan(20);

    // eslint-disable-next-line no-console -- 量出来的数要落在跑测的输出里,不然报告里只能靠猜
    console.log(`[量] 500 行输出:整行 ${all} 个节点,其中终端行 ${termLines} 个`);
  });

  it('【量一下】一批新输出到达,Terminal 恰好重渲 1 次', () => {
    const { rerender } = render(<ToolRow running row={row({ terminal: outputOf(100) })} />);
    expect(probe.renders.length, '首帧一次').toBe(1);

    rerender(<ToolRow running row={row({ terminal: outputOf(200) })} />);
    expect(probe.renders.length, '一批新输出 = 一次重渲').toBe(2);

    rerender(<ToolRow running row={row({ terminal: outputOf(300) })} />);
    expect(probe.renders.length).toBe(3);
  });

  it('【这次要修的】秒表每秒跳一次,不许连带 Terminal 重渲', () => {
    /*
     * 真机上这一跳是这样的:`liveEndMs` 前进 → `build-turn-blocks` 产出**新的**
     * row 对象,`elapsedMs` 变了,但 `terminal` 那个字符串一个字没变。
     * 所以下面刻意换新对象、只动 `elapsedMs` —— 和生产一模一样。
     */
    const { rerender } = render(<ToolRow running row={row({ elapsedMs: 1000 })} />);
    expect(probe.renders.length).toBe(1);

    for (const ms of [2000, 3000, 4000, 5000, 6000]) {
      rerender(<ToolRow running row={row({ elapsedMs: ms })} />);
    }

    expect(
      probe.renders.length,
      '秒表跳了 5 次,输出一个字没变 —— Terminal 一次都不该重算',
    ).toBe(1);
  });

  it('反向对照:秒数确实在跳(否则上一条是拿一个没动的界面在自证)', () => {
    const { container, rerender } = render(<ToolRow running row={row({ elapsedMs: 1000 })} />);
    expect(container.textContent).toContain('1.0s');
    rerender(<ToolRow running row={row({ elapsedMs: 6000 })} />);
    expect(container.textContent).toContain('6.0s');
  });

  it('首屏:重载老会话时,收起的命令行一个终端节点都不挂', () => {
    /*
     * 老会话里没有正在跑的调用 —— 每一行都是 `pending: false` 的完成态,
     * 按稿子收起,`deferBody` 于是一次都不挂载正文。
     * 满屏 30 条这样的命令行,终端节点总数应当是 **0**。
     */
    const done = (i: number): ToolRowData =>
      row({ id: `c${i}`, pending: false, terminal: outputOf(500), elapsedMs: 8420 });
    const { container } = render(
      <>{Array.from({ length: 30 }, (_, i) => <ToolRow key={i} row={done(i)} deferBody />)}</>,
    );

    expect(container.querySelectorAll('details').length, '30 行命令都在').toBe(30);
    expect(container.querySelectorAll('div[class*="term"]').length, '一个终端块都不该挂').toBe(0);
    expect(probe.renders.length, 'Terminal 一次都没渲染').toBe(0);

    const all = container.querySelectorAll('*').length;
    // eslint-disable-next-line no-console -- 首屏这一格的数要落在跑测的输出里
    console.log(`[量] 首屏 30 条收起的命令行:整屏 ${all} 个节点(每行 15000 行输出全部没挂)`);
    expect(all, '每行只剩折叠块骨架').toBeLessThanOrEqual(30 * 12);
  });

  /*
   * ── AMR / ACP 那一支(`rawTitle: true`)—— 产品 2026-09-03 统一形态之后 ──────
   *
   * 统一之前这一支是**单行**,几百行输出一个节点都挂不上(那正是要修的 bug:
   * 唯一真有在途输出的链路没地方显示)。统一之后它和有标题那支走同一个折叠块、
   * 同一个 `memo(TerminalOutput)`,所以这三笔账**必须逐个数字对得上** ——
   * 对不上就说明「统一」只统一了外观,没统一成本模型。
   */
  const rawRow = (over: Partial<ToolRowData> = {}): ToolRowData =>
    row({ title: 'npm install', rawTitle: true, ...over });

  it('【量一下】AMR 形态 500 行输出展开时的节点数 —— 与有标题那支同一个量级', () => {
    const { container } = render(<ToolRow running row={rawRow()} />);
    const all = container.querySelectorAll('*').length;
    const termLines = container.querySelectorAll('div[class*="term"] > div').length;

    expect(termLines).toBe(501);
    expect(all - termLines, '折叠块骨架仍是常数级').toBeLessThan(20);

    // eslint-disable-next-line no-console -- 量出来的数要落在跑测的输出里
    console.log(`[量·AMR] 500 行输出:整行 ${all} 个节点,其中终端行 ${termLines} 个`);
  });

  it('【量一下】AMR 形态:秒表每秒跳一次,同样不许连带 Terminal 重渲', () => {
    const { rerender } = render(<ToolRow running row={rawRow({ elapsedMs: 1000 })} />);
    expect(probe.renders.length).toBe(1);
    for (const ms of [2000, 3000, 4000, 5000, 6000]) {
      rerender(<ToolRow running row={rawRow({ elapsedMs: ms })} />);
    }
    expect(probe.renders.length, '秒表跳了 5 次,输出没变 —— 一次都不该重算').toBe(1);
  });

  it('【量一下】AMR 形态首屏:30 条收起的老命令行,终端节点仍然是 0', () => {
    const done = (i: number): ToolRowData =>
      rawRow({ id: `c${i}`, pending: false, terminal: outputOf(500), elapsedMs: 8420 });
    const { container } = render(
      <>{Array.from({ length: 30 }, (_, i) => <ToolRow key={i} row={done(i)} deferBody />)}</>,
    );

    expect(container.querySelectorAll('details').length, '30 行都是折叠块了').toBe(30);
    expect(container.querySelectorAll('div[class*="term"]').length, '一个终端块都不该挂').toBe(0);
    expect(probe.renders.length, 'Terminal 一次都没渲染').toBe(0);

    const all = container.querySelectorAll('*').length;
    // eslint-disable-next-line no-console -- 首屏这一格的数要落在跑测的输出里
    console.log(`[量·AMR] 首屏 30 条收起的命令行:整屏 ${all} 个节点`);
    /*
     * 有标题那支是 12 节点/行,这一支是 **14** —— 差的两个是把命令排成等宽的
     * `<span class="file fileStatic"><code>`(有标题那支的 summary 是纯文本标题,
     * 不需要这一对)。实测:360 → 420,30 行共 +60 个节点,**与输出量无关**,
     * 是每行恒定的两个。这里按 14 钉住而不是把上界抬到「够用就行」:
     * 数字再涨说明骨架又胖了,应该当回归看见。
     */
    expect(all).toBeLessThanOrEqual(30 * 14);
  });

  it('并发:同时几条命令在跑,就同时几个终端展开 —— 量一下最坏那一屏', () => {
    /*
     * Claude 一个回合可以并行发好几个工具调用,每条命令各自一个 `pending` 行,
     * 于是**同时展开几个终端**。仓库里没有对并行工具数的限制(模型侧决定),
     * 实测语料里 3-5 个是常见量级,这里按 5 个各 500 行算最坏。
     */
    const { container } = render(
      <>{Array.from({ length: 5 }, (_, i) => (
        <ToolRow key={i} running row={row({ id: `c${i}`, terminal: outputOf(500) })} />
      ))}</>,
    );
    const all = container.querySelectorAll('*').length;
    const termLines = container.querySelectorAll('div[class*="term"] > div').length;
    expect(termLines).toBe(5 * 501);

    // eslint-disable-next-line no-console -- 最坏那一屏的数要落在跑测的输出里
    console.log(`[量] 5 条命令同时在跑、各 500 行:整屏 ${all} 个节点,其中终端行 ${termLines} 个`);
  });
});

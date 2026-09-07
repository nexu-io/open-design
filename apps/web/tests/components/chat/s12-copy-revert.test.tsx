// @vitest-environment jsdom
/**
 * S12「上游响应慢，已等 N 秒」**只撤文案,不撤探测**(产品裁决 2026-08-27)。
 *
 * 裁决原话:「这个文案先让 subagent 改回 进行中 吧,跟产品讨论了下,但背后的探测逻辑
 * 先保留,后续可能会用到,只不过用别的展现形式」。触发这次撤回的画面是壳头那一行
 * 「上游响应慢，已等 411 秒  13m 7s」—— 一句话把整个壳头占了,而右边的总耗时还在
 * 说同一件事,读起来像出了故障,实际上只是等。
 *
 * 所以这条测试分两半,**两半都必须在**:
 *
 *  · **撤回**:等到天荒地老,壳头也只读「进行中」,再也不说「上游响应慢」。
 *  · **保留**:同一轮的 `shell.quietMs` 照旧算得出来、照旧过 `SLOW_UPSTREAM_AFTER_MS`
 *    的门槛。这一半是钉子 —— 将来有人「顺手清干净」把 `shellQuiet` / `quietMs` /
 *    门槛常量删掉时,它会当场红,而不是等产品来问「那个探测呢」。
 *
 * 探测链的另外两截各有自己的钉子,别在这里重测:
 *  · 传输层到达时刻 → `tests/components/chat/s12-upstream-alive.test.tsx`
 *  · 纯函数怎么用那个入参 → `tests/runtime/chat/quiet-counts-any-event.test.ts`
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell, SLOW_UPSTREAM_AFTER_MS } from '../../../src/components/chat/ExecutionShell';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell as ShellData } from '../../../src/runtime/chat/contract';

afterEach(() => { cleanup(); });

const render = (ui: ReactElement) => rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

const START = 1_000_000;

/**
 * 一轮还在跑的:一次**没回来**的工具调用,之后什么都没落下来。
 * `nowMs` 拨多远,静默就有多久 —— 和裁决截图里那一轮同一个形状。
 */
function runningShell(nowMs: number): ShellData {
  const shell = buildTurnBlocks({
    events: [
      { kind: 'tool_use', id: 'item_1', name: 'Read', input: { file_path: '/a.ts' }, startedAt: START },
    ] as PersistedAgentEvent[],
    runStatus: 'running',
    nowMs,
  }).find((b): b is ShellData => b.kind === 'shell');
  if (!shell) throw new Error('no shell');
  return shell;
}

const headOf = (root: HTMLElement): string => root.querySelector('details > summary')?.textContent ?? '';

describe('S12 · 文案撤回(壳头读回「进行中」)', () => {
  it('等了 411 秒的那一轮 —— 正是裁决截图那一格 —— 壳头只说「进行中」', () => {
    const { container } = render(<ExecutionShell shell={runningShell(START + 411_000)} />);

    expect(screen.getByText('进行中')).toBeTruthy();
    expect(screen.queryByText(/上游响应慢/)).toBeNull();
    // 「已等 411 秒」和右边的总耗时说的是同一段时间,撤掉之后只剩后者
    expect(headOf(container)).not.toMatch(/已等/);
  });

  it('思考中的那一轮同样不被顶掉 —— 撤回的是那一句,不是壳头别的形态', () => {
    const shell = buildTurnBlocks({
      events: [{ kind: 'thinking', text: '' }] as PersistedAgentEvent[],
      runStatus: 'running',
      startedAtMs: START,
      nowMs: START + 411_000,
    }).find((b): b is ShellData => b.kind === 'shell');
    if (!shell) throw new Error('no shell');

    render(<ExecutionShell shell={shell} />);
    expect(screen.getByText('思考中')).toBeTruthy();
    expect(screen.queryByText(/上游响应慢/)).toBeNull();
  });

  /**
   * 正向的一半:上面两条不能靠「把运行态壳头整个画坏」通过。
   * 一分钟以内的普通运行态照旧 —— 「进行中」+ 会走的秒表 + 那颗球。
   */
  it('一分钟以内的普通运行态照旧:「进行中」+ 秒表 + 球', () => {
    const { container } = render(<ExecutionShell shell={runningShell(START + 30_000)} />);

    expect(screen.getByText('进行中')).toBeTruthy();
    expect(headOf(container)).toContain('30s');
    expect(document.querySelector('[data-orb="connecting"]')).not.toBeNull();
  });
});

describe('S12 · 探测保留(删掉会当场红)', () => {
  /**
   * ⚠️ **这一节是钉子,不是装饰。**
   *
   * 壳头不再读 `quietMs` 了,所以从界面上再也看不出探测还在不在 —— 一次「清理无用代码」
   * 就能把 `shellQuiet`(`build-turn-blocks.ts`)、`quietMs`(`contract.ts`)、
   * 或者 `SLOW_UPSTREAM_AFTER_MS`(`ExecutionShell.tsx`)悄悄带走,而所有既有测试照绿。
   * 产品明确说了这条逻辑「后续可能会用到,只不过用别的展现形式」——
   * 重建它要重新考据 60 秒门槛、重新接传输层到达时刻,比留着贵得多。
   *
   * 所以这里**绕过界面**,直接问数据层:静默还算不算得出来。
   */
  it('门槛常量还在,还是 60 秒', () => {
    expect(SLOW_UPSTREAM_AFTER_MS).toBe(60_000);
  });

  it('等了 411 秒的那一轮:`quietMs` 仍然算得出来,并且过得了门槛', () => {
    const shell = runningShell(START + 411_000);

    expect(shell.quietMs, '`quietMs` 不见了 —— 探测被撤了,而裁决只让撤文案').not.toBeNull();
    expect(shell.quietMs ?? 0).toBeGreaterThanOrEqual(SLOW_UPSTREAM_AFTER_MS);
    // 秒数本身也得对,否则「留着」留下的是一个永远说 0 的空壳
    expect(shell.quietMs ?? 0).toBeGreaterThan(400_000);
  });

  it('一有东西落下来就归零 —— 留下来的必须是活的探测,不是一路涨的计数器', () => {
    const shell = buildTurnBlocks({
      events: [
        { kind: 'tool_use', id: 'item_1', name: 'Read', input: { file_path: '/a.ts' }, startedAt: START },
        { kind: 'tool_use', id: 'item_2', name: 'Read', input: { file_path: '/b.ts' }, startedAt: START + 400_000 },
      ] as PersistedAgentEvent[],
      runStatus: 'running',
      nowMs: START + 411_000,
    }).find((b): b is ShellData => b.kind === 'shell');
    if (!shell) throw new Error('no shell');

    // 先钉住「算出来了」再比大小 —— 只写 `?? 0` 的话,探测被删成 `null` 时这条会
    // 悄悄变成 `0 < 60000` 照绿(ablation A 当场照出来过)
    expect(shell.quietMs, '`quietMs` 不见了 —— 探测被撤了,而裁决只让撤文案').not.toBeNull();
    expect(shell.quietMs ?? 0).toBeLessThan(SLOW_UPSTREAM_AFTER_MS);
    expect(shell.quietMs ?? 0).toBeGreaterThan(10_000);
  });

  it('轮次结束就没有静默可言 —— `null` 是「说不出来」,不是 0', () => {
    const shell = buildTurnBlocks({
      events: [
        { kind: 'tool_use', id: 'item_1', name: 'Read', input: { file_path: '/a.ts' }, startedAt: START },
        { kind: 'tool_result', toolUseId: 'item_1', content: 'ok', isError: false, completedAt: START + 1_000 },
      ] as PersistedAgentEvent[],
      runStatus: 'succeeded',
      nowMs: START + 411_000,
    }).find((b): b is ShellData => b.kind === 'shell');
    if (!shell) throw new Error('no shell');

    expect(shell.quietMs).toBeNull();
  });
});

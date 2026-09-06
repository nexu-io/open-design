// @vitest-environment node
/**
 * 红测:**壳头的总耗时里要有推理那一段**。
 *
 * 用户 2026-08-27 真机指认:「我发现这里的耗时好像没有算进 thought 的耗时」,
 * 配图是壳头那句「已完成 3m 11s」。
 *
 * 真因:壳自己的跨度 `shellSpan` **只由带时刻的事件撑开**,而整条事件流里带时刻的
 * 只有 `tool_use.startedAt` 与 `tool_result.completedAt` —— thinking 一个时刻都不带
 * (daemon 那边的载荷就是 `{ type: 'thinking_delta', delta }` 两个字段,
 * `PersistedAgentEvent` 的 `{ kind: 'thinking'; text }` 里也没有时刻)。
 * 于是**第一个工具调用之前**和**最后一个工具结果之后**的推理被整段切掉。
 *
 * 本机 `.od/runs` 里 38 条带推理的真实 run 逐条量过,壳头**无一例外少报**,
 * 极端的两条:
 *   `3be1d04d`  整轮 5m 54s,壳头写 **1.4s**(开头想了 5m 30s 才动第一次手)
 *   `9bbe3832`  整轮 2m 17s,壳头 0.4s —— 连 `formatShellElapsed` 的 1s 地板都不到,
 *               屏幕上**一个数都不显示**
 *
 * 修法是一条不变量,不是给推理另外补时间:
 * **开这一轮的那张壳从轮次开头开始走表,收这一轮的那张壳走到轮次收尾为止。**
 * `ensureShell()` 本来就是在本轮第一条事件上开的第一张壳(D10),最后一张壳一直开到
 * 轮次终止 —— 那两个时刻是它俩自己的边界,不是借来的。单壳的一轮因此等于轮次跨度,
 * 推理自然全在里面。
 *
 * 两张壳的那一轮仍然分得开(T34 那张「两张卡头同一个数」的坏画面不会回来):
 * 第一张拿轮次**开头**、最后一张拿轮次**收尾**,中间那道缝谁也不领。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import { formatShellElapsed } from '../../../src/runtime/chat/format';
import type { BuildTurnInput, ExecutionShell } from '../../../src/runtime/chat/contract';
import thinkingHeavy from '../../fixtures/chat/thinking-heavy.turn0.json';

const KEY = 'a7f3c91ed2b40561';

const shellsOf = (input: BuildTurnInput): ExecutionShell[] =>
  buildTurnBlocks(input).filter((b): b is ExecutionShell => b.kind === 'shell');

const sole = (input: BuildTurnInput): ExecutionShell => {
  const shells = shellsOf(input);
  expect(shells.length, '这几例都该只有一张壳').toBe(1);
  return shells[0]!;
};

/** 轮次 0 → 100s,中间只有一次 10s → 15s 的工具调用,两头都是推理 */
const THINK_TOOL_THINK: PersistedAgentEvent[] = [
  { kind: 'status', label: 'starting' },
  { kind: 'thinking', text: '先想清楚要动哪几个文件。' },
  { kind: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' }, startedAt: 1_010_000 },
  { kind: 'tool_result', toolUseId: 't1', content: 'ok', isError: false, completedAt: 1_015_000 },
  { kind: 'thinking', text: '看完了,再想想怎么改。' },
  { kind: 'text', text: '改好了。' },
];

describe('壳头总耗时 · 推理那一段不许被切掉', () => {
  it('第一个工具之前 / 最后一个结果之后的推理都算进壳头', () => {
    const shell = sole({
      events: THINK_TOOL_THINK,
      runStatus: 'succeeded',
      startedAtMs: 1_000_000,
      endedAtMs: 1_100_000,
    });
    // 工具跨度只有 5s —— 那正是改动前壳头显示的数
    expect(shell.elapsedMs).toBe(100_000);
    expect(formatShellElapsed(shell.elapsedMs)).toBe('1m 40s');
  });

  it('还在跑的时候秒表照旧跟着 `nowMs` 走,起点是轮次开头', () => {
    const at = (nowMs: number): number | null => sole({
      events: THINK_TOOL_THINK.slice(0, 4),
      runStatus: 'running',
      startedAtMs: 1_000_000,
      nowMs,
    }).elapsedMs;
    expect(at(1_031_000)).toBe(31_000);
    expect(at(1_061_000)).toBe(61_000);
  });

  it('两头都拿不到时**不编** —— 一个数都不给', () => {
    const shell = sole({
      events: [
        { kind: 'status', label: 'starting' },
        { kind: 'thinking', text: '先想清楚要动哪几个文件。' },
        { kind: 'text', text: '改好了。' },
      ],
      runStatus: 'succeeded',
    });
    expect(shell.elapsedMs).toBeNull();
  });

  it('只拿得到收尾时刻:起点仍然只认事件,终点走到轮次收尾', () => {
    const shell = sole({
      events: THINK_TOOL_THINK,
      runStatus: 'succeeded',
      endedAtMs: 1_100_000,
    });
    // 起点未知 → 第一个工具;终点是轮次收尾 → 最后那段推理仍然算得进来
    expect(shell.elapsedMs).toBe(90_000);
  });

  /**
   * 反向对照:一轮两张壳时,轮次开头只归第一张、轮次收尾只归最后一张,
   * 两张**不会写上同一个数**(T34,`chat-panel-feedback.md`「被推翻的两条」)。
   */
  it('一轮两张壳:头尾各归一张,两张的数不一样', () => {
    const shells = shellsOf({
      events: [
        { kind: 'done_key', key: KEY } as unknown as PersistedAgentEvent,
        { kind: 'tool_use', id: 'a1', name: 'Bash', input: { command: 'ls' }, startedAt: 1_010_000 },
        { kind: 'tool_result', toolUseId: 'a1', content: 'ok', isError: false, completedAt: 1_012_000 },
        { kind: 'text', text: `看完了。<od-done key="${KEY}"/>先答到这儿。` },
        {
          kind: 'tool_use',
          id: 'p1',
          name: 'TodoWrite',
          input: { todos: [{ content: '接着做第二件事', status: 'in_progress' }] },
          startedAt: 1_050_000,
        },
        { kind: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'pwd' }, startedAt: 1_060_000 },
        { kind: 'tool_result', toolUseId: 'b1', content: 'ok', isError: false, completedAt: 1_061_000 },
      ],
      runStatus: 'succeeded',
      startedAtMs: 1_000_000,
      endedAtMs: 1_100_000,
    });
    expect(shells.length, '这一例要的就是两张壳').toBe(2);
    const [first, second] = shells as [ExecutionShell, ExecutionShell];
    // 各自都报得出数(头尾各归一张),但**不是同一个数**,也都不是整轮那 100s
    expect(first.elapsedMs).not.toBeNull();
    expect(second.elapsedMs).not.toBeNull();
    expect(first.elapsedMs).not.toBe(second.elapsedMs);
    expect(first.elapsedMs).toBeLessThan(100_000);
    expect(second.elapsedMs).toBeLessThan(100_000);
    // 第一张从轮次开头起算(它是开这一轮的那张)
    expect(first.elapsedMs).toBe(50_000);
    // 最后一张走到轮次收尾为止(它是收这一轮的那张)
    expect(second.elapsedMs).toBe(40_000);
  });
});

/**
 * 真实回放 —— 就是用户截图那一轮。
 *
 * `.od/runs/4347efff-31d5-4322-b48f-a0b6f3ad24c9`,认得出来是因为清单里那两条抽屉
 * 的耗时逐字对上了截图:`1m 46s` 与 `1m 11s`。
 */
describe('真实一轮回放 · 用户截图那条 run', () => {
  const f = thinkingHeavy as unknown as BuildTurnInput & { startedAtMs: number; endedAtMs: number };
  const shell = sole({
    events: f.events,
    runStatus: 'succeeded',
    startedAtMs: f.startedAtMs,
    endedAtMs: f.endedAtMs,
  });

  it('壳头写的是整轮 6m 12s,不再是掐掉推理之后的 3m 11s', () => {
    expect(formatShellElapsed(shell.elapsedMs)).toBe('6m 12s');
    expect(shell.elapsedMs).toBe(371_631);
    // 改动前那个数(第一个 ToolSearch 的 startedAt → 最后一次 Bash 的 completedAt)
    expect(formatShellElapsed(190_993)).toBe('3m 11s');
    expect(shell.elapsedMs! - 190_993, '被切掉的正是 3 分钟推理').toBeGreaterThan(180_000);
  });

  it('截图里认得出这一轮:清单那两条抽屉是 1m 46s / 1m 11s', () => {
    const withElapsed = shell.segments
      .map((s) => s.elapsedMs)
      .filter((ms): ms is number => ms != null)
      .sort((a, b) => b - a);
    expect(withElapsed.map((ms) => `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`))
      .toEqual(['1m 46s', '1m 11s']);
  });
});

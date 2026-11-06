// @vitest-environment node
/**
 * 红测:**事件算不出跨度时,壳头的耗时退回这一轮自己的起止**。
 *
 * 现象:执行记录跑完了,壳头只有一句光秃秃的「已完成」,右边一个秒数都没有。
 *
 * 真因:`shellElapsed` 只认事件上盖的时刻(`tool_use.startedAt` / `tool_result.completedAt`),
 * 而**一大批 agent 根本不发工具事件** —— 规格 `chat-panel-next.md` §2.2 点名的
 * `qwen` / `deepseek` / `grok-build` / `aider` / `antigravity` / `atomcode`(plain-stream)
 * 与 `qoder`(qoder-stream),两个解析器里 `tool_use` 均为 0 处;claude 的 `thinking`
 * 也一条时刻都不带。这些轮次事件流里一个带时刻的事都没有,于是耗时恒为 null。
 * 而消息自己一直带着 `startedAt` / `endedAt` —— 这一轮**最权威**的跨度,之前没人问过它。
 *
 * 兜底的边界(这个文件把两头都钉住):
 *  · 事件给得出跨度时,**事件说了算** —— 它更窄,说的是这张壳而不是整轮;
 *  · 一轮有两张壳时,**谁都不给** —— 轮次跨度描述的是整轮,借给任何一张都是谎报,
 *    两张写同一个数正是 T34 那张坏画面(`chat-panel-feedback.md`「被推翻的两条」)。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import { formatShellElapsed } from '../../../src/runtime/chat/format';
import type { BuildTurnInput, ExecutionShell } from '../../../src/runtime/chat/contract';

const KEY = 'a7f3c91ed2b40561';

const shellsOf = (input: BuildTurnInput): ExecutionShell[] =>
  buildTurnBlocks(input).filter((b): b is ExecutionShell => b.kind === 'shell');

const sole = (input: BuildTurnInput): ExecutionShell => {
  const shells = shellsOf(input);
  expect(shells.length, '这几例都该只有一张壳').toBe(1);
  return shells[0]!;
};

/**
 * plain-stream 那一族的真实形态:**一条工具事件都没有**,thinking 与正文都不带时刻。
 * thinking 留在壳里(兜底提结论只提回答,不提 thinking),所以壳不会被 B47 当空壳丢掉。
 */
const NO_TIMESTAMP_EVENTS: PersistedAgentEvent[] = [
  { kind: 'status', label: 'starting' },
  { kind: 'thinking', text: '先看看要改哪里。' },
  { kind: 'text', text: '按你说的把主色换成品牌绿了。' },
];

describe('壳头耗时 · 事件不带时刻时退回轮次跨度', () => {
  it('整轮没有一个带时刻的事件 —— 壳头照样报得出耗时', () => {
    const shell = sole({
      events: NO_TIMESTAMP_EVENTS,
      runStatus: 'succeeded',
      startedAtMs: 1_000_000,
      endedAtMs: 1_042_000,
    });
    expect(shell.status).toBe('done');
    expect(shell.elapsedMs).toBe(42_000);
    // 屏幕上真的看得见 —— `formatShellElapsed` 有 1000ms 地板,不能只断言字段
    expect(formatShellElapsed(shell.elapsedMs)).toBe('42s');
  });

  /**
   * ⚠️ **2026-08-27 推翻**。这一条原来断言的是「事件给得出跨度时事件说了算
   * (它更窄,说的是这张壳不是整轮)」—— 前半句成立,后半句是错的:
   * 一轮只有一张壳时,那张壳**就是**整轮(`ensureShell` 在本轮第一条事件上开它,
   * 它一直开到轮次终止),事件跨度并不「说的是这张壳」,它说的只是壳里带时刻的
   * 那几件事,把 thinking 整段切在外面。
   *
   * 用户真机指认「耗时好像没有算进 thought 的耗时」,真因与数字在
   * `shell-elapsed-includes-thinking.test.ts`。
   */
  it('单壳的一轮:壳头就是轮次跨度,事件跨度不再把两头的推理切掉', () => {
    const shell = sole({
      events: [
        { kind: 'status', label: 'starting' },
        { kind: 'thinking', text: '先想清楚要动哪里。' },
        { kind: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' }, startedAt: 1_010_000 },
        { kind: 'tool_result', toolUseId: 't1', content: 'ok', isError: false, completedAt: 1_015_000 },
        { kind: 'text', text: '看完了。' },
      ],
      runStatus: 'succeeded',
      startedAtMs: 1_000_000,
      endedAtMs: 1_042_000,
    });
    expect(shell.elapsedMs).toBe(42_000);
  });

  it('轮次跨度是**兜底**不是替换:没有 `startedAtMs` 就仍然什么都不显示', () => {
    const shell = sole({
      events: NO_TIMESTAMP_EVENTS,
      runStatus: 'succeeded',
      endedAtMs: 1_042_000,
    });
    expect(shell.elapsedMs).toBeNull();
  });

  it('还在跑:秒表跟着 `nowMs` 走,不看 `endedAtMs`', () => {
    const at = (nowMs: number): number | null => sole({
      events: NO_TIMESTAMP_EVENTS,
      runStatus: 'running',
      startedAtMs: 1_000_000,
      endedAtMs: 1_042_000,
      nowMs,
    }).elapsedMs;
    expect(at(1_031_000)).toBe(31_000);
    expect(at(1_061_000)).toBe(61_000);
  });

  /**
   * 手动停止:壳头保持「进行中」,秒数**停在轮次收尾那一刻**
   * (`chat-panel-dev-design.md`「壳头保持『进行中 · 31s』秒数停住」)。
   * 兜底那条路也得听这一条 —— 它不许跟着 `nowMs` 继续走。
   */
  it('手动停止:秒数定在轮次的收尾时刻,不跟着 `nowMs` 走', () => {
    const shell = sole({
      events: NO_TIMESTAMP_EVENTS,
      runStatus: 'canceled',
      startedAtMs: 1_000_000,
      endedAtMs: 1_012_000,
      nowMs: 1_099_000,
    });
    expect(shell.stopped).toBe(true);
    expect(shell.elapsedMs).toBe(12_000);
  });

  /**
   * D50 之后唯一会出现两张壳的场景:done → 结论落在卡外 → agent 又开新计划继续干。
   * 两张壳都没有自己的事件跨度,轮次跨度**谁都不能借**。
   */
  it('一轮两张壳:两张都不许拿整轮的耗时', () => {
    const shells = shellsOf({
      events: [
        { kind: 'done_key', key: KEY } as unknown as PersistedAgentEvent,
        { kind: 'thinking', text: '先想一下。' },
        { kind: 'text', text: `看完了。<od-done key="${KEY}"/>先答到这儿。` },
        {
          kind: 'tool_use',
          id: 'p1',
          name: 'TodoWrite',
          input: { todos: [{ content: '接着做第二件事', status: 'in_progress' }] },
        },
        { kind: 'text', text: '继续干。' },
      ],
      runStatus: 'succeeded',
      startedAtMs: 1_000_000,
      endedAtMs: 1_042_000,
    });
    expect(shells.length, '这一例要的就是两张壳').toBe(2);
    for (const shell of shells) expect(shell.elapsedMs).toBeNull();
  });
});

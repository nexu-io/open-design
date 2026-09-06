// @vitest-environment node
/**
 * 红测(B29):一轮里有两个壳时,**已经结束的那个不许再走秒**。
 *
 * 线上量到:上面「已完成 1m 37s」和下面「进行中 1m 37s」两个数**同步递增** ——
 * 因为耗时是按**轮次**算的(一个 running 标志喂给所有壳),而不是按壳自己的起止。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell } from '../../../src/runtime/chat/contract';

const call = (id: string, name: string, input: unknown, startedAt: number, completedAt: number): PersistedAgentEvent[] => ([
  { kind: 'tool_use', id, name, input, startedAt },
  { kind: 'tool_result', toolUseId: id, content: 'ok', isError: false, completedAt },
]);

const todos = (id: string, items: Array<[string, string]>): PersistedAgentEvent[] => ([
  { kind: 'tool_use', id, name: 'TodoWrite', input: { todos: items.map(([content, status]) => ({ content, status })) } },
]);

const KEY = 'a7f3c91ed2b40561';

/**
 * 两张卡的形状。
 *
 * 2026-08-26 最终裁决之后,清单**不再**另起一张卡 —— 唯一会出现两张的场景是
 * 「done 之后 agent 又开新计划继续干」:结论落在卡外,把两张卡分开。
 * 这条红测钉的 bug(先结束的那张不许再走秒)在这个场景下照样成立。
 */
function shellsAt(nowMs: number): ExecutionShell[] {
  const events: PersistedAgentEvent[] = [
    { kind: 'done_key', key: KEY } as unknown as PersistedAgentEvent,
    // 第一个壳:0 → 5s 之间跑完
    ...call('t1', 'Bash', { command: 'ls' }, 0, 5_000),
    // done + 结论落在卡外,把两张卡分开
    { kind: 'text', text: `<od-done key="${KEY}"/>\n先答到这儿。` } as PersistedAgentEvent,
    // 之后又开一份新计划继续干 → 第二张卡
    ...todos('p1', [['做第一件事', 'in_progress']]),
    ...call('t2', 'Bash', { command: 'pwd' }, 6_000, 7_000),
  ];
  return buildTurnBlocks({ events, runStatus: 'running', nowMs })
    .filter((b): b is ExecutionShell => b.kind === 'shell');
}

describe('壳的耗时按壳自己算', () => {
  it('轮次还在跑时,先结束的那个壳秒数定住不动', () => {
    const a = shellsAt(60_000);
    const b = shellsAt(120_000);
    expect(a.length).toBeGreaterThan(1);
    expect(b.length).toBe(a.length);
    // 第一个壳已经结束:两个时刻取到的耗时必须一样
    expect(b[0]!.elapsedMs).toBe(a[0]!.elapsedMs);
  });

  it('还在跑的那个壳照旧跟着 now 走', () => {
    const a = shellsAt(60_000);
    const b = shellsAt(120_000);
    const last = a.length - 1;
    expect(b[last]!.elapsedMs).toBeGreaterThan(a[last]!.elapsedMs!);
  });
});

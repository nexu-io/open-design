// @vitest-environment node
/**
 * 红测(B15):每条 todo 抽屉的 summary 右侧要有它自己的耗时。
 *
 * 稿子第 2 格每条 todo 都挂着 `.ms`(`18.2s`);`TodoRow` 也早就写了
 * `formatElapsed(segment.elapsedMs)` 的分支 —— 但 `elapsedMs` **从来没被算出来过**,
 * 于是那一档永远是 null,秒数一个都不出。
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
  { kind: 'tool_use', id, name: 'TodoWrite', input: { todos: items.map(([c, s]) => ({ content: c, status: s })) } },
]);

const card = (events: PersistedAgentEvent[]): ExecutionShell => {
  const shells = buildTurnBlocks({ events, runStatus: 'succeeded' })
    .filter((b): b is ExecutionShell => b.kind === 'shell');
  return shells[shells.length - 1]!;
};

describe('每条 todo 的耗时', () => {
  const events: PersistedAgentEvent[] = [
    ...todos('p1', [['复刻列表页', 'in_progress'], ['抽出商品卡', 'pending']]),
    ...call('t1', 'Read', { file_path: 'a.png' }, 0, 400),
    ...call('t2', 'Write', { file_path: 'a.html', content: 'x' }, 400, 18_200),
    ...todos('p2', [['复刻列表页', 'completed'], ['抽出商品卡', 'in_progress']]),
    ...call('t3', 'Write', { file_path: 'card.html', content: 'y' }, 19_000, 25_000),
    ...todos('p3', [['复刻列表页', 'completed'], ['抽出商品卡', 'completed']]),
  ];

  it('跑完的那条按自己名下工具的起止算', () => {
    const first = card(events).segments.find((s) => s.content === '复刻列表页');
    expect(first?.elapsedMs).toBe(18_200);
  });

  it('每条各算各的,不共用同一个数', () => {
    const segs = card(events).segments;
    const a = segs.find((s) => s.content === '复刻列表页')?.elapsedMs;
    const b = segs.find((s) => s.content === '抽出商品卡')?.elapsedMs;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('名下什么都没跑过的那条不编造耗时', () => {
    const only = card([...todos('p1', [['还没开始', 'pending']])]);
    expect(only.segments[0]?.elapsedMs).toBeNull();
  });
});

// @vitest-environment node
/**
 * 空壳不出 + 发送后立刻出壳(B47 / B49,用户 2026-08-26 真机)。
 *
 * 两条看着相反,其实说的是同一件事的两端:
 *  · **发送那一刻**就该有一张「进行中」的壳,不等 agent 的第一条事件(D10 原话:
 *    「空态先出来,不等任何 agent 信号」)。用户量到第二、三轮每次都要等一会儿才出。
 *  · **跑完之后**如果壳里一件东西都没有,整张壳不该留在那儿 —— 一行孤零零的
 *    「已完成」不告诉任何人任何事。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell } from '../../../src/runtime/chat/contract';

const shells = (events: PersistedAgentEvent[], runStatus: 'running' | 'succeeded') =>
  buildTurnBlocks({ events, runStatus, nowMs: 1_000 })
    .filter((b): b is ExecutionShell => b.kind === 'shell');

describe('壳的空态', () => {
  it('一条事件都还没有、run 正在跑 → 仍然出一张「进行中」的空壳', () => {
    expect(shells([], 'running')).toHaveLength(1);
    expect(shells([], 'running')[0]!.status).toBe('running');
  });

  it('跑完了但壳里什么都没有 → 整张壳不出', () => {
    expect(shells([], 'succeeded')).toHaveLength(0);
  });

  it('跑完了、壳里有东西 → 照旧出', () => {
    const out = shells([
      { kind: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } },
      { kind: 'tool_result', toolUseId: 't1', content: 'ok', isError: false },
    ], 'succeeded');
    expect(out).toHaveLength(1);
  });

  it('只有壳外正文、壳里空 → 壳不出,正文照旧在外面', () => {
    const blocks = buildTurnBlocks({
      events: [{ kind: 'text', text: '直接回答你,不用动手。' }],
      runStatus: 'succeeded',
    });
    expect(blocks.filter((b) => b.kind === 'shell')).toHaveLength(0);
    expect(blocks.filter((b) => b.kind === 'prose')).toHaveLength(1);
  });
});

describe('P0-24 N8 · 被停止的一轮始终有回合标题', () => {
  /**
   * 产品 2026-10-20 N8 答复:被停止的一轮始终显示回合标题,没有可展开内容也显示,
   * 刚开始即被停止显示「已停止 0s」(PRD 场景 E2)。这推翻了 B47 对取消档的处理 ——
   * B47 撤掉它的理由是壳头写着「进行中」、和下面那行「已取消」自相矛盾,而 P0-24
   * 一期起壳头已经写「已停止」。只回复文字的正常轮次仍按 B47 不出壳(上一组)。
   */
  it('keeps exactly one empty shell on a canceled turn', () => {
    const blocks = buildTurnBlocks({
      events: [{ kind: 'status', label: 'start' }] as never,
      runStatus: 'canceled',
    });
    const kept = blocks.filter((b): b is ExecutionShell => b.kind === 'shell');
    expect(kept, '停止 + 壳里空的 → 仍留一行「已停止」').toHaveLength(1);
    expect(kept[0]!.items).toHaveLength(0);
  });

  it('keeps a shell even when a canceled turn persisted no events at all', () => {
    const kept = buildTurnBlocks({ events: [], runStatus: 'canceled', startedAtMs: 1_000, endedAtMs: 1_400 })
      .filter((b): b is ExecutionShell => b.kind === 'shell');
    expect(kept).toHaveLength(1);
    expect(kept[0]!.elapsedMs).toBe(400);
  });

  it('keeps one shell, above the text, when a canceled turn only replied with text', () => {
    const blocks = buildTurnBlocks({
      events: [{ kind: 'text', text: '好的,我先看看。' }],
      runStatus: 'canceled',
    });
    expect(blocks.map((b) => b.kind)).toEqual(['shell', 'prose']);
  });

  it('still keeps an empty shell on a failed turn', () => {
    // 反向:失败那档壳头写的是「运行失败」,是这一轮唯一说得出「出事了」的地方
    const blocks = buildTurnBlocks({
      events: [{ kind: 'status', label: 'start' }] as never,
      runStatus: 'failed',
    });
    expect(blocks.filter((b) => b.kind === 'shell')).toHaveLength(1);
  });

  it('still keeps a canceled shell that actually has content', () => {
    const blocks = buildTurnBlocks({
      events: [
        { kind: 'tool_use', id: 'item_1', name: 'Read', input: { file_path: '/a.ts' } },
        { kind: 'tool_result', toolUseId: 'item_1', content: 'ok', isError: false },
      ] as never,
      runStatus: 'canceled',
    });
    expect(blocks.filter((b) => b.kind === 'shell')).toHaveLength(1);
  });

  it('adds no empty shell next to a canceled shell that has content', () => {
    const blocks = buildTurnBlocks({
      events: [
        { kind: 'tool_use', id: 'item_1', name: 'Read', input: { file_path: '/a.ts' } },
        { kind: 'tool_result', toolUseId: 'item_1', content: 'ok', isError: false },
        { kind: 'text', text: '读完了。' },
      ] as never,
      runStatus: 'canceled',
    });
    const kept = blocks.filter((b): b is ExecutionShell => b.kind === 'shell');
    expect(kept).toHaveLength(1);
    expect(kept[0]!.items.length).toBeGreaterThan(0);
  });
});

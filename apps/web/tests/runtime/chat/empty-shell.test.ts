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

describe('B47 · 取消掉的空壳也不留', () => {
  /**
   * 用户 2026-08-27 指认:一轮被取消、壳里什么都没有,屏幕上却还挂着一句
   * 「进行中」,底下紧跟着「已取消」——「之前不是说如果 done 之前,没有任何
   * 工具调用或 thinking 或普通文案,就不出现这个了吗?」
   *
   * B47 当时把 `failed` 和 `canceled` 一起留了下来,理由是「壳头是这一轮唯一
   * 说得出出事了的地方」。那句话**只对 failed 成立** —— 失败那档壳头写的是
   * 「运行失败」,确实是这一轮唯一说得出原因的地方。取消那档壳头写的是
   * 「进行中」(手动停止不是第四态,秒数停住、状态词不变),既没有信息,
   * 又和底下那行「已取消」自相矛盾。
   */
  it('drops an empty shell on a canceled turn', () => {
    const blocks = buildTurnBlocks({
      events: [{ kind: 'status', label: 'start' }] as never,
      runStatus: 'canceled',
    });
    expect(
      blocks.filter((b) => b.kind === 'shell'),
      '取消 + 壳里空的 → 那句「进行中」不该还在',
    ).toHaveLength(0);
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
});

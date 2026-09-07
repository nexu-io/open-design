/**
 * codex 的 `web_search` 早期行:**发起就上屏、秒表就走**,结果到达时**退成同一行**。
 *
 * daemon 那侧(`apps/daemon/tests/runtimes/w135-codex-web-search-in-flight.test.ts`)
 * 只证到「事件发得出来」。这个文件证的是消费端 —— 少了它,那条事件完全可能
 * 发出来却在 web 这边被忽略,或者画成两行。
 *
 * 三条要守的:
 *  ① 只有早期行时,屏幕上就有一行,而且是 pending(秒表在走);
 *  ② 结算那一对到达后,**仍然只有一行**,不是两行;
 *  ③ 那一行上带着真正的搜索词 —— 早期行没有词,词是后来补进去的。
 *
 * 防假绿:
 *  · `nowMs` 与 `startedAt` 拉开 4 秒,所以①的耗时必须是 4.0s 而不是 0 ——
 *    「有一行」和「那一行在计时」是两件事,只断言前者的话,一个不走的秒表也能绿。
 *  · **必须走完整管线**。第一版这个文件直接把事件喂给 `buildTurnBlocks`,
 *    结果画出两行、而且搜索词读不到 —— 一度以为是修错了。实际是测法漏了一步:
 *    退化早期行的 `dropSupersededInFlightToolUses` 住在 `AssistantMessage.tsx:669`,
 *    在 `buildTurnBlocks` **之前**跑。绕过它等于测了一条产线上不存在的路径。
 *    最后一组把这件事**反过来钉住**:少了那一步就是两行 —— 那一步是承重的,不是可选的。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import {
  IN_FLIGHT_TOOL_INPUT_MARKER,
  dedupeToolUsesById,
  dropSupersededInFlightToolUses,
} from '../../../src/runtime/tool-events';
import type { ToolRow, TurnBlock } from '../../../src/runtime/chat/contract';

/** codex 重复序列化 `id` 之后 `JSON.parse` 留下的那一个 */
const ID = 'exec-9fb8985e-4163-4af2-82a2-d499ab71d18b';
const T0 = 1_800_000_000_000;
const QUERY = 'OpenAI Codex CLI release notes';

/** daemon 早期行落到 web 之后的形状(见 `providers/daemon.ts` 的 tool_in_flight 分支) */
const early = {
  kind: 'tool_use', id: ID, name: 'web_search',
  input: { [IN_FLIGHT_TOOL_INPUT_MARKER]: true },
  startedAt: T0,
} as unknown as PersistedAgentEvent;

const settledPair = [
  { kind: 'tool_use', id: ID, name: 'web_search', input: { query: QUERY }, startedAt: T0 },
  { kind: 'tool_result', toolUseId: ID, content: '', isError: false, completedAt: T0 + 7_420 },
] as unknown as PersistedAgentEvent[];

/** 产线上的顺序:先退化早期行、再按 id 去重,最后才建块(`AssistantMessage.tsx:669`) */
const pipeline = (events: PersistedAgentEvent[], runStatus: string, nowMs: number): TurnBlock[] =>
  buildTurnBlocks({
    events: dedupeToolUsesById(dropSupersededInFlightToolUses(events as never)) as never,
    runStatus: runStatus as never,
    nowMs,
  });

const toolRows = (blocks: TurnBlock[]): ToolRow[] => {
  const out: ToolRow[] = [];
  const walk = (items: readonly unknown[]): void => {
    for (const item of items) {
      const n = item as { kind?: string; items?: readonly unknown[]; segment?: { items?: readonly unknown[] } };
      if (n.kind === 'tool') out.push(item as ToolRow);
      if (n.items) walk(n.items);
      if (n.segment?.items) walk(n.segment.items);
    }
  };
  walk(blocks as unknown as readonly unknown[]);
  return out;
};

describe('codex web_search:发起就上屏,结果到达退成同一行', () => {
  it('① 只有早期行 → 屏幕上已经有一行,而且秒表在走', () => {
    const rows = toolRows(pipeline([early], 'running', T0 + 4_000));
    expect(rows, '搜索发起 4 秒了,屏幕上必须已经有这一行').toHaveLength(1);
    expect(rows[0]!.pending, '还没回来 → 秒表继续走').toBe(true);
    expect(rows[0]!.elapsedMs, '不是 0 —— 「有一行」和「那一行在计时」是两回事').toBe(4_000);
  });

  it('② 结算那一对到达后仍然只有一行(不是两行)', () => {
    const rows = toolRows(pipeline([early, ...settledPair], 'succeeded', T0 + 9_000));
    expect(rows, '早期行必须退成结算行,不许各画一行').toHaveLength(1);
    expect(rows[0]!.pending).toBe(false);
    expect(rows[0]!.elapsedMs, '结算耗时用真实跨度').toBe(7_420);
  });

  it('③ 那一行上带着真正的搜索词 —— 词是后来补进去的', () => {
    const rows = toolRows(pipeline([early, ...settledPair], 'succeeded', T0 + 9_000));
    const shown = `${rows[0]!.title} ${rows[0]!.pattern ?? ''}`;
    expect(shown, `行上读不到搜索词,实际是 ${JSON.stringify(rows[0])}`).toContain(QUERY);
  });

  it('反向对照:没有早期行时,结算那一对照旧画出同一行(不许被这次改动带坏)', () => {
    const rows = toolRows(pipeline(settledPair, 'succeeded', T0 + 9_000));
    expect(rows).toHaveLength(1);
    expect(`${rows[0]!.title} ${rows[0]!.pattern ?? ''}`).toContain(QUERY);
  });
});

describe('那一步是承重的,不是可选的', () => {
  /*
   * 反过来钉住:**跳过** `dropSupersededInFlightToolUses` 直接建块,就会画成两行,
   * 而且排在前面的是那条还没有搜索词的早期行。写下来是因为我自己先踩了 ——
   * 以后谁把 `buildTurnBlocks` 换个地方调,这一条会当场告诉他少了什么。
   */
  it('跳过退化那一步 → 两行,且第一行没有搜索词', () => {
    const rows = toolRows(buildTurnBlocks({
      events: [early, ...settledPair] as never, runStatus: 'succeeded' as never, nowMs: T0 + 9_000,
    }));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.pattern ?? '').not.toContain(QUERY);
  });
});

/**
 * 红测(S12 · 等太久没动静):壳要知道「上一件事之后过了多久」。
 *
 * 权威:`docs/design/run-errors/error-ux-design.md:33`
 * 「60 秒没新输出显示『上游响应慢，已等 N 秒』+〔停止〕;10 分钟(Cloud 30 分钟)
 * 没输出才报超时」;产品口述的落点是**现有那张「进行中」可展开卡片的文案**,
 * 不新起一块 UI(`chat-panel-feedback.md` §F)。
 *
 * 频次:P1,18,891 次/月、6,372 台。`chat-panel-edge-audit.md:555` 把它记成
 * 「稿子与报错方案之间最大的一块缺口」。
 *
 * 判据要落在**纯函数层**:秒数由 `nowMs` 推,组件不自己起计时器,
 * 这样这一条能脱离 React 测,也不会在后台标签页被 rAF 节流带偏。
 */
import { describe, expect, it } from 'vitest';

import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { AgentEvent } from '../../../src/types';

const START = 1_700_000_000_000;

function shellOf(events: AgentEvent[], nowMs: number, runStatus: 'running' | 'succeeded' = 'running') {
  const blocks = buildTurnBlocks({
    events,
    runStatus,
    nowMs,
    startedAtMs: START,
  } as Parameters<typeof buildTurnBlocks>[0]);
  return blocks.find((b) => b.kind === 'shell');
}

describe('壳的静默时长', () => {
  it('counts from the turn start while nothing has happened yet', () => {
    const events: AgentEvent[] = [
      { kind: 'status', label: 'start', startedAt: START } as unknown as AgentEvent,
    ];
    const shell = shellOf(events, START + 75_000);
    expect(shell, '一件事都还没发生也要有壳,否则没地方写那句话').toBeTruthy();
    expect((shell as { quietMs?: number | null }).quietMs).toBeGreaterThanOrEqual(70_000);
  });

  it('restarts the count when something lands', () => {
    const events: AgentEvent[] = [
      { kind: 'status', label: 'start', startedAt: START } as unknown as AgentEvent,
      {
        kind: 'tool_use',
        id: 'item_1',
        name: 'Read',
        input: { file_path: '/a.ts' },
        startedAt: START + 90_000,
        endedAt: START + 91_000,
      } as unknown as AgentEvent,
    ];
    const shell = shellOf(events, START + 100_000);
    const quiet = (shell as { quietMs?: number | null }).quietMs ?? 0;
    expect(quiet, '刚落下一件事就该从头数,不能还挂着 100 秒').toBeLessThan(60_000);
  });

  it('says nothing once the turn is over', () => {
    const events: AgentEvent[] = [
      { kind: 'status', label: 'start', startedAt: START } as unknown as AgentEvent,
      { kind: 'text', text: '好了', startedAt: START + 1_000 } as unknown as AgentEvent,
    ];
    const shell = shellOf(events, START + 500_000, 'succeeded');
    expect((shell as { quietMs?: number | null } | undefined)?.quietMs ?? null).toBeNull();
  });
});

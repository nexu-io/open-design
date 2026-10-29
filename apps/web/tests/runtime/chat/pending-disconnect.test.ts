// @vitest-environment node
/**
 * P0-24 N15:界面重连用尽不是这一轮的结局,以运行记录为准。浏览器放弃时这一轮在
 * 状态里被记成 failed + 一条 DAEMON_STREAM_DISCONNECTED(恢复机制靠这一对认人),
 * 但画出来必须还是「进行中」,直到 daemon 给出真实结果。
 */
import { describe, expect, it } from 'vitest';
import type { AgentEvent, ChatMessage } from '../../../src/types';
import {
  projectTurnAwaitingRunRecord,
  runOutcomeAwaitsRunRecord,
  settleTurnFromRunRecord,
} from '../../../src/runtime/chat/pending-disconnect';

const disconnect: AgentEvent = {
  kind: 'status',
  label: 'error',
  code: 'DAEMON_STREAM_DISCONNECTED',
  detail: 'daemon stream disconnected before run completed',
};
// Rows persisted before the structured code existed carry only the sentence.
const legacyDisconnect: AgentEvent = {
  kind: 'status',
  label: 'error',
  detail: 'daemon stream disconnected before run completed',
};
const realError: AgentEvent = { kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED', detail: 'boom' };

const turn = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: 'a1',
  role: 'assistant',
  content: 'partial',
  runId: 'run-1',
  startedAt: 1_000,
  endedAt: 5_000,
  runStatus: 'failed',
  events: [{ kind: 'text', text: 'partial' }, disconnect],
  ...overrides,
});

describe('runOutcomeAwaitsRunRecord', () => {
  it('reads a turn the browser gave up on as still awaiting its run record', () => {
    expect(runOutcomeAwaitsRunRecord(turn({}))).toBe(true);
    expect(runOutcomeAwaitsRunRecord(turn({ events: [legacyDisconnect] }))).toBe(true);
  });

  it('lets a real error recorded after the disconnect decide the turn', () => {
    expect(runOutcomeAwaitsRunRecord(turn({ events: [disconnect, realError] }))).toBe(false);
  });

  it('ignores turns that are not failed, or failed for a real reason', () => {
    expect(runOutcomeAwaitsRunRecord(turn({ runStatus: 'succeeded' }))).toBe(false);
    expect(runOutcomeAwaitsRunRecord(turn({ runStatus: 'canceled' }))).toBe(false);
    expect(runOutcomeAwaitsRunRecord(turn({ events: [realError] }))).toBe(false);
    expect(runOutcomeAwaitsRunRecord(turn({ role: 'user' }))).toBe(false);
  });
});

describe('projectTurnAwaitingRunRecord', () => {
  it('draws the turn as running, with no end time and no repeated disconnect error', () => {
    const drawn = projectTurnAwaitingRunRecord(turn({}));
    expect(drawn.runStatus).toBe('running');
    expect(drawn.endedAt).toBeUndefined();
    expect(drawn.events).toEqual([{ kind: 'text', text: 'partial' }]);
  });

  it('returns every other message unchanged, by reference', () => {
    const settled = turn({ runStatus: 'succeeded' });
    expect(projectTurnAwaitingRunRecord(settled)).toBe(settled);
    const failed = turn({ events: [realError] });
    expect(projectTurnAwaitingRunRecord(failed)).toBe(failed);
  });
});

describe('settleTurnFromRunRecord', () => {
  it('drops the disconnect marker once the record decides, so a confirmed failure reads failed', () => {
    const settled = settleTurnFromRunRecord(turn({}));
    expect(settled.events).toEqual([{ kind: 'text', text: 'partial' }]);
    expect(runOutcomeAwaitsRunRecord(settled)).toBe(false);
  });

  it('keeps real errors and returns an unmarked message unchanged', () => {
    const real = turn({ events: [realError] });
    expect(settleTurnFromRunRecord(real)).toBe(real);
    expect(settleTurnFromRunRecord(turn({ events: [disconnect, realError] })).events).toEqual([realError]);
  });
});


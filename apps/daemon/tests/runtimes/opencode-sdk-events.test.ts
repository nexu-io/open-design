import { describe, expect, it } from 'vitest';

import {
  clearSdkToolCorrelation,
  sdkEventToStreamRecords,
} from '../../src/runtimes/opencode-sdk-events.js';

// Native granular `session.*` wire (current `@opencode/sdk` subscribe
// frames) mapped onto the CLI parser records (`step_start` / `text` /
// `reasoning` / `tool_use` / `step_finish` / `error` / `od_opencode_tool`).
describe('opencode SDK granular event mapping', () => {
  it('maps text and reasoning deltas', () => {
    clearSdkToolCorrelation();
    expect(
      sdkEventToStreamRecords({
        type: 'session.text.delta',
        data: { sessionID: 'ses_1', delta: 'hello' },
      }),
    ).toEqual([{ type: 'text', sessionID: 'ses_1', part: { text: 'hello' } }]);
    expect(
      sdkEventToStreamRecords({
        type: 'session.reasoning.delta',
        data: { sessionID: 'ses_1', delta: 'thinking' },
      }),
    ).toEqual([{ type: 'reasoning', sessionID: 'ses_1', part: { text: 'thinking' } }]);
    expect(
      sdkEventToStreamRecords({
        type: 'session.reasoning.ended',
        data: { sessionID: 'ses_1', text: 'done thinking' },
      }),
    ).toEqual([{ type: 'reasoning', sessionID: 'ses_1', part: { text: 'done thinking' } }]);
  });

  it('correlates tool names across input.started / called / success', () => {
    clearSdkToolCorrelation();
    const sessionID = 'ses_tools';
    // `input.started` carries the only copy of the tool name: preview only.
    expect(
      sdkEventToStreamRecords({
        type: 'session.tool.input.started',
        data: { sessionID, id: 'call_1', name: 'write' },
      }),
    ).toEqual([
      { type: 'od_opencode_tool', version: 1, sessionID, callID: 'call_1', tool: 'write' },
    ]);
    // `called` re-emits the preview (now with the file path when present).
    const called = sdkEventToStreamRecords({
      type: 'session.tool.called',
      data: { sessionID, id: 'call_1', input: { filePath: 'designs/a.html' } },
    });
    expect(called[0]).toMatchObject({
      type: 'od_opencode_tool',
      sessionID,
      callID: 'call_1',
      tool: 'write',
      path: 'designs/a.html',
    });
    // `success` terminates with the recalled tool name.
    const done = sdkEventToStreamRecords({
      type: 'session.tool.success',
      data: { sessionID, id: 'call_1', content: [{ type: 'text', text: 'ok' }] },
    });
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({
      type: 'tool_use',
      sessionID,
      part: { tool: 'write', callID: 'call_1' },
    });
    expect((done[0]!.part as Record<string, unknown>).state).toMatchObject({
      status: 'completed',
    });
  });

  it('maps tool failure onto tool_use with an error state', () => {
    clearSdkToolCorrelation();
    const sessionID = 'ses_fail';
    sdkEventToStreamRecords({
      type: 'session.tool.input.started',
      data: { sessionID, id: 'call_9', name: 'bash' },
    });
    const failed = sdkEventToStreamRecords({
      type: 'session.tool.failed',
      data: { sessionID, id: 'call_9', error: { message: 'denied' } },
    });
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      type: 'tool_use',
      sessionID,
      part: { tool: 'bash', callID: 'call_9' },
    });
    expect((failed[0]!.part as Record<string, unknown>).state).toMatchObject({
      status: 'error',
    });
  });

  it('maps usage updates onto step_finish and execution failures onto error', () => {
    clearSdkToolCorrelation();
    const usage = sdkEventToStreamRecords({
      type: 'session.usage.updated',
      data: {
        sessionID: 'ses_u',
        tokens: { input: 11, output: 7, reasoning: 0, cache: { read: 5, write: 2 } },
        cost: 0.01,
      },
    });
    expect(usage).toEqual([
      {
        type: 'step_finish',
        sessionID: 'ses_u',
        part: {
          tokens: { input: 11, output: 7, reasoning: 0, cache: { read: 5, write: 2 } },
          cost: 0.01,
        },
      },
    ]);
    const failed = sdkEventToStreamRecords({
      type: 'session.execution.failed',
      data: { sessionID: 'ses_u', error: { message: 'boom' } },
    });
    expect(failed[0]).toMatchObject({ type: 'error', sessionID: 'ses_u' });
  });

  it('swallows idle/status lifecycle markers and passes unknowns through as raw', () => {
    clearSdkToolCorrelation();
    expect(
      sdkEventToStreamRecords({ type: 'session.idle', data: { sessionID: 'ses_1' } }),
    ).toEqual([]);
    expect(
      sdkEventToStreamRecords({ type: 'session.execution.succeeded', data: { sessionID: 'ses_1' } }),
    ).toEqual([]);
    expect(
      sdkEventToStreamRecords({ type: 'something.totally.new', data: { sessionID: 'ses_1' } }),
    ).toEqual([{ type: 'raw', event: { type: 'something.totally.new', data: { sessionID: 'ses_1' } } }]);
  });
});

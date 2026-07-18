import { describe, expect, it } from 'vitest';

import {
  formatPreviewRunElapsed,
  latestPreviewRunStatus,
  PREVIEW_RUN_SUCCESS_VISIBLE_MS,
  previewRunStatusVisibleAt,
} from '../../src/runtime/preview-run-status';
import type { ChatMessage } from '../../src/types';

const STARTED_AT = 1_700_000_000_000;

function designMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    sessionMode: 'design',
    runStatus: 'running',
    startedAt: STARTED_AT,
    createdAt: STARTED_AT,
    ...overrides,
  };
}

describe('preview run status', () => {
  it('uses real timestamps for an active Design run instead of a fake percentage', () => {
    const status = latestPreviewRunStatus([designMessage()], STARTED_AT + 67_000);

    expect(status).toMatchObject({ phase: 'generating', stage: 'analyzing', elapsedMs: 67_000 });
    expect(formatPreviewRunElapsed(status?.elapsedMs ?? 0)).toBe('1:07');
  });

  it('uses real agent activity to advance from analysis to design generation', () => {
    const analyzing = latestPreviewRunStatus(
      [designMessage({ events: [{ kind: 'thinking', text: 'Reviewing the brief.' }] })],
      STARTED_AT + 1_000,
    );
    const generating = latestPreviewRunStatus(
      [
        designMessage({
          events: [{ kind: 'tool_use', id: 'tool-1', name: 'write_file', input: {} }],
        }),
      ],
      STARTED_AT + 2_000,
    );

    expect(analyzing?.stage).toBe('analyzing');
    expect(generating?.stage).toBe('generating');
  });

  it.each(['running', 'model', 'working'])(
    'keeps the run in analysis for the neutral %s lifecycle status',
    (label) => {
      const status = latestPreviewRunStatus(
        [designMessage({ events: [{ kind: 'status', label }] })],
        STARTED_AT + 1_000,
      );

      expect(status?.stage).toBe('analyzing');
    },
  );

  it('waits to verify delivery before the final file refresh has resolved', () => {
    const status = latestPreviewRunStatus(
      [
        designMessage({
          runStatus: 'succeeded',
          producedFiles: undefined,
          traceObjectFiles: undefined,
        }),
      ],
      STARTED_AT + 2_000,
    );

    expect(status).toMatchObject({ phase: 'verifying', stage: 'verifying' });
    expect(status && previewRunStatusVisibleAt(status, STARTED_AT + 2_000)).toBe(true);
  });

  it('holds success briefly, then lets the surface fade away', () => {
    const endedAt = STARTED_AT + 5_000;
    const status = latestPreviewRunStatus(
      [designMessage({ runStatus: 'succeeded', endedAt, resultDeliveryState: 'delivered' })],
      endedAt,
    );

    expect(status?.phase).toBe('succeeded');
    expect(status && previewRunStatusVisibleAt(status, endedAt + PREVIEW_RUN_SUCCESS_VISIBLE_MS - 1)).toBe(true);
    expect(status && previewRunStatusVisibleAt(status, endedAt + PREVIEW_RUN_SUCCESS_VISIBLE_MS)).toBe(false);
  });

  it('does not restore an old delivered confirmation without an end timestamp', () => {
    const status = latestPreviewRunStatus(
      [
        designMessage({
          runStatus: 'succeeded',
          resultDeliveryState: 'delivered',
          endedAt: undefined,
        }),
      ],
      STARTED_AT + PREVIEW_RUN_SUCCESS_VISIBLE_MS + 1,
    );

    expect(status?.phase).toBe('succeeded');
    expect(
      status && previewRunStatusVisibleAt(status, STARTED_AT + PREVIEW_RUN_SUCCESS_VISIBLE_MS + 1),
    ).toBe(false);
  });

  it('keeps delivery failures visible and selects the latest persisted turn after a return', () => {
    const oldRunning = designMessage({ id: 'assistant-running', startedAt: STARTED_AT - 10_000 });
    const deliveryFailure = designMessage({
      id: 'assistant-delivery-failure',
      runStatus: 'succeeded',
      resultDeliveryState: 'delivery_failed',
      startedAt: STARTED_AT,
      endedAt: STARTED_AT + 32_000,
    });

    const restored = latestPreviewRunStatus([oldRunning, deliveryFailure], STARTED_AT + 80_000);

    expect(restored).toMatchObject({
      phase: 'failed',
      message: { id: 'assistant-delivery-failure', resultDeliveryState: 'delivery_failed' },
      elapsedMs: 32_000,
    });
    expect(restored && previewRunStatusVisibleAt(restored, STARTED_AT + 80_000)).toBe(true);
  });

  it('does not claim that a clarification-only Design turn was delivered', () => {
    expect(
      latestPreviewRunStatus(
        [
          designMessage({
            id: 'earlier-delivery-failure',
            runStatus: 'succeeded',
            resultDeliveryState: 'no_result',
            endedAt: STARTED_AT + 500,
          }),
          designMessage({
            id: 'clarification-turn',
            runStatus: 'succeeded',
            content: '<question-form id="brief">{"questions":[]}</question-form>',
            endedAt: STARTED_AT + 1_000,
          }),
        ],
        STARTED_AT + 2_000,
      ),
    ).toBeNull();
  });
});

// @vitest-environment jsdom

// Red spec for the "running for 171 minutes" report.
//
// A daemon-side same-run retry reuses one run and one assistant message, so
// `message.startedAt` keeps pointing at the FIRST attempt. The activity card
// clock renders `now - startedAt`, which after a retry is the cumulative time
// since the user asked -- a number no attempt ever spent. The user reads a
// live, monotonically growing clock and concludes the task is wedged, while the
// agent is in fact a couple of minutes into a healthy retry.
//
// The fix must separate two things that are easy to conflate:
//   1. The clock must measure the CURRENT ATTEMPT (this is the bug).
//   2. The anchor must stay an absolute persisted timestamp, so switching
//      project tabs / remounting the message does not restart the clock (this
//      is deliberate existing behaviour -- see the comment at the top of
//      AssistantMessage's footer block -- and must not regress while fixing 1).
//
// Fixture timeline (ms since epoch, arbitrary origin):
//   1_000    user asked; attempt 0 starts
//   601_000  attempt 0 and 1 have failed; attempt 2 (the 3rd) starts here
//   735_000  run ends
// Cumulative = 734_000ms = "12m 14s". Current attempt = 134_000ms = "2m 14s".

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { AgentEvent, ChatMessage } from '../../src/types';

const RUN_STARTED_AT = 1_000;
const CURRENT_ATTEMPT_STARTED_AT = 601_000;
const RUN_ENDED_AT = 735_000;

const CURRENT_ATTEMPT_ELAPSED = '2m 14s';
const CUMULATIVE_ELAPSED = '12m 14s';

// A tool call plus a text block: the text makes `hasConclusion` true, which is
// what renders the toggle row that carries the clock (the compact
// "task-activity-current" row has no clock at all).
const EVENTS: AgentEvent[] = [
  {
    kind: 'tool_use',
    id: 'tool-1',
    name: 'Read',
    input: { file_path: '/repo/source.ts' },
  },
  { kind: 'text', text: 'Here is the conclusion.' },
];

function retriedMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-retried',
    role: 'assistant',
    content: '',
    events: EVENTS,
    startedAt: RUN_STARTED_AT,
    endedAt: RUN_ENDED_AT,
    runStatus: 'succeeded',
    // The fields under test. Absent before the fix.
    attemptStartedAt: CURRENT_ATTEMPT_STARTED_AT,
    attemptIndex: 2,
    ...overrides,
  } as ChatMessage;
}

function renderMessage(message: ChatMessage, streaming: boolean) {
  return (
    <AssistantMessage
      projectKind="prototype"
      conversationId="conv-1"
      message={message}
      streaming={streaming}
      projectId="project-1"
    />
  );
}

function elapsedText(): string {
  const node = screen.getByTestId('task-activity-toggle').querySelector('.task-activity-elapsed');
  return node?.textContent ?? '';
}

describe('AssistantMessage per-attempt clock', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('shows the current attempt’s duration for a settled retried run', () => {
    render(renderMessage(retriedMessage(), false));

    // The bug renders the cumulative "12m 14s" here.
    expect(elapsedText()).toBe(CURRENT_ATTEMPT_ELAPSED);
  });

  it('does not present the cumulative time as the run’s elapsed clock', () => {
    render(renderMessage(retriedMessage(), false));

    expect(elapsedText()).not.toBe(CUMULATIVE_ELAPSED);
  });

  it('still surfaces the attempt number and the cumulative time as secondary info', () => {
    const { container } = render(renderMessage(retriedMessage(), false));

    // Nothing is hidden from the user -- the total is still reachable, it is
    // just no longer masquerading as "how long this attempt has been running".
    const attempt = container.querySelector('.task-activity-attempt');
    expect(attempt).not.toBeNull();
    // attemptIndex is 0-based on the wire; attempt 2 is the user's 3rd try.
    expect(attempt?.textContent).toContain('3');
    expect(attempt?.textContent).toContain(CUMULATIVE_ELAPSED);
  });

  it('counts from the current attempt while the run is still streaming', () => {
    // 2m 14s into the third attempt, live.
    vi.spyOn(Date, 'now').mockReturnValue(RUN_ENDED_AT);

    render(renderMessage(retriedMessage({ endedAt: undefined, runStatus: 'running' }), true));

    expect(elapsedText()).toBe(CURRENT_ATTEMPT_ELAPSED);
  });

  // --- Regression pin: the anchor must remain remount-invariant ------------
  it('keeps the streaming clock stable across a remount (project tab switch)', () => {
    vi.spyOn(Date, 'now').mockReturnValue(RUN_ENDED_AT);
    const streamingMessage = retriedMessage({ endedAt: undefined, runStatus: 'running' });

    const first = render(renderMessage(streamingMessage, true));
    const beforeUnmount = elapsedText();
    expect(beforeUnmount).toBe(CURRENT_ATTEMPT_ELAPSED);

    // Simulate leaving the project tab and coming back: full unmount + remount.
    first.unmount();
    render(renderMessage(streamingMessage, true));

    // Must NOT restart from zero. A mount-time anchor would render "0.0s".
    expect(elapsedText()).toBe(beforeUnmount);
  });

  it('falls back to the run start when a run was never retried', () => {
    render(
      renderMessage(
        retriedMessage({ attemptStartedAt: undefined, attemptIndex: undefined }),
        false,
      ),
    );

    // No retry happened, so the attempt clock and the run clock are the same
    // thing, and no attempt badge is warranted.
    expect(elapsedText()).toBe(CUMULATIVE_ELAPSED);
    expect(
      screen.getByTestId('task-activity-toggle').parentElement?.querySelector('.task-activity-attempt'),
    ).toBeNull();
  });
});

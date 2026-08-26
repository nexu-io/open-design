import { describe, expect, it } from 'vitest';

import { mergeServerMessagesIntoConversation } from '../../src/components/ProjectView';
import type { ChatMessage } from '../../src/types';

// The per-attempt clock anchor has to survive the conversation refresh.
//
// `refreshConversationMessagesFromServer` (and the conversation-load effect)
// both do `const list = await listMessages(...)` and then
// `setMessages((current) => mergeServerMessagesIntoConversation(current, list))`.
// The snapshot is therefore read at request time and merged against state that
// may have moved on: an automatic same-run retry can land its `start` frame --
// and with it `onAttemptStarted` -> the newer anchor on `local` -- inside that
// await window. When the promise finally resolves, `server` is holding the
// PREVIOUS attempt's anchor while `local` holds the current one.
//
// The daemon already treats this pair as a watermark (`mergeAttemptAnchor` in
// routes/project/conversations.ts, plus the `attempt_started_at <= ?` guard on
// the UPDATE). The client merge has to follow the same rule, or the refresh
// drags the row backwards and the clock visibly jumps back to a longer,
// cumulative-looking number that no attempt ever spent.
const RUN_STARTED_AT = 1_000;
const FIRST_ATTEMPT_STARTED_AT = 1_000;
const RETRY_ATTEMPT_STARTED_AT = 601_000;

function assistantRow(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Working on it',
    runId: 'run-1',
    runStatus: 'running',
    startedAt: RUN_STARTED_AT,
    ...overrides,
  };
}

describe('mergeServerMessagesIntoConversation attempt anchor', () => {
  it('keeps the newer local retry anchor when an older server snapshot resolves late', () => {
    // Snapshot taken during attempt 0 / retry backoff, resolving after the
    // live stream already re-anchored the message to attempt 1.
    const local: ChatMessage[] = [
      assistantRow({
        attemptStartedAt: RETRY_ATTEMPT_STARTED_AT,
        attemptIndex: 1,
      }),
    ];
    const server: ChatMessage[] = [
      assistantRow({
        attemptStartedAt: FIRST_ATTEMPT_STARTED_AT,
        attemptIndex: 0,
      }),
    ];

    const merged = mergeServerMessagesIntoConversation(local, server);
    const assistant = merged.find((message) => message.id === 'assistant-1');

    expect(assistant?.attemptStartedAt).toBe(RETRY_ATTEMPT_STARTED_AT);
    // The pair moves together: an index without its own timestamp describes an
    // attempt the row has no start time for.
    expect(assistant?.attemptIndex).toBe(1);
  });

  it('accepts a strictly newer server anchor over a stale local one', () => {
    // The mirror case: a reload/refresh that observes a retry the live stream
    // never delivered (dropped SSE, reattach gap) must still move forward.
    const local: ChatMessage[] = [
      assistantRow({
        attemptStartedAt: FIRST_ATTEMPT_STARTED_AT,
        attemptIndex: 0,
      }),
    ];
    const server: ChatMessage[] = [
      assistantRow({
        attemptStartedAt: RETRY_ATTEMPT_STARTED_AT,
        attemptIndex: 1,
      }),
    ];

    const merged = mergeServerMessagesIntoConversation(local, server);
    const assistant = merged.find((message) => message.id === 'assistant-1');

    expect(assistant?.attemptStartedAt).toBe(RETRY_ATTEMPT_STARTED_AT);
    expect(assistant?.attemptIndex).toBe(1);
  });

  it('keeps a local anchor when the server row has none at all', () => {
    // Row written by a daemon older than the per-attempt clock, or whose run
    // state was pruned. Established behaviour; pinned so the watermark change
    // does not regress it.
    const local: ChatMessage[] = [
      assistantRow({
        attemptStartedAt: RETRY_ATTEMPT_STARTED_AT,
        attemptIndex: 1,
      }),
    ];
    const server: ChatMessage[] = [assistantRow({})];

    const merged = mergeServerMessagesIntoConversation(local, server);
    const assistant = merged.find((message) => message.id === 'assistant-1');

    expect(assistant?.attemptStartedAt).toBe(RETRY_ATTEMPT_STARTED_AT);
    expect(assistant?.attemptIndex).toBe(1);
  });
});

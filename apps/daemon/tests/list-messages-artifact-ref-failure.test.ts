import { describe, expect, it } from 'vitest';

import { listMessages } from '../src/db.js';

/**
 * A conversation must stay readable when its chat-artifact refs cannot be read.
 *
 * `listMessages` decorates each message with the artifact snapshots that belong
 * to it. That decoration is a nice-to-have: the refs point at a separate
 * snapshot store, and losing them costs a thumbnail, not a message. The guard in
 * `conversationChatArtifactRefs` says exactly that — "a snapshot store problem
 * must never make a conversation unreadable" — but it originally sat AROUND the
 * ref query only, with the owning-project lookup in front of it. That lookup
 * reads a different table and can fail on its own, and when it did the throw
 * travelled out of `listMessages` and the caller got nothing.
 *
 * The symptom was silent, which is why this test exists: `langfuse-bridge`
 * catches the failure and reports the run with an empty transcript, so a broken
 * read looked like a run that simply produced no output.
 */

type Prepared = { all: (...args: unknown[]) => unknown[]; get: (...args: unknown[]) => unknown };

/**
 * The minimum `better-sqlite3` surface `listMessages` touches, with one query
 * class made to fail. `failOn` is matched against the SQL text.
 */
function dbWithFailingQuery(failOn: RegExp, rows: Array<Record<string, unknown>>) {
  return {
    prepare(sql: string): Prepared {
      if (failOn.test(sql)) {
        return {
          all() { throw new Error('snapshot store unavailable'); },
          get() { throw new Error('snapshot store unavailable'); },
        };
      }
      return {
        all() { return rows; },
        get() { return undefined; },
      };
    },
  } as unknown as Parameters<typeof listMessages>[0];
}

const MESSAGE_ROW = {
  id: 'msg-1',
  role: 'assistant',
  content: 'the transcript that must survive',
  agentId: null,
  agentName: null,
  runId: null,
  runStatus: null,
  resultDeliveryState: null,
  lastRunEventId: null,
  eventsJson: null,
  attachmentsJson: null,
  commentAttachmentsJson: null,
  producedFilesJson: null,
  traceObjectFilesJson: null,
  feedbackJson: null,
  preTurnFileNamesJson: null,
  sessionMode: null,
  runContextJson: null,
  taskAnalyticsJson: null,
  appliedPluginSnapshotJson: null,
  forkedIntoJson: null,
  cancelOrigin: null,
  createdAt: 0,
  startedAt: null,
  endedAt: null,
  position: 0,
};

describe('listMessages when the artifact-ref lookup fails', () => {
  it('still returns the transcript when the owning-project lookup throws', () => {
    // `projectIdForConversation` reads `conversations`. This is the query that
    // used to sit outside the guard.
    const db = dbWithFailingQuery(/FROM\s+conversations/i, [MESSAGE_ROW]);

    const messages = listMessages(db, 'conv-1');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('the transcript that must survive');
  });

  it('still returns the transcript when the ref query itself throws', () => {
    // The half that was always guarded — kept as the control, so a regression
    // in the guard shows up as one failure and not two.
    const db = dbWithFailingQuery(/chat_artifact/i, [MESSAGE_ROW]);

    const messages = listMessages(db, 'conv-1');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('the transcript that must survive');
  });

  it('reads the transcript normally when nothing fails', () => {
    // Proves the harness can actually produce messages, so the two assertions
    // above cannot pass by returning an empty list for an unrelated reason.
    const db = dbWithFailingQuery(/never-matches-anything/, [MESSAGE_ROW]);

    const messages = listMessages(db, 'conv-1');

    expect(messages).toHaveLength(1);
    expect(messages[0]?.content).toBe('the transcript that must survive');
  });
});

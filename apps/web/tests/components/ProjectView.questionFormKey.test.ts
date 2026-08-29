import { describe, expect, it } from 'vitest';

import {
  buildQuestionFormKey,
  mergeServerMessagesIntoConversation,
  normalizeConversationMessageOrder,
} from '../../src/components/ProjectView';
import type { ChatMessage, ProjectFile } from '../../src/types';

describe('buildQuestionFormKey', () => {
  it('is stable across a streaming form-id change (no remount mid-answer)', () => {
    // The streaming preview shows the `discovery` fallback id until the body id
    // streams in; a form that emits answerable questions before its id flips
    // the parsed id late. The React key must NOT change across that flip, or
    // the panel remounts and drops in-progress selections. Same conversation +
    // message ⇒ same key regardless of the parsed id.
    const early = buildQuestionFormKey('conv-1', 'msg-1', true);
    const settled = buildQuestionFormKey('conv-1', 'msg-1', true);
    expect(early).toBe('conv-1:msg-1');
    expect(settled).toBe(early);
  });

  it('gives a distinct key to a later form in a different assistant message', () => {
    // A second discovery form (same `discovery` template id) lives in its own
    // assistant message, so it still gets its own key and replays the reveal —
    // without folding the id into the key.
    expect(buildQuestionFormKey('conv-1', 'msg-1', true)).not.toBe(
      buildQuestionFormKey('conv-1', 'msg-2', true),
    );
  });

  it('returns null until a form, conversation, and message are all present', () => {
    expect(buildQuestionFormKey(null, 'msg-1', true)).toBeNull();
    expect(buildQuestionFormKey('conv-1', null, true)).toBeNull();
    expect(buildQuestionFormKey('conv-1', 'msg-1', false)).toBeNull();
  });
});

describe('mergeServerMessagesIntoConversation', () => {
  it('adds server-created CTA messages while preserving local produced files', () => {
    const producedFile: ProjectFile = {
      name: 'deck.html',
      size: 1024,
      mtime: 1,
      kind: 'html',
      mime: 'text/html',
    };
    const localMessages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Use this SKILL.md',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Done',
        runStatus: 'succeeded',
        producedFiles: [producedFile],
      },
    ];
    const serverMessages: ChatMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        content: 'Use this SKILL.md',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Done',
        runStatus: 'succeeded',
      },
      {
        id: 'cta-1',
        role: 'assistant',
        content: '',
        events: [
          {
            kind: 'plugin_candidate',
            candidateId: 'candidate-1',
            title: 'Main',
            description: 'This repo looks like a plugin.',
          },
        ],
      },
    ];

    const merged = mergeServerMessagesIntoConversation(localMessages, serverMessages);

    expect(merged.map((message) => message.id)).toEqual(['user-1', 'assistant-1', 'cta-1']);
    expect(merged[1]?.producedFiles).toEqual([producedFile]);
  });
});

describe('normalizeConversationMessageOrder', () => {
  it('restores a user turn that was persisted after its pinned assistant', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Working',
        createdAt: 1_100,
        startedAt: 1_000,
        runId: 'run-1',
        runStatus: 'running',
      },
      {
        id: 'user-1',
        role: 'user',
        content: 'Build the dashboard',
        createdAt: 1_000,
      },
    ];

    expect(normalizeConversationMessageOrder(messages).map((message) => message.id)).toEqual([
      'user-1',
      'assistant-1',
    ]);
  });

  it('does not reorder an unrelated assistant followed by a later user turn', () => {
    const messages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Done',
        createdAt: 1_000,
        startedAt: 900,
        runId: 'run-1',
        runStatus: 'succeeded',
      },
      {
        id: 'user-2',
        role: 'user',
        content: 'Now make it responsive',
        createdAt: 2_000,
      },
    ];

    expect(normalizeConversationMessageOrder(messages).map((message) => message.id)).toEqual([
      'assistant-1',
      'user-2',
    ]);
  });
});

describe('mergeServerMessagesIntoConversation across a multi-Run task', () => {
  it('does not keep the live copy that absorbed a successor Run', () => {
    // Live streaming re-points the SAME assistant message at each successor
    // Run of a Full Plan task, so the local copy of the FIRST message ends up
    // holding the production output too. The daemon persists one message per
    // Run, so a refresh brings production back as its own row — and the
    // "local is longer, keep local" rule would then render it twice.
    const local: ChatMessage[] = [
      { id: 'u1', role: 'user', content: '做一个番茄钟' } as ChatMessage,
      {
        id: 'a-plan',
        role: 'assistant',
        content: 'PLAN\nPRODUCTION',
        events: [{ kind: 'text', text: 'PLAN' }, { kind: 'text', text: 'PRODUCTION' }],
        runId: 'run-production',
      } as ChatMessage,
    ];
    const server: ChatMessage[] = [
      { id: 'u1', role: 'user', content: '做一个番茄钟' } as ChatMessage,
      {
        id: 'a-plan',
        role: 'assistant',
        content: 'PLAN',
        events: [{ kind: 'text', text: 'PLAN' }],
        runId: 'run-request',
        strategyTaskExecutionId: 'odnext_1',
        strategyTaskRunIndex: 0,
      } as ChatMessage,
      {
        id: 'a-production',
        role: 'assistant',
        content: 'PRODUCTION',
        events: [{ kind: 'text', text: 'PRODUCTION' }],
        runId: 'run-production',
        strategyTaskExecutionId: 'odnext_1',
        strategyTaskRunIndex: 1,
      } as ChatMessage,
    ];

    const merged = mergeServerMessagesIntoConversation(local, server);
    const whole = merged.map((m) => m.content).join('\n');

    expect(whole.split('PRODUCTION')).toHaveLength(2);
    expect(whole.split('PLAN')).toHaveLength(2);
  });

  it('still prefers a longer local body for an ordinary turn', () => {
    // The #6396 guard must survive: without a successor Run there is nothing
    // to have absorbed, so a longer local body is genuinely fresher.
    const local: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'streamed the full answer',
        events: [{ kind: 'text', text: 'streamed the full answer' }],
      } as ChatMessage,
    ];
    const server: ChatMessage[] = [
      { id: 'a1', role: 'assistant', content: 'stale', events: [] } as ChatMessage,
    ];

    expect(mergeServerMessagesIntoConversation(local, server)[0]!.content).toBe(
      'streamed the full answer',
    );
  });

  it('keeps the local body for the LAST Run of a task', () => {
    // The final Run's own message has no successor, so its live copy is the
    // freshest one and must not be replaced by a lagging server snapshot.
    const local: ChatMessage[] = [
      {
        id: 'a-production',
        role: 'assistant',
        content: 'PRODUCTION plus the tail that has not been persisted yet',
      } as ChatMessage,
    ];
    const server: ChatMessage[] = [
      {
        id: 'a-production',
        role: 'assistant',
        content: 'PRODUCTION',
        strategyTaskExecutionId: 'odnext_1',
        strategyTaskRunIndex: 1,
      } as ChatMessage,
    ];

    expect(mergeServerMessagesIntoConversation(local, server)[0]!.content).toContain(
      'not been persisted yet',
    );
  });
});

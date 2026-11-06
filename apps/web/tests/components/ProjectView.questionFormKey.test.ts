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

  it('keeps newer optimistic feedback when a server refresh races its save', () => {
    const localMessages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Done',
        runStatus: 'succeeded',
        feedback: {
          rating: 'negative',
          reasonCodes: ['weak_visual'],
          createdAt: 2_000,
          updatedAt: 2_100,
        },
      },
    ];
    const serverMessages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Done',
        runStatus: 'succeeded',
      },
    ];

    const merged = mergeServerMessagesIntoConversation(localMessages, serverMessages);

    expect(merged[0]?.feedback).toEqual(localMessages[0]?.feedback);
  });

  it('accepts feedback from the server when it is newer than the local copy', () => {
    const localMessages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Done',
        feedback: {
          rating: 'positive',
          createdAt: 1_000,
          updatedAt: 1_100,
        },
      },
    ];
    const serverMessages: ChatMessage[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Done',
        feedback: {
          rating: 'negative',
          createdAt: 1_000,
          updatedAt: 1_200,
        },
      },
    ];

    const merged = mergeServerMessagesIntoConversation(localMessages, serverMessages);

    expect(merged[0]?.feedback?.rating).toBe('negative');
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
  const productionFiles: ProjectFile[] = [
    'index.html',
    'illustration-1.png',
    'illustration-2.png',
    'illustration-3.png',
    'illustration-4.png',
    'illustration-5.png',
  ].map((name) => ({ name, size: 100, mtime: 300, kind: name.endsWith('.html') ? 'html' : 'image', mime: name.endsWith('.html') ? 'text/html' : 'image/png' }));

  function threeRunHistory(): ChatMessage[] {
    return [
      {
        id: 'question', role: 'assistant', runId: 'run-question', runStatus: 'succeeded',
        content: 'Which illustration palette?',
        events: [{ kind: 'text', text: 'Which illustration palette?' }],
        strategyTaskExecutionId: 'three-run-task', strategyTaskRunIndex: 0,
      },
      {
        id: 'planning', role: 'assistant', runId: 'run-planning', runStatus: 'succeeded',
        content: 'Palette confirmed. Ready to produce.',
        events: [{ kind: 'text', text: 'Palette confirmed. Ready to produce.' }],
        strategyTaskExecutionId: 'three-run-task', strategyTaskRunIndex: 1,
      },
      {
        id: 'production', role: 'assistant', runId: 'run-production', runStatus: 'succeeded',
        content: 'The lesson is ready.',
        events: [
          { kind: 'artifact_focus', show: ['index.html'] },
          { kind: 'text', text: 'The lesson is ready.' },
        ],
        strategyTaskExecutionId: 'three-run-task', strategyTaskRunIndex: 2,
        producedFiles: productionFiles,
      },
    ];
  }

  it('restores a three-run planning row without persisting its successor files under the planning run', () => {
    // Native OPEND-2994 repro: question -> clarification -> production. The
    // live planning row temporarily owns the successor stream. The first PUT
    // is rejected by daemon run ownership, then the completion GET restores
    // the planning run. Keeping the local files at that boundary would make
    // the NEXT PUT look like a valid planning-run write, exposing six extra
    // cards when Fork stops grouping the original strategy task.
    const server = threeRunHistory();
    const planning = server[1]!;
    const production = server[2]!;
    const local: ChatMessage[] = [server[0]!, {
      ...planning,
      runId: production.runId,
      content: `${planning.content}\n${production.content}`,
      events: [...planning.events!, ...production.events!],
      producedFiles: productionFiles,
    }];

    const refreshed = mergeServerMessagesIntoConversation(local, server);
    // A follow-up task-projection update saves this refreshed row. Its
    // physical run identity and file ownership must agree before persistence.
    expect(refreshed[1]).toMatchObject({
      id: planning.id, runId: planning.runId,
      content: planning.content, events: planning.events,
    });
    expect(refreshed[1]?.producedFiles ?? []).toEqual([]);
    expect(refreshed[2]?.producedFiles).toEqual(productionFiles);
    expect(refreshed[2]?.events).toEqual(production.events);
    expect(mergeServerMessagesIntoConversation(refreshed, server)).toEqual(refreshed);
  });

  it('keeps late files from their own planning run even when production has already been hydrated', () => {
    const server = threeRunHistory();
    const planning = server[1]!;
    const outline: ProjectFile = { name: 'outline.html', size: 80, mtime: 200, kind: 'html', mime: 'text/html' };
    const local: ChatMessage[] = [server[0]!, {
      ...planning,
      producedFiles: [outline],
    }, server[2]!];

    const refreshed = mergeServerMessagesIntoConversation(local, server);
    expect(refreshed[1]?.runId).toBe(planning.runId);
    expect(refreshed[1]?.producedFiles).toEqual([outline]);
    expect(refreshed[2]?.producedFiles).toEqual(productionFiles);
  });

  it('keeps all six late production files and the declared main artifact on their own run', () => {
    const local = threeRunHistory();
    const server = local.map((message) => message.id === 'production'
      ? { ...message, producedFiles: undefined }
      : message);

    const refreshed = mergeServerMessagesIntoConversation(local, server);
    expect(refreshed[0]?.producedFiles ?? []).toEqual([]);
    expect(refreshed[1]?.producedFiles ?? []).toEqual([]);
    expect(refreshed[2]?.runId).toBe('run-production');
    expect(refreshed[2]?.producedFiles).toEqual(productionFiles);
    expect(refreshed[2]?.events).toContainEqual({ kind: 'artifact_focus', show: ['index.html'] });
  });

  it.each(['local', 'server'] as const)('keeps late files when the %s legacy snapshot has no run identity', (legacySide) => {
    const message: ChatMessage = {
      id: 'legacy-delivery', role: 'assistant', runId: 'run-production',
      content: 'The lesson is ready.', runStatus: 'succeeded',
    };
    const local: ChatMessage = {
      ...message,
      ...(legacySide === 'local' ? { runId: undefined } : {}),
      producedFiles: productionFiles,
    };
    const server: ChatMessage = {
      ...message,
      ...(legacySide === 'server' ? { runId: undefined } : {}),
    };

    expect(mergeServerMessagesIntoConversation([local], [server])[0]?.producedFiles)
      .toEqual(productionFiles);
  });

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

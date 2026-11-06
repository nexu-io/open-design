// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { Conversation, ProjectMetadata } from '../../src/types';

const composerMocks = vi.hoisted(() => ({
  focus: vi.fn(),
  restoreDraft: vi.fn(),
  setDraft: vi.fn(),
}));

const translations: Record<string, string> = {
  'chat.queuedReorder': 'Drag to reorder',
  'chat.queuedEdit': 'Edit',
  'chat.queuedSteer': 'Steer',
  'chat.comments.remove': 'Remove',
};

function translate(key: string): string {
  return translations[key] ?? key;
}

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: () => null,
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props: Record<string, unknown>, ref) => {
    useImperativeHandle(ref, () => ({
      focus: composerMocks.focus,
      restoreDraft: composerMocks.restoreDraft,
      setDraft: composerMocks.setDraft,
    }));
    return <output data-testid="composer" />;
  }),
}));

class MockResizeObserver {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
}

const conversations: Conversation[] = [
  { id: 'conv-1', projectId: 'project-1', title: 'Conversation 1', createdAt: 1, updatedAt: 1 },
];

const projectMetadata: ProjectMetadata = { kind: 'prototype' };

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function renderQueuedStrip(options: { sendable: boolean } = { sendable: true }) {
  return render(
    <ChatPane
      messages={[]}
      streaming
      error={null}
      projectId="project-1"
      projectFiles={[]}
      queuedItems={[
        { id: 'queued-1', prompt: 'First queued follow-up' },
        { id: 'queued-2', prompt: 'Second queued follow-up' },
      ]}
      onRemoveQueuedSend={vi.fn()}
      onSendQueuedNow={options.sendable ? vi.fn() : undefined}
      onUpdateQueuedSend={vi.fn()}
      onReorderQueuedSends={vi.fn()}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={conversations}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      projectMetadata={projectMetadata}
    />,
  );
}

function actionLabelsPerRow(container: HTMLElement): string[][] {
  return Array.from(container.querySelectorAll('.chat-queued-send-row')).map((row) =>
    Array.from(row.querySelectorAll('.chat-queued-send-action')).map(
      (button) => button.getAttribute('aria-label') ?? '',
    ),
  );
}

/*
 * OPEND-2715. The queued row's three actions read left to right as
 * steer-the-conversation, then edit, then delete.
 *
 * The order is an escalation order: the leading slot is always "act on this
 * now" and the destructive one is always last, so delete is never the button
 * the pointer arrives at first.
 *
 * The leading slot used to have two faces — "steer" while a run was
 * interruptible, plain "send now" otherwise — and this file's job was partly to
 * prove the slot did not move between them. Product merged the faces on
 * 2026-09-08 ("引导对话就是原本的立即发送,只不过换了个名字跟 codex 对齐"), so
 * the same order now has to hold with the host offering the handler or not:
 * `onSteerQueuedSend` is gone, and a queued row reads the same either way.
 * `tests/components/chat/queue-steer-single-button.test.tsx` owns what that one
 * button is called; this file only owns where it sits.
 */
describe('queued send row action order', () => {
  it('leads with steer, whatever the run state', () => {
    const { container } = renderQueuedStrip();

    expect(actionLabelsPerRow(container)).toEqual([
      ['Steer', 'Edit', 'Remove'],
      ['Steer', 'Edit', 'Remove'],
    ]);
  });

  it('still leads with steer when the host offers no handler at all', () => {
    // The button is disabled in this state, not renamed and not reordered —
    // the escalation order is a layout fact, not a run-state one.
    const { container } = renderQueuedStrip({ sendable: false });

    expect(actionLabelsPerRow(container)).toEqual([
      ['Steer', 'Edit', 'Remove'],
      ['Steer', 'Edit', 'Remove'],
    ]);
  });

  it('puts the steer button first and the destructive one last in the DOM', () => {
    const { container } = renderQueuedStrip();

    const actions = container.querySelector('.chat-queued-send-actions');
    expect(actions?.firstElementChild?.getAttribute('data-testid')).toBe(
      'chat-queued-send-steer',
    );
    expect(actions?.lastElementChild?.getAttribute('aria-label')).toBe('Remove');
  });

  it('never renders the retired icon-only send-now face', () => {
    const { container } = renderQueuedStrip({ sendable: false });

    expect(container.querySelector('[data-testid="chat-queued-send-now"]')).toBeNull();
    const actions = container.querySelector('.chat-queued-send-actions');
    expect(actions?.firstElementChild?.getAttribute('data-testid')).toBe(
      'chat-queued-send-steer',
    );
    expect(actions?.lastElementChild?.getAttribute('aria-label')).toBe('Remove');
  });
});

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
  'chat.queuedSteerInterrupts': 'Steer — interrupts the current run',
  'chat.send': 'Send',
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

function renderQueuedStrip(options: { steerable: boolean }) {
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
      onSendQueuedNow={vi.fn()}
      onSteerQueuedSend={options.steerable ? vi.fn() : undefined}
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
 * The order is an escalation order, and it has to be stable across both faces
 * of the third button: the leading slot is always "act on this now" — whether
 * that means interrupting the running turn ("steer") or plain "send now" when
 * there is no run to interrupt — and the destructive one is always last, so it
 * is never the button the pointer arrives at first.
 */
describe('queued send row action order', () => {
  it('leads with steer when a run is interruptible', () => {
    const { container } = renderQueuedStrip({ steerable: true });

    expect(actionLabelsPerRow(container)).toEqual([
      ['Steer — interrupts the current run', 'Edit', 'Remove'],
      ['Steer — interrupts the current run', 'Edit', 'Remove'],
    ]);
  });

  it('leads with plain send-now when there is no run to steer', () => {
    const { container } = renderQueuedStrip({ steerable: false });

    expect(actionLabelsPerRow(container)).toEqual([
      ['Send', 'Edit', 'Remove'],
      ['Send', 'Edit', 'Remove'],
    ]);
  });

  it('puts the steer button first and the destructive one last in the DOM', () => {
    const { container } = renderQueuedStrip({ steerable: true });

    const actions = container.querySelector('.chat-queued-send-actions');
    expect(actions?.firstElementChild?.getAttribute('data-testid')).toBe(
      'chat-queued-send-steer',
    );
    expect(actions?.lastElementChild?.getAttribute('aria-label')).toBe('Remove');
  });

  it('puts the send-now button first when steering is unavailable', () => {
    const { container } = renderQueuedStrip({ steerable: false });

    const actions = container.querySelector('.chat-queued-send-actions');
    expect(actions?.firstElementChild?.getAttribute('data-testid')).toBe(
      'chat-queued-send-now',
    );
    expect(actions?.lastElementChild?.getAttribute('aria-label')).toBe('Remove');
  });
});

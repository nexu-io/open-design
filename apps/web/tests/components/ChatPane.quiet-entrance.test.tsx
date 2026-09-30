// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';

/*
 * OPEND-3334 · the Home hand-off's first turn is already on screen when the
 * real view's pane mounts, and again when the real rows replace the
 * optimistic ones. Rows born while `quietEntrance` is on skip the `msg-enter`
 * fade, and keep that choice after the flag drops: flipping a live row's
 * animation back on would restart it, which is the flash being fixed.
 */

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (key: string) => key }),
  useT: () => (key: string) => key,
}));

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message, enterQuietly }: { message: ChatMessage; enterQuietly?: boolean }) => (
    <div data-testid={`assistant-${message.id}`} data-quiet={enterQuietly ? 'true' : 'false'} />
  ),
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

afterEach(() => {
  cleanup();
});

function user(id: string): ChatMessage {
  return { id, role: 'user', content: `prompt ${id}`, createdAt: 1 };
}

function assistant(id: string): ChatMessage {
  return { id, role: 'assistant', content: '', createdAt: 2 };
}

function pane(messages: ChatMessage[], quietEntrance: boolean) {
  return (
    <ChatPane
      messages={messages}
      streaming
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={[]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      quietEntrance={quietEntrance}
    />
  );
}

function userRowQuiet(container: HTMLElement, id: string): boolean {
  const row = container.querySelector(`[data-chat-message-id="${id}"]`);
  expect(row, `user row ${id} is not rendered`).not.toBeNull();
  const entrance = row!.getAttribute('data-entrance');
  expect(['quiet', 'animated']).toContain(entrance);
  return entrance === 'quiet';
}

function assistantRowQuiet(container: HTMLElement, id: string): boolean {
  const row = container.querySelector(`[data-testid="assistant-${id}"]`);
  expect(row, `assistant row ${id} is not rendered`).not.toBeNull();
  return row!.getAttribute('data-quiet') === 'true';
}

describe('ChatPane quietEntrance', () => {
  it('rows born under the flag enter quietly for life; rows born after it fade in', () => {
    // The optimistic first turn, drawn by the pane the real view just mounted.
    const { container, rerender } = render(pane([user('opt-user'), assistant('opt-assistant')], true));
    expect(userRowQuiet(container, 'opt-user')).toBe(true);
    expect(assistantRowQuiet(container, 'opt-assistant')).toBe(true);

    // The real rows replace the optimistic ones while the hand-off still runs.
    rerender(pane([user('real-user'), assistant('real-assistant')], true));
    expect(userRowQuiet(container, 'real-user')).toBe(true);
    expect(assistantRowQuiet(container, 'real-assistant')).toBe(true);

    // The hand-off settles. The rows already on screen keep their choice; the
    // next turn is new and fades in as usual.
    rerender(pane([user('real-user'), assistant('real-assistant'), user('next-user')], false));
    expect(userRowQuiet(container, 'real-user')).toBe(true);
    expect(assistantRowQuiet(container, 'real-assistant')).toBe(true);
    expect(userRowQuiet(container, 'next-user')).toBe(false);
  });

  it('never marks a row when the flag is off', () => {
    const { container } = render(pane([user('u1'), assistant('a1')], false));
    expect(userRowQuiet(container, 'u1')).toBe(false);
    expect(assistantRowQuiet(container, 'a1')).toBe(false);
  });
});

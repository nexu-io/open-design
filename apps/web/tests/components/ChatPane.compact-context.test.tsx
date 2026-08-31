// @vitest-environment jsdom

// "Compact context" menu item (manual context compaction). The entry lives
// INSIDE the conversations menu so triggering it always takes two deliberate
// clicks (open menu, click item — an owner requirement to rule out accidental
// compaction), renders disabled with a reason tooltip instead of disappearing
// when the runtime cannot compact or no session exists yet, and shows a busy
// label while a compact run is streaming.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { Conversation } from '../../src/types';
import type { ChatMessage } from '../../src/types';

vi.mock('../../src/i18n', () => {
  const translate = (key: string, vars?: Record<string, string | number>) => {
    if (vars && Object.keys(vars).length > 0) {
      return `${key} ${Object.values(vars).join(' ')}`;
    }
    return key;
  };
  return {
    useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
    useT: () => translate,
  };
});

vi.mock('../../src/components/AssistantMessage', () => ({
  AssistantMessage: ({ message }: { message: ChatMessage }) => (
    <div data-testid={`assistant-${message.id}`}>{message.content}</div>
  ),
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

vi.mock('../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/events')>();
  return {
    ...actual,
    trackChatPanelClick: vi.fn(),
    trackRunFailedToastSurfaceView: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatPane compact-context menu item', () => {
  it('is two clicks deep: hidden until the conversations menu opens, then fires the handler and closes the menu', () => {
    const onCompactContext = vi.fn();
    renderChatPane({
      onCompactContext,
      compactContextSupported: true,
      compactContextHasSession: true,
    });

    // Click 1 of 2: the item is not reachable before the menu opens.
    expect(screen.queryByTestId('conversation-compact-context')).toBeNull();
    fireEvent.click(screen.getByTestId('conversation-history-trigger'));

    // Click 2 of 2: the item itself.
    const item = screen.getByTestId('conversation-compact-context');
    expect((item as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(item);

    expect(onCompactContext).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('conversation-history-menu')).toBeNull();
  });

  it('renders disabled with an unsupported-runtime tooltip when the runtime lacks manualCompact', () => {
    const onCompactContext = vi.fn();
    renderChatPane({
      onCompactContext,
      compactContextSupported: false,
      compactContextHasSession: true,
    });

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    const item = screen.getByTestId('conversation-compact-context') as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.title).toBe('chat.compactContextUnsupported');

    fireEvent.click(item);
    expect(onCompactContext).not.toHaveBeenCalled();
  });

  it('renders disabled with a no-session tooltip when no resumable session exists yet', () => {
    renderChatPane({
      onCompactContext: vi.fn(),
      compactContextSupported: true,
      compactContextHasSession: false,
    });

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    const item = screen.getByTestId('conversation-compact-context') as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.title).toBe('chat.compactContextNoSession');
  });

  it('shows the busy label and stays disabled while a compact run is streaming', () => {
    renderChatPane({
      onCompactContext: vi.fn(),
      compactContextSupported: true,
      compactContextHasSession: true,
      compactContextBusy: true,
    });

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    const item = screen.getByTestId('conversation-compact-context') as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.textContent).toContain('chat.compactContextBusy');
  });

  it('is absent entirely when no handler is wired', () => {
    renderChatPane({});

    fireEvent.click(screen.getByTestId('conversation-history-trigger'));
    expect(screen.getByTestId('conversation-history-menu')).toBeTruthy();
    expect(screen.queryByTestId('conversation-compact-context')).toBeNull();
  });
});

function renderChatPane(props: {
  onCompactContext?: () => void;
  compactContextSupported?: boolean;
  compactContextHasSession?: boolean;
  compactContextBusy?: boolean;
}) {
  return render(
    <ChatPane
      messages={[]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={[conversation({ id: 'conv-1', title: 'Long design session' })]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      {...props}
    />,
  );
}

function conversation(overrides: Partial<Conversation> & { id: string }): Conversation {
  return {
    projectId: 'project-1',
    title: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

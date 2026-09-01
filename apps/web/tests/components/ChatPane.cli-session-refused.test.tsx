// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { AppConfig, ChatMessage } from '../../src/types';

// Red spec for the ACP handshake-refusal card (issue behind PR #7303).
//
// An ACP agent that answers `initialize` and then rejects `session/new` (Kimi
// Code 0.37.x / 0.38.0) used to reach the user as a paragraph the DAEMON wrote:
// "The Kimi CLI (0.38.0) accepted the connection but refused to start a
// session. … Details: json-rpc id 2: Internal error". Two things were wrong
// with that, and neither is a translation bug:
//
//   1. A daemon-authored string never passes through i18n, so a Chinese UI
//      rendered a Chinese title above an English body.
//   2. The paragraph restated the raw agent line, which the details block
//      below already prints — the same sentence twice in one card.
//
// The architecture this pins: the daemon NAMES the failure
// (`AGENT_CLI_SESSION_REFUSED` + the CLI version as data) and the web renders
// it from the i18n dictionary, with the agent's own line appearing exactly
// once, in the diagnostics block.
//
// This exercises the real ChatPane render path — not `resolveRunFailureUi` in
// isolation — because a mapping table that nothing reads is how a fix ships
// broken.

const translate = (key: string, vars?: Record<string, string | number>) => {
  if (vars && Object.keys(vars).length > 0) {
    return `${key} ${Object.values(vars).join(' ')}`;
  }
  return key;
};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'zh-CN', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));

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
    trackRunRecoveryActionClick: vi.fn(),
    trackRunRecoveryActionSurfaceView: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const RAW_AGENT_LINE = 'json-rpc id 2: Internal error';

function refusedMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-refused',
    role: 'assistant',
    content: '',
    createdAt: 1,
    runId: 'run-refused',
    runStatus: 'failed',
    agentId: 'kimi',
    agentName: 'Kimi CLI',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: RAW_AGENT_LINE,
        code: 'AGENT_CLI_SESSION_REFUSED',
        failureDetail: 'agent_protocol_error',
      },
    ],
    ...overrides,
  } as ChatMessage;
}

function renderChat(message: ChatMessage) {
  return render(
    <ChatPane
      messages={[message]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onRetry={vi.fn()}
      conversations={[
        { projectId: 'project-1', id: 'conv-1', title: 'Current', createdAt: 1, updatedAt: 1 },
      ]}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      config={{ agentId: 'kimi', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('ChatPane — ACP CLI session refusal card', () => {
  it('renders the failure from the i18n dictionary, not from daemon prose', () => {
    const { container } = renderChat(refusedMessage());

    const card = container.querySelector('[data-user-action-card="run-recovery"]');
    expect(card).toBeTruthy();

    // The type line is the named failure, not the generic "task failed".
    expect(card!.textContent).toContain('chat.runError.title.cliSessionRefused');
    expect(card!.textContent).not.toContain('chat.runError.title.generic');

    // The body is a dictionary key resolved at render time — which is exactly
    // what a daemon-authored English sentence can never be.
    const description = container.querySelector('.run-error__description');
    expect(description).toBeTruthy();
    expect(description!.textContent).toContain('chat.runError.cliSessionRefusedMessage');
    // Rendered with nothing left to interpolate. A `{…}` slot surviving in the
    // output is what a half-removed version variable would look like on screen.
    expect(description!.textContent).not.toMatch(/[{}]/);
    expect(description!.textContent).not.toContain('undefined');

    // …and it does NOT restate the agent's line. That restatement is what put
    // the same sentence in the card twice.
    expect(description!.textContent).not.toContain('json-rpc');
    expect(description!.textContent).not.toContain('Details:');
  });

  it('shows the raw agent line exactly once, in the diagnostics block', () => {
    const { container } = renderChat(refusedMessage());

    const diagnostic = container.querySelector('.run-error__diagnostic pre');
    expect(diagnostic).toBeTruthy();
    expect(diagnostic!.textContent).toContain(RAW_AGENT_LINE);
    expect(diagnostic!.textContent).toContain('error_code: AGENT_CLI_SESSION_REFUSED');

    const card = container.querySelector('[data-user-action-card="run-recovery"]')!;
    expect(occurrences(card.textContent ?? '', RAW_AGENT_LINE)).toBe(1);
  });

  it('offers Retry — the CLI build is the user\'s to change, then re-run', () => {
    renderChat(refusedMessage());
    expect(screen.getByRole('button', { name: 'promptTemplates.retry' })).toBeTruthy();
  });

  // The daemon may ship extra structured facts on the same event (it already
  // does for other codes, and a follow-up will add the detected CLI build).
  // None of them may change which card this is.
  it('renders the same card whatever else the daemon stamped on the event', () => {
    const { container } = renderChat(
      refusedMessage({
        events: [
          {
            kind: 'status',
            label: 'error',
            detail: RAW_AGENT_LINE,
            code: 'AGENT_CLI_SESSION_REFUSED',
            failureDetail: 'agent_protocol_error',
            failureCategory: 'process_exit',
          },
        ],
      } as Partial<ChatMessage>),
    );

    const description = container.querySelector('.run-error__description');
    expect(description!.textContent).toContain('chat.runError.cliSessionRefusedMessage');
    expect(description!.textContent).not.toContain('undefined');
  });
});

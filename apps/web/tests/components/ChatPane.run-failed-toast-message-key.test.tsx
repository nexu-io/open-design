// @vitest-environment jsdom
//
// `run_failed_toast` records that a user was shown a failure card. Until now
// it carried only `error_code` — the daemon's name for what went wrong — and
// nothing about what the user actually READ.
//
// Those are two different facts separated by a mapping table, and the table is
// always one row short: `resolveRunErrorCardDescription` says so in as many
// words ("a lookup table can always be one row short"). When it is short, the
// card falls back to a blank "the task failed" with no diagnosis — which is
// the single worst impression this surface can produce, and the one we could
// not count.
//
// So `message_key` names the sentence, and `generic_fallback` names its
// absence. The fallback case must report a VALUE, not an omitted field: a rate
// needs a denominator, and an omitted key drops the fallback impressions out
// of the very count meant to measure them.

import { cleanup, render } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import { trackRunFailedToastSurfaceView } from '../../src/analytics/events';
import type { AppConfig, ChatMessage } from '../../src/types';

const translate = (key: string, vars?: Record<string, string | number>) => {
  if (vars && Object.keys(vars).length > 0) {
    return `${key} ${Object.values(vars).join(' ')}`;
  }
  return key;
};

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
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

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function failedMessage(
  code: string,
  failureCategory?: string,
): ChatMessage {
  return {
    id: 'msg-failed',
    role: 'assistant',
    content: 'Partial work.',
    createdAt: 1,
    runId: 'run-1',
    runStatus: 'failed',
    agentId: 'claude',
    events: [
      {
        kind: 'status',
        label: 'error',
        detail: 'upstream said something unhelpful',
        code,
        ...(failureCategory ? { failureCategory } : {}),
      },
    ],
  } as unknown as ChatMessage;
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
      config={{ agentId: 'claude', agentCliEnv: {} } as unknown as AppConfig}
    />,
  );
}

function reportedProps(): Record<string, unknown> {
  const mock = vi.mocked(trackRunFailedToastSurfaceView);
  expect(mock).toHaveBeenCalledTimes(1);
  return mock.mock.calls[0]![1] as unknown as Record<string, unknown>;
}

describe('run_failed_toast — which sentence the user read', () => {
  it('names the mapped copy when the table has a line for this failure', () => {
    // AGENT_CLI_SESSION_REFUSED is mapped: the card renders a real diagnosis
    // ("change the CLI build, then retry"), not the blank apology.
    renderChat(failedMessage('AGENT_CLI_SESSION_REFUSED'));

    expect(reportedProps().message_key).toBe('chat.runError.cliSessionRefusedMessage');
  });

  it('reports generic_fallback — a value, not a gap — when the table has none', () => {
    // The impression that matters most: the user was told their task failed
    // and given nothing else. Omitting the field here would erase exactly the
    // numerator AND the denominator of the fallback rate.
    renderChat(failedMessage('AGENT_EXECUTION_FAILED'));

    const props = reportedProps();
    expect(props.message_key).toBe('generic_fallback');
    expect(Object.keys(props)).toContain('message_key');
  });

  it('carries the daemon classification when the failure event has one', () => {
    renderChat(failedMessage('AGENT_EXECUTION_FAILED', 'upstream_unavailable'));

    expect(reportedProps().failure_category).toBe('upstream_unavailable');
  });

  it("falls back to the enum's own unknown rather than dropping the field", () => {
    // Reverse anchor for the previous case: a run whose error event carries no
    // classification must still report a category, or the breakdown silently
    // loses those impressions instead of showing them as unclassified.
    renderChat(failedMessage('AGENT_EXECUTION_FAILED'));

    const props = reportedProps();
    expect(props.failure_category).toBe('unknown');
    expect(Object.keys(props)).toContain('failure_category');
  });

  it('still reports the code and the run identity it always did', () => {
    // Positive control: without this, deleting the whole call would keep every
    // assertion above from ever running its subject.
    renderChat(failedMessage('AGENT_CLI_SESSION_REFUSED'));

    const props = reportedProps();
    expect(props.error_code).toBe('AGENT_CLI_SESSION_REFUSED');
    expect(props.element).toBe('run_failed_toast');
    expect(props.run_id).toBe('run-1');
    expect(props.conversation_id).toBe('conv-1');
  });
});

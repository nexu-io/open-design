import { describe, expect, it } from 'vitest';

import {
  acpTerminalAuthFromErrorDetails,
  appendErrorStatusEvent,
} from '../../src/runtime/chat-events';

describe('acpTerminalAuthFromErrorDetails', () => {
  it('normalizes ACP terminal-auth details without exposing launch internals', () => {
    const auth = acpTerminalAuthFromErrorDetails(
      {
        kind: 'acp_terminal_auth',
        auth: {
          methodId: 'login',
          label: 'Login with Kimi account',
          command: '/Users/test/.kimi-code/bin/kimi',
          args: ['login'],
          env: { KIMI_HOME: '/Users/test/.kimi-code' },
        },
      },
      'kimi',
    );

    expect(auth).toEqual({
      kind: 'terminal-auth',
      agentId: 'kimi',
      methodId: 'login',
      label: 'Login with Kimi account',
    });
  });

  it('drops malformed terminal-auth details', () => {
    expect(acpTerminalAuthFromErrorDetails({ kind: 'acp_terminal_auth' }, 'kimi')).toBeUndefined();
    expect(acpTerminalAuthFromErrorDetails({
      kind: 'acp_terminal_auth',
      auth: { methodId: 'login', command: 'kimi' },
    }, null)).toBeUndefined();
  });
});

describe('appendErrorStatusEvent', () => {
  it('persists terminal-auth metadata on error status events', () => {
    const message = appendErrorStatusEvent(
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        startedAt: 1,
        events: [],
      },
      'Agent authentication requires a terminal sign-in.',
      'AGENT_AUTH_REQUIRED',
      {
        kind: 'terminal-auth',
        agentId: 'kimi',
        methodId: 'login',
        label: 'Login with Kimi account',
      },
    );

    expect(message.events).toEqual([
      {
        kind: 'status',
        label: 'error',
        detail: 'Agent authentication requires a terminal sign-in.',
        code: 'AGENT_AUTH_REQUIRED',
        auth: {
          kind: 'terminal-auth',
          agentId: 'kimi',
          methodId: 'login',
          label: 'Login with Kimi account',
        },
      },
    ]);
  });
});

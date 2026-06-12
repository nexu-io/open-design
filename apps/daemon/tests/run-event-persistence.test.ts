import { describe, expect, it } from 'vitest';
import { __forTestRunSseEventToPersistedAgentEvent } from '../src/server.js';

describe('run event persistence', () => {
  it('persists minimal ACP terminal-auth recovery metadata on error status events', () => {
    const event = __forTestRunSseEventToPersistedAgentEvent(
      'error',
      {
        error: {
          code: 'AGENT_AUTH_REQUIRED',
          message: 'Agent authentication requires a terminal sign-in.',
          details: {
            kind: 'acp_terminal_auth',
            auth: {
              kind: 'terminal-auth',
              methodId: 'login',
              label: 'Login with Kimi account',
              command: '/Users/test/.kimi-code/bin/kimi',
              args: ['login'],
              env: { KIMI_HOME: '/Users/test/.kimi' },
            },
          },
        },
      },
      { agentId: 'kimi' },
    );

    expect(event).toEqual({
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
    });
  });
});

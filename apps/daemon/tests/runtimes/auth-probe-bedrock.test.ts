// Regression coverage: Claude Code's Bedrock/IAM auth mode has no claude.ai
// session for `claude auth status` to inspect, so the probe always reports
// {"authenticated": false} even when the CLI is genuinely working via AWS
// credentials. hasProbeSatisfyingApiKey() should short-circuit to `ok` when
// CLAUDE_CODE_USE_BEDROCK is set, the same way it already does for a real
// ANTHROPIC_API_KEY, without ever running the probe.

import { describe, expect, it, vi } from 'vitest';

const execAgentFileMock = vi.fn();

vi.mock('../../src/runtimes/invocation.js', () => ({
  execAgentFile: (...args: unknown[]) =>
    (execAgentFileMock as unknown as (...args: unknown[]) => unknown)(...args),
}));

const { probeAgentAuthStatus } = await import('../../src/runtimes/auth.js');

describe('probeAgentAuthStatus — Claude Code + Bedrock', () => {
  it('short-circuits to ok when CLAUDE_CODE_USE_BEDROCK is set (no probe run)', async () => {
    const result = await probeAgentAuthStatus(
      { id: 'claude', name: 'Claude Code', authProbe: { args: ['auth', 'status'] } },
      '/fake/bin/claude',
      { CLAUDE_CODE_USE_BEDROCK: '1', AWS_PROFILE: 'work' },
    );
    expect(result).toEqual({ status: 'ok' });
    expect(execAgentFileMock).not.toHaveBeenCalled();
  });

  it('falls through to the probe when CLAUDE_CODE_USE_BEDROCK is absent', async () => {
    execAgentFileMock.mockResolvedValue({
      stdout: '{"authenticated": false}',
      stderr: '',
    });
    const result = await probeAgentAuthStatus(
      { id: 'claude', name: 'Claude Code', authProbe: { args: ['auth', 'status'] } },
      '/fake/bin/claude',
      {},
    );
    expect(execAgentFileMock).toHaveBeenCalledTimes(1);
    expect(result?.status).toBe('missing');
  });
});

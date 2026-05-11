/**
 * Regression coverage for issue #658: Open Design kept advertising
 * `Codex CLI` in Settings > Local CLI after the user had uninstalled
 * the binary. Root cause was the probe in `apps/daemon/src/runtimes/
 * detection.ts` swallowing every `--version` failure and returning
 * `available: true` anyway. When `resolveAgentExecutable` happened to
 * still find a stale wrapper shim (a leftover `.cmd` on Windows, or a
 * macOS/Linux wrapper pointing at a deleted Node interpreter), the
 * subsequent spawn rejected with ENOENT / EACCES / ENOTDIR but the
 * UI was told the agent was alive.
 *
 * The fix tightens the catch arm: if the OS itself rejected the spawn
 * (the binary is not invocable, period), report the agent as
 * unavailable. Any other failure — the binary spawned but returned
 * non-zero, or its `--version` flag is unsupported — keeps the
 * pre-fix "available, version unknown" behaviour so adapters that
 * legitimately have no `--version` flag are not regressed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAgentFileMock = vi.fn();
const resolveAgentExecutableMock = vi.fn();

vi.mock('../../src/runtimes/invocation.js', () => ({
  execAgentFile: (...args: unknown[]) =>
    (execAgentFileMock as unknown as (...args: unknown[]) => unknown)(...args),
}));

vi.mock('../../src/runtimes/executables.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtimes/executables.ts')>();
  return {
    ...actual,
    resolveAgentExecutable: (...args: Parameters<typeof actual.resolveAgentExecutable>) =>
      (
        resolveAgentExecutableMock as unknown as (
          ...a: Parameters<typeof actual.resolveAgentExecutable>
        ) => ReturnType<typeof actual.resolveAgentExecutable>
      )(...args),
  };
});

function spawnError(code: 'ENOENT' | 'EACCES' | 'ENOTDIR' | 'ETIMEDOUT'): NodeJS.ErrnoException {
  const error = new Error(`spawn failed (${code})`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

describe('probe (issue #658) — ghost CLI after the binary is uninstalled', () => {
  beforeEach(() => {
    execAgentFileMock.mockReset();
    resolveAgentExecutableMock.mockReset();
    // Default: pretend every agent definition has its shim still on
    // disk so `resolveAgentExecutable` returns a non-null path. Each
    // test overrides `execAgentFile` to control what happens at spawn
    // time.
    resolveAgentExecutableMock.mockImplementation(() => '/fake/bin/codex');
  });

  for (const failingCode of ['ENOENT', 'EACCES', 'ENOTDIR'] as const) {
    it(`marks the agent unavailable when the version probe rejects with ${failingCode}`, async () => {
      execAgentFileMock.mockRejectedValue(spawnError(failingCode));
      const { detectAgents } = await import('../../src/runtimes/detection.js');

      const agents = await detectAgents();
      const codex = agents.find((agent) => agent.id === 'codex');

      expect(codex).toBeDefined();
      expect(codex?.available).toBe(false);
    });
  }

  it('keeps available=true when the binary spawns but --version returns non-zero (e.g. timeout, unsupported flag)', async () => {
    // Non-spawn failures must NOT regress to unavailable; adapters
    // whose --version flag is missing have historically shown up as
    // "available, version=null" and that contract must hold.
    execAgentFileMock.mockRejectedValue(spawnError('ETIMEDOUT'));
    const { detectAgents } = await import('../../src/runtimes/detection.js');

    const agents = await detectAgents();
    const codex = agents.find((agent) => agent.id === 'codex');

    expect(codex).toBeDefined();
    expect(codex?.available).toBe(true);
    expect(codex?.version).toBeNull();
  });

  it('returns the parsed version on a clean --version run', async () => {
    execAgentFileMock.mockResolvedValue({ stdout: 'codex 1.2.3\n', stderr: '' });
    const { detectAgents } = await import('../../src/runtimes/detection.js');

    const agents = await detectAgents();
    const codex = agents.find((agent) => agent.id === 'codex');

    expect(codex).toBeDefined();
    expect(codex?.available).toBe(true);
    expect(codex?.version).toBe('codex 1.2.3');
  });
});

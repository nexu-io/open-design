/**
 * Regression coverage for issue #658: Open Design kept advertising
 * `Codex CLI` in Settings > Local CLI after the user had uninstalled
 * the binary. The probe in `apps/daemon/src/runtimes/detection.ts`
 * swallowed every `--version` failure and returned `available: true`
 * anyway, so a leftover wrapper shim made Settings think the CLI was
 * alive when its underlying interpreter was gone.
 *
 * The current fix has two layers:
 *
 *   1. The version probe classifies its failure mode. OS-level
 *      rejections (`ENOENT` / `EACCES` / `ENOTDIR`) and shell-exit
 *      stale-wrapper signatures (numeric exit code 126 or 127) are
 *      "not invocable" and report `available: false`. Every other
 *      failure (timeout, generic non-zero exit, unsupported
 *      `--version` flag) keeps the legacy "available, version=null"
 *      contract so adapters with no `--version` flag are not
 *      regressed.
 *
 *   2. If the selected path is the configured override (e.g. a
 *      stale `CODEX_BIN`) but a different PATH-resolved binary is
 *      also available, the probe retries against the PATH candidate
 *      before giving up. That keeps Settings' "adopt detected
 *      binary" repair flow (PR #1205) accessible: it gates on
 *      `agent.available === true`, so locking the agent before the
 *      user can run the repair flow would trap the user.
 *
 * Both layers were flagged in lefarcen's review on PR #1301.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAgentFileMock = vi.fn();
const inspectAgentExecutableResolutionMock = vi.fn();

vi.mock('../../src/runtimes/invocation.js', () => ({
  execAgentFile: (...args: unknown[]) =>
    (execAgentFileMock as unknown as (...args: unknown[]) => unknown)(...args),
}));

vi.mock('../../src/runtimes/executables.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtimes/executables.js')>();
  return {
    ...actual,
    inspectAgentExecutableResolution: (
      ...args: Parameters<typeof actual.inspectAgentExecutableResolution>
    ) =>
      (
        inspectAgentExecutableResolutionMock as unknown as (
          ...a: Parameters<typeof actual.inspectAgentExecutableResolution>
        ) => ReturnType<typeof actual.inspectAgentExecutableResolution>
      )(...args),
  };
});

type Resolution = {
  configuredOverridePath: string | null;
  pathResolvedPath: string | null;
  selectedPath: string | null;
};

function resolution(parts: Partial<Resolution> & { selectedPath: string | null }): Resolution {
  return {
    configuredOverridePath: parts.configuredOverridePath ?? null,
    pathResolvedPath: parts.pathResolvedPath ?? null,
    selectedPath: parts.selectedPath,
  };
}

function spawnError(code: 'ENOENT' | 'EACCES' | 'ENOTDIR' | 'ETIMEDOUT'): NodeJS.ErrnoException {
  const error = new Error(`spawn failed (${code})`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function exitCodeError(code: number): NodeJS.ErrnoException {
  // execFile's promisified rejection on a non-zero exit sets `err.code`
  // to the numeric exit code (Node's documented behaviour). 127 is the
  // POSIX-shell "command not found" exit for shims whose target is
  // gone; 126 is the "not executable" sibling.
  const error = new Error(`process exited with code ${code}`) as NodeJS.ErrnoException;
  (error as { code: unknown }).code = code;
  return error;
}

describe('probe (issue #658) — ghost CLI after the binary is uninstalled', () => {
  beforeEach(() => {
    execAgentFileMock.mockReset();
    inspectAgentExecutableResolutionMock.mockReset();
    inspectAgentExecutableResolutionMock.mockImplementation(() =>
      resolution({ selectedPath: '/fake/bin/codex', pathResolvedPath: '/fake/bin/codex' }),
    );
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

  for (const stalenessExit of [126, 127] as const) {
    it(`marks the agent unavailable when a wrapper shim exits ${stalenessExit} (stale interpreter / target)`, async () => {
      // Regression for lefarcen P2: many shims (npm bin wrappers, env
      // node, `.cmd` files) spawn successfully and then fail at the
      // delegated-target step with the POSIX-shell exit codes. The
      // execFile rejection carries the numeric exit code on `err.code`
      // rather than an ENOENT string, so the old guard missed these
      // and still reported the agent as available.
      execAgentFileMock.mockRejectedValue(exitCodeError(stalenessExit));
      const { detectAgents } = await import('../../src/runtimes/detection.js');

      const agents = await detectAgents();
      const codex = agents.find((agent) => agent.id === 'codex');

      expect(codex).toBeDefined();
      expect(codex?.available).toBe(false);
    });
  }

  it('keeps available=true when the binary spawns but --version returns non-zero (timeout, unsupported flag)', async () => {
    // Non-spawn, non-126/127 failures must NOT regress to unavailable;
    // adapters whose --version flag is missing legitimately exit
    // non-zero and have always shown up as "available, version=null".
    execAgentFileMock.mockRejectedValue(spawnError('ETIMEDOUT'));
    const { detectAgents } = await import('../../src/runtimes/detection.js');

    const agents = await detectAgents();
    const codex = agents.find((agent) => agent.id === 'codex');

    expect(codex).toBeDefined();
    expect(codex?.available).toBe(true);
    expect(codex?.version).toBeNull();
  });

  it('keeps available=true on a generic non-zero exit (e.g. exit 1 from an adapter with no --version flag)', async () => {
    execAgentFileMock.mockRejectedValue(exitCodeError(1));
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

  it('falls back to the PATH binary when a stale CODEX_BIN override fails to spawn', async () => {
    // Regression for lefarcen P2: a user with a stale CODEX_BIN
    // override should not be locked out of the Settings repair flow
    // when there is a working binary on PATH. The probe must retry
    // the PATH candidate so `agent.available` stays true and the
    // Test / "adopt detected binary" buttons keep working.
    inspectAgentExecutableResolutionMock.mockImplementation(() =>
      resolution({
        configuredOverridePath: '/stale/custom/codex',
        pathResolvedPath: '/usr/local/bin/codex',
        selectedPath: '/stale/custom/codex',
      }),
    );
    execAgentFileMock.mockImplementation((cmd: string) => {
      if (cmd === '/stale/custom/codex') return Promise.reject(spawnError('ENOENT'));
      return Promise.resolve({ stdout: 'codex 1.4.2\n', stderr: '' });
    });
    const { detectAgents } = await import('../../src/runtimes/detection.js');

    const agents = await detectAgents();
    const codex = agents.find((agent) => agent.id === 'codex');

    expect(codex).toBeDefined();
    expect(codex?.available).toBe(true);
    expect(codex?.path).toBe('/usr/local/bin/codex');
    expect(codex?.version).toBe('codex 1.4.2');
  });

  it('reports unavailable when both the override and the PATH candidate fail to spawn', async () => {
    inspectAgentExecutableResolutionMock.mockImplementation(() =>
      resolution({
        configuredOverridePath: '/stale/custom/codex',
        pathResolvedPath: '/usr/local/bin/codex',
        selectedPath: '/stale/custom/codex',
      }),
    );
    execAgentFileMock.mockRejectedValue(spawnError('ENOENT'));
    const { detectAgents } = await import('../../src/runtimes/detection.js');

    const agents = await detectAgents();
    const codex = agents.find((agent) => agent.id === 'codex');

    expect(codex).toBeDefined();
    expect(codex?.available).toBe(false);
  });

  it('does not retry when there is no distinct PATH candidate to fall back to', async () => {
    // Same selected & pathResolved (the common "no override, agent
    // discovered via PATH only" case): on a not-invocable failure we
    // must not call execAgentFile a second time against the same path.
    // Scope the path to codex so spawn calls from other AGENT_DEFS
    // entries don't pollute the count assertion.
    inspectAgentExecutableResolutionMock.mockImplementation(
      (def: { id: string }) => {
        if (def.id !== 'codex') {
          return resolution({ selectedPath: null });
        }
        return resolution({
          selectedPath: '/codex-only/bin/codex',
          pathResolvedPath: '/codex-only/bin/codex',
        });
      },
    );
    execAgentFileMock.mockRejectedValue(spawnError('ENOENT'));
    const { detectAgents } = await import('../../src/runtimes/detection.js');

    const agents = await detectAgents();
    const codex = agents.find((agent) => agent.id === 'codex');

    expect(codex).toBeDefined();
    expect(codex?.available).toBe(false);
    const codexCalls = execAgentFileMock.mock.calls.filter(
      (call) => call[0] === '/codex-only/bin/codex',
    );
    expect(codexCalls).toHaveLength(1);
  });
});

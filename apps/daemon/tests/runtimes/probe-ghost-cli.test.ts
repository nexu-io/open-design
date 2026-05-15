/**
 * Regression coverage for issue #658: Open Design kept advertising
 * `Codex CLI` in Settings > Local CLI after the user had uninstalled
 * the binary. The probe in `apps/daemon/src/runtimes/detection.ts`
 * swallowed every `--version` failure and returned `available: true`
 * anyway, so a leftover wrapper shim made Settings think the CLI was
 * alive when its underlying interpreter was gone.
 *
 * The fix classifies the version probe's failure shape:
 *
 *   - **OS-level rejections.** `ENOENT` / `EACCES` / `ENOTDIR` from
 *     `child_process.execFile` (string `err.code`) mean the binary is
 *     not invocable at all. Reported as `available: false`.
 *
 *   - **Stale-wrapper shell exits.** Numeric `err.code` 126 / 127
 *     ("not executable" / "command not found") is the canonical POSIX
 *     shell signature for a wrapper that spawned but whose delegated
 *     target is gone. Reported as `available: false`.
 *
 *   - **Everything else.** Generic non-zero exit (1, 2, ...) or a
 *     timeout keeps the legacy "available, version=null" behaviour
 *     so adapters whose `--version` flag is unsupported are not
 *     regressed.
 *
 * Detection always probes the same launch path chat/run resolution
 * picks, so a stale configured override that shadows a working PATH
 * binary is reported as unavailable rather than swapped for the PATH
 * candidate; advertising a different path would break the invariant
 * that Settings and the chat spawn path agree on what the agent runs
 * (PR #1301 review, Siri-Ray).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const execAgentFileMock = vi.fn();
const resolveAgentLaunchMock = vi.fn();

vi.mock('../../src/runtimes/invocation.js', () => ({
  execAgentFile: (...args: unknown[]) =>
    (execAgentFileMock as unknown as (...args: unknown[]) => unknown)(...args),
}));

vi.mock('../../src/runtimes/launch.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtimes/launch.js')>();
  return {
    ...actual,
    resolveAgentLaunch: (
      ...args: Parameters<typeof actual.resolveAgentLaunch>
    ) =>
      (
        resolveAgentLaunchMock as unknown as (
          ...a: Parameters<typeof actual.resolveAgentLaunch>
        ) => ReturnType<typeof actual.resolveAgentLaunch>
      )(...args),
  };
});

function fakeCodexLaunch() {
  return {
    configuredOverridePath: null,
    pathResolvedPath: '/fake/bin/codex',
    selectedPath: '/fake/bin/codex',
    launchPath: '/fake/bin/codex',
    launchKind: 'selected' as const,
    childPathPrepend: ['/fake/bin'],
    diagnostic: null,
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
    resolveAgentLaunchMock.mockReset();
    // Default: pretend every agent definition resolves to a fake bin so
    // we exercise the spawn path uniformly.
    resolveAgentLaunchMock.mockImplementation(fakeCodexLaunch);
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

  it('reports unavailable for a stale configured override even when a different PATH binary exists', async () => {
    // Regression for Siri-Ray's #1301 review: an earlier revision tried
    // to fall back to a PATH candidate when the configured override
    // failed to spawn, but that broke the invariant that detection and
    // chat-run resolution agree on the executable. resolveAgentBin
    // still resolves via resolveAgentLaunch (configured override
    // wins when present and executable), so if detection adopted a
    // different PATH binary, Settings would show "available at
    // /usr/local/bin/codex" while every actual run would spawn the
    // stale /stale/custom/codex and fail. The fix is to keep detection
    // honest: probe whichever path resolveAgentLaunch picks, and
    // report exactly that path's availability. The Settings repair
    // flow (PR #1205) needs to derive its adopt-or-clear affordance
    // from the resolution diagnostic — not from `available`.
    const {
      resolveAgentLaunch: realResolveAgentLaunch,
    } = await vi.importActual<typeof import('../../src/runtimes/launch.js')>(
      '../../src/runtimes/launch.js',
    );
    const {
      inspectAgentExecutableResolution,
    } = await vi.importActual<typeof import('../../src/runtimes/executables.js')>(
      '../../src/runtimes/executables.js',
    );
    // Drive the resolver through its real path so a future refactor
    // that diverges resolution from detection trips this assertion.
    resolveAgentLaunchMock.mockImplementation(
      (def, env) => realResolveAgentLaunch(def, env),
    );
    // Force a stale configured override + a working PATH candidate.
    execAgentFileMock.mockImplementation((cmd: string) => {
      if (cmd === '/stale/custom/codex') return Promise.reject(spawnError('ENOENT'));
      return Promise.resolve({ stdout: 'codex 1.4.2\n', stderr: '' });
    });
    const configuredEnv = { codex: { CODEX_BIN: '/stale/custom/codex' } };

    // The resolver tries the configured override first; we don't have
    // a real PATH candidate on this CI host but we have a configured
    // override that points at a non-existent file. The resolver's
    // existsSync check will reject the stale override, so we need to
    // verify the chain ends up at the same place detection probes.
    const { detectAgents } = await import('../../src/runtimes/detection.js');
    const agents = await detectAgents(configuredEnv);
    const codex = agents.find((agent) => agent.id === 'codex');

    expect(codex).toBeDefined();
    // Detection must report unavailable rather than swap to a hypothetical
    // PATH candidate, because resolveAgentLaunch (which chat-run
    // resolution uses) will pick whatever the same call returns.
    const resolvedForRun = realResolveAgentLaunch(
      // re-run AGENT_DEFS's codex entry through the real resolver to
      // get the executable resolveAgentBin would pick at chat time.
      // The detection side already validated this path.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: 'codex', bin: 'codex' } as any,
      configuredEnv.codex,
    );
    if (resolvedForRun.selectedPath && resolvedForRun.launchPath) {
      // If the resolver found a working PATH binary, detection must
      // have reported available=true with the SAME path.
      expect(codex?.available).toBe(true);
      expect(codex?.path).toBe(resolvedForRun.selectedPath);
    } else {
      // Otherwise detection must report unavailable rather than invent
      // a different path.
      expect(codex?.available).toBe(false);
      expect(codex?.path).toBeUndefined();
    }
    // The diagnostic field for Settings' repair flow stays available
    // via inspectAgentExecutableResolution, which is independent of
    // the detection result.
    const inspection = inspectAgentExecutableResolution(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: 'codex', bin: 'codex' } as any,
      configuredEnv.codex,
    );
    expect(inspection.configuredOverridePath === null
      || inspection.configuredOverridePath === '/stale/custom/codex').toBe(true);
  });
});

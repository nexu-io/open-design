import { execFile, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';
import {
  captureProcessSnapshot,
  collectProcessTreePids,
  createCommandInvocation,
  signalProcesses,
} from '@open-design/platform';
import type { RuntimeExecOptions } from './types.js';

const execFileP = promisify(execFile);

// How long a timed-out probe waits for the process table before it is killed
// anyway. Bounds the extra settle time when the Windows CIM query is slow.
const PROBE_TREE_SNAPSHOT_BUDGET_MS = 5_000;

// Agent probes (model-list / version / help / auth-status) are short read-only
// metadata calls that never need the caller's project files. Default them to a
// neutral working directory instead of inheriting the daemon process cwd.
//
// This matters because some agent CLIs are bun-based (OpenCode) and run a
// `bun install` on startup in their cwd to set up local plugins. When the daemon
// is launched from a pnpm workspace (e.g. a dev checkout), inheriting that cwd
// let an `opencode models` probe drop a workspace `bun.lock` + `node_modules/.bun`
// over the repo, wiping its pnpm store and breaking `next dev`. A probe writing a
// stray lockfile under the OS temp dir is harmless. Actual agent runs spawn
// elsewhere with an explicit project cwd and are unaffected.
export function execAgentFile(
  command: string,
  args: string[],
  options: RuntimeExecOptions = {},
) {
  const invocation = createCommandInvocation(
    options.env
      ? {
          command,
          args,
          env: options.env,
        }
      : {
          command,
          args,
        },
  );
  const { timeout, ...execOptions } = options;
  const pending = execFileP(invocation.command, invocation.args, {
    // `timeout` alone is not a settle guarantee. execFile only *signals* on
    // expiry, and the promise settles on 'close' — which needs the child to
    // actually exit. A CLI that traps SIGTERM therefore leaves a probe pending
    // forever, and callers that await one before a Run can start park with it.
    // These are read-only metadata probes, so there is nothing to flush: kill
    // them outright. Listed before the spread so a caller can still choose.
    killSignal: 'SIGKILL',
    ...execOptions,
    cwd: options.cwd ?? os.tmpdir(),
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
  if (typeof timeout === 'number' && timeout > 0) {
    killProbeTreeAtDeadline(pending.child, timeout, execOptions.killSignal ?? 'SIGKILL');
  }
  return pending;
}

/**
 * A probe's deadline covers every process it started, not only its direct
 * child. npm installs agent CLIs on Windows as `.cmd` shims, so the direct
 * child is cmd.exe and the CLI runs beneath it; killing only cmd.exe (what
 * execFile's own `timeout` does) leaves a hung CLI running with no parent, one
 * more on every detection pass (#9347). The tree is read while the root is
 * still alive, because an orphan can no longer be reached from it afterwards.
 */
function killProbeTreeAtDeadline(
  child: ChildProcess,
  timeoutMs: number,
  killSignal: NodeJS.Signals | number,
): void {
  const timer = setTimeout(() => {
    void (async () => {
      let descendants: number[] = [];
      try {
        const snapshot = await captureProcessSnapshot({ timeoutMs: PROBE_TREE_SNAPSHOT_BUDGET_MS });
        // A root that exited during the read may already have a reused PID.
        if (child.exitCode === null && child.signalCode === null) {
          descendants = collectProcessTreePids(snapshot, [child.pid]).filter((pid) => pid !== child.pid);
        }
      } catch {
        // Without a process table only the direct child is known to be ours.
      }
      // Same steps as execFile's own timeout, so the rejection keeps its shape
      // and the probe settles even if a descendant still holds the pipes.
      child.stdout?.destroy();
      child.stderr?.destroy();
      try {
        child.kill(killSignal);
      } catch {
        // Only an invalid caller-supplied signal throws here.
      }
      try {
        signalProcesses(descendants, 'SIGKILL');
      } catch {
        // A descendant we may not signal (EPERM) is left as it was before.
      }
    })();
  }, timeoutMs);
  const clear = () => clearTimeout(timer);
  child.once('close', clear);
  child.once('error', clear);
}

import { execFile } from 'node:child_process';
import { isAbortedOperationError } from './aborted-error.js';

import {
  collectProcessTreePids,
  createCommandInvocation,
  listProcessSnapshots,
  stopProcesses,
} from '@open-design/platform';

import {
  agentCliEnvForAgent,
  readAppConfigSync,
} from '../app-config.js';
import { spawnEnvForAgent } from '../runtimes/env.js';
import {
  applyAgentLaunchEnv,
  resolveAgentLaunch,
} from '../runtimes/launch.js';
import { getAgentDef } from '../runtimes/registry.js';

/**
 * A failed Vela command still carries meaning on stdout.
 *
 * `vela image gen --json` prints the complete task object — including its
 * structured `error` block — and only then exits non-zero. Rejecting with the
 * bare exec error therefore threw away the one thing that distinguishes a
 * content-safety rejection from a provider outage, leaving every caller with
 * nothing but "Command failed with exit code 1".
 *
 * The stdout is attached to the rejection rather than resolved, so the command
 * still fails and no caller can mistake a failure for success; readers that
 * want the structured detail opt in through `velaCommandStdout`.
 */
function withCommandStdout(error: unknown, stdout: string): unknown {
  if (!stdout || typeof error !== 'object' || error === null) return error;
  try {
    (error as { stdout?: string }).stdout = stdout;
  } catch {
    // A frozen or exotic error object must not turn a command failure into a
    // different, more confusing failure.
  }
  return error;
}

/**
 * Read the stdout captured by `withCommandStdout` off a rejected Vela command.
 * Returns an empty string when the failure carried none (a crash before any
 * output, or a non-object rejection).
 */
export function velaCommandStdout(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const stdout = (error as { stdout?: unknown }).stdout;
  return typeof stdout === 'string' ? stdout : '';
}

export interface VelaCommandOptions {
  env?: NodeJS.ProcessEnv;
  configuredEnv?: Record<string, string>;
  maxBuffer?: number;
  /**
   * Terminate the child process tree when it exceeds this wall-clock budget.
   * Rejection happens only after termination is confirmed, so callers cannot
   * release a materialization lock while the old process may still be writing.
   */
  timeoutMs?: number;
  /** Optional caller cancellation with the same confirmed-termination rule. */
  signal?: AbortSignal;
  /** Grace for each of SIGTERM and SIGKILL confirmation. Defaults to 500ms. */
  terminationGraceMs?: number;
  /**
   * Observe buffered stderr after the child exits. The stdout return contract
   * stays unchanged; observer failures never affect command completion.
   */
  onStderr?: (stderr: string) => void;
  /** Optional bytes written to the child stdin before it is closed. */
  input?: string | Buffer;
}

type VelaTerminationReason = 'abort' | 'timeout';

const DEFAULT_TERMINATION_GRACE_MS = 500;

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function commandTerminationError(
  reason: VelaTerminationReason,
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined,
): Error {
  if (reason === 'abort') {
    const error = new Error('vela command aborted', {
      cause: signal?.reason,
    });
    error.name = 'AbortError';
    Object.assign(error, { code: 'ABORT_ERR' });
    return error;
  }
  const error = new Error(`vela command timed out after ${timeoutMs}ms`);
  error.name = 'TimeoutError';
  Object.assign(error, { code: 'ETIMEDOUT' });
  return error;
}

function logCommandTermination(
  phase: 'completed' | 'failed' | 'scheduled' | 'unconfirmed',
  detail: {
    reason: VelaTerminationReason;
    timeoutMs?: number | undefined;
    childPid?: number | undefined;
    forcedPids?: number[] | undefined;
    remainingPids?: number[] | undefined;
    error?: unknown;
  },
): void {
  const fields = [
    `phase=${phase}`,
    `reason=${detail.reason}`,
    `timeoutMs=${detail.timeoutMs ?? 'none'}`,
    `childPid=${detail.childPid ?? 'unknown'}`,
    `forced=${detail.forcedPids?.length ?? 0}`,
    `remaining=${detail.remainingPids?.length ?? 0}`,
  ];
  if (detail.error != null) {
    fields.push(
      `error=${detail.error instanceof Error ? detail.error.name : 'unknown'}`,
    );
  }
  console.warn(`[od] vela_command_termination ${fields.join(' ')}`);
}

export function velaWorkspaceCommandOptions(
  workspaceId: string | null | undefined,
): VelaCommandOptions {
  const requestedWorkspaceId = workspaceId?.trim();
  return {
    configuredEnv: {
      VELA_INVOCATION_SOURCE: 'open-design',
      ...(requestedWorkspaceId
        ? { VELA_WORKSPACE_ID: requestedWorkspaceId }
        : {}),
    },
  };
}

function configuredAmrEnv(
  env: NodeJS.ProcessEnv,
  explicit: Record<string, string> = {},
): Record<string, string> {
  let stored: Record<string, string> = {};
  const dataDir = env.OD_DATA_DIR?.trim();
  if (dataDir) {
    try {
      stored = agentCliEnvForAgent(readAppConfigSync(dataDir).agentCliEnv, 'amr');
    } catch {
      // An unreadable app config must not hide a valid inherited or packaged
      // Vela installation; the command will use the normal resolver fallback.
    }
  }
  const inheritedVelaBin = env.VELA_BIN?.trim();
  return {
    ...(inheritedVelaBin ? { VELA_BIN: inheritedVelaBin } : {}),
    // Settings-backed agent CLI configuration follows the same precedence as
    // login and AMR launches: it overrides the inherited shell environment.
    ...stored,
    ...explicit,
  };
}

/**
 * Run the same resolved Vela binary and environment used by OpenDesign login
 * and AMR agent launches. Resource/team/collab adapters must use this instead
 * of spawning a PATH-only `vela` process, otherwise a packaged login can
 * succeed while the collaboration command uses a different or missing CLI.
 */
export function runVelaCommand(
  args: string[],
  options: VelaCommandOptions = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const configuredEnv = configuredAmrEnv(env, options.configuredEnv);
  const def = getAgentDef('amr');
  if (!def) {
    return Promise.reject(new Error('AMR runtime definition is missing'));
  }
  const launch = resolveAgentLaunch(def, configuredEnv);
  const bin = launch.launchPath ?? launch.selectedPath;
  if (!bin) {
    return Promise.reject(
      new Error('vela binary not found; install vela or configure VELA_BIN'),
    );
  }
  const childEnv = applyAgentLaunchEnv(
    spawnEnvForAgent('amr', env, configuredEnv),
    launch,
  );
  const invocation = createCommandInvocation({ command: bin, args, env: childEnv });
  const timeoutMs = positiveInteger(options.timeoutMs);
  const terminationGraceMs =
    positiveInteger(options.terminationGraceMs) ?? DEFAULT_TERMINATION_GRACE_MS;
  if (options.signal?.aborted) {
    return Promise.reject(
      commandTerminationError('abort', timeoutMs, options.signal),
    );
  }
  return new Promise<string>((resolve, reject) => {
    let childPid: number | undefined;
    let settled = false;
    let terminating = false;
    let deadlineTimer: NodeJS.Timeout | undefined;
    let abortListener: (() => void) | undefined;

    const clearTriggers = (): void => {
      if (deadlineTimer) {
        clearTimeout(deadlineTimer);
        deadlineTimer = undefined;
      }
      if (abortListener && options.signal) {
        options.signal.removeEventListener('abort', abortListener);
        abortListener = undefined;
      }
    };

    const settle = (
      outcome: { stdout: string } | { error: unknown },
    ): void => {
      if (settled) return;
      settled = true;
      clearTriggers();
      if ('error' in outcome) reject(outcome.error);
      else resolve(outcome.stdout);
    };

    const terminate = (reason: VelaTerminationReason): void => {
      if (settled || terminating) return;
      terminating = true;
      clearTriggers();
      logCommandTermination('scheduled', {
        reason,
        timeoutMs,
        childPid,
      });
      if (childPid == null) {
        // Releasing the caller's lock without a PID would allow another pull
        // to write concurrently with a process whose termination is unknown.
        logCommandTermination('unconfirmed', {
          reason,
          timeoutMs,
        });
        return;
      }
      void (async () => {
        const processTree = collectProcessTreePids(
          await listProcessSnapshots(),
          [childPid],
        );
        const result = await stopProcesses(processTree, {
          termGraceMs: terminationGraceMs,
          killGraceMs: terminationGraceMs,
        });
        if (result.remainingPids.length > 0) {
          logCommandTermination('unconfirmed', {
            reason,
            timeoutMs,
            childPid,
            forcedPids: result.forcedPids,
            remainingPids: result.remainingPids,
          });
          return;
        }
        logCommandTermination('completed', {
          reason,
          timeoutMs,
          childPid,
          forcedPids: result.forcedPids,
          remainingPids: result.remainingPids,
        });
        settle({
          error: commandTerminationError(reason, timeoutMs, options.signal),
        });
      })().catch((error: unknown) => {
        // Do not settle: without confirmed termination the caller must retain
        // its per-project lock rather than permit overlapping disk writes.
        logCommandTermination('failed', {
          reason,
          timeoutMs,
          childPid,
          error,
        });
      });
    };

    const child = execFile(
      invocation.command,
      invocation.args,
      {
        env: childEnv,
        encoding: 'utf8',
        maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
        windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      },
      (error, stdout, stderr) => {
        if (terminating) return;
        if (stderr && options.onStderr) {
          try {
            options.onStderr(stderr);
          } catch {
            // Diagnostics are observational and must never change transport.
          }
        }
        if (error) settle({ error: withCommandStdout(error, stdout) });
        else settle({ stdout });
      },
    );
    childPid = child.pid;
    if (options.input !== undefined && child.stdin) {
      // The exec callback remains the command's completion authority. Ignore a
      // redundant stream error here (for example EPIPE after an early CLI
      // validation failure) so it cannot become an unhandled EventEmitter
      // error while the callback reports the actual process result.
      child.stdin.on('error', () => undefined);
      child.stdin.end(options.input);
    }
    if (settled) return;

    if (options.signal) {
      abortListener = () => terminate('abort');
      options.signal.addEventListener('abort', abortListener, { once: true });
      if (options.signal.aborted) {
        terminate('abort');
        return;
      }
    }
    if (timeoutMs !== undefined) {
      deadlineTimer = setTimeout(() => terminate('timeout'), timeoutMs);
      deadlineTimer.unref();
    }
  });
}

// Re-exported so the vela-facing name stays available to callers that already
// think in terms of vela commands; the implementation carries no dependencies.
export { isAbortedOperationError as isAbortedVelaCommandError };

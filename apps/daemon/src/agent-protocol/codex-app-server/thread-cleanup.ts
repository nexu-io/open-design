import { spawn } from 'node:child_process';
import { captureProcessSnapshot, collectProcessTreePids, isProcessAlive, selectOwnedProcessTree,
  signalProcesses, stopProcesses, type ProcessSnapshot } from '@open-design/platform';
import type { CodexClosedThreadCleanup } from './session.js';

/** Same measured compatibility floor used by the live session's archive path. */
export function codexHistoryCapabilities(userAgent: unknown): { paginated: boolean; legacy: boolean } {
  const version = typeof userAgent === 'string'
    ? /^[^/\s]+\/(\d+)\.(\d+)\.(\d+)(?:\s|$)/u.exec(userAgent) : null;
  if (!version) return { paginated: false, legacy: false };
  const [, major, minor, patch] = version;
  return {
    paginated: Number(major) > 0 || Number(minor) >= 146,
    legacy: Number(major) > 0 || Number(minor) > 153
      || (Number(minor) === 153 && Number(patch) >= 4),
  };
}

export interface CodexThreadCleanupOptions {
  receipt: CodexClosedThreadCleanup | null;
  /** The original resolved app-server invocation, including platform wrapper arguments. */
  command: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  windowsVerbatimArguments?: boolean;
}

export type CodexThreadCleanupResult =
  // RPC success only. false means late/unobserved descendants are not proven gone.
  | { status: 'archived'; treeVerified?: false }
  | { status: 'skipped'; reason: 'no-owned-closed-thread' | 'unverified-writer-lock' }
  | { status: 'failed'; message: string; remainingPids?: number[]; treeVerified?: boolean };

const CLEANUP_BUDGET_MS = 1_500;

/**
 * Best-effort cleanup after the original writer has closed. This process never
 * loads/resumes a thread: archive itself arbitrates any other active writer.
 * The caller reports failures separately and must not delay run finalization.
 */
export async function cleanupClosedCodexThread(opts: CodexThreadCleanupOptions): Promise<CodexThreadCleanupResult> {
  const receipt = opts.receipt;
  if (!receipt) return { status: 'skipped', reason: 'no-owned-closed-thread' };

  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(opts.command, [...opts.args], {
        cwd: opts.cwd, env: opts.env, stdio: ['pipe', 'pipe', 'pipe'], shell: false,
        detached: process.platform !== 'win32',
        windowsVerbatimArguments: opts.windowsVerbatimArguments,
      });
    } catch (error) {
      resolve({ status: 'failed', message: String(error) });
      return;
    }
    let result: CodexThreadCleanupResult | undefined;
    let buffer = '';
    let awaiting: 'initialize' | 'ownership' | 'archive' | null = 'initialize';
    let knownProcesses: ProcessSnapshot[] = [];
    let terminating = false;
    let settled = false;
    let closed = false;
    let closeObserved!: () => void;
    const closePromise = new Promise<void>(done => { closeObserved = done; });
    function settle(): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result ?? { status: 'failed', message: 'codex thread cleanup exited before acknowledgement' });
    }
    const originalAlive = () => child.exitCode === null && child.signalCode === null;
    const timer = setTimeout(() => {
      result = { status: 'failed', message: 'codex thread cleanup timed out' };
      awaiting = null;
      if (process.platform === 'win32') {
        void terminateWindowsTree();
      } else void terminatePosixGroup();
    }, CLEANUP_BUDGET_MS);

    async function terminatePosixGroup(): Promise<void> {
      if (terminating) return;
      terminating = true;
      try {
        // Only this spawned group is proven owned. A detached descendant can
        // retain our pipes without belonging to that group.
        if (child.pid) signalProcesses([-child.pid], 'SIGKILL');
        else child.kill('SIGKILL');
      } catch (error) {
        result = { status: 'failed', message: `codex thread cleanup timed out; ${String(error)}` };
      }
      let closeTimer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([closePromise, new Promise<void>(done => { closeTimer = setTimeout(done, 200); })]);
      clearTimeout(closeTimer);
      if (!closed) {
        child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy();
        result = { status: 'failed',
          message: 'codex thread cleanup timed out; inherited stdio remained open; descendant ownership is unverified',
          treeVerified: false,
          remainingPids: originalAlive() && child.pid && isProcessAlive(child.pid) ? [child.pid] : [] };
      }
      settle();
    }

    async function captureOwnedTree(): Promise<ProcessSnapshot[]> {
      const snapshot = await captureProcessSnapshot({ timeoutMs: 500 });
      // The ChildProcess exit state fences the root identity across the async
      // query. A PID from a later snapshot alone is never ownership proof.
      if (knownProcesses.length === 0 && originalAlive()) {
        const root = snapshot.find(entry => entry.pid === child.pid
          && Number.isSafeInteger(entry.startedAtMs) && entry.startedAtMs! > 0);
        if (root) knownProcesses = [root];
      }
      const selected = selectOwnedProcessTree(knownProcesses, snapshot);
      const structural = collectProcessTreePids(snapshot, selected.map(entry => entry.pid));
      if (structural.some(pid => !selected.some(entry => entry.pid === pid))) {
        throw new Error('codex cleanup descendant generation is unverified');
      }
      if (!knownProcesses.length) throw new Error('codex cleanup process ownership is unverified');
      knownProcesses = selected;
      return selected;
    }

    async function terminateWindowsTree(archiveAcknowledged = false): Promise<void> {
      if (terminating) return;
      terminating = true;
      // The RPC and owned wrapper have already completed. Remaining work has
      // its own bounded snapshot/stop calls; do not replace the acknowledged
      // archive with a late protocol timer.
      if (archiveAcknowledged) clearTimeout(timer);
      let treeVerified = false;
      let failure = '';
      let remainingPids: number[] = [];
      try {
        const owned = await captureOwnedTree();
        treeVerified = true;
        const stopped = await stopProcesses(owned.map(entry => entry.pid), { termGraceMs: 0, killGraceMs: 200 });
        remainingPids = stopped.remainingPids;
      } catch (error) {
        failure = `; ${String(error)}`;
        remainingPids = knownProcesses.map(entry => entry.pid).filter(isProcessAlive);
      } finally {
        // This actual child is owned even if enumeration failed. Do not let a
        // missing snapshot turn into a leaked wrapper or an endless close wait.
        if (originalAlive()) {
          try { child.kill('SIGKILL'); } catch (error) { failure += `; ${String(error)}`; }
        }
        let closeTimer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([closePromise, new Promise<void>(done => { closeTimer = setTimeout(done, 200); })]);
        clearTimeout(closeTimer);
        if (!closed) {
          child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy();
          treeVerified = false;
        }
        if (originalAlive() && child.pid) remainingPids.push(child.pid);
        remainingPids = [...new Set(remainingPids)].filter(isProcessAlive);
        if (archiveAcknowledged && !failure && remainingPids.length === 0) {
          // Reaping the previously observed set cannot prove that the exited
          // wrapper created no later, detached stdio-ignore descendants.
          result = { status: 'archived', treeVerified: false };
        } else {
          const message = archiveAcknowledged
            ? 'codex thread archive acknowledged; process cleanup failed'
            : 'codex thread cleanup timed out';
          result = { status: 'failed', message: `${message}${failure}`, remainingPids, treeVerified };
        }
        settle();
      }
    }

    function finish(value: CodexThreadCleanupResult): void {
      if (result) return;
      result = value;
      awaiting = null;
      child.stdin?.end();
    }
    function write(frame: Record<string, unknown>): void {
      try {
        child.stdin?.write(`${JSON.stringify(frame)}\n`, (error) => {
          if (error) finish({ status: 'failed', message: error.message });
        });
      } catch (error) { finish({ status: 'failed', message: String(error) }); }
    }
    child.on('error', (error) => finish({ status: 'failed', message: error.message }));
    child.stdin?.on('error', (error) => finish({ status: 'failed', message: error.message }));
    // Drain stderr so a chatty CLI cannot fill its pipe; do not expose its environment.
    child.stderr?.resume();
    child.once('close', (code, signal) => {
      closed = true;
      closeObserved();
      result ??= { status: 'failed', message: `codex thread cleanup exited before acknowledgement (${code ?? signal})` };
      if (!terminating && process.platform === 'win32' && result.status === 'archived') {
        void terminateWindowsTree(true);
      } else if (!terminating) settle();
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      if (!awaiting) return;
      buffer += chunk.toString();
      if (buffer.length > 1_048_576) {
        finish({ status: 'failed', message: 'codex thread cleanup response exceeded budget' });
        return;
      }
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        let frame: Record<string, unknown>;
        try {
          const value: unknown = JSON.parse(line);
          if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
          frame = value as Record<string, unknown>;
        } catch { continue; }
        if (!awaiting || awaiting === 'ownership' || frame.id !== (awaiting === 'initialize' ? 1 : 2)) continue;
        if (frame.error !== undefined) {
          finish({ status: 'failed', message: `codex thread cleanup ${awaiting}: ${JSON.stringify(frame.error)}` });
          continue;
        }
        if (!frame.result || typeof frame.result !== 'object' || Array.isArray(frame.result)) {
          finish({ status: 'failed', message: `codex thread cleanup ${awaiting}: invalid response` });
          continue;
        }
        if (awaiting === 'initialize') {
          const capabilities = codexHistoryCapabilities((frame.result as Record<string, unknown>).userAgent);
          if (!capabilities[receipt.historyMode]) {
            finish({ status: 'skipped', reason: 'unverified-writer-lock' });
            continue;
          }
          const archive = () => {
            if (!awaiting || terminating || settled) return;
            write({ jsonrpc: '2.0', method: 'initialized', params: {} });
            awaiting = 'archive';
            write({ jsonrpc: '2.0', id: 2, method: 'thread/archive', params: { threadId: receipt.threadId } });
          };
          if (process.platform === 'win32') {
            awaiting = 'ownership';
            void captureOwnedTree().then(archive, error => {
              finish({ status: 'failed', message: String(error), treeVerified: false });
            });
          } else archive();
        } else finish({ status: 'archived' });
      }
    });
    write({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      clientInfo: { name: 'open-design', title: 'Open Design', version: '0.0.0' },
      capabilities: { experimentalApi: true, requestAttestation: false },
    } });
  });
}

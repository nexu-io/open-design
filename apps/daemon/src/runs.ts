// @ts-nocheck
import { randomUUID } from 'node:crypto';

export const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

// Tool names (case-insensitive) that MAY mutate the worktree. Bash is
// included because a Bash run that writes via shell (mv/cp/redirect)
// losing marker provenance is worse than a Bash-reads-only run getting
// a false-positive marker. Lowercase here because adapters disagree:
// claude-stream emits "Bash", pi-rpc emits "bash".
const FILE_WRITE_TOOL_NAMES = new Set(['write', 'edit', 'multiedit', 'notebookedit', 'bash']);

function toolUseNameFromEvent(event: string, data: any): string | null {
  if (!data) return null;
  // Direct emit (some test paths and internal call sites):
  //   emit(run, 'tool_use', { id, name, input })
  if (event === 'tool_use' && typeof data.name === 'string') return data.name;
  // Production agent-event wrapper (server.ts send('agent', ev), where
  // ev is the typed adapter event including { type: 'tool_use', name }):
  if (event === 'agent' && data.type === 'tool_use' && typeof data.name === 'string') return data.name;
  return null;
}

function readString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extractErrorDetails(data) {
  const payload = data && typeof data === 'object' ? data : {};
  const nested = payload.error && typeof payload.error === 'object' ? payload.error : {};
  return {
    error: readString(nested.message) ?? readString(payload.message),
    errorCode: readString(nested.code) ?? readString(payload.code),
  };
}

export function createChatRunService({
  createSseResponse,
  createSseErrorPayload,
  maxEvents = 2_000,
  ttlMs = 30 * 60 * 1000,
  shutdownGraceMs = 3_000,
}) {
  const runs = new Map();

  // Optional fire-and-forget hook fired when a run reaches a terminal
  // state via finish(). Used by the history feature (#1241) to record
  // a revision when the working tree is dirty at run end. The hook's
  // Promise is intentionally not awaited from finish() — finish()'s
  // contract is synchronous (closes SSE clients, schedules cleanup)
  // and a slow or failing hook must not block that path. BUT the
  // promise is tracked in `pendingFinishHooks` so shutdownActive() can
  // await pending hooks before the daemon exits — otherwise a SIGTERM
  // during a run can race the auto-commit and drop the revision row.
  let runFinishedHook = null;

  /**
   * Pending finish-hook promises. Each finish() call that fires a
   * hook adds the promise here and removes it on settle. shutdownActive()
   * awaits all of them so the process doesn't exit mid-write.
   */
  const pendingFinishHooks = new Set();

  /**
   * Register a callback to run after every run.finish(). Pass null to
   * detach. Single-slot — subsequent calls overwrite.
   */
  const setRunFinishedHook = (hook) => {
    runFinishedHook = hook;
  };

  const create = (meta = {}) => {
    const now = Date.now();
    const run = {
      id: randomUUID(),
      projectId: typeof meta.projectId === 'string' && meta.projectId ? meta.projectId : null,
      conversationId: typeof meta.conversationId === 'string' && meta.conversationId ? meta.conversationId : null,
      assistantMessageId: typeof meta.assistantMessageId === 'string' && meta.assistantMessageId ? meta.assistantMessageId : null,
      clientRequestId: typeof meta.clientRequestId === 'string' && meta.clientRequestId ? meta.clientRequestId : null,
      agentId: typeof meta.agentId === 'string' && meta.agentId ? meta.agentId : null,
      // Plan §3.A1 / spec §11.5. The applied plugin snapshot id pins
      // every prompt fragment and tool gate to a frozen view so replay
      // is byte-equal across plugin upgrades. Runs are in-memory in
      // v1 — the id lives on the run object plus on the
      // `applied_plugin_snapshots` row (FK back via run_id).
      appliedPluginSnapshotId:
        typeof meta.appliedPluginSnapshotId === 'string' && meta.appliedPluginSnapshotId
          ? meta.appliedPluginSnapshotId
          : null,
      pluginId:
        typeof meta.pluginId === 'string' && meta.pluginId ? meta.pluginId : null,
      // Resolved Identity for the user/context that initiated this run.
      // Populated by callers from `req.identity` (set by the identity
      // middleware). Stored on the run so it remains available across
      // the async run lifecycle (message upsert, post-run history
      // commit), which outlives the HTTP request.
      identity: meta.identity && typeof meta.identity === 'object' ? meta.identity : null,
      // User prompt that initiated this run. Captured at create time
      // so the post-run history commit hook can derive a commit
      // message from it without re-querying the messages table at
      // commit-time (which would race with concurrent runs on the
      // same conversation).
      message: typeof meta.message === 'string' ? meta.message : null,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      events: [],
      nextEventId: 1,
      clients: new Set(),
      waiters: new Set(),
      child: null,
      acpSession: null,
      exitCode: null,
      signal: null,
      error: null,
      errorCode: null,
      cancelRequested: false,
      touchedFiles: false,
    };
    runs.set(run.id, run);
    return run;
  };

  const get = (id) => runs.get(id) ?? null;

  const scheduleCleanup = (run) => {
    setTimeout(() => {
      if (TERMINAL_RUN_STATUSES.has(run.status)) runs.delete(run.id);
    }, ttlMs).unref?.();
  };

  const emit = (run, event, data) => {
    if (event === 'error') {
      const details = extractErrorDetails(data);
      if (details.error) run.error = details.error;
      if (details.errorCode) run.errorCode = details.errorCode;
    }
    const toolName = toolUseNameFromEvent(event, data);
    if (toolName && FILE_WRITE_TOOL_NAMES.has(toolName.toLowerCase())) {
      run.touchedFiles = true;
    }
    const id = run.nextEventId++;
    const record = { id, event, data, timestamp: Date.now() };
    run.events.push(record);
    if (run.events.length > maxEvents) run.events.splice(0, run.events.length - maxEvents);
    run.updatedAt = Date.now();
    for (const sse of run.clients) sse.send(event, data, id);
    return record;
  };

  const statusBody = (run) => ({
    id: run.id,
    projectId: run.projectId,
    conversationId: run.conversationId,
    assistantMessageId: run.assistantMessageId,
    agentId: run.agentId,
    appliedPluginSnapshotId: run.appliedPluginSnapshotId ?? null,
    pluginId: run.pluginId ?? null,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    exitCode: run.exitCode,
    signal: run.signal,
    error: run.error ?? null,
    errorCode: run.errorCode ?? null,
  });

  const finish = (run, status, code: number | null = null, signal: string | null = null) => {
    if (TERMINAL_RUN_STATUSES.has(run.status)) return;
    run.status = status;
    run.exitCode = code;
    run.signal = signal;
    run.updatedAt = Date.now();
    emit(run, 'end', { code, signal, status });
    for (const sse of run.clients) sse.end();
    run.clients.clear();
    for (const waiter of run.waiters) waiter(statusBody(run));
    run.waiters.clear();
    scheduleCleanup(run);
    // Fire-but-track — the history feature uses this to commit any
    // dirty working-tree changes the run produced. Errors are logged
    // by the hook itself; finish()'s contract stays synchronous so
    // late callers (cleanup, status polling) aren't blocked on git.
    // The promise is added to pendingFinishHooks so shutdownActive()
    // can wait for in-flight hooks before the daemon exits — without
    // this tracking, a SIGTERM mid-hook drops the revision row.
    if (runFinishedHook) {
      const hookPromise = Promise.resolve(runFinishedHook(run, status)).catch((err) => {
        console.warn(`[runs] finished hook failed for run ${run.id}:`, err);
      });
      pendingFinishHooks.add(hookPromise);
      hookPromise.finally(() => pendingFinishHooks.delete(hookPromise));
    }
  };

  const fail = (run, code, message, init = {}) => {
    emit(run, 'error', createSseErrorPayload(code, message, init));
    finish(run, 'failed', 1, null);
  };

  const start = (run, starter) => {
    void starter(run).catch((err) => {
      fail(run, 'AGENT_EXECUTION_FAILED', err instanceof Error ? err.message : String(err));
    });
    return run;
  };

  const stream = (run, req, res) => {
    const sse = createSseResponse(res);
    const lastEventId = Number(req.get('Last-Event-ID') || req.query.after || 0);
    let sent = 0;
    for (const record of run.events) {
      if (!Number.isFinite(lastEventId) || record.id > lastEventId) {
        sse.send(record.event, record.data, record.id);
        sent++;
      }
    }
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      // Guarantee a reattaching client sees a terminal signal even if its
      // cursor is at or past the final event id — otherwise the SSE
      // stream ends silently and the client falls back to status-only fetch.
      if (sent === 0 && run.events.length > 0) {
        const last = run.events[run.events.length - 1];
        sse.send(last.event, last.data, last.id);
      }
      sse.end();
      return;
    }
    run.clients.add(sse);
    res.on('close', () => {
      run.clients.delete(sse);
      sse.cleanup();
    });
  };

  const list = ({ projectId, conversationId, status } = {}) => Array.from(runs.values()).filter((run) => {
    if (typeof projectId === 'string' && projectId && run.projectId !== projectId) return false;
    if (typeof conversationId === 'string' && conversationId && run.conversationId !== conversationId) return false;
    if (status === 'active') return !TERMINAL_RUN_STATUSES.has(run.status);
    if (typeof status === 'string' && status) return run.status === status;
    return true;
  });

  const waitForChildExit = (child, timeoutMs) => {
    if (!child) return Promise.resolve(true);
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const done = (exited) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.off?.('close', onClose);
        child.off?.('exit', onClose);
        resolve(exited);
      };
      const onClose = () => done(true);
      const timer = setTimeout(() => done(false), timeoutMs);
      timer.unref?.();
      child.once?.('close', onClose);
      child.once?.('exit', onClose);
    });
  };

  const killChild = (run, signal) => {
    if (!run.child || run.child.exitCode !== null || run.child.signalCode !== null) return false;
    try {
      return run.child.kill(signal);
    } catch {
      return false;
    }
  };

  const cancel = (run) => {
    if (!TERMINAL_RUN_STATUSES.has(run.status)) {
      run.cancelRequested = true;
      run.updatedAt = Date.now();
      // Prefer RPC-level abort for agents that support it (pi, ACP adapters).
      // abort() sends the graceful shutdown signal; cancel() owns the
      // SIGTERM fallback so that a misbehaving session can't leave the
      // child alive indefinitely.
      if (run.acpSession?.abort) {
        run.acpSession.abort();
        const graceMs = Number(process.env.PI_ABORT_GRACE_MS) || 3000;
        setTimeout(() => {
          if (run.child && !run.child.killed) run.child.kill('SIGTERM');
        }, graceMs).unref();
      } else if (run.child && !run.child.killed) {
        run.child.kill('SIGTERM');
      } else {
        finish(run, 'canceled', null, 'SIGTERM');
      }
    }
  };

  const shutdownActive = async ({ graceMs = shutdownGraceMs } = {}) => {
    const activeRuns = Array.from(runs.values()).filter((run) => !TERMINAL_RUN_STATUSES.has(run.status));
    await Promise.all(activeRuns.map(async (run) => {
      run.cancelRequested = true;
      run.updatedAt = Date.now();
      if (run.acpSession?.abort) {
        try {
          run.acpSession.abort();
        } catch {
          // Process signals below are the shutdown fallback.
        }
      }
      killChild(run, 'SIGTERM');
      // Wait for the child to fully exit BEFORE calling finish() —
      // finish() fires the runFinishedHook, which (in the history
      // feature) does `git status / add / commit` against the
      // worktree. If finish() ran before the child exit completed,
      // a child handling SIGTERM gracefully (flushing files to
      // disk) could write its last changes AFTER the hook's
      // git-status snapshot, leaving those files uncommitted and
      // dropping the final auto-commit. Reordering ensures the
      // worktree is in its final, post-child-exit state when the
      // hook reads it.
      if (run.child && !(await waitForChildExit(run.child, graceMs))) {
        killChild(run, 'SIGKILL');
        await waitForChildExit(run.child, 500);
      }
      finish(run, 'canceled', null, 'SIGTERM');
    }));

    // Wait for any in-flight finish-hooks before returning, so the
    // daemon doesn't `process.exit()` mid-write. The hooks run
    // independently of the run's child-process lifecycle (they were
    // fired synchronously by `finish()` above but execute async — the
    // history auto-commit does multiple git invocations + a SQLite
    // write), and without this await the SIGTERM path is racy with
    // the revision-row insert.
    //
    // We cap the wait at 2× graceMs so a stuck hook doesn't hang
    // shutdown indefinitely. The cap is generous: graceMs is sized
    // for the slowest child to exit, and the hook is typically
    // faster (no LLM round-trip, just local fs + sqlite).
    if (pendingFinishHooks.size > 0) {
      const inflight = Array.from(pendingFinishHooks);
      const hookGraceMs = Math.max(graceMs * 2, 1000);
      let timeoutHandle;
      const timeoutPromise = new Promise((resolve) => {
        timeoutHandle = setTimeout(resolve, hookGraceMs);
      });
      await Promise.race([Promise.allSettled(inflight), timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (pendingFinishHooks.size > 0) {
        console.warn(
          `[runs] shutdownActive returning with ${pendingFinishHooks.size} finish-hook(s) still in flight after ${hookGraceMs}ms grace; their writes may be lost.`,
        );
      }
    }
  };

  const wait = (run) => {
    if (TERMINAL_RUN_STATUSES.has(run.status)) return Promise.resolve(statusBody(run));
    return new Promise((resolve) => run.waiters.add(resolve));
  };

  return {
    create,
    start,
    get,
    list,
    stream,
    cancel,
    shutdownActive,
    wait,
    emit,
    finish,
    fail,
    statusBody,
    setRunFinishedHook,
    isTerminal(status) {
      return TERMINAL_RUN_STATUSES.has(status);
    },
  };
}

// @ts-nocheck
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeMediaExecutionPolicyForRun } from '../media/policy.js';
import {
  normalizeRunToolBundleForRun,
  summarizeRunToolBundle,
} from '../run-tool-bundle.js';
import { createRunLifecycleTracer } from '../run-lifecycle-tracer.js';
import { projectWorkspaceProvenance } from '../workspace-contract.js';

export const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

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
  // Absolute directory under which per-run event JSONL logs are written
  // (one file per run at <runsLogDir>/<runId>/events.jsonl). When null,
  // event persistence is disabled and statusBody.eventsLogPath = null —
  // legacy behavior. The path is surfaced through MCP get_run so an
  // external coding agent can `tail` the file in its own shell during
  // a long OD generation, instead of polling blindly and giving up.
  runsLogDir = null,
}) {
  const runs = new Map();

  const create = (meta = {}) => {
    const now = Date.now();
    const id = randomUUID();
    const run = {
      id,
      projectId: typeof meta.projectId === 'string' && meta.projectId ? meta.projectId : null,
      conversationId: typeof meta.conversationId === 'string' && meta.conversationId ? meta.conversationId : null,
      assistantMessageId: typeof meta.assistantMessageId === 'string' && meta.assistantMessageId ? meta.assistantMessageId : null,
      clientRequestId: typeof meta.clientRequestId === 'string' && meta.clientRequestId ? meta.clientRequestId : null,
      agentId: typeof meta.agentId === 'string' && meta.agentId ? meta.agentId : null,
      projectMetadata:
        meta.projectMetadata && typeof meta.projectMetadata === 'object' && !Array.isArray(meta.projectMetadata)
          ? meta.projectMetadata
          : null,
      workspace: projectWorkspaceProvenance(meta.projectMetadata),
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
      mediaExecution: normalizeMediaExecutionPolicyForRun(meta.mediaExecution),
      toolBundle: normalizeRunToolBundleForRun(meta.toolBundle),
      browserUse: meta.browserUse && typeof meta.browserUse === 'object' ? meta.browserUse : null,
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      events: [],
      nextEventId: 1,
      clients: new Set(),
      waiters: new Set(),
      child: null,
      acpSession: null,
      childPid: null,
      processGroupId: null,
      childExitObservedAt: null,
      exitCode: null,
      signal: null,
      error: null,
      errorCode: null,
      cancelRequested: false,
      retryRestartTimer: null,
      stdinOpen: false,
      eventsLogPath: runsLogDir ? path.join(runsLogDir, id, 'events.jsonl') : null,
      eventsLogStream: null,
      // Set once finish() has closed the log stream, so a late post-finish emit
      // can't lazily re-open a stream nothing will ever close (FD leak).
      eventsLogClosed: false,
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

  // Lazily open the per-run event log on first emit. The directory may
  // not exist yet; mkdir is recursive so it's safe to call repeatedly.
  // Disk failures are best-effort — if we can't write, the run still
  // proceeds (SSE clients keep getting events from memory).
  const ensureLogStream = (run) => {
    if (!run.eventsLogPath) return null;
    if (run.eventsLogStream) return run.eventsLogStream;
    // finish() has already closed + nulled this run's log stream. Re-opening it
    // here for a late event (async child-close diagnostic, trailing tool
    // callback, telemetry) would leak a file descriptor that nothing ever
    // closes. We gate on the explicit `eventsLogClosed` flag — NOT on terminal
    // status — so finish()'s own `end` emit (which runs while status is already
    // terminal but before the stream is closed) can still open + write + close
    // the log for a run that had no prior events. Late events still reach
    // memory + SSE clients below; we just stop persisting them to the closed
    // log. (#3408 P1 FD-leak fix; cf. #4163.)
    if (run.eventsLogClosed) return null;
    try {
      fs.mkdirSync(path.dirname(run.eventsLogPath), { recursive: true });
      run.eventsLogStream = fs.createWriteStream(run.eventsLogPath, { flags: 'a' });
      // Don't crash the daemon on a stream-level error; just stop
      // trying to use this stream so subsequent emits silently skip.
      run.eventsLogStream.on('error', () => {
        try { run.eventsLogStream?.destroy(); } catch { /* ignore */ }
        run.eventsLogStream = null;
      });
      return run.eventsLogStream;
    } catch {
      return null;
    }
  };

  const emit = (run, event, data) => {
    if (event === 'error') {
      const details = extractErrorDetails(data);
      if (details.error) run.error = details.error;
      if (details.errorCode) run.errorCode = details.errorCode;
    }
    const id = run.nextEventId++;
    const record = { id, event, data, timestamp: Date.now() };
    run.events.push(record);
    if (run.events.length > maxEvents) run.events.splice(0, run.events.length - maxEvents);
    run.updatedAt = Date.now();
    const stream = ensureLogStream(run);
    if (stream) {
      try {
        stream.write(JSON.stringify(record) + '\n');
      } catch {
        // Stream-level write errors are caught by the on('error') above;
        // swallowing here keeps the SSE fan-out below from being skipped.
      }
    }
    for (const sse of run.clients) sse.send(event, data, id);
    return record;
  };

  const statusBody = (run) => ({
    id: run.id,
    projectId: run.projectId,
    conversationId: run.conversationId,
    assistantMessageId: run.assistantMessageId,
    agentId: run.agentId,
    designSystemId: run.designSystemId ?? null,
    designSystemRequestedId: run.designSystemRequestedId ?? null,
    designSystemSelectionSource: run.designSystemSelectionSource ?? null,
    designSystemDigest: run.designSystemDigest ?? null,
    appliedPluginSnapshotId: run.appliedPluginSnapshotId ?? null,
    pluginId: run.pluginId ?? null,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    cancelRequested: !!run.cancelRequested,
    childPid: typeof run.child?.pid === 'number' ? run.child.pid : run.childPid ?? null,
    processGroupId: run.processGroupId ?? null,
    childExited: !run.child || run.child.exitCode !== null || run.child.signalCode !== null,
    childExitObservedAt: run.childExitObservedAt ?? null,
    exitCode: run.exitCode,
    signal: run.signal,
    error: run.error ?? null,
    errorCode: run.errorCode ?? null,
    resumable: run.resumable ?? false,
    eventsLogPath: run.eventsLogPath ?? null,
    workspace: run.workspace ?? projectWorkspaceProvenance(run.projectMetadata),
    mediaExecution: run.mediaExecution ?? normalizeMediaExecutionPolicyForRun(null),
    toolBundle: summarizeRunToolBundle(run.toolBundle),
    ...(run.promptCache ? { promptCache: run.promptCache } : {}),
    ...(run.browserUse ? { browserUse: run.browserUse } : {}),
  });

  const finish = (run, status, code: number | null = null, signal: string | null = null) => {
    if (TERMINAL_RUN_STATUSES.has(run.status)) return;
    run.status = status;
    run.exitCode = code;
    run.signal = signal;
    run.updatedAt = Date.now();
    emit(run, 'end', { code, signal, status, resumable: run.resumable ?? false });
    for (const sse of run.clients) sse.end();
    run.clients.clear();
    for (const waiter of run.waiters) waiter(statusBody(run));
    run.waiters.clear();
    // Close the event log stream now that no more events will be
    // emitted for this run. The file stays on disk for tail/grep.
    try { run.eventsLogStream?.end(); } catch { /* ignore */ }
    run.eventsLogStream = null;
    // Any event emitted after this point must not lazily re-open the log.
    run.eventsLogClosed = true;
    scheduleCleanup(run);
  };

  const fail = (run, code, message, init = {}) => {
    emit(run, 'error', createSseErrorPayload(code, message, init));
    finish(run, 'failed', 1, null);
  };

  const start = (run, starter) => {
    createRunLifecycleTracer(run).mark('start_requested');
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

  const childHasExited = (child) => !child || child.exitCode !== null || child.signalCode !== null;

  const recordChildExitObserved = (run) => {
    if (!run.childExitObservedAt) run.childExitObservedAt = Date.now();
  };

  const waitForChildExit = (child, timeoutMs) => {
    if (!child) return Promise.resolve(true);
    if (childHasExited(child)) return Promise.resolve(true);
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

  const forceWaitMs = () => {
    const raw = Number(process.env.OD_CHAT_RUN_CANCEL_FORCE_WAIT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 500;
  };

  const killChild = (run, signal) => {
    if (!run.child || childHasExited(run.child)) return false;
    if (process.platform !== 'win32' && Number.isInteger(run.processGroupId)) {
      try {
        process.kill(-run.processGroupId, signal);
        return true;
      } catch (err) {
        if (err?.code !== 'ESRCH') {
          // Fall through to the direct child signal path below. This keeps
          // cancellation working if the child was not spawned as a process
          // group leader for any reason.
        }
      }
    }
    try {
      return run.child.kill(signal);
    } catch {
      return false;
    }
  };

  const cancelGraceMs = () => {
    const raw = Number(process.env.OD_CHAT_RUN_CANCEL_GRACE_MS || process.env.OD_CHAT_RUN_SHUTDOWN_GRACE_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : 3000;
  };

  const finishCanceledFromChildState = (run, fallbackSignal = 'SIGTERM') => {
    const child = run.child;
    if (childHasExited(child)) recordChildExitObserved(run);
    finish(
      run,
      'canceled',
      child?.exitCode ?? null,
      child?.signalCode ?? fallbackSignal,
    );
    return statusBody(run);
  };

  const closeRunStdin = (run) => {
    if (!run?.stdinOpen) return;
    const stdin = run.child?.stdin;
    if (stdin && !stdin.destroyed) {
      try {
        stdin.end();
      } catch {
        // Best-effort: cancellation still falls back to process signals below.
      }
    }
    run.stdinOpen = false;
  };

  // A same-run retry can be waiting out its backoff window (server.ts
  // scheduleRetryRestart). Cancellation/shutdown must drop that pending restart
  // so a cancelled run is not resurrected after the timer fires.
  const clearPendingRetryRestart = (run) => {
    if (run?.retryRestartTimer) {
      clearTimeout(run.retryRestartTimer);
      run.retryRestartTimer = null;
    }
  };

  const cancel = async (run) => {
    if (TERMINAL_RUN_STATUSES.has(run.status)) return statusBody(run);
    run.cancelRequested = true;
    run.updatedAt = Date.now();
    clearPendingRetryRestart(run);
    closeRunStdin(run);
    if (!run.child) {
      finish(run, 'canceled', null, 'SIGTERM');
      return statusBody(run);
    }

    // Prefer RPC-level abort for agents that support it (pi, ACP adapters).
    // If the adapter does not exit within its grace window, fall back to
    // process signals and finally SIGKILL the process group.
    if (run.acpSession?.abort) {
      try {
        run.acpSession.abort();
      } catch {
        // Signal fallback below owns eventual process termination.
      }
      const graceMs = Number(process.env.PI_ABORT_GRACE_MS) || 3000;
      if (await waitForChildExit(run.child, graceMs)) {
        return finishCanceledFromChildState(run, 'SIGTERM');
      }
      killChild(run, 'SIGTERM');
      if (await waitForChildExit(run.child, graceMs)) {
        return finishCanceledFromChildState(run, 'SIGTERM');
      }
      killChild(run, 'SIGKILL');
      await waitForChildExit(run.child, forceWaitMs());
      return finishCanceledFromChildState(run, 'SIGKILL');
    }

    killChild(run, 'SIGTERM');
    if (await waitForChildExit(run.child, cancelGraceMs())) {
      return finishCanceledFromChildState(run, 'SIGTERM');
    }
    killChild(run, 'SIGKILL');
    await waitForChildExit(run.child, forceWaitMs());
    return finishCanceledFromChildState(run, 'SIGKILL');
  };

  const shutdownActive = async ({ graceMs = shutdownGraceMs } = {}) => {
    const activeRuns = Array.from(runs.values()).filter((run) => !TERMINAL_RUN_STATUSES.has(run.status));
    await Promise.all(activeRuns.map(async (run) => {
      run.cancelRequested = true;
      run.updatedAt = Date.now();
      clearPendingRetryRestart(run);
      closeRunStdin(run);
      if (run.acpSession?.abort) {
        try {
          run.acpSession.abort();
        } catch {
          // Process signals below are the shutdown fallback.
        }
      }
      killChild(run, 'SIGTERM');
      finish(run, 'canceled', null, 'SIGTERM');
      if (run.child && !(await waitForChildExit(run.child, graceMs))) {
        killChild(run, 'SIGKILL');
        await waitForChildExit(run.child, 500);
      }
    }));
  };

  const wait = (run) => {
    if (TERMINAL_RUN_STATUSES.has(run.status)) return Promise.resolve(statusBody(run));
    return new Promise((resolve) => run.waiters.add(resolve));
  };

  // Drop a run from the in-memory registry without emitting any terminal
  // event. Used by callers that prepared a run optimistically (created the
  // record before some external precondition was checked) and need to undo
  // the create without surfacing the run via `/api/runs`. Only valid before
  // the run reaches a terminal status — terminal runs use scheduleCleanup
  // and would already have notified any subscribers.
  const drop = (run) => {
    if (!run) return;
    if (TERMINAL_RUN_STATUSES.has(run.status)) return;
    runs.delete(run.id);
    for (const sse of run.clients) {
      try { sse.end(); } catch { /* best-effort detach */ }
    }
    run.clients.clear();
    // Resolve any pending waiters with a synthetic "canceled" status so
    // they unblock instead of hanging forever — the run is being dropped
    // because nothing will ever start.
    run.status = 'canceled';
    run.updatedAt = Date.now();
    for (const waiter of run.waiters) waiter(statusBody(run));
    run.waiters.clear();
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
    drop,
    signalChild: killChild,
    statusBody,
    isTerminal(status) {
      return TERMINAL_RUN_STATUSES.has(status);
    },
  };
}

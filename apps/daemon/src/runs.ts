// @ts-nocheck
import { randomUUID } from 'node:crypto';

export const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);
const MAX_FANOUT_OUTPUT_TEXT_CHARS = 300_000;

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

function textFromRunEvent(event, data) {
  if (event === 'stdout') {
    return typeof data?.chunk === 'string' ? data.chunk : '';
  }
  if (event !== 'agent') return '';
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';
  if (data.type === 'text_delta' && typeof data.delta === 'string') return data.delta;
  if (data.kind === 'text' && typeof data.text === 'string') return data.text;
  if (typeof data.content === 'string') return data.content;
  return '';
}

function outputTextFromEvents(events = []) {
  let out = '';
  for (const record of events) {
    out += textFromRunEvent(record.event, record.data);
    if (out.length > MAX_FANOUT_OUTPUT_TEXT_CHARS) {
      return out.slice(0, MAX_FANOUT_OUTPUT_TEXT_CHARS);
    }
  }
  return out;
}

export function createChatRunService({
  createSseResponse,
  createSseErrorPayload,
  maxEvents = 2_000,
  ttlMs = 30 * 60 * 1000,
  shutdownGraceMs = 3_000,
  fanoutPersistence = null,
}) {
  const runs = new Map();
  // Optional SQLite persistence for fan-out. When provided, every
  // create/finish/setWinner call mirrors to the fanout_runs table so
  // the Compare tab survives a daemon restart even after the in-memory
  // TTL has dropped the run. The persistence layer swallows errors so
  // a flaky DB never aborts a run.
  const fanout = fanoutPersistence;

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
      // Multi-CLI fan-out: every sibling run carries the same id so the
      // web Compare view can group them. The daemon never generates this
      // value itself; it is supplied by the client (or `od fanout`).
      fanoutGroupId:
        typeof meta.fanoutGroupId === 'string' && meta.fanoutGroupId
          ? meta.fanoutGroupId
          : null,
      // Compare view "winner" picker — set when the user marks one
      // sibling as the chosen output. Kept on the run so it survives
      // restart of the Compare list as long as the run itself is still
      // in the in-memory store. v1 storage; promote to SQLite when
      // persistence demands it.
      winner: false,
      // First line of the brief, captured at create time so the Compare
      // group header can show what the user asked without re-fetching
      // events. Kept verbatim — no token estimation, no PII redaction
      // (the brief is user-supplied content visible in their own UI).
      brief:
        typeof meta.currentPrompt === 'string' && meta.currentPrompt
          ? meta.currentPrompt.slice(0, 240)
          : typeof meta.message === 'string' && meta.message
            ? meta.message.slice(0, 240)
            : '',
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
    };
    runs.set(run.id, run);
    if (fanout && run.fanoutGroupId) {
      fanout.upsert({
        id: run.id,
        fanoutGroupId: run.fanoutGroupId,
        projectId: run.projectId,
        conversationId: run.conversationId,
        agentId: run.agentId,
        status: run.status,
        brief: run.brief,
        winner: false,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        error: null,
        outputText: null,
      });
    }
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
    const id = run.nextEventId++;
    const record = { id, event, data, timestamp: Date.now() };
    run.events.push(record);
    if (run.events.length > maxEvents) run.events.splice(0, run.events.length - maxEvents);
    run.updatedAt = Date.now();
    for (const sse of run.clients) sse.send(event, data, id);
    return record;
  };

  const statusBody = (run, options = {}) => {
    const includeOutputText =
      options && typeof options === 'object' && options.includeOutputText === true;
    return {
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
      fanoutGroupId: run.fanoutGroupId ?? null,
      winner: run.winner === true,
      preRunStashHash: run.preRunStashHash ?? null,
      ...(includeOutputText ? { outputText: outputTextFromEvents(run.events) || null } : {}),
    };
  };

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
    if (fanout && run.fanoutGroupId) {
      fanout.updateStatus(
        run.id,
        status,
        run.updatedAt,
        run.error ?? null,
        outputTextFromEvents(run.events) || null,
      );
    }
    scheduleCleanup(run);
  };

  const fail = (run, code, message, init = {}) => {
    emit(run, 'error', createSseErrorPayload(code, message, init));
    finish(run, 'failed', 1, null);
  };

  // Snapshot the project's working tree just before a run starts. Uses
  // `git stash create` (non-destructive — creates a commit object
  // without touching HEAD or the working tree) so the user can recover
  // the pre-run state with `git stash apply <hash>`. We tag the run
  // record with that hash + the post-run HEAD sha so the Compare view
  // / chat thread can offer one-click rollback.
  const snapshotProjectPreRun = async (run) => {
    if (!run.projectId) return;
    try {
      const path = await import('node:path');
      const childProcess = await import('node:child_process');
      const fs = await import('node:fs/promises');
      const projectDir = path.join(
        process.env.OD_DATA_DIR || `${process.env.HOME ?? ''}/Projects/open-design/.od`,
        'projects',
        run.projectId,
      );
      // Bail when the project folder isn't a git repo — internal-use
      // projects often aren't versioned. Snapshots are best-effort.
      try {
        await fs.access(path.join(projectDir, '.git'));
      } catch {
        return;
      }
      const stashHash = await new Promise<string | null>((resolve) => {
        const proc = childProcess.spawn('git', ['stash', 'create'], { cwd: projectDir });
        let out = '';
        proc.stdout?.on('data', (d) => { out += d.toString(); });
        proc.on('close', (code) => resolve(code === 0 && out.trim() ? out.trim() : null));
        proc.on('error', () => resolve(null));
      });
      if (stashHash) {
        run.preRunStashHash = stashHash;
      }
    } catch {
      /* snapshots never abort runs */
    }
  };

  const start = (run, starter) => {
    void snapshotProjectPreRun(run);
    void starter(run).catch((err) => {
      fail(run, 'AGENT_EXECUTION_FAILED', err instanceof Error ? err.message : String(err));
    });
    return run;
  };

  const stream = (run, req, res) => {
    const sse = createSseResponse(res);
    const lastEventId = Number(req.get('Last-Event-ID') || req.query.after || 0);
    for (const record of run.events) {
      if (!Number.isFinite(lastEventId) || record.id > lastEventId) {
        sse.send(record.event, record.data, record.id);
      }
    }
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      sse.end();
      return;
    }
    run.clients.add(sse);
    res.on('close', () => {
      run.clients.delete(sse);
      sse.cleanup();
    });
  };

  const list = ({ projectId, conversationId, status, fanoutGroupId } = {}) => Array.from(runs.values()).filter((run) => {
    if (typeof projectId === 'string' && projectId && run.projectId !== projectId) return false;
    if (typeof conversationId === 'string' && conversationId && run.conversationId !== conversationId) return false;
    if (typeof fanoutGroupId === 'string' && fanoutGroupId && run.fanoutGroupId !== fanoutGroupId) return false;
    if (status === 'active') return !TERMINAL_RUN_STATUSES.has(run.status);
    if (typeof status === 'string' && status) return run.status === status;
    return true;
  });

  // Compare view feeder. Buckets every run that carries a fanoutGroupId,
  // ordered by latest activity descending, siblings ordered by createdAt
  // ascending so the leftmost card is the agent the user picked first.
  // Returns up to `limit` groups (default 50).
  //
  // Persistence: in-memory groups win when present (carry live `events`,
  // streaming state). DB-only groups are folded in for older history
  // that's aged past the in-memory TTL. The merge is keyed by
  // fanoutGroupId so a live group never gets a stale DB shadow.
  const listFanoutGroups = ({ limit = 50 } = {}) => {
    const byGroup = new Map();
    for (const run of runs.values()) {
      if (!run.fanoutGroupId) continue;
      let bucket = byGroup.get(run.fanoutGroupId);
      if (!bucket) {
        bucket = { fanoutGroupId: run.fanoutGroupId, runs: [] };
        byGroup.set(run.fanoutGroupId, bucket);
      }
      bucket.runs.push(run);
    }
    const fromMemory = Array.from(byGroup.values()).map(({ fanoutGroupId, runs: siblings }) => {
      const sorted = [...siblings].sort((a, b) => a.createdAt - b.createdAt);
      const createdAt = sorted[0]?.createdAt ?? 0;
      const updatedAt = sorted.reduce((acc, r) => Math.max(acc, r.updatedAt), 0);
      const winner = sorted.find((r) => r.winner === true);
      return {
        fanoutGroupId,
        brief: sorted[0]?.brief ?? '',
        createdAt,
        updatedAt,
        runs: sorted.map((run) => statusBody(run, { includeOutputText: true })),
        winnerRunId: winner ? winner.id : null,
      };
    });
    if (!fanout) {
      return fromMemory.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
    }
    // Fold in DB-backed groups not already in memory. The DB rows carry
    // status snapshots only — no events — but the Compare card's live
    // tail (reattachDaemonRun) handles the gap when a run is still
    // running and has just dropped from memory.
    const memIds = new Set(fromMemory.map((g) => g.fanoutGroupId));
    const fromDb = fanout.listGroups(limit * 2).filter((g) => !memIds.has(g.fanoutGroupId));
    const dbHydrated = fromDb.map((g) => ({
      fanoutGroupId: g.fanoutGroupId,
      brief: g.brief,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      winnerRunId: g.winnerRunId,
      runs: g.runs.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        conversationId: r.conversationId,
        assistantMessageId: null,
        agentId: r.agentId,
        appliedPluginSnapshotId: null,
        pluginId: null,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        exitCode: null,
        signal: null,
        error: r.error,
        errorCode: null,
        fanoutGroupId: r.fanoutGroupId,
        winner: r.winner,
        outputText: r.outputText,
      })),
    }));
    return [...fromMemory, ...dbHydrated]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  };

  // Mark exactly one sibling as the winner inside a fan-out group. Other
  // siblings in the same group have their `winner` flag cleared so the
  // UI's "⭐ This one" toggle stays single-select per group.
  const setWinner = (runId) => {
    const target = runs.get(runId);
    if (!target || !target.fanoutGroupId) {
      // Memory miss — try DB-backed persistence. The runs may have
      // aged out of the in-memory map but the user is still viewing
      // them in the Compare tab.
      if (fanout) {
        const groups = fanout.listGroups(200);
        for (const g of groups) {
          if (g.runs.some((r) => r.id === runId)) {
            fanout.setWinner(runId, g.fanoutGroupId);
            return {
              id: runId,
              fanoutGroupId: g.fanoutGroupId,
              status: g.runs.find((r) => r.id === runId)?.status ?? 'unknown',
              winner: true,
            };
          }
        }
      }
      return null;
    }
    for (const run of runs.values()) {
      if (run.fanoutGroupId === target.fanoutGroupId) {
        run.winner = run.id === runId;
        run.updatedAt = Date.now();
      }
    }
    if (fanout) fanout.setWinner(runId, target.fanoutGroupId);
    return statusBody(target);
  };

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

  return {
    create,
    start,
    get,
    list,
    listFanoutGroups,
    setWinner,
    stream,
    cancel,
    shutdownActive,
    wait,
    emit,
    finish,
    fail,
    statusBody,
    isTerminal(status) {
      return TERMINAL_RUN_STATUSES.has(status);
    },
  };
}

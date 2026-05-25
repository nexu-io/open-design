import { randomUUID } from 'node:crypto';

export const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

interface RunMeta {
  projectId?: string | null;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  clientRequestId?: string | null;
  agentId?: string | null;
  appliedPluginSnapshotId?: string | null;
  pluginId?: string | null;
}

interface RunRecord {
  id: string;
  projectId: string | null;
  conversationId: string | null;
  assistantMessageId: string | null;
  clientRequestId: string | null;
  agentId: string | null;
  appliedPluginSnapshotId: string | null;
  pluginId: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
  events: SseEvent[];
  nextEventId: number;
  clients: Set<SseClient>;
  waiters: Set<(status: RunStatusBody) => void>;
  child: ChildProcess | null;
  acpSession: AcpSession | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error: string | null;
  errorCode: string | null;
  cancelRequested: boolean;
}

interface SseEvent {
  id: number;
  event: string;
  data: unknown;
  timestamp: number;
}

interface SseClient {
  send(event: string, data: unknown, id: number): void;
  end(): void;
  cleanup(): void;
}

interface AcpSession {
  abort?(): void;
}

interface ChildProcess {
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  killed: boolean;
  kill(signal?: number | string): boolean;
  once?(event: string, listener: () => void): void;
  off?(event: string, listener: () => void): void;
}

interface ChatRunServiceDeps {
  createSseResponse(res: unknown): SseClient;
  createSseErrorPayload(code: string, message: string, init?: Record<string, unknown>): unknown;
  maxEvents?: number;
  ttlMs?: number;
  shutdownGraceMs?: number;
}

interface RunStatusBody {
  id: string;
  projectId: string | null;
  conversationId: string | null;
  assistantMessageId: string | null;
  agentId: string | null;
  appliedPluginSnapshotId: string | null;
  pluginId: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error: string | null;
  errorCode: string | null;
}

interface ChatRunService {
  create(meta?: RunMeta): RunRecord;
  start(run: RunRecord, starter: (run: RunRecord) => Promise<void>): RunRecord;
  get(id: string): RunRecord | null;
  list(filter?: { projectId?: unknown; conversationId?: unknown; status?: unknown }): RunRecord[];
  stream(run: RunRecord, req: { get(name: string): string | undefined; query: Record<string, unknown> }, res: unknown): void;
  cancel(run: RunRecord): void;
  shutdownActive(opts?: { graceMs?: number }): Promise<void>;
  wait(run: RunRecord): Promise<RunStatusBody>;
  emit(run: RunRecord, event: string, data: unknown): SseEvent;
  finish(run: RunRecord, status: string, code?: number | null, signal?: string | null): void;
  fail(run: RunRecord, code: string, message: string, init?: Record<string, unknown>): void;
  statusBody(run: RunRecord): RunStatusBody;
  isTerminal(status: string): boolean;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extractErrorDetails(data: unknown): { error: string | null; errorCode: string | null } {
  const payload = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const nested = payload.error && typeof payload.error === 'object' ? (payload.error as Record<string, unknown>) : {};
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
}: ChatRunServiceDeps): ChatRunService {
  const runs = new Map<string, RunRecord>();

  const create = (meta: RunMeta = {}): RunRecord => {
    const now = Date.now();
    const run: RunRecord = {
      id: randomUUID(),
      projectId: typeof meta.projectId === 'string' && meta.projectId ? meta.projectId : null,
      conversationId: typeof meta.conversationId === 'string' && meta.conversationId ? meta.conversationId : null,
      assistantMessageId: typeof meta.assistantMessageId === 'string' && meta.assistantMessageId ? meta.assistantMessageId : null,
      clientRequestId: typeof meta.clientRequestId === 'string' && meta.clientRequestId ? meta.clientRequestId : null,
      agentId: typeof meta.agentId === 'string' && meta.agentId ? meta.agentId : null,
      appliedPluginSnapshotId:
        typeof meta.appliedPluginSnapshotId === 'string' && meta.appliedPluginSnapshotId
          ? meta.appliedPluginSnapshotId
          : null,
      pluginId:
        typeof meta.pluginId === 'string' && meta.pluginId ? meta.pluginId : null,
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
    return run;
  };

  const get = (id: string): RunRecord | null => runs.get(id) ?? null;

  const scheduleCleanup = (run: RunRecord): void => {
    setTimeout(() => {
      if (TERMINAL_RUN_STATUSES.has(run.status)) runs.delete(run.id);
    }, ttlMs).unref?.();
  };

  const emit = (run: RunRecord, event: string, data: unknown): SseEvent => {
    if (event === 'error') {
      const details = extractErrorDetails(data);
      if (details.error) run.error = details.error;
      if (details.errorCode) run.errorCode = details.errorCode;
    }
    const id = run.nextEventId++;
    const record: SseEvent = { id, event, data, timestamp: Date.now() };
    run.events.push(record);
    if (run.events.length > maxEvents) run.events.splice(0, run.events.length - maxEvents);
    run.updatedAt = Date.now();
    for (const sse of run.clients) sse.send(event, data, id);
    return record;
  };

  const statusBody = (run: RunRecord): RunStatusBody => ({
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

  const finish = (run: RunRecord, status: string, code: number | null = null, signal: NodeJS.Signals | null = null): void => {
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
  };

  const fail = (run: RunRecord, code: string, message: string, init: Record<string, unknown> = {}): void => {
    emit(run, 'error', createSseErrorPayload(code, message, init));
    finish(run, 'failed', 1, null);
  };

  const start = (run: RunRecord, starter: (run: RunRecord) => Promise<void>): RunRecord => {
    void starter(run).catch((err: unknown) => {
      fail(run, 'AGENT_EXECUTION_FAILED', err instanceof Error ? err.message : String(err));
    });
    return run;
  };

  const stream = (run: RunRecord, req: { get(name: string): string | undefined; query: Record<string, unknown> }, res: unknown): void => {
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
    (res as { on(event: string, cb: () => void): void }).on('close', () => {
      run.clients.delete(sse);
      sse.cleanup();
    });
  };

  const list = ({ projectId, conversationId, status }: {
    projectId?: unknown;
    conversationId?: unknown;
    status?: unknown;
  } = {}): RunRecord[] => Array.from(runs.values()).filter((run) => {
    if (typeof projectId === 'string' && projectId && run.projectId !== projectId) return false;
    if (typeof conversationId === 'string' && conversationId && run.conversationId !== conversationId) return false;
    if (status === 'active') return !TERMINAL_RUN_STATUSES.has(run.status);
    if (typeof status === 'string' && status) return run.status === status;
    return true;
  });

  const waitForChildExit = (child: ChildProcess | null, timeoutMs: number): Promise<boolean> => {
    if (!child) return Promise.resolve(true);
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const done = (exited: boolean) => {
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

  const killChild = (run: RunRecord, signal: string): boolean => {
    if (!run.child || run.child.exitCode !== null || run.child.signalCode !== null) return false;
    try {
      return run.child.kill(signal);
    } catch {
      return false;
    }
  };

  const cancel = (run: RunRecord): void => {
    if (!TERMINAL_RUN_STATUSES.has(run.status)) {
      run.cancelRequested = true;
      run.updatedAt = Date.now();
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

  const shutdownActive = async ({ graceMs = shutdownGraceMs }: { graceMs?: number } = {}): Promise<void> => {
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

  const wait = (run: RunRecord): Promise<RunStatusBody> => {
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
    isTerminal(status: string): boolean {
      return TERMINAL_RUN_STATUSES.has(status);
    },
  };
}

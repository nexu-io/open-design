// Daemon heap / SQLite health observability.
//
// Contract: observation is additive and isolated. It writes only its own files
// under `<dataRoot>/diagnostics/`, emits only its own event names, never writes
// to stdout/stderr, and every hook swallows its own failures, so no business
// return value, persisted row, HTTP response, existing event or exit status can
// differ because this module exists.
//
// A daemon that dies of a V8 OOM cannot report itself, so the design is
// persist-then-report: a small checkpoint is rewritten synchronously at the
// moments that matter (boot, each sample, a read started under pressure,
// shutdown), and the NEXT boot turns the previous checkpoint — plus the Node
// fatal-error report, when V8 wrote one — into telemetry.

import { randomUUID } from 'node:crypto';
import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  constants as perfConstants,
  monitorEventLoopDelay,
  PerformanceObserver,
  type IntervalHistogram,
} from 'node:perf_hooks';
import v8 from 'node:v8';

import type { SqlitePageStats } from '../storage/db-inspect.js';

const SCHEMA_VERSION = 1;
const SAMPLE_INTERVAL_MS = 60_000;
const SUMMARY_INTERVAL_MS = 24 * 60 * 60_000;
const PENDING_REPORT_LIMIT = 5;
const TOP_READ_LIMIT = 5;
const RECENT_SAMPLE_LIMIT = 5;
const QUEUED_EVENT_LIMIT = 10;
const PRESSURE_MODE_RATIO = 0.6;
const PRESSURE_LEVELS = [
  { ratio: 0.7, kind: 'ratio_70' },
  { ratio: 0.85, kind: 'ratio_85' },
] as const;
const JUMP_BYTES = 512 * 1024 * 1024;
const JUMP_EVENT_LIMIT = 3;
const EVALUATE_MIN_INTERVAL_MS = 2_000;
const PENDING_CLEAR_DELAY_MS = 5_000;
const LOG_TAIL_BYTES = 64 * 1024;
const FATAL_REPORT_READ_LIMIT = 5;
const FATAL_REPORT_MAX_BYTES = 8 * 1024 * 1024;
const MIB = 1024 * 1024;

export type ObservedReadOp =
  | 'project_run_statuses'
  | 'conversation_messages'
  | 'library_produced_map';

export type DaemonHealthEventName =
  | 'daemon_health_summary'
  | 'daemon_unclean_exit'
  | 'daemon_memory_pressure'
  | 'daemon_storage_snapshot';

export type DaemonHealthEventSink = (event: {
  eventName: DaemonHealthEventName;
  properties: Record<string, unknown>;
  insertId: string;
}) => Promise<void>;

export type HeapSample = {
  at: number;
  heapUsed: number;
  heapLimit: number;
  totalAvailable: number;
  largeObject: number;
  oldSpace: number;
  external: number;
  arrayBuffers: number;
  malloced: number;
  rss: number;
};

type ReadRecord = {
  op: ObservedReadOp;
  rootOp: ObservedReadOp;
  durationMs: number;
  heapDelta: number;
  rows: number | null;
};

type InflightRead = {
  op: ObservedReadOp;
  rootOp: ObservedReadOp;
  startedAt: number;
  heapUsed: number;
};

type Peaks = {
  heapUsedRatio: number;
  heapUsed: number;
  largeObject: number;
  rss: number;
  external: number;
  eventLoopDelayMaxMs: number;
  eventLoopDelayP99Ms: number;
  majorGcCount: number;
  gcRetainedRatioMax: number;
  sampleCount: number;
};

type PendingReport = {
  eventName: DaemonHealthEventName;
  properties: Record<string, unknown>;
  insertId: string;
};

type Checkpoint = {
  schemaVersion: typeof SCHEMA_VERSION;
  bootId: string;
  pid: number;
  startedAt: number;
  updatedAt: number;
  appVersion: string | null;
  runtime: { node: string; electron: string | null; v8: string };
  state: 'running' | 'clean_shutdown';
  exitCode: number | null;
  heapLimit: number;
  samples: HeapSample[];
  peaks: Peaks;
  topReads: ReadRecord[];
  inflight: InflightRead | null;
  storage: SqlitePageStats | null;
  pendingReports: PendingReport[];
};

export function daemonHealthPaths(dataRoot: string) {
  const directory = join(dataRoot, 'diagnostics');
  return {
    directory,
    current: join(directory, 'daemon-health.json'),
    previous: join(directory, 'daemon-health.previous.json'),
    fatalReports: join(directory, 'fatal-reports'),
  };
}

type Clock = () => number;

export type DaemonHealthOptions = {
  dataRoot: string;
  /** Rotated log of the previous daemon session, when a launcher keeps one. */
  previousLogPath?: string | null;
  now?: Clock;
  pid?: number;
  isProcessAlive?: (pid: number) => boolean;
  readHeap?: () => HeapSample;
  /** Tests disable the process-wide timers, observers and listeners. */
  instrumentProcess?: boolean;
};

export function createDaemonHealth(options: DaemonHealthOptions) {
  const now = options.now ?? Date.now;
  const pid = options.pid ?? process.pid;
  const readHeap = options.readHeap ?? readProcessHeap;
  const isAlive = options.isProcessAlive ?? processIsAlive;
  const paths = daemonHealthPaths(options.dataRoot);

  const first = safe(() => readHeap(), null);
  const checkpoint: Checkpoint = {
    schemaVersion: SCHEMA_VERSION,
    bootId: randomUUID(),
    pid,
    startedAt: now(),
    updatedAt: now(),
    appVersion: null,
    runtime: {
      node: process.versions.node,
      electron: process.versions.electron ?? null,
      v8: process.versions.v8,
    },
    state: 'running',
    exitCode: null,
    heapLimit: first?.heapLimit ?? 0,
    samples: first ? [first] : [],
    peaks: {
      heapUsedRatio: 0,
      heapUsed: 0,
      largeObject: 0,
      rss: 0,
      external: 0,
      eventLoopDelayMaxMs: 0,
      eventLoopDelayP99Ms: 0,
      majorGcCount: 0,
      gcRetainedRatioMax: 0,
      sampleCount: 0,
    },
    topReads: [],
    inflight: null,
    storage: null,
    pendingReports: [],
  };
  if (first) updatePeaks(first);

  let sink: DaemonHealthEventSink | null = null;
  const queued: PendingReport[] = [];
  let storageProbe: (() => SqlitePageStats) | null = null;
  let storageReported = false;
  let pressureMode = false;
  const emittedLevels = new Set<string>();
  let jumpEvents = 0;
  let lastEvaluated: { at: number; heapUsed: number } | null = first ? { at: now(), heapUsed: first.heapUsed } : null;
  const readStack: Array<InflightRead & { marked: boolean }> = [];
  let sampleTimer: ReturnType<typeof setInterval> | null = null;
  let summaryTimer: ReturnType<typeof setInterval> | null = null;
  let gcObserver: PerformanceObserver | null = null;
  let loopDelay: IntervalHistogram | null = null;
  let onExit: ((code: number) => void) | null = null;
  let stopped = false;

  // ---- boot: rotate, classify the previous session, persist immediately ----
  safe(() => {
    mkdirSync(paths.directory, { recursive: true });
    try {
      renameSync(paths.current, paths.previous);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }, undefined);
  const previous = safe(() => readCheckpoint(paths.previous), null);
  const previousReport = safe(() => previousSessionReport(previous), null);
  checkpoint.pendingReports = [
    ...(previous?.pendingReports ?? []),
    ...(previousReport ? [previousReport] : []),
  ].slice(-PENDING_REPORT_LIMIT);
  // Fatal reports contain the environment and command line; they are only
  // ever read here, reduced to controlled fields, and deleted.
  safe(() => rmSync(paths.fatalReports, { recursive: true, force: true }), undefined);
  persist();

  if (options.instrumentProcess !== false) instrument();

  function instrument(): void {
    safe(() => {
      sampleTimer = setInterval(() => sample(), SAMPLE_INTERVAL_MS);
      sampleTimer.unref?.();
      summaryTimer = setInterval(() => emitLiveSummary(), SUMMARY_INTERVAL_MS);
      summaryTimer.unref?.();
    }, undefined);
    safe(() => {
      loopDelay = monitorEventLoopDelay({ resolution: 20 });
      loopDelay.enable();
    }, undefined);
    safe(() => {
      gcObserver = new PerformanceObserver((list) => {
        safe(() => {
          let major = false;
          for (const entry of list.getEntries()) {
            const kind = (entry as { detail?: { kind?: number } }).detail?.kind;
            if (kind === perfConstants.NODE_PERFORMANCE_GC_MAJOR) {
              checkpoint.peaks.majorGcCount += 1;
              major = true;
            }
          }
          if (major) afterMajorGc();
        }, undefined);
      });
      gcObserver.observe({ type: 'gc' });
    }, undefined);
    safe(() => {
      onExit = (code: number) => {
        safe(() => {
          checkpoint.exitCode = typeof code === 'number' ? code : null;
          persist();
        }, undefined);
      };
      process.on('exit', onExit);
    }, undefined);
  }

  // ---- persistence ----
  function persist(): void {
    safe(() => {
      checkpoint.updatedAt = now();
      const temporary = `${paths.current}.tmp`;
      writeFileSync(temporary, JSON.stringify(checkpoint), { encoding: 'utf8', mode: 0o600 });
      renameSync(temporary, paths.current);
    }, undefined);
  }

  // ---- sampling & pressure ----
  function updatePeaks(sampleValue: HeapSample, countSample = true): void {
    const peaks = checkpoint.peaks;
    const ratio = sampleValue.heapLimit > 0 ? sampleValue.heapUsed / sampleValue.heapLimit : 0;
    peaks.heapUsedRatio = Math.max(peaks.heapUsedRatio, ratio);
    peaks.heapUsed = Math.max(peaks.heapUsed, sampleValue.heapUsed);
    peaks.largeObject = Math.max(peaks.largeObject, sampleValue.largeObject);
    peaks.rss = Math.max(peaks.rss, sampleValue.rss);
    peaks.external = Math.max(peaks.external, sampleValue.external);
    if (countSample) peaks.sampleCount += 1;
  }

  function sample(): void {
    safe(() => {
      const value = readHeap();
      checkpoint.samples = [...checkpoint.samples, value].slice(-RECENT_SAMPLE_LIMIT);
      if (value.heapLimit > 0) checkpoint.heapLimit = value.heapLimit;
      updatePeaks(value);
      foldLoopDelay();
      evaluate(value, true);
      persist();
    }, undefined);
  }

  // Short sessions end before the first 60s sample, so shutdown folds too.
  function foldLoopDelay(): void {
    if (!loopDelay || loopDelay.count === 0) return;
    checkpoint.peaks.eventLoopDelayMaxMs = Math.max(checkpoint.peaks.eventLoopDelayMaxMs, loopDelay.max / 1e6);
    checkpoint.peaks.eventLoopDelayP99Ms = Math.max(checkpoint.peaks.eventLoopDelayP99Ms, loopDelay.percentile(99) / 1e6);
    loopDelay.reset();
  }

  function afterMajorGc(): void {
    const value = readHeap();
    const ratio = value.heapLimit > 0 ? value.heapUsed / value.heapLimit : 0;
    checkpoint.peaks.gcRetainedRatioMax = Math.max(checkpoint.peaks.gcRetainedRatioMax, ratio);
    updatePeaks(value, false);
    evaluate(value, false);
  }

  function evaluate(value: HeapSample, force: boolean): void {
    const at = now();
    if (!force && lastEvaluated && at - lastEvaluated.at < EVALUATE_MIN_INTERVAL_MS) return;
    const ratio = value.heapLimit > 0 ? value.heapUsed / value.heapLimit : 0;
    const wasPressure = pressureMode;
    pressureMode = ratio >= PRESSURE_MODE_RATIO;
    const kinds: string[] = [];
    for (const level of PRESSURE_LEVELS) {
      if (ratio >= level.ratio && !emittedLevels.has(level.kind)) {
        emittedLevels.add(level.kind);
        kinds.push(level.kind);
      }
    }
    if (lastEvaluated && value.heapUsed - lastEvaluated.heapUsed >= JUMP_BYTES && jumpEvents < JUMP_EVENT_LIMIT) {
      jumpEvents += 1;
      kinds.push('jump');
    }
    const previousHeapUsed = lastEvaluated?.heapUsed ?? null;
    lastEvaluated = { at, heapUsed: value.heapUsed };
    if (kinds.length > 0) {
      refreshStorage();
      for (const kind of kinds) {
        emit('daemon_memory_pressure', {
          pressure_kind: kind,
          heap_used_ratio: round3(ratio),
          previous_heap_used_mb: previousHeapUsed == null ? undefined : mib(previousHeapUsed),
          ...sampleProperties(value),
          ...topReadPropertiesOf(checkpoint.topReads),
          ...storageProperties(checkpoint.storage),
          uptime_ms: at - checkpoint.startedAt,
        }, `${checkpoint.bootId}-pressure-${kind}-${kind === 'jump' ? jumpEvents : 1}`);
      }
    }
    if (pressureMode !== wasPressure || kinds.length > 0) persist();
  }

  function refreshStorage(): void {
    if (!storageProbe) return;
    const stats = safe(() => storageProbe!(), null);
    if (stats) checkpoint.storage = stats;
  }

  // ---- reads ----
  function beginRead(op: ObservedReadOp, mark: 'always' | 'pressure'): number {
    const record = {
      op,
      rootOp: readStack[0]?.op ?? op,
      startedAt: now(),
      heapUsed: v8.getHeapStatistics().used_heap_size,
      marked: false,
    };
    readStack.push(record);
    if (mark === 'always' || pressureMode) {
      record.marked = true;
      checkpoint.inflight = { op: record.op, rootOp: record.rootOp, startedAt: record.startedAt, heapUsed: record.heapUsed };
      persist();
    }
    return readStack.length - 1;
  }

  function endRead(index: number, rows: number | null): void {
    const record = readStack[index];
    if (!record) return;
    readStack.length = index;
    const heapAfter = v8.getHeapStatistics().used_heap_size;
    const entry: ReadRecord = {
      op: record.op,
      rootOp: record.rootOp,
      durationMs: Math.max(0, now() - record.startedAt),
      heapDelta: heapAfter - record.heapUsed,
      rows,
    };
    checkpoint.topReads = [...checkpoint.topReads, entry]
      .sort((a, b) => b.heapDelta - a.heapDelta || b.durationMs - a.durationMs)
      .slice(0, TOP_READ_LIMIT);
    if (record.marked) {
      const outer = [...readStack].reverse().find((candidate) => candidate.marked);
      checkpoint.inflight = outer
        ? { op: outer.op, rootOp: outer.rootOp, startedAt: outer.startedAt, heapUsed: outer.heapUsed }
        : null;
      persist();
    }
  }

  // ---- previous session ----
  function previousSessionReport(prior: Checkpoint | null): PendingReport | null {
    if (!prior || prior.schemaVersion !== SCHEMA_VERSION || typeof prior.bootId !== 'string') return null;
    if (prior.pid !== pid && prior.state === 'running' && isAlive(prior.pid)) return null; // another live daemon
    const unclean = prior.state !== 'clean_shutdown';
    const properties: Record<string, unknown> = {
      previous_boot_id: prior.bootId,
      previous_app_version: prior.appVersion ?? undefined,
      previous_node_version: prior.runtime?.node,
      previous_electron_version: prior.runtime?.electron ?? undefined,
      session_end: unclean ? 'unclean' : 'clean',
      uptime_ms: Math.max(0, prior.updatedAt - prior.startedAt),
      ...summaryProperties(prior),
    };
    if (!unclean) {
      return { eventName: 'daemon_health_summary', properties, insertId: `${prior.bootId}-health-summary` };
    }
    const fatal = readFatalReport(prior.pid);
    const log = readPreviousLogEvidence(prior.startedAt);
    const oom = fatal?.oom === true || log.oom;
    Object.assign(properties, {
      exit_class: oom ? 'oom' : fatal ? 'fatal_error' : prior.exitCode != null ? 'exit_code' : 'unknown',
      exit_evidence: fatal ? 'fatal_report' : log.oom ? 'log' : prior.exitCode != null ? 'exit_listener' : 'none',
      exit_code: prior.exitCode ?? undefined,
      oom_native_frame: log.nativeFrame ?? undefined,
      inflight_read_op: prior.inflight?.op,
      inflight_root_read_op: prior.inflight?.rootOp,
      inflight_read_heap_used_mb: prior.inflight ? mib(prior.inflight.heapUsed) : undefined,
      inflight_read_age_ms: prior.inflight ? Math.max(0, prior.updatedAt - prior.inflight.startedAt) : undefined,
      death_old_space_mb: fatal?.oldSpace == null ? undefined : mib(fatal.oldSpace),
      death_large_object_mb: fatal?.largeObject == null ? undefined : mib(fatal.largeObject),
      death_max_rss_mb: fatal?.maxRss == null ? undefined : mib(fatal.maxRss),
    });
    return { eventName: 'daemon_unclean_exit', properties, insertId: `${prior.bootId}-unclean-exit` };
  }

  function readFatalReport(priorPid: number) {
    let files: string[];
    try {
      files = readdirSync(paths.fatalReports).filter((name) => name.endsWith('.json')).sort().slice(-FATAL_REPORT_READ_LIMIT);
    } catch {
      return null;
    }
    for (const name of files.reverse()) {
      const report = safe(() => {
        const file = join(paths.fatalReports, name);
        if (statSync(file).size > FATAL_REPORT_MAX_BYTES) return null;
        return JSON.parse(readFileSync(file, 'utf8')) as Record<string, any>;
      }, null);
      if (!report || report.header?.processId !== priorPid) continue;
      const spaces = report.javascriptHeap?.heapSpaces ?? {};
      const event = String(report.header?.event ?? '');
      const largeObject = Object.entries(spaces)
        .filter(([space]) => space.includes('large_object_space'))
        .reduce((sum, [, space]) => sum + finiteOr((space as any)?.used, 0), 0);
      return {
        oom: report.header?.trigger === 'OOMError' || /heap out of memory/i.test(event),
        oldSpace: finiteOr(spaces.old_space?.used, null),
        largeObject,
        maxRss: finiteOr(report.resourceUsage?.maxRss, null),
      };
    }
    return null;
  }

  function readPreviousLogEvidence(priorStartedAt: number): { oom: boolean; nativeFrame: string | null } {
    const path = options.previousLogPath;
    if (!path) return { oom: false, nativeFrame: null };
    const tail = safe(() => {
      const stat = statSync(path);
      // Only the log the previous session wrote; tolerate 1s of clock skew.
      if (stat.mtimeMs < priorStartedAt - 1_000) return null;
      return readTail(path, stat.size, LOG_TAIL_BYTES);
    }, null);
    if (!tail) return { oom: false, nativeFrame: null };
    const oom = tail.includes('JavaScript heap out of memory');
    if (!oom) return { oom: false, nativeFrame: null };
    const nativeFrame = tail.includes('Statement::JS_all')
      ? 'sqlite_statement_all'
      : tail.includes('Statement::JS_iterate')
        ? 'sqlite_statement_iterate'
        : tail.includes('Statement::JS_get')
          ? 'sqlite_statement_get'
          : 'other';
    return { oom, nativeFrame };
  }

  // ---- events ----
  function emit(eventName: DaemonHealthEventName, properties: Record<string, unknown>, insertId: string): void {
    const report = { eventName, properties: withoutUndefined(properties), insertId };
    if (!sink) {
      if (queued.length < QUEUED_EVENT_LIMIT) queued.push(report);
      return;
    }
    const target = sink;
    void Promise.resolve().then(() => target(report)).catch(() => undefined);
  }

  function emitLiveSummary(): void {
    safe(() => {
      emit('daemon_health_summary', {
        previous_boot_id: checkpoint.bootId,
        previous_app_version: checkpoint.appVersion ?? undefined,
        session_end: 'running',
        uptime_ms: now() - checkpoint.startedAt,
        ...summaryProperties(checkpoint),
      }, `${checkpoint.bootId}-health-summary-${Math.floor((now() - checkpoint.startedAt) / SUMMARY_INTERVAL_MS)}`);
    }, undefined);
  }

  async function deliverPending(target: DaemonHealthEventSink): Promise<void> {
    const pending = checkpoint.pendingReports.slice();
    for (const report of pending) {
      await target({ ...report, properties: withoutUndefined(report.properties) }).catch(() => undefined);
    }
    // PostHog dedupes on $insert_id, so a crash before this clears only means
    // the same reports are offered once more on the next boot.
    const timer = setTimeout(() => {
      safe(() => {
        checkpoint.pendingReports = checkpoint.pendingReports.filter((report) => !pending.includes(report));
        persist();
      }, undefined);
    }, PENDING_CLEAR_DELAY_MS);
    timer.unref?.();
  }

  return {
    bootId: checkpoint.bootId,
    setAppVersion(version: string | null | undefined): void {
      safe(() => {
        if (typeof version === 'string' && version.length > 0 && version.length <= 64) {
          checkpoint.appVersion = version;
          persist();
        }
      }, undefined);
    },
    /** Constant-cost storage snapshot provider; reported once per boot. */
    setStorageProbe(probe: () => SqlitePageStats): void {
      safe(() => {
        storageProbe = probe;
        refreshStorage();
        persist();
        if (!storageReported && checkpoint.storage) {
          storageReported = true;
          emit('daemon_storage_snapshot', storageProperties(checkpoint.storage), `${checkpoint.bootId}-storage-snapshot`);
        }
      }, undefined);
    },
    attachSink(target: DaemonHealthEventSink): void {
      safe(() => {
        if (sink) return;
        sink = target;
        for (const report of queued.splice(0)) emit(report.eventName, report.properties, report.insertId);
        void deliverPending(target).catch(() => undefined);
      }, undefined);
    },
    /**
     * Opt this process into Node's fatal-error report, written next to the
     * checkpoint. Left untouched when any report trigger was already enabled
     * by flags, so an operator's own report configuration is never redirected.
     */
    enableFatalReports(): void {
      safe(() => {
        // `excludeNetwork` exists at runtime (Node >= 22) but not in every @types/node.
        const report = process.report as (NodeJS.ProcessReport & { excludeNetwork?: boolean }) | undefined;
        if (!report || report.reportOnFatalError || report.reportOnSignal || report.reportOnUncaughtException) return;
        mkdirSync(paths.fatalReports, { recursive: true, mode: 0o700 });
        report.directory = paths.fatalReports;
        report.excludeNetwork = true;
        report.reportOnFatalError = true;
      }, undefined);
    },
    beginRead(op: ObservedReadOp, mark: 'always' | 'pressure'): number | null {
      return safe(() => beginRead(op, mark), null);
    },
    endRead(index: number | null, rows: number | null): void {
      if (index == null) return;
      safe(() => endRead(index, rows), undefined);
    },
    sampleNow(): void {
      sample();
    },
    markCleanShutdown(): void {
      safe(() => {
        foldLoopDelay();
        checkpoint.state = 'clean_shutdown';
        checkpoint.inflight = null;
        persist();
      }, undefined);
    },
    stop(): void {
      if (stopped) return;
      stopped = true;
      safe(() => {
        if (sampleTimer) clearInterval(sampleTimer);
        if (summaryTimer) clearInterval(summaryTimer);
        gcObserver?.disconnect();
        loopDelay?.disable();
        if (onExit) process.off('exit', onExit);
      }, undefined);
    },
    /** Test-only view of the in-memory checkpoint. */
    snapshotForTests(): Checkpoint {
      return JSON.parse(JSON.stringify(checkpoint)) as Checkpoint;
    },
  };
}

export type DaemonHealth = ReturnType<typeof createDaemonHealth>;

let activeHealth: DaemonHealth | null = null;

/** One health session per daemon process; later calls return the first. */
export function beginDaemonHealthSession(options: DaemonHealthOptions): DaemonHealth | null {
  if (activeHealth) return activeHealth;
  activeHealth = safe(() => createDaemonHealth(options), null);
  return activeHealth;
}

export function getDaemonHealth(): DaemonHealth | null {
  return activeHealth;
}

/** Test-only: detach the process-wide session. */
export function resetDaemonHealthForTests(): void {
  activeHealth?.stop();
  activeHealth = null;
}

/**
 * Identity wrapper around a synchronous read: returns exactly what `read`
 * returns and rethrows exactly what it throws. Observation failures are
 * swallowed inside the session.
 */
export function observeRead<T>(
  op: ObservedReadOp,
  read: () => T,
  options: { mark?: 'always' | 'pressure'; rows?: (result: T) => number } = {},
): T {
  const health = activeHealth;
  if (!health) return read();
  const index = health.beginRead(op, options.mark ?? 'pressure');
  let result: T;
  try {
    result = read();
  } catch (error) {
    health.endRead(index, null);
    throw error;
  }
  let rows: number | null = null;
  if (options.rows) {
    try {
      const counted = options.rows(result);
      rows = Number.isSafeInteger(counted) ? counted : null;
    } catch {
      rows = null;
    }
  }
  health.endRead(index, rows);
  return result;
}

// ---- helpers ----

function readProcessHeap(): HeapSample {
  const heap = v8.getHeapStatistics();
  let largeObject = 0;
  let oldSpace = 0;
  for (const space of v8.getHeapSpaceStatistics()) {
    if (space.space_name.includes('large_object_space')) largeObject += space.space_used_size;
    if (space.space_name === 'old_space') oldSpace = space.space_used_size;
  }
  const memory = process.memoryUsage();
  return {
    at: Date.now(),
    heapUsed: heap.used_heap_size,
    heapLimit: heap.heap_size_limit,
    totalAvailable: heap.total_available_size,
    largeObject,
    oldSpace,
    external: memory.external,
    arrayBuffers: memory.arrayBuffers,
    malloced: heap.malloced_memory,
    rss: memory.rss,
  };
}

function readCheckpoint(path: string): Checkpoint | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Checkpoint;
  } catch {
    return null;
  }
}

function readTail(path: string, size: number, bytes: number): string {
  const length = Math.min(size, bytes);
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buffer, 0, length, Math.max(0, size - length));
  } finally {
    closeSync(fd);
  }
  return buffer.toString('utf8');
}

function processIsAlive(target: number): boolean {
  try {
    process.kill(target, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function summaryProperties(source: Checkpoint): Record<string, unknown> {
  const peaks = source.peaks;
  const last = source.samples?.at(-1);
  return {
    heap_limit_mb: mib(source.heapLimit),
    peak_heap_used_ratio: round3(peaks?.heapUsedRatio ?? 0),
    peak_heap_used_mb: mib(peaks?.heapUsed ?? 0),
    peak_large_object_mb: mib(peaks?.largeObject ?? 0),
    peak_rss_mb: mib(peaks?.rss ?? 0),
    peak_external_mb: mib(peaks?.external ?? 0),
    event_loop_delay_max_ms: Math.round(peaks?.eventLoopDelayMaxMs ?? 0),
    event_loop_delay_p99_max_ms: Math.round(peaks?.eventLoopDelayP99Ms ?? 0),
    major_gc_count: peaks?.majorGcCount ?? 0,
    gc_retained_ratio_max: round3(peaks?.gcRetainedRatioMax ?? 0),
    sample_count: peaks?.sampleCount ?? 0,
    last_heap_used_mb: last ? mib(last.heapUsed) : undefined,
    last_rss_mb: last ? mib(last.rss) : undefined,
    ...topReadPropertiesOf(source.topReads ?? []),
    ...storageProperties(source.storage ?? null),
  };
}

function sampleProperties(value: HeapSample): Record<string, unknown> {
  return {
    heap_limit_mb: mib(value.heapLimit),
    heap_used_mb: mib(value.heapUsed),
    heap_available_mb: mib(value.totalAvailable),
    large_object_mb: mib(value.largeObject),
    old_space_mb: mib(value.oldSpace),
    external_mb: mib(value.external),
    array_buffers_mb: mib(value.arrayBuffers),
    malloced_mb: mib(value.malloced),
    rss_mb: mib(value.rss),
  };
}

function topReadPropertiesOf(reads: ReadRecord[]): Record<string, unknown> {
  const top = reads[0];
  if (!top) return {};
  return {
    top_read_op: top.op,
    top_read_root_op: top.rootOp,
    top_read_heap_delta_mb: mib(top.heapDelta),
    top_read_duration_ms: Math.round(top.durationMs),
    top_read_rows: top.rows ?? undefined,
  };
}

function storageProperties(stats: SqlitePageStats | null): Record<string, unknown> {
  if (!stats) return {};
  return {
    db_page_size: stats.pageSize ?? undefined,
    db_page_count: stats.pageCount ?? undefined,
    db_freelist_count: stats.freelistCount ?? undefined,
    db_main_mb: stats.mainBytes == null ? undefined : mib(stats.mainBytes),
    db_wal_mb: stats.walBytes == null ? undefined : mib(stats.walBytes),
  };
}

function withoutUndefined(properties: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) if (value !== undefined) out[key] = value;
  return out;
}

function mib(bytes: number): number {
  return Math.round((bytes / MIB) * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function finiteOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safe<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    return fallback;
  }
}

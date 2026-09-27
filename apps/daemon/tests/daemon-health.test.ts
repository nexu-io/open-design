import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createDaemonHealth,
  daemonHealthPaths,
  observeRead,
  beginDaemonHealthSession,
  getDaemonHealth,
  resetDaemonHealthForTests,
  type DaemonHealthEventSink,
  type HeapSample,
} from '../src/services/daemon-health.js';

const MIB = 1024 * 1024;
const LIMIT = 4096 * MIB;

function heap(usedMib: number, extra: Partial<HeapSample> = {}): HeapSample {
  return {
    at: 0,
    heapUsed: usedMib * MIB,
    heapLimit: LIMIT,
    totalAvailable: LIMIT - usedMib * MIB,
    largeObject: 0,
    oldSpace: usedMib * MIB,
    external: 0,
    arrayBuffers: 0,
    malloced: 0,
    rss: (usedMib + 100) * MIB,
    ...extra,
  };
}

const roots: string[] = [];
function tempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'od-daemon-health-'));
  roots.push(root);
  return root;
}

function collect(): { sink: DaemonHealthEventSink; events: Array<Parameters<DaemonHealthEventSink>[0]> } {
  const events: Array<Parameters<DaemonHealthEventSink>[0]> = [];
  return { events, sink: async (event) => { events.push(event); } };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

function readCheckpoint(root: string) {
  return JSON.parse(readFileSync(daemonHealthPaths(root).current, 'utf8'));
}

afterEach(() => {
  resetDaemonHealthForTests();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('daemon health checkpoint and previous-session classification', () => {
  it('persists a running checkpoint at boot and reports a clean prior session as a summary', async () => {
    const root = tempRoot();
    let clock = 1_000;
    const first = createDaemonHealth({ dataRoot: root, now: () => clock, pid: 111, readHeap: () => heap(200), instrumentProcess: false });
    expect(readCheckpoint(root)).toMatchObject({ state: 'running', pid: 111, heapLimit: LIMIT });
    first.setAppVersion('0.24.0');
    clock = 61_000;
    first.markCleanShutdown();

    const second = createDaemonHealth({ dataRoot: root, now: () => clock, pid: 222, readHeap: () => heap(100), instrumentProcess: false, isProcessAlive: () => false });
    const { sink, events } = collect();
    second.attachSink(sink);
    await settle();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventName: 'daemon_health_summary',
      insertId: `${first.bootId}-health-summary`,
      properties: {
        previous_boot_id: first.bootId,
        previous_app_version: '0.24.0',
        session_end: 'clean',
        uptime_ms: 60_000,
        heap_limit_mb: 4096,
        peak_heap_used_mb: 200,
      },
    });
    expect(Object.values(events[0]!.properties)).not.toContain(undefined);
  });

  it('classifies an unclean exit with a fatal report as oom, reduces it to controlled fields and deletes the raw report', async () => {
    const root = tempRoot();
    const first = createDaemonHealth({ dataRoot: root, pid: 4242, readHeap: () => heap(300), instrumentProcess: false });
    // What Node writes on `reportOnFatalError`, trimmed to the fields read back.
    const reports = daemonHealthPaths(root).fatalReports;
    mkdirSync(reports, { recursive: true });
    writeFileSync(path.join(reports, 'report.20260922.1.4242.0.001.json'), JSON.stringify({
      header: { processId: 4242, trigger: 'OOMError', event: 'Allocation failed - JavaScript heap out of memory', commandLine: ['secret'] },
      javascriptHeap: { heapSpaces: { old_space: { used: 3800 * MIB }, large_object_space: { used: 60 * MIB }, new_large_object_space: { used: 4 * MIB } } },
      resourceUsage: { maxRss: 4200 * MIB },
      environmentVariables: { POSTHOG_KEY: 'phc_secret' },
    }));

    const second = createDaemonHealth({ dataRoot: root, pid: 5000, readHeap: () => heap(100), instrumentProcess: false, isProcessAlive: () => false });
    const { sink, events } = collect();
    second.attachSink(sink);
    await settle();

    expect(events[0]).toMatchObject({
      eventName: 'daemon_unclean_exit',
      insertId: `${first.bootId}-unclean-exit`,
      properties: {
        session_end: 'unclean',
        exit_class: 'oom',
        exit_evidence: 'fatal_report',
        death_old_space_mb: 3800,
        death_large_object_mb: 64,
        death_max_rss_mb: 4200,
      },
    });
    expect(JSON.stringify(events[0])).not.toContain('secret');
    expect(existsSync(reports)).toBe(false);
  });

  it('falls back to the rotated daemon log and extracts only a controlled native frame', async () => {
    const root = tempRoot();
    const log = path.join(root, 'previous.log');
    createDaemonHealth({ dataRoot: root, pid: 7, readHeap: () => heap(10), instrumentProcess: false });
    writeFileSync(log, [
      '[od] listening',
      'FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory',
      ' 7: 0x1 better_sqlite3::Statement::JS_all(v8::FunctionCallbackInfo<v8::Value> const&) [/Users/someone/secret/path]',
    ].join('\n'));

    const second = createDaemonHealth({ dataRoot: root, pid: 8, previousLogPath: log, readHeap: () => heap(10), instrumentProcess: false, isProcessAlive: () => false });
    const { sink, events } = collect();
    second.attachSink(sink);
    await settle();

    expect(events[0]?.properties).toMatchObject({ exit_class: 'oom', exit_evidence: 'log', oom_native_frame: 'sqlite_statement_all' });
    expect(JSON.stringify(events[0])).not.toContain('/Users/someone');
  });

  it('distinguishes a process.exit code from a silent death, and ignores a prior checkpoint whose daemon is still alive', async () => {
    const root = tempRoot();
    createDaemonHealth({ dataRoot: root, pid: 9, readHeap: () => heap(10), instrumentProcess: false });
    const checkpoint = readCheckpoint(root);
    writeFileSync(daemonHealthPaths(root).current, JSON.stringify({ ...checkpoint, exitCode: 1 }));
    const second = createDaemonHealth({ dataRoot: root, pid: 10, readHeap: () => heap(10), instrumentProcess: false, isProcessAlive: () => false });
    const { sink, events } = collect();
    second.attachSink(sink);
    await settle();
    expect(events[0]?.properties).toMatchObject({ exit_class: 'exit_code', exit_evidence: 'exit_listener', exit_code: 1 });

    const alive = tempRoot();
    createDaemonHealth({ dataRoot: alive, pid: 11, readHeap: () => heap(10), instrumentProcess: false });
    const concurrent = createDaemonHealth({ dataRoot: alive, pid: 12, readHeap: () => heap(10), instrumentProcess: false, isProcessAlive: () => true });
    const other = collect();
    concurrent.attachSink(other.sink);
    await settle();
    expect(other.events).toHaveLength(0);
  });

  it('carries unreported sessions forward across a crash loop, bounded to five', () => {
    const root = tempRoot();
    const boots: string[] = [];
    for (let pid = 1; pid <= 8; pid += 1) {
      // No sink is ever attached: every boot dies before reporting.
      boots.push(createDaemonHealth({ dataRoot: root, pid, readHeap: () => heap(10), instrumentProcess: false, isProcessAlive: () => false }).bootId);
    }
    const pending = readCheckpoint(root).pendingReports as Array<{ insertId: string }>;
    expect(pending.map((report) => report.insertId)).toEqual(
      boots.slice(2, 7).map((bootId) => `${bootId}-unclean-exit`),
    );
  });
});

describe('daemon memory pressure', () => {
  it('emits each ratio level once and bounds heap jumps', async () => {
    const root = tempRoot();
    let used = 1000;
    let clock = 0;
    const health = createDaemonHealth({ dataRoot: root, now: () => clock, pid: 1, readHeap: () => heap(used), instrumentProcess: false });
    const { sink, events } = collect();
    health.attachSink(sink);
    await settle();
    events.length = 0;

    for (const next of [3000, 3100, 3600, 3700]) {
      used = next;
      clock += 60_000;
      health.sampleNow();
    }
    await settle();
    const kinds = events.map((event) => event.properties.pressure_kind);
    expect(kinds).toEqual(['ratio_70', 'jump', 'ratio_85']);
    expect(events.every((event) => event.eventName === 'daemon_memory_pressure')).toBe(true);
    expect(new Set(events.map((event) => event.insertId)).size).toBe(events.length);
  });
});

describe('observeRead', () => {
  it('returns exactly the read result and rethrows exactly the read error', () => {
    const root = tempRoot();
    beginDaemonHealthSession({ dataRoot: root, readHeap: () => heap(10), instrumentProcess: false });
    const value = { rows: [1, 2, 3] };
    expect(observeRead('conversation_messages', () => value, { rows: (result) => result.rows.length })).toBe(value);
    const failure = new Error('boom');
    expect(() => observeRead('conversation_messages', () => { throw failure; })).toThrow(failure);
    // A throwing row counter must not change the result either.
    expect(observeRead('conversation_messages', () => value, { rows: () => { throw new Error('counter'); } })).toBe(value);
  });

  it('is an identity even when every observation dependency fails', () => {
    const blocker = path.join(tempRoot(), 'not-a-directory');
    writeFileSync(blocker, '');
    beginDaemonHealthSession({
      dataRoot: blocker,
      readHeap: () => { throw new Error('heap unavailable'); },
      instrumentProcess: false,
    });
    // The session exists even though nothing it touches works.
    expect(getDaemonHealth()).not.toBeNull();
    const value = new Map([['p', 1]]);
    expect(observeRead('project_run_statuses', () => value, { mark: 'always', rows: (result) => result.size })).toBe(value);
  });

  it('leaves an in-flight marker on disk during an always-marked read and clears it afterwards', () => {
    const root = tempRoot();
    beginDaemonHealthSession({ dataRoot: root, readHeap: () => heap(10), instrumentProcess: false });
    let during: unknown = null;
    observeRead('project_run_statuses', () => {
      during = readCheckpoint(root).inflight;
      return new Map();
    }, { mark: 'always', rows: (result) => result.size });
    expect(during).toMatchObject({ op: 'project_run_statuses', rootOp: 'project_run_statuses' });
    expect(readCheckpoint(root).inflight).toBeNull();
    expect(readCheckpoint(root).topReads[0]).toMatchObject({ op: 'project_run_statuses', rows: 0 });
  });

  it('records the outermost operation for nested reads', () => {
    const root = tempRoot();
    beginDaemonHealthSession({ dataRoot: root, readHeap: () => heap(10), instrumentProcess: false });
    let nested: unknown = null;
    observeRead('library_produced_map', () => {
      observeRead('project_run_statuses', () => {
        nested = readCheckpoint(root).inflight;
        return new Map();
      }, { mark: 'always' });
      return new Map();
    });
    expect(nested).toMatchObject({ op: 'project_run_statuses', rootOp: 'library_produced_map' });
  });

  it('is a plain call when no session is active', () => {
    const value = {};
    expect(observeRead('conversation_messages', () => value)).toBe(value);
  });
});

describe('fatal report opt-in', () => {
  it('never redirects a report configuration enabled by flags', () => {
    const root = tempRoot();
    const report = process.report!;
    const saved = { directory: report.directory, reportOnFatalError: report.reportOnFatalError };
    try {
      report.reportOnFatalError = true;
      report.directory = '/operator/chosen';
      createDaemonHealth({ dataRoot: root, readHeap: () => heap(10), instrumentProcess: false }).enableFatalReports();
      expect(report.directory).toBe('/operator/chosen');

      report.reportOnFatalError = false;
      createDaemonHealth({ dataRoot: root, readHeap: () => heap(10), instrumentProcess: false }).enableFatalReports();
      expect(report.reportOnFatalError).toBe(true);
      expect(report.directory).toBe(daemonHealthPaths(root).fatalReports);
      expect(readdirSync(daemonHealthPaths(root).directory)).toContain('fatal-reports');
    } finally {
      report.reportOnFatalError = saved.reportOnFatalError;
      report.directory = saved.directory;
    }
  });
});

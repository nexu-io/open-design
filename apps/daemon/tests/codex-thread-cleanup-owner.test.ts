import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { attachCodexAppServerSession } from '../src/agent-protocol/codex-app-server/session.js';
import { createCodexThreadCleanupOwner } from '../src/agent-protocol/codex-app-server/cleanup-owner.js';
import { collectCodexChildEvidence, type CodexChildEvidenceCollection } from '../src/runtimes/codex-child-evidence.js';
import { createChatRunService } from '../src/runtimes/runs.js';
import type { CodexThreadCleanupResult } from '../src/agent-protocol/codex-app-server/thread-cleanup.js';

// Keep real filesystem/process operations; control only the interleaving that
// can move a selected active rollout before the collector opens it.
const collectorRace = vi.hoisted(() => ({
  home: '', armed: false, helperStarted: false, activePath: '', archiveFinished: Promise.resolve(),
}));
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: (...args: Parameters<typeof actual.spawn>) => {
    if (collectorRace.armed && args[2]?.env?.RACE_HOME === collectorRace.home) {
      collectorRace.helperStarted = true;
    }
    return actual.spawn(...args);
  } };
});
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, open: async (...args: Parameters<typeof actual.open>) => {
    if (collectorRace.armed && args[0] === collectorRace.activePath && collectorRace.helperStarted) {
      // The old close owner has already launched its archiver. Let that real
      // child perform rename before opening the now-stale path.
      await collectorRace.archiveFinished;
    }
    return actual.open(...args);
  } };
});

const fixture = String.raw`
import { appendFileSync, existsSync, renameSync, watch } from 'node:fs';
import { createInterface } from 'node:readline';
const send = frame => process.stdout.write(JSON.stringify(frame) + '\n');
createInterface({ input: process.stdin }).on('line', line => {
  const frame = JSON.parse(line);
  appendFileSync(process.env.TRANSCRIPT, JSON.stringify({ pid: process.pid, marker: process.env.CASE_MARKER, cwd: process.cwd(), ...frame }) + '\n');
  if (frame.method === 'initialize') send({ id: frame.id, result: { userAgent: 'codex/0.154.0' } });
  else if (frame.method === 'thread/start') send({ id: frame.id, result: { thread: { id: process.env.THREAD_ID || 'owned-close-thread', historyMode: 'paginated' } } });
  else if (frame.method === 'turn/start') {
    if (process.env.MODE === 'normal') send({ method: 'turn/completed', params: { threadId: process.env.THREAD_ID || 'owned-close-thread', turn: { id: 'turn-1', status: 'completed', items: [] } } });
    else if (process.env.MODE !== 'cancel') process.exit(1);
  } else if (frame.method === 'turn/interrupt') process.exit(130);
  else if (frame.method === 'thread/archive') {
    if (process.env.ROLL_FILES) for (const [source, target] of JSON.parse(process.env.ROLL_FILES)) renameSync(source, target);
    if (process.env.ARCHIVE === 'refuse') send({ id: frame.id, error: { code: -32600, message: 'thread already has an active writer' } });
    else if (process.env.ARCHIVE_GATE) {
      const watcher = watch(process.cwd(), () => {
        if (existsSync(process.env.ARCHIVE_GATE)) { watcher.close(); send({ id: frame.id, result: {} }); }
      });
      if (existsSync(process.env.ARCHIVE_GATE)) { watcher.close(); send({ id: frame.id, result: {} }); }
    } else send({ id: frame.id, result: {} });
  } else if (frame.method !== 'initialized') process.exit(3);
});
`;

type Frame = { pid: number; marker: string; cwd: string; method: string; params?: { threadId?: string } };
async function scenario(mode: 'abnormal' | 'cancel' | 'normal', refuse = false, control: 'ordinary' | 'shutdown' | 'deadline' | 'unowned' = 'ordinary') {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-close-owner-'));
  const script = path.join(root, 'fixture.ts');
  const transcript = path.join(root, 'frames.jsonl');
  await writeFile(script, fixture);
  const invocation = { command: process.execPath, args: [script], cwd: root,
    env: { PATH: process.env.PATH, TRANSCRIPT: transcript, CASE_MARKER: 'original-context', MODE: mode, ARCHIVE: refuse ? 'refuse' : 'success',
      ARCHIVE_GATE: control === 'shutdown' ? path.join(root, 'release-archive') : '' },
    windowsVerbatimArguments: false };
  const child = spawn(invocation.command, invocation.args, { cwd: root, env: invocation.env, stdio: 'pipe', detached: process.platform !== 'win32' });
  child.stderr.resume();
  const closed = once(child, 'close');
  const runs = createChatRunService({ createSseResponse: () => ({ send: vi.fn(), end: vi.fn(), cleanup: vi.fn() }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }) });
  const run = runs.create({ agentId: 'codex' });
  run.status = 'running';
  // The legacy service infers initial null slots; fill them with actual typed handles.
  Object.assign(run, { child, childPid: child.pid ?? null,
    processGroupId: process.platform !== 'win32' ? child.pid ?? null : null,
  });
  const reports: CodexThreadCleanupResult[] = [];
  let reportComplete: () => void = () => {};
  const reported = new Promise<void>(resolve => { reportComplete = resolve; });
  const owner = createCodexThreadCleanupOwner();
  const session = attachCodexAppServerSession({ child, prompt: 'Local owned cleanup fixture', cwd: root,
    sandboxMode: 'workspace-write', manageThreadVisibility: control !== 'unowned', onAgentEvent: () => {} });
  Object.assign(run, { acpSession: session });
  // This is the production attach order: session installs its proof listener,
  // then owner binds close, then the ordinary run finalizer may abort it.
  owner.bind(child, session, invocation, result => { reports.push(result); reportComplete(); });
  owner.bind(child, session, invocation, () => { throw new Error('Duplicate binding must never report'); });
  invocation.args[0] = path.join(root, 'later-config-command.ts');
  invocation.env.CASE_MARKER = 'later-config-marker';
  invocation.cwd = path.join(root, 'later-config-cwd');
  child.once('close', (code) => {
    session.abort();
    runs.finish(run, run.cancelRequested ? 'canceled' : code === 0 ? 'succeeded' : 'failed', code, null);
  });
  try {
    await vi.waitFor(async () => {
      const frames = (await readFile(transcript, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as Frame);
      expect(frames.some(frame => frame.method === 'turn/start')).toBe(true);
    });
    if (control === 'deadline') {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        let drained = false;
        const drain = owner.drain(999_999).then(result => { drained = true; return result; });
        await vi.advanceTimersByTimeAsync(2999);
        expect(drained).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await drain).toEqual({ pending: 1 });
      } finally { vi.useRealTimers(); }
    }
    if (control === 'shutdown') {
      await runs.shutdownActive({ graceMs: 10 });
      let drained = false;
      const drain = owner.drain(3000).then(result => { drained = true; return result; });
      await vi.waitFor(async () => {
        const requests = (await readFile(transcript, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as Frame);
        expect(requests.some(frame => frame.pid !== child.pid && frame.method === 'thread/archive')).toBe(true);
      });
      expect(drained).toBe(false);
      expect(run.status).toBe('canceled');
      expect(run.cancelOrigin).toBe('daemon_shutdown');
      await writeFile(path.join(root, 'release-archive'), 'release');
      expect(await drain).toEqual({ pending: 0 });
    } else if (mode === 'cancel') await runs.cancel(run, 'user_stop');
    await closed;
    const terminal = { status: run.status, error: run.error, errorCode: run.errorCode, cancelOrigin: run.cancelOrigin };
    await owner.drain(3000);
    expect({ status: run.status, error: run.error, errorCode: run.errorCode, cancelOrigin: run.cancelOrigin }).toEqual(terminal);
    const frames = (await readFile(transcript, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as Frame);
    const cleanup = frames.filter(frame => frame.pid !== child.pid);
    expect(run.status).toBe(mode === 'cancel' ? 'canceled' : mode === 'normal' ? 'succeeded' : 'failed');
    if (control === 'deadline' || control === 'unowned') {
      expect(reports).toEqual([]);
      expect(cleanup).toEqual([]);
    } else if (mode === 'normal') {
      expect(reports).toEqual([]);
      expect(cleanup).toEqual([]);
      expect(frames.filter(frame => frame.method === 'thread/archive')).toHaveLength(1);
    } else {
      expect(cleanup.map(frame => frame.method)).toEqual(['initialize', 'initialized', 'thread/archive']);
      expect(reports).toHaveLength(1);
      expect(reports[0]?.status).toBe(refuse ? 'failed' : 'archived');
      expect(cleanup.at(-1)?.params).toEqual({ threadId: 'owned-close-thread' });
      const originalCwd = await realpath(root);
      expect(cleanup.every(frame => frame.cwd === originalCwd && frame.marker === 'original-context')).toBe(true);
      expect(session.takeClosedThreadCleanup()).toBeNull();
      for (const pid of new Set(cleanup.map(frame => frame.pid))) {
        if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid fixture process identity');
        expect(() => process.kill(pid, 0)).toThrow();
      }
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await closed; }
    try {
      if (control === 'shutdown') await writeFile(path.join(root, 'release-archive'), 'final cleanup release');
      const remainder = await owner.drain(3000);
      // The source is closed above. If a deliberately withdrawn drain returns
      // early, still observe the bounded owned helper before removing its cwd.
      if (remainder.pending > 0) await reported;
    } finally { await rm(root, { recursive: true, force: true }); }
  }
}

describe('Codex close ownership at the real session attachment boundary', () => {
  it('archives abnormal exit after session proves physical close, before a later abort discards the attempt', async () => scenario('abnormal'));
  it('retains user cancellation while archiving only the closed owned writer', async () => scenario('cancel'));
  it('does not duplicate normal terminal archive', async () => scenario('normal'));
  it('drains the owned archive ACK after real shutdownActive while preserving daemon cancellation', async () => scenario('cancel', false, 'shutdown'));
  it('caps shutdown drain at three seconds and never launches cleanup on a later close', async () => scenario('cancel', false, 'deadline'));
  it('does not use a normal thread response as cleanup authority when visibility ownership was not granted', async () => scenario('abnormal', false, 'unowned'));
  it('reports another writer refusal without changing the original failed run', async () => scenario('abnormal', true));
});

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function collectorScenario(mode: 'abnormal' | 'normal') {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-close-owner-evidence-'));
  const active = path.join(root, 'sessions', '2026', '08', '14');
  const archived = path.join(root, 'archived_sessions');
  const parentId = '10000000-0000-4000-8000-000000000001';
  const childId = '20000000-0000-4000-8000-000000000002';
  const timestamp = (offset: number) => new Date(1786665600000 + offset).toISOString();
  const event = (offset: number, payload: Record<string, unknown>) => ({ timestamp: timestamp(offset), type: 'event_msg', payload });
  const parentPath = path.join(active, `rollout-2026-08-14-${parentId}.jsonl`);
  const childPath = path.join(active, `rollout-2026-08-14-${childId}.jsonl`);
  await mkdir(active, { recursive: true, mode: 0o700 });
  await mkdir(archived, { mode: 0o700 });
  const logs = [
    { file: parentPath, lines: [
      { timestamp: timestamp(0), type: 'session_meta', payload: { id: parentId } },
      event(100, { type: 'task_started', turn_id: 'parent-turn' }),
      event(1000, { type: 'sub_agent_activity', agent_thread_id: childId, kind: 'started', occurred_at_ms: 1786665601000 }),
      event(6000, { type: 'sub_agent_activity', agent_thread_id: childId, kind: 'completed', occurred_at_ms: 1786665606000 }),
      event(7000, { type: 'task_complete', turn_id: 'parent-turn' }),
    ] },
    { file: childPath, lines: [
      { timestamp: timestamp(0), type: 'session_meta', payload: { id: childId, parent_thread_id: parentId } },
      event(2000, { type: 'task_started', turn_id: 'child-turn' }),
      event(2010, { type: 'user_message', message: 'Read the scoped child evidence' }),
      event(2900, { type: 'task_complete', turn_id: 'child-turn' }),
    ] },
  ];
  for (const log of logs) await writeFile(log.file, log.lines.map(line => JSON.stringify(line)).join('\n') + '\n', { mode: 0o600 });
  const script = path.join(root, 'fixture.ts');
  const transcript = path.join(root, 'frames.jsonl');
  await writeFile(script, fixture);
  const invocation = { command: process.execPath, args: [script], cwd: root,
    env: { PATH: process.env.PATH, MODE: mode, TRANSCRIPT: transcript, THREAD_ID: parentId,
      RACE_HOME: root, ROLL_FILES: JSON.stringify(logs.map(log => [log.file, path.join(archived, path.basename(log.file))])) },
    windowsVerbatimArguments: false };
  const evidenceDone = deferred();
  const archiveDone = deferred();
  const owner = createCodexThreadCleanupOwner();
  const reports: CodexThreadCleanupResult[] = [];
  const child = spawn(invocation.command, invocation.args, { cwd: root, env: invocation.env, stdio: 'pipe', detached: process.platform !== 'win32' });
  child.stderr.resume();
  const closed = once(child, 'close');
  const session = attachCodexAppServerSession({ child, prompt: 'Scoped evidence', cwd: root,
    sandboxMode: 'workspace-write', manageThreadVisibility: true, onAgentEvent: () => {} });
  Object.assign(collectorRace, { home: root, armed: true, helperStarted: false, activePath: parentPath, archiveFinished: archiveDone.promise });
  owner.bind(child, session, invocation, result => { reports.push(result); archiveDone.resolve(); }, evidenceDone.promise);
  const collection = new Promise<CodexChildEvidenceCollection>((resolve, reject) => {
    child.once('close', () => {
      void collectCodexChildEvidence({ codexHome: root, parentSessionId: parentId, parentTurnId: 'parent-turn',
        taskExecutionId: 'task-1', runId: 'run-1', taskRunIndex: 0, stage: 'production', parentObservationId: 'root',
        runStartedAtMs: 1786665600000, runEndedAtMs: 1786665610000,
      }).then(resolve, reject).finally(evidenceDone.resolve);
    });
  });
  try {
    const evidence = await collection;
    await closed;
    await owner.drain(3000);
    expect(evidence.availability).toBe('complete');
    expect(evidence.knownChildCount).toBe(1);
    expect(evidence.observations.filter(observation => observation.kind === 'child_agent' && observation.status === 'completed')).toHaveLength(1);
    expect(reports).toHaveLength(mode === 'normal' ? 0 : 1);
    const frames = (await readFile(transcript, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as Frame);
    expect(frames.filter(frame => frame.method === 'thread/archive')).toHaveLength(1);
    for (const log of logs) expect(await readFile(path.join(archived, path.basename(log.file)), 'utf8')).toBe(log.lines.map(line => JSON.stringify(line)).join('\n') + '\n');
  } finally {
    evidenceDone.resolve();
    archiveDone.resolve();
    collectorRace.armed = false;
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await closed; }
    await owner.drain(3000);
    await rm(root, { recursive: true, force: true });
  }
}

describe('Codex close archive and actual rollout collection', () => {
  it('keeps completed child facts when abnormal close would move the selected active rollout before open', async () => collectorScenario('abnormal'));
  it('reads the normal terminal archive that was already moved before physical close', async () => collectorScenario('normal'));
});

async function evidenceExitScenario(boundary: 'superseded' | 'early-return' | 'collector-failure' | 'deadline') {
  const root = await mkdtemp(path.join(tmpdir(), 'codex-close-owner-boundary-'));
  const script = path.join(root, 'fixture.ts');
  const transcript = path.join(root, 'frames.jsonl');
  await writeFile(script, fixture);
  const invocation = { command: process.execPath, args: [script], cwd: root,
    env: { PATH: process.env.PATH, MODE: 'cancel', TRANSCRIPT: transcript, RACE_HOME: root },
    windowsVerbatimArguments: false };
  const child = spawn(invocation.command, invocation.args, { cwd: root, env: invocation.env, stdio: 'pipe', detached: process.platform !== 'win32' });
  child.stderr.resume();
  const closed = once(child, 'close');
  const successor = boundary === 'superseded'
    ? spawn(process.execPath, ['-e', 'process.stdin.resume()'], { stdio: 'pipe' })
    : null;
  successor?.stderr.resume();
  const successorClosed = successor ? once(successor, 'close') : null;
  const runs = createChatRunService({ createSseResponse: () => ({ send: vi.fn(), end: vi.fn(), cleanup: vi.fn() }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }) });
  const run = runs.create({ agentId: 'codex' });
  run.status = 'running';
  Object.assign(run, { child, childPid: child.pid ?? null,
    processGroupId: process.platform !== 'win32' ? child.pid ?? null : null });
  const evidenceDone = deferred();
  const readRelease = deferred();
  const handlerDone = deferred();
  const owner = createCodexThreadCleanupOwner();
  const reports: CodexThreadCleanupResult[] = [];
  const errors: string[] = [];
  const session = attachCodexAppServerSession({ child, prompt: 'Scoped closure', cwd: root,
    sandboxMode: 'workspace-write', manageThreadVisibility: true, onAgentEvent: () => {} });
  Object.assign(run, { acpSession: session });
  Object.assign(collectorRace, { home: root, armed: true, helperStarted: false, activePath: '' });
  owner.bind(child, session, invocation, result => { reports.push(result); }, evidenceDone.promise);
  child.once('close', () => {
    void (async () => {
      try {
        // Mirror the server's two early returns before its evidence collector.
        if (run.child !== child || boundary === 'early-return') return;
        if (boundary === 'collector-failure') throw new Error('Scoped collector failed');
        await readRelease.promise;
      } catch (error) {
        errors.push(String(error));
      } finally {
        evidenceDone.resolve();
        handlerDone.resolve();
      }
    })();
  });
  try {
    await vi.waitFor(async () => {
      const frames = (await readFile(transcript, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as Frame);
      expect(frames.some(frame => frame.method === 'turn/start')).toBe(true);
    });
    if (successor) {
      Object.assign(run, { child: successor, childPid: successor.pid ?? null, acpSession: null });
      child.kill('SIGTERM');
    } else await runs.cancel(run, 'user_stop');
    await closed;
    const terminal = { status: run.status, error: run.error, errorCode: run.errorCode, cancelOrigin: run.cancelOrigin, child: run.child };
    if (boundary === 'deadline') {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        let drained = false;
        const drain = owner.drain(999_999).then(result => { drained = true; return result; });
        await vi.advanceTimersByTimeAsync(2999);
        expect(drained).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await drain).toEqual({ pending: 1 });
      } finally { vi.useRealTimers(); }
      readRelease.resolve();
      await handlerDone.promise;
      await owner.drain(3000);
      expect(collectorRace.helperStarted).toBe(false);
      expect(reports).toEqual([]);
    } else {
      await handlerDone.promise;
      expect(await owner.drain(3000)).toEqual({ pending: 0 });
      expect(reports).toHaveLength(1);
      expect(reports[0]?.status).toBe('archived');
      expect(errors).toEqual(boundary === 'collector-failure' ? ['Error: Scoped collector failed'] : []);
    }
    expect({ status: run.status, error: run.error, errorCode: run.errorCode, cancelOrigin: run.cancelOrigin, child: run.child }).toEqual(terminal);
    expect(run.status).toBe(successor ? 'running' : 'canceled');
    if (successor) {
      expect(successor.exitCode).toBeNull();
      expect(successor.signalCode).toBeNull();
    }
  } finally {
    readRelease.resolve();
    evidenceDone.resolve();
    collectorRace.armed = false;
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await closed; }
    if (successor && successorClosed) {
      if (successor.exitCode === null && successor.signalCode === null) successor.kill('SIGKILL');
      await successorClosed;
    }
    await owner.drain(3000);
    await rm(root, { recursive: true, force: true });
  }
}

describe('Codex evidence completion and attempt ownership', () => {
  it('releases old-generation cleanup while the replacement child and run stay active', async () => evidenceExitScenario('superseded'));
  it('releases cleanup after an early terminal close return', async () => evidenceExitScenario('early-return'));
  it('preserves a reported collector failure and user cancellation while releasing cleanup', async () => evidenceExitScenario('collector-failure'));
  it('does not launch an archive when a held collector completes after the shutdown deadline', async () => evidenceExitScenario('deadline'));
});

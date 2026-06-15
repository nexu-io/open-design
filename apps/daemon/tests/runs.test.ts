import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatRunService } from '../src/runs.js';

describe('chat run service shutdown', () => {
  it('retains structured error details on failed run status bodies', async () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1' });

    const wait = runs.wait(run);
    runs.emit(run, 'error', {
      message: 'Agent stalled without emitting any new output for 1s.',
      error: {
        code: 'AGENT_EXECUTION_FAILED',
        message: 'Agent stalled without emitting any new output for 1s.',
        retryable: true,
      },
    });
    runs.finish(run, 'failed', 1, null);

    expect(runs.statusBody(run)).toMatchObject({
      status: 'failed',
      errorCode: 'AGENT_EXECUTION_FAILED',
      error: 'Agent stalled without emitting any new output for 1s.',
    });
    await expect(wait).resolves.toMatchObject({
      status: 'failed',
      errorCode: 'AGENT_EXECUTION_FAILED',
      error: 'Agent stalled without emitting any new output for 1s.',
    });
  });



  it('ignores subsequent finish attempts after the run reaches a terminal state', async () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1' });

    const wait = runs.wait(run);
    runs.finish(run, 'succeeded', 0, null);
    runs.finish(run, 'failed', 1, 'SIGTERM');

    expect(run.status).toBe('succeeded');
    expect(run.exitCode).toBe(0);
    expect(run.signal).toBeNull();
    expect(run.events.filter((event: { event: string }) => event.event === 'end')).toHaveLength(1);
    await expect(wait).resolves.toMatchObject({ status: 'succeeded', exitCode: 0, signal: null });
  });
  it('filters active runs by conversation within the same project', () => {
    const runs = createRuns();
    const runA = runs.create({ projectId: 'project-1', conversationId: 'conv-a' });
    const runB = runs.create({ projectId: 'project-1', conversationId: 'conv-b' });
    runA.status = 'running';
    runB.status = 'running';

    expect(
      runs.list({ projectId: 'project-1', conversationId: 'conv-b', status: 'active' }),
    ).toEqual([runB]);
  });
  it('cancels a queued run immediately without waiting for child process shutdown', async () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-queued' });

    const wait = runs.wait(run);
    await runs.cancel(run);

    expect(run.status).toBe('canceled');
    expect(run.cancelRequested).toBe(true);
    expect(run.signal).toBe('SIGTERM');
    expect(run.events.at(-1)).toMatchObject({
      event: 'end',
      data: { status: 'canceled', signal: 'SIGTERM' },
    });
    await expect(wait).resolves.toMatchObject({
      status: 'canceled',
      signal: 'SIGTERM',
    });
  });

  describe('cancel kill fallback', () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    });

    it('sends SIGTERM immediately and escalates to SIGKILL after the cancel grace window', async () => {
      vi.useFakeTimers();
      vi.stubEnv('OD_CHAT_RUN_CANCEL_GRACE_MS', '25');
      const runs = createRuns();
      const child = new FakeChildProcess({ closeOn: 'SIGKILL' });
      const run = runs.create();
      run.status = 'running';
      (run as any).child = child;

      const cancelPromise = runs.cancel(run);

      expect(run.cancelRequested).toBe(true);
      expect(child.signals).toEqual(['SIGTERM']);

      await vi.advanceTimersByTimeAsync(24);
      expect(child.signals).toEqual(['SIGTERM']);

      await vi.advanceTimersByTimeAsync(1);
      expect(child.signals).toEqual(['SIGTERM', 'SIGKILL']);
      await cancelPromise;
      expect(run.status).toBe('canceled');
      expect(run.signal).toBe('SIGKILL');
    });

    it('uses ACP abort before falling back to process signals', async () => {
      vi.useFakeTimers();
      vi.stubEnv('PI_ABORT_GRACE_MS', '30');
      const runs = createRuns();
      const child = new FakeChildProcess({ closeOn: 'SIGKILL' });
      const order: string[] = [];
      const originalKill = child.kill.bind(child);
      vi.spyOn(child, 'kill').mockImplementation((signal: string) => {
        order.push(signal);
        return originalKill(signal);
      });
      const abort = vi.fn(() => order.push('abort'));
      const run = runs.create();
      run.status = 'running';
      (run as any).child = child;
      (run as any).acpSession = { abort };

      const cancelPromise = runs.cancel(run);

      expect(abort).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['abort']);

      await vi.advanceTimersByTimeAsync(30);
      expect(order).toEqual(['abort', 'SIGTERM']);

      await vi.advanceTimersByTimeAsync(30);
      expect(order).toEqual(['abort', 'SIGTERM', 'SIGKILL']);
      await cancelPromise;
      expect(run.status).toBe('canceled');
      expect(run.signal).toBe('SIGKILL');
    });

    it('waits for a real process group to exit before returning canceled status', async () => {
      if (process.platform === 'win32') return;
      vi.stubEnv('OD_CHAT_RUN_CANCEL_GRACE_MS', '25');
      vi.stubEnv('OD_CHAT_RUN_CANCEL_FORCE_WAIT_MS', '250');
      const script = [
        "const { spawn } = require('node:child_process');",
        "process.on('SIGTERM', () => {});",
        "const child = spawn(process.execPath, ['-e', \"process.on('SIGTERM',()=>{}); setInterval(()=>{}, 1000);\"], { stdio: 'ignore' });",
        "process.stdout.write(JSON.stringify({ pid: process.pid, childPid: child.pid }) + '\\n');",
        "setInterval(() => {}, 1000);",
      ].join('\n');
      const child = spawn(process.execPath, ['-e', script], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      try {
        const line = await readOneLine(child.stdout);
        const payload = JSON.parse(line) as { childPid: number };
        const runs = createRuns();
        const run = runs.create();
        run.status = 'running';
        (run as any).child = child;
        (run as any).childPid = child.pid;
        (run as any).processGroupId = child.pid;

        const status = await runs.cancel(run);

        expect(status.status).toBe('canceled');
        expect(status.childPid).toBe(child.pid);
        expect(status.processGroupId).toBe(child.pid);
        expect(status.childExited).toBe(true);
        expect(status.signal).toBe('SIGKILL');
        await expectPidGone(payload.childPid);
      } finally {
        try {
          if (typeof child.pid === 'number') process.kill(-child.pid, 'SIGKILL');
        } catch {
          // already gone
        }
      }
    });
  });



  it('stores effective media execution policy on run status bodies', () => {
    const runs = createRuns();
    const defaultRun = runs.create({ projectId: 'project-1', conversationId: 'conv-a' });
    const scopedRun = runs.create({
      projectId: 'project-1',
      conversationId: 'conv-b',
      mediaExecution: { mode: 'enabled', allowedSurfaces: ['image'] },
    });

    expect(runs.statusBody(defaultRun)).toMatchObject({
      mediaExecution: { mode: 'enabled' },
    });
    expect(runs.statusBody(scopedRun)).toMatchObject({
      mediaExecution: { mode: 'enabled', allowedSurfaces: ['image'] },
    });
  });

  it('stores Browser Use availability on run status bodies', () => {
    const runs = createRuns();
    const run = runs.create({
      projectId: 'project-1',
      conversationId: 'conv-a',
      browserUse: {
        requested: true,
        available: false,
        reason: 'no-matching-browser-backend',
        diagnostics: {
          registryPath: '/tmp/codex-browser-use',
          registryExists: false,
          socketCount: 0,
          candidateCount: 0,
          staleCount: 0,
          currentSessionIdPresent: null,
          probeFailureCategory: 'registry-missing',
          staleThresholdMs: 600_000,
        },
      },
    });

    expect(runs.statusBody(run)).toMatchObject({
      browserUse: {
        requested: true,
        available: false,
        reason: 'no-matching-browser-backend',
        diagnostics: {
          registryPath: '/tmp/codex-browser-use',
          probeFailureCategory: 'registry-missing',
        },
      },
    });
  });

  it('stores a run-scoped tool bundle and returns a redacted status summary', () => {
    const runs = createRuns();
    const run = runs.create({
      projectId: 'project-1',
      conversationId: 'conv-a',
      toolBundle: {
        mcpServers: [
          {
            id: 'run-tools',
            transport: 'stdio',
            command: 'node',
            args: ['server.js', '--token=secret'],
            env: { API_TOKEN: 'secret' },
          },
        ],
      },
    }) as any;

    expect(run.toolBundle.mcpServers).toHaveLength(1);
    expect(run.toolBundle.mcpServers[0]).toMatchObject({
      id: 'run-tools',
      command: 'node',
      env: { API_TOKEN: 'secret' },
    });

    const status = runs.statusBody(run);
    expect(status.toolBundle).toEqual({
      mcpServers: [
        {
          id: 'run-tools',
          transport: 'stdio',
          enabled: true,
        },
      ],
    });
    expect(JSON.stringify(status)).not.toContain('secret');
    expect(JSON.stringify(status)).not.toContain('server.js');
  });

  it('cancels active runs and terminates their child process during daemon shutdown', async () => {
    const runs = createRuns();
    const child = new FakeChildProcess({ closeOn: 'SIGTERM' });
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1' });
    run.status = 'running';
    (run as any).child = child;

    const wait = runs.wait(run);
    await runs.shutdownActive({ graceMs: 10 });

    expect(child.signals).toEqual(['SIGTERM']);
    expect(run.status).toBe('canceled');
    expect(run.cancelRequested).toBe(true);
    expect(run.signal).toBe('SIGTERM');
    await expect(wait).resolves.toMatchObject({ status: 'canceled', signal: 'SIGTERM' });
    expect(run.events.at(-1)).toMatchObject({
      event: 'end',
      data: { status: 'canceled', signal: 'SIGTERM' },
    });
  });

  it('escalates to SIGKILL when a child ignores the shutdown SIGTERM grace window', async () => {
    const runs = createRuns();
    const child = new FakeChildProcess({ closeOn: 'SIGKILL' });
    const run = runs.create();
    run.status = 'running';
    (run as any).child = child;

    await runs.shutdownActive({ graceMs: 1 });

    expect(child.signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(run.status).toBe('canceled');
  });

  it('uses adapter abort before process signals for ACP-style runs', async () => {
    const runs = createRuns();
    const child = new FakeChildProcess({ closeOn: 'SIGTERM' });
    const abort = vi.fn();
    const run = runs.create();
    run.status = 'running';
    (run as any).child = child;
    (run as any).acpSession = { abort };

    await runs.shutdownActive({ graceMs: 10 });

    expect(abort).toHaveBeenCalledTimes(1);
    expect(child.signals).toEqual(['SIGTERM']);
    expect(run.status).toBe('canceled');
  });
});

describe('chat run service stream replay', () => {
  it('always replays the final event when a reattaching client cursor is at the end of a terminal run', () => {
    const sendCalls: Array<{ event: string; data: unknown; id: number }> = [];
    const endCalls: number[] = [];
    const runs = createChatRunService({
      createSseResponse: () => ({
        send: vi.fn((event: string, data: unknown, id: number) => {
          sendCalls.push({ event, data, id });
          return true;
        }),
        end: vi.fn(() => endCalls.push(1)),
        cleanup: vi.fn(),
      }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      shutdownGraceMs: 10,
      ttlMs: 60_000,
    });

    const run = runs.create({ projectId: 'p', conversationId: 'c' }) as any;
    runs.emit(run, 'stdout', { text: 'hello' });
    runs.finish(run, 'succeeded', 0, null);

    const finalEventId = run.events.at(-1).id;
    const fakeReq = {
      get: () => null,
      query: { after: String(finalEventId) },
    } as never;
    const fakeRes = { on: () => {} } as never;

    sendCalls.length = 0;
    runs.stream(run, fakeReq, fakeRes);

    expect(sendCalls.length).toBeGreaterThanOrEqual(1);
    expect(sendCalls.at(-1)?.event).toBe('end');
    expect(endCalls.length).toBe(1);
  });

  it('does not duplicate events when the cursor sits before the final event', () => {
    const sendCalls: Array<{ event: string; data: unknown; id: number }> = [];
    const runs = createChatRunService({
      createSseResponse: () => ({
        send: vi.fn((event: string, data: unknown, id: number) => {
          sendCalls.push({ event, data, id });
          return true;
        }),
        end: vi.fn(),
        cleanup: vi.fn(),
      }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      shutdownGraceMs: 10,
      ttlMs: 60_000,
    });

    const run = runs.create() as any;
    runs.emit(run, 'stdout', { text: 'a' });
    runs.emit(run, 'stdout', { text: 'b' });
    runs.finish(run, 'succeeded', 0, null);

    const cursor = run.events[0].id;
    runs.stream(
      run,
      { get: () => null, query: { after: String(cursor) } } as never,
      { on: () => {} } as never,
    );

    expect(sendCalls.map((c) => c.id)).toEqual(
      run.events.filter((e: { id: number }) => e.id > cursor).map((e: { id: number }) => e.id),
    );
  });
});

function createRuns() {
  return createChatRunService({
    createSseResponse: () => ({
      send: vi.fn(() => true),
      end: vi.fn(),
      cleanup: vi.fn(),
    }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60_000,
  });
}

function readOneLine(stream: NodeJS.ReadableStream | null): Promise<string> {
  if (!stream) return Promise.reject(new Error('missing stdout'));
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => reject(new Error('timed out waiting for child readiness')), 1000);
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += String(chunk);
      const newline = buffer.indexOf('\n');
      if (newline >= 0) {
        clearTimeout(timeout);
        resolve(buffer.slice(0, newline));
      }
    });
    stream.on('error', reject);
  });
}

async function expectPidGone(pid: number): Promise<void> {
  for (let i = 0; i < 20; i++) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`expected pid ${pid} to be gone`);
}

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null;
  signalCode: string | null = null;
  killed = false;
  signals: string[] = [];

  constructor(private readonly options: { closeOn: 'SIGTERM' | 'SIGKILL' }) {
    super();
  }

  kill(signal: string): boolean {
    this.killed = true;
    this.signals.push(signal);
    if (signal === this.options.closeOn) {
      this.signalCode = signal;
      queueMicrotask(() => {
        this.emit('exit', null, signal);
        this.emit('close', null, signal);
      });
    }
    return true;
  }
}

// Persist every SSE event the daemon emits to a per-run JSONL file at
// <runsLogDir>/<runId>/events.jsonl. The path is surfaced on statusBody
// as `eventsLogPath`, which is what the MCP `get_run` tool returns to
// the external coding agent — so Codex / Cursor / Zed can `tail` the
// file in their own shell during a long-running OD generation, instead
// of cancelling the run because polling shows nothing changing.
describe('run event log persistence', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-runs-log-test-'));
  });
  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  function createRunsWithLog(runsLogDir: string | null) {
    return createChatRunService({
      createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      shutdownGraceMs: 10,
      ttlMs: 60_000,
      // runs.ts is `// @ts-nocheck`, so the inferred type for the
      // `runsLogDir = null` default narrows to literal `null` from the
      // outside; cast to bypass and pass the real string. Production
      // callers (server.ts) use a string path directly.
      runsLogDir: runsLogDir as unknown as null,
    });
  }

  it('writes each emitted event as a JSONL line under runsLogDir/<runId>/events.jsonl', async () => {
    const runs = createRunsWithLog(tmpDir);
    const run = runs.create({ projectId: 'p1' });

    runs.emit(run, 'agent', { type: 'text_delta', delta: 'hello' });
    runs.emit(run, 'agent', { type: 'text_delta', delta: ' world' });
    runs.finish(run, 'succeeded', 0, null);

    // Wait for the write stream to fully flush to disk. The stream is
    // buffered through libuv; .end() is async and only resolves once
    // the kernel has accepted everything. Poll for the expected line
    // count with a short cap to keep the test snappy.
    const logPath = path.join(tmpDir, run.id, 'events.jsonl');
    let lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      if (fs.existsSync(logPath)) {
        const text = fs.readFileSync(logPath, 'utf8').trim();
        lines = text ? text.split('\n') : [];
        if (lines.length >= 3) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(fs.existsSync(logPath)).toBe(true);
    expect(lines.length).toBe(3); // 2 agent + 1 end
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[0]).toMatchObject({ event: 'agent', data: { type: 'text_delta', delta: 'hello' } });
    expect(parsed[1]).toMatchObject({ event: 'agent', data: { type: 'text_delta', delta: ' world' } });
    expect(parsed[2]).toMatchObject({ event: 'end', data: { status: 'succeeded' } });
  });

  it('exposes eventsLogPath on statusBody when runsLogDir is configured', () => {
    const runs = createRunsWithLog(tmpDir);
    const run = runs.create({ projectId: 'p1' });

    const body = runs.statusBody(run);
    expect(body.eventsLogPath).toBe(path.join(tmpDir, run.id, 'events.jsonl'));
  });

  it('reports eventsLogPath: null when runsLogDir is not configured (back-compat)', () => {
    const runs = createRunsWithLog(null);
    const run = runs.create({ projectId: 'p1' });

    const body = runs.statusBody(run);
    expect(body.eventsLogPath).toBeNull();
  });

  it('does not touch the filesystem when runsLogDir is not configured', () => {
    const runs = createRunsWithLog(null);
    const run = runs.create({ projectId: 'p1' });
    runs.emit(run, 'agent', { type: 'text_delta', delta: 'x' });
    runs.finish(run, 'succeeded', 0, null);

    // The tmpDir we'd otherwise have written under stays empty
    // because we configured runsLogDir=null.
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });
});

import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

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

  it('awaits in-flight runFinishedHook promises during shutdownActive', async () => {
    // Caught in code review on PR #2619: without tracking pending
    // hook promises and awaiting them in shutdownActive, a SIGTERM
    // mid-hook can let process.exit() race the auto-commit write,
    // dropping the run's project_revisions row. This test exercises
    // the contract: shutdownActive must not return until in-flight
    // hooks have settled.
    const runs = createRuns();
    let hookCompletedAt: number | null = null;
    let hookStartedAt: number | null = null;
    runs.setRunFinishedHook(async () => {
      hookStartedAt = Date.now();
      // Simulate the multi-step history auto-commit (HEAD probe,
      // lock acquisition, git status/add/commit, sqlite INSERT).
      await new Promise((resolve) => setTimeout(resolve, 100));
      hookCompletedAt = Date.now();
    });

    const child = new FakeChildProcess({ closeOn: 'SIGTERM' });
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1' });
    run.status = 'running';
    (run as any).child = child;

    const shutdownStartedAt = Date.now();
    await runs.shutdownActive({ graceMs: 500 });
    const shutdownReturnedAt = Date.now();

    // The hook ran (started + completed both set)
    expect(hookStartedAt).not.toBeNull();
    expect(hookCompletedAt).not.toBeNull();
    // And it completed BEFORE shutdownActive returned — the
    // contract we just installed.
    expect(hookCompletedAt!).toBeLessThanOrEqual(shutdownReturnedAt);
    // Sanity: shutdownActive waited at least the hook's ~100ms
    expect(shutdownReturnedAt - shutdownStartedAt).toBeGreaterThanOrEqual(90);
  });

  it('fires runFinishedHook AFTER the child fully exits (no race against graceful SIGTERM writes)', async () => {
    // Second review pass on PR #2619 (P0-fix.13): the previous fix
    // tracked pending hook promises but still fired finish() (and
    // therefore the hook) BEFORE waitForChildExit. A child that
    // handles SIGTERM gracefully — flushing files to disk before
    // exiting — could write its final changes AFTER the hook's
    // `git status` snapshot already ran. Those last writes never
    // make it into the auto-commit, dropping the final revision.
    //
    // This test simulates that pattern: a child that delays its
    // 'exit' emission by 50ms after SIGTERM, with an onBeforeExit
    // callback timestamping the latest "child write." The hook
    // records when IT fires. Assertion: hook fires AFTER child
    // exit, i.e. after any graceful-flush writes.
    const runs = createRuns();
    let childLastWroteAt: number | null = null;
    let hookFiredAt: number | null = null;
    let hookSawChildAlive: boolean | null = null;
    const child = new FakeChildProcess({ closeOn: 'SIGTERM', delayMs: 50 });
    // Simulate the child writing files right before exit (the
    // pattern this fix is protecting against).
    child.onBeforeExit = () => {
      childLastWroteAt = Date.now();
    };
    runs.setRunFinishedHook(async () => {
      hookFiredAt = Date.now();
      // The hook can observe the child's exit state — pre-fix this
      // would be 'alive' (child still running); post-fix it should
      // be 'exited' because we wait for child exit first.
      hookSawChildAlive = child.exitEmittedAt === null;
    });

    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1' });
    run.status = 'running';
    (run as any).child = child;

    await runs.shutdownActive({ graceMs: 500 });

    // Both events happened
    expect(childLastWroteAt).not.toBeNull();
    expect(hookFiredAt).not.toBeNull();
    // The child's final write completed BEFORE the hook fired —
    // proving the hook reads a post-child-exit worktree
    expect(hookFiredAt!).toBeGreaterThanOrEqual(childLastWroteAt!);
    // And the hook saw the child as exited when it fired
    expect(hookSawChildAlive).toBe(false);
  });

  it('does not hang shutdownActive forever on a stuck runFinishedHook', async () => {
    // Belt-and-suspenders: if a hook gets stuck (e.g. fs lock,
    // hung subprocess), shutdownActive must time out and still
    // return so the daemon can exit. The bound is 2× graceMs.
    const runs = createRuns();
    let hookSettled = false;
    runs.setRunFinishedHook(() => new Promise(() => {
      // Intentionally never resolves; would-be data loss is logged
      // by shutdownActive but doesn't hang the process.
    }));

    const child = new FakeChildProcess({ closeOn: 'SIGTERM' });
    const run = runs.create({ projectId: 'project-1', conversationId: 'conv-1' });
    run.status = 'running';
    (run as any).child = child;

    const start = Date.now();
    await runs.shutdownActive({ graceMs: 100 });
    const elapsed = Date.now() - start;

    // Min wait is 1000ms (the floor in runs.ts: max(graceMs*2, 1000))
    expect(elapsed).toBeGreaterThanOrEqual(900);
    // Upper bound — generous margin for test scheduling jitter
    expect(elapsed).toBeLessThanOrEqual(2500);
    // The hook itself never resolved
    expect(hookSettled).toBe(false);
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

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null;
  signalCode: string | null = null;
  killed = false;
  signals: string[] = [];
  /** Set the moment this child actually emits 'exit'. Used by ordering tests. */
  exitEmittedAt: number | null = null;
  /** Optional callback fired just before the 'exit' emit — simulates last writes. */
  onBeforeExit: (() => void) | undefined = undefined;

  constructor(
    private readonly options: {
      closeOn: 'SIGTERM' | 'SIGKILL';
      /**
       * Delay (ms) between receiving the matching signal and emitting
       * 'exit'/'close'. Simulates a child handling SIGTERM gracefully
       * (e.g., flushing files to disk) before exiting. Default 0
       * (queueMicrotask immediate emit).
       */
      delayMs?: number;
    },
  ) {
    super();
  }

  kill(signal: string): boolean {
    this.killed = true;
    this.signals.push(signal);
    if (signal === this.options.closeOn) {
      const fire = () => {
        try { this.onBeforeExit?.(); } catch { /* ignore */ }
        // Mirror real ChildProcess: signalCode is set when the process
        // actually exits, NOT when kill() is called. Setting it eagerly
        // would let `waitForChildExit` short-circuit before the delayed
        // 'exit' emission fires — which is exactly the race this
        // FakeChildProcess is here to simulate.
        this.signalCode = signal;
        this.exitEmittedAt = Date.now();
        this.emit('exit', null, signal);
        this.emit('close', null, signal);
      };
      if (this.options.delayMs && this.options.delayMs > 0) {
        setTimeout(fire, this.options.delayMs).unref?.();
      } else {
        queueMicrotask(fire);
      }
    }
    return true;
  }
}

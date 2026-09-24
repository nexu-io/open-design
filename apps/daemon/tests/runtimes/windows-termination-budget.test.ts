import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({
  capture: vi.fn(),
  list: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('@open-design/platform', async (load) => {
  const actual = await load<typeof import('@open-design/platform')>();
  return { ...actual, captureProcessSnapshot: platform.capture,
    listProcessSnapshots: platform.list, stopProcesses: platform.stop };
});
import { createChatRunService } from '../../src/runtimes/runs.js';

type Snapshot = { pid: number; ppid: number; command: string };
type Step = Snapshot[] | 'hang';
const wrapperPid = 41000;
const descendantPid = 41001;
const ambient: Snapshot[] = [{ pid: process.pid, ppid: 1, command: 'test-owner' }];
const owned: Snapshot[] = [
  { pid: wrapperPid, ppid: 1, command: 'agent-wrapper' },
  { pid: descendantPid, ppid: wrapperPid, command: 'owned-tool' },
];
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
let releaseQueries: Array<() => void>;
let expiredQueries: number;

/** OS query seam: an unbudgeted query stays pending; a budget cancels it and
 * rejects, matching captureProcessSnapshot's existing documented contract.
 * packages/platform/tests/process-snapshot-budget.test.ts separately proves
 * that the real execFile child is killed. This spec owns daemon consumption,
 * not a claim that mocked CIM output proves native Windows behavior. */
function queries(steps: Step[]) {
  let index = 0;
  const query = (options?: { timeoutMs?: number }): Promise<Snapshot[]> => {
    const step = steps[index++] ?? ambient;
    if (step !== 'hang') return Promise.resolve(step);
    return new Promise((resolve, reject) => {
      const timeout = options?.timeoutMs;
      const timer = typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0
        ? setTimeout(() => {
          expiredQueries += 1;
          reject(new Error('process snapshot query timed out'));
        }, timeout)
        : undefined;
      releaseQueries.push(() => { clearTimeout(timer); resolve(ambient); });
    });
  };
  platform.capture.mockImplementation(query);
  platform.list.mockImplementation((options?: { timeoutMs?: number }) => query(options).catch(() => []));
}

function fixture(exited = true) {
  const service = createChatRunService({
    createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60000,
  });
  const child = Object.assign(new EventEmitter(), {
    pid: wrapperPid, exitCode: exited ? 0 : null, signalCode: null,
    stdin: { destroyed: true, end: vi.fn() }, kill: vi.fn(),
  });
  const run = service.create({ projectId: 'project-1', conversationId: 'conv-1' }) as any;
  run.status = 'running';
  run.child = child;
  return { service, run, child };
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  releaseQueries = [];
  expiredQueries = 0;
  platform.capture.mockReset(); platform.list.mockReset(); platform.stop.mockReset();
  platform.stop.mockImplementation(async (pids: number[]) => ({
    alreadyStopped: false, forcedPids: [], matchedPids: [...pids],
    remainingPids: [], stoppedPids: [...pids],
  }));
});
afterEach(async () => {
  // Release the intentionally pending old-head operation after its assertion
  // fails, so the red case cannot leave a promise operating on the next case.
  for (const release of releaseQueries) release();
  await vi.advanceTimersByTimeAsync(30000);
  vi.clearAllTimers();
  vi.useRealTimers();
  Object.defineProperty(process, 'platform', platformDescriptor);
});

describe('Windows terminal process enumeration budget', () => {
  it('releases the terminal consumer after a stuck initial query while reporting unverified cleanup', async () => {
    queries(['hang', ambient, ambient]);
    const { service, run, child } = fixture();
    let result: { quiescent: boolean } | undefined;
    let consumerResumed = false;
    const consumed = service.terminateProcessTree(run, child, null).then((value: { quiescent: boolean }) => {
      result = value;
      consumerResumed = true;
    });
    // The shared terminal publisher must remain fenced while discovery runs.
    // A queued failure is deliberately NOT a successful-cleanup assertion.
    service.finish(run, 'failed', 1, null);
    expect(run.status).toBe('running');
    expect(consumerResumed).toBe(false);
    // Generous virtual ceiling, not a new production timeout or longer test
    // timeout: the existing 3s/500ms cleanup budgets fit well inside this bound.
    await vi.advanceTimersByTimeAsync(30000);
    expect(consumerResumed).toBe(true);
    await consumed;
    expect(result?.quiescent).toBe(false);
    expect(expiredQueries).toBe(1);
    expect(run.processTreeTerminationPending).toBe(0);
    expect(service.statusBody(run)).toMatchObject({ status: 'failed', exitCode: 1 });
    expect(run.events).toContainEqual(expect.objectContaining({
      event: 'diagnostic', data: expect.objectContaining({ type: 'termination_failed', child_pid: wrapperPid }),
    }));
  });

  it('still reaps already-discovered owned descendants when a later query times out', async () => {
    queries([owned, 'hang', ambient]);
    const { service, run, child } = fixture();
    let result: { quiescent: boolean } | undefined;
    const teardown = service.terminateProcessTree(run, child, null).then((value: { quiescent: boolean }) => { result = value; });
    await vi.advanceTimersByTimeAsync(30000);
    expect(result).toBeDefined();
    await teardown;
    expect(expiredQueries).toBe(1);
    // Exited wrapper is not signaled; the known live tool cannot be abandoned
    // just because subsequent discovery failed. Unknown late descendants keep
    // the final proof conservative even if this known set was stopped.
    const stopped = platform.stop.mock.calls.flatMap(([pids]) => pids as number[]);
    expect(stopped).toContain(descendantPid);
    expect(stopped).not.toContain(wrapperPid);
    expect(stopped).not.toContain(process.pid);
    expect(result?.quiescent).toBe(false);
    expect(run.events).toContainEqual(expect.objectContaining({
      event: 'diagnostic', data: expect.objectContaining({ type: 'termination_failed' }),
    }));
  });

  it('reaps a newly verified owned descendant even after an earlier query timed out', async () => {
    const latePid = descendantPid + 1;
    queries(['hang', owned, [...ambient, { pid: latePid, ppid: descendantPid, command: 'late-owned-tool' }], ambient]);
    const { service, run, child } = fixture();
    let result: { quiescent: boolean } | undefined;
    const teardown = service.terminateProcessTree(run, child, null).then((value: { quiescent: boolean }) => { result = value; });
    await vi.advanceTimersByTimeAsync(30000);
    expect(result).toBeDefined();
    await teardown;
    // Missing an earlier table keeps cleanup unverified, but cannot excuse
    // abandoning a live descendant positively tied to the captured tree.
    expect(platform.stop.mock.calls.map(([pids]) => pids)).toEqual([[descendantPid], [latePid]]);
    expect(result?.quiescent).toBe(false);
    expect(expiredQueries).toBe(1);
    expect(run.events).toContainEqual(expect.objectContaining({
      event: 'diagnostic', data: expect.objectContaining({ type: 'termination_failed' }),
    }));
  });

  it('does not reclaim an exited wrapper PID or its unrelated replacement tree after query timeout', async () => {
    const unrelatedPid = descendantPid + 2;
    queries(['hang', owned, [...ambient,
      { pid: wrapperPid, ppid: 1, command: 'unrelated-reused-wrapper-pid' },
      { pid: unrelatedPid, ppid: wrapperPid, command: 'unrelated-new-child' },
    ], ambient]);
    const { service, run, child } = fixture();
    let result: { quiescent: boolean } | undefined;
    const teardown = service.terminateProcessTree(run, child, null).then((value: { quiescent: boolean }) => { result = value; });
    await vi.advanceTimersByTimeAsync(30000);
    expect(result).toBeDefined();
    await teardown;
    // Only the old independently observed descendant belongs to this attempt.
    // A known-exited root PID is neither a signal target nor an ownership seed
    // for a newly discovered tree, even when the OS reports it live again.
    expect(platform.stop.mock.calls.map(([pids]) => pids)).toEqual([[descendantPid]]);
    expect(result?.quiescent).toBe(false);
    expect(expiredQueries).toBe(1);
  });

  it.each(['verification', 'final'] as const)('does not claim quiescence for a new ambiguous exited-root subtree during %s discovery', async (phase) => {
    const ambiguousPid = descendantPid + 3;
    const knownLatePid = descendantPid + 4;
    const ambiguous: Snapshot[] = [...ambient, { pid: ambiguousPid, ppid: wrapperPid, command: 'unproven-direct-child' }];
    queries(phase === 'verification'
      ? [owned, owned, ambiguous]
      : [owned, owned, [...ambient, { pid: knownLatePid, ppid: descendantPid, command: 'known-tool-child' }], ambiguous]);
    const { service, run, child } = fixture();
    const result = await service.terminateProcessTree(run, child, null);
    expect(platform.stop.mock.calls.map(([pids]) => pids)).toEqual(
      phase === 'verification' ? [[descendantPid]] : [[descendantPid], [knownLatePid]],
    );
    // This new direct child cannot safely be owned via an exited numeric root.
    // Not signaling it is conservative, but is NOT proof that our tree is gone.
    expect(result.quiescent).toBe(false);
    expect(run.events).toContainEqual(expect.objectContaining({
      event: 'diagnostic', data: expect.objectContaining({ type: 'termination_failed' }),
    }));
  });

  it('keeps a live captured root eligible for its newly observed descendants', async () => {
    const latePid = descendantPid + 5;
    queries([owned, owned, [...ambient, { pid: latePid, ppid: wrapperPid, command: 'live-root-late-child' }], ambient]);
    const { service, run, child } = fixture(false);
    const result = await service.terminateProcessTree(run, child, null);
    expect(platform.stop.mock.calls.map(([pids]) => pids)).toEqual([[descendantPid, wrapperPid], [latePid]]);
    expect(result.quiescent).toBe(true);
  });

  it('does not signal a reused exited-root PID with no observed descendants', async () => {
    queries([owned, owned, [...ambient, { pid: wrapperPid, ppid: 1, command: 'unrelated-reused-pid' }]]);
    const { service, run, child } = fixture();
    const result = await service.terminateProcessTree(run, child, null);
    expect(platform.stop.mock.calls.map(([pids]) => pids)).toEqual([[descendantPid]]);
    expect(result.quiescent).toBe(true);
  });

  it('rechecks captured child exit after the initial stop before adopting a later subtree', async () => {
    const ambiguousPid = descendantPid + 6;
    queries([owned, owned, [...ambient,
      { pid: wrapperPid, ppid: 1, command: 'unrelated-reused-pid' },
      { pid: ambiguousPid, ppid: wrapperPid, command: 'unproven-new-child' },
    ]]);
    const { service, run, child } = fixture(false);
    platform.stop.mockImplementationOnce(async (pids: number[]) => {
      child.exitCode = 0;
      return { alreadyStopped: false, forcedPids: [], matchedPids: [...pids], remainingPids: [], stoppedPids: [...pids] };
    });
    const result = await service.terminateProcessTree(run, child, null);
    expect(platform.stop.mock.calls.map(([pids]) => pids)).toEqual([[descendantPid, wrapperPid]]);
    expect(result.quiescent).toBe(false);
  });

  it('preserves non-Windows no-pgid descendant follow-up behavior', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    const latePid = descendantPid + 7;
    queries([owned, owned, [...ambient, { pid: latePid, ppid: wrapperPid, command: 'legacy-direct-child' }], ambient]);
    const { service, run, child } = fixture();
    const result = await service.terminateProcessTree(run, child, null);
    expect(platform.capture).not.toHaveBeenCalled();
    expect(platform.stop.mock.calls.map(([pids]) => pids)).toEqual([[descendantPid], [latePid]]);
    expect(result.quiescent).toBe(true);
  });

  it('keeps verified discovery and owned descendant cleanup successful', async () => {
    queries([owned, owned, ambient]);
    const { service, run, child } = fixture();
    const result = await service.terminateProcessTree(run, child, null);
    expect(result).toMatchObject({ quiescent: true, remainingPids: [] });
    expect(platform.stop.mock.calls.flatMap(([pids]) => pids as number[])).toEqual([descendantPid]);
    expect(expiredQueries).toBe(0);
    expect(run.events).not.toContainEqual(expect.objectContaining({
      event: 'diagnostic', data: expect.objectContaining({ type: 'termination_failed' }),
    }));
  });
});

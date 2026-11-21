import { afterEach, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({
  captureProcessSnapshot: vi.fn(), isProcessAlive: vi.fn(),
  matchesStampedProcess: vi.fn(() => true), signalProcesses: vi.fn(), stopProcesses: vi.fn(),
}));
vi.mock('@open-design/platform', () => platform);
vi.mock('../src/process-tree.js', () => ({ collectSidecarGenerationPids: () => [100, 101] }));
import { retireFencedSidecarProcessTree } from '../src/process-retirement.js';

afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

it('allows the root to finish writing, then terminates its surviving descendants without exhausting the daemon grace', async () => {
  vi.useFakeTimers();
  let rootAlive = true;
  let descendantAlive = true;
  platform.isProcessAlive.mockImplementation((pid: number) => pid === 100 ? rootAlive : descendantAlive);
  platform.signalProcesses.mockImplementation((pids: number[]) => {
    expect(rootAlive).toBe(false);
    expect(pids).toEqual([101]);
    descendantAlive = false;
  });
  platform.matchesStampedProcess.mockReturnValue(true);
  const stopping = retireFencedSidecarProcessTree({ rootPid: 100, stamp: {
    channel: 'beta', namespace: 'quit', source: 'packaged', mode: 'prod', app: 'daemon',
  } }, { gracefulStopInitiated: true, knownSnapshots: [{ pid: 100 } as never], stopOptions: { termGraceMs: 30_000 } });
  await vi.advanceTimersByTimeAsync(200);
  expect(platform.signalProcesses).not.toHaveBeenCalled();
  rootAlive = false;
  await vi.advanceTimersByTimeAsync(200);
  expect(platform.signalProcesses).toHaveBeenCalledOnce();
  await expect(stopping).resolves.toMatchObject({ remainingPids: [], forcedPids: [] });
  expect(platform.stopProcesses).not.toHaveBeenCalled();
});

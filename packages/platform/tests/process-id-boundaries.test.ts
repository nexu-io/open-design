import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';
import { collectProcessTreePids, isProcessAlive, signalProcesses, stopProcesses } from '../src/process.js';

const invalid = [0, -1, -42, NaN, Infinity, -Infinity, 1.5, 2 ** 31, Number.MAX_SAFE_INTEGER];
const gone = Object.assign(new Error('No such process'), { code: 'ESRCH' });

afterEach(() => vi.restoreAllMocks());

describe('individual process ID boundaries', () => {
  it('does not probe invalid IDs or process-group selectors as individual processes', () => {
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    for (const pid of [...invalid, null, undefined]) assert.equal(isProcessAlive(pid), false, String(pid));
    assert.equal(kill.mock.calls.length, 0);
  });

  it('does not use invalid roots to collect unrelated process trees', () => {
    assert.deepEqual(collectProcessTreePids([
      { pid: 100, ppid: 0, command: 'root' },
      { pid: 101, ppid: 100, command: 'child' },
    ], [...invalid, null, undefined]), []);
  });

  it('does not traverse through an invalid descendant into another tree', () => {
    assert.deepEqual(collectProcessTreePids([
      { pid: 200, ppid: 100, command: 'child' },
      { pid: 0, ppid: 100, command: 'invalid' },
      { pid: 300, ppid: 0, command: 'unrelated root' },
    ], [100]), [200, 100]);
  });

  it('only signals individual positive IDs and reports only those deliveries', () => {
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const delivered: number[] = [];
    signalProcesses([...invalid, 123], 'SIGTERM', (pid) => delivered.push(pid));
    assert.deepEqual(kill.mock.calls, [[123, 'SIGTERM']]);
    assert.deepEqual(delivered, [123]);
  });

  it('filters invalid stop targets before signalling and reporting results', async () => {
    const valid = process.pid + 1000;
    const kill = vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      if (signal === 0) throw gone;
      return true;
    });
    const delivered: number[] = [];
    const result = await stopProcesses([...invalid, null, undefined, process.pid, valid, valid], {
      termGraceMs: 0,
      killGraceMs: 0,
      onSignal: (pid) => delivered.push(pid),
    });
    assert.deepEqual(result, {
      alreadyStopped: false,
      forcedPids: [],
      matchedPids: [valid],
      remainingPids: [],
      stoppedPids: [valid],
    });
    assert.deepEqual(delivered, [valid]);
    assert.deepEqual(kill.mock.calls, [[valid, 'SIGTERM'], [valid, 0]]);
  });

  it('keeps valid-PID liveness semantics for existing, missing, and inaccessible processes', () => {
    vi.spyOn(process, 'kill').mockImplementation((pid) => {
      if (pid === 101) throw gone;
      if (pid === 102) throw Object.assign(new Error('Not permitted'), { code: 'EPERM' });
      return true;
    });
    assert.equal(isProcessAlive(100), true);
    assert.equal(isProcessAlive(101), false);
    assert.equal(isProcessAlive(102), true);
  });

  it('keeps valid process trees sorted and handles repeated roots and cycles', () => {
    assert.deepEqual(collectProcessTreePids([
      { pid: 100, ppid: 200, command: 'root' },
      { pid: 200, ppid: 100, command: 'child' },
    ], [100, 100]), [200, 100]);
  });
});

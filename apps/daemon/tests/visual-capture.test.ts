import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { writeFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { captureDesignJuryViewports } from '../src/critique/visual-capture.js';

function png(width: number, height: number): Buffer {
  const result = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(result);
  result.writeUInt32BE(width, 16);
  result.writeUInt32BE(height, 20);
  return result;
}

function mockCommand(failAt = -1, hangAt = -1): void {
  spawnMock.mockReset();
  let commandIndex = 0;
  let hangingChild: { kill: () => void } | null = null;
  spawnMock.mockImplementation((_bin: string, _args: string[], options: { signal?: AbortSignal }) => {
    const index = commandIndex++;
    const child = new EventEmitter() as EventEmitter & {
      pid: number;
      stdin: Writable;
      stdout: PassThrough;
      stderr: PassThrough;
      kill: () => void;
    };
    child.pid = 0;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    let stdinText = '';
    child.stdin = new Writable({
      write(chunk, _encoding, callback) { stdinText += String(chunk); callback(); },
      final(callback) {
        setImmediate(() => {
          if (index === hangAt) {
            hangingChild = child;
            callback();
            return;
          }
          if (index === failAt) {
            child.stdout.write('{"error":"batch failed"}');
            child.emit('close', 1, null);
            callback();
            return;
          }
          let output = '[]';
          if (stdinText) {
            const batch = JSON.parse(stdinText) as Array<Array<string | number>>;
            const setViewport = batch.find(([command, action]) => command === 'set' && action === 'viewport');
            if (setViewport) expect(setViewport).toEqual(['set', 'viewport', expect.any(String), expect.any(String), '1']);
            const evalCommand = batch.find(([command]) => command === 'eval');
            const screenshotCommand = batch.find(([command]) => command === 'screenshot');
            if (evalCommand) {
              const width = Number(setViewport?.[2]);
              const height = Number(setViewport?.[3]);
              output = JSON.stringify({ result: JSON.stringify({
                viewport: { width, height },
                document: { scrollWidth: width, clientWidth: width, horizontalOverflow: false },
                landmarks: [], controls: [],
              }) });
            }
            if (screenshotCommand) {
              const path = String(screenshotCommand[1]);
              writeFileSync(path, png(Number(setViewport?.[2]), Number(setViewport?.[3])));
            }
          }
          child.stdout.write(output);
          child.emit('close', 0, null);
          callback();
        });
      },
    });
    child.kill = () => child.emit('close', null, 'SIGTERM');
    return child;
  });
}

describe('captureDesignJuryViewports', () => {
  it('captures all required sizes and closes only its scoped session', async () => {
    mockCommand();
    const result = await captureDesignJuryViewports({
      runId: '0e5676df-9e33-4c95-bfa3-beac60612597',
      url: 'http://127.0.0.1:7456/api/projects/p/preview/s/file/index.html',
    });
    expect(result.captures.map(({ width, height }) => [width, height])).toEqual([[390, 844], [1024, 768], [1280, 800]]);
    expect(spawnMock).toHaveBeenCalledTimes(6);
    expect(spawnMock.mock.calls.at(-1)?.[1]).toContain('close');
    expect(spawnMock.mock.calls.every(([, args]) => !args.includes('--all'))).toBe(true);
    for (const [, args] of spawnMock.mock.calls) {
      const session = args[args.indexOf('--session') + 1];
      expect(session).toMatch(/^od-visual-jury-odj-[a-f0-9]{12}$/u);
      expect(session!.length).toBeLessThan(40);
      expect(args[args.indexOf('--namespace') + 1]).toBe('odj');
    }
  });

  it('closes the run-scoped browser session after a batch failure', async () => {
    mockCommand(1);
    await expect(captureDesignJuryViewports({
      runId: 'run-fail',
      url: 'http://localhost:7456/api/projects/p/preview/s/index.html',
    })).rejects.toThrow('stdout: {"error":"batch failed"}');
    expect(spawnMock).toHaveBeenCalledTimes(3);
    expect(spawnMock.mock.calls.at(-1)?.[1]).toContain('close');
  });

  it('kills the active command on run abort and still closes the scoped session', async () => {
    mockCommand(-1, 1);
    const controller = new AbortController();
    const capture = captureDesignJuryViewports({
      runId: 'run-abort',
      url: 'http://127.0.0.1:7456/api/projects/p/preview/s/index.html',
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(2));
    controller.abort();
    await expect(capture).rejects.toThrow('visual capture canceled');
    expect(spawnMock.mock.calls.at(-1)?.[1]).toContain('close');
  });
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  execFileMock,
  listProcessSnapshotsMock,
  stopProcessesMock,
} = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  listProcessSnapshotsMock: vi.fn(),
  stopProcessesMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({ execFile: execFileMock }));
vi.mock('@open-design/platform', async (importOriginal) => ({
  ...await importOriginal<typeof import('@open-design/platform')>(),
  listProcessSnapshots: listProcessSnapshotsMock,
  stopProcesses: stopProcessesMock,
}));

import { runVelaCommand } from '../../src/integrations/vela-command.js';
import {
  runVelaResourceBatchCommand,
  runVelaResourceCommand,
} from '../../src/collab/vela-cli-resource-adapter.js';

function stoppedResult(
  matchedPids: number[],
  forcedPids: number[] = [],
) {
  return {
    alreadyStopped: false,
    forcedPids,
    matchedPids,
    remainingPids: [],
    stoppedPids: matchedPids,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('runVelaCommand', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    listProcessSnapshotsMock.mockReset();
    stopProcessesMock.mockReset();
    listProcessSnapshotsMock.mockResolvedValue([]);
    stopProcessesMock.mockResolvedValue(stoppedResult([4321]));
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string) => void,
      ) => {
        callback(null, '{"ok":true}\n');
        return { pid: 4321 };
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('uses the configured AMR binary and feature-test login profile', async () => {
    const stdout = await runVelaCommand(['resource', 'head', 'project-1'], {
      env: {
        ...process.env,
        VELA_BIN: process.execPath,
        OPEN_DESIGN_AMR_PROFILE: 'feature-test',
        OD_DATA_DIR: '',
      },
    });

    expect(stdout).toBe('{"ok":true}\n');
    const [command, args, options] = execFileMock.mock.calls[0] as [
      string,
      string[],
      { env: NodeJS.ProcessEnv },
    ];
    expect(command).toBe(process.execPath);
    expect(args).toEqual(['resource', 'head', 'project-1']);
    expect(options.env.VELA_PROFILE).toBe('feature-test');
    expect(options.env.AMR_CLIENT_SOURCE).toBe('open_design');
  });

  it('delivers successful stderr diagnostics without changing stdout', async () => {
    const onStderr = vi.fn(() => {
      throw new Error('diagnostic observer failed');
    });
    execFileMock.mockImplementationOnce(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        callback: (
          error: Error | null,
          stdout: string,
          stderr: string,
        ) => void,
      ) => {
        callback(
          null,
          '{"version":3}\n',
          '{"event":"resource_pull_profile","schemaVersion":1}\n',
        );
        return { pid: 4321 };
      },
    );

    await expect(
      runVelaCommand(['resource', 'pull', 'project-1'], {
        env: {
          ...process.env,
          VELA_BIN: process.execPath,
          OD_DATA_DIR: '',
        },
        onStderr,
      }),
    ).resolves.toBe('{"version":3}\n');
    expect(onStderr).toHaveBeenCalledWith(
      '{"event":"resource_pull_profile","schemaVersion":1}\n',
    );
  });

  it('streams batch request JSON over stdin instead of the command line', async () => {
    const stdin = { on: vi.fn(), end: vi.fn() };
    execFileMock.mockImplementationOnce(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        callback: (error: Error | null, stdout: string) => void,
      ) => {
        callback(null, '{"results":[]}\n');
        return { pid: 4321, stdin };
      },
    );
    vi.stubEnv('VELA_BIN', process.execPath);
    vi.stubEnv('OD_DATA_DIR', '');

    await runVelaResourceBatchCommand(
      [{
        key: 'plugin-1',
        kind: 'plugin',
        resourceId: 'hub-plugin-1',
        dir: '/staging/plugin-1',
        ref: 'published',
      }],
      'workspace-1',
    );

    expect(execFileMock.mock.calls[0]?.[1]).toEqual([
      'resource',
      'pull-batch',
      '--requests-file',
      '-',
      '--json',
    ]);
    expect(stdin.end).toHaveBeenCalledWith(JSON.stringify({
      requests: [{
        key: 'plugin-1',
        kind: 'plugin',
        resourceId: 'hub-plugin-1',
        dir: '/staging/plugin-1',
        ref: 'published',
      }],
    }));
    const options = execFileMock.mock.calls[0]?.[2] as {
      env: NodeJS.ProcessEnv;
    };
    expect(options.env.VELA_WORKSPACE_ID).toBe('workspace-1');
  });

  it('keeps the Settings-backed AMR binary authoritative over inherited VELA_BIN', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'od-vela-command-'));
    try {
      writeFileSync(
        path.join(dataDir, 'app-config.json'),
        JSON.stringify({
          agentCliEnv: { amr: { VELA_BIN: process.execPath } },
        }),
      );

      await runVelaCommand(['team-projects', 'list'], {
        env: {
          ...process.env,
          VELA_BIN: '/missing/inherited/vela',
          OD_DATA_DIR: dataDir,
        },
      });

      expect(execFileMock.mock.calls[0]?.[0]).toBe(process.execPath);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('lets explicit per-command configuration override inherited resolution', async () => {
    await runVelaCommand(['billing', 'summary'], {
      env: {
        ...process.env,
        VELA_BIN: '/missing/inherited/vela',
        OD_DATA_DIR: '',
      },
      configuredEnv: { VELA_BIN: process.execPath },
    });

    expect(execFileMock.mock.calls[0]?.[0]).toBe(process.execPath);
  });

  it('hard-terminates an ignored-SIGTERM process tree before rejecting a deadline', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let callback!: (error: Error | null, stdout: string) => void;
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        complete: (error: Error | null, stdout: string) => void,
      ) => {
        callback = complete;
        return { pid: 4321 };
      },
    );
    listProcessSnapshotsMock.mockResolvedValue([
      { command: 'vela', pid: 4321, ppid: 1 },
      { command: 'vela-worker', pid: 4322, ppid: 4321 },
    ]);
    const stopped = deferred<ReturnType<typeof stoppedResult>>();
    stopProcessesMock.mockReturnValue(stopped.promise);

    const command = runVelaCommand(['resource', 'pull', 'project-1'], {
      env: {
        ...process.env,
        VELA_BIN: process.execPath,
        OD_DATA_DIR: '',
      },
      timeoutMs: 50,
      terminationGraceMs: 25,
    });
    const rejected = vi.fn();
    void command.catch(rejected);

    await vi.advanceTimersByTimeAsync(50);
    expect(stopProcessesMock).toHaveBeenCalledWith([4322, 4321], {
      termGraceMs: 25,
      killGraceMs: 25,
    });
    callback(new Error('terminated'), '');
    await Promise.resolve();
    expect(rejected).not.toHaveBeenCalled();

    stopped.resolve(stoppedResult([4322, 4321], [4322, 4321]));
    await expect(command).rejects.toMatchObject({
      code: 'ETIMEDOUT',
      name: 'TimeoutError',
    });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'phase=completed reason=timeout timeoutMs=50 childPid=4321 forced=2 remaining=0',
      ),
    );
  });

  it('settles only once when callback, abort, and timeout race', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const controller = new AbortController();
    let callback!: (error: Error | null, stdout: string) => void;
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        complete: (error: Error | null, stdout: string) => void,
      ) => {
        callback = complete;
        return { pid: 4321 };
      },
    );
    const stopped = deferred<ReturnType<typeof stoppedResult>>();
    stopProcessesMock.mockReturnValue(stopped.promise);

    const command = runVelaCommand(['resource', 'pull', 'project-1'], {
      env: {
        ...process.env,
        VELA_BIN: process.execPath,
        OD_DATA_DIR: '',
      },
      timeoutMs: 50,
      signal: controller.signal,
    });
    const fulfilled = vi.fn();
    const rejected = vi.fn();
    void command.then(fulfilled, rejected);

    await vi.advanceTimersByTimeAsync(50);
    controller.abort(new Error('late abort'));
    callback(null, '{"version":2}\n');
    await Promise.resolve();
    expect(stopProcessesMock).toHaveBeenCalledTimes(1);
    expect(fulfilled).not.toHaveBeenCalled();
    expect(rejected).not.toHaveBeenCalled();

    stopped.resolve(stoppedResult([4321]));
    await expect(command).rejects.toMatchObject({
      code: 'ETIMEDOUT',
      name: 'TimeoutError',
    });
    expect(fulfilled).not.toHaveBeenCalled();
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it('aborts before spawn without launching a child', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));

    await expect(runVelaCommand(['resource', 'pull', 'project-1'], {
      env: {
        ...process.env,
        VELA_BIN: process.execPath,
        OD_DATA_DIR: '',
      },
      signal: controller.signal,
    })).rejects.toMatchObject({
      code: 'ABORT_ERR',
      name: 'AbortError',
    });
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('waits for confirmed termination when an active command is aborted', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const controller = new AbortController();
    let callback!: (error: Error | null, stdout: string) => void;
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        complete: (error: Error | null, stdout: string) => void,
      ) => {
        callback = complete;
        return { pid: 4321 };
      },
    );
    const stopped = deferred<ReturnType<typeof stoppedResult>>();
    stopProcessesMock.mockReturnValue(stopped.promise);
    const command = runVelaCommand(['resource', 'pull', 'project-1'], {
      env: {
        ...process.env,
        VELA_BIN: process.execPath,
        OD_DATA_DIR: '',
      },
      signal: controller.signal,
    });
    const rejected = vi.fn();
    void command.catch(rejected);

    controller.abort(new Error('cancelled'));
    callback(null, '{"version":2}\n');
    await Promise.resolve();
    expect(rejected).not.toHaveBeenCalled();

    stopped.resolve(stoppedResult([4321]));
    await expect(command).rejects.toMatchObject({
      code: 'ABORT_ERR',
      name: 'AbortError',
    });
  });

  it('bounds pulls at 30s, batch pulls at 2 minutes, metadata at 60s, and pushes at 10 minutes', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('VELA_BIN', process.execPath);
    vi.stubEnv('OD_DATA_DIR', '');
    let callback!: (error: Error | null, stdout: string) => void;
    execFileMock.mockImplementation(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        complete: (error: Error | null, stdout: string) => void,
      ) => {
        callback = complete;
        return { pid: 4321 };
      },
    );

    // A head that answers within its metadata budget resolves normally…
    const head = runVelaResourceCommand([
      'head',
      'resource-1',
      '--ref',
      'published',
      '--json',
    ], 'workspace-1');
    await vi.advanceTimersByTimeAsync(59_999);
    expect(stopProcessesMock).not.toHaveBeenCalled();
    callback(null, '{"version":1}\n');
    await expect(head).resolves.toBe('{"version":1}\n');

    // …while a wedged head is reaped right at the 60s budget.
    const wedgedHead = runVelaResourceCommand([
      'head',
      'resource-1',
      '--ref',
      'published',
      '--json',
    ], 'workspace-1');
    const wedgedHeadRejection = expect(wedgedHead).rejects.toMatchObject({
      code: 'ETIMEDOUT',
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(stopProcessesMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(stopProcessesMock).toHaveBeenCalledTimes(1);
    await wedgedHeadRejection;

    // A wedged push gets the slow-uplink budget: reaped at 10 minutes, so a
    // hung CLI can no longer pin the scheduler's in-flight publish forever.
    const push = runVelaResourceCommand([
      'push',
      'project',
      'resource-1',
      '/tmp/project-1',
      '--ref',
      'published',
      '--json',
    ], 'workspace-1');
    const pushRejection = expect(push).rejects.toMatchObject({
      code: 'ETIMEDOUT',
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(599_999);
    expect(stopProcessesMock).toHaveBeenCalledTimes(1); // still only the wedged head
    await vi.advanceTimersByTimeAsync(1);
    expect(stopProcessesMock).toHaveBeenCalledTimes(2);
    await pushRejection;

    // Pull keeps its original 30s materialization budget.
    const pull = runVelaResourceCommand([
      'pull',
      'project',
      'resource-1',
      '/tmp/project-1',
      '--ref',
      'published',
      '--json',
    ], 'workspace-1');
    const pullRejection = expect(pull).rejects.toMatchObject({
      code: 'ETIMEDOUT',
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(stopProcessesMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(stopProcessesMock).toHaveBeenCalledTimes(3);
    await pullRejection;

    // A batch amortizes work across many destinations, so it gets a larger
    // aggregate budget without becoming unbounded.
    const batch = runVelaResourceBatchCommand(
      [{
        key: 'plugin-1',
        kind: 'plugin',
        resourceId: 'resource-1',
        dir: '/tmp/plugin-1',
        ref: 'published',
      }],
      'workspace-1',
    );
    const batchRejection = expect(batch).rejects.toMatchObject({
      code: 'ETIMEDOUT',
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(119_999);
    expect(stopProcessesMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(stopProcessesMock).toHaveBeenCalledTimes(4);
    await batchRejection;

    // The budgets ride the daemon's confirmed-kill deadline timer, never
    // execFile's own timeout/signal plumbing.
    const options = execFileMock.mock.calls[0]?.[2] as {
      timeout?: number;
      signal?: AbortSignal;
    };
    expect(options.timeout).toBeUndefined();
    expect(options.signal).toBeUndefined();
  });

  it('enables Vela pull profiling only behind the OD opt-in', async () => {
    vi.stubEnv('OD_COLLAB_PULL_PROFILE', '1');
    vi.stubEnv('VELA_BIN', process.execPath);
    vi.stubEnv('OD_DATA_DIR', '');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    execFileMock.mockImplementationOnce(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        callback: (
          error: Error | null,
          stdout: string,
          stderr: string,
        ) => void,
      ) => {
        callback(
          null,
          '{"version":3}\n',
          `${JSON.stringify({
            event: 'resource_pull_profile',
            schemaVersion: 1,
            startedAt: '2026-07-26T00:00:00.000Z',
            finishedAt: '2026-07-26T00:00:02.500Z',
            success: true,
            kind: 'project',
            resourceId: 'project-content-project-1',
            ref: 'published',
            totalMs: 2500,
            phases: [],
          })}\n`,
        );
        return { pid: 4321 };
      },
    );

    await expect(
      runVelaResourceCommand([
        'pull',
        'project',
        'project-content-project-1',
        '/tmp/project-1',
        '--ref',
        'published',
        '--json',
      ], 'workspace-1'),
    ).resolves.toBe('{"version":3}\n');

    const options = execFileMock.mock.calls[0]?.[2] as {
      env: NodeJS.ProcessEnv;
    };
    expect(options.env.VELA_RESOURCE_PULL_PROFILE).toBe('1');
    expect(info).toHaveBeenCalledWith(
      expect.stringContaining('"phase":"vela-child-done"'),
    );
  });

  it('does not force Vela profiling or log stderr by default', async () => {
    vi.stubEnv('OD_COLLAB_PULL_PROFILE', '');
    vi.stubEnv('VELA_RESOURCE_PULL_PROFILE', '');
    vi.stubEnv('VELA_BIN', process.execPath);
    vi.stubEnv('OD_DATA_DIR', '');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    execFileMock.mockImplementationOnce(
      (
        _command: string,
        _args: string[],
        _options: unknown,
        callback: (
          error: Error | null,
          stdout: string,
          stderr: string,
        ) => void,
      ) => {
        callback(
          null,
          '{"version":3}\n',
          '{"event":"resource_pull_profile","schemaVersion":1}\n',
        );
        return { pid: 4321 };
      },
    );

    await runVelaResourceCommand([
      'pull',
      'project',
      'project-content-project-1',
      '/tmp/project-1',
      '--ref',
      'published',
      '--json',
    ], 'workspace-1');

    const options = execFileMock.mock.calls[0]?.[2] as {
      env: NodeJS.ProcessEnv;
    };
    expect(options.env.VELA_RESOURCE_PULL_PROFILE).not.toBe('1');
    expect(info).not.toHaveBeenCalled();
  });
});

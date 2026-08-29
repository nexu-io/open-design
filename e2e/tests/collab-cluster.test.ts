import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolsDevSuite } from '@/tools-dev/types';

const runtimeMocks = vi.hoisted(() => ({
  createToolsDevSuite: vi.fn(),
  workspaceRoot: '',
}));

vi.mock('../lib/tools-dev/runtime.ts', () => ({
  createToolsDevSuite: runtimeMocks.createToolsDevSuite,
  e2eWorkspaceRoot: () => runtimeMocks.workspaceRoot,
}));

import { createCollabCluster } from '@/playwright/collab-cluster';

type RuntimeMock = ToolsDevSuite & {
  logs: ReturnType<typeof vi.fn>;
  startWeb: ReturnType<typeof vi.fn>;
  stopWeb: ReturnType<typeof vi.fn>;
};

type ContextMock = BrowserContext & {
  addInitScript: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  newPage: ReturnType<typeof vi.fn>;
};

beforeEach(async () => {
  runtimeMocks.workspaceRoot = await mkdtemp(join(tmpdir(), 'open-design-collab-cluster-'));
});

afterEach(async () => {
  vi.clearAllMocks();
  await rm(runtimeMocks.workspaceRoot, { force: true, recursive: true });
  runtimeMocks.workspaceRoot = '';
});

describe('createCollabCluster acquisition cleanup', () => {
  it('starts and stops isolated client runtimes concurrently', async () => {
    const firstRuntime = runtime('first');
    const secondRuntime = runtime('second');
    const firstStart = deferred<unknown>();
    const firstStop = deferred<unknown>();
    firstRuntime.startWeb.mockImplementationOnce(() => firstStart.promise);
    firstRuntime.stopWeb.mockImplementationOnce(() => firstStop.promise);
    runtimeMocks.createToolsDevSuite
      .mockReturnValueOnce(firstRuntime)
      .mockReturnValueOnce(secondRuntime);

    const browser = {
      newContext: vi.fn()
        .mockResolvedValueOnce(contextWithPage())
        .mockResolvedValueOnce(contextWithPage()),
    } as unknown as Browser;

    const clusterPromise = createCollabCluster(browser, info('passed'), specs());
    let startAssertion: unknown;
    try {
      await vi.waitFor(() => expect(secondRuntime.startWeb).toHaveBeenCalledTimes(1), {
        timeout: 1_000,
      });
    } catch (error) {
      startAssertion = error;
    } finally {
      firstStart.resolve({});
    }
    const cluster = await clusterPromise;
    if (startAssertion) throw startAssertion;

    const closePromise = cluster.close();
    let stopAssertion: unknown;
    try {
      await vi.waitFor(() => expect(secondRuntime.stopWeb).toHaveBeenCalledTimes(1), {
        timeout: 1_000,
      });
    } catch (error) {
      stopAssertion = error;
    } finally {
      firstStop.resolve(undefined);
    }
    await closePromise;
    if (stopAssertion) throw stopAssertion;
  });

  it('closes a successful cluster exactly once and removes its allocated root', async () => {
    const firstRuntime = runtime('first');
    const secondRuntime = runtime('second');
    runtimeMocks.createToolsDevSuite
      .mockReturnValueOnce(firstRuntime)
      .mockReturnValueOnce(secondRuntime);

    const firstContext = contextWithPage();
    const secondContext = contextWithPage();
    const browser = {
      newContext: vi.fn()
        .mockResolvedValueOnce(firstContext)
        .mockResolvedValueOnce(secondContext),
    } as unknown as Browser;
    const testInfo = info('passed');

    const cluster = await createCollabCluster(browser, testInfo, specs());
    const firstSpec = runtimeMocks.createToolsDevSuite.mock.calls[0]![0];
    const secondSpec = runtimeMocks.createToolsDevSuite.mock.calls[1]![0];
    const clusterRoot = dirname(firstSpec.root);

    expect(firstSpec.root).not.toBe(secondSpec.root);
    expect(firstSpec.root).toContain(runtimeMocks.workspaceRoot);
    expect(secondSpec.root).toContain(runtimeMocks.workspaceRoot);
    expect(firstSpec.dataDir).toBe(join(firstSpec.root, 'scratch', 'data'));
    expect(secondSpec.dataDir).toBe(join(secondSpec.root, 'scratch', 'data'));
    // Isolated cluster contexts never pass through the suite fixture, so
    // campaign dismissal must be seeded on each newContext result — and
    // before newPage, so the init script is installed for the first load.
    expect(firstContext.addInitScript).toHaveBeenCalledTimes(1);
    expect(secondContext.addInitScript).toHaveBeenCalledTimes(1);
    expect(firstContext.addInitScript.mock.invocationCallOrder[0]).toBeLessThan(
      firstContext.newPage.mock.invocationCallOrder[0]!,
    );
    expect(secondContext.addInitScript.mock.invocationCallOrder[0]).toBeLessThan(
      secondContext.newPage.mock.invocationCallOrder[0]!,
    );

    await cluster.close();
    await cluster.close();

    expect(firstContext.close).toHaveBeenCalledTimes(1);
    expect(secondContext.close).toHaveBeenCalledTimes(1);
    expect(firstRuntime.stopWeb).toHaveBeenCalledTimes(1);
    expect(secondRuntime.stopWeb).toHaveBeenCalledTimes(1);
    expect(testInfo.attach).not.toHaveBeenCalled();
    await expect(stat(clusterRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('stops the current and prior runtimes when browser context creation fails', async () => {
    const originalError = new Error('new context failed');
    const firstRuntime = runtime('first');
    const secondRuntime = runtime('second');
    runtimeMocks.createToolsDevSuite
      .mockReturnValueOnce(firstRuntime)
      .mockReturnValueOnce(secondRuntime);

    const firstContext = contextWithPage();
    const browser = {
      newContext: vi.fn()
        .mockResolvedValueOnce(firstContext)
        .mockRejectedValueOnce(originalError),
    } as unknown as Browser;
    const testInfo = info();
    vi.mocked(testInfo.attach).mockRejectedValue(new Error('attach failed'));

    await expect(createCollabCluster(browser, testInfo, specs())).rejects.toBe(originalError);

    expect(firstContext.close).toHaveBeenCalledTimes(1);
    expect(firstRuntime.stopWeb).toHaveBeenCalledTimes(1);
    expect(secondRuntime.stopWeb).toHaveBeenCalledTimes(1);
  });

  it('closes a partially created context when runtime logs cannot be serialized', async () => {
    const originalError = new Error('new page failed');
    const firstRuntime = runtime('first');
    const secondRuntime = runtime('second');
    const circularLogs: Record<string, unknown> = {};
    circularLogs.self = circularLogs;
    secondRuntime.logs.mockResolvedValue(circularLogs);
    runtimeMocks.createToolsDevSuite
      .mockReturnValueOnce(firstRuntime)
      .mockReturnValueOnce(secondRuntime);

    const firstContext = contextWithPage();
    const secondContext = contextWithPage(originalError);
    const browser = {
      newContext: vi.fn()
        .mockResolvedValueOnce(firstContext)
        .mockResolvedValueOnce(secondContext),
    } as unknown as Browser;
    const testInfo = info();

    await expect(createCollabCluster(browser, testInfo, specs())).rejects.toBe(originalError);

    expect(firstContext.close).toHaveBeenCalledTimes(1);
    expect(secondContext.close).toHaveBeenCalledTimes(1);
    expect(firstRuntime.stopWeb).toHaveBeenCalledTimes(1);
    expect(secondRuntime.stopWeb).toHaveBeenCalledTimes(1);
  });
});

function runtime(id: string): RuntimeMock {
  return {
    logs: vi.fn().mockResolvedValue({ daemon: { lines: [id], logPath: `${id}.log` } }),
    startWeb: vi.fn().mockResolvedValue({}),
    stopWeb: vi.fn().mockResolvedValue(undefined),
    url: { web: () => `http://${id}.example.test` },
  } as unknown as RuntimeMock;
}

function contextWithPage(error?: Error): ContextMock {
  return {
    addInitScript: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    newPage: error
      ? vi.fn().mockRejectedValue(error)
      : vi.fn().mockResolvedValue({} as Page),
  } as unknown as ContextMock;
}

function info(status: TestInfo['status'] = 'failed'): TestInfo {
  return {
    attach: vi.fn().mockResolvedValue(undefined),
    expectedStatus: 'passed',
    status,
    titlePath: ['collab cluster cleanup'],
    workerIndex: 0,
  } as unknown as TestInfo;
}

function specs() {
  return [
    { id: 'first', env: { CLIENT: 'first' } },
    { id: 'second', env: { CLIENT: 'second' } },
  ] as const;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

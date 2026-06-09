import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProjectUiSurface } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMocks = vi.hoisted(() => ({
  alivePids: new Set<number>(),
  children: [] as Array<EventEmitter & { pid: number; unref: ReturnType<typeof vi.fn> }>,
  createConnection: vi.fn(),
  createServer: vi.fn(),
  nextPid: 900_000,
  nextPort: 49_000,
  readLogTail: vi.fn(async () => 'runtime log tail'),
  spawn: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: runtimeMocks.spawn,
}));

vi.mock('node:net', () => ({
  default: {
    createConnection: runtimeMocks.createConnection,
    createServer: runtimeMocks.createServer,
  },
}));

vi.mock('@open-design/platform', () => ({
  createCommandInvocation: (input: { command: string; args: string[]; env: NodeJS.ProcessEnv }) => input,
  isProcessAlive: (pid: number) => runtimeMocks.alivePids.has(pid),
  readLogTail: runtimeMocks.readLogTail,
}));

import {
  startProjectUiPreviewRuntime,
  stopAllProjectUiPreviewRuntimes,
} from '../src/project-ui-preview-runtime.js';

describe('project UI preview runtime lifecycle', () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    runtimeMocks.alivePids.clear();
    runtimeMocks.children.length = 0;
    runtimeMocks.nextPid = 900_000;
    runtimeMocks.nextPort = 49_000;
    runtimeMocks.readLogTail.mockClear();
    runtimeMocks.spawn.mockReset();
    runtimeMocks.createConnection.mockReset();
    runtimeMocks.createServer.mockReset();

    runtimeMocks.spawn.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        pid: number;
        unref: ReturnType<typeof vi.fn>;
      };
      child.pid = runtimeMocks.nextPid++;
      child.unref = vi.fn();
      runtimeMocks.alivePids.add(child.pid);
      runtimeMocks.children.push(child);
      return child;
    });
    runtimeMocks.createServer.mockImplementation(() => {
      const server = new EventEmitter() as EventEmitter & {
        address: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
        listen: ReturnType<typeof vi.fn>;
        unref: ReturnType<typeof vi.fn>;
      };
      const port = runtimeMocks.nextPort++;
      server.address = vi.fn(() => ({ address: '127.0.0.1', family: 'IPv4', port }));
      server.close = vi.fn((callback?: () => void) => {
        callback?.();
        return server;
      });
      server.listen = vi.fn((_port: number, _host: string, callback: () => void) => {
        callback();
        return server;
      });
      server.unref = vi.fn();
      return server;
    });
    runtimeMocks.createConnection.mockImplementation(connectingSocket);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await stopAllProjectUiPreviewRuntimes();
    runtimeMocks.alivePids.clear();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  async function makeRunnableProject(): Promise<{ projectRoot: string; stateRoot: string }> {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'od-preview-runtime-'));
    tempDirs.push(projectRoot);
    await mkdir(path.join(projectRoot, 'node_modules'), { recursive: true });
    await writeFile(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({
        scripts: { dev: 'vite --host 127.0.0.1' },
        dependencies: { vite: '6.0.0', react: '18.0.0' },
      }),
    );
    return { projectRoot, stateRoot: path.join(projectRoot, '.od') };
  }

  function surface(route: string): ProjectUiSurface {
    return {
      id: `src-main-tsx:${route}`,
      label: route,
      route,
      kind: 'react-app',
      confidence: 'medium',
      framework: 'Vite',
      entryFile: 'src/main.tsx',
      previewFile: 'index.html',
      previewRuntimeRoot: '',
      previewPath: route,
      previewStatus: 'source-mapped',
      sourceFiles: ['src/main.tsx'],
      styleFiles: [],
      scriptFiles: [],
      assetFiles: [],
      fontFiles: [],
      externalDependencies: [],
      reasons: ['test surface'],
      mtime: 1,
    };
  }

  function connectingSocket(): EventEmitter {
    const socket = socketStub();
    queueMicrotask(() => socket.emit('connect'));
    return socket;
  }

  function refusingSocket(): EventEmitter {
    const socket = socketStub();
    queueMicrotask(() => socket.emit('error', new Error('ECONNREFUSED')));
    return socket;
  }

  function socketStub(): EventEmitter {
    const socket = new EventEmitter() as EventEmitter & {
      destroy: ReturnType<typeof vi.fn>;
      setTimeout: ReturnType<typeof vi.fn>;
    };
    socket.destroy = vi.fn();
    socket.setTimeout = vi.fn();
    return socket;
  }

  it('reuses a timed-out but still-alive preview child instead of launching a duplicate', async () => {
    vi.useFakeTimers();
    const project = await makeRunnableProject();
    runtimeMocks.createConnection.mockImplementation(refusingSocket);

    const firstPreview = startProjectUiPreviewRuntime({
      projectId: 'project-1',
      projectRoot: project.projectRoot,
      stateRoot: project.stateRoot,
      surface: surface('/slow'),
    });
    await vi.waitFor(() => expect(runtimeMocks.createConnection).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(36_000);
    const first = await firstPreview;

    expect(first.status).toBe('failed');
    expect(first.error).toMatch(/timed out waiting for http:\/\/127\.0\.0\.1:49000/u);
    expect(runtimeMocks.spawn).toHaveBeenCalledTimes(1);
    expect(runtimeMocks.alivePids.has(runtimeMocks.children[0]!.pid)).toBe(true);

    runtimeMocks.createConnection.mockImplementation(connectingSocket);
    const second = await startProjectUiPreviewRuntime({
      projectId: 'project-1',
      projectRoot: project.projectRoot,
      stateRoot: project.stateRoot,
      surface: surface('/slow'),
    });

    expect(second).toEqual(
      expect.objectContaining({
        status: 'ready',
        runtimeRoot: '',
        baseUrl: expect.stringMatching(/^\/api\/projects\/project-1\/ui-preview\/proxy\/[a-f0-9]{32}$/u),
        url: expect.stringMatching(/^\/api\/projects\/project-1\/ui-preview\/proxy\/[a-f0-9]{32}\/slow$/u),
        upstreamBaseUrl: 'http://127.0.0.1:49000',
        route: '/slow',
      }),
    );
    expect(runtimeMocks.spawn).toHaveBeenCalledTimes(1);
  });

  it('returns route-specific URLs for concurrent requests sharing one starting runtime', async () => {
    const project = await makeRunnableProject();
    const sockets: EventEmitter[] = [];
    runtimeMocks.createConnection.mockImplementation(() => {
      const socket = socketStub();
      sockets.push(socket);
      return socket;
    });

    const firstPreview = startProjectUiPreviewRuntime({
      projectId: 'project-1',
      projectRoot: project.projectRoot,
      stateRoot: project.stateRoot,
      surface: surface('/alpha'),
    });
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    const secondPreview = startProjectUiPreviewRuntime({
      projectId: 'project-1',
      projectRoot: project.projectRoot,
      stateRoot: project.stateRoot,
      surface: surface('/beta'),
    });

    sockets[0]!.emit('connect');
    const [first, second] = await Promise.all([firstPreview, secondPreview]);

    expect(runtimeMocks.spawn).toHaveBeenCalledTimes(1);
    expect(first.status).toBe('ready');
    expect(second.status).toBe('ready');
    expect(first.url).toMatch(/\/alpha$/u);
    expect(second.url).toMatch(/\/beta$/u);
    expect(first.baseUrl).toBe(second.baseUrl);
    expect(first.upstreamBaseUrl).toBe(second.upstreamBaseUrl);
  });
});

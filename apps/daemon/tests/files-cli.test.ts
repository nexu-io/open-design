import type http from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createJsonIpcServer } from '@open-design/sidecar';
import { SIDECAR_ENV, SIDECAR_MESSAGES } from '@open-design/sidecar-proto';

import { startServer } from '../src/server.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const CLI_SRC = path.join(__dirname, '../src/cli.ts');
const TSX_CLI = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const execFileP = promisify(execFile);

describe('od files CLI', () => {
  let server: http.Server;
  let baseUrl: string;
  let shutdown: (() => Promise<void> | void) | undefined;
  const tempDirs: string[] = [];
  const sidecarServers: { close(): Promise<void> }[] = [];

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    baseUrl = started.url;
    server = started.server;
    shutdown = started.shutdown;
  });

  afterEach(async () => {
    for (const sidecar of sidecarServers.splice(0)) {
      await sidecar.close();
    }
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  afterAll(async () => {
    await Promise.resolve(shutdown?.());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function createProject() {
    const id = `files-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const resp = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name: id }),
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { project: { id: string } };
    return body.project.id;
  }

  async function writeText(projectId: string, name: string, content: string) {
    const resp = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    expect(resp.status).toBe(200);
  }

  async function runCli(
    args: string[],
    options: { env?: NodeJS.ProcessEnv; useDaemonUrl?: boolean } = {},
  ): Promise<{ stdout: string; stderr: string }> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...options.env,
    };
    if (options.useDaemonUrl !== false) {
      env.OD_DAEMON_URL = baseUrl;
    } else {
      delete env.OD_DAEMON_URL;
    }
    delete env.NODE_OPTIONS;

    return await execFileP(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
      cwd: path.join(__dirname, '..'),
      env,
      timeout: 20_000,
      maxBuffer: 10 * 1024 * 1024,
    }) as { stdout: string; stderr: string };
  }

  it('creates folders through sidecar-discovered daemon URL and emits JSON', async () => {
    const projectId = await createProject();
    const ipcRoot = mkdtempSync(path.join(tmpdir(), 'od-files-cli-ipc-'));
    tempDirs.push(ipcRoot);
    const socketPath = process.platform === 'win32'
      ? `\\\\.\\pipe\\open-design-files-cli-${process.pid}-${Date.now()}`
      : path.join(ipcRoot, 'daemon.sock');
    const sidecar = await createJsonIpcServer({
      socketPath,
      handler: (message) => {
        if (
          message != null &&
          typeof message === 'object' &&
          (message as { type?: unknown }).type === SIDECAR_MESSAGES.STATUS
        ) {
          return {
            pid: process.pid,
            state: 'running',
            updatedAt: new Date().toISOString(),
            url: baseUrl,
          };
        }
        throw new Error('unexpected IPC message');
      },
    });
    sidecarServers.push(sidecar);

    const created = await runCli(
      ['files', 'mkdir', projectId, 'assets/icons', '--json'],
      {
        useDaemonUrl: false,
        env: { [SIDECAR_ENV.IPC_PATH]: socketPath },
      },
    );

    const body = JSON.parse(created.stdout) as {
      folder: { path: string; type: 'dir'; mime: string };
    };
    expect(body.folder).toMatchObject({
      path: 'assets/icons',
      type: 'dir',
      mime: 'inode/directory',
    });
  });

  it('moves project files into folders and emits JSON', async () => {
    const projectId = await createProject();
    await writeText(projectId, 'index.html', '<main>Hello</main>');
    await runCli(['files', 'mkdir', projectId, 'pages']);

    const moved = await runCli([
      'files',
      'move',
      projectId,
      'index.html',
      'pages',
      '--json',
    ]);
    const moveBody = JSON.parse(moved.stdout) as {
      oldName: string;
      newName: string;
      folder: string;
      file: { name: string; path: string };
    };
    expect(moveBody).toMatchObject({
      oldName: 'index.html',
      newName: 'pages/index.html',
      folder: 'pages',
      file: { name: 'pages/index.html', path: 'pages/index.html' },
    });

    const read = await runCli(['files', 'read', projectId, 'pages/index.html']);
    expect(read.stdout).toBe('<main>Hello</main>');
  });
});

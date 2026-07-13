import type http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import url from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createJsonIpcServer } from '@open-design/sidecar';
import { SIDECAR_ENV, SIDECAR_MESSAGES, normalizeDaemonSidecarMessage } from '@open-design/sidecar-proto';

import { createAgentRuntimeEnv, startServer } from '../src/server.js';
import { resetDesktopAuthForTests, setDesktopAuthSecret } from '../src/desktop-auth.js';
import { mintImportTokenForCli } from '../src/sidecar/server.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const CLI_SRC = path.join(__dirname, '../src/cli.ts');
const TSX_CLI = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

describe('Phase 2C CLI wrappers', () => {
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
    resetDesktopAuthForTests();
  });

  afterAll(async () => {
    await Promise.resolve(shutdown?.());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function makeFolder(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'od-cli-phase2c-'));
    tempDirs.push(dir);
    return dir;
  }

  async function runCli(
    args: string[],
    options: { input?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {},
  ): Promise<{ stdout: string; stderr: string }> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      OD_DAEMON_URL: baseUrl,
      ...options.env,
    };
    delete env.NODE_OPTIONS;

    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
        cwd: path.join(__dirname, '..'),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`CLI timed out: od ${args.join(' ')}`));
      }, options.timeout ?? 20_000);

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        reject(new Error(`od ${args.join(' ')} exited ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
      });
      child.stdin.end(options.input ?? '');
    });
  }

  async function runCliExpectFailure(
    args: string[],
    options: { input?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {},
  ): Promise<{ code: number | null; stdout: string; stderr: string }> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      OD_DAEMON_URL: baseUrl,
      ...options.env,
    };
    delete env.NODE_OPTIONS;

    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
        cwd: path.join(__dirname, '..'),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`CLI timed out: od ${args.join(' ')}`));
      }, options.timeout ?? 20_000);

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          reject(new Error(`od ${args.join(' ')} unexpectedly exited 0\nstdout:\n${stdout}\nstderr:\n${stderr}`));
          return;
        }
        resolve({ code, stdout, stderr });
      });
      child.stdin.end(options.input ?? '');
    });
  }

  it('imports a folder and creates a conversation through the CLI', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');

    const imported = await runCli(['project', 'import', folder, '--name', 'CLI Import', '--json']);
    const importBody = JSON.parse(imported.stdout) as {
      project: { id: string; name: string; metadata?: { importedFrom?: string } };
      conversationId: string;
      entryFile: string | null;
    };

    expect(importBody.project.id).toBeTruthy();
    expect(importBody.project.name).toBe('CLI Import');
    expect(importBody.project.metadata?.importedFrom).toBe('folder');
    expect(importBody.conversationId).toBeTruthy();
    expect(importBody.entryFile).toBe('index.html');

    const created = await runCli([
      'conversation',
      'new',
      importBody.project.id,
      '--title',
      'Follow-up',
      '--json',
    ]);
    const conversationBody = JSON.parse(created.stdout) as {
      conversation: { id: string; projectId: string; title: string | null };
    };

    expect(conversationBody.conversation.id).toBeTruthy();
    expect(conversationBody.conversation.projectId).toBe(importBody.project.id);
    expect(conversationBody.conversation.title).toBe('Follow-up');
  });

  it('imports through CLI project import commands when desktop import auth gate is active', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');
    const secret = randomBytes(32);
    setDesktopAuthSecret(secret);

    try {
      const ipcRoot = makeFolder();
      const ipcPath = path.join(ipcRoot, 'daemon.sock');
      const sidecar = await createJsonIpcServer({
        socketPath: ipcPath,
        handler: async (message) => {
          const request = normalizeDaemonSidecarMessage(message);
          switch (request.type) {
            case SIDECAR_MESSAGES.STATUS:
              return { desktopAuthGateActive: true, state: 'running', url: baseUrl };
            case SIDECAR_MESSAGES.MINT_IMPORT_TOKEN:
              return mintImportTokenForCli(request.input.baseDir);
            default:
              throw new Error(`unexpected test IPC message: ${request.type}`);
          }
        },
      });
      sidecarServers.push(sidecar);

      const wrapperEnv = createAgentRuntimeEnv(
        { PATH: process.env.PATH, [SIDECAR_ENV.IPC_PATH]: ipcPath },
        baseUrl,
        null,
        process.execPath,
      );

      const imported = await runCli(
        ['project', 'import', `  ${folder}  `, '--name', 'Gated CLI Import', '--json'],
        { env: wrapperEnv },
      );
      const importBody = JSON.parse(imported.stdout) as {
        project: {
          id: string;
          name: string;
          metadata?: { importedFrom?: string; fromTrustedPicker?: boolean };
        };
        conversationId: string;
        entryFile: string | null;
      };

      expect(importBody.project.id).toBeTruthy();
      expect(importBody.project.name).toBe('Gated CLI Import');
      expect(importBody.project.metadata?.importedFrom).toBe('folder');
      expect(importBody.project.metadata?.fromTrustedPicker).toBe(true);
      expect(importBody.conversationId).toBeTruthy();
      expect(importBody.entryFile).toBe('index.html');

      const folderForImportFolder = makeFolder();
      await writeFile(path.join(folderForImportFolder, 'index.html'), '<!doctype html>');
      const importedFolder = await runCli(
        [
          'project',
          'import-folder',
          `  ${folderForImportFolder}  `,
          '--name',
          'Gated CLI Import Folder',
          '--json',
        ],
        { env: wrapperEnv },
      );
      const importFolderBody = JSON.parse(importedFolder.stdout) as {
        project: {
          id: string;
          name: string;
          metadata?: { importedFrom?: string; fromTrustedPicker?: boolean };
        };
        conversationId: string;
        entryFile: string | null;
      };

      expect(importFolderBody.project.id).toBeTruthy();
      expect(importFolderBody.project.name).toBe('Gated CLI Import Folder');
      expect(importFolderBody.project.metadata?.importedFrom).toBe('folder');
      expect(importFolderBody.project.metadata?.fromTrustedPicker).toBe(true);
      expect(importFolderBody.conversationId).toBeTruthy();
      expect(importFolderBody.entryFile).toBe('index.html');
    } finally {
      resetDesktopAuthForTests();
    }
  });

  it('preserves desktop-auth-pending when CLI token minting cannot reach sidecar IPC', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');
    setDesktopAuthSecret(randomBytes(32));
    setDesktopAuthSecret(null);

    const failed = await runCliExpectFailure(
      ['project', 'import', folder, '--name', 'Pending CLI Import', '--json'],
      { env: { [SIDECAR_ENV.IPC_PATH]: path.join(folder, 'missing-daemon.sock') } },
    );

    expect(failed.code).toBe(74);
    const envelope = JSON.parse(failed.stderr) as {
      error?: { code?: string; message?: string; data?: { retryable?: boolean } };
    };
    expect(envelope.error?.code).toBe('desktop-auth-pending');
    expect(envelope.error?.message).toMatch(/desktop auth required/i);
    expect(envelope.error?.data?.retryable).toBe(true);
  });

  it('preserves desktop-import-token-rejected when CLI token minting falls through to HTTP rejection', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'index.html'), '<!doctype html>');
    setDesktopAuthSecret(randomBytes(32));

    const failed = await runCliExpectFailure(
      ['project', 'import', folder, '--name', 'Rejected CLI Import', '--json'],
      { env: { [SIDECAR_ENV.IPC_PATH]: path.join(folder, 'missing-daemon.sock') } },
    );

    expect(failed.code).toBe(75);
    const envelope = JSON.parse(failed.stderr) as {
      error?: { code?: string; message?: string; data?: { details?: { reason?: string } } };
    };
    expect(envelope.error?.code).toBe('desktop-import-token-rejected');
    expect(envelope.error?.message).toMatch(/desktop import token rejected/i);
    expect(envelope.error?.data?.details?.reason).toMatch(/token missing/i);
  });

  it('prints unified diffs for project files and stdin comparisons', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'a.txt'), 'one\ntwo\n');
    await writeFile(path.join(folder, 'b.txt'), 'one\nthree\n');
    const imported = await runCli(['project', 'import', folder, '--json']);
    const importBody = JSON.parse(imported.stdout) as { project: { id: string } };

    const fileDiff = await runCli(['files', 'diff', importBody.project.id, 'a.txt', 'b.txt']);
    expect(fileDiff.stdout).toContain('--- a/a.txt');
    expect(fileDiff.stdout).toContain('+++ b/b.txt');
    expect(fileDiff.stdout).toContain('@@');
    expect(fileDiff.stdout).toContain('-two');
    expect(fileDiff.stdout).toContain('+three');

    const stdinDiff = await runCli(
      ['files', 'diff', importBody.project.id, 'a.txt', '--against', '-'],
      { input: 'one\nfour\n' },
    );
    expect(stdinDiff.stdout).toContain('--- a/a.txt');
    expect(stdinDiff.stdout).toContain('+++ b/-');
    expect(stdinDiff.stdout).toContain('-two');
    expect(stdinDiff.stdout).toContain('+four');
  });

  it('prints EOF-newline-only file diffs', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'with-newline.txt'), 'same\n');
    await writeFile(path.join(folder, 'without-newline.txt'), 'same');
    const imported = await runCli(['project', 'import', folder, '--json']);
    const importBody = JSON.parse(imported.stdout) as { project: { id: string } };

    const fileDiff = await runCli([
      'files',
      'diff',
      importBody.project.id,
      'with-newline.txt',
      'without-newline.txt',
    ]);

    expect(fileDiff.stdout).toContain('--- a/with-newline.txt');
    expect(fileDiff.stdout).toContain('+++ b/without-newline.txt');
    expect(fileDiff.stdout).toContain('\\ No newline at end of file');
    expect(fileDiff.stdout).toContain('-same');
    expect(fileDiff.stdout).toContain('+same');
  });

  it('prints CRLF-to-LF-only file diffs', async () => {
    const folder = makeFolder();
    await writeFile(path.join(folder, 'crlf.txt'), 'same\r\n');
    await writeFile(path.join(folder, 'lf.txt'), 'same\n');
    const imported = await runCli(['project', 'import', folder, '--json']);
    const importBody = JSON.parse(imported.stdout) as { project: { id: string } };

    const fileDiff = await runCli([
      'files',
      'diff',
      importBody.project.id,
      'crlf.txt',
      'lf.txt',
    ]);

    expect(fileDiff.stdout).toContain('--- a/crlf.txt');
    expect(fileDiff.stdout).toContain('+++ b/lf.txt');
    expect(fileDiff.stdout).toContain('-same\\r');
    expect(fileDiff.stdout).toContain('+same');
  });
});

describe('mintImportTokenForCli', () => {
  afterEach(() => {
    resetDesktopAuthForTests();
  });

  it('reports inactive when desktop import auth gate is dormant', () => {
    const result = mintImportTokenForCli('/tmp/open-design-cli-import');

    expect(result).toMatchObject({
      ok: false,
      code: 'DESKTOP_AUTH_INACTIVE',
      retryable: false,
    });
  });

  it('returns a desktop import token bound to a requested baseDir', () => {
    const secret = randomBytes(32);
    setDesktopAuthSecret(secret);

    const result = mintImportTokenForCli('/tmp/open-design-cli-import');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token).toMatch(/~/);
      expect(result.expiresAt).toMatch(/Z$/);
    }
  });
});

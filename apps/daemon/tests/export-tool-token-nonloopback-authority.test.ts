import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { closeDatabase, insertProject, openDatabase } from '../src/db.js';
import { startServer, type StartServerResult } from '../src/server.js';
import { PROJECT_EXPORT_TOOL_ENDPOINT, toolTokenRegistry } from '../src/tool-tokens.js';

const execFileP = promisify(execFile);
const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');
const daemonApiToken = 'nonloopback-daemon-api-token';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

type StartedServer = Pick<StartServerResult, 'server' | 'shutdown' | 'url'>;

function isStartedServer(value: unknown): value is StartedServer {
  return typeof value === 'object' && value !== null
    && typeof Reflect.get(value, 'server') === 'object'
    && typeof Reflect.get(value, 'shutdown') === 'function'
    && typeof Reflect.get(value, 'url') === 'string';
}

async function reachableNonLoopbackIpv4(): Promise<string> {
  const candidates: string[] = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) candidates.push(address.address);
    }
  }
  const failures: string[] = [];
  for (const address of [...new Set(candidates)].sort()) {
    const probe = http.createServer((_req, res) => {
      res.statusCode = 204;
      res.end();
    });
    try {
      await new Promise<void>((resolve, reject) => {
        probe.once('error', reject);
        probe.listen(0, address, resolve);
      });
      const bound = probe.address();
      if (!bound || typeof bound === 'string') throw new Error('probe did not bind a TCP port');
      const response = await fetch(`http://${address}:${bound.port}`);
      if (response.status === 204) return address;
      failures.push(`${address}: HTTP ${response.status}`);
    } catch (error) {
      failures.push(`${address}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (probe.listening) {
        await new Promise<void>((resolve) => probe.close(() => resolve()));
      }
    }
  }
  throw new Error(`no reachable non-loopback IPv4 interface: ${failures.join('; ')}`);
}

describe('od export non-loopback run-scoped authority', () => {
  let daemon: StartedServer;
  let daemonHost = '';
  let outputDir = '';
  const projectId = `project_${randomUUID()}`;
  const foreignProjectId = `project_${randomUUID()}`;

  beforeAll(async () => {
    outputDir = await mkdtemp(path.join(os.tmpdir(), 'od-export-tool-token-nonloopback-'));
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required by the daemon test harness');
    const db = openDatabase(process.cwd(), { dataDir });
    const now = Date.now();
    insertProject(db, {
      id: projectId,
      name: 'Non-loopback token export project',
      createdAt: now,
      updatedAt: now,
    });
    insertProject(db, {
      id: foreignProjectId,
      name: 'Foreign non-loopback export project',
      createdAt: now,
      updatedAt: now,
    });
    for (const id of [projectId, foreignProjectId]) {
      const projectDir = path.join(dataDir, 'projects', id);
      await mkdir(projectDir, { recursive: true });
      await writeFile(path.join(projectDir, 'index.html'), `<main>${id}</main>`);
    }

    daemonHost = await reachableNonLoopbackIpv4();
    vi.stubEnv('OD_API_TOKEN', daemonApiToken);
    const started = await startServer({
      port: 0,
      host: daemonHost,
      returnServer: true,
      desktopSlideRenderer: async (input) => {
        if (!input.outputDir) return { ok: false, error: 'outputDir required' };
        await mkdir(input.outputDir, { recursive: true });
        const output = path.join(input.outputDir, 'export.png');
        await writeFile(output, png);
        return { ok: true, slideFiles: [output], width: 1, height: 1, mode: 'page' };
      },
    });
    if (!isStartedServer(started)) throw new Error('daemon did not return its server handle');
    daemon = started;
    vi.stubEnv('OD_API_TOKEN', 'changed-after-server-start');
  });

  afterAll(async () => {
    toolTokenRegistry.clear();
    if (daemon) {
      await daemon.shutdown();
      daemon.server.closeAllConnections?.();
      await new Promise<void>((resolve) => daemon.server.close(() => resolve()));
    }
    closeDatabase();
    vi.unstubAllEnvs();
    await rm(outputDir, { recursive: true, force: true });
  });

  it('exports through the actual CLI with a valid tool token over a non-loopback daemon URL', async () => {
    // Given: the advertised daemon URL is a reachable non-loopback socket, and general API
    // requests from this peer still require the configured broad daemon credential.
    expect(new URL(daemon.url).hostname).toBe(daemonHost);
    const unauthenticated = await fetch(`${daemon.url}/api/projects`);
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toMatchObject({
      error: { code: 'API_TOKEN_REQUIRED' },
    });
    const token = toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
    }).token;
    const outputPath = path.join(outputDir, 'valid-tool-token.png');

    // When: the real wrapper runs with only its run-scoped token and advertised daemon URL.
    const result = await runExportCli(projectId, outputPath, token);

    // Then: the outer daemon-token middleware admits only this endpoint capability, and the
    // existing route authorization returns the renderer's exact bytes through the real CLI.
    expect(result.code, result.stderr).toBe(0);
    expect(await readFile(outputPath)).toEqual(png);
  });

  it('preserves the configured daemon API-token export lane over non-loopback HTTP', async () => {
    // Given: the daemon credential captured at startup is distinct from every run-scoped token.
    const response = await fetch(`${daemon.url}/api/projects/${projectId}/export/image`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${daemonApiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ fileName: 'index.html' }),
    });

    // When/Then: the matching broad token stays on project authorization and returns exact bytes.
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
  });

  it.each([
    ['invalid', (): string => 'forged-tool-token'],
    ['expired', (): string => toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
      nowMs: Date.now() - 120_000,
      ttlMs: 60_000,
    }).token],
    ['revoked', (): string => {
      const grant = toolTokenRegistry.mint({ projectId, runId: `run_${randomUUID()}` });
      toolTokenRegistry.revokeToken(grant.token);
      return grant.token;
    }],
    ['wrong endpoint', (): string => toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
      allowedEndpoints: ['/api/tools/media/generate'],
      allowedOperations: ['project:export'],
    }).token],
  ] as const)('rejects the %s credential at the non-loopback outer boundary', async (kind, token) => {
    // Given/When: an unusable or endpoint-inapplicable credential invokes the actual export CLI.
    const outputPath = path.join(outputDir, `${kind.replaceAll(' ', '-')}.png`);
    const result = await runExportCli(projectId, outputPath, token());

    // Then: it cannot bypass broad daemon auth or create an export.
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('API_TOKEN_REQUIRED');
    await expect(readFile(outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a missing project:export capability at the non-loopback outer boundary', async () => {
    // Given: a live exact-endpoint token that lacks the export operation.
    const token = toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
      allowedEndpoints: [PROJECT_EXPORT_TOOL_ENDPOINT],
      allowedOperations: ['media:generate'],
    }).token;

    // When: the actual CLI reaches the non-loopback daemon boundary.
    const result = await runExportCli(projectId, path.join(outputDir, 'wrong-operation.png'), token);

    // Then: it cannot bypass broad daemon auth or reach route work.
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('API_TOKEN_REQUIRED');
  });

  it('enforces the exact token project after outer preauthorization', async () => {
    // Given: a fully capable token bound to a different project.
    const token = toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
    }).token;

    // When: the actual CLI requests the foreign project.
    const result = await runExportCli(
      foreignProjectId,
      path.join(outputDir, 'wrong-project.png'),
      token,
    );

    // Then: route-level project matching remains fail-closed.
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('FORBIDDEN');
  });

  it('supports the generic run-scoped export endpoint over non-loopback HTTP', async () => {
    // Given: the shared project export capability is used by the generic raster export route.
    const token = toolTokenRegistry.mint({ projectId, runId: `run_${randomUUID()}` }).token;

    // When: a non-loopback caller requests the generic endpoint with only that capability.
    const response = await fetch(`${daemon.url}/api/projects/${projectId}/export`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ fileName: 'index.html', format: 'image' }),
    });

    // Then: it reaches the same route-level operation/project checks and returns exact bytes.
    expect(response.status, await response.clone().text()).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
  });

  it.each([
    ['GET screenshot path', 'GET', `/api/projects/${projectId}/export/image`],
    ['vector PDF path', 'POST', `/api/projects/${projectId}/export/pdf`],
  ] as const)('does not extend the run-scoped capability to the %s', async (_case, method, pathname) => {
    // Given: a valid token whose capability is limited to run-scoped raster export routes.
    const token = toolTokenRegistry.mint({ projectId, runId: `run_${randomUUID()}` }).token;

    // When: the credential is presented to a neighboring method or vector export route.
    const response = await fetch(`${daemon.url}${pathname}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify({ fileName: 'index.html' }) } : {}),
    });

    // Then: the outer daemon-token boundary refuses it before any route work runs.
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'API_TOKEN_REQUIRED' },
    });
  });

  it('does not extend an export token to a general non-loopback API route', async () => {
    // Given: a valid token carrying only the screenshot export endpoint capability.
    const token = toolTokenRegistry.mint({ projectId, runId: `run_${randomUUID()}` }).token;

    // When: it is presented to a different API route.
    const response = await fetch(`${daemon.url}/api/projects`, {
      headers: { authorization: `Bearer ${token}` },
    });

    // Then: the general daemon-token middleware remains unchanged.
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'API_TOKEN_REQUIRED' },
    });
  });

  async function runExportCli(
    requestedProjectId: string,
    outputPath: string,
    token: string,
  ): Promise<{ readonly code: number; readonly stderr: string; readonly stdout: string }> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_OPTIONS: '',
      OD_DAEMON_URL: daemon.url,
      OD_PROJECT_ID: requestedProjectId,
      OD_TOOL_TOKEN: token,
    };
    delete env.OD_API_TOKEN;
    try {
      const { stdout, stderr } = await execFileP(
        process.execPath,
        [
          tsxCli,
          cliEntry,
          'export',
          'index.html',
          '--project',
          requestedProjectId,
          '--format',
          'image',
          '--out',
          outputPath,
        ],
        { cwd: daemonRoot, env, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
      );
      return { code: 0, stdout, stderr };
    } catch (error) {
      const failure = typeof error === 'object' && error !== null ? error : {};
      const code = Reflect.get(failure, 'code');
      const stdout = Reflect.get(failure, 'stdout');
      const stderr = Reflect.get(failure, 'stderr');
      return {
        code: typeof code === 'number' ? code : 1,
        stdout: typeof stdout === 'string' ? stdout : '',
        stderr: typeof stderr === 'string' ? stderr : '',
      };
    }
  }
});

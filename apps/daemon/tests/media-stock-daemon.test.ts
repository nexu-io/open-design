import { runVelaCommand } from '../src/integrations/vela-command.js';
import type { StockSearchResponse } from '@open-design/contracts';
import { spawn } from 'node:child_process';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, insertProject, openDatabase } from '../src/db.js';
import { ensureProject } from '../src/projects.js';
import { startServer } from '../src/server.js';
import { stockTelemetryDir } from '../src/media/stock-telemetry.js';
import { toolTokenRegistry } from '../src/tool-tokens.js';
import { codexOpenDesignShellEnvironmentArgs } from '../src/runtimes/defs/codex.js';

// Explicit run proofs keep these HTTP fixtures faithful to the daemon's
// immutable scope contract; token minting alone does not create a Run.
const fixtureRuns = vi.hoisted(() => new Map<string, any>());
vi.mock('../src/runtimes/runs.js', async (original) => {
  const actual = await original<typeof import('../src/runtimes/runs.js')>();
  return { ...actual, createChatRunService: (...args: Parameters<typeof actual.createChatRunService>) => {
    const service = actual.createChatRunService(...args);
    const get = service.get;
    service.get = (id: string) => fixtureRuns.get(id) ?? get(id);
    return service;
  } };
});

vi.mock('../src/integrations/vela-command.js', async (original) => ({ ...await original<typeof import('../src/integrations/vela-command.js')>(), runVelaCommand: vi.fn() }));

const endpoint = '/api/tools/media/stock-search';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x20, 0x04, 0xb0, 0x03, 0x01, 0x22, 0x00]);
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const daemonRoot = fileURLToPath(new URL('..', import.meta.url));

describe('stock search daemon credential boundary', () => {
  let server: Server;
  let url: string;
  let projectId: string;
  let projectDir: string;
  let runId: string;
  let providerRequests: string[];
  let providerKeys: string[];

  beforeEach(async () => {
    projectId = `project_${randomUUID()}`;
    runId = `run_${randomUUID()}`;
    const dataDir = process.env.OD_DATA_DIR!;
    const db = openDatabase(process.cwd(), { dataDir });
    insertProject(db, { id: projectId, name: 'Stock credential regression', createdAt: Date.now(), updatedAt: Date.now() });
    projectDir = await ensureProject(path.join(dataDir, 'projects'), projectId);
    vi.stubEnv('PEXELS_API_KEY', 'daemon-only-stock-key');
    vi.stubEnv('PIXABAY_API_KEY', '');
    providerRequests = [];
    providerKeys = [];
    vi.mocked(runVelaCommand).mockImplementation(async (args, options) => {
      if (args[0] !== 'media' || args[1] !== 'stock-search') throw new Error('unsupported test command');
      providerRequests.push('company-stock-service');
      const request = JSON.parse(String(options?.input));
      expect(request).not.toHaveProperty('env');
      return JSON.stringify({ providers: ['pexels'], slots: request.slots.map((slot: { id: string }) => ({
        id: slot.id, status: 'ok', provider: 'pexels', attempts: [], alt: 'forest camping tent',
        download_url: 'https://images.pexels.com/1.jpeg', source_url: 'https://www.pexels.com/photo/1/', license: 'Pexels License',
      })) });
    });
    const nativeFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const address = String(input);
      if (!address.startsWith('https://api.pexels.com/') && !address.startsWith('https://images.pexels.com/')) {
        return nativeFetch(input, init);
      }
      providerRequests.push(address);
      if (address.startsWith('https://api.pexels.com/')) {
        providerKeys.push(new Headers(init?.headers).get('Authorization') ?? '');
        return Response.json({ photos: [{ id: 1, alt: 'forest camping tent', url: 'https://www.pexels.com/photo/1/', src: { original: 'https://images.pexels.com/1.jpeg' } }] });
      }
      return new Response(new Uint8Array(JPEG));
    });
    const started = await startServer({ port: 0, returnServer: true }) as { url: string; server: Server };
    server = started.server;
    url = started.url;
  });

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    toolTokenRegistry.clear();
    fixtureRuns.clear();
    closeDatabase();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const slots = [{ id: 'hero', query: 'forest camping tent', width: 900 }];
  const mint = (project: string, run: string) => {
    fixtureRuns.set(run, { id: run, projectId: project, workspaceScope: {
      schemaVersion: 1, projectId: project, workspaceId: null, source: 'unbound_account',
    } });
    return toolTokenRegistry.mint({ projectId: project, runId: run });
  };

  async function request(body: unknown, token?: string, target = endpoint) {
    return fetch(`${url}${target}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
    });
  }

  it('real CLI uses company service through the Codex shell allowlist and writes into the granted project', async () => {
    const grant = mint(projectId, runId);
    const policy = codexOpenDesignShellEnvironmentArgs().find((arg) => arg.startsWith('shell_environment_policy.include_only='))!;
    const allowed: string[] = JSON.parse(policy.split('=')[1]!);
    const parentEnv = { ...process.env, OD_DAEMON_URL: url, OD_TOOL_TOKEN: grant.token, OD_PROJECT_ID: projectId };
    const env = Object.fromEntries(Object.entries(parentEnv).filter(([key]) => allowed.includes(key)));
    expect(env.PEXELS_API_KEY).toBeUndefined();
    expect(env.PIXABAY_API_KEY).toBeUndefined();
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', cli, 'media', 'stock-search', '--slots', JSON.stringify(slots)], { cwd: daemonRoot, env });
      let stdout = ''; let stderr = '';
      child.stdout.on('data', (data) => { stdout += data; });
      child.stderr.on('data', (data) => { stderr += data; });
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stdout, stderr }));
      child.stdin.end();
    });
    expect(result.code, result.stderr || result.stdout).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.slots[0]).toMatchObject({ status: 'ok', path: 'assets/stock/hero.jpg', width: 1200, height: 800 });
    expect(await readFile(path.join(projectDir, report.slots[0].path))).toEqual(JPEG);
    expect(providerKeys).toEqual([]);
    expect(providerRequests).toContain('company-stock-service');
    expect(JSON.stringify(result)).not.toContain('daemon-only-stock-key');
    const credits = JSON.parse(await readFile(path.join(projectDir, 'assets/stock/credits.json'), 'utf8'));
    expect(credits[0].path).toBe(report.slots[0].path);
    const journals = await readdir(stockTelemetryDir(process.env.OD_DATA_DIR!));
    const journal = journals.find((name) => name.startsWith(report.telemetry.callId) && name.endsWith('.jsonl'))!;
    const header = JSON.parse((await readFile(path.join(stockTelemetryDir(process.env.OD_DATA_DIR!), journal), 'utf8')).split('\n')[0]!);
    expect(header.context).toMatchObject({ project_id: projectId, run_id: runId });
  });

  it('requires a valid, explicitly scoped tool token before accessing the company service', async () => {
    expect((await request({ slots })).status).toBe(401);
    expect((await request({ slots }, 'invalid')).status).toBe(401);
    const grant = toolTokenRegistry.mint({ projectId, runId, allowedOperations: ['media:generate'] });
    expect((await request({ slots }, grant.token)).status).toBe(403);
    expect(providerRequests).toEqual([]);
  });

  it('does not let callers override the token project or supply execution paths or credentials', async () => {
    const grant = mint(projectId, runId);
    for (const extra of [{ projectId: 'another-project' }, { cwd: '/outside' }, { env: { PEXELS_API_KEY: 'caller-key' } }, { concurrency: 0 }]) {
      expect((await request({ slots, ...extra }, grant.token)).status).toBe(400);
    }
    expect((await request({ slots }, grant.token, '/api/projects/another-project/media/stock-search')).status).toBe(403);
    expect(providerRequests).toEqual([]);
  });

  it('rejects missing run proof and a pinned wallet that differs from the authorized project', async () => {
    const missing = toolTokenRegistry.mint({ projectId, runId: 'missing-run' });
    expect((await request({ slots }, missing.token)).status).toBe(403);
    const grant = mint(projectId, runId);
    fixtureRuns.get(runId).workspaceScope = {
      schemaVersion: 1, projectId, workspaceId: 'original-workspace', source: 'persisted_project_binding',
    };
    expect((await request({ slots }, grant.token)).status).toBe(403);
    expect(providerRequests).toEqual([]);
  });

  it('supports the local project surface and returns an explicit service-unavailable error', async () => {
    const response = await request({ slots }, undefined, `/api/projects/${projectId}/media/stock-search`);
    expect(response.status).toBe(200);
    expect(((await response.json()) as StockSearchResponse).slots[0]?.status).toBe('ok');
    vi.mocked(runVelaCommand).mockRejectedValue(new Error('service unavailable'));
    const missing = await request({ slots }, mint(projectId, runId).token);
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({ error: { code: 'STOCK_SEARCH_UNAVAILABLE' } });
  });

  it('rejects traversal and directory symlinks before any provider call', async () => {
    const grant = mint(projectId, runId);
    await symlink(process.env.OD_DATA_DIR!, path.join(projectDir, 'escape'));
    for (const outDir of ['../outside', '/outside', 'C:\\outside', 'escape']) {
      expect((await request({ slots, outDir }, grant.token)).status).toBe(400);
    }
    expect(providerRequests).toEqual([]);
  });

  it('does not overwrite an existing image symlink outside the project', async () => {
    const grant = mint(projectId, runId);
    const outside = path.join(process.env.OD_DATA_DIR!, `outside-${randomUUID()}.jpg`);
    await writeFile(outside, 'untouched');
    await mkdir(path.join(projectDir, 'images'));
    // Pre-existing output files are checked at the write boundary, too.
    await symlink(outside, path.join(projectDir, 'images', 'other.jpg'));
    const blocked = await request({ slots: [{ ...slots[0], id: 'other' }], outDir: 'images' }, grant.token);
    expect(((await blocked.json()) as StockSearchResponse).slots[0]?.status).toBe('error');
    expect(await readFile(outside, 'utf8')).toBe('untouched');
  });
});

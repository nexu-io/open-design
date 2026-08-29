import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  DesktopExportArtifactInput,
  DesktopExportArtifactResult,
  DesktopRenderSlidesInput,
  DesktopRenderSlidesResult,
} from '@open-design/sidecar-proto';
import {
  closeDatabase,
  ensureWorkspaceProject,
  insertProject,
  openDatabase,
} from '../src/db.js';
import { startServer } from '../src/server.js';
import { toolTokenRegistry } from '../src/tool-tokens.js';

const execFileP = promisify(execFile);
const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const rendererCss = Buffer.from('main { color: rgb(12, 34, 56); }\n');
const rendererImage = Buffer.from('renderer-image-exact-bytes');
const daemonApiToken = 'configured-daemon-api-token';
const legacyBaseHref = 'https://external.invalid/legacy/';
const rendererStylesheetPath = 'styles/export.css';
const rendererImagePath = 'assets/hero.png';

describe('od export run-scoped project authority', () => {
  let authorityServer: http.Server;
  let daemonShutdown: () => Promise<void> | void;
  let daemonUrl = '';
  let lastRendererAssetUrl = '';
  let rendererBlockingFile = '';
  let pendingRenderer: {
    readonly promise: Promise<DesktopRenderSlidesResult>;
    readonly signalInvocation: () => void;
  } | null = null;
  let outputDir = '';
  const projectId = `project_${randomUUID()}`;
  const foreignProjectId = `project_${randomUUID()}`;
  const unboundProjectId = `project_${randomUUID()}`;
  const workspaceId = `workspace_${randomUUID()}`;
  const memberId = `member_${randomUUID()}`;
  const boundProjectHtml = `<!doctype html><html><head><base href="${legacyBaseHref}"><link rel="stylesheet" href="${rendererStylesheetPath}"></head><body><main data-renderer-asset-authority>${projectId}</main><img src="${rendererImagePath}" alt=""></body></html>`;

  beforeAll(async () => {
    outputDir = await mkdtemp(path.join(os.tmpdir(), 'od-export-tool-token-'));
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required by the daemon test harness');
    const db = openDatabase(process.cwd(), { dataDir });
    const now = Date.now();
    insertProject(db, {
      id: projectId,
      name: 'Token-bound export project',
      createdAt: now,
      updatedAt: now,
    });
    insertProject(db, {
      id: foreignProjectId,
      name: 'Foreign export project',
      createdAt: now,
      updatedAt: now,
    });
    insertProject(db, {
      id: unboundProjectId,
      name: 'Unbound export project',
      createdAt: now,
      updatedAt: now,
    });
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId,
      visibility: 'team',
      createdByWorkspaceMemberId: memberId,
    });
    ensureWorkspaceProject(db, {
      projectId: foreignProjectId,
      workspaceId: 'foreign-workspace',
      visibility: 'team',
      createdByWorkspaceMemberId: 'foreign-member',
    });
    for (const id of [projectId, foreignProjectId, unboundProjectId]) {
      const projectDir = path.join(dataDir, 'projects', id);
      await mkdir(projectDir, { recursive: true });
      await writeFile(
        path.join(projectDir, 'index.html'),
        id === projectId
          ? boundProjectHtml
          : `<main>${id}</main>`,
      );
      if (id === projectId) {
        await mkdir(path.join(projectDir, 'styles'), { recursive: true });
        await mkdir(path.join(projectDir, 'assets'), { recursive: true });
        await writeFile(path.join(projectDir, 'styles', 'export.css'), rendererCss);
        await writeFile(path.join(projectDir, 'assets', 'hero.png'), rendererImage);
      }
    }

    authorityServer = http.createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        items: [
          {
            workspaceId: 'unrelated-workspace',
            workspaceName: 'Unrelated workspace',
            workspaceType: 'personal',
            workspaceMemberId: 'unrelated-member',
            role: 'owner',
            memberStatus: 'active',
            lifecycleState: 'active',
          },
          {
            workspaceId,
            workspaceName: 'Exact project workspace',
            workspaceType: 'team',
            workspaceMemberId: memberId,
            role: 'owner',
            memberStatus: 'active',
            lifecycleState: 'active',
          },
        ],
      }));
    });
    await new Promise<void>((resolve) => authorityServer.listen(0, '127.0.0.1', resolve));
    const authorityAddress = authorityServer.address();
    if (!authorityAddress || typeof authorityAddress === 'string') {
      throw new Error('authority server did not bind');
    }
    vi.stubEnv('OD_WORKSPACE_CONTEXT_SOURCE', 'vela');
    vi.stubEnv('VELA_CONTROL_KEY', 'test-control-key');
    vi.stubEnv('VELA_API_URL', `http://127.0.0.1:${authorityAddress.port}`);
    vi.stubEnv('OD_API_TOKEN', daemonApiToken);

    const renderer = (input: DesktopRenderSlidesInput): Promise<DesktopRenderSlidesResult> => {
      const pending = pendingRenderer;
      if (pending) {
        if (!input.outputDir) return Promise.resolve({ ok: false, error: 'outputDir required' });
        lastRendererAssetUrl = new URL('styles/export.css', input.baseHref).href;
        mkdirSync(input.outputDir, { recursive: true });
        rendererBlockingFile = path.join(input.outputDir, 'settled-render.png');
        execFileSync('mkfifo', [rendererBlockingFile]);
        pending.signalInvocation();
        return pending.promise;
      }
      return (async () => {
        if (!input.outputDir) return { ok: false, error: 'outputDir required' };
        if (input.html.includes('data-renderer-asset-authority')) {
          expect(input.html).toBe(boundProjectHtml);
          expect(input.baseHref).not.toBe(legacyBaseHref);
          lastRendererAssetUrl = new URL(rendererStylesheetPath, input.baseHref).href;
          const cssResponse = await fetch(lastRendererAssetUrl);
          const cssBytes = Buffer.from(await cssResponse.arrayBuffer());
          expect(cssResponse.status, cssBytes.toString()).toBe(200);
          expect(cssBytes).toEqual(rendererCss);
          const imageResponse = await fetch(new URL(rendererImagePath, input.baseHref));
          const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
          expect(imageResponse.status, imageBytes.toString()).toBe(200);
          expect(imageBytes).toEqual(rendererImage);
        }
        await mkdir(input.outputDir, { recursive: true });
        const file = path.join(input.outputDir, 'export.png');
        await writeFile(file, png);
        return { ok: true, slideFiles: [file], width: 1, height: 1, mode: 'page' };
      })();
    };
    const started = await startServer({
      port: 0,
      returnServer: true,
      desktopSlideRenderer: renderer,
    }) as { url: string; shutdown: () => Promise<void> | void };
    daemonUrl = started.url;
    daemonShutdown = started.shutdown;
    vi.stubEnv('OD_API_TOKEN', 'changed-after-server-start');
  });

  afterAll(async () => {
    await daemonShutdown?.();
    await new Promise<void>((resolve) => authorityServer.close(() => resolve()));
    toolTokenRegistry.clear();
    closeDatabase();
    vi.unstubAllEnvs();
    await rm(outputDir, { recursive: true, force: true });
  });

  it('accepts the configured daemon API token for screenshot export', async () => {
    // Given: the API token captured by the daemon at startup, before the env changed.
    const request = {
      method: 'POST',
      headers: {
        authorization: `Bearer ${daemonApiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ fileName: 'index.html' }),
    } as const;

    // When: the configured credential requests a screenshot export.
    const response = await fetch(`${daemonUrl}/api/projects/${unboundProjectId}/export/image`, request);
    const body = Buffer.from(await response.arrayBuffer());

    // Then: it remains on the daemon API-token lane and the export succeeds.
    expect(response.status, body.toString()).toBe(200);
    expect(body).toEqual(png);
  });

  it('exports the exact token-bound project without explicit workspace flags', async () => {
    // Given: a run-scoped token for a project bound to the second directory workspace.
    const token = toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
    }).token;
    const outputPath = path.join(outputDir, 'token-bound.png');

    // When: the documented spawned-agent wrapper command runs without workspace flags.
    const result = await runExportCli(projectId, outputPath, token);

    // Then: the exact project exports through its token authority.
    expect(result.code, result.stderr).toBe(0);
    expect(existsSync(outputPath)).toBe(true);
  });

  it('derives a bound project workspace without a tool token or workspace flags', async () => {
    // Given: Harness did not forward the short-lived bearer token into its nested shell tool.
    const outputPath = path.join(outputDir, 'project-id-bound.png');

    // When: the documented wrapper command identifies only the project and file.
    const result = await runExportCli(projectId, outputPath);

    // Then: the daemon derives the exact persisted project binding instead of
    // requiring the caller to know an active/default Workspace.
    expect(result.code, result.stderr).toBe(0);
    expect(existsSync(outputPath)).toBe(true);
  });

  it('accepts legacy workspace flags as ignored compatibility inputs', async () => {
    // Given: an older caller still supplies stale Workspace flags.
    const outputPath = path.join(outputDir, 'legacy-workspace-flags.png');

    // When: it exports after the CLI contract has moved to project-id-only addressing.
    const result = await runExportCli(projectId, outputPath, undefined, [
      '--workspace',
      'stale-workspace',
      '--workspace-member',
      'stale-member',
    ]);

    // Then: parsing remains backwards compatible and the stale values do not
    // override the project's persisted binding.
    expect(result.code, result.stderr).toBe(0);
    expect(existsSync(outputPath)).toBe(true);
  });

  it('loads relative renderer assets for a bound project whose HTML already declares a base', async () => {
    // Given: a valid run token bound to a Workspace project whose renderer needs relative assets
    // and whose source HTML already declares an unrelated external base.
    const token = toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
    }).token;
    lastRendererAssetUrl = '';

    // When: the screenshot POST renders the project without forwarding its bearer to asset GETs.
    const response = await fetch(`${daemonUrl}/api/projects/${projectId}/export/image`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ fileName: 'index.html' }),
    });
    const body = Buffer.from(await response.arrayBuffer());

    // Then: the daemon hands off the original HTML plus its scoped baseHref, and the renderer
    // loads exact CSS/image bytes through that scope before the PNG export succeeds;
    // the renderer-only capability is revoked as soon as rendering finishes.
    expect(response.status, body.toString()).toBe(200);
    expect(body).toEqual(png);
    expect(lastRendererAssetUrl).not.toBe('');
    const revokedAssetResponse = await fetch(lastRendererAssetUrl);
    expect(revokedAssetResponse.status).toBe(404);
  });

  it('revokes renderer asset capability as soon as the renderer promise settles', async () => {
    // Given: rendering can settle while downstream file validation/read and the HTTP response remain pending.
    const token = toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
    }).token;
    let signalInvocation: (() => void) | null = null;
    const invoked = new Promise<void>((resolve) => {
      signalInvocation = resolve;
    });
    let settleRenderer = (_result: DesktopRenderSlidesResult): void => {
      throw new Error('renderer settlement control was not installed');
    };
    const rendererPromise = new Promise<DesktopRenderSlidesResult>((resolve) => {
      settleRenderer = resolve;
    });
    pendingRenderer = {
      promise: rendererPromise,
      signalInvocation: () => signalInvocation?.(),
    };
    lastRendererAssetUrl = '';
    rendererBlockingFile = '';

    // When: the route observes renderer settlement, then blocks reading the FIFO handoff.
    const responsePromise = fetch(`${daemonUrl}/api/projects/${projectId}/export/image`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ fileName: 'index.html' }),
    });
    await invoked;
    const settlementObserved = rendererPromise.then(() => undefined);
    settleRenderer({
      ok: true,
      slideFiles: [rendererBlockingFile],
      width: 1,
      height: 1,
      mode: 'page',
    });
    await settlementObserved;

    try {
      // Then: the renderer-only URL is already unusable before the route can finish its response.
      expect(lastRendererAssetUrl).not.toBe('');
      const revokedAssetResponse = await fetch(lastRendererAssetUrl);
      expect(revokedAssetResponse.status).toBe(404);
    } finally {
      pendingRenderer = null;
      await writeFile(rendererBlockingFile, png);
    }
    const response = await responsePromise;
    const body = Buffer.from(await response.arrayBuffer());
    expect(response.status, body.toString()).toBe(200);
    expect(body).toEqual(png);
  }, 30_000);

  it('loads relative assets through the desktopArtifactExporter fallback for an exact-project run token', async () => {
    // Given: a bound Workspace project and a daemon with only the supported image exporter fallback.
    const token = toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
    }).token;
    const fallbackArtifact = path.join(outputDir, `fallback-${randomUUID()}.png`);
    let fallbackAssetUrl = '';
    let wroteArtifactAfterAssets = false;
    const exporter = async (
      input: DesktopExportArtifactInput,
    ): Promise<DesktopExportArtifactResult> => {
      expect(input.html).toBe(boundProjectHtml);
      expect(input.baseHref).not.toBe(legacyBaseHref);
      fallbackAssetUrl = new URL(rendererStylesheetPath, input.baseHref).href;
      const cssResponse = await fetch(fallbackAssetUrl);
      const cssBytes = Buffer.from(await cssResponse.arrayBuffer());
      expect(cssResponse.status, cssBytes.toString()).toBe(200);
      expect(cssBytes).toEqual(rendererCss);
      const imageResponse = await fetch(new URL(rendererImagePath, input.baseHref));
      const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
      expect(imageResponse.status, imageBytes.toString()).toBe(200);
      expect(imageBytes).toEqual(rendererImage);
      await writeFile(fallbackArtifact, png);
      wroteArtifactAfterAssets = true;
      return { ok: true, path: fallbackArtifact, mime: 'image/png' };
    };
    const fallbackDaemon = await startServer({
      port: 0,
      returnServer: true,
      desktopArtifactExporter: exporter,
    }) as { url: string; shutdown: () => Promise<void> | void };

    try {
      // When: the run token requests an image and the exporter follows bearerless relative URLs.
      const response = await fetch(`${fallbackDaemon.url}/api/projects/${projectId}/export/image`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ fileName: 'index.html' }),
      });
      const body = Buffer.from(await response.arrayBuffer());

      // Then: both exact assets were authorized before the exporter wrote the exact returned PNG.
      expect(response.status, body.toString()).toBe(200);
      expect(wroteArtifactAfterAssets).toBe(true);
      expect(body).toEqual(png);
      const revokedAssetResponse = await fetch(fallbackAssetUrl);
      expect(revokedAssetResponse.status).toBe(404);
    } finally {
      await fallbackDaemon.shutdown();
      await rm(fallbackArtifact, { force: true });
    }
  }, 30_000);

  it('rejects a valid run token when the requested project differs', async () => {
    // Given: a token bound to the first project and an output for another bound project.
    const token = toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
    }).token;
    const outputPath = path.join(outputDir, 'cross-project.png');

    // When: the wrapper attempts to export the foreign project with that token.
    const result = await runExportCli(foreignProjectId, outputPath, token);

    // Then: project authority fails before rendering.
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('FORBIDDEN');
    expect(existsSync(outputPath)).toBe(false);
  });

  it.each(['invalid', 'expired'] as const)(
    'does not downgrade an %s token to headerless unbound access',
    async (kind) => {
      // Given: an unbound project that succeeds headerless and a presented unusable token.
      const token = kind === 'invalid'
        ? 'forged-tool-token'
        : toolTokenRegistry.mint({
            projectId: unboundProjectId,
            runId: `run_${randomUUID()}`,
            nowMs: Date.now() - 120_000,
            ttlMs: 60_000,
          }).token;
      const outputPath = path.join(outputDir, `${kind}-token.png`);

      // When: the wrapper presents that token for the otherwise unbound project.
      const result = await runExportCli(unboundProjectId, outputPath, token);

      // Then: token validation fails closed instead of exporting headerless.
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain(
        kind === 'invalid' ? 'TOOL_TOKEN_INVALID' : 'TOOL_TOKEN_EXPIRED',
      );
      expect(existsSync(outputPath)).toBe(false);
    },
  );

  it('enforces the export capability on otherwise valid project tokens', async () => {
    // Given: an exact-project token restricted to an unrelated media capability.
    const token = toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
      allowedEndpoints: ['/api/tools/media/generate'],
      allowedOperations: ['media:generate'],
    }).token;
    const outputPath = path.join(outputDir, 'endpoint-denied.png');

    // When: the wrapper attempts export through that restricted grant.
    const result = await runExportCli(projectId, outputPath, token);

    // Then: the endpoint allowlist rejects the request before rendering.
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('TOOL_ENDPOINT_DENIED');
    expect(existsSync(outputPath)).toBe(false);
  });

  it('does not extend the CLI export capability to inline project reads', async () => {
    // Given: a default run token whose export grant is limited to screenshot exports.
    const token = toolTokenRegistry.mint({
      projectId,
      runId: `run_${randomUUID()}`,
    }).token;

    // When: the token is presented to the separate inline-HTML export surface.
    const response = await fetch(`${daemonUrl}/api/projects/${projectId}/export/index.html?inline=1`, {
      headers: { authorization: `Bearer ${token}` },
    });

    // Then: endpoint authorization fails before project contents are returned.
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'TOOL_ENDPOINT_DENIED' },
    });
  });

  async function runExportCli(
    requestedProjectId: string,
    outputPath: string,
    token?: string,
    extraArgs: string[] = [],
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_OPTIONS: '',
      OD_DAEMON_URL: daemonUrl,
      OD_PROJECT_ID: requestedProjectId,
    };
    if (token) env.OD_TOOL_TOKEN = token;
    else delete env.OD_TOOL_TOKEN;
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
          ...extraArgs,
        ],
        {
          cwd: daemonRoot,
          env,
          timeout: 15_000,
          maxBuffer: 4 * 1024 * 1024,
        },
      );
      return { code: 0, stdout, stderr };
    } catch (error) {
      const failure = error as { code?: number; stdout?: string; stderr?: string };
      return {
        code: failure.code ?? 1,
        stdout: failure.stdout ?? '',
        stderr: failure.stderr ?? '',
      };
    }
  }
});

import express from 'express';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  designSystemToolRouteTestHooks,
  registerDesignSystemToolRoutes,
} from '../../src/routes/design-system-tool.js';

type JsonFetchResult = { status: number; body: Record<string, any> };

let server: http.Server | undefined;

afterEach(async () => {
  designSystemToolRouteTestHooks.beforeArtifactRead = null;
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve();
    server.close((error?: Error) => (error ? reject(error) : resolve()));
  });
  server = undefined;
});

function fresh(): string {
  return mkdtempSync(path.join(tmpdir(), 'od-design-system-tool-routes-'));
}

function writeHybridDesignSystem(root: string, id: string): string {
  const dir = path.join(root, id);
  mkdirSync(path.join(dir, 'preview'), { recursive: true });
  writeFileSync(path.join(dir, 'DESIGN.md'), '# Test\n');
  writeFileSync(path.join(dir, 'tokens.css'), ':root { --bg: #fff; }');
  writeFileSync(path.join(dir, 'design-tokens.json'), '{"format":"od-design-tokens/v1","tokens":[]}\n');
  writeFileSync(path.join(dir, 'tailwind-v4.css'), '@import "tailwindcss";\n');
  writeFileSync(path.join(dir, 'components.html'), '<button>ok</button>');
  writeFileSync(path.join(dir, 'preview', 'colors.html'), '<h1>Colors</h1>');
  writeFileSync(path.join(dir, 'preview', 'spacing.html'), '<h1>Spacing</h1>');
  writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify({
    schemaVersion: 'od-design-system-project/v1',
    id,
    name: 'Test',
    category: 'Imported',
    source: { type: 'local', path: '/tmp/source' },
    files: {
      design: 'DESIGN.md',
      tokens: 'tokens.css',
      designTokens: 'design-tokens.json',
      tailwind: 'tailwind-v4.css',
      components: 'components.html',
    },
    preview: {
      dir: 'preview',
      pages: [{ path: 'preview/colors.html', role: 'colors', title: 'Colors' }],
    },
  }, null, 2)}\n`);
  return dir;
}

async function startRouteServer(options: {
  builtInRoot: string;
  userRoot: string;
  scopedUserRoot?: string;
  workspaceId?: string;
  workspaceMemberId?: string;
  scopeAvailable?: boolean | (() => boolean);
  runtimeEnabled?: boolean | (() => boolean);
  activeDesignSystemId: string | null;
  runDesignSystemId?: string | null;
  projectFiles?: Record<string, string>;
}): Promise<string> {
  const projectsRoot = fresh();
  for (const [filePath, content] of Object.entries(options.projectFiles ?? {})) {
    const target = path.join(projectsRoot, 'project-1', filePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  const app = express();
  app.use(express.json());
  registerDesignSystemToolRoutes(app, {
    auth: {
      authorizeToolRequest: (_req, _res, operation) => {
        expect([
          'design-systems:read',
          'design-systems:resolve-intent',
          'design-systems:validate-adherence',
        ]).toContain(operation);
        return {
          token: 'token',
          runId: 'run-1',
          projectId: 'project-1',
          ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
          ...(options.workspaceMemberId
            ? { workspaceMemberId: options.workspaceMemberId }
            : {}),
          allowedEndpoints: [
            '/api/tools/design-systems/read',
            '/api/tools/design-systems/resolve-intent',
            '/api/tools/design-systems/validate-adherence',
          ],
          allowedOperations: [
            'design-systems:read',
            'design-systems:resolve-intent',
            'design-systems:validate-adherence',
          ],
          issuedAt: new Date(0).toISOString(),
          expiresAt: new Date(60_000).toISOString(),
        };
      },
    },
    http: {
      sendApiError: (res, status, code, message, extras = {}) => {
        res.status(status).json({ error: { code, message, ...extras } });
      },
    },
    paths: {
      PROJECTS_DIR: projectsRoot,
      DESIGN_SYSTEMS_DIR: options.builtInRoot,
      USER_DESIGN_SYSTEMS_DIR: options.userRoot,
      resolveUserDesignSystemsRoot: (grant, designSystemId) => {
        const scopeAvailable = typeof options.scopeAvailable === 'function'
          ? options.scopeAvailable()
          : options.scopeAvailable;
        if (scopeAvailable === false) {
          return {
            ok: false,
            code: 'DESIGN_SYSTEM_SCOPE_UNAVAILABLE',
            message: 'active design system is no longer available in the run workspace',
            details: {
              workspaceId: grant.workspaceId ?? '',
              designSystemId,
            },
          };
        }
        return { ok: true, root: options.scopedUserRoot ?? options.userRoot };
      },
    },
    projects: {
      getProject: () => ({
        id: 'project-1',
        designSystemId: options.activeDesignSystemId,
      }),
    },
    runs: {
      getRun: () => options.runDesignSystemId === undefined
        ? undefined
        : { designSystemId: options.runDesignSystemId },
    },
    features: {
      isDesignSystemRuntimeEnabled: () => typeof options.runtimeEnabled === 'function'
        ? options.runtimeEnabled()
        : options.runtimeEnabled !== false,
    },
  });

  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('unexpected listen address');
  return `http://127.0.0.1:${address.port}`;
}

function copyRuntimeFixture(root: string, id: string, label: string): void {
  const target = path.join(root, id);
  cpSync(
    path.resolve(import.meta.dirname, '../fixtures/design-systems/runtime-v3'),
    target,
    { recursive: true },
  );
  const manifestPath = path.join(target, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  manifest.id = id;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const intentPath = path.join(target, 'manifests', 'intent-map.json');
  const intent = JSON.parse(readFileSync(intentPath, 'utf8')) as {
    mappings: Array<{ properties: { label: string } }>;
  };
  intent.mappings[0]!.properties.label = label;
  writeFileSync(intentPath, `${JSON.stringify(intent, null, 2)}\n`);
}

async function jsonFetch(url: string, body: Record<string, unknown>): Promise<JsonFetchResult> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer token',
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as Record<string, any> };
}

describe('design-system pull tool route', () => {
  it('reads manifest-allowed files from the active design system', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    writeHybridDesignSystem(builtInRoot, 'pull-brand');
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'pull-brand',
    });

    const response = await jsonFetch(`${baseUrl}/api/tools/design-systems/read`, {
      path: 'preview/colors.html',
    });

    expect(response.status).toBe(200);
    expect(response.body.file).toMatchObject({
      path: 'preview/colors.html',
      encoding: 'utf8',
      content: '<h1>Colors</h1>',
    });

    const derived = await jsonFetch(`${baseUrl}/api/tools/design-systems/read`, {
      path: 'design-tokens.json',
    });

    expect(derived.status).toBe(200);
    expect(derived.body.file).toMatchObject({
      path: 'design-tokens.json',
      encoding: 'utf8',
      content: expect.stringContaining('od-design-tokens/v1'),
    });
  });

  it('resolves a canonical intent to component implementation, variant, properties, and states', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    cpSync(
      path.resolve(import.meta.dirname, '../fixtures/design-systems/runtime-v3'),
      path.join(builtInRoot, 'runtime-v3'),
      { recursive: true },
    );
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'project-default',
      runDesignSystemId: 'runtime-v3',
    });

    const matched = await jsonFetch(`${baseUrl}/api/tools/design-systems/resolve-intent`, {
      intent: 'account.settings.save',
    });
    expect(matched.status, JSON.stringify(matched.body)).toBe(200);
    expect(matched.body).toMatchObject({
      designSystemId: 'runtime-v3',
      runtime: 'structured',
      resolution: {
        status: 'matched',
        action: 'reuse-components',
        matches: [{
          component: { id: 'Button', implementation: expect.stringContaining('<button') },
          variant: { id: 'primary' },
          properties: { label: 'Save changes', disabled: false },
          states: [{ id: 'hover' }, { id: 'focus' }],
        }],
      },
      lint: {
        requireMappedComponentReuse: true,
        requireDeclaredStates: true,
      },
    });

    const noMatch = await jsonFetch(`${baseUrl}/api/tools/design-systems/resolve-intent`, {
      intent: 'workspace.delete.confirm',
    });
    expect(noMatch.status).toBe(200);
    expect(noMatch.body.resolution).toMatchObject({
      status: 'confirmation-required',
      reason: 'no-match',
      action: 'request-human-confirmation',
      allowInventComponent: false,
      outputMarker: 'data-ds-fallback="no-match"',
    });

    const invalidIntent = await jsonFetch(`${baseUrl}/api/tools/design-systems/resolve-intent`, {
      intent: 'Account settings save',
    });
    expect(invalidIntent.status).toBe(400);
    expect(invalidIntent.body.error.code).toBe('INVALID_INPUT');
  });

  it('does not resolve structured intents when the token channel is disabled', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    cpSync(
      path.resolve(import.meta.dirname, '../fixtures/design-systems/runtime-v3'),
      path.join(builtInRoot, 'runtime-v3'),
      { recursive: true },
    );
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      runtimeEnabled: false,
      activeDesignSystemId: 'runtime-v3',
      projectFiles: { 'account-settings.html': '<button class="button">Save</button>' },
    });

    const response = await jsonFetch(`${baseUrl}/api/tools/design-systems/resolve-intent`, {
      intent: 'account.settings.save',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('DESIGN_SYSTEM_RUNTIME_UNAVAILABLE');

    const validation = await jsonFetch(`${baseUrl}/api/tools/design-systems/validate-adherence`, {
      intent: 'account.settings.save',
      artifacts: ['account-settings.html'],
    });
    expect(validation.status).toBe(409);
    expect(validation.body.error.code).toBe('DESIGN_SYSTEM_RUNTIME_UNAVAILABLE');
  });

  it('resolves a team-scoped user runtime instead of a same-id personal runtime', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    const teamRoot = fresh();
    copyRuntimeFixture(userRoot, 'shared-brand', 'Personal save');
    copyRuntimeFixture(teamRoot, 'shared-brand', 'Team save');
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      scopedUserRoot: teamRoot,
      workspaceId: 'workspace-team',
      workspaceMemberId: 'member-team',
      activeDesignSystemId: 'user:shared-brand',
    });

    const response = await jsonFetch(`${baseUrl}/api/tools/design-systems/resolve-intent`, {
      intent: 'account.settings.save',
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.resolution.matches[0].properties.label).toBe('Team save');
  });

  it('fails closed when a team runtime binding is revoked during an active run', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    const teamRoot = fresh();
    copyRuntimeFixture(userRoot, 'shared-brand', 'Personal save');
    copyRuntimeFixture(teamRoot, 'shared-brand', 'Team save');
    let scopeAvailable = true;
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      scopedUserRoot: teamRoot,
      workspaceId: 'workspace-team',
      workspaceMemberId: 'member-team',
      scopeAvailable: () => scopeAvailable,
      activeDesignSystemId: 'user:shared-brand',
      runDesignSystemId: 'user:shared-brand',
    });

    const beforeRevoke = await jsonFetch(`${baseUrl}/api/tools/design-systems/resolve-intent`, {
      intent: 'account.settings.save',
    });
    expect(beforeRevoke.status).toBe(200);
    expect(beforeRevoke.body.resolution.matches[0].properties.label).toBe('Team save');

    scopeAvailable = false;
    const response = await jsonFetch(`${baseUrl}/api/tools/design-systems/resolve-intent`, {
      intent: 'account.settings.save',
    });

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      code: 'DESIGN_SYSTEM_SCOPE_UNAVAILABLE',
      details: {
        workspaceId: 'workspace-team',
        designSystemId: 'user:shared-brand',
      },
    });

    const readResponse = await jsonFetch(`${baseUrl}/api/tools/design-systems/read`, {
      path: 'manifests/components.json',
    });
    expect(readResponse.status).toBe(404);
    expect(readResponse.body.error).toMatchObject({
      code: 'DESIGN_SYSTEM_SCOPE_UNAVAILABLE',
      details: {
        workspaceId: 'workspace-team',
        designSystemId: 'user:shared-brand',
      },
    });

    const validationResponse = await jsonFetch(
      `${baseUrl}/api/tools/design-systems/validate-adherence`,
      { intent: 'account.settings.save', artifacts: ['account-settings.html'] },
    );
    expect(validationResponse.status).toBe(404);
    expect(validationResponse.body.error).toMatchObject({
      code: 'DESIGN_SYSTEM_SCOPE_UNAVAILABLE',
      details: {
        workspaceId: 'workspace-team',
        designSystemId: 'user:shared-brand',
      },
    });
  });

  it('validates generated artifacts and returns actionable failures', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    cpSync(
      path.resolve(import.meta.dirname, '../fixtures/design-systems/runtime-v3'),
      path.join(builtInRoot, 'runtime-v3'),
      { recursive: true },
    );
    const validHtml = `<style>
      :root { --accent: #245cff; }
      .button { color: var(--accent); }
      .button--primary:hover { opacity: .9; }
      .button:focus-visible { outline: 2px solid var(--accent); }
    </style><button class="button button--primary">Save changes</button>`;
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'project-default',
      runDesignSystemId: 'runtime-v3',
      projectFiles: {
        'account-settings.html': validHtml,
        'near-copy.html': '<button class="save-action" style="color: #123">Save changes</button>',
        'pending.html': '<div data-ds-fallback="no-match">Needs confirmation</div>',
      },
    });

    const valid = await jsonFetch(`${baseUrl}/api/tools/design-systems/validate-adherence`, {
      intent: 'account.settings.save',
      artifacts: ['account-settings.html'],
    });
    expect(valid.status, JSON.stringify(valid.body)).toBe(200);
    expect(valid.body.report).toMatchObject({
      schemaVersion: 'od-design-system-adherence/v1',
      status: 'passed',
      nextAction: 'complete',
      summary: { failed: 0, needsConfirmation: 0 },
    });

    const invalid = await jsonFetch(`${baseUrl}/api/tools/design-systems/validate-adherence`, {
      intent: 'account.settings.save',
      artifacts: ['near-copy.html'],
    });
    expect(invalid.status).toBe(200);
    expect(invalid.body.report).toMatchObject({
      status: 'failed',
      nextAction: 'fix-and-rerun',
    });
    expect(invalid.body.report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'mapped-component-reuse', status: 'failed' }),
      expect.objectContaining({ id: 'variant-reuse', status: 'failed' }),
      expect.objectContaining({ id: 'token-reference', status: 'failed' }),
      expect.objectContaining({ id: 'unauthorized-color-literal', status: 'failed' }),
    ]));

    const fallback = await jsonFetch(`${baseUrl}/api/tools/design-systems/validate-adherence`, {
      intent: 'workspace.delete.confirm',
      artifacts: ['pending.html'],
    });
    expect(fallback.status).toBe(200);
    expect(fallback.body.report).toMatchObject({
      status: 'confirmation-required',
      nextAction: 'request-human-confirmation',
      summary: { failed: 0, needsConfirmation: 1 },
    });
  });

  it('rejects source types that the adherence validator cannot inspect', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    cpSync(
      path.resolve(import.meta.dirname, '../fixtures/design-systems/runtime-v3'),
      path.join(builtInRoot, 'runtime-v3'),
      { recursive: true },
    );
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'runtime-v3',
      projectFiles: {
        'component.ts': "element.style.color = '#123';",
      },
    });

    const response = await jsonFetch(`${baseUrl}/api/tools/design-systems/validate-adherence`, {
      intent: 'account.settings.save',
      artifacts: ['component.ts'],
    });

    expect(response.status).toBe(415);
    expect(response.body.error).toMatchObject({ code: 'UNSUPPORTED_ARTIFACT' });
  });

  it('rejects directory artifact paths as invalid input instead of returning an internal error', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    cpSync(
      path.resolve(import.meta.dirname, '../fixtures/design-systems/runtime-v3'),
      path.join(builtInRoot, 'runtime-v3'),
      { recursive: true },
    );
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'runtime-v3',
      projectFiles: {
        'generated/account-settings.html': '<button class="button button--primary">Save</button>',
      },
    });

    const response = await jsonFetch(`${baseUrl}/api/tools/design-systems/validate-adherence`, {
      intent: 'account.settings.save',
      artifacts: ['generated'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'INVALID_INPUT',
      message: 'artifact generated must be a regular file',
    });
  });

  it('loads adherence tokens from the same user package selected for a bare-id runtime', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    writeHybridDesignSystem(builtInRoot, 'shared-brand');
    copyRuntimeFixture(userRoot, 'shared-brand', 'User save');
    const validHtml = `<style>
      .button { color: var(--accent); }
      .button--primary:hover { opacity: .9; }
      .button:focus-visible { outline: 2px solid var(--accent); }
    </style><button class="button button--primary">Save changes</button>`;
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'shared-brand',
      projectFiles: { 'account-settings.html': validHtml },
    });

    const response = await jsonFetch(`${baseUrl}/api/tools/design-systems/validate-adherence`, {
      intent: 'account.settings.save',
      artifacts: ['account-settings.html'],
    });

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.report).toMatchObject({ status: 'passed', nextAction: 'complete' });
  });

  it('rejects an oversized artifact before loading it for adherence validation', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    cpSync(
      path.resolve(import.meta.dirname, '../fixtures/design-systems/runtime-v3'),
      path.join(builtInRoot, 'runtime-v3'),
      { recursive: true },
    );
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'runtime-v3',
      projectFiles: {
        'oversized.html': 'x'.repeat(2 * 1024 * 1024 + 1),
      },
    });

    const response = await jsonFetch(`${baseUrl}/api/tools/design-systems/validate-adherence`, {
      intent: 'account.settings.save',
      artifacts: ['oversized.html'],
    });

    expect(response.status).toBe(413);
    expect(response.body.error).toMatchObject({ code: 'ARTIFACT_TOO_LARGE' });
  });

  it('bounds the opened read when an artifact grows after its metadata check', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    cpSync(
      path.resolve(import.meta.dirname, '../fixtures/design-systems/runtime-v3'),
      path.join(builtInRoot, 'runtime-v3'),
      { recursive: true },
    );
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'runtime-v3',
      projectFiles: {
        'growing.html': '<button class="button button--primary">Save</button>',
      },
    });
    let observedReadCap = 0;
    designSystemToolRouteTestHooks.beforeArtifactRead = ({
      filePath,
      maxBytesToRead,
    }) => {
      observedReadCap = maxBytesToRead;
      writeFileSync(filePath, 'x'.repeat(8 * 1024 * 1024));
    };

    const response = await jsonFetch(`${baseUrl}/api/tools/design-systems/validate-adherence`, {
      intent: 'account.settings.save',
      artifacts: ['growing.html'],
    });

    expect(response.status).toBe(413);
    expect(response.body.error).toMatchObject({ code: 'ARTIFACT_TOO_LARGE' });
    expect(observedReadCap).toBe(2 * 1024 * 1024 + 1);
  });

  it('reports legacy and malformed runtime packages without downgrading them', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    writeHybridDesignSystem(builtInRoot, 'legacy-brand');
    const legacyUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'legacy-brand',
    });
    const legacy = await jsonFetch(`${legacyUrl}/api/tools/design-systems/resolve-intent`, {
      intent: 'account.settings.save',
    });
    expect(legacy.status).toBe(409);
    expect(legacy.body.error.code).toBe('DESIGN_SYSTEM_RUNTIME_UNAVAILABLE');

    await new Promise<void>((resolve, reject) => {
      server?.close((error?: Error) => (error ? reject(error) : resolve()));
    });
    server = undefined;

    cpSync(
      path.resolve(import.meta.dirname, '../fixtures/design-systems/runtime-v3'),
      path.join(builtInRoot, 'broken-runtime'),
      { recursive: true },
    );
    const brokenManifestPath = path.join(builtInRoot, 'broken-runtime', 'manifest.json');
    const brokenManifest = JSON.parse(readFileSync(brokenManifestPath, 'utf8')) as Record<string, unknown>;
    brokenManifest.id = 'broken-runtime';
    const intentPath = path.join(builtInRoot, 'broken-runtime', 'manifests', 'intent-map.json');
    const brokenIntent = JSON.parse(readFileSync(intentPath, 'utf8')) as {
      mappings: Array<{ component: string }>;
    };
    brokenIntent.mappings[0]!.component = 'MissingButton';
    writeFileSync(brokenManifestPath, `${JSON.stringify(brokenManifest, null, 2)}\n`);
    writeFileSync(intentPath, `${JSON.stringify(brokenIntent, null, 2)}\n`);

    const brokenUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'broken-runtime',
    });
    const broken = await jsonFetch(`${brokenUrl}/api/tools/design-systems/resolve-intent`, {
      intent: 'account.settings.save',
    });
    expect(broken.status).toBe(422);
    expect(broken.body.error).toMatchObject({
      code: 'DESIGN_SYSTEM_RUNTIME_INVALID',
      details: { errors: [expect.stringContaining('unknown component MissingButton')] },
    });
  });

  it('does not expose a project default when the active run explicitly disabled its design system', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    writeHybridDesignSystem(builtInRoot, 'project-default');
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'project-default',
      runDesignSystemId: null,
    });

    const response = await jsonFetch(`${baseUrl}/api/tools/design-systems/read`, {
      path: 'preview/colors.html',
    });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('DESIGN_SYSTEM_NOT_FOUND');
  });

  it('rejects unlisted files and non-active design-system ids', async () => {
    const builtInRoot = fresh();
    const userRoot = fresh();
    writeHybridDesignSystem(builtInRoot, 'pull-brand');
    const baseUrl = await startRouteServer({
      builtInRoot,
      userRoot,
      activeDesignSystemId: 'pull-brand',
    });

    const unlisted = await jsonFetch(`${baseUrl}/api/tools/design-systems/read`, {
      path: 'preview/spacing.html',
    });
    expect(unlisted.status).toBe(404);
    expect(unlisted.body.error.code).toBe('DESIGN_SYSTEM_FILE_NOT_FOUND');

    const mismatch = await jsonFetch(`${baseUrl}/api/tools/design-systems/read`, {
      designSystemId: 'other-brand',
      path: 'preview/colors.html',
    });
    expect(mismatch.status).toBe(403);
    expect(mismatch.body.error.code).toBe('DESIGN_SYSTEM_DENIED');
  });
});

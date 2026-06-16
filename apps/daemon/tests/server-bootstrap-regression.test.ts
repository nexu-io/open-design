import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  isStaticSpaFallbackRequest,
  resolveDataDir,
  startServer,
  type StartServerResult,
} from '../src/server.js';

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;
let routeInventory: StartServerResult['routeInventory'];

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as StartServerResult;
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;
  routeInventory = started.routeInventory;
});

afterAll(async () => {
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('server route inventory', () => {
  it('records bootstrap and migrated domain routes in registration order', () => {
    const routeKeys = routeInventory.map((route) => `${route.method} ${route.path}`);
    const fallbackIndex = routeKeys.indexOf('GET /*splat');

    const automationRouteKeys = [
      'GET /api/automation-source-packets',
      'POST /api/automation-ingestions',
      'GET /api/automation-source-packets/:id',
      'GET /api/automation-proposals',
      'POST /api/automation-proposals',
      'GET /api/automation-proposals/:id',
      'POST /api/automation-proposals/:id/apply',
      'POST /api/automation-proposals/:id/reject',
    ];
    const velaRouteKeys = [
      'GET /api/amr/models',
      'GET /api/integrations/vela/status',
      'ALL /api/integrations/vela/api-proxy/*splat',
      'POST /api/integrations/vela/login',
      'POST /api/integrations/vela/login/cancel',
      'POST /api/integrations/vela/analytics-entry',
      'POST /api/integrations/vela/logout',
    ];
    const genuiRouteKeys = [
      'GET /api/runs/:runId/genui',
      'GET /api/projects/:projectId/genui',
      'POST /api/runs/:runId/genui/:surfaceId/respond',
      'POST /api/projects/:projectId/genui/:surfaceId/revoke',
      'POST /api/projects/:projectId/genui/prefill',
      'GET /api/runs/:runId/genui/:surfaceId',
      'GET /api/runs/:runId/devloop-iterations',
      'POST /api/runs/:runId/replay',
    ];
    const pluginEventRouteKeys = [
      'GET /api/plugins/events/snapshot',
      'GET /api/plugins/events/stats',
      'POST /api/plugins/events/purge',
      'GET /api/plugins/events',
    ];
    const pluginLifecycleRouteKeys = [
      'GET /api/plugins',
      'GET /api/plugins/:id',
      'POST /api/plugins/upload-zip',
      'POST /api/plugins/upload-folder',
      'POST /api/plugins/install',
      'POST /api/plugins/:id/uninstall',
      'POST /api/plugins/:id/upgrade',
      'POST /api/plugins/:id/apply',
      'POST /api/plugins/:id/share-project',
      'POST /api/plugins/:id/doctor',
      'POST /api/plugins/:id/trust',
      'GET /api/plugins/stats',
      'GET /api/applied-plugins/:snapshotId',
      'GET /api/applied-plugins/:snapshotId/canon',
      'GET /api/applied-plugins',
      'GET /api/projects/:projectId/applied-plugins',
      'POST /api/applied-plugins/export',
      'POST /api/applied-plugins/prune',
    ];
    const pluginAssetRouteKeys = [
      'GET /api/plugins/:id/preview',
      'GET /api/plugins/:id/example/:name',
      'GET /api/plugins/:id/asset/*splat',
      'GET /api/asset-cache',
    ];
    const marketplaceRouteKeys = [
      'GET /api/marketplaces',
      'POST /api/marketplaces',
      'GET /api/marketplaces/:id',
      'DELETE /api/marketplaces/:id',
      'POST /api/marketplaces/:id/refresh',
      'POST /api/marketplaces/:id/trust',
      'GET /api/marketplaces/:id/plugins',
    ];
    const projectPluginRouteKeys = [
      'POST /api/projects/:id/plugins/install-folder',
      'POST /api/projects/:id/plugins/publish-github',
      'GET /api/projects/:id/plugin-candidates',
      'POST /api/projects/:id/plugin-candidates/:candidateId/dismiss',
      'POST /api/projects/:id/plugin-candidates/:candidateId/draft',
      'POST /api/projects/:id/plugin-candidates/:candidateId/share-tasks',
      'POST /api/projects/:id/plugins/contribute-open-design',
      'POST /api/projects/:id/plugins/share-tasks',
      'POST /api/plugins/share-tasks/:id/wait',
    ];
    const liveArtifactRouteKeys = [
      'GET /api/live-artifacts',
      'OPTIONS /api/live-artifacts/:artifactId/preview',
      'GET /api/live-artifacts/:artifactId/preview',
      'GET /api/live-artifacts/:artifactId',
      'GET /api/live-artifacts/:artifactId/refreshes',
      'POST /api/tools/live-artifacts/create',
      'GET /api/tools/live-artifacts/list',
      'POST /api/tools/live-artifacts/update',
      'POST /api/tools/live-artifacts/refresh',
      'PATCH /api/live-artifacts/:artifactId',
      'DELETE /api/live-artifacts/:artifactId',
      'OPTIONS /api/live-artifacts/:artifactId/refresh',
      'POST /api/live-artifacts/:artifactId/refresh',
    ];
    const deployRouteKeys = [
      'GET /api/deploy/config',
      'PUT /api/deploy/config',
      'GET /api/deploy/cloudflare-pages/zones',
      'GET /api/projects/:id/deployments',
      'POST /api/projects/:id/deploy',
      'POST /api/projects/:id/deploy/preflight',
    ];
    const deploymentCheckRouteKeys = [
      'POST /api/projects/:id/deployments/:deploymentId/check-link',
    ];
    const projectFileStringRouteKeys = [
      'GET /api/projects/:id/files',
      'GET /api/projects/:id/search',
      'GET /api/projects/:id/files/:name/preview',
      'POST /api/projects/:id/files',
      'DELETE /api/projects/:id/files/:name',
    ];
    const projectArchiveRouteKeys = [
      'GET /api/projects/:id/archive',
      'POST /api/projects/:id/archive/batch',
    ];

    expect(routeKeys).toEqual(expect.arrayContaining([
      'GET /api/health',
      'GET /api/ready',
      'GET /api/version',
      'GET /api/daemon/status',
      'GET /api/skills',
      'GET /api/codex-pets',
      'GET /api/prompt-templates',
      'GET /*splat',
    ]));

    expect(routeKeys.filter((key) => automationRouteKeys.includes(key))).toEqual(automationRouteKeys);
    expect(routeKeys.filter((key) => velaRouteKeys.includes(key))).toEqual(velaRouteKeys);
    expect(routeKeys.filter((key) => genuiRouteKeys.includes(key))).toEqual(genuiRouteKeys);
    expect(routeKeys.filter((key) => pluginEventRouteKeys.includes(key))).toEqual(pluginEventRouteKeys);
    expect(routeKeys.filter((key) => pluginLifecycleRouteKeys.includes(key))).toEqual(pluginLifecycleRouteKeys);
    expect(routeKeys.filter((key) => pluginAssetRouteKeys.includes(key))).toEqual(pluginAssetRouteKeys);
    expect(routeKeys.filter((key) => marketplaceRouteKeys.includes(key))).toEqual(marketplaceRouteKeys);
    expect(routeKeys.filter((key) => projectPluginRouteKeys.includes(key))).toEqual(projectPluginRouteKeys);
    expect(routeKeys.filter((key) => liveArtifactRouteKeys.includes(key))).toEqual(liveArtifactRouteKeys);
    expect(routeKeys.filter((key) => deployRouteKeys.includes(key))).toEqual(deployRouteKeys);
    expect(routeKeys.filter((key) => deploymentCheckRouteKeys.includes(key))).toEqual(deploymentCheckRouteKeys);
    expect(routeKeys.filter((key) => projectFileStringRouteKeys.includes(key))).toEqual(projectFileStringRouteKeys);
    expect(routeKeys.filter((key) => projectArchiveRouteKeys.includes(key))).toEqual(projectArchiveRouteKeys);

    expect(fallbackIndex).toBeGreaterThan(-1);
    expect(routeKeys.indexOf('GET /api/health')).toBeLessThan(fallbackIndex);
    expect(routeKeys.indexOf('GET /api/plugins/events/snapshot')).toBeLessThan(routeKeys.indexOf('POST /api/daemon/db/verify'));
    expect(routeKeys.indexOf('GET /api/plugins')).toBeLessThan(routeKeys.indexOf('GET /api/atoms'));
    expect(routeKeys.indexOf('GET /api/plugins/:id/preview')).toBeLessThan(fallbackIndex);
    expect(routeKeys.indexOf('GET /api/automation-source-packets')).toBeLessThan(
      routeKeys.indexOf('GET /api/skills'),
    );
    expect(routeKeys.indexOf('USE /artifacts')).toBeLessThan(routeKeys.indexOf('USE /frames'));
    expect(routeKeys.filter((key) => key === 'USE /artifacts')).toHaveLength(1);
    expect(routeKeys.filter((key) => key === 'USE /frames')).toHaveLength(1);
    expect(routeKeys.filter((key) => key === 'GET /api/plugins')).toHaveLength(1);
    expect(routeKeys.filter((key) => key === 'GET /api/marketplaces')).toHaveLength(1);
    expect(routeKeys.filter((key) => key === 'POST /api/projects/:id/plugins/share-tasks')).toHaveLength(1);
    for (const [index, key] of routeKeys.entries()) {
      if (key.includes(' /api/')) {
        expect(index, `${key} should register before SPA fallback`).toBeLessThan(fallbackIndex);
      }
    }
    expect(routeKeys.filter((key) => key === 'GET /api/skills')).toHaveLength(1);
  });
});

describe('bootstrap route regressions', () => {
  it('keeps health, ready, version, and daemon status available', async () => {
    const [health, ready, version, status] = await Promise.all([
      fetch(`${baseUrl}/api/health`),
      fetch(`${baseUrl}/api/ready`),
      fetch(`${baseUrl}/api/version`),
      fetch(`${baseUrl}/api/daemon/status`),
    ]);

    expect(health.status).toBe(200);
    expect(ready.status).toBe(200);
    expect(version.status).toBe(200);
    expect(status.status).toBe(200);
  });

  it('keeps lightweight extracted-route responses stable without fixtures', async () => {
    const [
      automationList,
      automationMissing,
      velaProxyUnknownPath,
      genuiRunList,
      genuiRunSurfaceMissing,
      devloopIterations,
      replayMissingSnapshot,
    ] = await Promise.all([
      fetch(`${baseUrl}/api/automation-source-packets`),
      fetch(`${baseUrl}/api/automation-source-packets/missing-packet`),
      fetch(`${baseUrl}/api/integrations/vela/api-proxy/not-api-v1`),
      fetch(`${baseUrl}/api/runs/missing-run/genui`),
      fetch(`${baseUrl}/api/runs/missing-run/genui/missing-surface`),
      fetch(`${baseUrl}/api/runs/missing-run/devloop-iterations`),
      fetch(`${baseUrl}/api/runs/missing-run/replay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    ]);

    expect(automationList.status).toBe(200);
    expect(await automationList.json()).toEqual({ packets: [] });

    expect(automationMissing.status).toBe(404);
    expect(await automationMissing.json()).toEqual({ error: 'automation source packet not found' });

    expect(velaProxyUnknownPath.status).toBe(404);
    expect(await velaProxyUnknownPath.json()).toEqual({ error: 'unknown_amr_api_proxy_path' });

    expect(genuiRunList.status).toBe(200);
    expect(await genuiRunList.json()).toEqual({ runId: 'missing-run', surfaces: [] });

    expect(genuiRunSurfaceMissing.status).toBe(404);
    expect(await genuiRunSurfaceMissing.json()).toEqual({ error: 'surface not found' });

    expect(devloopIterations.status).toBe(200);
    expect(await devloopIterations.json()).toEqual({ runId: 'missing-run', iterations: [] });

    expect(replayMissingSnapshot.status).toBe(400);
    expect(await replayMissingSnapshot.json()).toEqual({
      error: 'snapshotId is required (runs are in-memory; pass the snapshotId returned by /api/plugins/:id/apply)',
    });
  });
});

describe('static SPA fallback classification', () => {
  const makeReq = (path: string, method = 'GET', accept = 'text/html') => ({
    method,
    path,
    get: (name: string) => (name.toLowerCase() === 'accept' ? accept : ''),
  });

  it('does not classify API, artifacts, frames, or _next requests as SPA fallbacks', () => {
    expect(isStaticSpaFallbackRequest(makeReq('/api/projects') as never)).toBe(false);
    expect(isStaticSpaFallbackRequest(makeReq('/artifacts/x') as never)).toBe(false);
    expect(isStaticSpaFallbackRequest(makeReq('/frames/x') as never)).toBe(false);
    expect(isStaticSpaFallbackRequest(makeReq('/_next/static/app.js') as never)).toBe(false);
  });

  it('requires a GET or HEAD request with an HTML-compatible Accept header', () => {
    expect(isStaticSpaFallbackRequest(makeReq('/workspace') as never)).toBe(true);
    expect(isStaticSpaFallbackRequest(makeReq('/workspace', 'HEAD') as never)).toBe(true);
    expect(isStaticSpaFallbackRequest(makeReq('/workspace', 'POST') as never)).toBe(false);
    expect(isStaticSpaFallbackRequest(makeReq('/workspace', 'GET', 'application/json') as never)).toBe(false);
  });
});

describe('daemon data dir resolver', () => {
  it('requires explicit OD_DATA_DIR in sandbox mode and resolves project-relative dirs', () => {
    expect(() => resolveDataDir('', '/tmp/open-design-test', { requireExplicit: true })).toThrow(
      /OD_DATA_DIR is required/,
    );
    expect(resolveDataDir('relative-data', '/tmp/open-design-test')).toBe('/tmp/open-design-test/relative-data');
  });
});

import { mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';
import { connectorService, ConnectorServiceError } from '../src/connectors/service.js';
import { CHAT_TOOL_ENDPOINTS, CHAT_TOOL_OPERATIONS, toolTokenRegistry } from '../src/tool-tokens.js';

type StartedServer = { server: http.Server; url: string };
type JsonObject = Record<string, any>;
type JsonFetchResult<TBody extends JsonObject = JsonObject> = { status: number; body: TBody };
type TextFetchResult = { status: number; headers: Headers; body: string };
type RawHttpJsonFetchResult<TBody extends JsonObject = JsonObject> = {
  status: number | undefined;
  headers: http.IncomingHttpHeaders;
  body: TBody;
};
type ProjectEvent = { event: string; data: any };
type ProjectEventStream = {
  waitFor(predicate: (event: ProjectEvent) => boolean, timeoutMs?: number): Promise<ProjectEvent>;
  close(): Promise<void>;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../../..');
const serverRuntimeDataRoot = process.env.OD_DATA_DIR
  ? path.resolve(projectRoot, process.env.OD_DATA_DIR)
  : path.join(projectRoot, '.od');

let server: http.Server | undefined;
let baseUrl: string;
const projectIds: string[] = [];

beforeEach(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  server = started.server;
  baseUrl = started.url;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((resolve, reject) => {
    if (!server) return resolve(undefined);
    server.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
  });
  server = undefined;
  toolTokenRegistry.clear();
  const cleanupProjectIds = projectIds.splice(0);
  await Promise.all(
    cleanupProjectIds.map((projectId) =>
      rm(path.join(serverRuntimeDataRoot, 'projects', projectId), { recursive: true, force: true }),
    ),
  );
});

function uniqueProjectId() {
  const id = `route-live-artifact-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  projectIds.push(id);
  return id;
}

function readAutoSafety(reason = 'test read-only connector fixture') {
  return { sideEffect: 'read' as const, approval: 'auto' as const, reason };
}

function validCreateInput(title = 'Tool Route Live Artifact') {
  return {
    title,
    preview: { type: 'html', entry: 'index.html' },
    document: {
      format: 'html_template_v1',
      templatePath: 'template.html',
      generatedPreviewPath: 'index.html',
      dataPath: 'data.json',
      dataJson: { title, owner: 'Agent' },
    },
  };
}

async function jsonFetch<TBody extends JsonObject = JsonObject>(url: string | URL, init?: RequestInit): Promise<JsonFetchResult<TBody>> {
  const response = await fetch(url, init);
  return { status: response.status, body: (await response.json()) as TBody };
}

async function textFetch(url: string | URL, init?: RequestInit): Promise<TextFetchResult> {
  const response = await fetch(url, init);
  return { status: response.status, headers: response.headers, body: await response.text() };
}

async function createProject(projectId: string): Promise<JsonFetchResult> {
  const response = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: projectId }),
  });
  return { status: response.status, body: (await response.json()) as JsonObject };
}

async function rawHttpJsonFetch<TBody extends JsonObject = JsonObject>(
  url: string,
  { headers = {}, method = 'GET' }: { headers?: http.OutgoingHttpHeaders; method?: string } = {},
): Promise<RawHttpJsonFetchResult<TBody>> {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(body) as TBody });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function writeProjectJson(projectId: string, name: string, value: JsonObject): Promise<void> {
  const candidates = [path.join(serverRuntimeDataRoot, 'projects', projectId)];
  let lastError: unknown;
  let wrote = false;
  for (const dir of candidates) {
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      wrote = true;
    } catch (error) {
      lastError = error;
    }
  }
  if (wrote) return;
  throw lastError;
}

async function openProjectEvents(projectId: string): Promise<ProjectEventStream> {
  const response = await fetch(`${baseUrl}/api/projects/${encodeURIComponent(projectId)}/events`, {
    headers: { Accept: 'text/event-stream' },
  });
  if (!response.ok || !response.body) {
    throw new Error(`failed to open project events stream: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: ProjectEvent[] = [];

  const pump = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
        if (!raw.trim() || raw.startsWith(':')) continue;
        const evt: ProjectEvent = { event: 'message', data: '' };
        for (const line of raw.split('\n')) {
          if (line.startsWith('event: ')) evt.event = line.slice(7);
          if (line.startsWith('data: ')) evt.data += line.slice(6);
        }
        try {
          evt.data = JSON.parse(evt.data);
        } catch {}
        events.push(evt);
      }
    }
  })();

  return {
    async waitFor(predicate: (event: ProjectEvent) => boolean, timeoutMs = 5_000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const match = events.find(predicate);
        if (match) return match;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error(`timed out waiting for project event; seen=${JSON.stringify(events)}`);
    },
    async close() {
      await reader.cancel().catch(() => {});
      await pump.catch(() => {});
    },
  };
}

function mintToolToken(projectId: string, runId: string, overrides: Partial<Parameters<typeof toolTokenRegistry.mint>[0]> = {}) {
  return toolTokenRegistry.mint({
    projectId,
    runId,
    allowedEndpoints: CHAT_TOOL_ENDPOINTS,
    allowedOperations: CHAT_TOOL_OPERATIONS,
    ...overrides,
  }).token;
}

describe('live artifact tool routes', () => {
  it('creates and lists live artifacts for agent registration', async () => {
    const projectId = uniqueProjectId();
    const runId = 'run-route-test';
    const token = mintToolToken(projectId, runId);
    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        input: validCreateInput(),
        templateHtml: '<!doctype html><h1>{{data.title}}</h1><p>{{data.owner}}</p>',
        provenanceJson: {
          generatedAt: '2026-04-30T00:00:00.000Z',
          generatedBy: 'agent',
          sources: [{ label: 'Route test', type: 'user_input' }],
        },
      }),
    });

    expect(create.status).toBe(200);
    expect(create.body.artifact).toMatchObject({
      projectId,
      title: 'Tool Route Live Artifact',
      createdByRunId: runId,
      refreshStatus: 'idle',
    });

    const list = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(list.status).toBe(200);
    expect(list.body.artifacts).toHaveLength(1);
    expect(list.body.artifacts[0]).toMatchObject({
      id: create.body.artifact.id,
      projectId,
      title: 'Tool Route Live Artifact',
      hasDocument: true,
    });
    expect(list.body.artifacts[0].document).toBeUndefined();
  });

  it('refreshes live artifacts through tool and UI routes', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-refresh');
    const executeConnector = vi.spyOn(connectorService, 'execute')
      .mockResolvedValueOnce({
        ok: true,
        connectorId: 'monet',
        toolName: 'monet.metrics',
        safety: readAutoSafety(),
        output: { title: 'Open bugs', owner: '7' },
      })
      .mockResolvedValueOnce({
        ok: true,
        connectorId: 'monet',
        toolName: 'monet.metrics',
        safety: readAutoSafety(),
        output: { title: 'Open bugs', owner: '8' },
      });

    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        input: {
          ...validCreateInput('Refresh Route Artifact'),
          document: {
            ...validCreateInput('Refresh Route Artifact').document,
            sourceJson: {
              type: 'connector_tool',
              toolName: 'monet.metrics',
              input: { report: 'bugs' },
              connector: {
                connectorId: 'monet',
                toolName: 'monet.metrics',
                approvalPolicy: 'read_only_auto',
              },
              refreshPermission: 'manual_refresh_granted_for_read_only',
            },
          },
        },
      }),
    });
    expect(create.status).toBe(200);
    expect(create.body.artifact.document.sourceJson.refreshPermission).toBe('manual_refresh_granted_for_read_only');

    const toolRefresh = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ artifactId: create.body.artifact.id }),
    });
    expect(toolRefresh.status).toBe(200);
    expect(toolRefresh.body.refresh).toMatchObject({ id: 'refresh-000001', status: 'succeeded', refreshedSourceCount: 1 });
    expect(toolRefresh.body.artifact).toMatchObject({ refreshStatus: 'succeeded', lastRefreshedAt: expect.any(String) });
    expect(toolRefresh.body.artifact.document.dataJson).toMatchObject({ title: 'Open bugs', owner: '7' });
    expect(executeConnector).toHaveBeenCalledTimes(1);
    expect(executeConnector).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ expectedApprovalPolicy: expect.anything() }),
      expect.objectContaining({ purpose: 'artifact_refresh' }),
    );

    const uiRefresh = await jsonFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}/refresh?projectId=${encodeURIComponent(projectId)}`, {
      method: 'POST',
    });
    expect(uiRefresh.status).toBe(200);
    expect(uiRefresh.body.refresh).toMatchObject({ id: 'refresh-000002', status: 'succeeded', refreshedSourceCount: 1 });
    expect(uiRefresh.body.artifact.document.dataJson).toMatchObject({ title: 'Open bugs', owner: '8' });
    expect(executeConnector).toHaveBeenCalledTimes(2);
    expect(executeConnector).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ expectedApprovalPolicy: expect.anything() }),
      expect.objectContaining({ purpose: 'artifact_refresh' }),
    );
  });

  it('rejects local refresh sources when refreshPermission is none', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-refresh-disabled');

    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ input: validCreateInput('Disabled Refresh Artifact') }),
    });
    expect(create.status).toBe(200);

    const update = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        artifactId: create.body.artifact.id,
        input: {
          document: {
            ...validCreateInput('Disabled Refresh Artifact').document,
            sourceJson: {
              type: 'daemon_tool',
              toolName: 'project_files.search',
              input: { query: 'should-not-run' },
              refreshPermission: 'none',
            },
          },
        },
      }),
    });
    expect(update.status).toBe(200);
    expect(update.body.artifact.document.sourceJson.refreshPermission).toBe('none');

    const refresh = await jsonFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}/refresh?projectId=${encodeURIComponent(projectId)}`, {
      method: 'POST',
    });
    expect(refresh.status).toBe(400);
    expect(refresh.body.error).toMatchObject({
      code: 'LIVE_ARTIFACT_REFRESH_UNAVAILABLE',
      message: 'Refresh is disabled for this artifact source.',
    });
  });

  it('returns persisted refresh history after a local_file refresh', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-refresh-history');
    await writeProjectJson(projectId, 'artifact-metrics.json', {
      summary: { owner: 'Disk source', status: 'ready' },
      stats: { openBugs: 7 },
    });

    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        input: {
          ...validCreateInput('Refresh History Artifact'),
          document: {
            ...validCreateInput('Refresh History Artifact').document,
            dataJson: { title: 'Refresh History Artifact', summary: { owner: 'Agent' } },
            sourceJson: {
              type: 'local_file',
              input: { path: 'artifact-metrics.json' },
              outputMapping: {
                dataPaths: [
                  { from: 'json.summary', to: 'summary' },
                  { from: 'json.stats', to: 'stats' },
                ],
                transform: 'identity',
              },
              refreshPermission: 'manual_refresh_granted_for_read_only',
            },
          },
        },
      }),
    });
    expect(create.status).toBe(200);

    const refresh = await jsonFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}/refresh?projectId=${encodeURIComponent(projectId)}`, {
      method: 'POST',
    });
    expect(refresh.status).toBe(200);
    expect(refresh.body.artifact.document.dataJson).toMatchObject({
      title: 'Refresh History Artifact',
      summary: { owner: 'Disk source', status: 'ready' },
      stats: { openBugs: 7 },
    });

    const refreshes = await jsonFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}/refreshes?projectId=${encodeURIComponent(projectId)}`);
    expect(refreshes.status).toBe(200);
    expect(refreshes.body.refreshes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          projectId,
          artifactId: create.body.artifact.id,
          refreshId: refresh.body.refresh.id,
          step: 'document',
          status: 'succeeded',
          source: expect.objectContaining({ sourceType: 'document' }),
        }),
      ]),
    );
  });

  it('emits project SSE live artifact events for patch delete and refresh', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-project-sse');
    await createProject(projectId);
    await writeProjectJson(projectId, 'artifact-metrics.json', {
      summary: { owner: 'Disk source', status: 'ready' },
    });
    const stream = await openProjectEvents(projectId);

    try {
      await stream.waitFor((evt) => evt.event === 'ready' && evt.data.projectId === projectId);

      const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          input: {
            ...validCreateInput('SSE Artifact'),
            document: {
              ...validCreateInput('SSE Artifact').document,
              sourceJson: {
                type: 'local_file',
                input: { path: 'artifact-metrics.json' },
                outputMapping: { dataPaths: [{ from: 'json.summary', to: 'summary' }], transform: 'identity' },
                refreshPermission: 'manual_refresh_granted_for_read_only',
              },
            },
          },
        }),
      });
      expect(create.status).toBe(200);

      const patch = await jsonFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}?projectId=${encodeURIComponent(projectId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'SSE Artifact Updated' }),
      });
      expect(patch.status).toBe(200);
      await stream.waitFor((evt) => evt.event === 'live_artifact'
        && evt.data.action === 'updated'
        && evt.data.artifactId === create.body.artifact.id
        && evt.data.title === 'SSE Artifact Updated');

      const refresh = await jsonFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}/refresh?projectId=${encodeURIComponent(projectId)}`, {
        method: 'POST',
      });
      expect(refresh.status).toBe(200);
      await stream.waitFor((evt) => evt.event === 'live_artifact_refresh'
        && evt.data.phase === 'started'
        && evt.data.artifactId === create.body.artifact.id);
      await stream.waitFor((evt) => evt.event === 'live_artifact_refresh'
        && evt.data.phase === 'succeeded'
        && evt.data.artifactId === create.body.artifact.id
        && evt.data.refreshId === refresh.body.refresh.id);

      const deleted = await jsonFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}?projectId=${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      });
      expect(deleted.status).toBe(200);
      await stream.waitFor((evt) => evt.event === 'live_artifact'
        && evt.data.action === 'deleted'
        && evt.data.artifactId === create.body.artifact.id);
    } finally {
      await stream.close();
    }
  }, 15_000);

  it('rejects manual refresh requests with non-loopback host before refresh side effects', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-refresh-local-security');
    const executeConnector = vi.spyOn(connectorService, 'execute').mockResolvedValue({
      ok: true,
      connectorId: 'monet',
      toolName: 'monet.metrics',
      safety: readAutoSafety(),
      output: { title: 'Should not refresh', owner: '0' },
    });

    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        input: {
          ...validCreateInput('Refresh Local Security'),
          document: {
            ...validCreateInput('Refresh Local Security').document,
            sourceJson: {
              type: 'connector_tool',
              toolName: 'monet.metrics',
              input: { report: 'bugs' },
              connector: {
                connectorId: 'monet',
                toolName: 'monet.metrics',
                approvalPolicy: 'read_only_auto',
              },
              refreshPermission: 'manual_refresh_granted_for_read_only',
            },
          },
        },
      }),
    });
    expect(create.status).toBe(200);

    const refresh = await rawHttpJsonFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}/refresh?projectId=${encodeURIComponent(projectId)}`, {
      method: 'POST',
      headers: { Host: 'attacker.example' },
    });

    expect(refresh.status).toBe(403);
    expect(refresh.body.error).toMatchObject({
      code: 'FORBIDDEN',
      details: { header: 'host' },
    });
    expect(executeConnector).not.toHaveBeenCalled();
  });

  it('rejects connector refresh sources when refreshPermission is none', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-refresh-default');
    const executeConnector = vi.spyOn(connectorService, 'execute').mockResolvedValueOnce({
      ok: true,
      connectorId: 'monet',
      toolName: 'monet.metrics',
      safety: readAutoSafety(),
      output: { title: 'Default refresh', owner: '9' },
    });

    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ input: validCreateInput('Default Refresh Artifact') }),
    });
    expect(create.status).toBe(200);

    const update = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        artifactId: create.body.artifact.id,
        input: {
          document: {
            ...validCreateInput('Default Refresh Artifact').document,
            sourceJson: {
              type: 'connector_tool',
              toolName: 'monet.metrics',
              input: { report: 'defaults' },
              connector: {
                connectorId: 'monet',
                toolName: 'monet.metrics',
                approvalPolicy: 'read_only_auto',
              },
              refreshPermission: 'none',
            },
          },
        },
      }),
    });
    expect(update.status).toBe(200);
    expect(update.body.artifact.document.sourceJson.refreshPermission).toBe('none');

    const refresh = await jsonFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}/refresh?projectId=${encodeURIComponent(projectId)}`, {
      method: 'POST',
    });
    expect(refresh.status).toBe(400);
    expect(refresh.body.error).toMatchObject({
      code: 'LIVE_ARTIFACT_REFRESH_UNAVAILABLE',
      message: 'Refresh is disabled for this artifact source.',
    });
    expect(executeConnector).not.toHaveBeenCalled();
  });

  it('rejects refresh requests when no refresh source exists', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-refresh-unavailable');

    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ input: validCreateInput('No Source Artifact') }),
    });
    expect(create.status).toBe(200);

    const uiRefresh = await jsonFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}/refresh?projectId=${encodeURIComponent(projectId)}`, {
      method: 'POST',
    });
    expect(uiRefresh.status).toBe(400);
    expect(uiRefresh.body.error).toMatchObject({
      code: 'LIVE_ARTIFACT_REFRESH_UNAVAILABLE',
      message: 'No refresh source is available yet.',
    });
  });

  it('marks artifacts failed and returns connector refresh error codes', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-refresh-failure');
    vi.spyOn(connectorService, 'execute').mockRejectedValueOnce(
      new ConnectorServiceError('CONNECTOR_NOT_CONNECTED', 'connector is not connected', 403, { connectorId: 'monet' }),
    );

    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        input: {
          ...validCreateInput('Failed Refresh Artifact'),
          document: {
            ...validCreateInput('Failed Refresh Artifact').document,
            sourceJson: {
              type: 'connector_tool',
              toolName: 'monet.metrics',
              input: { report: 'fail' },
              connector: {
                connectorId: 'monet',
                toolName: 'monet.metrics',
                approvalPolicy: 'read_only_auto',
              },
              refreshPermission: 'manual_refresh_granted_for_read_only',
            },
          },
        },
      }),
    });
    expect(create.status).toBe(200);

    const refresh = await jsonFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}/refresh?projectId=${encodeURIComponent(projectId)}`, {
      method: 'POST',
    });
    expect(refresh.status).toBe(403);
    expect(refresh.body.error).toMatchObject({ code: 'CONNECTOR_NOT_CONNECTED', message: 'connector is not connected' });

    const detail = await jsonFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}?projectId=${encodeURIComponent(projectId)}`);
    expect(detail.status).toBe(200);
    expect(detail.body.artifact).toMatchObject({ refreshStatus: 'failed' });
  });

  it('serves live artifact previews with restrictive iframe headers', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-preview');
    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        input: validCreateInput('Preview Route Artifact'),
        templateHtml: '<!doctype html><html><body><h1>{{data.title}}</h1><p>{{data.owner}}</p></body></html>',
      }),
    });

    expect(create.status).toBe(200);
    const preview = await textFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}/preview?projectId=${encodeURIComponent(projectId)}`);

    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-type')).toContain('text/html');
    expect(preview.headers.get('x-content-type-options')).toBe('nosniff');
    expect(preview.headers.get('referrer-policy')).toBe('no-referrer');
    expect(preview.headers.get('access-control-allow-origin')).toBeNull();
    expect(preview.headers.get('vary')).toContain('Origin');
    const csp = preview.headers.get('content-security-policy') || '';
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain('sandbox allow-same-origin');
    expect(preview.body).toContain('<h1>Preview Route Artifact</h1>');
    expect(preview.body).toContain('<p>Agent</p>');

    const templateSource = await textFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}/preview?projectId=${encodeURIComponent(projectId)}&variant=template`);
    expect(templateSource.status).toBe(200);
    expect(templateSource.headers.get('content-type')).toContain('text/plain');
    expect(templateSource.body).toContain('{{data.title}}');

    const renderedSource = await textFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}/preview?projectId=${encodeURIComponent(projectId)}&variant=rendered-source`);
    expect(renderedSource.status).toBe(200);
    expect(renderedSource.headers.get('content-type')).toContain('text/plain');
    expect(renderedSource.body).toContain('<h1>Preview Route Artifact</h1>');
    expect(renderedSource.body).not.toContain('{{data.title}}');
  });

  it('returns API dataJson from data.json when the artifact cache diverges', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-data-json-source');
    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        input: validCreateInput('API Cache Artifact'),
        templateHtml: '<!doctype html><h1>{{data.title}}</h1><p>{{data.owner}}</p>',
      }),
    });

    expect(create.status).toBe(200);
    const diskDataJson = { title: 'Disk API Title', owner: 'data.json owner' };
    await writeFile(
      path.join(serverRuntimeDataRoot, 'projects', projectId, '.live-artifacts', create.body.artifact.id, 'data.json'),
      `${JSON.stringify(diskDataJson, null, 2)}\n`,
      'utf8',
    );

    const detail = await jsonFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}?projectId=${encodeURIComponent(projectId)}`);
    const preview = await textFetch(`${baseUrl}/api/live-artifacts/${create.body.artifact.id}/preview?projectId=${encodeURIComponent(projectId)}`);

    expect(detail.status).toBe(200);
    expect(detail.body.artifact.document.dataJson).toEqual(diskDataJson);
    expect(preview.status).toBe(200);
    expect(preview.body).toContain('<h1>Disk API Title</h1>');
    expect(preview.body).toContain('<p>data.json owner</p>');
  });

  it('rejects preview requests with non-loopback host or origin headers', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-preview-local-security');
    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        input: validCreateInput('Preview Local Security'),
        templateHtml: '<!doctype html><h1>{{data.title}}</h1>',
      }),
    });

    expect(create.status).toBe(200);
    const previewUrl = `${baseUrl}/api/live-artifacts/${create.body.artifact.id}/preview?projectId=${encodeURIComponent(projectId)}`;

    const rejectedHost = await rawHttpJsonFetch(previewUrl, { headers: { Host: 'attacker.example' } });
    expect(rejectedHost.status).toBe(403);
    expect(rejectedHost.body.error).toMatchObject({
      code: 'FORBIDDEN',
      details: { header: 'host' },
    });

    const rejectedOrigin = await jsonFetch(previewUrl, { headers: { Origin: 'https://attacker.example' } });
    expect(rejectedOrigin.status).toBe(403);
    expect(rejectedOrigin.body.error).toMatchObject({
      code: 'FORBIDDEN',
      details: { header: 'origin' },
    });
  });

  it('allows loopback-origin preview preflight without opening broad CORS', async () => {
    const projectId = uniqueProjectId();
    const response = await fetch(`${baseUrl}/api/live-artifacts/unused/preview?projectId=${encodeURIComponent(projectId)}`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:17573' },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:17573');
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');
    expect(response.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  it('rejects executable script in template previews', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-template-script');
    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        input: validCreateInput('Unsafe Template'),
        templateHtml: '<!doctype html><h1>{{data.title}}</h1><script src="/evil.js"></script>',
      }),
    });

    expect(create.status).toBe(400);
    expect(create.body.error).toMatchObject({
      code: 'LIVE_ARTIFACT_INVALID',
      details: { kind: 'validation' },
    });
    expect(JSON.stringify(create.body.error.details.issues)).toContain('script elements are not supported');
  });

  it('returns shared API validation errors from tool create', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-validation');
    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ input: { title: '' } }),
    });

    expect(create.status).toBe(400);
    expect(create.body.error).toMatchObject({
      code: 'LIVE_ARTIFACT_INVALID',
      details: { kind: 'validation' },
    });
  });

  it('rejects missing bearer token', async () => {
    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: validCreateInput() }),
    });

    expect(create.status).toBe(401);
    expect(create.body.error).toMatchObject({
      code: 'TOOL_TOKEN_MISSING',
      details: {
        endpoint: '/api/tools/live-artifacts/create',
        operation: 'live-artifacts:create',
      },
    });
  });

  it('rejects projectId overrides from the request body', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-project-override');
    const create = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        projectId: 'different-project-id',
        input: validCreateInput(),
      }),
    });

    expect(create.status).toBe(403);
    expect(create.body.error).toMatchObject({
      code: 'FORBIDDEN',
      details: { suppliedProjectId: 'different-project-id' },
    });
  });

  it('rejects tokens that are not allowed to access the endpoint', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-endpoint-denied', {
      allowedEndpoints: ['/api/tools/live-artifacts/create'],
    });

    const list = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(list.status).toBe(403);
    expect(list.body.error).toMatchObject({
      code: 'TOOL_ENDPOINT_DENIED',
      details: {
        endpoint: '/api/tools/live-artifacts/list',
        operation: 'live-artifacts:list',
      },
    });
  });

  it('rejects tokens that are not allowed to perform the operation', async () => {
    const projectId = uniqueProjectId();
    const token = mintToolToken(projectId, 'run-route-test-operation-denied', {
      allowedEndpoints: ['/api/tools/live-artifacts/list'],
      allowedOperations: ['live-artifacts:create'],
    });

    const list = await jsonFetch(`${baseUrl}/api/tools/live-artifacts/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(list.status).toBe(403);
    expect(list.body.error).toMatchObject({
      code: 'TOOL_OPERATION_DENIED',
      details: {
        endpoint: '/api/tools/live-artifacts/list',
        operation: 'live-artifacts:list',
      },
    });
  });
});

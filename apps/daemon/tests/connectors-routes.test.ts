import { request as httpRequest, type Server } from 'node:http';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPOSIO_LOGO_CACHE_MAX_ENTRIES } from '../src/connectors/routes.js';
import { startServer } from '../src/server.js';
import { ComposioConnectorProvider, composioConnectorProvider, getStaticComposioCatalogDefinitions } from '../src/connectors/composio.js';
import type { ConnectorCatalogDefinition, ConnectorDetail } from '../src/connectors/catalog.js';
import { readComposioConfig, writeComposioConfig, type ComposioConfig } from '../src/connectors/composio-config.js';
import { deleteConnectorCredentialsByProvider } from '../src/connectors/service.js';
import { CHAT_TOOL_ENDPOINTS, CHAT_TOOL_OPERATIONS, toolTokenRegistry } from '../src/tool-tokens.js';

type JsonObject = Record<string, any>;
type StartedServer = { url: string; server: Server };
type DiscoveryRequestCounts = { authConfigs: number; createdAuthConfigs: number; toolkits: number; tools: number };
type Deferred = { promise: Promise<void>; resolve: () => void };
type ComposioRequestBody = JsonObject;
type FetchInput = Parameters<typeof fetch>[0];
type FetchReturn = Awaited<ReturnType<typeof fetch>>;
type ComposioLogoFetch = (parsed: URL, init: RequestInit | undefined, input: FetchInput) => Promise<FetchReturn> | FetchReturn;

interface MockComposioFetchOptions {
  authConfigs?: JsonObject[];
  createAuthConfigResponse?: JsonObject;
  delayFirstAuthConfigs?: { started: Deferred; release: Deferred };
  delayFirstToolkits?: { started: Deferred; release: Deferred };
  logoFetch?: ComposioLogoFetch;
  linkResponse?: JsonObject | Response | Array<JsonObject | Response> | ((requestBody: ComposioRequestBody) => JsonObject | Response);
  toolsFailureToolkits?: string[];
  toolkits?: JsonObject[];
}

interface JsonFetchResponse<TBody = JsonObject> {
  status: number;
  body: TBody;
}

interface HostHeaderResponse {
  status: number | undefined;
  body: string;
}

let server: Server | undefined;
let baseUrl = '';
let originalComposioConfig: ComposioConfig;
const originalFetch = globalThis.fetch;
let lastComposioLinkRequest: ComposioRequestBody | undefined;
let lastComposioAuthConfigRequest: ComposioRequestBody | undefined;
let composioDiscoveryRequestCounts: DiscoveryRequestCounts;

function composioJson(body: JsonObject, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((innerResolve) => {
    resolve = () => innerResolve(undefined);
  });
  return { promise, resolve };
}

async function closeServer(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve(undefined);
    server.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
  });
  server = undefined;
}

function mockComposioFetch(options: MockComposioFetchOptions = {}): void {
  const {
    authConfigs = [{ id: 'ac_github', status: 'ENABLED', toolkit: { slug: 'github' } }],
    createAuthConfigResponse,
    delayFirstAuthConfigs,
    delayFirstToolkits,
    logoFetch,
    linkResponse = { connected_account_id: 'ca_github', status: 'ACTIVE', account_label: 'octocat@example.com' },
    toolsFailureToolkits = [],
    toolkits,
  } = options;
  composioDiscoveryRequestCounts = { authConfigs: 0, createdAuthConfigs: 0, toolkits: 0, tools: 0 };
  vi.stubGlobal('fetch', async (input: FetchInput, init?: RequestInit): Promise<FetchReturn> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) {
      return originalFetch(input, init);
    }
    const parsed = new URL(url);
    if (parsed.hostname === 'logos.composio.dev') {
      if (logoFetch) return await logoFetch(parsed, init, input);
      return new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      });
    }
    if (parsed.pathname === '/api/v3/auth_configs') {
      composioDiscoveryRequestCounts.authConfigs += 1;
      if (delayFirstAuthConfigs && composioDiscoveryRequestCounts.authConfigs === 1) {
        delayFirstAuthConfigs.started.resolve();
        await delayFirstAuthConfigs.release.promise;
      }
      return composioJson({ items: authConfigs });
    }
    if (parsed.pathname === '/api/v3.1/auth_configs' && init?.method === 'POST') {
      composioDiscoveryRequestCounts.createdAuthConfigs += 1;
      lastComposioAuthConfigRequest = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const toolkitSlug = lastComposioAuthConfigRequest?.toolkit?.slug ?? 'GITHUB';
      if (createAuthConfigResponse instanceof Response) return createAuthConfigResponse;
      return composioJson(createAuthConfigResponse ?? { id: `ac_${String(toolkitSlug).toLowerCase()}`, status: 'ENABLED', toolkit: { slug: toolkitSlug } });
    }
    if (parsed.pathname === '/api/v3.1/toolkits') {
      composioDiscoveryRequestCounts.toolkits += 1;
      if (delayFirstToolkits && composioDiscoveryRequestCounts.toolkits === 1) {
        delayFirstToolkits.started.resolve();
        await delayFirstToolkits.release.promise;
      }
      return composioJson({ items: toolkits ?? [
        { slug: 'github', name: 'GitHub', description: 'GitHub toolkit', categories: [{ name: 'Developer' }], meta: { tools_count: 12 } },
        { slug: 'apaleo', name: 'Apaleo', description: 'Apaleo toolkit', categories: [{ name: 'Hospitality' }], meta: { tools_count: 29 } },
      ] });
    }
    if (parsed.pathname === '/api/v3.1/tools' && toolsFailureToolkits.includes(parsed.searchParams.get('toolkit_slug') ?? '')) {
      composioDiscoveryRequestCounts.tools += 1;
      return composioJson({ message: 'Composio tools unavailable' }, 503);
    }
    if (parsed.pathname === '/api/v3.1/tools' && parsed.searchParams.get('toolkit_slug') === 'github') {
      composioDiscoveryRequestCounts.tools += 1;
      return composioJson({ items: [{ slug: 'GITHUB_SEARCH_REPOSITORIES', name: 'Search repositories', description: 'Search public and private repositories', toolkit: { slug: 'github' }, input_parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }, tags: ['read'] }] });
    }
    if (parsed.pathname === '/api/v3.1/tools' && parsed.searchParams.get('toolkit_slug') === 'notion') {
      composioDiscoveryRequestCounts.tools += 1;
      return composioJson({
        items: [
          { slug: 'NOTION_SEARCH', name: 'Search Notion', description: 'Search Notion pages and databases.', toolkit: { slug: 'notion' }, input_parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }, tags: ['read'] },
          { slug: 'NOTION_FETCH_DATABASE', name: 'Fetch database', description: 'Read a Notion database.', toolkit: { slug: 'notion' }, input_parameters: { type: 'object', properties: { database_id: { type: 'string' } }, required: ['database_id'], additionalProperties: false }, tags: ['read'] },
          { slug: 'NOTION_GET_PAGE', name: 'Get page', description: 'Read a Notion page.', toolkit: { slug: 'notion' }, input_parameters: { type: 'object', properties: { page_id: { type: 'string' } }, required: ['page_id'], additionalProperties: false }, tags: ['read'] },
        ],
        total_items: 48,
      });
    }
    if (parsed.pathname === '/api/v3.1/tools' && parsed.searchParams.get('toolkit_slug') === 'slack') {
      composioDiscoveryRequestCounts.tools += 1;
      return composioJson({ items: [
        { slug: 'SLACK_LIST_CHANNELS', name: 'List channels', description: 'List Slack channels', toolkit: { slug: 'slack' }, input_parameters: { type: 'object', additionalProperties: false }, tags: ['read'] },
        { slug: 'SLACK_SEND_MESSAGE', name: 'Send message', description: 'Send a Slack message', toolkit: { slug: 'slack' }, input_parameters: { type: 'object', additionalProperties: true }, tags: ['write'] },
      ] });
    }
    if (parsed.pathname === '/api/v3.1/tools' && parsed.searchParams.get('toolkit_slug') === 'apaleo') {
      composioDiscoveryRequestCounts.tools += 1;
      const cursor = parsed.searchParams.get('cursor');
      return composioJson({
        items: cursor
          ? [{ slug: 'APALEO_GET_PROPERTY', name: 'Get property', description: 'Read an Apaleo property.', toolkit: { slug: 'apaleo' }, input_parameters: { type: 'object', additionalProperties: false }, tags: ['read'] }]
          : [{ slug: 'APALEO_LIST_RESERVATIONS', name: 'List reservations', description: 'List Apaleo reservations.', toolkit: { slug: 'apaleo' }, input_parameters: { type: 'object', additionalProperties: false }, tags: ['read'] }],
        total_items: 29,
        ...(cursor ? {} : { next_cursor: 'cursor_page_2' }),
      });
    }
    if (parsed.pathname === '/api/v3.1/connected_accounts/link') {
      lastComposioLinkRequest = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const nextLinkResponse = typeof linkResponse === 'function'
        ? linkResponse(lastComposioLinkRequest ?? {})
        : Array.isArray(linkResponse)
          ? linkResponse.shift()
          : linkResponse;
      if (nextLinkResponse instanceof Response) return nextLinkResponse;
      return composioJson(nextLinkResponse ?? {});
    }
    if (parsed.pathname === '/api/v3/connected_accounts/ca_github') {
      return composioJson({ connected_account_id: 'ca_github', status: 'ACTIVE', account_label: 'octocat@example.com', toolkit: { slug: 'github' }, auth_config: { id: lastComposioLinkRequest?.auth_config_id ?? 'ac_github' } });
    }
    if (parsed.pathname === '/api/v3/connected_accounts/ca_slack') {
      return composioJson({ connected_account_id: 'ca_slack', status: 'ACTIVE', account_label: 'slack@example.com', toolkit: { slug: 'slack' }, auth_config: { id: lastComposioLinkRequest?.auth_config_id ?? 'ac_slack' } });
    }
    if (parsed.pathname === '/api/v3/connected_accounts/ca_notion') {
      return composioJson({ connected_account_id: 'ca_notion', status: 'ACTIVE', account_label: 'notion@example.com', toolkit: { slug: 'notion' }, auth_config: { id: lastComposioLinkRequest?.auth_config_id ?? 'ac_notion' } });
    }
    if (parsed.pathname === '/api/v3.1/tools/execute/GITHUB_SEARCH_REPOSITORIES') {
      return composioJson({ successful: true, data: { results: [] }, log_id: 'log_1' });
    }
    if (parsed.pathname === '/api/v3/connected_accounts/ca_github' && init?.method === 'DELETE') {
      return composioJson({ ok: true });
    }
    return composioJson({ message: `Unhandled Composio mock: ${url}` }, 404);
  });
}

beforeEach(async () => {
  originalComposioConfig = readComposioConfig();
  lastComposioLinkRequest = undefined;
  lastComposioAuthConfigRequest = undefined;
  mockComposioFetch();
  const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
  server = started.server;
  baseUrl = started.url;
  await jsonFetch(`${baseUrl}/api/connectors/composio/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: 'cmp_test' }),
  });
});

afterEach(async () => {
  deleteConnectorCredentialsByProvider('composio');
  writeComposioConfig(originalComposioConfig ?? { apiKey: '' });
  composioConnectorProvider.clearDiscoveryCache();
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve(undefined);
    server.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
  });
  server = undefined;
  toolTokenRegistry.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function jsonFetch<TBody = JsonObject>(url: string, init?: RequestInit): Promise<JsonFetchResponse<TBody>> {
  const response = await fetch(url, init);
  return { status: response.status, body: await response.json() as TBody };
}

async function requestWithHostHeader(method: string, url: string, host: string, body?: JsonObject): Promise<HostHeaderResponse> {
  const target = new URL(url);
  return await new Promise<HostHeaderResponse>((resolve, reject) => {
    const req = httpRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method,
        headers: {
          host,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function postWithHostHeader(url: string, host: string): Promise<HostHeaderResponse> {
  return requestWithHostHeader('POST', url, host);
}

async function putWithHostHeader(url: string, host: string, body: JsonObject): Promise<HostHeaderResponse> {
  return requestWithHostHeader('PUT', url, host, body);
}

function mintConnectorToolToken(projectId = 'connector-route-project', runId = 'connector-route-run', overrides: Partial<Parameters<typeof toolTokenRegistry.mint>[0]> = {}): string {
  return toolTokenRegistry.mint({
    projectId,
    runId,
    allowedEndpoints: CHAT_TOOL_ENDPOINTS,
    allowedOperations: CHAT_TOOL_OPERATIONS,
    ...overrides,
  }).token;
}

describe('connector routes', () => {
  it('lists catalog connectors without hitting Composio discovery endpoints', async () => {
    const response = await jsonFetch(`${baseUrl}/api/connectors`);

    expect(response.status).toBe(200);
    expect(response.body.connectors.map((connector: ConnectorDetail) => connector.id)).toEqual(expect.arrayContaining(['github', 'notion', 'google_drive', 'slack', 'zoom']));
    expect(response.body.connectors.length).toBeGreaterThan(100);
    const github = response.body.connectors.find((connector: ConnectorDetail) => connector.id === 'github');
    expect(github).toMatchObject({
      id: 'github',
      name: 'GitHub',
      provider: 'composio',
      toolCount: 2,
      auth: { provider: 'composio', configured: false },
    });
    expect(github.tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'github.github_search_repositories' })]));
    expect(response.body.connectors.find((connector: ConnectorDetail) => connector.id === 'google_drive')).toMatchObject({
      id: 'google_drive',
      auth: { provider: 'composio', configured: false },
    });
    expect(response.body.connectors.find((connector: ConnectorDetail) => connector.id === 'notion')).toMatchObject({
      id: 'notion',
      toolCount: 48,
      auth: { provider: 'composio', configured: false },
    });
    expect(response.body.connectors.find((connector: ConnectorDetail) => connector.id === 'airtable')).toMatchObject({
      id: 'airtable',
      tools: [],
      toolCount: 25,
    });
    expect(composioDiscoveryRequestCounts).toEqual({ authConfigs: 0, createdAuthConfigs: 0, toolkits: 0, tools: 0 });
  });

  it('reuses fast Composio metadata discovery results without hydrating tools', async () => {
    const first = await jsonFetch(`${baseUrl}/api/connectors/discovery`);
    const second = await jsonFetch(`${baseUrl}/api/connectors/discovery`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.connectors.map((connector: ConnectorDetail) => connector.id)).toEqual(expect.arrayContaining(['github', 'notion', 'google_drive', 'slack', 'zoom']));
    expect(second.body.connectors.map((connector: ConnectorDetail) => connector.id)).toEqual(expect.arrayContaining(['github', 'notion', 'google_drive', 'slack', 'zoom']));
    expect(first.body.connectors.find((connector: ConnectorDetail) => connector.id === 'github')).toMatchObject({ toolCount: 12 });
    expect(first.body.connectors.find((connector: ConnectorDetail) => connector.id === 'apaleo')).toMatchObject({ toolCount: 29 });
    expect(first.body.connectors.find((connector: ConnectorDetail) => connector.id === 'slack')?.tools).toEqual([]);
    expect(first.body.meta).toMatchObject({ provider: 'composio' });
    expect(composioDiscoveryRequestCounts).toEqual({ authConfigs: 1, createdAuthConfigs: 0, toolkits: 1, tools: 0 });
  });

  it('preserves static advertised tool counts when live toolkit metadata omits counts', async () => {
    mockComposioFetch({
      toolkits: [
        { slug: 'notion', name: 'Notion', description: 'Notion toolkit', categories: [{ name: 'Productivity' }], meta: {} },
      ],
    });
    composioConnectorProvider.clearDiscoveryCache();

    const response = await jsonFetch(`${baseUrl}/api/connectors/discovery?refresh=true`);

    expect(response.status).toBe(200);
    expect(response.body.connectors.find((connector: ConnectorDetail) => connector.id === 'notion')).toMatchObject({
      id: 'notion',
      toolCount: 48,
    });
    expect(composioDiscoveryRequestCounts).toEqual({ authConfigs: 1, createdAuthConfigs: 0, toolkits: 1, tools: 0 });
  });

  it('hydrates Composio tools only when explicitly requested', async () => {
    const response = await jsonFetch(`${baseUrl}/api/connectors/discovery?hydrateTools=true`);

    expect(response.status).toBe(200);
    expect(response.body.connectors.find((connector: ConnectorDetail) => connector.id === 'slack')?.tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'slack.slack_list_channels' })]));
    expect(response.body.connectors.find((connector: ConnectorDetail) => connector.id === 'github')).toMatchObject({ toolCount: 12 });
    expect(composioDiscoveryRequestCounts).toEqual({ authConfigs: 1, createdAuthConfigs: 0, toolkits: 1, tools: 4 });
  });

  it('hydrates one connector tool preview page without hydrating unrelated connectors', async () => {
    const metadata = await jsonFetch(`${baseUrl}/api/connectors/apaleo`);
    const preview = await jsonFetch(`${baseUrl}/api/connectors/apaleo?hydrateTools=true&toolsLimit=1`);
    const nextPage = await jsonFetch(`${baseUrl}/api/connectors/apaleo?hydrateTools=true&toolsLimit=1&toolsCursor=cursor_page_2`);

    expect(metadata.status).toBe(200);
    expect(metadata.body.connector).toMatchObject({ id: 'apaleo', tools: [], toolCount: 29 });
    expect(preview.status).toBe(200);
    expect(preview.body.connector).toMatchObject({
      id: 'apaleo',
      toolCount: 29,
      toolsNextCursor: 'cursor_page_2',
      toolsHasMore: true,
      tools: [expect.objectContaining({ name: 'apaleo.apaleo_list_reservations' })],
    });
    expect(nextPage.status).toBe(200);
    expect(nextPage.body.connector).toMatchObject({
      id: 'apaleo',
      toolCount: 29,
      toolsHasMore: false,
      tools: [expect.objectContaining({ name: 'apaleo.apaleo_get_property' })],
    });
    expect(nextPage.body.connector.toolsNextCursor).toBeUndefined();
    expect(composioDiscoveryRequestCounts).toEqual({ authConfigs: 1, createdAuthConfigs: 0, toolkits: 1, tools: 2 });
  });

  it('propagates Composio tool page failures during preview hydration', async () => {
    mockComposioFetch({ toolsFailureToolkits: ['apaleo'] });
    composioConnectorProvider.clearDiscoveryCache();

    const preview = await jsonFetch(`${baseUrl}/api/connectors/apaleo?hydrateTools=true&toolsLimit=1`);

    expect(preview.status).toBe(502);
    expect(preview.body.error).toMatchObject({
      code: 'CONNECTOR_EXECUTION_FAILED',
      message: 'Composio tools unavailable',
    });
    expect(composioDiscoveryRequestCounts).toEqual({ authConfigs: 1, createdAuthConfigs: 0, toolkits: 1, tools: 1 });
  });

  it('returns connector statuses by connectorId', async () => {
    await jsonFetch(`${baseUrl}/api/connectors/github/connect`, { method: 'POST' });

    const response = await jsonFetch(`${baseUrl}/api/connectors/status`);

    expect(response.status).toBe(200);
    expect(response.body.statuses.github).toMatchObject({ status: 'connected', accountLabel: 'octocat@example.com' });
    expect(response.body.statuses.notion).toMatchObject({ status: 'available' });
    expect(response.body.statuses.google_drive).toMatchObject({ status: 'available' });
  });

  it('returns static catalog connectors even when Composio auth configs are empty', async () => {
    await new Promise((resolve, reject) => {
      server!.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
    });
    mockComposioFetch({
      authConfigs: [],
      linkResponse: { connected_account_id: 'ca_slack', status: 'ACTIVE', account_label: 'slack@example.com' },
    });
    composioConnectorProvider.clearDiscoveryCache();
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    server = started.server;
    baseUrl = started.url;
    await jsonFetch(`${baseUrl}/api/connectors/composio/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'cmp_test' }),
    });

    const response = await jsonFetch(`${baseUrl}/api/connectors`);

    expect(response.status).toBe(200);
    expect(response.body.connectors.map((connector: ConnectorDetail) => connector.id)).toEqual(expect.arrayContaining(['github', 'notion', 'google_drive', 'slack', 'zoom']));
    expect(response.body.connectors.every((connector: ConnectorDetail) => connector.auth?.configured === false)).toBe(true);
  });

  it('returns static catalog connectors before Composio is configured', async () => {
    writeComposioConfig({ apiKey: '' });
    composioConnectorProvider.clearDiscoveryCache();

    const response = await jsonFetch(`${baseUrl}/api/connectors`);

    expect(response.status).toBe(200);
    expect(response.body.connectors.map((connector: ConnectorDetail) => connector.id)).toEqual(expect.arrayContaining(['github', 'notion', 'google_drive', 'slack', 'zoom']));
    expect(response.body.connectors.every((connector: ConnectorDetail) => connector.auth?.configured === false)).toBe(true);
  });

  it('returns connector detail and 404 for unknown connectors', async () => {
    const detail = await jsonFetch(`${baseUrl}/api/connectors/github`);

    expect(detail.status).toBe(200);
    expect(detail.body.connector).toMatchObject({ id: 'github', name: 'GitHub' });

    const missing = await jsonFetch(`${baseUrl}/api/connectors/missing`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('CONNECTOR_NOT_FOUND');
  });

  it('connects and disconnects a Composio connector', async () => {
    const connect = await jsonFetch(`${baseUrl}/api/connectors/github/connect`, { method: 'POST' });
    const afterConnect = { ...composioDiscoveryRequestCounts };

    expect(connect.status).toBe(200);
    expect(connect.body.connector).toMatchObject({ id: 'github', status: 'connected', accountLabel: 'octocat@example.com' });

    const disconnect = await jsonFetch(`${baseUrl}/api/connectors/github/connection`, { method: 'DELETE' });
    expect(disconnect.status).toBe(200);
    expect(disconnect.body.connector).toMatchObject({ id: 'github', status: 'available' });
    expect(composioDiscoveryRequestCounts).toEqual(afterConnect);
  });

  it('rejects cross-origin connector connect requests before starting provider auth', async () => {
    const connect = await jsonFetch(`${baseUrl}/api/connectors/github/connect`, {
      method: 'POST',
      headers: { Origin: 'https://attacker.example' },
    });

    expect(connect.status).toBe(403);
    expect(JSON.stringify(connect.body.error)).toContain('Cross-origin');
    expect(lastComposioLinkRequest).toBeUndefined();
  });

  it('rejects Composio config updates from non-loopback daemon hosts', async () => {
    const response = await putWithHostHeader(`${baseUrl}/api/connectors/composio/config`, 'example.com', { apiKey: 'cmp_remote' });

    expect(response.status).toBe(403);
    expect(response.body).toContain('request host must be a loopback daemon address');
    expect(readComposioConfig().apiKey).toBe('cmp_test');
  });

  it('clears Composio connector credentials when rotating to a key with the same tail', async () => {
    const connect = await jsonFetch(`${baseUrl}/api/connectors/github/connect`, { method: 'POST' });

    expect(connect.status).toBe(200);
    expect(connect.body.connector).toMatchObject({ id: 'github', status: 'connected' });

    const rotate = await jsonFetch(`${baseUrl}/api/connectors/composio/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'cmp_rotated_test' }),
    });
    const statuses = await jsonFetch(`${baseUrl}/api/connectors/status`);

    expect(rotate.status).toBe(200);
    expect(rotate.body).toMatchObject({ configured: true, apiKeyTail: 'test' });
    expect(statuses.body.statuses.github).toMatchObject({ status: 'available' });
  });

  it('creates a managed Composio auth config when connecting an unconfigured connector', async () => {
    await new Promise((resolve, reject) => {
      server!.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
    });
    mockComposioFetch({
      authConfigs: [],
      linkResponse: { connected_account_id: 'ca_slack', status: 'ACTIVE', account_label: 'slack@example.com' },
    });
    composioConnectorProvider.clearDiscoveryCache();
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    server = started.server;
    baseUrl = started.url;
    await jsonFetch(`${baseUrl}/api/connectors/composio/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'cmp_test' }),
    });

    const connect = await jsonFetch(`${baseUrl}/api/connectors/slack/connect`, { method: 'POST' });
    expect(composioDiscoveryRequestCounts).toEqual({ authConfigs: 1, createdAuthConfigs: 1, toolkits: 0, tools: 0 });
    expect(readComposioConfig().authConfigIds.slack).toBe('ac_slack');

    const token = mintConnectorToolToken('connector-auto-auth-project', 'connector-auto-auth-run');
    const tools = await jsonFetch(`${baseUrl}/api/tools/connectors/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(connect.status).toBe(200);
    expect(connect.body.connector).toMatchObject({ id: 'slack', status: 'connected', auth: { configured: true } });
    expect(connect.body.connector.tools).toEqual([]);
    expect(lastComposioAuthConfigRequest).toEqual({
      toolkit: { slug: 'SLACK' },
      auth_config: { type: 'use_composio_managed_auth' },
    });
    expect(lastComposioLinkRequest).toMatchObject({ auth_config_id: 'ac_slack' });
    expect(tools.status).toBe(200);
    expect(tools.body.connectors.find((connector: ConnectorDetail) => connector.id === 'slack')?.tools).toEqual([
      expect.objectContaining({ name: 'slack.slack_list_channels' }),
    ]);
    expect(composioDiscoveryRequestCounts).toMatchObject({ authConfigs: 2, createdAuthConfigs: 1 });
  });

  it('reuses persisted Composio auth config ids on later connect attempts', async () => {
    await closeServer();
    mockComposioFetch({
      authConfigs: [],
      linkResponse: { connected_account_id: 'ca_slack', status: 'ACTIVE', account_label: 'slack@example.com' },
    });
    composioConnectorProvider.clearDiscoveryCache();
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    server = started.server;
    baseUrl = started.url;
    await jsonFetch(`${baseUrl}/api/connectors/composio/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'cmp_test' }),
    });

    const first = await jsonFetch(`${baseUrl}/api/connectors/slack/connect`, { method: 'POST' });
    const afterFirst = { ...composioDiscoveryRequestCounts };
    const second = await jsonFetch(`${baseUrl}/api/connectors/slack/connect`, { method: 'POST' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(readComposioConfig().authConfigIds.slack).toBe('ac_slack');
    expect(afterFirst).toEqual({ authConfigs: 1, createdAuthConfigs: 1, toolkits: 0, tools: 0 });
    expect(composioDiscoveryRequestCounts).toEqual(afterFirst);
    expect(lastComposioLinkRequest).toMatchObject({ auth_config_id: 'ac_slack' });
  });

  it('prepares a Composio auth config before connect and then reuses it for the link', async () => {
    await closeServer();
    mockComposioFetch({
      authConfigs: [],
      linkResponse: { connected_account_id: 'ca_slack', status: 'ACTIVE', account_label: 'slack@example.com' },
    });
    composioConnectorProvider.clearDiscoveryCache();
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    server = started.server;
    baseUrl = started.url;
    await jsonFetch(`${baseUrl}/api/connectors/composio/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'cmp_test' }),
    });

    const prepare = await jsonFetch(`${baseUrl}/api/connectors/auth-configs/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectorIds: ['slack'] }),
    });
    const afterPrepare = { ...composioDiscoveryRequestCounts };
    const connect = await jsonFetch(`${baseUrl}/api/connectors/slack/connect`, { method: 'POST' });

    expect(prepare.status).toBe(200);
    expect(prepare.body.results.slack).toEqual({ status: 'ready', authConfigId: 'ac_slack' });
    expect(readComposioConfig().authConfigIds.slack).toBe('ac_slack');
    expect(afterPrepare).toEqual({ authConfigs: 1, createdAuthConfigs: 1, toolkits: 0, tools: 0 });
    expect(connect.status).toBe(200);
    expect(composioDiscoveryRequestCounts).toEqual(afterPrepare);
    expect(lastComposioLinkRequest).toMatchObject({ auth_config_id: 'ac_slack' });
  });

  it('refreshes a stale persisted auth config id once when creating a link fails', async () => {
    await closeServer();
    mockComposioFetch({
      authConfigs: [{ id: 'ac_slack_fresh', status: 'ENABLED', toolkit: { slug: 'slack' } }],
      linkResponse: (requestBody: ComposioRequestBody) => requestBody.auth_config_id === 'ac_slack_stale'
        ? composioJson({ message: 'stale auth config' }, 404)
        : { connected_account_id: 'ca_slack', status: 'ACTIVE', account_label: 'slack@example.com' },
    });
    composioConnectorProvider.clearDiscoveryCache();
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    server = started.server;
    baseUrl = started.url;
    writeComposioConfig({ apiKey: 'cmp_test', authConfigIds: { slack: 'ac_slack_stale' } });

    const connect = await jsonFetch(`${baseUrl}/api/connectors/slack/connect`, { method: 'POST' });

    expect(connect.status).toBe(200);
    expect(readComposioConfig().authConfigIds.slack).toBe('ac_slack_fresh');
    expect(composioDiscoveryRequestCounts).toEqual({ authConfigs: 1, createdAuthConfigs: 0, toolkits: 0, tools: 0 });
    expect(lastComposioLinkRequest).toMatchObject({ auth_config_id: 'ac_slack_fresh' });
  });

  it('marks Composio auth as configured from a persisted local auth config id', async () => {
    writeComposioConfig({ apiKey: 'cmp_test', authConfigIds: { slack: 'ac_slack' } });

    const response = await jsonFetch(`${baseUrl}/api/connectors`);

    expect(response.status).toBe(200);
    expect(response.body.connectors.find((connector: ConnectorDetail) => connector.id === 'slack')).toMatchObject({
      auth: { provider: 'composio', configured: true },
    });
  });

  it('surfaces nested Composio auth config creation errors', async () => {
    await closeServer();
    mockComposioFetch({
      authConfigs: [],
      createAuthConfigResponse: composioJson({
        error: {
          message: 'Default auth config not found for toolkit "canvas".',
          suggested_fix: 'Use type "use_custom_auth" with your own credentials.',
        },
      }, 400),
    });
    composioConnectorProvider.clearDiscoveryCache();
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    server = started.server;
    baseUrl = started.url;
    await jsonFetch(`${baseUrl}/api/connectors/composio/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'cmp_test' }),
    });

    const connect = await jsonFetch(`${baseUrl}/api/connectors/canvas/connect`, { method: 'POST' });

    expect(connect.status).toBe(502);
    expect(connect.body.error.message).toBe('Default auth config not found for toolkit "canvas".');
  });

  it('rejects immediate Composio connections when account validation does not match the connector', async () => {
    await new Promise((resolve, reject) => {
      server!.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
    });
    mockComposioFetch({
      authConfigs: [],
      linkResponse: { connected_account_id: 'ca_github', status: 'ACTIVE', account_label: 'octocat@example.com' },
    });
    composioConnectorProvider.clearDiscoveryCache();
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    server = started.server;
    baseUrl = started.url;
    await jsonFetch(`${baseUrl}/api/connectors/composio/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'cmp_test' }),
    });

    const connect = await jsonFetch(`${baseUrl}/api/connectors/slack/connect`, { method: 'POST' });

    expect(connect.status).toBe(403);
    expect(connect.body.error.code).toBe('CONNECTOR_EXECUTION_FAILED');
  });

  it('does not let stale in-flight discovery overwrite a newly created auth config', async () => {
    const started = createDeferred();
    const release = createDeferred();
    await new Promise((resolve, reject) => {
      server!.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
    });
    mockComposioFetch({
      authConfigs: [],
      delayFirstToolkits: { started, release },
      linkResponse: { connected_account_id: 'ca_slack', status: 'ACTIVE', account_label: 'slack@example.com' },
    });
    composioConnectorProvider.clearDiscoveryCache();
    const restarted = await startServer({ port: 0, returnServer: true }) as StartedServer;
    server = restarted.server;
    baseUrl = restarted.url;
    await jsonFetch(`${baseUrl}/api/connectors/composio/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'cmp_test' }),
    });
    const staleDiscovery = composioConnectorProvider.listDefinitions(undefined, { hydrateTools: true });
    await started.promise;

    const slack = getStaticComposioCatalogDefinitions().find((connector: ConnectorCatalogDefinition) => connector.id === 'slack');
    expect(slack).toBeDefined();
    await composioConnectorProvider.connect(slack!, `${baseUrl}/api/connectors/oauth/callback/slack`);
    release.resolve();
    await staleDiscovery;

    const hydrated = await composioConnectorProvider.getHydratedDefinition('slack');
    expect(hydrated?.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining(['slack.slack_list_channels', 'slack.slack_send_message']));
    expect(hydrated?.allowedToolNames).toEqual(['slack.slack_list_channels']);
  });

  it('TTL-prunes pending Composio OAuth states even if callbacks never arrive', async () => {
    mockComposioFetch({
      linkResponse: {
        connected_account_id: 'ca_github',
        status: 'INITIATED',
        redirect_url: 'https://example.com/oauth',
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T00:00:00.000Z'));
    const provider = new ComposioConnectorProvider();
    const github = getStaticComposioCatalogDefinitions().find((connector: ConnectorCatalogDefinition) => connector.id === 'github');
    expect(github).toBeDefined();

    await provider.connect(github!, `${baseUrl}/api/connectors/oauth/callback/github`);
    expect((provider as unknown as { pendingConnections: Map<string, unknown> }).pendingConnections.size).toBe(1);

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    await provider.connect(github!, `${baseUrl}/api/connectors/oauth/callback/github`);

    expect((provider as unknown as { pendingConnections: Map<string, unknown> }).pendingConnections.size).toBe(1);
  });

  it('returns branded callback HTML that notifies the opener', async () => {
    await new Promise((resolve, reject) => {
      if (!server) return resolve(undefined);
      server!.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
    });
    mockComposioFetch({
      linkResponse: {
        connected_account_id: 'ca_github',
        status: 'INITIATED',
        redirect_url: 'https://example.com/oauth',
      },
    });
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    server = started.server;
    baseUrl = started.url;
    await jsonFetch(`${baseUrl}/api/connectors/composio/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'cmp_test' }),
    });

    const connect = await jsonFetch(`${baseUrl}/api/connectors/github/connect`, { method: 'POST' });
    expect(connect.status).toBe(200);
    expect(connect.body.auth).toMatchObject({ kind: 'redirect_required' });
    expect(lastComposioLinkRequest).toBeDefined();
    const callbackUrl = new URL(String(lastComposioLinkRequest!.callback_url));
    const state = callbackUrl.searchParams.get('state');
    expect(state).not.toBeNull();

    const response = await fetch(
      `${baseUrl}/api/connectors/oauth/callback/github?state=${encodeURIComponent(state!)}&status=success&connected_account_id=ca_github`,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<main aria-labelledby="callback-title">');
    expect(html).toContain('GitHub connected');
    expect(html).toContain('Open Design');
    expect(html).toContain('open-design:connector-connected');
    expect(html).toContain('function requestClose()');
    expect(html).toContain('Your browser blocked automatic closing. You can close this tab and return to Open Design.');
    expect(html).not.toContain('<p>Connector connected. You can close this window.</p>');
    expect(readComposioConfig().authConfigIds.github).toBe('ac_github');

    const duplicateResponse = await fetch(
      `${baseUrl}/api/connectors/oauth/callback/github?state=${encodeURIComponent(callbackUrl.searchParams.get('state') ?? '')}&status=success&connected_account_id=ca_github`,
    );
    const duplicateHtml = await duplicateResponse.text();

    expect(duplicateResponse.status).toBe(200);
    expect(duplicateHtml).toContain('GitHub connected');
  });

  it('cancels pending Composio OAuth state before a stale callback can connect', async () => {
    await closeServer();
    mockComposioFetch({
      linkResponse: {
        connected_account_id: 'ca_github',
        status: 'INITIATED',
        redirect_url: 'https://example.com/oauth',
      },
    });
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    server = started.server;
    baseUrl = started.url;
    await jsonFetch(`${baseUrl}/api/connectors/composio/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'cmp_test' }),
    });

    const connect = await jsonFetch(`${baseUrl}/api/connectors/github/connect`, { method: 'POST' });
    expect(connect.status).toBe(200);
    expect(connect.body.auth).toMatchObject({ kind: 'redirect_required' });
    const callbackUrl = new URL(lastComposioLinkRequest!.callback_url);

    const cancel = await jsonFetch(`${baseUrl}/api/connectors/github/authorization/cancel`, { method: 'POST' });
    expect(cancel.status).toBe(200);
    expect(cancel.body.connector).toMatchObject({ id: 'github', status: 'available' });

    const staleCallback = await fetch(
      `${baseUrl}/api/connectors/oauth/callback/github?state=${encodeURIComponent(callbackUrl.searchParams.get('state') ?? '')}&status=success&connected_account_id=ca_github`,
    );
    const stalePayload = await staleCallback.json() as JsonObject;

    expect(staleCallback.status).toBe(400);
    expect(stalePayload.error.message).toBe('Composio OAuth state is missing or expired');
    const statuses = await jsonFetch(`${baseUrl}/api/connectors/status`);
    expect(statuses.body.statuses.github?.status).not.toBe('connected');
  });

  it('accepts bracketed IPv6 loopback host headers for connector callback URLs', async () => {
    const url = new URL(baseUrl);

    const response = await postWithHostHeader(`${baseUrl}/api/connectors/github/connect`, `[::1]:${url.port}`);

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).auth).toMatchObject({ kind: 'connected' });
    expect(lastComposioLinkRequest?.callback_url).toContain(`[::1]:${url.port}/api/connectors/oauth/callback`);
  });

  it('accepts IPv4 loopback alias host headers for connector callback URLs', async () => {
    const url = new URL(baseUrl);

    const response = await postWithHostHeader(`${baseUrl}/api/connectors/github/connect`, `127.0.0.2:${url.port}`);

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body).auth).toMatchObject({ kind: 'connected' });
    expect(lastComposioLinkRequest?.callback_url).toContain(`127.0.0.2:${url.port}/api/connectors/oauth/callback`);
  });

  it('times out stalled Composio logo fetches and clears the inflight entry', async () => {
    let upstreamRequests = 0;
    let firstRequestAborted = false;
    mockComposioFetch({
      logoFetch: async (_parsed, init) => {
        upstreamRequests += 1;
        if (upstreamRequests === 1) {
          await new Promise((_, reject) => {
            if (!init?.signal) {
              reject(new Error('expected fetch timeout signal'));
              return;
            }
            const abort = () => {
              firstRequestAborted = true;
              reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
            };
            if (init.signal.aborted) {
              abort();
              return;
            }
            init.signal.addEventListener('abort', abort, { once: true });
          });
        }
        return new Response(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      },
    });

    const firstRequestPromise = fetch(`${baseUrl}/api/connectors/logos/github?theme=dark`);
    const firstResponse = await firstRequestPromise;

    expect(firstRequestAborted).toBe(true);
    expect(firstResponse.status).toBe(404);

    const secondResponse = await fetch(`${baseUrl}/api/connectors/logos/github?theme=dark`);

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await secondResponse.arrayBuffer())).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(upstreamRequests).toBe(2);
  }, 15_000);

  it('keeps the Composio logo timeout active while reading the response body', async () => {
    let upstreamRequests = 0;
    let firstBodyReadAborted = false;
    const slug = 'body_timeout_logo';
    mockComposioFetch({
      logoFetch: async (_parsed, init) => {
        upstreamRequests += 1;
        if (upstreamRequests === 1) {
          return {
            ok: true,
            headers: new Headers({ 'content-type': 'image/png' }),
            arrayBuffer: async () => {
              await new Promise((resolve) => setTimeout(resolve, 2_100));
              if (!init?.signal) throw new Error('expected fetch timeout signal');
              if (init.signal.aborted) {
                firstBodyReadAborted = true;
                throw (init.signal.reason ?? new DOMException('Aborted', 'AbortError'));
              }
              return Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
            },
          } as unknown as Response;
        }
        return new Response(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      },
    });

    const firstResponse = await fetch(`${baseUrl}/api/connectors/logos/${slug}?theme=dark`);

    expect(firstBodyReadAborted).toBe(true);
    expect(firstResponse.status).toBe(404);

    const secondResponse = await fetch(`${baseUrl}/api/connectors/logos/${slug}?theme=dark`);

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await secondResponse.arrayBuffer())).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(upstreamRequests).toBe(2);
  }, 15_000);

  it('rejects oversized Composio logo payloads before buffering them', async () => {
    let upstreamRequests = 0;
    let arrayBufferCalled = false;
    const slug = 'oversized_logo';
    mockComposioFetch({
      logoFetch: async () => {
        upstreamRequests += 1;
        if (upstreamRequests === 1) {
          return {
            ok: true,
            headers: new Headers({
              'content-type': 'image/png',
              'content-length': '1048577',
            }),
            arrayBuffer: async () => {
              arrayBufferCalled = true;
              return Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
            },
          } as unknown as Response;
        }
        return new Response(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      },
    });

    const firstResponse = await fetch(`${baseUrl}/api/connectors/logos/${slug}?theme=dark`);

    expect(firstResponse.status).toBe(404);
    expect(firstResponse.headers.get('cache-control')).toBe('no-store');
    expect(arrayBufferCalled).toBe(false);

    const secondResponse = await fetch(`${baseUrl}/api/connectors/logos/${slug}?theme=dark`);

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await secondResponse.arrayBuffer())).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(upstreamRequests).toBe(2);
  });

  it('evicts the least recently used Composio logo cache entry when the cache is full', async () => {
    let upstreamRequests = 0;
    mockComposioFetch({
      logoFetch: async (parsed) => {
        upstreamRequests += 1;
        return new Response(Buffer.from(parsed.pathname), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      },
    });

    for (let index = 0; index < COMPOSIO_LOGO_CACHE_MAX_ENTRIES; index += 1) {
      const response = await fetch(`${baseUrl}/api/connectors/logos/slug_${index}?theme=dark`);
      expect(response.status).toBe(200);
    }

    const warmedCount = upstreamRequests;

    const refreshedResponse = await fetch(`${baseUrl}/api/connectors/logos/slug_0?theme=dark`);
    expect(refreshedResponse.status).toBe(200);
    expect(upstreamRequests).toBe(warmedCount);

    const overflowResponse = await fetch(`${baseUrl}/api/connectors/logos/slug_overflow?theme=dark`);
    expect(overflowResponse.status).toBe(200);
    expect(upstreamRequests).toBe(warmedCount + 1);

    const stillCachedResponse = await fetch(`${baseUrl}/api/connectors/logos/slug_0?theme=dark`);
    expect(stillCachedResponse.status).toBe(200);
    expect(upstreamRequests).toBe(warmedCount + 1);

    const evictedResponse = await fetch(`${baseUrl}/api/connectors/logos/slug_1?theme=dark`);
    expect(evictedResponse.status).toBe(200);
    expect(upstreamRequests).toBe(warmedCount + 2);
  });

  it('serves raster Composio logo responses', async () => {
    mockComposioFetch({
      logoFetch: async () => {
        return new Response(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      },
    });

    const response = await fetch(`${baseUrl}/api/connectors/logos/github?theme=dark`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  it('serves SVG Composio logo responses with a restrictive CSP', async () => {
    let upstreamRequests = 0;
    const slug = 'svg_only_logo';
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
    mockComposioFetch({
      logoFetch: async () => {
        upstreamRequests += 1;
        return new Response(svg, {
          status: 200,
          headers: { 'content-type': 'image/svg+xml' },
        });
      },
    });

    const firstResponse = await fetch(`${baseUrl}/api/connectors/logos/${slug}?theme=dark`);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.headers.get('content-type')).toBe('image/svg+xml');
    expect(firstResponse.headers.get('content-security-policy')).toBe("default-src 'none'; img-src data:; style-src 'unsafe-inline'");
    expect(await firstResponse.text()).toBe(svg);

    const secondResponse = await fetch(`${baseUrl}/api/connectors/logos/${slug}?theme=dark`);

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.headers.get('content-type')).toBe('image/svg+xml');
    expect(await secondResponse.text()).toBe(svg);
    expect(upstreamRequests).toBe(1);
  });

  it('rejects non-image Composio logo responses without caching them', async () => {
    let upstreamRequests = 0;
    const slug = 'html_only_logo';
    mockComposioFetch({
      logoFetch: async () => {
        upstreamRequests += 1;
        if (upstreamRequests === 1) {
          return new Response('<html><body>oops</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        }
        return new Response(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      },
    });

    const firstResponse = await fetch(`${baseUrl}/api/connectors/logos/${slug}?theme=dark`);

    expect(firstResponse.status).toBe(404);
    expect(firstResponse.headers.get('cache-control')).toBe('no-store');

    const secondResponse = await fetch(`${baseUrl}/api/connectors/logos/${slug}?theme=dark`);

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await secondResponse.arrayBuffer())).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(upstreamRequests).toBe(2);
  });

  it('lists connected Composio tools through run-scoped tool auth', async () => {
    await jsonFetch(`${baseUrl}/api/connectors/github/connect`, { method: 'POST' });
    const token = mintConnectorToolToken();
    composioDiscoveryRequestCounts = { authConfigs: 0, createdAuthConfigs: 0, toolkits: 0, tools: 0 };

    const response = await jsonFetch(`${baseUrl}/api/tools/connectors/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(response.body.connectors.map((connector: ConnectorDetail) => connector.id)).toEqual(['github']);
    expect(response.body.connectors[0].tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'github.github_search_repositories', safety: expect.objectContaining({ sideEffect: 'read', approval: 'auto', reason: expect.any(String) }) }),
    ]));
    expect(composioDiscoveryRequestCounts).toEqual({ authConfigs: 1, createdAuthConfigs: 0, toolkits: 1, tools: 1 });
  });

  it('hydrates connected Composio tools when the fast definition only has partial static previews', async () => {
    await closeServer();
    mockComposioFetch({
      authConfigs: [{ id: 'ac_notion', status: 'ENABLED', toolkit: { slug: 'notion' } }],
      linkResponse: { connected_account_id: 'ca_notion', status: 'ACTIVE', account_label: 'notion@example.com' },
      toolkits: [
        { slug: 'notion', name: 'Notion', description: 'Notion toolkit', categories: [{ name: 'Productivity' }], meta: { tools_count: 48 } },
      ],
    });
    composioConnectorProvider.clearDiscoveryCache();
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    server = started.server;
    baseUrl = started.url;
    await jsonFetch(`${baseUrl}/api/connectors/composio/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'cmp_test' }),
    });
    await jsonFetch(`${baseUrl}/api/connectors/notion/connect`, { method: 'POST' });
    const token = mintConnectorToolToken('connector-partial-preview-project', 'connector-partial-preview-run');
    composioDiscoveryRequestCounts = { authConfigs: 0, createdAuthConfigs: 0, toolkits: 0, tools: 0 };

    const response = await jsonFetch(`${baseUrl}/api/tools/connectors/list`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(response.body.connectors.map((connector: ConnectorDetail) => connector.id)).toEqual(['notion']);
    expect(response.body.connectors[0].tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'notion.notion_search' }),
      expect.objectContaining({ name: 'notion.notion_fetch_database' }),
      expect.objectContaining({ name: 'notion.notion_get_page' }),
    ]));
    expect(composioDiscoveryRequestCounts.tools).toBe(1);
  });

  it('filters connected connector tools by curated use case and returns curation metadata', async () => {
    await new Promise((resolve, reject) => {
      server!.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
    });
    mockComposioFetch({
      authConfigs: [{ id: 'ac_slack', status: 'ENABLED', toolkit: { slug: 'slack' } }],
      linkResponse: { connected_account_id: 'ca_slack', status: 'ACTIVE', account_label: 'slack@example.com' },
    });
    composioConnectorProvider.clearDiscoveryCache();
    const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    server = started.server;
    baseUrl = started.url;
    await jsonFetch(`${baseUrl}/api/connectors/composio/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'cmp_test' }),
    });
    await jsonFetch(`${baseUrl}/api/connectors/slack/connect`, { method: 'POST' });
    const token = mintConnectorToolToken();

    const response = await jsonFetch(`${baseUrl}/api/tools/connectors/list?useCase=personal_daily_digest`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(200);
    expect(response.body.connectors.map((connector: ConnectorDetail) => connector.id)).toEqual(['slack']);
    expect(response.body.connectors[0].tools).toEqual([
      expect.objectContaining({
        name: 'slack.slack_list_channels',
        curation: expect.objectContaining({ useCases: ['personal_daily_digest'] }),
      }),
    ]);
  });

  it('rejects invalid connector tool useCase filters', async () => {
    const token = mintConnectorToolToken();

    const response = await jsonFetch(`${baseUrl}/api/tools/connectors/list?useCase=invalid`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  it('executes connected Composio tools through run-scoped tool auth', async () => {
    await jsonFetch(`${baseUrl}/api/connectors/github/connect`, { method: 'POST' });
    const token = mintConnectorToolToken('connector-execute-project', 'connector-execute-run');

    const response = await jsonFetch(`${baseUrl}/api/tools/connectors/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ connectorId: 'github', toolName: 'github.github_search_repositories', input: { query: 'open-design' } }),
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, connectorId: 'github', accountLabel: 'octocat@example.com', toolName: 'github.github_search_repositories' });
    expect(response.body.output).toMatchObject({ toolName: 'github.github_search_repositories', providerToolId: 'GITHUB_SEARCH_REPOSITORIES', data: { results: [] } });
  });

  it('rejects connector tool requests outside token scope', async () => {
    const listOnlyToken = mintConnectorToolToken('connector-scope-project', 'connector-scope-run', {
      allowedEndpoints: ['/api/tools/connectors/list'],
      allowedOperations: ['connectors:list'],
    });

    const execute = await jsonFetch(`${baseUrl}/api/tools/connectors/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${listOnlyToken}` },
      body: JSON.stringify({ connectorId: 'github', toolName: 'github.github_search_repositories', input: { query: 'open-design' } }),
    });

    expect(execute.status).toBe(403);
    expect(execute.body.error.code).toBe('TOOL_ENDPOINT_DENIED');
  });
});

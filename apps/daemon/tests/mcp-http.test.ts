import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import {
  createServer,
  request as httpRequest,
  type RequestListener,
  type Server,
} from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TOOL_DEFS } from '../src/mcp.js';
import {
  startMcpHttpServer,
  type McpHttpServerHandle,
} from '../src/mcp/http.js';

interface ConnectedClient {
  client: Client;
  transport: StreamableHTTPClientTransport;
}

const handles: McpHttpServerHandle[] = [];
const daemonServers: Server[] = [];
const clients: ConnectedClient[] = [];

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map(({ client }) => client.close()));
  await Promise.allSettled(handles.splice(0).map((handle) => handle.close()));
  await Promise.allSettled(
    daemonServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

async function startHttpMcp(
  options: Partial<Parameters<typeof startMcpHttpServer>[0]> = {},
) {
  const handle = await startMcpHttpServer({
    daemonUrl: 'http://127.0.0.1:1',
    port: 0,
    ...options,
  });
  handles.push(handle);
  return handle;
}

async function connectClient(url: string, name: string): Promise<ConnectedClient> {
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({ name, version: '1.0.0' });
  await client.connect(transport as unknown as Transport);
  const connected = { client, transport };
  clients.push(connected);
  return connected;
}

async function listenDaemon(
  handler: RequestListener,
): Promise<{ server: Server; url: string }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  daemonServers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('daemon fixture did not expose a TCP address');
  }
  return { server, url: `http://127.0.0.1:${address.port}` };
}

function initializeBody(id: number) {
  return {
    id,
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      capabilities: {},
      clientInfo: { name: `raw-${id}`, version: '1.0.0' },
      protocolVersion: LATEST_PROTOCOL_VERSION,
    },
  };
}

describe('MCP Streamable HTTP transport', () => {
  it('serves five independent clients from one listener with tool parity', async () => {
    const handle = await startHttpMcp();
    const connected = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        connectClient(handle.url, `client-${index + 1}`),
      ),
    );

    const sessionIds = connected.map(({ transport }) => transport.sessionId);
    expect(new Set(sessionIds).size).toBe(5);
    expect(sessionIds.every(Boolean)).toBe(true);
    expect(handle.sessionCount()).toBe(5);

    const toolLists = await Promise.all(
      connected.map(({ client }) => client.listTools()),
    );
    const expectedNames = TOOL_DEFS.map((tool) => tool.name);
    for (const toolList of toolLists) {
      expect(toolList.tools.map((tool) => tool.name)).toEqual(expectedNames);
    }
  });

  it('keeps session-local brief state isolated', async () => {
    const handle = await startHttpMcp();
    const first = await connectClient(handle.url, 'first');
    const second = await connectClient(handle.url, 'second');

    const collected = await first.client.callTool({
      arguments: { artifactType: 'website' },
      name: 'collect_brief',
    });
    const draft = collected.structuredContent as {
      briefDraftId: string;
      nonce: string;
    };
    const crossSessionConfirmation = await second.client.callTool({
      arguments: {
        answers: {},
        briefDraftId: draft.briefDraftId,
        nonce: draft.nonce,
      },
      name: 'confirm_brief',
    });

    expect(crossSessionConfirmation.isError).toBe(true);
    expect(JSON.stringify(crossSessionConfirmation.content)).toContain(
      'expired or is unknown',
    );
  });

  it('requires initialize to create a session and rejects unknown sessions', async () => {
    const handle = await startHttpMcp();

    const invalidInitialization = await fetch(handle.url, {
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'tools/list' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(invalidInitialization.status).toBe(400);
    expect(handle.sessionCount()).toBe(0);

    const largeInitialization = initializeBody(2) as ReturnType<
      typeof initializeBody
    > & { params: ReturnType<typeof initializeBody>['params'] & { padding: string } };
    largeInitialization.params.padding = 'x'.repeat(200 * 1_024);
    const acceptedLargeRequest = await fetch(handle.url, {
      body: JSON.stringify(largeInitialization),
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    expect(acceptedLargeRequest.status).toBe(200);
    const largeSessionId = acceptedLargeRequest.headers.get('mcp-session-id');
    expect(largeSessionId).toBeTruthy();
    const deletedLargeSession = await fetch(handle.url, {
      headers: { 'mcp-session-id': largeSessionId! },
      method: 'DELETE',
    });
    expect(deletedLargeSession.status).toBe(200);
    expect(handle.sessionCount()).toBe(0);

    const oversizedRequest = await fetch(handle.url, {
      body: JSON.stringify({ padding: 'x'.repeat(4 * 1_024 * 1_024) }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(oversizedRequest.status).toBe(413);
    expect(handle.sessionCount()).toBe(0);

    const unknownSession = await fetch(handle.url, {
      headers: { 'mcp-session-id': randomSessionId() },
    });
    expect(unknownSession.status).toBe(404);
  });

  it('reserves capacity before concurrent initialization completes', async () => {
    const handle = await startHttpMcp({ maxSessions: 1 });
    const request = (id: number) =>
      fetch(handle.url, {
        body: JSON.stringify(initializeBody(id)),
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        method: 'POST',
      });

    const responses = await Promise.all([request(1), request(2)]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200,
      503,
    ]);
    expect(handle.sessionCount()).toBe(1);
  });

  it('does not count an initialized session as both active and pending', async () => {
    let firstInitialization = true;
    let releaseFirstInitialization!: () => void;
    let noteFirstInitialization!: () => void;
    const firstInitializationGate = new Promise<void>((resolve) => {
      releaseFirstInitialization = resolve;
    });
    const firstInitializationReached = new Promise<void>((resolve) => {
      noteFirstInitialization = resolve;
    });
    const handle = await startHttpMcp({
      maxSessions: 2,
      onSessionInitialized: async () => {
        if (!firstInitialization) return;
        firstInitialization = false;
        noteFirstInitialization();
        await firstInitializationGate;
      },
    });
    const request = (id: number) =>
      fetch(handle.url, {
        body: JSON.stringify(initializeBody(id)),
        headers: {
          accept: 'application/json, text/event-stream',
          'content-type': 'application/json',
        },
        method: 'POST',
      });

    const firstRequest = request(1);
    try {
      await firstInitializationReached;
      const secondResponse = await request(2);
      expect(secondResponse.status).toBe(200);
      await secondResponse.text();
    } finally {
      releaseFirstInitialization();
    }
    const firstResponse = await firstRequest;
    expect(firstResponse.status).toBe(200);
    await firstResponse.text();
    expect(handle.sessionCount()).toBe(2);
  });

  it('deletes a session once when the client terminates it', async () => {
    const handle = await startHttpMcp({ maxSessions: 1 });
    const connected = await connectClient(handle.url, 'terminating-client');
    expect(handle.sessionCount()).toBe(1);

    await connected.transport.terminateSession();

    expect(handle.sessionCount()).toBe(0);
    const replacement = await connectClient(handle.url, 'replacement-client');
    expect(replacement.transport.sessionId).toBeTruthy();
    expect(handle.sessionCount()).toBe(1);
    await expect(handle.close()).resolves.toBeUndefined();
    await expect(handle.close()).resolves.toBeUndefined();
  });

  it('expires idle sessions but never closes an in-flight request', async () => {
    let now = 10_000;
    let releaseProjects!: () => void;
    let noteProjectsRequested!: () => void;
    const projectsGate = new Promise<void>((resolve) => {
      releaseProjects = resolve;
    });
    const projectsRequested = new Promise<void>((resolve) => {
      noteProjectsRequested = resolve;
    });
    const daemon = await listenDaemon(async (req, res) => {
      if (req.url === '/api/projects') {
        noteProjectsRequested();
        await projectsGate;
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(req.url === '/api/projects' ? '{"projects":[]}' : '{}');
    });
    const handle = await startHttpMcp({
      daemonUrl: daemon.url,
      now: () => now,
      sessionIdleTimeoutMs: 1_000,
    });
    const connected = await connectClient(handle.url, 'busy-client');

    const request = connected.client.callTool({
      arguments: {},
      name: 'list_projects',
    });
    await projectsRequested;
    now += 2_000;
    await handle.sweepIdleSessions();
    expect(handle.sessionCount()).toBe(1);

    releaseProjects();
    await request;
    now += 999;
    await handle.sweepIdleSessions();
    expect(handle.sessionCount()).toBe(1);
    now += 1;
    await handle.sweepIdleSessions();
    expect(handle.sessionCount()).toBe(0);
  });

  it('aborts an in-flight daemon request during shutdown', async () => {
    let releaseProjects!: () => void;
    let noteProjectsRequested!: () => void;
    let noteProjectsAborted!: () => void;
    const projectsGate = new Promise<void>((resolve) => {
      releaseProjects = resolve;
    });
    const projectsRequested = new Promise<void>((resolve) => {
      noteProjectsRequested = resolve;
    });
    const projectsAborted = new Promise<void>((resolve) => {
      noteProjectsAborted = resolve;
    });
    const daemon = await listenDaemon(async (req, res) => {
      if (req.url === '/api/projects') {
        req.once('aborted', noteProjectsAborted);
        noteProjectsRequested();
        await projectsGate;
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(req.url === '/api/projects' ? '{"projects":[]}' : '{}');
    });
    const handle = await startHttpMcp({ daemonUrl: daemon.url });
    const connected = await connectClient(handle.url, 'shutdown-client');
    const request = connected.client.callTool({
      arguments: {},
      name: 'list_projects',
    }).catch(() => undefined);

    try {
      await projectsRequested;
      const closeOutcome = await Promise.race([
        handle.close().then(() => 'closed'),
        new Promise<'timed-out'>((resolve) => {
          setTimeout(() => resolve('timed-out'), 1_000);
        }),
      ]);
      expect(closeOutcome).toBe('closed');
      const abortOutcome = await Promise.race([
        projectsAborted.then(() => 'aborted'),
        new Promise<'timed-out'>((resolve) => {
          setTimeout(() => resolve('timed-out'), 1_000);
        }),
      ]);
      expect(abortOutcome).toBe('aborted');
    } finally {
      releaseProjects();
    }
    await connected.client.close().catch(() => undefined);
    await request;
  });

  it('rediscovers an implicit daemon URL once and retries the failed call', async () => {
    const daemon = await listenDaemon((req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(req.url === '/api/projects' ? '{"projects":[{"id":"p1","name":"Recovered"}]}' : '{}');
    });
    const unavailable = await unavailableLoopbackUrl();
    const rediscoverDaemonUrl = vi.fn(async () => daemon.url);
    const handle = await startHttpMcp({
      daemonUrl: unavailable,
      rediscoverDaemonUrl,
    });
    const connected = await connectClient(handle.url, 'recovering-client');

    const result = await connected.client.callTool({
      arguments: {},
      name: 'list_projects',
    });

    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result.content)).toContain('Recovered');
    expect(rediscoverDaemonUrl).toHaveBeenCalledTimes(1);
  });

  it('shares one daemon rediscovery across concurrent client sessions', async () => {
    let releaseRediscovery!: () => void;
    let noteRediscoveryStarted!: () => void;
    const rediscoveryGate = new Promise<void>((resolve) => {
      releaseRediscovery = resolve;
    });
    const rediscoveryStarted = new Promise<void>((resolve) => {
      noteRediscoveryStarted = resolve;
    });
    const daemon = await listenDaemon((req, res) => {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(req.url === '/api/projects' ? '{"projects":[]}' : '{}');
    });
    const unavailable = await unavailableLoopbackUrl();
    const rediscoverDaemonUrl = vi.fn(async () => {
      noteRediscoveryStarted();
      await rediscoveryGate;
      return daemon.url;
    });
    const handle = await startHttpMcp({
      daemonUrl: unavailable,
      rediscoverDaemonUrl,
    });
    const connected = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        connectClient(handle.url, `recovering-client-${index + 1}`),
      ),
    );

    const requests = connected.map(({ client }) =>
      client.callTool({ arguments: {}, name: 'list_projects' }),
    );
    await rediscoveryStarted;
    releaseRediscovery();
    const results = await Promise.all(requests);

    expect(results.every((result) => result.isError !== true)).toBe(true);
    expect(rediscoverDaemonUrl).toHaveBeenCalledTimes(1);
  });

  it('returns the rediscovery error when implicit daemon recovery fails', async () => {
    const unavailable = await unavailableLoopbackUrl();
    const rediscoverDaemonUrl = vi.fn(async () => {
      throw new Error('registered Open Design runtime is unavailable');
    });
    const handle = await startHttpMcp({
      daemonUrl: unavailable,
      rediscoverDaemonUrl,
    });
    const connected = await connectClient(handle.url, 'failed-recovery-client');

    await expect(
      connected.client.callTool({
        arguments: {},
        name: 'list_projects',
      }),
    ).rejects.toThrow('registered Open Design runtime is unavailable');
    expect(rediscoverDaemonUrl).toHaveBeenCalledTimes(1);
  });

  it('returns a clear error when the rediscovered daemon is still unavailable', async () => {
    const unavailable = await unavailableLoopbackUrl();
    const stillUnavailable = await unavailableLoopbackUrl();
    const rediscoverDaemonUrl = vi.fn(async () => stillUnavailable);
    const handle = await startHttpMcp({
      daemonUrl: unavailable,
      rediscoverDaemonUrl,
    });
    const connected = await connectClient(handle.url, 'unavailable-retry-client');

    await expect(
      connected.client.callTool({
        arguments: {},
        name: 'list_projects',
      }),
    ).rejects.toThrow(
      'retry failed: the rediscovered Open Design daemon is still unreachable',
    );
    expect(rediscoverDaemonUrl).toHaveBeenCalledTimes(1);
  });

  it('does not replace a fixed daemon URL when no rediscovery callback is supplied', async () => {
    const unavailable = await unavailableLoopbackUrl();
    const handle = await startHttpMcp({ daemonUrl: unavailable });
    const connected = await connectClient(handle.url, 'fixed-url-client');

    const result = await connected.client.callTool({
      arguments: {},
      name: 'list_projects',
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('cannot reach');
  });

  it('blocks DNS rebinding hosts and does not enable permissive CORS', async () => {
    const handle = await startHttpMcp();
    const response = await requestWithHost(handle.url, 'attacker.example');

    expect(response.status).toBe(403);
    expect(response.allowOrigin).toBeUndefined();
  });
});

function randomSessionId(): string {
  return '00000000-0000-4000-8000-000000000000';
}

async function unavailableLoopbackUrl(): Promise<string> {
  const fixture = await listenDaemon((_req, res) => res.end());
  const address = fixture.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('could not reserve an unavailable loopback port');
  }
  const url = `http://127.0.0.1:${address.port}`;
  daemonServers.splice(daemonServers.indexOf(fixture.server), 1);
  await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
  return url;
}

async function requestWithHost(
  urlValue: string,
  host: string,
): Promise<{ allowOrigin: string | string[] | undefined; status: number }> {
  const url = new URL(urlValue);
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        headers: { host },
        hostname: url.hostname,
        path: url.pathname,
        port: url.port,
      },
      (response) => {
        response.resume();
        response.once('end', () => {
          resolve({
            allowOrigin: response.headers['access-control-allow-origin'],
            status: response.statusCode ?? 0,
          });
        });
      },
    );
    request.once('error', reject);
    request.end();
  });
}

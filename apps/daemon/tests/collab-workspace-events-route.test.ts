import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { Response } from 'express';
import {
  emitWorkspaceEventToAllScopes,
  emitWorkspaceEventToScope,
  registerCollabContextRoutes,
  type WorkspaceEventSinksByWorkspace,
} from '../src/routes/collab-context.js';
import { createDevWorkspaceContextProvider } from '../src/collab/workspace-context.js';

// A minimal `createSseResponse` matching the daemon contract the route relies on
// (text/event-stream headers + `send(event, data)` writing one SSE frame). Keeps
// this route test independent of the full server bootstrap.
function makeSseResponse(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.flushHeaders?.();
  return {
    send(event: string, data: unknown): boolean {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    },
  };
}

let server: http.Server | null = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
});

async function startServer(
  workspaceEventSinks: WorkspaceEventSinksByWorkspace,
  retainWorkspaceEventInterest?: (workspaceId: string) => () => void,
) {
  const app = express();
  app.use(express.json());
  registerCollabContextRoutes(app, {
    workspaceContext: createDevWorkspaceContextProvider(),
    fetchWorkspaceDirectory: async () => ({
      ok: true,
      items: [{
        workspaceId: 'workspace-a',
        workspaceName: 'Workspace A',
        workspaceType: 'team',
        workspaceMemberId: 'member-a',
        role: 'member',
        memberStatus: 'active',
        lifecycleState: 'active',
      }],
    }),
    createSseResponse: (res) => makeSseResponse(res as Response),
    workspaceEventSinks,
    ...(retainWorkspaceEventInterest ? { retainWorkspaceEventInterest } : {}),
  });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no TCP port');
  return `http://127.0.0.1:${address.port}`;
}

/** Read from an SSE body reader until `predicate(accumulated)` is true. */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (text: string) => boolean,
  timeoutMs = 2000,
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate(buffer)) return buffer;
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }
  if (!predicate(buffer)) throw new Error(`timed out; buffer so far:\n${buffer}`);
  return buffer;
}

describe('GET /api/workspace/events', () => {
  it('registers a sink, streams a pushed thin event, and drops the sink on disconnect', async () => {
    const sinks: WorkspaceEventSinksByWorkspace = new Map();
    const releaseInterest = vi.fn();
    const retainInterest = vi.fn(() => releaseInterest);
    const base = await startServer(sinks, retainInterest);
    const controller = new AbortController();

    const resp = await fetch(
      `${base}/api/workspace/events`
      + '?workspaceId=workspace-a&workspaceMemberId=member-a',
      { signal: controller.signal },
    );
    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toContain('text/event-stream');
    const reader = resp.body!.getReader();

    // The route sends a `ready` handshake and registers exactly one sink.
    await readUntil(reader, (text) => text.includes('event: ready'));
    expect(sinks.size).toBe(1);
    expect(retainInterest).toHaveBeenCalledWith('workspace-a');

    // Emitting into the sinks streams the thin event with its `type` as the SSE
    // event name (the client re-fetches on receipt; no body is required).
    emitWorkspaceEventToScope(
      sinks,
      'workspace-a',
      { type: 'team-projects-changed', at: 123 },
    );
    const framed = await readUntil(reader, (text) => text.includes('event: team-projects-changed'));
    expect(framed).toContain('"type":"team-projects-changed"');

    emitWorkspaceEventToScope(
      sinks,
      'workspace-a',
      {
        type: 'team-resources-changed',
        resourceKind: 'skill',
        resourceId: 'skill-1',
        at: 124,
      },
    );
    const resourceFrame = await readUntil(
      reader,
      (text) => text.includes('event: team-resources-changed'),
    );
    expect(resourceFrame).toContain('"resourceKind":"skill"');
    expect(resourceFrame).not.toContain('resourceStatus');

    emitWorkspaceEventToAllScopes(sinks, {
      type: 'workspace-directory-changed',
      at: 125,
    });
    const directoryFrame = await readUntil(
      reader,
      (text) => text.includes('event: workspace-directory-changed'),
    );
    expect(directoryFrame).toContain('"type":"workspace-directory-changed"');

    // Disconnect → the route's res.on('close') cleanup drops the sink.
    controller.abort();
    await reader.cancel().catch(() => {});
    const deadline = Date.now() + 2000;
    while (sinks.size !== 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(sinks.size).toBe(0);
    expect(releaseInterest).toHaveBeenCalled();
  });

  it('404-free no-op: the route is simply absent when the SSE seams are omitted', async () => {
    // Without createSseResponse + workspaceEventSinks the route is never
    // registered, so a request 404s instead of throwing.
    const app = express();
    app.use(express.json());
    registerCollabContextRoutes(app, { workspaceContext: createDevWorkspaceContextProvider() });
    server = http.createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no TCP port');
    const resp = await fetch(`http://127.0.0.1:${address.port}/api/workspace/events`);
    expect(resp.status).toBe(404);
  });
});

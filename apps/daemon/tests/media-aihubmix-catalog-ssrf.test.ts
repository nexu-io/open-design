import type http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';

// The AIHubMix catalogue route is an unauthenticated public GET. Its outbound
// fetch target is hard-coded to the official AIHubMix origin and a caller-
// supplied `baseUrl` query is deliberately ignored — otherwise a request like
// `?baseUrl=http://169.254.169.254/` would make the daemon issue a server-side
// request to a private/metadata host (SSRF). Regression guard for the BLOCKING
// review on `/api/media/providers/aihubmix/models`.
describe('aihubmix catalogue route SSRF guard', () => {
  let server: http.Server | null = null;
  let shutdown: (() => Promise<void> | void) | undefined;
  const realFetch = globalThis.fetch;

  afterEach(async () => {
    globalThis.fetch = realFetch;
    await Promise.resolve(shutdown?.());
    shutdown = undefined;
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
  });

  async function start(): Promise<string> {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
      shutdown?: () => Promise<void> | void;
    };
    server = started.server;
    shutdown = started.shutdown;
    return started.url;
  }

  it('ignores a caller-supplied internal baseUrl and only fetches the official origin', async () => {
    const daemonUrl = await start();

    // Stub global fetch: pass our own daemon HTTP call through, but capture any
    // outbound upstream request the route makes so we can assert its target.
    const upstreamUrls: string[] = [];
    vi.stubGlobal('fetch', (input: any, init?: any) => {
      const u = String(typeof input === 'string' ? input : input?.url ?? input);
      if (u.startsWith(daemonUrl)) return realFetch(input, init);
      upstreamUrls.push(u);
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const resp = await realFetch(
      `${daemonUrl}/api/media/providers/aihubmix/models?type=image_generation&baseUrl=${encodeURIComponent(
        'http://169.254.169.254/',
      )}`,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    // Exactly one upstream call, and it targets aihubmix.com — never the
    // attacker-supplied metadata host.
    expect(upstreamUrls).toHaveLength(1);
    expect(upstreamUrls[0]).toBe('https://aihubmix.com/api/v1/models?type=image_generation');
    expect(upstreamUrls[0]).not.toContain('169.254.169.254');
  });

  it('rejects a cross-origin request and issues no upstream fetch', async () => {
    const daemonUrl = await start();

    const upstreamUrls: string[] = [];
    vi.stubGlobal('fetch', (input: any, init?: any) => {
      const u = String(typeof input === 'string' ? input : input?.url ?? input);
      if (u.startsWith(daemonUrl)) return realFetch(input, init);
      upstreamUrls.push(u);
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    // A browser request carrying a foreign Origin must be turned away by the
    // in-handler isLocalSameOrigin guard, like every sibling media route.
    const resp = await realFetch(
      `${daemonUrl}/api/media/providers/aihubmix/models?type=image_generation`,
      { headers: { Origin: 'http://evil.example:1234' } },
    );
    expect(resp.status).toBe(403);
    // Guard runs before any outbound fetch, so the daemon never reaches AIHubMix.
    expect(upstreamUrls).toHaveLength(0);
  });
});

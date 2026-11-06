// Regression: SSRF via POST /api/marketplaces and POST /api/plugins/install.
//
// Both routes take a client-supplied URL/source and hand it to a "default
// fetcher" that does a raw `fetch(url, { redirect: 'follow' })` with NO SSRF
// host validation:
//   - src/plugins/marketplace-seed.ts:91  (createMarketplaceFetcher fallback)
//   - src/plugins/installer.ts:587        (installFromArchiveUrl defaultFetcher)
//   - src/plugins/marketplaces.ts:396     (marketplace refresh defaultFetcher)
// The only upstream gate is a protocol/suffix check (https:// for marketplaces,
// `.tar.gz` suffix for installs). Neither resolves the host, so loopback /
// RFC1918 / link-local (169.254.169.254 cloud metadata) targets are fetched,
// and `redirect: 'follow'` lets even a public host 3xx into private space.
//
// Contrast the sibling outbound paths that DO defend:
//   - src/brands/safe-fetch.ts            (assertPublicBrandUrl + validatingLookup)
//   - src/plugins/plugin-asset-cache.ts   (assertSafePublicUrl + validatingLookup)
// These pin a connection-time DNS check so the address validated is the address
// connected — defeating DNS rebinding. The marketplace/install fetchers have
// neither. Same class as the already-fixed library-ingest SSRF (#5529).
//
// This spec asserts the SECURE invariant: a loopback/internal URL must be
// refused and the canary internal service must never be touched. RED on main
// (the daemon fetches the canary); green once these fetchers route through the
// shared SSRF guard.

import type http from 'node:http';
import type net from 'node:net';
import { createServer as createTcpServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let daemon: http.Server | undefined;
let daemonShutdown: (() => Promise<void> | void) | undefined;
let baseUrl = '';
let dataDir = '';

// Stand-in internal service (think cloud metadata / a loopback admin API).
// The routes require an `https://` source, so a plain-HTTP canary's request
// handler never fires (the TLS handshake fails first) even though the daemon
// DID open an outbound TCP connection to the internal address. We therefore
// record the connection at the raw TCP layer: any inbound socket to this
// loopback port is proof the daemon connected to the internal service — the
// SSRF. (Full response exfil would need the canary to speak TLS + serve a valid
// manifest; not modelled here, but the connect itself is the vulnerability.)
let canary: net.Server | undefined;
let canaryPort = 0;
let canaryHits: number;

const PREV_DATA_DIR = process.env.OD_DATA_DIR;

beforeEach(async () => {
  canaryHits = 0;
  canary = createTcpServer((socket) => {
    canaryHits += 1;
    socket.destroy();
  });
  await new Promise<void>((resolve) => canary!.listen(0, '127.0.0.1', () => resolve()));
  canaryPort = (canary.address() as { port: number }).port;

  dataDir = await mkdtemp(path.join(os.tmpdir(), 'od-mkt-ssrf-'));
  process.env.OD_DATA_DIR = dataDir;

  const { startServer } = await import('../src/server.js');
  const started = (await startServer({ port: 0, host: '127.0.0.1', returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  daemon = started.server;
  daemonShutdown = started.shutdown;
});

afterEach(async () => {
  if (daemonShutdown) {
    await Promise.race([
      Promise.resolve(daemonShutdown()),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  }
  daemon?.closeAllConnections?.();
  if (daemon) await new Promise<void>((r) => daemon!.close(() => r()));
  if (canary) await new Promise<void>((r) => canary!.close(() => r()));
  daemon = undefined;
  canary = undefined;
  daemonShutdown = undefined;
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  if (PREV_DATA_DIR === undefined) delete process.env.OD_DATA_DIR;
  else process.env.OD_DATA_DIR = PREV_DATA_DIR;
}, 15000);

describe('marketplace / plugin-install SSRF', () => {
  it('POST /api/marketplaces must NOT fetch a loopback/internal https URL', async () => {
    const canaryUrl = `https://127.0.0.1:${canaryPort}/latest/meta-data/`;
    // No Origin header → the /api origin middleware treats it as a non-browser
    // client and allows it (any local process / injected agent can do this).
    const resp = await fetch(`${baseUrl}/api/marketplaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: canaryUrl }),
    });
    const status = resp.status;
    // eslint-disable-next-line no-console
    console.log(
      `[SSRF marketplaces] status=${status} canaryHits=${canaryHits}`,
    );
    // SECURE invariant: the daemon must never have connected to the internal service.
    expect(canaryHits).toBe(0);
  });

  it('POST /api/plugins/install must NOT fetch a loopback/internal https source', async () => {
    const canaryUrl = `https://127.0.0.1:${canaryPort}/evil.tar.gz`;
    const resp = await fetch(`${baseUrl}/api/plugins/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: canaryUrl }),
    });
    // Drain the SSE stream so the install pipeline runs to the fetch.
    await resp.text().catch(() => '');
    // eslint-disable-next-line no-console
    console.log(
      `[SSRF install] status=${resp.status} canaryHits=${canaryHits}`,
    );
    expect(canaryHits).toBe(0);
  });

  it('the sibling guard (assertSafePublicUrl) already rejects these URLs', async () => {
    const { assertSafePublicUrl } = await import('../src/plugins/plugin-asset-cache.js');
    expect(() => assertSafePublicUrl(`https://127.0.0.1:${canaryPort}/x`)).toThrow();
    expect(() => assertSafePublicUrl('https://169.254.169.254/latest/meta-data/')).toThrow();
  });
});

// Regression: SSRF via POST /api/library/ingest (+ read-back exfil via /raw).
//
// Before the fix, `fetchRemoteBytes` (src/routes/library.ts) did a raw
// `fetch(url, { redirect: 'follow' })` on the client-supplied `body.url` with
// NO SSRF host validation, unlike the sibling brand path which routes every
// external asset through `assertPublicBrandUrl` (rejects loopback / RFC1918 /
// link-local / metadata IPs). Any local process — including a prompt-injected
// agent, or anything that can set a `chrome-extension://` Origin header, which
// a non-browser client does trivially — can make the privileged daemon issue
// GET requests to arbitrary internal services (127.0.0.1:*, 169.254.169.254,
// RFC1918), and then read the fetched bytes back out through the unauthenticated
// `GET /api/library/assets/:id/raw` route. That is SSRF with full response
// exfiltration.
//
// This spec asserts the SECURE invariant (a loopback/internal URL must be
// refused and the internal service must never be touched). RED before the fix
// (the daemon fetched the canary and exfil'd its secret); green after routing
// fetchRemoteBytes through the SSRF guard.

import type http from 'node:http';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let daemon: http.Server | undefined;
let daemonShutdown: (() => Promise<void> | void) | undefined;
let baseUrl = '';
let dataDir = '';

// A stand-in "internal service" (think cloud metadata / a loopback admin API).
// It records every request it receives and returns a secret body.
let canary: http.Server | undefined;
let canaryUrl = '';
let canaryHits: string[] = [];
const CANARY_SECRET = 'INTERNAL-SECRET-aws-creds-42';

const PREV_DATA_DIR = process.env.OD_DATA_DIR;

beforeEach(async () => {
  canaryHits = [];
  canary = createServer((req, res) => {
    canaryHits.push(req.url ?? '');
    res.setHeader('Content-Type', 'text/plain');
    res.end(CANARY_SECRET);
  });
  await new Promise<void>((resolve) => canary!.listen(0, '127.0.0.1', () => resolve()));
  const cAddr = canary.address() as { port: number };
  canaryUrl = `http://127.0.0.1:${cAddr.port}/latest/meta-data/iam/security-credentials`;

  dataDir = await mkdtemp(path.join(os.tmpdir(), 'od-ssrf-'));
  process.env.OD_DATA_DIR = dataDir;

  // Dynamic import AFTER OD_DATA_DIR is set: RUNTIME_DATA_DIR is resolved at
  // module-eval time, so a static import would pin the real data dir.
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
  // The daemon's graceful shutdown can idle on background timers; race it so
  // afterEach always tears the HTTP listener down (no leaked in-proc server).
  if (daemonShutdown) {
    await Promise.race([
      Promise.resolve(daemonShutdown()),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  }
  // undici keeps the fetch sockets alive; drop them so close() resolves.
  daemon?.closeAllConnections?.();
  canary?.closeAllConnections?.();
  if (daemon) await new Promise<void>((r) => daemon!.close(() => r()));
  if (canary) await new Promise<void>((r) => canary!.close(() => r()));
  daemon = undefined;
  canary = undefined;
  daemonShutdown = undefined;
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  if (PREV_DATA_DIR === undefined) delete process.env.OD_DATA_DIR;
  else process.env.OD_DATA_DIR = PREV_DATA_DIR;
}, 15000);

describe('library ingest SSRF', () => {
  it('must NOT fetch a loopback/internal URL (and must not exfil its bytes)', async () => {
    // Present a browser-extension Origin. A real browser reserves this for an
    // installed extension, but any local non-browser client sets it freely —
    // this also selects the "clipper" branch, which skips the mime allowlist,
    // so the fetched bytes are stored verbatim and become read-back-able.
    const ingestResp = await fetch(`${baseUrl}/api/library/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'chrome-extension://ssrfssrfssrfssrfssrfssrfssrfssrf',
      },
      body: JSON.stringify({ url: canaryUrl }),
    });

    const ingestJson = (await ingestResp.json().catch(() => ({}))) as {
      asset?: { id?: string };
      error?: unknown;
    };

    // Read-back exfil: pull the stored bytes through the unauthenticated /raw route.
    let exfil = '';
    if (ingestJson.asset?.id) {
      const rawResp = await fetch(
        `${baseUrl}/api/library/assets/${ingestJson.asset.id}/raw`,
      );
      exfil = await rawResp.text().catch(() => '');
    }

    // Evidence dump (visible in test output when the assertion fails on main).
    // eslint-disable-next-line no-console
    console.log(
      `[SSRF EVIDENCE] ingest status=${ingestResp.status} canaryHits=${JSON.stringify(
        canaryHits,
      )} assetId=${ingestJson.asset?.id ?? '(none)'} exfilMatchesSecret=${exfil === CANARY_SECRET}`,
    );

    // SECURE invariant #1: the daemon must never have touched the internal service.
    expect(canaryHits).toEqual([]);
    // SECURE invariant #2: even if it did, the internal secret must not be
    // exfiltrable back to the caller.
    expect(exfil).not.toBe(CANARY_SECRET);
  });

  // A/B causal: the drop-in fix is to route `fetchRemoteBytes` through the SAME
  // guard the sibling brand path already uses. This proves that guard rejects
  // the exact loopback/metadata URL the ingest route happily fetched above —
  // so the vulnerability is a one-call omission, not a design gap.
  it('the existing sibling guard (assertPublicBrandUrl) rejects the same URL', async () => {
    const { assertPublicBrandUrl } = await import('../src/brands/safe-fetch.js');
    await expect(assertPublicBrandUrl(canaryUrl)).rejects.toThrow(/non-public|blocked/i);
    // And the real metadata IP is refused too.
    await expect(
      assertPublicBrandUrl('http://169.254.169.254/latest/meta-data/'),
    ).rejects.toThrow(/non-public|blocked/i);
  });
});

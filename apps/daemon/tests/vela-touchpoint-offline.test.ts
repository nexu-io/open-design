// OPEND-3436 at the daemon HTTP boundary — the cheapest layer that can see the
// whole feature (AGENTS.md "Try the cheapest layer first").
//
// The browser asks the same URL it always asked. What this ticket changes is
// what comes back when the WAN hop behind the daemon cannot be made: instead of
// 502, the daemon answers with the decision it last stored for this account,
// re-timed against the server's own schedule, for as long as that schedule
// says the activity is running.
//
// The cases split into the two failure modes that matter:
//
//   - answering when it must not: past `endsAt`, before `startsAt`, for another
//     account, after a withdrawal, or over an answer the server actually gave
//     (404, 401) which is authority, not absence.
//   - deleting when it must not: a 404, a timeout, or a withdrawal receipt that
//     names a different activity.

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import express from 'express';
import fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AppConfigPrefs } from '../src/app-config.js';
import { registerVelaRoutes } from '../src/routes/vela.js';

const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const base64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

const SHARED = 'export const shared = 1;\n';
const ENTRY = "import './shared.js'; export function mount(root) { root.textContent = 'modal'; }";
const PLACEMENT = 'opend.home.campaign-modal';
const LOCALE = 'en-US';
const HOUR = 3_600_000;

const manifest = {
  formatVersion: 2,
  runtimeKind: 'web-component',
  runtimeApiVersion: 1,
  platformWrapperVersion: 'vela-touchpoint-wrapper-v1',
  sdkVersion: 'vela-touchpoint-sdk-v1',
  contentLine: 'production',
  placements: [
    {
      key: PLACEMENT,
      entry: 'component.js',
      resources: ['shared.js'],
      locales: [LOCALE],
      requiredCapabilities: [],
      staticActions: [],
    },
  ],
  resources: ['component.js', 'shared.js'],
  images: [],
};

/**
 * The schedule is anchored to the real clock rather than a fixed date, because
 * the daemon's store measures elapsed time against the system clock the daemon
 * is actually running on. A hard-coded window would silently be "already over"
 * the day this file is read back.
 */
const decision = (window: { startsIn: number; endsIn: number } = { startsIn: -HOUR, endsIn: 24 * HOUR }) => {
  const now = Date.now();
  return {
    deploymentId: 'deployment-1',
    activityId: 'activity-1',
    snapshotHash: 'sha256:snapshot',
    artifactHash: 'sha256:artifact',
    manifestHash: 'sha256:manifest',
    placementKey: PLACEMENT,
    requiredCapabilities: [],
    staticActions: [],
    testContext: null,
    content: {
      id: 'version-1',
      placementKey: PLACEMENT,
      locale: LOCALE,
      manifest,
      manifestHash: digest(JSON.stringify(manifest)),
      entryPath: 'component.js',
      entryDigest: digest(ENTRY),
      entryModule: ENTRY,
      resources: [
        { path: 'component.js', digest: digest(ENTRY), bytes: base64(ENTRY) },
        { path: 'shared.js', digest: digest(SHARED), bytes: base64(SHARED) },
      ],
      runtime: {
        kind: 'web-component',
        apiVersion: 1,
        wrapperVersion: 'vela-touchpoint-wrapper-v1',
        sdkVersion: 'vela-touchpoint-sdk-v1',
      },
      buildIdentity: { fingerprint: 'fixed' },
    },
    serverTime: new Date(now).toISOString(),
    startsAt: new Date(now + window.startsIn).toISOString(),
    endsAt: new Date(now + window.endsIn).toISOString(),
    // Sixty seconds, exactly as production issues it: the window this ticket
    // exists to stop being the reason display ends.
    authorizationExpiresAt: new Date(now + 60_000).toISOString(),
    touchpointDecisionId: 'decision-1',
  };
};

const RECEIPT = {
  activityId: 'activity-1',
  deploymentId: 'deployment-1',
  contentVersionId: 'version-1',
  touchpointDecisionId: 'decision-1',
} as const;

type Reply = Readonly<{ status: number; body: unknown; padTo?: number; gzip?: boolean }>;

/**
 * The proxy's own buffering ceiling, restated here so a test can stand a body
 * on the far side of it. `vela.ts` derives it as `4 * MAX_CONTENT_BYTES`.
 */
const MAX_BUFFERED_DECISION_BYTES = 4 * 2 * 1024 * 1024;

let dataDir: string;
let upstream: Server | null;
let upstreamPort: number;
let daemon: Server;
let baseUrl: string;
let env: Record<string, string>;
let reply: Reply;
let upstreamCalls: number;

const listen = (server: Server) =>
  new Promise<AddressInfo>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address() as AddressInfo));
  });
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

/** Takes the runtime away entirely: the next connection is refused, as it is with no network. */
const cutTheWire = async () => {
  if (upstream) await close(upstream);
  upstream = null;
};

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'od-touchpoint-offline-http-'));
  upstreamCalls = 0;
  reply = { status: 200, body: decision() };
  upstream = createServer((_req, res) => {
    upstreamCalls += 1;
    res.setHeader('content-type', 'application/json');
    res.statusCode = reply.status;
    // `padTo` grows the body past the proxy's buffering ceiling while keeping it
    // valid JSON, so the case under test is "too big to buffer", not "malformed".
    const payload = reply.padTo
      ? JSON.stringify({ ...(reply.body as Record<string, unknown>), pad: 'x'.repeat(reply.padTo) })
      : JSON.stringify(reply.body);
    if (reply.gzip) {
      // Small on the wire, oversized once expanded: this crosses the DECODE
      // ceiling without ever crossing the buffering one.
      res.setHeader('content-encoding', 'gzip');
      res.end(gzipSync(Buffer.from(payload, 'utf8')));
      return;
    }
    res.end(payload);
  });
  upstreamPort = (await listen(upstream)).port;
  env = { VELA_CONTROL_KEY: 'ck-account-a', VELA_API_URL: `http://127.0.0.1:${upstreamPort}` };
  const app = express();
  app.use(express.json());
  registerVelaRoutes(app, {
    paths: { RUNTIME_DATA_DIR: dataDir },
    appConfig: { readAppConfig: async () => ({ agentCliEnv: {} }) as AppConfigPrefs },
    http: {},
    env,
  });
  daemon = createServer(app);
  baseUrl = `http://127.0.0.1:${(await listen(daemon)).port}`;
});

afterEach(async () => {
  await close(daemon);
  if (upstream) await close(upstream);
  rmSync(dataDir, { recursive: true, force: true });
});

const decide = async () => {
  const response = await fetch(
    `${baseUrl}/api/touchpoints/production-runtime?placementKey=${PLACEMENT}&locale=${LOCALE}`,
  );
  const text = await response.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* an unparseable body is itself the assertion in some cases */
  }
  return { status: response.status, offlineHeader: response.headers.get('x-od-touchpoint-offline'), body };
};

const cacheRoot = () => path.join(dataDir, 'touchpoint-content-cache');
/** Every assembly record on disk, across every scope directory. */
const storedRecords = (): string[] => {
  if (!fs.existsSync(cacheRoot())) return [];
  return fs
    .readdirSync(cacheRoot())
    .flatMap((scope) => {
      const dir = path.join(cacheRoot(), scope, 'assemblies');
      return fs.existsSync(dir) ? fs.readdirSync(dir).map((file) => path.join(dir, file)) : [];
    });
};

describe('production touchpoint offline replay', () => {
  it('answers a cached activity while the runtime is unreachable', async () => {
    const live = await decide();
    expect(live.status).toBe(200);
    expect(live.body.offlineReplay).toBeUndefined();
    expect(live.offlineHeader).toBeNull();

    await cutTheWire();
    const offline = await decide();
    expect(offline.status).toBe(200);
    expect(offline.offlineHeader).toBe('1');
    expect(offline.body.offlineReplay?.reason).toBe('upstream_unreachable');
    // The activity, whole: the browser verifies content against its own digests.
    expect(offline.body.content.entryModule).toBe(ENTRY);
    expect(offline.body.content.resources).toHaveLength(2);
    expect(offline.body.activityId).toBe('activity-1');
    expect(offline.body.touchpointDecisionId).toBe('decision-1');
    // ...and the ruling that makes AC2 possible: authorized to the END of the
    // activity, not to the sixty-second window that has certainly lapsed.
    expect(offline.body.authorizationExpiresAt).toBe(offline.body.endsAt);
    expect(Date.parse(offline.body.serverTime)).toBeGreaterThanOrEqual(
      Date.parse(live.body.serverTime),
    );
    // The lease the browser will compute must outlast the original authorization.
    expect(Date.parse(offline.body.endsAt) - Date.parse(offline.body.serverTime)).toBeGreaterThan(
      10 * 60_000,
    );
  });

  it('treats a temporarily unavailable runtime as offline, not as an answer', async () => {
    await decide();
    reply = { status: 503, body: { error: 'upstream_down' } };
    const offline = await decide();
    expect(offline.status).toBe(200);
    expect(offline.body.offlineReplay?.reason).toBe('upstream_unavailable');
    expect(offline.body.content.entryModule).toBe(ENTRY);
  });

  it('never replays over an answer the runtime actually gave', async () => {
    await decide();
    reply = { status: 404, body: { error: 'no_decision' } };
    const missing = await decide();
    expect(missing.status).toBe(404);
    expect(missing.body.offlineReplay).toBeUndefined();

    reply = { status: 401, body: { error: 'unauthorized' } };
    const denied = await decide();
    expect(denied.status).toBe(401);
    expect(denied.body.offlineReplay).toBeUndefined();

    // Neither of those is a reason to throw the package away.
    expect(storedRecords()).toHaveLength(1);
    await cutTheWire();
    expect((await decide()).body.offlineReplay?.reason).toBe('upstream_unreachable');
  });

  it('deletes the package a matching withdrawal names, and does not resurrect it offline', async () => {
    await decide();
    reply = { status: 410, body: { error: 'production_runtime_revoked', receipt: RECEIPT } };
    const revoked = await decide();
    expect(revoked.status).toBe(410);
    expect(revoked.body.error).toBe('production_runtime_revoked');
    expect(storedRecords()).toHaveLength(0);

    await cutTheWire();
    const afterwards = await decide();
    expect(afterwards.status).toBe(502);
    expect(afterwards.body.error).toBe('touchpoint_runtime_unavailable');
  });

  // OPEND-3375's shape: a withdrawn DEPLOYMENT answers 410 with no receipt,
  // because there is no longer a delivery to write one about. The browser
  // already reads any unreadable 410 as a withdrawal and clears the screen. The
  // package behind it has to go too — otherwise this ticket's own replay path
  // brings the withdrawn activity back the next time the client starts offline,
  // which is the exact failure AC6 names.
  it.each([
    ['a withdrawn deployment', { error: 'production_runtime_withdrawn' }],
    ['a revocation with no receipt', { error: 'production_runtime_revoked' }],
    ['a revocation with an unreadable receipt', { error: 'production_runtime_revoked', receipt: { touchpointDecisionId: 'decision-1' } }],
  ])('reclaims the package on %s', async (_name, body) => {
    await decide();
    expect(storedRecords()).toHaveLength(1);
    reply = { status: 410, body };
    expect((await decide()).status).toBe(410);
    expect(storedRecords()).toHaveLength(0);
    await cutTheWire();
    expect((await decide()).status).toBe(502);
  });

  it('keeps a package a withdrawal receipt does not name', async () => {
    await decide();
    reply = {
      status: 410,
      body: { error: 'production_runtime_revoked', receipt: { ...RECEIPT, activityId: 'activity-9' } },
    };
    expect((await decide()).status).toBe(410);
    expect(storedRecords()).toHaveLength(1);
    await cutTheWire();
    expect((await decide()).body.offlineReplay?.reason).toBe('upstream_unreachable');
  });

  it('stops answering and reclaims the package once the activity has ended', async () => {
    reply = { status: 200, body: decision({ startsIn: -HOUR, endsIn: 1_200 }) };
    expect((await decide()).status).toBe(200);
    expect(storedRecords()).toHaveLength(1);

    await cutTheWire();
    await new Promise((resolve) => setTimeout(resolve, 1_400));
    const ended = await decide();
    expect(ended.status).toBe(502);
    expect(ended.body.error).toBe('touchpoint_runtime_unavailable');
    expect(storedRecords()).toHaveLength(0);
  });

  it('does not display an activity that has not started yet', async () => {
    reply = { status: 200, body: decision({ startsIn: 6 * HOUR, endsIn: 12 * HOUR }) };
    await decide();
    await cutTheWire();
    const early = await decide();
    expect(early.status).toBe(502);
    // Not started is not over: the package is still the one to show later.
    expect(storedRecords()).toHaveLength(1);
  });

  it('never lets one account display another account\'s cached activity', async () => {
    await decide();
    expect(storedRecords()).toHaveLength(1);

    // A different account on the same environment — a sign-out and sign-in.
    env.VELA_CONTROL_KEY = 'ck-account-b';
    await cutTheWire();
    const other = await decide();
    expect(other.status).toBe(502);
    expect(other.body.offlineReplay).toBeUndefined();

    env.VELA_CONTROL_KEY = 'ck-account-a';
    expect((await decide()).body.offlineReplay?.reason).toBe('upstream_unreachable');
  });

  // A body that outgrows the proxy's buffer makes it give up assembly and become
  // a pipe. Becoming a pipe sends headers, and sending headers retires the
  // status block that decides what a 410 or a 5xx means. Neither decision needs
  // the bytes, so neither may be cancelled by their number.
  it('reclaims a withdrawn package even when the 410 is too big to buffer', async () => {
    await decide();
    expect(storedRecords()).toHaveLength(1);

    reply = {
      status: 410,
      body: { error: 'production_runtime_withdrawn' },
      padTo: MAX_BUFFERED_DECISION_BYTES + 1,
    };
    expect((await decide()).status).toBe(410);
    // No receipt is readable out of a body this size, and an unreadable receipt
    // is the whole deployment being withdrawn: the package must not survive it.
    expect(storedRecords()).toHaveLength(0);

    await cutTheWire();
    const after = await decide();
    expect(after.status).toBe(502);
    expect(after.body.offlineReplay).toBeUndefined();
  });

  // The same rule one ceiling further in. A body that fits the buffer but
  // expands past the DECODE ceiling leaves `decoded` null, and the status block
  // must still run: it precedes the unparseable-body bail-out, and that order is
  // what this pins.
  it('reclaims a withdrawn package whose 410 expands past the decode ceiling', async () => {
    await decide();
    expect(storedRecords()).toHaveLength(1);

    reply = {
      status: 410,
      body: { error: 'production_runtime_withdrawn' },
      padTo: MAX_BUFFERED_DECISION_BYTES + 1,
      gzip: true,
    };
    expect((await decide()).status).toBe(410);
    expect(storedRecords()).toHaveLength(0);
  });

  it('replays the cache for a 5xx that is too big to buffer', async () => {
    await decide();
    expect(storedRecords()).toHaveLength(1);

    reply = {
      status: 503,
      body: { error: 'upstream_exploded' },
      padTo: MAX_BUFFERED_DECISION_BYTES + 1,
    };
    const outage = await decide();
    expect(outage.status).toBe(200);
    expect(outage.offlineHeader).toBe('1');
    expect(outage.body.offlineReplay?.reason).toBe('upstream_unavailable');
    expect(outage.body.activityId).toBe('activity-1');
    // The outage must not cost the package either.
    expect(storedRecords()).toHaveLength(1);
  });

  it('is exactly today\'s daemon when it holds nothing', async () => {
    await cutTheWire();
    const cold = await decide();
    expect(cold.status).toBe(502);
    expect(cold.body).toEqual({ error: 'touchpoint_runtime_unavailable' });
    expect(storedRecords()).toHaveLength(0);
    expect(upstreamCalls).toBe(0);
  });
});

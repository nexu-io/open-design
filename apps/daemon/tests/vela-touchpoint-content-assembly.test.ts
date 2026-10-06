// OPEND-3371 at the daemon HTTP boundary — the cheapest layer that can see the
// symptom (AGENTS.md "Try the cheapest layer first").
//
// The browser is not changed by this ticket and must not be able to tell that
// anything happened: it asks the same URL and gets the same JSON. What changes
// is the WAN hop behind the daemon, where a steady-state refresh stops carrying
// the content package the daemon already holds.
//
// Two properties are load-bearing and each has its own named case below:
//
//   1. A request the daemon holds nothing for is byte-for-byte today's request
//      and today's response — no new parameters, no `contentOmitted`.
//   2. Anything that goes wrong behind the daemon costs bandwidth, never the
//      campaign. A trimmed reply it cannot rebuild is re-asked in full.

import { createHash } from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigPrefs } from '../src/app-config.js';
import { registerVelaRoutes } from '../src/routes/vela.js';

const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const base64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

const SHARED = `export const shared = ${JSON.stringify('x'.repeat(4096))};`;
const ENTRY = `import './shared.js'; export function mount(root) { root.textContent = ${JSON.stringify('y'.repeat(4096))}; }`;
const PLACEMENT = 'opend.home.campaign-modal';
const LOCALE = 'en-US';

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

const FULL_RESPONSE = {
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
  serverTime: '2026-09-18T00:00:00.000Z',
  startsAt: '2026-09-18T00:00:00.000Z',
  endsAt: '2026-09-19T00:00:00.000Z',
  authorizationExpiresAt: '2026-09-18T01:00:00.000Z',
  touchpointDecisionId: 'decision-1',
};

/** C3: today's object with `content` replaced in place by `contentOmitted: true`. */
const TRIMMED_RESPONSE = (() => {
  const trimmed: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(FULL_RESPONSE)) {
    if (field === 'content') trimmed.contentOmitted = true;
    else trimmed[field] = value;
  }
  return trimmed;
})();

type HeldParams = Readonly<{ heldContentId: string | null; heldContentLocale: string | null }>;
type UpstreamCall = Readonly<{ path: string } & HeldParams>;

/**
 * A case takes the fake Vela over when it needs to control WHEN a reply lands,
 * not just what it says. Everything else keeps the default handler below.
 */
type UpstreamHandler = (req: IncomingMessage, res: ServerResponse, held: HeldParams) => void;

/**
 * The server's own rule, which no case here may bypass: it may omit the
 * content only when the caller already holds exactly the version it decided to
 * serve. A fake that trimmed on a flag instead would be exercising a protocol
 * nobody implements.
 */
const decisionPayload = (served: typeof FULL_RESPONSE, held: HeldParams): string => {
  if (held.heldContentId !== served.content.id || held.heldContentLocale !== served.content.locale)
    return JSON.stringify(served);
  const trimmed: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(served)) {
    if (field === 'content') trimmed.contentOmitted = true;
    else trimmed[field] = value;
  }
  return JSON.stringify(trimmed);
};

let dataDir: string;
let upstream: Server;
let daemon: Server;
let baseUrl: string;
let calls: UpstreamCall[];
/** Bytes of every response body Vela sent over the (notional) WAN hop. */
let upstreamBytes: number[];
/** When false the fake Vela is an un-upgraded one: it strips the new parameters. */
let supportsTrimming: boolean;
let status: number;
let errorBody: unknown;
let upstreamHandler: UpstreamHandler | null;

const listen = (server: Server) =>
  new Promise<AddressInfo>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address() as AddressInfo));
  });
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'od-touchpoint-assembly-'));
  calls = [];
  upstreamBytes = [];
  supportsTrimming = true;
  status = 200;
  errorBody = null;
  upstreamHandler = null;
  upstream = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://upstream');
    const held: HeldParams = {
      heldContentId: url.searchParams.get('heldContentId'),
      heldContentLocale: url.searchParams.get('heldContentLocale'),
    };
    calls.push({ path: url.pathname, ...held });
    if (upstreamHandler) {
      upstreamHandler(req, res, held);
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.statusCode = status;
    const trim =
      supportsTrimming &&
      status === 200 &&
      held.heldContentId === FULL_RESPONSE.content.id &&
      held.heldContentLocale === FULL_RESPONSE.content.locale;
    const payload = JSON.stringify(
      status === 200 ? (trim ? TRIMMED_RESPONSE : FULL_RESPONSE) : errorBody,
    );
    upstreamBytes.push(Buffer.byteLength(payload));
    res.end(payload);
  });
  const upstreamAddress = await listen(upstream);
  const app = express();
  app.use(express.json());
  registerVelaRoutes(app, {
    paths: { RUNTIME_DATA_DIR: dataDir },
    appConfig: { readAppConfig: async () => ({ agentCliEnv: {} }) as AppConfigPrefs },
    http: {},
    env: {
      VELA_CONTROL_KEY: 'ck-test',
      VELA_API_URL: `http://127.0.0.1:${upstreamAddress.port}`,
    },
  });
  daemon = createServer(app);
  const daemonAddress = await listen(daemon);
  baseUrl = `http://127.0.0.1:${daemonAddress.port}`;
});

afterEach(async () => {
  await close(daemon);
  await close(upstream);
  try {
    fs.chmodSync(path.join(dataDir, 'touchpoint-content-cache'), 0o700);
  } catch {
    /* absent or already writable */
  }
  rmSync(dataDir, { recursive: true, force: true });
});

const decide = async () => {
  const response = await fetch(
    `${baseUrl}/api/touchpoints/production-runtime?placementKey=${PLACEMENT}&locale=${LOCALE}`,
  );
  return { status: response.status, text: await response.text() };
};

const decisionUrl = () =>
  `${baseUrl}/api/touchpoints/production-runtime?placementKey=${PLACEMENT}&locale=${LOCALE}`;

/**
 * The same request `decide` makes, over a raw client rather than `fetch`.
 *
 * `fetch` transparently decompresses, which would hide the difference between
 * a body this proxy forwarded still compressed and one it expanded itself.
 */
const rawDecide = () =>
  new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const request = httpRequest(decisionUrl(), (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () =>
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks),
        }),
      );
    });
    request.on('error', reject);
    request.end();
  });

/**
 * The one (environment, account) directory these cases write into. OPEND-3436
 * isolates the store by scope, so the three layers now live one level down.
 */
const scopeDir = () => {
  const root = path.join(dataDir, 'touchpoint-content-cache');
  const [only] = fs.existsSync(root) ? fs.readdirSync(root) : [];
  return path.join(root, only ?? 'missing-scope');
};
const blobsDir = () => path.join(scopeDir(), 'blobs');
/** The file a digest names, so a case can damage one specific blob rather than whichever one readdir happens to list first. */
const blobFile = (value: string) => path.join(blobsDir(), value.slice('sha256:'.length));

/** The content id the assembly record on disk names right now, or `null` when there is none. */
const recordedContentId = (): string | null => {
  const dir = path.join(scopeDir(), 'assemblies');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  if (files.length !== 1) return null;
  const record = JSON.parse(fs.readFileSync(path.join(dir, files[0] as string), 'utf8')) as {
    contentId?: string;
  };
  return record.contentId ?? null;
};

/** `FULL_RESPONSE` promoted to the next campaign: a new activity carrying new content. */
const nextCampaign = (): typeof FULL_RESPONSE => {
  const next = JSON.parse(JSON.stringify(FULL_RESPONSE)) as typeof FULL_RESPONSE;
  next.activityId = 'activity-2';
  next.deploymentId = 'deployment-2';
  next.touchpointDecisionId = 'decision-2';
  next.content.id = 'version-2';
  return next;
};

/** Which content each activity is allowed to appear with. Crossing them is the defect. */
const CONTENT_OF: Record<string, string> = { 'activity-1': 'version-1', 'activity-2': 'version-2' };

describe('daemon touchpoint content assembly', () => {
  // Property 1. If this ever fails, every already-published client stops seeing
  // campaigns, because their guard is `if (!next.content?.id) return clear`.
  it('REGRESSION: a cold daemon sends today\'s request and returns today\'s response byte for byte', async () => {
    const cold = await decide();
    expect(cold.status).toBe(200);
    expect(calls).toEqual([
      { path: '/api/v1/touchpoints/runtime/production', heldContentId: null, heldContentLocale: null },
    ]);
    expect(cold.text).toBe(JSON.stringify(FULL_RESPONSE));
    expect(cold.text).not.toContain('contentOmitted');
  });

  it('asks Vela to omit content it already holds, and hands the browser the same response anyway', async () => {
    const cold = await decide();
    const warm = await decide();
    expect(calls[1]).toEqual({
      path: '/api/v1/touchpoints/runtime/production',
      heldContentId: 'version-1',
      heldContentLocale: LOCALE,
    });
    expect(warm.status).toBe(200);
    // Byte for byte, which is also what guards the re-encode: blobs are stored
    // as raw bytes and encoded back to base64 on the way out, so a rebuilt
    // response matches the original only while upstream sends canonical
    // base64. If Vela ever folds lines or switches to base64url, this is the
    // assertion that says so.
    expect(warm.text).toBe(cold.text);
    expect(warm.text).toBe(JSON.stringify(FULL_RESPONSE));
    expect(warm.text).not.toContain('contentOmitted');
    // The saving is on the WAN hop only; the browser's own response is unchanged.
    expect(upstreamBytes[1]).toBeLessThan(upstreamBytes[0]! / 10);
  });

  it('never forwards bytes its digest did not cover', async () => {
    await decide();
    // `SHARED` is 4121 bytes, so its base64 form ends in padding and Node's
    // decoder drops anything appended after it. The digest is computed over
    // that decoded view, so it goes on matching while the file -- and the
    // response built from it -- carries nine bytes nobody verified.
    fs.appendFileSync(blobFile(digest(SHARED)), 'GARBAGEXX');
    calls = [];
    const next = await decide();
    expect(next.status).toBe(200);
    // The daemon hands over the response it actually verified, or it asks
    // again. It does not hand over one it only appeared to verify.
    expect(next.text).toBe(JSON.stringify(FULL_RESPONSE));
    expect(calls).toHaveLength(2);
    expect(calls[1]?.heldContentId).toBeNull();
    // The consequence this pins, in one line: `atob` is WHATWG
    // forgiving-base64 and strips ASCII whitespace only. Any other stray
    // character throws, the placement never mounts, and because the daemon
    // believed it succeeded no fallback anywhere is reached.
    const rebuilt = JSON.parse(next.text) as { content: { resources: Array<{ bytes: string }> } };
    for (const resource of rebuilt.content.resources)
      expect(() => atob(resource.bytes)).not.toThrow();
  });

  it('keeps serving the campaign when the cached bytes are corrupted, and stops paying for them', async () => {
    await decide();
    fs.writeFileSync(blobFile(digest(SHARED)), base64('tampered'));
    calls = [];
    const recovered = await decide();
    expect(recovered.status).toBe(200);
    expect(recovered.text).toBe(JSON.stringify(FULL_RESPONSE));
    // One conditional ask that could not be rebuilt, then today's full request.
    expect(calls).toHaveLength(2);
    expect(calls[0]?.heldContentId).toBe('version-1');
    expect(calls[1]?.heldContentId).toBeNull();
    // Damage costs one extra round trip, not every round trip from now on. The
    // full response the fallback just fetched is the daemon's only chance to
    // put the real bytes back; if it declines, this placement pays double
    // forever and nothing anywhere reports it.
    calls = [];
    const healed = await decide();
    expect(healed.status).toBe(200);
    expect(healed.text).toBe(JSON.stringify(FULL_RESPONSE));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.heldContentId).toBe('version-1');
  });

  it('keeps serving the campaign when the cache cannot be written at all', async () => {
    const root = path.join(dataDir, 'touchpoint-content-cache');
    fs.mkdirSync(root, { recursive: true });
    fs.chmodSync(root, 0o500);
    const first = await decide();
    const second = await decide();
    expect(first.text).toBe(JSON.stringify(FULL_RESPONSE));
    expect(second.text).toBe(JSON.stringify(FULL_RESPONSE));
    expect(calls.every((call) => call.heldContentId === null)).toBe(true);
  });

  it('keeps serving the campaign against a Vela that ignores the new parameters', async () => {
    await decide();
    supportsTrimming = false;
    const warm = await decide();
    expect(calls[1]?.heldContentId).toBe('version-1');
    expect(warm.text).toBe(JSON.stringify(FULL_RESPONSE));
  });

  it('passes an upstream refusal through untouched while holding content', async () => {
    await decide();
    status = 410;
    errorBody = {
      error: 'production_runtime_revoked',
      receipt: {
        touchpointDecisionId: 'decision-1',
        deploymentId: 'deployment-1',
        activityId: 'activity-1',
        contentVersionId: 'version-1',
      },
    };
    const revoked = await decide();
    expect(revoked.status).toBe(410);
    expect(revoked.text).toBe(JSON.stringify(errorBody));
    status = 404;
    errorBody = { error: 'no_decision' };
    const missing = await decide();
    expect(missing.status).toBe(404);
    expect(missing.text).toBe(JSON.stringify(errorBody));
    // A refusal is the server's own decision and must never be re-asked as a
    // full request: the daemon's fallback is for content it cannot rebuild.
    expect(calls).toHaveLength(3);
  });

  it('never rewrites a caller that already carries held-content parameters', async () => {
    await decide();
    const response = await fetch(
      `${baseUrl}/api/touchpoints/production-runtime?placementKey=${PLACEMENT}&locale=${LOCALE}&heldContentId=someone-elses&heldContentLocale=fr-FR`,
    );
    expect(response.status).toBe(200);
    expect(calls[1]).toEqual({
      path: '/api/v1/touchpoints/runtime/production',
      heldContentId: 'someone-elses',
      heldContentLocale: 'fr-FR',
    });
  });

  // Before this route began reading bodies it forwarded them as a stream, so
  // its memory was bounded by the socket. Buffering to assemble gave that up;
  // these two cases put a ceiling back on it. The daemon is a privileged local
  // process and `gunzipSync` is synchronous, so an unbounded expansion costs
  // the whole app its event loop, not just this request.
  it('refuses to expand a decision body it could never assemble', async () => {
    // Valid JSON, so nothing but the size limit can reject it, and ~1000:1
    // compressed, so the buffering ceiling is never the thing under test here.
    const bomb = zlib.gzipSync(
      Buffer.from(JSON.stringify({ ...FULL_RESPONSE, filler: 'a'.repeat(16 * 1024 * 1024) })),
    );
    expect(bomb.byteLength).toBeLessThan(1024 * 1024);
    upstreamHandler = (_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.setHeader('content-encoding', 'gzip');
      res.end(bomb);
    };

    const response = await rawDecide();
    // Handed back exactly as upstream framed it: still compressed, still small.
    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.body.byteLength).toBeLessThan(1024 * 1024);
  });

  it('streams a decision body too large to assemble instead of holding it', async () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Past the point where the body could still be a package the browser would
    // accept, so there is nothing left to assemble out of it.
    const oversized = Buffer.alloc(9 * 1024 * 1024, 0x20);
    upstreamHandler = (_req, res) => {
      res.on('error', () => {
        /* the caller may be gone by the time this finishes; that is fine */
      });
      res.setHeader('content-type', 'application/json');
      res.write(oversized);
      void released.then(() => {
        try {
          res.end('{}');
        } catch {
          /* already closed */
        }
      });
    };

    const firstChunkBytes = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(decisionUrl(), (response) => {
        response.once('error', () => undefined);
        response.once('data', (chunk: Buffer) => {
          resolve(chunk.byteLength);
          response.destroy();
        });
      });
      request.on('error', reject);
      request.setTimeout(5_000, () => {
        request.destroy(
          new Error('the daemon sent nothing to its caller before upstream finished'),
        );
      });
      request.end();
    }).finally(release);
    expect(firstChunkBytes).toBeGreaterThan(0);
  });

  it('never splices a content version the server did not trim for', async () => {
    await decide(); // Cold: the daemon now holds version-1, of activity-1.

    let served = FULL_RESPONSE;
    let announceArrival!: () => void;
    const firstArrived = new Promise<void>((resolve) => {
      announceArrival = resolve;
    });
    let release!: () => void;
    const firstReleased = new Promise<void>((resolve) => {
      release = resolve;
    });
    let holdNext = true;
    upstreamHandler = (_req, res, held) => {
      // A real server frames its reply against what it is serving at the moment
      // the request lands, so the payload is decided here and not after the wait.
      const payload = decisionPayload(served, held);
      const answer = () => {
        res.setHeader('content-type', 'application/json');
        res.end(payload);
      };
      if (!holdNext) {
        answer();
        return;
      }
      holdNext = false;
      announceArrival();
      void firstReleased.then(answer);
    };

    // A is a live request a user is waiting on. It offers version-1 and the
    // server, still serving version-1, trims its reply against exactly that.
    const inFlight = decide();
    await firstArrived;
    // The campaign is promoted while A is still on the wire.
    served = nextCampaign();
    // B offers version-1 too, which no longer matches, so it gets the new
    // campaign in full -- and the daemon records version-2 under this placement.
    await decide();
    expect(recordedContentId()).toBe('version-2');
    release();

    const first = JSON.parse((await inFlight).text) as { activityId: string; content: { id: string } };
    // The invariant: the decision metadata and the content name one campaign.
    // The browser's verifier only checks that the content is internally
    // consistent, and each half is, so a crossed pair renders happily and
    // reports its impressions against the other campaign's decision id.
    expect(first.content.id).toBe(CONTENT_OF[first.activityId]);
  });

  it('drops its upstream request when the caller walks away', async () => {
    await decide(); // Cold: the daemon now holds version-1.

    let upstreamClosed = false;
    let announceArrival!: () => void;
    const requestArrived = new Promise<void>((resolve) => {
      announceArrival = resolve;
    });
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    upstreamHandler = (req, res) => {
      req.socket.once('close', () => {
        upstreamClosed = true;
      });
      res.on('error', () => {
        /* the caller is gone; failing to write to it is the expected outcome */
      });
      announceArrival();
      // Answer only once the caller has given up. The browser's per-attempt
      // budget is shorter than this proxy's, so this is the ordinary case.
      void released.then(() => {
        try {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(nextCampaign()));
        } catch {
          /* the socket is already gone, which is the point of this case */
        }
      });
    };

    const controller = new AbortController();
    const abandoned = fetch(
      `${baseUrl}/api/touchpoints/production-runtime?placementKey=${PLACEMENT}&locale=${LOCALE}`,
      { signal: controller.signal },
    ).catch(() => null);
    await requestArrived;
    controller.abort();
    await abandoned;
    // Let the abort reach the daemon before the upstream speaks. Waiting on the
    // signal rather than a fixed delay keeps the passing path at milliseconds;
    // when the proxy does not drop its request there is no signal to wait for,
    // so the budget runs out and the assertions below say why.
    await vi
      .waitFor(
        () => {
          expect(upstreamClosed).toBe(true);
        },
        { timeout: 2_000, interval: 10 },
      )
      .catch(() => undefined);
    // A real upstream has no idea the browser gave up. It answers regardless.
    release();
    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });

    expect(upstreamClosed).toBe(true);
    // Nobody reads an orphan's response; its side effects are the whole
    // problem. A reply that outlived its caller must not rewrite the record a
    // later, live request is about to rebuild from.
    expect(recordedContentId()).toBe('version-1');
  });

  it('follows the server to a new activity within one poll instead of pinning the cached one', async () => {
    await decide();
    const replacement = JSON.parse(JSON.stringify(FULL_RESPONSE)) as typeof FULL_RESPONSE;
    replacement.activityId = 'activity-2';
    replacement.deploymentId = 'deployment-2';
    replacement.content.id = 'version-2';
    supportsTrimming = false;
    await close(upstream);
    upstream = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://upstream');
      calls.push({
        path: url.pathname,
        heldContentId: url.searchParams.get('heldContentId'),
        heldContentLocale: url.searchParams.get('heldContentLocale'),
      });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(replacement));
    });
    // The daemon resolves Vela per request, so rebinding the same port is not
    // required: re-register against the new address.
    const address = await listen(upstream);
    const app = express();
    app.use(express.json());
    registerVelaRoutes(app, {
      paths: { RUNTIME_DATA_DIR: dataDir },
      appConfig: { readAppConfig: async () => ({ agentCliEnv: {} }) as AppConfigPrefs },
      http: {},
      env: { VELA_CONTROL_KEY: 'ck-test', VELA_API_URL: `http://127.0.0.1:${address.port}` },
    });
    await close(daemon);
    daemon = createServer(app);
    const daemonAddress = await listen(daemon);
    baseUrl = `http://127.0.0.1:${daemonAddress.port}`;
    const next = await decide();
    expect(JSON.parse(next.text)).toEqual(replacement);
  });
});

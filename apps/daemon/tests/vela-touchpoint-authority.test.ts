// Socket-free route seam: the registrar and Node stream/status handling are real;
// only the upstream transport is controlled. No wall-clock waits or external services.
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import type { Express, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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


type Handler = (req: Request, res: Response) => Promise<void>;
type Attempt = { request: EventEmitter & { destroyed: boolean }; respond: (stream: PassThrough) => void; stream?: PassThrough };
let dataDir: string;
let env: Record<string, string>;
let handlers: Record<string, Handler>;
let attempts: Attempt[];

beforeEach(() => {
  vi.useFakeTimers();
  dataDir = fs.mkdtempSync(path.join(tmpdir(), 'od-authority-seam-'));
  env = { VELA_CONTROL_KEY: 'ck-account-a', VELA_API_URL: 'http://runtime.invalid' };
  handlers = {}; attempts = [];
  const app = {
    get: () => {}, post: () => {},
    all: (paths: string[], handler: Handler) => { handlers[paths[0]!] = handler; },
  } as unknown as Express;
  registerVelaRoutes(app, {
    paths: { RUNTIME_DATA_DIR: dataDir },
    appConfig: { readAppConfig: async () => ({ agentCliEnv: {} }) as AppConfigPrefs }, http: {}, env,
  });
  vi.spyOn(http, 'request').mockImplementation(((_url: URL, _options: unknown, callback: (stream: PassThrough) => void) => {
    const request = Object.assign(new EventEmitter(), {
      destroyed: false, setTimeout: () => {}, write: () => {}, end: () => {},
      destroy(this: EventEmitter & { destroyed: boolean }, error?: Error) {
        if (this.destroyed) return;
        this.destroyed = true;
        this.emit('error', error ?? new Error('aborted'));
      },
    });
    attempts.push({ request, respond: callback });
    return request;
  }) as unknown as typeof http.request);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const start = async (options: { runtime?: 'production' | 'test'; events?: boolean; held?: boolean; locale?: string; placement?: string; deploymentsQuery?: string } = {}) => {
  const runtime = options.runtime ?? 'production';
  const route = `/api/touchpoints/${runtime}-runtime`;
  const query = new URLSearchParams({ placementKey: options.placement ?? PLACEMENT, locale: options.locale ?? LOCALE });
  if (options.held) { query.set('heldContentId', 'version-1'); query.set('heldContentLocale', LOCALE); }
  const suffix = options.deploymentsQuery !== undefined ? '/deployments' : options.events ? '/events' : '';
  const search = options.deploymentsQuery !== undefined ? options.deploymentsQuery : options.events ? '' : `?${query}`;
  const req = Object.assign(new EventEmitter(), { method: options.events ? 'POST' : 'GET', path: route + suffix, url: route + suffix + search, body: {}, headers: {}, query: {} });
  const chunks: Buffer[] = [];
  const headers: Record<string, string> = {};
  const res = Object.assign(new PassThrough(), {
    statusCode: 200, headersSent: false,
    status(code: number) { this.statusCode = code; return this; },
    setHeader(key: string, value: string) { headers[key] = value; },
    json(this: PassThrough, body: unknown) { this.end(JSON.stringify(body)); return this; },
  });
  res.on('data', chunk => chunks.push(Buffer.from(chunk)));
  const done = new Promise<{ status: number; body: any; offline: string | undefined }>(resolve => res.once('finish', () => {
    const text = Buffer.concat(chunks).toString();
    let body: unknown = null; try { body = JSON.parse(text); } catch { /* verbatim unreadable body */ }
    resolve({ status: res.statusCode, body, offline: headers['x-od-touchpoint-offline'] });
  }));
  await handlers[route]!(req as unknown as Request, res as unknown as Response);
  return { req, res, attempt: attempts.at(-1)!, done };
};
const respond = (attempt: Attempt, status: number, body?: unknown) => {
  const stream = Object.assign(new PassThrough(), { statusCode: status, headers: { 'content-type': 'application/json' } });
  attempt.stream = stream; attempt.respond(stream);
  if (body !== undefined) stream.end(JSON.stringify(body));
  return stream;
};
const answer = async (status: number, body: unknown, options: Parameters<typeof start>[0] = {}) => {
  const call = await start(options); respond(call.attempt, status, body); return call.done;
};
const receipt = (deploymentId = 'deployment-1') => ({ error: 'production_runtime_revoked', receipt: { ...RECEIPT, deploymentId } });

describe('Test deployment catalog query passthrough', () => {
  it.each([
    '',
    `?${new URLSearchParams({ cursor: 'created/id +&?=/%中文', limit: '50' })}`,
    '?activityIds=activity-a%2Cactivity-b',
  ])('forwards the complete catalog query verbatim: %s', async deploymentsQuery => {
    const call = await start({ runtime: 'test', deploymentsQuery });
    const [url] = vi.mocked(http.request).mock.calls.at(-1)!;
    expect(String(url)).toBe(`http://runtime.invalid/api/v1/touchpoints/runtime/test-deployments${deploymentsQuery}`);
    const page = { deployments: [], nextCursor: 'opaque-next+/=' };
    respond(call.attempt, 200, page);
    expect(await call.done).toEqual({ status: 200, body: page, offline: undefined });
  });
});

describe('route authority independent of assembly', () => {
  it.each([401, 403, 400, 404, 409])('events %s retires only account authentication authority', async status => {
    await answer(200, decision()); await answer(status, {}, { events: true });
    expect((await answer(503, {})).status).toBe(status === 401 || status === 403 ? 503 : 200);
  });
  it.each([401, 403, 404, 410].flatMap(status => [[status, false], [status, true]] as const))('GET preserves %s retirement (explicit held=%s)', async (status, held) => {
    await answer(200, decision()); await answer(status, receipt(), { held });
    expect((await answer(503, {})).status).toBe(503);
  });
  it('Test and another account refusals preserve Production authority', async () => {
    await answer(200, decision()); await answer(401, {}, { runtime: 'test' });
    env.VELA_CONTROL_KEY = 'ck-other'; await answer(403, {}, { events: true });
    env.VELA_CONTROL_KEY = 'ck-account-a'; expect((await answer(503, {})).offline).toBe('1');
  });
  it('explicit held full content stays verbatim and does not grant assembly authority', async () => {
    const grant = decision(); expect((await answer(200, grant, { held: true })).body).toEqual(grant);
    expect((await answer(503, {})).status).toBe(503);
  });
});

describe('pending 410 authority', () => {
  it.each(['matching', 'mismatch', 'unreadable'] as const)('pauses concurrent replay until %s receipt settles', async kind => {
    await answer(200, decision());
    const call = await start(); const stream = respond(call.attempt, 410);
    const concurrent = await answer(503, {});
    stream.end(JSON.stringify(kind === 'unreadable' ? 'invalid' : receipt(kind === 'mismatch' ? 'other' : undefined)));
    expect((await call.done).status).toBe(410);
    expect(concurrent.status).toBe(503); expect(concurrent.offline).toBeUndefined();
    expect((await answer(503, {})).status).toBe(kind === 'mismatch' ? 200 : 503);
  });
  it('overlapping mismatches release only their own pause', async () => {
    await answer(200, decision());
    const a = await start(); const sa = respond(a.attempt, 410);
    const b = await start(); const sb = respond(b.attempt, 410);
    sa.end(JSON.stringify(receipt('other-a'))); await a.done;
    expect((await answer(503, {})).status).toBe(503);
    sb.end(JSON.stringify(receipt('other-b'))); await b.done;
    expect((await answer(503, {})).offline).toBe('1');
  });
  it.each(['error', 'abort', 'timeout', 'oversize'] as const)('settles unreadable %s without permanent pause or revival', async kind => {
    await answer(200, decision()); const call = await start(); const stream = respond(call.attempt, 410);
    expect((await answer(503, {})).status).toBe(503);
    if (kind === 'error') stream.emit('error', new Error('cut body'));
    else if (kind === 'abort') call.req.emit('aborted');
    else if (kind === 'timeout') await vi.advanceTimersByTimeAsync(10_000);
    else { stream.write(Buffer.alloc(4 * 2 * 1024 * 1024 + 1)); stream.end(); }
    if (kind !== 'abort') await call.done;
    expect((await answer(503, {})).status).toBe(503);
    vi.advanceTimersByTime(1_000); await answer(200, decision());
    expect((await answer(503, {})).offline).toBe('1');
  });
  it('a late response sent during receipt decoding cannot persist withdrawn authority', async () => {
    await answer(200, decision());
    const withdrawal = await start(); const stream = respond(withdrawal.attempt, 410);
    const late = await start({ locale: 'zh-TW' });
    stream.end(JSON.stringify(receipt())); await withdrawal.done;
    respond(late.attempt, 200, decision()); await late.done;
    expect((await answer(503, {}, { locale: 'zh-TW' })).status).toBe(503);
    vi.advanceTimersByTime(1_000); await answer(200, decision(), { locale: 'zh-TW' });
    expect((await answer(503, {}, { locale: 'zh-TW' })).offline).toBe('1');
  });
  it('a late upstream callback after abort cannot reacquire a replay pause', async () => {
    await answer(200, decision()); const abandoned = await start(); abandoned.req.emit('aborted');
    const stream = respond(abandoned.attempt, 410);
    expect(stream.destroyed).toBe(true);
    expect((await answer(503, {})).offline).toBe('1');
  });
  it('isolates placement and account while a receipt is pending', async () => {
    await answer(200, decision());
    const other = { ...decision(), placementKey: 'other', content: { ...decision().content, placementKey: 'other' } };
    await answer(200, other, { placement: 'other' });
    env.VELA_CONTROL_KEY = 'ck-other'; await answer(200, decision()); env.VELA_CONTROL_KEY = 'ck-account-a';
    const pending = await start(); const stream = respond(pending.attempt, 410);
    expect((await answer(503, {}, { placement: 'other' })).offline).toBe('1');
    env.VELA_CONTROL_KEY = 'ck-other'; expect((await answer(503, {})).offline).toBe('1');
    stream.end(JSON.stringify(receipt('other'))); await pending.done;
  });
});

describe('revocation history eviction through the real proxy sequence', () => {
  it('serves a late online response but never persists withdrawn authority after 257 subsequent receipts', async () => {
    await answer(200, { ...decision(), deploymentId: 'other-delivery' }); attempts.at(-1)!.request.emit('close');
    // start executes the real route held -> ticket path before the upstream is answered.
    const late = await start({ locale: 'zh-TW' });
    await answer(410, receipt()); attempts.at(-1)!.request.emit('close');
    for (let i = 0; i < 257; i++) {
      await answer(410, receipt(`filler-${i}`), { placement: `filler-${i}` });
      attempts.at(-1)!.request.emit('close');
    }
    const grant = decision(); respond(late.attempt, 200, grant);
    expect((await late.done).body.deploymentId).toBe('deployment-1'); late.attempt.request.emit('close');
    expect((await answer(503, {}, { locale: 'zh-TW' })).status).toBe(503); attempts.at(-1)!.request.emit('close');
    await answer(200, decision(), { locale: 'zh-TW' }); attempts.at(-1)!.request.emit('close');
    expect((await answer(503, {}, { locale: 'zh-TW' })).offline).toBe('1');
  });
  it('releases request capacity on close so sequential attempts keep caching', async () => {
    for (let i = 0; i < 257; i++) {
      await answer(200, decision()); attempts.at(-1)!.request.emit('close');
    }
    await answer(404, {}); attempts.at(-1)!.request.emit('close');
    await answer(200, decision()); attempts.at(-1)!.request.emit('close');
    expect((await answer(503, {})).offline).toBe('1');
  });
});

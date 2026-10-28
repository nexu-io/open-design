import express from 'express';
import { TOUCHPOINT_OFFLINE_REPLAY_HEADER } from '@open-design/contracts/api/touchpointOffline';
import { createHash } from 'node:crypto';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerVelaRoutes } from '../src/routes/vela.js';
import { resetDesktopAuthForTests, setDesktopAuthSecret } from '../src/desktop-auth.js';
import type { AppConfigPrefs } from '../src/app-config.js';

const login = vi.hoisted(() => ({ completed: undefined as (() => void) | undefined }));
const joins = vi.hoisted(() => ({ count: 0, after: undefined as ((value: { headers: Map<string, unknown> } | null) => Promise<void>) | undefined }));
vi.mock('../src/routes/touchpoint-prefetch.js', async original => {
  const actual = await original<typeof import('../src/routes/touchpoint-prefetch.js')>();
  return { ...actual, createTouchpointPrefetch: (...args: Parameters<typeof actual.createTouchpointPrefetch>) => {
    const prefetch = actual.createTouchpointPrefetch(...args);
    return { ...prefetch, join: (...input: Parameters<typeof prefetch.join>) => {
      const result = prefetch.join(...input);
      ++joins.count;
      return result.then(async value => { await joins.after?.(value); return value; });
    } };
  } };
});
const identity = vi.hoisted(() => ({ loggedIn: true, sessionState: 'authenticated', user: { id: 'a' } }));
vi.mock('../src/integrations/vela.js', async original => ({
  ...await original<object>(),
  readVelaLoginStatus: () => ({ ...identity }),
  spawnVelaLoginWithFallback: async (deps: { onCompleted?: () => void }) => { login.completed = deps.onCompleted; return { pid: 1 }; },
}));
// The status endpoint's optional model/billing work is outside this test.
vi.mock('../src/agents.js', async original => ({ ...await original<object>(), getAgentDef: () => null }));
const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const base64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

const SHARED = `export const shared = ${JSON.stringify('x'.repeat(4096))};`;
const ENTRY = `import './shared.js'; export function mount(root) { root.textContent = ${JSON.stringify('y'.repeat(4096))}; }`;
const PLACEMENT = 'opend.home.campaign-modal';
const HOVER = ['opend.home.hover-entry', 'opend.home.hover-layer'] as const;
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


let dir: string;
let upstream: Server;
let daemon: Server;
let lifecycle: ReturnType<typeof registerVelaRoutes>;
let origin: string;
let calls: URL[];
let pending: ServerResponse[];
let config: AppConfigPrefs;
let env: NodeJS.ProcessEnv;
const placement = 'opend.home.campaign-modal';
const headers = { 'x-od-analytics-device-id': 'fixture', 'x-od-analytics-client-type': 'desktop', 'x-od-analytics-locale': 'en-US' };
const listen = async (server: Server) => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
};
const observe = () => fetch(`${origin}/api/integrations/vela/status`, { headers });
const decide = (query = '') => fetch(`${origin}/api/touchpoints/production-runtime?placementKey=${placement}&locale=en-US&emptyResponse=200${query}`);
const decideHover = (key: string) => fetch(`${origin}/api/touchpoints/production-runtime?${new URLSearchParams({ placementKey: key, locale: LOCALE, emptyResponse: '200' })}`);
const untilCalls = async (count: number) => { await vi.waitFor(() => expect(calls).toHaveLength(count)); };
beforeEach(async () => {
  joins.count = 0;
  joins.after = undefined;
  resetDesktopAuthForTests();
  Object.assign(identity, { loggedIn: true, sessionState: 'authenticated', user: { id: 'a' } });
  dir = mkdtempSync(path.join(tmpdir(), 'cms-prefetch-'));
  calls = []; pending = [];
  upstream = createServer((req, res) => { calls.push(new URL(req.url!, 'http://fixture')); pending.push(res); });
  const apiUrl = await listen(upstream);
  env = { VELA_CONTROL_KEY: 'fixture-a', VELA_API_URL: apiUrl, AMR_PROFILE: 'local' };
  config = { telemetry: { metrics: true }, agentCliEnv: {} };
  const app = express();
  app.use(express.json());
  lifecycle = registerVelaRoutes(app, { paths: { RUNTIME_DATA_DIR: dir }, appConfig: { readAppConfig: async () => config }, http: {}, env });
  daemon = createServer(app); origin = await listen(daemon);
});
afterEach(async () => {
  await lifecycle.close();
  daemon.closeAllConnections(); upstream.closeAllConnections();
  await Promise.all([daemon, upstream].map(server => new Promise<void>(resolve => server.close(() => resolve()))));
  resetDesktopAuthForTests();
  rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});
it('starts before home mounts and lets the modal join the same upstream request', async () => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await observe();
  await untilCalls(3);
  const response = decide();
  // A second status read must not launch a duplicate warm request.
  await observe();
  pending[0]!.writeHead(404); pending[0]!.end('{}');
  expect((await response).status).toBe(404);
  expect(calls).toHaveLength(3);
});
it.each(['web', 'signed-out', 'no-consent'] as const)('does not prefetch for %s', async gate => {
  if (gate !== 'web') setDesktopAuthSecret(Buffer.alloc(32, 1));
  if (gate === 'signed-out') Object.assign(identity, { loggedIn: false, sessionState: 'signed_out' });
  if (gate === 'no-consent') config.telemetry = { metrics: false };
  await observe();
  expect(calls).toHaveLength(0);
});
it('aborts an old identity and never hands its result to the new account', async () => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await observe(); await untilCalls(3);
  env.VELA_CONTROL_KEY = 'fixture-b'; identity.user = { id: 'b' };
  await observe(); await untilCalls(6);
  const response = decide();
  await observe(); // Completion barrier: modal request has joined before releasing the body.
  pending[0]!.end('{"old":true}');
  pending[3]!.writeHead(404); pending[3]!.end('{}');
  expect((await response).status).toBe(404);
  expect(calls).toHaveLength(6);
});
it('backs off a failed warm attempt without automatic retry or repeated-status load', async () => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await observe(); await untilCalls(3);
  pending[0]!.writeHead(503); pending[0]!.end('{}');
  await vi.waitFor(() => expect(pending[0]!.writableFinished).toBe(true));
  await observe(); await observe();
  expect(calls).toHaveLength(3);
});
it('keeps active-decision and different-locale queries out of the initial warm flight', async () => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await observe(); await untilCalls(3);
  const response = decide('&activeDecisionId=visible-other');
  await untilCalls(4);
  pending[3]!.writeHead(410); pending[3]!.end('{}');
  expect((await response).status).toBe(410);
  pending[0]!.writeHead(404); pending[0]!.end('{}');
});

function freshDecision() {
  return { ...FULL_RESPONSE, serverTime: new Date().toISOString(), startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString(), authorizationExpiresAt: new Date(Date.now() + 300_000).toISOString() };
}
async function readDecision(response: Response) {
  return await response.json() as ReturnType<typeof freshDecision> & { offlineReplay?: { reason: string } };
}
it('hands a completed warm decision to the first modal locally without a second WAN round trip', async () => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await observe(); await untilCalls(3);
  pending[0]!.end(JSON.stringify(freshDecision()));
  await vi.waitFor(() => expect(pending[0]!.destroyed).toBe(true));
  await observe();
  // Keep an incorrect second dispatch responsive so the red spec fails on behavior.
  upstream.on('request', (_req, res) => { if (calls.length > 3) { res.writeHead(404); res.end('{}'); } });
  const response = await decide();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ content: { id: 'version-1' } });
  expect(calls).toHaveLength(3);
});
it('warms on daemon relaunch with the saved locale, before a status or home request', async () => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await observe(); await untilCalls(3);
  pending[0]!.end(JSON.stringify(freshDecision()));
  await lifecycle.close();
  const app = express();
  lifecycle = registerVelaRoutes(app, { paths: { RUNTIME_DATA_DIR: dir }, appConfig: { readAppConfig: async () => config }, http: {}, env });
  await untilCalls(6);
  expect(calls[3]!.searchParams.get('locale')).toBe('en-US');
  pending[3]!.writeHead(404); pending[3]!.end('{}');
});
it('revoking consent aborts a warm flight before it can cache or publish stale content', async () => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await observe(); await untilCalls(3);
  config.telemetry = { metrics: false };
  await observe();
  await vi.waitFor(() => expect(pending.every(res => res.destroyed)).toBe(true));
  expect(calls).toHaveLength(3);
});

it('starts immediately after login completion without waiting for another renderer status poll', async () => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  Object.assign(identity, { loggedIn: false, sessionState: 'signed_out' });
  await observe();
  const response = await fetch(`${origin}/api/integrations/vela/login`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}' });
  expect(response.status).toBe(202);
  Object.assign(identity, { loggedIn: true, sessionState: 'authenticated' });
  expect(login.completed).toBeTypeOf('function');
  login.completed!();
  await untilCalls(3);
  pending[0]!.writeHead(404); pending[0]!.end('{}');
});

it('learns locale from the desktop startup read without analytics identity headers', async () => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await fetch(`${origin}/api/integrations/vela/status`, { headers: { 'x-od-touchpoint-locale': 'en-US' } });
  await untilCalls(3);
  pending[0]!.writeHead(404); pending[0]!.end('{}');
});
it('does not send the first modal back to an AMR already known down during warmup backoff', async () => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await observe(); await untilCalls(3);
  pending[0]!.writeHead(503); pending[0]!.end('{}');
  await vi.waitFor(() => expect(pending[0]!.destroyed).toBe(true));
  await observe();
  upstream.on('request', (_req, res) => { if (calls.length > 3) { res.writeHead(404); res.end('{}'); } });
  expect((await decide()).status).toBe(503);
  expect(calls).toHaveLength(3);
});

it.each([404, 403])('refuses a joined old warm 200 after a newer %s, without reviving it by another request', async status => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await observe(); await untilCalls(3);
  const response = decide();
  await vi.waitFor(() => expect(joins.count).toBe(1));
  const refused = decide('&activeDecisionId=independent');
  await untilCalls(4);
  pending[3]!.writeHead(status); pending[3]!.end('{}');
  expect((await refused).status).toBe(status);
  // An incorrect unconditional retry would revive the activity. Keep it
  // responsive so the regression fails on delivery rather than a timeout.
  upstream.on('request', (_req, res) => {
    if (calls.length > 4) res.end(JSON.stringify(freshDecision()));
  });
  pending[0]!.end(JSON.stringify(freshDecision()));
  expect((await response).status).toBe(404);
  expect(calls).toHaveLength(4);
  upstream.removeAllListeners('request');
  upstream.on('request', (req, res) => {
    calls.push(new URL(req.url!, 'http://fixture'));
    res.writeHead(503); res.end('{}');
  });
  // The stale result must not be available through offline replay either.
  expect((await decide('&activeDecisionId=offline-probe')).status).toBe(503);
});

it.each([['partial', 6_000, 4_000], ['expired', 3_000, 5_000]] as const)(
  'deducts the original warm elapsed time for a %s joined grant', async (_kind, lease, elapsed) => {
    const realNow = performance.now.bind(performance);
    let offset = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => realNow() + offset);
    setDesktopAuthSecret(Buffer.alloc(32, 1));
    await observe(); await untilCalls(3);
    const decision = freshDecision();
    const startedAt = Date.parse(decision.serverTime);
    decision.authorizationExpiresAt = new Date(startedAt + lease).toISOString();
    offset = 2_000;
    const response = decide();
    await vi.waitFor(() => expect(joins.count).toBe(1));
    offset = elapsed;
    upstream.on('request', (_req, res) => { if (calls.length > 3) res.end(JSON.stringify(freshDecision())); });
    pending[0]!.end(JSON.stringify(decision));
    const result = await response;
    if (elapsed >= lease) expect(result.status).toBe(404);
    else {
      expect(result.status).toBe(200);
      const granted = await readDecision(result);
      expect(granted.authorizationExpiresAt).toBe(decision.authorizationExpiresAt);
      expect(Date.parse(granted.serverTime)).toBeGreaterThanOrEqual(startedAt + elapsed);
      expect(Date.parse(granted.authorizationExpiresAt) - Date.parse(granted.serverTime)).toBeLessThanOrEqual(lease - elapsed);
      expect(granted.offlineReplay).toBeUndefined();
      expect(result.headers.get(TOUCHPOINT_OFFLINE_REPLAY_HEADER)).toBeNull();
    }
    expect(calls).toHaveLength(3);
  },
);

function hoverDecision(placementKey: typeof HOVER[number]) {
  const entries = HOVER.map(key => ({ key, path: `${key.endsWith('entry') ? 'entry' : 'layer'}.js`, module: `export function mount(root) { root.textContent = ${JSON.stringify(key)}; }` }));
  const selected = entries.find(entry => entry.key === placementKey)!;
  const manifest = {
    ...FULL_RESPONSE.content.manifest,
    placements: entries.map(entry => ({ key: entry.key, entry: entry.path, resources: [], locales: [LOCALE], requiredCapabilities: [], staticActions: [] })),
    resources: entries.map(entry => entry.path),
  };
  return {
    ...freshDecision(), placementKey, touchpointDecisionId: `decision-${placementKey}`,
    content: { ...FULL_RESPONSE.content, id: 'version-hover-pair', placementKey, manifest,
      manifestHash: digest(JSON.stringify(manifest)), entryPath: selected.path, entryDigest: digest(selected.module), entryModule: selected.module,
      resources: entries.map(entry => ({ path: entry.path, digest: digest(entry.module), bytes: base64(entry.module) })),
    },
  };
}

it.each(['joined', 'completed'] as const)('warms both hover placements before the host, then reuses their exact %s results independently of modal', async mode => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await observe(); await untilCalls(3);
  expect(calls.map(url => url.searchParams.get('placementKey'))).toEqual([PLACEMENT, ...HOVER]);
  expect(calls.every(url => url.pathname === '/api/v1/touchpoints/runtime/production' && url.searchParams.get('locale') === LOCALE)).toBe(true);
  await observe();
  const entryDecision = hoverDecision(HOVER[0]);
  const layerDecision = hoverDecision(HOVER[1]);
  layerDecision.endsAt = entryDecision.endsAt;
  // Hold the modal throughout: neither hover placement waits for its body.
  let requests: Promise<Response>[] = [];
  if (mode === 'joined') {
    requests = HOVER.map(key => decideHover(key));
    await vi.waitFor(() => expect(joins.count).toBe(2));
  }
  for (const decision of [entryDecision, layerDecision]) {
    const index = calls.findIndex(url => url.searchParams.get('placementKey') === decision.placementKey);
    pending[index]!.end(JSON.stringify(decision));
  }
  if (mode === 'completed') {
    await vi.waitFor(() => expect(pending.slice(1).every(res => res.destroyed)).toBe(true));
    await observe();
    requests = HOVER.map(key => decideHover(key));
  }
  upstream.on('request', (_req, res) => { res.writeHead(404); res.end('{}'); });
  const responses = await Promise.all(requests);
  const values = await Promise.all(responses.map(readDecision));
  expect(responses.map(res => res.status)).toEqual([200, 200]);
  for (let i = 0; i < HOVER.length; ++i) {
    const expected = [entryDecision, layerDecision][i]!;
    expect(values[i]).toMatchObject({ placementKey: HOVER[i], touchpointDecisionId: expected.touchpointDecisionId, content: expected.content });
  }
  expect(values[0]!.content.entryModule).not.toBe(values[1]!.content.entryModule);
  expect(values[0]!.content.manifestHash).toBe(values[1]!.content.manifestHash);
  expect(pending[0]!.writableEnded).toBe(false);
  expect(calls).toHaveLength(3); // Also excludes visible, interaction and event calls.
});

it('preserves an invalid hover pair for the normal host to reject, without substituting either sibling or the modal', async () => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await observe(); await untilCalls(3);
  const entry = hoverDecision(HOVER[0]);
  const layer = { ...hoverDecision(HOVER[1]), activityId: 'different-activity', endsAt: entry.endsAt };
  const requests = HOVER.map(key => decideHover(key));
  await vi.waitFor(() => expect(joins.count).toBe(2));
  pending[1]!.end(JSON.stringify(entry));
  pending[2]!.end(JSON.stringify(layer));
  const responses = await Promise.all(requests);
  expect(responses.map(res => res.status)).toEqual([200, 200]);
  const entryResult = await readDecision(responses[0]!);
  const layerResult = await readDecision(responses[1]!);
  // ProductionCampaignHover checks this binding before preparing/mounting
  // either half. Prefetch must not normalize a mismatched answer into a pair.
  expect(entryResult.activityId).toBe(entry.activityId);
  expect(layerResult.activityId).toBe('different-activity');
  expect(entryResult.activityId).not.toBe(layerResult.activityId);
  expect(calls).toHaveLength(3);
});

it.each(['joined', 'completed'] as const)('does not hand off an older cached package when the %s warm answer fails exact package admission', async mode => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await observe(); await untilCalls(3);
  const older = freshDecision();
  const prime = decide('&activeDecisionId=independent');
  await untilCalls(4);
  pending[3]!.end(JSON.stringify(older));
  expect((await prime).status).toBe(200);
  let response: Promise<Response> | undefined;
  if (mode === 'joined') {
    response = decide();
    await vi.waitFor(() => expect(joins.count).toBe(2));
  }
  const invalid = { ...freshDecision(), content: { ...older.content, id: 'new-unadmitted-version', entryDigest: digest('not-the-entry') } };
  pending[0]!.end(JSON.stringify(invalid));
  if (mode === 'completed') {
    await vi.waitFor(() => expect(pending[0]!.destroyed).toBe(true));
    await observe();
    response = decide();
  }
  upstream.on('request', (_req, res) => res.end(JSON.stringify(freshDecision())));
  expect((await response!).status).toBe(404);
  expect(calls).toHaveLength(4);
});

it('preserves joined offline fallback and its schedule lease when the warm upstream is temporarily down', async () => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await observe(); await untilCalls(3);
  const decision = freshDecision();
  const prime = decide('&activeDecisionId=independent');
  await untilCalls(4);
  pending[3]!.end(JSON.stringify(decision));
  expect((await prime).status).toBe(200);
  const response = decide();
  await vi.waitFor(() => expect(joins.count).toBe(2));
  pending[0]!.writeHead(503); pending[0]!.end('{}');
  const result = await response;
  expect(result.status).toBe(200);
  expect(result.headers.get(TOUCHPOINT_OFFLINE_REPLAY_HEADER)).toBe('1');
  const value = await readDecision(result);
  expect(value.authorizationExpiresAt).toBe(decision.endsAt);
  expect(value.offlineReplay?.reason).toBe('upstream_unavailable');
  expect(calls).toHaveLength(4);
});

it('rechecks a joined offline grant after a newer refusal reaches the cache', async () => {
  setDesktopAuthSecret(Buffer.alloc(32, 1));
  await observe(); await untilCalls(3);
  const decision = freshDecision();
  const prime = decide('&activeDecisionId=independent');
  await untilCalls(4);
  pending[3]!.end(JSON.stringify(decision));
  expect((await prime).status).toBe(200);
  joins.after = async value => {
    if (!value?.headers.has(TOUCHPOINT_OFFLINE_REPLAY_HEADER)) return;
    joins.after = undefined;
    const refusal = decide('&activeDecisionId=newer-refusal');
    await untilCalls(5);
    pending[4]!.writeHead(403); pending[4]!.end('{}');
    expect((await refusal).status).toBe(403);
  };
  const response = decide();
  await vi.waitFor(() => expect(joins.count).toBe(2));
  pending[0]!.writeHead(503); pending[0]!.end('{}');
  const result = await response;
  expect(result.status).toBe(404);
  expect(await result.json()).toEqual({ error: 'touchpoint_prefetch_no_longer_authorized' });
  expect(calls).toHaveLength(5);
});

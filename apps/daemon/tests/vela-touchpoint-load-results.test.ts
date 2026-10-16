import express from 'express';
import http, { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex, PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerVelaRoutes } from '../src/routes/vela.js';
import { touchpointLoadRecordSchema, parseTouchpointLoadMetrics } from '@open-design/contracts/api/touchpointLoadResults';
import { touchpointMetricsHeader, touchpointResourceSizes } from '../src/services/touchpoint-load-metrics.js';
import type { AppConfigPrefs } from '../src/app-config.js';

// Real Express router/parser and Node response framing, in memory: no listener or network.
async function request(app: express.Express, method: string, url: string, body?: unknown, declared?: string) {
  const chunks: Buffer[] = [];
  const socket = new Duplex({ read() {}, write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  const req = new IncomingMessage(socket as import('node:net').Socket);
  req.method = method; req.url = url;
  const text = body === undefined ? '' : JSON.stringify(body);
  req.headers = { 'content-type': 'application/json', ...(text ? { 'content-length': declared ?? String(Buffer.byteLength(text)) } : {}) };
  const res = new ServerResponse(req);
  let finish!: () => void;
  const done = new Promise<void>((resolve, reject) => { finish = resolve; res.on('error', reject); });
  res.write = ((chunk: string | Uint8Array) => { chunks.push(Buffer.from(chunk)); return true; }) as ServerResponse['write'];
  res.end = ((chunk?: string | Uint8Array) => { if (chunk) chunks.push(Buffer.from(chunk)); res.emit('finish'); finish(); return res; }) as ServerResponse['end'];
  req.complete = true;
  app(req as express.Request, res as express.Response);
  if (text) req.push(Buffer.from(text)); req.push(null);
  await done;
  const output = Buffer.concat(chunks).toString('utf8');
  socket.destroy();
  return { status: res.statusCode, output, metrics: parseTouchpointLoadMetrics(String(res.getHeader('x-touchpoint-load-metrics') ?? '')) };
}
const uuid = '12345678-1234-4234-8234-123456789012';
const batch = () => ({ contractVersion: 1, records: [touchpointLoadRecordSchema.parse({ event_id: uuid, load_attempt_id: uuid, session_id: uuid, occurred_at: '2026-10-09T00:00:00.000Z', kind: 'start', placement_key: 'opend.home.campaign-modal', host_product: 'opend', host_family: 'open-design-desktop', locale: 'en-US' })] });
let directory: string;
let lifecycle: ReturnType<typeof registerVelaRoutes> | undefined;
let calls: { url: URL; headers: http.OutgoingHttpHeaders; body: string }[];
let status: number;
let env: NodeJS.ProcessEnv;
let payload: unknown;
let gzip: boolean;
let upstreamMetadata: string | undefined;
const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const code = 'export function mount(root) { root.textContent = "你好"; }';
const manifest = { formatVersion: 2, runtimeKind: 'web-component', runtimeApiVersion: 1, platformWrapperVersion: 'vela-touchpoint-wrapper-v1', sdkVersion: 'vela-touchpoint-sdk-v1', contentLine: 'production', placements: [{ key: 'opend.home.campaign-modal', entry: 'component.js', resources: [], locales: ['en-US'], requiredCapabilities: [], staticActions: [] }], resources: ['component.js'], images: [] };
const fullDecision = () => ({ activityId: 'activity', deploymentId: 'deployment', touchpointDecisionId: 'decision', placementKey: 'opend.home.campaign-modal', requiredCapabilities: [], staticActions: [], serverTime: new Date().toISOString(), startsAt: '2000-01-01T00:00:00.000Z', endsAt: '2099-01-01T00:00:00.000Z', authorizationExpiresAt: new Date(Date.now() + 60_000).toISOString(), content: { id: 'content', locale: 'en-US', placementKey: 'opend.home.campaign-modal', manifest, manifestHash: digest(JSON.stringify(manifest)), entryPath: 'component.js', entryDigest: digest(code), entryModule: code, resources: [{ path: 'component.js', digest: digest(code), bytes: Buffer.from(code).toString('base64') }], runtime: { kind: 'web-component', apiVersion: 1, wrapperVersion: 'vela-touchpoint-wrapper-v1', sdkVersion: 'vela-touchpoint-sdk-v1' }, buildIdentity: { fingerprint: 'fixed' } } });
function appFor() {
  const app = express(); app.use(express.json({ limit: '4mb' }));
  lifecycle = registerVelaRoutes(app, { paths: { RUNTIME_DATA_DIR: directory }, appConfig: { readAppConfig: async () => ({ agentCliEnv: {} }) as AppConfigPrefs }, http: {}, env });
  return app;
}
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'od-load-route-'));
  vi.stubEnv('AMR_HOME', directory);
  env = { OD_APP_VERSION: '0.23.1', VELA_PROFILE: 'local', VELA_CONTROL_KEY: 'ck-fixture', VELA_API_URL: 'http://127.0.0.1:8111' };
  calls = []; status = 202; payload = { accepted: 1 }; gzip = false; upstreamMetadata = undefined;
  vi.spyOn(http, 'request').mockImplementation(((url: URL, options: http.RequestOptions, callback: (res: IncomingMessage) => void) => {
    const call = { url, headers: options.headers as http.OutgoingHttpHeaders, body: '' }; calls.push(call);
    const upstream = new EventEmitter() as http.ClientRequest;
    upstream.setTimeout = () => upstream; upstream.write = (chunk: string | Uint8Array) => { call.body += String(chunk); return true; };
    upstream.destroy = () => upstream;
    upstream.end = (() => {
      queueMicrotask(() => {
        const source = new PassThrough();
        const response = source as unknown as IncomingMessage;
        response.statusCode = status; response.headers = { 'content-type': 'application/json', ...(gzip ? { 'content-encoding': 'gzip' } : {}), ...(upstreamMetadata === undefined ? {} : { 'x-touchpoint-load-metrics': upstreamMetadata }) };
        const raw = Buffer.from(JSON.stringify(payload));
        callback(response); source.end(gzip ? zlib.gzipSync(raw) : raw);
      });
      return upstream;
    }) as http.ClientRequest['end'];
    return upstream;
  }) as typeof http.request);
});
afterEach(async () => { await lifecycle?.close(); lifecycle = undefined; vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
describe('load results through actual Express allowlist', () => {
  it.each(['production', 'test'])('POST %s logs uses only daemon control key and exact upstream route', async runtime => {
    const response = await request(appFor(), 'POST', `/api/touchpoints/${runtime}-runtime/load-results`, batch());
    expect(response.status).toBe(202); expect(calls).toHaveLength(1); expect(calls[0]!.url.pathname).toBe('/api/v1/touchpoints/runtime/load-results'); expect(calls[0]!.headers.authorization).toBe('Bearer ck-fixture'); expect(response.output).not.toContain('ck-fixture');
  });
  it.each(['GET', 'PUT', 'DELETE'])('rejects %s and query access without upstream dispatch', async method => {
    expect((await request(appFor(), method, '/api/touchpoints/production-runtime/load-results')).status).toBe(404); expect(calls).toHaveLength(0);
  });
  it('rejects unknown suffix, actor/env, oversized UTF8 and >100 records', async () => {
    const app = appFor();
    expect((await request(app, 'POST', '/api/touchpoints/production-runtime/load-results/query', batch())).status).toBe(404);
    for (const extra of [{ actor: 'member' }, { env: 'prod' }]) expect((await request(app, 'POST', '/api/touchpoints/production-runtime/load-results', { ...batch(), ...extra })).status).toBe(400);
    expect((await request(app, 'POST', '/api/touchpoints/production-runtime/load-results', { contractVersion: 1, records: Array(101).fill(batch().records[0]) })).status).toBe(400);
    expect((await request(app, 'POST', '/api/touchpoints/production-runtime/load-results', { ...batch(), text: '界'.repeat(90_000) })).status).toBe(413); expect(calls).toHaveLength(0);
  });
  it('rejects absent control key and a falsely small declared body without forwarding', async () => {
    env.VELA_CONTROL_KEY = '';
    expect((await request(appFor(), 'POST', '/api/touchpoints/production-runtime/load-results', batch())).status).toBe(401);
    env.VELA_CONTROL_KEY = 'ck-fixture';
    expect((await request(appFor(), 'POST', '/api/touchpoints/production-runtime/load-results', batch(), '1')).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it.each([401, 403])('forwards bad-key %s without cached or cookie authority', async failure => {
    status = failure; expect((await request(appFor(), 'POST', '/api/touchpoints/production-runtime/load-results', batch())).status).toBe(failure); expect(calls).toHaveLength(1);
  });
  it('validates existing loopback publish-origin boundary and never accepts a body target', async () => {
    env.OPEN_DESIGN_CMS_PRODUCTION_API_URL = 'http://127.0.0.1:8222';
    expect((await request(appFor(), 'POST', '/api/touchpoints/production-runtime/load-results', batch())).status).toBe(202); expect(calls[0]!.url.origin).toBe('http://127.0.0.1:8222');
    env.OPEN_DESIGN_CMS_PRODUCTION_API_URL = 'https://example.com';
    expect((await request(appFor(), 'POST', '/api/touchpoints/production-runtime/load-results', batch())).status).toBe(400); expect(calls).toHaveLength(1);
  });
});
it('measures actual base64 UTF8 separately from decoded resource bytes and rejects untrusted metadata', () => {
  const encoded = Buffer.from('你好😀').toString('base64');
  expect(touchpointResourceSizes({ content: { resources: [{ bytes: encoded }] } })).toEqual({ base64: Buffer.byteLength(encoded), decoded: 10 });
  expect(touchpointResourceSizes({ contentOmitted: true })).toEqual({ base64: 0, decoded: null });
  expect(touchpointResourceSizes({ content: { resources: [{ bytes: '!' }] } })).toEqual({ base64: null, decoded: null });
  expect(parseTouchpointLoadMetrics(touchpointMetricsHeader({ cache_source: 'offline_fallback', public_response_bytes: null }))?.resource_read_ms).toBeNull();
});


it('measures buffered gzip public bytes, held assembly and offline null boundaries at the actual route', async () => {
  const app = appFor(); const decision = fullDecision(); payload = decision; status = 200; gzip = true;
  const url = '/api/touchpoints/production-runtime?placementKey=opend.home.campaign-modal&locale=en-US';
  const cold = await request(app, 'GET', url);
  expect(cold.status).toBe(200);
  expect(cold.metrics).toMatchObject({ public_response_bytes: zlib.gzipSync(Buffer.from(JSON.stringify(decision))).byteLength, local_response_bytes: Buffer.byteLength(JSON.stringify(decision)), decoded_resource_bytes: Buffer.byteLength(code), daemon_version: '0.23.1', server_version: null, resource_read_ms: null });
  expect(cold.metrics?.public_transfer_ms).toBeGreaterThanOrEqual(0);
  const { content: _content, ...trimmed } = decision; payload = { ...trimmed, contentOmitted: true }; gzip = false;
  const held = await request(app, 'GET', url);
  expect(calls.at(-1)?.url.searchParams.get('heldContentId')).toBe('content');
  expect(held.metrics).toMatchObject({ cache_source: 'daemon', cache_hit: true, public_base64_bytes: 0, held_content_id: 'content', content_omitted: true, resource_read_ms: null });
  expect(held.metrics?.local_base64_bytes).toBe(Buffer.byteLength(Buffer.from(code).toString('base64')));
  status = 503; payload = {};
  const offline = await request(app, 'GET', url);
  expect(offline.status).toBe(200); expect(offline.metrics).toMatchObject({ cache_source: 'offline_fallback', public_transfer_ms: null, public_response_bytes: null, public_base64_bytes: null, resource_read_ms: null });
});


it.each([
  ['server minimum', '{"version":1,"resource_read_ms":2.5,"server_version":"cms:1.2.3"}', 2.5],
  ['unknown field', '{"version":1,"resource_read_ms":2.5,"server_version":"cms:1.2.3","unknown":null}', null],
  ['unknown version', '{"version":2,"resource_read_ms":2.5}', null],
  ['oversize', '{"version":1,"resource_read_ms":2.5}' + ' '.repeat(2048), null],
  ['malformed', '{"version":1,"resource_read_ms":NaN}', null],
  ['bad locale', '{"version":1,"resource_read_ms":2.5,"held_content_locale":"1a"}', null],
] as const)('consumes %s upstream metadata without changing actual content or authorization', async (_label, header, resourceRead) => {
  upstreamMetadata = header; payload = fullDecision(); status = 200;
  const response = await request(appFor(), 'GET', '/api/touchpoints/production-runtime?placementKey=opend.home.campaign-modal&locale=en-US');
  expect(response.status).toBe(200);
  expect(JSON.parse(response.output)).toMatchObject({ touchpointDecisionId: 'decision', content: { id: 'content', entryModule: code } });
  expect(response.metrics).toMatchObject({ resource_read_ms: resourceRead, server_version: resourceRead === null ? null : 'cms:1.2.3', local_transfer_ms: null, decoded_resource_bytes: Buffer.byteLength(code) });
});

it('preserves safe server metadata while streaming and leaves unfinished body measurements unknown', async () => {
  upstreamMetadata = '{"version":1,"resource_read_ms":0,"server_version":"cms:1"}';
  payload = fullDecision(); status = 200; gzip = true;
  // Test routes retain their existing streaming boundary rather than buffering for metrics.
  const response = await request(appFor(), 'GET', '/api/touchpoints/test-runtime?placementKey=opend.home.campaign-modal&locale=en-US');
  expect(response.status).toBe(200);
  expect(response.metrics).toMatchObject({ resource_read_ms: 0, server_version: 'cms:1', public_transfer_ms: null, local_transfer_ms: null, public_response_bytes: null, local_response_bytes: null, public_base64_bytes: null, decoded_resource_bytes: null });
});

it('keeps gzip echo local bytes unknown while measuring actual public encoded bytes', async () => {
  upstreamMetadata = '{"version":1,"resource_read_ms":null,"server_version":"cms:1"}';
  payload = []; status = 200; gzip = true;
  const response = await request(appFor(), 'GET', '/api/touchpoints/production-runtime?placementKey=opend.home.campaign-modal&locale=en-US');
  expect(response.status).toBe(200);
  expect(response.metrics).toMatchObject({ public_response_bytes: zlib.gzipSync(Buffer.from(JSON.stringify(payload))).byteLength, local_response_bytes: null, local_transfer_ms: null, decoded_resource_bytes: null, server_version: 'cms:1' });
});

const automaticReport = () => ({ version: 1, reportId: uuid, snapshotHash: digest('snapshot'), placementKey: 'opend.home.campaign-modal', locale: 'ja', contextToken: `ctx-token-v1:${'a'.repeat(64)}`, acceptanceId: 'display-receipt', hostRelease: digest('release'), observations: [] });
describe('automatic checks through actual Test-only proxy', () => {
  it('forwards a strict server-check request using only daemon operator authority and preserves unverified', async () => {
    status = 201; payload = { status: 'unverified' };
    const result = await request(appFor(), 'POST', '/api/touchpoints/test-runtime/test-deployments/deployment/automated-reports', automaticReport());
    expect(result.status).toBe(201);
    expect(JSON.parse(result.output)).toEqual({ status: 'unverified' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url.pathname).toBe('/api/v1/touchpoints/test-deployments/deployment/automated-reports');
    expect(calls[0]!.headers.authorization).toBe('Bearer ck-fixture');
    expect(JSON.parse(calls[0]!.body)).toEqual(automaticReport());
  });
  it('denies absent operator credentials, wrong environment/method/path and forged actor or pass claims', async () => {
    const app = appFor();
    for (const [method, route] of [['POST', '/api/touchpoints/production-runtime/test-deployments/deployment/automated-reports'], ['GET', '/api/touchpoints/test-runtime/test-deployments/deployment/automated-reports'], ['POST', '/api/touchpoints/test-runtime/test-deployments/deployment/automated-reports/extra']]) {
      expect((await request(app, method!, route!, automaticReport())).status).toBe(404);
    }
    expect((await request(app, 'POST', '/api/touchpoints/test-runtime/test-deployments/deployment/automated-reports', { ...automaticReport(), passed: true, testerMemberId: 'forged' })).status).toBe(400);
    expect((await request(app, 'POST', '/api/touchpoints/test-runtime/test-deployments/deployment/automated-reports', { ...automaticReport(), contextToken: 'a'.repeat(8300) })).status).toBe(413);
    expect(calls).toHaveLength(0);
    await lifecycle?.close(); delete env.VELA_CONTROL_KEY;
    expect((await request(appFor(), 'POST', '/api/touchpoints/test-runtime/test-deployments/deployment/automated-reports', automaticReport())).status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});

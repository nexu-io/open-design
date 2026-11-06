import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cp, readFile, stat, writeFile, mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './fixtures.ts';
import { transport } from './http.ts';
import { ModelGateway, gatewayFor } from '../gateway/service.ts';
import { classifyModel, discoverModels, normalizeModels } from '../gateway/catalog.ts';
import { downloadMedia, mediaType, type Fetcher } from '../gateway/network.ts';
import { callTool } from '../mcp.ts';
import type { Agent } from '../shared/gateway.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=', 'base64');
const agents = async (): Promise<Agent[]> => [{ id: 'codex', label: 'Codex', installed: true, authenticated: true, imageGeneration: true, available: true, reason: 'ready' }];
const fetcher = (callback: (url: string, init: RequestInit) => unknown): Fetcher => (async (url, init = {}) => {
  const body = callback(String(url), init);
  return body instanceof Response ? body : Response.json(body);
}) as Fetcher;
async function finish(gateway: ModelGateway, id: string) {
  await gateway.tick(); await Promise.all([...gateway.active.values()].map(task => task.done));
  return gateway.getJob(id);
}

test('scoped projects keep one workspace gateway and its active task ownership', () => fixture(async store => {
  const gateway = gatewayFor(store);
  assert.equal(gatewayFor(store.forProject(store.projectId)), gateway);
  assert.equal(gatewayFor(store.forProject(store.projectId).forProject(store.projectId)), gateway);
}));

test('capabilities distinguish an installed Agent from a callable media adapter; unavailable routes do not fall back', () => fixture(async store => {
  const gateway = new ModelGateway(store, { detect: async () => [{ ...(await agents())[0], available: false, authenticated: false }] });
  const status = await gateway.status();
  assert.equal(status.agents[0].installed, true);
  assert.equal(status.providers.find(p => p.id === 'codex')!.available, false);
  await gateway.configureProvider('fal', { apiKey: 'test-only-key' });
  await gateway.setRoute('image', 'codex:image-generation');
  await assert.rejects(gateway.submit({ modality: 'image', prompt: 'lake' }), /unavailable/);
  await assert.rejects(gateway.setRoute('image', 'fal:fal-ai/kokoro/american-english'), /same modality/);
  const ready = await gateway.status();
  assert.equal(ready.providers.find(p => p.id === 'fal')!.verification, 'unverified');
  assert.doesNotMatch(JSON.stringify(ready), /test-only-key/);
  assert.equal((await stat(path.join(gateway.root, 'secrets.json'))).mode & 0o777, 0o600);
  assert.equal((await stat(gateway.root)).mode & 0o777, 0o700);
}));

test('Codex generation persists actual bytes in the originating project after switching; idempotency survives configuration changes', () => fixture(async store => {
  let calls = 0;
  const gateway = new ModelGateway(store, { detect: agents, codex: async () => { calls++; return png; } });
  const input = { modality: 'image' as const, prompt: 'lake', parameters: { aspect_ratio: '16:9' }, idempotencyKey: 'one-image' };
  const queued = await gateway.submit(input);
  assert.equal((await gateway.submit(input)).id, queued.id);
  await assert.rejects(gateway.submit({ ...input, prompt: 'another' }), /Idempotency/);
  const nextId = randomUUID();
  await cp(store.projectDirectory, store.projectDirectoryFor(nextId), { recursive: true });
  await store.lock(() => store.selectProject(nextId, { id: nextId, title: 'Another project' }));
  const result = await finish(gateway, queued.id);
  assert.equal(result.state, 'completed', result.error); assert.equal(calls, 1);
  assert.equal(result.projectId, 'project'); assert.equal(result.assets[0].mimeType, 'image/png');
  assert.deepEqual(await readFile(path.join(store.projectDirectoryFor('project'), result.assets[0].path)), png);
  await assert.rejects(stat(path.join(store.projectDirectory, result.assets[0].path)), { code: 'ENOENT' });
  await gateway.configureProvider('codex', { enabled: false });
  assert.equal((await gateway.submit({ ...input, projectId: 'project' })).id, queued.id);
  await gateway.close();
}));

test('cancelled tasks do not import output, malformed media fails, interrupted tasks are never charged again', () => fixture(async store => {
  let release: (value: Buffer) => void = () => {};
  let calls = 0;
  const gateway = new ModelGateway(store, { detect: agents, codex: async () => { calls++; return new Promise(resolve => { release = resolve; }); } });
  const job = await gateway.submit({ modality: 'image', prompt: 'cancel' });
  await gateway.tick();
  while (!calls) await new Promise(resolve => setTimeout(resolve, 5));
  await gateway.cancel(job.id); release(png);
  await Promise.all([...gateway.active.values()].map(task => task.done));
  assert.equal((await gateway.getJob(job.id)).state, 'cancelled');
  assert.deepEqual((await gateway.getJob(job.id)).assets, []);
  gateway.options.codex = async () => Buffer.from('<html>not an image</html>');
  const bad = await finish(gateway, (await gateway.submit({ modality: 'image', prompt: 'bad' })).id);
  assert.equal(bad.state, 'failed'); assert.match(bad.error!, /valid image/);
  const interrupted = await gateway.submit({ modality: 'image', prompt: 'interrupted' });
  await writeFile(path.join(gateway.root, 'jobs', interrupted.id + '.json'), JSON.stringify({ ...interrupted, state: 'running', workerPid: 99999999 }));
  await gateway.tick();
  assert.equal((await gateway.getJob(interrupted.id)).phase, 'interrupted');
  assert.equal(gateway.active.size, 0);
  await gateway.close();
}));

test('reference edits snapshot real project bytes; source changes and idempotent retries cannot change the reference', () => fixture(async store => {
  const source = path.join(store.projectDirectory, 'assets', 'reference.png');
  await mkdir(path.dirname(source), { recursive: true }); await writeFile(source, png);
  let reference: string | undefined;
  const gateway = new ModelGateway(store, { detect: agents, codex: async (_prompt, _dir, _signal, image) => {
    reference = image; assert.ok(image); assert.deepEqual(await readFile(image), png); return png;
  } });
  const input = { modality: 'image' as const, prompt: 'golden sunset', referenceAsset: 'assets/reference.png', idempotencyKey: 'reference-edit' };
  const job = await gateway.submit(input);
  assert.equal(job.reference?.path, input.referenceAsset); assert.equal(job.reference?.sha256.length, 64);
  await writeFile(source, 'source changed after submission');
  assert.equal((await gateway.submit(input)).id, job.id);
  const result = await finish(gateway, job.id);
  assert.equal(result.state, 'completed', result.error);
  assert.equal(await readFile(source, 'utf8'), 'source changed after submission');
  assert.ok(reference); await assert.rejects(stat(reference), { code: 'ENOENT' });
  assert.deepEqual(await readFile(path.join(store.projectDirectory, result.assets[0].path)), png);
  await gateway.close();
}));

test('reference inputs enforce project boundary, image type, adapter support and queued cancellation cleanup', () => fixture(async store => {
  const source = path.join(store.projectDirectory, 'reference.png'); await writeFile(source, png);
  await writeFile(path.join(store.projectDirectory, 'fake.png'), '<html>not an image</html>');
  await symlink(source, path.join(store.projectDirectory, 'linked.png'));
  const gateway = new ModelGateway(store, { detect: agents });
  const input = { modality: 'image' as const, prompt: 'edit' };
  for (const referenceAsset of ['../reference.png', '/etc/passwd', 'fake.png', 'linked.png']) await assert.rejects(gateway.submit({ ...input, referenceAsset }));
  await gateway.configureProvider('fal', { apiKey: 'test-only-key' });
  await assert.rejects(gateway.submit({ ...input, referenceAsset: 'reference.png', model: 'fal:fal-ai/flux/schnell' }), /does not support reference/);
  const job = await gateway.submit({ ...input, referenceAsset: 'reference.png' });
  const snapshot = path.join(gateway.root, 'work', job.id, 'reference.png');
  assert.equal((await stat(snapshot)).mode & 0o777, 0o600);
  await gateway.cancel(job.id); await assert.rejects(stat(snapshot), { code: 'ENOENT' });
  await gateway.close();
}));

test('fal uses returned queue URLs and provider-native voice input; auth rejection is redacted and disables availability', () => fixture(async store => {
  const seen: string[] = [];
  const gateway = new ModelGateway(store, { detect: agents, pollMs: 1, download: async () => png, fetcher: fetcher((url, init) => {
    seen.push(url); assert.equal(new Headers(init.headers).get('Authorization'), 'Key test-fal-secret');
    if (init.method === 'POST') {
      assert.equal(JSON.parse(init.body as string).prompt, 'forest');
      return { request_id: 'remote-1', status_url: 'https://queue.fal.run/fal-ai/flux/requests/remote-1/status', response_url: 'https://queue.fal.run/fal-ai/flux/requests/remote-1' };
    }
    if (url.endsWith('/status')) return { status: 'COMPLETED' };
    return { images: [{ url: 'https://cdn.example/generated.png' }] };
  }) });
  await gateway.configureProvider('fal', { apiKey: 'test-fal-secret' });
  const result = await finish(gateway, (await gateway.submit({ modality: 'image', prompt: 'forest', model: 'fal:fal-ai/flux/schnell' })).id);
  assert.equal(result.state, 'completed', result.error); assert.equal(seen.length, 3);
  assert.equal((await gateway.status()).providers.find(p => p.id === 'fal')!.verification, 'verified');
  gateway.options.fetcher = fetcher((_url, init) => {
    assert.equal(JSON.parse(init.body as string).text, 'Hello');
    return new Response('test-fal-secret private provider diagnostics', { status: 401 });
  });
  const failed = await finish(gateway, (await gateway.submit({ modality: 'audio', prompt: 'Hello', model: 'fal:fal-ai/kokoro/american-english' })).id);
  assert.equal(failed.state, 'failed'); assert.doesNotMatch(JSON.stringify(failed), /test-fal-secret|private provider diagnostics/);
  assert.equal((await gateway.status()).providers.find(p => p.id === 'fal')!.available, false);
  await gateway.configureProvider('fal', { apiKey: 'replacement' });
  assert.equal((await gateway.status()).providers.find(p => p.id === 'fal')!.verification, 'unverified');
  await gateway.close();
}));

test('Atlas submits and polls video, maps actual media, and refuses credentials inside arbitrary parameters', () => fixture(async store => {
  const mp4 = Buffer.concat([Buffer.from('00000018667479706d703432000000006d703432', 'hex'), Buffer.alloc(32)]);
  const gateway = new ModelGateway(store, { detect: agents, pollMs: 1, download: async () => mp4, fetcher: fetcher((url, init) => {
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer atlas-secret');
    if (init.method === 'POST') { assert.ok(url.endsWith('/generateVideo')); assert.equal(JSON.parse(init.body as string).duration, 5); return { code: 200, data: { id: 'video-1' } }; }
    assert.ok(url.endsWith('/prediction/video-1')); return { code: 200, data: { status: 'completed', outputs: ['https://cdn.example/video.mp4'] } };
  }) });
  await gateway.configureProvider('atlascloud', { apiKey: 'atlas-secret' });
  const input = { modality: 'video' as const, prompt: 'lake', model: 'atlascloud:bytedance/seedance-2.0/text-to-video', parameters: { duration: 5 } };
  const result = await finish(gateway, (await gateway.submit(input)).id);
  assert.equal(result.state, 'completed', result.error); assert.equal(result.assets[0].mimeType, 'video/mp4');
  await assert.rejects(gateway.submit({ ...input, parameters: { api_key: 'secret' } }), /reserved/);
  await assert.rejects(gateway.registerModel({ provider: 'fal', modelId: '../keys', modality: 'image', label: 'bad', mode: 'text-to-image' }), /Invalid model/);
  await gateway.close();
}));

test('catalogue discovery classifies output rather than input and follows public pagination without credentials', async () => {
  assert.deepEqual(classifyModel('image-to-video'), { modality: 'video', mode: 'image-to-video' });
  assert.equal(classifyModel('image-to-text'), null);
  assert.equal(normalizeModels('fal', [{ endpoint_id: 'fal-ai/whisper', metadata: { category: 'speech-to-text' } }]).length, 0);
  let pages = 0;
  const models = await discoverModels('fal', 'image', fetcher((url, init) => {
    assert.equal(init.headers, undefined); pages++;
    if (pages === 1) return { models: [{ endpoint_id: 'fal-ai/edit', metadata: { category: 'image-to-image' } }], next_cursor: 'next' };
    assert.ok(url.includes('cursor=next'));
    return { models: [{ endpoint_id: 'fal-ai/video', metadata: { category: 'image-to-video' } }] };
  }));
  assert.equal(pages, 2); assert.deepEqual(models.map(m => m.modality), ['image', 'video']);
});

test('media import rejects non-public URLs, unexpected file signatures and wrong output modalities', async () => {
  for (const url of ['http://example.com/file.png', 'https://127.0.0.1/file.png', 'https://user:pass@example.com/file.png', 'https://[::1]/image']) await assert.rejects(downloadMedia(url, new AbortController().signal));
  assert.throws(() => mediaType(png, 'video'), /valid video/);
  assert.deepEqual(await downloadMedia('data:image/png;base64,' + png.toString('base64'), new AbortController().signal), png);
});

test('HTTP and MCP share settings, routes and job state without exposing keys or project data paths', () => fixture(async store => {
  const request = transport(store), gateway = gatewayFor(store); gateway.options.detect = agents;
  const response = await request('/motion-api/models/providers/fal', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: 'http-secret' }) });
  assert.equal(response.status, 200); assert.doesNotMatch(await response.text(), /http-secret/);
  const capabilities = await callTool('motion_get_capabilities', {}, store) as Awaited<ReturnType<ModelGateway['status']>>;
  assert.equal(capabilities.providers.find(p => p.id === 'fal')!.configured, true);
  await callTool('motion_set_model_route', { modality: 'image', model: 'codex:image-generation' }, store);
  const status = await (await request('/motion-api/models/capabilities')).json();
  assert.equal(status.routes.image, 'codex:image-generation');
  const job = await gateway.submit({ modality: 'image', prompt: 'asset' });
  const read = await callTool('motion_get_generation', { jobId: job.id }, store) as { job: typeof job };
  assert.equal(read.job.id, job.id);
  const cancelled = await request(`/motion-api/generations/${job.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await cancelled.json()).job.state, 'cancelled');
  assert.equal((await request('/motion-api/generations', { method: 'POST', body: '{}' })).status, 503);
  assert.equal((await request('/model-gateway/secrets.json')).status, 404);
  await gateway.close();
}));

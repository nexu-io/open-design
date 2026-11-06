import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures.ts';
import { transport } from './http.ts';
import { handler } from '../server.ts';
import { Readable, Writable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';

test('wrapper serves the locally built Motion editor and hides local source/runtime files', () => fixture(async store => {
  const request = transport(store);
  const html = await (await request('/')).text(); assert.match(html, /OpenDesign/);
  assert.doesNotMatch(html, /<iframe/);
  const script = html.match(/src="(\/editor-assets\/[^\"]+\.js)"/)![1];
  const module = await request(script); assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type')!, /javascript/);
  for (const url of ['/workspace.ts', '/.motion-data/project/index.html', '/node_modules/hyperframes/package.json', '/web/render.ts', '/studio/src/main.tsx', '/web/app.ts']) assert.equal((await request(url)).status, 404);
  assert.equal((await request('/web/design-system/fonts.css')).status, 200);
  assert.equal((await request('/design-system')).status, 200);
  assert.equal((await request('/api/studio')).status, 503);
}));
test('HTTP source writes use the same revision contract and reject stale saves', () => fixture(async store => {
  const request = transport(store), initial = await store.get();
  const payload = JSON.stringify({ expectedRevision: initial.revision, files: [{ path: 'notes.md', content: 'HTTP edit' }] });
  const init = { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: payload };
  assert.equal((await request('/api/project', init)).status, 200);
  assert.equal((await request('/api/project', init)).status, 409);
  assert.equal((await store.readFile('notes.md')).content, 'HTTP edit');
  const health = await (await request('/api/health')).json();
  assert.equal(health.protocol, 2); assert.equal(health.engine, 'hyperframes'); assert.equal(health.dataDirectory, store.directory); assert.equal(health.ready, false);
}));
test('wrapper rejects cross-origin mutations and DNS rebinding hosts', () => fixture(async store => {
  for (const headers of [ { host: 'localhost:4173', origin: 'https://remote.example' }, { host: 'evil.example', origin: 'http://evil.example' } ]) {
    let status = 200;
    const res = Object.assign(new Writable({ write(_chunk, _encoding, done) { done(); } }), { setHeader() {}, writeHead(value: number) { status = value; } });
    const req = Object.assign(Readable.from([]), { url: '/api/project', method: 'PUT', headers });
    await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse, store); assert.equal(status, 403);
  }
}));

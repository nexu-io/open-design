import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest } from '../functions/api/attribution/mint.ts';
import { onRequest as mintBridge } from '../functions/api/attribution/bridge/mint.ts';
import { onRequest as consumeBridge } from '../functions/api/attribution/bridge/consume.ts';
import { onRequest as consumeDownload } from '../functions/api/attribution/consume.ts';
import { onRequest as downloadAsset } from '../functions/[os]/[arch]/[token]/[asset].ts';

function consumptionDb() {
  const rows = new Map<string, string | null>();
  return {
    prepare(query: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...next: unknown[]) {
          values = next;
          return statement;
        },
        async run() {
          const token = String(values[0]);
          const kind = String(values[1]);
          const key = `${kind}:${token}`;
          if (query.startsWith('INSERT')) {
            if (rows.has(key)) return { meta: { changes: 0 } };
            rows.set(key, typeof values[2] === 'string' ? values[2] : null);
            return { meta: { changes: 1 } };
          }
          if (query.startsWith('DELETE')) {
            return { meta: { changes: rows.delete(key) ? 1 : 0 } };
          }
          return { meta: { changes: 0 } };
        },
        async first() {
          const token = String(values[0]);
          const kind = String(values[1]);
          const consumedBy = rows.get(`${kind}:${token}`);
          return consumedBy === undefined ? null : { consumedBy };
        },
      };
      return statement;
    },
  };
}

test('download attribution mint only accepts Open Design GitHub release assets', async () => {
  const records = new Map<string, string>();
  const request = new Request('https://download.open-design.ai/api/attribution/mint', {
    method: 'POST',
    body: JSON.stringify({
      webDistinctId: 'web-anon-1',
      assetUrl: 'https://github.com/nexu-io/open-design/releases/download/v1/Open-Design.dmg',
      platform: 'macos',
    }),
  });

  const response = await onRequest({
    request,
    env: { ATTRIBUTION_KV: { get: async () => null, put: async (key, value) => { records.set(key, value); } } },
    params: {},
  });

  assert.equal(response.status, 200);
  const payload = await response.json() as { downloadUrl?: string };
  assert.match(payload.downloadUrl ?? '', /^https:\/\/download\.open-design\.ai\/macos\/auto\/oddl_/);
  assert.equal(records.size, 1);
});

test('download attribution mint rejects arbitrary proxy targets', async () => {
  const response = await onRequest({
    request: new Request('https://download.open-design.ai/api/attribution/mint', {
      method: 'POST',
      body: JSON.stringify({ webDistinctId: 'web-anon-1', assetUrl: 'https://example.com/private.zip' }),
    }),
    env: { ATTRIBUTION_KV: { get: async () => null, put: async () => undefined } },
    params: {},
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'unsupported_release_asset' });
});

test('first-party bridge is short-lived, single-use, and origin scoped', async () => {
  const records = new Map<string, string>();
  const env = {
    ATTRIBUTION_CONSUME_TOKEN: 'secret',
    ATTRIBUTION_KV: {
      get: async (key: string) => records.get(key) ?? null,
      put: async (key: string, value: string) => { records.set(key, value); },
    },
    ATTRIBUTION_DB: consumptionDb(),
  };
  const minted = await mintBridge({
    request: new Request('https://open-design.ai/api/attribution/bridge/mint', {
      method: 'POST', headers: { Authorization: 'Bearer secret' },
      body: JSON.stringify({ installationId: 'install-123', url: 'https://open-design.ai/clipper' }),
    }), env, params: {},
  });
  const url = (await minted.json() as { url: string }).url;
  const token = new URL(url).searchParams.get('od_bridge');
  assert.ok(token);
  const consume = () => consumeBridge({
    request: new Request('https://open-design.ai/api/attribution/bridge/consume', {
      method: 'POST', body: JSON.stringify({ token }),
    }), env, params: {},
  });
  assert.deepEqual(await (await consume()).json(), { installationId: 'install-123' });
  assert.equal((await consume()).status, 404);
});

test('download attribution consumption has exactly one concurrent winner', async () => {
  const records = new Map<string, string>();
  const token = 'odtoken_concurrent_123';
  records.set(`download-attribution:${token}`, JSON.stringify({
    token,
    webDistinctId: 'web-anon-1',
    assetUrl: 'https://github.com/nexu-io/open-design/releases/download/v1/Open-Design.dmg',
    createdAt: new Date().toISOString(),
    landingUrl: null,
    referrer: null,
    properties: {},
  }));
  const env = {
    ATTRIBUTION_KV: {
      get: async (key: string) => records.get(key) ?? null,
      put: async (key: string, value: string) => { records.set(key, value); },
    },
    ATTRIBUTION_DB: consumptionDb(),
  };
  const claim = (installationId: string) => consumeDownload({
    request: new Request('https://download.open-design.ai/api/attribution/consume', {
      method: 'POST', body: JSON.stringify({ token, installationId }),
    }),
    env,
    params: {},
  });
  const [first, second] = await Promise.all([claim('install-a'), claim('install-b')]);
  const results = await Promise.all([first.json(), second.json()]) as Array<{ status: string }>;
  assert.deepEqual(results.map((result) => result.status).sort(), ['already_consumed_other', 'consumed']);
});

test('download attribution retry returns its payload after the first response is lost', async () => {
  const records = new Map<string, string>();
  const token = 'odtoken_retry_123';
  records.set(`download-attribution:${token}`, JSON.stringify({
    token,
    webDistinctId: 'web-anon-retry',
    assetUrl: 'https://github.com/nexu-io/open-design/releases/download/v1/Open-Design.dmg',
    createdAt: new Date().toISOString(), landingUrl: null, referrer: null,
    properties: { od_utm_source: 'release' },
  }));
  const env = {
    ATTRIBUTION_KV: {
      get: async (key: string) => records.get(key) ?? null,
      put: async (key: string, value: string) => { records.set(key, value); },
    },
    ATTRIBUTION_DB: consumptionDb(),
  };
  const claim = () => consumeDownload({
    request: new Request('https://download.open-design.ai/api/attribution/consume', {
      method: 'POST', body: JSON.stringify({ token, installationId: 'install-retry' }),
    }), env, params: {},
  });
  assert.equal((await (await claim()).json() as { status: string }).status, 'consumed');
  assert.deepEqual(await (await claim()).json(), {
    status: 'already_consumed_same',
    webDistinctId: 'web-anon-retry',
    properties: { od_utm_source: 'release' },
  });
});

test('download proxy preserves successful HEAD responses without a body', async () => {
  const token = 'odtoken_head_123';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, {
    status: 200,
    headers: { 'Content-Length': '42', 'Content-Type': 'application/octet-stream' },
  });
  try {
    const response = await downloadAsset({
      request: new Request(`https://download.open-design.ai/macos/auto/${token}/Open-Design.dmg`, { method: 'HEAD' }),
      env: {
        ATTRIBUTION_KV: {
          get: async () => JSON.stringify({
            token,
            webDistinctId: 'web-anon-1',
            assetUrl: 'https://github.com/nexu-io/open-design/releases/download/v1/Open-Design.dmg',
            createdAt: new Date().toISOString(), landingUrl: null, referrer: null, properties: {},
          }),
          put: async () => undefined,
        },
      },
      params: { os: 'macos', arch: 'auto', token, asset: 'Open-Design.dmg' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body, null);
    assert.equal(response.headers.get('content-length'), '42');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

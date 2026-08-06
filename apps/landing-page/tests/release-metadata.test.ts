import assert from 'node:assert/strict';
import { test } from 'node:test';

import { onRequest } from '../functions/release-metadata.ts';

test('release metadata proxy keeps the stable snapshot fresh within one minute', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"releaseVersion":"0.18.0"}', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    const response = await onRequest({
      request: new Request('https://open-design.ai/release-metadata'),
      env: {},
    });

    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('Cache-Control'),
      'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

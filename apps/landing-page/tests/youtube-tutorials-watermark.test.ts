import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { lastSuccessfulRunStart } from '../scripts/youtube-tutorials/notify-candidates.ts';

const realFetch = globalThis.fetch;

function stubRunsResponse(runs: { id: number; created_at: string; run_started_at?: string }[]) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ workflow_runs: runs }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
}

describe('lastSuccessfulRunStart', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_REF_NAME;
    delete process.env.GITHUB_RUN_ID;
  });

  it('uses run_started_at, not created_at, for a queued run', async () => {
    process.env.GITHUB_TOKEN = 'tok';
    process.env.GITHUB_REPOSITORY = 'nexu-io/open-design';
    process.env.GITHUB_REF_NAME = 'main';
    process.env.GITHUB_RUN_ID = '999';
    // Latest prior run sat in the queue for ~12 min: created_at != run_started_at.
    stubRunsResponse([
      { id: 100, created_at: '2026-06-09T02:30:00Z', run_started_at: '2026-06-09T02:31:00Z' },
      { id: 200, created_at: '2026-06-10T08:17:00Z', run_started_at: '2026-06-10T08:29:38Z' },
    ]);
    const watermark = await lastSuccessfulRunStart();
    assert.equal(watermark, '2026-06-10T08:29:38Z');
  });

  it('excludes the current run and falls back to created_at when run_started_at is absent', async () => {
    process.env.GITHUB_TOKEN = 'tok';
    process.env.GITHUB_REPOSITORY = 'nexu-io/open-design';
    process.env.GITHUB_RUN_ID = '200';
    stubRunsResponse([
      { id: 100, created_at: '2026-06-09T02:30:00Z' },
      { id: 200, created_at: '2026-06-10T08:17:00Z', run_started_at: '2026-06-10T08:29:38Z' },
    ]);
    const watermark = await lastSuccessfulRunStart();
    // Current run (200) excluded; only run 100 remains, no run_started_at -> created_at.
    assert.equal(watermark, '2026-06-09T02:30:00Z');
  });

  it('returns null when there is no token (no watermark source)', async () => {
    const watermark = await lastSuccessfulRunStart();
    assert.equal(watermark, null);
  });
});

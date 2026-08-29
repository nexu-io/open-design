import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// Red spec: two (or more) concurrent Library ingests of the SAME bytes must
// both succeed AND fully converge — one deduped asset that preserves every
// request's source/tag contribution. `registerLibraryAsset` (library.ts) checks
// `findLibraryAssetByHash` (SELECT), then `await mkdir` + `await writeFile`,
// then `insertLibraryAsset` (INSERT) — with a bare `UNIQUE(content_hash)`
// constraint and no surrounding transaction or ON CONFLICT. Two concurrent
// requests both pass the SELECT (neither has inserted yet), both await the file
// write, then both INSERT — the loser hits "UNIQUE constraint failed:
// library_assets.content_hash" and the route returns 500 INGEST_FAILED, dropping
// that upload's source/tags instead of deduping.
//
// The assertions cover BOTH halves of the bug: (1) the loser must not 500, and
// (2) the loser's data (a unique tag) must survive the dedup merge — a silent
// data-integrity loss that a "no 500 + one asset id" check alone would miss.

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

describe('concurrent Library ingest content-hash race', () => {
  let started: StartedServer | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
  });

  it('dedups concurrent identical uploads without losing any request\'s tag', async () => {
    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;

    // Unique bytes per run so we never collide with a prior run's asset in the
    // shared vitest data dir. A tiny PNG-ish payload with a unique tail.
    const unique = randomUUID();
    const bytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from(`open-design-race-${unique}`, 'utf8'),
    ]);
    const dataUrl = `data:image/png;base64,${bytes.toString('base64')}`;

    const CONCURRENCY = 12;
    // Every request carries a DISTINCT tag that must survive the dedup merge.
    // On the bug, a loser 500s and its tag is dropped; a correct dedup folds
    // each request's tag onto the single converged asset.
    const tags = Array.from({ length: CONCURRENCY }, (_, i) => `race-tag-${unique}-${i}`);
    const responses = await Promise.all(
      tags.map((tag) =>
        fetch(`${started!.url}/api/library/ingest`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dataUrl, filename: 'race.png', mime: 'image/png', tags: [tag] }),
        }),
      ),
    );

    const results = await Promise.all(
      responses.map(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
    );

    // (1) No loser may 500.
    const failures = results.filter((s) => s.status !== 200);
    expect(
      failures,
      `concurrent identical ingests must all dedup to one asset, but ${failures.length}/${CONCURRENCY} ` +
        `returned an error: ${JSON.stringify(failures.map((f) => f.status + ':' + JSON.stringify(f.body)))}`,
    ).toEqual([]);

    // Each success must be a complete, well-shaped result — not just a 200: a
    // non-empty asset id and a boolean `deduped`. Guards against a "200 with no
    // asset.id" regression slipping past.
    const oks = results.map((r) => r.body as { asset?: { id?: string }; deduped?: unknown });
    for (const b of oks) {
      expect(typeof b.asset?.id, `each 200 must carry an asset id, got ${JSON.stringify(b)}`).toBe('string');
      expect(b.asset?.id).toBeTruthy();
      expect(typeof b.deduped, 'each 200 must report a boolean deduped').toBe('boolean');
    }

    // All requests converge on ONE asset, with exactly one fresh insert
    // (deduped=false) and the rest folded in (deduped=true).
    const assetIds = new Set(oks.map((b) => b.asset!.id as string));
    expect(assetIds.size, 'all concurrent ingests must converge on one asset').toBe(1);
    expect(
      oks.filter((b) => b.deduped === false).length,
      'exactly one request performs the fresh insert; the rest fold into it',
    ).toBe(1);

    // (2) Data-integrity core: fetch the converged asset and prove EVERY
    // request's unique tag survived the concurrent dedup merge — none dropped.
    const assetId = [...assetIds][0];
    const getRes = await fetch(`${started!.url}/api/library/assets/${assetId}`);
    expect(getRes.status).toBe(200);
    const finalAsset = (await getRes.json()) as { asset?: { tags?: string[] } };
    const finalTags = new Set(finalAsset.asset?.tags ?? []);
    const dropped = tags.filter((t) => !finalTags.has(t));
    expect(
      dropped,
      `every concurrent ingest's tag must survive dedup, but ${dropped.length}/${CONCURRENCY} were dropped: ${JSON.stringify(dropped)}`,
    ).toEqual([]);
  });
});

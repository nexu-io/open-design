import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

// Red spec: two (or more) concurrent Library ingests of the SAME bytes must
// both succeed and dedup to a single asset. `registerLibraryAsset` (library.ts)
// checks `findLibraryAssetByHash` (SELECT), then `await mkdir` + `await
// writeFile`, then `insertLibraryAsset` (INSERT) — with a bare `UNIQUE(content_hash)`
// constraint and no surrounding transaction or ON CONFLICT. Two concurrent
// requests both pass the SELECT (neither has inserted yet), both await the file
// write, then both INSERT — the loser hits "UNIQUE constraint failed:
// library_assets.content_hash" and the route returns 500 INGEST_FAILED, dropping
// that upload's source/tags instead of deduping.

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

  it('dedups concurrent identical uploads instead of 500-ing the losers', async () => {
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
    const responses = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        fetch(`${started!.url}/api/library/ingest`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ dataUrl, filename: 'race.png', mime: 'image/png' }),
        }),
      ),
    );

    const statuses = await Promise.all(
      responses.map(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })),
    );
    const failures = statuses.filter((s) => s.status !== 200);
    const assetIds = new Set(
      statuses
        .filter((s) => s.status === 200)
        .map((s) => (s.body as { asset?: { id?: string } })?.asset?.id)
        .filter(Boolean),
    );

    expect(
      failures,
      `concurrent identical ingests must all dedup to one asset, but ${failures.length}/${CONCURRENCY} ` +
        `returned an error: ${JSON.stringify(failures.map((f) => f.status + ':' + JSON.stringify(f.body)))}`,
    ).toEqual([]);
    // All survivors must point at the same deduped asset.
    expect(assetIds.size).toBe(1);
  });
});

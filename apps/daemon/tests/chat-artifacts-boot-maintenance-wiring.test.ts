// ---------------------------------------------------------------------------
// GUARDRAIL: daemon startup actually runs snapshot reconcile and GC.
//
// `reconcile.ts` and `gc.ts` are thoroughly unit-tested — by calling them
// directly. Nothing tested that the daemon ever calls them. Their one call site
// lives in a fire-and-forget `void (async () => …)()` inside `startServer`,
// wrapped in a `try { … } catch { console.warn }`, so deleting either call left
// the whole suite green while:
//
//   * every capture interrupted by a crash stayed `pending` forever — the card
//     shows a spinner state that nothing will ever settle.
//   * every unreferenced blob stayed on disk forever — the store only grows,
//     and the quota that fails future captures is spent on dead bytes.
//
// This test seeds both residues BEFORE boot and asserts the daemon settled them
// on its own. It never imports the reconcile or GC module.
// ---------------------------------------------------------------------------

import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';
import { closeDatabase, openDatabase } from '../src/db.js';
import { createChatArtifactBlobStore } from '../src/chat-artifacts/blob-store.js';
import { getChatArtifactSnapshot, insertSnapshotIntent } from '../src/chat-artifacts/store.js';

const projectId = 'proj-boot-maintenance';
const interruptedSnapshotId = 'snap-boot-interrupted';
const doomedSnapshotId = 'snap-boot-doomed';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Poll instead of racing: the boot pass is deliberately not awaited by boot. */
async function until<T>(
  probe: () => T | null | Promise<T | null>,
  timeoutMs = 15_000,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== null) return value;
    if (Date.now() > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('daemon boot settles interrupted captures and reclaims dead blobs', () => {
  let server: http.Server;
  let dataDir: string;
  let doomedStorageKey = '';

  beforeAll(async () => {
    dataDir = process.env.OD_DATA_DIR!;
    // The sweep defaults to report-only; this is the switch production uses.
    vi.stubEnv('OD_CHAT_ARTIFACT_GC', '1');

    const db = openDatabase(dataDir, { dataDir });
    const blobs = createChatArtifactBlobStore({ dataDir });
    const now = Date.now();
    db.prepare(`INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run(projectId, projectId, now, now);

    // (1) A capture that crashed between writing its verified temp and the
    // ready flip. The bytes are recoverable, so the reconciler must finish it.
    const interruptedBytes = Buffer.from('bytes-of-an-interrupted-capture', 'utf8');
    const tempKey = blobs.newTempKey();
    const written = await blobs.writeTempFromBytes(tempKey, interruptedBytes);
    insertSnapshotIntent(db, {
      id: interruptedSnapshotId,
      projectId,
      sourcePathAtCapture: 'interrupted.png',
      kind: 'image',
      mime: 'image/png',
      expectedSize: written.byteSize,
      expectedDigest: written.digest,
      tempKey,
    });

    // (2) A long-dead snapshot no message points at, and the only blob it
    // named. Both are past every grace window, so the sweep must reclaim them.
    const doomedBytes = Buffer.from('bytes-nothing-references-any-more', 'utf8');
    const doomedTempKey = blobs.newTempKey();
    const doomedWritten = await blobs.writeTempFromBytes(doomedTempKey, doomedBytes);
    doomedStorageKey = await blobs.installTemp(doomedTempKey, doomedWritten.digest);
    const longAgo = now - 3 * DAY_MS;
    db.prepare(
      `INSERT INTO chat_artifact_blobs (digest, storage_key, byte_size, mime, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(doomedWritten.digest, doomedStorageKey, doomedWritten.byteSize, 'image/png', longAgo);
    db.prepare(
      `INSERT INTO chat_artifact_snapshots
         (id, project_id, source_path_at_capture, kind, mime, content_digest,
          capture_state, created_at, ready_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?)`,
    ).run(doomedSnapshotId, projectId, 'doomed.png', 'image', 'image/png',
      doomedWritten.digest, longAgo, longAgo);

    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    server = started.server;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    closeDatabase();
    vi.unstubAllEnvs();
  });

  it('finishes a capture the previous process left pending', async () => {
    const db = openDatabase(dataDir, { dataDir });
    const settled = await until(() => {
      const row = getChatArtifactSnapshot(db, interruptedSnapshotId);
      return row && row.captureState !== 'pending' ? row : null;
    });
    expect(settled, 'boot reconcile settled the interrupted capture').toBeTruthy();
    // Recoverable bytes must come back as evidence, not as an honest failure.
    expect(settled!.captureState).toBe('ready');
    expect(settled!.contentDigest).toBe(settled!.expectedDigest);
  }, 30_000);

  it('reclaims a snapshot and blob nothing references any more', async () => {
    const db = openDatabase(dataDir, { dataDir });
    const swept = await until(() =>
      getChatArtifactSnapshot(db, doomedSnapshotId) === null ? true : null,
    );
    expect(swept, 'boot GC swept the unreferenced snapshot row').toBe(true);

    const blobs = createChatArtifactBlobStore({ dataDir });
    const objectGone = await until(async () =>
      (await blobs.hasBlob(doomedStorageKey)) ? null : true,
    );
    expect(objectGone, 'boot GC removed the dead blob object from disk').toBe(true);
    const blobRow = db
      .prepare(`SELECT digest FROM chat_artifact_blobs WHERE storage_key = ?`)
      .get(doomedStorageKey);
    expect(blobRow).toBeUndefined();

    // The counter-control: the capture the reconciler just finished is young
    // and referenced by its own snapshot row, so the same sweep left it alone.
    const kept = getChatArtifactSnapshot(db, interruptedSnapshotId);
    expect(kept).toBeTruthy();
    expect(await blobs.hasBlob(blobs.storageKeyFor(kept!.contentDigest!))).toBe(true);
  }, 30_000);
});

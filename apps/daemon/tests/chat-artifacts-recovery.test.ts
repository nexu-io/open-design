import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDatabase, openDatabase } from '../src/db.js';
import {
  createChatArtifactBlobStore,
  resetChatArtifactBlobStoreCache,
} from '../src/chat-artifacts/blob-store.js';
import { reconcileChatArtifactSnapshots } from '../src/chat-artifacts/reconcile.js';
import {
  getChatArtifactBlob,
  getChatArtifactSnapshot,
  insertSnapshotIntent,
  upsertChatArtifactBlob,
} from '../src/chat-artifacts/store.js';

const bytes = (text: string) => Buffer.from(text, 'utf8');
const sha256 = (buf: Buffer) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;

describe('chat artifact crash recovery', () => {
  let dataDir: string;
  let workDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-recover-data-'));
    workDir = mkdtempSync(path.join(os.tmpdir(), 'od-recover-work-'));
    resetChatArtifactBlobStoreCache();
  });

  afterEach(() => {
    closeDatabase();
    resetChatArtifactBlobStoreCache();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(workDir, { recursive: true, force: true });
  });

  function deps() {
    const db = openDatabase(dataDir, { dataDir });
    const blobs = createChatArtifactBlobStore({ dataDir });
    const now = Date.now();
    db.prepare(
      `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('proj-1', 'proj-1', now, now);
    return { db, blobs };
  }

  it('crash AFTER the temp was written: hashes it and completes the commit', async () => {
    const d = deps();
    const payload = bytes('recovered-bytes');
    const digest = sha256(payload);
    const tempKey = d.blobs.newTempKey();
    await d.blobs.writeTempFromBytes(tempKey, payload);
    insertSnapshotIntent(d.db, {
      id: 'snap-1',
      projectId: 'proj-1',
      sourcePathAtCapture: 'hero.png',
      kind: 'image',
      expectedSize: payload.byteLength,
      expectedDigest: digest,
      tempKey,
    });

    const report = await reconcileChatArtifactSnapshots(d);
    expect(report.completed).toBe(1);

    const row = getChatArtifactSnapshot(d.db, 'snap-1');
    expect(row?.captureState).toBe('ready');
    expect(row?.contentDigest).toBe(digest);
    expect(getChatArtifactBlob(d.db, digest)).not.toBeNull();
  });

  it('crash AFTER the blob was installed but before the ready flip: completes', async () => {
    const d = deps();
    const payload = bytes('installed-already');
    const digest = sha256(payload);
    const tempKey = d.blobs.newTempKey();
    await d.blobs.writeTempFromBytes(tempKey, payload);
    const storageKey = await d.blobs.installTemp(tempKey, digest);
    upsertChatArtifactBlob(d.db, {
      digest,
      storageKey,
      byteSize: payload.byteLength,
    });
    insertSnapshotIntent(d.db, {
      id: 'snap-2',
      projectId: 'proj-1',
      sourcePathAtCapture: 'hero.png',
      kind: 'image',
      expectedSize: payload.byteLength,
      expectedDigest: digest,
      tempKey,
    });

    const report = await reconcileChatArtifactSnapshots(d);
    expect(report.completed).toBe(1);
    expect(getChatArtifactSnapshot(d.db, 'snap-2')?.captureState).toBe('ready');
  });

  it('crash BEFORE the temp was written: fails as interrupted, never substitutes', async () => {
    const d = deps();
    const digest = sha256(bytes('never-staged'));
    insertSnapshotIntent(d.db, {
      id: 'snap-3',
      projectId: 'proj-1',
      sourcePathAtCapture: 'hero.png',
      kind: 'image',
      expectedSize: 12,
      expectedDigest: digest,
      tempKey: d.blobs.newTempKey(),
    });

    const report = await reconcileChatArtifactSnapshots(d);
    expect(report.failed).toBe(1);
    const row = getChatArtifactSnapshot(d.db, 'snap-3');
    expect(row?.captureState).toBe('failed');
    expect(row?.failureCode).toBe('interrupted');
    expect(getChatArtifactBlob(d.db, digest)).toBeNull();
  });

  // `kind` used to be `html` in this fixture and the next. No path intent is
  // ever written for `html` — only kinds whose ORIGINAL bytes are the message
  // evidence get a path capture at all — so the fixtures described a record
  // this code path cannot receive. They are images now; the fingerprint
  // assertions they exist for are unchanged.
  it('path intent: re-captures only when the source fingerprint still matches', async () => {
    const d = deps();
    const filePath = path.join(workDir, 'hero.png');
    fs.writeFileSync(filePath, bytes('png-v1'));
    const stat = fs.statSync(filePath);
    insertSnapshotIntent(d.db, {
      id: 'snap-4',
      projectId: 'proj-1',
      sourcePathAtCapture: 'hero.png',
      kind: 'image',
      expectedSize: stat.size,
      expectedMtime: stat.mtimeMs,
      expectedDigest: null,
      tempKey: d.blobs.newTempKey(),
    });

    const report = await reconcileChatArtifactSnapshots({
      ...d,
      resolveSourcePath: () => filePath,
    });
    expect(report.completed).toBe(1);
    expect(getChatArtifactSnapshot(d.db, 'snap-4')?.contentDigest)
      .toBe(sha256(bytes('png-v1')));
  });

  it('path intent: a changed source fails as source_changed, not a fresh copy', async () => {
    const d = deps();
    const filePath = path.join(workDir, 'hero.png');
    fs.writeFileSync(filePath, bytes('png-v1'));
    const stat = fs.statSync(filePath);
    fs.writeFileSync(filePath, bytes('png-v2-different-length'));

    insertSnapshotIntent(d.db, {
      id: 'snap-5',
      projectId: 'proj-1',
      sourcePathAtCapture: 'hero.png',
      kind: 'image',
      expectedSize: stat.size,
      expectedMtime: stat.mtimeMs,
      expectedDigest: null,
      tempKey: d.blobs.newTempKey(),
    });

    const report = await reconcileChatArtifactSnapshots({
      ...d,
      resolveSourcePath: () => filePath,
    });
    expect(report.failed).toBe(1);
    const row = getChatArtifactSnapshot(d.db, 'snap-5');
    expect(row?.failureCode).toBe('source_changed');
    expect(getChatArtifactBlob(d.db, sha256(bytes('png-v2-different-length'))))
      .toBeNull();
    // The reconciler must settle the EXISTING intent, not stage a second
    // capture attempt that fails and leaves an extra row behind for the GC.
    const rows = d.db
      .prepare(`SELECT COUNT(*) AS n FROM chat_artifact_snapshots`)
      .get() as { n: number };
    expect(rows.n).toBe(1);
  });

  it('a blob row whose file vanished fails its snapshots as blob_missing', async () => {
    const d = deps();
    const payload = bytes('will-vanish');
    const digest = sha256(payload);
    const tempKey = d.blobs.newTempKey();
    await d.blobs.writeTempFromBytes(tempKey, payload);
    const storageKey = await d.blobs.installTemp(tempKey, digest);
    upsertChatArtifactBlob(d.db, { digest, storageKey, byteSize: payload.byteLength });
    insertSnapshotIntent(d.db, {
      id: 'snap-6',
      projectId: 'proj-1',
      sourcePathAtCapture: 'hero.png',
      kind: 'image',
      expectedDigest: digest,
      tempKey: null,
    });
    d.db.prepare(
      `UPDATE chat_artifact_snapshots
          SET capture_state = 'ready', content_digest = ?, ready_at = ?, temp_key = NULL
        WHERE id = 'snap-6'`,
    ).run(digest, Date.now());

    await d.blobs.removeBlob(storageKey);

    const report = await reconcileChatArtifactSnapshots(d);
    expect(report.blobMissing).toBe(1);
    const row = getChatArtifactSnapshot(d.db, 'snap-6');
    expect(row?.captureState).toBe('failed');
    expect(row?.failureCode).toBe('blob_missing');
    expect(getChatArtifactBlob(d.db, digest)).toBeNull();
  });

  it('sweeps stale temp files that no intent claims, and spares fresh ones', async () => {
    const d = deps();
    const staleKey = d.blobs.newTempKey();
    await d.blobs.writeTempFromBytes(staleKey, bytes('stale'));
    const freshKey = d.blobs.newTempKey();
    await d.blobs.writeTempFromBytes(freshKey, bytes('fresh'));
    const stalePath = d.blobs.resolveStorageKey(staleKey);
    const old = Date.now() - 24 * 60 * 60 * 1000;
    fs.utimesSync(stalePath, old / 1000, old / 1000);

    const report = await reconcileChatArtifactSnapshots({
      ...d,
      tempGraceMs: 60 * 60 * 1000,
    });
    expect(report.tempsSwept).toBe(1);
    const remaining = (await d.blobs.listTempEntries()).map((e) => e.key);
    expect(remaining).toEqual([freshKey]);
  });
});

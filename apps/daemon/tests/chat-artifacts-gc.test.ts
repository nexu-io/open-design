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
import { captureChatArtifactSnapshotFromBytes } from '../src/chat-artifacts/capture.js';
import { sweepChatArtifactStorage } from '../src/chat-artifacts/gc.js';
import {
  getChatArtifactBlob,
  getChatArtifactSnapshot,
  replaceMessageArtifacts,
} from '../src/chat-artifacts/store.js';

const bytes = (text: string) => Buffer.from(text, 'utf8');
const sha256 = (buf: Buffer) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;
const HOUR = 60 * 60 * 1000;

describe('chat artifact mark-sweep GC', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-gc-'));
    resetChatArtifactBlobStoreCache();
  });

  afterEach(() => {
    closeDatabase();
    resetChatArtifactBlobStoreCache();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function deps() {
    const db = openDatabase(dataDir, { dataDir });
    const blobs = createChatArtifactBlobStore({ dataDir });
    const now = Date.now();
    db.prepare(
      `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('proj-1', 'proj-1', now, now);
    db.prepare(
      `INSERT INTO conversations (id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('conv-1', 'proj-1', now, now);
    return { db, blobs };
  }

  function seedMessage(db: ReturnType<typeof openDatabase>, id: string, position: number) {
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, position, created_at)
       VALUES (?, 'conv-1', 'assistant', '', ?, ?)`,
    ).run(id, position, Date.now());
    return id;
  }

  function age(db: ReturnType<typeof openDatabase>, snapshotId: string, ms: number) {
    db.prepare(`UPDATE chat_artifact_snapshots SET created_at = created_at - ? WHERE id = ?`)
      .run(ms, snapshotId);
  }

  it('keeps a blob a live message still references', async () => {
    const d = deps();
    const message = seedMessage(d.db, 'msg-1', 0);
    const captured = await captureChatArtifactSnapshotFromBytes(d, {
      projectId: 'proj-1', projectRelativePath: 'hero.png', kind: 'image', bytes: bytes('keep'),
    });
    replaceMessageArtifacts(d.db, message, [{
      label: 'hero.png', kind: 'image',
      displayPolicy: 'immutable_snapshot',      snapshotId: captured.snapshotId,
    }]);
    age(d.db, captured.snapshotId, 48 * HOUR);

    // blobGraceMs: 0 makes the blob a genuine sweep candidate, so the ONLY
    // thing that can save it is the mark step finding the live reference.
    const report = await sweepChatArtifactStorage({ ...d, snapshotGraceMs: HOUR, blobGraceMs: 0 });
    expect(report.blobsSwept).toBe(0);
    expect(getChatArtifactBlob(d.db, sha256(bytes('keep')))).not.toBeNull();
    expect(getChatArtifactSnapshot(d.db, captured.snapshotId)).not.toBeNull();
  });

  it('reclaims a snapshot and its blob once no message references it and grace passed', async () => {
    const d = deps();
    const message = seedMessage(d.db, 'msg-1', 0);
    const captured = await captureChatArtifactSnapshotFromBytes(d, {
      projectId: 'proj-1', projectRelativePath: 'hero.png', kind: 'image', bytes: bytes('drop-me'),
    });
    replaceMessageArtifacts(d.db, message, [{
      label: 'hero.png', kind: 'image',
      displayPolicy: 'immutable_snapshot',      snapshotId: captured.snapshotId,
    }]);
    // Message delete drops the ref (FK cascade) but not the blob — GC does that.
    d.db.prepare(`DELETE FROM messages WHERE id = ?`).run(message);
    expect(getChatArtifactBlob(d.db, sha256(bytes('drop-me')))).not.toBeNull();

    age(d.db, captured.snapshotId, 48 * HOUR);
    const storageKey = getChatArtifactBlob(d.db, sha256(bytes('drop-me')))!.storageKey;

    const report = await sweepChatArtifactStorage({ ...d, snapshotGraceMs: HOUR, blobGraceMs: 0 });
    expect(report.snapshotsSwept).toBe(1);
    expect(report.blobsSwept).toBe(1);
    expect(report.bytesReclaimed).toBe(bytes('drop-me').byteLength);
    expect(getChatArtifactSnapshot(d.db, captured.snapshotId)).toBeNull();
    expect(await d.blobs.hasBlob(storageKey)).toBe(false);
  });

  it('spares an unreferenced snapshot that is still inside the grace window', async () => {
    const d = deps();
    const captured = await captureChatArtifactSnapshotFromBytes(d, {
      projectId: 'proj-1', projectRelativePath: 'fresh.png', kind: 'image', bytes: bytes('fresh'),
    });
    const report = await sweepChatArtifactStorage({ ...d, snapshotGraceMs: HOUR, blobGraceMs: 0 });
    expect(report.snapshotsSwept).toBe(0);
    // Grace spares the row, and the surviving row's mark spares its bytes.
    expect(report.blobsSwept).toBe(0);
    expect(getChatArtifactSnapshot(d.db, captured.snapshotId)).not.toBeNull();
  });

  it('keeps a shared blob alive while any one of its snapshots is still referenced', async () => {
    const d = deps();
    const m1 = seedMessage(d.db, 'msg-1', 0);
    const m2 = seedMessage(d.db, 'msg-2', 1);
    const payload = bytes('shared');
    const a = await captureChatArtifactSnapshotFromBytes(d, {
      projectId: 'proj-1', projectRelativePath: 'a.png', kind: 'image', bytes: payload,
    });
    const b = await captureChatArtifactSnapshotFromBytes(d, {
      projectId: 'proj-1', projectRelativePath: 'b.png', kind: 'image', bytes: payload,
    });
    replaceMessageArtifacts(d.db, m1, [{
      label: 'a.png', kind: 'image',
      displayPolicy: 'immutable_snapshot', snapshotId: a.snapshotId,
    }]);
    replaceMessageArtifacts(d.db, m2, [{
      label: 'b.png', kind: 'image',
      displayPolicy: 'immutable_snapshot', snapshotId: b.snapshotId,
    }]);
    d.db.prepare(`DELETE FROM messages WHERE id = ?`).run(m1);
    age(d.db, a.snapshotId, 48 * HOUR);
    age(d.db, b.snapshotId, 48 * HOUR);

    const report = await sweepChatArtifactStorage({ ...d, snapshotGraceMs: HOUR, blobGraceMs: 0 });
    expect(report.snapshotsSwept).toBe(1);
    // msg-2 still points at the same bytes: the blob must survive.
    expect(report.blobsSwept).toBe(0);
    expect(getChatArtifactBlob(d.db, sha256(payload))).not.toBeNull();
  });

  it('reclaims an orphan object file that no blob row claims', async () => {
    const d = deps();
    const orphanTemp = d.blobs.newTempKey();
    const written = await d.blobs.writeTempFromBytes(orphanTemp, bytes('orphan'));
    const key = await d.blobs.installTemp(orphanTemp, written.digest);
    // No chat_artifact_blobs row: a crash between install and the DB commit.
    const orphanPath = d.blobs.resolveStorageKey(key);
    const old = Date.now() - 48 * HOUR;
    fs.utimesSync(orphanPath, old / 1000, old / 1000);

    const report = await sweepChatArtifactStorage({ ...d, snapshotGraceMs: HOUR, blobGraceMs: HOUR });
    expect(report.orphanFilesSwept).toBe(1);
    expect(await d.blobs.hasBlob(key)).toBe(false);
  });

  it('dry run reports what it would reclaim without deleting anything', async () => {
    const d = deps();
    const captured = await captureChatArtifactSnapshotFromBytes(d, {
      projectId: 'proj-1', projectRelativePath: 'hero.png', kind: 'image', bytes: bytes('dry'),
    });
    age(d.db, captured.snapshotId, 48 * HOUR);

    const report = await sweepChatArtifactStorage({
      ...d, snapshotGraceMs: HOUR, blobGraceMs: 0, dryRun: true,
    });
    expect(report.snapshotsSwept).toBe(1);
    expect(report.blobsSwept).toBe(1);
    expect(getChatArtifactSnapshot(d.db, captured.snapshotId)).not.toBeNull();
    expect(getChatArtifactBlob(d.db, sha256(bytes('dry')))).not.toBeNull();
  });
});

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
import {
  captureChatArtifactSnapshotFromBytes,
  captureChatArtifactSnapshotFromPath,
} from '../src/chat-artifacts/capture.js';
import {
  getChatArtifactBlob,
  getChatArtifactSnapshot,
  listMessageArtifactRows,
  replaceMessageArtifacts,
} from '../src/chat-artifacts/store.js';

const bytes = (text: string) => Buffer.from(text, 'utf8');
const sha256 = (buf: Buffer) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;

describe('chat artifact capture (two-phase commit)', () => {
  let dataDir: string;
  let workDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-capture-data-'));
    workDir = mkdtempSync(path.join(os.tmpdir(), 'od-capture-work-'));
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
    return { db, blobs };
  }

  function seedProject(db: ReturnType<typeof openDatabase>, id = 'proj-1') {
    const now = Date.now();
    db.prepare(
      `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run(id, id, now, now);
    return id;
  }

  function seedMessage(
    db: ReturnType<typeof openDatabase>,
    projectId: string,
    messageId: string,
  ) {
    const now = Date.now();
    const conversationId = 'conv-1';
    const has = db.prepare(`SELECT id FROM conversations WHERE id = ?`).get(conversationId);
    if (!has) {
      db.prepare(
        `INSERT INTO conversations (id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      ).run(conversationId, projectId, now, now);
    }
    const position = (
      db.prepare(
        `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM messages WHERE conversation_id = ?`,
      ).get(conversationId) as { p: number }
    ).p;
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, position, created_at)
       VALUES (?, ?, 'assistant', '', ?, ?)`,
    ).run(messageId, conversationId, position, now);
    return messageId;
  }

  it('an overwritten image does not rewrite the earlier message snapshot', async () => {
    const d = deps();
    const projectId = seedProject(d.db);
    const first = bytes('image-A');
    const second = bytes('image-B');

    const a = await captureChatArtifactSnapshotFromBytes(d, {
      projectId,
      projectRelativePath: 'hero.png',
      kind: 'image',
      mime: 'image/png',
      bytes: first,
    });
    expect(a.state).toBe('ready');
    expect(a.contentDigest).toBe(sha256(first));

    const b = await captureChatArtifactSnapshotFromBytes(d, {
      projectId,
      projectRelativePath: 'hero.png',
      kind: 'image',
      mime: 'image/png',
      bytes: second,
    });
    expect(b.state).toBe('ready');
    expect(b.contentDigest).toBe(sha256(second));

    // Same workspace identity (path did not change), two distinct snapshots.
    expect(b.workspaceArtifactId).toBe(a.workspaceArtifactId);
    expect(b.snapshotId).not.toBe(a.snapshotId);

    const blobA = getChatArtifactBlob(d.db, sha256(first));
    expect(blobA).not.toBeNull();
    expect(await d.blobs.readBlob(blobA!.storageKey)).toEqual(first);
  });

  it('two messages with identical bytes share one blob and survive one deletion', async () => {
    const d = deps();
    const projectId = seedProject(d.db);
    const payload = bytes('same-bytes');
    const m1 = seedMessage(d.db, projectId, 'msg-1');
    const m2 = seedMessage(d.db, projectId, 'msg-2');

    const a = await captureChatArtifactSnapshotFromBytes(d, {
      projectId, projectRelativePath: 'a.png', kind: 'image', bytes: payload,
    });
    const b = await captureChatArtifactSnapshotFromBytes(d, {
      projectId, projectRelativePath: 'b.png', kind: 'image', bytes: payload,
    });
    expect(a.contentDigest).toBe(b.contentDigest);

    const blobCount = d.db
      .prepare(`SELECT COUNT(*) AS n FROM chat_artifact_blobs`)
      .get() as { n: number };
    expect(blobCount.n).toBe(1);

    replaceMessageArtifacts(d.db, m1, [{
      label: 'a.png', kind: 'image',
      displayPolicy: 'immutable_snapshot',      snapshotId: a.snapshotId,
    }]);
    replaceMessageArtifacts(d.db, m2, [{
      label: 'b.png', kind: 'image',
      displayPolicy: 'immutable_snapshot',      snapshotId: b.snapshotId,
    }]);

    d.db.prepare(`DELETE FROM messages WHERE id = ?`).run(m1);
    expect(listMessageArtifactRows(d.db, m1)).toHaveLength(0);
    // Deleting the message must NOT take the shared blob with it.
    expect(getChatArtifactBlob(d.db, a.contentDigest!)).not.toBeNull();
    expect(await d.blobs.hasBlob(getChatArtifactBlob(d.db, a.contentDigest!)!.storageKey)).toBe(true);
  });

  it('refuses to install new bytes when the source changed between intent and copy', async () => {
    const d = deps();
    const projectId = seedProject(d.db);
    const filePath = path.join(workDir, 'hero.png');
    fs.writeFileSync(filePath, bytes('original'));
    const original = fs.statSync(filePath);

    // The terminal chokepoint captured this fingerprint; the file has since
    // been overwritten by the next turn.
    fs.writeFileSync(filePath, bytes('rewritten-longer'));

    const result = await captureChatArtifactSnapshotFromPath(d, {
      projectId,
      projectRelativePath: 'hero.png',
      kind: 'image',
      absolutePath: filePath,
      expected: { size: original.size, mtimeMs: original.mtimeMs },
    });

    expect(result.state).toBe('failed');
    expect(result.failureCode).toBe('source_changed');
    // The newer bytes must never be installed as if they were the old ones.
    expect(getChatArtifactBlob(d.db, sha256(bytes('rewritten-longer')))).toBeNull();
    expect(await d.blobs.listTempEntries()).toHaveLength(0);
  });

  // The kind here used to be `html`, which no path capture has ever actually
  // been handed: `run-capture` only reaches this function for kinds whose
  // originals ARE the message evidence, and `html` is not one of them. The
  // fixture was a placeholder for "some file at a path". It is an image now so
  // it matches a record this function can really receive — the assertion under
  // test (the fingerprint precondition) is unchanged.
  it('captures from a path whose fingerprint still matches the expectation', async () => {
    const d = deps();
    const projectId = seedProject(d.db);
    const filePath = path.join(workDir, 'hero.png');
    fs.writeFileSync(filePath, bytes('png-v1'));
    const stat = fs.statSync(filePath);

    const result = await captureChatArtifactSnapshotFromPath(d, {
      projectId,
      projectRelativePath: 'hero.png',
      kind: 'image',
      absolutePath: filePath,
      expected: { size: stat.size, mtimeMs: stat.mtimeMs },
    });
    expect(result.state).toBe('ready');
    expect(result.contentDigest).toBe(sha256(bytes('png-v1')));
  });

  it('marks a missing source failed instead of inventing content', async () => {
    const d = deps();
    const projectId = seedProject(d.db);
    const result = await captureChatArtifactSnapshotFromPath(d, {
      projectId,
      projectRelativePath: 'gone.png',
      kind: 'image',
      absolutePath: path.join(workDir, 'gone.png'),
    });
    expect(result.state).toBe('failed');
    expect(result.failureCode).toBe('source_missing');
  });

  it('leaves no pending row and no temp file behind on the happy path', async () => {
    const d = deps();
    const projectId = seedProject(d.db);
    const result = await captureChatArtifactSnapshotFromBytes(d, {
      projectId, projectRelativePath: 'x.png', kind: 'image', bytes: bytes('x'),
    });
    const row = getChatArtifactSnapshot(d.db, result.snapshotId);
    expect(row?.captureState).toBe('ready');
    expect(row?.tempKey).toBeNull();
    expect(row?.readyAt).toBeTruthy();
    expect(await d.blobs.listTempEntries()).toHaveLength(0);
  });

  it('fails the snapshot rather than the turn when a single blob exceeds its cap', async () => {
    const d = deps();
    const projectId = seedProject(d.db);
    const result = await captureChatArtifactSnapshotFromBytes(
      { ...d, quota: { perBlobMaxBytes: 4, thumbnailMaxBytes: 4, projectMaxBytes: 1024, totalMaxBytes: 1024 } },
      { projectId, projectRelativePath: 'big.png', kind: 'image', bytes: bytes('way too long') },
    );
    expect(result.state).toBe('failed');
    expect(result.failureCode).toBe('too_large');
    expect(await d.blobs.listTempEntries()).toHaveLength(0);
  });

  it('fails with quota_exceeded once the project budget is spent', async () => {
    const d = deps();
    const projectId = seedProject(d.db);
    const quota = {
      perBlobMaxBytes: 1024,
      thumbnailMaxBytes: 1024,
      projectMaxBytes: 12,
      totalMaxBytes: 1024 * 1024,
    };
    const first = await captureChatArtifactSnapshotFromBytes(
      { ...d, quota },
      { projectId, projectRelativePath: 'a.png', kind: 'image', bytes: bytes('0123456789') },
    );
    expect(first.state).toBe('ready');

    const second = await captureChatArtifactSnapshotFromBytes(
      { ...d, quota },
      { projectId, projectRelativePath: 'b.png', kind: 'image', bytes: bytes('abcdefghij') },
    );
    expect(second.state).toBe('failed');
    expect(second.failureCode).toBe('quota_exceeded');
  });
});

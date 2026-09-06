import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDatabase, openDatabase } from '../src/db.js';
import {
  deleteWorkspaceArtifact,
  ensureWorkspaceArtifactForPath,
  getWorkspaceArtifact,
  listMessageArtifactRows,
  renameWorkspaceArtifactPath,
  replaceMessageArtifacts,
} from '../src/chat-artifacts/store.js';

describe('chat artifact schema', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-chat-artifacts-store-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function open() {
    return openDatabase(tempDir, { dataDir: tempDir });
  }

  function seedProject(db: ReturnType<typeof open>, id = 'proj-1') {
    const now = Date.now();
    db.prepare(
      `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run(id, id, now, now);
    return id;
  }

  function seedMessage(
    db: ReturnType<typeof open>,
    projectId: string,
    conversationId = 'conv-1',
    messageId = 'msg-1',
  ) {
    const now = Date.now();
    const existing = db
      .prepare(`SELECT id FROM conversations WHERE id = ?`)
      .get(conversationId) as { id?: string } | undefined;
    if (!existing) {
      db.prepare(
        `INSERT INTO conversations (id, project_id, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      ).run(conversationId, projectId, now, now);
    }
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, position, created_at)
       VALUES (?, ?, 'assistant', '', 0, ?)`,
    ).run(messageId, conversationId, now);
    return messageId;
  }

  it('creates the four additive tables without touching produced_files_json', () => {
    const db = open();
    const names = new Set(
      (db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
        .all() as Array<{ name: string }>).map((r) => r.name),
    );
    expect(names.has('workspace_artifacts')).toBe(true);
    expect(names.has('chat_artifact_blobs')).toBe(true);
    expect(names.has('chat_artifact_snapshots')).toBe(true);
    expect(names.has('message_artifacts')).toBe(true);

    const messageCols = (db
      .prepare(`PRAGMA table_info(messages)`)
      .all() as Array<{ name: string }>).map((c) => c.name);
    // The legacy column stays exactly as it was: additive migration only.
    expect(messageCols).toContain('produced_files_json');
  });

  it('is re-runnable: a second open over the same file is a no-op', () => {
    const first = open();
    const projectId = seedProject(first);
    const artifact = ensureWorkspaceArtifactForPath(first, {
      projectId,
      path: 'hero.png',
      kind: 'image',
      mime: 'image/png',
    });
    closeDatabase();

    const second = open();
    expect(getWorkspaceArtifact(second, artifact.id)?.currentPath).toBe('hero.png');
    // Re-running the migration must not duplicate or drop rows.
    const count = second
      .prepare(`SELECT COUNT(*) AS n FROM workspace_artifacts`)
      .get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('gives the same path one stable identity and a new identity after delete', () => {
    const db = open();
    const projectId = seedProject(db);
    const first = ensureWorkspaceArtifactForPath(db, {
      projectId,
      path: 'hero.png',
      kind: 'image',
      mime: 'image/png',
    });
    const again = ensureWorkspaceArtifactForPath(db, {
      projectId,
      path: 'hero.png',
      kind: 'image',
      mime: 'image/png',
    });
    expect(again.id).toBe(first.id);

    deleteWorkspaceArtifact(db, projectId, 'hero.png');
    const tombstoned = getWorkspaceArtifact(db, first.id);
    expect(tombstoned?.deletedAt).toBeTruthy();
    expect(tombstoned?.currentPath).toBeNull();

    // A brand new file at the same path is NOT the deleted identity.
    const reborn = ensureWorkspaceArtifactForPath(db, {
      projectId,
      path: 'hero.png',
      kind: 'image',
      mime: 'image/png',
    });
    expect(reborn.id).not.toBe(first.id);
  });

  it('rename moves the identity to the new path', () => {
    const db = open();
    const projectId = seedProject(db);
    const created = ensureWorkspaceArtifactForPath(db, {
      projectId,
      path: 'old.html',
      kind: 'html',
      mime: 'text/html',
    });
    renameWorkspaceArtifactPath(db, projectId, 'old.html', 'new.html');
    expect(getWorkspaceArtifact(db, created.id)?.currentPath).toBe('new.html');
  });

  it('cascades message artifact refs when the message row is deleted', () => {
    const db = open();
    const projectId = seedProject(db);
    const messageId = seedMessage(db, projectId);
    const artifact = ensureWorkspaceArtifactForPath(db, {
      projectId,
      path: 'hero.png',
      kind: 'image',
      mime: 'image/png',
    });
    replaceMessageArtifacts(db, messageId, [
      {
        label: 'hero.png',
        kind: 'image',
        displayPolicy: 'immutable_snapshot',
        workspaceArtifactId: artifact.id,
      },
    ]);
    expect(listMessageArtifactRows(db, messageId)).toHaveLength(1);

    db.prepare(`DELETE FROM messages WHERE id = ?`).run(messageId);
    expect(listMessageArtifactRows(db, messageId)).toHaveLength(0);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDatabase, openDatabase } from '../src/db.js';
import {
  createChatArtifactBlobStore,
  resetChatArtifactBlobStoreCache,
} from '../src/chat-artifacts/blob-store.js';
import { captureChatArtifactSnapshotFromBytes } from '../src/chat-artifacts/capture.js';
import {
  attachChatArtifactThumbnail,
  captureRunChatArtifactSnapshots,
} from '../src/chat-artifacts/run-capture.js';
import { projectChatArtifactRefs } from '../src/chat-artifacts/refs.js';
import {
  deleteWorkspaceArtifact,
  getChatArtifactSnapshot,
  renameWorkspaceArtifactPath,
} from '../src/chat-artifacts/store.js';

/** The digest is a diagnostic, not card data: read it from the snapshot row. */
function snapshotDigest(db: ReturnType<typeof openDatabase>, snapshotId: string) {
  return getChatArtifactSnapshot(db, snapshotId)?.contentDigest;
}

const bytes = (text: string) => Buffer.from(text, 'utf8');
const sha256 = (buf: Buffer) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;

describe('run terminal chat artifact capture', () => {
  let dataDir: string;
  let projectRoot: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-runcap-data-'));
    projectRoot = mkdtempSync(path.join(os.tmpdir(), 'od-runcap-proj-'));
    resetChatArtifactBlobStoreCache();
  });

  afterEach(() => {
    closeDatabase();
    resetChatArtifactBlobStoreCache();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
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
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, position, created_at)
       VALUES ('msg-1', 'conv-1', 'assistant', '', 0, ?)`,
    ).run(now);
    return { db, blobs };
  }

  function writeProjectFile(rel: string, content: Buffer): string {
    const abs = path.join(projectRoot, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    return abs;
  }

  it('gives an image the immutable-snapshot policy and HTML the latest policy', async () => {
    const d = deps();
    writeProjectFile('hero.png', bytes('png-bytes'));
    writeProjectFile('page.html', bytes('<html>v1</html>'));

    await captureRunChatArtifactSnapshots(d, {
      projectId: 'proj-1',
      projectRoot,
      messageId: 'msg-1',
      runId: 'run-1',
      touchedPaths: [path.join(projectRoot, 'hero.png'), path.join(projectRoot, 'page.html')],
    });

    const refs = projectChatArtifactRefs(d.db, 'proj-1', 'msg-1');
    const image = refs.find((r) => r.label === 'hero.png');
    const html = refs.find((r) => r.label === 'page.html');

    expect(image?.displayPolicy).toBe('immutable_snapshot');
    expect(image?.snapshotState).toBe('ready');
    // The click target is the workspace file, for images exactly as for HTML
    // (user ruling 2026-09-02). The ref names it and nothing else.
    expect(image?.workspaceArtifactId).toBeTruthy();
    expect(image).not.toHaveProperty('openPolicy');
    expect(image?.snapshotUrl)
      .toBe(`/api/projects/proj-1/chat-artifact-snapshots/${image?.snapshotId}/content`);

    expect(html?.displayPolicy).toBe('latest_with_static_preview');
    expect(html?.workspaceArtifactId).toBeTruthy();
    // No cover was rendered. The ref reports that plainly and hands out no
    // URL, which is the client's cue to fall back to a live latest preview.
    expect(html?.thumbnailUrl).toBeUndefined();
    expect(html?.snapshotUrl).toBeUndefined();
    expect(html?.snapshotState).toBe('legacy_unavailable');
  });

  it('reuses the exact provider bytes the media path already captured', async () => {
    const d = deps();
    const provider = bytes('exact-provider-bytes');
    // Strong path: media captured the bytes it was about to write.
    const strong = await captureChatArtifactSnapshotFromBytes(d, {
      projectId: 'proj-1',
      projectRelativePath: 'hero.png',
      kind: 'image',
      bytes: provider,
      runId: 'run-1',
      mediaTaskId: 'task-1',
    });
    // The file on disk has ALREADY been overwritten by the next turn.
    writeProjectFile('hero.png', bytes('a-totally-different-image'));

    await captureRunChatArtifactSnapshots(d, {
      projectId: 'proj-1',
      projectRoot,
      messageId: 'msg-1',
      runId: 'run-1',
      touchedPaths: [path.join(projectRoot, 'hero.png')],
    });

    const refs = projectChatArtifactRefs(d.db, 'proj-1', 'msg-1');
    expect(refs).toHaveLength(1);
    expect(refs[0]?.snapshotId).toBe(strong.snapshotId);
    expect(snapshotDigest(d.db, refs[0]!.snapshotId!)).toBe(sha256(provider));
  });

  it('does not let one run reuse another run snapshot of the same path', async () => {
    const d = deps();
    const older = bytes('older-run-bytes');
    await captureChatArtifactSnapshotFromBytes(d, {
      projectId: 'proj-1',
      projectRelativePath: 'hero.png',
      kind: 'image',
      bytes: older,
      runId: 'run-0',
    });
    writeProjectFile('hero.png', bytes('this-run-bytes'));

    await captureRunChatArtifactSnapshots(d, {
      projectId: 'proj-1',
      projectRoot,
      messageId: 'msg-1',
      runId: 'run-1',
      touchedPaths: [path.join(projectRoot, 'hero.png')],
    });

    const refs = projectChatArtifactRefs(d.db, 'proj-1', 'msg-1');
    expect(snapshotDigest(d.db, refs[0]!.snapshotId!)).toBe(sha256(bytes('this-run-bytes')));
  });

  it('refuses paths that escape the project root', async () => {
    const d = deps();
    const outside = path.join(os.tmpdir(), 'od-runcap-outside.png');
    fs.writeFileSync(outside, bytes('outside'));
    try {
      await captureRunChatArtifactSnapshots(d, {
        projectId: 'proj-1',
        projectRoot,
        messageId: 'msg-1',
        runId: 'run-1',
        touchedPaths: [outside],
      });
      expect(projectChatArtifactRefs(d.db, 'proj-1', 'msg-1')).toHaveLength(0);
    } finally {
      rmSync(outside, { force: true });
    }
  });

  it('an HTML ref follows a rename; an image ref stays on its snapshot', async () => {
    const d = deps();
    writeProjectFile('hero.png', bytes('image-v1'));
    writeProjectFile('page.html', bytes('<html>v1</html>'));
    await captureRunChatArtifactSnapshots(d, {
      projectId: 'proj-1',
      projectRoot,
      messageId: 'msg-1',
      runId: 'run-1',
      touchedPaths: [path.join(projectRoot, 'hero.png'), path.join(projectRoot, 'page.html')],
    });

    renameWorkspaceArtifactPath(d.db, 'proj-1', 'page.html', 'renamed.html');
    deleteWorkspaceArtifact(d.db, 'proj-1', 'hero.png');

    const refs = projectChatArtifactRefs(d.db, 'proj-1', 'msg-1');
    const html = refs.find((r) => r.label === 'page.html');
    const image = refs.find((r) => r.label === 'hero.png');
    // Label is capture-time history and never moves.
    expect(html?.label).toBe('page.html');
    expect(html?.workspaceArtifactId).toBeTruthy();
    // Deleting the workspace file does not disturb the image's frozen bytes.
    expect(image?.snapshotState).toBe('ready');
    expect(image?.snapshotUrl).toContain('/chat-artifact-snapshots/');
  });

  it('attaches a rendered cover to an HTML ref and reports it ready', async () => {
    const d = deps();
    writeProjectFile('page.html', bytes('<html>v1</html>'));
    await captureRunChatArtifactSnapshots(d, {
      projectId: 'proj-1',
      projectRoot,
      messageId: 'msg-1',
      runId: 'run-1',
      touchedPaths: [path.join(projectRoot, 'page.html')],
    });
    const before = projectChatArtifactRefs(d.db, 'proj-1', 'msg-1')[0];
    expect(before?.thumbnailUrl).toBeUndefined();

    const cover = bytes('fake-png-cover');
    const attached = await attachChatArtifactThumbnail(d, {
      messageArtifactId: before!.id,
      bytes: cover,
      mime: 'image/png',
    });
    expect(attached.state).toBe('ready');

    const after = projectChatArtifactRefs(d.db, 'proj-1', 'msg-1')[0];
    expect(after?.snapshotState).toBe('ready');
    expect(after?.thumbnailUrl)
      .toBe(`/api/projects/proj-1/chat-artifact-snapshots/${after?.snapshotId}/thumbnail`);
    // A cover changes what the card DRAWS, never what it opens.
    expect(after?.workspaceArtifactId).toBeTruthy();
  });
});

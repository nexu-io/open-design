// Which kinds get their ORIGINAL bytes frozen into the snapshot store.
//
// USER RULING 2026-09-02: 「视频音频先不存快照了」. Video and audio are OUT of the
// immutable-original class; image and sketch stay in.
//
// This is a product ruling, not a capability regression: the store can hold a
// video perfectly well. It is a capacity ruling. One blob is capped at 64 MiB
// and one project at 2 GiB (`quota.ts`), so a handful of video iterations can
// exhaust a project's budget — and an exhausted budget fails the WHOLE batch's
// captures with `quota_exceeded`, so a kind nobody ruled on would have been
// evicting the image semantics that were ruled on.
//
// The three things this file pins, because they can regress independently:
//
//   1. The run-terminal pass gives video/audio the latest-with-preview policy
//      and writes no snapshot.
//   2. The CAPTURE CHOKEPOINT itself refuses to store their original bytes.
//      This half is not redundant with (1): `routes/media.ts` freezes provider
//      bytes through `captureChatArtifactSnapshotFromBytes` WITHOUT consulting
//      the policy, so a display-policy-only change would have left every
//      generated video in the blob store while the cards claimed otherwise.
//   3. The counter-control: images still snapshot, and HTML covers still
//      attach. The gate is per-kind and per-role, not an off switch.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
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
import { reconcileChatArtifactSnapshots } from '../src/chat-artifacts/reconcile.js';
import {
  attachChatArtifactThumbnail,
  captureRunChatArtifactSnapshots,
} from '../src/chat-artifacts/run-capture.js';
import { projectChatArtifactRefs } from '../src/chat-artifacts/refs.js';
import {
  getChatArtifactSnapshot,
  getLiveWorkspaceArtifactByPath,
  insertSnapshotIntent,
} from '../src/chat-artifacts/store.js';
import { totalSnapshotBytes } from '../src/chat-artifacts/quota.js';

const bytes = (text: string) => Buffer.from(text, 'utf8');

describe('video and audio are not immutable originals (user ruling 2026-09-02)', () => {
  let dataDir: string;
  let projectRoot: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-mediakind-data-'));
    projectRoot = mkdtempSync(path.join(os.tmpdir(), 'od-mediakind-proj-'));
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

  function countSnapshots(db: ReturnType<typeof openDatabase>, projectRelativePath: string) {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM chat_artifact_snapshots WHERE source_path_at_capture = ?`,
      )
      .get(projectRelativePath) as { n: number };
    return row.n;
  }

  it('gives a run-produced video and audio the latest policy and stores no bytes', async () => {
    const d = deps();
    writeProjectFile('clip.mp4', bytes('mp4-bytes'));
    writeProjectFile('voice.mp3', bytes('mp3-bytes'));

    await captureRunChatArtifactSnapshots(d, {
      projectId: 'proj-1',
      projectRoot,
      messageId: 'msg-1',
      runId: 'run-1',
      touchedPaths: [path.join(projectRoot, 'clip.mp4'), path.join(projectRoot, 'voice.mp3')],
    });

    const refs = projectChatArtifactRefs(d.db, 'proj-1', 'msg-1');
    const video = refs.find((r) => r.label === 'clip.mp4');
    const audio = refs.find((r) => r.label === 'voice.mp3');

    for (const ref of [video, audio]) {
      expect(ref?.displayPolicy).toBe('latest_with_static_preview');
      expect(ref?.snapshotId).toBeUndefined();
      expect(ref?.snapshotUrl).toBeUndefined();
      expect(ref?.thumbnailUrl).toBeUndefined();
      // No capture was ever attempted, which is `legacy_unavailable`, not
      // `failed`. Calling it a failure would put a real render/quota failure
      // and a deliberate product exclusion in the same bucket.
      expect(ref?.snapshotState).toBe('legacy_unavailable');
      // The card still opens the workspace's latest file — the ruling removed
      // the frozen copy, not the identity the click needs.
      expect(ref?.workspaceArtifactId).toBeTruthy();
    }

    expect(countSnapshots(d.db, 'clip.mp4')).toBe(0);
    expect(countSnapshots(d.db, 'voice.mp3')).toBe(0);
    expect(totalSnapshotBytes(d.db)).toBe(0);
  });

  it('refuses to freeze provider video bytes at the capture chokepoint', async () => {
    const d = deps();
    const provider = bytes('sixty-megabytes-of-mp4-pretend');

    // This is the shape `routes/media.ts#onBytesWritten` uses. It does not ask
    // the policy first, so the gate has to live here or it does not exist.
    const result = await captureChatArtifactSnapshotFromBytes(d, {
      projectId: 'proj-1',
      projectRelativePath: 'clip.mp4',
      kind: 'video',
      mime: 'video/mp4',
      bytes: provider,
      runId: 'run-1',
      mediaTaskId: 'task-1',
      sourceMtime: 1_700_000_000_000,
    });

    expect(result.state).toBe('skipped');
    expect(countSnapshots(d.db, 'clip.mp4')).toBe(0);
    expect(totalSnapshotBytes(d.db)).toBe(0);

    // Design Files still learns what it holds. Dropping the copy must not drop
    // the mutable latest pointer the card's click resolves through.
    const workspace = getLiveWorkspaceArtifactByPath(d.db, 'proj-1', 'clip.mp4');
    expect(workspace?.id).toBe(result.workspaceArtifactId);
    expect(workspace?.currentSize).toBe(provider.byteLength);
  });

  it('refuses audio bytes at the chokepoint too', async () => {
    const d = deps();
    const result = await captureChatArtifactSnapshotFromBytes(d, {
      projectId: 'proj-1',
      projectRelativePath: 'voice.mp3',
      kind: 'audio',
      mime: 'audio/mpeg',
      bytes: bytes('mp3-provider-bytes'),
      runId: 'run-1',
    });

    expect(result.state).toBe('skipped');
    expect(countSnapshots(d.db, 'voice.mp3')).toBe(0);
    expect(totalSnapshotBytes(d.db)).toBe(0);
  });

  it('refuses a video at the path chokepoint too', async () => {
    const d = deps();
    const abs = writeProjectFile('clip.mp4', bytes('mp4-on-disk'));

    const result = await captureChatArtifactSnapshotFromPath(d, {
      projectId: 'proj-1',
      projectRelativePath: 'clip.mp4',
      kind: 'video',
      absolutePath: abs,
    });

    expect(result.state).toBe('skipped');
    expect(countSnapshots(d.db, 'clip.mp4')).toBe(0);
    expect(totalSnapshotBytes(d.db)).toBe(0);
  });

  it('retires a residual pending video intent instead of re-capturing it', async () => {
    // The dev-DB case. A build that still stored video crashed mid-capture and
    // left a pending path intent behind; this build boots and reconciles it.
    // Recovery must NOT finish it — that would reinstall the exact bytes the
    // ruling just excluded, on the one path that runs before anyone is looking.
    const d = deps();
    const abs = writeProjectFile('clip.mp4', bytes('mp4-on-disk'));
    const stat = fs.statSync(abs);
    insertSnapshotIntent(d.db, {
      id: 'residual-video',
      projectId: 'proj-1',
      sourcePathAtCapture: 'clip.mp4',
      kind: 'video',
      expectedSize: stat.size,
      expectedMtime: stat.mtimeMs,
      expectedDigest: null,
      tempKey: d.blobs.newTempKey(),
    });

    const report = await reconcileChatArtifactSnapshots({
      ...d,
      resolveSourcePath: () => abs,
    });

    expect(report.completed).toBe(0);
    const row = getChatArtifactSnapshot(d.db, 'residual-video');
    // Terminal, so the GC can sweep it; and honestly labelled — nothing failed,
    // the kind is simply not stored any more.
    expect(row?.captureState).toBe('failed');
    expect(row?.failureCode).toBe('not_captured');
    expect(totalSnapshotBytes(d.db)).toBe(0);
    // No second row left behind for the sweeper to reason about.
    expect(countSnapshots(d.db, 'clip.mp4')).toBe(1);
  });

  // ---- counter-controls: the gate is per-kind, not an off switch ----------

  it('still snapshots an image original in the same run', async () => {
    const d = deps();
    writeProjectFile('hero.png', bytes('png-bytes'));
    writeProjectFile('clip.mp4', bytes('mp4-bytes'));

    await captureRunChatArtifactSnapshots(d, {
      projectId: 'proj-1',
      projectRoot,
      messageId: 'msg-1',
      runId: 'run-1',
      touchedPaths: [path.join(projectRoot, 'hero.png'), path.join(projectRoot, 'clip.mp4')],
    });

    const refs = projectChatArtifactRefs(d.db, 'proj-1', 'msg-1');
    const image = refs.find((r) => r.label === 'hero.png');
    expect(image?.displayPolicy).toBe('immutable_snapshot');
    expect(image?.snapshotState).toBe('ready');
    expect(image?.snapshotUrl).toContain('/chat-artifact-snapshots/');
    expect(countSnapshots(d.db, 'hero.png')).toBe(1);
    // Only the image's bytes are in the store; the video's are not.
    expect(totalSnapshotBytes(d.db)).toBe(bytes('png-bytes').byteLength);
  });

  it('still freezes provider image bytes at the chokepoint', async () => {
    const d = deps();
    const result = await captureChatArtifactSnapshotFromBytes(d, {
      projectId: 'proj-1',
      projectRelativePath: 'hero.png',
      kind: 'image',
      mime: 'image/png',
      bytes: bytes('provider-png'),
      runId: 'run-1',
    });
    expect(result.state).toBe('ready');
    expect(result.byteSize).toBe(bytes('provider-png').byteLength);
    expect(countSnapshots(d.db, 'hero.png')).toBe(1);
  });

  it('still snapshots a sketch original', async () => {
    const d = deps();
    writeProjectFile('diagram.svg', bytes('<svg/>'));
    await captureRunChatArtifactSnapshots(d, {
      projectId: 'proj-1',
      projectRoot,
      messageId: 'msg-1',
      runId: 'run-1',
      touchedPaths: [path.join(projectRoot, 'diagram.svg')],
    });
    const ref = projectChatArtifactRefs(d.db, 'proj-1', 'msg-1')[0];
    expect(ref?.kind).toBe('sketch');
    expect(ref?.displayPolicy).toBe('immutable_snapshot');
    expect(ref?.snapshotState).toBe('ready');
  });

  it('still attaches an HTML cover — the gate is on originals, not on covers', async () => {
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

    // `html` also has `capturesContent: false`. A gate that keyed on kind alone
    // would silently kill every HTML card's cover, which is why it keys on the
    // capture ROLE as well.
    const attached = await attachChatArtifactThumbnail(d, {
      messageArtifactId: before!.id,
      bytes: bytes('fake-png-cover'),
      mime: 'image/png',
    });
    expect(attached.state).toBe('ready');

    const after = projectChatArtifactRefs(d.db, 'proj-1', 'msg-1')[0];
    expect(after?.thumbnailUrl).toContain('/chat-artifact-snapshots/');
  });
});

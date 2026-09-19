import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  PreviewDocumentSnapshotStore,
  PreviewDocumentVersionChangedError,
} from '../../src/http/preview-document-snapshot.js';

function versionOf(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

describe('PreviewDocumentSnapshotStore', () => {
  let root = '';
  let sourcePath = '';

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-preview-snapshot-'));
    sourcePath = path.join(root, 'index.html');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('retries when the source changes after the candidate copy and returns one exact version', async () => {
    const first = '<main>AAAA</main>';
    const second = '<main>BBBB</main>';
    await writeFile(sourcePath, first);
    let candidates = 0;
    const store = new PreviewDocumentSnapshotStore({
      rootDir: path.join(root, 'snapshots'),
      afterCandidateCaptured: async () => {
        candidates += 1;
        if (candidates === 1) await writeFile(sourcePath, second);
      },
    });

    const snapshot = await store.captureFile(sourcePath);
    try {
      expect(candidates).toBe(2);
      expect(await readFile(snapshot.filePath, 'utf8')).toBe(second);
      expect(snapshot.documentVersion).toBe(versionOf(second));
      expect(snapshot.size).toBe(Buffer.byteLength(second));
    } finally {
      await snapshot.release();
    }
  });

  it('uses content identity even when a same-size rewrite restores mtime', async () => {
    const first = '<main>AAAA</main>';
    const second = '<main>BBBB</main>';
    await writeFile(sourcePath, first);
    const original = await stat(sourcePath);
    let candidates = 0;
    const store = new PreviewDocumentSnapshotStore({
      rootDir: path.join(root, 'snapshots'),
      afterCandidateCaptured: async () => {
        candidates += 1;
        if (candidates !== 1) return;
        await writeFile(sourcePath, second);
        await utimes(sourcePath, original.atime, original.mtime);
      },
    });

    const snapshot = await store.captureFile(sourcePath);
    try {
      expect(candidates).toBe(2);
      expect(await readFile(snapshot.filePath, 'utf8')).toBe(second);
      expect(snapshot.documentVersion).toBe(versionOf(second));
    } finally {
      await snapshot.release();
    }
  });

  it('fails with VERSION_CHANGED when the source never stabilizes', async () => {
    await writeFile(sourcePath, '<main>v0</main>');
    let version = 0;
    const store = new PreviewDocumentSnapshotStore({
      rootDir: path.join(root, 'snapshots'),
      maxAttempts: 2,
      afterCandidateCaptured: async () => {
        version += 1;
        await writeFile(sourcePath, `<main>v${version}</main>`);
      },
    });

    const error = await store.captureFile(sourcePath).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(PreviewDocumentVersionChangedError);
    expect(error).toMatchObject({ code: 'VERSION_CHANGED' });
  });

  it('stabilizes a bounded transformed representation without retaining the wrong candidate', async () => {
    let reads = 0;
    const store = new PreviewDocumentSnapshotStore({
      rootDir: path.join(root, 'snapshots'),
      maxAttempts: 2,
    });

    const snapshot = await store.captureBuffer(async () => {
      reads += 1;
      return Buffer.from(reads === 1 ? '<main>old dist</main>' : '<main>new dist</main>');
    });
    try {
      expect(reads).toBe(4);
      expect(await readFile(snapshot.filePath, 'utf8')).toBe('<main>new dist</main>');
      expect(snapshot.documentVersion).toBe(versionOf('<main>new dist</main>'));
    } finally {
      await snapshot.release();
    }
  });

  it('serves an expected file version from its captured bytes without rereading the source', async () => {
    const html = '<main>expected version</main>';
    await writeFile(sourcePath, html);
    let candidates = 0;
    const store = new PreviewDocumentSnapshotStore({
      rootDir: path.join(root, 'snapshots'),
      afterCandidateCaptured: async () => {
        candidates += 1;
        await rm(sourcePath);
      },
    });

    const snapshot = await store.captureFile(sourcePath, {
      expectedDocumentVersion: versionOf(html),
    });
    try {
      expect(candidates).toBe(1);
      expect(await readFile(snapshot.filePath, 'utf8')).toBe(html);
      expect(snapshot.documentVersion).toBe(versionOf(html));
    } finally {
      await snapshot.release();
    }
  });

  it('loads an expected transformed version once and keeps that exact response body', async () => {
    const html = '<main>expected transformed version</main>';
    let reads = 0;
    const store = new PreviewDocumentSnapshotStore({
      rootDir: path.join(root, 'snapshots'),
    });

    const snapshot = await store.captureBuffer(async () => {
      reads += 1;
      return html;
    }, {
      expectedDocumentVersion: versionOf(html),
    });
    try {
      expect(reads).toBe(1);
      expect(await readFile(snapshot.filePath, 'utf8')).toBe(html);
      expect(snapshot.documentVersion).toBe(versionOf(html));
    } finally {
      await snapshot.release();
    }
  });

  it('removes a mismatched expected-version candidate before rejecting the request', async () => {
    const snapshotsDir = path.join(root, 'snapshots');
    await writeFile(sourcePath, '<main>current</main>');
    const store = new PreviewDocumentSnapshotStore({ rootDir: snapshotsDir });

    const error = await store.captureFile(sourcePath, {
      expectedDocumentVersion: versionOf('<main>stale</main>'),
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(PreviewDocumentVersionChangedError);
    expect(await readdir(snapshotsDir)).toEqual([]);
  });

  it('removes request snapshots after release', async () => {
    await writeFile(sourcePath, '<main>stable</main>');
    const store = new PreviewDocumentSnapshotStore({
      rootDir: path.join(root, 'snapshots'),
    });

    const snapshot = await store.captureFile(sourcePath);
    await snapshot.release();

    await expect(stat(snapshot.filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('makes concurrent release calls idempotent', async () => {
    await writeFile(sourcePath, '<main>stable</main>');
    const store = new PreviewDocumentSnapshotStore({
      rootDir: path.join(root, 'snapshots'),
    });

    const snapshot = await store.captureFile(sourcePath);
    await Promise.all([snapshot.release(), snapshot.release(), snapshot.release()]);

    await expect(stat(snapshot.filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

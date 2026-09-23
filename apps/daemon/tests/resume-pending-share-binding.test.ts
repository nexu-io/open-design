import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { createShareBindingOutbox } from '../src/collab/share-binding-outbox.js';
import { resumePendingShareBinding } from '../src/collab/resume-pending-share-binding.js';
import { sharePublishResponse } from '../src/collab/share-publish-response.js';

it.each(['bound', 'failed', 'stale', 'other-owner'])('binding-only retry preserves the immutable receipt and witness: %s', async mode => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db);
    const store = createSqlitePublicFilePublicationStore(db);
    const outbox = createShareBindingOutbox(db);
    const scope = { resourceTeamId: 'w', ownerMemberId: 'author', projectId: 'p', filePath: 'index.html' };
    const receipt = { filePath: 'index.html', slug: '881e4899-53ed-4cd5-8dd3-25f3772f8ecd', version: 2, versionId: 'file-version-2', publishedAt: 1, entryPath: 'index.html' };
    const publication = { url: null, slug: receipt.slug, fileName: receipt.filePath };
    store.set(scope, publication);
    const witness = store.getRevision(scope)!;
    outbox.enqueue({ ...scope, ...(mode === 'other-owner' ? { ownerMemberId: 'other' } : {}), resourceId: 'file-resource', publicationRevision: witness.token, receipt });
    if (mode === 'stale') store.set(scope, publication);
    const before = store.getRevision(scope);
    const run = vi.fn(async (_args: string[]) => {
      if (mode === 'failed') throw new Error('unavailable');
      return JSON.stringify({ status: 'active', projectId: 'p', slug: receipt.slug, verifiedVersion: 2, verifiedVersionId: 'file-version-2' });
    });
    const result = await resumePendingShareBinding(scope, store, outbox, run);
    expect(store.getRevision(scope)).toEqual(before);
    if (mode === 'stale' || mode === 'other-owner') {
      expect(result).toBeNull(); expect(run).not.toHaveBeenCalled(); expect(outbox.list()).toHaveLength(1);
    } else {
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0]![0]).toEqual(['share', 'bind', receipt.slug, '--project-id', 'p', '--source-file-path', 'index.html', '--resource-id', 'file-resource', '--version', '2', '--version-id', 'file-version-2', '--json']);
      expect(result).toMatchObject({ status: mode === 'bound' ? 'published' : 'binding_pending', receipt });
      expect(outbox.list()).toHaveLength(mode === 'bound' ? 0 : 1);
      if (mode === 'failed') expect(outbox.list()[0]!.failureCount).toBe(2);
      expect(sharePublishResponse(result!, 'http://localhost:5173/artifact/p/' + receipt.slug)).toMatchObject({ url: 'http://localhost:5173/artifact/p/' + receipt.slug, receipt });
      expect(sharePublishResponse(result!, null)).toMatchObject({ link: { status: 'unavailable', code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' }, receipt });
    }
  } finally { db.close(); }
});

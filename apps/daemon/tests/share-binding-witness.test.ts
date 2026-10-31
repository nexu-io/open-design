import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { migrateCommentRelayOutbox } from '../src/collab/comment-relay-outbox.js';
import { createShareBindingOutbox } from '../src/collab/share-binding-outbox.js';
import { createShareBindingStartup } from '../src/collab/share-binding-startup.js';
import { createPublicFileMutations } from '../src/collab/public-file-mutations.js';
const scope = { resourceTeamId: 'team', ownerMemberId: 'owner', projectId: 'project', filePath: 'index.html' };
const publication = { slug: 'stable', url: 'https://example.test/stable', fileName: 'index.html' };
it.each(['same', 'republished', 'deleted', 'owner', 'workspace', 'slug', 'empty-revision', 'during-prepare', 'during-response'] as const)('checks real persisted publication witness after restart: %s', async mode => {
  const dir = mkdtempSync(join(tmpdir(), 'od-binding-witness-')); const file = join(dir, 'db.sqlite');
  let db = new Database(file);
  try {
    migratePublicFilePublications(db); migrateCommentRelayOutbox(db);
    let publications = createSqlitePublicFilePublicationStore(db); let outbox = createShareBindingOutbox(db);
    publications.set(scope, publication);
    const revision = publications.getRevision(scope)!;
    outbox.enqueue({ ...scope, resourceId: 'resource', publicationRevision: revision.token,
      ...(mode === 'owner' ? { ownerMemberId: 'other' } : {}), ...(mode === 'workspace' ? { resourceTeamId: 'other' } : {}),
      receipt: { filePath: scope.filePath, slug: mode === 'slug' ? 'wrong' : publication.slug, publishedAt: 1, version: 1, versionId: 'immutable1', entryPath: scope.filePath } });
    db.close(); db = new Database(file); publications = createSqlitePublicFilePublicationStore(db); outbox = createShareBindingOutbox(db);
    if (mode === 'republished') publications.set(scope, publication);
    if (mode === 'deleted') publications.delete(scope);
    if (mode === 'empty-revision') db.exec("UPDATE public_file_publications SET revision = ''; UPDATE share_binding_outbox SET publication_revision = ''");
    const bind = vi.fn(async () => { if (mode === 'during-response') publications.set(scope, publication); });
    const prepare = vi.fn(async () => {
      if (mode === 'during-prepare') publications.set(scope, publication);
      const task = outbox.list()[0]!;
      return { resourceTeamId: task.resourceTeamId, ownerMemberId: task.ownerMemberId, bind };
    });
    const result = await createShareBindingStartup(outbox, { publications, isCurrent: () => true, prepare, mutations: createPublicFileMutations() })();
    expect(bind).toHaveBeenCalledTimes(mode === 'same' || mode === 'during-response' ? 1 : 0);
    expect(result).toMatchObject({ bound: mode === 'same' ? 1 : 0, deferred: mode === 'same' ? 0 : 1, failed: 0 });
    expect(outbox.list()).toHaveLength(mode === 'same' ? 0 : 1);
    if (mode !== 'same') expect(outbox.list()[0]?.failureCount).toBe(1);
    expect(publications.get(scope)).toEqual(mode === 'deleted' ? null : publication);
    if (mode === 'republished' || mode === 'during-prepare' || mode === 'during-response') expect(publications.getRevision(scope)?.token).not.toBe(revision.token);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

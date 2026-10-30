import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, openDatabase } from '../src/db.js';
import {
  createSqlitePublicFilePublicationStore,
  createInMemoryPublicFilePublicationStore,
  migratePublicFilePublications,
  type PublicFilePublicationScope,
} from '../src/collab/public-file-publication-store.js';

let tempDir: string | null = null;

afterEach(() => {
  closeDatabase();
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe('SQLite public file publication store', () => {
  it('restores a publication after the database is closed and reopened', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-public-publication-'));
    const scope: PublicFilePublicationScope = {
      resourceTeamId: 'team-1',
      ownerMemberId: 'member-1',
      projectId: 'project-1',
      filePath: 'nested/index.html',
    };
    const publication = {
      url: 'https://hub.example.test/public/snapshot-1/nested/index.html',
      slug: 'snapshot-1',
      fileName: 'nested/index.html',
    };
    const first = createSqlitePublicFilePublicationStore(
      openDatabase(tempDir, { dataDir: tempDir }),
    );
    first.set(scope, publication, { publicFilePath: 'index.html', reopened: true, receipt: { resourceId: 'resource-1', versionId: 'version-1' } });
    const revision = first.getRevision(scope);

    closeDatabase();
    const reopened = createSqlitePublicFilePublicationStore(
      openDatabase(tempDir, { dataDir: tempDir }),
    );

    expect(reopened.get(scope)).toEqual(publication);
    expect(reopened.listFacts(scope)).toEqual([{ scope, publicationRevision: revision, publicFilePath: 'index.html', reopened: true, receipt: { resourceId: 'resource-1', versionId: 'version-1' } }]);
    expect(reopened.get({ ...scope, ownerMemberId: 'member-2' })).toBeNull();
    reopened.delete(scope);
    expect(reopened.get(scope)).toBeNull();
  });

  it('enumerates only the publishing creator scope with opaque slugs and publish times', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-public-publication-'));
    let timestamp = 1_700_000_000_000;
    const store = createSqlitePublicFilePublicationStore(
      openDatabase(tempDir, { dataDir: tempDir }),
      () => timestamp,
    );
    const creatorScope = {
      resourceTeamId: 'team-1',
      ownerMemberId: 'creator-1',
      projectId: 'project-1',
    };
    const fileScope: PublicFilePublicationScope = {
      ...creatorScope,
      filePath: 'page.html',
    };

    store.set(fileScope, {
      url: 'https://hub.example.test/public/opaque-slug-a/page.html',
      slug: 'opaque-slug-a',
      fileName: 'page.html',
    });
    timestamp += 1;
    store.set({ ...fileScope, ownerMemberId: 'commenter-1' }, {
      url: 'https://hub.example.test/public/commenter-slug/page.html',
      slug: 'commenter-slug',
      fileName: 'page.html',
    });

    const publications = store.listByProject(creatorScope);
    expect(publications).toEqual([{
      filePath: 'page.html',
      slug: 'opaque-slug-a',
      publishedAt: 1_700_000_000_000,
    }]);
    expect(publications[0]).not.toHaveProperty('shareId');

    timestamp += 1;
    store.set(fileScope, {
      url: 'https://hub.example.test/public/opaque-slug-b/page.html',
      slug: 'opaque-slug-b',
      fileName: 'page.html',
    });
    expect(store.listByProject(creatorScope)).toEqual([{
      filePath: 'page.html',
      slug: 'opaque-slug-b',
      publishedAt: 1_700_000_000_002,
    }]);
  });
});


it.each(['memory', 'sqlite'] as const)('lists detached mapped facts in exact principal and file scope: %s', backend => {
  const db = new Database(':memory:');
  try {
    migratePublicFilePublications(db);
    const store = backend === 'sqlite' ? createSqlitePublicFilePublicationStore(db) : createInMemoryPublicFilePublicationStore();
    const subject = { resourceTeamId: 'team', ownerMemberId: 'owner', projectId: 'project' };
    const scope = { ...subject, filePath: 'nested/page.html', sourceFileId: 'real-source-id' };
    const publication = { slug: 'slug', url: null, fileName: 'page.html' };
    store.set(scope, publication, { publicFilePath: 'index.html', reopened: true });
    store.set({ ...scope, ownerMemberId: 'other' }, publication, { publicFilePath: 'other.html', reopened: false });
    store.set({ ...scope, resourceTeamId: 'other' }, publication, { publicFilePath: 'other.html', reopened: false });
    store.set({ ...scope, projectId: 'other' }, publication, { publicFilePath: 'other.html', reopened: false });
    store.set({ ...subject, filePath: 'legacy.html' }, publication);
    store.set({ ...subject, filePath: 'second.html' }, publication, { publicFilePath: 'second.html', reopened: false });
    const expected = { scope, publicationRevision: store.getRevision(scope), publicFilePath: 'index.html', reopened: true };
    expect(store.listFacts(scope)).toEqual([expected]);
    expect(store.listFacts({ ...subject, filePath: 'legacy.html' })).toEqual([]);
    expect(store.listFacts(subject)).toHaveLength(2);
    const facts = store.listFacts(scope);
    facts[0]!.scope.ownerMemberId = 'mutated';
    facts[0]!.publicationRevision.token = 'mutated';
    expect(store.listFacts(scope)).toEqual([expected]);
    store.set(scope, publication);
    expect(store.listFacts(scope)).toEqual([]);
    expect(store.get(scope)).toEqual(publication);
  } finally { db.close(); }
});

it('migrates legacy unmapped rows without guessing a published entry path', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`CREATE TABLE public_file_publications (
      resource_team_id TEXT NOT NULL, owner_member_id TEXT NOT NULL,
      project_id TEXT NOT NULL, file_path TEXT NOT NULL, url TEXT NOT NULL,
      slug TEXT NOT NULL, file_name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY (resource_team_id, owner_member_id, project_id, file_path));
      INSERT INTO public_file_publications VALUES ('t', 'o', 'p', 'page.html', 'https://example.test', 'old', 'page.html', 1, 1);`);
    migratePublicFilePublications(db);
    migratePublicFilePublications(db);
    const store = createSqlitePublicFilePublicationStore(db);
    const scope = { resourceTeamId: 't', ownerMemberId: 'o', projectId: 'p', filePath: 'page.html' };
    expect(store.get(scope)?.slug).toBe('old');
    expect(store.listFacts(scope)).toEqual([]);
    store.set(scope, { slug: 'new', url: null, fileName: 'page.html' }, { publicFilePath: 'page.html', reopened: false });
    expect(store.listFacts(scope)[0]!.scope).toEqual(scope);
  } finally { db.close(); }
});

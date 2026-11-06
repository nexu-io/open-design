import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, openDatabase } from '../src/db.js';
import {
  createSqlitePublicFilePublicationStore,
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
    first.set(scope, publication);

    closeDatabase();
    const reopened = createSqlitePublicFilePublicationStore(
      openDatabase(tempDir, { dataDir: tempDir }),
    );

    expect(reopened.get(scope)).toEqual(publication);
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

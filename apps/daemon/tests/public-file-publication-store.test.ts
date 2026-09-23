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
});

import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { insertLibraryAsset, listLibraryAssets, migrateLibrary } from '../src/library-store.js';

describe('Library tag membership filtering', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    migrateLibrary(db);
  });

  afterEach(() => {
    db.close();
  });

  function insert(id: string, tags: string[], kind: 'image' | 'text' = 'image', archivedDate = '2026-01-01') {
    insertLibraryAsset(db, {
      id,
      kind,
      storage: 'owned',
      capturedAt: 1,
      archivedDate,
      contentHash: id,
      tags,
    });
  }

  it('treats percent signs as tag text rather than wildcards', () => {
    insert('percent', ['100%']);
    insert('other', ['1000']);
    assert.deepEqual(listLibraryAssets(db, { tag: '100%' }).map((asset) => asset.id), ['percent']);
  });

  it('treats underscores as tag text rather than single-character wildcards', () => {
    insert('underscore', ['brand_a']);
    insert('other', ['brandXa']);
    assert.deepEqual(listLibraryAssets(db, { tag: 'brand_a' }).map((asset) => asset.id), ['underscore']);
  });

  for (const [name, tag] of [
    ['quotes', 'label "primary"'],
    ['backslashes', 'brand\\palette'],
    ['newlines', 'first\nsecond'],
  ] as const) {
    it(`matches tags containing JSON-escaped ${name}`, () => {
      insert('match', [tag]);
      insert('other', ['unrelated']);
      const assets = listLibraryAssets(db, { tag });
      assert.deepEqual(assets.map((asset) => asset.id), ['match']);
      assert.deepEqual(assets[0]!.tags, [tag]);
    });
  }

  it('applies tag membership before limiting results and combines it with other filters', () => {
    insert('wildcard-decoy', ['brandXa'], 'image', '2026-01-03');
    insert('other-kind', ['brand_a'], 'text', '2026-01-02');
    insert('match', ['brand_a'], 'image', '2026-01-01');
    assert.deepEqual(
      listLibraryAssets(db, { tag: 'brand_a', kind: 'image', limit: 1 }).map((asset) => asset.id),
      ['match'],
    );
  });

  it('preserves existing case-insensitive ASCII tag matching and returns each asset once', () => {
    insert('match', ['Brand', 'brand']);
    insert('other', ['branded']);
    assert.deepEqual(listLibraryAssets(db, { tag: 'BRAND' }).map((asset) => asset.id), ['match']);
  });

  it('ignores empty, missing, or corrupt tag arrays', () => {
    insert('empty', []);
    insert('null', []);
    insert('corrupt', []);
    insert('match', ['有效']);
    db.prepare('UPDATE library_assets SET tags_json = NULL WHERE id = ?').run('null');
    db.prepare('UPDATE library_assets SET tags_json = ? WHERE id = ?').run('[broken', 'corrupt');
    assert.deepEqual(listLibraryAssets(db, { tag: '有效' }).map((asset) => asset.id), ['match']);
  });
});

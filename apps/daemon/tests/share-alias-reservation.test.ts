import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { createShareAliasReservations } from '../src/collab/share-alias-reservation.js';
const scope = { sourceFileId: '11111111-1111-4111-8111-111111111111', resourceTeamId: 'w', ownerMemberId: 'o', projectId: 'p', filePath: 'pages/local.html' };

it('retains the same alias and source key across connections, restarts and detached result mutation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'od-share-alias-'));
  const file = path.join(root, 'state.sqlite');
  try {
    const first = new Database(file); const second = new Database(file);
    let expected: { slug: string; sourceKey: string };
    try {
      const store = createShareAliasReservations(first);
      const value = store.reserve(scope); expected = { ...value };
      expect(value.slug).not.toBe(value.sourceKey);
      value.slug = 'mutated';
      expect(store.reserve(scope)).toEqual(expected);
      const generateId = vi.fn(() => { throw new Error('must not regenerate'); });
      expect(createShareAliasReservations(second, generateId).reserve(scope)).toEqual(expected);
      expect(generateId).not.toHaveBeenCalled();
    } finally { second.close(); first.close(); }
    const reopened = new Database(file);
    try { expect(createShareAliasReservations(reopened).reserve(scope)).toEqual(expected); }
    finally { reopened.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
it.each(['resourceTeamId', 'ownerMemberId', 'projectId', 'filePath', 'sourceFileId'] as const)('does not steal a recovered alias from another %s scope', key => {
  const db = new Database(':memory:');
  try {
    const generateId = vi.fn(() => { throw new Error('must not generate'); });
    const store = createShareAliasReservations(db, generateId);
    const cloud = { sourceFileId: scope.sourceFileId, sourceFilePath: scope.filePath, slug: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    const original = store.restore(scope, cloud);
    const other = { ...scope, [key]: key === 'sourceFileId' ? '22222222-2222-4222-8222-222222222222' : 'other' };
    expect(() => store.restore(other, { ...cloud, sourceFileId: other.sourceFileId, sourceFilePath: other.filePath })).toThrow();
    expect(store.get(scope)).toEqual(original);
    expect(store.get(other)).toBeNull();
    expect(generateId).not.toHaveBeenCalled();
  } finally { db.close(); }
});

it('rejects an alias with a different or missing file identity or a different path', () => {
  const db = new Database(':memory:');
  try {
    const store = createShareAliasReservations(db);
    const cloud = { sourceFileId: scope.sourceFileId, sourceFilePath: scope.filePath, slug: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    expect(() => store.restore(scope, { sourceFilePath: cloud.sourceFilePath, slug: cloud.slug })).toThrow('SHARE_ALIAS_IDENTITY_MISMATCH');
    expect(() => store.restore(scope, { ...cloud, sourceFileId: '22222222-2222-4222-8222-222222222222' })).toThrow('SHARE_ALIAS_IDENTITY_MISMATCH');
    expect(() => store.restore(scope, { ...cloud, sourceFilePath: 'other.html' })).toThrow('SHARE_ALIAS_IDENTITY_MISMATCH');
    expect(store.get(scope)).toBeNull();
  } finally { db.close(); }
});

it.each(['resourceTeamId', 'ownerMemberId', 'projectId', 'filePath'] as const)('isolates reservations by %s and refuses empty identity', key => {
  const db = new Database(':memory:');
  try {
    const store = createShareAliasReservations(db);
    const original = store.reserve(scope);
    const other = store.reserve({ ...scope, [key]: 'other', sourceFileId: '22222222-2222-4222-8222-222222222222' });
    expect(other.slug).not.toBe(original.slug); expect(other.sourceKey).not.toBe(original.sourceKey);
    expect(() => store.reserve({ ...scope, [key]: ' ' })).toThrow('SHARE_ALIAS_IDENTITY_REQUIRED');
    expect(db.prepare('SELECT COUNT(*) AS n FROM share_alias_reservations').get()).toEqual({ n: 2 });
  } finally { db.close(); }
});
it.each(['throw', 'invalid', 'collision'] as const)('does not leave partial reservations after %s', mode => {
  const db = new Database(':memory:');
  try {
    const original = createShareAliasReservations(db).reserve(scope);
    const generateId = mode === 'throw' ? () => { throw new Error('entropy unavailable'); }
      : () => mode === 'invalid' ? '../unsafe' : original.slug;
    const store = createShareAliasReservations(db, generateId);
    expect(() => store.reserve({ ...scope, filePath: 'other.html' })).toThrow();
    expect(db.inTransaction).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS n FROM share_alias_reservations').get()).toEqual({ n: 1 });
    expect(store.reserve(scope)).toEqual(original);
  } finally { db.close(); }
});

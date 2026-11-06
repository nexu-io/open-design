import Database from 'better-sqlite3';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildDeployFilePlan } from '../src/deploy.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';
import { createShareContentFingerprints, fingerprintSharePayload } from '../src/collab/share-content-fingerprint.js';
const scope = { resourceTeamId: 'w', ownerMemberId: 'o', projectId: 'p', filePath: 'index.html' };
const publication = { slug: 'stable', url: 'https://example.test/stable', fileName: 'index.html' };
it('compares actual full deploy payload across restart, dependency change and restoration without mtime inference', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'od-freshness-')); let db = new Database(join(dir, 'db.sqlite'));
  try {
    await mkdir(join(dir, 'p')); await writeFile(join(dir, 'p/index.html'), '<link rel="stylesheet" href="style.css"><h1>Hello</h1>');
    await writeFile(join(dir, 'p/style.css'), 'body{background:url(image.png)}'); await writeFile(join(dir, 'p/image.png'), Buffer.from([1,2,3]));
    const plan = () => buildDeployFilePlan(dir, 'p', 'index.html', { hookScriptUrl: '', assetUrlPolicy: 'share-relative' });
    const payload = (await plan()).files;
    expect(payload.map(f => f.file)).toEqual(expect.arrayContaining(['index.html', 'style.css', 'image.png']));
    migratePublicFilePublications(db); let publications = createSqlitePublicFilePublicationStore(db); publications.set(scope, publication);
    const revision = publications.getRevision(scope)!; let store = createShareContentFingerprints(db, publications);
    expect(store.compare(scope, payload)).toBe('unknown'); expect(store.remember(scope, revision, payload)).toBe(true);
    db.close(); db = new Database(join(dir, 'db.sqlite')); publications = createSqlitePublicFilePublicationStore(db); store = createShareContentFingerprints(db, publications);
    expect(store.compare(scope, (await plan()).files)).toBe('current');
    await utimes(join(dir, 'p/index.html'), new Date(0), new Date(0)); expect(store.compare(scope, (await plan()).files)).toBe('current');
    await writeFile(join(dir, 'p/style.css'), 'body{background:url(image.png);color:red}'); expect(store.compare(scope, (await plan()).files)).toBe('outdated');
    await writeFile(join(dir, 'p/style.css'), 'body{background:url(image.png)}'); expect(store.compare(scope, (await plan()).files)).toBe('current');
    await writeFile(join(dir, 'p/image.png'), Buffer.from([3,2,1])); expect(store.compare(scope, (await plan()).files)).toBe('outdated');
    expect(store.remember(scope, revision, (await plan()).files)).toBe(false);
    for (const other of [{ ...scope, ownerMemberId: 'other' }, { ...scope, resourceTeamId: 'other' }, { ...scope, projectId: 'other' }, { ...scope, filePath: 'other.html' }]) expect(store.compare(other, payload)).toBe('unknown');
    expect(store.compare(scope, null)).toBe('unknown');
    publications.set(scope, publication); expect(store.compare(scope, payload)).toBe('unknown'); expect(store.remember(scope, revision, payload)).toBe(false);
    db.close(); expect(store.compare(scope, payload)).toBe('unknown');
  } finally { if (db.open) db.close(); await rm(dir, { recursive: true, force: true }); }
});
it('fingerprints paths and byte boundaries, ignores traversal order, and refuses ambiguous plans', () => {
  const files = [{ file: 'index.html', data: '你好' }, { file: 'style.css', data: new Uint8Array([0,255]) }];
  expect(fingerprintSharePayload(files)).toBe(fingerprintSharePayload([...files].reverse()));
  expect(fingerprintSharePayload(files)).not.toBe(fingerprintSharePayload([{ ...files[0]!, file: 'other.html' }, files[1]!]));
  expect(fingerprintSharePayload([{ file: 'a', data: 'bc' }])).not.toBe(fingerprintSharePayload([{ file: 'ab', data: 'c' }]));
  expect(fingerprintSharePayload(null)).toBeNull(); expect(fingerprintSharePayload([])).toBeNull();
  expect(fingerprintSharePayload([files[0]!, files[0]!])).toBeNull();
  expect(fingerprintSharePayload([{ file: '../escape', data: 'x' }])).toBeNull();
});

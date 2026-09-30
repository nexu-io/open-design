import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { migrateCommentRelayOutbox } from '../src/collab/comment-relay-outbox.js';
import { createSqlitePublicFilePublicationStore, migratePublicFilePublications } from '../src/collab/public-file-publication-store.js';

const scope = { resourceTeamId: 'team', ownerMemberId: 'owner', projectId: 'project', filePath: 'index.html' };
const publication = { slug: 'A', url: 'https://example.test/A', fileName: 'index.html' };
let db: Database.Database;
let store: ReturnType<typeof createSqlitePublicFilePublicationStore>;
beforeEach(() => {
  db = new Database(':memory:');
  migratePublicFilePublications(db);
  migrateCommentRelayOutbox(db);
  store = createSqlitePublicFilePublicationStore(db, () => 1);
});
afterEach(() => db.close());
function put(id: string, patch: Partial<{ member: string; project: string; file: string; scope: string }> = {}) {
  const row = { member: 'owner', project: 'project', file: 'index.html', scope: 'personal', ...patch };
  db.prepare(`INSERT INTO comment_relay_outbox(workspace_id,workspace_member_id,team_id,relay_scope,project_id,file_path,comment_id,payload_json,next_attempt_at,created_at,updated_at)
    VALUES ('team',?,'team',?,?,?,?,'{}',1,1,1)`).run(row.member, row.scope, row.project, row.file, id);
}
const ids = () => db.prepare('SELECT comment_id FROM comment_relay_outbox ORDER BY comment_id').all();

it('cancels exact personal rows on successful CAS and preserves other scopes', () => {
  store.set(scope, publication);
  put('old'); put('other-file', { file: 'other.html' }); put('other-owner', { member: 'other' });
  put('other-project', { project: 'other' }); put('team-row', { scope: 'team' });
  expect(store.deleteIfRevisionMatches(scope, store.getRevision(scope)!)).toBe(true);
  expect(store.get(scope)).toBeNull();
  expect(ids()).toEqual(['other-file', 'other-owner', 'other-project', 'team-row'].map((comment_id) => ({ comment_id })));
});

it.each(['A', 'B'])('preserves new publication and outbox on late stop when new slug is %s', (slug) => {
  store.set(scope, publication); const old = store.getRevision(scope)!; put('old');
  const newer = { ...publication, slug }; store.set(scope, newer); put('new');
  expect(store.deleteIfRevisionMatches(scope, old)).toBe(false);
  expect(store.get(scope)).toEqual(newer);
  expect(ids()).toEqual([{ comment_id: 'new' }, { comment_id: 'old' }]);
});

it('does not resurrect old rows on same-slug republish and preserves its new rows', () => {
  store.set(scope, publication); put('old'); const old = store.getRevision(scope)!;
  expect(store.deleteIfRevisionMatches(scope, old)).toBe(true);
  store.set(scope, publication); put('new');
  expect(store.deleteIfRevisionMatches(scope, old)).toBe(false);
  expect(ids()).toEqual([{ comment_id: 'new' }]);
});

it('rolls back publication and outbox together if cancellation fails', () => {
  store.set(scope, publication); put('old'); const revision = store.getRevision(scope)!;
  db.exec("CREATE TRIGGER reject_cancel BEFORE DELETE ON comment_relay_outbox BEGIN SELECT RAISE(ABORT, 'cancel denied'); END;");
  expect(() => store.deleteIfRevisionMatches(scope, revision)).toThrow('cancel denied');
  expect(store.getRevision(scope)).toEqual(revision);
  expect(store.get(scope)).toEqual(publication);
  expect(ids()).toEqual([{ comment_id: 'old' }]);
  db.exec('DROP TRIGGER reject_cancel');
  expect(store.deleteIfRevisionMatches(scope, revision)).toBe(true);
  expect(ids()).toEqual([]);
});

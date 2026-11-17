import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { CommentFileMutation, CommentFileState } from '@open-design/contracts';
import { closeDatabase, openDatabase, insertProject, ensureWorkspaceProject, deleteWorkspaceProject, updateWorkspaceProject, updateProject, getProject, insertConversation, upsertPreviewComment, listPreviewComments, getProjectPreviewComment } from '../src/db.js';
import { ensureWorkspaceArtifactForPath, getWorkspaceArtifact } from '../src/chat-artifacts/store.js';
import { createCommentFileDeletion } from '../src/collab/comment-file-deletion.js';
import { createLocalCommentFiles } from '../src/collab/local-comment-files.js';
import { createProjectPublicFileStop } from '../src/collab/project-public-file-stop.js';
import { deleteProjectFile, deleteProjectFolder } from '../src/projects.js';
import { pendingCommentFileRetirements, assertCommentFileNotPending } from '../src/collab/comment-file-retirements.js';
import { createCommentRelayOutboxStore } from '../src/collab/comment-relay-outbox.js';
import { createCommentFilePublisher } from '../src/collab/comment-file-publisher.js';
import { createSqlitePublicFilePublicationStore } from '../src/collab/public-file-publication-store.js';

let root: string | undefined;
afterEach(() => { closeDatabase(); if (root) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-comment-delete-'));
  const db = openDatabase(root, { dataDir: root });
  insertProject(db, { id: 'p', name: 'P', createdAt: 1, updatedAt: 1 });
  ensureWorkspaceProject(db, { projectId: 'p', workspaceId: 'w', visibility: 'personal', createdByWorkspaceMemberId: 'creator', resourceHubResourceId: 'root' });
  const projects = path.join(root, 'projects');
  const sourceRoot = path.join(projects, 'p');
  const facts = ['pages/a.html', 'pages/b.html', 'outside.html'].map((filePath, index) => ({
    sourceFileId: ensureWorkspaceArtifactForPath(db, { projectId: 'p', path: filePath, kind: 'html' }).id,
    sourceFilePath: filePath, entryPath: 'index.html', resourceId: `selected-${index}`, versionId: 'v1', retired: false,
  }));
  for (const fact of facts) {
    const file = path.join(sourceRoot, fact.sourceFilePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, fact.sourceFileId);
  }
  let remote: CommentFileState = { schemaVersion: 1, revision: 1, files: facts };
  const initial = structuredClone(remote);
  updateProject(db, 'p', { metadata: { unrelated: 'keep', _commentFiles: remote } });
  let failSecondRetirement = false;
  let offline = false;
  let loseResponse = false;
  let responseLost = false;
  const requests: CommentFileMutation[] = [];
  const run = vi.fn(async (args: string[]) => {
    if (offline || responseLost) throw new Error('catalog unavailable');
    if (args[1] === 'upsert') {
      const mutation = JSON.parse(args[6] ?? '')._commentFiles as CommentFileMutation;
      requests.push(mutation);
      if (failSecondRetirement && mutation.files.some(file => file.sourceFileId === facts[1]?.sourceFileId)) throw new Error('second receipt unavailable');
      expect(mutation.baseRevision).toBe(remote.revision);
      const replacements = new Map(mutation.files.map(file => {
        const { receipt, ...entry } = file;
        return [file.sourceFileId, { ...entry, resourceId: receipt?.resourceId ?? mutation.resourceId, versionId: receipt?.versionId ?? mutation.versionId }];
      }));
      remote = { schemaVersion: 1, revision: remote.revision + 1, files: remote.files.map(file => replacements.get(file.sourceFileId) ?? file) };
      if (loseResponse) { responseLost = true; throw new Error('response lost'); }
    }
    return JSON.stringify({ projectId: 'p', workspaceId: 'w', ownerMemberId: 'creator', resourceId: 'root', metadata: { _commentFiles: remote } });
  });
  const publications = createSqlitePublicFilePublicationStore(db);
  for (const fact of facts) publications.set({ projectId: 'p', resourceTeamId: 'w', ownerMemberId: 'creator', filePath: fact.sourceFilePath },
    { slug: fact.sourceFileId, url: null, fileName: fact.sourceFilePath });
  let failStop = false;
  const stop = vi.fn(async () => { if (failStop) throw new Error('stop unavailable'); });
  const makeDeletion = (database = db, busy = false) => createCommentFileDeletion({ db: database, localFiles: createLocalCommentFiles(database),
    isPresent: async (_id, filePath) => {
      try { await fs.promises.lstat(path.join(sourceRoot, filePath)); return true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
    }, hasActiveRun: () => busy, runForWorkspace: () => run,
    stopPublicFiles: createProjectPublicFileStop(createSqlitePublicFilePublicationStore(database), async () => ({ resourceTeamId: 'w', ownerMemberId: 'creator', stop })) });
  return { db, projects, sourceRoot, facts, initial, requests, run, stop, publications, beforeDelete: makeDeletion(), makeDeletion, remote: () => remote,
    remove: (name: string) => deleteProjectFile(projects, 'p', name),
    removeFolder: () => deleteProjectFolder(projects, 'p', 'pages'),
    failRetirement: (value: boolean) => { failSecondRetirement = value; }, failStop: () => { failStop = true; },
    offline: (value: boolean) => { offline = value; if (!value) responseLost = false; },
    loseResponse: () => { loseResponse = true; } };
}

it('a failed public stop preserves the original active lifetimes and stop witnesses before any retirement', async () => {
  const f = fixture();
  f.failStop();
  await expect(f.beforeDelete('p', { folderPath: 'pages' }, f.removeFolder)).rejects.toThrow('PUBLIC_FILE_STOP_PENDING');
  expect(f.remote()).toEqual(f.initial);
  expect(f.requests).toHaveLength(0);
  expect(getProject(f.db, 'p')?.metadata?._commentFiles).toEqual(f.initial);
  expect(f.publications.listStops()).toHaveLength(2);
  for (const fact of f.facts) expect(getWorkspaceArtifact(f.db, fact.sourceFileId)?.deletedAt).toBeNull();
});

it('a failed second file authority cannot partially retire a folder; a normal retry retires all in one CAS', async () => {
  const f = fixture();
  f.failRetirement(true);
  await expect(f.beforeDelete('p', { folderPath: 'pages' }, f.removeFolder)).rejects.toThrow('second receipt unavailable');
  expect.soft(f.remote()).toEqual(f.initial);
  expect.soft(getProject(f.db, 'p')?.metadata?._commentFiles).toEqual(f.initial);
  for (const fact of f.facts.slice(0, 2)) expect.soft(getWorkspaceArtifact(f.db, fact.sourceFileId)?.deletedAt).not.toBeNull();
  f.failRetirement(false);
  await f.beforeDelete('p', { folderPath: 'pages' }, async () => { await fs.promises.rm(path.join(f.sourceRoot, 'pages'), { recursive: true, force: true }); });
  expect(f.requests).toHaveLength(2); // one failed whole batch, then one successful batch
  expect(f.requests.every(request => request.files.length === 2)).toBe(true);
  expect(f.remote().files).toEqual(f.facts.map((fact, index) => ({ ...fact, retired: index < 2 })));
  expect(getProject(f.db, 'p')?.metadata?._commentFiles).toEqual(f.remote());
  expect(getProject(f.db, 'p')?.metadata?.unrelated).toBe('keep');
  for (const fact of f.facts.slice(0, 2)) expect(getWorkspaceArtifact(f.db, fact.sourceFileId)?.deletedAt).not.toBeNull();
  const outside = f.facts[2];
  if (!outside) throw new Error('missing outside fact');
  expect(getWorkspaceArtifact(f.db, outside.sourceFileId)?.deletedAt).toBeNull();
  expect(f.publications.listByProject({ projectId: 'p', resourceTeamId: 'w', ownerMemberId: 'creator' }).map(file => file.filePath)).toEqual(['outside.html']);
});

it('filesystem rejection does not retire or tombstone a still-present source lifetime', async () => {
  const f = fixture();
  const unlink = vi.fn(async () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }); });
  // The production mutation seam must own retirement ordering, not its caller.
  await expect(f.beforeDelete('p', 'pages/a.html', unlink)).rejects.toMatchObject({ code: 'EACCES' });
  expect(unlink).toHaveBeenCalledOnce();
  expect(f.requests).toHaveLength(0);
  expect(f.remote()).toEqual(f.initial);
  expect(getProject(f.db, 'p')?.metadata?._commentFiles).toEqual(f.initial);
  expect(getWorkspaceArtifact(f.db, f.facts[0]!.sourceFileId)?.deletedAt).toBeNull();
});

it.each([false, true])('post-FS remote uncertainty freezes F1 across reopen, then retries exact old receipts; lost response=%s', async lost => {
  const f = fixture();
  if (lost) f.loseResponse(); else f.offline(true);
  await expect(f.beforeDelete('p', { folderPath: 'pages' }, f.removeFolder)).rejects.toThrow('catalog unavailable');
  expect(fs.existsSync(path.join(f.sourceRoot, 'pages'))).toBe(false);
  expect(pendingCommentFileRetirements(f.db, 'p').map(row => row.fact)).toEqual(f.facts.slice(0, 2));
  expect(getWorkspaceArtifact(f.db, f.facts[0]!.sourceFileId)?.deletedAt).not.toBeNull();
  expect(getProject(f.db, 'p')?.metadata?._commentFiles).toEqual(f.initial); // no fabricated admission
  closeDatabase();
  const db = openDatabase(root!, { dataDir: root! });
  const calls = f.run.mock.calls.length;
  const local = createLocalCommentFiles(db);
  expect(f.run).toHaveBeenCalledTimes(calls); // local open/reads need no network
  fs.mkdirSync(path.join(f.sourceRoot, 'pages'));
  fs.writeFileSync(path.join(f.sourceRoot, 'pages/a.html'), 'replacement');
  expect(() => local.identity('p', 'pages/a.html')).toThrow('COMMENT_FILE_RETIREMENT_PENDING');
  const replacement = ensureWorkspaceArtifactForPath(db, { projectId: 'p', path: 'pages/a.html', kind: 'html' });
  expect(replacement.id).not.toBe(f.facts[0]!.sourceFileId);
  expect(local.identity('p', 'outside.html')).toBe(f.facts[2]!.sourceFileId);
  const publish = vi.fn(async () => ({ versionId: 'new' }));
  const publisher = createCommentFilePublisher({ db, localFiles: local, resolveRoot: async () => f.sourceRoot,
    listFiles: async () => ['pages/a.html'], runForWorkspace: () => f.run });
  await expect(publisher('p', { teamId: 'w', memberId: 'creator', role: 'member', lifecycleState: 'active' }, publish)).rejects.toThrow('COMMENT_FILE_RETIREMENT_PENDING');
  expect(publish).not.toHaveBeenCalled();
  f.offline(false);
  // An unrelated delete cannot reconcile/rebind the pending folder.
  await f.makeDeletion(db)('p', 'untracked.txt', async () => {});
  expect(pendingCommentFileRetirements(db, 'p')).toHaveLength(2);
  // Scope retry may see recreated bytes but MUST retire the original captured IDs.
  await f.makeDeletion(db)('p', { folderPath: 'pages' }, f.removeFolder);
  expect(pendingCommentFileRetirements(db, 'p')).toEqual([]);
  const second = local.identity('p', 'pages/a.html');
  expect(second).not.toBe(f.facts[0]!.sourceFileId);
  // Authoritative F1 adoption cannot tombstone an already-created F2 card.
  expect(getWorkspaceArtifact(db, replacement.id)?.deletedAt).toBeNull();
  expect(f.remote().files).toEqual(f.facts.map((fact, index) => ({ ...fact, retired: index < 2 })));
  expect(f.requests).toHaveLength(1); // lost successful response is read back, never a second CAS
  expect(f.requests[0]?.files).toEqual([
    { sourceFileId: f.facts[0]!.sourceFileId, sourceFilePath: 'pages/a.html', entryPath: 'index.html', retired: true },
    { sourceFileId: f.facts[1]!.sourceFileId, sourceFilePath: 'pages/b.html', entryPath: 'index.html', retired: true,
      receipt: { resourceId: 'selected-1', versionId: 'v1' } },
  ]);
});

it('partial managed folder failure retires only committed captured files, not surviving descendants or siblings', async () => {
  const f = fixture();
  await expect(f.beforeDelete('p', { folderPath: 'pages' }, async () => {
    await f.remove('pages/a.html');
    throw Object.assign(new Error('remaining descendant inaccessible'), { code: 'EACCES' });
  })).rejects.toMatchObject({ code: 'EACCES' });
  expect(f.remote().files).toEqual(f.facts.map((fact, index) => ({ ...fact, retired: index === 0 })));
  expect(f.requests[0]?.files.map(file => file.sourceFilePath)).toEqual(['pages/a.html']);
  expect(pendingCommentFileRetirements(f.db, 'p')).toEqual([]);
  const local = createLocalCommentFiles(f.db);
  expect(local.identity('p', 'pages/b.html')).toBe(f.facts[1]!.sourceFileId);
  expect(getWorkspaceArtifact(f.db, f.facts[1]!.sourceFileId)?.deletedAt).toBeNull();
  await f.beforeDelete('p', { folderPath: 'pages' }, f.removeFolder);
  expect(f.remote().files).toEqual(f.facts.map((fact, index) => ({ ...fact, retired: index < 2 })));
  expect(f.requests[1]?.files.map(file => file.sourceFilePath)).toEqual(['pages/b.html']);
});

it('FS rejection retains local comments/author/time and team/sibling outbox; successful stop still cancels exact personal revisions', async () => {
  const f = fixture();
  insertConversation(f.db, { id: 'c', projectId: 'p', title: 'C', createdAt: 1, updatedAt: 1 });
  const comment = upsertPreviewComment(f.db, 'p', 'c', { sourceFileId: f.facts[0]!.sourceFileId,
    authorMemberId: 'creator', note: 'keep me', target: { filePath: 'pages/a.html', elementId: 'e', selector: '#e', label: 'E', position: { x: 0, y: 0, width: 1, height: 1 } } })!;
  const outbox = createCommentRelayOutboxStore(f.db);
  for (const [id, relayScope, filePath] of [['personal', 'personal', 'pages/a.html'], ['team', 'team', 'pages/a.html'], ['sibling', 'personal', 'outside.html']] as const) {
    outbox.enqueue({ workspaceId: 'w', workspaceMemberId: 'creator', teamId: 'w', relayScope, projectId: 'p', expectedOwnerMemberId: 'creator',
      comment: { ...comment, id, seq: 1, memberId: 'creator', sourceFileId: f.facts[filePath === 'outside.html' ? 2 : 0]!.sourceFileId,
        sourceFilePath: filePath, filePath } });
  }
  const before = outbox.listDue(Date.now());
  await expect(f.beforeDelete('p', 'pages/a.html', async () => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); })).rejects.toMatchObject({ code: 'EACCES' });
  expect(outbox.listDue(Date.now())).toEqual(before.filter(row => row.commentId !== 'personal'));
  expect(listPreviewComments(f.db, 'p', 'c')).toEqual([comment]);
  expect(getProjectPreviewComment(f.db, 'p', comment.id)).toEqual(comment);
  expect(createLocalCommentFiles(f.db).identity('p', 'pages/a.html')).toBe(comment.sourceFileId);
  expect(pendingCommentFileRetirements(f.db, 'p')).toEqual([]);
  expect(f.requests).toHaveLength(0);
});

it('existing active-run fence rejects before stop, intent or filesystem mutation', async () => {
  const f = fixture();
  const mutation = vi.fn(f.removeFolder);
  await expect(f.makeDeletion(f.db, true)('p', { folderPath: 'pages' }, mutation)).rejects.toThrow('COMMENT_FILE_PROJECT_BUSY');
  expect(mutation).not.toHaveBeenCalled();
  expect(f.stop).not.toHaveBeenCalled();
  expect(pendingCommentFileRetirements(f.db, 'p')).toEqual([]);
  expect(() => assertCommentFileNotPending(f.db, 'p', { sourceFileId: f.facts[0]!.sourceFileId })).not.toThrow();
});

it('a same-root metadata-only retry reconciles captured retirement without ending surviving lifetimes', async () => {
  const f = fixture();
  f.offline(true);
  await expect(f.beforeDelete('p', 'pages/a.html', () => f.remove('pages/a.html'))).rejects.toThrow('catalog unavailable');
  f.offline(false);
  await f.beforeDelete('p', undefined, async () => false);
  expect(f.remote().files).toEqual(f.facts.map((fact, index) => ({ ...fact, retired: index === 0 })));
  expect(pendingCommentFileRetirements(f.db, 'p')).toEqual([]);
  expect(createLocalCommentFiles(f.db).identity('p', 'pages/b.html')).toBe(f.facts[1]!.sourceFileId);
});

it('an interrupted local completion leaves an uncertain intent, never an admitted retirement or reusable F1 pointer', async () => {
  const f = fixture();
  await expect(f.beforeDelete('p', 'pages/a.html', async () => {
    await f.remove('pages/a.html');
    closeDatabase(); // process loses its SQLite handle after unlink, before local adoption
  })).rejects.toThrow();
  const db = openDatabase(root!, { dataDir: root! });
  expect(pendingCommentFileRetirements(db, 'p')).toEqual([
    { workspaceId: 'w', creatorMemberId: 'creator', fact: f.facts[0], committed: false },
  ]);
  expect(getProject(db, 'p')?.metadata?._commentFiles).toEqual(f.initial);
  fs.writeFileSync(path.join(f.sourceRoot, 'pages/a.html'), 'replacement after interruption');
  expect(() => createLocalCommentFiles(db).identity('p', 'pages/a.html')).toThrow('COMMENT_FILE_RETIREMENT_PENDING');
  expect(() => ensureWorkspaceArtifactForPath(db, { projectId: 'p', path: 'pages/a.html', kind: 'html' })).toThrow('COMMENT_FILE_RETIREMENT_PENDING');
  expect(f.requests).toHaveLength(0);
  // Only another supported mutation may establish this uncertain local outcome.
  await f.makeDeletion(db)('p', 'pages/a.html', () => f.remove('pages/a.html'));
  expect(f.remote().files[0]).toEqual({ ...f.facts[0], retired: true });
  expect(createLocalCommentFiles(db).identity('p', 'pages/a.html')).not.toBe(f.facts[0]!.sourceFileId);
});

it('retry after interrupted unlink can reconcile the exact absent source without inventing a completion receipt', async () => {
  const f = fixture();
  await expect(f.beforeDelete('p', 'pages/a.html', async () => {
    await f.remove('pages/a.html');
    closeDatabase();
  })).rejects.toThrow();
  const db = openDatabase(root!, { dataDir: root! });
  await f.makeDeletion(db)('p', 'pages/a.html', () => f.remove('pages/a.html'));
  expect(pendingCommentFileRetirements(db, 'p')).toEqual([]);
  expect(f.requests).toHaveLength(1);
  expect(f.remote().files).toEqual(f.facts.map((fact, index) => ({ ...fact, retired: index === 0 })));
});


it('pending retry never borrows a changed local creator to stop or retire captured originals', async () => {
  const f = fixture();
  f.offline(true);
  await expect(f.beforeDelete('p', 'pages/a.html', () => f.remove('pages/a.html'))).rejects.toThrow('catalog unavailable');
  updateWorkspaceProject(f.db, 'w', 'p', { createdByWorkspaceMemberId: 'another-creator' });
  f.stop.mockClear();
  const mutation = vi.fn(async () => {});
  await expect(f.beforeDelete('p', 'pages/a.html', mutation)).rejects.toThrow('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
  expect(f.stop).not.toHaveBeenCalled();
  expect(mutation).not.toHaveBeenCalled();
  expect(pendingCommentFileRetirements(f.db, 'p')[0]?.creatorMemberId).toBe('creator');
});


it('an orphaned admitted lifetime cannot borrow a creator or pass through to local deletion', async () => {
  const f = fixture();
  f.publications.delete({ projectId: 'p', resourceTeamId: 'w', ownerMemberId: 'creator', filePath: 'pages/a.html' });
  deleteWorkspaceProject(f.db, 'w', 'p');
  const mutation = vi.fn(() => f.remove('pages/a.html'));
  await expect(f.beforeDelete('p', 'pages/a.html', mutation)).rejects.toThrow('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
  expect(mutation).not.toHaveBeenCalled();
  expect(f.requests).toHaveLength(0);
});


it('partial folder failure does not attribute an earlier unrelated disappearance to this managed deletion', async () => {
  const f = fixture();
  await f.remove('pages/a.html'); // outside this supported folder mutation
  await expect(f.beforeDelete('p', { folderPath: 'pages' }, async () => {
    throw Object.assign(new Error('folder inaccessible'), { code: 'EACCES' });
  })).rejects.toMatchObject({ code: 'EACCES' });
  expect(f.remote()).toEqual(f.initial);
  expect(f.requests).toHaveLength(0);
  expect(pendingCommentFileRetirements(f.db, 'p')).toEqual([]);
});

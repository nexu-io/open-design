import type Database from 'better-sqlite3';
import type { CommentFileFact } from '@open-design/contracts';
import { getProject, getWorkspaceProjectByProjectId } from '../db.js';
import type { runVelaCommand } from '../integrations/vela-command.js';
import { parseCommentFileState } from './comment-file-facts.js';
import { pendingCommentFileRetirements } from './comment-file-retirements.js';
import type { createLocalCommentFiles } from './local-comment-files.js';
import { matchesPublicFileDeleteTarget, type PublicFileDeleteTarget } from './project-public-file-stop.js';

/** A metadata-only working-root retry returns false: no new local lifetime ended. */
export type CommentFileDeletion = (projectId: string, target?: PublicFileDeleteTarget,
  mutate?: () => Promise<void | false>, mode?: 'committed-retry') => Promise<void>;

/** Optional route adapters still perform their ordinary local mutation. */
export async function withCommentFileDeletion(deletion: CommentFileDeletion | undefined,
  projectId: string, target: PublicFileDeleteTarget | undefined, mutate: () => Promise<void | false>,
  mode?: 'committed-retry'): Promise<void> {
  if (deletion) await deletion(projectId, target, mutate, mode);
  else await mutate();
}

/** Public stop precedes bytes; irreversible catalog retirement follows bytes.
 * The existing project mutation lane encloses this entire operation. A durable,
 * exact intent freezes old identities across remote failure/reopen; it is never
 * treated as catalog admission. Only confirmed missing descendants of a failed
 * recursive deletion may retire, in one mixed-receipt CAS.
 */
export function createCommentFileDeletion(input: {
  db: Database.Database;
  localFiles: ReturnType<typeof createLocalCommentFiles>;
  hasActiveRun: (projectId: string) => boolean;
  runForWorkspace: (workspaceId: string) => typeof runVelaCommand;
  stopPublicFiles: (scope: { resourceTeamId: string; ownerMemberId: string; projectId: string }, target?: PublicFileDeleteTarget) => Promise<void>;
  isPresent: (projectId: string, filePath: string) => Promise<boolean>;
}): CommentFileDeletion {
  return async (projectId, target, mutate, mode) => {
    const selected = (fact: CommentFileFact) => matchesPublicFileDeleteTarget(fact.sourceFilePath, target);
    const rawState = getProject(input.db, projectId)?.metadata?._commentFiles;
    const state = parseCommentFileState(rawState);
    if (rawState !== undefined && !state) throw new Error('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
    const facts = state?.files.filter(fact => !fact.retired && selected(fact)) ?? [];
    const pending = pendingCommentFileRetirements(input.db, projectId).filter(row => selected(row.fact));
    const binding = getWorkspaceProjectByProjectId(input.db, projectId);
    if (!binding?.workspaceId || !binding.createdByWorkspaceMemberId) {
      const publication = (input.db.prepare('SELECT file_path FROM public_file_publications WHERE project_id = ?').all(projectId) as Array<{ file_path: string }>)
        .some(row => matchesPublicFileDeleteTarget(row.file_path, target));
      if (publication) throw new Error('PUBLIC_FILE_STOP_PENDING');
      if (facts.length || pending.length) throw new Error('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
      await mutate?.();
      return;
    }
    const scope = { projectId, workspaceId: binding.workspaceId, creatorMemberId: binding.createdByWorkspaceMemberId,
      run: input.runForWorkspace(binding.workspaceId) };
    if (facts.length || pending.length) {
      if (input.hasActiveRun(projectId)) throw new Error('COMMENT_FILE_PROJECT_BUSY');
      if (binding.resourceState !== 'active' || binding.cloudTombstonedAt != null) throw new Error('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
    }
    for (const row of pending) {
      if (row.workspaceId !== scope.workspaceId || row.creatorMemberId !== scope.creatorMemberId) {
        throw new Error('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
      }
    }
    if (mode === 'committed-retry') {
      if (!mutate || pending.some(row => !row.committed)) throw new Error('COMMENT_FILE_RETIREMENT_PENDING');
    } else {
      await input.stopPublicFiles({ resourceTeamId: binding.workspaceId,
        ownerMemberId: binding.createdByWorkspaceMemberId, projectId }, target);
    }
    // Permanent project removal owns its catalog/project tombstone separately.
    if (!mutate) return;
    const clear = (originals: readonly CommentFileFact[]) => {
      const remove = input.db.prepare('DELETE FROM comment_file_retirements WHERE project_id = ? AND source_file_id = ?');
      input.db.transaction(() => { for (const fact of originals) remove.run(projectId, fact.sourceFileId); })();
    };
    const reconcile = async (originals: readonly CommentFileFact[]) => {
      await input.localFiles.retireMany({ ...scope, facts: originals });
      clear(originals);
    };
    // A same-root retry completes only already-committed intents. It must not
    // repeat broad public stops or end lifetimes created on the new root.
    if (mode === 'committed-retry') {
      await reconcile(pending.map(row => row.fact));
      await mutate();
      return;
    }
    // Reconcile only this captured scope, even when bytes were already recreated.
    await reconcile(pending.flatMap(row => row.committed ? [row.fact] : []));
    const originals = [...new Map([
      ...facts.filter(fact => !pending.some(row => row.committed && row.fact.sourceFileId === fact.sourceFileId)),
      ...pending.flatMap(row => row.committed ? [] : [row.fact]),
    ].map(fact => [fact.sourceFileId, fact])).values()];
    // Partial recursive failure proves removal only for sources present when
    // this supported mutation began, never an unrelated earlier disappearance.
    const presentBefore = new Set<string>();
    if (typeof target === 'object') {
      for (const fact of originals) {
        if (await input.isPresent(projectId, fact.sourceFilePath)) presentBefore.add(fact.sourceFileId);
      }
    }
    const insert = input.db.prepare(`INSERT OR IGNORE INTO comment_file_retirements
      (project_id, source_file_id, workspace_id, creator_member_id, fact_json) VALUES (?, ?, ?, ?, ?)`);
    input.db.transaction(() => {
      for (const fact of originals) insert.run(projectId, fact.sourceFileId, scope.workspaceId, scope.creatorMemberId, JSON.stringify(fact));
    })();
    let failure: unknown;
    let failed = false;
    let changed = false;
    try { changed = await mutate() !== false; } catch (error) { failed = true; failure = error; }
    const committed: CommentFileFact[] = [];
    const retained: CommentFileFact[] = [];
    for (const fact of originals) {
      // A successful replacement of the working root is itself the local commit.
      // On failure, only ENOENT (not EACCES or other I/O uncertainty) is evidence.
      const missingRetry = (failure as NodeJS.ErrnoException)?.code === 'ENOENT'
        && pending.some(row => row.fact.sourceFileId === fact.sourceFileId);
      const checkMissing = failed && ((typeof target === 'object' && presentBefore.has(fact.sourceFileId)) || missingRetry);
      if ((!failed && changed) || (checkMissing && !await input.isPresent(projectId, fact.sourceFilePath))) committed.push(fact);
      else retained.push(fact);
    }
    input.db.transaction(() => {
      // A prior prepared intent may span a crash/replacement: a failed retry
      // cannot prove that those old bytes survived. Keep it frozen.
      clear(retained.filter(fact => !pending.some(row => row.fact.sourceFileId === fact.sourceFileId)));
      const mark = input.db.prepare('UPDATE comment_file_retirements SET committed = 1 WHERE project_id = ? AND source_file_id = ?');
      const tombstone = input.db.prepare(`UPDATE workspace_artifacts SET current_path = NULL, deleted_at = ?, updated_at = ?
        WHERE project_id = ? AND id = ? AND current_path = ? AND deleted_at IS NULL`);
      for (const fact of committed) {
        mark.run(projectId, fact.sourceFileId);
        // Local unlink is enough to end the old local pointer, not to fabricate
        // catalog admission. A replacement can never reuse this artifact UUID.
        tombstone.run(Date.now(), Date.now(), projectId, fact.sourceFileId, fact.sourceFilePath);
      }
    })();
    await reconcile(committed);
    if (failed) {
      // Retry of a completed captured delete reconciles authority even though
      // the local operation now reports absence. Never swallow other I/O errors.
      if (pending.length && !retained.length
        && (failure as NodeJS.ErrnoException)?.code === 'ENOENT') return;
      throw failure;
    }
  };
}

import { assertCommentFileNotPending } from './comment-file-retirements.js';
import type Database from 'better-sqlite3';
import type { CommentFileFact } from '@open-design/contracts';
import { ensureWorkspaceArtifactForPath, getLiveWorkspaceArtifactByPath } from '../chat-artifacts/store.js';
import { rebindLocalCommentFileIdentity } from './comment-file-identity-recovery.js';
import { getProject, getWorkspaceProjectByProjectId, updateProject } from '../db.js';
import type { runVelaCommand } from '../integrations/vela-command.js';
import { commitCommentFileFacts, retiredCommentFileMutation } from './comment-file-authority.js';
import { canonicalCommentFilePath, commentFilesAtReceipt, parseCommentFileState } from './comment-file-facts.js';

/** Paths whose current new-protocol lifetime must not be moved by managed rename.
 * Local pre-share comments carry a durable artifact UUID before catalog admission.
 * Join that exact UUID AND original path; never infer identities for historical rows.
 */
export function trackedCommentFilePaths(db: Database.Database, projectId: string): string[] {
  const facts = parseCommentFileState(getProject(db, projectId)?.metadata?._commentFiles)?.files ?? [];
  const retired = new Set(facts.filter(fact => fact.retired).map(fact => fact.sourceFileId));
  const local = db.prepare(`SELECT DISTINCT a.id, a.current_path AS path
    FROM workspace_artifacts a JOIN preview_comments c
      ON c.project_id = a.project_id AND c.source_file_id = a.id AND c.file_path = a.current_path
    WHERE a.project_id = ? AND a.deleted_at IS NULL AND a.current_path IS NOT NULL`)
    .all(projectId) as Array<{ id: string; path: string }>;
  return [...new Set([...facts.filter(fact => !fact.retired).map(fact => fact.sourceFilePath),
    ...local.filter(row => !retired.has(row.id)).map(row => row.path)])];
}

/** Creator-only producers use the existing artifact pointer; mirrors never remint it. */
export function createLocalCommentFiles(db: Database.Database) {
  function creator(projectId: string, workspaceId: string, memberId: string) {
    const binding = getWorkspaceProjectByProjectId(db, projectId);
    if (!binding || binding.workspaceId !== workspaceId || binding.createdByWorkspaceMemberId !== memberId
      || binding.resourceState !== 'active' || binding.cloudTombstonedAt != null) {
      throw new Error('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
    }
    return binding;
  }
  function identity(projectId: string, filePath: string, catalogState?: unknown): string {
    assertCommentFileNotPending(db, projectId, { filePath });
    if (!canonicalCommentFilePath(filePath)) throw new Error('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
    const state = parseCommentFileState(getProject(db, projectId)?.metadata?._commentFiles);
    const admitted = state?.files.find(fact => !fact.retired && fact.sourceFilePath === filePath);
    if (admitted) return admitted.sourceFileId;
    // Reuse catalog identity only for a missing local lifetime. Do not adopt
    // its old receipt: local bytes become admitted only after a fresh upload.
    // TODO(OPEND-4068): define deletion/recreation inheritance separately;
    // this recovery must not revive a locally or remotely retired lifetime.
    if (!state?.files.some(fact => fact.sourceFilePath === filePath)) {
      const remote = parseCommentFileState(catalogState)?.files.find(fact => !fact.retired && fact.sourceFilePath === filePath);
      if (remote) return remote.sourceFileId;
    }
    // A restart or another creator device may already have committed retirement.
    // Only tombstone this exact old UUID; never replace a mirror's local card ID.
    for (const retired of state?.files.filter(fact => fact.retired && fact.sourceFilePath === filePath) ?? []) {
      db.prepare('UPDATE workspace_artifacts SET current_path = NULL, deleted_at = ?, updated_at = ? WHERE project_id = ? AND id = ? AND current_path = ? AND deleted_at IS NULL')
        .run(Date.now(), Date.now(), projectId, retired.sourceFileId, filePath);
    }
    return ensureWorkspaceArtifactForPath(db, { projectId, path: filePath, kind: 'html' }).id;
  }
  async function admit(input: {
    projectId: string; workspaceId: string; creatorMemberId: string; resourceId: string; versionId: string;
    paths: Array<{ sourceFilePath: string; entryPath: string; sourceFileId?: string }>; run: typeof runVelaCommand;
  }) {
    creator(input.projectId, input.workspaceId, input.creatorMemberId);
    const recoveries = new Map<string, string>();
    const files = input.paths.map(file => {
      if (!canonicalCommentFilePath(file.sourceFilePath)) throw new Error('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
      assertCommentFileNotPending(db, input.projectId, { filePath: file.sourceFilePath });
      const known = parseCommentFileState(getProject(db, input.projectId)?.metadata?._commentFiles)?.files
        .some(fact => fact.sourceFilePath === file.sourceFilePath);
      const sourceFileId = !known && file.sourceFileId ? file.sourceFileId : identity(input.projectId, file.sourceFilePath);
      if (file.sourceFileId && file.sourceFileId !== sourceFileId) throw new Error('COMMENT_FILE_LIFETIME_CONFLICT');
      const local = !known && file.sourceFileId ? getLiveWorkspaceArtifactByPath(db, input.projectId, file.sourceFilePath) : null;
      if (local && local.id !== sourceFileId) {
        assertCommentFileNotPending(db, input.projectId, { sourceFileId: local.id });
        recoveries.set(file.sourceFilePath, local.id);
      }
      return { sourceFilePath: file.sourceFilePath, entryPath: file.entryPath, sourceFileId, retired: false };
    });
    if (!files.length) return;
    const state = await commitCommentFileFacts({ ...input, files });
    db.transaction(() => {
      creator(input.projectId, input.workspaceId, input.creatorMemberId);
      const previous = parseCommentFileState(getProject(db, input.projectId)?.metadata?._commentFiles);
      const adopted = commentFilesAtReceipt(previous, state, input);
      for (const file of files) {
        const localSourceFileId = recoveries.get(file.sourceFilePath);
        if (!localSourceFileId) continue;
        assertCommentFileNotPending(db, input.projectId, { filePath: file.sourceFilePath, sourceFileId: localSourceFileId });
        if (getLiveWorkspaceArtifactByPath(db, input.projectId, file.sourceFilePath)?.id !== localSourceFileId
          || previous?.files.some(fact => fact.sourceFileId === localSourceFileId)
          || state.files.some(fact => fact.sourceFileId === localSourceFileId)) {
          throw new Error('COMMENT_FILE_LIFETIME_CONFLICT');
        }
        rebindLocalCommentFileIdentity(db, { projectId: input.projectId, workspaceId: input.workspaceId,
          creatorMemberId: input.creatorMemberId, filePath: file.sourceFilePath,
          localSourceFileId, sourceFileId: file.sourceFileId });
      }
      updateProject(db, input.projectId, { metadata: { ...getProject(db, input.projectId)?.metadata, _commentFiles: adopted } });
    })();
  }
  /** One catalog CAS and one local adoption for the captured original lifetimes.
   * A failed later receipt must not retire an earlier file in a folder operation. */
  async function retireMany(input: {
    projectId: string; workspaceId: string; creatorMemberId: string; facts: readonly CommentFileFact[]; run: typeof runVelaCommand;
  }) {
    const originals = input.facts.map(fact => ({ ...fact }));
    const first = originals[0];
    if (!first) return;
    creator(input.projectId, input.workspaceId, input.creatorMemberId);
    const state = await commitCommentFileFacts({ ...input, resourceId: first.resourceId,
      versionId: first.versionId, files: originals.flatMap(original => retiredCommentFileMutation(original, first)) });
    creator(input.projectId, input.workspaceId, input.creatorMemberId);
    db.transaction(() => {
      const previous = parseCommentFileState(getProject(db, input.projectId)?.metadata?._commentFiles);
      const ids = new Set(originals.map(fact => fact.sourceFileId));
      const retired = new Map<string, CommentFileFact>();
      for (const fact of state.files) if (ids.has(fact.sourceFileId) && fact.retired) retired.set(fact.sourceFileId, fact);
      if (!previous || retired.size !== originals.length) throw new Error('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
      updateProject(db, input.projectId, { metadata: { ...getProject(db, input.projectId)?.metadata,
        _commentFiles: { schemaVersion: 1, revision: Math.max(previous.revision, state.revision),
          files: previous.files.map(fact => retired.get(fact.sourceFileId) ?? fact) } } });
      // Conditional artifact tombstones cannot delete concurrent F2 pointers.
      for (const original of originals) {
        db.prepare('UPDATE workspace_artifacts SET current_path = NULL, deleted_at = ?, updated_at = ? WHERE project_id = ? AND id = ? AND current_path = ? AND deleted_at IS NULL')
          .run(Date.now(), Date.now(), input.projectId, original.sourceFileId, original.sourceFilePath);
      }
    })();
  }
  async function retire(input: {
    projectId: string; workspaceId: string; creatorMemberId: string; fact: CommentFileFact; run: typeof runVelaCommand;
  }) {
    await retireMany({ ...input, facts: [input.fact] });
  }
  return { identity, admit, retire, retireMany };
}

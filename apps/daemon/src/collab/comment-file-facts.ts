import type { CollabCloudComment, CommentFileFact, CommentFileState } from '@open-design/contracts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function canonicalCommentFilePath(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && !value.includes('\0') && /\.html?$/i.test(value) && !value.includes('\\')
    && !value.startsWith('/') && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}

/** Only server response state is usable here. A proposed mutation is not admission. */
export function parseCommentFileState(value: unknown): CommentFileState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = value as CommentFileState;
  if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0
    || !Array.isArray(state.files) || state.files.length > 10_000) return null;
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const fact of state.files) {
    if (!fact || !uuid.test(fact.sourceFileId) || ids.has(fact.sourceFileId)
      || !canonicalCommentFilePath(fact.sourceFilePath) || !canonicalCommentFilePath(fact.entryPath)
      || typeof fact.resourceId !== 'string' || !fact.resourceId.trim()
      || typeof fact.versionId !== 'string' || !fact.versionId.trim() || typeof fact.retired !== 'boolean'
      || (!fact.retired && paths.has(fact.sourceFilePath))) return null;
    ids.add(fact.sourceFileId);
    if (!fact.retired) paths.add(fact.sourceFilePath);
  }
  return state;
}

export function commentFileSourceKey(projectId: string, sourceFileId: string): string {
  if (!projectId.trim() || !uuid.test(sourceFileId)) throw new Error('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
  return `comment-file-v1:${Buffer.from(projectId, 'utf8').toString('base64url')}:${sourceFileId}`;
}

/** Synchronous and shared by both inbound lanes. Unknown MUST abort the page transaction. */
export function normalizeCurrentFileComment(state: CommentFileState | null, comment: CollabCloudComment): CollabCloudComment | null {
  // Compact tombstones use only the exact project/comment-id stored target.
  if (comment.deleted) return comment;
  // Unsupported identity-less wire rows cannot acquire a guessed lifetime or
  // hold newer protocol rows behind them. Partial/unknown identities still abort.
  if (comment.sourceFileId === undefined && comment.sourceFilePath === undefined) return null;
  const fact = state?.files.find(item => item.sourceFileId === comment.sourceFileId);
  if (!fact || fact.sourceFilePath !== comment.sourceFilePath) throw new Error('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
  if (fact.retired) return null;
  return { ...comment, filePath: fact.sourceFilePath };
}

/** Select only facts whose bytes just committed. Do not install future facts on old content. */
export function commentFilesAtReceipt(
  previous: CommentFileState | null, incoming: CommentFileState | null,
  receipt: { resourceId: string; versionId: string },
  options: { authorizedCatalogRootId?: string } = {},
): CommentFileState | null {
  if (!incoming) return previous;
  if (previous && incoming.revision < previous.revision) throw new Error('COMMENT_FILE_REVISION_REGRESSION');
  if (options.authorizedCatalogRootId && receipt.resourceId !== options.authorizedCatalogRootId) {
    throw new Error('COMMENT_FILE_AUTHORITY_UNAVAILABLE');
  }
  const matched = incoming.files.filter(fact => fact.resourceId === receipt.resourceId && fact.versionId === receipt.versionId);
  if (matched.length === 0 && (!options.authorizedCatalogRootId || !incoming.files.some(fact => fact.retired))) return previous;
  const files = new Map<string, CommentFileFact>(previous?.files.map(fact => [fact.sourceFileId, fact]));
  for (const fact of matched) {
    const old = files.get(fact.sourceFileId);
    if (old && (old.sourceFilePath !== fact.sourceFilePath || (old.retired && !fact.retired))) {
      throw new Error('COMMENT_FILE_LIFETIME_CONFLICT');
    }
    files.set(fact.sourceFileId, fact);
  }
  // A permanent retirement retains its ORIGINAL receipt, even when the only
  // HTML disappeared. At an authorized exact-catalog ROOT commit, learn that
  // monotonic history without copying any future ACTIVE fact. The catalog
  // already attests root/registered-selected receipt ownership for this project.
  if (options.authorizedCatalogRootId) {
    for (const fact of incoming.files.filter(item => item.retired)) {
      const old = files.get(fact.sourceFileId);
      if (old && (old.sourceFilePath !== fact.sourceFilePath || (old.retired
        && (old.entryPath !== fact.entryPath || old.resourceId !== fact.resourceId || old.versionId !== fact.versionId)))) {
        throw new Error('COMMENT_FILE_LIFETIME_CONFLICT');
      }
      files.set(fact.sourceFileId, fact);
    }
  }
  const result: CommentFileState = { schemaVersion: 1, revision: incoming.revision, files: [...files.values()] };
  if (!parseCommentFileState(result)) throw new Error('COMMENT_FILE_LIFETIME_CONFLICT');
  return result;
}

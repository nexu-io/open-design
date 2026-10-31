import type Database from 'better-sqlite3';
import type { CommentFileFact } from '@open-design/contracts';

/** Only managed comment-file retirement intents. These are not catalog facts:
 * prepared means uncertain local outcome; committed means the supported local
 * mutation confirmed this lifetime's removal (including partial folder deletion).
 * Neither state may be used as an admitted retirement or a new file identity.
 */
export function migrateCommentFileRetirements(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS comment_file_retirements (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_file_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    creator_member_id TEXT NOT NULL,
    fact_json TEXT NOT NULL,
    committed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, source_file_id)
  )`);
}

export function pendingCommentFileRetirements(db: Database.Database, projectId: string) {
  return (db.prepare(`SELECT workspace_id, creator_member_id, fact_json, committed
    FROM comment_file_retirements WHERE project_id = ?`).all(projectId) as Array<{
    workspace_id: string; creator_member_id: string; fact_json: string; committed: number;
  }>).map(row => {
    let fact: CommentFileFact;
    try { fact = JSON.parse(row.fact_json) as CommentFileFact; }
    catch { throw new Error('COMMENT_FILE_RETIREMENT_PENDING'); }
    return { workspaceId: row.workspace_id, creatorMemberId: row.creator_member_id,
      fact, committed: row.committed === 1 };
  })
    .sort((a, b) => a.fact.sourceFilePath.localeCompare(b.fact.sourceFilePath));
}

export function assertCommentFileNotPending(db: Database.Database, projectId: string,
  file: { sourceFileId?: string; filePath?: string }): void {
  if (pendingCommentFileRetirements(db, projectId).some(row => row.fact.sourceFileId === file.sourceFileId
    || row.fact.sourceFilePath === file.filePath)) throw new Error('COMMENT_FILE_RETIREMENT_PENDING');
}

/** A root upload contains every path, so no pending lifetime may pass it. */
export function assertNoPendingCommentFileRetirements(db: Database.Database, projectId: string): void {
  if (pendingCommentFileRetirements(db, projectId).length) throw new Error('COMMENT_FILE_RETIREMENT_PENDING');
}

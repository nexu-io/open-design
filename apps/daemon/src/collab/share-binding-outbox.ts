import type Database from 'better-sqlite3';
import type { SharePublishReceipt, SharePublishResult } from '@open-design/contracts';

export interface ShareBindingIntent {
  resourceTeamId: string;
  ownerMemberId: string;
  resourceId: string;
  projectId: string;
  publicationRevision: string;
  receipt: SharePublishReceipt;
}
export interface ShareBindingTask extends ShareBindingIntent { id: number; failureCount: number }
export interface ShareBindingOutbox {
  enqueue(intent: ShareBindingIntent): ShareBindingTask;
  list(): ShareBindingTask[];
  fail(task: ShareBindingTask): void;
  complete(task: ShareBindingTask): void;
}

/** Validate and copy only the public, confirmed immutable publication fields. */
export function confirmedReceipt(value: SharePublishReceipt): SharePublishReceipt {
  if (!value || [value.filePath, value.slug, value.versionId, value.entryPath].some(v => typeof v !== 'string' || !v.trim())
    || !Number.isSafeInteger(value.version) || value.version < 1
    || !Number.isSafeInteger(value.publishedAt) || value.publishedAt < 0) throw new Error('SHARE_RECEIPT_REQUIRED');
  // Never spread transport objects: they may contain internal identifiers.
  return { filePath: value.filePath, slug: value.slug, publishedAt: value.publishedAt,
    version: value.version, versionId: value.versionId, entryPath: value.entryPath };
}

/** Binding-only outbox. No project FK and no credentials: survives local deletion.
 * Each immutable publication generation has its own task, never a stop intent.
 * A consumer must verify current generation and original identity before sending.
 */
export function createShareBindingOutbox(db: Database.Database): ShareBindingOutbox {
  db.exec(`CREATE TABLE IF NOT EXISTS share_binding_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_team_id TEXT NOT NULL, owner_member_id TEXT NOT NULL,
    resource_id TEXT NOT NULL, project_id TEXT NOT NULL, file_path TEXT NOT NULL,
    publication_revision TEXT NOT NULL, receipt_json TEXT NOT NULL,
    failure_count INTEGER NOT NULL DEFAULT 1 CHECK(failure_count BETWEEN 1 AND 5),
    UNIQUE(resource_team_id, owner_member_id, project_id, file_path, publication_revision)
  )`);
  const select = db.prepare(`SELECT id, resource_team_id AS resourceTeamId, owner_member_id AS ownerMemberId,
    resource_id AS resourceId, project_id AS projectId, publication_revision AS publicationRevision,
    receipt_json AS receiptJson, failure_count AS failureCount FROM share_binding_outbox ORDER BY id`);
  const insert = db.prepare(`INSERT INTO share_binding_outbox
    (resource_team_id,owner_member_id,resource_id,project_id,file_path,publication_revision,receipt_json)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`);
  const remove = db.prepare('DELETE FROM share_binding_outbox WHERE id = ? AND publication_revision = ? AND failure_count = ?');
  const fail = db.prepare('UPDATE share_binding_outbox SET failure_count = MIN(5, failure_count + 1) WHERE id = ? AND publication_revision = ? AND failure_count = ?');
  const list = (): ShareBindingTask[] => (select.all() as Array<Omit<ShareBindingTask, 'receipt'> & { receiptJson: string }>).map(row => {
    const { receiptJson, ...task } = row;
    try {
      return { ...task, receipt: confirmedReceipt(JSON.parse(receiptJson)) };
    } catch {
      // Corrupt durable state must not become an empty/successful queue or
      // expose raw stored payloads in parser diagnostics.
      throw new Error('SHARE_BINDING_STORAGE_INVALID');
    }
  });
  const enqueue = db.transaction((input: ShareBindingIntent): ShareBindingTask => {
    const receipt = confirmedReceipt(input.receipt);
    if ([input.resourceTeamId, input.ownerMemberId, input.resourceId, input.projectId, input.publicationRevision]
      .some(v => typeof v !== 'string' || !v.trim())) throw new Error('SHARE_BINDING_IDENTITY_REQUIRED');
    insert.run(input.resourceTeamId, input.ownerMemberId, input.resourceId, input.projectId,
      receipt.filePath, input.publicationRevision, JSON.stringify(receipt));
    const task = list().find(item => item.resourceTeamId === input.resourceTeamId && item.ownerMemberId === input.ownerMemberId
      && item.projectId === input.projectId && item.receipt.filePath === receipt.filePath && item.publicationRevision === input.publicationRevision);
    if (!task || task.resourceId !== input.resourceId || JSON.stringify(task.receipt) !== JSON.stringify(receipt)) throw new Error('SHARE_BINDING_GENERATION_CONFLICT');
    return task;
  });
  return { enqueue, list,
    fail: task => { fail.run(task.id, task.publicationRevision, task.failureCount); },
    complete: task => { remove.run(task.id, task.publicationRevision, task.failureCount); },
  };
}

/** Use only after server-confirmed content publication and failed binding.
 * Availability is explicit: storage alone is not an automatic retry mechanism.
 */
export function recordPendingShareBinding(outbox: ShareBindingOutbox, intent: ShareBindingIntent, retryAvailable = false, propagateStorageFailure = false): SharePublishResult {
  const receipt = confirmedReceipt(intent.receipt);
  try {
    const task = outbox.enqueue({ ...intent, receipt });
    return { status: 'binding_pending', receipt, binding: { retrying: retryAvailable && task.failureCount < 5 } };
  } catch (error) {
    if (propagateStorageFailure) throw error;
    return { status: 'binding_pending', receipt, binding: { retrying: false, code: 'SHARE_BINDING_RETRY_UNAVAILABLE' } };
  }
}

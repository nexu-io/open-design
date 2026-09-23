import type Database from 'better-sqlite3';
import type { SharePublishResult } from '@open-design/contracts';
import type { PublicFilePublication, PublicFilePublicationScope } from './public-file-publication-store.js';
import type { RecordPublicFilePublication } from './public-file-publication-recording.js';
import { confirmedReceipt, recordPendingShareBinding, type ShareBindingOutbox } from './share-binding-outbox.js';
import { publishedPathForSource, type ShareFileMapping } from './share-file-mapping.js';

export interface SharePublicationCompletionInput {
  scope: PublicFilePublicationScope;
  resourceId: string;
  publication: PublicFilePublication;
  mapping: ShareFileMapping;
  result: SharePublishResult;
}

/** Persist local witnesses and both kinds of intent in one transaction, after
 * confirmed network publication. A failed pending write retains the receipt in
 * the response, but cannot promise an automatic binding retry.
 * All dependencies must use the same database; no callback performs network I/O.
 */
export function createSharePublicationCompletion(
  db: Database.Database,
  recordPublication: RecordPublicFilePublication,
  outbox: ShareBindingOutbox,
  retryAvailable = false,
) {
  const commit = db.transaction((input: SharePublicationCompletionInput): SharePublishResult => {
    const revision = recordPublication(input.scope, input.publication, input.mapping);
    if (input.result.status === 'published') return input.result;
    const pending = recordPendingShareBinding(outbox, { ...input.scope, resourceId: input.resourceId,
      publicationRevision: revision.token, receipt: input.result.receipt }, retryAvailable, true);
    if (pending.status !== 'binding_pending') throw new Error('SHARE_BINDING_OUTCOME_INVALID');
    return { status: 'binding_pending', receipt: input.result.receipt,
      binding: { retrying: pending.binding.retrying,
        ...(input.result.binding.code ? { code: input.result.binding.code } : {}) } };
  });
  return (input: SharePublicationCompletionInput): SharePublishResult => {
    const receipt = confirmedReceipt(input.result.receipt);
    if (receipt.filePath !== input.scope.filePath || receipt.slug !== input.publication.slug
      || receipt.entryPath !== publishedPathForSource(input.mapping, input.scope.filePath)) {
      throw new Error('SHARE_PUBLICATION_RECEIPT_MISMATCH');
    }
    input = { ...input, result: { ...input.result, receipt } };
    try { return commit(input); }
    catch (error) {
      if (input.result.status === 'published') throw error;
      return { status: 'binding_pending', receipt: input.result.receipt,
        binding: { retrying: false, code: 'SHARE_BINDING_RETRY_UNAVAILABLE' } };
    }
  };
}

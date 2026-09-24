import type { SharePublishResult } from '@open-design/contracts';
import type { runVelaCommand } from '../integrations/vela-command.js';
import type { PublicFilePublicationScope, PublicFilePublicationStore } from './public-file-publication-store.js';
import type { ShareBindingOutbox } from './share-binding-outbox.js';
import { bindVelaShareVersion, resumeVelaShareVersion } from './vela-share-binding.js';

/** Caller holds the project mutation lock and verified the original author.
 * An explicit retry finishes the current durable generation: never push bytes,
 * publish another version, rotate the alias, or replace the local witness. */
export async function resumePendingShareBinding(scope: PublicFilePublicationScope,
  publications: PublicFilePublicationStore, outbox: ShareBindingOutbox,
  run: typeof runVelaCommand, stoppedSlug?: string): Promise<SharePublishResult | null> {
  const witness = publications.getRevision(scope);
  if (!witness) return null;
  const task = outbox.list().find(item => item.resourceTeamId === scope.resourceTeamId
    && item.ownerMemberId === scope.ownerMemberId && item.projectId === scope.projectId
    && item.receipt.filePath === scope.filePath && item.receipt.slug === witness.slug
    && item.publicationRevision === witness.token);
  if (!task) return null;
  try {
    const complete = stoppedSlug === task.receipt.slug ? resumeVelaShareVersion : bindVelaShareVersion;
    await complete({ workspaceId: task.resourceTeamId, projectId: task.projectId,
      resourceId: task.resourceId, sourceFilePath: task.receipt.filePath, slug: task.receipt.slug,
      version: task.receipt.version, versionId: task.receipt.versionId }, run);
  } catch {
    let retrying = false;
    try { outbox.fail(task); retrying = task.failureCount + 1 < 5; } catch { /* Receipt still exists. */ }
    return { status: 'binding_pending', receipt: task.receipt,
      binding: { retrying, code: 'PUBLIC_SHARE_BINDING_FAILED' } };
  }
  try { outbox.complete(task); } catch { console.warn('[od] confirmed binding queue cleanup unavailable'); }
  return { status: 'published', receipt: task.receipt };
}

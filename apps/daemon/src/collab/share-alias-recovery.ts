import { ShareAliasIdentityMismatchError, type createShareAliasReservations } from './share-alias-reservation.js';
import { currentFileSharePublication, type ProjectShareState } from './vela-project-share-state.js';
import type { PublicFilePublicationScope, PublicFilePublicationStore } from './public-file-publication-store.js';
import type { ShareBindingOutbox } from './share-binding-outbox.js';

/** Only authoritative absence permits a new alias. A matching cloud lifetime
 * restores its original alias; a local unpublished reservation is not authority
 * to replace it. Never discard a conflicting confirmed/pending publication.
 */
export function reserveFileShareAlias(input: {
  scope: PublicFilePublicationScope;
  history: ProjectShareState | null;
  reservations: ReturnType<typeof createShareAliasReservations>;
  publications: PublicFilePublicationStore;
  outbox: ShareBindingOutbox;
}) {
  const { scope, history, reservations, publications, outbox } = input;
  if (!history || history.projectId !== scope.projectId) throw new Error('SHARE_STATE_UNAVAILABLE');
  if (scope.sourceFileId && history.publications.some(item => item.sourceFileId === scope.sourceFileId
    && item.sourceFilePath !== scope.filePath)) throw new ShareAliasIdentityMismatchError();
  const cloud = currentFileSharePublication(history, scope.filePath, scope.sourceFileId);
  if (!cloud) {
    // Multiple entries for one lifetime are ambiguous, not first publication.
    if (history.publications.some(item => item.sourceFilePath === scope.filePath
      && item.sourceFileId === scope.sourceFileId)) throw new ShareAliasIdentityMismatchError();
    return reservations.reserve(scope);
  }
  if (!scope.sourceFileId || cloud.sourceFileId !== scope.sourceFileId) throw new ShareAliasIdentityMismatchError();
  const existing = reservations.get(scope);
  const local = publications.getRevision(scope);
  if ((local && local.slug !== cloud.slug)
    || (existing && existing.slug !== cloud.slug && history.publications.some(item => item.slug === existing.slug))
    || outbox.list().some(task => task.resourceTeamId === scope.resourceTeamId && task.ownerMemberId === scope.ownerMemberId
      && task.projectId === scope.projectId && task.receipt.filePath === scope.filePath && task.receipt.slug !== cloud.slug)) {
    throw new ShareAliasIdentityMismatchError();
  }
  return reservations.restore(scope, cloud);
}

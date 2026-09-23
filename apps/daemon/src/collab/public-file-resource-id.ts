import type { PublicFilePublicationScope } from './public-file-publication-store.js';

/** One stable identity for publication and source deletion, including retries
 * after local bytes/project rows are gone. Never derive it from current login. */
export function publicFileResourceIdFor(scope: PublicFilePublicationScope): string {
  const scoped = Buffer.from(JSON.stringify([scope.resourceTeamId, scope.ownerMemberId, scope.projectId, scope.filePath]), 'utf8').toString('base64url');
  return `project-file-${scoped}`;
}

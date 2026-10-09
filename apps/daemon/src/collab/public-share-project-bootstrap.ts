import type { TeamProject } from '@open-design/contracts';
import { isUnmaterializedSharedPlaceholder } from './shared-project-placeholder.js';
import type { runVelaCommand } from '../integrations/vela-command.js';
import { projectResourceIdFor } from '../integrations/vela-team-projects.js';
import type { ResourceHubPrincipal } from './resource-principal.js';
import { createVelaCliResourceAdapter } from './vela-cli-resource-adapter.js';
import { createVelaCliTeamProjectCatalog } from './vela-cli-team-projects.js';

/** Called only for a proven local author. Reuse the project root transport and
 * catalog with one captured session; never republish a file alias here. */
export async function ensurePublicShareProject(input: {
  projectId: string;
  principal: ResourceHubPrincipal;
  run: typeof runVelaCommand;
  resolveProjectDir(projectId: string): string | Promise<string>;
  describeProject(projectId: string): Record<string, unknown> | null;
}): Promise<TeamProject> {
  const { projectId, principal, run } = input;
  const metadata = input.describeProject(projectId);
  // A hub-to-local shell must never be uploaded in the opposite direction.
  if (!metadata || isUnmaterializedSharedPlaceholder({ metadata: metadata.metadata })) {
    throw new Error('PUBLIC_SHARE_PROJECT_CONTENT_UNAVAILABLE');
  }
  const catalog = createVelaCliTeamProjectCatalog({
    run: args => run(['team-projects', ...args]),
    runResource: args => run(['resource', ...args]), supportsTeamProjects: () => true,
  });
  // The caller already established authoritative catalog absence. Do not repeat
  // that negative lookup through the pinned runner, which deliberately redacts
  // CLI error text (including 404); verify the positive registration below.
  const root = createVelaCliResourceAdapter({
    resolveProjectDir: input.resolveProjectDir, describeProject: input.describeProject,
    hasTeamIdentity: candidate => candidate?.teamId === principal.teamId && candidate.memberId === principal.memberId,
    run: args => run(['resource', ...args]),
  });
  const version = await root.publish({ projectId, principal, reason: 'public-share-project-bootstrap' });
  if (!version?.versionId) throw new Error('PUBLIC_SHARE_PROJECT_ROOT_UNAVAILABLE');
  await catalog.upsert({ projectId, resourceId: projectResourceIdFor(projectId, principal),
    displayName: typeof metadata?.name === 'string' ? metadata.name : projectId,
    syncState: 'synced', lastSyncedVersionId: version.versionId, metadata }, principal);
  const registered = await catalog.get(projectId, principal.teamId);
  if (!registered) throw new Error('PUBLIC_SHARE_PROJECT_CATALOG_UNAVAILABLE');
  return registered;
}

import type { PublicShareProjectRegistration } from '@open-design/contracts';
import { projectResourceIdFor } from '../src/integrations/vela-team-projects.js';
import type { ResourceHubPrincipal } from '../src/collab/resource-principal.js';
import type { CreateCollabRuntimeOptions } from '../src/collab/runtime.js';

/** Unit-test catalog response for an already shared Team project. */
export async function teamProjectRegistration(
  projectId: string,
  principal: ResourceHubPrincipal,
): Promise<PublicShareProjectRegistration> {
  return {
    projectId, workspaceId: principal.teamId, ownerMemberId: principal.memberId,
    resourceId: projectResourceIdFor(projectId, principal), visibility: 'team',
    createdAt: '2026-01-01T00:00:00Z',
  };
}

/** Existing Team catalog transport for tests of sync, rather than policy admission. */
export function withTeamProjectCatalog(options: CreateCollabRuntimeOptions = {}): CreateCollabRuntimeOptions {
  const deleted = new Set<string>();
  const visibility = new Map<string, 'private' | 'team'>();
  const key = (id: string, principal: ResourceHubPrincipal) => `${principal.teamId}\u0000${id}`;
  const registration = async (id: string, principal: ResourceHubPrincipal): Promise<PublicShareProjectRegistration> => ({
    ...await teamProjectRegistration(id, principal),
    visibility: visibility.get(key(id, principal)) ?? 'team',
  });
  return {
    ...options,
    teamProjectCatalog: {
      upsert: async () => {},
      getRegistration: async (id, principal) => deleted.has(key(id, principal)) ? null : registration(id, principal),
      ensurePrivate: async (id, principal) => { deleted.delete(key(id, principal)); return registration(id, principal); },
      remove: async (id, principal) => { if (principal) deleted.add(key(id, principal)); },
      setVisibility: async (id, policy, principal) => { visibility.set(key(id, principal), policy); },
      ...options.teamProjectCatalog,
    },
  };
}

import type { TeamResourceRequestScope } from './team-resource-share.js';

export const TEAM_RESOURCE_LIST_KINDS = ['design_system', 'plugin', 'skill'] as const;

export type TeamResourceListKind = (typeof TEAM_RESOURCE_LIST_KINDS)[number];

export interface TeamResourceListInvalidator {
  invalidate(scope: TeamResourceRequestScope): void;
}

export function invalidateTeamResourceListingCaches(input: {
  resourceKind?: string;
  scope: TeamResourceRequestScope;
  providers: Record<TeamResourceListKind, TeamResourceListInvalidator>;
  invalidateSharedCommand: (workspaceId: string) => void;
}): void {
  const kinds = input.resourceKind
    ? TEAM_RESOURCE_LIST_KINDS.filter((kind) => kind === input.resourceKind)
    : TEAM_RESOURCE_LIST_KINDS;
  for (const kind of kinds) {
    input.providers[kind].invalidate(input.scope);
  }
  input.invalidateSharedCommand(input.scope.principal.teamId);
}

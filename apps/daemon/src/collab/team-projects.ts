// Team-wide shared-project discovery. The Vela CLI is the only production
// transport: it reuses the login session and keeps backend credentials out of
// the OpenDesign daemon.

import type { TeamProject } from '@open-design/contracts';
import {
  createVelaCliTeamProjectCatalog,
  shouldUseVelaCliTeamProjectCatalog,
  type VelaTeamProjectCatalog,
} from './vela-cli-team-projects.js';

export interface CreateTeamProjectsListerOptions {
  /** Injectable Vela catalog for tests. */
  teamProjectCatalog?: VelaTeamProjectCatalog;
  env?: NodeJS.ProcessEnv;
}

export function createTeamProjectsLister(
  options: CreateTeamProjectsListerOptions,
): (workspaceId: string) => Promise<TeamProject[]> {
  const env = options.env ?? process.env;
  return async (workspaceId: string) => {
    const scopedWorkspaceId = workspaceId.trim();
    if (!scopedWorkspaceId) return [];
    if (options.teamProjectCatalog) return options.teamProjectCatalog.list(workspaceId);
    if (!shouldUseVelaCliTeamProjectCatalog(env)) return [];
    return createVelaCliTeamProjectCatalog().list(scopedWorkspaceId);
  };
}

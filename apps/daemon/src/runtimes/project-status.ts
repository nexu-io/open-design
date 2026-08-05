import type { ProjectDisplayStatus, ProjectStatusInfo } from '@open-design/contracts';

export type ProjectStatusInput = {
  value?: string;
  updatedAt?: number;
  runId?: string;
};

/**
 * Project status projection shared by the daemon's route composition and
 * persisted/run-derived status sources.
 */
export function normalizeProjectDisplayStatus(
  status: string,
): ProjectDisplayStatus {
  return (status === 'starting' || status === 'queued' ? 'running' : status) as ProjectDisplayStatus;
}

export function composeProjectDisplayStatus(
  baseStatus: ProjectStatusInput,
  awaitingInputProjects: ReadonlySet<string>,
  projectId: string,
): ProjectStatusInfo {
  if (
    baseStatus.value === 'succeeded' &&
    awaitingInputProjects.has(projectId)
  ) {
    return { ...baseStatus, value: 'awaiting_input' };
  }
  return {
    ...baseStatus,
    value: normalizeProjectDisplayStatus(baseStatus.value ?? 'not_started'),
  };
}

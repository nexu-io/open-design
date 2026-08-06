/**
 * Group properties derived from an authoritative Workspace project-list read.
 * Only canonical views update the group: filtered subsets must never overwrite
 * the Workspace's total project count.
 */
export function workspaceProjectGroupCountProperties(input: {
  view: string;
  owner: string;
  visibility: string;
  projectCount: number;
}): Record<string, number> | null {
  if (
    (input.view === 'all' || input.view === 'recent')
    && input.owner === 'all'
    && input.visibility === 'all'
  ) {
    return { project_count: input.projectCount };
  }
  if (input.view === 'drafts') {
    return { draft_project_count: input.projectCount };
  }
  if (input.view === 'team') {
    return { team_project_count: input.projectCount };
  }
  return null;
}

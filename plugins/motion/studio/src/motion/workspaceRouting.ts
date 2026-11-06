import { parseProjectIdFromHash } from '../utils/projectRouting';
import { sessionPath } from '../../../shared/workspace-url';

export const projectHref = (id: string) => `/?project=${encodeURIComponent(id)}#project/${encodeURIComponent(id)}`;
export const sessionHref = (id: string, projectId?: string, openArtifact = false) => sessionPath(id, projectId, { openArtifact });
export const validWorkspaceProject = (id: string) => /^(?:project|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(id);

/** Hash links from MCP and query links from the sidebar both address the same project. */
export function requestedProject(search: string, hash: string): string | null {
  const query = new URLSearchParams(search).get('project');
  return query ?? parseProjectIdFromHash(hash) ?? (hash.startsWith('#project/') ? '' : null);
}

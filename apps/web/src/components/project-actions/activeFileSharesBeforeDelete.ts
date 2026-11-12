import type { WorkspaceCollabContext } from '@open-design/contracts';
import { currentWorkspaceAccountGeneration, workspaceProjectHeaders } from '../../collab/workspace-identity';
import { isProjectShareHistory } from '../share/useProjectShareHistory';

/** Read only the exact HTML files targeted by a destructive file operation.
 * Unknown/unauthorized responses must never be presented as zero active links. */
export async function activeFileSharesBeforeDelete(
  projectId: string,
  filePaths: readonly string[],
  context: WorkspaceCollabContext | null | undefined,
): Promise<number | null> {
  const htmlPaths = new Set(filePaths.filter(path => /\.html?$/i.test(path)));
  if (htmlPaths.size === 0) return null;
  if (!context) throw new Error('workspace identity unavailable for shared HTML deletion');
  const generation = currentWorkspaceAccountGeneration();
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/share-state`, {
    cache: 'no-store', headers: workspaceProjectHeaders(context),
  });
  const history: unknown = response.ok ? await response.json() : null;
  if (generation !== currentWorkspaceAccountGeneration() || !isProjectShareHistory(history, projectId)) {
    throw new Error('share-state unavailable or account changed');
  }
  return history.publications.filter(row => row.status === 'active' && htmlPaths.has(row.sourceFilePath)).length;
}

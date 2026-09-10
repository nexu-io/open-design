import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { ProjectMediaTasksResponse } from './contracts';
import { workspaceProjectHeaders } from '../../../collab/workspace-identity';
export { projectRawUrl } from '../../../providers/registry';
export async function fetchProjectMediaTasks(projectId: string, workspaceContext?: WorkspaceCollabContext | null): Promise<ProjectMediaTasksResponse> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/media/tasks?includeDone=1`, {cache:'no-store', headers: workspaceContext ? workspaceProjectHeaders(workspaceContext) : undefined});
  // Older servers do not expose the media-task projection. The chat derives
  // execution records from the existing message events in that case.
  if (response.status === 404) return { tasks: [] };
  if (!response.ok) throw new Error(`media tasks ${response.status}`);
  return response.json();
}
export function notifyCompletionFeedbackGesture(): void {
  window.dispatchEvent(new Event('od:completion-feedback-gesture'));
}

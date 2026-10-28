import type { ChatSessionMode, WorkspaceCollabContext } from '@open-design/contracts';
import type { Project, ProjectMetadata } from '../types';
import { applyPlugin, listConversations, patchConversation, patchProject } from './projects';

const STORAGE_KEY = 'open-design:project-home-entry';

export function readProjectHomeEntry(): string | null {
  try { return sessionStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function rememberProjectHomeEntry(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* The live entry still works when storage is unavailable. */ }
}

/** Submit Home's first brief into the named project, without creating a copy. */
export async function prepareProjectHomeEntry(
  project: Project,
  input: {
    name: string;
    skillId: string | null;
    designSystemId: string | null;
    metadata?: ProjectMetadata;
    pendingPrompt?: string;
    conversationMode?: ChatSessionMode;
    pluginId?: string;
    pluginSource?: string;
    pluginInputs?: Record<string, unknown>;
  },
  workspaceContext: WorkspaceCollabContext | null,
): Promise<Project> {
  if (input.pluginId) {
    const applied = await applyPlugin(input.pluginId, {
      projectId: project.id,
      pluginSource: input.pluginSource,
      inputs: input.pluginInputs,
      workspaceContext,
    });
    if (!applied) throw new Error('Could not apply the selected creation type. Please try again.');
  }
  if (input.conversationMode) {
    const conversations = await listConversations(project.id, { workspaceContext, throwOnError: true });
    const initial = conversations[0];
    if (initial && initial.sessionMode !== input.conversationMode) {
      const updated = await patchConversation(project.id, initial.id, {
        sessionMode: input.conversationMode,
      }, workspaceContext);
      if (!updated) throw new Error('Could not save the conversation mode. Please try again.');
    }
  }
  const userNamed = project.metadata?.nameSource === 'user';
  const updated = await patchProject(project.id, {
    name: userNamed ? project.name : input.name,
    skillId: input.skillId,
    designSystemId: input.designSystemId,
    pendingPrompt: input.pendingPrompt,
    metadata: {
      ...project.metadata,
      ...input.metadata,
      kind: input.metadata?.kind ?? project.metadata?.kind ?? 'other',
      nameSource: userNamed ? 'user' : 'prompt',
    },
  }, workspaceContext);
  if (!updated) throw new Error('Could not save the project brief. Please try again.');
  return updated;
}

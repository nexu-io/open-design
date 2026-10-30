import { useSyncExternalStore } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { fetchProjectFiles } from '../providers/registry';
import { navigate } from '../router';

type ShareRequest = { projectId: string; fileName: string };
let pending: ShareRequest | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => pending;
const serverSnapshot = () => null;

/** Retain the request across project navigation until its viewer mounts. */
export function requestProjectShare(projectId: string, fileName: string) {
  pending = { projectId, fileName };
  listeners.forEach((listener) => listener());
}
/** Open a project's first HTML page with its share dialog requested.
 * Resolves false when the project has no page to share. */
export async function shareProjectToTeam(
  projectId: string,
  workspaceContext?: WorkspaceCollabContext | null,
): Promise<boolean> {
  const files = await fetchProjectFiles(projectId, { workspaceContext });
  const file = files.find((entry) => /\.html?$/i.test(entry.name));
  if (!file) return false;
  requestProjectShare(projectId, file.name);
  navigate({ kind: 'project', projectId, conversationId: null, fileName: file.name });
  return true;
}
export function clearProjectShareRequest(request: ShareRequest) {
  if (pending !== request) return;
  pending = null;
  listeners.forEach((listener) => listener());
}
export function useProjectShareRequest() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

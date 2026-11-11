import { useSyncExternalStore } from 'react';
import type { WorkspaceCollabContext, WorkspaceContextChangedSsePayload } from '@open-design/contracts';

export interface WorkspaceRemovalNotice {
  workspaceId: string;
  workspaceMemberId: string;
  workspaceName: string;
}
let notice: WorkspaceRemovalNotice | null = null;
const listeners = new Set<() => void>();
export function currentWorkspaceRemoval(): WorkspaceRemovalNotice | null { return notice; }
export function clearWorkspaceRemoval(): void {
  if (!notice) return;
  notice = null;
  listeners.forEach(listener => listener());
}
export function recordWorkspaceRemoval(
  event: WorkspaceContextChangedSsePayload,
  context: WorkspaceCollabContext | null,
): boolean {
  const removal = event.memberRemoval;
  if (!context || removal?.reason !== 'member-removed'
    || removal.workspaceId !== context.workspaceId
    || removal.workspaceMemberId !== context.workspaceMemberId) return false;
  if (notice && notice.workspaceId === removal.workspaceId && notice.workspaceMemberId === removal.workspaceMemberId) return true;
  notice = { ...removal, workspaceName: context.workspaceName || context.workspaceId };
  listeners.forEach(listener => listener());
  return true;
}
export function useWorkspaceRemoval(): WorkspaceRemovalNotice | null {
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, currentWorkspaceRemoval, () => null);
}

import type {
  WorkspaceCollabContext,
  WorkspaceDirectoryItem,
} from '@open-design/contracts';
import type { WorkspaceDirectoryFetchResult } from '../collab/vela-workspace-context.js';
import { workspaceContextFromDirectoryItem } from '../collab/vela-workspace-context.js';

export interface PersistedAutomationWorkspaceScope {
  workspaceId: string;
  workspaceMemberId: string;
}

export class AutomationWorkspaceScopeError extends Error {
  constructor(
    readonly code:
      | 'WORKSPACE_AUTHORITY_UNAVAILABLE'
      | 'WORKSPACE_ACCESS_DENIED'
      | 'WORKSPACE_PROJECT_PERMISSION_DENIED',
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AutomationWorkspaceScopeError';
  }
}

export function normalizePersistedAutomationWorkspaceScope(
  value: unknown,
): PersistedAutomationWorkspaceScope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const workspaceId = typeof raw.workspaceId === 'string' ? raw.workspaceId.trim() : '';
  const workspaceMemberId =
    typeof raw.workspaceMemberId === 'string' ? raw.workspaceMemberId.trim() : '';
  return workspaceId && workspaceMemberId ? { workspaceId, workspaceMemberId } : null;
}

/**
 * Persist an automation's exact Workspace billing address on its new project.
 *
 * This is intentionally not an authorization check. The local membership
 * directory is UI/collaboration state and can be stale or temporarily
 * unavailable; it must never select a different wallet. At AMR spawn time the
 * daemon sends this persisted Workspace id together with the signed-in account
 * credentials, and the Vela backend remains the final membership, permission,
 * and billing authority.
 */
export function bindProjectToPersistedAutomationWorkspace(
  ensureWorkspaceProject: (input: {
    projectId: string;
    workspaceId: string;
    visibility: 'personal';
    resourceState: 'active';
    createdByWorkspaceMemberId: string;
    updatedByWorkspaceMemberId: string;
    syncState: 'local_only';
    resourceHubResourceId: null;
    cloudTombstonedAt: null;
    createdAt: number;
    updatedAt: number;
  }) => unknown,
  scope: PersistedAutomationWorkspaceScope | null,
  projectId: string,
  now: number,
): void {
  if (!scope) return;
  ensureWorkspaceProject({
    projectId,
    workspaceId: scope.workspaceId,
    visibility: 'personal',
    resourceState: 'active',
    createdByWorkspaceMemberId: scope.workspaceMemberId,
    updatedByWorkspaceMemberId: scope.workspaceMemberId,
    syncState: 'local_only',
    resourceHubResourceId: null,
    cloudTombstonedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

async function fetchDirectoryOrThrow(
  fetchWorkspaceDirectory: (() => Promise<WorkspaceDirectoryFetchResult>) | undefined,
): Promise<WorkspaceDirectoryItem[]> {
  if (!fetchWorkspaceDirectory) {
    throw new AutomationWorkspaceScopeError(
      'WORKSPACE_AUTHORITY_UNAVAILABLE',
      'workspace membership authority is not configured',
      true,
    );
  }
  let directory: WorkspaceDirectoryFetchResult;
  try {
    directory = await fetchWorkspaceDirectory();
  } catch {
    directory = { ok: false, items: [] };
  }
  if (!directory.ok) {
    throw new AutomationWorkspaceScopeError(
      'WORKSPACE_AUTHORITY_UNAVAILABLE',
      'workspace membership authority is temporarily unavailable',
      true,
    );
  }
  return directory.items;
}

function activeWritableContext(
  context: WorkspaceCollabContext | null,
): WorkspaceCollabContext | null {
  return context
    && context.memberStatus === 'active'
    && context.lifecycleState === 'active'
    && context.permissions.canWriteSyncedFiles
    ? context
    : null;
}

/**
 * Re-authorize a Workspace/member pair captured when an unattended automation
 * was configured. No daemon-global current/active Workspace participates.
 */
export async function authorizePersistedAutomationWorkspaceScope(
  scope: PersistedAutomationWorkspaceScope,
  fetchWorkspaceDirectory: (() => Promise<WorkspaceDirectoryFetchResult>) | undefined,
): Promise<WorkspaceCollabContext> {
  const items = await fetchDirectoryOrThrow(fetchWorkspaceDirectory);
  const item = items.find(
    (candidate) =>
      candidate.workspaceId === scope.workspaceId
      && candidate.workspaceMemberId === scope.workspaceMemberId,
  );
  const context = activeWritableContext(item ? workspaceContextFromDirectoryItem(item) : null);
  if (!context) {
    throw new AutomationWorkspaceScopeError(
      'WORKSPACE_ACCESS_DENIED',
      'the automation Workspace is no longer writable by this member',
      false,
    );
  }
  return context;
}

/**
 * Resolve a reused project's persisted binding. The project row chooses the
 * Workspace; the signed-in directory supplies the current member and authority.
 */
export async function authorizePersistedProjectWorkspace(
  workspaceIdInput: string,
  fetchWorkspaceDirectory: (() => Promise<WorkspaceDirectoryFetchResult>) | undefined,
): Promise<WorkspaceCollabContext> {
  const workspaceId = workspaceIdInput.trim();
  const items = await fetchDirectoryOrThrow(fetchWorkspaceDirectory);
  const item = items.find((candidate) => candidate.workspaceId === workspaceId);
  const context = activeWritableContext(item ? workspaceContextFromDirectoryItem(item) : null);
  if (!context) {
    throw new AutomationWorkspaceScopeError(
      'WORKSPACE_PROJECT_PERMISSION_DENIED',
      'the reused project Workspace is no longer writable by this member',
      false,
    );
  }
  return context;
}

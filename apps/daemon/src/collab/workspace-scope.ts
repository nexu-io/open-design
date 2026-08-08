// Single workspace-scope resolution entry for every workspace-scoped vela
// call, per the B-line explicit-workspace handoff. B's account-level Active
// Workspace is shared mutable state across a user's devices; a daemon task
// that re-read it per tick could silently flip workspaces mid-flight. The
// client therefore pins its own scope with a fixed priority and only lets the
// server's Active Workspace apply when it genuinely has no opinion:
//
//   1. `explicit`            — the id this specific call was asked to target;
//   2. `projectWorkspaceId`  — the workspace a project belongs to (its shared
//                              projection row), for project-scoped calls like
//                              presence and comments;
//   3. `localSelection`      — the persisted OD-local workspace selection
//                              (workspace-selection.json);
//   4. `envWorkspaceId`      — a VELA_WORKSPACE_ID inherited from the spawn
//                              environment;
//   5. none                  — send no header; the server resolves its stored
//                              Active Workspace (`source: 'server-current'`).
//
// The resolver is pure: it never invents an id and never mutates server state
// (resource calls must NOT PUT /workspaces/current — only an explicit user
// switch does).

export type WorkspaceScopeSource =
  | 'explicit'
  | 'project'
  | 'local-selection'
  | 'environment'
  | 'server-current';

export interface WorkspaceScope {
  workspaceId?: string;
  source: WorkspaceScopeSource;
}

export interface WorkspaceScopeInputs {
  explicit?: string | null;
  projectWorkspaceId?: string | null;
  localSelection?: string | null;
  envWorkspaceId?: string | null;
}

export function resolveWorkspaceScope(inputs: WorkspaceScopeInputs): WorkspaceScope {
  const explicit = inputs.explicit?.trim();
  if (explicit) return { workspaceId: explicit, source: 'explicit' };
  const project = inputs.projectWorkspaceId?.trim();
  if (project) return { workspaceId: project, source: 'project' };
  const local = inputs.localSelection?.trim();
  if (local) return { workspaceId: local, source: 'local-selection' };
  const env = inputs.envWorkspaceId?.trim();
  if (env) return { workspaceId: env, source: 'environment' };
  return { source: 'server-current' };
}

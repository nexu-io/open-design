import { getWorkspaceProjectByProjectId } from '../db.js';
import { openDesignAmrTraceEnv } from './env.js';

type SqliteDb = Parameters<typeof getWorkspaceProjectByProjectId>[0];

export type PinnedRunWorkspaceScope = Readonly<{
  schemaVersion: 1;
  projectId: string;
  workspaceId: string;
  source: 'persisted_project_binding';
}>;

export type AccountScopedRunWorkspaceScope = Readonly<{
  schemaVersion: 1;
  projectId: string;
  workspaceId: null;
  source: 'unbound_account';
}>;

export type RunWorkspaceScope =
  | PinnedRunWorkspaceScope
  | AccountScopedRunWorkspaceScope;

export function accountScopedRunWorkspaceScopeForProject(
  projectId: string,
): AccountScopedRunWorkspaceScope {
  return Object.freeze({
    schemaVersion: 1,
    projectId,
    workspaceId: null,
    source: 'unbound_account',
  });
}

/**
 * The spawn wallet is an address, not a local authorization decision.
 *
 * A persisted project binding always supplies its exact Workspace id to AMR.
 * The authenticated Vela/AMR backend remains the authority for membership,
 * balance, and billing eligibility. A daemon directory outage or stale
 * membership view therefore cannot silently move a run to the Personal wallet.
 */
export type ProjectWorkspaceScopeOutcomeKind =
  | 'resolved_persisted_binding'
  | 'account_scoped_unbound'
  | 'refused_unbound';

export interface ProjectWorkspaceScopeOutcome {
  kind: ProjectWorkspaceScopeOutcomeKind;
  projectId: string;
  workspaceId: string | null;
}

export class AmrWorkspaceScopeRequiredError extends Error {
  readonly code = 'AMR_WORKSPACE_SCOPE_REQUIRED';
  readonly projectId: string | null;

  constructor(projectId: string | null) {
    super(
      projectId
        ? `AMR Cloud requires project ${projectId} to be bound to a Workspace before running`
        : 'AMR Cloud requires a Workspace-bound project before running',
    );
    this.name = 'AmrWorkspaceScopeRequiredError';
    this.projectId = projectId;
  }
}

/**
 * Freeze the billing address before a run is created.
 *
 * This is the only function in the run path that reads the mutable project
 * binding. Its result is stored on the run and reused for every attempt. The
 * separate account-scoped proof records a genuinely unbound local project;
 * null remains "no proof" and may not silently select a wallet.
 */
export function pinRunWorkspaceScopeForProject(
  db: SqliteDb,
  projectId: string,
): PinnedRunWorkspaceScope | null {
  const normalizedProjectId = projectId.trim();
  if (!normalizedProjectId) return null;
  const binding = getWorkspaceProjectByProjectId(db, normalizedProjectId);
  const workspaceId =
    typeof binding?.workspaceId === 'string' && binding.workspaceId.trim()
      ? binding.workspaceId.trim()
      : null;
  if (!workspaceId) return null;
  return Object.freeze({
    schemaVersion: 1,
    projectId: normalizedProjectId,
    workspaceId,
    source: 'persisted_project_binding',
  });
}

/**
 * Build the AMR trace environment solely from the run's frozen binding.
 *
 * The request shell's active/current Workspace, the local membership
 * directory, and the project's current binding are intentionally absent.
 * Project A stays pinned to A for initial spawn and every retry even if the UI
 * switches to B, authority lookup is unavailable, or the project is later
 * rebound. Vela/AMR receives the signed-in account credentials plus
 * `OPEN_DESIGN_WORKSPACE_ID=A` and remains the final authorization/billing
 * authority. A genuinely unbound local project stays account-scoped and omits
 * the Workspace env var on every attempt.
 */
export async function openDesignAmrTraceEnvForRun(
  input: {
    agentId: string;
    runId: string;
    conversationId?: string | null;
    runAttempt: number;
    projectId?: string | null;
    workspaceScope?: RunWorkspaceScope | null;
    externalPluginAnalytics?: Record<string, unknown> | null;
  },
  deps: {
    onWorkspaceScopeOutcome?: (outcome: ProjectWorkspaceScopeOutcome) => void;
  } = {},
): Promise<NodeJS.ProcessEnv> {
  const traceInput = {
    agentId: input.agentId,
    runId: input.runId,
    runAttempt: input.runAttempt,
    ...(input.conversationId !== undefined
      ? { conversationId: input.conversationId }
      : {}),
    ...(input.externalPluginAnalytics !== undefined
      ? { externalPluginAnalytics: input.externalPluginAnalytics }
      : {}),
  };
  if (input.agentId !== 'amr') return openDesignAmrTraceEnv(traceInput);

  const projectId = input.projectId?.trim();
  if (!projectId) throw new AmrWorkspaceScopeRequiredError(null);
  const accountScoped =
    input.workspaceScope?.projectId === projectId
    && input.workspaceScope.source === 'unbound_account'
    && input.workspaceScope.schemaVersion === 1
    && input.workspaceScope.workspaceId === null;
  const workspaceId =
    input.workspaceScope?.projectId === projectId
    && input.workspaceScope.source === 'persisted_project_binding'
    && input.workspaceScope.schemaVersion === 1
    && input.workspaceScope.workspaceId.trim()
      ? input.workspaceScope.workspaceId.trim()
      : null;
  deps.onWorkspaceScopeOutcome?.({
    kind: workspaceId
      ? 'resolved_persisted_binding'
      : accountScoped
        ? 'account_scoped_unbound'
        : 'refused_unbound',
    projectId,
    workspaceId,
  });
  if (!workspaceId) {
    if (accountScoped) return openDesignAmrTraceEnv(traceInput);
    throw new AmrWorkspaceScopeRequiredError(projectId);
  }

  return openDesignAmrTraceEnv({
    ...traceInput,
    workspaceId,
  });
}

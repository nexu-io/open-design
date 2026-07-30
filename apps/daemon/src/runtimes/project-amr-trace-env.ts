import { getWorkspaceProjectByProjectId } from '../db.js';
import { openDesignAmrTraceEnv } from './env.js';

type SqliteDb = Parameters<typeof getWorkspaceProjectByProjectId>[0];

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
 * Build the AMR trace environment solely from the project's persisted binding.
 *
 * The request shell's active/current Workspace and the local membership
 * directory are intentionally absent. Project A stays pinned to A for initial
 * spawn and every retry, even if the UI later switches to B or the directory is
 * unavailable. The backend receives the signed-in account credentials plus
 * `OPEN_DESIGN_WORKSPACE_ID=A` and makes the final authorization/billing
 * decision. An unbound project is refused instead of silently falling through
 * to the signed-in account wallet.
 */
export async function openDesignAmrTraceEnvForProject(
  db: SqliteDb,
  input: {
    agentId: string;
    runId: string;
    conversationId?: string | null;
    runAttempt: number;
    projectId?: string | null;
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
  };
  if (input.agentId !== 'amr') return openDesignAmrTraceEnv(traceInput);

  const projectId = input.projectId?.trim();
  if (!projectId) throw new AmrWorkspaceScopeRequiredError(null);

  const binding = getWorkspaceProjectByProjectId(db, projectId);
  const workspaceId =
    typeof binding?.workspaceId === 'string' && binding.workspaceId.trim()
      ? binding.workspaceId.trim()
      : null;
  deps.onWorkspaceScopeOutcome?.({
    kind: workspaceId ? 'resolved_persisted_binding' : 'refused_unbound',
    projectId,
    workspaceId,
  });
  if (!workspaceId) throw new AmrWorkspaceScopeRequiredError(projectId);

  return openDesignAmrTraceEnv({
    ...traceInput,
    workspaceId,
  });
}

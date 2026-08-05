import type {
  TeamProject,
  WorkspaceCollabContext,
  WorkspaceProjectSummary,
} from '@open-design/contracts';

import { workspaceIdentityCacheKey } from './workspace-identity';

/**
 * A short-lived proof produced by the successful move response itself.
 *
 * The team catalog can lag the mutation. Until it confirms the row, this proof
 * keeps the just-shared project actionable without weakening the fail-closed
 * rule for pre-existing shared projects whose owner is genuinely unknown.
 */
export interface OptimisticProjectOwnershipWitness {
  scopeKey: string;
  ownerMemberId: string;
  canMoveToPersonal: boolean;
}

export type OptimisticProjectOwnershipWitnesses = ReadonlyMap<
  string,
  OptimisticProjectOwnershipWitness
>;

export function optimisticProjectOwnershipScopeKey(
  context: WorkspaceCollabContext | null,
  accountGeneration: number,
): string {
  return JSON.stringify([accountGeneration, workspaceIdentityCacheKey(context)]);
}

export function recordOptimisticProjectOwnership(
  current: OptimisticProjectOwnershipWitnesses,
  input: {
    scopeKey: string;
    context: WorkspaceCollabContext | null;
    project: WorkspaceProjectSummary;
  },
): OptimisticProjectOwnershipWitnesses {
  const next = new Map(current);
  next.delete(input.project.id);

  // Only a successful team move for the exact Workspace can establish this
  // proof. A malformed/stale response must not turn an unknown shared project
  // into a self-owned one.
  if (
    !input.context
    || input.project.workspaceId !== input.context.workspaceId
    || input.project.visibility !== 'team'
    || !input.project.createdByWorkspaceMemberId
  ) {
    return next;
  }

  next.set(input.project.id, {
    scopeKey: input.scopeKey,
    ownerMemberId: input.project.createdByWorkspaceMemberId,
    canMoveToPersonal: input.project.currentUserAccess.canMoveToPersonal,
  });
  return next;
}

export function forgetOptimisticProjectOwnership(
  current: OptimisticProjectOwnershipWitnesses,
  projectId: string,
): OptimisticProjectOwnershipWitnesses {
  if (!current.has(projectId)) return current;
  const next = new Map(current);
  next.delete(projectId);
  return next;
}

export function reconcileOptimisticProjectOwnership(
  current: OptimisticProjectOwnershipWitnesses,
  input: {
    scopeKey: string;
    teamProjects: readonly TeamProject[];
  },
): OptimisticProjectOwnershipWitnesses {
  if (current.size === 0) return current;
  const catalogProjectIds = new Set(input.teamProjects.map((project) => project.projectId));
  let changed = false;
  const next = new Map<string, OptimisticProjectOwnershipWitness>();
  for (const [projectId, witness] of current) {
    if (witness.scopeKey !== input.scopeKey || catalogProjectIds.has(projectId)) {
      changed = true;
      continue;
    }
    next.set(projectId, witness);
  }
  return changed ? next : current;
}

export function projectOwnerMemberIdsWithOptimisticWitnesses(input: {
  scopeKey: string;
  teamProjects: readonly TeamProject[];
  witnesses: OptimisticProjectOwnershipWitnesses;
}): ReadonlyMap<string, string> {
  const owners = new Map(
    input.teamProjects.map((project) => [project.projectId, project.ownerMemberId]),
  );
  for (const [projectId, witness] of input.witnesses) {
    if (
      owners.has(projectId)
      || witness.scopeKey !== input.scopeKey
      || !witness.canMoveToPersonal
    ) {
      continue;
    }
    owners.set(projectId, witness.ownerMemberId);
  }
  return owners;
}

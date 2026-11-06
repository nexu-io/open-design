interface WorkspaceRun {
  status?: string;
  workspaceScope?: { workspaceId: string | null; workspaceMemberId?: string | null } | null;
}
interface WorkspaceRunCancellationService {
  list(filter: { status: 'active' }): WorkspaceRun[];
  cancel(run: WorkspaceRun, origin: 'project_cleanup'): Promise<unknown>;
}

/** Stop only runs carrying the daemon-pinned Workspace that lost membership.
 * Account-local/unbound runs and other Workspaces must continue unchanged. */
export async function cancelRevokedWorkspaceRuns(
  runs: WorkspaceRunCancellationService,
  workspaceId: string | null | undefined,
  workspaceMemberId?: string,
): Promise<void> {
  if (!workspaceId?.trim()) return;
  const affected = runs.list({ status: 'active' }).filter(run => run.workspaceScope?.workspaceId === workspaceId &&
    (!workspaceMemberId || !run.workspaceScope.workspaceMemberId || run.workspaceScope.workspaceMemberId === workspaceMemberId) &&
    !['succeeded', 'failed', 'canceled'].includes(run.status ?? ''));
  await Promise.all(affected.map(run => runs.cancel(run, 'project_cleanup')));
}

interface DirectoryMember {
  workspaceId: string;
  workspaceMemberId: string;
  memberStatus: string;
  lifecycleState: string;
}

/** A complete successful directory snapshot closes gaps left by a missed SSE.
 * Failures and late answers for another account do not revoke any membership. */
export function createWorkspaceMembershipRevocationObserver(
  removed: (workspaceId: string, workspaceMemberId: string, identityKey: string) => void,
): { observe: (identityKey: string, currentIdentityKey: string, result: { ok: boolean; items: DirectoryMember[] }) => void } {
  let priorIdentity: string | null = null;
  let prior = new Map<string, DirectoryMember>();
  return {
    observe(identityKey, currentIdentityKey, result) {
      if (!result.ok || identityKey !== currentIdentityKey) return;
      const next = new Map(result.items.filter(item => item.memberStatus === 'active' && item.lifecycleState !== 'deleted')
        .map(item => [JSON.stringify([item.workspaceId, item.workspaceMemberId]), item]));
      if (priorIdentity === identityKey) {
        for (const [key, item] of prior) {
          if (!next.has(key)) removed(item.workspaceId, item.workspaceMemberId, identityKey);
        }
      }
      priorIdentity = identityKey;
      prior = next;
    },
  };
}

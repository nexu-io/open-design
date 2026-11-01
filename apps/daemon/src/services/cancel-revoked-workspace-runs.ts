/** Private host lifecycle glue; never a billing or membership authority. */
export interface WorkspaceRunActorEvidence {
  login: {
    loggedIn: boolean;
    profile: string;
    user: { id: string } | null;
  };
  control: {
    profile: string;
    apiUrl: string;
    user: { id: string } | null;
  } | null;
  credentialOverrides: boolean;
}

/** Normal device login stores the runtime/control credentials for one user.
 * Explicit key overrides have no equivalent actor proof in the existing API;
 * never borrow the saved control user's identity for an opaque runtime key.
 * Key rotation and config mtime do not change this account identity. */
export function workspaceRunActorKey(evidence: WorkspaceRunActorEvidence): string | null {
  const { login, control } = evidence;
  const userId = login.user?.id.trim();
  if (
    evidence.credentialOverrides || !login.loggedIn || !control || !userId
    || control.user?.id.trim() !== userId || control.profile !== login.profile
  ) return null;
  return JSON.stringify([control.apiUrl.replace(/\/+$/, ''), login.profile, userId]);
}

interface WorkspaceRun {
  agentId?: string;
  status: string;
  workspaceScope?: { workspaceId: string | null; workspaceMemberId?: string | null } | null;
}

/** Pin the real launch principal once, independently of project creator and UI
 * selection. A generation recorded before setup awaits also fences revocation
 * delivered before the child environment (and hence actor proof) is ready. */
export function createRevokedWorkspaceRunCancellation<TRun extends WorkspaceRun>(deps: {
  listRuns(): Iterable<TRun>;
  isTerminal(status: string): boolean;
  cancel(run: TRun, origin: 'unknown'): Promise<unknown>;
  onError?(run: TRun): void;
}) {
  let generation = 0;
  const revoked = new Map<string, number>();
  const bindings = new WeakMap<TRun, {
    generation: number;
    workspaceId: string;
    actorKey?: string | null;
    workspaceMemberId?: string | null;
  }>();
  const pending = new WeakMap<TRun, Promise<void>>();
  const key = (workspaceId: string, actorKey: string, workspaceMemberId?: string) => JSON.stringify([workspaceId, actorKey, workspaceMemberId ?? null]);
  const cancel = (run: TRun): Promise<void> => {
    if (deps.isTerminal(run.status)) return Promise.resolve();
    const existing = pending.get(run);
    if (existing) return existing;
    // Existing cancel sets cancelRequested synchronously, before its first
    // process-teardown await. Keep this call synchronous for setup fencing.
    let result: Promise<unknown>;
    try {
      result = deps.cancel(run, 'unknown');
    } catch {
      deps.onError?.(run);
      return Promise.resolve();
    }
    const settled = result.then(() => undefined, () => { deps.onError?.(run); });
    pending.set(run, settled);
    void settled.finally(() => { pending.delete(run); });
    return settled;
  };
  const begin = (run: TRun): void => {
    if (bindings.has(run) || run.agentId !== 'amr') return;
    const workspaceId = run.workspaceScope?.workspaceId?.trim();
    if (workspaceId) bindings.set(run, { generation, workspaceId });
  };
  const revoke = async (workspaceIdInput: string, actorKey: string | null, workspaceMemberId?: string): Promise<void> => {
    const workspaceId = workspaceIdInput.trim();
    if (!workspaceId || !actorKey) return;
    revoked.set(key(workspaceId, actorKey, workspaceMemberId), ++generation);
    const cancellations: Promise<void>[] = [];
    for (const run of deps.listRuns()) {
      const binding = bindings.get(run);
      if (
        binding?.workspaceId === workspaceId && binding.actorKey === actorKey
        && (!workspaceMemberId || binding.workspaceMemberId === workspaceMemberId)
        && !deps.isTerminal(run.status)
      ) cancellations.push(cancel(run));
    }
    await Promise.all(cancellations);
  };
  return {
    begin,
    pinnedMember(run: TRun): string | null {
      return bindings.get(run)?.workspaceMemberId ?? null;
    },
    /** Returns false when setup must not spawn/restart this physical Run. */
    pin(run: TRun, actorKey: string | null, actualWorkspaceMemberId?: string | null): boolean {
      const binding = bindings.get(run);
      if (!binding) return true;
      if (!Object.prototype.hasOwnProperty.call(binding, 'actorKey')) {
        binding.actorKey = actorKey;
      } else if (binding.actorKey !== actorKey) {
        void cancel(run);
        return false;
      }
      // Project scope carries its creator, not the authenticated launch member.
      // Only a same-session directory proof may establish the latter. Once a
      // Run starts without proof, a later retry must not adopt a new member.
      if (actualWorkspaceMemberId !== undefined) {
        if (!Object.prototype.hasOwnProperty.call(binding, 'workspaceMemberId')) {
          binding.workspaceMemberId = actualWorkspaceMemberId;
        } else if (actualWorkspaceMemberId && binding.workspaceMemberId
          && binding.workspaceMemberId !== actualWorkspaceMemberId) {
          void cancel(run);
          return false;
        }
      }
      if (actorKey && (Math.max(revoked.get(key(binding.workspaceId, actorKey)) ?? 0,
        revoked.get(key(binding.workspaceId, actorKey, binding.workspaceMemberId ?? undefined)) ?? 0)) > binding.generation) {
        void cancel(run);
        return false;
      }
      return !pending.has(run) && !deps.isTerminal(run.status);
    },
    revoke,
    /** The caller supplies a complete directory proven for this actor. A role
     * or billing/lifecycle change with active membership is not removal. */
    async observeDirectory(
      actorKey: string | null,
      items: ReadonlyArray<{ workspaceId: string; memberStatus: 'active' | 'removed' }>,
    ): Promise<void> {
      if (!actorKey) return;
      const activeWorkspaces = new Set(
        items.filter((item) => item.memberStatus === 'active').map((item) => item.workspaceId),
      );
      const missingWorkspaces = new Set<string>();
      for (const run of deps.listRuns()) {
        const binding = bindings.get(run);
        if (
          binding && !activeWorkspaces.has(binding.workspaceId)
          && !deps.isTerminal(run.status)
        ) missingWorkspaces.add(binding.workspaceId);
      }
      // Include setup runs whose actor is not pinned yet: revoke's generation
      // fence will be consumed only if their eventual launch actor matches.
      await Promise.all([...missingWorkspaces].map((workspaceId) => revoke(workspaceId, actorKey)));
    },
  };
}

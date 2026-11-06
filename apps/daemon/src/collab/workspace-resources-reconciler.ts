// Realtime reconciliation of the local `workspace_resources` SQLite table
// against the resource hub's shared-listing for design-system / plugin /
// skill resources — the generic-table counterpart of
// `workspace-projects-reconciler.ts` for `workspace_projects`.
//
// The gap this closes: `syncSharedTeamDesignSystem` / `syncSharedTeamSkill`
// (server.ts) already handle DIRECTION 1 — a resource the hub still confirms
// as shared gets materialized + bound `visibility: 'team'` — every time a
// kind's `/team` listing is read. Nothing handles DIRECTION 2: a resource a
// workspace has ALREADY bound `visibility: 'team'` that the hub no longer
// lists at all (the owner unshared it, or this member's access was revoked).
// Before this module, that local row simply sat there forever, unexamined —
// the puller's copy vanished from the Team scope (the hub stopped listing
// it) without ever being told to leave "team" state, so it also never
// qualified to reappear anywhere else. This module is what would eventually
// need to run to converge that row, the same way
// `reconcileWorkspaceProjectsWithRemote` converges `workspace_projects`.
//
// Retraction semantic (spec decision, workspace-team continuous-sync 优先级3):
// deliberately NOT "demote to personal" (project's `workspace_projects` model
// is the one to NOT copy). A skill/design-system/plugin pulled copy is a
// materialized MIRROR of someone else's shared resource, not the caller's
// own draft — flipping `visibility` to `'personal'` would misattribute it as
// caller-authored, exactly the bug `SkillSummary.teamSynced` (this same
// continuous-sync effort, priority 2) was written to fix. Instead this marks
// `resourceState: 'deleted'` on the EXISTING `workspace_resources` row and
// leaves `visibility: 'team'` untouched — a tombstone, not a reclassification:
//   - `visibility` staying `'team'` preserves every `teamSynced` / "is this a
//     team-pulled copy" attribution read. Scoped catalogs additionally gate
//     these mirrors on `resourceState`, so a retired resource is hidden while
//     remaining distinguishable from caller-authored Personal content.
//   - `resourceState: 'deleted'` is this reconciler's own bookkeeping: it is
//     what makes a second reconciliation pass a no-op instead of re-writing
//     the same row every ~15s poll tick, and it is the auditable "this used
//     to be team-shared, then wasn't anymore" fact a future "make this mine"
//     reclaim action would key off. Scoped Team catalogs read it as the
//     exclusion signal without erasing that attribution.
//   - The local FILE on disk is never touched. Retraction is a binding-table
//     state change only — this module does not delete, move, or rewrite
//     anything under `USER_SKILLS_DIR` / `USER_DESIGN_SYSTEMS_DIR`.
//
// Scope: this module is resource-type-agnostic. Daemon wiring drives it for
// design systems, plugins, and skills; each materializer owns creating the
// active Team binding that this reconciler later retires.

import type {
  TeamResourcesChangedSsePayload,
  WorkspaceTeamResourceKind,
} from '@open-design/contracts';

/** This daemon's one local `workspace_resources` row for a resource, as far
 *  as reconciliation cares. Only rows the caller has already filtered to
 *  `visibility: 'team'` for the target workspace are meaningful input — see
 *  `WorkspaceResourcesReconcilerDeps.listLocalActiveTeamRows`. */
export interface LocalTeamResourceBinding {
  resourceId: string;
  workspaceId: string;
  visibility: 'personal' | 'team';
  resourceState: string | null;
}

/** What the remote hub says is currently shared — the subset
 *  `TeamResourceShareService.sharedResources()` (team-resource-share.ts)
 *  actually carries that the planner needs: the LOCAL resource id (already
 *  decoded by `parseSharedResourceRecords`, matching `workspace_resources.
 *  resource_id` directly). */
export interface RemoteTeamResourceRef {
  resourceId: string;
  versionId?: string;
  version?: number;
}

/** Tracks the last authoritative listing independently by Workspace and kind. */
export function createWorkspaceResourceSignatureTracker() {
  const signatures = new Map<string, string>();
  return {
    observe(
      workspaceId: string,
      resourceKind: string,
      remoteResources: readonly RemoteTeamResourceRef[],
    ): boolean {
      const key = JSON.stringify([workspaceId, resourceKind]);
      const signature = JSON.stringify(
        remoteResources
          .map((resource) => [
            resource.resourceId,
            resource.versionId ?? null,
            resource.version ?? null,
          ] as const)
          .sort(([left], [right]) => left.localeCompare(right)),
      );
      const previous = signatures.get(key);
      signatures.set(key, signature);
      return previous !== signature;
    },
  };
}

export interface MaterializedTeamResourceRef extends RemoteTeamResourceRef {
  versionId?: string;
}

export type WorkspaceResourceReconcileAction = {
  kind: 'retire';
  resourceId: string;
  workspaceId: string;
};

/**
 * Pure planner: given what the resource hub currently lists as shared and
 * what this daemon's OWN `workspace_resources` rows (already active-team-
 * filtered by the caller) claim for the workspace, decide which local rows
 * are stale and need retiring. No I/O — the orchestrator below
 * (`reconcileWorkspaceResourcesWithRemote`) is the only caller that touches
 * the database, which is what keeps this function directly unit-testable.
 *
 * Only one direction: a local row the remote listing no longer confirms.
 * The other direction (remote confirms a resource this daemon has not yet
 * materialized/bound) is already handled by `syncSharedTeamDesignSystem` /
 * `syncSharedTeamSkill` every time a kind's `/team` listing is read — adding
 * a second "confirm" action here would just duplicate that pull-and-bind
 * logic under a different name.
 */
export function planWorkspaceResourceReconciliation(input: {
  workspaceId: string;
  remoteResources: readonly RemoteTeamResourceRef[];
  /** Every row this daemon currently has bound `visibility: 'team'` AND
   *  `resourceState` other than `'deleted'` for `workspaceId` — see
   *  `listLocalActiveTeamRows`'s doc comment for the exact prefilter this
   *  function relies on the caller to apply. */
  localActiveTeamRows: readonly LocalTeamResourceBinding[];
}): WorkspaceResourceReconcileAction[] {
  const remoteIds = new Set(input.remoteResources.map((r) => r.resourceId));
  const actions: WorkspaceResourceReconcileAction[] = [];
  for (const local of input.localActiveTeamRows) {
    if (local.workspaceId !== input.workspaceId) continue;
    if (remoteIds.has(local.resourceId)) continue;
    actions.push({ kind: 'retire', resourceId: local.resourceId, workspaceId: local.workspaceId });
  }
  return actions;
}

export interface WorkspaceResourcesReconcilerDeps {
  /** The signed-in team workspace this daemon is currently acting as, or
   *  null off-team / signed out / removed. Must gate on active membership
   *  (`memberStatus === 'active'`) the same way
   *  `reconcileWorkspaceProjectsWithRemote`'s `getWorkspaceIdentity` does — a
   *  context that can still ADDRESS a resource hub partition is not proof
   *  this member is still IN the team. */
  getWorkspaceIdentity: () => Promise<{ workspaceId: string } | null>;
  /** This kind's `TeamResourceShareService.sharedResources()` — the exact
   *  same hub read `/api/workspace/<kind>/team` already serves (through its
   *  own SWR cache), so this reconciler never opens a second transport. */
  listRemoteTeamResources: () => Promise<readonly RemoteTeamResourceRef[]>;
  /** Every `workspace_resources` row for this resource type bound
   *  `visibility: 'team'` in `workspaceId`, whose `resourceState` is not
   *  already `'deleted'` (i.e. `listWorkspaceResources(db, resourceType,
   *  workspaceId)` filtered by the caller — kept out of this pure function
   *  so it stays synchronous and test-friendly without a real db handle). */
  listLocalActiveTeamRows: (workspaceId: string) => readonly LocalTeamResourceBinding[];
  /** Write a 'retire' action: flip `resourceState` to `'deleted'`, leaving
   *  `visibility` untouched. See this module's header comment for why that
   *  is the correct action and not a demote-to-personal. */
  applyRetire: (workspaceId: string, resourceId: string) => void;
  onError?: (error: unknown) => void;
}

export interface WorkspaceResourcesReconcileResult {
  /** Number of retire actions successfully persisted. */
  retired: number;
}

const NO_OP_RESULT: WorkspaceResourcesReconcileResult = { retired: 0 };

/**
 * Run one reconciliation pass for one resource kind: read the remote shared
 * listing, diff it against this daemon's own active `workspace_resources`
 * rows for that kind, and retire whatever disagrees. Best-effort throughout —
 * a failed identity read or a failed remote read returns a no-op result
 * rather than throwing, so a transient hub outage can never be misread as
 * "remote reports nothing shared" and retire every local team row on missing
 * (as opposed to genuinely empty) data.
 */
export async function reconcileWorkspaceResourcesWithRemote(
  deps: WorkspaceResourcesReconcilerDeps,
): Promise<WorkspaceResourcesReconcileResult> {
  const identity = await deps.getWorkspaceIdentity().catch((error) => {
    deps.onError?.(error);
    return null;
  });
  if (!identity) return NO_OP_RESULT;

  let remoteResources: readonly RemoteTeamResourceRef[];
  try {
    remoteResources = await deps.listRemoteTeamResources();
  } catch (error) {
    deps.onError?.(error);
    return NO_OP_RESULT;
  }

  const localActiveTeamRows = deps.listLocalActiveTeamRows(identity.workspaceId);
  const actions = planWorkspaceResourceReconciliation({
    workspaceId: identity.workspaceId,
    remoteResources,
    localActiveTeamRows,
  });

  let retired = 0;
  for (const action of actions) {
    try {
      deps.applyRetire(action.workspaceId, action.resourceId);
      retired += 1;
    } catch (error) {
      deps.onError?.(error);
    }
  }

  return { retired };
}

const TEAM_RESOURCE_KINDS: readonly WorkspaceTeamResourceKind[] = [
  'design_system',
  'plugin',
  'skill',
];

export type WorkspaceTeamResourceRefreshReason = 'push' | 'poll' | 'catch-up';

export interface WorkspaceTeamResourceRefreshInput<TScope> {
  workspaceId: string;
  scope: TScope;
  resourceKind?: string;
  resourceId?: string;
  reason: WorkspaceTeamResourceRefreshReason;
  /**
   * Optional compatibility-lease guard for queued prewarm work. It is checked
   * immediately before the mutating pipeline starts. Once materialization has
   * begun, reconcile, emit, and signature commit finish as one logical unit.
   */
  isRefreshCurrent?: () => boolean;
}

export interface WorkspaceTeamResourceRefreshResult {
  processedKinds: WorkspaceTeamResourceKind[];
  emittedKinds: WorkspaceTeamResourceKind[];
  failedKinds: WorkspaceTeamResourceKind[];
}

export interface WorkspaceTeamResourceEventCoordinatorDeps<TScope> {
  /** Must not resolve until every listed resource is locally materialized. */
  materializeAndList: (input: {
    workspaceId: string;
    resourceKind: WorkspaceTeamResourceKind;
    scope: TScope;
  }) => Promise<readonly MaterializedTeamResourceRef[]>;
  /** Reconcile against the exact listing returned by materializeAndList. */
  reconcile: (input: {
    workspaceId: string;
    resourceKind: WorkspaceTeamResourceKind;
    scope: TScope;
    resources: readonly MaterializedTeamResourceRef[];
  }) => Promise<WorkspaceResourcesReconcileResult>;
  emit: (workspaceId: string, payload: TeamResourcesChangedSsePayload) => void;
  now?: () => number;
  onError?: (error: unknown, resourceKind: WorkspaceTeamResourceKind) => void;
}

function teamResourceSignature(resources: readonly MaterializedTeamResourceRef[]): string {
  return resources
    .map((resource) => `${resource.resourceId}\u0000${resource.versionId ?? ''}`)
    .sort()
    .join('\u0001');
}

function isWorkspaceTeamResourceKind(value: string): value is WorkspaceTeamResourceKind {
  return TEAM_RESOURCE_KINDS.some((kind) => kind === value);
}

/**
 * Coordinates background resource invalidation without exposing partially
 * materialized state. Work for the same workspace/kind is serialized; polling
 * emits only when the stable remote signature changes (or a local row retires).
 */
export function createWorkspaceTeamResourceEventCoordinator<TScope>(
  deps: WorkspaceTeamResourceEventCoordinatorDeps<TScope>,
): {
  refresh: (
    input: WorkspaceTeamResourceRefreshInput<TScope>,
  ) => Promise<WorkspaceTeamResourceRefreshResult>;
} {
  const signatures = new Map<string, string>();
  const pending = new Map<string, Promise<void>>();

  const runKind = async (
    input: WorkspaceTeamResourceRefreshInput<TScope>,
    resourceKind: WorkspaceTeamResourceKind,
  ): Promise<'emitted' | 'processed' | 'skipped' | 'failed'> => {
    try {
      if (input.isRefreshCurrent?.() === false) return 'skipped';
      const resources = await deps.materializeAndList({
        workspaceId: input.workspaceId,
        resourceKind,
        scope: input.scope,
      });
      const reconciliation = await deps.reconcile({
        workspaceId: input.workspaceId,
        resourceKind,
        scope: input.scope,
        resources,
      });
      const key = `${input.workspaceId}\u0000${resourceKind}`;
      const nextSignature = teamResourceSignature(resources);
      const previousSignature = signatures.get(key);
      const shouldEmit = input.reason === 'push'
        || reconciliation.retired > 0
        || (previousSignature === undefined
          ? resources.length > 0
          : previousSignature !== nextSignature);

      if (shouldEmit) {
        deps.emit(input.workspaceId, {
          type: 'team-resources-changed',
          resourceKind,
          ...(input.resourceId ? { resourceId: input.resourceId } : {}),
          at: deps.now?.() ?? Date.now(),
        });
      }
      signatures.set(key, nextSignature);
      return shouldEmit ? 'emitted' : 'processed';
    } catch (error) {
      deps.onError?.(error, resourceKind);
      return 'failed';
    }
  };

  const enqueueKind = async (
    input: WorkspaceTeamResourceRefreshInput<TScope>,
    resourceKind: WorkspaceTeamResourceKind,
  ): Promise<'emitted' | 'processed' | 'skipped' | 'failed'> => {
    const key = `${input.workspaceId}\u0000${resourceKind}`;
    const previous = pending.get(key);
    let result: 'emitted' | 'processed' | 'skipped' | 'failed' = 'failed';
    const run = async () => {
      result = await runKind(input, resourceKind);
    };
    const current = previous
      ? previous.catch(() => undefined).then(run)
      : run();
    pending.set(key, current);
    await current;
    if (pending.get(key) === current) pending.delete(key);
    return result;
  };

  return {
    async refresh(input) {
      const kinds = input.resourceKind === undefined
        ? TEAM_RESOURCE_KINDS
        : isWorkspaceTeamResourceKind(input.resourceKind)
          ? [input.resourceKind]
          : [];
      const outcomes = await Promise.all(
        kinds.map(async (resourceKind) => ({
          resourceKind,
          outcome: await enqueueKind(input, resourceKind),
        })),
      );
      return {
        processedKinds: outcomes
          .filter(({ outcome }) => outcome === 'processed' || outcome === 'emitted')
          .map(({ resourceKind }) => resourceKind),
        emittedKinds: outcomes
          .filter(({ outcome }) => outcome === 'emitted')
          .map(({ resourceKind }) => resourceKind),
        failedKinds: outcomes
          .filter(({ outcome }) => outcome === 'failed')
          .map(({ resourceKind }) => resourceKind),
      };
    },
  };
}

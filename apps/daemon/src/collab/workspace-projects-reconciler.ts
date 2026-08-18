// Realtime reconciliation of the local `workspace_projects` SQLite table
// against Vela's team-project catalog — the remote source of truth for "is
// project X still shared to my team, and who owns it."
//
// Two existing daemon triggers already learn about a team-catalog change:
//   - `startHubEventsSubscriber`'s `team-projects-changed` push (server.ts).
//   - `workspaceInvalidationPoller`'s ~15s diff-and-signal cadence
//     (collab/workspace-invalidation-poller.ts).
// Both used to do nothing more than invalidate the DISPLAY cache
// (`teamProjectsDisplayCache`) and nudge the web to refetch — the local
// `workspace_projects` row itself was never re-examined, so a row this
// daemon had already bound could silently disagree with reality forever
// (the concrete, repeatedly-reported case: an owner unshares a project and a
// member's stale local "team" mirror remains directly readable after its
// authoritative catalog membership disappears). This
// module closes that gap: `handleHubTeamProjectsChanged` and
// `handlePolledWorkspaceInvalidation` below hook BOTH existing triggers to
// also run `reconcileWorkspaceProjectsWithRemote`, a real read-modify-write
// pass over this daemon's own team rows. No new polling loop is introduced —
// both hooks ride the cadence their trigger already has.
//
// Scope: PROJECTS only (`workspace_projects`). Plugins / skills / design
// systems have their own generic `workspace_resources` table and are
// deliberately NOT covered here.
//
// Relationship to the two existing point fixes — neither is replaced:
//   - `reconcileUnboundProjectBeforeMove` (routes/project/index.ts) stays: it
//     is a synchronous, request-scoped correctness gate for ONE specific
//     decision (`/move` to personal) that must not wait for the next
//     background sweep — a user clicking "move to personal" right now needs
//     the answer right now, not in up to 15s.
//   - `reconcileLocalRowWithRemoteTeamAccess` (routes/project/index.ts) stays
//     too: it runs on every `GET /api/workspaces/:workspaceId/projects` and
//     has access to the RICHER `VelaTeamProjectRecord` (`resourceId`,
//     `access.canEdit`, `frozen`) that the simpler `listTeamProjects()` this
//     module consumes does not carry. It remains the precise, per-request
//     completion pass for a brand-new row (in particular, the one that fills
//     in the real `resourceHubResourceId` this module leaves null). This
//     module additionally covers the direction that pass structurally never
//     reaches — an ALREADY-bound row the remote catalog no longer confirms —
//     and runs proactively instead of waiting for the next list request.

import type { WorkspaceInvalidationSsePayload } from '@open-design/contracts';
import type { ResourceHubPrincipal } from './resource-principal.js';

/** This daemon's one local `workspace_projects` row for a project, as far as
 *  reconciliation cares. */
export interface LocalTeamProjectBinding {
  projectId: string;
  workspaceId: string;
  visibility: 'personal' | 'team';
  resourceState?: string | null;
  createdByWorkspaceMemberId: string | null;
  resourceHubResourceId: string | null;
}

/** What the remote catalog says about a shared project — the subset
 *  `listTeamProjects()` (contracts' `TeamProject`) actually carries. */
export interface RemoteTeamProjectRef {
  projectId: string;
  ownerMemberId: string;
  displayName?: string | null;
  /** Catalog row observation/revision time. Never write this into projects. */
  catalogRevisionAt?: number | null;
  /** Project timestamp authored by the owner and carried inside metadata. */
  originProjectUpdatedAt?: number | null;
}

export interface WorkspaceProjectMetadataPatch {
  name: string;
  updatedAt: number;
}

/** The two remote reads a daemon can consult for catalog MEMBERSHIP. */
export interface ReconcilerRemoteTeamProjectSources {
  /**
   * The raw workspace catalog (`vela team-projects list` via the richer
   * `VelaTeamProjectCatalogClient`), which carries EVERY registered row —
   * including rows whose `syncState` is `pending_upload`/`syncing`/`failed`.
   * Null when the vela transport is not active for this daemon.
   */
  listCatalogMembership: (() => Promise<readonly RemoteTeamProjectRef[]>) | null;
  /**
   * The display catalog (`teamProjectsForDisplay`), which deliberately DROPS
   * rows whose latest publish is not `synced` so teammates never open empty
   * project shells (see `toTeamProject` in collab/vela-cli-team-projects.ts).
   */
  listDisplayTeamProjects: () => Promise<readonly RemoteTeamProjectRef[]>;
}

/**
 * THE INVARIANT: reconciliation must judge membership against the raw
 * catalog, never against the display list.
 *
 * "Is project X still registered to my team, and who owns it" and "should
 * project X render in the team space right now" are different questions. The
 * display read answers the second one by hiding rows whose latest publish is
 * not `synced` — but a row whose publish FAILED is still a registered,
 * owner-occupied catalog row (the hub's `upsertTeamProject` keeps refusing
 * every other member with `team_project_owner_conflict` for it). Feeding that
 * display-filtered list to `planWorkspaceProjectReconciliation` made a mere
 * sync failure indistinguishable from a real unshare, so the demote direction
 * rewrote a teammate's mirror into a personal draft ATTRIBUTED TO THE LOCAL
 * VIEWER (`createdByWorkspaceMemberId: workspaceMemberId`) — which then
 * surfaced in the viewer's drafts as "created by me" with an enabled
 * "move to team space" action that could only ever 403 (recvqzjnshIlOe).
 *
 * A genuine unshare/delete removes the hub row itself, so it disappears from
 * the raw catalog too — using membership here does not delay legitimate
 * revocation of a teammate's stale mirror or demotion of the original
 * creator's own project.
 *
 * The display read remains available to callers that only need a best-effort
 * view. Production reconciliation requires `listCatalogMembership`; when
 * that authoritative transport is unavailable, its caller rejects the read
 * so absence never triggers a destructive action.
 */
export async function reconcilerRemoteTeamProjects(
  sources: ReconcilerRemoteTeamProjectSources,
): Promise<readonly RemoteTeamProjectRef[]> {
  if (sources.listCatalogMembership) return sources.listCatalogMembership();
  return sources.listDisplayTeamProjects();
}

export interface WorkspaceProjectBindPatch {
  workspaceId: string;
  visibility: 'team';
  resourceState: 'active';
  createdByWorkspaceMemberId: string | null;
  updatedByWorkspaceMemberId: string;
  resourceHubResourceId: string | null;
  cloudTombstonedAt: null;
  syncState: 'synced';
}

export interface WorkspaceProjectDemotePatch {
  visibility: 'personal';
  createdByWorkspaceMemberId: string;
  resourceHubResourceId: null;
  cloudTombstonedAt: null;
  syncState: 'local_only';
}

export interface WorkspaceProjectRevokePatch {
  visibility: 'team';
  resourceState: 'deleted';
  createdByWorkspaceMemberId: null;
  resourceHubResourceId: string | null;
  cloudTombstonedAt: null;
  syncState: 'synced';
}

export type WorkspaceProjectReconcileAction =
  | { kind: 'bind'; projectId: string; patch: WorkspaceProjectBindPatch }
  | { kind: 'demote'; projectId: string; workspaceId: string; patch: WorkspaceProjectDemotePatch }
  | { kind: 'revoke'; projectId: string; workspaceId: string; patch: WorkspaceProjectRevokePatch };

/**
 * Pure planner: given what the remote catalog reports and what this daemon's
 * OWN `workspace_projects` table currently claims for the active team
 * workspace, decide which rows disagree and how to fix them. No I/O — the
 * orchestrator below (`reconcileWorkspaceProjectsWithRemote`) is the only
 * caller that touches the database, which is what keeps this function
 * directly unit-testable.
 *
 * `localBindings` must carry an entry for every project this function needs
 * an opinion on: every `remoteProjects[].projectId` (so a brand-new remote
 * share can be told apart from an already-correct one) AND every row already
 * bound `visibility: 'team'` under `workspaceId` (so a row remote no longer
 * lists can be found at all). The caller builds this union — see
 * `reconcileWorkspaceProjectsWithRemote`.
 */
export function planWorkspaceProjectReconciliation(input: {
  workspaceId: string;
  workspaceMemberId: string;
  remoteProjects: readonly RemoteTeamProjectRef[];
  localBindings: ReadonlyMap<string, LocalTeamProjectBinding>;
}): WorkspaceProjectReconcileAction[] {
  const { workspaceId, workspaceMemberId, remoteProjects, localBindings } = input;
  const actions: WorkspaceProjectReconcileAction[] = [];
  const remoteIds = new Set(remoteProjects.map((project) => project.projectId));

  // Direction 1: remote reports the project as shared to my team — correct a
  // missing, mis-owned, or wrong-visibility local row. Ownership drives
  // `createdByWorkspaceMemberId` the same way `reconcileLocalRowWithRemoteTeamAccess`
  // does: the hub's single writer per project is its `ownerMemberId`, so only
  // a match against the CURRENT member earns an editable local binding.
  for (const remote of remoteProjects) {
    const local = localBindings.get(remote.projectId) ?? null;
    const isOwner = remote.ownerMemberId === workspaceMemberId;
    const wantCreatedBy = isOwner ? workspaceMemberId : null;
    const alreadyCorrect =
      local != null &&
      local.workspaceId === workspaceId &&
      local.visibility === 'team' &&
      local.createdByWorkspaceMemberId === wantCreatedBy;
    if (alreadyCorrect) continue;
    actions.push({
      kind: 'bind',
      projectId: remote.projectId,
      patch: {
        workspaceId,
        visibility: 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: wantCreatedBy,
        updatedByWorkspaceMemberId: workspaceMemberId,
        // Preserve a resourceId this daemon already learned (e.g. from the
        // request-driven `reconcileLocalRowWithRemoteTeamAccess`, which reads
        // the richer catalog client that DOES carry it); `listTeamProjects()`
        // itself does not expose one. Leaving it null here is safe: the next
        // `GET /api/workspaces/:workspaceId/projects` still completes it via
        // that existing, higher-fidelity pass.
        resourceHubResourceId: local?.resourceHubResourceId ?? null,
        cloudTombstonedAt: null,
        syncState: 'synced',
      },
    });
  }

  // Direction 2: a local Team row remote no longer lists. The owner daemon's
  // original project may safely become that owner's Personal draft, but a
  // teammate's pulled mirror is not the reader's content. Promoting those
  // stale bytes to Personal both leaks an unshared resource and fabricates
  // authorship. Keep a foreign mirror bound to its exact Team identity and
  // mark it deleted instead; the project bytes stay quarantined on disk and
  // only a later authoritative re-share + materialization may reactivate it.
  for (const [projectId, local] of localBindings) {
    if (local.workspaceId !== workspaceId || local.visibility !== 'team') continue;
    if (remoteIds.has(projectId)) continue;
    if (local.resourceState === 'deleted') continue;
    if (local.createdByWorkspaceMemberId !== workspaceMemberId) {
      actions.push({
        kind: 'revoke',
        projectId,
        workspaceId,
        patch: {
          visibility: 'team',
          resourceState: 'deleted',
          createdByWorkspaceMemberId: null,
          resourceHubResourceId: local.resourceHubResourceId,
          cloudTombstonedAt: null,
          syncState: 'synced',
        },
      });
      continue;
    }
    actions.push({
      kind: 'demote',
      projectId,
      workspaceId,
      patch: {
        visibility: 'personal',
        createdByWorkspaceMemberId: workspaceMemberId,
        resourceHubResourceId: null,
        cloudTombstonedAt: null,
        syncState: 'local_only',
      },
    });
  }

  return actions;
}

export interface WorkspaceProjectsReconcileIdentity {
  workspaceId: string;
  workspaceMemberId: string;
  /** Optional transport identity captured by the authority resolver. The
   *  pure planner does not inspect it, but the remote catalog reader must
   *  receive the same captured principal instead of reconstructing one
   *  after an await from mutable ambient Workspace state. */
  principal?: ResourceHubPrincipal | null;
}

export interface WorkspaceProjectsReconcilerDeps {
  /** The signed-in team workspace + member this daemon is currently acting
   *  as, or null off-team / signed out / removed. Must gate on active
   *  membership (`memberStatus === 'active'`), the same defensive check
   *  `should-publish.ts`'s `createShouldPublish` uses — a context that can
   *  still ADDRESS a resource hub partition is not proof this member is still
   *  IN the team (see that file's doc comment). */
  getWorkspaceIdentity: () => Promise<WorkspaceProjectsReconcileIdentity | null>;
  /** `listTeamProjects()` narrowed to what the planner needs — reuse the
   *  daemon's existing `teamProjectsForDisplay` (server.ts), the exact same
   *  read every other realtime consumer already shares, so this module never
   *  opens a second transport to Vela. */
  listRemoteTeamProjects: (
    identity: WorkspaceProjectsReconcileIdentity,
  ) => Promise<readonly RemoteTeamProjectRef[]>;
  /**
   * True when this daemon has a local `projects` row for the id — i.e. the
   * project's content has been materialized here (created locally, or pulled
   * from the hub). Gates the bind direction: `workspace_projects.project_id`
   * is a FOREIGN KEY into `projects(id)` (db.ts), so a bind INSERT for a
   * never-materialized project cannot succeed — and must not be attempted.
   * Materializing a project is the open/pull path's job
   * (`ensureSharedProjectPlaceholder` / `registerPulledProject` in
   * routes/collab-sync.ts), never this reconciler's; a remote catalog entry
   * with no local `projects` row and no local binding is simply out of this
   * daemon's scope until the member actually opens it (the team list already
   * displays it from the remote catalog alone — see
   * `listRemoteTeamProjectSummaries` in routes/project/index.ts).
   */
  hasLocalProject: (projectId: string) => boolean;
  /** Every row this daemon currently has bound `visibility: 'team'` for
   *  `workspaceId` (`listWorkspaceProjects(db, workspaceId)`, pre-filtered). */
  listLocalTeamRows: (workspaceId: string) => readonly LocalTeamProjectBinding[];
  /** This one project's current local binding (any workspace), or null if
   *  unbound (`getWorkspaceProjectByProjectId`). Only consulted for a remote
   *  project not already covered by `listLocalTeamRows`. */
  getLocalBinding: (projectId: string) => LocalTeamProjectBinding | null;
  getLocalProjectMetadata?: (
    projectId: string,
  ) => { name: string; updatedAt: number } | null;
  applyMetadataRefresh?: (
    projectId: string,
    patch: WorkspaceProjectMetadataPatch,
  ) => void;
  /**
   * Write a 'bind' action. MUST handle both cases `db.ts`'s two primitives
   * split across: a project with an existing (wrong) row (`rebindWorkspaceProject`,
   * keyed on project id alone so a stale workspace_id is corrected too) AND a
   * project with NO local row at all (`rebindWorkspaceProject` is a no-op in
   * that case — it never inserts — so the caller must fall back to
   * `ensureWorkspaceProject` with the same patch). See the wiring in
   * server.ts for the reference implementation.
   */
  applyBind: (projectId: string, patch: WorkspaceProjectBindPatch) => void;
  applyDemote: (workspaceId: string, projectId: string, patch: WorkspaceProjectDemotePatch) => void;
  /**
   * Quarantine a foreign pulled mirror after a successful authoritative
   * catalog read confirms it is absent. This must not delete project bytes.
   */
  applyRevoke: (workspaceId: string, projectId: string, patch: WorkspaceProjectRevokePatch) => void;
  onError?: (error: unknown) => void;
}

export interface WorkspaceProjectsReconcileResult {
  bound: number;
  demoted: number;
  revoked: number;
}

const NO_OP_RESULT: WorkspaceProjectsReconcileResult = {
  bound: 0,
  demoted: 0,
  revoked: 0,
};

function metadataRefreshPatch(input: {
  identity: WorkspaceProjectsReconcileIdentity;
  remote: RemoteTeamProjectRef;
  localBinding: LocalTeamProjectBinding | null;
  localProject: { name: string; updatedAt: number } | null;
}): WorkspaceProjectMetadataPatch | null {
  const { identity, remote, localBinding, localProject } = input;
  const displayName = remote.displayName?.trim() ?? '';
  const originUpdatedAt = remote.originProjectUpdatedAt;
  if (
    !displayName ||
    typeof originUpdatedAt !== 'number' ||
    !Number.isFinite(originUpdatedAt) ||
    !localProject ||
    originUpdatedAt <= localProject.updatedAt
  ) return null;

  // Only a foreign, active, read-only mirror may accept catalog metadata.
  // The owner's project can contain a rename that has not reached the hub yet.
  if (
    remote.ownerMemberId === identity.workspaceMemberId ||
    !localBinding ||
    localBinding.workspaceId !== identity.workspaceId ||
    localBinding.visibility !== 'team' ||
    localBinding.resourceState !== 'active' ||
    localBinding.createdByWorkspaceMemberId !== null
  ) return null;

  return { name: displayName, updatedAt: originUpdatedAt };
}

function applyRemoteMetadataRefresh(
  deps: WorkspaceProjectsReconcilerDeps,
  identity: WorkspaceProjectsReconcileIdentity,
  remote: RemoteTeamProjectRef,
  localBinding: LocalTeamProjectBinding | null,
): boolean {
  if (!deps.getLocalProjectMetadata || !deps.applyMetadataRefresh) return false;
  const patch = metadataRefreshPatch({
    identity,
    remote,
    localBinding,
    localProject: deps.getLocalProjectMetadata(remote.projectId),
  });
  if (!patch) return false;
  deps.applyMetadataRefresh(remote.projectId, patch);
  return true;
}

/**
 * Run one reconciliation pass: read the remote team-project list, diff it
 * against this daemon's own `workspace_projects` rows, and write back
 * whatever disagrees. Best-effort throughout — a failed identity read or a
 * failed remote read returns a no-op result rather than throwing, so a
 * transient Vela outage can never be misread as "remote reports zero
 * projects" and demote every local team row on missing (as opposed to
 * genuinely empty) data.
 */
export async function reconcileWorkspaceProjectsWithRemote(
  deps: WorkspaceProjectsReconcilerDeps,
): Promise<WorkspaceProjectsReconcileResult> {
  const identity = await deps.getWorkspaceIdentity().catch((error) => {
    deps.onError?.(error);
    return null;
  });
  if (!identity) return NO_OP_RESULT;

  let remoteProjects: readonly RemoteTeamProjectRef[];
  try {
    remoteProjects = await deps.listRemoteTeamProjects(identity);
  } catch (error) {
    deps.onError?.(error);
    return NO_OP_RESULT;
  }

  const localBindings = new Map<string, LocalTeamProjectBinding>();
  for (const row of deps.listLocalTeamRows(identity.workspaceId)) {
    localBindings.set(row.projectId, row);
  }
  for (const remote of remoteProjects) {
    if (localBindings.has(remote.projectId)) continue;
    const existing = deps.getLocalBinding(remote.projectId);
    if (existing) localBindings.set(remote.projectId, existing);
  }

  // Reconciliation corrects the bindings of projects this daemon KNOWS —
  // a remote catalog entry with neither a local binding nor a local
  // `projects` row has nothing local to correct, and binding it anyway
  // would violate `workspace_projects`' FOREIGN KEY into `projects(id)`
  // (the recvqmnuxxKHaI loop: the same INSERT failing on every pass, for
  // every never-opened teammate project). Excluding it here is safe for the
  // demote direction too: demotes only ever come from `localBindings`, and
  // a project excluded by this filter has, by construction, no entry there.
  const knownRemoteProjects = remoteProjects.filter(
    (remote) => localBindings.has(remote.projectId) || deps.hasLocalProject(remote.projectId),
  );

  const actions = planWorkspaceProjectReconciliation({
    workspaceId: identity.workspaceId,
    workspaceMemberId: identity.workspaceMemberId,
    remoteProjects: knownRemoteProjects,
    localBindings,
  });

  for (const action of actions) {
    try {
      if (action.kind === 'bind') deps.applyBind(action.projectId, action.patch);
      else if (action.kind === 'demote') {
        deps.applyDemote(action.workspaceId, action.projectId, action.patch);
      } else {
        deps.applyRevoke(action.workspaceId, action.projectId, action.patch);
      }
    } catch (error) {
      deps.onError?.(error);
    }
  }

  // This pass is also the poller's fallback for metadata-only catalog
  // changes. Evaluate it independently from the planner's already-correct
  // binding short-circuit: a correct binding can still carry a stale name.
  for (const remote of knownRemoteProjects) {
    try {
      applyRemoteMetadataRefresh(
        deps,
        identity,
        remote,
        localBindings.get(remote.projectId) ?? null,
      );
    } catch (error) {
      deps.onError?.(error);
    }
  }

  return {
    bound: actions.filter((action) => action.kind === 'bind').length,
    demoted: actions.filter((action) => action.kind === 'demote').length,
    revoked: actions.filter((action) => action.kind === 'revoke').length,
  };
}

/** Reconcile only the project named by a metadata hub event. The catalog read
 * remains authoritative, while local mutation is intentionally targeted. */
export async function reconcileWorkspaceProjectMetadataWithRemote(
  deps: WorkspaceProjectsReconcilerDeps,
  projectId: string,
): Promise<boolean> {
  const targetProjectId = projectId.trim();
  if (!targetProjectId) return false;
  const identity = await deps.getWorkspaceIdentity().catch((error) => {
    deps.onError?.(error);
    return null;
  });
  if (!identity) return false;

  let remoteProjects: readonly RemoteTeamProjectRef[];
  try {
    remoteProjects = await deps.listRemoteTeamProjects(identity);
  } catch (error) {
    deps.onError?.(error);
    return false;
  }
  const remote = remoteProjects.find((candidate) => candidate.projectId === targetProjectId);
  if (!remote) return false;
  try {
    return applyRemoteMetadataRefresh(
      deps,
      identity,
      remote,
      deps.getLocalBinding(targetProjectId),
    );
  } catch (error) {
    deps.onError?.(error);
    return false;
  }
}

/**
 * Hub → daemon handling for the `team-projects-changed` push (see
 * `startHubEventsSubscriber`'s `onEvent` in server.ts). Sibling of
 * `handleHubWorkspaceContextChanged` just above it in that file: besides
 * refreshing the display cache, this runs a real `workspace_projects`
 * reconciliation pass before sending the thin web signal
 * (`emitTeamProjectsChangedDeduped`), so a member whose owner just unshared a
 * project (or who just gained access to a new one) converges immediately
 * instead of waiting for the ~15s poller.
 *
 * Extracted as its own named, exported step for the same reason
 * `handleHubWorkspaceContextChanged` is: directly unit-testable without
 * standing up a real hub connection.
 */
export function handleHubTeamProjectsChanged(
  emitTeamProjectsChangedDeduped: () => void,
  reconcileWorkspaceProjects: () => Promise<unknown>,
): Promise<void> {
  // The web treats this signal as permission to re-read the currently open
  // project's scope. Emit only after the authoritative catalog diff has been
  // persisted; an eager signal can race the revoke write, re-confirm the stale
  // Team binding, and then leave the open page with no durable follow-up.
  return reconcileWorkspaceProjects()
    .then(() => emitTeamProjectsChangedDeduped())
    .catch(() => undefined);
}

/** Emit immediately for catalog-backed UI, then emit once more only after a
 * targeted local metadata write so SQLite-backed recent/project views refetch
 * after the durable state has changed. */
export function handleHubProjectMetadataChanged(
  emitProjectMetadataChanged: () => void,
  reconcileProjectMetadata: () => Promise<boolean>,
): Promise<void> {
  emitProjectMetadataChanged();
  return reconcileProjectMetadata()
    .then((changed) => {
      if (changed) emitProjectMetadataChanged();
    })
    .catch(() => undefined);
}

/**
 * `workspaceInvalidationPoller`'s `emit` wrapper (server.ts). The poller
 * itself stays a pure "diff and signal" utility
 * (`collab/workspace-invalidation-poller.ts`) with no opinion on
 * `workspace_projects`; this is the one seam where a `team-projects-changed`
 * signal ALSO kicks the real reconciliation — the poller's own ~15s-cadence
 * twin of `handleHubTeamProjectsChanged` above, for daemons that are signed
 * in but whose hub SSE channel is down (the poller is the sole delivery
 * mechanism in that state, per `startHubEventsSubscriber`'s own doc comment).
 */
export function handlePolledWorkspaceInvalidation(
  payload: WorkspaceInvalidationSsePayload,
  emit: (payload: WorkspaceInvalidationSsePayload) => void,
  reconcileWorkspaceProjects: () => Promise<unknown>,
): void {
  if (payload.type !== 'team-projects-changed') {
    emit(payload);
    return;
  }
  void reconcileWorkspaceProjects()
    .then(() => emit(payload))
    .catch(() => undefined);
}

import { useEffect, useRef, useState } from 'react';
import type {
  CollabMemberRole,
  CollabPresenceMember,
  ProjectContentTransferState,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import { resolveCollabSession } from './collab-session';
import {
  lastResolvedTeamProjects as cachedTeamProjects,
} from './useWorkspaceContext';
import { useCollab } from './useCollab';
import { workspaceIdentityCacheKey } from './workspace-identity';

// Workspace-scoped project ids the current viewer created in THIS browser
// session, tracked at module scope like `lastResolvedWorkspaceContext` /
// `lastResolvedTeamProjects` above. `createProject()` (`state/projects.ts`)
// calls `markProjectCreatedByViewer` with the exact context used for the create
// request — before the team catalog or this project's own `/collab/status`
// have had any chance to answer. The marker only relaxes that initial UNKNOWN
// window; an explicit daemon status always remains authoritative.
//
// This is the residual case #99's `knownOwnedByViewer` fix did not cover
// (recvpZzWYQrhZQ): #99 relaxes the window once the project is already IN the
// team catalog as owned-by-viewer, but a brand-new project is never in that
// catalog (it was only just created, not shared), so `knownUnshared` stayed
// false — and therefore fail-closed — until the catalog happened to load.
const projectScopesCreatedByViewerThisSession = new Set<string>();

function projectCreationScopeKey(
  projectId: string,
  workspaceContext: WorkspaceCollabContext | null,
): string {
  return JSON.stringify([workspaceIdentityCacheKey(workspaceContext), projectId]);
}

/**
 * Mark `projectId` as created under the exact Workspace authority used by its
 * create request. Call this the moment that request resolves. Idempotent; safe
 * to call more than once for the same identity and id.
 */
export function markProjectCreatedByViewer(
  projectId: string,
  workspaceContext: WorkspaceCollabContext | null,
): void {
  projectScopesCreatedByViewerThisSession.add(
    projectCreationScopeKey(projectId, workspaceContext),
  );
}

/** Test seam: clear the module-level creation cache between tests. */
export function resetProjectsCreatedByViewerCache(): void {
  projectScopesCreatedByViewerThisSession.clear();
}

/**
 * Whether the project's local file list must be read as "not downloaded yet"
 * rather than "this project is empty". Drives the syncing state that replaces
 * DesignFilesPanel's empty state and its create-a-file CTAs.
 *
 * Invariant: a shared project this daemon has never materialized is ALWAYS
 * download-pending, whatever the status poll has managed to learn about the
 * hub. `awaitingFirstMaterialization` is a purely local daemon fact (it holds
 * only a placeholder record for the project), so it is the one signal
 * available on the very first status response. The other three all need remote
 * enrichment that a fresh install's first response cannot carry, which is why
 * a brand-new member's first open showed an empty project with "create a new
 * sketch" CTAs over content that was still on its way.
 *
 * It also deliberately bypasses `shouldAutoPull` (member-of-a-shared-project).
 * The owner of a placeholder they have not materialized either — the reinstall
 * case, where the daemon self-pulls on their behalf — is looking at the same
 * empty directory, and "these files are not the content" is a fact about the
 * local record, not about who is allowed to pull it.
 */
function localFilesAreNotTheContentYet(signals: {
  awaitingFirstMaterialization: boolean;
  shouldAutoPull: boolean;
  transferring: boolean;
  behindPublishedHead: boolean;
  pullInFlight: boolean;
}): boolean {
  if (signals.awaitingFirstMaterialization) return true;
  return (
    signals.shouldAutoPull
    && (signals.transferring || signals.behindPublishedHead || signals.pullInFlight)
  );
}

export interface UseProjectCollabOptions {
  /**
   * Project-bound Workspace authority. Production project views pass the
   * persisted project's resolved context here so ambient navigation cannot
   * retarget status, presence, or pull requests.
   *
   * Omitted or explicit `null` means the project scope is unresolved/refused
   * and keeps collab dormant. There is intentionally no shell-context fallback.
   */
  workspaceContext?: WorkspaceCollabContext | null;
  workspaceContextLoading?: boolean;
  /**
   * Route bootstrap already proved that the local row is only a Team-bound
   * placeholder. Keep writes and empty-file affordances fail-closed from the
   * first paint until this hook completes its own status check.
   */
  initialMaterializationPending?: boolean;
  /** Injectable for tests. */
  fetch?: typeof fetch;
  baseUrl?: string;
  heartbeatMs?: number;
  statusPollMs?: number;
  presenceFilePath?: string | null;
  presenceActivity?: CollabPresenceMember['activity'];
}

interface WorkspaceContextState {
  context: WorkspaceCollabContext | null;
  loading: boolean;
}

function useWorkspaceContextState(options: UseProjectCollabOptions = {}): WorkspaceContextState {
  const hasExplicitWorkspaceContext =
    Object.prototype.hasOwnProperty.call(options, 'workspaceContext');
  const [state, setState] = useState<WorkspaceContextState>(() => {
    return hasExplicitWorkspaceContext
      ? {
          context: options.workspaceContext ?? null,
          loading: options.workspaceContextLoading ?? false,
        }
      : { context: null, loading: true };
  });

  useEffect(() => {
    setState(
      hasExplicitWorkspaceContext
        ? {
            context: options.workspaceContext ?? null,
            loading: options.workspaceContextLoading ?? false,
          }
        : { context: null, loading: true },
    );
  }, [
    hasExplicitWorkspaceContext,
    options.workspaceContext,
    options.workspaceContextLoading,
  ]);

  return state;
}

/**
 * Return the exact project Workspace supplied by the caller. There is no
 * ambient self-fetch fallback: a project must never borrow shell navigation.
 */
export function useWorkspaceContext(options: UseProjectCollabOptions = {}): WorkspaceCollabContext | null {
  return useWorkspaceContextState(options).context;
}

export interface ProjectCollab {
  /** Whether collab (presence + sync) is active for this project + viewer. */
  enabled: boolean;
  /** The viewer's presence identity, when enabled. */
  member: CollabPresenceMember | null;
  present: CollabPresenceMember[];
  publishedVersion: number | null;
  syncState: ReturnType<typeof useCollab>['syncState'];
  /**
   * Whether the viewer should see this project single-writer/read-only. Two
   * independent gates make it read-only:
   *  1. Workspace-level — the workspace is not writable (`permissions
   *     .canWriteSyncedFiles` is false: locked/frozen billing, or the member was
   *     removed). This freezes EVERYONE, the project owner included.
   *  2. Project-level — the project is shared to the team and the viewer is not
   *     its owner (the member who shared it). Ownership, not workspace role, is
   *     the determinant, so the sharer keeps editing while everyone else views.
   * A personal / unshared project in a writable workspace is never read-only.
   */
  viewerOnly: boolean;
  /**
   * Positive project-writer authority for mutations that must not be inferred
   * from `!viewerOnly`. `pending` covers the status window where the UI may
   * provisionally remain editable but ownership has not been proven yet.
   */
  writerAuthority: 'allowed' | 'denied' | 'pending';
  /**
   * Whether the viewer is this project's OWNER — the member who shared it (its
   * single writer). True only when the polled `ownerMemberId` explicitly matches
   * the current member; it fails closed during the status-load window and for
   * every non-owner. Distinct from `!viewerOnly`, which a workspace-level freeze
   * (locked billing / removed member) can also flip. Drives per-comment
   * permission gates (the owner may delete or send any member's comment) without
   * re-deriving ownership at the call site.
   */
  isOwner: boolean;
  /**
   * Effective project ownership for UX that must not wait on `/collab/status`.
   * True when status confirms the viewer is the single writer **or** the hub
   * catalog already names them as owner (issue #99) **or** this tab created
   * the project this session. Prefer this over raw `isOwner` for sticky defaults
   * (e.g. default chat open/collapsed) that would otherwise latch wrong while
   * `ownerMemberId` is still missing from a shared status payload.
   */
  isEffectiveOwner: boolean;
  /**
   * Confirmed: this is a shared team project the viewer did **not** create.
   * Requires positive evidence of a different owner (status `ownerMemberId`,
   * catalog owner, or a previously confirmed non-owner relationship) — never
   * mere `!isOwner` during the status-unknown window.
   */
  isSharedNonOwner: boolean;
  /**
   * Display name of the member who shared this project (its owner), resolved
   * server-side from the collab-cloud member directory. Drives the "这是 {owner}
   * 创建的共享项目" read-only banner. Null when the project is unshared, off-team,
   * or the owner is not in the directory — the banner then falls back to its
   * name-less copy.
   */
  ownerDisplayName: string | null;
  /** The owner's team role (owner/admin/member); null when unresolved. */
  ownerRole: CollabMemberRole | null;
  /**
   * True only once status has confirmed that a non-owner member's local
   * mirror trails the published head, or while the corresponding pull is
   * active. Status latency by itself is not evidence that local files are
   * stale: reopening an already-materialized project must keep its local
   * files visible while the first status request is in flight.
   */
  downloadPending: boolean;
  /** The exact local project tree is not usable as content authority yet. */
  materializationPending?: boolean;
  reportChange: () => void;
  requestPublish: () => void;
  /** Refresh the presence roster now (hub push-channel consumer). */
  refreshPresence: () => void;
  /** Run one status check now (hub push-channel consumer). */
  checkStatusNow: () => void;
  /** Apply an inbound-transfer lifecycle update from the project SSE. */
  applyContentTransferState?: (state: ProjectContentTransferState) => void;
}

export function resolveProjectWriterAuthority(options: {
  workspaceReadOnly: boolean;
  workspaceContextReadOnly: boolean;
  lostAccessAfterUnshare: boolean;
  shared: boolean;
  isOwner: boolean;
  knownOwnedByViewer: boolean;
  createdByViewerThisSession: boolean;
  materializationPending?: boolean;
  syncState: ProjectCollab['syncState'];
}): ProjectCollab['writerAuthority'] {
  if (options.workspaceReadOnly || options.lostAccessAfterUnshare) return 'denied';
  if (options.materializationPending) return 'pending';
  if (options.workspaceContextReadOnly) return 'pending';
  // A settled daemon status outranks every provisional browser-side witness.
  // Catalog ownership and same-session creation exist only to bridge the
  // UNKNOWN window; once status names another writer they must not keep write
  // authority alive.
  if (options.shared) {
    return options.isOwner ? 'allowed' : 'denied';
  }
  if (options.syncState === 'local_only') return 'allowed';
  if (
    options.syncState === null
    && (options.knownOwnedByViewer || options.createdByViewerThisSession)
  ) {
    return 'allowed';
  }
  return 'pending';
}

/**
 * Real-product collab integration for a project : resolves the workspace
 * context → decides whether collab runs (team member of a live workspace) → runs
 * presence + sync for the viewer. Dormant (enabled=false, no heartbeat) when the
 * project is personal / the viewer is not a team member — so it is safe to mount
 * unconditionally in the project view.
 */
export function useProjectCollab(
  projectId: string | null | undefined,
  options: UseProjectCollabOptions = {},
): ProjectCollab {
  const { context, loading: workspaceContextLoading } = useWorkspaceContextState(options);
  const decision = resolveCollabSession(context);
  const member = decision.member
    ? {
        ...decision.member,
        ...(options.presenceFilePath ? { filePath: options.presenceFilePath } : {}),
        ...(options.presenceActivity !== undefined ? { activity: options.presenceActivity } : {}),
      }
    : null;
  const collab = useCollab({
    projectId: projectId ?? null,
    member,
    workspaceContext: context,
    enabled: decision.enabled,
    // Collab routes fail closed without an explicit workspace identity. Wait
    // for context, then bind every status/presence/pull request to that exact
    // identity; switching workspace recreates the client and tombstones the
    // old response stream.
    statusEnabled: Boolean(projectId) && decision.enabled,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
    ...(options.heartbeatMs !== undefined ? { heartbeatMs: options.heartbeatMs } : {}),
    ...(options.statusPollMs !== undefined ? { statusPollMs: options.statusPollMs } : {}),
  });
  const workspaceIdentity = workspaceIdentityCacheKey(context);
  // Gate 1 (workspace-level): a non-writable workspace (locked/frozen billing or
  // a removed member) freezes everyone — consume B's `canWriteSyncedFiles` bit
  // rather than re-deriving from lifecycle so the two lanes cannot drift.
  const workspaceReadOnly = context != null && !context.permissions.canWriteSyncedFiles;
  // Gate 2 (project-level): a project shared to the team (syncState past
  // `local_only`) is read-only for everyone except the member who shared it — the
  // single writer keeps editing their own project. This fails closed: it stays
  // read-only until the polled owner id EXPLICITLY matches the current member, so
  // a non-owner (of any workspace role — including admin/owner) never gets edit
  // affordances during the load window or when a `/collab/status` payload is
  // briefly missing `ownerMemberId`. The real owner sees a momentary read-only
  // state until their id is confirmed, then flips to editable. A personal /
  // unshared project is never read-only on this gate.
  const statusUnknown = decision.enabled && collab.syncState === null;
  const shared = collab.syncState !== 'local_only' && collab.syncState !== null;
  const collabEnabled = decision.enabled && (statusUnknown || shared);
  const isOwner = collab.ownerMemberId != null && collab.ownerMemberId === context?.workspaceMemberId;
  // A project this browser tab created moments ago was not shared at create
  // time. Scope the signal to the exact Workspace identity used by the create
  // request so switching to a different Workspace with the same project id
  // cannot inherit it.
  const createdByViewerThisSession =
    Boolean(projectId)
    && projectScopesCreatedByViewerThisSession.has(
      projectCreationScopeKey(projectId as string, context),
    );
  // Context loading is not the same as confirmed off-team. Fail closed during
  // the initial workspace-context request so an already-pulled shared project
  // never flashes writable controls before B confirms the current member.
  // Once the same exact request identity has also received a fresh collab
  // status naming it as owner, however, the single-writer proof is complete:
  // a concurrent project-scope revalidation must not demote that owner to a
  // viewer until the redundant read settles.
  const workspaceContextReadOnly =
    Boolean(projectId)
    && workspaceContextLoading
    && !isOwner
    && !createdByViewerThisSession;
  // A project the hub catalog does not list cannot be shared, so the unknown
  // window does not have to fail closed for it. That window is why a member's
  // OWN fresh private draft flashed the "这是共享项目" read-only banner before
  // `/collab/status` answered (acceptance #27).
  //
  // `null` means the catalog was never read, which is NOT "nothing is shared" —
  // that case keeps failing closed. This only relaxes the UNKNOWN window; once
  // a status arrives, `shared && !isOwner` decides as before.
  const knownCatalog = options.fetch || options.baseUrl ? null : cachedTeamProjects(context);
  const knownUnshared =
    knownCatalog !== null
    && Boolean(projectId)
    && !knownCatalog.some((entry) => entry.projectId === projectId);
  // The hub catalog records each shared project's `ownerMemberId` — the same id
  // `/collab/status` later confirms as the single writer. When it already names
  // the current member as the owner, the viewer IS the owner regardless of
  // whether the (seconds-long) status poll has answered yet. Trusting it here is
  // what stops an owner's OWN shared project from flashing the "这是共享项目"
  // read-only banner for 1-2s on open, before `ownerMemberId` arrives and
  // `isOwner` flips (issue #99, rec:recvpZwaJNpVai). Same production-only cache
  // the unshared relaxation reads; an injected-fetch test pointing at its own
  // daemon gets `null` and keeps failing closed. Ownership never transfers (the
  // sharer is always the writer), so this catalog fact cannot go stale-wrong.
  const knownOwnedByViewer =
    knownCatalog !== null
    && Boolean(projectId)
    && context?.workspaceMemberId != null
    && knownCatalog.some(
      (entry) => entry.projectId === projectId && entry.ownerMemberId === context.workspaceMemberId,
    );
  // Catalog names a different member as the single writer — usable before
  // `/collab/status` confirms ownerMemberId (mirror of knownOwnedByViewer).
  const knownOwnedBySomeoneElse =
    knownCatalog !== null
    && Boolean(projectId)
    && context?.workspaceMemberId != null
    && knownCatalog.some(
      (entry) =>
        entry.projectId === projectId
        && entry.ownerMemberId != null
        && entry.ownerMemberId !== context.workspaceMemberId,
    );
  // Status-confirmed ownership OR catalog/session shortcuts (issue #99 path).
  const isEffectiveOwner = isOwner || knownOwnedByViewer || createdByViewerThisSession;
  const statusNamedDifferentOwner =
    collab.ownerMemberId != null
    && context?.workspaceMemberId != null
    && collab.ownerMemberId !== context.workspaceMemberId;
  // Once the catalog or `/collab/status` has EXPLICITLY named another member
  // as this project's owner, remember it for as long as this
  // component stays mounted on this projectId. The owner unsharing later
  // makes `/collab/status` regress to the exact same shape as a project that
  // was NEVER shared (syncState: 'local_only', ownerMemberId: null) —
  // `shared && !isOwner` alone cannot tell those two cases apart, and briefly
  // unlocked full edit access (including sending chat messages) for a member
  // who had just lost read access entirely. A project once confirmed to be
  // someone else's must never look like the viewer's own personal project
  // again, no matter what a later poll reports.
  const relationshipScopeKey = projectId
    ? `${workspaceIdentity}:${projectId}`
    : null;
  const confirmedOwnedBySomeoneElseRef = useRef<string | null>(null);
  if (
    confirmedOwnedBySomeoneElseRef.current !== null
    && confirmedOwnedBySomeoneElseRef.current !== relationshipScopeKey
  ) {
    confirmedOwnedBySomeoneElseRef.current = null;
  }
  if (
    projectId
    && (
      knownOwnedBySomeoneElse
      || (shared && statusNamedDifferentOwner)
    )
  ) {
    confirmedOwnedBySomeoneElseRef.current = relationshipScopeKey;
  }
  const lostAccessAfterUnshare =
    confirmedOwnedBySomeoneElseRef.current === relationshipScopeKey
    && collab.syncState === 'local_only'
    && !isOwner;
  // The project-level (single-writer) gate. Catalog ownership and the
  // same-session creation marker are provisional evidence used only while
  // status is UNKNOWN, removing the on-open flash. Once daemon status resolves,
  // its shared/owner facts win even if either provisional signal is stale.
  const unknownStatusReadOnly =
    statusUnknown
    && !knownUnshared
    && !knownOwnedByViewer
    && !createdByViewerThisSession;
  const sharedReadOnly =
    unknownStatusReadOnly || (shared && !isOwner) || lostAccessAfterUnshare;
  const viewerOnly = workspaceContextReadOnly || workspaceReadOnly || sharedReadOnly;
  const materializationPending =
    collab.awaitingFirstMaterialization
    || (
      options.initialMaterializationPending === true
      && collab.statusPollGeneration === 0
    );
  const writerAuthority = resolveProjectWriterAuthority({
    workspaceReadOnly,
    workspaceContextReadOnly,
    lostAccessAfterUnshare,
    shared,
    isOwner,
    knownOwnedByViewer,
    createdByViewerThisSession,
    materializationPending,
    syncState: collab.syncState,
  });
  // Positive non-owner evidence only — sticky UX (default-collapsed chat) must
  // not latch on `shared && !isOwner` while ownerMemberId is still missing from
  // an otherwise-shared status payload for the real owner.
  const isSharedNonOwner =
    !isEffectiveOwner
    && (knownOwnedBySomeoneElse
      || (shared && statusNamedDifferentOwner)
      || lostAccessAfterUnshare);

  // Member content auto-sync (the last link): when a read-only member sees the
  // resource-hub head (`publishedVersion`) advance past what we last pulled,
  // pull the new content into the local project directory. The daemon
  // materializes it and its file watcher then fires the existing live-reload SSE
  // (`useProjectFileEvents` in ProjectView, gated on `daemonLive`), so the
  // FileViewer refreshes on its own — no extra reload wiring is needed here.
  //
  // Only non-owner members of a shared project pull. The owner is the single
  // writer; their local copy is already the newest, and pulling could clobber
  // unpublished edits. A workspace-level read-only freeze also must not make the
  // owner auto-pull over their own working tree, so this gate keys off explicit
  // project ownership instead of the broader `viewerOnly` flag.
  //
  // The cursor seeds from the daemon's durable materializedVersion. A missing
  // cursor fails closed to 0 and pulls; an exact match proves this daemon
  // already has the published head, including across tab remounts/restarts.
  const pullCursorRef = useRef<{ scopeKey: string | null; version: number }>({
    scopeKey: null,
    version: 0,
  });
  const pullInFlightRef = useRef(false);
  // Bumped after each successful pull to re-evaluate immediately — this catches
  // a head that advanced while a pull was in flight (the plain publishedVersion
  // dep would otherwise not re-fire once it settles on the newer number).
  const [pullTick, setPullTick] = useState(0);
  const projectKey = projectId ? `${workspaceIdentity}:${projectId}` : null;
  if (pullCursorRef.current.scopeKey !== projectKey) {
    pullCursorRef.current = {
      scopeKey: projectKey,
      version: collab.materializedVersion ?? 0,
    };
  } else if (
    collab.materializedVersion != null
    && collab.materializedVersion > pullCursorRef.current.version
  ) {
    // The daemon's durable, owner-scoped cursor is the cold-start truth. Keep
    // the optimistic response cursor below only when it is newer than the
    // latest status response (a pull can finish just before its refresh lands).
    pullCursorRef.current.version = collab.materializedVersion;
  }
  // A pull from the prior project can resolve after navigation. Epoch-gate all
  // async writes so that late completion cannot overwrite the new project's
  // cursor or release its in-flight lock.
  const projectEpochRef = useRef(0);
  useEffect(() => {
    const epoch = projectEpochRef.current + 1;
    projectEpochRef.current = epoch;
    pullInFlightRef.current = false;
    return () => {
      if (projectEpochRef.current === epoch) {
        projectEpochRef.current += 1;
        pullInFlightRef.current = false;
      }
    };
  }, [projectId, workspaceIdentity]);
  const { publishedVersion } = collab;
  const pull = collab.pull;
  const checkStatusNow = collab.checkStatusNow;
  const shouldAutoPull = decision.enabled && shared && !isOwner;
  useEffect(() => {
    if (!shouldAutoPull) return;
    if (publishedVersion == null) return;
    if (publishedVersion <= pullCursorRef.current.version) return;
    if (pullInFlightRef.current) return;
    const epoch = projectEpochRef.current;
    pullInFlightRef.current = true;
    void (async () => {
      let advanced = false;
      try {
        const pulledVersion = await pull();
        if (projectEpochRef.current !== epoch) return;
        // Advance from the daemon's ACTUAL pull response, never from the
        // requested target. A null response cannot prove bytes landed and must
        // remain retryable on the next successful status poll.
        if (pulledVersion != null) {
          pullCursorRef.current.version = Math.max(
            pullCursorRef.current.version,
            pulledVersion,
          );
          advanced = true;
        }
      } catch {
        // Swallow: statusPollGeneration changes on every successful ~5s status
        // response, even when publishedVersion is numerically unchanged, so the
        // next poll retries while the durable/local cursor remains behind.
      } finally {
        if (projectEpochRef.current === epoch) {
          pullInFlightRef.current = false;
        }
      }
      if (advanced && projectEpochRef.current === epoch) {
        setPullTick((n) => n + 1);
        // Re-read the daemon's durable materialization cursor immediately;
        // polling remains the bounded fallback if this refresh fails.
        checkStatusNow();
      }
    })();
  }, [
    shouldAutoPull,
    publishedVersion,
    pull,
    pullTick,
    collab.statusPollGeneration,
    checkStatusNow,
  ]);

  // Status latency alone is not a download: absent a placeholder, only replace
  // local file rows with skeletons after status has confirmed this member
  // should pull and the durable/local cursor is actually behind (or that pull
  // is still active). `pullTick` is not read directly, but its state bump
  // forces this render to observe the ref cursor written by a successful pull.
  const downloadPending = localFilesAreNotTheContentYet({
    awaitingFirstMaterialization: materializationPending,
    shouldAutoPull,
    transferring: collab.contentTransferState?.status === 'downloading',
    behindPublishedHead:
      publishedVersion != null && publishedVersion > pullCursorRef.current.version,
    pullInFlight: pullInFlightRef.current,
  });

  return {
    enabled: collabEnabled,
    member,
    present: collab.present,
    publishedVersion: collab.publishedVersion,
    syncState: collab.syncState,
    viewerOnly,
    writerAuthority,
    isOwner,
    isEffectiveOwner,
    isSharedNonOwner,
    ownerDisplayName: collab.ownerDisplayName,
    ownerRole: collab.ownerRole,
    downloadPending,
    materializationPending,
    reportChange: collab.reportChange,
    requestPublish: collab.requestPublish,
    refreshPresence: collab.refreshPresence,
    checkStatusNow: collab.checkStatusNow,
    applyContentTransferState: collab.applyContentTransferState,
  };
}

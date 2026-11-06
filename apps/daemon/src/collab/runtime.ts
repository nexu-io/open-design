// Team collaboration daemon subsystem: bundles the author-side publish
// scheduler and the presence tracker behind one factory so the server wires
// them once. The resource hub itself is E's (the resource-hub owner) — this
// holds only C's trigger + presence, talking to the hub through
// ResourcePublishAdapter.

import type { PublicShareProjectRegistration, ProjectSyncState } from '@open-design/contracts';
import { projectResourceIdFor } from '../integrations/vela-team-projects.js';
import { createPublicFileMutations } from './public-file-mutations.js';
import {
  CollabPresenceTracker,
  type CollabPresenceTrackerOptions,
  type PresenceMember,
} from './presence-tracker.js';
import {
  CollabPublishScheduler,
  type CollabPublishSchedulerOptions,
  type PublishedResourceVersion,
  type ResourcePublishAdapter,
} from './publish-scheduler.js';
import type { ResourceHubPrincipal } from './resource-principal.js';
import { createStubResourcePublishAdapter } from './stub-resource-adapter.js';
import {
  createDevTeamResourceStateProvider,
  type TeamResourceStateProvider,
} from './team-resource-state.js';
import {
  createVelaCliResourceAdapter,
  shouldUseVelaCliResourceTransport,
} from './vela-cli-resource-adapter.js';
import type { VelaOwnerProjectRegistration } from './vela-cli-team-projects.js';
import type { WorkspaceContextProvider } from './workspace-context.js';
import { createWorkspaceContextProviderFromEnv } from './vela-workspace-context.js';

type TeamProjectCatalogSyncState = 'pending_upload' | 'synced' | 'failed';

const TEAM_PROJECT_METADATA_RETRY_BASE_MS = 1_000;
const TEAM_PROJECT_METADATA_RETRY_MAX_MS = 30_000;

interface TeamProjectCatalogSink {
  ensurePrivate?(projectId: string, principal: ResourceHubPrincipal): Promise<PublicShareProjectRegistration>;
  setVisibility?(projectId: string, visibility: 'private' | 'team', principal: ResourceHubPrincipal): Promise<void>;
  getRegistration?(projectId: string, principal: ResourceHubPrincipal): Promise<VelaOwnerProjectRegistration | null>;
  upsert(
    input: {
      projectId: string;
      resourceId: string;
      displayName?: string | null;
      syncState?: TeamProjectCatalogSyncState;
      lastSyncedVersionId?: string | null;
      metadata?: Record<string, unknown> | null;
    },
    principal?: ResourceHubPrincipal | null,
  ): Promise<unknown>;
  remove?(projectId: string, principal?: ResourceHubPrincipal | null): Promise<unknown>;
}

/**
 * The subset of {@link CollabPublishScheduler} the rest of the daemon is
 * allowed to drive directly (the HTTP routes and the project file watcher —
 * see `server.ts`'s `notifyFilesChanged` wiring). Narrowed to an interface,
 * rather than exposing the class, so `createCollabRuntime` can hand out a
 * facade that also updates `syncState` on every author-side change without
 * either side needing to know about the other.
 */
export interface CollabRuntimeScheduler {
  notifyChanged(
    projectId: string,
    reason?: string,
    principal?: ResourceHubPrincipal | null,
  ): void;
  runBoundary(
    projectId: string,
    principal?: ResourceHubPrincipal | null,
  ): void;
}

export interface CollabRuntime {
  isTeamShareSuppressed(projectId: string, scope: Pick<ResourceHubPrincipal, 'teamId' | 'memberId'>): boolean;
  forgetTeamShare?(projectId: string, principal?: ResourceHubPrincipal | null): Promise<void>;
  syncExistingTeamProject(projectId: string, principal: ResourceHubPrincipal): Promise<{ version: number | null }>;
  presence: CollabPresenceTracker;
  scheduler: CollabRuntimeScheduler;
  /** Workspace-context provider — the B-integration seam (identity/visibility). */
  workspaceContext: WorkspaceContextProvider;
  /** Team-resource state provider — the E-resource-hub seam (share/freeze state). */
  teamResources: TeamResourceStateProvider;
  /** Last published version for a project (members poll this to know what to pull). */
  publishedVersion(projectId: string, principal?: ResourceHubPrincipal | null): number | null;
  /**
   * Current published head from the resource hub, not just this daemon's memory.
   * Members never publish the owner's project, so this is the cross-daemon source
   * that tells them a pull is needed.
   */
  publishedHead(projectId: string, principal?: ResourceHubPrincipal | null): Promise<number | null>;
  /** Sync state for a project (`local_only` until a share is requested). */
  projectSyncState(projectId: string, principal?: ResourceHubPrincipal | null): ProjectSyncState;
  /**
   * Explicit Team move: publish the retained root, then ACK visibility.
   */
  requestTeamShare(
    projectId: string,
    share?: string | ResourceHubPrincipal,
  ): Promise<{ version: number | null; versionId?: string }>;
  /** Move to private without deleting content or catalog identity. */
  requestTeamUnshare(projectId: string, principal?: ResourceHubPrincipal | null): Promise<void>;
  /** Permanent deletion, after public bindings have stopped. */
  requestTeamDelete(projectId: string, principal: ResourceHubPrincipal): Promise<void>;
  /** Restore a persisted team share into runtime bookkeeping without publishing. */
  rememberTeamShare(
    projectId: string,
    share: ResourceHubPrincipal,
    syncState?: ProjectSyncState,
    restore?: { metadataRefreshPending?: boolean },
  ): void;
  /**
   * Re-upsert the shared project's catalog entry so metadata-only changes
   * (rename today) reach teammates without waiting for the next content
   * publish — before this, a rename with no follow-up file edit NEVER
   * converged on member clients. No-op for projects that are not shared
   * from this daemon. Fire-and-forget; failures land on the metadata-only
   * retry hooks and never mutate content `syncState`.
   */
  refreshTeamProjectMetadata(projectId: string): void;
  /** The member who shared this project, or null if not shared here. */
  projectOwnerMemberId(projectId: string, principal?: ResourceHubPrincipal | null): string | null;
  /** Materialize the published tree into the local member copy. */
  pullLatest(projectId: string, principal?: ResourceHubPrincipal | null): Promise<{ version: number | null; versionId?: string; resourceId?: string }>;
  dispose(): void;
}

export interface CreateCollabRuntimeOptions {
  coordinatePublication?: (
    projectId: string,
    principal: ResourceHubPrincipal | null | undefined,
    publish: () => Promise<PublishedResourceVersion | null>,
  ) => Promise<PublishedResourceVersion | null>;
  adapter?: ResourcePublishAdapter;
  /** Exact persisted server root. When provided, missing authority must throw. */
  resolveResourceId?: (projectId: string, principal?: ResourceHubPrincipal | null) => string | Promise<string>;
  retainRegistration?: (registration: PublicShareProjectRegistration, principal: ResourceHubPrincipal) => void | Promise<void>;
  /** Managed-project directory resolver, so the real hub adapter can pack/land. */
  resolveProjectDir?: (projectId: string) => string | Promise<string>;
  /** Pull destination for a project that may not have a local database row yet. */
  resolvePullDir?: (projectId: string) => string | Promise<string>;
  /** Resource-index metadata for team project discovery/cards. */
  describeProject?: (projectId: string) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>;
  /** Workspace-context provider. Defaults to a dev provider until wired to an identity source. */
  workspaceContext?: WorkspaceContextProvider;
  /** Team-resource state provider. Defaults to a dev provider until wired to the hub. */
  teamResources?: TeamResourceStateProvider;
  /** Vela-owned team-project discovery catalog. Runtime treats it as an injectable sink. */
  teamProjectCatalog?: TeamProjectCatalogSink;
  /** Fired after a project is published so the caller can notify online members. */
  onPublished?: (result: {
    projectId: string;
    version: number;
    versionId?: string;
    reason: string;
    principal: ResourceHubPrincipal | null;
  }) => void;
  /** Fired when a project's presence set changes (join/leave). */
  onPresenceChange?: (result: { projectId: string; present: PresenceMember[] }) => void;
  onError?: (result: { projectId: string; error: unknown; principal: ResourceHubPrincipal | null }) => void;
  /**
   * Metadata-only catalog refresh failures have their own retry loop and must
   * not mark already-published project content as `sync_failed`.
   */
  onMetadataRefreshError?: (result: {
    projectId: string;
    error: unknown;
    principal: ResourceHubPrincipal;
  }) => void;
  /** Persist the exact Team/project repair intent before its async upsert. */
  onMetadataRefreshPending?: (result: {
    projectId: string;
    principal: ResourceHubPrincipal;
  }) => void;
  /** Clear the durable repair intent after the final upsert or unshare wins. */
  onMetadataRefreshComplete?: (result: {
    projectId: string;
    principal: ResourceHubPrincipal;
  }) => void;
  /**
   * Gate for SCHEDULER-driven publishes (file watcher, `/collab/changed`,
   * `/collab/publish`, run boundaries): return false and the flush becomes a
   * no-op for that project. The second layer of the fresh-install wipe guard
   * (recvqzaDvUU6B3) — `should-publish.ts` keeps a placeholder from ever
   * being WATCHED, this keeps an already-scheduled notification (or a direct
   * HTTP nudge) from publishing one. Deliberately NOT consulted by
   * `requestTeamShare`/`publishNow`: an explicit share is the user saying
   * "publish my local state", which must keep working for brand-new local
   * projects. Defaults to allow.
   */
  canPublishProjectContent?: (projectId: string) => boolean;
}

function selectResourcePublishAdapter(
  resolveProjectDir: ((projectId: string) => string | Promise<string>) | undefined,
  resolvePullDir: ((projectId: string) => string | Promise<string>) | undefined,
  describeProject: ((projectId: string) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>) | undefined,
  resourceIdFor: CreateCollabRuntimeOptions['resolveResourceId'],
): ResourcePublishAdapter | null {
  if (!resolveProjectDir) return null;
  if (shouldUseVelaCliResourceTransport()) {
    return createVelaCliResourceAdapter({
      resolveProjectDir,
      ...(resourceIdFor ? { resolveResourceId: resourceIdFor } : {}),
      ...(resolvePullDir ? { resolvePullDir } : {}),
      ...(describeProject ? { describeProject } : {}),
      // Every data-plane caller must provide a principal that was captured from
      // an explicit, authoritative Workspace scope. There is no ambient
      // Workspace fallback at the transport boundary.
      hasTeamIdentity: (principal) => principal != null,
    });
  }
  return null;
}

export function createCollabRuntime(options: CreateCollabRuntimeOptions = {}): CollabRuntime {
  const workspaceContext = options.workspaceContext ?? createWorkspaceContextProviderFromEnv();
  const sharePrincipals = new Map<string, Map<string, ResourceHubPrincipal>>();
  const knownScopedPrincipals = new Map<string, ResourceHubPrincipal>();
  const scopedOwners = new Map<string, string>();
  const published = new Map<string, number>();
  const syncStates = new Map<string, ProjectSyncState>();
  const owners = new Map<string, string>();
  const unshared = new Set<string>();
  const barePublishResults = new Map<
    string,
    Map<string, PublishedResourceVersion>
  >();
  const SCOPED_PROJECT_SEPARATOR = '\u0000';

  type PendingMetadataRefresh = {
    projectId: string;
    principal: ResourceHubPrincipal;
    syncState: TeamProjectCatalogSyncState;
    revision: number;
    attempt: number;
    timer: ReturnType<typeof setTimeout> | null;
    inFlight: Promise<void> | null;
    cancelled: boolean;
  };
  const pendingMetadataRefreshes = new Map<string, PendingMetadataRefresh>();
  // One project transport lane drains admitted work before an explicit policy
  // write. New scheduler/metadata work re-checks membership inside this lane.
  const transport = createPublicFileMutations();
  const transitioning = new Map<string, number>();
  const retainedRoots = new Map<string, string>();

  function withPolicyChange<T>(projectId: string, targets: ResourceHubPrincipal[], operation: () => Promise<T>): Promise<T> {
    transitioning.set(projectId, (transitioning.get(projectId) ?? 0) + 1);
    // Cancel synchronously, then reserve this move's place behind already
    // admitted transport. Pending metadata is already queued before this lane.
    const draining = Promise.all(targets.map(target => cancelTeamProjectMetadataRefresh(projectId, target)));
    return transport.run(projectId, async () => {
      await draining;
      return operation();
    }).finally(() => {
      const remaining = (transitioning.get(projectId) ?? 1) - 1;
      if (remaining) transitioning.set(projectId, remaining);
      else transitioning.delete(projectId);
    });
  }

  function forgetTeamShareState(projectId: string, targets: ResourceHubPrincipal[]) {
    for (const target of targets) {
      const key = scopedProjectKey(projectId, target);
      unshared.add(key);
      published.delete(key);
      syncStates.set(key, 'local_only');
      scopedOwners.delete(key);
      sharePrincipals.get(projectId)?.delete(target.teamId);
      options.onMetadataRefreshComplete?.({ projectId, principal: target });
    }
    if (!sharePrincipals.get(projectId)?.size) {
      sharePrincipals.delete(projectId);
      unshared.add(projectId);
    }
    refreshProjectAggregate(projectId);
  }

  const rootFor = (projectId: string, principal: ResourceHubPrincipal) =>
    retainedRoots.get(`${principal.teamId}\u0000${projectId}`)
      ?? options.resolveResourceId?.(projectId, principal)
      ?? projectResourceIdFor(projectId, principal);
  const isShared = (projectId: string, principal: ResourceHubPrincipal) =>
    sharePrincipals.get(projectId)?.get(principal.teamId)?.memberId === principal.memberId;


  const scopedProjectKey = (projectId: string, principal: ResourceHubPrincipal) =>
    `${principal.teamId}${SCOPED_PROJECT_SEPARATOR}${projectId}`;

  const principalsForProject = (projectId: string) => [
    ...(sharePrincipals.get(projectId)?.values() ?? []),
  ];

  function parseScopedProjectKey(key: string) {
    const separatorIndex = key.indexOf(SCOPED_PROJECT_SEPARATOR);
    if (separatorIndex < 0) return { projectId: key, principal: null };
    const projectId = key.slice(separatorIndex + SCOPED_PROJECT_SEPARATOR.length);
    return { projectId, principal: knownScopedPrincipals.get(key) ?? null };
  }

  const getProjectPrincipal = async (projectId?: string) => {
    if (projectId) {
      const principal = principalsForProject(projectId)[0];
      if (principal) return principal;
    }
    return null;
  };

  const baseAdapter =
    options.adapter ??
    selectResourcePublishAdapter(
      options.resolveProjectDir,
      options.resolvePullDir,
      options.describeProject,
      options.resolveResourceId,
    ) ??
    createStubResourcePublishAdapter();

  function rememberTeamShare(
    projectId: string,
    share: ResourceHubPrincipal,
    syncState?: ProjectSyncState,
    restore?: { metadataRefreshPending?: boolean },
  ) {
    knownScopedPrincipals.set(scopedProjectKey(projectId, share), share);
    owners.set(projectId, share.memberId);
    scopedOwners.set(scopedProjectKey(projectId, share), share.memberId);
    let principals = sharePrincipals.get(projectId);
    if (!principals) {
      principals = new Map();
      sharePrincipals.set(projectId, principals);
    }
    principals.set(share.teamId, share);
    if (syncState) {
      syncStates.set(projectId, syncState);
      syncStates.set(scopedProjectKey(projectId, share), syncState);
    }
    // Only replay the small durable dirty set. Re-upserting every shared
    // project on daemon startup would create a catalog thundering herd.
    if (
      restore?.metadataRefreshPending
      && (syncState === 'synced' || syncState === 'sync_failed')
    ) {
      scheduleTeamProjectMetadataRefresh(
        projectId,
        syncState === 'synced' ? 'synced' : 'failed',
        share,
      );
    }
  }

  function refreshProjectAggregate(projectId: string) {
    const principals = principalsForProject(projectId);
    if (principals.length === 0) {
      owners.delete(projectId);
      published.delete(projectId);
      syncStates.set(projectId, 'local_only');
      return;
    }

    owners.set(projectId, principals[0]!.memberId);
    const remainingVersions = principals
      .map((candidate) => published.get(scopedProjectKey(projectId, candidate)))
      .filter((version): version is number => version != null);
    const aggregateVersion = remainingVersions.at(-1);
    if (aggregateVersion == null) published.delete(projectId);
    else published.set(projectId, aggregateVersion);

    const remainingStates = principals.map(
      (candidate) => syncStates.get(scopedProjectKey(projectId, candidate)) ?? 'local_only',
    );
    const aggregateState = remainingStates.includes('pending_upload')
      ? 'pending_upload'
      : remainingStates.includes('sync_failed')
        ? 'sync_failed'
        : remainingStates.includes('synced')
          ? 'synced'
          : 'local_only';
    syncStates.set(projectId, aggregateState);
  }

  /**
   * A local edit landed on a project that is already shared to the team: its
   * published head is about to go stale until the scheduler's debounced
   * publish confirms. Without this, `syncState` only ever left `'synced'` on
   * the FIRST share (`requestTeamShare`) and stayed `'synced'` through every
   * later edit-then-republish cycle, so `/collab/status` had no way to tell
   * the owner's own client "your last edit hasn't reached teammates yet" —
   * the "uploading" tab badge has nothing to key off without this. Only
   * touches projects that already have a share principal; an unshared
   * project's `syncState` stays `'local_only'` regardless of local edits.
   */
  function markLocalChangePending(
    projectId: string,
    principal?: ResourceHubPrincipal | null,
  ) {
    const principals = principal ? [principal] : principalsForProject(projectId);
    if (principals.length === 0) return;
    for (const principal of principals) {
      const key = scopedProjectKey(projectId, principal);
      const state = syncStates.get(key);
      if (state === 'synced' || state === 'sync_failed') {
        syncStates.set(key, 'pending_upload');
      }
    }
    refreshProjectAggregate(projectId);
  }

  async function markTeamProjectRaw(
    projectId: string,
    syncState: TeamProjectCatalogSyncState,
    principal?: ResourceHubPrincipal | null,
    lastSyncedVersionId?: string,
  ) {
    const descriptor = await options.describeProject?.(projectId) ?? null;
    const displayName = typeof descriptor?.name === 'string'
      ? descriptor.name.trim()
      : '';
    const principals = principal ? [principal] : principalsForProject(projectId);
    const fallbackPrincipal = await getProjectPrincipal(projectId);
    const targets = principals.length > 0
      ? principals
      : fallbackPrincipal
        ? [fallbackPrincipal]
        : [];
    for (const target of targets) {
      await options.teamProjectCatalog?.upsert(
        {
          projectId,
          resourceId: await rootFor(projectId, target),
          ...(displayName ? { displayName } : {}),
          syncState,
          ...(lastSyncedVersionId ? { lastSyncedVersionId } : {}),
          ...(descriptor ? { metadata: descriptor } : {}),
        },
        target,
      );
    }
  }

  async function confirmTeamRegistration(projectId: string, principal: ResourceHubPrincipal): Promise<boolean> {
    if (!options.teamProjectCatalog?.getRegistration) return false;
    const registration = await options.teamProjectCatalog.getRegistration(projectId, principal);
    if (!registration || registration.visibility !== 'team') return false;
    if (!registration.resourceId?.trim()) throw new Error('TEAM_PROJECT_ROOT_UNAVAILABLE');
    retainedRoots.set(scopedProjectKey(projectId, principal), registration.resourceId);
    await options.retainRegistration?.({ ...registration, resourceId: registration.resourceId }, principal);
    return true;
  }

  function markTeamProject(projectId: string, syncState: TeamProjectCatalogSyncState, principal?: ResourceHubPrincipal | null, lastSyncedVersionId?: string) {
    return transport.run(projectId, async () => {
      if (transitioning.has(projectId) || !principal || !isShared(projectId, principal)) return;
      if (!await confirmTeamRegistration(projectId, principal)) return;
      await markTeamProjectRaw(projectId, syncState, principal, lastSyncedVersionId);
    });
  }

  function startTeamProjectMetadataRefresh(
    key: string,
    pending: PendingMetadataRefresh,
  ) {
    if (pending.cancelled || pending.inFlight || pendingMetadataRefreshes.get(key) !== pending) {
      return;
    }
    const revision = pending.revision;
    const operation = markTeamProject(
      pending.projectId,
      pending.syncState,
      pending.principal,
    );
    pending.inFlight = operation;
    void operation.then(
      () => {
        if (pending.inFlight === operation) pending.inFlight = null;
        if (pending.cancelled || pendingMetadataRefreshes.get(key) !== pending) return;
        pending.attempt = 0;
        if (pending.revision !== revision) {
          startTeamProjectMetadataRefresh(key, pending);
          return;
        }
        try {
          options.onMetadataRefreshComplete?.({
            projectId: pending.projectId,
            principal: pending.principal,
          });
        } catch (error) {
          options.onMetadataRefreshError?.({
            projectId: pending.projectId,
            error,
            principal: pending.principal,
          });
        }
        pendingMetadataRefreshes.delete(key);
      },
      (error: unknown) => {
        if (pending.inFlight === operation) pending.inFlight = null;
        if (pending.cancelled || pendingMetadataRefreshes.get(key) !== pending) return;
        options.onMetadataRefreshError?.({
          projectId: pending.projectId,
          error,
          principal: pending.principal,
        });
        if (pending.revision !== revision) {
          pending.attempt = 0;
          startTeamProjectMetadataRefresh(key, pending);
          return;
        }
        const delay = Math.min(
          TEAM_PROJECT_METADATA_RETRY_BASE_MS * (2 ** pending.attempt),
          TEAM_PROJECT_METADATA_RETRY_MAX_MS,
        );
        pending.attempt += 1;
        pending.timer = setTimeout(() => {
          pending.timer = null;
          startTeamProjectMetadataRefresh(key, pending);
        }, delay);
      },
    );
  }

  function scheduleTeamProjectMetadataRefresh(
    projectId: string,
    syncState: TeamProjectCatalogSyncState,
    principal: ResourceHubPrincipal,
  ) {
    try {
      options.onMetadataRefreshPending?.({ projectId, principal });
    } catch (error) {
      options.onMetadataRefreshError?.({ projectId, error, principal });
    }
    const key = scopedProjectKey(projectId, principal);
    const existing = pendingMetadataRefreshes.get(key);
    if (existing) {
      existing.syncState = syncState;
      existing.revision += 1;
      existing.attempt = 0;
      if (existing.timer) {
        clearTimeout(existing.timer);
        existing.timer = null;
      }
      startTeamProjectMetadataRefresh(key, existing);
      return;
    }
    const pending: PendingMetadataRefresh = {
      projectId,
      principal,
      syncState,
      revision: 1,
      attempt: 0,
      timer: null,
      inFlight: null,
      cancelled: false,
    };
    pendingMetadataRefreshes.set(key, pending);
    startTeamProjectMetadataRefresh(key, pending);
  }

  async function cancelTeamProjectMetadataRefresh(
    projectId: string,
    principal: ResourceHubPrincipal,
  ) {
    const key = scopedProjectKey(projectId, principal);
    const pending = pendingMetadataRefreshes.get(key);
    if (!pending) return;
    pending.cancelled = true;
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = null;
    pendingMetadataRefreshes.delete(key);
    await pending.inFlight?.catch(() => undefined);
  }

  function markTeamProjectSoon(
    projectId: string,
    syncState: TeamProjectCatalogSyncState,
    principal?: ResourceHubPrincipal | null,
    lastSyncedVersionId?: string,
  ) {
    void markTeamProject(
      projectId,
      syncState,
      principal,
      lastSyncedVersionId,
    ).catch((error) => {
      const principals = principal ? [principal] : principalsForProject(projectId);
      if (principals.length === 0) {
        options.onError?.({ projectId, error, principal: null });
        return;
      }
      for (const scopedPrincipal of principals) {
        options.onError?.({ projectId, error, principal: scopedPrincipal });
      }
    });
  }

  const publishContentRaw: ResourcePublishAdapter['publish'] = (input) => options.coordinatePublication
    ? options.coordinatePublication(input.projectId, input.principal, () => baseAdapter.publish(input))
    : baseAdapter.publish(input);
  const publishContent: ResourcePublishAdapter['publish'] = (input) => transport.run(input.projectId, async () => {
    if (transitioning.has(input.projectId) || !input.principal || !isShared(input.projectId, input.principal)) return null;
    if (!await confirmTeamRegistration(input.projectId, input.principal)) return null;
    return publishContentRaw(input);
  });
  const schedulerAdapter: ResourcePublishAdapter = {
    async publish({ projectId: key, reason }) {
      const { projectId, principal } = parseScopedProjectKey(key);
      // Fresh-install wipe guard, layer 2 (recvqzaDvUU6B3): every scheduler
      // flush re-asks whether this project's local copy is publishable at
      // all. An unmaterialized placeholder answers no, so even a publish
      // notification that raced ahead of the placeholder stamp (or a direct
      // `/collab/publish` nudge) cannot push its empty directory to the hub.
      if (options.canPublishProjectContent && !options.canPublishProjectContent(projectId)) {
        return null;
      }
      if (!principal) {
        const principals = principalsForProject(projectId);
        if (principals.length > 0) {
          const versions = new Map<string, PublishedResourceVersion>();
          for (const scopedPrincipal of principals) {
            const result = await publishContent({
              projectId,
              reason,
              principal: scopedPrincipal,
            });
            if (result) versions.set(scopedPrincipal.teamId, result);
          }
          barePublishResults.set(projectId, versions);
          if (versions.size === 0) return null;
          return [...versions.values()].reduce((highest, candidate) =>
            candidate.version > highest.version ? candidate : highest,
          );
        }
        // No scoped principal on the notification AND no remaining share
        // principals for this project: every share has been removed, which
        // is exactly the condition `requestTeamUnshare` uses to mark the
        // project `unshared`. A file-watcher subscription is only torn down
        // when a project is deleted locally (see collab-publish-watcher.ts
        // `reconcile`), never on unshare, so a debounced `notifyChanged` can
        // still land here well after the unshare completed. Publishing
        // anyway would durably re-create the resource on the hub under an
        // unscoped id for the round-trip it takes `onPublished`'s `unshared`
        // guard to notice and unpublish it again — a real window in which a
        // status read reports the just-unshared project as shared again.
        // Refuse outright instead of publish-then-cleanup.
        if (unshared.has(projectId)) return null;
      }
      return publishContent({
        projectId,
        reason,
        ...(principal ? { principal } : {}),
      });
    },
  };
  if (baseAdapter.syncLatest) {
    schedulerAdapter.syncLatest = ({ projectId: key }) => {
      const { projectId, principal } = parseScopedProjectKey(key);
      return baseAdapter.syncLatest!({
        projectId,
        ...(principal ? { principal } : {}),
      });
    };
  }
  if (baseAdapter.pull) {
    schedulerAdapter.pull = ({ projectId: key }) => {
      const { projectId, principal } = parseScopedProjectKey(key);
      return baseAdapter.pull!({
        projectId,
        ...(principal ? { principal } : {}),
      });
    };
  }
  if (baseAdapter.unpublish) {
    schedulerAdapter.unpublish = ({ projectId: key }) => {
      const { projectId, principal } = parseScopedProjectKey(key);
      return baseAdapter.unpublish!({
        projectId,
        ...(principal ? { principal } : {}),
      });
    };
  }

  async function publishNow(
    projectId: string,
    reason: string,
    principal?: ResourceHubPrincipal | null,
  ): Promise<{ version: number | null; versionId?: string }> {
    const key = principal ? scopedProjectKey(projectId, principal) : projectId;
    try {
      const result = await publishContentRaw({
        projectId,
        reason,
        ...(principal ? { principal } : {}),
      });
      if (!result) return { version: null };
      if (unshared.has(key) || unshared.has(projectId)) {
        published.delete(key);
        syncStates.set(key, 'local_only');
        if (principal) refreshProjectAggregate(projectId);
        else {
          published.delete(projectId);
          syncStates.set(projectId, 'local_only');
        }
        return { version: null };
      }
      published.set(projectId, result.version);
      syncStates.set(projectId, 'synced');
      if (principal) {
        published.set(key, result.version);
        syncStates.set(key, 'synced');
      }
      await markTeamProjectRaw(
        projectId,
        'synced',
        principal,
        result.versionId,
      );
      options.onPublished?.({
        projectId,
        version: result.version,
        ...(result.versionId ? { versionId: result.versionId } : {}),
        reason,
        principal: principal ?? null,
      });
      return {
        version: result.version,
        ...(result.versionId ? { versionId: result.versionId } : {}),
      };
    } catch (error) {
      syncStates.set(projectId, 'sync_failed');
      if (principal) syncStates.set(key, 'sync_failed');
      options.onError?.({ projectId, error, principal: principal ?? null });
      throw error;
    }
  }

  const schedulerOptions: CollabPublishSchedulerOptions = {
    adapter: schedulerAdapter,
    onPublished: (result) => {
      const { projectId, principal } = parseScopedProjectKey(result.projectId);
      const key = principal ? scopedProjectKey(projectId, principal) : projectId;
      if (unshared.has(result.projectId) || unshared.has(key) || unshared.has(projectId)) {
        published.delete(key);
        syncStates.set(key, 'local_only');
        if (principal) refreshProjectAggregate(projectId);
        else {
          published.delete(projectId);
          syncStates.set(projectId, 'local_only');
        }
        return;
      }
      published.set(projectId, result.version);
      syncStates.set(projectId, 'synced');
      if (principal) {
        published.set(key, result.version);
        syncStates.set(key, 'synced');
        markTeamProjectSoon(
          projectId,
          'synced',
          principal,
          result.versionId,
        );
        options.onPublished?.({ ...result, projectId, principal });
        return;
      }
      const versions = barePublishResults.get(projectId);
      if (versions) {
        for (const scopedPrincipal of principalsForProject(projectId)) {
          const publishedResult = versions.get(scopedPrincipal.teamId);
          if (!publishedResult) continue;
          published.set(
            scopedProjectKey(projectId, scopedPrincipal),
            publishedResult.version,
          );
          syncStates.set(scopedProjectKey(projectId, scopedPrincipal), 'synced');
          markTeamProjectSoon(
            projectId,
            'synced',
            scopedPrincipal,
            publishedResult.versionId,
          );
          options.onPublished?.({
            projectId,
            version: publishedResult.version,
            ...(publishedResult.versionId
              ? { versionId: publishedResult.versionId }
              : {}),
            reason: result.reason,
            principal: scopedPrincipal,
          });
        }
        barePublishResults.delete(projectId);
        return;
      }
      markTeamProjectSoon(projectId, 'synced', null);
      options.onPublished?.({ ...result, projectId, principal: null });
    },
    onError: (result) => {
      const { projectId, principal } = parseScopedProjectKey(result.projectId);
      const key = principal ? scopedProjectKey(projectId, principal) : projectId;
      if (unshared.has(result.projectId) || unshared.has(key) || unshared.has(projectId)) {
        syncStates.set(key, 'local_only');
        if (principal) refreshProjectAggregate(projectId);
        else syncStates.set(projectId, 'local_only');
        return;
      }
      syncStates.set(projectId, 'sync_failed');
      const principals = principal ? [principal] : principalsForProject(projectId);
      for (const scopedPrincipal of principals) {
        syncStates.set(scopedProjectKey(projectId, scopedPrincipal), 'sync_failed');
      }
      markTeamProjectSoon(projectId, 'failed', principal);
      if (principals.length > 0) {
        for (const scopedPrincipal of principals) {
          options.onError?.({ ...result, projectId, principal: scopedPrincipal });
        }
      } else {
        options.onError?.({ ...result, projectId, principal: null });
      }
    },
  };

  const scheduler = new CollabPublishScheduler(schedulerOptions);
  // Every external caller of `.scheduler` only ever needs to REPORT a change;
  // route that through `markLocalChangePending` first so `syncState` reflects
  // "uploading" for the window between the edit and the debounced publish
  // confirming it (see the function's doc comment). The real scheduler still
  // owns debouncing/coalescing/flush — this only adds the state update.
  const schedulerFacade: CollabRuntimeScheduler = {
    notifyChanged(projectId, reason, principal) {
      markLocalChangePending(projectId, principal);
      scheduler.notifyChanged(
        principal ? scopedProjectKey(projectId, principal) : projectId,
        reason,
      );
    },
    runBoundary(projectId, principal) {
      markLocalChangePending(projectId, principal);
      scheduler.runBoundary(
        principal ? scopedProjectKey(projectId, principal) : projectId,
      );
    },
  };
  const presenceOptions: CollabPresenceTrackerOptions = {};
  if (options.onPresenceChange) presenceOptions.onChange = options.onPresenceChange;
  const presence = new CollabPresenceTracker(presenceOptions);
  const teamResources = options.teamResources ?? createDevTeamResourceStateProvider();

  return {
    isTeamShareSuppressed: (projectId, scope) => unshared.has(`${scope.teamId}\u0000${projectId}`),
    async forgetTeamShare(projectId, principal) {
      const targets = principal ? [principal] : principalsForProject(projectId);
      return withPolicyChange(projectId, targets, async () => forgetTeamShareState(projectId, targets));
    },
    async syncExistingTeamProject(projectId, principal) {
      return transport.run(projectId, async () => {
        if (!isShared(projectId, principal) || transitioning.has(projectId)
          || !await confirmTeamRegistration(projectId, principal)) {
          throw new Error('PROJECT_VISIBILITY_REQUIRES_MOVE');
        }
        return publishNow(projectId, 'sync', principal);
      });
    },
    presence,
    scheduler: schedulerFacade,
    workspaceContext,
    teamResources,
    publishedVersion: (projectId, principal) => {
      if (principal) return published.get(scopedProjectKey(projectId, principal)) ?? null;
      return published.get(projectId) ?? null;
    },
    async publishedHead(projectId, principal) {
      const head = baseAdapter.syncLatest
        ? await baseAdapter.syncLatest({ projectId, ...(principal ? { principal } : {}) })
        : null;
      if (head?.version != null) return head.version;
      if (principal) return published.get(scopedProjectKey(projectId, principal)) ?? null;
      return published.get(projectId) ?? null;
    },
    projectSyncState: (projectId, principal) => {
      if (principal) {
        return syncStates.get(scopedProjectKey(projectId, principal)) ?? 'local_only';
      }
      const states = principalsForProject(projectId)
        .map((candidate) => syncStates.get(scopedProjectKey(projectId, candidate)))
        .filter((state): state is ProjectSyncState => Boolean(state));
      if (states.includes('pending_upload')) return 'pending_upload';
      if (states.includes('sync_failed')) return 'sync_failed';
      if (states.includes('synced')) return 'synced';
      return syncStates.get(projectId) ?? 'local_only';
    },
    async requestTeamShare(projectId, share) {
      if (!share || typeof share !== 'object') throw new Error('explicit project principal is required');
      const catalog = options.teamProjectCatalog;
      if (!catalog?.ensurePrivate || !catalog.setVisibility) throw new Error('TEAM_PROJECT_POLICY_UNAVAILABLE');
      const principal = { ...share };
      return withPolicyChange(projectId, [principal], async () => {
        const wasShared = isShared(projectId, principal);
        const previousState = syncStates.get(scopedProjectKey(projectId, principal)) ?? 'local_only';
        try {
          const registration = await catalog.ensurePrivate!(projectId, principal);
          if (registration.projectId !== projectId || registration.workspaceId !== principal.teamId
            || registration.ownerMemberId !== principal.memberId || !registration.resourceId.trim()
            || (registration.visibility !== 'private' && registration.visibility !== 'team')) {
            throw new Error('TEAM_PROJECT_REGISTRATION_UNAVAILABLE');
          }
          retainedRoots.set(scopedProjectKey(projectId, principal), registration.resourceId);
          await options.retainRegistration?.(registration, principal);
          unshared.delete(projectId);
          unshared.delete(scopedProjectKey(projectId, principal));
          const result = await publishNow(projectId, 'share', principal);
          if (result.version == null) throw new Error('TEAM_PROJECT_ROOT_UPLOAD_UNAVAILABLE');
          await catalog.setVisibility!(projectId, 'team', principal);
          rememberTeamShare(projectId, principal, 'synced');
          return result;
        } catch (error) {
          if (wasShared) rememberTeamShare(projectId, principal, previousState);
          else {
            syncStates.set(scopedProjectKey(projectId, principal), 'local_only');
            refreshProjectAggregate(projectId);
          }
          throw error;
        }
      });
    },
    async requestTeamUnshare(projectId, principal) {
      if (!principal) throw new Error('explicit project principal is required');
      const setVisibility = options.teamProjectCatalog?.setVisibility;
      if (!setVisibility) throw new Error('TEAM_PROJECT_POLICY_UNAVAILABLE');
      const captured = { ...principal };
      return withPolicyChange(projectId, [captured], async () => {
        await setVisibility(projectId, 'private', captured);
        forgetTeamShareState(projectId, [captured]);
      });
    },
    async requestTeamDelete(projectId, principal) {
      const remove = options.teamProjectCatalog?.remove;
      const unpublish = baseAdapter.unpublish;
      if (!remove || !unpublish) throw new Error('TEAM_PROJECT_DELETE_UNAVAILABLE');
      const captured = { ...principal };
      return withPolicyChange(projectId, [captured], async () => {
        await unpublish({ projectId, principal: captured });
        await remove(projectId, captured);
        forgetTeamShareState(projectId, [captured]);
      });
    },
    projectOwnerMemberId: (projectId, principal) => {
      if (principal) return scopedOwners.get(scopedProjectKey(projectId, principal)) ?? null;
      return owners.get(projectId) ?? null;
    },
    rememberTeamShare,
    refreshTeamProjectMetadata(projectId) {
      // Only projects this daemon actually shares have catalog rows to
      // refresh; principalsForProject is the authority on that. Reuse the
      // per-principal sync state so a pending upload stays pending.
      for (const principal of principalsForProject(projectId)) {
        const state = syncStates.get(scopedProjectKey(projectId, principal));
        if (state !== 'synced' && state !== 'pending_upload' && state !== 'sync_failed') continue;
        scheduleTeamProjectMetadataRefresh(
          projectId,
          state === 'sync_failed' ? 'failed' : state,
          principal,
        );
      }
    },
    async pullLatest(projectId, principal) {
      if (baseAdapter.pull) {
        const materialized = await baseAdapter.pull({
          projectId,
          ...(principal ? { principal } : {}),
        });
        return {
          version: materialized?.version ?? null,
          ...(materialized?.versionId ? { versionId: materialized.versionId } : {}),
          ...(materialized?.resourceId ? { resourceId: materialized.resourceId } : {}),
        };
      }
      const head = baseAdapter.syncLatest
        ? await baseAdapter.syncLatest({ projectId, ...(principal ? { principal } : {}) })
        : { version: principal ? published.get(scopedProjectKey(projectId, principal)) ?? null : published.get(projectId) ?? null };
      return { version: head?.version ?? null };
    },
    dispose() {
      for (const pending of pendingMetadataRefreshes.values()) {
        pending.cancelled = true;
        if (pending.timer) clearTimeout(pending.timer);
      }
      pendingMetadataRefreshes.clear();
      scheduler.dispose();
      presence.dispose();
    },
  };
}

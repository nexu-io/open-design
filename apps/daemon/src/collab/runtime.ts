// Team collaboration daemon subsystem: bundles the author-side publish
// scheduler and the presence tracker behind one factory so the server wires
// them once. The resource hub itself is E's (the resource-hub owner) — this holds only C's
// trigger + presence, talking to the hub through ResourcePublishAdapter.

import {
  CollabPresenceTracker,
  type CollabPresenceTrackerOptions,
  type PresenceMember,
} from './presence-tracker.js';
import {
  CollabPublishScheduler,
  type CollabPublishSchedulerOptions,
  type ResourcePublishAdapter,
} from './publish-scheduler.js';
import { createStubResourcePublishAdapter } from './stub-resource-adapter.js';
import {
  contextToResourceHubPrincipal,
  createResourceHubPublishAdapterFromEnv,
} from './resource-hub-publish-adapter.js';
import {
  projectResourceIdFor,
  type VelaTeamProjectCatalogClient,
} from '../integrations/vela-team-projects.js';
import {
  contextHasTeamIdentity,
  createVelaCliResourceAdapter,
  shouldUseVelaCliResourceTransport,
} from './vela-cli-resource-adapter.js';
import type { WorkspaceContextProvider } from './workspace-context.js';
import { createWorkspaceContextProviderFromEnv } from './vela-workspace-context.js';
import {
  createDevTeamResourceStateProvider,
  type TeamResourceStateProvider,
} from './team-resource-state.js';
import type { ProjectSyncState } from '@open-design/contracts';

export interface CollabRuntime {
  presence: CollabPresenceTracker;
  scheduler: CollabPublishScheduler;
  /** Workspace-context provider — the B-integration seam (identity/visibility). */
  workspaceContext: WorkspaceContextProvider;
  /** Team-resource state provider — the E-resource-hub seam (share/freeze state). */
  teamResources: TeamResourceStateProvider;
  /** Last published version for a project (members poll this to know what to pull). */
  publishedVersion(projectId: string): number | null;
  /**  sync state for a project (`local_only` until a share is requested). */
  projectSyncState(projectId: string): ProjectSyncState;
  /**
   * visibility-to-sync sync-intent seam: mark a project as awaiting upload and flush a publish.
   * D calls this (through the route) when a project flips to team-visible; C
   * orchestrates the publish, which drives the resource hub mechanism behind it.
   * `ownerMemberId` is the sharer's member id — recorded so a member viewing the
   * project can tell whether it is their own (writer) or someone else's (read-only).
   */
  requestTeamShare(projectId: string, ownerMemberId?: string): void;
  /** The member who shared this project, or null if not shared here. */
  projectOwnerMemberId(projectId: string): string | null;
  /**
   * Member pull trigger (the sync trigger owns *when* to pull). Reads the published head via
   * the adapter (E's `syncLatest`); E's client also fetches + extracts the
   * bytes locally. Returns the head version, or null if nothing is published.
   */
  pullLatest(projectId: string): Promise<{ version: number | null }>;
  dispose(): void;
}

export interface CreateCollabRuntimeOptions {
  /**
   * Resource-hub adapter. Precedence: an explicit adapter → the real hub adapter
   * built from env (when `resolveProjectDir` is given and OD_RESOURCE_HUB_URL +
   * workspace member env are set) → the local stub.
   */
  adapter?: ResourcePublishAdapter;
  /** Managed-project directory resolver, so the real hub adapter can pack/land. */
  resolveProjectDir?: (projectId: string) => string;
  /** Workspace-context provider. Defaults to a dev provider until wired to an identity source. */
  workspaceContext?: WorkspaceContextProvider;
  /** Team-resource state provider. Defaults to a dev provider until wired to the hub. */
  teamResources?: TeamResourceStateProvider;
  /**
   * Vela-owned team-project catalog. The resource hub stores bytes/versions; the
   * catalog is the member-discovery index for projects shared from another
   * daemon. Missing config degrades through the client as a no-op.
   */
  teamProjectCatalog?: VelaTeamProjectCatalogClient;
  /** Fired after a project is published so the caller can notify online members. */
  onPublished?: (result: { projectId: string; version: number; reason: string }) => void;
  /** Fired when a project's presence set changes (join/leave). */
  onPresenceChange?: (result: { projectId: string; present: PresenceMember[] }) => void;
  onError?: (result: { projectId: string; error: unknown }) => void;
}

/**
 * Pick the resource transport for this run. The `vela resource` CLI transport
 * (OD_RESOURCE_TRANSPORT=vela-cli) reuses the vela login session and keeps the
 * content-addressing in the CLI; otherwise the in-process hub SDK adapter runs.
 * Both gate on the same workspace context, so one identity drives either path.
 * Returns null when there is no project-dir resolver (caller falls back to the
 * local stub).
 */
function selectResourcePublishAdapter(
  resolveProjectDir: ((projectId: string) => string | Promise<string>) | undefined,
  workspaceContext: WorkspaceContextProvider,
): ResourcePublishAdapter | null {
  if (!resolveProjectDir) return null;
  if (shouldUseVelaCliResourceTransport()) {
    return createVelaCliResourceAdapter({
      resolveProjectDir,
      hasTeamIdentity: async () => contextHasTeamIdentity(await workspaceContext.current({})),
    });
  }
  return createResourceHubPublishAdapterFromEnv(resolveProjectDir, async () =>
    contextToResourceHubPrincipal(await workspaceContext.current({})),
  );
}

export function createCollabRuntime(options: CreateCollabRuntimeOptions = {}): CollabRuntime {
  const workspaceContext = options.workspaceContext ?? createWorkspaceContextProviderFromEnv();
  // Single identity source: whichever transport runs, the team-identity gate
  // derives from the same workspace context the web collab surface reads, so one
  // signed-in identity drives both. Transport precedence: an explicit adapter →
  // the `vela resource` CLI transport when opted in (OD_RESOURCE_TRANSPORT=vela-cli)
  // → the in-process hub SDK adapter → the local stub.
  const adapter =
    options.adapter ??
    selectResourcePublishAdapter(options.resolveProjectDir, workspaceContext) ??
    createStubResourcePublishAdapter();
  const published = new Map<string, number>();
  const syncStates = new Map<string, ProjectSyncState>();
  // projectId → the member who shared it (the single writer). Members compare
  // this to their own id to know whether they view the project read-only.
  const owners = new Map<string, string>();
  async function markTeamProject(
    projectId: string,
    syncState: 'pending_upload' | 'synced' | 'failed',
  ) {
    const principal = contextToResourceHubPrincipal(await workspaceContext.current({}));
    if (!principal) return;
    await options.teamProjectCatalog?.upsert(
      {
        projectId,
        resourceId: projectResourceIdFor(projectId),
        syncState,
      },
      principal,
    );
  }
  function markTeamProjectSoon(
    projectId: string,
    syncState: 'pending_upload' | 'synced' | 'failed',
  ) {
    void markTeamProject(projectId, syncState).catch((error) => {
      options.onError?.({ projectId, error });
    });
  }
  // Always track the published head + sync state so members can poll them; also
  // forward to any caller-supplied callback. (exactOptionalPropertyTypes forbids
  // assigning an explicit `undefined` to an optional property, hence we always
  // wrap onError rather than passing options.onError through conditionally.)
  const schedulerOptions: CollabPublishSchedulerOptions = {
    adapter,
    onPublished: (result) => {
      published.set(result.projectId, result.version);
      syncStates.set(result.projectId, 'synced');
      markTeamProjectSoon(result.projectId, 'synced');
      options.onPublished?.(result);
    },
    onError: (result) => {
      // A failed publish leaves the prior head standing; surface it as a
      // recoverable sync state rather than wedging the project.
      syncStates.set(result.projectId, 'sync_failed');
      markTeamProjectSoon(result.projectId, 'failed');
      options.onError?.(result);
    },
  };
  const scheduler = new CollabPublishScheduler(schedulerOptions);
  const presenceOptions: CollabPresenceTrackerOptions = {};
  if (options.onPresenceChange) presenceOptions.onChange = options.onPresenceChange;
  const presence = new CollabPresenceTracker(presenceOptions);
  const teamResources = options.teamResources ?? createDevTeamResourceStateProvider();
  return {
    presence,
    scheduler,
    workspaceContext,
    teamResources,
    publishedVersion: (projectId) => published.get(projectId) ?? null,
    projectSyncState: (projectId) => syncStates.get(projectId) ?? 'local_only',
    projectOwnerMemberId: (projectId) => owners.get(projectId) ?? null,
    requestTeamShare(projectId, ownerMemberId) {
      // Record the sharer as the project's single writer so members can tell
      // apart their own project from one shared to them.
      if (ownerMemberId) owners.set(projectId, ownerMemberId);
      // Pending until the publish confirms (onPublished → 'synced' / onError →
      // 'sync_failed'). Flushing at a run boundary publishes the stable state.
      syncStates.set(projectId, 'pending_upload');
      markTeamProjectSoon(projectId, 'pending_upload');
      scheduler.notifyChanged(projectId, 'share');
      scheduler.runBoundary(projectId);
    },
    async pullLatest(projectId) {
      // The real hub adapter materializes the published tree locally; the stub
      // has no bytes. Either way, report the head version.
      if (adapter.pull) await adapter.pull({ projectId });
      const head = adapter.syncLatest
        ? await adapter.syncLatest({ projectId })
        : { version: published.get(projectId) ?? null };
      return { version: head?.version ?? null };
    },
    dispose() {
      scheduler.dispose();
      presence.dispose();
    },
  };
}

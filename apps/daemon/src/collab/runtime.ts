// Team collaboration daemon subsystem: bundles the author-side publish
// scheduler and the presence tracker behind one factory so the server wires
// them once. The resource hub itself is E's (the resource-hub owner) — this
// holds only C's trigger + presence, talking to the hub through
// ResourcePublishAdapter.

import type { ProjectSyncState } from '@open-design/contracts';
import type { ResourceHubPrincipal } from '../integrations/resource-hub.js';
import { projectResourceIdFor } from '../integrations/vela-team-projects.js';
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
import {
  contextToResourceHubPrincipal,
  createResourceHubPublishAdapterFromEnv,
} from './resource-hub-publish-adapter.js';
import { createStubResourcePublishAdapter } from './stub-resource-adapter.js';
import {
  createDevTeamResourceStateProvider,
  type TeamResourceStateProvider,
} from './team-resource-state.js';
import {
  contextHasTeamIdentity,
  createVelaCliResourceAdapter,
  shouldUseVelaCliResourceTransport,
} from './vela-cli-resource-adapter.js';
import type { WorkspaceContextProvider } from './workspace-context.js';
import { createWorkspaceContextProviderFromEnv } from './vela-workspace-context.js';

type TeamProjectCatalogSyncState = 'pending_upload' | 'synced' | 'failed';

interface TeamProjectCatalogSink {
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

export interface CollabRuntime {
  presence: CollabPresenceTracker;
  scheduler: CollabPublishScheduler;
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
   * visibility-to-sync sync-intent seam: mark a project as awaiting upload and
   * publish it durably before reporting success.
   */
  requestTeamShare(
    projectId: string,
    share?: string | ResourceHubPrincipal,
  ): Promise<{ version: number | null }>;
  /** Move a project out of the team space. */
  requestTeamUnshare(projectId: string, principal?: ResourceHubPrincipal | null): Promise<void>;
  /** Restore a persisted team share into runtime bookkeeping without publishing. */
  rememberTeamShare(projectId: string, share: ResourceHubPrincipal, syncState?: ProjectSyncState): void;
  /** The member who shared this project, or null if not shared here. */
  projectOwnerMemberId(projectId: string, principal?: ResourceHubPrincipal | null): string | null;
  /** Materialize the published tree into the local member copy. */
  pullLatest(projectId: string, principal?: ResourceHubPrincipal | null): Promise<{ version: number | null }>;
  dispose(): void;
}

export interface CreateCollabRuntimeOptions {
  adapter?: ResourcePublishAdapter;
  /** Managed-project directory resolver, so the real hub adapter can pack/land. */
  resolveProjectDir?: (projectId: string) => string;
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
    reason: string;
    principal: ResourceHubPrincipal | null;
  }) => void;
  /** Fired when a project's presence set changes (join/leave). */
  onPresenceChange?: (result: { projectId: string; present: PresenceMember[] }) => void;
  onError?: (result: { projectId: string; error: unknown; principal: ResourceHubPrincipal | null }) => void;
}

function selectResourcePublishAdapter(
  resolveProjectDir: ((projectId: string) => string | Promise<string>) | undefined,
  workspaceContext: WorkspaceContextProvider,
  getProjectPrincipal: (projectId?: string) => ResourceHubPrincipal | null | Promise<ResourceHubPrincipal | null>,
  describeProject: ((projectId: string) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>) | undefined,
): ResourcePublishAdapter | null {
  if (!resolveProjectDir) return null;
  if (shouldUseVelaCliResourceTransport()) {
    return createVelaCliResourceAdapter({
      resolveProjectDir,
      ...(describeProject ? { describeProject } : {}),
      hasTeamIdentity: async () => contextHasTeamIdentity(await workspaceContext.current({})),
    });
  }
  return createResourceHubPublishAdapterFromEnv(resolveProjectDir, getProjectPrincipal, describeProject);
}

export function createCollabRuntime(options: CreateCollabRuntimeOptions = {}): CollabRuntime {
  const workspaceContext = options.workspaceContext ?? createWorkspaceContextProviderFromEnv();
  const sharePrincipals = new Map<string, Map<string, ResourceHubPrincipal>>();
  const scopedOwners = new Map<string, string>();
  const published = new Map<string, number>();
  const syncStates = new Map<string, ProjectSyncState>();
  const owners = new Map<string, string>();
  const unshared = new Set<string>();
  const barePublishResults = new Map<string, Map<string, number>>();
  const SCOPED_PROJECT_SEPARATOR = '\u0000';

  const scopedProjectKey = (projectId: string, principal: ResourceHubPrincipal) =>
    `${principal.teamId}${SCOPED_PROJECT_SEPARATOR}${projectId}`;

  const principalsForProject = (projectId: string) => [
    ...(sharePrincipals.get(projectId)?.values() ?? []),
  ];

  function parseScopedProjectKey(key: string) {
    const separatorIndex = key.indexOf(SCOPED_PROJECT_SEPARATOR);
    if (separatorIndex < 0) return { projectId: key, principal: null };
    const teamId = key.slice(0, separatorIndex);
    const projectId = key.slice(separatorIndex + SCOPED_PROJECT_SEPARATOR.length);
    return { projectId, principal: sharePrincipals.get(projectId)?.get(teamId) ?? null };
  }

  const getProjectPrincipal = async (projectId?: string) => {
    if (projectId) {
      const principal = principalsForProject(projectId)[0];
      if (principal) return principal;
    }
    return contextToResourceHubPrincipal(await workspaceContext.current({}));
  };

  const baseAdapter =
    options.adapter ??
    selectResourcePublishAdapter(
      options.resolveProjectDir,
      workspaceContext,
      getProjectPrincipal,
      options.describeProject,
    ) ??
    createStubResourcePublishAdapter();

  function rememberTeamShare(
    projectId: string,
    share: ResourceHubPrincipal,
    syncState: ProjectSyncState = 'pending_upload',
  ) {
    owners.set(projectId, share.memberId);
    scopedOwners.set(scopedProjectKey(projectId, share), share.memberId);
    let principals = sharePrincipals.get(projectId);
    if (!principals) {
      principals = new Map();
      sharePrincipals.set(projectId, principals);
    }
    principals.set(share.teamId, share);
    syncStates.set(projectId, syncState);
    syncStates.set(scopedProjectKey(projectId, share), syncState);
  }

  async function markTeamProject(
    projectId: string,
    syncState: TeamProjectCatalogSyncState,
    principal?: ResourceHubPrincipal | null,
  ) {
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
          resourceId: projectResourceIdFor(projectId, target),
          syncState,
        },
        target,
      );
    }
  }

  function markTeamProjectSoon(
    projectId: string,
    syncState: TeamProjectCatalogSyncState,
    principal?: ResourceHubPrincipal | null,
  ) {
    void markTeamProject(projectId, syncState, principal).catch((error) => {
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

  const schedulerAdapter: ResourcePublishAdapter = {
    async publish({ projectId: key, reason }) {
      const { projectId, principal } = parseScopedProjectKey(key);
      if (!principal) {
        const principals = principalsForProject(projectId);
        if (principals.length > 0) {
          const versions = new Map<string, number>();
          for (const scopedPrincipal of principals) {
            const result = await baseAdapter.publish({
              projectId,
              reason,
              principal: scopedPrincipal,
            });
            if (result) versions.set(scopedPrincipal.teamId, result.version);
          }
          barePublishResults.set(projectId, versions);
          return versions.size > 0 ? { version: Math.max(...versions.values()) } : null;
        }
      }
      return baseAdapter.publish({
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
  ): Promise<{ version: number | null }> {
    const key = principal ? scopedProjectKey(projectId, principal) : projectId;
    try {
      const result = await baseAdapter.publish({
        projectId,
        reason,
        ...(principal ? { principal } : {}),
      });
      if (!result) return { version: null };
      if (unshared.has(key) || unshared.has(projectId)) {
        await baseAdapter.unpublish?.({
          projectId,
          ...(principal ? { principal } : {}),
        });
        published.delete(projectId);
        published.delete(key);
        syncStates.set(projectId, 'local_only');
        syncStates.set(key, 'local_only');
        return { version: null };
      }
      published.set(projectId, result.version);
      syncStates.set(projectId, 'synced');
      if (principal) {
        published.set(key, result.version);
        syncStates.set(key, 'synced');
      }
      markTeamProjectSoon(projectId, 'synced', principal);
      options.onPublished?.({ projectId, version: result.version, reason, principal: principal ?? null });
      return { version: result.version };
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
      if (unshared.has(key) || unshared.has(projectId)) {
        void schedulerAdapter.unpublish?.({ projectId: result.projectId }).catch((error: unknown) => {
          options.onError?.({ projectId, error, principal });
        });
        published.delete(projectId);
        published.delete(key);
        syncStates.set(projectId, 'local_only');
        syncStates.set(key, 'local_only');
        return;
      }
      published.set(projectId, result.version);
      syncStates.set(projectId, 'synced');
      if (principal) {
        published.set(key, result.version);
        syncStates.set(key, 'synced');
        markTeamProjectSoon(projectId, 'synced', principal);
        options.onPublished?.({ ...result, projectId, principal });
        return;
      }
      const versions = barePublishResults.get(projectId);
      if (versions) {
        for (const scopedPrincipal of principalsForProject(projectId)) {
          const version = versions.get(scopedPrincipal.teamId);
          if (version === undefined) continue;
          published.set(scopedProjectKey(projectId, scopedPrincipal), version);
          syncStates.set(scopedProjectKey(projectId, scopedPrincipal), 'synced');
          markTeamProjectSoon(projectId, 'synced', scopedPrincipal);
          options.onPublished?.({ projectId, version, reason: result.reason, principal: scopedPrincipal });
        }
        barePublishResults.delete(projectId);
        return;
      }
      markTeamProjectSoon(projectId, 'synced', null);
      options.onPublished?.({ ...result, projectId, principal: null });
    },
    onError: (result) => {
      const { projectId, principal } = parseScopedProjectKey(result.projectId);
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
  const presenceOptions: CollabPresenceTrackerOptions = {};
  if (options.onPresenceChange) presenceOptions.onChange = options.onPresenceChange;
  const presence = new CollabPresenceTracker(presenceOptions);
  const teamResources = options.teamResources ?? createDevTeamResourceStateProvider();

  return {
    presence,
    scheduler,
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
        return syncStates.get(scopedProjectKey(projectId, principal)) ?? syncStates.get(projectId) ?? 'local_only';
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
      const principal = typeof share === 'object' && share
        ? share
        : await getProjectPrincipal(projectId);
      if (typeof share === 'string') owners.set(projectId, share);
      if (principal) rememberTeamShare(projectId, principal, 'pending_upload');
      else syncStates.set(projectId, 'pending_upload');
      const key = principal ? scopedProjectKey(projectId, principal) : projectId;
      unshared.delete(projectId);
      unshared.delete(key);
      return publishNow(projectId, 'share', principal);
    },
    async requestTeamUnshare(projectId, principal) {
      const targets = principal
        ? [principal]
        : principalsForProject(projectId).length > 0
          ? principalsForProject(projectId)
          : [await getProjectPrincipal(projectId)].filter((candidate): candidate is ResourceHubPrincipal => Boolean(candidate));
      if (targets.length === 0) {
        unshared.add(projectId);
        await baseAdapter.unpublish?.({ projectId });
      }
      for (const target of targets) {
        const key = scopedProjectKey(projectId, target);
        unshared.add(key);
        await baseAdapter.unpublish?.({ projectId, principal: target });
        await options.teamProjectCatalog?.remove?.(projectId, target);
        published.delete(key);
        syncStates.set(key, 'local_only');
        scopedOwners.delete(key);
      }
      owners.delete(projectId);
      published.delete(projectId);
      syncStates.set(projectId, 'local_only');
      sharePrincipals.delete(projectId);
    },
    projectOwnerMemberId: (projectId, principal) => {
      if (principal) return scopedOwners.get(scopedProjectKey(projectId, principal)) ?? owners.get(projectId) ?? null;
      return owners.get(projectId) ?? null;
    },
    rememberTeamShare,
    async pullLatest(projectId, principal) {
      if (baseAdapter.pull) await baseAdapter.pull({ projectId, ...(principal ? { principal } : {}) });
      const head = baseAdapter.syncLatest
        ? await baseAdapter.syncLatest({ projectId, ...(principal ? { principal } : {}) })
        : { version: principal ? published.get(scopedProjectKey(projectId, principal)) ?? null : published.get(projectId) ?? null };
      return { version: head?.version ?? null };
    },
    dispose() {
      scheduler.dispose();
      presence.dispose();
    },
  };
}

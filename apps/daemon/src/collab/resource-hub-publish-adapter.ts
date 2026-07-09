import type { WorkspaceCollabContext } from '@open-design/contracts';
import {
  createResourceHubClient,
  readResourceHubConfig,
  readResourceHubPrincipal,
  ResourceHubError,
  type ResourceHubClient,
  type ResourceHubPrincipal,
} from '../integrations/resource-hub.js';
import { projectResourceIdFor } from '../integrations/vela-team-projects.js';
import { materializeRef, packTree, pushTree } from '../resource-drive.js';
import type { ResourcePublishAdapter } from './publish-scheduler.js';

// Binds the sync trigger to the resource hub. The scheduler decides *when* to
// publish/pull; this wraps the neutral resource-drive SDK (packTree + pushTree +
// materializeRef) as the ResourcePublishAdapter. The principal is resolved
// lazily per call (getPrincipal), so it tracks the current signed-in identity
// and no-ops (degrades) when there is no team identity — that is the single
// identity gate shared with the web collab surface.

/** Derive the hub principal from the one workspace context. Null off-team. */
export function contextToResourceHubPrincipal(
  context: WorkspaceCollabContext | null,
): ResourceHubPrincipal | null {
  if (!context || context.workspaceType !== 'team' || !context.teamId) return null;
  return {
    memberId: context.workspaceMemberId,
    teamId: context.teamId,
    role: context.role,
    lifecycleState: context.lifecycleState,
  };
}

export interface ResourceHubPublishAdapterOptions {
  client: ResourceHubClient;
  /** Resolve the current principal (null = no team identity → degrade to no-op). */
  getPrincipal: () => ResourceHubPrincipal | null | Promise<ResourceHubPrincipal | null>;
  /** The project's source directory to publish (managed-project root). */
  resolveProjectDir: (projectId: string) => string | Promise<string>;
  /** Where a member materializes pulled content. Defaults to the project dir. */
  resolvePullDir?: (projectId: string) => string | Promise<string>;
  /** projectId → hub resourceId. Colon-free (the hub routes it as a path param). */
  resourceIdFor?: (projectId: string) => string;
  /**
   * Hub resource kind. Defaults to `project`; a design-system or plugin share
   * passes its own kind so the same publish/pull machinery serves every
   * shareable resource type without a parallel adapter.
   */
  kind?: string;
}

const PUBLISHED_REF = 'published';
const PROJECT_KIND = 'project';

export function createResourceHubPublishAdapter(
  options: ResourceHubPublishAdapterOptions,
): ResourcePublishAdapter {
  const { client, getPrincipal, resolveProjectDir } = options;
  const resolvePullDir = options.resolvePullDir ?? resolveProjectDir;
  const resourceIdFor = options.resourceIdFor ?? projectResourceIdFor;
  const kind = options.kind ?? PROJECT_KIND;

  // The resource must exist before a version is published. Get-or-create keeps
  // publish idempotent across the first and later shares of a project.
  async function ensureResourceId(principal: ResourceHubPrincipal, projectId: string): Promise<string> {
    const resourceId = resourceIdFor(projectId);
    try {
      const existing = await client.getResource(principal, resourceId);
      return existing.id;
    } catch (error) {
      if (!(error instanceof ResourceHubError) || error.status !== 404) throw error;
      const created = await client.createResource(principal, { kind, resourceId });
      return created.id;
    }
  }

  return {
    async publish({ projectId }) {
      const principal = await getPrincipal();
      if (!principal) return null; // no team identity → nothing to publish
      const packed = await packTree(await resolveProjectDir(projectId));
      const resourceId = await ensureResourceId(principal, projectId);
      // pushTree uploads only missing blobs, publishes a version, and moves the
      // `published` ref atomically (content-first, pointer-last).
      const version = await pushTree(client, principal, resourceId, packed, { ref: PUBLISHED_REF });
      return { version: version.version };
    },

    async syncLatest({ projectId }) {
      const principal = await getPrincipal();
      if (!principal) return null;
      const resourceId = resourceIdFor(projectId);
      let ref;
      try {
        ref = await client.getRef(principal, resourceId, PUBLISHED_REF);
      } catch {
        return null; // nothing published yet
      }
      const versions = await client.listVersions(principal, resourceId);
      const version = versions.find((candidate) => candidate.id === ref.versionId);
      return version ? { version: version.version } : null;
    },

    // Member pull: fetch + safely land the published tree into the local copy.
    async pull({ projectId }) {
      const principal = await getPrincipal();
      if (!principal) return; // no team identity → nothing to pull
      await materializeRef(client, principal, resourceIdFor(projectId), PUBLISHED_REF, await resolvePullDir(projectId));
    },
  };
}

/**
 * Build the real hub adapter, resolving the principal from a single identity
 * source, or null when the hub is not configured (so the runtime falls back to
 * the local stub). `getPrincipal` should read the current workspace context so
 * the web gate and the hub principal derive from the same source; if omitted, it
 * falls back to the provisional env principal.
 */
export function createResourceHubPublishAdapterFromEnv(
  resolveProjectDir: (projectId: string) => string | Promise<string>,
  getPrincipal?: () => ResourceHubPrincipal | null | Promise<ResourceHubPrincipal | null>,
  env: NodeJS.ProcessEnv = process.env,
): ResourcePublishAdapter | null {
  if (!env.OD_RESOURCE_HUB_URL?.trim()) return null;
  const client = createResourceHubClient({ config: readResourceHubConfig(env) });
  return createResourceHubPublishAdapter({
    client,
    resolveProjectDir,
    getPrincipal: getPrincipal ?? (() => readResourceHubPrincipal(env)),
  });
}

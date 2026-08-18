// Team resource sharing. A member with publish rights promotes a personal
// resource — a design system, plugin, or skill — into the team scope: the
// resource's directory is packed and pushed by the login-backed Vela CLI under
// its kind, so teammates can pull it into their own workspace. Open Design owns
// the permission gate and scheduling, not backend credentials or byte transfer.

import type {
  WorkspaceCollabContext,
  WorkspaceDirectoryItem,
} from '@open-design/contracts';
import {
  contextToResourceHubPrincipal,
  type ResourceHubPrincipal,
} from './resource-principal.js';
import {
  createVelaCliResourceAdapter,
  shouldUseVelaCliResourceTransport,
} from './vela-cli-resource-adapter.js';
import type { ResourcePublishAdapter } from './publish-scheduler.js';
import { workspaceContextFromDirectoryItem } from './vela-workspace-context.js';

/** Thrown when a team member without share rights attempts to share a resource. */
export class TeamResourceShareForbiddenError extends Error {
  constructor() {
    super('workspace_resource_share_denied');
    this.name = 'TeamResourceShareForbiddenError';
  }
}

/**
 * Thrown when an operation requires a live Team hub read but the authority
 * cannot be reached. Callers must distinguish this from an authoritative
 * empty list: retrying is safe, while proceeding from a cached fallback is
 * not.
 */
export class TeamResourceAuthorityUnavailableError extends Error {
  readonly status = 503;
  readonly code = 'WORKSPACE_RESOURCE_AUTHORITY_UNAVAILABLE';
  readonly retryable = true;

  constructor(cause?: unknown) {
    super('team resource authority is temporarily unavailable', { cause });
    this.name = 'TeamResourceAuthorityUnavailableError';
  }
}

export interface TeamResourceShareRecord {
  id: string;
  hubResourceId?: string;
  title?: string;
  description?: string;
  ownerMemberId?: string;
  canUnshare?: boolean;
  versionId?: string;
  version?: number;
}

/**
 * Request-verified authority for one Team resource operation.
 *
 * The route resolves this from the request's explicit Workspace headers and
 * the authoritative membership directory. Services must never reconstruct it
 * from the daemon's mutable active Workspace.
 */
export interface TeamResourceRequestScope {
  principal: ResourceHubPrincipal;
  canShare: boolean;
}

export function teamResourceRequestScopeFromContext(
  context: WorkspaceCollabContext,
): TeamResourceRequestScope | null {
  const principal = contextToResourceHubPrincipal(context);
  if (!principal || context.memberStatus !== 'active') return null;
  return {
    principal,
    canShare: Boolean(
      context.permissions.canManageSharedResources ||
      context.permissions.canShareProjects,
    ),
  };
}

export function teamResourceRequestScopeForWorkspaceId(
  items: WorkspaceDirectoryItem[],
  workspaceId: string,
): TeamResourceRequestScope | null {
  const requestedWorkspaceId = workspaceId.trim();
  if (!requestedWorkspaceId) return null;
  const membership = items.find(
    (item) =>
      item.workspaceId === requestedWorkspaceId &&
      item.workspaceType === 'team' &&
      item.memberStatus === 'active' &&
      item.lifecycleState !== 'deleted',
  );
  return membership
    ? teamResourceRequestScopeFromContext(
        workspaceContextFromDirectoryItem(membership),
      )
    : null;
}

export interface TeamResourceShareService {
  /** Share a resource to the team. Returns the published version, or null off-team. */
  share(resourceId: string, scope: TeamResourceRequestScope): Promise<{ version: number } | null>;
  /** Remove a resource from the team index. Returns false off-team/unconfigured. */
  unshare(resourceId: string, scope: TeamResourceRequestScope): Promise<boolean>;
  /** Ids of resources shared to the team. */
  sharedIds(scope: TeamResourceRequestScope): Promise<string[]>;
  /** Resources shared to the team, including best-effort display metadata. */
  sharedResources(
    scope: TeamResourceRequestScope,
    options?: TeamResourceSharedReadOptions,
  ): Promise<TeamResourceShareRecord[]>;
  /** True once a resource has been shared to the team. */
  isShared(resourceId: string, scope: TeamResourceRequestScope): boolean;
  /** Whether the login-backed Vela transport is wired. */
  readonly configured: boolean;
}

export interface TeamResourceSharedReadOptions {
  /**
   * Require a live hub response. Reconciliation must use this mode so a
   * transport failure can never be confused with an authoritative empty list.
   */
  authoritative?: boolean;
}

export interface CreateTeamResourceShareOptions {
  /** Resource hub kind, e.g. `design_system` | `plugin` | `skill`. */
  kind: string;
  /** Colon-free id-namespace prefix distinguishing this kind on the shared hub. */
  idPrefix: string;
  /** Resolve a resource's source directory (what gets packed and pushed). May be
   *  async: the skill resolver awaits the skill index, and the publish adapter
   *  awaits this before packing. */
  resolveDir: (resourceId: string) => string | Promise<string>;
  /** Optional resource-index metadata shown in teammate team lists. */
  describeResource?: (resourceId: string) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>;
  /** Injectable Vela resource runner for tests. */
  run?: (
    args: string[],
    workspaceId?: string,
    readOptions?: TeamResourceSharedReadOptions,
  ) => Promise<string>;
  env?: NodeJS.ProcessEnv;
}

export function createTeamResourceShareService(
  options: CreateTeamResourceShareOptions,
): TeamResourceShareService {
  const env = options.env ?? process.env;
  if (!shouldUseVelaCliResourceTransport(env)) {
    return {
      share: async () => null,
      unshare: async () => false,
      sharedIds: async () => [],
      sharedResources: async (_scope, readOptions) => {
        if (readOptions?.authoritative) {
          throw new Error('authoritative Team resource listing is unavailable');
        }
        return [];
      },
      isShared: () => false,
      configured: false,
    };
  }
  // Distinct, colon-free id namespace on the shared hub. The caller's id (e.g.
  // `user:palette-x`) is sanitized to path-safe chars — the hub routes the
  // resource id as a path param, so a colon would 404.
  const sanitizeResourceIdSegment = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '-');
  const scopedIdPrefixFor = (principal?: ResourceHubPrincipal | null) =>
    principal?.teamId
      ? `${options.idPrefix}-${sanitizeResourceIdSegment(principal.teamId)}`
      : options.idPrefix;
  const resourceIdFor = (id: string, principal?: ResourceHubPrincipal | null) =>
    `${scopedIdPrefixFor(principal)}-${sanitizeResourceIdSegment(id)}`;
  // Ids shared this session. The published resources are the durable record on
  // the hub; this is the fast local view the team collection reads until a hub
  // listing query lands.
  const sharedByWorkspace = new Map<string, Set<string>>();
  const sharedFor = (workspaceId: string): Set<string> => {
    let shared = sharedByWorkspace.get(workspaceId);
    if (!shared) {
      shared = new Set<string>();
      sharedByWorkspace.set(workspaceId, shared);
    }
    return shared;
  };

  const adapter: ResourcePublishAdapter = createVelaCliResourceAdapter({
    resolveProjectDir: options.resolveDir,
    resourceIdFor,
    kind: options.kind,
    // Every operation below already requires a request-verified Team scope.
    // Re-reading the daemon's ambient Workspace here would reintroduce the
    // cross-tab switch race this service boundary exists to prevent.
    hasTeamIdentity: () => true,
    ...(options.describeResource ? { describeProject: options.describeResource } : {}),
    ...(options.run ? { run: options.run } : {}),
  });

  return {
    async share(resourceId, scope) {
      // Permission gate: only a member who can manage shared resources may
      // promote one to the team. The route supplied this bit from the
      // authoritative directory, never from caller-controlled headers.
      if (!scope.canShare) throw new TeamResourceShareForbiddenError();
      const { principal } = scope;
      const result = await adapter.publish({
        projectId: resourceId,
        principal,
        reason: 'share',
      });
      if (result) sharedFor(principal.teamId).add(resourceId);
      return result;
    },
    async unshare(resourceId, scope) {
      const { principal } = scope;
      const sharedResource = (await this.sharedResources(scope)).find((resource) => resource.id === resourceId);
      if (sharedResource && !sharedResource.canUnshare) {
        throw new TeamResourceShareForbiddenError();
      }
      await adapter.unpublish?.({ projectId: resourceId, principal });
      sharedFor(principal.teamId).delete(resourceId);
      return true;
    },
    async sharedIds(scope) {
      return (await this.sharedResources(scope)).map((resource) => resource.id);
    },
    async sharedResources(scope, readOptions) {
      const { principal } = scope;
      const shared = sharedFor(principal.teamId);
      try {
        const out = await (options.run ?? defaultRun)(
          ['shared', '--json'],
          principal.teamId,
          readOptions,
        );
        const scopedResources = parseSharedResourceRecords(out, options.kind, scopedIdPrefixFor(principal));
        const legacyResources = principal.workspaceType === 'personal'
          ? []
          : parseSharedResourceRecords(out, options.kind, options.idPrefix);
        const byId = new Map<string, TeamResourceShareRecord>();
        for (const resource of legacyResources) byId.set(resource.id, resource);
        for (const resource of scopedResources) byId.set(resource.id, resource);
        const resources = [...byId.values()];
        shared.clear();
        for (const resource of resources) shared.add(resource.id);
        return resources
          .map((resource) => {
            // Keep the non-enumerable hubResourceId attached for the local
            // materializer. Spreading into a new object drops that descriptor
            // and makes workspace-scoped resources fall back to the legacy,
            // unscoped id when a teammate pulls them.
            resource.canUnshare = canManageSharedResource(principal, resource);
            return resource;
          })
          .sort((a, b) => a.id.localeCompare(b.id));
      } catch (error) {
        if (readOptions?.authoritative) throw error;
        return [...shared].sort().map((id) => ({ id, canUnshare: true }));
      }
    },
    isShared: (resourceId, scope) => sharedFor(scope.principal.teamId).has(resourceId),
    configured: true,
  };
}

async function defaultRun(args: string[], workspaceId?: string): Promise<string> {
  const { runVelaResourceCommand } = await import('./vela-cli-resource-adapter.js');
  return runVelaResourceCommand(args, workspaceId);
}

/**
 * spec 04 §11: unshare `resourceId` from `service`'s team hub, but ONLY when
 * it is CURRENTLY on the LIVE `sharedResources()` list — never inferred from
 * a caller-side "was this ever synced locally" flag. A resource's own
 * sharer never carries a local "teamSynced" marker (that flag is only ever
 * stamped onto a TEAMMATE's pulled copy — see `isTeamSyncedUserDesignSystem`
 * in design-systems/index.ts), so gating an unshare on it would let the
 * sharer delete their own shared resource without ever touching the hub's
 * index, leaving a dangling entry that keeps re-syncing onto every teammate.
 * This is the exact bug a resource-delete route must close for every
 * resource kind that can be team-shared (design system today; the analogous
 * project fix lives in `routes/project/index.ts`'s DELETE handler, reusing
 * `requestTeamVisibility`/`collabSync.requestTeamUnshare` instead of this
 * helper because projects don't go through `TeamResourceShareService`).
 *
 * Returns whether an unshare actually ran, so a caller — and its tests — can
 * assert on the real state transition instead of a "was unshare called" mock.
 * Deliberately does NOT swallow a thrown `TeamResourceShareForbiddenError`:
 * the caller's delete must abort rather than proceed past a failed unshare.
 */
export async function unshareIfCurrentlyShared(
  service: Pick<TeamResourceShareService, 'sharedResources' | 'unshare'>,
  resourceId: string,
  scope: TeamResourceRequestScope,
): Promise<boolean> {
  let resources: TeamResourceShareRecord[];
  try {
    resources = await service.sharedResources(scope, { authoritative: true });
  } catch (error) {
    if (error instanceof TeamResourceAuthorityUnavailableError) throw error;
    throw new TeamResourceAuthorityUnavailableError(error);
  }
  if (!resources.some((resource) => resource.id === resourceId)) return false;
  return service.unshare(resourceId, scope);
}

interface SharedResourceListPayload {
  resources?: Array<{
    id?: unknown;
    kind?: unknown;
    deletedAt?: unknown;
    metadata?: unknown;
    ownerMemberId?: unknown;
    publishedVersion?: unknown;
  }>;
}

export function parseSharedResourceIds(
  stdout: string,
  kind: string,
  idPrefix: string,
): string[] {
  return parseSharedResourceRecords(stdout, kind, idPrefix).map((resource) => resource.id);
}

export function parseSharedResourceRecords(
  stdout: string,
  kind: string,
  idPrefix: string,
): TeamResourceShareRecord[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  let parsed: SharedResourceListPayload;
  try {
    parsed = JSON.parse(trimmed) as SharedResourceListPayload;
  } catch {
    return [];
  }
  const prefix = `${idPrefix}-`;
  const records = new Map<string, TeamResourceShareRecord>();
  for (const resource of parsed.resources ?? []) {
    if (resource.kind !== kind || resource.deletedAt != null) continue;
    if (typeof resource.id !== 'string' || !resource.id.startsWith(prefix)) {
      continue;
    }
    const rawLocalId = resource.id.slice(prefix.length);
    const metadata = isObjectRecord(resource.metadata) ? resource.metadata : {};
    const localId = stringValue(metadata.localId) || decodeSharedResourceLocalId(rawLocalId, kind);
    if (!localId) continue;
    const title = stringValue(metadata.title) || stringValue(metadata.name);
    const description = stringValue(metadata.description);
    const ownerMemberId = stringValue(resource.ownerMemberId);
    const publishedVersion = isObjectRecord(resource.publishedVersion)
      ? resource.publishedVersion
      : null;
    const versionId = stringValue(publishedVersion?.id);
    const version = typeof publishedVersion?.version === 'number'
      ? publishedVersion.version
      : undefined;
    const record: TeamResourceShareRecord = {
      id: localId,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(ownerMemberId ? { ownerMemberId } : {}),
      ...(versionId ? { versionId } : {}),
      ...(version !== undefined ? { version } : {}),
    };
    Object.defineProperty(record, 'hubResourceId', {
      value: resource.id,
      enumerable: false,
      configurable: true,
    });
    records.set(localId, record);
  }
  return [...records.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function canManageSharedResource(
  principal: ResourceHubPrincipal,
  resource: TeamResourceShareRecord,
): boolean {
  if (principal.role === 'owner' || principal.role === 'admin') return true;
  return typeof resource.ownerMemberId === 'string' && resource.ownerMemberId === principal.memberId;
}

function decodeSharedResourceLocalId(localId: string, kind: string): string {
  if (kind === 'design_system' && localId.startsWith('user-')) {
    return `user:${localId.slice('user-'.length)}`;
  }
  return localId;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

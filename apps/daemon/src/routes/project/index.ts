import { createHash, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import type { Express, Request, Response } from 'express';
import type { LintArtifactRequest, LintArtifactResponse } from '@open-design/contracts';
import {
  PREVIEW_OBSERVABILITY_BRIDGE_MARKER,
  buildPreviewBaseHrefBridge,
  buildPreviewObservabilityBridge,
} from '@open-design/contracts/runtime/preview-observability';
import {
  buildPreviewFocusGuard,
  buildPreviewRedirectGuard,
  buildPreviewSandboxShim,
  PREVIEW_URL_GUARD_MAX_HTML_BYTES,
  previewHtmlHasLoadTimeLocationNavigation,
} from '@open-design/contracts/runtime/preview-guards';
import {
  endOfTag,
  findRealElementRange,
  findRealTagEnd,
  findRealTagOffset,
  HTML_TAG_PATTERNS,
  prependAfterDoctype,
} from '@open-design/contracts/runtime/html-injection-points';
import {
  PREVIEW_RUNTIME_STATE_LIMITS,
  PREVIEW_RUNTIME_STATE_VERSION,
} from '@open-design/contracts/runtime/preview-runtime-state';
import {
  automaticStrategyTaskProfileForProjectMetadata,
  defaultScenarioPluginIdForProjectMetadata,
  type ChatSessionMode,
  type LocalCatalogScope,
  type PluginManifest,
  type PreviewComment,
  type ProjectDesignTokenSuggestionProp,
  type ProjectDesignTokenSuggestionQuery,
  type ProjectFile,
  type ProjectFileTextPreviewResponse,
  type ProjectFileVersion,
  type ProjectFileVersionPromptSource,
  type ProjectFileVersionSource,
  type ProjectFileVersionWarning,
  type ProjectMetadata,
  type RestoreProjectAutomaticScenarioRequest,
  type RestoreProjectAutomaticScenarioResponse,
  type ProjectSyncState,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { readMeta as readBrandMeta } from '../../brands/store.js';
import { createProjectArtifactFile } from '../../artifacts/create.js';
import { ArtifactPublicationBlockedError } from '../../artifacts/publication-guard.js';
import { ArtifactRegressionError } from '../../artifacts/stub-guard.js';
import {
  ensureCurrentProjectFileVersion,
  isProjectFileVersionPath,
  listProjectFileVersions,
  markProjectFileVersionStoreDeleted,
  readProjectFileVersion,
  renameProjectFileVersionStore,
  withProjectFileVersionLock,
} from '../../project-file-versions.js';
import {
  createUserDesignSystem,
  deleteUserDesignSystem,
  linkUserDesignSystemProject,
  listDesignSystems,
  propagateWorkspaceProjectRename,
  resolveWorkspaceProjectDesignSystemRoot,
  type DesignSystemSummary,
  type UserDesignSystemInput,
} from '../../design-systems/index.js';
import { buildProjectDesignTokenSuggestions } from '../../project-design-token-suggestions.js';
import {
  FIRST_PARTY_ATOMS,
  buildConnectorProbe,
  getInstalledPlugin,
  listInstalledPlugins,
  automaticScenarioTaskProfile,
  createAutomaticProjectStrategyBinding,
  createProjectExampleBinding,
  digestExampleSkillManifest,
  InvalidProjectExampleBindingError,
  readVerifiedProjectScenarioBinding,
  readVerifiedProjectStrategyBinding,
  resolvePluginSnapshot,
  restoreProjectSnapshotLink,
  type ResolveSnapshotError,
  type ResolveSnapshotOk,
} from '../../plugins/index.js';
import { connectorService } from '../../connectors/service.js';
import type { RouteDeps } from '../../server-context.js';
import { listSkills } from '../../skills.js';
import { isSafeId } from '../../projects.js';
import {
  ensureTeamProjectCommentConversations,
  getFirstProjectConversation,
  SYNC_KEEPS_UPDATED_AT,
} from '../../db.js';
import {
  BUILT_IN_PROJECT_LOCATION_ID,
  allProjectLocations,
  createLocationProjectDir,
  ensureProjectLocation,
  scanProjectLocation,
  writeProjectManifest,
} from '../../project-locations.js';
import { auditDesignSystemPackage } from '../../tools-connectors-cli.js';
import { parseOrchestratorWorkspace } from '../../workspace-contract.js';
import { registerProjectConversationRoutes } from './conversations.js';
import { workspaceProjectGroupCountProperties } from './analytics.js';
import type { ProjectCommentWorkspaceContextResolution } from './comments.js';
import {
  projectResourceIdFor,
  velaProjectSyncStateToProject,
  type VelaTeamProjectCatalogClient,
  type VelaTeamProjectRecord,
} from '../../integrations/vela-team-projects.js';
import type { ResourceHubPrincipal } from '../../collab/resource-principal.js';
import {
  refuseTeamShareScope,
  type TeamShareScopeRefusal,
  type WorkspaceTypeRegistry,
} from '../../collab/team-share-scope.js';
import {
  headerValue,
  isWorkspaceResourceLocked as isWorkspaceLocked,
  workspaceResourceAccess,
  workspaceResourceContext as workspaceProjectContext,
  workspaceResourceContextFromRequest as workspaceProjectContextFromRequest,
  workspaceResourceContextFromVerified,
  type VerifyWorkspaceRequestAuthority,
  type WorkspaceResourceAccessInput,
  type WorkspaceResourceContext,
  type WorkspaceResourceMutationCapability,
} from '../../collab/workspace-resource-mutation.js';
import {
  resolveLocalProjectWorkspaceScope,
} from '../../collab/project-workspace-scope.js';
import {
  createAuthorizeProjectRequest,
  enforceLocalProjectDataPlaneRequest,
  type AuthorizeProjectRequest,
} from '../../collab/project-request-authority.js';
import {
  bindCreatedProjectToWorkspace,
  createCreatedProjectWorkspaceResolver,
  CreatedProjectWorkspaceResolutionError,
  localProjectWorkspaceAttribution,
  type CreatedProjectWorkspaceResolver,
} from '../../collab/created-project-workspace.js';
import { localPluginRegistryScope } from '../../plugins/local-source.js';
import type { WorkspaceDirectoryFetchResult } from '../../collab/vela-workspace-context.js';
import { cancelRunsOwnedBy } from './cancel-owned-runs.js';

export function rewriteOutsideExecutableHtmlRanges(
  html: string,
  rewriteChunk: (chunk: string) => string,
): string {
  const $ = load(html, { sourceCodeLocationInfo: true }, false);
  const scriptRanges = $('script')
    .toArray()
    .flatMap((node) => {
      const location = node.sourceCodeLocation;
      if (!location?.startTag) return [];
      const startTag = html.slice(location.startTag.startOffset, location.startTag.endOffset);
      const isSelfClosingForeignScript = node.namespace !== 'http://www.w3.org/1999/xhtml'
        && startTag.endsWith('/>');
      return [{
        start: location.startTag.endOffset,
        end: location.endTag?.startOffset
          ?? (isSelfClosingForeignScript ? location.startTag.endOffset : html.length),
      }];
    });
  const executableAttributeRanges = $('*')
    .toArray()
    .flatMap((node) => {
      const sourceLocation = node.sourceCodeLocation;
      if (!sourceLocation || !('attrs' in sourceLocation)) return [];
      const attributes = sourceLocation.attrs as Record<string, {
        startOffset: number;
        endOffset: number;
      }> | undefined;
      const element = node as Extract<typeof node, { attribs: Record<string, string> }>;
      // parse5 stores namespaced values by local name and keeps their source prefix separately.
      const valuesBySourceName = new Map(Object.entries(element.attribs).map(([localName, value]) => {
        const prefix = element['x-attribsPrefix']?.[localName];
        return [(prefix ? `${prefix}:${localName}` : localName).toLowerCase(), value] as const;
      }));
      return Object.entries(attributes ?? {}).flatMap(([name, location]) => {
        const normalizedName = name.toLowerCase();
        const value = valuesBySourceName.get(normalizedName) ?? '';
        const normalizedSchemeValue = value.replace(/[\t\n\r]/g, '');
        if (
          normalizedName.startsWith('on')
          || normalizedName === 'srcdoc'
          || /^\s*(?:javascript|vbscript|data):/i.test(normalizedSchemeValue)
        ) {
          return [{ start: location.startOffset, end: location.endOffset }];
        }
        return [];
      });
    });
  const protectedRanges = [...scriptRanges, ...executableAttributeRanges]
    .sort((left, right) => left.start - right.start)
    .reduce<Array<{ start: number; end: number }>>((ranges, range) => {
      const previous = ranges.at(-1);
      if (!previous || range.start > previous.end) {
        ranges.push({ ...range });
      } else {
        previous.end = Math.max(previous.end, range.end);
      }
      return ranges;
    }, []);

  let markerPrefix: string | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidate = `__OD_PROTECTED_HTML_RANGE_${randomUUID()}_`;
    if (!html.includes(candidate)) {
      markerPrefix = candidate;
      break;
    }
  }
  if (!markerPrefix) throw new Error('Unable to allocate protected HTML marker');

  const protectedValues: Array<{ marker: string; value: string }> = [];
  let maskedHtml = '';
  let cursor = 0;
  for (const [index, range] of protectedRanges.entries()) {
    const marker = `${markerPrefix}${index}__`;
    maskedHtml += html.slice(cursor, range.start);
    maskedHtml += marker;
    protectedValues.push({ marker, value: html.slice(range.start, range.end) });
    cursor = range.end;
  }
  maskedHtml += html.slice(cursor);

  let rewrittenHtml = rewriteChunk(maskedHtml);
  for (const { marker, value } of protectedValues) {
    rewrittenHtml = rewrittenHtml.split(marker).join(value);
  }
  return rewrittenHtml;
}

function parseLocalCatalogScope(value: unknown, field: string): LocalCatalogScope | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object') {
    throw new Error(`${field} must contain workspaceId and workspaceMemberId`);
  }
  const record = value as Record<string, unknown>;
  const workspaceId = typeof record.workspaceId === 'string'
    ? record.workspaceId.trim()
    : '';
  const workspaceMemberId = typeof record.workspaceMemberId === 'string'
    ? record.workspaceMemberId.trim()
    : '';
  if (!workspaceId || !workspaceMemberId) {
    throw new Error(`${field} must contain workspaceId and workspaceMemberId`);
  }
  return { workspaceId, workspaceMemberId };
}

function sameLocalCatalogScopes(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export interface RegisterProjectRoutesDeps extends RouteDeps<'db' | 'design' | 'http' | 'paths' | 'projectStore' | 'projectFiles' | 'conversations' | 'templates' | 'status' | 'events' | 'ids' | 'telemetry' | 'appConfig' | 'agents' | 'validation' | 'collabSync'> {
  pluginScope?: {
    loadRegistry: (options: {
      workspaceId?: string | null;
      workspaceMemberId?: string | null;
    }) => Promise<Parameters<typeof resolvePluginSnapshot>[0]['registry']>;
    getPlugin: (
      id: string,
      options: { workspaceId: string | null; workspaceMemberId: string | null },
    ) => Promise<unknown | null>;
    getLocalPluginBySource?: (
      id: string,
      source: string,
    ) => Promise<Parameters<typeof resolvePluginSnapshot>[0]['plugin'] | null>;
  };
  teamProjectCatalog?: VelaTeamProjectCatalogClient;
  /** Bounded authoritative verifier for idempotent Workspace project reads. */
  verifyWorkspaceReadAuthority?: VerifyWorkspaceRequestAuthority;
  /** Authoritative verifier for every Workspace-bound project mutation. */
  verifyWorkspaceRequestAuthority?: VerifyWorkspaceRequestAuthority;
  /**
   * Cached-only authority verifier for deleting a personal, local-only
   * project. It must never start network I/O; all other mutations continue
   * through `verifyWorkspaceRequestAuthority`.
   */
  verifyPersonalProjectDeleteLeaseAuthority?: VerifyWorkspaceRequestAuthority;
  /** Shared local binding gate for all project data-plane routes. */
  authorizeProjectRequest?: AuthorizeProjectRequest;
  /** Startup-hydrated O(1) quarantine lookup for stale Team mirrors. */
  isProjectRevoked?: (projectId: string) => boolean;
  /** Durable first-open placeholder stamp lookup. */
  isProjectUnmaterializedPlaceholder?: (projectId: string) => boolean;
  /** Membership directory used by Workspace account and cloud boundaries. */
  fetchWorkspaceDirectory?: () => Promise<WorkspaceDirectoryFetchResult>;
  /** Current settings-backed AMR environment for synthesized project contexts. */
  configuredEnv?: () => Record<string, string>;
  /** @deprecated Creation is local; retained for compatible route composition. */
  fetchProjectCreationWorkspaceDirectory?: () => Promise<WorkspaceDirectoryFetchResult>;
  /**
   * Persist a design system and its Workspace ownership envelope from the
   * request's complete local attribution. Production injects the shared
   * design-system creation service; the optional shape preserves isolated
   * route harnesses and headerless/local compatibility.
   */
  createWorkspaceOwnedDesignSystem?: (
    root: string,
    input: UserDesignSystemInput,
    context: WorkspaceResourceContext | null,
  ) => Promise<DesignSystemSummary>;
  /**
   * Collab-cloud comment seams, threaded to the nested preview-comment routes.
   * `resolveAuthorMemberId` stamps the server-authoritative author AND identifies
   * the caller for permission gating; `resolveProjectOwnerMemberId` resolves the
   * shared project's owner so the owner may delete / drive status on any comment.
   * `onCommentCreated`/`onCommentUpdated`/`onCommentDeleted` push the comment's
   * lifecycle (create/edit, status change, tombstone) to the cross-daemon relay.
   * All optional and no-op off-team / when the collab cloud is unconfigured.
   */
  resolveAuthorMemberId?: (authorization: string | undefined) => Promise<string | undefined>;
  resolveWorkspaceContext?: (
    req: Request,
    projectId: string,
  ) => Promise<ProjectCommentWorkspaceContextResolution>;
  resolveReadWorkspaceContext?: (
    req: Request,
    projectId: string,
  ) => Promise<ProjectCommentWorkspaceContextResolution>;
  resolveProjectOwnerMemberId?: (
    projectId: string,
    context?: WorkspaceCollabContext | null,
  ) => Promise<string | null>;
  isSharedProject?: (
    projectId: string,
    context?: WorkspaceCollabContext | null,
  ) => Promise<boolean>;
  onCommentCreated?: (
    comment: PreviewComment,
    context: WorkspaceCollabContext | null,
  ) => boolean | void;
  onCommentUpdated?: (
    comment: PreviewComment,
    context: WorkspaceCollabContext | null,
  ) => boolean | void;
  onCommentDeleted?: (
    comment: PreviewComment,
    context: WorkspaceCollabContext | null,
  ) => boolean | void;
  onCommentsRead?: (
    projectId: string,
    context: WorkspaceCollabContext | null,
    resolveFreshWorkspaceContext: () => Promise<ProjectCommentWorkspaceContextResolution>,
  ) => Promise<void> | void;
  /**
   * What the daemon has learned about each workspace's type, used to refuse a
   * team share aimed at a personal workspace even when the caller's headers say
   * otherwise. See `collab/team-share-scope.ts`.
   */
  workspaceTypes?: Pick<WorkspaceTypeRegistry, 'isKnownPersonal' | 'learn' | 'typeOf'>;
}

// `WorkspaceProjectContext`/`WorkspaceProjectMutationCapability`/
// `WorkspaceProjectAccessInput` and the header-reading helpers used to be
// defined here, hard-coded to "project". They now live in
// `collab/workspace-resource-mutation.ts` as the resource-agnostic
// `WorkspaceResource*` shapes (imported above and aliased back to these
// project-flavored names) so plugin/skill/design-system callers share the
// exact same header-parsing and mutation-gate logic instead of forking it.
type WorkspaceProjectContext = WorkspaceResourceContext;
type WorkspaceProjectMutationCapability = WorkspaceResourceMutationCapability;
type WorkspaceProjectAccessInput = WorkspaceResourceAccessInput;

/**
 * Can a team share be RECORDED in the workspace this request is acting in?
 *
 * A team share must live in a team workspace — see `collab/team-share-scope.ts`
 * for why a `visibility: 'team'` row pinned to a personal workspace is a
 * permanently-broken address rather than a scope. Two independent witnesses can
 * refuse it, and either alone is enough: the caller's own `x-od-workspace-type`
 * claim (a client that says "personal" and asks for a team share has stated the
 * contradiction itself), and the workspace directory the daemon has already read
 * (which catches a caller whose headers are simply wrong). With neither, the
 * request is allowed — this guard fires on positive evidence only, so it can
 * never block a legitimate share in a workspace it has not learned about.
 */
function teamShareRefusalFor(
  ctx: WorkspaceProjectContext,
  workspaceTypes?: Pick<WorkspaceTypeRegistry, 'isKnownPersonal'> | null,
): TeamShareScopeRefusal | null {
  return refuseTeamShareScope(ctx.workspaceId, {
    assertedType: ctx.workspaceTypeAsserted,
    ...(workspaceTypes ? { registry: workspaceTypes } : {}),
  });
}

function projectAccess(
  wp: WorkspaceProjectAccessInput,
  ctx: WorkspaceProjectContext,
  workspaceTypes?: Pick<WorkspaceTypeRegistry, 'isKnownPersonal'> | null,
) {
  // frozen/selfCreated/privileged/canMutate/canShareLocal/disabledReason are
  // the resource-agnostic part, computed once in
  // collab/workspace-resource-mutation.ts so a fix there lands for plugin and
  // skill too. Only the fields below (canMoveToTeam/canMoveToPersonal/
  // canOpen/canExport/canSendTo) are project-specific UX affordances.
  const {
    frozen,
    selfCreated,
    canMutate: privilegedOrCreatorCanMutate,
    canShareLocal,
    disabledReason: baseDisabledReason,
  } = workspaceResourceAccess(wp, ctx);
  // Team-shared projects are single-writer resources: Workspace governance
  // may manage the Team, but only the member recorded as this project's
  // creator may mutate or unshare it. Keep the read model aligned with the
  // authoritative route gate; otherwise owner/admin callers are advertised
  // actions that direct project routes reject, while the workspace move route
  // (which consumes these flags) can still unshare someone else's project.
  // Personal/unshared projects retain the existing privileged-or-creator rule.
  const canMutate =
    privilegedOrCreatorCanMutate
    && (wp.visibility !== 'team' || selfCreated);
  const disabledReason =
    baseDisabledReason
    ?? (!canMutate ? 'permission_denied' : undefined);
  return {
    canOpen: !frozen && ctx.memberStatus === 'active',
    canRename: canMutate,
    canDelete: canMutate,
    canDuplicate: canMutate,
    // Never offer a share the workspace cannot host: the affordance is the
    // entry point that produced the impossible rows in the first place.
    canMoveToTeam:
      canShareLocal &&
      ctx.canShareProjects &&
      wp.visibility === 'personal' &&
      teamShareRefusalFor(ctx, workspaceTypes) === null,
    canMoveToPersonal: canMutate && ctx.canShareProjects && wp.visibility === 'team',
    canExport: !frozen && ctx.memberStatus === 'active',
    canSendTo: !frozen && ctx.memberStatus === 'active',
    canRestoreVersion: canMutate,
    ...(disabledReason ? { disabledReason } : {}),
  };
}

/**
 * The non-rejecting counterpart of `createEnforceWorkspaceProjectMutation`,
 * for a read route that would otherwise write as a local side effect.
 */
export function createWorkspaceProjectWriteAuthorityCheck(
  _verifyWorkspaceRequestAuthority?: VerifyWorkspaceRequestAuthority,
  isProjectUnmaterializedPlaceholder?: (projectId: string) => boolean,
) {
  return async function requestCanWriteWorkspaceProject(
    req: any,
    getWorkspaceProject: (db: unknown, workspaceId: string, projectId: string) => WorkspaceProjectAccessInput | null | undefined,
    getWorkspaceProjectByProjectId: (db: unknown, projectId: string) => WorkspaceProjectAccessInput | null | undefined,
    db: unknown,
    projectId: string,
  ): Promise<boolean> {
    const allowed = await enforceLocalProjectDataPlaneRequest({
      req,
      projectId,
      options: { mode: 'write', capability: 'writeFiles' },
      db,
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
    });
    return allowed && !isProjectUnmaterializedPlaceholder?.(projectId);
  };
}

export function createEnforceWorkspaceProjectMutation(
  _verifyWorkspaceRequestAuthority?: VerifyWorkspaceRequestAuthority,
  _verifyPersonalProjectDeleteLeaseAuthority?: VerifyWorkspaceRequestAuthority,
  authorizeProjectRequest?: AuthorizeProjectRequest,
) {
  return async function enforceWorkspaceProjectMutation(
    req: any,
    res: Response,
    sendApiError: (
      res: Response,
      status: number,
      code: string,
      message: string,
      details?: Record<string, unknown>,
    ) => unknown,
    getWorkspaceProject: (db: unknown, workspaceId: string, projectId: string) => WorkspaceProjectAccessInput | null | undefined,
    getWorkspaceProjectByProjectId: (db: unknown, projectId: string) => WorkspaceProjectAccessInput | null | undefined,
    db: unknown,
    projectId: string,
    capability: WorkspaceProjectMutationCapability,
  ): Promise<boolean> {
    // Production routes must converge on the central project authority gate.
    // In particular, that gate carries the durable placeholder-stamp check;
    // relying only on the placeholder's creator-null binding would make one
    // accidental reconciliation promotion sufficient to reopen content writes.
    // Keep the local-data-plane fallback solely for focused legacy fixtures
    // that do not provide the production authorizer.
    if (authorizeProjectRequest) {
      return authorizeProjectRequest(req, res, projectId, {
        mode: 'write',
        capability,
      });
    }
    return enforceLocalProjectDataPlaneRequest({
      req,
      projectId,
      options: { mode: 'write', capability },
      db,
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
      onDenied: (status, code, message, details) => details === undefined
        ? sendApiError(res, status, code, message)
        : sendApiError(res, status, code, message, details),
    });
  };
}

function projectDetailResolvedDir(
  projectsRoot: string,
  project: any,
  resolveProjectDir: (
    projectsRoot: string,
    projectId: string,
    metadata?: unknown,
    opts?: { allowUnavailableSandboxImportedProject?: boolean },
  ) => string,
): string {
  const baseDir = typeof project?.metadata?.baseDir === 'string'
    ? path.normalize(project.metadata.baseDir)
    : null;
  if (baseDir && path.isAbsolute(baseDir)) return baseDir;
  return resolveProjectDir(projectsRoot, project.id, project.metadata, {
    allowUnavailableSandboxImportedProject: true,
  });
}

/**
 * Materialize a *managed* project's folder before it is referenced as
 * read-only context for another run.
 *
 * Invariant: after this resolves for a managed project, `PROJECTS_DIR/<id>`
 * exists on disk. A brand-new project has a DB row but no on-disk directory
 * until its first file write, so without this a reference resolves to a path
 * that fails both the composer's existence probe and the daemon's
 * all-or-nothing linkedDirs validation. External / imported roots (an absolute
 * `metadata.baseDir`) are the user's own folders and are never created here.
 * Materialization failures are required failures: callers must surface them
 * instead of continuing with a resolvedDir that may not exist.
 */
export async function ensureReferencedProjectDir(
  projectsRoot: string,
  project: { id: string; metadata?: unknown },
  ensureProject: (projectsRoot: string, projectId: string, metadata?: unknown) => Promise<string>,
): Promise<void> {
  const metadata = (project?.metadata ?? null) as { baseDir?: unknown } | null;
  const baseDir = typeof metadata?.baseDir === 'string'
    ? path.normalize(metadata.baseDir)
    : null;
  const managedRoot = !(baseDir && path.isAbsolute(baseDir));
  if (!managedRoot) return;
  await ensureProject(projectsRoot, project.id, project.metadata);
}

const URL_PREVIEW_SCROLL_BRIDGE = `<script data-od-url-scroll-bridge>
(function(){
  if (window.__odUrlScrollBridge) return;
  window.__odUrlScrollBridge = true;
  var pending = false;
  var contentSizePending = false;
  var lastContentSizeRequest = null;
  var contentSizeDocumentEpoch = '';
  try {
    contentSizeDocumentEpoch = new URLSearchParams(window.location.search).get('odPreviewEpoch') || '';
  } catch (_) {}
  function scrollElement(){
    return document.querySelector('.design-canvas') || document.scrollingElement || document.documentElement;
  }
  function num(value){
    var next = Number(value || 0);
    return Number.isFinite(next) ? next : 0;
  }
  function measureContentSize(){
    var root = document.documentElement;
    var body = document.body || root;
    if (!root) return null;
    var scrollValues = [
      root.scrollWidth,
      body && body.scrollWidth
    ];
    var clientValues = [
      root.clientWidth,
      body && body.clientWidth
    ];
    var scrollWidth = 0;
    var clientWidth = 0;
    for (var i = 0; i < scrollValues.length; i += 1) {
      var nextScroll = num(scrollValues[i]);
      if (nextScroll > scrollWidth) scrollWidth = nextScroll;
    }
    for (var j = 0; j < clientValues.length; j += 1) {
      var nextClient = num(clientValues[j]);
      if (nextClient > clientWidth) clientWidth = nextClient;
    }
    return {
      scrollWidth: scrollWidth > 0 ? Math.ceil(scrollWidth) : null,
      clientWidth: clientWidth > 0 ? Math.ceil(clientWidth) : null
    };
  }
  function postContentSize(){
    if (!lastContentSizeRequest) return;
    var size = measureContentSize();
    window.parent.postMessage({
      type: 'od:preview-content-size',
      measurementId: lastContentSizeRequest.measurementId,
      generation: lastContentSizeRequest.generation,
      documentEpoch: contentSizeDocumentEpoch,
      scrollWidth: size && size.scrollWidth,
      clientWidth: size && size.clientWidth
    }, '*');
  }
  function scheduleContentSize(){
    if (contentSizePending) return;
    contentSizePending = true;
    window.requestAnimationFrame(function(){
      contentSizePending = false;
      postContentSize();
    });
  }
  function post(){
    var el = scrollElement();
    if (!el) return;
    var frame = document.scrollingElement || document.documentElement;
    window.parent.postMessage({
      type: 'od:preview-scroll',
      canvasLeft: Math.round(el.scrollLeft || 0),
      canvasTop: Math.round(el.scrollTop || 0),
      frameLeft: Math.round(frame.scrollLeft || 0),
      frameTop: Math.round(frame.scrollTop || 0)
    }, '*');
  }
  function schedule(){
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(function(){
      pending = false;
      post();
    });
  }
  function scrollTo(el, left, top){
    if (!el) return;
    if (typeof el.scrollTo === 'function') el.scrollTo(num(left), num(top));
    else {
      el.scrollLeft = num(left);
      el.scrollTop = num(top);
    }
  }
  function scrollBy(el, left, top){
    if (!el) return;
    var dx = num(left);
    var dy = num(top);
    if (!dx && !dy) return;
    if (typeof el.scrollBy === 'function') el.scrollBy({ left: dx, top: dy, behavior: 'auto' });
    else {
      el.scrollLeft = (el.scrollLeft || 0) + dx;
      el.scrollTop = (el.scrollTop || 0) + dy;
    }
  }
  function requestRestore(){
    window.parent.postMessage({ type: 'od:preview-scroll-request' }, '*');
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || !data.type) return;
    if (data.type === 'od:preview-scroll-restore') {
      scrollTo(document.scrollingElement || document.documentElement, data.frameLeft, data.frameTop);
      scrollTo(scrollElement(), data.canvasLeft, data.canvasTop);
      setTimeout(post, 0);
      return;
    }
    if (data.type === 'od:preview-scroll-by') {
      scrollBy(scrollElement(), data.left, data.top);
      schedule();
      scheduleContentSize();
      return;
    }
    if (data.type === 'od:preview-content-size-request') {
      if (typeof data.measurementId !== 'string' || typeof data.generation !== 'string') return;
      lastContentSizeRequest = {
        measurementId: data.measurementId,
        generation: data.generation
      };
      scheduleContentSize();
    }
  });
  window.addEventListener('scroll', schedule, true);
  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', function(){
    schedule();
    scheduleContentSize();
  });
  if (typeof ResizeObserver !== 'undefined') {
    try {
      var observer = new ResizeObserver(scheduleContentSize);
      observer.observe(document.documentElement);
      if (document.body) observer.observe(document.body);
    } catch (_) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){
      requestRestore();
      schedule();
      scheduleContentSize();
    });
  } else {
    setTimeout(function(){
      requestRestore();
      schedule();
      scheduleContentSize();
    }, 0);
  }
  setTimeout(scheduleContentSize, 80);
  setTimeout(scheduleContentSize, 260);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleContentSize).catch(function(){});
  }
})();
</script>`;

function sameOrchestratorWorkspace(a: unknown, b: unknown): boolean {
  const parsedA = parseOrchestratorWorkspace(a);
  const parsedB = parseOrchestratorWorkspace(b);
  if (!parsedA.ok || !parsedB.ok) return false;
  return JSON.stringify(parsedA.value) === JSON.stringify(parsedB.value);
}

const URL_PREVIEW_SELECTION_BRIDGE = `<script data-od-url-selection-bridge>
(function(){
  if (window.__odUrlSelectionBridge) return;
  window.__odUrlSelectionBridge = true;
  var commentEnabled = false;
  var mode = 'picker';
  var hoveredId = null;
  var drawing = false;
  var stroke = [];
  var strokeFrame = null;
  var postTargetsPending = false;
  var postTargetsTimer = null;
  var activeCommentElementId = null;
  var activeCommentSelector = null;
  var activeTargetPending = false;
  function postReady(){
    window.parent.postMessage({ type: 'od:url-selection-bridge-ready', href: window.location.href }, '*');
  }
  function esc(value){
    try { return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, '\\\\"'); }
    catch (_) { return String(value); }
  }
  function previewHtmlFileForLink(link){
    if (!link || link.hasAttribute('download')) return null;
    var target = String(link.getAttribute('target') || '').toLowerCase();
    if (target && target !== '_self') return null;
    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#') return null;
    try {
      var baseUrl = new URL(document.baseURI || location.href);
      var nextUrl = new URL(href, baseUrl);
      if (nextUrl.origin !== baseUrl.origin) return null;
      var fileRoot = null;
      var projectMarker = '/api/projects/';
      var projectIndex = baseUrl.pathname.indexOf(projectMarker);
      if (projectIndex < 0) return null;
      var projectIdStart = projectIndex + projectMarker.length;
      var routeMarkerStart = baseUrl.pathname.indexOf('/', projectIdStart);
      if (routeMarkerStart < 0 || routeMarkerStart === projectIdStart) return null;
      var rawMarker = '/raw/';
      if (baseUrl.pathname.slice(routeMarkerStart, routeMarkerStart + rawMarker.length) === rawMarker) {
        fileRoot = baseUrl.pathname.slice(0, routeMarkerStart + rawMarker.length);
      } else {
        var previewMarker = '/preview/';
        if (baseUrl.pathname.slice(routeMarkerStart, routeMarkerStart + previewMarker.length) !== previewMarker) return null;
        var scopeStart = routeMarkerStart + previewMarker.length;
        var scopeEnd = baseUrl.pathname.indexOf('/', scopeStart);
        if (scopeEnd < 0 || scopeEnd === scopeStart) return null;
        fileRoot = baseUrl.pathname.slice(0, scopeEnd + 1);
      }
      if (nextUrl.pathname.indexOf(fileRoot) !== 0) return null;
      var fileName = decodeURIComponent(nextUrl.pathname.slice(fileRoot.length));
      if (
        !fileName ||
        fileName.charAt(0) === '/' ||
        fileName.split('/').some(function(part){ return !part || part === '.' || part === '..'; }) ||
        !/\\.html?$/i.test(fileName)
      ) return null;
      return { fileName: fileName, search: nextUrl.search || '', hash: nextUrl.hash || '' };
    } catch (_) {
      return null;
    }
  }
  function ensureStyle(){
    if (document.querySelector('style[data-od-url-selection-style]')) return;
    var style = document.createElement('style');
    style.setAttribute('data-od-url-selection-style', '');
    style.textContent =
      'html[data-od-comment-mode] body * { cursor: crosshair !important; }' +
      'html[data-od-comment-mode][data-od-comment-mode-kind="pod"] body * { cursor: cell !important; }' +
      'html[data-od-comment-mode] body iframe,html[data-od-comment-mode] body object,html[data-od-comment-mode] body embed { pointer-events: none !important; }';
    (document.head || document.documentElement).appendChild(style);
  }
  function active(){ return commentEnabled; }
  function annotatedSelectorFor(el){
    var id = el.getAttribute('data-od-id') || el.getAttribute('data-screen-label');
    if (!id) return null;
    return el.hasAttribute('data-od-id') ? '[data-od-id="' + esc(id) + '"]' : '[data-screen-label="' + esc(id) + '"]';
  }
  function domSelectorFor(el){
    if (!el || !el.tagName || el === document.documentElement || el === document.body) return null;
    var parts = [];
    var node = el;
    while (node && node !== document.documentElement && node !== document.body) {
      var tag = node.tagName ? node.tagName.toLowerCase() : '';
      if (!tag || /^(script|style|template|meta|link|title|noscript)$/.test(tag)) return null;
      var parent = node.parentElement;
      if (!parent) return null;
      var index = 1;
      var sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.tagName && sibling.tagName.toLowerCase() === tag) index++;
        sibling = sibling.previousElementSibling;
      }
      parts.unshift(tag + ':nth-of-type(' + index + ')');
      node = parent;
    }
    return parts.length ? 'body > ' + parts.join(' > ') : null;
  }
  function visibleTarget(el){
    if (!el || !el.getBoundingClientRect) return false;
    if (el === document.documentElement || el === document.body) return false;
    if (/^(script|style|template|meta|link|title|noscript)$/.test(el.tagName ? el.tagName.toLowerCase() : '')) return false;
    try {
      var rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      var cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
    } catch (_) { return false; }
    return true;
  }
  function meaningfulDomFallbackTarget(el){
    if (!visibleTarget(el)) return false;
    var tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (/^(a|button|input|textarea|select|label|img|video|canvas|h1|h2|h3|h4|h5|h6|p|li|td|th)$/.test(tag)) return true;
    if (el.getAttribute && (el.getAttribute('role') || el.getAttribute('aria-label') || el.getAttribute('title'))) return true;
    if (tag === 'svg') return !!(el.getAttribute && (el.getAttribute('role') || el.getAttribute('aria-label') || el.getAttribute('title')));
    var text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    if (!text) return false;
    if (/^(span|strong|em|b|i|small|code|mark)$/.test(tag)) return true;
    var meaningfulChildren = 0;
    for (var child = el.firstElementChild; child; child = child.nextElementSibling) {
      var childTag = child.tagName ? child.tagName.toLowerCase() : '';
      if (/^(script|style|template|meta|link|title|noscript)$/.test(childTag)) continue;
      if ((child.textContent || '').replace(/\\s+/g, ' ').trim() || /^(img|video|canvas|svg|input|textarea|select)$/.test(childTag)) {
        meaningfulChildren++;
        if (meaningfulChildren > 1) return false;
      }
    }
    return true;
  }
  function generatedRootAnnotation(el, id){
    return id === 'path-0' && el && el.parentElement === document.body && el.id === 'root';
  }
  function styleSnapshot(el){
    try {
      var cs = window.getComputedStyle(el);
      return {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        borderRadius: cs.borderTopLeftRadius,
        textAlign: cs.textAlign,
        fontFamily: cs.fontFamily
      };
    } catch (_) { return null; }
  }
  function targetFrom(el, allowDomFallback, clickedEl, clickPoint){
    var id = el.getAttribute('data-od-id') || el.getAttribute('data-screen-label');
    if (allowDomFallback && id && generatedRootAnnotation(el, id)) return null;
    var selector = annotatedSelectorFor(el);
    if (!id && allowDomFallback && meaningfulDomFallbackTarget(el)) {
      selector = domSelectorFor(el);
      if (selector) id = 'dom:' + selector;
    }
    if (!id || !selector) return null;
    var rect = el.getBoundingClientRect();
    var tag = el.tagName ? el.tagName.toLowerCase() : 'element';
    var cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    var html = '';
    try {
      var match = (el.outerHTML || '').replace(/\\s+/g, ' ').match(/^<[^>]+>/);
      html = match ? match[0] : '';
    } catch (_) {}
    var payload = {
      type: 'od:comment-target',
      elementId: id,
      selector: selector,
      label: tag + cls,
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 160),
      position: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      htmlHint: html.slice(0, 180),
      style: styleSnapshot(el)
    };
    if (clickPoint) payload.hoverPoint = { x: Math.round(clickPoint.x), y: Math.round(clickPoint.y) };
    if (clickedEl && clickedEl !== el) {
      var clickedTag = clickedEl.tagName ? clickedEl.tagName.toLowerCase() : 'element';
      var clickedCls = typeof clickedEl.className === 'string' && clickedEl.className.trim() ? '.' + clickedEl.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
      payload.clickedDescendant = {
        label: clickedTag + clickedCls,
        text: (clickedEl.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
      };
    }
    return payload;
  }
  function allTargets(){
    var includeDomFallback = commentEnabled && mode === 'picker';
    var nodes = includeDomFallback ? document.querySelectorAll('body *') : document.querySelectorAll('[data-od-id], [data-screen-label]');
    var items = [];
    var seen = Object.create(null);
    for (var i = 0; i < nodes.length; i++) {
      var item = targetFrom(nodes[i], includeDomFallback);
      if (item && !seen[item.elementId]) {
        seen[item.elementId] = true;
        items.push(item);
      }
    }
    return items;
  }
  function postTargets(){
    if (!active()) return;
    window.parent.postMessage({ type: 'od:comment-targets', targets: allTargets() }, '*');
  }
  function schedulePostTargets(){
    if (!active() || postTargetsPending) return;
    postTargetsPending = true;
    if (postTargetsTimer) window.clearTimeout(postTargetsTimer);
    postTargetsTimer = window.setTimeout(function(){
      window.requestAnimationFrame(function(){
        postTargetsPending = false;
        postTargetsTimer = null;
        postTargets();
      });
    }, 120);
  }
  function findCommentTargetByIdentity(elementId, selector){
    var el = null;
    if (selector) {
      try { el = document.querySelector(String(selector)); } catch (_) { el = null; }
    }
    if (!el && elementId) {
      try {
        var id = String(elementId).replace(/"/g, '\\\\"');
        el = document.querySelector('[data-od-id="' + id + '"], [data-screen-label="' + id + '"]');
      } catch (_) { el = null; }
    }
    return el;
  }
  function postActiveCommentTarget(){
    if (!active() || !activeCommentElementId) return;
    var el = findCommentTargetByIdentity(activeCommentElementId, activeCommentSelector);
    if (!el) return;
    var payload = targetFrom(el, commentEnabled && mode === 'picker');
    if (payload) window.parent.postMessage(Object.assign({}, payload, { type: 'od:comment-active-target-update' }), '*');
  }
  function schedulePostActiveCommentTarget(){
    if (!active() || !activeCommentElementId || activeTargetPending) return;
    activeTargetPending = true;
    window.requestAnimationFrame(function(){
      activeTargetPending = false;
      postActiveCommentTarget();
    });
  }
  function eventCandidateElements(event){
    var items = [];
    function push(node){
      if (!node || node.nodeType !== 1) return;
      if (items.indexOf(node) >= 0) return;
      items.push(node);
    }
    try {
      if (event && typeof event.composedPath === 'function') {
        var path = event.composedPath();
        for (var i = 0; i < path.length; i++) push(path[i]);
      }
    } catch (_) {}
    push(event && event.target);
    try {
      if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number' && document.elementsFromPoint) {
        var stack = document.elementsFromPoint(event.clientX, event.clientY);
        for (var s = 0; s < stack.length; s++) push(stack[s]);
      } else if (event && typeof event.clientX === 'number' && typeof event.clientY === 'number' && document.elementFromPoint) {
        push(document.elementFromPoint(event.clientX, event.clientY));
      }
    } catch (_) {}
    return items;
  }
  function closestTarget(event){
    var candidates = eventCandidateElements(event);
    var allowDomFallback = commentEnabled && mode === 'picker';
    var annotatedFallback = null;
    for (var i = 0; i < candidates.length; i++) {
      var clicked = candidates[i];
      var el = clicked;
      while (el && el !== document.documentElement) {
        if (allowDomFallback && meaningfulDomFallbackTarget(el)) return { target: el, clicked: clicked };
        if (el.getAttribute && (el.hasAttribute('data-od-id') || el.hasAttribute('data-screen-label'))) {
          var id = el.getAttribute('data-od-id') || el.getAttribute('data-screen-label');
          if (allowDomFallback && generatedRootAnnotation(el, id)) {
            el = el.parentElement;
            continue;
          }
          if (allowDomFallback && !annotatedFallback) annotatedFallback = { target: el, clicked: clicked };
          if (allowDomFallback) break;
          return { target: el, clicked: clicked };
        }
        el = el.parentElement;
      }
    }
    return annotatedFallback;
  }
  function relativePoint(ev){ return { x: Math.round(ev.clientX), y: Math.round(ev.clientY) }; }
  function postStroke(type){ window.parent.postMessage({ type: type, points: stroke.slice() }, '*'); }
  function schedulePostStroke(){
    if (strokeFrame !== null) return;
    strokeFrame = requestAnimationFrame(function(){
      strokeFrame = null;
      postStroke('od:pod-stroke');
    });
  }
  // The host switches a plain URL preview to a bridge-enabled srcDoc when
  // Manual Edit opens. Capture the rendered body as a frozen DOM handoff so
  // stateful regions outside conventional #app/#root containers are not lost.
  function runtimeStateAttributeAllowed(name){
    return name === 'class' ||
      name === 'style' ||
      name === 'hidden' ||
      name === 'open' ||
      name.indexOf('aria-') === 0 ||
      (name.indexOf('data-') === 0 && name.indexOf('data-od-') !== 0);
  }
  function runtimeStateAttributes(el){
    var attrs = Object.create(null);
    if (!el || !el.attributes) return attrs;
    for (var i = 0; i < el.attributes.length && Object.keys(attrs).length < ${PREVIEW_RUNTIME_STATE_LIMITS.maxAttributes}; i++) {
      var attr = el.attributes[i];
      if (!attr || !runtimeStateAttributeAllowed(attr.name)) continue;
      var attrName = String(attr.name || '');
      var attrValue = String(attr.value || '');
      if (attrName.length > ${PREVIEW_RUNTIME_STATE_LIMITS.maxAttributeNameLength} || attrValue.length > ${PREVIEW_RUNTIME_STATE_LIMITS.maxAttributeValueLength}) continue;
      attrs[attrName] = attrValue;
    }
    return attrs;
  }
  function runtimeStatePath(el){
    var path = [];
    var node = el;
    while (node && node !== document.body) {
      var parent = node.parentElement;
      if (!parent || path.length >= ${PREVIEW_RUNTIME_STATE_LIMITS.maxPathLength}) return null;
      var index = Array.prototype.indexOf.call(parent.children, node);
      if (index < 0 || index > ${PREVIEW_RUNTIME_STATE_LIMITS.maxPathIndex}) return null;
      path.unshift(index);
      node = parent;
    }
    return node === document.body ? path : null;
  }
  function runtimeStateRoots(){
    if (!document.body) return [];
    var roots = [];
    var canonical = document.body.querySelectorAll('#app, #root, [data-reactroot]');
    for (var c = 0; c < canonical.length && roots.length < ${PREVIEW_RUNTIME_STATE_LIMITS.maxRoots}; c++) {
      roots.push(canonical[c]);
    }
    // Stateful overlays and detail panes are often siblings of #app/#root.
    // Capture the outermost identified sibling roots as well; otherwise the
    // attribute pass can restore an open/hidden state while leaving that pane's
    // dynamic body at its source placeholder. Never select an ancestor or
    // descendant of a canonical root, so framework-owned trees keep their
    // existing single snapshot boundary.
    var identified = document.body.querySelectorAll('[id]');
    for (var i = 0; i < identified.length && roots.length < ${PREVIEW_RUNTIME_STATE_LIMITS.maxRoots}; i++) {
      var candidate = identified[i];
      var overlaps = false;
      for (var r = 0; r < roots.length; r++) {
        if (roots[r].contains(candidate) || candidate.contains(roots[r])) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) roots.push(candidate);
    }
    return roots;
  }
  function captureRuntimeBodyHtml(){
    if (!document.body || !document.body.cloneNode) return null;
    try {
      var clone = document.body.cloneNode(true);
      var liveControls = document.body.querySelectorAll('input, textarea, option');
      var clonedControls = clone.querySelectorAll('input, textarea, option');
      var controlCount = Math.min(liveControls.length, clonedControls.length);
      for (var controlIndex = 0; controlIndex < controlCount; controlIndex++) {
        var liveControl = liveControls[controlIndex];
        var clonedControl = clonedControls[controlIndex];
        var controlTag = String(liveControl.tagName || '').toLowerCase();
        if (controlTag === 'textarea') {
          clonedControl.textContent = String(liveControl.value == null ? '' : liveControl.value);
        } else if (controlTag === 'option') {
          if (liveControl.selected) clonedControl.setAttribute('selected', '');
          else clonedControl.removeAttribute('selected');
        } else {
          clonedControl.setAttribute('value', String(liveControl.value == null ? '' : liveControl.value));
          if (liveControl.type === 'checkbox' || liveControl.type === 'radio') {
            if (liveControl.checked) clonedControl.setAttribute('checked', '');
            else clonedControl.removeAttribute('checked');
          }
        }
      }
      // Host bridges belong to the URL browsing context. Keeping their script
      // elements in the frozen body is unnecessary (innerHTML scripts are
      // inert) and leaks transport-only nodes into Manual Edit's DOM paths.
      var cloneScripts = clone.querySelectorAll('script');
      for (var scriptIndex = cloneScripts.length - 1; scriptIndex >= 0; scriptIndex--) {
        var scriptNode = cloneScripts[scriptIndex];
        var scriptAttrs = scriptNode.attributes || [];
        var hostScript = false;
        for (var scriptAttrIndex = 0; scriptAttrIndex < scriptAttrs.length; scriptAttrIndex++) {
          var scriptAttrName = String(scriptAttrs[scriptAttrIndex].name || '');
          if (scriptAttrName.indexOf('data-od-url-') === 0 && /-bridge$/.test(scriptAttrName)) {
            hostScript = true;
            break;
          }
        }
        if (hostScript) scriptNode.remove();
      }
      var html = String(clone.innerHTML || '');
      return html.length <= ${PREVIEW_RUNTIME_STATE_LIMITS.maxBodyHtmlLength} ? html : null;
    } catch (_) {
      return null;
    }
  }
  function captureRuntimeState(){
    var entries = [];
    var roots = [];
    var rootHtmlLength = 0;
    var bodyHtml = captureRuntimeBodyHtml();
    // Keep the old bounded root capture only as an oversize/DOM-clone
    // fallback. Normal Edit entry carries exactly one copy of the rendered
    // markup instead of duplicating the entire body plus its app roots.
    if (bodyHtml === null) {
      var runtimeRoots = runtimeStateRoots();
      for (var rootIndex = 0; rootIndex < runtimeRoots.length && roots.length < ${PREVIEW_RUNTIME_STATE_LIMITS.maxRoots}; rootIndex++) {
        var root = runtimeRoots[rootIndex];
        var rootTag = String(root.tagName || '').toLowerCase();
        var rootPath = runtimeStatePath(root);
        if (!rootPath) continue;
        var rootHtml = String(root.innerHTML || '');
        if (rootHtmlLength + rootHtml.length > ${PREVIEW_RUNTIME_STATE_LIMITS.maxRootHtmlLength}) break;
        var rootEntry = {
          path: rootPath,
          tag: rootTag,
          html: rootHtml
        };
        if (root.id && String(root.id).length <= ${PREVIEW_RUNTIME_STATE_LIMITS.maxIdentityLength}) rootEntry.id = String(root.id);
        var rootOdId = root.getAttribute && root.getAttribute('data-od-id');
        if (rootOdId && String(rootOdId).length <= ${PREVIEW_RUNTIME_STATE_LIMITS.maxIdentityLength}) rootEntry.odId = String(rootOdId);
        roots.push(rootEntry);
        rootHtmlLength += rootHtml.length;
      }
    }
    var nodes = document.body ? document.body.querySelectorAll('*') : [];
    var count = Math.min(nodes.length, ${PREVIEW_RUNTIME_STATE_LIMITS.maxElements});
    for (var i = 0; i < count; i++) {
      var el = nodes[i];
      var path = runtimeStatePath(el);
      if (!path) continue;
      var entry = {
        path: path,
        tag: String(el.tagName || '').toLowerCase(),
        attrs: runtimeStateAttributes(el)
      };
      if (el.id && String(el.id).length <= ${PREVIEW_RUNTIME_STATE_LIMITS.maxIdentityLength}) entry.id = String(el.id);
      var odId = el.getAttribute && el.getAttribute('data-od-id');
      if (odId && String(odId).length <= ${PREVIEW_RUNTIME_STATE_LIMITS.maxIdentityLength}) entry.odId = String(odId);
      var tag = entry.tag;
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        var value = String(el.value == null ? '' : el.value);
        if (value.length <= ${PREVIEW_RUNTIME_STATE_LIMITS.maxValueLength}) entry.value = value;
      }
      if (tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) {
        entry.checked = !!el.checked;
      }
      if (tag === 'select') entry.selectedIndex = Number(el.selectedIndex);
      if (el.scrollLeft) entry.scrollLeft = Number(el.scrollLeft);
      if (el.scrollTop) entry.scrollTop = Number(el.scrollTop);
      entries.push(entry);
    }
    return {
      version: ${PREVIEW_RUNTIME_STATE_VERSION},
      hash: String(window.location.hash || '').slice(0, ${PREVIEW_RUNTIME_STATE_LIMITS.maxHashLength}),
      bodyHtml: bodyHtml,
      roots: roots,
      htmlAttrs: runtimeStateAttributes(document.documentElement),
      bodyAttrs: runtimeStateAttributes(document.body),
      entries: entries
    };
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || !data.type) return;
    if (data.type === 'od:url-selection-bridge-probe') {
      postReady();
      return;
    }
    if (data.type === 'od:preview-runtime-state-capture' && data.id) {
      window.parent.postMessage({
        type: 'od:preview-runtime-state-captured',
        id: String(data.id),
        state: captureRuntimeState()
      }, '*');
      return;
    }
    if (data.type === 'od:comment-mode') {
      commentEnabled = !!data.enabled;
      mode = data.mode === 'pod' ? 'pod' : 'picker';
      document.documentElement.toggleAttribute('data-od-comment-mode', commentEnabled);
      document.documentElement.setAttribute('data-od-comment-mode-kind', mode);
      if (commentEnabled) setTimeout(postTargets, 0);
      else {
        hoveredId = null;
        activeCommentElementId = null;
        activeCommentSelector = null;
      }
      if (!commentEnabled || mode !== 'pod') {
        drawing = false;
        stroke = [];
        try { window.parent.postMessage({ type: 'od:pod-clear' }, '*'); } catch (_) {}
      }
      return;
    }
    if (data.type === 'od:comment-active-target') {
      activeCommentElementId = data.elementId ? String(data.elementId) : null;
      activeCommentSelector = data.selector ? String(data.selector) : null;
      schedulePostActiveCommentTarget();
    }
  });
  document.addEventListener('mouseover', function(ev){
    if (!commentEnabled || mode !== 'picker') return;
    var result = closestTarget(ev);
    if (!result) return;
    var payload = targetFrom(result.target, true);
    if (!payload || payload.elementId === hoveredId) return;
    hoveredId = payload.elementId;
    window.parent.postMessage(Object.assign({}, payload, { type: 'od:comment-hover' }), '*');
  }, true);
  document.addEventListener('mouseout', function(ev){
    if (!commentEnabled || mode !== 'picker') return;
    var result = closestTarget(ev);
    if (!result) return;
    var next = ev.relatedTarget;
    while (next && next !== document.documentElement) {
      if (next === result.target) return;
      next = next.parentElement;
    }
    hoveredId = null;
    window.parent.postMessage({ type: 'od:comment-leave' }, '*');
  }, true);
  // Keep same-project HTML navigation in the workspace even on the canonical
  // URL transport. Otherwise leaving Manual Edit makes a link replace the
  // iframe document while the workspace tab still points at the old file.
  document.addEventListener('click', function(ev){
    if (commentEnabled || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var origin = ev.target;
    var link = origin && origin.closest ? origin.closest('a[href]') : null;
    var destination = previewHtmlFileForLink(link);
    if (!destination) return;
    ev.preventDefault();
    window.parent.postMessage({
      type: 'od:preview-open-file',
      fileName: destination.fileName,
      search: destination.search,
      hash: destination.hash
    }, '*');
  }, true);
  document.addEventListener('click', function(ev){
    if (!commentEnabled || mode !== 'picker') return;
    var result = closestTarget(ev);
    if (result) {
      ev.preventDefault();
      ev.stopPropagation();
      var payload = targetFrom(result.target, true, result.clicked, { x: ev.clientX, y: ev.clientY });
      if (payload) {
        activeCommentElementId = payload.elementId || activeCommentElementId;
        activeCommentSelector = payload.selector || activeCommentSelector;
        window.parent.postMessage(payload, '*');
      }
      return;
    }
    var t = ev.target;
    var walk = t && t.nodeType === 1 ? t : null;
    while (walk && walk !== document.documentElement) {
      var tag = walk.tagName;
      if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'LABEL') return;
      if (walk.isContentEditable) return;
      walk = walk.parentElement;
    }
    ev.preventDefault();
    ev.stopPropagation();
    var pinX = Math.round(ev.clientX);
    var pinY = Math.round(ev.clientY);
    var pinId = 'pin-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
    window.parent.postMessage({
      type: 'od:comment-target',
      elementId: pinId,
      selector: '[data-od-pin="' + pinId + '"]',
      label: 'pin',
      text: '',
      position: { x: pinX - 12, y: pinY - 12, width: 24, height: 24 },
      hoverPoint: { x: pinX, y: pinY },
      htmlHint: '',
      style: null,
      freePin: true
    }, '*');
  }, true);
  document.addEventListener('pointerdown', function(ev){
    if (!commentEnabled || mode !== 'pod' || ev.button !== 0) return;
    drawing = true;
    stroke = [relativePoint(ev)];
    ev.preventDefault();
    ev.stopPropagation();
    postStroke('od:pod-stroke');
  }, true);
  document.addEventListener('pointermove', function(ev){
    if (!drawing || mode !== 'pod') return;
    var point = relativePoint(ev);
    var last = stroke[stroke.length - 1];
    if (last && Math.hypot(last.x - point.x, last.y - point.y) < 4) return;
    stroke.push(point);
    ev.preventDefault();
    ev.stopPropagation();
    schedulePostStroke();
  }, true);
  function finishStroke(ev){
    if (!drawing || mode !== 'pod') return;
    drawing = false;
    if (strokeFrame !== null) { cancelAnimationFrame(strokeFrame); strokeFrame = null; }
    if (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    postStroke('od:pod-select');
  }
  document.addEventListener('pointerup', finishStroke, true);
  document.addEventListener('pointercancel', finishStroke, true);
  window.addEventListener('resize', schedulePostTargets);
  document.addEventListener('scroll', function(){
    schedulePostActiveCommentTarget();
    schedulePostTargets();
  }, true);
  var mo = new MutationObserver(schedulePostTargets);
  mo.observe(document.documentElement, { subtree: true, childList: true });
  ensureStyle();
  postReady();
})();
</script>`;

const URL_PREVIEW_SNAPSHOT_BRIDGE = `<script data-od-url-snapshot-bridge>
(function(){
  if (window.__odUrlSnapshotBridge) return;
  window.__odUrlSnapshotBridge = true;
  var SNAPSHOT_STYLE_PROPS = [
    'display','position','box-sizing','width','height','min-width','max-width','min-height','max-height',
    'margin','margin-top','margin-right','margin-bottom','margin-left',
    'padding','padding-top','padding-right','padding-bottom','padding-left',
    'border','border-top','border-right','border-bottom','border-left','border-radius',
    'font','font-family','font-size','font-weight','font-style','line-height','letter-spacing',
    'color','background-color','opacity','transform','transform-origin','overflow','overflow-x','overflow-y',
    'white-space','text-align','vertical-align','object-fit','object-position',
    'flex','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis',
    'grid','grid-template-columns','grid-template-rows','grid-column','grid-row',
    'gap','row-gap','column-gap','align-items','align-content','align-self',
    'justify-items','justify-content','justify-self','inset','top','right','bottom','left',
    'z-index','box-shadow','text-shadow'
  ];
  function copyComputedStyle(source, target){
    if (!source || !target || source.nodeType !== 1 || target.nodeType !== 1) return;
    var computed = window.getComputedStyle(source);
    var style = target.getAttribute('style') || '';
    for (var i = 0; i < SNAPSHOT_STYLE_PROPS.length; i++){
      var prop = SNAPSHOT_STYLE_PROPS[i];
      var value = computed.getPropertyValue(prop);
      if (value) style += prop + ':' + value + ';';
    }
    target.setAttribute('style', style);
  }
  function syncElementState(source, target){
    var tag = source.tagName ? source.tagName.toLowerCase() : '';
    if (tag === 'img' && source.currentSrc) target.setAttribute('src', source.currentSrc);
    if (tag === 'input' || tag === 'textarea') target.setAttribute('value', source.value || '');
    if (tag === 'canvas') {
      try {
        var img = document.createElement('img');
        img.setAttribute('src', source.toDataURL('image/png'));
        img.setAttribute('style', target.getAttribute('style') || '');
        target.parentNode && target.parentNode.replaceChild(img, target);
      } catch (_) {}
    }
  }
  function inlineSnapshotStyles(originalRoot, cloneRoot){
    copyComputedStyle(originalRoot, cloneRoot);
    syncElementState(originalRoot, cloneRoot);
    var originals = originalRoot.querySelectorAll('*');
    var clones = cloneRoot.querySelectorAll('*');
    var count = Math.min(originals.length, clones.length, 3500);
    for (var i = 0; i < count; i++){
      copyComputedStyle(originals[i], clones[i]);
      syncElementState(originals[i], clones[i]);
    }
    var scripts = cloneRoot.querySelectorAll('script');
    for (var s = scripts.length - 1; s >= 0; s--) scripts[s].remove();
    var links = cloneRoot.querySelectorAll('link[rel~="stylesheet"], link[rel~="preload"], link[rel~="preconnect"]');
    for (var l = links.length - 1; l >= 0; l--) links[l].remove();
    var styles = cloneRoot.querySelectorAll('style');
    for (var st = 0; st < styles.length; st++) {
      styles[st].textContent = (styles[st].textContent || '')
        .replace(/@import[^;]+;/gi, '')
        .replace(/@font-face\\s*\\{[^}]*\\}/gi, '');
    }
  }
  function pruneHiddenSnapshotNodes(originalRoot, cloneRoot){
    var originals = originalRoot.querySelectorAll('*');
    var clones = cloneRoot.querySelectorAll('*');
    var count = Math.min(originals.length, clones.length);
    var removals = [];
    for (var i = 0; i < count; i++){
      var original = originals[i];
      var clone = clones[i];
      if (!original || !clone || !clone.parentNode) continue;
      var computed = window.getComputedStyle(original);
      if (computed && (computed.display === 'none' || computed.visibility === 'hidden')) removals.push(clone);
    }
    for (var r = removals.length - 1; r >= 0; r--) {
      if (removals[r].parentNode) removals[r].parentNode.removeChild(removals[r]);
    }
  }
  function waitForImages(){
    var imgs = Array.prototype.slice.call(document.images || []);
    return Promise.all(imgs.map(function(img){
      if (img.complete) return Promise.resolve();
      return new Promise(function(resolve){
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));
  }
  function scrollOffset(){
    var doc = document.documentElement;
    var body = document.body;
    return {
      x: Math.max(window.scrollX || 0, doc ? doc.scrollLeft || 0 : 0, body ? body.scrollLeft || 0 : 0),
      y: Math.max(window.scrollY || 0, doc ? doc.scrollTop || 0 : 0, body ? body.scrollTop || 0 : 0)
    };
  }
  function escapeAttribute(value){
    return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function snapshotBackgroundColor(){
    try {
      var probe = window.getComputedStyle(document.body || document.documentElement);
      var bg = probe && probe.backgroundColor || '';
      if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') return '#ffffff';
      return bg;
    } catch (_) { return '#ffffff'; }
  }
  function canvasLooksBlank(ctx, cw, ch){
    try {
      var data = ctx.getImageData(0, 0, cw, ch).data;
      var step = Math.max(4, Math.floor((cw * ch) / 4096)) * 4;
      var first = null, samples = 0;
      for (var i = 0; i + 3 < data.length; i += step){
        samples++;
        if (!first){ first = [data[i], data[i+1], data[i+2], data[i+3]]; continue; }
        if (Math.abs(data[i]-first[0]) > 6 || Math.abs(data[i+1]-first[1]) > 6 ||
            Math.abs(data[i+2]-first[2]) > 6 || Math.abs(data[i+3]-first[3]) > 6) return false;
      }
      return samples > 8;
    } catch (_) { return false; }
  }
  function renderSnapshot(id){
    var w = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
    var h = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
    var dpr = window.devicePixelRatio || 1;
    var bgColor = snapshotBackgroundColor();
    var docW = Math.max(w, document.documentElement.scrollWidth || 0, document.body ? document.body.scrollWidth : 0);
    var docH = Math.max(h, document.documentElement.scrollHeight || 0, document.body ? document.body.scrollHeight : 0);
    var clone = document.documentElement.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    inlineSnapshotStyles(document.documentElement, clone);
    pruneHiddenSnapshotNodes(document.documentElement, clone);
    var scroll = scrollOffset();
    var cloneBody = clone.querySelector('body');
    var rootStyle = clone.getAttribute('style') || '';
    var bodyStyle = cloneBody ? cloneBody.getAttribute('style') || '' : '';
    var bodyContent = cloneBody ? cloneBody.innerHTML : clone.innerHTML;
    var wrapperStyle = rootStyle + bodyStyle +
      'margin:0;position:relative;left:' + (-scroll.x) + 'px;top:' + (-scroll.y) + 'px;' +
      'width:' + docW + 'px;height:' + docH + 'px;overflow:visible;';
    var html = '<div xmlns="http://www.w3.org/1999/xhtml" style="' + escapeAttribute(wrapperStyle) + '">' + bodyContent + '</div>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<foreignObject x="0" y="0" width="' + docW + '" height="' + docH + '">' + html + '</foreignObject></svg>';
    var img = new Image();
    img.onload = function(){
      try {
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(w * dpr));
        canvas.height = Math.max(1, Math.floor(h * dpr));
        var ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.scale(dpr, dpr);
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        if (canvasLooksBlank(ctx, canvas.width, canvas.height)) {
          window.parent.postMessage({ type: 'od:snapshot:result', id: id, error: 'empty-render' }, '*');
          return;
        }
        window.parent.postMessage({ type: 'od:snapshot:result', id: id, dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height }, '*');
      } catch (err) {
        window.parent.postMessage({ type: 'od:snapshot:result', id: id, error: String(err && err.message || err) }, '*');
      }
    };
    img.onerror = function(){
      window.parent.postMessage({ type: 'od:snapshot:result', id: id, error: 'snapshot image failed' }, '*');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  window.addEventListener('message', function(ev){
    var data = ev && ev.data;
    if (!data || data.type !== 'od:snapshot' || !data.id) return;
    waitForImages().then(function(){ renderSnapshot(String(data.id)); });
  });
})();
</script>`;

function previewBridgeTokens(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(previewBridgeTokens);
  if (typeof value !== 'string') return [];
  return value.split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
}

function wantsUrlPreviewScrollBridge(value: unknown): boolean {
  return previewBridgeTokens(value).some((token) => token === 'scroll' || token === '1' || token === 'true');
}

function wantsUrlPreviewSelectionBridge(value: unknown): boolean {
  return previewBridgeTokens(value).some((token) => token === 'selection' || token === 'comment' || token === 'comments' || token === 'annotation');
}

function wantsUrlPreviewSnapshotBridge(value: unknown): boolean {
  return previewBridgeTokens(value).some((token) => token === 'snapshot' || token === 'image' || token === 'capture');
}

function wantsUrlPreviewObservabilityBridge(value: unknown): boolean {
  return previewBridgeTokens(value).some((token) => token === 'observability' || token === 'errors' || token === 'diagnostics');
}

function wantsUrlPreviewSandboxGuard(value: unknown): boolean {
  return previewBridgeTokens(value).some((token) => token === 'sandbox' || token === 'storage');
}

function wantsUrlPreviewFocusGuard(value: unknown): boolean {
  return previewBridgeTokens(value).some((token) => token === 'focus');
}

function wantsUrlPreviewRedirectGuard(value: unknown): boolean {
  return previewBridgeTokens(value).some((token) => token === 'redirect');
}

function injectBeforeBodyClose(html: string, marker: string, injection: string): string {
  if (html.includes(marker)) return html;
  const bodyCloseIndex = findRealTagOffset(html, /<\/body(?=[\t\n\f\r >])/i);
  if (bodyCloseIndex >= 0) {
    return `${html.slice(0, bodyCloseIndex)}${injection}${html.slice(bodyCloseIndex)}`;
  }
  // No boundary: appending is not a safe fallback, because the reason there is
  // no boundary is often that the document ends inside a construct that
  // swallows whatever follows — `<plaintext>` never leaves PLAINTEXT, an
  // unterminated comment or script runs to EOF. Appended markup would become
  // text there and the bridge would never run. Going in near the top instead
  // costs the "end of body" placement but keeps the bridge live.
  const headStart = findRealTagOffset(html, /<head(?=[\t\n\f\r />])/i);
  const headEnd = headStart >= 0 ? endOfTag(html, headStart) : -1;
  if (headEnd >= 0) return `${html.slice(0, headEnd + 1)}${injection}${html.slice(headEnd + 1)}`;
  const htmlStart = findRealTagOffset(html, /<html(?=[\t\n\f\r />])/i);
  const htmlEnd = htmlStart >= 0 ? endOfTag(html, htmlStart) : -1;
  if (htmlEnd >= 0) return `${html.slice(0, htmlEnd + 1)}<head>${injection}</head>${html.slice(htmlEnd + 1)}`;
  return prependAfterDoctype(html, injection);
}

function injectAfterHeadOpen(html: string, marker: string, injection: string): string {
  if (html.includes(marker)) return html;
  const headOpenIndex = findRealTagOffset(html, /<head(?=[\t\n\f\r />])/i);
  if (headOpenIndex >= 0) {
    const openTagEnd = endOfTag(html, headOpenIndex);
    if (openTagEnd >= 0) {
      return `${html.slice(0, openTagEnd + 1)}${injection}${html.slice(openTagEnd + 1)}`;
    }
  }
  const htmlOpenIndex = findRealTagOffset(html, /<html(?=[\t\n\f\r />])/i);
  if (htmlOpenIndex >= 0) {
    const openTagEnd = endOfTag(html, htmlOpenIndex);
    if (openTagEnd >= 0) {
      return `${html.slice(0, openTagEnd + 1)}<head>${injection}</head>${html.slice(openTagEnd + 1)}`;
    }
  }
  return prependAfterDoctype(html, injection);
}

function injectUrlPreviewBridge(
  html: string,
  bridge: 'scroll' | 'selection' | 'snapshot' | 'observability' | 'sandbox' | 'focus' | 'redirect',
): string {
  if (bridge === 'sandbox') {
    return injectAfterHeadOpen(html, 'data-od-sandbox-shim', buildPreviewSandboxShim());
  }
  if (bridge === 'focus') {
    return injectAfterHeadOpen(html, 'data-od-preview-focus-guard', buildPreviewFocusGuard());
  }
  if (bridge === 'redirect') {
    return injectAfterHeadOpen(
      html,
      'data-od-preview-redirect-guard',
      buildPreviewRedirectGuard({
        blockLoadTimeScriptRedirect: previewHtmlHasLoadTimeLocationNavigation(html),
      }),
    );
  }
  if (bridge === 'observability') {
    return injectAfterHeadOpen(
      html,
      PREVIEW_OBSERVABILITY_BRIDGE_MARKER,
      buildPreviewObservabilityBridge(),
    );
  }
  if (bridge === 'scroll') {
    return injectBeforeBodyClose(html, 'data-od-url-scroll-bridge', URL_PREVIEW_SCROLL_BRIDGE);
  }
  if (bridge === 'selection') {
    return injectBeforeBodyClose(html, 'data-od-url-selection-bridge', URL_PREVIEW_SELECTION_BRIDGE);
  }
  return injectBeforeBodyClose(html, 'data-od-url-snapshot-bridge', URL_PREVIEW_SNAPSHOT_BRIDGE);
}

function applyUrlPreviewBridgesToHtml(
  transformed: string | Buffer,
  mime: string,
  requestedBridge: unknown,
): string | Buffer {
  if (
    !(
      wantsUrlPreviewScrollBridge(requestedBridge) ||
      wantsUrlPreviewSelectionBridge(requestedBridge) ||
      wantsUrlPreviewSnapshotBridge(requestedBridge) ||
      wantsUrlPreviewObservabilityBridge(requestedBridge) ||
      wantsUrlPreviewSandboxGuard(requestedBridge) ||
      wantsUrlPreviewFocusGuard(requestedBridge) ||
      wantsUrlPreviewRedirectGuard(requestedBridge)
    ) ||
    !/^text\/html(?:;|$)/i.test(mime)
  ) {
    return transformed;
  }

  let html = Buffer.isBuffer(transformed) ? transformed.toString('utf8') : transformed;
  // Sanitize the <title> so Cmd+P -> "Save as PDF" produces a Teams-safe
  // filename. URL-load iframes cannot rely on the host rewriting the document
  // title after load, and powered previews are intentionally cross-origin.
  html = daemonSanitizeTitleInDoc(html);
  // Guards must run before authored scripts. injectAfterHeadOpen prepends at
  // the start of <head>; apply in reverse runtime order so the final document
  // executes sandbox -> redirect -> observability -> focus.
  if (wantsUrlPreviewFocusGuard(requestedBridge)) {
    html = injectUrlPreviewBridge(html, 'focus');
  }
  if (wantsUrlPreviewObservabilityBridge(requestedBridge)) {
    html = injectUrlPreviewBridge(html, 'observability');
  }
  if (wantsUrlPreviewRedirectGuard(requestedBridge)) {
    html = injectUrlPreviewBridge(html, 'redirect');
  }
  if (wantsUrlPreviewSandboxGuard(requestedBridge)) {
    html = injectUrlPreviewBridge(html, 'sandbox');
  }
  if (wantsUrlPreviewScrollBridge(requestedBridge)) {
    html = injectUrlPreviewBridge(html, 'scroll');
  }
  if (wantsUrlPreviewSelectionBridge(requestedBridge)) {
    html = injectUrlPreviewBridge(html, 'selection');
  }
  if (wantsUrlPreviewSnapshotBridge(requestedBridge)) {
    html = injectUrlPreviewBridge(html, 'snapshot');
  }
  return html;
}

// ---------------------------------------------------------------------------
// Teams-safe title sanitization for the URL-load preview path (issue #3918).
//
// When a user prints an HTML preview via Cmd+P → "Save as PDF", Chromium uses
// the iframe's document <title> as the default filename. The URL-load iframe
// uses sandbox="allow-scripts allow-downloads" (no allow-same-origin), so the
// host page cannot access contentDocument to rewrite the title after load.
// Instead we rewrite it here, in the daemon response, before the browser
// parses the document. The web srcDoc path has its own sanitizeTitleInDoc in
// apps/web/src/runtime/srcdoc.ts — keep the two in sync when the logic changes.
// ---------------------------------------------------------------------------

/** Named non-ASCII entities common in business/design document titles. */
const DAEMON_NAMED_ENTITY_MAP: Record<string, string> = {
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å',
  aelig: 'æ', ccedil: 'ç',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
  igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  eth: 'ð', ntilde: 'ñ',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü',
  yacute: 'ý', thorn: 'þ', yuml: 'ÿ',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å',
  AElig: 'Æ', Ccedil: 'Ç',
  Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë',
  Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï',
  ETH: 'Ð', Ntilde: 'Ñ',
  Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü',
  Yacute: 'Ý', THORN: 'Þ',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', hellip: '…', trade: '™', reg: '®',
  copy: '©', deg: '°', euro: '€', pound: '£', yen: '¥',
};

function daemonSafeFromCodePoint(cp: number): string {
  if (cp < 0 || cp > 0x10ffff) return '�';
  return String.fromCodePoint(cp);
}

function daemonDecodeHtmlEntitiesForTitle(encoded: string): string {
  return encoded
    .replace(/&([A-Za-z]+);/g, (match: string, name: string) => DAEMON_NAMED_ENTITY_MAP[name] ?? match)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_: string, n: string) => daemonSafeFromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_: string, h: string) => daemonSafeFromCodePoint(parseInt(h, 16)));
}

function daemonSanitizePreviewTitle(text: string): string {
  // Trim first so that leading whitespace cannot hide a ~$ prefix from the
  // anchor-based check below (e.g. "  ~$Invoice" would otherwise survive).
  let result = text.trim();
  // Remove every leading ~$ prefix. A single replace(/^~\$/, '') is not
  // enough when the prefix is doubled ("~$~$Doc"). Loop until stable, then
  // re-trim in case a space followed the prefix ("~$ Invoice" → " Invoice").
  let prev: string;
  do {
    prev = result;
    result = result.replace(/^~\$/, '').trim();
  } while (result !== prev);
  // Replace each disallowed character (or run of them) with a single hyphen.
  // Character class: : # % & * { } \ < > ? / + | "
  // eslint-disable-next-line no-useless-escape
  result = result.replace(/[:#%&*{}\\<>?/+|"]+/g, '-');
  // Final trim to remove any spaces exposed by the substitution.
  return result.trim();
}

/**
 * Find the offset of the first real `<title>` tag in html[0..searchLimit)
 * that is not inside an HTML comment or a `<script>`/`<style>` block.
 * Returns -1 if no real title is found.
 */
function daemonFindRealTitleOffset(html: string, searchLimit: number): number {
  let i = 0;
  const limit = Math.min(html.length, searchLimit);
  while (i < limit) {
    if (html.charCodeAt(i) === 60 /* < */ && html.slice(i, i + 4) === '<!--') {
      const end = html.indexOf('-->', i + 4);
      if (end < 0) return -1;
      i = end + 3;
      continue;
    }
    if (html.charCodeAt(i) === 60 /* < */) {
      const tagMatch = /^<(script|style)\b/i.exec(html.slice(i, i + 20));
      if (tagMatch) {
        const closingTag = `</${tagMatch[1]}`;
        const end = html.toLowerCase().indexOf(closingTag.toLowerCase(), i + tagMatch[0].length);
        if (end < 0) return -1;
        const closeEnd = html.indexOf('>', end);
        i = closeEnd >= 0 ? closeEnd + 1 : end + closingTag.length;
        continue;
      }
    }
    if (html.charCodeAt(i) === 60 /* < */) {
      if (/^<title[\s>]/i.test(html.slice(i, i + 8))) return i;
    }
    i++;
  }
  return -1;
}

/**
 * Rewrite the `<title>` in html so the resulting PDF filename is Teams-safe.
 * Only the real `<head>` title is changed; `<title>` inside comments or script
 * blocks is left untouched. Mirrors sanitizeTitleInDoc in srcdoc.ts.
 *
 * Exported for unit testing; not part of the public API surface.
 */
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

export function daemonSanitizeTitleInDoc(html: string): string {
  // Only the head's own <title> names the document; an <svg><title> in the body
  // is an accessible label for that graphic. Both boundaries are located
  // structurally, so a `</head>` or `<body>` an author wrote into a script
  // string cannot move the limit.
  const headClose = findRealTagOffset(html, HTML_TAG_PATTERNS.headClose);
  const bodyOpen = findRealTagOffset(html, HTML_TAG_PATTERNS.bodyOpen);
  const searchLimit = headClose >= 0 ? headClose : bodyOpen >= 0 ? bodyOpen : html.length;

  // Both ends of the element by the parser's rules: the open tag through
  // `endOfTag`, so a `>` inside a quoted attribute cannot cut it short, and the
  // close by the raw-text rule, so `</title >` closes it while `</title-page>`
  // does not. A plain `indexOf('</title>')` accepted only one spelling.
  const range = findRealElementRange(html, HTML_TAG_PATTERNS.titleOpen, 'title');
  if (!range || range.start >= searchLimit) return html;

  const titleStart = range.start;
  const closingTagEnd = range.end - 1;
  const openTag = html.slice(range.start, range.contentStart);
  const rawContent = html.slice(range.contentStart, range.contentEnd);
  const closeTag = html.slice(range.contentEnd, range.end);

  const decoded = daemonDecodeHtmlEntitiesForTitle(rawContent);
  const safe = daemonSanitizePreviewTitle(decoded);

  return html.slice(0, titleStart) + openTag + safe + closeTag + html.slice(closingTagEnd + 1);
}

function normalizeChatSessionMode(value: unknown): ChatSessionMode {
  return value === 'chat' || value === 'plan' ? value : 'design';
}

function isDesignSystemLikeProject(project: any): boolean {
  const metadata = project?.metadata;
  if (!metadata || typeof metadata !== 'object') return false;
  return (
    metadata.kind === 'brand' ||
    metadata.importedFrom === 'design-system' ||
    metadata.importedFrom === 'brand-extraction' ||
    (typeof metadata.brandDesignSystemId === 'string' && metadata.brandDesignSystemId.trim().length > 0)
  );
}

function normalizeDesignSystemCopyName(value: unknown, sourceProject: any): string {
  const explicit = typeof value === 'string' ? value.trim() : '';
  if (explicit) return explicit.slice(0, 160);
  const sourceName = typeof sourceProject?.name === 'string' && sourceProject.name.trim()
    ? sourceProject.name.trim()
    : 'Untitled';
  return /\bdesign system\b/i.test(sourceName)
    ? sourceName.slice(0, 160)
    : `${sourceName} Design System`.slice(0, 160);
}

function normalizeProjectDuplicateName(value: unknown, sourceProject: any): string {
  const explicit = typeof value === 'string' ? value.trim() : '';
  if (explicit) return explicit.slice(0, 160);
  const sourceName = typeof sourceProject?.name === 'string' && sourceProject.name.trim()
    ? sourceProject.name.trim()
    : 'Untitled';
  return `${sourceName} Copy`.slice(0, 160);
}

function normalizePendingPrompt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cloneProjectMetadataForDuplicate(sourceProject: any): Record<string, unknown> {
  const sourceMetadata =
    sourceProject?.metadata && typeof sourceProject.metadata === 'object'
      ? { ...sourceProject.metadata }
      : {};
  delete sourceMetadata.baseDir;
  delete sourceMetadata.projectLocationId;
  delete sourceMetadata.fromTrustedPicker;
  delete sourceMetadata.orchestratorWorkspace;
  return {
    ...sourceMetadata,
    sourceProjectId: sourceProject.id,
    sourceProjectName: sourceProject.name,
  };
}

function buildDesignSystemCopySourceContext(input: {
  sourceProject: any;
  targetProjectId: string;
  designSystemId: string;
  copiedFiles: string[];
  skippedFiles: Array<{ name: string; reason: string }>;
}): string {
  const metadata =
    input.sourceProject?.metadata && typeof input.sourceProject.metadata === 'object'
      ? JSON.stringify(input.sourceProject.metadata, null, 2)
      : '{}';
  const copied = input.copiedFiles.length > 0
    ? input.copiedFiles.map((name) => `- ${name}`).join('\n')
    : '- (none)';
  const skipped = input.skippedFiles.length > 0
    ? input.skippedFiles.map((entry) => `- ${entry.name}: ${entry.reason}`).join('\n')
    : '- (none)';
  return [
    '# Source Project Context',
    '',
    'This design-system workspace was created from an existing OpenDesign project. Treat the copied project files as the primary source evidence for the generated design system.',
    '',
    '## Source project',
    '',
    `- Source project id: ${input.sourceProject.id}`,
    `- Source project name: ${input.sourceProject.name}`,
    `- New design-system project id: ${input.targetProjectId}`,
    `- New design-system id: ${input.designSystemId}`,
    `- Source skill id: ${input.sourceProject.skillId ?? '(none)'}`,
    `- Source design system id: ${input.sourceProject.designSystemId ?? '(none)'}`,
    '',
    '## Source metadata',
    '',
    '```json',
    metadata,
    '```',
    '',
    '## Copied files',
    '',
    copied,
    '',
    '## Skipped files',
    '',
    skipped,
    '',
    '## Generation contract',
    '',
    '- Read this file before editing design-system outputs.',
    '- Read the copied files directly from the project workspace; they are source evidence, not generated design-system output.',
    '- Preserve high-signal assets, source examples, UI surfaces, copy, tokens, typography, and interaction patterns from the copied project.',
    '- Generate a reusable OpenDesign design-system package in this same project: DESIGN.md, README.md, SKILL.md, colors_and_type.css, context/provenance, focused preview cards, preserved assets/build/fonts when available, and ui_kits/app/.',
    '- Before final response, run `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings` and fix every actionable issue.',
    '',
  ].join('\n');
}

function buildDesignSystemCopyPendingPrompt(input: {
  sourceProject: any;
  targetProjectId: string;
  designSystemId: string;
  copiedFiles: string[];
}): string {
  const metadata =
    input.sourceProject?.metadata && typeof input.sourceProject.metadata === 'object'
      ? JSON.stringify(input.sourceProject.metadata, null, 2)
      : '{}';
  const visibleFiles = input.copiedFiles
    .slice(0, 140)
    .map((name) => `  - ${name}`);
  return [
    'Create this project as a complete OpenDesign design system workspace.',
    '',
    'Autonomy requirement:',
    '- Do not ask setup or clarification questions during design-system generation.',
    '- Do not emit `<question-form>`, "Quick brief — 30 seconds", direction cards, choice cards, or any UI that waits for user input.',
    '- The source project already contains the evidence. Choose sensible defaults where details are missing and begin generating the design-system artifacts immediately.',
    '',
    'Source project handoff:',
    `- Source project id: ${input.sourceProject.id}`,
    `- Source project name: ${input.sourceProject.name}`,
    `- New design-system project id: ${input.targetProjectId}`,
    `- New design-system id: ${input.designSystemId}`,
    '- Read `context/source-context.md` first. It lists the copied project files and original project metadata.',
    '- Treat every copied file, uploaded asset, reference image, browser snapshot, sketch, generated artifact, and context note in this workspace as design-system evidence.',
    '- Use the copied project outputs to infer real visual language, components, layout, interaction patterns, copy tone, tokens, typography, spacing, assets, and anti-patterns.',
    '- Do not create another project or another design-system id. Update this new design-system project in place.',
    '',
    'Source project metadata:',
    '```json',
    metadata,
    '```',
    '',
    'Copied files to inspect:',
    ...(visibleFiles.length > 0 ? visibleFiles : ['  - (none copied; rely on context/source-context.md and project metadata)']),
    input.copiedFiles.length > visibleFiles.length
      ? `  - ...and ${input.copiedFiles.length - visibleFiles.length} more files listed in context/source-context.md`
      : '',
    '',
    'Expected output:',
    '- A clear `DESIGN.md` with product context, visual foundations, color, type, spacing, layout, components, motion, voice, and anti-patterns.',
    '- A reusable package: `README.md`, `SKILL.md`, `colors_and_type.css`, provenance notes, `assets/`, `build/` when runtime icons exist, optional `fonts/`, focused `preview/` cards, preserved source examples, and `ui_kits/app/`.',
    '- Preserve real source assets when evidence provides them: logos, app icons, tray icons, avatars, wordmarks, imagery, and font files belong in `assets/`, `build/`, or `fonts/`, not only in prose.',
    '- Preserve high-signal source/component examples outside `context/` when copied files include substantial implementation or artifact code. Do not replace them with tiny stubs.',
    '- Split review previews into focused cards for colors, typography, spacing, radius/shadows, components, brand assets, and applied UI surfaces. Preview cards must visibly load preserved files when available.',
    '- Build `ui_kits/app/` as an applied interface kit that reflects the source project, with an index page and component files when the evidence supports them. Do not leave it as a generic static mock.',
    '- Keep `README.md`, `SKILL.md`, `DESIGN.md`, preview manifest text, and `ui_kits/app/README.md` synchronized with the final file structure.',
    '',
    'Completion gate:',
    '- Finish only after the project contains reviewable design-system artifacts and the right-side Design System tab can inspect them.',
    '- Before your final response, run `"$OD_NODE_BIN" "$OD_BIN" tools connectors design-system-package-audit --path . --fail-on-warnings`.',
    '- Fix every audit error and design-quality warning. If an issue cannot be fixed because source evidence is missing, explain that blocker instead of claiming the design system is ready.',
    '',
    'When finished, summarize the generated files and name the first previews reviewers should inspect.',
  ].filter(Boolean).join('\n');
}

export function registerProjectRoutes(app: Express, ctx: RegisterProjectRoutesDeps) {
  const { db, design } = ctx;
  const projectTelemetry = ctx.telemetry;
  const { sendApiError, createSseResponse } = ctx.http;
  const { DESIGN_SYSTEMS_DIR, PROJECTS_DIR, SKILLS_DIR, BRANDS_DIR, USER_DESIGN_SYSTEMS_DIR } = ctx.paths;
  const { readAppConfig, writeAppConfig } = ctx.appConfig;
  const {
    insertProject,
    validateLinkedDirs,
    getProject,
    updateProject,
    dbDeleteProject,
    removeProjectDir,
    stageProjectDirsForDelete,
    ensureWorkspaceProject,
    getWorkspaceProject,
    getWorkspaceProjectByProjectId,
    listWorkspaceProjects,
    updateWorkspaceProject,
    rebindWorkspaceProject,
    deleteWorkspaceProject,
    countWorkspaceProjectRefs,
  } = ctx.projectStore;
  const { writeProjectFile, readProjectFile, ensureProject, listFiles, listTabs, setTabs, resolveProjectDir } = ctx.projectFiles;
  const { insertConversation } = ctx.conversations;
  const { getTemplate, listTemplates, deleteTemplate, insertTemplate, findTemplateByNameAndProject, updateTemplate } = ctx.templates;
  const { listLatestProjectRunStatuses, listProjectsAwaitingInput, normalizeProjectDisplayStatus, composeProjectDisplayStatus, listProjects, listUnboundProjects } = ctx.status;
  const { subscribeFileEvents, activeProjectEventSinks } = ctx.events;
  const { randomId } = ctx.ids;
  const { validateProjectDesignSystemId, validateProjectSkillId } = ctx.validation;
  const { collabSync, teamProjectCatalog, workspaceTypes } = ctx;
  const learnAssertedWorkspaceType = (context: WorkspaceResourceContext | null) => {
    if (!context?.workspaceTypeAsserted) return;
    workspaceTypes?.learn({
      workspaceId: context.workspaceId,
      workspaceType: context.workspaceTypeAsserted,
    });
  };
  const verifyWorkspaceProjectReadAuthority =
    ctx.verifyWorkspaceReadAuthority ?? ctx.verifyWorkspaceRequestAuthority;
  const authorizeProjectRequest =
    ctx.authorizeProjectRequest ??
    createAuthorizeProjectRequest({
      db,
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
      isProjectRevoked: (_db, projectId) =>
        ctx.isProjectRevoked?.(projectId) ?? false,
      isProjectUnmaterializedPlaceholder: (_db, projectId) =>
        ctx.isProjectUnmaterializedPlaceholder?.(projectId) ?? false,
      ...(ctx.verifyWorkspaceRequestAuthority
        ? { verifyWorkspaceRequestAuthority: ctx.verifyWorkspaceRequestAuthority }
        : {}),
      sendApiError,
    });
  const enforceWorkspaceProjectMutation = createEnforceWorkspaceProjectMutation(
    ctx.verifyWorkspaceRequestAuthority,
    ctx.verifyPersonalProjectDeleteLeaseAuthority,
    authorizeProjectRequest,
  );
  async function verifiedWorkspaceProjectContext(
    req: any,
  ): Promise<WorkspaceProjectContext | null> {
    if (!ctx.verifyWorkspaceRequestAuthority) return null;
    const verified = await ctx.verifyWorkspaceRequestAuthority(req);
    return verified.ok ? workspaceResourceContextFromVerified(verified.context) : null;
  }
  // Duplicate/import paths use the same optional local attribution as ordinary
  // project creation. Cloud authority is checked only when a later operation
  // actually shares, syncs, or publishes the project.
  const resolveCreatedProjectHomeWithLocalAttribution = createCreatedProjectWorkspaceResolver({
    ...(ctx.fetchProjectCreationWorkspaceDirectory
      ? { fetchWorkspaceDirectory: ctx.fetchProjectCreationWorkspaceDirectory }
      : {}),
    ...(ctx.configuredEnv ? { configuredEnv: ctx.configuredEnv } : {}),
  });
  const resolveCreatedProjectHome: CreatedProjectWorkspaceResolver = async (req) => {
    const home = await resolveCreatedProjectHomeWithLocalAttribution(req);
    learnAssertedWorkspaceType(home);
    return home;
  };
  function sendMissingWorkspaceContext(res: Response) {
    return sendApiError(res, 401, 'WORKSPACE_CONTEXT_REQUIRED', 'workspace context is required');
  }
  async function authoritativeWorkspaceProjectContext(
    req: any,
    res: Response,
    expectedWorkspaceId: string,
    verifyAuthority = ctx.verifyWorkspaceRequestAuthority,
  ): Promise<WorkspaceProjectContext | null> {
    if (!verifyAuthority) {
      const legacy = workspaceProjectContext(req, expectedWorkspaceId);
      if (!legacy) sendMissingWorkspaceContext(res);
      return legacy;
    }
    const verified = await verifyAuthority(req);
    if (!verified.ok) {
      sendApiError(res, verified.status, verified.code, verified.message);
      return null;
    }
    if (verified.context.workspaceId !== expectedWorkspaceId) {
      sendApiError(
        res,
        403,
        'WORKSPACE_ACCESS_DENIED',
        'the requested workspace does not match the route workspace',
      );
      return null;
    }
    return workspaceResourceContextFromVerified(verified.context);
  }
  /**
   * Refuse — loudly — to record a team share in a workspace that cannot host
   * one. Loudly is the point: the impossible rows this prevents are invisible
   * locally and only surface as `403 missing_principal` on every later collab
   * call, which is how one shipped and survived in a dogfood user's daemon.
   */
  function sendTeamShareScopeRefused(
    res: Response,
    ctx: WorkspaceProjectContext,
    reason: TeamShareScopeRefusal,
  ) {
    console.warn(
      `[od] refused a team share into workspace ${ctx.workspaceId} (${reason}): ` +
        'a team share requires a team workspace; a personal workspace has no team plane.',
    );
    return sendApiError(
      res,
      409,
      'WORKSPACE_TEAM_SHARE_REQUIRES_TEAM_WORKSPACE',
      'a project can only be shared to a team from a team workspace',
    );
  }
  function pendingSyncIntent(projectId: string, workspaceId: string, visibility: 'personal' | 'team') {
    return {
      event: visibility === 'team' ? 'project_team_share_requested' : 'project_team_unshare_requested',
      projectId,
      workspaceId,
    };
  }
  class TeamProjectCatalogListError extends Error {
    constructor(readonly cause: unknown) {
      super('team project catalog list failed');
      this.name = 'TeamProjectCatalogListError';
    }
  }
  class TeamProjectSyncError extends Error {
    constructor(readonly cause: unknown) {
      super(String(cause));
      this.name = 'TeamProjectSyncError';
    }
  }
  function normalizeWorkspaceProjectRow(row: any, ctx: WorkspaceProjectContext) {
    let metadata: unknown;
    try {
      metadata = row.metadataJson ? JSON.parse(row.metadataJson) : undefined;
    } catch {
      metadata = undefined;
    }
    // A move/rename/share-visibility change touches only the workspace_projects
    // row, not the project's own content (projects.updated_at) — but it is real,
    // recent activity on this project from the user's point of view. Report the
    // later of the two so the "最近更新" label matches the sort order above
    // (ORDER BY MAX(p.updated_at, wp.updated_at)), instead of a card that jumps
    // to the top of the list while still showing a stale "18 hours ago".
    const lastActivityAt = Math.max(row.updatedAt, row.workspaceUpdatedAt ?? 0);
    const project = {
      id: row.id,
      name: row.name,
      skillId: row.skillId,
      designSystemId: row.designSystemId,
      pendingPrompt: row.pendingPrompt ?? undefined,
      metadata,
      appliedPluginSnapshotId: row.appliedPluginSnapshotId ?? undefined,
      customInstructions: row.customInstructions ?? undefined,
      createdAt: row.createdAt,
      updatedAt: lastActivityAt,
      // Carried on the nested project too, so a client that unwraps the summary
      // into a plain Project keeps the binding instead of dropping it.
      workspaceId: row.workspaceId ?? null,
    };
    const resourceState = isWorkspaceLocked(ctx) && row.workspaceVisibility === 'team'
      ? 'frozen'
      : row.resourceState;
    const wp = {
      visibility: row.workspaceVisibility,
      resourceState,
      createdByWorkspaceMemberId: row.createdByWorkspaceMemberId ?? null,
    };
    return {
      id: project.id,
      name: project.name,
      workspaceId: row.workspaceId,
      visibility: row.workspaceVisibility,
      resourceState,
      createdByWorkspaceMemberId: row.createdByWorkspaceMemberId ?? null,
      updatedByWorkspaceMemberId: row.updatedByWorkspaceMemberId ?? null,
      resourceHubResourceId: row.resourceHubResourceId ?? null,
      cloudTombstonedAt: row.cloudTombstonedAt ?? null,
      currentUserAccess: projectAccess(wp, ctx, workspaceTypes),
      syncState: row.syncState ?? 'local_only',
      ...(row.syncState === 'pending_upload'
        ? { pendingSyncIntent: pendingSyncIntent(project.id, row.workspaceId, row.workspaceVisibility) }
        : {}),
      createdAt: row.createdAt,
      updatedAt: lastActivityAt,
      metadata,
      project,
    };
  }
  function workspaceProjectPrincipal(ctx: WorkspaceProjectContext): ResourceHubPrincipal {
    return {
      memberId: ctx.workspaceMemberId,
      teamId: ctx.workspaceId,
      role: ctx.role,
      lifecycleState: ctx.lifecycleState,
    };
  }
  function msFromIso(value: string): number {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }
  function accessForRemoteTeamProject(remote: VelaTeamProjectRecord, ctx: WorkspaceProjectContext) {
    const frozen = remote.access.frozen || isWorkspaceLocked(ctx);
    const canView = remote.access.canView && !frozen && ctx.memberStatus === 'active';
    // `remote.access.canEdit` alone is not enough to grant local mutation: it
    // can be true for reasons that do not make THIS member the owner (a team
    // admin's blanket edit grant, a generic per-project flag, etc.), and
    // treating "can view something I don't own yet" as "adopt it and make it
    // mine" is exactly the ownership-invention the adoption red line above
    // forbids — a member discovering a teammate's shared project must stay
    // read-only regardless of canEdit. Require this member to BE the project's
    // owner too; only then is honoring canEdit "this member's own project,
    // whose local row is stale" rather than "assign ownership to a reader".
    const isOwner = remote.ownerMemberId === ctx.workspaceMemberId;
    const canMutate = canView && remote.access.canEdit && isOwner;
    const disabledReason = frozen
      ? isWorkspaceLocked(ctx)
        ? 'workspace_locked'
        : 'resource_frozen'
      : canView
        ? undefined
        : 'permission_denied';
    return {
      canOpen: canView,
      canRename: canMutate,
      canDelete: canMutate,
      canDuplicate: canMutate,
      canMoveToTeam: false,
      canMoveToPersonal: false,
      canExport: canView,
      canSendTo: canView,
      canRestoreVersion: canMutate,
      ...(disabledReason ? { disabledReason } : {}),
    };
  }
  function remoteTeamProjectSummary(
    remote: VelaTeamProjectRecord,
    ctx: WorkspaceProjectContext,
  ) {
    const createdAt = msFromIso(remote.createdAt);
    const updatedAt = msFromIso(remote.updatedAt);
    const syncState: ProjectSyncState = velaProjectSyncStateToProject(remote.syncState);
    const resourceState = remote.access.frozen || isWorkspaceLocked(ctx) ? 'frozen' : 'active';
    const name = remote.displayName?.trim() || remote.projectId;
    // A catalog-only summary has no local project directory yet. Reuse the
    // existing placeholder metadata contract so clients do not issue local
    // file/cover reads that can only 404 before the first explicit pull. The
    // materialized local row replaces this projection (and clears the stamp)
    // once real hub content lands.
    const metadata = { sharedProjectPlaceholderAt: updatedAt };
    const project = {
      id: remote.projectId,
      name,
      workspaceId: ctx.workspaceId,
      skillId: null,
      designSystemId: null,
      metadata,
      createdAt,
      updatedAt,
    };
    return {
      // Summary identity is the resource-hub id so two catalog entries that
      // share the same projectId stay distinct in the list (unique React key /
      // owner-scoped lookup by resource id). The web opens the card via the
      // nested `project.id` below, so the real projectId is preserved there.
      id: remote.resourceId,
      name,
      workspaceId: ctx.workspaceId,
      visibility: 'team',
      resourceState,
      createdByWorkspaceMemberId: remote.ownerMemberId,
      updatedByWorkspaceMemberId: remote.ownerMemberId,
      resourceHubResourceId: remote.resourceId,
      cloudTombstonedAt: null,
      currentUserAccess: accessForRemoteTeamProject(remote, ctx),
      syncState,
      createdAt,
      updatedAt,
      metadata,
      project,
    };
  }
  /**
   * Catalog identities this member has just moved back to "personal".
   *
   * A move to personal deletes the hub catalog row inside the same request,
   * but the team catalog is read through a stale-while-revalidate cache, so
   * the very next list can still carry the row that was just removed. The
   * move also nulls `resourceHubResourceId`, which is the key
   * `listRemoteTeamProjectSummaries` dedupes on — so without this gate the
   * stale row is re-materialised as a `visibility: 'team'` card and the
   * project silently un-unshares itself. Worse, a remote summary is never
   * `canMoveToPersonal`, so the user cannot undo it.
   *
   * `cloudTombstonedAt` is the local truth for "this member unshared it", and
   * a re-share clears it (see `workspaceProjectMovePatch`). Scoping by owner
   * keeps a teammate's own share of the same project id visible.
   */
  function locallyTombstonedTeamProjects(localRows: any[], ctx: WorkspaceProjectContext) {
    const projectIds = new Set<string>();
    const resourceIds = new Set<string>();
    for (const row of localRows) {
      if (row.workspaceVisibility !== 'personal' || row.cloudTombstonedAt == null) continue;
      projectIds.add(row.id);
      resourceIds.add(projectResourceIdFor(row.id, workspaceProjectPrincipal(ctx)));
    }
    return { projectIds, resourceIds };
  }
  function remoteTeamProjectWasUnsharedLocally(
    remote: VelaTeamProjectRecord,
    tombstoned: { projectIds: Set<string>; resourceIds: Set<string> },
    ctx: WorkspaceProjectContext,
  ): boolean {
    if (tombstoned.resourceIds.has(remote.resourceId)) return true;
    // The resource id derivation depends on the principal that shared the
    // project; fall back to owner-scoped project identity so an unshare
    // performed under a different principal still suppresses its own row.
    return remote.ownerMemberId === ctx.workspaceMemberId && tombstoned.projectIds.has(remote.projectId);
  }
  /**
   * Reconcile a project's local `workspace_projects` row against what B's team
   * catalog says about THIS member's access to it, in both directions.
   *
   * `listRemoteTeamProjectSummaries` passes an already-loaded local row for an
   * exact resource/project match; unmatched catalog rows keep the historical
   * project-id lookup used to repair stale bindings. This keeps the list path
   * at one catalog call without adding one SQLite lookup per visible project.
   * Exact matches may safely repair binding state, but a foreign mirror must
   * remain creator-unattributed in SQLite; the remote owner is display/
   * authorization evidence, not evidence that this daemon created the
   * project. `accessForRemoteTeamProject` derives the DISPLAYED capabilities
   * from `remote.access.canEdit`; without matching ENFORCED state, the two
   * directions disagree:
   *   - `canEdit: true` but the local row is missing/mismatched: the listing
   *     would show a normal-looking, "editable" project whose every save 403s,
   *     because `enforceWorkspaceProjectMutation` never finds a matching row.
   *   - `canEdit: false` but a stale local row happens to already sit under
   *     THIS workspace with THIS member recorded as its creator (a rarer, but
   *     real, coincidence — e.g. a locally-created draft that was never
   *     shared, then this project id got reused by an unrelated team share):
   *     the local row would grant a save the remote side has already revoked.
   * Only a visibly stale exact binding or the existing narrow access-repair
   * case is written. A correct mirror remains untouched.
   */
  function reconcileLocalRowWithRemoteTeamAccess(
    remote: VelaTeamProjectRecord,
    ctx: WorkspaceProjectContext,
    loadedExactRow?: any,
  ): void {
    const existing = loadedExactRow ?? getWorkspaceProjectByProjectId(db, remote.projectId);
    const existingVisibility = existing?.visibility ?? existing?.workspaceVisibility;
    // Ownership match required, same reasoning as accessForRemoteTeamProject
    // above: never rebind a row to make a reader look like this project's
    // creator just because B's generic canEdit happens to read true for them.
    const isOwner = remote.ownerMemberId === ctx.workspaceMemberId;
    const persistedCreatorMemberId = isOwner ? ctx.workspaceMemberId : null;
    const canEdit = remote.access.canEdit && remote.access.canView && !remote.access.frozen && isOwner;
    const expectedResourceState = remote.access.frozen ? 'frozen' : 'active';
    const expectedSyncState = velaProjectSyncStateToProject(remote.syncState);
    if (canEdit) {
      const alreadyCorrect = existing
        && existing.workspaceId === ctx.workspaceId
        && existingVisibility === 'team'
        && existing.createdByWorkspaceMemberId === persistedCreatorMemberId
        && existing.resourceHubResourceId === remote.resourceId
        && existing.resourceState === expectedResourceState
        && existing.syncState === expectedSyncState;
      if (alreadyCorrect) return;
      rebindWorkspaceProject(db, remote.projectId, {
        workspaceId: ctx.workspaceId,
        visibility: 'team',
        resourceState: expectedResourceState,
        createdByWorkspaceMemberId: persistedCreatorMemberId,
        updatedByWorkspaceMemberId: ctx.workspaceMemberId,
        resourceHubResourceId: remote.resourceId,
        cloudTombstonedAt: null,
        syncState: expectedSyncState,
        // This runs INSIDE the list read, against B's catalog — nobody changed
        // the project, so it must not restamp `lastActivityAt` below (which is
        // `MAX(p.updated_at, wp.updated_at)`). See SYNC_KEEPS_UPDATED_AT.
        updatedAt: SYNC_KEEPS_UPDATED_AT,
      });
      return;
    }
    // canEdit: false. An exact resource-id match is authoritative enough to
    // repair a materialized mirror whose placeholder binding has no creator:
    // it is the same hub share, not an unrelated local project with a colliding
    // project id. Otherwise only tighten a row that currently claims THIS
    // workspace + THIS member as a team-writable binding for THIS project.
    const exactRemoteBinding = existing
      && existing.workspaceId === ctx.workspaceId
      && existingVisibility === 'team'
      && existing.resourceHubResourceId === remote.resourceId;
    if (
      exactRemoteBinding
      && existing.createdByWorkspaceMemberId === persistedCreatorMemberId
      && existing.resourceState === expectedResourceState
      && existing.syncState === expectedSyncState
    ) {
      return;
    }
    const wronglyPermissive = existing
      && existing.workspaceId === ctx.workspaceId
      && existingVisibility === 'team'
      && existing.createdByWorkspaceMemberId === ctx.workspaceMemberId;
    if (!exactRemoteBinding && !wronglyPermissive) return;
    rebindWorkspaceProject(db, remote.projectId, {
      workspaceId: ctx.workspaceId,
      visibility: 'team',
      resourceState: expectedResourceState,
      createdByWorkspaceMemberId: persistedCreatorMemberId,
      updatedByWorkspaceMemberId: ctx.workspaceMemberId,
      resourceHubResourceId: remote.resourceId,
      syncState: expectedSyncState,
      // Same reason as the canEdit branch above: reconciliation, not activity.
      updatedAt: SYNC_KEEPS_UPDATED_AT,
    });
  }
  /**
   * Give a project with NO local `workspace_projects` row a chance to learn it
   * is actually a team resource before `/move` defaults it to personal.
   *
   * `ensureWorkspaceProjection(project, ctx, 'personal')` (below, in the move
   * route) unconditionally binds a brand-new row as `visibility: 'personal'`.
   * That default is harmless for a "move to team" request — canMoveToTeam
   * requires exactly that starting visibility — but it is fatal for a "move to
   * personal" request: the code has just invented the very state
   * (`visibility: 'personal'`) that makes canMoveToPersonal impossible, then
   * rejects the request for contradicting the state it invented one line
   * earlier (PROJECT_DELETE_FORBIDDEN, recvqfNnRETNtM / recvqgejeqK2OJ).
   *
   * A project reaches `/move` with no local row for reasons that have nothing
   * to do with whether it is genuinely a team resource: the brand/design-system
   * extraction pipeline (`brands/index.ts`) inserts its backing project without
   * ever calling `ensureWorkspaceProject` or registering it with the hub's own
   * team-project catalog, and a project shared to this team from a different
   * device/session never gets a row written into THIS daemon's own sqlite
   * until something reconciles it. The web client's own "shared" badge and its
   * "move out of team" affordance (`createSharedProjectPredicate`,
   * `RecentProjectsStrip.tsx`) already read this exact catalog
   * (`GET /api/workspace/projects/team` → `createTeamProjectsLister` →
   * `velaCliTeamProjectCatalog`, the same instance threaded into this route as
   * `teamProjectCatalog`) — so whenever that affordance is visible at all, the
   * hub already knows this project is team-visible, whether or not this
   * exact daemon's local sqlite has caught up.
   *
   * Reconciliation is itself authority-sensitive. Only the member recorded
   * as the remote project's creator may bind and unshare it. Workspace
   * owner/admin governance never substitutes for project ownership, even for
   * a historical row that this daemon has not seen before.
   *
   * A catalog outage is distinct from an authoritative "not shared" answer:
   * callers receive a retryable 503 instead of guessing Personal and losing
   * the only evidence that authorizes a later unshare.
   */
  type UnboundProjectMoveReconciliation =
    | 'none'
    | 'creator'
    | 'denied'
    | 'unavailable';

  async function reconcileUnboundProjectBeforeMove(
    projectId: string,
    ctx: WorkspaceProjectContext,
  ): Promise<UnboundProjectMoveReconciliation> {
    if (!teamProjectCatalog) return 'none';
    let remoteProjects: VelaTeamProjectRecord[];
    try {
      remoteProjects = await teamProjectCatalog.list(workspaceProjectPrincipal(ctx));
    } catch {
      return 'unavailable';
    }
    const remote = remoteProjects.find(
      (item) =>
        item.workspaceId === ctx.workspaceId
        && item.projectId === projectId
        && item.access.canView,
    );
    if (!remote) return 'none';
    const creator = remote.ownerMemberId === ctx.workspaceMemberId;
    if (!creator || remote.access.frozen || !remote.access.canEdit) return 'denied';
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId: ctx.workspaceId,
      visibility: 'team',
      resourceState: remote.access.frozen ? 'frozen' : 'active',
      createdByWorkspaceMemberId: remote.ownerMemberId ?? null,
      updatedByWorkspaceMemberId: ctx.workspaceMemberId,
      resourceHubResourceId: remote.resourceId,
      cloudTombstonedAt: null,
      syncState: 'synced',
    });
    return 'creator';
  }

  type CatalogOnlyOwnerMaterialization =
    | 'missing'
    | 'denied'
    | 'materialized'
    | 'unavailable';

  /**
   * A catalog entry may be visible before this daemon has either the project
   * row or its files. Exact-owner mutations that require local state first
   * pull that content: unshare must preserve a Personal copy, while rename
   * must update the real project row before refreshing Vela metadata. The pull
   * path performs its own fresh exact-scope authority/catalog checks and
   * commits content + rows atomically.
   */
  async function materializeCatalogOnlyOwnerProject(
    projectId: string,
    ctx: WorkspaceProjectContext,
  ): Promise<CatalogOnlyOwnerMaterialization> {
    if (!teamProjectCatalog) return 'missing';
    let remoteProjects: VelaTeamProjectRecord[];
    try {
      remoteProjects = await teamProjectCatalog.list(workspaceProjectPrincipal(ctx));
    } catch {
      return 'unavailable';
    }
    const remote = remoteProjects.find(
      (item) =>
        item.workspaceId === ctx.workspaceId
        && item.projectId === projectId
        && item.access.canView,
    );
    if (!remote) return 'missing';
    if (
      remote.ownerMemberId !== ctx.workspaceMemberId
      || remote.access.frozen
      || !remote.access.canEdit
    ) {
      return 'denied';
    }
    if (!collabSync.materializeTeamProject) return 'unavailable';
    try {
      await collabSync.materializeTeamProject(
        projectId,
        workspaceProjectPrincipal(ctx),
      );
    } catch {
      return 'unavailable';
    }
    const project = getProject(db, projectId);
    const binding = getWorkspaceProjectByProjectId(db, projectId);
    if (
      !project
      || !binding
      || binding.workspaceId !== ctx.workspaceId
      || binding.visibility !== 'team'
      || binding.createdByWorkspaceMemberId !== ctx.workspaceMemberId
      || binding.resourceHubResourceId !== remote.resourceId
    ) {
      return 'unavailable';
    }
    return 'materialized';
  }
  function catalogEnrichedLocalTeamProjectSummary(
    summary: any,
    remote: VelaTeamProjectRecord,
    ctx: WorkspaceProjectContext,
  ) {
    const localProjectName = summary?.project?.name;
    const localOwnerName =
      remote.ownerMemberId === ctx.workspaceMemberId
      && typeof localProjectName === 'string'
        ? localProjectName.trim()
        : '';
    const name = localOwnerName || remote.displayName?.trim();
    const frozen = remote.access.frozen || isWorkspaceLocked(ctx);
    return {
      ...summary,
      ...(name ? { name } : {}),
      createdByWorkspaceMemberId: remote.ownerMemberId,
      resourceState: frozen ? 'frozen' : 'active',
      currentUserAccess: accessForRemoteTeamProject(remote, ctx),
      syncState: velaProjectSyncStateToProject(remote.syncState),
      project: {
        ...summary.project,
        ...(name ? { name } : {}),
      },
    };
  }
  async function listRemoteTeamProjectSummaries(localRows: any[], ctx: WorkspaceProjectContext) {
    if (!teamProjectCatalog) {
      return {
        matchedByResourceId: new Map<string, VelaTeamProjectRecord>(),
        remoteSummaries: [],
      };
    }
    const localResourceIds = new Set(localRows.map((row) => row.resourceHubResourceId).filter(Boolean));
    const localRowByExactRemoteIdentity = new Map(
      localRows
        .filter((row) => row.resourceHubResourceId)
        .map((row) => [`${row.resourceHubResourceId}\0${row.id}`, row] as const),
    );
    const tombstoned = locallyTombstonedTeamProjects(localRows, ctx);
    let remoteProjects: VelaTeamProjectRecord[];
    try {
      remoteProjects = await teamProjectCatalog.list(workspaceProjectPrincipal(ctx));
    } catch (error) {
      throw new TeamProjectCatalogListError(error);
    }
    const seenResourceIds = new Set<string>();
    const visibleProjects = remoteProjects
      .filter((project) => project.workspaceId === ctx.workspaceId)
      .filter((project) => project.access.canView)
      .filter((project) => !remoteTeamProjectWasUnsharedLocally(project, tombstoned, ctx));
    for (const project of visibleProjects) {
      try {
        const exactRow = localRowByExactRemoteIdentity.get(`${project.resourceId}\0${project.projectId}`);
        reconcileLocalRowWithRemoteTeamAccess(project, ctx, exactRow);
      } catch (error) {
        // Best-effort: a reconciliation failure must not break the list itself
        // (the client still gets a correct-enough READ from accessForRemoteTeamProject
        // below; only the next SAVE would still need a retry).
        console.error('[team-projects] failed to reconcile local row with remote access', error);
      }
    }
    const matchedByResourceId = new Map(
      visibleProjects
        .filter((project) => localRowByExactRemoteIdentity.has(`${project.resourceId}\0${project.projectId}`))
        .map((project) => [project.resourceId, project] as const),
    );
    const remoteSummaries = visibleProjects
      .filter((project) => !localResourceIds.has(project.resourceId))
      .filter((project) => {
        if (seenResourceIds.has(project.resourceId)) return false;
        seenResourceIds.add(project.resourceId);
        return true;
      })
      .map((project) => remoteTeamProjectSummary(project, ctx));
    return { matchedByResourceId, remoteSummaries };
  }
  /**
   * Bind a project to this workspace, or hand back the binding it already has.
   *
   * The lookup is by PROJECT, not by `(workspace, project)`. A project belongs
   * to exactly one workspace (collab/workspace-project-home.ts), so "no row in
   * the workspace I am currently looking at" does not mean "unbound" — reading
   * it that way is what made an older build write one ownerless row per
   * workspace visited and put the same 草稿 list in front of every workspace.
   */
  function ensureWorkspaceProjection(project: any, ctx: WorkspaceProjectContext, visibility = 'personal') {
    const existing = getWorkspaceProjectByProjectId(db, project.id);
    return existing ?? ensureWorkspaceProject(db, {
      projectId: project.id,
      workspaceId: ctx.workspaceId,
      visibility,
      resourceState: 'active',
      createdByWorkspaceMemberId: null,
      updatedByWorkspaceMemberId: null,
      syncState: 'local_only',
      resourceHubResourceId: null,
      cloudTombstonedAt: null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
  }

  /**
   * Bind a freshly duplicated / design-system-copied project into the SAME
   * workspace the request that made it is acting in.
   *
   * `POST /api/projects` binds the project it creates immediately (see
   * `workspaceIdForCreate` below), but duplicate and design-system-copy used
   * to skip that step entirely — the new project row landed with NO
   * `workspace_projects` row at all. It stayed an unbound orphan until
   * whichever workspace's project list happened to be read next, and only a
   * PERSONAL workspace read ever adopts an orphan
   * (`bindUnboundProjectsToPersonalWorkspace` only runs for
   * `ctx.workspaceType === 'personal'`). So a duplicate made from inside a
   * team workspace silently re-homed into the caller's personal workspace
   * the next time it was read, instead of staying in the team it was
   * actually duplicated from (recvqbjbudBS9r).
   *
   * Called only after `enforceWorkspaceProjectMutation` already allowed the
   * duplicate/copy, which is proof `ctx` names an active, write-capable
   * member of the workspace that owns the SOURCE project — exactly the right
   * home for the copy too.
   *
   * A request with no identity remains a true legacy/unbound copy. Modern web
   * callers lock and send the source project's persisted exact scope.
   */
  function bindDuplicateIntoRequestWorkspace(
    ctx: WorkspaceResourceContext | null,
    targetProjectId: string,
    now: number,
  ) {
    if (ctx === null) return;
    learnAssertedWorkspaceType(ctx);
    ensureWorkspaceProject(db, {
      projectId: targetProjectId,
      workspaceId: ctx.workspaceId,
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: ctx.workspaceMemberId,
      updatedByWorkspaceMemberId: ctx.workspaceMemberId,
      syncState: 'local_only',
      resourceHubResourceId: null,
      cloudTombstonedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  /**
   * Claim a project this daemon has never bound to ANY workspace into the
   * CURRENT mutating request's workspace, right before
   * `enforceWorkspaceProjectMutation` evaluates it.
   *
   * The Workspace mutation gate denies any
   * mutation the moment the two-key lookup comes back empty
   * (`workspaceResourceMutationAllowed`'s `if (!row) return false;`) — right
   * for a project genuinely bound to a DIFFERENT workspace than the one the
   * caller claims, but wrong for a project this daemon has never bound
   * anywhere at all. That exact state is reachable one call up this same
   * route: `bindDuplicateIntoRequestWorkspace` above skips binding the COPY
   * whenever the duplicating request carried no workspace headers
   * (`ctx === null` — a legitimate legacy/pre-context caller, per its own doc
   * comment), leaving the copy permanently unbound. The FIRST later mutation
   * that DOES carry real headers — e.g. duplicating that same copy again once
   * the client's `workspaceContext` has resolved — then 403s as "workspace
   * project mutation is not allowed" even though nothing has ever claimed the
   * project (recvqbhor3pai2, "复制的项目再次复制").
   *
   * Keyed on "does ANY `workspace_projects` row exist for this project id at
   * all" (`getWorkspaceProjectByProjectId`), not on the current
   * `ctx.workspaceId` — a project already bound elsewhere (including a
   * remote team project a prior list read already reconciled, which always
   * attributes the REAL hub owner, never the reader) is left exactly where it
   * is; this only ever claims a true orphan, matching `ensureWorkspaceProject`'s
   * own idempotency contract.
   *
   * Attributes an owner, deliberately NOT the `null` an ordinary lazy-read
   * projection uses (`ensureWorkspaceProjection`). A passive list read must not
   * silently hand out ownership just because it happened to run first; an
   * explicit mutation request naming this exact project is the "yes, this is
   * mine" signal a read never had.
   *
   * A complete explicit pair may claim a true local orphan. Partial/headerless
   * requests write nothing, and a project already bound anywhere is never
   * re-homed. The daemon's loopback request boundary protects this local
   * attribution; remote membership is enforced only at share/sync/publish.
   */
  function reconcileUnboundProjectBeforeMutation(
    req: any,
    projectId: string,
    home: WorkspaceResourceContext | null,
  ) {
    const asserted = workspaceProjectContextFromRequest(req);
    if (asserted === null || asserted === 'missing') return;
    if (getWorkspaceProjectByProjectId(db, projectId)) return;
    if (!home) return;
    // The resolver and parser must agree on the exact local attribution pair.
    if (
      home.workspaceId !== asserted.workspaceId
      || home.workspaceMemberId !== asserted.workspaceMemberId
    ) {
      return;
    }
    const now = Date.now();
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId: home.workspaceId,
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: home.workspaceMemberId,
      updatedByWorkspaceMemberId: home.workspaceMemberId,
      syncState: 'local_only',
      resourceHubResourceId: null,
      cloudTombstonedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  function workspaceProjectRowVisibleForLocations(
    row: any,
    locations: Array<{ id: string; path: string; builtIn?: boolean }>,
  ): boolean {
    let metadata: unknown;
    try {
      metadata = row.metadataJson ? JSON.parse(row.metadataJson) : undefined;
    } catch {
      metadata = undefined;
    }
    return projectVisibleForLocations({ metadata }, locations);
  }

  function workspaceProjectRowBelongsToCurrentWorkspace(row: any, ctx: WorkspaceProjectContext): boolean {
    // A revoked pulled mirror stays bound to its exact Team identity as a
    // non-destructive tombstone. It must not appear in any project list while
    // its stale local bytes are quarantined.
    if (row.resourceState === 'deleted') return false;
    if (ctx.workspaceType !== 'team') return true;
    // Legacy rows created before workspace isolation may have been projected into
    // a team workspace as personal projects with no owner. They actually belong
    // to the user's personal workspace, so suppress them in team views without
    // deleting any local data. Real team-workspace drafts carry an owner member.
    return !(row.workspaceVisibility === 'personal' && row.createdByWorkspaceMemberId == null);
  }

  function workspaceProjectRowsForIds(
    projectIds: string[],
    ctx: WorkspaceProjectContext,
    locations: Array<{ id: string; path: string; builtIn?: boolean }>,
  ) {
    for (const id of projectIds) {
      const project = getProject(db, id);
      if (ctx.workspaceType === 'personal' && project && projectVisibleForLocations(project, locations)) {
        ensureWorkspaceProjection(project, ctx, 'personal');
      }
    }
    return listWorkspaceProjects(db, ctx.workspaceId)
      .filter((row: any) => workspaceProjectRowBelongsToCurrentWorkspace(row, ctx))
      .filter((row: any) => workspaceProjectRowVisibleForLocations(row, locations));
  }

  function workspaceProjectCreatedByCurrentMember(project: any, ctx: WorkspaceProjectContext): boolean {
    if (project.createdByWorkspaceMemberId === ctx.workspaceMemberId) return true;
    return (
      ctx.workspaceType === 'personal' &&
      project.visibility === 'personal' &&
      project.createdByWorkspaceMemberId == null
    );
  }

  /**
   * Bind projects that belong to NO workspace to this personal workspace.
   *
   * The rule is adoption of orphans, not a back-fill of everything. A project
   * that already has a binding is left exactly where it is; only a project with
   * no row anywhere is claimed. Those are the pre-workspace ("legacy") projects
   * — created before workspaces existed, or left unbound by the repair in
   * collab/workspace-project-home.ts — and losing them across the upgrade would
   * be data loss, which the red-line test in tests/routes/workspace-projects.ts
   * guards.
   *
   * The target is the user's PERSONAL workspace, per product: it always exists,
   * so there is always somewhere to put an orphan, and it is the honest home for
   * a project that predates any team. Team workspaces are excluded on purpose —
   * adopting a user's private pre-workspace drafts into a team would expose them
   * to people who never had them.
   *
   * Which personal workspace, when the user has several? The one they opened
   * first after upgrading. There is no better evidence available: the projects
   * carry no workspace of their own, and a workspace is only knowable as
   * personal from the request that names it. Doing this on a read rather than in
   * the migration is what buys that knowledge.
   */
  function bindUnboundProjectsToPersonalWorkspace(
    ctx: WorkspaceProjectContext,
    locations: Array<{ id: string; path: string; builtIn?: boolean }>,
  ) {
    if (ctx.workspaceType !== 'personal') return;
    for (const project of listProjects(db).filter((item: any) => projectVisibleForLocations(item, locations))) {
      if (getWorkspaceProjectByProjectId(db, project.id)) continue;
      ensureWorkspaceProjection(project, ctx, 'personal');
    }
  }
  async function loadPluginRegistryView(options: {
    workspaceId?: string | null;
    workspaceMemberId?: string | null;
  } = {}) {
    if (ctx.pluginScope) return ctx.pluginScope.loadRegistry(options);
    const [skills, designSystems] = await Promise.all([
      listSkills(
        SKILLS_DIR,
        options.workspaceId !== undefined
          ? {
              db,
              workspaceId: options.workspaceId,
              workspaceMemberId: options.workspaceMemberId ?? null,
            }
          : undefined,
      ),
      listDesignSystems(DESIGN_SYSTEMS_DIR),
    ]);
    return {
      skills: skills.map((s) => ({ id: s.id, title: s.name, description: s.description })),
      designSystems: designSystems.map((d) => ({ id: d.id, title: d.title })),
      craft: [],
      atoms: FIRST_PARTY_ATOMS.map((a) => ({ id: a.id, label: a.label })),
      scenarios: collectBundledScenarios(),
    };
  }

  function collectBundledScenarios() {
    type ScenarioEntry = {
      id: string;
      taskKind: 'new-generation' | 'figma-migration' | 'code-migration' | 'tune-collab';
      pipeline: NonNullable<NonNullable<PluginManifest['od']>['pipeline']>;
    };
    const byTaskKind = new Map<ScenarioEntry['taskKind'], ScenarioEntry>();
    try {
      const all = listInstalledPlugins(db);
      for (const row of all) {
        if (row.sourceKind !== 'bundled') continue;
        const od = row.manifest.od;
        if (!od || od.kind !== 'scenario') continue;
        if (!od.pipeline || !Array.isArray(od.pipeline.stages) || od.pipeline.stages.length === 0) continue;
        const taskKind = (od.taskKind ?? 'new-generation') as ScenarioEntry['taskKind'];
        if (
          taskKind !== 'new-generation' &&
          taskKind !== 'figma-migration' &&
          taskKind !== 'code-migration' &&
          taskKind !== 'tune-collab'
        ) {
          continue;
        }
        const entry: ScenarioEntry = { id: row.id, taskKind, pipeline: od.pipeline };
        const existing = byTaskKind.get(taskKind);
        if (!existing || entry.id === `od-${taskKind}`) {
          byTaskKind.set(taskKind, entry);
        }
      }
    } catch {
      return [];
    }
    return Array.from(byTaskKind.values());
  }

  async function configuredProjectLocations() {
    const config = await readAppConfig(ctx.paths.RUNTIME_DATA_DIR);
    const all = allProjectLocations(PROJECTS_DIR, config.projectLocations);
    const valid = all[0] ? [all[0]] : [];
    for (const location of all.slice(1)) {
      const validated = validateLinkedDirs([location.path]);
      if (validated.error) continue;
      const canonical = validated.dirs[0];
      if (!canonical) continue;
      if (locationOverlapsDaemonData(canonical)) continue;
      valid.push({ ...location, path: canonical });
    }
    return valid;
  }

  function locationOverlapsDaemonData(locationPath: string): boolean {
    const runtimeDir = ctx.paths.RUNTIME_DATA_DIR_CANONICAL || ctx.paths.RUNTIME_DATA_DIR;
    const projectsDir = path.join(runtimeDir, 'projects');
    const relativeToRuntime = pathRelative(runtimeDir, locationPath);
    const runtimeInsideLocation = pathRelative(locationPath, runtimeDir);
    const relativeToProjects = pathRelative(projectsDir, locationPath);
    const projectsInsideLocation = pathRelative(locationPath, projectsDir);
    return isInsideOrSame(relativeToRuntime) || isInsideOrSame(runtimeInsideLocation)
      || isInsideOrSame(relativeToProjects) || isInsideOrSame(projectsInsideLocation);
  }

  function pathRelative(from: string, to: string): string {
    return path.relative(from, to);
  }

  function isInsideOrSame(relative: string): boolean {
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  function projectBelongsToLocation(project: any, location: { id: string; path: string }): boolean {
    const metadata = project?.metadata;
    if (typeof metadata?.baseDir !== 'string') return metadata?.projectLocationId === location.id;
    const relative = path.relative(location.path, metadata.baseDir);
    return isInsideOrSame(relative) && relative !== '';
  }

  function isProjectLocationProject(project: any): boolean {
    const metadata = project?.metadata;
    return metadata?.importedFrom === 'project-location'
      || typeof metadata?.projectLocationId === 'string';
  }

  function projectVisibleForLocations(
    project: any,
    locations: Array<{ id: string; path: string; builtIn?: boolean }>,
  ): boolean {
    if (!isProjectLocationProject(project)) return true;
    return locations.some((location) => !location.builtIn && projectBelongsToLocation(project, location));
  }

  async function resolveCreateProjectLocationId(explicitProjectLocationId: unknown): Promise<string> {
    if (typeof explicitProjectLocationId === 'string' && explicitProjectLocationId.trim()) {
      return explicitProjectLocationId.trim();
    }
    const config = await readAppConfig(ctx.paths.RUNTIME_DATA_DIR);
    const configuredDefault = typeof config.defaultProjectLocationId === 'string'
      ? config.defaultProjectLocationId.trim()
      : '';
    if (!configuredDefault || configuredDefault === BUILT_IN_PROJECT_LOCATION_ID) {
      return BUILT_IN_PROJECT_LOCATION_ID;
    }
    const locations = await configuredProjectLocations();
    return locations.some((location) => !location.builtIn && location.id === configuredDefault)
      ? configuredDefault
      : BUILT_IN_PROJECT_LOCATION_ID;
  }

  function unregisterProjectsForRemovedLocations(
    previousLocations: Array<{ id: string; path: string; builtIn?: boolean }>,
    nextLocations: Array<{ id?: string; path: string }>,
  ): string[] {
    const nextIds = new Set(nextLocations.map((location) => location.id).filter(Boolean));
    const nextPaths = new Set(nextLocations.map((location) => location.path));
    const removed = previousLocations.filter(
      (location) => !location.builtIn && !nextIds.has(location.id) && !nextPaths.has(location.path),
    );
    if (removed.length === 0) return [];
    return listProjects(db)
      .filter((project: any) => removed.some((location) => projectBelongsToLocation(project, location)))
      .map((project: any) => project.id);
  }

  app.get('/api/project-locations', async (_req, res) => {
    try {
      const locations = await configuredProjectLocations();
      /** @type {import('@open-design/contracts').ProjectLocationsResponse} */
      const body = { locations };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  app.put('/api/project-locations', async (req, res) => {
    try {
      const requested = Array.isArray(req.body?.locations) ? req.body.locations : null;
      if (!requested) return sendApiError(res, 400, 'BAD_REQUEST', 'locations must be an array');
      const previousLocations = await configuredProjectLocations();
      const prepared = [];
      for (const loc of requested) {
        if (!loc || typeof loc !== 'object' || typeof loc.path !== 'string') continue;
        const canonicalPath = await ensureProjectLocation(loc.path);
        const validated = validateLinkedDirs([canonicalPath]);
        if (validated.error) return sendApiError(res, 400, 'BAD_REQUEST', validated.error);
        if (locationOverlapsDaemonData(canonicalPath)) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'project location cannot overlap daemon data');
        }
        prepared.push({
          id: typeof loc.id === 'string' ? loc.id : undefined,
          name: typeof loc.name === 'string' ? loc.name : undefined,
          path: canonicalPath,
        });
      }
      const config = await writeAppConfig(ctx.paths.RUNTIME_DATA_DIR, { projectLocations: prepared });
      const locations = allProjectLocations(PROJECTS_DIR, config.projectLocations);
      const removedProjectIds = unregisterProjectsForRemovedLocations(previousLocations, config.projectLocations ?? []);
      /** @type {import('@open-design/contracts').ProjectLocationsResponse} */
      const body = { locations, removedProjectIds };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post('/api/project-locations/scan', async (req, res) => {
    try {
      // Resolve once before scanning or inserting anything. An explicitly
      // scoped request whose membership is removed/unavailable must not leave
      // partially imported unbound projects behind.
      const createHome = await resolveCreatedProjectHome(req);
      const locations = (await configuredProjectLocations()).filter((loc: any) => !loc.builtIn);
      const imported = [];
      const existing: string[] = [];
      const skipped: Array<{ path: string; reason: string }> = [];
      let scanned = 0;
      const now = Date.now();
      for (const location of locations) {
        let found;
        try {
          found = await scanProjectLocation(location);
        } catch (err: any) {
          skipped.push({ path: location.path, reason: String(err?.message ?? err) });
          continue;
        }
        scanned += found.length;
        for (const entry of found) {
          const { manifest } = entry;
          if (getProject(db, manifest.id)) {
            existing.push(manifest.id);
            continue;
          }
          try {
            const project = insertProject(db, {
              id: manifest.id,
              name: manifest.name,
              skillId: manifest.skillId ?? null,
              designSystemId: manifest.designSystemId ?? null,
              pendingPrompt: null,
              metadata: {
                kind: 'prototype',
                baseDir: entry.dir,
                importedFrom: 'project-location',
                projectLocationId: location.id,
              },
              customInstructions: null,
              createdAt: manifest.createdAt,
              updatedAt: manifest.updatedAt,
            });
            insertConversation(db, {
              id: randomId(),
              projectId: manifest.id,
              title: null,
              createdAt: now,
              updatedAt: now,
            });
            // A project this scan adopts off disk is as much a created project
            // as one typed into the composer, and needs the same home
            // workspace. Without this the imported project is an orphan the
            // moment it appears: account-scoped local runs remain possible,
            // but Workspace mutations and Workspace-pinned billing would have
            // no durable home.
            bindCreatedProjectToWorkspace(
              (input) => ensureWorkspaceProject(db, input),
              createHome,
              manifest.id,
              now,
            );
            if (project) imported.push(project);
          } catch (err: any) {
            skipped.push({ path: entry.dir, reason: String(err?.message ?? err) });
          }
        }
      }
      /** @type {import('@open-design/contracts').ScanProjectLocationsResponse} */
      const body = { scanned, imported, existing, skipped };
      res.json(body);
    } catch (err: any) {
      if (err instanceof CreatedProjectWorkspaceResolutionError) {
        return sendApiError(
          res,
          err.status,
          err.code,
          err.message,
          err.retryable ? { retryable: true } : {},
        );
      }
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects', async (_req, res) => {
    try {
      const locations = await configuredProjectLocations();
      const latestRunStatuses = listLatestProjectRunStatuses(db);
      const awaitingInputProjects = listProjectsAwaitingInput(db);
      const activeRunStatuses = new Map();
      for (const run of design.runs.list()) {
        if (!run.projectId) continue;
        const runStatus = projectStatusFromRun(run);
        if (design.runs.isTerminal(run.status)) {
          const existing = latestRunStatuses.get(run.projectId);
          if (!existing || run.updatedAt > (existing.updatedAt ?? 0)) {
            latestRunStatuses.set(run.projectId, runStatus);
          }
        } else {
          const existing = activeRunStatuses.get(run.projectId);
          if (!existing || run.updatedAt > (existing.updatedAt ?? 0)) {
            activeRunStatuses.set(run.projectId, runStatus);
          }
        }
      }
      // This is the NO-SCOPE catalog: no `x-od-workspace-*` headers are read
      // here at all, so every unbound (never-claimed) project must be visible
      // (pre-workspace-isolation compatibility) while every project some
      // workspace HAS claimed must not leak to a caller with no identity to
      // check it against — a signed-out client, a removed member, or a plain
      // `curl` (spec 04 §10: "no scope" must not mean "trust everything").
      // `listUnboundProjects` is the join that enforces this; a workspace-
      // scoped caller uses `GET /api/workspaces/:id/projects` instead, which
      // has its own ctx-gated membership check. Every row here is, by
      // construction, unbound — so `workspaceId` is always `null`; no binding
      // lookup needed (a `listWorkspaceProjectBindings` scan here would only
      // ever resolve to misses).
      /** @type {import('@open-design/contracts').ProjectsResponse} */
      const body = {
        projects: listUnboundProjects(db)
          .filter((project: any) => projectVisibleForLocations(project, locations))
          .map((project: any) => ({
            ...project,
            workspaceId: null,
            status: brandAwareProjectStatus(
              project,
              composeProjectDisplayStatus(
                activeRunStatuses.get(project.id) ??
                  latestRunStatuses.get(project.id) ?? { value: 'not_started' },
                awaitingInputProjects,
                project.id,
              ),
            ),
          })),
      };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  app.get('/api/workspaces/:workspaceId/projects', async (req, res) => {
    try {
      const authoritativeCtx = await authoritativeWorkspaceProjectContext(
        req,
        res,
        req.params.workspaceId,
        verifyWorkspaceProjectReadAuthority,
      );
      if (!authoritativeCtx) return;
      const assertedCtx = workspaceProjectContextFromRequest(req);
      const ctx = assertedCtx && assertedCtx !== 'missing'
        ? {
            ...authoritativeCtx,
            // Request capability flags are UI ceilings only: they may hide an
            // action, but never elevate directory-backed authority.
            canShareProjects:
              authoritativeCtx.canShareProjects && assertedCtx.canShareProjects,
            canWriteSyncedFiles:
              authoritativeCtx.canWriteSyncedFiles && assertedCtx.canWriteSyncedFiles,
          }
        : authoritativeCtx;
      if (ctx.memberStatus === 'removed') {
        /** @type {import('@open-design/contracts').WorkspaceProjectsResponse} */
        const body = { projects: [] };
        return res.json(body);
      }
      const locations = await configuredProjectLocations();
      bindUnboundProjectsToPersonalWorkspace(ctx, locations);
      const view = typeof req.query.view === 'string' ? req.query.view : 'all';
      if (view !== 'all' && view !== 'recent' && view !== 'drafts' && view !== 'team') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'view must be all, recent, drafts, or team');
      }
      const owner = typeof req.query.owner === 'string' ? req.query.owner : 'all';
      const visibility = typeof req.query.visibility === 'string' ? req.query.visibility : 'all';
      const rows = listWorkspaceProjects(db, ctx.workspaceId)
        .filter((row: any) => workspaceProjectRowBelongsToCurrentWorkspace(row, ctx))
        .filter((row: any) => workspaceProjectRowVisibleForLocations(row, locations));
      const queryCanIncludeTeam =
        view !== 'drafts' &&
        visibility !== 'personal' &&
        (view === 'team' || view === 'recent' || visibility === 'team' || (view === 'all' && visibility === 'all'));
      // Only a team workspace has a remote team-project catalog. A personal
      // workspace must never merge the caller's team projects into its list —
      // the Vela CLI team-projects lister is scoped to the active team, not the
      // queried workspace, so without this guard team projects leak into (and
      // duplicate within) a personal workspace's project list.
      const needsRemoteTeamProjects = queryCanIncludeTeam && ctx.workspaceType === 'team';
      const remoteMerge = needsRemoteTeamProjects
        ? await listRemoteTeamProjectSummaries(rows, ctx)
        : null;
      const mergedProjects = [
        ...rows.map((row: any) => {
          const summary = normalizeWorkspaceProjectRow(row, ctx);
          const remote = row.workspaceVisibility === 'team' && row.resourceHubResourceId
            ? remoteMerge?.matchedByResourceId.get(row.resourceHubResourceId)
            : null;
          return remote && remote.projectId === row.id
            ? catalogEnrichedLocalTeamProjectSummary(summary, remote, ctx)
            : summary;
        }),
        ...(remoteMerge?.remoteSummaries ?? []),
      ];
      const projects = mergedProjects
        .filter((project: any) => {
          const createdByCurrentMember = workspaceProjectCreatedByCurrentMember(project, ctx);
          // Personal projects are private to their recorded creator, even when
          // two accounts have used the same local data root or are members of
          // the same Team Workspace. Apply this before every view/owner filter
          // so `recent`, `all`, and `owner=others` cannot become privacy
          // bypasses. Team projects remain visible to active Workspace members.
          if (project.visibility === 'personal' && !createdByCurrentMember) return false;
          if (view === 'drafts') {
            if (project.visibility !== 'personal' || !createdByCurrentMember) return false;
          }
          if (view === 'team' && project.visibility !== 'team') return false;
          if ((visibility === 'personal' || visibility === 'team') && project.visibility !== visibility) return false;
          if (owner === 'mine' && !createdByCurrentMember) return false;
          if (owner === 'others' && createdByCurrentMember) return false;
          return true;
        });
      const groupCountProperties = workspaceProjectGroupCountProperties({
        view,
        owner,
        visibility,
        projectCount: projects.length,
      });
      if (groupCountProperties) {
        void projectTelemetry.identifyWorkspaceGroup?.(
          req,
          ctx.workspaceId,
          groupCountProperties,
        );
      }
      /** @type {import('@open-design/contracts').WorkspaceProjectsResponse} */
      const body = { projects };
      res.json(body);
    } catch (err: any) {
      if (err?.name === 'TeamProjectCatalogListError') {
        return sendApiError(res, 502, 'TEAM_PROJECT_CATALOG_UNAVAILABLE', err.message);
      }
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err));
    }
  });

  function validVisibility(value: unknown): value is 'personal' | 'team' {
    return value === 'personal' || value === 'team';
  }
  function parseProjectIds(value: unknown): string[] | null {
    if (!Array.isArray(value) || value.length === 0) return null;
    const ids = [];
    for (const id of value) {
      if (typeof id !== 'string' || !id.trim() || !isSafeId(id)) return null;
      ids.push(id);
    }
    return ids;
  }

  function workspaceMoveRetryAllowed(
    summary: any,
    ctx: WorkspaceProjectContext,
    targetVisibility: 'personal' | 'team',
  ): boolean {
    // A failed publish has already crossed the local visibility boundary, so
    // `canMoveToTeam` is deliberately false. Let only the exact member still
    // recorded as this share's owner retry the SAME Team target. This repairs
    // a transient hub failure without re-homing the resource through a later
    // active/default Workspace or letting a Workspace admin take over someone
    // else's single-writer project.
    return targetVisibility === 'team'
      && summary?.visibility === 'team'
      && summary?.syncState === 'sync_failed'
      && summary?.createdByWorkspaceMemberId === ctx.workspaceMemberId
      && summary?.currentUserAccess?.canRename === true
      && ctx.canShareProjects
      && ctx.memberStatus === 'active'
      && ctx.lifecycleState === 'active';
  }

  function workspaceMoveAllowed(
    summary: any,
    targetVisibility: 'personal' | 'team',
    ctx: WorkspaceProjectContext,
  ): boolean {
    if (workspaceMoveRetryAllowed(summary, ctx, targetVisibility)) return true;
    if (targetVisibility === 'team') return summary.currentUserAccess.canMoveToTeam;
    return summary.currentUserAccess.canMoveToPersonal;
  }
  async function requestTeamVisibility(projectIds: string[], ctx: WorkspaceProjectContext, visibility: 'personal' | 'team') {
    for (const projectId of projectIds) {
      if (visibility === 'team') {
        await collabSync.requestTeamShare(projectId, workspaceProjectPrincipal(ctx));
      } else {
        await collabSync.requestTeamUnshare(projectId, workspaceProjectPrincipal(ctx));
      }
    }
    // The catalog this daemon serves is now stale by construction — drop it so
    // the refetch the client fires on this response reads the new list instead
    // of the one from before the move. Best-effort: the move itself already
    // succeeded, and a cold cache is a slow list, not a failed share.
    try {
      collabSync.invalidateTeamProjectCatalog?.();
    } catch {
      // ignore
    }
  }
  function ownerForTeamShare(summary: any, ctx: WorkspaceProjectContext, visibility: 'personal' | 'team') {
    if (visibility !== 'team') return summary?.createdByWorkspaceMemberId ?? null;
    return summary?.createdByWorkspaceMemberId ?? ctx.workspaceMemberId;
  }
  function workspaceProjectMovePatch(
    id: string,
    summary: any,
    ctx: WorkspaceProjectContext,
    visibility: 'personal' | 'team',
  ) {
    return {
      visibility,
      createdByWorkspaceMemberId: ownerForTeamShare(summary, ctx, visibility),
      updatedByWorkspaceMemberId: ctx.workspaceMemberId,
      resourceHubResourceId: visibility === 'team' ? projectResourceIdFor(id, workspaceProjectPrincipal(ctx)) : null,
      cloudTombstonedAt: visibility === 'team' ? null : Date.now(),
      syncState: visibility === 'team' ? 'pending_upload' : 'local_only',
    };
  }
  function restoreWorkspaceProjectRow(row: any) {
    updateWorkspaceProject(db, row.workspaceId, row.id, {
      visibility: row.workspaceVisibility,
      resourceState: row.resourceState,
      createdByWorkspaceMemberId: row.createdByWorkspaceMemberId ?? null,
      updatedByWorkspaceMemberId: row.updatedByWorkspaceMemberId ?? null,
      resourceHubResourceId: row.resourceHubResourceId ?? null,
      cloudTombstonedAt: row.cloudTombstonedAt ?? null,
      syncState: row.syncState ?? 'local_only',
      version: row.workspaceVersion ?? 1,
      updatedAt: row.workspaceUpdatedAt ?? Date.now(),
    });
  }

  /**
   * True when a team-share request was refused because the hub catalog
   * already registers this project under a DIFFERENT member's ownership
   * (vela's `team_project_owner_conflict`, re-thrown through the CLI
   * transport). The literal is the hub API's stable error token, so matching
   * it keeps this mapping independent of how the CLI frames its stderr text.
   * The conflict is permanent until the registered owner unshares the
   * project, so it must not collapse into the generic BAD_REQUEST bucket the
   * web renders as "try again later".
   */
  function isTeamProjectOwnerConflictError(error: unknown): boolean {
    return /team_project_owner_conflict/i.test(String(error));
  }

  app.post('/api/workspaces/:workspaceId/projects/:projectId/move', async (req, res) => {
    try {
      const ctx = await authoritativeWorkspaceProjectContext(req, res, req.params.workspaceId);
      if (!ctx) return;
      const visibility = req.body?.visibility;
      if (!validVisibility(visibility)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'visibility must be personal or team');
      }
      let project = getProject(db, req.params.projectId);
      if (!project && visibility === 'personal' && ctx.workspaceType === 'team') {
        const materialization = await materializeCatalogOnlyOwnerProject(
          req.params.projectId,
          ctx,
        );
        if (materialization === 'denied') {
          return sendApiError(res, 403, 'PROJECT_DELETE_FORBIDDEN', 'project move forbidden');
        }
        if (materialization === 'unavailable') {
          return sendApiError(
            res,
            503,
            'UPSTREAM_UNAVAILABLE',
            'team project content is temporarily unavailable',
            { retryable: true },
          );
        }
        if (materialization === 'materialized') {
          project = getProject(db, req.params.projectId);
        }
      }
      const locations = await configuredProjectLocations();
      if (!project || !projectVisibleForLocations(project, locations)) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      if (visibility === 'team') {
        const refusal = teamShareRefusalFor(ctx, workspaceTypes);
        if (refusal) return sendTeamShareScopeRefused(res, ctx, refusal);
      }
      // A "move to personal" request on a project this daemon has never
      // locally bound must not be judged against a 'personal' default this
      // same request is about to invent — see
      // `reconcileUnboundProjectBeforeMove`'s doc comment. Scoped to the
      // 'personal' direction only: 'team' already matches the fresh default
      // and must keep behaving exactly as before.
      let orphanRecovery: UnboundProjectMoveReconciliation = 'none';
      if (visibility === 'personal' && ctx.workspaceType === 'team' && !getWorkspaceProjectByProjectId(db, project.id)) {
        orphanRecovery = await reconcileUnboundProjectBeforeMove(project.id, ctx);
        if (orphanRecovery === 'denied') {
          return sendApiError(res, 403, 'PROJECT_DELETE_FORBIDDEN', 'project move forbidden');
        }
        if (orphanRecovery === 'unavailable') {
          return sendApiError(
            res,
            503,
            'UPSTREAM_UNAVAILABLE',
            'team project catalog is temporarily unavailable',
            { retryable: true },
          );
        }
      }
      const wp = ensureWorkspaceProjection(project, ctx, 'personal');
      const row = listWorkspaceProjects(db, ctx.workspaceId).find((item: any) => item.id === project.id);
      if (!row || !wp) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      const summary = normalizeWorkspaceProjectRow(row, ctx);
      if (!workspaceMoveAllowed(summary, visibility, ctx)) {
        return sendApiError(res, 403, 'PROJECT_DELETE_FORBIDDEN', 'project move forbidden');
      }
      updateWorkspaceProject(db, ctx.workspaceId, project.id, workspaceProjectMovePatch(project.id, summary, ctx, visibility));
      try {
        await requestTeamVisibility([project.id], ctx, visibility);
      } catch (error) {
        restoreWorkspaceProjectRow(row);
        throw new TeamProjectSyncError(error);
      }
      if (visibility === 'team') {
        const ensureCommentAnchor = db.transaction(() => {
          ensureTeamProjectCommentConversations(db, project.id);
        });
        ensureCommentAnchor();
      }
      const updatedRow = listWorkspaceProjects(db, ctx.workspaceId).find((item: any) => item.id === project.id);
      res.json({ project: normalizeWorkspaceProjectRow(updatedRow, ctx) });
    } catch (err: any) {
      if (isTeamProjectOwnerConflictError(err)) {
        return sendApiError(res, 409, 'TEAM_PROJECT_OWNER_CONFLICT', String(err));
      }
      if (err instanceof TeamProjectSyncError) {
        return sendApiError(
          res,
          503,
          'UPSTREAM_UNAVAILABLE',
          'team project synchronization is temporarily unavailable; retry the operation',
          { retryable: true },
        );
      }
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post('/api/workspaces/:workspaceId/projects/batch-move', async (req, res) => {
    try {
      const ctx = await authoritativeWorkspaceProjectContext(req, res, req.params.workspaceId);
      if (!ctx) return;
      const visibility = req.body?.visibility;
      const projectIds = parseProjectIds(req.body?.projectIds);
      if (!validVisibility(visibility) || !projectIds) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'projectIds and visibility are required');
      }
      if (visibility === 'team') {
        const refusal = teamShareRefusalFor(ctx, workspaceTypes);
        if (refusal) return sendTeamShareScopeRefused(res, ctx, refusal);
      }
      const locations = await configuredProjectLocations();
      const rows = workspaceProjectRowsForIds(projectIds, ctx, locations);
      const summaries = projectIds.map((id: string) => {
        const row = rows.find((item: any) => item.id === id);
        return row ? normalizeWorkspaceProjectRow(row, ctx) : null;
      });
      if (summaries.some((item: any) => !item)) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      const forbidden = summaries.filter((item: any) => !workspaceMoveAllowed(item, visibility, ctx));
      if (forbidden.length > 0) {
        return sendApiError(res, 403, 'PROJECT_BATCH_CONTAINS_FORBIDDEN_ITEMS', 'batch contains forbidden projects');
      }
      const previousRows = projectIds.map((id: string) => rows.find((item: any) => item.id === id));
      const moveMany = db.transaction((ids: string[]) => {
        for (const id of ids) {
          const summary = summaries.find((item: any) => item?.id === id);
          updateWorkspaceProject(db, ctx.workspaceId, id, workspaceProjectMovePatch(id, summary, ctx, visibility));
        }
      });
      moveMany(projectIds);
      try {
        await requestTeamVisibility(projectIds, ctx, visibility);
      } catch (error) {
        const rollbackMany = db.transaction((items: any[]) => {
          for (const item of items) restoreWorkspaceProjectRow(item);
        });
        rollbackMany(previousRows.filter(Boolean));
        throw new TeamProjectSyncError(error);
      }
      if (visibility === 'team') {
        const ensureCommentAnchors = db.transaction((ids: string[]) => {
          for (const id of ids) ensureTeamProjectCommentConversations(db, id);
        });
        ensureCommentAnchors(projectIds);
      }
      const updatedRows = listWorkspaceProjects(db, ctx.workspaceId);
      const projects = projectIds.map((id: string) => normalizeWorkspaceProjectRow(updatedRows.find((row: any) => row.id === id), ctx));
      res.json({ ok: true, projects });
    } catch (err: any) {
      if (isTeamProjectOwnerConflictError(err)) {
        return sendApiError(res, 409, 'TEAM_PROJECT_OWNER_CONFLICT', String(err));
      }
      if (err instanceof TeamProjectSyncError) {
        return sendApiError(
          res,
          503,
          'UPSTREAM_UNAVAILABLE',
          'team project synchronization is temporarily unavailable; retry the operation',
          { retryable: true },
        );
      }
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post('/api/workspaces/:workspaceId/projects/batch-delete', async (req, res) => {
    try {
      const ctx = await authoritativeWorkspaceProjectContext(req, res, req.params.workspaceId);
      if (!ctx) return;
      const projectIds = parseProjectIds(req.body?.projectIds);
      if (!projectIds) return sendApiError(res, 400, 'BAD_REQUEST', 'projectIds are required');
      const locations = await configuredProjectLocations();
      const rows = workspaceProjectRowsForIds(projectIds, ctx, locations);
      const summaries = projectIds.map((id: string) => {
        const row = rows.find((item: any) => item.id === id);
        return row ? normalizeWorkspaceProjectRow(row, ctx) : null;
      });
      if (summaries.some((item: any) => !item)) return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      const shared = summaries.filter((item: any) => item.visibility === 'team');
      if (shared.length > 0) {
        return sendApiError(res, 403, 'PROJECT_UNSHARE_UNSUPPORTED', 'deleting shared team projects is not supported yet');
      }
      const forbidden = summaries.filter((item: any) => !item.currentUserAccess.canDelete);
      if (forbidden.length > 0) {
        return sendApiError(res, 403, 'PROJECT_BATCH_CONTAINS_FORBIDDEN_ITEMS', 'batch contains forbidden projects');
      }
      const finalProjectIds = projectIds.filter((id: string) => countWorkspaceProjectRefs(db, id) <= 1);
      const deleteMany = db.transaction((ids: string[], finalIds: string[]) => {
        for (const id of ids) deleteWorkspaceProject(db, ctx.workspaceId, id);
        for (const id of finalIds) {
          if (countWorkspaceProjectRefs(db, id) === 0) dbDeleteProject(db, id);
        }
      });
      const stagedDelete = finalProjectIds.length > 0
        ? await stageProjectDirsForDelete(PROJECTS_DIR, finalProjectIds, randomId())
        : null;
      try {
        deleteMany(projectIds, finalProjectIds);
      } catch (error) {
        await stagedDelete?.rollback();
        throw error;
      }
      await stagedDelete?.commit();
      res.json({ ok: true, deletedProjectIds: projectIds });
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  function projectStatusFromRun(run: any) {
    const normalized = normalizeProjectDisplayStatus(run.status);
    // A just-finished in-memory run overrides the DB-derived status for its
    // project (it is newer), so it must carry the same incomplete signal the
    // persisted projection derives — otherwise the pill flashes "Completed" for
    // the ~30 min the run stays in memory before the DB-derived `incomplete`
    // takes over (#1247 / #1060). run.endedWithUnfinishedWork is set at finish().
    const value =
      normalized === 'succeeded' && run.endedWithUnfinishedWork ? 'incomplete' : normalized;
    return {
      value,
      updatedAt: run.updatedAt,
      runId: run.id,
    };
  }

  // Brand-extraction projects are driven by a brand lifecycle (extracting →
  // needs_input → ready / failed), not only by a chat run. When the run-derived
  // status would be `not_started` — e.g. the programmatic-first finalize ran
  // without a recorded chat run, or the daemon restarted and the in-memory run
  // aged out — fall back to the brand's own status so Home / Designs never show
  // a live brand extraction as "Not started". Run-derived status is kept
  // whenever it is meaningful (queued/running/succeeded/failed/awaiting_input).
  function brandAwareProjectStatus(project: any, status: { value: string; updatedAt?: number; runId?: string }) {
    if (status.value !== 'not_started') return status;
    const metadata = project?.metadata;
    if (metadata?.kind !== 'brand') return status;
    const brandId = typeof metadata.brandId === 'string' ? metadata.brandId : null;
    if (!brandId) return status;
    const brandMeta = readBrandMeta(BRANDS_DIR, brandId);
    if (!brandMeta) return status;
    const mapped =
      brandMeta.status === 'ready'
        ? 'succeeded'
        : brandMeta.status === 'failed'
          ? 'failed'
          : brandMeta.status === 'needs_input'
            ? 'awaiting_input'
            : 'running'; // 'extracting'
    return { ...status, value: mapped, updatedAt: status.updatedAt ?? brandMeta.updatedAt };
  }

  app.post('/api/projects', async (req, res) => {
    try {
      // Ordinary project creation is local. Capture any complete identity that
      // the Web already has for local attribution, but do not turn Workspace
      // directory availability into a Send dependency. Remote share/sync/move
      // routes retain their authoritative checks.
      const createWorkspace = {
        context: localProjectWorkspaceAttribution(req),
      };
      learnAssertedWorkspaceType(createWorkspace.context);
      const { id, name, projectLocationId, skillId, designSystemId, pendingPrompt, metadata, customInstructions, skipDiscoveryBrief } =
        req.body || {};
      if (typeof id !== 'string' || !isSafeId(id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }
      if (typeof name !== 'string' || !name.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'name required');
      }
      // baseDir is privileged: it lets a project root directly inside the
      // user's filesystem. The /api/import/folder endpoint is the only
      // path that's allowed to set it, because that's where realpath() +
      // RUNTIME_DATA_DIR reentry checks live. Block client-supplied
      // metadata.baseDir on this generic create endpoint so an attacker
      // can't smuggle e.g. /etc through here. Same rule for
      // originalBaseDir / importedFrom='folder' — only the import path
      // owns those state fields.
      if (metadata && typeof metadata === 'object') {
        if ('baseDir' in metadata) {
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'baseDir can only be set via POST /api/import/folder',
          );
        }
        if ('fromTrustedPicker' in metadata) {
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'fromTrustedPicker can only be set via POST /api/import/folder',
          );
        }
        if ('orchestratorWorkspace' in metadata) {
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'orchestratorWorkspace can only be set via POST /api/import/folder or POST /api/projects/:id/working-dir',
          );
        }
        // Reject invalid linked working directories up front (consistent with
        // PATCH /api/projects/:id) instead of silently dropping them. The
        // caller promises the agent `--add-dir` access to this folder; if the
        // path is deleted/inaccessible/a system dir, fail loudly so the client
        // can surface it rather than creating a project + auto-running a turn
        // whose linked-dir access never materialises.
        if (Array.isArray(metadata.linkedDirs)) {
          const validated = validateLinkedDirs(metadata.linkedDirs);
          if (validated.error) {
            return sendApiError(res, 400, 'INVALID_LINKED_DIR', validated.error);
          }
        }
      }
      if (customInstructions !== undefined
          && typeof customInstructions !== 'string'
          && customInstructions !== null) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'customInstructions must be a string or null');
      }
      if (typeof customInstructions === 'string' && customInstructions.length > 5000) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'customInstructions exceeds 5 000 character limit');
      }
      if (skipDiscoveryBrief !== undefined && typeof skipDiscoveryBrief !== 'boolean') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'skipDiscoveryBrief must be a boolean');
      }
      const creationWorkspaceScope = {
        workspaceId: createWorkspace.context?.workspaceId ?? null,
        workspaceMemberId: createWorkspace.context?.workspaceMemberId ?? null,
      };
      let skillCatalogScope: LocalCatalogScope | null;
      let designSystemCatalogScope: LocalCatalogScope | null;
      try {
        skillCatalogScope = parseLocalCatalogScope(
          req.body?.skillCatalogScope,
          'skillCatalogScope',
        );
        designSystemCatalogScope = parseLocalCatalogScope(
          req.body?.designSystemCatalogScope,
          'designSystemCatalogScope',
        );
      } catch (error) {
        return sendApiError(res, 400, 'BAD_REQUEST', String(error));
      }
      // A staged local resource can outlive the shell's current identity
      // snapshot while a Workspace switch is loading. Use the partition that
      // produced that exact selection for local lookup only. It does not bind
      // this local project to that Workspace or prove current membership.
      const designSystemValidation = await validateProjectDesignSystemId(
        designSystemId,
        designSystemCatalogScope ?? creationWorkspaceScope,
      );
      if (!designSystemValidation.ok) {
        return sendApiError(
          res,
          400,
          designSystemValidation.code,
          designSystemValidation.message,
        );
      }
      const normalizedDesignSystemId = designSystemValidation.id;
      const skillValidation = await validateProjectSkillId(
        skillId,
        skillCatalogScope ?? creationWorkspaceScope,
      );
      if (!skillValidation.ok) {
        return sendApiError(res, 400, skillValidation.code, skillValidation.message);
      }
      const normalizedSkillId = skillValidation.id;
      const requestedPluginId =
        typeof req.body?.pluginId === 'string' && req.body.pluginId.trim().length > 0
          ? req.body.pluginId.trim()
          : null;
      const requestedPluginSource =
        typeof req.body?.pluginSource === 'string' && req.body.pluginSource.trim().length > 0
          ? req.body.pluginSource.trim()
          : null;
      // Local identity resolution only. Do not compare this historical source
      // with the project's current Workspace or perform a membership request:
      // Home already reconciles staged selections against its current local
      // catalogue, and this project is local until a later share/sync/move.
      const selectedLocalPlugin = requestedPluginId && requestedPluginSource
        ? await ctx.pluginScope?.getLocalPluginBySource?.(
            requestedPluginId,
            requestedPluginSource,
          ) ?? null
        : null;
      if (requestedPluginId) {
        // Once a source is supplied, never substitute a same-id Personal or
        // other catalogue record. A missing local source is a missing plugin,
        // not a Workspace authorization verdict.
        const visiblePlugin = requestedPluginSource
          ? selectedLocalPlugin
          : ctx.pluginScope
            ? await ctx.pluginScope.getPlugin(requestedPluginId, creationWorkspaceScope)
            : getInstalledPlugin(db, requestedPluginId);
        if (!visiblePlugin) {
          return sendApiError(res, 404, 'PLUGIN_NOT_FOUND', 'plugin not found');
        }
      }
      const selectedLocationId = await resolveCreateProjectLocationId(projectLocationId);
      let externalProjectDir: string | null = null;
      if (selectedLocationId !== BUILT_IN_PROJECT_LOCATION_ID) {
        const location = (await configuredProjectLocations()).find((loc: any) => loc.id === selectedLocationId);
        if (!location || location.builtIn) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'unknown project location');
        }
        if (getProject(db, id)) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'project id already exists');
        }
        externalProjectDir = await createLocationProjectDir(location, id);
      }
      // Website Clone projects that already carry the target URL explicitly
      // skip the project-opening discovery brief: the URL *is* the brief —
      // the user asked for a reproduction, not a requirements interview, and
      // an unanswered question form just stalls the run (the agent then
      // "answers" it with conservative defaults). An explicit client-provided
      // skipDiscoveryBrief still wins in both directions.
      const webCloneUrlSkipsDiscovery =
        skipDiscoveryBrief === undefined
        && metadata && typeof metadata === 'object'
        && (metadata as { intent?: unknown }).intent === 'web-clone'
        && typeof pendingPrompt === 'string'
        && /https?:\/\/\S+/i.test(pendingPrompt);
      const localCatalogScopes = {
        ...(normalizedSkillId && skillCatalogScope ? { skill: skillCatalogScope } : {}),
        ...(normalizedDesignSystemId && designSystemCatalogScope
          ? { designSystem: designSystemCatalogScope }
          : {}),
      };
      const hasLocalCatalogScopes = Object.keys(localCatalogScopes).length > 0;
      // This metadata is daemon-owned. A caller may supply provenance through
      // the typed top-level fields, but cannot smuggle a different partition
      // inside the otherwise extensible project metadata object.
      const clientMetadata = metadata && typeof metadata === 'object'
        ? Object.fromEntries(
            Object.entries(metadata).filter(([key]) => (
              key !== 'localCatalogScopes'
              && key !== 'scenarioBinding'
              && key !== 'strategyBinding'
              && key !== 'exampleBinding'
            )),
          )
        : null;
      const baseProjectMetadata =
        clientMetadata
          ? {
              ...clientMetadata,
              ...(hasLocalCatalogScopes ? { localCatalogScopes } : {}),
              ...(skipDiscoveryBrief === true || webCloneUrlSkipsDiscovery
                ? { skipDiscoveryBrief: true }
                : {}),
              ...(externalProjectDir
                ? {
                    baseDir: externalProjectDir,
                    importedFrom: 'project-location',
                    projectLocationId: selectedLocationId,
                  }
                : {}),
              ...(Array.isArray(clientMetadata.linkedDirs)
                ? (() => {
                    const v = validateLinkedDirs(clientMetadata.linkedDirs);
                    return v.error ? {} : { linkedDirs: v.dirs };
                  })()
                : {}),
            }
          : skipDiscoveryBrief === true
            ? {
                skipDiscoveryBrief: true,
                ...(hasLocalCatalogScopes ? { localCatalogScopes } : {}),
                ...(externalProjectDir
                  ? {
                      baseDir: externalProjectDir,
                      importedFrom: 'project-location',
                      projectLocationId: selectedLocationId,
                    }
                  : {}),
              }
            : externalProjectDir
              ? {
                  kind: 'prototype',
                  baseDir: externalProjectDir,
                  importedFrom: 'project-location',
                  projectLocationId: selectedLocationId,
                }
              : hasLocalCatalogScopes
                ? {
                    localCatalogScopes,
                  }
                : null;
      const now = Date.now();
      const cid = randomId();
      const initialSessionMode = normalizeChatSessionMode(
        req.body?.conversationMode ?? req.body?.sessionMode,
      );
      const requestedAutomaticStrategyTaskProfile =
        req.body?.automaticStrategyTaskProfile === 'prototype'
        || req.body?.automaticStrategyTaskProfile === 'ppt'
        || req.body?.automaticStrategyTaskProfile === 'marketing'
        || req.body?.automaticStrategyTaskProfile === 'hyperframes'
          ? req.body.automaticStrategyTaskProfile
          : null;
      if (
        req.body?.automaticStrategyTaskProfile !== undefined
        && !requestedAutomaticStrategyTaskProfile
      ) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'automaticStrategyTaskProfile is invalid',
        );
      }
      const explicitPlugin =
        typeof req.body?.pluginId === 'string' && req.body.pluginId.trim().length > 0
          ? true
          : typeof req.body?.appliedPluginSnapshotId === 'string'
            && req.body.appliedPluginSnapshotId.trim().length > 0;
      // An official example card picked under a task type. It is a reference,
      // not a strategy: the project keeps its automatic OD Next route and the
      // example's SKILL.md travels as a user-selected Skill at run start. It
      // therefore deliberately does NOT participate in `explicitPlugin` — the
      // whole point is to stop pinning an executable plugin.
      //
      // Fail-closed like `automaticStrategyTaskProfile` above: a present but
      // unusable reference is a 400, never a silent drop, because a dropped
      // reference produces a run that looks correct and quietly lost the
      // example the user picked.
      const rawExampleReference = req.body?.exampleReference;
      let exampleBinding: ProjectMetadata['exampleBinding'] | null = null;
      if (rawExampleReference !== undefined) {
        const exampleReference =
          rawExampleReference && typeof rawExampleReference === 'object'
          && !Array.isArray(rawExampleReference)
            ? rawExampleReference as Record<string, unknown>
            : null;
        const examplePluginId = typeof exampleReference?.pluginId === 'string'
          ? exampleReference.pluginId.trim()
          : '';
        const exampleSource = typeof exampleReference?.source === 'string'
          ? exampleReference.source.trim()
          : '';
        if (!examplePluginId || !exampleSource) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'exampleReference is invalid');
        }
        // Contradictory claims. `pluginId`/`appliedPluginSnapshotId` say "run
        // this plugin as the strategy"; `exampleReference` says "keep the
        // automatic route and carry this example as reference material". A
        // request asserting both has no single correct reading, and guessing
        // one would silently decide the route for the user.
        if (explicitPlugin) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'exampleReference cannot be combined with pluginId or appliedPluginSnapshotId',
          );
        }
        // Re-resolve server-side through the same local lookup
        // `/api/plugins/:id/apply-local` uses, then read the example's bytes
        // from the record's own path. The request body contributes an identity
        // claim only; it never contributes content.
        const resolvedExample = await ctx.pluginScope?.getLocalPluginBySource?.(
          examplePluginId,
          exampleSource,
        ) ?? null;
        const resolvedExampleRecord = resolvedExample as
          { id?: unknown; source?: unknown; fsPath?: unknown } | null;
        if (
          !resolvedExampleRecord
          || resolvedExampleRecord.id !== examplePluginId
          || resolvedExampleRecord.source !== exampleSource
          || typeof resolvedExampleRecord.fsPath !== 'string'
          || !resolvedExampleRecord.fsPath
        ) {
          return sendApiError(res, 404, 'PLUGIN_NOT_FOUND', 'example plugin not found');
        }
        try {
          exampleBinding = createProjectExampleBinding({
            pluginId: examplePluginId,
            pluginSource: exampleSource,
            manifestSourceDigest: await digestExampleSkillManifest(
              resolvedExampleRecord.fsPath,
            ),
            boundAt: now,
          });
        } catch (error) {
          if (error instanceof InvalidProjectExampleBindingError) {
            return sendApiError(res, 400, 'BAD_REQUEST', error.message);
          }
          throw error;
        }
      }
      const automaticStrategyBinding = requestedAutomaticStrategyTaskProfile
        && initialSessionMode === 'design'
        && !explicitPlugin
          ? createAutomaticProjectStrategyBinding({
              metadata: baseProjectMetadata as ProjectMetadata | null,
              taskProfile: requestedAutomaticStrategyTaskProfile,
              boundAt: now,
            })
          : null;
      if (requestedAutomaticStrategyTaskProfile && !automaticStrategyBinding) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'automaticStrategyTaskProfile does not match this automatic Design route',
        );
      }
      const projectMetadata = automaticStrategyBinding || exampleBinding
        ? {
            ...(baseProjectMetadata ?? {}),
            ...(automaticStrategyBinding
              ? { strategyBinding: automaticStrategyBinding }
              : {}),
            ...(exampleBinding ? { exampleBinding } : {}),
          }
        : baseProjectMetadata;
      const defaultScenarioPluginId = defaultScenarioPluginIdForProjectMetadata(
        projectMetadata && typeof projectMetadata.kind === 'string'
          ? projectMetadata as Parameters<
              typeof defaultScenarioPluginIdForProjectMetadata
            >[0]
          : null,
      );
      const automaticDefaultRouting = initialSessionMode === 'design'
        && Boolean(defaultScenarioPluginId)
        && !explicitPlugin
        && !automaticStrategyBinding;
      let resolveBody =
        explicitPlugin ? (req.body as Record<string, unknown>) : null;
      if (!resolveBody && initialSessionMode === 'design' && !automaticStrategyBinding) {
        if (defaultScenarioPluginId && getInstalledPlugin(db, defaultScenarioPluginId)) {
          resolveBody = { ...(req.body || {}), pluginId: defaultScenarioPluginId };
        }
      }
      let project;
      const pluginResolutionState: {
        snapshot: ResolveSnapshotOk | null;
        failure: ResolveSnapshotError | null;
      } = { snapshot: null, failure: null };
      try {
        if (externalProjectDir) {
          await writeProjectManifest(externalProjectDir, {
            schemaVersion: 1,
            id,
            name: name.trim(),
            createdAt: now,
            updatedAt: now,
            skillId: normalizedSkillId,
            designSystemId: normalizedDesignSystemId,
          });
        }
        const registry = resolveBody
          ? await loadPluginRegistryView(
              selectedLocalPlugin
                ? localPluginRegistryScope(selectedLocalPlugin)
                : creationWorkspaceScope,
            )
          : null;
        let pluginForSnapshot = selectedLocalPlugin;
        if (requestedPluginId && requestedPluginSource) {
          // All preparation above is asynchronous. Re-resolve the exact local
          // source immediately before the synchronous SQLite transaction so a
          // reconciliation tombstone cannot leave a project/conversation or
          // snapshot behind. This is local catalogue freshness only: do not
          // turn it into a remote membership or current-Workspace gate.
          pluginForSnapshot = await ctx.pluginScope?.getLocalPluginBySource?.(
            requestedPluginId,
            requestedPluginSource,
          ) ?? null;
          if (!pluginForSnapshot) {
            if (externalProjectDir) {
              await rm(externalProjectDir, { recursive: true, force: true }).catch(() => {});
            }
            return sendApiError(res, 404, 'PLUGIN_NOT_FOUND', 'plugin not found');
          }
        }
        project = db.transaction(() => {
          let createdProject = insertProject(db, {
            id,
            name: name.trim(),
            skillId: normalizedSkillId,
            designSystemId: normalizedDesignSystemId,
            pendingPrompt: pendingPrompt || null,
            metadata: projectMetadata,
            customInstructions:
              typeof customInstructions === 'string'
                ? customInstructions
                : null,
            createdAt: now,
            updatedAt: now,
          });
          // Project, seed conversation, and workspace membership form one
          // ownership record. A binding failure must leave none of them behind.
          insertConversation(db, {
            id: cid,
            projectId: id,
            title: null,
            sessionMode: initialSessionMode,
            createdAt: now,
            updatedAt: now,
          });
          bindCreatedProjectToWorkspace(
            (input) => ensureWorkspaceProject(db, input),
            createWorkspace.context,
            id,
            now,
          );
          if (resolveBody && registry) {
            const resolved = resolvePluginSnapshot({
              db,
              body: resolveBody,
              projectId: id,
              conversationId: cid,
              registry,
              activeProjectDesignSystem:
                typeof normalizedDesignSystemId === 'string' && normalizedDesignSystemId.length > 0
                  ? { id: normalizedDesignSystemId }
                  : undefined,
              connectorProbe: buildConnectorProbe(connectorService),
              ...(pluginForSnapshot ? { plugin: pluginForSnapshot } : {}),
              ...(automaticDefaultRouting && defaultScenarioPluginId
                ? {
                    projectBinding: {
                      provenance: 'automatic_default' as const,
                      taskProfile: automaticScenarioTaskProfile({
                        metadata: projectMetadata as ProjectMetadata | null,
                        pluginId: defaultScenarioPluginId,
                      }),
                    },
                  }
                : {}),
            });
            if (resolved && !resolved.ok) {
              if (!explicitPlugin) {
                console.warn(
                  `[plugins] default-scenario fallback skipped for project ${id}: ${resolved.body?.error?.code ?? 'unknown'}`,
                );
              } else {
                pluginResolutionState.failure = resolved;
                throw new Error('explicit plugin resolution failed');
              }
            } else {
              pluginResolutionState.snapshot = resolved;
              if (resolved) createdProject = getProject(db, id) ?? createdProject;
            }
          }
          return createdProject;
        })();
      } catch (err) {
        // External directories cannot participate in SQLite's transaction.
        // Treat their creation as a recoverable side effect and compensate on
        // any manifest or database transaction failure.
        if (externalProjectDir) {
          await rm(externalProjectDir, { recursive: true, force: true }).catch(() => {});
        }
        if (pluginResolutionState.failure) {
          return res
            .status(pluginResolutionState.failure.status)
            .json(pluginResolutionState.failure.body);
        }
        throw err;
      }
      // For "from template" projects, seed the chosen template's snapshot
      // HTML into the new project folder so the agent can Read/edit files
      // on disk (the system prompt also embeds them, but a real on-disk
      // copy lets the agent treat them as the project's working state).
      if (
        metadata &&
        typeof metadata === 'object' &&
        metadata.kind === 'template' &&
        typeof metadata.templateId === 'string'
      ) {
        const tpl = getTemplate(db, metadata.templateId);
        if (tpl && Array.isArray(tpl.files) && tpl.files.length > 0) {
          await ensureProject(PROJECTS_DIR, id, projectMetadata);
          for (const f of tpl.files) {
            if (
              !f ||
              typeof f.name !== 'string' ||
              typeof f.content !== 'string'
            ) {
              continue;
            }
            try {
              await writeProjectFile(
                PROJECTS_DIR,
                id,
                f.name,
                Buffer.from(f.content, 'utf8'),
                {},
                projectMetadata,
              );
            } catch {
              // Skip individual file failures — the template snapshot is
              // best-effort; the agent still has the embedded copy.
            }
          }
        }
      }
      /** @type {import('@open-design/contracts').CreateProjectResponse} */
      const createdProject = pluginResolutionState.snapshot
        ? getProject(db, id) ?? project
        : project;
      const body = {
        // The binding above is part of the same transaction as the project and
        // seed conversation. Return that authority immediately so the Web can
        // scope its very first conversation/file reads without waiting for a
        // later list/detail round trip. Headerless legacy creates remain
        // explicitly unbound and therefore keep the original payload shape.
        project: createWorkspace.context
          ? { ...createdProject, workspaceId: createWorkspace.context.workspaceId }
          : createdProject,
        conversationId: cid,
        ...(pluginResolutionState.snapshot
          ? { appliedPluginSnapshotId: pluginResolutionState.snapshot.snapshotId }
          : {}),
      };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post('/api/projects/:id/scenario/restore-automatic', async (req, res) => {
    const project = getProject(db, req.params.id);
    if (!project) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
    }
    if (!await enforceWorkspaceProjectMutation(
      req,
      res,
      sendApiError,
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
      db,
      project.id,
      'rename',
    )) return;

    const request = req.body as Partial<RestoreProjectAutomaticScenarioRequest> | null;
    if (!request || !Object.prototype.hasOwnProperty.call(request, 'expectedCurrentSnapshotId')) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'expectedCurrentSnapshotId is required',
      );
    }
    if (
      request.expectedCurrentSnapshotId !== null
      && typeof request.expectedCurrentSnapshotId !== 'string'
    ) {
      return sendApiError(
        res,
        400,
        'BAD_REQUEST',
        'expectedCurrentSnapshotId must be a string or null',
      );
    }
    const currentSnapshotId = project.appliedPluginSnapshotId ?? null;
    if (request.expectedCurrentSnapshotId !== currentSnapshotId) {
      return sendApiError(
        res,
        409,
        'PROJECT_SCENARIO_CONFLICT',
        'project scenario changed; refresh before restoring the automatic scenario',
      );
    }

    const automaticStrategyTaskProfile = automaticStrategyTaskProfileForProjectMetadata(
      project.metadata,
    );
    if (automaticStrategyTaskProfile) {
      const currentStrategyBinding = readVerifiedProjectStrategyBinding(project.metadata);
      const strategyBinding = createAutomaticProjectStrategyBinding({
        metadata: project.metadata,
        taskProfile: automaticStrategyTaskProfile,
      });
      if (!strategyBinding) {
        return sendApiError(
          res,
          409,
          'DEFAULT_SCENARIO_UNAVAILABLE',
          'no automatic strategy route is available for this project',
        );
      }
      if (
        currentSnapshotId === null
        && currentStrategyBinding?.taskProfile === automaticStrategyTaskProfile
        && !project.metadata?.scenarioBinding
      ) {
        const body: RestoreProjectAutomaticScenarioResponse = {
          project,
          strategyBinding: currentStrategyBinding,
          changed: false,
        };
        return res.json(body);
      }

      const restored = db.transaction(() => {
        if (currentSnapshotId) {
          restoreProjectSnapshotLink(db, project.id, currentSnapshotId, null);
        }
        const metadata: ProjectMetadata = {
          ...(project.metadata ?? { kind: 'prototype' }),
          strategyBinding,
        };
        delete metadata.scenarioBinding;
        return updateProject(db, project.id, { metadata });
      })();
      if (!restored) {
        return sendApiError(
          res,
          409,
          'DEFAULT_SCENARIO_RESTORE_FAILED',
          'automatic strategy restoration failed',
        );
      }
      const body: RestoreProjectAutomaticScenarioResponse = {
        project: restored,
        strategyBinding,
        changed: true,
      };
      return res.json(body);
    }

    const defaultPluginId = defaultScenarioPluginIdForProjectMetadata(project.metadata);
    if (!defaultPluginId || !getInstalledPlugin(db, defaultPluginId)) {
      return sendApiError(
        res,
        409,
        'DEFAULT_SCENARIO_UNAVAILABLE',
        'no installed automatic scenario is available for this project',
      );
    }
    const taskProfile = automaticScenarioTaskProfile({
      metadata: project.metadata,
      pluginId: defaultPluginId,
    });
    const currentBinding = readVerifiedProjectScenarioBinding(db, {
      projectId: project.id,
      appliedPluginSnapshotId: currentSnapshotId,
      metadata: project.metadata,
    });
    if (
      currentBinding?.provenance === 'automatic_default'
      && currentBinding.snapshotId === currentSnapshotId
      && currentBinding.pluginId === defaultPluginId
      && (currentBinding.taskProfile ?? null) === taskProfile
    ) {
      const body: RestoreProjectAutomaticScenarioResponse = {
        project,
        scenarioBinding: currentBinding,
        changed: false,
      };
      return res.json(body);
    }

    const workspaceProject = getWorkspaceProjectByProjectId(db, project.id);
    const registry = await ctx.pluginScope?.loadRegistry({
      workspaceId: workspaceProject?.workspaceId == null
        ? null
        : String(workspaceProject.workspaceId),
      workspaceMemberId: typeof workspaceProject?.createdByWorkspaceMemberId === 'string'
        ? workspaceProject.createdByWorkspaceMemberId
        : null,
    });
    if (!registry) {
      return sendApiError(res, 503, 'PLUGIN_REGISTRY_UNAVAILABLE', 'plugin registry unavailable');
    }
    const conversationId = getFirstProjectConversation(db, project.id)?.id ?? null;
    const restore = db.transaction(():
      | { ok: true; resolved: ResolveSnapshotOk; project: NonNullable<ReturnType<typeof getProject>> }
      | { ok: false; failure: ResolveSnapshotError | null } => {
      const resolved = resolvePluginSnapshot({
        db,
        body: { pluginId: defaultPluginId },
        projectId: project.id,
        conversationId,
        registry,
        connectorProbe: buildConnectorProbe(connectorService),
        projectBinding: {
          provenance: 'automatic_default',
          taskProfile,
        },
      });
      if (!resolved || !resolved.ok) {
        return { ok: false, failure: resolved && !resolved.ok ? resolved : null };
      }
      const updated = getProject(db, project.id);
      if (!updated?.metadata?.scenarioBinding) {
        throw new Error('automatic scenario binding was not persisted');
      }
      return { ok: true, resolved, project: updated };
    });
    try {
      const outcome = restore();
      if (!outcome.ok) {
        if (outcome.failure) {
          return res.status(outcome.failure.status).json(outcome.failure.body);
        }
        return sendApiError(
          res,
          409,
          'DEFAULT_SCENARIO_RESTORE_FAILED',
          'automatic scenario restoration failed',
        );
      }
      const body: RestoreProjectAutomaticScenarioResponse = {
        project: outcome.project,
        scenarioBinding: outcome.project.metadata!.scenarioBinding!,
        changed: outcome.resolved.snapshotId !== currentSnapshotId,
      };
      return res.json(body);
    } catch (error) {
      console.warn('[projects] automatic scenario restore failed', error);
      return sendApiError(
        res,
        409,
        'DEFAULT_SCENARIO_RESTORE_FAILED',
        'automatic scenario restoration failed; the existing project pin was preserved',
      );
    }
  });

  app.post('/api/projects/:id/duplicate', async (req, res) => {
    const sourceProject = getProject(db, req.params.id);
    try {
      const locations = await configuredProjectLocations();
      if (!sourceProject || !projectVisibleForLocations(sourceProject, locations)) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      }
      const createHome = await resolveCreatedProjectHome(req);
      // recvqbhor3pai2: a project this daemon has never bound anywhere (e.g.
      // a copy left unbound by an earlier headerless duplicate — see
      // `bindDuplicateIntoRequestWorkspace`'s doc comment) must not be
      // permanently un-duplicatable the moment a real, authenticated request
      // finally comes in for it. Claim it into the caller's own workspace
      // first, exactly like this same route already does for the COPY it is
      // about to create.
      reconcileUnboundProjectBeforeMutation(req, sourceProject.id, createHome);
      if (!await enforceWorkspaceProjectMutation(
        req,
        res,
        sendApiError,
        getWorkspaceProject,
        getWorkspaceProjectByProjectId,
        db,
        sourceProject.id,
        'duplicate',
      )) return;
      if (isDesignSystemLikeProject(sourceProject)) {
        return sendApiError(
          res,
          400,
          'PROJECT_ALREADY_DESIGN_SYSTEM',
          'project is already a design-system workspace',
        );
      }

      const targetProjectId = randomId();
      const targetName = normalizeProjectDuplicateName(req.body?.name, sourceProject);
      const metadata = cloneProjectMetadataForDuplicate(sourceProject);
      let insertedProject = false;
      try {
        await ensureProject(PROJECTS_DIR, targetProjectId, metadata);
        const sourceFiles = await listFiles(PROJECTS_DIR, sourceProject.id, {
          metadata: sourceProject.metadata,
        });
        const copiedFiles: string[] = [];
        for (const file of sourceFiles) {
          if (!file?.name || typeof file.name !== 'string') continue;
          const sourceFile = await readProjectFile(
            PROJECTS_DIR,
            sourceProject.id,
            file.name,
            sourceProject.metadata,
          );
          await writeProjectFile(
            PROJECTS_DIR,
            targetProjectId,
            sourceFile.name,
            sourceFile.buffer,
            {
              overwrite: true,
              ...(sourceFile.artifactManifest ? { artifactManifest: sourceFile.artifactManifest } : {}),
            },
            metadata,
          );
          copiedFiles.push(sourceFile.name);
        }

        const now = Date.now();
        const project = insertProject(db, {
          id: targetProjectId,
          name: targetName,
          skillId: sourceProject.skillId ?? null,
          designSystemId: sourceProject.designSystemId ?? null,
          pendingPrompt: null,
          metadata,
          customInstructions: sourceProject.customInstructions ?? null,
          createdAt: now,
          updatedAt: now,
        });
        insertedProject = true;
        bindDuplicateIntoRequestWorkspace(createHome, targetProjectId, now);
        const conversationId = randomId();
        insertConversation(db, {
          id: conversationId,
          projectId: targetProjectId,
          title: null,
          sessionMode: 'design',
          createdAt: now,
          updatedAt: now,
        });
        try {
          const tabs = listTabs(db, sourceProject.id);
          setTabs(db, targetProjectId, tabs);
        } catch {
          // Open-tabs state is convenience metadata; file duplication succeeds
          // without it.
        }
        /** @type {import('@open-design/contracts').DuplicateProjectResponse} */
        const body = {
          project: createHome
            ? { ...project, workspaceId: createHome.workspaceId }
            : project,
          conversationId,
          copiedFiles,
        };
        res.json(body);
      } catch (err) {
        if (insertedProject) dbDeleteProject(db, targetProjectId);
        await removeProjectDir(PROJECTS_DIR, targetProjectId).catch(() => {});
        throw err;
      }
    } catch (err: any) {
      if (err instanceof CreatedProjectWorkspaceResolutionError) {
        return sendApiError(
          res,
          err.status,
          err.code,
          err.message,
          err.retryable ? { retryable: true } : {},
        );
      }
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post('/api/projects/:id/design-system-copy', async (req, res) => {
    const sourceProject = getProject(db, req.params.id);
    try {
      const locations = await configuredProjectLocations();
      if (!sourceProject || !projectVisibleForLocations(sourceProject, locations)) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      }
      const createHome = await resolveCreatedProjectHome(req);
      // recvqbhor3pai2 — same reasoning as the sibling /duplicate route just
      // above: a never-bound source project must not be permanently
      // un-copyable once a real, authenticated request finally names it.
      reconcileUnboundProjectBeforeMutation(req, sourceProject.id, createHome);
      if (!await enforceWorkspaceProjectMutation(
        req,
        res,
        sendApiError,
        getWorkspaceProject,
        getWorkspaceProjectByProjectId,
        db,
        sourceProject.id,
        'duplicate',
      )) return;
      if (isDesignSystemLikeProject(sourceProject)) {
        return sendApiError(
          res,
          400,
          'PROJECT_ALREADY_DESIGN_SYSTEM',
          'project is already a design-system workspace',
        );
      }

      const targetProjectId = randomId();
      const targetName = normalizeDesignSystemCopyName(req.body?.name, sourceProject);
      const requestedPendingPrompt = normalizePendingPrompt(req.body?.pendingPrompt);
      const sourceNotes = `Created from OpenDesign project "${sourceProject.name}" (${sourceProject.id}).`;
      let createdDesignSystemId: string | null = null;
      let insertedProject = false;
      try {
        const createDesignSystem = ctx.createWorkspaceOwnedDesignSystem
          ?? ((root: string, input: UserDesignSystemInput, context: WorkspaceResourceContext | null) =>
            createUserDesignSystem(root, {
              ...input,
              ...(context ? { workspaceId: context.workspaceId } : {}),
            }));
        const designSystem = await createDesignSystem(USER_DESIGN_SYSTEMS_DIR, {
          title: targetName,
          summary: sourceNotes,
          category: 'Project Design System',
          surface: 'web',
          status: 'draft',
          artifactMode: 'agent-managed',
          sourceNotes,
          provenance: {
            notes: sourceNotes,
            sourceNotes,
          },
        }, createHome);
        createdDesignSystemId = designSystem.id;

        const metadata = {
          kind: 'other',
          importedFrom: 'design-system',
          entryFile: 'DESIGN.md',
          sourceFileName: designSystem.id,
          nameSource: 'generated',
          sourceProjectId: sourceProject.id,
          sourceProjectName: sourceProject.name,
        };
        await ensureProject(PROJECTS_DIR, targetProjectId, metadata);

        const sourceFiles = await listFiles(PROJECTS_DIR, sourceProject.id, {
          metadata: sourceProject.metadata,
        });
        const copiedFiles: string[] = [];
        for (const file of sourceFiles) {
          if (!file?.name || typeof file.name !== 'string') continue;
          const sourceFile = await readProjectFile(
            PROJECTS_DIR,
            sourceProject.id,
            file.name,
            sourceProject.metadata,
          );
          await writeProjectFile(
            PROJECTS_DIR,
            targetProjectId,
            sourceFile.name,
            sourceFile.buffer,
            {
              overwrite: true,
              ...(sourceFile.artifactManifest ? { artifactManifest: sourceFile.artifactManifest } : {}),
            },
            metadata,
          );
          copiedFiles.push(sourceFile.name);
        }

        const pendingPrompt = requestedPendingPrompt ?? buildDesignSystemCopyPendingPrompt({
          sourceProject,
          targetProjectId,
          designSystemId: designSystem.id,
          copiedFiles,
        });
        const now = Date.now();
        const project = insertProject(db, {
          id: targetProjectId,
          name: targetName,
          skillId: null,
          designSystemId: designSystem.id,
          pendingPrompt,
          metadata,
          customInstructions: null,
          createdAt: now,
          updatedAt: now,
        });
        insertedProject = true;
        bindDuplicateIntoRequestWorkspace(createHome, targetProjectId, now);
        const conversationId = randomId();
        insertConversation(db, {
          id: conversationId,
          projectId: targetProjectId,
          title: null,
          sessionMode: 'design',
          createdAt: now,
          updatedAt: now,
        });

        await writeProjectFile(
          PROJECTS_DIR,
          targetProjectId,
          'context/source-context.md',
          Buffer.from(
            buildDesignSystemCopySourceContext({
              sourceProject,
              targetProjectId,
              designSystemId: designSystem.id,
              copiedFiles,
              skippedFiles: [],
            }),
            'utf8',
          ),
          { overwrite: true },
          metadata,
        );
        await linkUserDesignSystemProject(USER_DESIGN_SYSTEMS_DIR, designSystem.id, targetProjectId);
        /** @type {import('@open-design/contracts').CreateDesignSystemProjectFromProjectResponse} */
        const body = {
          project: createHome
            ? { ...project, workspaceId: createHome.workspaceId }
            : project,
          conversationId,
          designSystemId: designSystem.id,
          copiedFiles,
        };
        res.json(body);
      } catch (err) {
        if (insertedProject) dbDeleteProject(db, targetProjectId);
        await removeProjectDir(PROJECTS_DIR, targetProjectId).catch(() => {});
        if (createdDesignSystemId) {
          await deleteUserDesignSystem(USER_DESIGN_SYSTEMS_DIR, createdDesignSystemId).catch(() => false);
        }
        throw err;
      }
    } catch (err: any) {
      if (err instanceof CreatedProjectWorkspaceResolutionError) {
        return sendApiError(
          res,
          err.status,
          err.code,
          err.message,
          err.retryable ? { retryable: true } : {},
        );
      }
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects/:id', async (req, res) => {
    const project = getProject(db, req.params.id);
    const locations = await configuredProjectLocations();
    if (!project || !projectVisibleForLocations(project, locations))
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
    if (!await authorizeProjectRequest(req, res, project.id, { mode: 'read' })) return;
    // When a caller is about to *reference* this project (add it as read-only
    // context for another run), materialize its managed folder first so the
    // reference resolves to a real directory. See ensureReferencedProjectDir.
    if (req.query.ensureDir === '1' || req.query.ensureDir === 'true') {
      try {
        await ensureReferencedProjectDir(PROJECTS_DIR, project, ensureProject);
      } catch (err: any) {
        return sendApiError(
          res,
          500,
          'PROJECT_DIR_MATERIALIZATION_FAILED',
          String(err?.message || err),
        );
      }
    }
    const resolvedDir = projectDetailResolvedDir(PROJECTS_DIR, project, resolveProjectDir);
    const binding = getWorkspaceProjectByProjectId(db, project.id);
    /** @type {import('@open-design/contracts').ProjectResponse} */
    const body = {
      project: {
        ...project,
        workspaceId:
          typeof binding?.workspaceId === 'string' && binding.workspaceId.trim()
            ? binding.workspaceId.trim()
            : null,
      },
      resolvedDir,
    };
    res.json(body);
  });

  app.get('/api/projects/:id/workspace-scope', async (req, res) => {
    const project = getProject(db, req.params.id);
    const locations = await configuredProjectLocations();
    if (!project || !projectVisibleForLocations(project, locations)) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
    }
    const binding = getWorkspaceProjectByProjectId(db, project.id);
    if (!await authorizeProjectRequest(req, res, project.id, { mode: 'read' })) return;
    const claimed = workspaceProjectContextFromRequest(req);
    const assertedType = headerValue(req, 'x-od-workspace-type');
    const requestWorkspaceType = assertedType === 'team' || assertedType === 'personal'
      ? assertedType
      : null;
    if (binding?.workspaceId && requestWorkspaceType) {
      workspaceTypes?.learn({
        workspaceId: binding.workspaceId,
        workspaceType: requestWorkspaceType,
      });
    }
    const scope = resolveLocalProjectWorkspaceScope({
      projectId: project.id,
      binding,
      requestWorkspaceMemberId:
        claimed && claimed !== 'missing' ? claimed.workspaceMemberId : null,
      requestWorkspaceType,
      knownWorkspaceType: workspaceTypes?.typeOf(binding?.workspaceId) ?? null,
      ...(ctx.configuredEnv ? { configuredEnv: ctx.configuredEnv() } : {}),
    });
    /** @type {import('@open-design/contracts').ProjectWorkspaceScopeResponse} */
    const body = { scope };
    res.json(body);
  });

  app.patch('/api/projects/:id', async (req, res) => {
    try {
      const patch = req.body || {};
      let patchProject = getProject(db, req.params.id);
      if (
        !patchProject
        && typeof patch.name === 'string'
        && patch.name.trim().length > 0
      ) {
        // A Team owner can open this project from Vela's catalog on a second
        // device before the local daemon has pulled either its SQLite row or
        // its files. The catalog summary correctly advertises `canRename`, so
        // materialize that exact Team project before applying the rename.
        //
        // Never infer scope from active/default Workspace state: only a
        // complete request assertion that passes the fresh authority verifier
        // may select the catalog principal. The materializer then rechecks the
        // exact Workspace, project, resource id, and recorded project owner.
        const asserted = workspaceProjectContextFromRequest(req);
        if (asserted && asserted !== 'missing') {
          const renameCtx = await authoritativeWorkspaceProjectContext(
            req,
            res,
            asserted.workspaceId,
          );
          if (!renameCtx) return;
          const materialization = await materializeCatalogOnlyOwnerProject(
            req.params.id,
            renameCtx,
          );
          if (materialization === 'denied') {
            return sendApiError(
              res,
              403,
              'WORKSPACE_PROJECT_PERMISSION_DENIED',
              'project rename forbidden',
            );
          }
          if (materialization === 'unavailable') {
            return sendApiError(
              res,
              503,
              'UPSTREAM_UNAVAILABLE',
              'team project content is temporarily unavailable',
              { retryable: true },
            );
          }
          if (materialization === 'materialized') {
            patchProject = getProject(db, req.params.id);
          }
        }
      }
      if (!patchProject) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      }
      if (!await enforceWorkspaceProjectMutation(
        req,
        res,
        sendApiError,
        getWorkspaceProject,
        getWorkspaceProjectByProjectId,
        db,
        patchProject.id,
        'rename',
      )) return;
      // baseDir / folder-import state is privileged: it's set only by the
      // import endpoint and otherwise immutable. Two failure modes to
      // guard against here:
      //   1. Explicit attempt to change baseDir → reject with 400.
      //   2. A regular metadata patch that *omits* baseDir (e.g. a UI
      //      that only edits linkedDirs sends `{ metadata: { kind, linkedDirs } }`).
      //      updateProject() replaces metadata wholesale, so without
      //      preservation the existing baseDir gets wiped and the project
      //      detaches from the user's folder — subsequent reads/writes
      //      silently fall back to .od/projects/<id>.
      // For case 2 we re-stamp the immutable fields from the existing
      // project record onto the incoming patch so the user can keep
      // patching other metadata without ever losing their import root.
      if (patch.metadata === null) {
        const existing = getProject(db, req.params.id);
        if (existing?.metadata?.strategyBinding) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'metadata cannot be cleared while strategyBinding is daemon-owned',
          );
        }
        if (existing?.metadata?.exampleBinding) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'metadata cannot be cleared while exampleBinding is daemon-owned',
          );
        }
        if (existing?.metadata?.baseDir) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'metadata cannot be cleared for imported projects',
          );
        }
      }
      if (patch.metadata && typeof patch.metadata === 'object') {
        const existing = getProject(db, req.params.id);
        const existingMeta = existing?.metadata;
        if (
          'localCatalogScopes' in patch.metadata
          && !sameLocalCatalogScopes(
            patch.metadata.localCatalogScopes,
            existingMeta?.localCatalogScopes,
          )
        ) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'localCatalogScopes can only be set during project creation',
          );
        }
        if (
          'scenarioBinding' in patch.metadata
          && JSON.stringify(patch.metadata.scenarioBinding)
            !== JSON.stringify(existingMeta?.scenarioBinding)
        ) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'scenarioBinding is daemon-owned',
          );
        }
        if (
          'strategyBinding' in patch.metadata
          && JSON.stringify(patch.metadata.strategyBinding)
            !== JSON.stringify(existingMeta?.strategyBinding)
        ) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'strategyBinding is daemon-owned',
          );
        }
        if (
          'exampleBinding' in patch.metadata
          && JSON.stringify(patch.metadata.exampleBinding)
            !== JSON.stringify(existingMeta?.exampleBinding)
        ) {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'exampleBinding is daemon-owned',
          );
        }
        if ('fromTrustedPicker' in patch.metadata
            && patch.metadata.fromTrustedPicker !== existingMeta?.fromTrustedPicker) {
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'fromTrustedPicker can only be set via POST /api/import/folder',
          );
        }
        if ('orchestratorWorkspace' in patch.metadata) {
          const parsedOrchestratorWorkspace = parseOrchestratorWorkspace(
            patch.metadata.orchestratorWorkspace,
          );
          if (!parsedOrchestratorWorkspace.ok) {
            return sendApiError(
              res,
              400,
              'BAD_REQUEST',
              parsedOrchestratorWorkspace.message,
            );
          }
        }
        if (existingMeta?.baseDir) {
          if ('orchestratorWorkspace' in patch.metadata) {
            if (
              existingMeta.orchestratorWorkspace == null ||
              !sameOrchestratorWorkspace(
                patch.metadata.orchestratorWorkspace,
                existingMeta.orchestratorWorkspace,
              )
            ) {
              return sendApiError(
                res, 400, 'BAD_REQUEST',
                'orchestratorWorkspace is immutable after import; use the working-dir route to change it',
              );
            }
          }
          if ('baseDir' in patch.metadata && patch.metadata.baseDir !== existingMeta.baseDir) {
            return sendApiError(
              res, 400, 'BAD_REQUEST',
              'baseDir is immutable after import; use a new import to change it',
            );
          }
          patch.metadata = {
            ...patch.metadata,
            ...(existingMeta?.localCatalogScopes
              ? { localCatalogScopes: existingMeta.localCatalogScopes }
              : {}),
            baseDir: existingMeta.baseDir,
            ...(existingMeta.importedFrom === 'folder'
              ? { importedFrom: 'folder' }
              : {}),
            ...(existingMeta.importedFrom === 'project-location'
              ? { importedFrom: 'project-location' }
              : {}),
            ...(typeof existingMeta.projectLocationId === 'string'
              ? { projectLocationId: existingMeta.projectLocationId }
              : {}),
            ...(existingMeta.fromTrustedPicker === true
              ? { fromTrustedPicker: true as const }
              : {}),
            ...(existingMeta.orchestratorWorkspace
              ? { orchestratorWorkspace: existingMeta.orchestratorWorkspace }
              : {}),
          };
        } else if ('baseDir' in patch.metadata) {
          // Non-imported project trying to acquire a baseDir → reject (only
          // /api/import/folder can set it).
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'baseDir can only be set via POST /api/import/folder',
          );
        } else if ('orchestratorWorkspace' in patch.metadata) {
          return sendApiError(
            res, 400, 'BAD_REQUEST',
            'orchestratorWorkspace can only be set via POST /api/import/folder or POST /api/projects/:id/working-dir',
          );
        } else if (existingMeta?.localCatalogScopes) {
          patch.metadata = {
            ...patch.metadata,
            localCatalogScopes: existingMeta.localCatalogScopes,
          };
        }
        if (existingMeta?.scenarioBinding) {
          patch.metadata = {
            ...patch.metadata,
            scenarioBinding: existingMeta.scenarioBinding,
          };
        }
        if (existingMeta?.strategyBinding) {
          patch.metadata = {
            ...patch.metadata,
            strategyBinding: existingMeta.strategyBinding,
          };
        }
        // `updateProject` replaces metadata wholesale, so a patch that simply
        // omits the daemon-owned example binding would erase the user's
        // example without ever naming it.
        if (existingMeta?.exampleBinding) {
          patch.metadata = {
            ...patch.metadata,
            exampleBinding: existingMeta.exampleBinding,
          };
        }
      }
      if (patch.metadata?.linkedDirs) {
        const existing = getProject(db, req.params.id);
        const validated = validateLinkedDirs(patch.metadata.linkedDirs);
        if (validated.error) {
          return sendApiError(res, 400, 'INVALID_LINKED_DIR', validated.error);
        }
        patch.metadata.linkedDirs =
          existing?.metadata?.fromTrustedPicker === true
            ? patch.metadata.linkedDirs
            : validated.dirs;
      }
      if (patch.customInstructions !== undefined
          && typeof patch.customInstructions !== 'string'
          && patch.customInstructions !== null) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'customInstructions must be a string or null');
      }
      if (typeof patch.customInstructions === 'string' && patch.customInstructions.length > 5000) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'customInstructions exceeds 5 000 character limit');
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'designSystemId')) {
        const projectBinding = getWorkspaceProjectByProjectId(db, req.params.id);
        const designSystemValidation = await validateProjectDesignSystemId(
          patch.designSystemId,
          {
            workspaceId: projectBinding?.workspaceId ?? null,
            workspaceMemberId: projectBinding?.createdByWorkspaceMemberId ?? null,
          },
        );
        if (!designSystemValidation.ok) {
          return sendApiError(
            res,
            400,
            designSystemValidation.code,
            designSystemValidation.message,
          );
        }
        patch.designSystemId = designSystemValidation.id;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'skillId')) {
        const projectBinding = getWorkspaceProjectByProjectId(db, req.params.id);
        const skillValidation = await validateProjectSkillId(
          patch.skillId,
          {
            workspaceId: projectBinding?.workspaceId ?? null,
            workspaceMemberId: projectBinding?.createdByWorkspaceMemberId ?? null,
          },
        );
        if (!skillValidation.ok) {
          return sendApiError(res, 400, skillValidation.code, skillValidation.message);
        }
        patch.skillId = skillValidation.id;
      }
      if (
        (Object.prototype.hasOwnProperty.call(patch, 'skillId')
          && patch.skillId !== patchProject.skillId)
        || (Object.prototype.hasOwnProperty.call(patch, 'designSystemId')
          && patch.designSystemId !== patchProject.designSystemId)
      ) {
        const currentMetadata = patch.metadata && typeof patch.metadata === 'object'
          ? patch.metadata
          : patchProject.metadata;
        const currentScopes = currentMetadata?.localCatalogScopes;
        if (currentScopes) {
          const nextScopes = { ...currentScopes };
          if (
            Object.prototype.hasOwnProperty.call(patch, 'skillId')
            && patch.skillId !== patchProject.skillId
          ) delete nextScopes.skill;
          if (
            Object.prototype.hasOwnProperty.call(patch, 'designSystemId')
            && patch.designSystemId !== patchProject.designSystemId
          ) delete nextScopes.designSystem;
          const { localCatalogScopes: _localCatalogScopes, ...metadataWithoutScopes } =
            currentMetadata;
          patch.metadata = Object.keys(nextScopes).length > 0
            ? { ...metadataWithoutScopes, localCatalogScopes: nextScopes }
            : metadataWithoutScopes;
        }
      }
      if (typeof patch.name === 'string' && patch.name.trim().length > 0) {
        // Design-system workspace projects mirror their design system's
        // title: the workspace ensure re-stamps the project name from the
        // registry on every open, so a rename applied only to the project
        // row silently reverts. Write the rename through to the design
        // system so both records agree.
        const existing = getProject(db, req.params.id);
        if (existing) {
          // Decide from the post-patch shape (updateProject merges the
          // patch shallowly over the row), so a PATCH that also rebinds
          // or detaches the design system only ever renames the system
          // the project remains bound to after this request.
          const projectBinding = getWorkspaceProjectByProjectId(db, req.params.id);
          const propagation = await propagateWorkspaceProjectRename(
            resolveWorkspaceProjectDesignSystemRoot(
              USER_DESIGN_SYSTEMS_DIR,
              projectBinding,
            ),
            { ...existing, ...patch },
            patch.name,
          );
          if (propagation === 'failed') {
            return sendApiError(
              res, 409, 'CONFLICT',
              'rename could not be written through to the bound design system; project left unchanged',
            );
          }
        }
      }
      const project = updateProject(db, req.params.id, patch);
      if (!project)
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      if (typeof patch.name === 'string' && patch.name.trim().length > 0) {
        // Write the rename through to the team catalog. Metadata-only changes
        // never trigger a content publish, so without this a rename only
        // reached teammates after the NEXT file edit — or never.
        ctx.collabSync.refreshTeamProjectMetadata(req.params.id);
      }
      /** @type {import('@open-design/contracts').ProjectResponse} */
      const body = { project };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      }
      if (!await enforceWorkspaceProjectMutation(
        req,
        res,
        sendApiError,
        getWorkspaceProject,
        getWorkspaceProjectByProjectId,
        db,
        project.id,
        'delete',
      )) return;
      // spec 04 §11: a team-visible project must be unshared from the hub
      // BEFORE it disappears locally — mirrors the 'personal' branch of
      // /move's `requestTeamVisibility`, the one other place this daemon
      // already knows how to take a project out of the team space. Without
      // this, `dbDeleteProject` only ever touches THIS caller's own
      // `workspace_projects` row: the hub's published resource (and every
      // OTHER member's already-bound local row) never learns the project is
      // gone, so teammates keep seeing it. `enforceWorkspaceProjectMutation`
      // just above already proved the caller may mutate this exact row, so
      // no separate `canShareProjects` gate is layered on top here — the
      // whole project is about to stop existing regardless.
      const workspaceRow = getWorkspaceProjectByProjectId(db, project.id);
      if (workspaceRow?.visibility === 'team') {
        // Same context the gate above allowed this delete under — NOT a fresh
        // header read, which is null for a headerless caller and would skip the
        // hub work while still deleting locally.
        const teamCtx = await verifiedWorkspaceProjectContext(req);
        if (!teamCtx) {
          // Unreachable while the gate is intact: it admits a team-bound row only
          // for an explicit authoritative identity. Refuse rather than
          // fall through, so a future gate change cannot quietly reintroduce a
          // local-only delete of a still-shared project.
          return sendApiError(
            res,
            401,
            'WORKSPACE_CONTEXT_REQUIRED',
            'workspace context is required to unshare this project before deleting it',
          );
        }
        await requestTeamVisibility([project.id], teamCtx, 'personal');
      }
      // Stop any live agent run in this project before its row and directory
      // are removed, otherwise the CLI subprocess is orphaned — it keeps
      // billing and writes into a directory that no longer exists (#5468).
      await cancelRunsOwnedBy(design.runs, { projectId: req.params.id });
      dbDeleteProject(db, req.params.id);
      await removeProjectDir(PROJECTS_DIR, req.params.id).catch(() => {});
      /** @type {import('@open-design/contracts').OkResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // SSE stream of file-changed events for a project. Drives preview live-reload.
  // Receipt of a `file-changed` event triggers a file-list refresh, which
  // propagates new mtimes through to FileViewer iframes (the URL-load
  // `?v=${mtime}` cache-bust from PR #384 then reloads the iframe automatically).
  // Subscribers come and go as users open/close project tabs; the underlying
  // chokidar watcher is refcounted in project-watchers.ts so we never hold
  // descriptors for projects no UI is looking at.
  app.get('/api/projects/:id/events', async (req, res) => {
    if (!getProject(db, req.params.id)) {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
    }
    if (!await authorizeProjectRequest(
      req,
      res,
      req.params.id,
      { mode: 'read', allowNavigationQuery: true },
    )) return;
    let sub: any;
    try {
      const sse = createSseResponse(res);
      const projectEventSink = (payload: any) => {
        sse.send(payload.type, payload);
      };
      let sinks = activeProjectEventSinks.get(req.params.id);
      if (!sinks) {
        sinks = new Set();
        activeProjectEventSinks.set(req.params.id, sinks);
      }
      sinks.add(projectEventSink);
      const watchProject = getProject(db, req.params.id);
      sub = subscribeFileEvents(PROJECTS_DIR, req.params.id, (evt: any) => {
        sse.send('file-changed', evt);
      }, { metadata: watchProject?.metadata });
      sub.ready.then(() => sse.send('ready', { projectId: req.params.id })).catch(() => {});
      const cleanup = () => {
        if (sub) {
          const { unsubscribe } = sub;
          sub = null;
          Promise.resolve(unsubscribe()).catch(() => {});
        }
        const currentSinks = activeProjectEventSinks.get(req.params.id);
        currentSinks?.delete(projectEventSink);
        if (currentSinks?.size === 0) activeProjectEventSinks.delete(req.params.id);
      };
      res.on('close', cleanup);
      res.on('finish', cleanup);
    } catch (err: any) {
      if (sub) Promise.resolve(sub.unsubscribe()).catch(() => {});
      if (!res.headersSent) sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  // Comments have no workspace binding of their own — thread down the SAME
  // authoritative `enforceWorkspaceProjectMutation` instance so a comment's
  // gate matches its parent project's exactly, instead of comments quietly
  // shipping a second, weaker copy.
  registerProjectConversationRoutes(app, {
    ...ctx,
    enforceWorkspaceProjectMutation,
    authorizeProjectRequest,
    sendApiError,
  });

  // ---- Tabs -----------------------------------------------------------------

  app.get('/api/projects/:id/tabs', async (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    if (!await authorizeProjectRequest(req, res, req.params.id, { mode: 'read' })) return;
    res.json(listTabs(db, req.params.id));
  });

  app.put('/api/projects/:id/tabs', async (req, res) => {
    if (!getProject(db, req.params.id)) {
      return res.status(404).json({ error: 'project not found' });
    }
    if (!await enforceWorkspaceProjectMutation(
      req,
      res,
      sendApiError,
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
      db,
      req.params.id,
      'writeFiles',
    )) return;
    const { tabs = [], active = null, browserTabs = [] } = req.body || {};
    if (!Array.isArray(tabs) || !tabs.every((t) => typeof t === 'string')) {
      return res.status(400).json({ error: 'tabs must be string[]' });
    }
    if (!Array.isArray(browserTabs)) {
      return res.status(400).json({ error: 'browserTabs must be an array' });
    }
    const result = setTabs(
      db,
      req.params.id,
      {
        tabs,
        active: typeof active === 'string' ? active : null,
        browserTabs,
      },
    );
    res.json(result);
  });

  // ---- Templates ----------------------------------------------------------
  // User-saved snapshots of a project's HTML files. Surfaced in the
  // "From template" tab of the new-project panel so a user can spin up
  // a fresh project pre-seeded with another project's design as a
  // starting point. Created via the project's Share menu (snapshots
  // every .html file in the project folder at the moment of save).

  app.get('/api/templates', (_req, res) => {
    res.json({ templates: listTemplates(db) });
  });

  app.get('/api/templates/:id', (req, res) => {
    const t = getTemplate(db, req.params.id);
    if (!t) return res.status(404).json({ error: 'not found' });
    res.json({ template: t });
  });

  app.post('/api/templates', async (req, res) => {
    try {
      const { name, description, sourceProjectId } = req.body || {};
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'name required' });
      }
      if (name.length > 100) {
        return res.status(400).json({ error: 'name must be 100 characters or fewer' });
      }
      if (typeof sourceProjectId !== 'string') {
        return res.status(400).json({ error: 'sourceProjectId required' });
      }
      const sourceProject = getProject(db, sourceProjectId);
      if (!sourceProject) {
        return res.status(404).json({ error: 'source project not found' });
      }
      // Snapshot every HTML / sketch / text file in the source project.
      // We deliberately skip binary uploads — templates are about the
      // generated design, not the user's reference imagery.
      const files = await listFiles(PROJECTS_DIR, sourceProjectId, {
        metadata: sourceProject.metadata,
      });
      const snapshot = [];
      for (const f of files) {
        if (f.kind !== 'html' && f.kind !== 'text' && f.kind !== 'code')
          continue;
        const entry = await readProjectFile(
          PROJECTS_DIR,
          sourceProjectId,
          f.name,
          sourceProject.metadata,
        );
        if (entry && Buffer.isBuffer(entry.buffer)) {
          snapshot.push({
            name: f.name,
            content: entry.buffer.toString('utf8'),
          });
        }
      }
      const trimmedName = name.trim();
      const descValue = typeof description === 'string' ? description : null;
      const existing = findTemplateByNameAndProject(db, trimmedName, sourceProjectId);
      let t;
      if (existing) {
        t = updateTemplate(db, existing.id, {
          description: descValue,
          files: snapshot,
        });
      } else {
        t = insertTemplate(db, {
          id: randomId(),
          name: trimmedName,
          description: descValue,
          sourceProjectId,
          files: snapshot,
          createdAt: Date.now(),
        });
      }
      res.json({ template: t });
    } catch (err: any) {
      res.status(400).json({ error: String(err) });
    }
  });

  app.delete('/api/templates/:id', (req, res) => {
    deleteTemplate(db, req.params.id);
    res.json({ ok: true });
  });

}

export interface RegisterProjectArtifactRoutesDeps extends RouteDeps<'http' | 'uploads' | 'paths' | 'node' | 'artifacts'> {}

export function registerProjectArtifactRoutes(app: Express, ctx: RegisterProjectArtifactRoutesDeps) {
  const { upload } = ctx.uploads;
  const { ARTIFACTS_DIR } = ctx.paths;
  const { path, fs } = ctx.node;
  const { sanitizeSlug, lintArtifact, renderFindingsForAgent } = ctx.artifacts;
  app.post('/api/upload', upload.array('images', 8), (req, res) => {
    const files = ((req.files || []) as any[]).map((f: any) => ({
      name: f.originalname,
      path: f.path,
      size: f.size,
    }));
    res.json({ files });
  });

  // Persist a generated artifact (HTML) to disk so the user can re-open it
  // in their browser or hand it off. Returns the on-disk path + a served URL.
  // The body is also passed through the anti-slop linter; findings are
  // returned alongside the path so the UI can render a P0/P1 badge and the
  // chat layer can splice them into a system reminder for the agent.
  app.post('/api/artifacts/save', (req, res) => {
    try {
      const { identifier, title, html } = req.body || {};
      if (typeof html !== 'string' || html.length === 0) {
        return res.status(400).json({ error: 'html required' });
      }
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const slug = sanitizeSlug(identifier || title || 'artifact');
      const dir = path.join(ARTIFACTS_DIR, `${stamp}-${slug}`);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, 'index.html');
      fs.writeFileSync(file, html, 'utf8');
      const findings = lintArtifact(html);
      res.json({
        path: file,
        url: `/artifacts/${path.basename(dir)}/index.html`,
        lint: findings,
      });
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Standalone lint endpoint — POST raw HTML, get findings back.
  // The chat layer uses this to lint streamed-in artifacts without writing
  // them to disk first, so a P0 issue can be surfaced before save.
  // Request/response are typed against the shared contract so a producer
  // change that breaks the wire shape fails compilation here.
  app.post('/api/artifacts/lint', (req, res) => {
    try {
      const { html } = (req.body ?? {}) as Partial<LintArtifactRequest>;
      if (typeof html !== 'string' || html.length === 0) {
        return res.status(400).json({ error: 'html required' });
      }
      const findings = lintArtifact(html);
      const payload: LintArtifactResponse = {
        findings,
        agentMessage: renderFindingsForAgent(findings),
      };
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ error: String(err) });
    }
  });

}

export interface RegisterProjectFileRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'uploads' | 'node' | 'projectStore' | 'projectFiles' | 'documents' | 'artifacts' | 'projectPreviewScopes'> {
  verifyWorkspaceRequestAuthority?: VerifyWorkspaceRequestAuthority;
  authorizeProjectRequest?: AuthorizeProjectRequest;
  /** Startup-hydrated O(1) quarantine lookup for stale Team mirrors. */
  isProjectRevoked?: (projectId: string) => boolean;
  /** Durable first-open placeholder stamp lookup. */
  isProjectUnmaterializedPlaceholder?: (projectId: string) => boolean;
}

export function registerProjectFileRoutes(app: Express, ctx: RegisterProjectFileRoutesDeps) {
  const { db } = ctx;
  const { sendApiError, sendMulterError } = ctx.http;
  // The design-token suggestion route reads the design-system roots to resolve
  // a project's tokens, so this scope needs them alongside PROJECTS_DIR.
  const { PROJECTS_DIR, DESIGN_SYSTEMS_DIR, USER_DESIGN_SYSTEMS_DIR } = ctx.paths;
  const { upload } = ctx.uploads;
  const { fs } = ctx.node;
  const { getProject, getWorkspaceProject, getWorkspaceProjectByProjectId } = ctx.projectStore;
  const authorizeProjectRequest =
    ctx.authorizeProjectRequest ??
    createAuthorizeProjectRequest({
      db,
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
      isProjectRevoked: (_db, projectId) =>
        ctx.isProjectRevoked?.(projectId) ?? false,
      isProjectUnmaterializedPlaceholder: (_db, projectId) =>
        ctx.isProjectUnmaterializedPlaceholder?.(projectId) ?? false,
      ...(ctx.verifyWorkspaceRequestAuthority
        ? { verifyWorkspaceRequestAuthority: ctx.verifyWorkspaceRequestAuthority }
        : {}),
      sendApiError,
    });
  const enforceWorkspaceProjectMutation = createEnforceWorkspaceProjectMutation(
    ctx.verifyWorkspaceRequestAuthority,
    undefined,
    authorizeProjectRequest,
  );
  const requestCanWriteWorkspaceProject = createWorkspaceProjectWriteAuthorityCheck(
    ctx.verifyWorkspaceRequestAuthority,
    ctx.isProjectUnmaterializedPlaceholder,
  );
  const { listFiles, listProjectFolders, createProjectFolder, deleteProjectFolder, searchProjectFiles, readProjectFile, resolveProjectDir, resolveProjectFilePath, parseByteRange, renameProjectFile, deleteProjectFile, writeProjectFile, sanitizeName, sanitizePath, ensureProject } = ctx.projectFiles;
  const { buildDocumentPreview } = ctx.documents;
  const { validateArtifactManifestInput } = ctx.artifacts;
  const { projectPreviewScopes } = ctx;
  const projectPreviewIframeSandbox = 'allow-scripts allow-forms';
  const HTML_POWERED_PREVIEW_HINT_SCAN_MAX_BYTES = 128 * 1024 * 1024;
  const projectPreviewCsp = [
    `sandbox ${projectPreviewIframeSandbox}`,
    "default-src 'self' data: blob:",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
  const previewScopeRe = /^[A-Za-z0-9_-]{8,128}$/u;

  function setProjectPreviewHeaders(res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', projectPreviewCsp);
  }

  // "Powered preview" headers — the opposite trade-off from setProjectPreviewHeaders.
  // Real WebGL / Web Worker / WASM sites (Gaussian-splat viewers, physics demos,
  // ffmpeg.wasm, threaded renderers) need capabilities the opaque-origin preview
  // sandbox blocks: same-origin Workers, real Web Storage, and — for threaded
  // WASM — SharedArrayBuffer, which requires the document to be crossOriginIsolated.
  //
  // `Document-Isolation-Policy: isolate-and-credentialless` grants the SERVED
  // document its own cross-origin-isolated agent cluster WITHOUT requiring the
  // embedding app to opt the whole page into COOP/COEP. That is the key that
  // unlocks SharedArrayBuffer for just this iframe. The `credentialless` variant
  // (vs `require-corp`) still lets artifacts pull no-cors cross-origin
  // subresources (CDN fonts/images) — those loads just drop credentials — so
  // enabling isolation does not blank out otherwise-working artifacts.
  //
  // The web host renders the powered iframe with `allow-same-origin` at the
  // daemon's host-swapped preview origin (see
  // apps/web/src/runtime/powered-preview.ts), so this document gets same-origin
  // Workers/storage for sibling /powered assets while the shared /api
  // middleware rejects browser requests from that origin to normal daemon APIs.
  function setPoweredPreviewHeaders(res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Document-Isolation-Policy', 'isolate-and-credentialless');
    // Let cross-origin-isolated contexts embed these bytes (the doc + its
    // worker/wasm/asset subresources under the same /powered prefix).
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // No CORS headers: powered documents and their relative subresources load
    // from the same /powered loopback origin. Foreign browser origins must not
    // get read access to project files by adding an Origin header.
    res.removeHeader('Content-Security-Policy');
  }

  function rejectInternalVersionPath(res: Response, value: unknown): boolean {
    if (!isProjectFileVersionPath(value)) return false;
    sendApiError(res, 404, 'FILE_NOT_FOUND', 'file not found');
    return true;
  }

  function normalizeProjectFileVersionSource(value: unknown): ProjectFileVersionSource | undefined {
    return value === 'ai' || value === 'manual' || value === 'restore' ? value : undefined;
  }

  function parseProjectFileVersionSourceInput(
    value: unknown,
    fieldName: 'source' | 'versionSource',
  ): ProjectFileVersionSource | undefined {
    if (value === undefined || value === null) return undefined;
    const normalized = normalizeProjectFileVersionSource(value);
    if (normalized) return normalized;
    throw new Error(`invalid ${fieldName}; expected one of: ai, manual, restore`);
  }

  function requestProjectFileVersionSource(value: unknown): ProjectFileVersionSource {
    return parseProjectFileVersionSourceInput(value, 'source') ?? 'manual';
  }

  function requestProjectFileVersionUploadSource(body: any): ProjectFileVersionSource {
    const hasVersionSource = body?.versionSource !== undefined && body?.versionSource !== null;
    return parseProjectFileVersionSourceInput(
      hasVersionSource ? body.versionSource : body?.source,
      hasVersionSource ? 'versionSource' : 'source',
    ) ?? 'manual';
  }

  function latestProjectPrompt(project: any): { prompt: string | null; promptSource?: Extract<ProjectFileVersionPromptSource, 'message' | 'project'> } {
    try {
      const row = db.prepare(
        `SELECT m.content
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
          WHERE c.project_id = ?
            AND m.role = 'user'
            AND LENGTH(TRIM(m.content)) > 0
          ORDER BY COALESCE(m.ended_at, m.started_at, m.created_at, 0) DESC,
                   m.position DESC
          LIMIT 1`,
      ).get(project?.id) as { content?: string } | undefined;
      if (typeof row?.content === 'string' && row.content.trim()) {
        return { prompt: row.content.trim(), promptSource: 'message' };
      }
    } catch {
      // Prompt provenance is best-effort; versions still save without it.
    }
    if (typeof project?.pendingPrompt === 'string' && project.pendingPrompt.trim()) {
      return { prompt: project.pendingPrompt.trim(), promptSource: 'project' };
    }
    if (typeof project?.pending_prompt === 'string' && project.pending_prompt.trim()) {
      return { prompt: project.pending_prompt.trim(), promptSource: 'project' };
    }
    return { prompt: null };
  }

  type HtmlVersionOverride = {
    prompt?: string | null;
    promptSource?: ProjectFileVersionPromptSource;
    source?: ProjectFileVersionSource;
    label?: string | null;
    parentVersionId?: string;
  };

  function htmlVersionOptions(
    project: any,
    override?: HtmlVersionOverride,
  ): {
    prompt: string | null;
    promptSource?: ProjectFileVersionPromptSource;
    source?: ProjectFileVersionSource;
    label?: string;
    parentVersionId?: string;
  } {
    const fallbackPromptInfo = latestProjectPrompt(project);
    const prompt = override?.prompt !== undefined
      ? (typeof override.prompt === 'string' && override.prompt.trim() ? override.prompt.trim() : null)
      : (override?.source === 'manual' || override?.source === 'restore' ? null : fallbackPromptInfo.prompt);
    const promptSource = override?.promptSource
      ?? (override?.source === 'manual'
        ? 'manual'
        : override?.source === 'restore'
          ? 'restore'
          : fallbackPromptInfo.promptSource);
    const versionOptions: {
      prompt: string | null;
      promptSource?: ProjectFileVersionPromptSource;
      source?: ProjectFileVersionSource;
      label?: string;
      parentVersionId?: string;
    } = {
      prompt,
    };
    if (promptSource) versionOptions.promptSource = promptSource;
    if (override?.source) versionOptions.source = override.source;
    if (typeof override?.label === 'string' && override.label.trim()) {
      versionOptions.label = override.label.trim();
    }
    if (typeof override?.parentVersionId === 'string' && override.parentVersionId.trim()) {
      versionOptions.parentVersionId = override.parentVersionId.trim();
    }
    return versionOptions;
  }

  type HtmlVersionLock = {
    ensureCurrentVersion: (
      content: string,
      options?: ReturnType<typeof htmlVersionOptions>,
    ) => Promise<ProjectFileVersion | null>;
    createVersion: (
      content: string,
      options?: ReturnType<typeof htmlVersionOptions>,
    ) => Promise<ProjectFileVersion>;
    matchVersionContent: (
      content: string,
      versionId?: string,
    ) => Promise<{
      status: 'matched' | 'missing_version' | 'digest_mismatch' | 'unknown';
      version: ProjectFileVersion | null;
    }>;
  };

  async function matchedHtmlParentVersionId(
    project: any,
    fileName: string,
    requestedParentVersionId: unknown,
    versionLock: HtmlVersionLock,
  ): Promise<string | undefined> {
    if (typeof requestedParentVersionId !== 'string' || !requestedParentVersionId.trim()) {
      return undefined;
    }
    const parentVersionId = requestedParentVersionId.trim();
    try {
      const existing = await readProjectFile(
        PROJECTS_DIR,
        project.id,
        fileName,
        project.metadata,
      );
      const match = await versionLock.matchVersionContent(
        existing.buffer.toString('utf8'),
        parentVersionId,
      );
      return match.status === 'matched' && match.version?.id === parentVersionId
        ? parentVersionId
        : undefined;
    } catch {
      // Missing/unreadable pre-edit bytes cannot prove lineage. The write may
      // still proceed, but the new checkpoint must not inherit an origin.
      return undefined;
    }
  }

  function htmlVersionCaptureWarning(err: unknown): ProjectFileVersionWarning {
    const message = err instanceof Error ? err.message : String(err);
    return {
      code: 'PROJECT_FILE_VERSION_CAPTURE_FAILED',
      message: `HTML version could not be saved: ${message}`,
    };
  }

  async function tryEnsureLockedHtmlCurrentVersion(
    project: any,
    fileName: string,
    content: string,
    ensureCurrentVersion: HtmlVersionLock['ensureCurrentVersion'],
    override?: HtmlVersionOverride,
  ): Promise<{ version: ProjectFileVersion | null; versionWarning?: ProjectFileVersionWarning }> {
    if (!/\.html?$/i.test(fileName)) return { version: null };
    try {
      return { version: await ensureCurrentVersion(content, htmlVersionOptions(project, override)) };
    } catch (err) {
      return { version: null, versionWarning: htmlVersionCaptureWarning(err) };
    }
  }

  function fileFromVersionHistory(fileName: string, versions: ProjectFileVersion[]): ProjectFile | null {
    const latest = versions.at(-1);
    if (!latest) return null;
    return {
      name: latest.fileName || fileName,
      path: latest.fileName || fileName,
      type: 'file',
      size: latest.size,
      mtime: latest.createdAt,
      kind: latest.kind,
      mime: latest.mime,
    };
  }

  // Lets a browser (or the desktop export window, which shares the same Chromium
  // session/cache as the web UI) reuse already-downloaded fonts/CSS/images
  // across loads instead of re-fetching them every time — covers, live preview,
  // and screenshot export all hit /raw/. The ETag/Last-Modified are derived from
  // the file's size+mtime, so any agent rewrite changes them and busts the cache
  // immediately; `no-cache` means "always revalidate" (never serve stale without
  // asking), so a 304 only happens when the bytes are genuinely unchanged.
  function setRawRevalidationHeaders(res: Response, meta: { size: number; mtime: number }): string {
    const mtime = Math.floor(meta.mtime);
    const etag = `W/"${meta.size.toString(16)}-${mtime.toString(16)}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', new Date(mtime).toUTCString());
    res.setHeader('Cache-Control', 'no-cache');
    return etag;
  }

  function rawRequestIsFresh(req: any, etag: string, mtimeMs: number): boolean {
    // If-None-Match is authoritative when present (RFC 9110 §13.1.3): freshness
    // is decided solely by whether the ETag matches — do NOT fall through to
    // If-Modified-Since. Otherwise a same-second rewrite (ETag changes
    // immediately, but Last-Modified is identical at HTTP-date second
    // granularity) would 304 stale-but-changed bytes when a client sends both a
    // non-matching ETag and the current If-Modified-Since.
    const ifNoneMatch = req.headers['if-none-match'];
    if (typeof ifNoneMatch === 'string') {
      return ifNoneMatch.split(',').some((tag) => tag.trim() === etag);
    }
    const ifModifiedSince = req.headers['if-modified-since'];
    if (typeof ifModifiedSince === 'string') {
      const since = Date.parse(ifModifiedSince);
      // Last-Modified is second-resolution, so compare at second granularity.
      if (Number.isFinite(since) && Math.floor(mtimeMs / 1000) * 1000 <= since) return true;
    }
    return false;
  }

  // RFC 9110 §13.1.5: a Range request with If-Range may only be served as 206
  // when the If-Range validator still matches the current representation; if it
  // doesn't (the file changed), the range must be ignored and the full current
  // file returned, so a resumed download can't splice stale + fresh bytes.
  //
  // §13.1.5 also requires the entity-tag form to use a STRONG validator. Our
  // ETag is weak (`W/"size-mtime"` — size+mtime is not byte-exact), so an
  // entity-tag If-Range can never authorize partial content: a same-size rewrite
  // or mtime-granularity collision could otherwise splice stale + fresh bytes
  // under a matching weak tag. We therefore reject ALL entity-tag If-Range values
  // (weak ones explicitly; a strong `"…"` never equals our weak ETag anyway) and
  // honor only the date form.
  function ifRangeAllowsPartial(req: any, _etag: string, mtimeMs: number): boolean {
    const ifRange = req.headers['if-range'];
    if (typeof ifRange !== 'string' || ifRange.length === 0) return true; // no If-Range → honor Range
    const value = ifRange.trim();
    // Any entity-tag (weak `W/"…"` or strong `"…"`) → not a strong match against
    // our weak validator → fall back to the full 200.
    if (value.startsWith('"') || value.startsWith('W/')) return false;
    // Date form: honor the range only if the file has NOT changed since (its
    // current Last-Modified is at/before the If-Range date).
    const since = Date.parse(value);
    return Number.isFinite(since) && Math.floor(mtimeMs / 1000) * 1000 <= since;
  }

  function htmlHasPoweredPreviewSignal(source: string): boolean {
    if (/\bSharedArrayBuffer\b/.test(source)) return true;
    if (/\bnew\s+(?:Worker|SharedWorker)\s*\(/.test(source)) return true;
    if (/\bimportScripts\s*\(/.test(source)) return true;
    if (/\bWebAssembly\s*\.\s*(?:instantiateStreaming|compileStreaming)\b/.test(source)) return true;
    if (/\.wasm\b/.test(source)) return true;
    if (/getContext\s*\(\s*["'`]webgl2["'`]/.test(source)) return true;
    if (/\bOffscreenCanvas\b/.test(source)) return true;
    if (/\bnavigator\s*\.\s*gpu\b/.test(source)) return true;
    return false;
  }

  async function detectPoweredPreviewHint(meta: {
    filePath: string;
    mime: string;
    size: number;
  }): Promise<ProjectFileTextPreviewResponse['poweredPreview']> {
    if (!/^text\/html(?:;|$)/i.test(meta.mime)) {
      return { required: false, scannedBytes: 0, complete: true };
    }
    const scanLimit = Math.min(meta.size, HTML_POWERED_PREVIEW_HINT_SCAN_MAX_BYTES);
    if (scanLimit <= 0) {
      return { required: false, scannedBytes: 0, complete: true };
    }

    let scannedBytes = 0;
    let tail = '';
    for await (const chunk of fs.createReadStream(meta.filePath, {
      start: 0,
      end: scanLimit - 1,
      highWaterMark: 256 * 1024,
    })) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      scannedBytes += buffer.byteLength;
      const sample = tail + buffer.toString('utf8');
      if (htmlHasPoweredPreviewSignal(sample)) {
        return {
          required: true,
          scannedBytes,
          complete: scannedBytes >= meta.size,
        };
      }
      tail = sample.slice(-512);
    }

    return {
      required: false,
      scannedBytes,
      complete: scannedBytes >= meta.size,
    };
  }

  async function sendProjectFile(
    req: any,
    res: Response,
    projectId: string,
    relPath: string,
    metadata?: unknown,
    beforeSend?: (mime: string) => void,
    transformFile?: (file: { mime: string; buffer: Buffer }) => Buffer | string | Promise<Buffer | string>,
    revalidate = false,
  ) {
    const meta = await resolveProjectFilePath(
      PROJECTS_DIR,
      projectId,
      relPath,
      metadata,
    );
    beforeSend?.(meta.mime);

    const isStreamed = meta.mime.startsWith('video/') || meta.mime.startsWith('audio/');
    const shouldStreamBody = isStreamed || !transformFile;
    // A transform (the Vite dev-entry -> dist/index.html substitution, or preview
    // bridge injection) can replace the response bytes — but only for HTML. For
    // HTML the source file's mtime/size is NOT a valid validator, so its ETag is
    // computed from the actual sent bytes after the transform. Everything else
    // (assets, fonts, images, streamed media — where the transform is a no-op)
    // keeps the fast mtime ETag with an early 304.
    const willSubstitute =
      !isStreamed && !!transformFile && /^text\/html(?:;|$)/i.test(meta.mime);

    let currentEtag: string | null = null;
    if (revalidate && !willSubstitute) {
      currentEtag = setRawRevalidationHeaders(res, meta);
      if (rawRequestIsFresh(req, currentEtag, meta.mtime)) {
        return res.status(304).end();
      }
    }

    if (shouldStreamBody) {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', meta.mime);

      if (meta.size === 0) {
        res.setHeader('Content-Length', '0');
        return res.status(200).end();
      }

      // Honor Range only when If-Range still matches the current file — otherwise
      // a resumed download after a rewrite would splice stale + fresh bytes.
      const range =
        currentEtag === null || ifRangeAllowsPartial(req, currentEtag, meta.mtime)
          ? parseByteRange(req.headers.range, meta.size)
          : null;

      if (range === 'unsatisfiable') {
        res.setHeader('Content-Range', `bytes */${meta.size}`);
        return res.status(416).end();
      }

      let start;
      let end;
      let statusCode;
      if (range) {
        ({ start, end } = range);
        statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${meta.size}`);
        res.setHeader('Content-Length', String(end - start + 1));
      } else {
        start = 0;
        end = meta.size - 1;
        statusCode = 200;
        res.setHeader('Content-Length', String(meta.size));
      }

      res.status(statusCode);
      const stream = fs.createReadStream(meta.filePath, { start, end });
      stream.on('error', (streamErr: any) => {
        if (!res.headersSent) {
          sendApiError(res, 500, 'STREAM_ERROR', String(streamErr));
        } else {
          res.destroy(streamErr);
        }
      });
      stream.pipe(res);
      return;
    }

    const file = await readProjectFile(PROJECTS_DIR, projectId, relPath, metadata);
    const body = transformFile ? await transformFile(file) : file.buffer;
    if (revalidate && willSubstitute) {
      // Validator from the ACTUAL response bytes, so a change to the substituted
      // content (e.g. dist/index.html) busts the cache even when the source
      // file's mtime is unchanged.
      const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
      const etag = `W/"${createHash('sha1').update(buf).digest('hex').slice(0, 16)}"`;
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Last-Modified', new Date(Math.floor(meta.mtime)).toUTCString());
      const ifNoneMatch = req.headers['if-none-match'];
      if (typeof ifNoneMatch === 'string' && ifNoneMatch.split(',').some((tag) => tag.trim() === etag)) {
        return res.status(304).end();
      }
      return res.type(file.mime).send(buf);
    }
    res.type(file.mime).send(body);
  }

  function previewFilePathForProject(project: any, queryFile: unknown): string {
    if (typeof queryFile === 'string' && queryFile.trim().length > 0) {
      return queryFile;
    }
    const entryFile = project?.metadata?.entryFile;
    return typeof entryFile === 'string' && entryFile.length > 0 ? entryFile : 'index.html';
  }

  function encodeProjectPathForUrl(filePath: string): string {
    return filePath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
  }

  /**
   * Whether the document contains a `<base>` the browser would actually honour.
   *
   * Parsed rather than scanned, because the answer depends on namespace and on
   * template content: a `<base>` directly under `<svg>` is an SVG element and
   * inert, and one inside an HTML `<template>` belongs to an inert fragment.
   * Both look identical to a linear scan.
   *
   * The template test is by namespace as well as name. A foreign element may
   * also be called `template` — `<svg><template><foreignObject><base>` — and it
   * creates no inert fragment, so the base under it is live and a name-only
   * test would wrongly discard it.
   */
  function hasAuthoredHtmlBase(html: string): boolean {
    const $ = load(html);
    return $('base').toArray().some((element) => {
      if (element.namespace !== HTML_NAMESPACE) return false;
      for (let node: typeof element.parent = element.parent; node; node = node.parent) {
        const candidate = node as { name?: string; namespace?: string };
        if (candidate.name === 'template' && candidate.namespace === HTML_NAMESPACE) return false;
      }
      return true;
    });
  }

  function injectProjectPreviewBase(
    html: string,
    projectId: string,
    ownerFilePath: string,
    scope: string,
    expiresAt: number,
  ): string {
    // Respect an artifact-authored base URL. Only generated documents without
    // one need the containment base that keeps runtime-created relative URLs
    // (for example `img.src = payload.logo`) on the minted preview scope. A
    // `<base>` an author merely wrote into a string does not govern this
    // document, so it must not suppress containment.
    if (findRealTagOffset(html, /<base(?=[\t\n\f\r />])/i) >= 0) return html;
    // A `<base>` can also sit inside an HTML integration point — under
    // `<foreignObject>`, `<desc>`, or an `annotation-xml` that names an HTML
    // encoding — where the structural scan deliberately does not go, because
    // for its own purpose the whole foreign subtree is skippable. Such a base
    // is an HTML-namespace element and governs the document; the generated one
    // would land in `<head>` ahead of it and win, silently repointing every
    // authored relative URL. Only foreign content can hide one, so the parse
    // below is gated on the document having some — 10% of this repository's
    // HTML files reach it, at a few milliseconds each.
    if (/<(svg|math)[\t\n\f\r />]/i.test(html) && hasAuthoredHtmlBase(html)) return html;
    const ownerDir = path.posix.dirname(ownerFilePath);
    const dirSuffix = ownerDir === '.'
      ? ''
      : `${encodeProjectPathForUrl(ownerDir)}/`;
    const baseTag = `<base href="/api/projects/${encodeURIComponent(projectId)}`
      + `/preview/${encodeURIComponent(scope)}/${dirSuffix}" data-od-project-preview-base>`;
    const baseHref = `/api/projects/${encodeURIComponent(projectId)}`
      + `/preview/${encodeURIComponent(scope)}/${dirSuffix}`;
    const bridge = buildPreviewBaseHrefBridge({ href: baseHref, expiresAt });
    // Same structural rule as the bridge injectors above: a `<head>` inside a
    // script string is text, not this document's head.
    const headOpenIndex = findRealTagOffset(html, /<head(?=[\t\n\f\r />])/i);
    if (headOpenIndex >= 0) {
      const openTagEnd = endOfTag(html, headOpenIndex);
      if (openTagEnd >= 0) {
        return `${html.slice(0, openTagEnd + 1)}${baseTag}${bridge}${html.slice(openTagEnd + 1)}`;
      }
    }
    return prependAfterDoctype(html, `${baseTag}${bridge}`);
  }

  function rewriteWorkspaceScopedHtmlAssetUrls(
    html: string,
    projectId: string,
    ownerFilePath: string,
    workspaceId: string,
    workspaceMemberId: string,
  ): string {
    const assetAttr = /(\s)(src|poster|data-src)(\s*=\s*)(["'])([^"']*)\4/gi;
    const linkTag = /<link\b[^>]*>/gi;
    const linkHref = /(\shref\s*=\s*)(["'])([^"']*)\2/i;
    const srcsetAttr = /(\ssrcset\s*=\s*)(["'])([^"']*)\2/gi;
    const cssUrl = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    const ownerDir = path.posix.dirname(ownerFilePath);
    const scopeQuery = `workspaceId=${encodeURIComponent(workspaceId)}`
      + `&workspaceMemberId=${encodeURIComponent(workspaceMemberId)}`;

    const rewrite = (ref: string): string => {
      const trimmed = ref.trim();
      if (!trimmed || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(trimmed)) return ref;
      const match = trimmed.match(/^([^?#]*)([?#][\s\S]*)?$/);
      const rawPath = match?.[1] ?? trimmed;
      const suffix = match?.[2] ?? '';
      let decodedPath = rawPath;
      try {
        decodedPath = decodeURIComponent(rawPath);
      } catch {
        return ref;
      }
      const resolved = path.posix.normalize(path.posix.join(ownerDir, decodedPath));
      if (!resolved || resolved === '..' || resolved.startsWith('../') || path.posix.isAbsolute(resolved)) {
        return ref;
      }
      const scoped = `/api/projects/${encodeURIComponent(projectId)}/raw/`
        + `${encodeProjectPathForUrl(resolved)}?${scopeQuery}`;
      if (!suffix) return scoped;
      if (suffix.startsWith('#')) return `${scoped}${suffix}`;
      return `${scoped}&${suffix.slice(1)}`;
    };

    const rewriteChunk = (chunk: string): string => {
      let next = chunk.replace(
        assetAttr,
        (match, space: string, name: string, eq: string, quote: string, value: string) => {
          const rewritten = rewrite(value);
          return rewritten === value ? match : `${space}${name}${eq}${quote}${rewritten}${quote}`;
        },
      );
      next = next.replace(linkTag, (tag) =>
        tag.replace(linkHref, (match, prefix: string, quote: string, value: string) => {
          const rewritten = rewrite(value);
          return rewritten === value ? match : `${prefix}${quote}${rewritten}${quote}`;
        }),
      );
      next = next.replace(srcsetAttr, (match, prefix: string, quote: string, value: string) => {
        // A data URL contains an unescaped comma, so the lightweight candidate
        // splitter below cannot safely rewrite a mixed data-URL srcset. Leave the
        // whole attribute untouched rather than corrupting embedded bytes.
        if (/(?:^|,\s*)data:/i.test(value)) return match;
        const rewritten = value
          .split(',')
          .map((candidate) => {
            const body = candidate.trim();
            if (!body) return candidate;
            const [url = '', ...descriptors] = body.split(/\s+/);
            const rewrittenUrl = rewrite(url);
            if (rewrittenUrl === url) return candidate;
            const leading = candidate.match(/^\s*/)?.[0] ?? '';
            return `${leading}${[rewrittenUrl, ...descriptors].join(' ')}`;
          })
          .join(',');
        return rewritten === value ? match : `${prefix}${quote}${rewritten}${quote}`;
      });
      return next.replace(cssUrl, (match, quote: string, value: string) => {
        const rewritten = rewrite(value);
        return rewritten === value ? match : `url(${quote}${rewritten}${quote})`;
      });
    };

    return rewriteOutsideExecutableHtmlRanges(html, rewriteChunk);
  }

  async function maybeResolveVitePreviewHtml({
    file,
    projectId,
    relPath,
    metadata,
    projectsRoot,
    readProjectFile,
  }: {
    file: { mime: string; buffer: Buffer };
    projectId: string;
    relPath: string;
    metadata?: unknown;
    projectsRoot: string;
    readProjectFile: (projectsRoot: string, projectId: string, relPath: string, metadata?: unknown) => Promise<{ buffer: Buffer }>;
  }): Promise<Buffer | string> {
    if (!/^text\/html(?:;|$)/i.test(file.mime)) return file.buffer;
    const html = file.buffer.toString('utf8');
    if (!isViteDevHtmlEntry(html)) return file.buffer;

    const ownerDir = path.posix.dirname(relPath);
    const distRelPath = ownerDir === '.' ? 'dist/index.html' : `${ownerDir}/dist/index.html`;
    try {
      const distFile = await readProjectFile(projectsRoot, projectId, distRelPath, metadata);
      return rewriteViteDistAssetUrlsForPreview(distFile.buffer.toString('utf8'));
    } catch {
      return file.buffer;
    }
  }

  function isViteDevHtmlEntry(html: string): boolean {
    return /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*\bsrc\s*=\s*["']\/src\/[^"']+["'][^>]*>\s*<\/script>/i.test(html);
  }

  function rewriteViteDistAssetUrlsForPreview(html: string): string {
    return html.replace(
      /\b(href|src)\s*=\s*(["'])\/assets\//gi,
      (_match, attr: string, quote: string) => `${attr}=${quote}dist/assets/`,
    );
  }

  // Project files. Each project owns a flat folder under .od/projects/<id>/
  // containing every file the user has uploaded, pasted, sketched, or that
  // the agent has generated. Names are sanitized; paths are confined to the
  // project's own folder (see apps/daemon/src/projects.ts).
  app.get('/api/projects/:id/files', async (req, res) => {
    try {
      const since = Number(req.query?.since);
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await authorizeProjectRequest(req, res, project.id, { mode: 'read' })) return;
      if (project?.metadata?.teamMirrorRevokedAt) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      }
      const files = await listFiles(PROJECTS_DIR, req.params.id, {
        since: Number.isFinite(since) ? since : undefined,
        metadata: project?.metadata,
      });
      // The directory is mutated outside HTTP by agent CLIs and filesystem
      // tools. A cached 200 can therefore outlive a completed Write even when
      // the daemon's fresh scan already sees the new file, leaving the
      // workspace on the previous snapshot. The web layer owns its own short
      // request-coalescing window, so transport caches must always revalidate
      // this dynamic inventory.
      res.setHeader('Cache-Control', 'no-store');
      /** @type {import('@open-design/contracts').ProjectFilesResponse} */
      const body = { files };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects/:id/search', async (req, res) => {
    try {
      const searchProject = getProject(db, req.params.id);
      if (!searchProject) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await authorizeProjectRequest(req, res, searchProject.id, { mode: 'read' })) return;
      const query = String(req.query.q ?? '');
      if (!query) {
        sendApiError(res, 400, 'BAD_REQUEST', 'q query parameter is required');
        return;
      }
      const pattern = req.query.pattern ? String(req.query.pattern) : null;
      const max = Math.min(Number(req.query.max) || 200, 1000);
      const matches = await searchProjectFiles(PROJECTS_DIR, req.params.id, query, {
        pattern,
        max,
        metadata: searchProject?.metadata,
      });
      res.json({ query, matches });
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  // Design-token reference values for the manual-edit panel: given the style
  // values currently on the selected element, surface the project's own tokens
  // that are near-matches, so an edit can snap back onto the design system
  // instead of drifting into one-off literals.
  app.get('/api/projects/:id/design-token-suggestions', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      if (!project) {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        return;
      }
      if (!await authorizeProjectRequest(req, res, project.id, { mode: 'read' })) return;
      const allowedProps = new Set([
        'color',
        'backgroundColor',
        'borderColor',
        'fontFamily',
        'fontSize',
        'fontWeight',
        'lineHeight',
        'letterSpacing',
        'width',
        'height',
        'gap',
        'padding',
        'margin',
        'borderRadius',
        'borderWidth',
      ]);
      const props = String(req.query.props ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter((item): item is ProjectDesignTokenSuggestionProp => allowedProps.has(item));
      const values: Partial<Record<ProjectDesignTokenSuggestionProp, string>> = {};
      for (const [key, raw] of Object.entries(req.query)) {
        if (!key.startsWith('value_')) continue;
        const prop = key.slice('value_'.length);
        if (!allowedProps.has(prop)) continue;
        const value = Array.isArray(raw) ? raw[0] : raw;
        if (typeof value === 'string' && value.trim()) values[prop as ProjectDesignTokenSuggestionProp] = value.trim();
      }
      const query: ProjectDesignTokenSuggestionQuery = { values };
      if (typeof req.query.file === 'string') query.file = req.query.file;
      if (typeof req.query.targetId === 'string') query.targetId = req.query.targetId;
      if (props.length > 0) query.props = props;
      const body = await buildProjectDesignTokenSuggestions({
        projectId: req.params.id,
        project,
        projectMetadata: project.metadata,
        projectsRoot: PROJECTS_DIR,
        designSystemsRoot: DESIGN_SYSTEMS_DIR,
        userDesignSystemsRoot: USER_DESIGN_SYSTEMS_DIR,
        listFiles,
        resolveProjectDir,
        query,
      });
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.get('/api/projects/:id/folders', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await authorizeProjectRequest(req, res, project.id, { mode: 'read' })) return;
      const folders = await listProjectFolders(PROJECTS_DIR, req.params.id, {
        metadata: project.metadata,
      });
      /** @type {import('@open-design/contracts').ProjectFoldersResponse} */
      const body = { folders };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.post('/api/projects/:id/folders', async (req, res) => {
    try {
      const { name } = req.body || {};
      if (typeof name !== 'string' || !name.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'name required');
      }
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await enforceWorkspaceProjectMutation(
        req,
        res,
        sendApiError,
        getWorkspaceProject,
        getWorkspaceProjectByProjectId,
        db,
        project.id,
        'writeFiles',
      )) return;
      const folder = await createProjectFolder(
        PROJECTS_DIR,
        req.params.id,
        name,
        project.metadata,
      );
      /** @type {import('@open-design/contracts').ProjectFolderResponse} */
      const body = { folder };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.delete('/api/projects/:id/folders', async (req, res) => {
    try {
      const { path: folderPath } = req.body || {};
      if (typeof folderPath !== 'string' || !folderPath.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'path required');
      }
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await enforceWorkspaceProjectMutation(
        req,
        res,
        sendApiError,
        getWorkspaceProject,
        getWorkspaceProjectByProjectId,
        db,
        project.id,
        'writeFiles',
      )) return;
      await deleteProjectFolder(
        PROJECTS_DIR,
        req.params.id,
        folderPath,
        project.metadata,
      );
      /** @type {import('@open-design/contracts').DeleteProjectFolderResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.get('/api/projects/:id/design-system-package-audit', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      if (!project) {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        return;
      }
      if (!await authorizeProjectRequest(req, res, project.id, { mode: 'read' })) return;
      const projectRoot = resolveProjectDir(PROJECTS_DIR, project.id, project.metadata);
      const audit = await auditDesignSystemPackage(projectRoot);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ audit });
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get('/api/projects/:id/preview-url', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      if (!project) {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        return;
      }
      if (!await authorizeProjectRequest(req, res, project.id, { mode: 'read' })) return;
      const requestedPath = previewFilePathForProject(project, req.query.file);
      const meta = await resolveProjectFilePath(
        PROJECTS_DIR,
        project.id,
        requestedPath,
        project.metadata,
      );
      const requestContext = workspaceProjectContextFromRequest(req);
      const scope = projectPreviewScopes.mint(
        project.id,
        requestContext === null || requestContext === 'missing'
          ? null
          : {
              workspaceId: requestContext.workspaceId,
              workspaceMemberId: requestContext.workspaceMemberId,
            },
      );
      const expiresAt = projectPreviewScopes.expiresAt(project.id, scope);
      if (expiresAt === undefined) {
        sendApiError(res, 503, 'PREVIEW_SCOPE_NOT_FOUND', 'preview scope not found');
        return;
      }
      /** @type {import('@open-design/contracts').ProjectPreviewUrlResponse} */
      const body = {
        url: `/api/projects/${encodeURIComponent(project.id)}/preview/${scope}/${encodeProjectPathForUrl(meta.name)}`,
        file: meta.name,
        csp: projectPreviewCsp,
        iframeSandbox: projectPreviewIframeSandbox,
        opaqueOrigin: true,
        expiresAt,
      };
      res.setHeader('Cache-Control', 'no-store');
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  app.post('/api/projects/:id/preview/:scope/renew', async (req, res) => {
    try {
      const projectId = String(req.params.id ?? '');
      const scope = String(req.params.scope ?? '');
      // The scope is embedded in untrusted preview HTML. Requiring a custom
      // header makes renewal a host-only operation: an opaque-origin iframe
      // cannot set it without a CORS preflight, and this route grants no CORS.
      if (req.get('x-od-preview-scope-renewal') !== '1') {
        sendApiError(res, 403, 'FORBIDDEN', 'preview scope renewal requires host authorization');
        return;
      }
      if (!previewScopeRe.test(scope)) {
        sendApiError(res, 400, 'BAD_REQUEST', 'invalid preview scope');
        return;
      }
      const project = getProject(db, projectId);
      if (!project) {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        return;
      }
      const previewWorkspace = projectPreviewScopes.resolve(project.id, scope);
      if (previewWorkspace === undefined) {
        sendApiError(res, 404, 'PREVIEW_SCOPE_NOT_FOUND', 'preview scope not found');
        return;
      }
      const authorityRequest = previewWorkspace
        ? {
            query: {
              ...req.query,
              workspaceId: previewWorkspace.workspaceId,
              workspaceMemberId: previewWorkspace.workspaceMemberId,
            },
            get: req.get.bind(req),
          }
        : req;
      if (!await authorizeProjectRequest(
        authorityRequest,
        res,
        project.id,
        { mode: 'read', allowNavigationQuery: true },
      )) return;
      const expiresAt = projectPreviewScopes.renew(project.id, scope);
      if (expiresAt === undefined) {
        sendApiError(res, 404, 'PREVIEW_SCOPE_NOT_FOUND', 'preview scope not found');
        return;
      }
      /** @type {import('@open-design/contracts').ProjectPreviewScopeRenewResponse} */
      const body = { expiresAt };
      res.setHeader('Cache-Control', 'no-store');
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err));
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/text-preview\/(.+)$/u, async (req, res) => {
    let handle: import('fs/promises').FileHandle | null = null;
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const relPath = String(params[1] ?? '');
      if (rejectInternalVersionPath(res, relPath)) return;
      const requestedLimit = Number(req.query.limit);
      const limit = Math.max(
        1024,
        Math.min(Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 96 * 1024, 512 * 1024),
      );
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await authorizeProjectRequest(
        req,
        res,
        projectId,
        { mode: 'read', allowNavigationQuery: true },
      )) return;
      const meta = await resolveProjectFilePath(
        PROJECTS_DIR,
        projectId,
        relPath,
        project?.metadata,
      );
      const bytesToRead = Math.min(meta.size, limit);
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const opened = await fs.promises.open(meta.filePath, 'r');
      handle = opened;
      const result = bytesToRead > 0
        ? await opened.read(buffer, 0, bytesToRead, 0)
        : { bytesRead: 0 };
      const text = buffer.subarray(0, result.bytesRead).toString('utf8');
      const poweredPreview = await detectPoweredPreviewHint(meta);
      const body: ProjectFileTextPreviewResponse = {
        text,
        truncated: meta.size > result.bytesRead,
        size: meta.size,
        limit,
        mime: meta.mime,
        kind: meta.kind,
        poweredPreview,
      };
      res.setHeader('Cache-Control', 'no-store');
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    } finally {
      await handle?.close().catch(() => undefined);
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/preview\/([^/]+)\/(.+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string; 2?: string };
      const projectId = String(params[0] ?? '');
      const scope = String(params[1] ?? '');
      const relPath = String(params[2] ?? '');
      if (!previewScopeRe.test(scope)) {
        sendApiError(res, 400, 'BAD_REQUEST', 'invalid preview scope');
        return;
      }
      const project = getProject(db, projectId);
      if (!project) {
        sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        return;
      }
      const previewWorkspace = projectPreviewScopes.resolve(project.id, scope);
      if (previewWorkspace === undefined) {
        sendApiError(res, 404, 'PREVIEW_SCOPE_NOT_FOUND', 'preview scope not found');
        return;
      }
      const authorityRequest = previewWorkspace
        ? {
            query: {
              ...req.query,
              workspaceId: previewWorkspace.workspaceId,
              workspaceMemberId: previewWorkspace.workspaceMemberId,
            },
            get: req.get.bind(req),
          }
        : req;
      if (!await authorizeProjectRequest(
        authorityRequest,
        res,
        projectId,
        { mode: 'read', allowNavigationQuery: true },
      )) return;
      if (req.headers.origin === 'null') {
        res.header('Access-Control-Allow-Origin', '*');
      }
      await sendProjectFile(
        req,
        res,
        project.id,
        relPath,
        project.metadata,
        () => setProjectPreviewHeaders(res),
        async (file) => maybeResolveVitePreviewHtml({
          file,
          projectId: project.id,
          relPath,
          metadata: project.metadata,
          projectsRoot: PROJECTS_DIR,
          readProjectFile,
        }),
      );
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });


  // Preflight for the raw file route. Current artifact fetches are simple GETs
  // (no preflight needed), but an explicit handler future-proofs the route if
  // artifacts ever add custom request headers.
  app.options(/^\/api\/projects\/([^/]+)\/raw\/(.+)$/u, (req, res) => {
    if (req.headers.origin === 'null') {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
    }
    res.sendStatus(204);
  });

  app.get(/^\/api\/projects\/([^/]+)\/raw\/(.+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const relPath = String(params[1] ?? '');
      if (rejectInternalVersionPath(res, relPath)) return;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await authorizeProjectRequest(
        req,
        res,
        projectId,
        { mode: 'read', allowNavigationQuery: true },
      )) return;
      if (project?.metadata?.teamMirrorRevokedAt) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      }
      // PreviewModal loads artifact HTML via srcdoc, giving the iframe Origin: "null".
      // data: URIs, file://, and some sandboxed iframes also send null — all are
      // local-only callers, so this is safe. Real cross-origin sites send a real
      // origin and remain blocked by the browser's same-origin policy.
      if (req.headers.origin === 'null') {
        res.header('Access-Control-Allow-Origin', '*');
      }
      const meta = await resolveProjectFilePath(
        PROJECTS_DIR,
        projectId,
        relPath,
        project?.metadata,
      );
      const skipHtmlPreviewBridge =
        /^text\/html(?:;|$)/i.test(meta.mime) && meta.size > PREVIEW_URL_GUARD_MAX_HTML_BYTES;

      await sendProjectFile(
        req,
        res,
        projectId,
        relPath,
        project?.metadata,
        undefined,
        skipHtmlPreviewBridge ? undefined : async (file) => {
          const transformed = await maybeResolveVitePreviewHtml({
            file,
            projectId,
            relPath,
            metadata: project?.metadata,
            projectsRoot: PROJECTS_DIR,
            readProjectFile,
          });
          const bridged = applyUrlPreviewBridgesToHtml(
            transformed,
            file.mime,
            req.query.odPreviewBridge,
          );
          const workspaceId = typeof req.query.workspaceId === 'string'
            ? req.query.workspaceId
            : null;
          const workspaceMemberId = typeof req.query.workspaceMemberId === 'string'
            ? req.query.workspaceMemberId
            : null;
          if (!/^text\/html(?:;|$)/i.test(file.mime)) {
            return bridged;
          }
          let html = Buffer.isBuffer(bridged) ? bridged.toString('utf8') : String(bridged);
          if (workspaceId && workspaceMemberId) {
            html = rewriteWorkspaceScopedHtmlAssetUrls(
              html,
              projectId,
              relPath,
              workspaceId,
              workspaceMemberId,
            );
          }
          // Plain raw-file reads (code view, download, API clients) must keep
          // returning the same bytes as before. The containment base is only a
          // URL-preview transport detail requested by FileViewer.
          if (req.query.odPreviewBridge === undefined) return html;
          const headerContext = workspaceProjectContextFromRequest(req);
          const previewWorkspace = workspaceId && workspaceMemberId
            ? { workspaceId, workspaceMemberId }
            : headerContext && headerContext !== 'missing'
              ? {
                  workspaceId: headerContext.workspaceId,
                  workspaceMemberId: headerContext.workspaceMemberId,
                }
              : null;
          const scope = projectPreviewScopes.mint(projectId, previewWorkspace);
          const expiresAt = projectPreviewScopes.expiresAt(projectId, scope);
          if (expiresAt === undefined) return html;
          return injectProjectPreviewBase(
            html,
            projectId,
            relPath,
            scope,
            expiresAt,
          );
        },
        true, // revalidate: emit ETag/Last-Modified so covers/preview/export reuse cached assets
      );
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  // Explicitly do not grant CORS for powered previews. Same-origin subresource
  // reads under the powered loopback URL do not preflight; foreign preflights
  // should complete without ACAO so browsers block the read.
  app.options(/^\/api\/projects\/([^/]+)\/powered\/(.+)$/u, (_req, res) => {
    res.sendStatus(204);
  });

  // "Powered preview" file serving. Mirrors /raw but stamps every response
  // (the HTML document AND its relatively-referenced worker/wasm/asset
  // subresources, which resolve under the same /powered/ prefix) with the
  // cross-origin-isolation headers from setPoweredPreviewHeaders. This is the
  // serving half of WebGL/Worker/WASM/SharedArrayBuffer support; the web host
  // decides when to route a preview here (see file-viewer-render-mode.ts).
  app.get(/^\/api\/projects\/([^/]+)\/powered\/(.+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const relPath = String(params[1] ?? '');
      if (rejectInternalVersionPath(res, relPath)) return;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await authorizeProjectRequest(
        req,
        res,
        projectId,
        { mode: 'read', allowNavigationQuery: true },
      )) return;
      const meta = await resolveProjectFilePath(
        PROJECTS_DIR,
        projectId,
        relPath,
        project?.metadata,
      );
      const skipPoweredTransform =
        /^text\/html(?:;|$)/i.test(meta.mime) && meta.size > PREVIEW_URL_GUARD_MAX_HTML_BYTES;
      await sendProjectFile(
        req,
        res,
        projectId,
        relPath,
        project?.metadata,
        () => setPoweredPreviewHeaders(res),
        skipPoweredTransform ? undefined : async (file) => {
          const transformed = await maybeResolveVitePreviewHtml({
            file,
            projectId,
            relPath,
            metadata: project?.metadata,
            projectsRoot: PROJECTS_DIR,
            readProjectFile,
          });
          return applyUrlPreviewBridgesToHtml(transformed, file.mime, req.query.odPreviewBridge);
        },
      );
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  app.delete(/^\/api\/projects\/([^/]+)\/raw\/(.+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const rawSplat = String(params[1] ?? '');
      if (rejectInternalVersionPath(res, rawSplat)) return;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await enforceWorkspaceProjectMutation(
        req,
        res,
        sendApiError,
        getWorkspaceProject,
        getWorkspaceProjectByProjectId,
        db,
        project.id,
        'writeFiles',
      )) return;
      await deleteProjectFile(PROJECTS_DIR, projectId, rawSplat, project?.metadata);
      await markProjectFileVersionStoreDeleted(PROJECTS_DIR, projectId, rawSplat, project?.metadata);
      /** @type {import('@open-design/contracts').DeleteProjectFileResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  app.get('/api/projects/:id/files/:name/preview', async (req, res) => {
    try {
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await authorizeProjectRequest(
        req,
        res,
        project.id,
        { mode: 'read', allowNavigationQuery: true },
      )) return;
      const file = await readProjectFile(
        PROJECTS_DIR,
        req.params.id,
        req.params.name,
        project?.metadata,
      );
      const preview = await buildDocumentPreview(file);
      res.json(preview);
    } catch (err: any) {
      const status =
        err && err.statusCode
          ? err.statusCode
          : err && err.code === 'ENOENT'
            ? 404
            : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        err?.message || 'preview unavailable',
      );
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/files\/(.+)\/versions$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const fileName = String(params[1] ?? '');
      if (rejectInternalVersionPath(res, fileName)) return;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await authorizeProjectRequest(req, res, project.id, { mode: 'read' })) return;
      if (!/\.html?$/i.test(fileName)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'versions are only available for HTML files');
      }
      let file: ProjectFile | null = null;
      let historyFileName = fileName;
      let workingFileContent: string | null = null;
      try {
        const workingFile = await readProjectFile(PROJECTS_DIR, project.id, fileName, project.metadata);
        if (!/\.html?$/i.test(workingFile.name)) {
          return sendApiError(res, 400, 'BAD_REQUEST', 'versions are only available for HTML files');
        }
        file = workingFile;
        historyFileName = workingFile.name;
        workingFileContent = workingFile.buffer.toString('utf8');
      } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err;
      }
      let versions = await listProjectFileVersions(PROJECTS_DIR, project.id, historyFileName, project.metadata);
      // Bootstrapping a baseline version is a WRITE, so it belongs only to a
      // caller with write authority over this project. A readonly member
      // reading a mirror of someone else's shared project gets the truthful
      // empty history instead — the owner's real history can never be here
      // (`.file-versions` is excluded from member mirrors), so synthesizing
      // one would only manufacture history that never existed, inside a
      // project the member is told they cannot modify. The read itself is
      // never refused: browsing history stays open (飞书 recvq56vFjQKfT).
      if (workingFileContent !== null && versions.length === 0
        && await requestCanWriteWorkspaceProject(
          req,
          getWorkspaceProject,
          getWorkspaceProjectByProjectId,
          db,
          project.id,
        )) {
        const initial = await ensureCurrentProjectFileVersion(
          PROJECTS_DIR,
          project.id,
          historyFileName,
          workingFileContent,
          { source: 'manual', promptSource: 'manual' },
          project.metadata,
        );
        if (initial) {
          versions = await listProjectFileVersions(PROJECTS_DIR, project.id, historyFileName, project.metadata);
        }
      }
      file ??= fileFromVersionHistory(historyFileName, versions);
      if (!file) {
        return sendApiError(res, 404, 'FILE_NOT_FOUND', 'file not found');
      }
      /** @type {import('@open-design/contracts').ProjectFileVersionsResponse} */
      const body = { file, versions };
      res.setHeader('Cache-Control', 'no-store');
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  app.post(/^\/api\/projects\/([^/]+)\/files\/(.+)\/versions$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const fileName = String(params[1] ?? '');
      if (rejectInternalVersionPath(res, fileName)) return;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await enforceWorkspaceProjectMutation(
        req,
        res,
        sendApiError,
        getWorkspaceProject,
        getWorkspaceProjectByProjectId,
        db,
        project.id,
        'writeFiles',
      )) return;
      const requestedFile = await readProjectFile(PROJECTS_DIR, project.id, fileName, project.metadata);
      if (!/\.html?$/i.test(requestedFile.name)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'versions are only available for HTML files');
      }
      const manualPrompt = typeof req.body?.prompt === 'string' && req.body.prompt.trim()
        ? req.body.prompt.trim()
        : null;
      const requestedSource = requestProjectFileVersionSource(req.body?.source);
      const fallbackPromptInfo = requestedSource === 'ai' && !manualPrompt ? latestProjectPrompt(project) : null;
      const versionOptions: {
        prompt: string | null;
        promptSource?: ProjectFileVersionPromptSource;
        source: ProjectFileVersionSource;
        label?: string | null;
        parentVersionId?: string;
      } = {
        prompt: manualPrompt ?? fallbackPromptInfo?.prompt ?? null,
        source: requestedSource,
        label: typeof req.body?.label === 'string' ? req.body.label : null,
      };
      if (manualPrompt) {
        versionOptions.promptSource = 'manual';
      } else if (requestedSource === 'manual') {
        versionOptions.promptSource = 'manual';
      } else if (requestedSource === 'restore') {
        versionOptions.promptSource = 'restore';
      } else if (fallbackPromptInfo?.promptSource) {
        versionOptions.promptSource = fallbackPromptInfo.promptSource;
      }
      const version = await withProjectFileVersionLock(
        PROJECTS_DIR,
        project.id,
        requestedFile.name,
        project.metadata,
        async (versionLock) => {
          const currentFile = await readProjectFile(
            PROJECTS_DIR,
            project.id,
            requestedFile.name,
            project.metadata,
          );
          const parentVersionId = requestedSource === 'manual'
            ? await matchedHtmlParentVersionId(
              project,
              currentFile.name,
              req.body?.parentVersionId,
              versionLock,
            )
            : undefined;
          return versionLock.createVersion(
            currentFile.buffer.toString('utf8'),
            {
              ...versionOptions,
              ...(parentVersionId ? { parentVersionId } : {}),
            },
          );
        },
      );
      if (!version) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'version could not be created');
      }
      /** @type {import('@open-design/contracts').CreateProjectFileVersionResponse} */
      const body = { version };
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  app.post(/^\/api\/projects\/([^/]+)\/files\/(.+)\/versions\/([^/]+)\/restore$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string; 2?: string };
      const projectId = String(params[0] ?? '');
      const fileName = String(params[1] ?? '');
      const versionId = String(params[2] ?? '');
      if (rejectInternalVersionPath(res, fileName)) return;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await enforceWorkspaceProjectMutation(
        req,
        res,
        sendApiError,
        getWorkspaceProject,
        getWorkspaceProjectByProjectId,
        db,
        project.id,
        'writeFiles',
      )) return;
      const restored = await readProjectFileVersion(
        PROJECTS_DIR,
        project.id,
        fileName,
        versionId,
        project.metadata,
      );
      const requestPrompt = typeof req.body?.prompt === 'string' && req.body.prompt.trim()
        ? req.body.prompt.trim()
        : null;
      const prompt = requestPrompt
        ?? restored.version.prompt
        ?? latestProjectPrompt(project).prompt;
      const { file, version, versionWarning } = await withProjectFileVersionLock(
        PROJECTS_DIR,
        project.id,
        fileName,
        project.metadata,
        async (versionLock) => {
          const file = await writeProjectFile(
            PROJECTS_DIR,
            project.id,
            fileName,
            Buffer.from(restored.content, 'utf8'),
            {},
            project.metadata,
          );
          let version: ProjectFileVersion | null = null;
          let versionWarning: ProjectFileVersionWarning | undefined;
          try {
            version = await versionLock.createVersion(restored.content, {
              prompt,
              promptSource: requestPrompt ? 'manual' : 'restore',
              source: 'restore',
              restoreFromVersionId: restored.version.id,
            });
          } catch (err) {
            versionWarning = htmlVersionCaptureWarning(err);
          }
          return { file, version, versionWarning };
        },
      );
      /** @type {import('@open-design/contracts').RestoreProjectFileVersionResponse} */
      const body = { file, version, ...(versionWarning ? { versionWarning } : {}) };
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'VERSION_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/files\/(.+)\/versions\/([^/]+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string; 2?: string };
      const projectId = String(params[0] ?? '');
      const fileName = String(params[1] ?? '');
      const versionId = String(params[2] ?? '');
      if (rejectInternalVersionPath(res, fileName)) return;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await authorizeProjectRequest(req, res, project.id, { mode: 'read' })) return;
      const body = await readProjectFileVersion(
        PROJECTS_DIR,
        project.id,
        fileName,
        versionId,
        project.metadata,
      );
      /** @type {import('@open-design/contracts').ProjectFileVersionResponse} */
      const typedBody = body;
      res.setHeader('Cache-Control', 'no-store');
      res.json(typedBody);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'VERSION_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/files\/(.+)$/u, async (req, res) => {
    try {
      const params = req.params as unknown as { 0?: string; 1?: string };
      const projectId = String(params[0] ?? '');
      const fileSplat = String(params[1] ?? '');
      if (rejectInternalVersionPath(res, fileSplat)) return;
      const project = getProject(db, projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await authorizeProjectRequest(
        req,
        res,
        project.id,
        { mode: 'read', allowNavigationQuery: true },
      )) return;
      if (project?.metadata?.teamMirrorRevokedAt) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'not found');
      }
      const file = await readProjectFile(
        PROJECTS_DIR,
        projectId,
        fileSplat,
        project?.metadata,
      );
      res.type(file.mime).send(file.buffer);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

  // Two ways to upload: multipart for binary files (images), and JSON
  // {name, content, encoding} for sketches and pasted text. The frontend
  // uses both depending on the file source.
  app.post(
    '/api/projects/:id/files',
    (req, res, next) => {
      upload.single('file')(req, res, (err: any) => {
        if (err) return sendMulterError(res, err);
        next();
      });
    },
    async (req, res) => {
      try {
        const uploadProject = getProject(db, req.params.id);
        const cleanupRejectedUpload = () => {
          if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
        };
        if (!uploadProject && workspaceProjectContextFromRequest(req) !== null) {
          cleanupRejectedUpload();
          return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        }
        if (!await enforceWorkspaceProjectMutation(
          req,
          res,
          sendApiError,
          getWorkspaceProject,
          getWorkspaceProjectByProjectId,
          db,
          req.params.id,
          'writeFiles',
        )) {
          cleanupRejectedUpload();
          return;
        }
        await ensureProject(PROJECTS_DIR, req.params.id, uploadProject?.metadata);
        if (req.file) {
          try {
            const buf = await fs.promises.readFile(req.file.path);
            // A caller-supplied `name` may carry an intentional subdirectory
            // (e.g. "imagery/hero.png" from the design-kit uploader). Preserve it
            // with sanitizePath (sanitizes each segment, keeps the slashes) so the
            // file lands where brand.json references it; sanitizeName would flatten
            // the slash to "_" and orphan the asset at the project root. Raw
            // multipart originalnames are plain basenames, so sanitizeName fits.
            const desiredName = req.body?.name
              ? sanitizePath(req.body.name)
              : sanitizeName(req.file.originalname);
            if (rejectInternalVersionPath(res, desiredName)) return;
            const requestedSource = uploadProject && /\.html?$/i.test(desiredName)
              ? requestProjectFileVersionUploadSource(req.body)
              : null;
            const writeAndCapture = async (versionLock?: HtmlVersionLock) => {
              const parentVersionId = uploadProject && requestedSource === 'manual' && versionLock
                ? await matchedHtmlParentVersionId(
                  uploadProject,
                  desiredName,
                  req.body?.parentVersionId,
                  versionLock,
                )
                : undefined;
              const meta = await writeProjectFile(
                PROJECTS_DIR,
                req.params.id,
                desiredName,
                buf,
                {},
                uploadProject?.metadata,
              );
              const versionCapture = uploadProject && requestedSource && /\.html?$/i.test(meta.name) && versionLock
                ? await (async () => {
                  const savedFile = await readProjectFile(PROJECTS_DIR, uploadProject.id, meta.name, uploadProject.metadata);
                  return tryEnsureLockedHtmlCurrentVersion(
                    uploadProject,
                    meta.name,
                    savedFile.buffer.toString('utf8'),
                    versionLock.ensureCurrentVersion,
                    {
                      prompt: typeof req.body?.versionPrompt === 'string' ? req.body.versionPrompt : null,
                      promptSource: 'manual',
                      source: requestedSource,
                      label: typeof req.body?.versionLabel === 'string' ? req.body.versionLabel : null,
                      ...(parentVersionId ? { parentVersionId } : {}),
                    },
                  );
                })()
                : null;
              return { meta, versionCapture };
            };
            const { meta, versionCapture } = uploadProject && requestedSource
              ? await withProjectFileVersionLock(
                PROJECTS_DIR,
                req.params.id,
                desiredName,
                uploadProject.metadata,
                (versionLock) => writeAndCapture(versionLock),
              )
              : await writeAndCapture();
            /** @type {import('@open-design/contracts').ProjectFileResponse} */
            const body = {
              file: meta,
              ...(versionCapture ? { version: versionCapture.version } : {}),
              ...(versionCapture?.versionWarning ? { versionWarning: versionCapture.versionWarning } : {}),
            };
            return res.json(body);
          } finally {
            fs.promises.unlink(req.file.path).catch(() => {});
          }
        }
        const {
          name,
          content,
          encoding,
          artifactManifest,
          artifact,
          overwrite,
          versionLabel,
          versionPrompt,
          parentVersionId: requestedParentVersionId,
        } = req.body || {};
        if (typeof name !== 'string' || typeof content !== 'string') {
          return sendApiError(
            res,
            400,
            'BAD_REQUEST',
            'name and content required',
          );
        }
        if (rejectInternalVersionPath(res, name)) return;
        const desiredName = sanitizePath(name);
        if (rejectInternalVersionPath(res, desiredName)) return;
        const requestedSource = uploadProject && /\.html?$/i.test(desiredName)
          ? requestProjectFileVersionUploadSource(req.body)
          : null;
        if (artifactManifest !== undefined && artifactManifest !== null) {
          const validated = validateArtifactManifestInput(
            artifactManifest,
            name,
          );
          if (!validated.ok) {
            return sendApiError(
              res,
              400,
              'BAD_REQUEST',
              `invalid artifactManifest: ${validated.error}`,
            );
          }
        }
        const buf =
          encoding === 'base64'
            ? Buffer.from(content, 'base64')
            : Buffer.from(content, 'utf8');
        const writeAndCapture = async (versionLock?: HtmlVersionLock) => {
          const parentVersionId = uploadProject && requestedSource === 'manual' && versionLock
            ? await matchedHtmlParentVersionId(
              uploadProject,
              desiredName,
              requestedParentVersionId,
              versionLock,
            )
            : undefined;
          const meta = artifact === true
            ? await createProjectArtifactFile({
              projectsRoot: PROJECTS_DIR,
              projectId: req.params.id,
              input: { name, content, encoding, artifactManifest },
              metadata: uploadProject?.metadata,
              writeProjectFile,
            })
            : await writeProjectFile(
              PROJECTS_DIR,
              req.params.id,
              name,
              buf,
              {
                artifactManifest,
                ...(overwrite === false ? { overwrite: false } : {}),
              },
              uploadProject?.metadata,
            );
          const versionCapture = uploadProject && requestedSource && /\.html?$/i.test(meta.name) && versionLock
            ? await (async () => {
              const savedFile = await readProjectFile(PROJECTS_DIR, uploadProject.id, meta.name, uploadProject.metadata);
              const versionOverride: HtmlVersionOverride = {
                source: requestedSource,
                label: typeof versionLabel === 'string' ? versionLabel : null,
                ...(parentVersionId ? { parentVersionId } : {}),
              };
              if (typeof versionPrompt === 'string') {
                versionOverride.prompt = versionPrompt;
              }
              if (requestedSource === 'manual') {
                versionOverride.promptSource = 'manual';
              } else if (requestedSource === 'restore') {
                versionOverride.promptSource = 'restore';
              }
              return tryEnsureLockedHtmlCurrentVersion(
                uploadProject,
                meta.name,
                savedFile.buffer.toString('utf8'),
                versionLock.ensureCurrentVersion,
                versionOverride,
              );
            })()
            : null;
          return { meta, versionCapture };
        };
        const { meta, versionCapture } = uploadProject && requestedSource
          ? await withProjectFileVersionLock(
            PROJECTS_DIR,
            req.params.id,
            desiredName,
            uploadProject.metadata,
            (versionLock) => writeAndCapture(versionLock),
          )
          : await writeAndCapture();
        /** @type {import('@open-design/contracts').ProjectFileResponse} */
        const body = {
          file: meta,
          ...(versionCapture ? { version: versionCapture.version } : {}),
          ...(versionCapture?.versionWarning ? { versionWarning: versionCapture.versionWarning } : {}),
        };
        res.json(body);
      } catch (err: any) {
        const message = String(err?.message || err);
        if (/^invalid (source|versionSource);/u.test(message)) {
          return sendApiError(res, 400, 'BAD_REQUEST', message);
        }
        if (err instanceof ArtifactRegressionError) {
          return sendApiError(res, 422, 'ARTIFACT_REGRESSION', err.message, {
            details: {
              identifier: err.identifier,
              newSize: err.newSize,
              priorSize: err.priorSize,
              priorName: err.priorName,
            },
          });
        }
        if (err instanceof ArtifactPublicationBlockedError) {
          return sendApiError(res, 422, 'ARTIFACT_PUBLICATION_BLOCKED', err.message, {
            details: { placeholders: err.placeholders },
          });
        }
        if (err?.code === 'EEXIST') {
          return sendApiError(res, 409, 'FILE_EXISTS', 'file already exists');
        }
        if (err?.code === 'ARTIFACT_MANIFEST_REQUIRED') {
          return sendApiError(res, 400, 'ARTIFACT_MANIFEST_REQUIRED', err.message);
        }
        if (err?.code === 'ARTIFACT_MANIFEST_INVALID') {
          return sendApiError(res, 400, 'BAD_REQUEST', err.message);
        }
        sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
      }
    },
  );

  app.post('/api/projects/:id/files/rename', async (req, res) => {
    try {
      const { from, to } = req.body || {};
      if (typeof from !== 'string' || typeof to !== 'string') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'from and to required');
      }
      if (rejectInternalVersionPath(res, from) || rejectInternalVersionPath(res, to)) return;
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await enforceWorkspaceProjectMutation(
        req,
        res,
        sendApiError,
        getWorkspaceProject,
        getWorkspaceProjectByProjectId,
        db,
        project.id,
        'writeFiles',
      )) return;
      const result = await renameProjectFile(
        PROJECTS_DIR,
        req.params.id,
        from,
        to,
        project?.metadata,
      );
      await renameProjectFileVersionStore(
        PROJECTS_DIR,
        req.params.id,
        result.oldName,
        result.newName,
        project?.metadata,
      );
      /** @type {import('@open-design/contracts').RenameProjectFileResponse} */
      const body = result;
      res.json(body);
    } catch (err: any) {
      if (err?.code === 'EEXIST') {
        return sendApiError(res, 409, 'CONFLICT', String(err?.message || err));
      }
      const message = String(err?.message || err);
      if (err?.code === 'ENOENT' || message.includes('ENOENT') || message.includes('no such file or directory')) {
        return sendApiError(res, 404, 'FILE_NOT_FOUND', message);
      }
      sendApiError(res, 400, 'BAD_REQUEST', message);
    }
  });

  app.delete('/api/projects/:id/files/:name', async (req, res) => {
    try {
      if (rejectInternalVersionPath(res, req.params.name)) return;
      const delProject = getProject(db, req.params.id);
      if (!delProject) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await enforceWorkspaceProjectMutation(
        req,
        res,
        sendApiError,
        getWorkspaceProject,
        getWorkspaceProjectByProjectId,
        db,
        delProject.id,
        'writeFiles',
      )) return;
      await deleteProjectFile(PROJECTS_DIR, req.params.id, req.params.name, delProject?.metadata);
      await markProjectFileVersionStoreDeleted(PROJECTS_DIR, req.params.id, req.params.name, delProject?.metadata);
      /** @type {import('@open-design/contracts').DeleteProjectFileResponse} */
      const body = { ok: true };
      res.json(body);
    } catch (err: any) {
      const status = err && err.code === 'ENOENT' ? 404 : 400;
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err),
      );
    }
  });

}

export interface RegisterProjectUploadRoutesDeps extends RouteDeps<'db' | 'http' | 'uploads' | 'node' | 'paths' | 'projectStore' | 'projectFiles'> {
  verifyWorkspaceRequestAuthority?: VerifyWorkspaceRequestAuthority;
  authorizeProjectRequest?: AuthorizeProjectRequest;
  /** Durable first-open placeholder stamp lookup. */
  isProjectUnmaterializedPlaceholder?: (projectId: string) => boolean;
}

export function registerProjectUploadRoutes(app: Express, ctx: RegisterProjectUploadRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { handleProjectUpload } = ctx.uploads;
  const { PROJECTS_DIR } = ctx.paths;
  const { getProject, getWorkspaceProject, getWorkspaceProjectByProjectId } = ctx.projectStore;
  const { readProjectFile } = ctx.projectFiles;
  const { fs } = ctx.node;
  const authorizeProjectRequest =
    ctx.authorizeProjectRequest ??
    createAuthorizeProjectRequest({
      db,
      getWorkspaceProject,
      getWorkspaceProjectByProjectId,
      isProjectUnmaterializedPlaceholder: (_db, projectId) =>
        ctx.isProjectUnmaterializedPlaceholder?.(projectId) ?? false,
      ...(ctx.verifyWorkspaceRequestAuthority
        ? { verifyWorkspaceRequestAuthority: ctx.verifyWorkspaceRequestAuthority }
        : {}),
      sendApiError,
    });
  const enforceWorkspaceProjectMutation = createEnforceWorkspaceProjectMutation(
    ctx.verifyWorkspaceRequestAuthority,
    undefined,
    authorizeProjectRequest,
  );

  app.post(
    '/api/projects/:id/upload',
    handleProjectUpload,
    async (req, res) => {
      try {
        const incoming = Array.isArray(req.files) ? req.files : [];
        const cleanupRejectedUpload = () => {
          for (const f of incoming) {
            if (f?.path) fs.promises.unlink(f.path).catch(() => {});
          }
        };
        if (!await enforceWorkspaceProjectMutation(
          req,
          res,
          sendApiError,
          getWorkspaceProject,
          getWorkspaceProjectByProjectId,
          db,
          req.params.id,
          'writeFiles',
        )) {
          cleanupRejectedUpload();
          return;
        }
        // Subfolder the upload targeted (sanitized, forward-slash, '' for root),
        // stashed by the multer destination resolver. Prepend it so callers
        // get the file's true project-relative path, not just its basename.
        const relDir = typeof (req as any)._uploadRelDir === 'string' ? (req as any)._uploadRelDir : '';
        const project = getProject(db, req.params.id);
        const out = [];
        for (const f of incoming) {
          try {
            const stat = await fs.promises.stat(f.path);
            const rel = relDir ? `${relDir}/${f.filename}` : f.filename;
            out.push({
              name: rel,
              path: rel,
              size: stat.size,
              mtime: stat.mtimeMs,
              originalName: f.originalname,
            });
            if (project && /\.html?$/i.test(rel)) {
              const savedFile = await readProjectFile(PROJECTS_DIR, req.params.id, rel, project.metadata);
              await ensureCurrentProjectFileVersion(
                PROJECTS_DIR,
                project.id,
                savedFile.name,
                savedFile.buffer.toString('utf8'),
                { source: 'manual', promptSource: 'manual' },
                project.metadata,
              );
            }
          } catch {
            // skip files that vanished mid-flight
          }
        }
        /** @type {import('@open-design/contracts').UploadProjectFilesResponse} */
        const body = { files: out };
        res.json(body);
      } catch (err: any) {
        sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
      }
    },
  );
}

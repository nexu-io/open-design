import { parseCommentFileState } from '../collab/comment-file-facts.js';
import { createHash } from 'node:crypto';
import { fingerprintSharePayload } from '../collab/share-content-fingerprint.js';
import { resolveOptionalLocalWorkspaceRequestAuthority } from '../collab/workspace-resource-mutation.js';
import type { Express, Request, Response } from 'express';
import { currentFileSharePublication, UnboundFileShareIdentityError, type ReadProjectShareState } from '../collab/vela-project-share-state.js';
import { publishReservedVelaShareVersion } from '../collab/vela-share-publish.js';
import type { createShareAliasReservations } from '../collab/share-alias-reservation.js';
import type { createSharePublicationCompletion } from '../collab/share-publication-completion.js';
import type { ShareBindingOutbox } from '../collab/share-binding-outbox.js';
import type { runVelaCommand } from '../integrations/vela-command.js';
import { sharePublishResponse } from '../collab/share-publish-response.js';
import { persistedAmrShareUrl, type AmrShareLink, type PublicShareLink } from '../collab/public-share-viewer-url.js';
import { stopVelaShare } from '../collab/vela-share-stop.js';
import { publicFileResourceIdFor } from '../collab/public-file-resource-id.js';
import { registerVelaTeamProjectResource } from '../collab/vela-cli-team-projects.js';
import { resumePendingShareBinding } from '../collab/resume-pending-share-binding.js';
import { reserveFileShareAlias } from '../collab/share-alias-recovery.js';
import { ShareAliasIdentityMismatchError } from '../collab/share-alias-reservation.js';
import { resumeExistingVelaShare } from '../collab/vela-share-binding.js';
import type { RecordPublicFilePublication } from '../collab/public-file-publication-recording.js';
import type { ShareContentFingerprints } from '../collab/share-content-fingerprint.js';
import { createShareFileMapping, publishedPathForSource, type ShareFileMapping } from '../collab/share-file-mapping.js';
import { publicFileMutationHandler } from './public-file-mutation-handler.js';
import type { PublicFileMutations } from '../collab/public-file-mutations.js';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { stageShareFiles } from '../collab/share-staging.js';
import os from 'node:os';
import path from 'node:path';
import {
  SHARE_ENTRY_INDEX_CONFLICT,
  SHARE_MAX_TOTAL_BYTES,
  type SharePlanSummary,
  type ShareUnpublishResponse,
  type SharePublishRequest,
  workspaceContextHasWorkspaceIdentity,
  type ProjectContentTransferState,
  type ProjectMetadata,
  type ProjectSyncIntentEvent,
  type TeamProject,
  type WorkspaceCollabContext,
  type OwnedProjectContentUpdateRequest,
} from '@open-design/contracts';
import type { OwnedContentSync } from '../collab/owned-content-sync.js';
import type {
  ProjectContentTransferToken,
} from '../collab/project-content-transfer-state.js';
import type {
  VerifiedWorkspaceRequestContextResult,
} from '../collab/request-workspace-context.js';
import type { CollabRuntime } from '../collab/runtime.js';
import {
  contextToResourceHubPrincipal,
  type ResourceHubPrincipal,
} from '../collab/resource-principal.js';
import {
  isAuthorizedProactivePullInvocation,
  isBoundProactivePullInvocation,
  isFreshProactivePullAuthorizationWitness,
  type AuthorizedProactivePullInvocation,
  type ProactivePullAuthorizationWitness,
} from '../collab/proactive-content-pull.js';
import {
  isAuthorizedTeamProjectPullReceiptExpired,
  isAuthorizedTeamProjectPullUnavailable,
  stageAuthorizedTeamProjectPull,
  validateAuthorizedTeamProjectPullReceipt,
  type AuthorizedTeamProjectPullReceipt,
  type StageAuthorizedTeamProjectPullInput,
  type StagedAuthorizedTeamProjectPull,
} from '../collab/authorized-team-project-pull.js';
import {
  promoteAuthorizedTeamProjectStage,
  type PromoteAuthorizedTeamProjectStageInput,
} from '../collab/team-mirror-promotion.js';
import { isUnmaterializedSharedPlaceholder } from '../collab/shared-project-placeholder.js';
import {
  isRetractedHubResourceError,
  parseVelaPushVersionId,
} from '../collab/vela-cli-resource-adapter.js';
import {
  createInMemoryPublicFilePublicationStore,
  type PublicFilePublication,
  type StopQueuePublicFilePublicationStore,
  type PublicFilePublicationScope,
  type PublicFilePublicationStore,
} from '../collab/public-file-publication-store.js';
import { classifyVelaCommandFailure, logPublicFileFailure, logPublicShareDiagnostic, type PublicShareDiagnosticStage } from '../collab/public-file-failure.js';
import { clientRequestIdFor } from '../http/client-request-id.js';
import { isAbortedOperationError } from '../integrations/aborted-error.js';
import { buildDeployFilePlan, entryIndexConflictError } from '../deploy.js';
import { readProjectManifest } from '../project-locations.js';
import { redactSecrets } from '../redact.js';
import { findRealElementRange, HTML_TAG_PATTERNS } from '@open-design/contracts/runtime/html-injection-points';

/** The fields register-on-pull reads out of a pulled project's manifest. */
export interface PulledProjectManifest {
  name?: string;
  skillId?: string | null;
  designSystemId?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface RegisterPulledProjectInput {
  id: string;
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  metadata?: ProjectMetadata;
  createdAt: number;
  updatedAt: number;
}

export interface TeamMirrorPullScope {
  /** Exact catalog-bound root; never supplied by an HTTP caller. */
  resourceId?: string;
  workspaceId: string;
  resourceTeamId: string;
  viewerMemberId: string;
  ownerMemberId: string;
}

export interface PulledProjectStore {
  get?: (projectId: string) => { name?: string | null; metadata?: unknown } | null;
  has(projectId: string): boolean;
  register(input: RegisterPulledProjectInput): void;
  update?: (input: RegisterPulledProjectInput) => void;
  /**
   * Atomically materialize the project row and its active team binding, then
   * return only after a strict readback proves the mirror is mutation-gated.
   */
  materializeTeamMirror?: (
    input: RegisterPulledProjectInput,
    scope: TeamMirrorPullScope,
    fileReceipt?: { resourceId: string; versionId: string },
  ) => { localRecordChanged: boolean };
  /** Atomically create a stamped, creator-less Team-bound first-open row. */
  materializeTeamPlaceholder?: (
    input: RegisterPulledProjectInput,
    scope: TeamMirrorPullScope,
  ) => { localRecordChanged: boolean };
  materializeAuthorizedTeamMirror?: (
    input: RegisterPulledProjectInput,
    scope: TeamMirrorPullScope,
    receipt: AuthorizedTeamProjectPullReceipt,
  ) => { localRecordChanged: boolean };
}

type CollabSyncPullTimingStatus =
  | 'pulled'
  | 'revoked'
  | 'register_failed'
  | 'threw'
  | 'staged'
  | 'capability-unavailable'
  | 'failed';

export interface RegisterCollabSyncRoutesDeps {
  ownedContentSync?: OwnedContentSync;
  collab: Pick<
    CollabRuntime,
    | 'scheduler'
    | 'publishedVersion'
    | 'publishedHead'
    | 'projectSyncState'
    | 'projectOwnerMemberId'
    | 'forgetTeamShare'
    | 'pullLatest'
  >;
  resolveSharedProjectOwner?: (
    projectId: string,
    scope?: { workspaceId: string; workspaceMemberId: string },
  ) => Promise<string | null>;
  /**
   * Read-only owner lookup for GET /collab/status. This may use a short-lived
   * explicit-scope display cache because request authority is verified first.
   * Pull, publish, presence, and mutation paths deliberately keep using the
   * fresh `resolveSharedProjectOwner` dependency above.
   */
  resolveSharedProjectOwnerForStatus?: (
    projectId: string,
    scope?: { workspaceId: string; workspaceMemberId: string },
  ) => Promise<string | null>;
  resolveSharedProject?: (
    projectId: string,
    scope?: TeamMirrorPullScope | null,
  ) => Promise<TeamProject | null>;
  /**
   * Authorize the request's explicit Workspace selector against the signed-in
   * account's authoritative membership directory, then return the directory-
   * derived context. Client-supplied role/permission headers are never
   * authority. Null is a fail-closed denial.
   */
  verifyWorkspaceRequest?: (
    req: Request,
    projectId?: string,
  ) => Promise<
    | VerifiedWorkspaceRequestContextResult
    | WorkspaceCollabContext
    | null
  >;
  /**
   * Bounded successful authority lease for the read-only status surface.
   * Mutations and content materialization must continue to use
   * `verifyWorkspaceRequest`.
   */
  verifyWorkspaceReadRequest?: (
    req: Request,
    projectId?: string,
  ) => Promise<
    | VerifiedWorkspaceRequestContextResult
    | WorkspaceCollabContext
    | null
  >;
  /**
   * Revalidate one already-captured Team pull scope against the authoritative
   * membership directory. This must address `scope.workspaceId` +
   * `scope.viewerMemberId` directly; it must not compare against the daemon's
   * mutable active Workspace.
   */
  verifyWorkspaceScope?: (scope: TeamMirrorPullScope) => Promise<boolean>;
  resolveTeamProjectResourceId?: (projectId: string, scope: TeamMirrorPullScope) => Promise<string>;
  /** Set/clear the non-destructive "team mirror revoked" flag on a local
   *  project so read routes stop serving a project that has left the team. */
  markTeamProjectRevoked?: (projectId: string, revoked: boolean) => void;
  /** Read the same durable quarantine marker for status/direct-read denial. */
  isTeamProjectRevoked?: (projectId: string) => boolean;
  /**
   * Set/clear the `sharedProjectPlaceholderAt` stamp on a local project's
   * metadata (see collab/shared-project-placeholder.ts). Set when
   * `ensureSharedProjectPlaceholder` registers a placeholder record; cleared
   * exactly once a pull has materialized real hub content locally. While the
   * stamp is set, the publish paths refuse to treat the local copy as content
   * authority (the recvqzaDvUU6B3 fresh-install wipe guard).
   */
  markSharedProjectPlaceholder?: (projectId: string, placeholder: boolean) => void;
  /**
   * Delete a local project record that is still an unmaterialized
   * shared-project placeholder (and its empty content directory). Called by
   * the retracted-share heal below ONLY for a record the placeholder stamp
   * proves contentless — implementations must re-check
   * `isUnmaterializedSharedPlaceholder` before deleting so a concurrent pull
   * that just materialized real content can never be destroyed.
   */
  retireUnmaterializedSharedPlaceholder?: (projectId: string) => void;
  /** Drop the daemon's cached team-project catalog listing so a heal that
   *  removed a catalog row is visible on the next list read, not one
   *  stale-while-revalidate TTL later. */
  invalidateTeamProjectCatalog?: () => void;
  resolveOwnerDisplayName?: (
    memberId: string,
    context: WorkspaceCollabContext,
  ) => Promise<{ displayName: string; role: 'owner' | 'admin' | 'member' } | null>;
  projectStore?: PulledProjectStore;
  resolveProjectDir?: (projectId: string) => string | Promise<string>;
  /** Durable publication metadata used to restore public links after restart. */
  publicFilePublicationStore?: PublicFilePublicationStore;
  shareContentFingerprints?: ShareContentFingerprints;
  readProjectShareState?: ReadProjectShareState;
  /** Durable local author proof for a not-yet-catalogued project. Never inferred from the requester. */
  resolveLocalPublicShareOwner?: (projectId: string, workspaceId: string) => string | null;
  /** The only presentation rule for a publication's Viewer address: explicit
   * local override, else the address AMR reported (fresh evidence or the
   * persisted copy, re-verified), else unavailable. Unwired means unavailable,
   * never the stored URL. */
  resolvePublicShareLink?: (projectId: string, slug: string, amr: AmrShareLink | string | null) => PublicShareLink;
  recordPublicFilePublication?: RecordPublicFilePublication;
  sharePublishing?: {
    ensureProject?(scope: PublicFilePublicationScope, principal: ResourceHubPrincipal, run: typeof runVelaCommand): Promise<TeamProject>;
    sourceFileId?(scope: PublicFilePublicationScope, project?: TeamProject | null): string;
    needsCatalogSourceIdentity?(scope: PublicFilePublicationScope): boolean;
    admitFileReceipt?(scope: PublicFilePublicationScope, resourceId: string, versionId: string, entryPath: string, run: typeof runVelaCommand): Promise<void>;
    reservations: ReturnType<typeof createShareAliasReservations>;
    outbox: ShareBindingOutbox;
    complete: ReturnType<typeof createSharePublicationCompletion>;
    prepare(scope: PublicFilePublicationScope, slug: string): Promise<{ run: typeof runVelaCommand }>;
    retry(): void;
  };
  publicFileMutations?: PublicFileMutations;
  resolvePullDir?: (projectId: string) => string;
  /** Read the durable local materialization cursor for this exact team mirror. */
  readMaterializedVersion?: (
    projectId: string,
    scope: TeamMirrorPullScope,
  ) => number | null;
  /** Read the daemon-local inbound content-transfer lifecycle snapshot. */
  readContentTransferState?: (
    projectId: string,
    scope: TeamMirrorPullScope,
  ) => ProjectContentTransferState | null;
  /** Begin one exact-scope transfer generation after authorization resolves. */
  beginContentTransfer?: (
    projectId: string,
    scope: TeamMirrorPullScope,
    version?: number,
  ) => ProjectContentTransferToken;
  /** Only the matching exact-scope generation token may complete a transfer. */
  finishContentTransfer?: (
    projectId: string,
    scope: TeamMirrorPullScope,
    token: ProjectContentTransferToken,
    version?: number,
  ) => void;
  /** Persist the actual version after either HTTP or proactive pull lands. */
  writeMaterializedVersion?: (
    projectId: string,
    scope: TeamMirrorPullScope,
    version: number,
  ) => void | Promise<void>;
  /**
   * Tell the proactive coordinator that the fallback HTTP/legacy lane
   * durably landed this exact scope + version. This runs only after the
   * cursor commit, so consumers may settle a queued same-head retry without
   * trusting an in-memory claim that is ahead of disk.
   */
  onLegacyPullMaterialized?: (
    projectId: string,
    scope: TeamMirrorPullScope,
    version: number,
  ) => void | Promise<void>;
  readManifest?: (projectDir: string) => Promise<PulledProjectManifest | null>;
  authorizedTeamProjectPull?: {
    journalDir: string;
    getActiveWorkspaceSnapshot?: () => {
      workspaceId: string | null;
      generation: number;
    };
    stage?: (
      input: StageAuthorizedTeamProjectPullInput,
    ) => Promise<StagedAuthorizedTeamProjectPull>;
    promote?: (
      input: PromoteAuthorizedTeamProjectStageInput<{
        localRecordChanged: boolean;
      }>,
    ) => Promise<{ localRecordChanged: boolean }>;
  };
  onTeamShareStateChanged?: (input: {
    projectId: string;
    principal?: ResourceHubPrincipal | null;
    visibility: 'personal' | 'team';
    ownerMemberId?: string | null;
    updatedByMemberId?: string | null;
  }) => void;
  /**
   * Notify any live `/api/projects/:id/events` SSE subscribers that this
   * project's files changed on disk. Called after a successful
   * `POST /collab/pull` materializes new content.
   *
   * This is NOT redundant with the project's chokidar watcher: the `vela
   * resource pull` transport materializes a pulled project by replacing its
   * ENTIRE directory (a fresh inode every pull, confirmed via `stat` across
   * repeated pulls against a live resource-hub project) rather than updating
   * files in place. A chokidar watch established before that swap keeps
   * watching the OLD (now-orphaned) directory handle and silently stops
   * firing — so the member's own currently-open FileViewer tab never saw
   * `file-changed`, even though `/collab/status` and the file's bytes on disk
   * were both already correct (recvq6CIesNvWZ). Firing this explicit signal
   * right after the pull we know just landed sidesteps the swap entirely
   * instead of depending on chokidar surviving it.
   */
  notifyFilesChanged?: (projectId: string) => void;
  /**
   * Notify any live `/api/projects/:id/events` SSE subscribers that this
   * project's LOCAL record (name / skill / design-system) changed as part of
   * a pull. `registerPulledProject` is what replaces the "共享项目"
   * placeholder record with the real project name — but that write is
   * DB-only, and the only other post-pull signal (`notifyFilesChanged`)
   * refreshes the file list, never the project record. Without this signal a
   * member web that seeded its `projects` state from the placeholder keeps
   * rendering "共享项目" in the sidebar/tab until a full page reload
   * (recvqhwv6RPU1j). Wired to the existing `project-metadata-changed` thin
   * event; fired only when the pull actually registered or updated the local
   * record, so steady-state content pulls emit nothing.
   */
  notifyProjectMetadataChanged?: (projectId: string) => void;
  /** Opt-in, secret-free timing observer. It must not affect pull behavior. */
  onPullTiming?: (event: {
    phase:
      | 'route-started'
      | 'initial-authorization-reused'
      | 'authorized-stage-started'
      | 'authorized-stage-done'
      | 'authorized-receipt-validated'
      | 'authorized-scope-revalidated'
      | 'promotion-started'
      | 'promotion-done'
      | 'version-persisted'
      | 'transport-invoke'
      | 'transport-done'
      | 'registration-prepared'
      | 'catalog-revalidated'
      | 'scope-revalidated'
      | 'mirror-materialized'
      | 'version-write-started'
      | 'persisted'
      | 'route-completed';
    projectId: string;
    version?: number;
    receivedAtMs?: number;
    atMs: number;
    status?: CollabSyncPullTimingStatus;
  }) => void;
}

/** Result of one shared-project content pull — the same flow whether it was
 *  reached over `POST /api/projects/:id/collab/pull` or daemon-internally
 *  through {@link CollabSyncRoutesHandle.pullSharedProject}. */
export type CollabSyncPullOutcome =
  | { status: 'pulled'; version: number | null }
  | { status: 'revoked' }
  | { status: 'register_failed' };

/** Daemon-internal surface `registerCollabSyncRoutes` hands back so non-HTTP
 *  callers (the hub push channel's proactive content pull, server.ts) can run
 *  the same pull flow the POST route runs. */
export interface CollabSyncRoutesHandle {
  /**
   * Materialize the latest published content for a shared project, exactly as
   * `POST /api/projects/:id/collab/pull` would: revocation gate, owner-routed
   * hub pull, register-on-pull, and the `file-changed` /
   * `project-metadata-changed` signals. The viewer principal is derived from
   * the daemon's own workspace context (there is no request to read headers
   * from). Concurrent pulls for the same project+scope — including a member
   * web's racing POST — coalesce onto one in-flight materialization.
   */
  pullSharedProject(
    projectId: string,
    scope: TeamMirrorPullScope,
    authorizationWitness?: ProactivePullAuthorizationWitness,
    expectedVersion?: number,
    authorizedStageInvocation?: AuthorizedProactivePullInvocation,
  ): Promise<CollabSyncPullOutcome>;
}

const SYNC_INTENT_EVENTS: ReadonlySet<ProjectSyncIntentEvent> = new Set([
  'project_visibility_changed',
  'project_team_share_requested',
  'project_team_unshare_requested',
]);
const PULLED_PROJECT_PLACEHOLDER_NAME = '共享项目';
const PUBLIC_FILE_RESOURCE_KIND = 'project';

const MAX_ERROR_LOG_FIELD_LENGTH = 2_048;

/** Builds the share payload through the deploy planner without inheriting its hook. */
async function buildSharePlan(
  projectDir: string,
  entryName: string,
  metadata: unknown,
): Promise<{
  summary: SharePlanSummary;
  files: Awaited<ReturnType<typeof buildDeployFilePlan>>['files'];
  mapping: ShareFileMapping;
  entryPath: string;
  /** English refusal text when `summary.blockers` is non-empty. */
  conflictMessage: string | null;
}> {
  const deployPlan = await buildDeployFilePlan(
    path.dirname(projectDir),
    path.basename(projectDir),
    entryName,
    { metadata, hookScriptUrl: '', assetUrlPolicy: 'share-relative' },
  );
  // A conflict leaves the entry at index.html (the planner never reads the
  // colliding root index.html), so the mapping below stays valid; the
  // blocker is what refuses the publish.
  const conflict = deployPlan.indexConflict ? entryIndexConflictError(deployPlan.indexConflict, 'share') : null;
  const mapping = createShareFileMapping(deployPlan.files);
  const entryPath = publishedPathForSource(mapping, deployPlan.entryPath);
  if (!entryPath) throw new Error('SHARE_ENTRY_MAPPING_UNAVAILABLE');
  const totalBytes = deployPlan.files.reduce(
    (total, file) => total + Buffer.from(file.data).byteLength,
    0,
  );
  return {
    files: deployPlan.files,
    mapping,
    entryPath,
    conflictMessage: conflict?.message ?? null,
    summary: {
      fileCount: deployPlan.files.length,
      totalBytes,
      exceedsSizeLimit: totalBytes > SHARE_MAX_TOTAL_BYTES,
      exclusions: [
        ...deployPlan.missing.map((path) => ({ path, reason: 'missing' as const })),
        ...deployPlan.invalid.map((path) => ({ path, reason: 'invalid' as const })),
      ],
      ...(conflict ? { blockers: [{ code: 'entry-index-conflict' as const, ...conflict.data }] } : {}),
    },
  };
}

function redactedErrorLogText(value: unknown): string {
  const text = value instanceof Error
    ? value.message || value.name
    : String(value);
  return redactSecrets(text).slice(0, MAX_ERROR_LOG_FIELD_LENGTH);
}

function errorLogFields(error: unknown): {
  errorName: string;
  errorMessage: string;
  errorCause?: string;
} {
  const errorName = redactSecrets(
    error instanceof Error ? error.name : typeof error,
  ).slice(0, MAX_ERROR_LOG_FIELD_LENGTH);
  const errorMessage = redactedErrorLogText(error);
  const cause =
    error && typeof error === 'object' && 'cause' in error
      ? (error as { cause?: unknown }).cause
      : undefined;
  return {
    errorName,
    errorMessage,
    ...(cause == null
      ? {}
      : { errorCause: redactedErrorLogText(cause) }),
  };
}

function cleanPulledProjectName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed === 'index.html') return null;
  return trimmed;
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function inferNameFromSkillManifest(projectDir: string): Promise<string | null> {
  const skillsDir = path.join(projectDir, '.od-skills');
  let entries: string[];
  try {
    entries = await readdir(skillsDir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    const manifest = await readJsonObject(path.join(skillsDir, entry, 'open-design.json'));
    const title = cleanPulledProjectName(manifest?.title);
    if (title) return title;
    const name = cleanPulledProjectName(manifest?.name);
    if (name) return name;
  }
  return null;
}

async function inferNameFromHtmlTitle(projectDir: string): Promise<string | null> {
  try {
    const html = await readFile(path.join(projectDir, 'index.html'), 'utf8');
    // The document's own <title>, not one an author stored in a script string
    // or an attribute (nexu-io/open-design#7410). Both ends are located by the
    // parser's rules: the open tag through `endOfTag`, so a `>` in a quoted
    // attribute cannot cut it short, and the close by the raw-text rule, so
    // `</title >` closes it while `</title-page>` does not.
    const range = findRealElementRange(html, HTML_TAG_PATTERNS.titleOpen, 'title');
    if (!range) return null;
    const raw = html.slice(range.contentStart, range.contentEnd);
    return cleanPulledProjectName(raw.replace(/<[^>]*>/g, ''));
  } catch {
    return null;
  }
}

async function resolvePulledProjectName(
  projectDir: string,
  manifest: PulledProjectManifest | null,
): Promise<string> {
  return cleanPulledProjectName(manifest?.name)
    ?? await inferNameFromSkillManifest(projectDir)
    ?? await inferNameFromHtmlTitle(projectDir)
    ?? PULLED_PROJECT_PLACEHOLDER_NAME;
}

const STATUS_ENRICHMENT_CACHE_LIMIT = 256;

function readLruEntry<K, V>(cache: Map<K, V>, key: K): V | undefined {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key)!;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function writeLruEntry<K, V>(cache: Map<K, V>, key: K, value: V): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > STATUS_ENRICHMENT_CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (oldest.done) return;
    cache.delete(oldest.value);
  }
}

/** Validate Express-decoded route params without interpreting literal percent escapes. */
function normalizePublicFilePath(filePath: string): string | null {
  // Express decodes each regexp capture once, including encoded separators.
  // Reject unsafe segments rather than normalizing them into a different file.
  if (
    !filePath ||
    filePath.includes('\\') ||
    filePath.includes('\0') ||
    /^[A-Za-z]:/.test(filePath) ||
    filePath.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    return null;
  }
  return filePath;
}

function publicFilePublicationScope(
  projectId: string,
  filePath: string,
  principal: ResourceHubPrincipal,
): PublicFilePublicationScope {
  return {
    resourceTeamId: principal.teamId,
    ownerMemberId: principal.memberId,
    projectId,
    filePath,
  };
}

/**
 * The 409 body for a public-file request that has no team workspace behind it.
 *
 * Public links are snapshots in the workspace resource hub, which only a team
 * workspace can address (`workspaceContextHasTeamIdentity`). A personal or
 * signed-out session — and a team session whose context read momentarily fails —
 * lands here. Ship a sentence alongside the code so every surface that is not
 * the web UI (the `od` CLI, embedding agents) states the reason instead of
 * echoing `WORKSPACE_IDENTITY_REQUIRED` at a human. The web UI localizes the
 * code itself; see `publicFilePublishFailureKey` in apps/web.
 */
function workspaceIdentityRequiredBody() {
  return {
    error: 'WORKSPACE_IDENTITY_REQUIRED',
    message:
      'Publishing a public link needs a signed-in workspace. Sign in to OpenDesign Cloud, ' +
      'or use Deploy to publish this file without one.',
  };
}

/**
 * Resource-hub principal for the PUBLIC SINGLE-FILE publish routes.
 *
 * These routes deliberately do NOT use `contextToResourceHubPrincipal`, which
 * requires `workspaceContextHasTeamIdentity` and is still exactly right for team
 * project sharing (a shared project needs teammates to share WITH).
 *
 * A public file link needs no such thing. The hub addresses purely by workspace
 * id, and B stopped refusing a personal workspace on its control-key auth path:
 * `authenticateSession` now mints a principal whose `teamId` IS the workspace id
 * — "a partition of one" — and `resolveAccess` only ever compares that id with
 * the resource's own. So the real requirement here is A workspace, not a TEAM
 * workspace: an id to publish under and a member id to own the resource with.
 *
 * A signed-out session still has neither, and is still refused — this widens the
 * gate, it does not remove it. The web UI must gate its entry point on the SAME
 * rule (`canPublishPublicFile` in apps/web/src/collab/public-file-publish.ts);
 * a button that renders where this returns 409 is the bug this pair exists to
 * prevent.
 */
function publicFilePrincipal(context: WorkspaceCollabContext | null): ResourceHubPrincipal | null {
  if (!workspaceContextHasWorkspaceIdentity(context) || !context) return null;
  // The predicate above already proved both ids are present; this is the type
  // narrowing TS needs, not a second copy of the rule.
  const { workspaceId, workspaceMemberId } = context;
  if (!workspaceId || !workspaceMemberId) return null;
  return {
    memberId: workspaceMemberId,
    // Personal workspaces carry no `teamId`; the workspace id is the scope.
    teamId: context.teamId ?? workspaceId,
    role: context.role,
    lifecycleState: context.lifecycleState,
    workspaceType: context.workspaceType,
  };
}

async function resolveSharedProjectForPublicFile(
  resolveSharedProject: RegisterCollabSyncRoutesDeps['resolveSharedProject'],
  projectId: string,
  context: WorkspaceCollabContext,
  principal: ResourceHubPrincipal,
): Promise<{ ok: true; project: TeamProject | null } | { ok: false }> {
  try {
    return {
      ok: true,
      project: await resolveSharedProject?.(projectId, {
        workspaceId: context.workspaceId,
        resourceTeamId: principal.teamId,
        viewerMemberId: principal.memberId,
        // This is an ownership lookup, not a pull authorization witness. The
        // catalog result below supplies the authoritative owner.
        ownerMemberId: '',
      }) ?? null,
    };
  } catch (error) {
    console.warn('[od] failed to resolve public file project ownership:', error);
    return { ok: false };
  }
}

type RouteWorkspaceVerification =
  | { ok: true; context: WorkspaceCollabContext | null }
  | Exclude<VerifiedWorkspaceRequestContextResult, { ok: true }>;

function normalizeWorkspaceVerification(
  value:
    | VerifiedWorkspaceRequestContextResult
    | WorkspaceCollabContext
    | null,
): RouteWorkspaceVerification {
  if (value && 'ok' in value) return value;
  if (value) return { ok: true, context: value };
  // Legacy injected test adapters used null as a route-specific denial.
  // Production supplies the structured verifier result above.
  return { ok: true, context: null };
}

function sendWorkspaceVerificationFailure(
  res: Response,
  verification: Exclude<RouteWorkspaceVerification, { ok: true }>,
) {
  return res.status(verification.status).json({
    error: verification.code,
    message: verification.message,
    ...(verification.retryable ? { retryable: true } : {}),
  });
}

/** A row whose alias cannot form a Viewer address (for example a pre-alias
 * slug) is still a live publication the owner must be able to see and stop,
 * so any fault here degrades to "link unavailable", never an error. */
function presentPublicShareLink(
  resolve: RegisterCollabSyncRoutesDeps['resolvePublicShareLink'],
  projectId: string,
  slug: string,
  amr: AmrShareLink | string | null,
): PublicShareLink {
  const unavailable = { url: null, code: 'PUBLIC_SHARE_WEB_URL_UNAVAILABLE' as const };
  if (!resolve) return unavailable;
  try {
    return resolve(projectId, slug, amr);
  } catch {
    return unavailable;
  }
}

export function registerCollabSyncRoutes(
  app: Express,
  deps: RegisterCollabSyncRoutesDeps,
): CollabSyncRoutesHandle {
  const {
    scheduler,
    publishedVersion,
    publishedHead,
    projectSyncState,
    projectOwnerMemberId,
    pullLatest,
  } = deps.collab;
  const {
    projectStore,
    resolveProjectDir,
    resolvePullDir,
    resolveSharedProjectOwner,
    resolveSharedProjectOwnerForStatus,
    resolveSharedProject,
    markTeamProjectRevoked,
    isTeamProjectRevoked,
    markSharedProjectPlaceholder,
    retireUnmaterializedSharedPlaceholder,
    invalidateTeamProjectCatalog,
    resolveOwnerDisplayName,
    notifyFilesChanged,
    notifyProjectMetadataChanged,
  } = deps;
  const readManifest = deps.readManifest ?? readProjectManifest;
  const publicFilePublicationStore =
    deps.publicFilePublicationStore
    ?? createInMemoryPublicFilePublicationStore();
  const ownerEnrichmentCache = new Map<
    string,
    {
      entry: { displayName: string; role: 'owner' | 'admin' | 'member' } | null;
      resolvedAt: number;
    }
  >();
  const ownerEnrichmentInFlight = new Map<string, Promise<void>>();
  const headEnrichmentCache = new Map<
    string,
    { head: number | null; scope: TeamMirrorPullScope | null }
  >();
  const headEnrichmentInFlight = new Map<string, Promise<void>>();
  const OWNER_ENRICHMENT_TTL_MS = 30_000;
  const reportPullTiming = (
    event: Parameters<NonNullable<RegisterCollabSyncRoutesDeps['onPullTiming']>>[0],
  ): void => {
    try {
      deps.onPullTiming?.(event);
    } catch {
      // Diagnostics are observational and must never affect pull behavior.
    }
  };

  async function verifyWorkspaceContextForRequest(
    req: Request,
    projectId?: string,
    verifier = deps.verifyWorkspaceRequest,
  ): Promise<RouteWorkspaceVerification> {
    if (!verifier) {
      return { ok: true, context: null };
    }
    try {
      return normalizeWorkspaceVerification(
        await verifier(req, projectId),
      );
    } catch {
      return {
        ok: false,
        status: 503,
        code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
        message: 'workspace membership authority is temporarily unavailable',
        retryable: true,
      };
    }
  }

  function verifiedWorkspaceContextForRequest(
    req: Request,
    projectId?: string,
  ): Promise<RouteWorkspaceVerification> {
    return verifyWorkspaceContextForRequest(
      req,
      projectId,
      deps.verifyWorkspaceRequest,
    );
  }

  function verifiedWorkspaceReadContextForRequest(
    req: Request,
    projectId?: string,
  ): Promise<RouteWorkspaceVerification> {
    return verifyWorkspaceContextForRequest(
      req,
      projectId,
      deps.verifyWorkspaceReadRequest ?? deps.verifyWorkspaceRequest,
    );
  }

  async function statusIdentityForRequest(projectId: string, req: {
    get(name: string): string | undefined;
    headers: { authorization?: string | string[] | undefined };
  }): Promise<{
    verification: RouteWorkspaceVerification;
    context: WorkspaceCollabContext | null;
    principal: ResourceHubPrincipal | null;
    workspaceId: string | null;
  }> {
    const verification = await verifiedWorkspaceReadContextForRequest(
      req as Request,
      projectId,
    );
    const context = verification.ok ? verification.context : null;
    return {
      verification,
      context,
      principal: contextToResourceHubPrincipal(context),
      workspaceId: context?.workspaceId?.trim() || null,
    };
  }

  async function pullAccessForRequest(
    projectId: string,
    req: {
      get(name: string): string | undefined;
      headers: { authorization?: string | string[] | undefined };
    },
    knownOwnerMemberId?: string | null,
    capturedIdentity?: {
      principal: ResourceHubPrincipal | null;
      workspaceId: string | null;
    },
  ): Promise<{
    verification: RouteWorkspaceVerification;
    principal: ResourceHubPrincipal | null;
    scope: TeamMirrorPullScope | null;
  }> {
    const verification = capturedIdentity
      ? { ok: true as const, context: null }
      : await verifiedWorkspaceContextForRequest(req as Request, projectId);
    const context = verification.ok ? verification.context : null;
    const viewerPrincipal =
      capturedIdentity?.principal ??
      contextToResourceHubPrincipal(context);
    const workspaceId = capturedIdentity
      ? capturedIdentity.workspaceId
      : context?.workspaceId;
    const viewerMemberId = viewerPrincipal?.memberId ?? null;
    let ownerMemberId = knownOwnerMemberId ?? null;
    if (knownOwnerMemberId === undefined) {
      try {
        ownerMemberId =
          workspaceId && viewerMemberId
            ? (await resolveSharedProjectOwner?.(projectId, {
                workspaceId,
                workspaceMemberId: viewerMemberId,
              }))
                ?? projectOwnerMemberId(projectId, viewerPrincipal)
                ?? null
            : null;
      } catch {
        ownerMemberId = null;
      }
    }
    const activeContext = Boolean(
      context
      && context.memberStatus === 'active'
      && context.lifecycleState === 'active'
      && context.workspaceId === workspaceId
      && context.workspaceMemberId === viewerPrincipal?.memberId,
    );
    const resourceTeamId = capturedIdentity || activeContext
      ? viewerPrincipal?.teamId
      : null;
    const scope =
      ownerMemberId &&
      viewerPrincipal &&
      workspaceId &&
      resourceTeamId &&
      (capturedIdentity != null || activeContext)
        ? {
            workspaceId,
            resourceTeamId,
            viewerMemberId: viewerPrincipal.memberId,
            ownerMemberId,
          }
        : null;
    const principal = ownerMemberId && viewerPrincipal?.teamId
      ? {
          ...viewerPrincipal,
          ...(scope ? { teamId: scope.resourceTeamId } : {}),
          memberId: ownerMemberId,
          role: ownerMemberId === viewerPrincipal.memberId ? viewerPrincipal.role : 'member' as const,
        }
      : viewerPrincipal;
    const boundScope = scope && deps.resolveTeamProjectResourceId
      ? { ...scope, resourceId: await deps.resolveTeamProjectResourceId(projectId, scope) }
      : scope;
    return { verification, principal, scope: boundScope };
  }

  async function canShareProjectsForRequest(
    req: Request,
    verifiedContext?: WorkspaceCollabContext | null,
  ): Promise<boolean> {
    const verification =
      verifiedContext === undefined
        ? await verifiedWorkspaceContextForRequest(req)
        : { ok: true as const, context: verifiedContext };
    const context = verification.ok ? verification.context : null;
    return context?.permissions.canShareProjects === true;
  }

  async function verifiedPublishPrincipalForRequest(
    req: Request,
    projectId: string,
  ): Promise<
    | { ok: true; principal: ResourceHubPrincipal }
    | {
        ok: false;
        status: 400 | 401 | 403 | 503;
        error: string;
        message?: string;
        retryable?: true;
      }
  > {
    const verification = await verifiedWorkspaceContextForRequest(req, projectId);
    if (!verification.ok) {
      return {
        ok: false,
        status: verification.status,
        error: verification.code,
        message: verification.message,
        ...(verification.retryable ? { retryable: true } : {}),
      };
    }
    const context = verification.context;
    const principal = contextToResourceHubPrincipal(context);
    if (
      !context
      || !principal
      || context.memberStatus !== 'active'
      || context.lifecycleState !== 'active'
      || !context.permissions.canWriteSyncedFiles
    ) {
      return {
        ok: false,
        status: 403,
        error: 'WORKSPACE_PROJECT_PUBLISH_DENIED',
      };
    }
    let ownerMemberId: string | null;
    try {
      ownerMemberId =
        await resolveSharedProjectOwner?.(projectId, {
          workspaceId: context.workspaceId,
          workspaceMemberId: context.workspaceMemberId,
        })
        ?? projectOwnerMemberId(projectId, principal);
    } catch {
      return {
        ok: false,
        status: 503,
        error: 'WORKSPACE_PROJECT_OWNERSHIP_UNAVAILABLE',
      };
    }
    if (ownerMemberId !== principal.memberId) {
      return {
        ok: false,
        status: 403,
        error: 'WORKSPACE_PROJECT_PUBLISH_DENIED',
      };
    }
    return { ok: true, principal };
  }

  async function capturedScopeIsStillAuthorized(scope: TeamMirrorPullScope): Promise<boolean> {
    try {
      return await deps.verifyWorkspaceScope?.(scope) ?? false;
    } catch {
      return false;
    }
  }

  interface PreparedPulledProjectRegistration {
    existing: { name?: string | null } | null;
    fallbackName: string;
    manifest: PulledProjectManifest | null;
    now: number;
    projectId: string;
  }

  async function preparePulledProjectRegistration(
    projectId: string,
    scope: TeamMirrorPullScope | null,
    projectDirOverride?: string,
  ): Promise<PreparedPulledProjectRegistration | null> {
    if (!projectStore || !resolvePullDir) {
      if (scope) throw new Error('team mirror project store unavailable');
      return null;
    }
    const existing = projectStore.get?.(projectId);
    if (!scope) {
      if (!existing && projectStore.has(projectId)) return null;
      if (existing && cleanPulledProjectName(existing.name) !== PULLED_PROJECT_PLACEHOLDER_NAME) return null;
    }
    const projectDir = projectDirOverride ?? resolvePullDir(projectId);
    let manifest: PulledProjectManifest | null = null;
    try {
      manifest = await readManifest(projectDir);
    } catch {
      manifest = null;
    }
    return {
      existing: existing ?? null,
      fallbackName: await resolvePulledProjectName(projectDir, manifest),
      manifest,
      now: Date.now(),
      projectId,
    };
  }

  /**
   * Register/refresh the local project record for a just-pulled shared
   * project. This function is deliberately synchronous: a scoped caller does
   * its final authoritative catalog read and workspace-identity check
   * immediately before entering the SQLite transaction, with no ambient
   * metadata await able to reopen a workspace/unshare race in between.
   */
  function registerPreparedPulledProject(
    prepared: PreparedPulledProjectRegistration | null,
    scope: TeamMirrorPullScope | null,
    teamProject: TeamProject | null,
    receipt?: AuthorizedTeamProjectPullReceipt,
    fileReceipt?: { resourceId: string; versionId: string },
  ): boolean {
    if (!prepared || !projectStore) return false;
    const { existing, fallbackName, manifest, now, projectId } = prepared;
    const input = {
      id: projectId,
      name: cleanPulledProjectName(teamProject?.name) ?? fallbackName,
      skillId: teamProject?.skillId ?? manifest?.skillId ?? null,
      designSystemId: teamProject?.designSystemId ?? manifest?.designSystemId ?? null,
      ...(teamProject?.metadata ? { metadata: teamProject.metadata } : {}),
      createdAt: typeof teamProject?.createdAt === 'number'
        ? teamProject.createdAt
        : typeof manifest?.createdAt === 'number'
          ? manifest.createdAt
          : now,
      updatedAt: typeof teamProject?.updatedAt === 'number'
        ? teamProject.updatedAt
        : typeof manifest?.updatedAt === 'number'
          ? manifest.updatedAt
          : now,
    };
    if (scope) {
      if (receipt) {
        if (!projectStore.materializeAuthorizedTeamMirror) {
          throw new Error('authorized team mirror materializer unavailable');
        }
        return projectStore.materializeAuthorizedTeamMirror(
          input,
          scope,
          receipt,
        ).localRecordChanged;
      }
      if (!projectStore.materializeTeamMirror) {
        throw new Error('team mirror materializer unavailable');
      }
      return (fileReceipt
        ? projectStore.materializeTeamMirror(input, scope, fileReceipt)
        : projectStore.materializeTeamMirror(input, scope)).localRecordChanged;
    }
    if (existing) {
      if (!projectStore.update) return false;
      projectStore.update(input);
      return true;
    }
    projectStore.register(input);
    return true;
  }

  /**
   * Register a minimal placeholder project record the moment a member opens a
   * shared project they don't have locally yet — synchronously, with no hub
   * round-trip. Without it `getProject` fails for the multi-second window before
   * the resource pull materializes the project, and every project route
   * (conversations, events SSE, tabs, files) 404s. The web answers those 404s
   * with retry storms + EventSource reconnects — the request flood that made a
   * shared project take tens of seconds to open. The post-pull
   * `registerPulledProject` overwrites the placeholder name with the real one;
   * this is a no-op once the project is known locally.
   */
  function ensureSharedProjectPlaceholder(projectId: string): void {
    if (!projectStore || projectStore.has(projectId)) return;
    const now = Date.now();
    projectStore.register({
      id: projectId,
      name: PULLED_PROJECT_PLACEHOLDER_NAME,
      skillId: null,
      designSystemId: null,
      createdAt: now,
      updatedAt: now,
    });
    // Stamp the record as an unmaterialized placeholder so no publish path
    // ever treats its (empty) content directory as content authority until a
    // pull lands real hub content (the recvqzaDvUU6B3 fresh-install wipe
    // guard — see collab/shared-project-placeholder.ts).
    markSharedProjectPlaceholder?.(projectId, true);
  }

  function ensureTeamBoundSharedProjectPlaceholder(
    projectId: string,
    scope: TeamMirrorPullScope,
  ): boolean {
    if (!projectStore?.materializeTeamPlaceholder) {
      throw new Error('team placeholder materializer unavailable');
    }
    const existing = projectStore.get?.(projectId) ?? null;
    if (projectStore.has(projectId) && !isUnmaterializedSharedPlaceholder(existing)) {
      return false;
    }
    const now = Date.now();
    projectStore.materializeTeamPlaceholder({
      id: projectId,
      name: PULLED_PROJECT_PLACEHOLDER_NAME,
      skillId: null,
      designSystemId: null,
      createdAt: now,
      updatedAt: now,
    }, scope);
    return true;
  }

  /**
   * Invariant: opening a shared project whose only local record is an
   * unmaterialized placeholder starts that project's content pull on the very
   * request that discovered it — for EVERY viewer, owner or member.
   *
   * Neither side of the product had another way to start it on first open. The
   * web's auto-pull is gated on `publishedVersion` advancing past its cursor,
   * and a fresh daemon's first status response cannot carry a published head:
   * `collab.publishedVersion()` reads an in-process map that has never been
   * written, and the real hub head is fetched fire-and-forget into
   * `headEnrichmentCache` for a LATER poll to consume. So a brand-new member
   * who opened a shared project on a fresh install got a placeholder, an empty
   * file list, and no pull at all — materialization arrived only whenever a
   * proactive lane (hub push / reconnect catch-up / the recovery floor) next
   * fired, which is why the content appeared to show up "only on the second
   * open".
   *
   * Fire-and-forget by design: the pull replaces the whole project tree and
   * must never hold the status response open. Callers surface progress through
   * `awaitingFirstMaterialization` + `contentTransferState` instead.
   */
  function materializePlaceholderOnOpen(
    projectId: string,
    req: Parameters<typeof pullAccessForRequest>[1],
    viewer: {
      ownerMemberId: string | null;
      callerIsOwner: boolean;
    },
  ): void {
    if (!viewer.ownerMemberId) return;
    void (async () => {
      // Status may have been authorized by the bounded read lease. Pulling and
      // materializing bytes is a mutation, so deliberately omit the captured
      // status identity and force `pullAccessForRequest` through fresh
      // `verifyWorkspaceRequest` authority.
      const { principal: resourcePrincipal, scope } = await pullAccessForRequest(
        projectId,
        req,
        viewer.ownerMemberId,
      );
      if (!scope) return;
      try {
        if (scope.ownerMemberId === scope.viewerMemberId && deps.ownedContentSync) {
          const update = await deps.ownedContentSync.request(
            { projectId, ...scope },
            { action: 'check' },
            undefined,
            true,
          );
          if (update.state !== 'up_to_date' || update.latestVersion != null || update.localVersion != null) return;
        }
        await pullSharedProjectCoalesced(projectId, resourcePrincipal, scope);
      } catch (error) {
        // Retracted-share heal (飞书 recvqA6qhV7St1): the catalog names this
        // caller as the project's owner, yet the published pull answered
        // `resource_not_found` — the hub's tombstone gate. A live share can
        // never produce that pair; it is the hub-authoritative signature of a
        // HALF-LANDED retraction: an unshare's `resource remove` landed but
        // its `team-projects remove` did not, leaving a dangling catalog row.
        // On a fresh data root there is no `cloudTombstonedAt` left to
        // suppress it, so the retracted project revives as a ghost team card
        // for every member (reproduced live on the feature-test hub,
        // 2026-07-27). Finish the retraction from the hub's own state instead
        // of trusting local memory: complete the catalog removal (unpublish is
        // idempotent against the tombstone), retire the contentless
        // placeholder this open registered, and drop the cached listing.
        //
        // Owner-only: retracting a share is the sharer's action. A member who
        // hits the same tombstone has merely lost access and must not unshare
        // anyone's project on their behalf.
        if (!viewer.callerIsOwner) throw error;
        if (!isRetractedHubResourceError(error)) throw error;
        if (
          !projectStore?.get ||
          !isUnmaterializedSharedPlaceholder(projectStore.get(projectId))
        ) return;
        await deps.collab.forgetTeamShare?.(projectId, resourcePrincipal);
        retireUnmaterializedSharedPlaceholder?.(projectId);
        invalidateTeamProjectCatalog?.();
      }
    })().catch(() => undefined);
  }

  app.post('/api/projects/:id/collab/changed', async (req, res) => {
    const projectId = req.params.id;
    const authorization = await verifiedPublishPrincipalForRequest(req, projectId);
    if (!authorization.ok) {
      return res.status(authorization.status).json({
        error: authorization.error,
        ...(authorization.message ? { message: authorization.message } : {}),
        ...(authorization.retryable ? { retryable: true } : {}),
      });
    }
    scheduler.notifyChanged(projectId, 'change', authorization.principal);
    return res.json({ ok: true });
  });

  app.post('/api/projects/:id/collab/publish', async (req, res) => {
    const projectId = req.params.id;
    const authorization = await verifiedPublishPrincipalForRequest(req, projectId);
    if (!authorization.ok) {
      return res.status(authorization.status).json({
        error: authorization.error,
        ...(authorization.message ? { message: authorization.message } : {}),
        ...(authorization.retryable ? { retryable: true } : {}),
      });
    }
    scheduler.notifyChanged(projectId, 'run', authorization.principal);
    scheduler.runBoundary(projectId, authorization.principal);
    return res.json({ ok: true });
  });

  app.post(/^\/api\/projects\/([^/]+)\/files\/(.+)\/share-plan$/u, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    // SAFETY: Express regex routes expose numeric capture keys at runtime; Express's named-param type omits them.
    const params = req.params as unknown as { 0?: string; 1?: string };
    const projectId = String(params[0] ?? '');
    const filePath = normalizePublicFilePath(String(params[1] ?? ''));
    if (!projectId || !filePath) return res.status(400).json({ error: 'invalid_file_path' });
    const verification = await verifiedWorkspaceContextForRequest(req, projectId);
    if (!verification.ok) return sendWorkspaceVerificationFailure(res, verification);
    const context = verification.context;
    const principal = publicFilePrincipal(context);
    if (!context || !principal) return res.status(409).json(workspaceIdentityRequiredBody());
    if (!await canShareProjectsForRequest(req, context)) return res.status(403).json({ error: 'WORKSPACE_PROJECT_SHARE_DENIED' });
    const resolved = await resolveSharedProjectForPublicFile(resolveSharedProject, projectId, context, principal);
    if (!resolved.ok) return res.status(503).json({ error: 'WORKSPACE_PROJECT_OWNERSHIP_UNAVAILABLE' });
    const owner = resolved.project?.ownerMemberId
      ?? (!resolved.project ? deps.resolveLocalPublicShareOwner?.(projectId, context.workspaceId) : null);
    if (!owner || owner !== principal.memberId || isUnmaterializedSharedPlaceholder(projectStore?.get?.(projectId))) {
      return res.status(403).json({ error: 'WORKSPACE_PROJECT_PUBLISH_DENIED' });
    }
    if (!resolveProjectDir) return res.status(500).json({ error: 'PROJECT_DIR_UNAVAILABLE' });
    try {
      const plan = await buildSharePlan(await resolveProjectDir(projectId), filePath, projectStore?.get?.(projectId)?.metadata);
      return res.json(plan.summary);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      return res.status(code === 'ENOENT' ? 404 : 400).json({ error: code === 'ENOENT' ? 'FILE_NOT_FOUND' : 'FILE_UNAVAILABLE' });
    }
  });

  app.post(/^\/api\/projects\/([^/]+)\/files\/(.+)\/publish-public$/u, publicFileMutationHandler(deps.publicFileMutations, async (req, res) => {
    const startedAt = Date.now();
    const requestId = clientRequestIdFor(req);
    // SAFETY: these RegExp routes expose numeric capture keys; Express types model named keys only.
    const params = req.params as unknown as { 0?: string; 1?: string };
    const projectId = String(params[0] ?? '');
    const filePath = normalizePublicFilePath(String(params[1] ?? ''));
    if (!projectId || !filePath) {
      return res.status(400).json({ error: 'invalid_file_path' });
    }
    // These are routing identity claims only. The pinned cloud session authorizes
    // every mutation; workspace visibility permission is not public publication permission.
    const verification = resolveOptionalLocalWorkspaceRequestAuthority(req);
    if (!verification.ok) return res.status(verification.status).json({error:verification.code});
    const verifiedContext = verification.context;
    const principal = publicFilePrincipal(verifiedContext);
    if (!verifiedContext || !principal) return res.status(409).json(workspaceIdentityRequiredBody());
    const owner = deps.resolveLocalPublicShareOwner?.(projectId, verifiedContext.workspaceId);
    if (!owner || owner !== principal.memberId || isUnmaterializedSharedPlaceholder(projectStore?.get?.(projectId)))
      return res.status(403).json({error:'WORKSPACE_PROJECT_PUBLISH_DENIED'});
    let sharedProject: TeamProject | null = null;
    const publisher = deps.sharePublishing;
    if (!publisher) return res.status(503).json({ error: 'PUBLIC_SHARE_PUBLISH_UNAVAILABLE' });
    const scope = publicFilePublicationScope(projectId, filePath, principal);
    if (publisher.sourceFileId) scope.sourceFileId = publisher.sourceFileId(scope, sharedProject);
    // A stopped link cannot be reopened by the ordinary publish/update POST:
    // that path advances the alias and transfers fresh bytes. Only an explicit
    // request may reopen the immutable generation previously bound by Vela.
    const requestBody: unknown = req.body;
    if (requestBody != null && (typeof requestBody !== 'object' || Array.isArray(requestBody)
      || Object.keys(requestBody).some(key => key !== 'mode'))) {
      return res.status(400).json({ error: 'INVALID_SHARE_PUBLISH_REQUEST' });
    }
    const mode = (requestBody as SharePublishRequest | undefined)?.mode;
    if (mode !== undefined && mode !== 'resume') return res.status(400).json({ error: 'INVALID_SHARE_PUBLISH_REQUEST' });
    if (mode === 'resume') {
      const diagnose = (status: number, errorCode: string, stage: PublicShareDiagnosticStage = 'resume_guard') => {
        logPublicShareDiagnostic({ operation: 'resume', stage, status, errorCode, requestId, startedAt });
      };
      const fail = (status: number, errorCode: string, stage?: PublicShareDiagnosticStage) => {
        diagnose(status, errorCode, stage);
        return res.status(status).json({ error: errorCode });
      };
      const remoteState = await deps.readProjectShareState?.(scope).catch(() => null);
      if (!remoteState || remoteState.projectId !== projectId) {
        return fail(503, 'SHARE_STATE_UNAVAILABLE', 'remote_state');
      }
      const recovered = await sourceIdentityForHistory(scope, remoteState, verifiedContext, principal);
      if (!recovered.ok) return fail(recovered.status, recovered.error);
      if (recovered.sourceFileId) scope.sourceFileId = recovered.sourceFileId;
      let candidate: ReturnType<typeof currentFileSharePublication>;
      try { candidate = currentFileSharePublication(remoteState, filePath, scope.sourceFileId); }
      catch (error) {
        if (error instanceof UnboundFileShareIdentityError) return fail(409, 'SHARE_FILE_IDENTITY_UNAVAILABLE');
        throw error;
      }
      const stopped = candidate?.status === 'stopped' ? candidate : undefined;
      const localRevision = publicFilePublicationStore.getRevision(scope);
      if (!stopped || (localRevision && localRevision.slug !== stopped.slug)) {
        return fail(409, 'SHARE_RESUME_NOT_STOPPED');
      }
      const stopQueue = (publicFilePublicationStore as Partial<StopQueuePublicFilePublicationStore>).listStops?.();
      if (!stopQueue) return fail(503, 'PUBLIC_SHARE_STOP_STATE_UNAVAILABLE');
      if (stopQueue.some(item => item.resourceTeamId === scope.resourceTeamId
        && item.ownerMemberId === scope.ownerMemberId && item.projectId === projectId
        && item.filePath === filePath && item.slug === stopped.slug)) {
        return fail(409, 'SHARE_STOP_IN_PROGRESS');
      }
      try {
        const reservation = reserveFileShareAlias({ scope, history: remoteState, reservations: publisher.reservations,
          publications: publicFilePublicationStore, outbox: publisher.outbox });
        if (reservation.slug !== stopped.slug) {
          return fail(409, 'SHARE_ALIAS_IDENTITY_MISMATCH');
        }
        const prepared = await publisher.prepare(scope, stopped.slug);
        // The remote stopped witness outranks a matching local revision left
        // by a crash after Vela stopped but before OD committed the deletion.
        // CAS prevents a concurrent new publication from being discarded.
        if (localRevision && !publicFilePublicationStore.deleteIfRevisionMatches(scope, localRevision)) {
          return fail(409, 'SHARE_RESUME_NOT_STOPPED');
        }
        let resumedShare: Awaited<ReturnType<typeof resumeExistingVelaShare>>;
        try {
          resumedShare = await resumeExistingVelaShare(scope, stopped.slug, prepared.run);
        } catch {
          // A lost/invalid command reply may follow a successful remote alias
          // activation. Revoke the exact Owner-verified alias before reporting
          // a routine retryable failure; otherwise require explicit revocation.
          try {
            await stopVelaShare(projectId, stopped.slug, prepared.run);
            return fail(502, 'PUBLIC_SHARE_RESUME_UNAVAILABLE', 'resume_command');
          } catch {
            const after = await deps.readProjectShareState?.(scope).catch(() => null);
            if (after?.projectId === projectId && after.publications.some(item => item.sourceFilePath === filePath
              && item.slug === stopped.slug && item.status === 'stopped')) {
              return fail(502, 'PUBLIC_SHARE_RESUME_UNAVAILABLE', 'resume_command');
            }
            diagnose(502, 'PUBLIC_FILE_MANUAL_REVOKE_REQUIRED', 'resume_command');
            return res.status(502).json({ error: {
              code: 'PUBLIC_FILE_MANUAL_REVOKE_REQUIRED',
              message: 'The original link may have resumed without a confirmed receipt. Stop the link explicitly using od project share stop before retrying.',
              data: { projectId, slug: stopped.slug, fileName: filePath,
                url: presentPublicShareLink(deps.resolvePublicShareLink, projectId, stopped.slug, null).url },
            } });
          }
        }
        const { receipt, amrLink } = resumedShare;
        // Persist only the address AMR reported (verified), as for a publish.
        const publication: PublicFilePublication = { url: persistedAmrShareUrl(amrLink), slug: stopped.slug, fileName: filePath };
        let outcome: ReturnType<typeof publisher.complete>;
        try {
          // Entry path is Vela's saved generation, never a plan from current
          // local bytes. This also queues existing local comments atomically.
          outcome = publisher.complete({ scope, resourceId: publicFileResourceIdFor(scope), publication,
            mapping: [{ sourcePath: filePath, publishedPath: receipt.entryPath }],
            result: { status: 'published', receipt }, reopened: true });
        } catch {
          // Local commit failed AFTER the old link was made public. Restore the
          // stopped state before reporting failure; otherwise a later resume
          // would be rejected while the old link remains anonymously live.
          try {
            await stopVelaShare(projectId, stopped.slug, prepared.run);
            return fail(502, 'PUBLIC_SHARE_RESUME_RECORD_UNAVAILABLE', 'resume_record');
          } catch {
            // If compensation also fails, the normal owner DELETE can revoke
            // via the remote project/file/slug witness even without a local row.
            diagnose(502, 'PUBLIC_FILE_MANUAL_REVOKE_REQUIRED', 'resume_record');
            return res.status(502).json({ error: {
              code: 'PUBLIC_FILE_MANUAL_REVOKE_REQUIRED',
              message: 'The original link was resumed remotely but local metadata could not be saved; stop the link explicitly using od project share stop.',
              data: { projectId, ...publication,
                url: presentPublicShareLink(deps.resolvePublicShareLink, projectId, stopped.slug, amrLink).url, receipt },
            } });
          }
        }
        // Resume reopens Vela's saved version of this alias, i.e. the bytes the
        // last confirmed publish fingerprinted. Carry that evidence to the new
        // local revision so later edits read as outdated, not unknown
        // (OPEND-3517). Advisory only: failure leaves the resumed link intact.
        if (deps.shareContentFingerprints) {
          try {
            const revision = publicFilePublicationStore.getRevision(scope);
            if (revision?.slug === stopped.slug) deps.shareContentFingerprints.rebind(scope, revision);
          } catch {
            console.warn('[od] public file content fingerprint unavailable');
          }
        }
        return res.json(sharePublishResponse(outcome,
          presentPublicShareLink(deps.resolvePublicShareLink, projectId, stopped.slug, amrLink)));
      } catch (error) {
        if (error instanceof ShareAliasIdentityMismatchError) return fail(409, error.message);
        return fail(502, 'PUBLIC_SHARE_RESUME_UNAVAILABLE', 'resume_prepare');
      }
    }
    // The plan is built, and refused on size or blockers, before the alias is
    // reserved or Vela is contacted: an unpublishable file must not cost a
    // network round-trip or leave a reservation behind.
    if (!resolveProjectDir) {
      return res.status(500).json({ error: 'PROJECT_DIR_UNAVAILABLE' });
    }

    const projectDir = await resolveProjectDir(projectId);
    let sharePlan: Awaited<ReturnType<typeof buildSharePlan>>;
    try {
      sharePlan = await buildSharePlan(
        projectDir,
        filePath,
        projectStore?.get?.(projectId)?.metadata,
      );
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      return res.status(code === 'ENOENT' ? 404 : 400).json({
        error: code === 'ENOENT' ? 'FILE_NOT_FOUND' : 'FILE_UNAVAILABLE',
      });
    }
    const blocker = sharePlan.summary.blockers?.[0];
    if (blocker) {
      const { code: _blockerCode, ...data } = blocker;
      return res.status(409).json({
        error: { code: SHARE_ENTRY_INDEX_CONFLICT, message: sharePlan.conflictMessage ?? '', data },
        plan: sharePlan.summary,
      });
    }

    let prepared: Awaited<ReturnType<typeof publisher.prepare>>;
    try {
      prepared = await publisher.prepare(scope, '');
      if (!publisher.ensureProject) throw new Error('project bootstrap unavailable');
      sharedProject = await publisher.ensureProject(scope, principal, prepared.run);
      if (sharedProject.projectId !== projectId || sharedProject.ownerMemberId !== principal.memberId)
        return res.status(403).json({error:'WORKSPACE_PROJECT_PUBLISH_DENIED'});
    } catch (error) {
      const failure = classifyVelaCommandFailure('push', error);
      return res.status(failure.upstreamStatus ?? 502).json({ error: 'PUBLIC_SHARE_PREPARATION_UNAVAILABLE', failure });
    }
    // Read history BEFORE reservation: missing local state is not evidence of
    // a first share. Recover the exact cloud alias before preparing any write.
    // Unknown or pre-existing aliases must never be auto-stopped on a local failure.
    const previousState = await deps.readProjectShareState?.(scope).catch(() => null) ?? null;
    if (!previousState || previousState.projectId !== projectId) {
      return res.status(503).json({ error: 'SHARE_STATE_UNAVAILABLE' });
    }
    const recovered = await sourceIdentityForHistory(scope, previousState, verifiedContext, principal);
    if (!recovered.ok) return res.status(recovered.status).json({ error: recovered.error });
    if (recovered.sourceFileId) scope.sourceFileId = recovered.sourceFileId;
    let reservation: ReturnType<typeof publisher.reservations.reserve>;
    try {
      reservation = reserveFileShareAlias({ scope, history: previousState, reservations: publisher.reservations,
        publications: publicFilePublicationStore, outbox: publisher.outbox });
    } catch (error) {
      if (error instanceof UnboundFileShareIdentityError) return res.status(409).json({ error: 'SHARE_FILE_IDENTITY_UNAVAILABLE' });
      if (error instanceof ShareAliasIdentityMismatchError) return res.status(409).json({ error: error.message });
      return res.status(502).json({ error: 'PUBLIC_SHARE_PREPARATION_UNAVAILABLE' });
    }
    const stoppedSlug = previousState?.projectId === projectId
      ? previousState.publications.find(item => item.sourceFilePath === filePath && item.status === 'stopped'
        && (!scope.sourceFileId || item.sourceFileId === scope.sourceFileId)
        && item.slug === reservation.slug)?.slug
      : undefined;
    const resumed = await resumePendingShareBinding(scope, publicFilePublicationStore, publisher.outbox, prepared.run, stoppedSlug);
    if (resumed) {
      return res.json(sharePublishResponse(resumed,
        presentPublicShareLink(deps.resolvePublicShareLink, projectId, resumed.receipt.slug, resumed.amrLink ?? null)));
    }
    // Vela refuses a plain publish to a stopped binding (409
    // share_binding_stopped). Refuse before uploading; reopening the original
    // link is the explicit `{ mode: 'resume' }` request (OPEND-3510).
    if (stoppedSlug) {
      return res.status(409).json({ error: 'SHARE_STOPPED_RESUME_REQUIRED' });
    }
    // Resource association is a mutation: a stopped publish must not reach it.
    // The earlier ensure-private only establishes/retains catalog identity;
    // it does not change visibility or activate a stopped binding.
    // Associate even legacy selected resources; catalog presence is not proof
    // of that relationship. The pinned session must ACK before any file bytes.
    try {
      await registerVelaTeamProjectResource(projectId, publicFileResourceIdFor(scope), prepared.run);
    } catch (error) {
      return res.status(503).json({ error: 'PUBLIC_SHARE_RESOURCE_REGISTRATION_UNAVAILABLE', failure: classifyVelaCommandFailure('push', error) });
    }
    const resourceId = publicFileResourceIdFor(scope);
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'od-public-file-'));
    let stage: 'push' | 'snapshot' | 'persist' = 'push';
    try {
      await stageShareFiles(tempDir, sharePlan.files);
      const metadata = {
        source: 'open-design',
        projectId,
        fileName: filePath,
      };
      const pushOutput = await prepared.run([
        'resource', 'push',
        PUBLIC_FILE_RESOURCE_KIND,
        resourceId,
        tempDir,
        '--public-upload-key',
        createHash('sha256').update(JSON.stringify([scope, publicFilePublicationStore.getRevision(scope)?.token ?? null, fingerprintSharePayload(sharePlan.files)])).digest('hex'),
        '--metadata-json',
        JSON.stringify(metadata),
        '--json',
      ]);
      const versionId = parseVelaPushVersionId(pushOutput);
      await publisher.admitFileReceipt?.(scope, resourceId, versionId, sharePlan.entryPath, prepared.run);
      stage = 'snapshot';
      const result = await publishReservedVelaShareVersion({
        scope, resourceId, versionId, entryPath: sharePlan.entryPath,
        name: path.basename(filePath),
      }, publisher.reservations, prepared.run);
      // Persist only the address AMR reported (verified); an override is a
      // presentation choice and is re-applied on every read instead.
      let amrLink = result.amrLink ?? null;
      const publication: PublicFilePublication = {
        url: persistedAmrShareUrl(amrLink), slug: result.receipt.slug, fileName: filePath,
      };
      let outcome: ReturnType<typeof publisher.complete>;
      stage = 'persist';
      try {
        outcome = publisher.complete({ scope, resourceId, publication, mapping: sharePlan.mapping, result });
      } catch {
        if (previousState?.projectId === projectId && !previousState.publications.some(item => item.slug === result.receipt.slug)) {
          try {
            await stopVelaShare(projectId, result.receipt.slug, prepared.run);
            const failure: import('@open-design/contracts').ApiFailureDetail = { stage, reason: 'internal' };
            logPublicFileFailure({
              action: 'publish', errorCode: 'PUBLIC_FILE_PUBLISH_UNAVAILABLE', failure, requestId, startedAt,
            });
            return res.status(failure.upstreamStatus && failure.upstreamStatus >= 400 ? failure.upstreamStatus : 502).json({ error: 'PUBLIC_FILE_PUBLISH_UNAVAILABLE', failure });
          } catch { /* Remote publication may still be accessible: never hide it. */ }
        }
        const manualUrl = presentPublicShareLink(deps.resolvePublicShareLink, projectId, result.receipt.slug, amrLink).url;
        return res.status(502).json({ error: {
          code: 'PUBLIC_FILE_MANUAL_REVOKE_REQUIRED',
          message: `Publication metadata could not be saved; the public share may remain accessible${manualUrl ? ` at ${manualUrl}` : ''}. Use od project share stop to revoke it explicitly.`,
          data: { ...publication, url: manualUrl, projectId, receipt: result.receipt },
        } });
      }
      // Register/bind must never revive a stopped link. This foreground owner
      // request alone carries explicit resume intent for the observed alias.
      if (outcome.status === 'binding_pending' && stoppedSlug === outcome.receipt.slug) {
        const resumedOutcome = await resumePendingShareBinding(scope, publicFilePublicationStore, publisher.outbox, prepared.run, stoppedSlug);
        if (resumedOutcome) {
          outcome = resumedOutcome;
          amrLink = resumedOutcome.amrLink ?? amrLink;
        }
      }
      const response = sharePublishResponse(outcome,
        presentPublicShareLink(deps.resolvePublicShareLink, projectId, outcome.receipt.slug, amrLink));
      if (response.status === 'binding_pending' && response.binding.retrying) {
        try { publisher.retry(); }
        catch { response.binding = { retrying: false, code: 'SHARE_BINDING_RETRY_UNAVAILABLE' }; }
      }
      // This evidence is advisory, unlike the publication itself. Failure must
      // leave the confirmed link intact; reads without evidence say unknown.
      if (deps.shareContentFingerprints) {
        try {
          const scope = publicFilePublicationScope(projectId, filePath, principal);
          const revision = publicFilePublicationStore.getRevision(scope);
          if (revision?.slug === publication.slug) {
            deps.shareContentFingerprints.remember(scope, revision, sharePlan.files);
          }
        } catch {
          console.warn('[od] public file content fingerprint unavailable');
        }
      }
      return res.json(response);
    } catch (error) {
      console.warn('[od] failed to publish public project file:', error);
      const failure = stage === 'persist'
        ? { stage, reason: 'internal' as const }
        : classifyVelaCommandFailure(stage, error);
      logPublicFileFailure({
        action: 'publish', errorCode: 'PUBLIC_FILE_PUBLISH_UNAVAILABLE', failure, requestId, startedAt,
      });
      return res.status(failure.upstreamStatus && failure.upstreamStatus >= 400 ? failure.upstreamStatus : 502).json({ error: 'PUBLIC_FILE_PUBLISH_UNAVAILABLE', failure });
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }));

  app.delete(/^\/api\/projects\/([^/]+)\/files\/(.+)\/publish-public$/u, publicFileMutationHandler(deps.publicFileMutations, async (req, res) => {
    const startedAt = Date.now();
    const requestId = clientRequestIdFor(req);
    // SAFETY: these RegExp routes expose numeric capture keys; Express types model named keys only.
    const params = req.params as unknown as { 0?: string; 1?: string };
    const projectId = String(params[0] ?? '');
    const filePath = normalizePublicFilePath(String(params[1] ?? ''));
    const slug = typeof (req.body as { slug?: unknown } | undefined)?.slug === 'string'
      ? (req.body as { slug: string }).slug.trim()
      : '';
    if (!projectId || !filePath || !slug) {
      return res.status(400).json({ error: 'invalid_public_file' });
    }
    const verification = resolveOptionalLocalWorkspaceRequestAuthority(req);
    if (!verification.ok) return res.status(verification.status).json({error:verification.code});
    const verifiedContext = verification.context;
    const principal = publicFilePrincipal(verifiedContext);
    if (!verifiedContext || !principal) return res.status(409).json(workspaceIdentityRequiredBody());
    const scope = publicFilePublicationScope(projectId, filePath, principal);
    const revision = publicFilePublicationStore.getRevision(scope);
    if (revision && revision.slug !== slug) return res.status(404).json({ error: 'PUBLIC_SHARE_NOT_FOUND' });
    if (!deps.sharePublishing) return res.status(503).json({ error: 'PUBLIC_SHARE_STOP_UNAVAILABLE' });
    if (!revision) {
      // A resumed alias may be active in Vela even if the OD transaction that
      // recorded it failed. Permit only the verified Owner to revoke the exact
      // project/file/slug that Vela itself reports as active. Never use this
      // exception to stop a different locally witnessed publication.
      const remoteState = await deps.readProjectShareState?.(scope).catch(() => null);
      if (!remoteState || remoteState.projectId !== projectId) return res.status(503).json({ error: 'SHARE_STATE_UNAVAILABLE' });
      if (!remoteState.publications.some(item => item.sourceFilePath === filePath && item.slug === slug && item.status === 'active')) {
        return res.status(404).json({ error: 'PUBLIC_SHARE_NOT_FOUND' });
      }
    }
    try {
      const prepared = await deps.sharePublishing.prepare(scope, slug);
      const stopped: unknown = JSON.parse(await prepared.run([
        'share', 'stop', slug, '--project-id', projectId, '--json',
      ]));
      if (!stopped || typeof stopped !== 'object' || !('status' in stopped) || stopped.status !== 'stopped'
        || !('slug' in stopped) || stopped.slug !== slug || !('projectId' in stopped) || stopped.projectId !== projectId) {
        throw new Error('PUBLIC_SHARE_STOP_UNCONFIRMED');
      }
      if (revision?.slug === slug) {
        publicFilePublicationStore.deleteIfRevisionMatches(scope, revision);
      }
      const response: ShareUnpublishResponse = { ok: true, slug, fileName: filePath };
      return res.json(response);
    } catch (error) {
      console.warn('[od] failed to unpublish public project file:', error);
      const failure = classifyVelaCommandFailure('redact', error);
      logPublicFileFailure({
        action: 'unpublish', errorCode: 'PUBLIC_FILE_UNPUBLISH_UNAVAILABLE', failure, requestId, startedAt,
      });
      return res.status(failure.upstreamStatus && failure.upstreamStatus >= 400 ? failure.upstreamStatus : 502).json({ error: 'PUBLIC_FILE_UNPUBLISH_UNAVAILABLE', failure });
    }
  }));

  // Only a missing local lifetime with retained cloud history needs recovery.
  // Normal reads and first publication do not add a catalog dependency.
  async function sourceIdentityForHistory(
    scope: PublicFilePublicationScope,
    history: Awaited<ReturnType<ReadProjectShareState>>,
    context: WorkspaceCollabContext,
    principal: ResourceHubPrincipal,
  ) {
    const publisher = deps.sharePublishing;
    let sourceFileId = scope.sourceFileId;
    let recoveredFromCatalog = false;
    if (publisher?.needsCatalogSourceIdentity?.(scope)
      && history.publications.some(item => item.sourceFilePath === scope.filePath && item.sourceFileId)) {
      const resolved = await resolveSharedProjectForPublicFile(resolveSharedProject, scope.projectId, context, principal);
      if (!resolved.ok || !resolved.project) return { ok: false, status: 503, error: 'WORKSPACE_PROJECT_OWNERSHIP_UNAVAILABLE' } as const;
      if (resolved.project && (resolved.project.projectId !== scope.projectId || resolved.project.ownerMemberId !== principal.memberId))
        return { ok: false, status: 403, error: 'WORKSPACE_PROJECT_PUBLISH_DENIED' } as const;
      const fact = parseCommentFileState(resolved.project.metadata?._commentFiles)?.files
        .find(item => !item.retired && item.sourceFilePath === scope.filePath);
      if (!fact) return { ok: false, status: 409, error: 'SHARE_FILE_IDENTITY_UNAVAILABLE' } as const;
      sourceFileId = publisher.sourceFileId?.(scope, resolved.project);
      if (sourceFileId !== fact.sourceFileId)
        return { ok: false, status: 409, error: 'SHARE_FILE_IDENTITY_UNAVAILABLE' } as const;
      recoveredFromCatalog = true;
    } else {
      sourceFileId ??= publisher?.sourceFileId?.(scope, null);
    }
    return { ok: true, sourceFileId, recoveredFromCatalog } as const;
  }

  app.get('/api/projects/:id/share-state', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const projectId = String(req.params.id);
    const verification = resolveOptionalLocalWorkspaceRequestAuthority(req);
    if (!verification.ok) return res.status(verification.status).json({ error: verification.code });
    const context = verification.context;
    const principal = publicFilePrincipal(context);
    if (!context || !principal) return res.status(409).json(workspaceIdentityRequiredBody());
    if (!deps.readProjectShareState) return res.status(503).json({ error: 'SHARE_STATE_UNAVAILABLE' });
    try {
      const state = await deps.readProjectShareState({ projectId, resourceTeamId: principal.teamId, ownerMemberId: principal.memberId });
      // The history DTO names lifecycle only; addresses go through the file read.
      const response: import('@open-design/contracts').ProjectShareHistoryResponse = {
        projectId: state.projectId, bindingExists: state.bindingExists, hasEverShared: state.hasEverShared,
        publications: state.publications.map(({ sourceFilePath, sourceFileId, slug, status }) => ({ sourceFilePath, ...(sourceFileId ? { sourceFileId } : {}), slug, status })),
      };
      return res.json(response);
    } catch {
      return res.status(503).json({ error: 'SHARE_STATE_UNAVAILABLE' });
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/files\/(.+)\/publish-public$/u, async (req, res) => {
    const startedAt = Date.now();
    const requestId = clientRequestIdFor(req);
    res.setHeader('Cache-Control', 'no-store');
    // SAFETY: these RegExp routes expose numeric capture keys; Express types model named keys only.
    const params = req.params as unknown as { 0?: string; 1?: string };
    const projectId = String(params[0] ?? '');
    const filePath = normalizePublicFilePath(String(params[1] ?? ''));
    if (!projectId || !filePath) {
      return res.status(400).json({ error: 'invalid_file_path' });
    }
    if (req.query.localOnly === 'true') {
      // A local comparison does not authorize any cloud operation. Do not call
      // the remote directory or share-state service to display an update hint.
      const local = resolveOptionalLocalWorkspaceRequestAuthority(req);
      if (!local.ok) return res.status(local.status).json({ error: local.code });
      const principal = publicFilePrincipal(local.context);
      if (!principal) return res.status(409).json(workspaceIdentityRequiredBody());
      let freshness: import('@open-design/contracts').ShareContentFreshness = 'unknown';
      const scope = publicFilePublicationScope(projectId, filePath, principal);
      if (deps.shareContentFingerprints && resolveProjectDir && publicFilePublicationStore.get(scope)) {
        try {
          const plan = await buildSharePlan(await resolveProjectDir(projectId), filePath, projectStore?.get?.(projectId)?.metadata);
          if (!plan.summary.blockers?.length) freshness = deps.shareContentFingerprints.compare(scope, plan.files);
        } catch { /* Missing local evidence is unknown, never a publishing refusal. */ }
      }
      const response: import('@open-design/contracts').ProjectFilePublicShareFreshnessResponse = { freshness };
      return res.json(response);
    }
    const verification = resolveOptionalLocalWorkspaceRequestAuthority(req);
    if (!verification.ok) return res.status(verification.status).json({error:verification.code});
    const verifiedContext = verification.context;
    const principal = publicFilePrincipal(verifiedContext);
    if (!verifiedContext || !principal) return res.status(409).json(workspaceIdentityRequiredBody());
    const scope = publicFilePublicationScope(projectId, filePath, principal);
    // Advisory freshness must use exactly the same planner as upload, including
    // rewritten entry and dependencies. Unavailable bytes never mean no share.
    let freshness: import('@open-design/contracts').ShareContentFreshness = 'unknown';
    if (deps.shareContentFingerprints && resolveProjectDir) {
      try {
        const plan = await buildSharePlan(
          await resolveProjectDir(projectId), filePath, projectStore?.get?.(projectId)?.metadata,
        );
        // A blocked plan is not what would be published; do not compare it.
        if (!plan.summary.blockers?.length) freshness = deps.shareContentFingerprints.compare(scope, plan.files);
      } catch {
        // Keep publication visibility independent from failed comparison.
      }
    }
    if (!deps.readProjectShareState) {
      logPublicShareDiagnostic({ operation: 'state_read', stage: 'remote_state', status: 503,
        errorCode: 'SHARE_STATE_UNAVAILABLE', requestId, startedAt });
      return res.status(503).json({ error: 'SHARE_STATE_UNAVAILABLE' });
    }
    type FilePublicShareResponse = import('@open-design/contracts').ProjectFilePublicShareResponse;
    // A stored `url` is the last AMR address; it only ever reaches a response
    // through the link rule, which re-verifies it (a legacy console URL fails).
    const present = (record: PublicFilePublication, amr: AmrShareLink | string | null): Pick<FilePublicShareResponse, 'publication' | 'link' | 'slug'> => {
      const link = presentPublicShareLink(deps.resolvePublicShareLink, projectId, record.slug, amr);
      return link.url !== null
        ? { publication: { ...record, url: link.url } }
        : { publication: null, link: { status: 'unavailable', code: link.code }, slug: record.slug };
    };
    let history: Awaited<ReturnType<ReadProjectShareState>>;
    try {
      history = await deps.readProjectShareState(scope);
    } catch {
      // The lifecycle source did not answer (offline, signed out, AMR down).
      // A persisted publication is still the best-known link: show it, marked
      // stale, so the panel keeps working offline. Without one there is
      // nothing to say — a request that did not answer is not "none".
      const local = publicFilePublicationStore.get(scope);
      // A queued stop means the owner already asked to end this share: never
      // offer its link as live, even as a stale best guess.
      const stopPending = local && 'listStops' in publicFilePublicationStore
        && (publicFilePublicationStore as StopQueuePublicFilePublicationStore).listStops().some(stop =>
          stop.resourceTeamId === scope.resourceTeamId && stop.ownerMemberId === scope.ownerMemberId
          && stop.projectId === scope.projectId && stop.filePath === scope.filePath && stop.slug === local.slug);
      const staleFallback = Boolean(local && !stopPending);
      logPublicShareDiagnostic({ operation: 'state_read', stage: 'remote_state', status: staleFallback ? 200 : 503,
        errorCode: 'SHARE_STATE_UNAVAILABLE', requestId, startedAt, staleFallback });
      if (!local || stopPending) return res.status(503).json({ error: 'SHARE_STATE_UNAVAILABLE' });
      const response: FilePublicShareResponse = {
        ...present(local, local.url), status: 'active', freshness, stale: true,
      };
      return res.json(response);
    }
    const recovered = await sourceIdentityForHistory(scope, history, verifiedContext, principal);
    if (!recovered.ok) return res.status(recovered.status).json({ error: recovered.error });
    const sourceFileId = recovered.sourceFileId;
    let remote: ReturnType<typeof currentFileSharePublication>;
    try { remote = currentFileSharePublication(history, filePath, sourceFileId); }
    catch (error) {
      if (error instanceof UnboundFileShareIdentityError) return res.status(409).json({ error: 'SHARE_FILE_IDENTITY_UNAVAILABLE' });
      throw error;
    }
    let local = publicFilePublicationStore.get(scope);
    // A row that outlived a stop made elsewhere is not a live publication:
    // the owner should see the stopped state (and resume), not a dead link.
    const live = local && remote && local.slug === remote.slug && remote.status === 'active';
    if (local && remote && live && remote.amrLink) {
      // Every successful status read refreshes the persisted AMR address, so a
      // legacy stored console URL is replaced on the first online read and a
      // changed share-shell origin is picked up without republishing.
      const url = persistedAmrShareUrl(remote.amrLink);
      if (local.url !== url) {
        try {
          if (publicFilePublicationStore.updateLink(scope, local.slug, url)) local = { ...local, url };
        } catch {
          console.warn('[od] share link persistence unavailable');
        }
      }
    }
    const response: FilePublicShareResponse = {
      ...(local && live ? present(local, remote?.amrLink ?? local.url)
        : recovered.recoveredFromCatalog && remote?.status === 'active'
          ? present({ slug: remote.slug, fileName: filePath, url: '' }, remote.amrLink ?? null)
          : { publication: null }),
      status: remote?.status ?? 'none',
      freshness,
    };
    return res.json(response);
  });

  app.post('/api/projects/:id/collab/sync-intent', async (req, res) => {
    const event = (req.body as { event?: unknown } | undefined)?.event;
    if (typeof event !== 'string' || !SYNC_INTENT_EVENTS.has(event as ProjectSyncIntentEvent)) {
      return res.status(400).json({ error: 'invalid sync intent event' });
    }
    const projectId = req.params.id;
    const verification = await verifiedWorkspaceContextForRequest(req, projectId);
    if (!verification.ok) {
      return sendWorkspaceVerificationFailure(res, verification);
    }
    const context = verification.context;
    const principal = contextToResourceHubPrincipal(context);

    if (event === 'project_team_share_requested' || event === 'project_team_unshare_requested') {
      return res.status(409).json({ error: 'PROJECT_VISIBILITY_REQUIRES_MOVE' });
    }

    res.json({ ok: true, syncState: projectSyncState(projectId, principal) });
  });

  /**
   * The one shared-project content pull flow, shared verbatim between
   * `POST /api/projects/:id/collab/pull` and the daemon-internal handle
   * (`CollabSyncRoutesHandle.pullSharedProject`, driven by the hub push
   * channel's proactive pull). Extracted so the two entry points cannot
   * drift: revocation gate → hub pull → register-on-pull → post-pull
   * signals, in that order.
   */
  async function pullSharedProjectOnce(
    projectId: string,
    principal: ResourceHubPrincipal | null,
    capturedScope: TeamMirrorPullScope | null,
    authorizationWitness?: ProactivePullAuthorizationWitness,
    expectedVersion?: number,
    authorizedStageInvocation?: AuthorizedProactivePullInvocation,
  ): Promise<CollabSyncPullOutcome> {
    const scope = capturedScope && deps.resolveTeamProjectResourceId
      ? { ...capturedScope, resourceId: await deps.resolveTeamProjectResourceId(projectId, capturedScope) }
      : capturedScope;
    const profileReceivedAtMs =
      authorizedStageInvocation?.profileReceivedAtMs;
    type AuthorizedPullTimingPhase =
      | 'authorized-stage-started'
      | 'authorized-stage-done'
      | 'authorized-receipt-validated'
      | 'authorized-scope-revalidated'
      | 'promotion-started'
      | 'promotion-done'
      | 'version-persisted';
    const reportAuthorizedPullTiming = (
      phase: AuthorizedPullTimingPhase,
      status?: Extract<
        CollabSyncPullTimingStatus,
        'pulled' | 'staged' | 'capability-unavailable' | 'failed'
      >,
      version = expectedVersion,
    ): void => {
      reportPullTiming({
        phase,
        projectId,
        ...(version != null ? { version } : {}),
        ...(profileReceivedAtMs != null
          ? { receivedAtMs: profileReceivedAtMs }
          : {}),
        atMs: Date.now(),
        ...(status ? { status } : {}),
      });
    };
    reportPullTiming({
      phase: 'route-started',
      projectId,
      ...(expectedVersion != null ? { version: expectedVersion } : {}),
      ...(profileReceivedAtMs != null
        ? { receivedAtMs: profileReceivedAtMs }
        : {}),
      atMs: Date.now(),
    });
    let terminalStatus: 'pulled' | 'revoked' | 'register_failed' | 'threw' =
      'threw';
    let terminalVersion: number | undefined;
    const complete = (
      outcome: CollabSyncPullOutcome,
    ): CollabSyncPullOutcome => {
      terminalStatus = outcome.status;
      if (outcome.status === 'pulled' && outcome.version != null) {
        terminalVersion = outcome.version;
      }
      return outcome;
    };
    try {
    let authoritativeSharedProject: TeamProject | null = null;
    let authorizedCapabilityFallbackVersion: number | null = null;
    const authorizedPull = deps.authorizedTeamProjectPull;
    const hasStageInvocation = authorizedStageInvocation !== undefined;
    const hasAuthorizedStageBrand = Boolean(
      scope &&
      isBoundProactivePullInvocation(
        authorizedStageInvocation,
        {
          projectId,
          workspaceId: scope.workspaceId,
          resourceTeamId: scope.resourceTeamId,
          viewerMemberId: scope.viewerMemberId,
          ownerMemberId: scope.ownerMemberId,
        },
        expectedVersion,
      ),
    );
    if (hasStageInvocation && !hasAuthorizedStageBrand) {
      return complete({ status: 'register_failed' });
    }
    if (
      hasAuthorizedStageBrand &&
      (
        !authorizedStageInvocation ||
        authorizedStageInvocation.signal.aborted ||
        !authorizedStageInvocation.isStillExpected() ||
        !authorizedPull ||
        !resolvePullDir
      )
    ) {
      return complete({ status: 'register_failed' });
    }
    const useAuthorizedStage = hasAuthorizedStageBrand;
    if (
      useAuthorizedStage &&
      scope &&
      authorizedPull &&
      resolvePullDir &&
      authorizedStageInvocation &&
      expectedVersion != null
    ) {
      const authorizedInvocationIsStillValid = async (): Promise<boolean> => {
        if (
          !deps.verifyWorkspaceScope ||
          !isAuthorizedProactivePullInvocation(
            authorizedStageInvocation,
            {
              projectId,
              workspaceId: scope.workspaceId,
              resourceTeamId: scope.resourceTeamId,
              viewerMemberId: scope.viewerMemberId,
              ownerMemberId: scope.ownerMemberId,
            },
            expectedVersion,
          )
        ) {
          return false;
        }
        try {
          const scopeStillAuthorized = await deps.verifyWorkspaceScope(scope);
          if (deps.resolveTeamProjectResourceId
            && scope.resourceId !== await deps.resolveTeamProjectResourceId(projectId, scope)) return false;
          return (
            scopeStillAuthorized &&
            isAuthorizedProactivePullInvocation(
              authorizedStageInvocation,
              {
                projectId,
                workspaceId: scope.workspaceId,
                resourceTeamId: scope.resourceTeamId,
                viewerMemberId: scope.viewerMemberId,
                ownerMemberId: scope.ownerMemberId,
              },
              expectedVersion,
            )
          );
        } catch {
          return false;
        }
      };
      const shouldRetryStaleReceipt = async (
        error: unknown,
        attempt: number,
      ): Promise<boolean> => {
        if (
          attempt !== 0 ||
          !isAuthorizedTeamProjectPullReceiptExpired(error) ||
          authorizedStageInvocation.signal.aborted
        ) {
          return false;
        }
        return authorizedInvocationIsStillValid();
      };
      for (
        let authorizedAttempt = 0;
        authorizedAttempt < 2;
        authorizedAttempt += 1
      ) {
        if (!(await authorizedInvocationIsStillValid())) {
          return complete({ status: 'register_failed' });
        }
        let staged: StagedAuthorizedTeamProjectPull | null = null;
        reportAuthorizedPullTiming('authorized-stage-started');
        try {
          staged = await (authorizedPull.stage ?? stageAuthorizedTeamProjectPull)({
            projectId,
            liveDir: resolvePullDir(projectId),
            scope,
            expectedVersion,
            signal: authorizedStageInvocation.signal,
          });
          reportAuthorizedPullTiming('authorized-stage-done', 'staged');
        } catch (error) {
          const capabilityUnavailable =
            isAuthorizedTeamProjectPullUnavailable(error);
          reportAuthorizedPullTiming(
            'authorized-stage-done',
            capabilityUnavailable ? 'capability-unavailable' : 'failed',
          );
          if (!capabilityUnavailable) {
            if (await shouldRetryStaleReceipt(error, authorizedAttempt)) {
              continue;
            }
            // A cancelled child is not a fault: the scheduler aborts this pull
            // on purpose when a higher version supersedes it, or when the
            // intent is cleared. Logging that as "failed closed" put a
            // fault-shaped warning in the log on ordinary version churn and
            // sent an investigation chasing a phantom failure. The scheduler
            // already handles the cancellation itself (a superseded intent
            // bumps `revision` and re-loops; a cleared one is gone), so this
            // only stops mislabelling it.
            if (!isAbortedOperationError(error)) {
              console.warn('[od] authorized proactive team pull failed closed:', {
                projectId,
                version: expectedVersion,
                ...errorLogFields(error),
              });
            }
            return complete({ status: 'register_failed' });
          }
          // Old CLIs can materialize successfully while returning no version.
          // The event version is only a proven lower bound after the legacy
          // pull and every post-pull authorization/registration gate succeeds;
          // it is never persisted as an authorized receipt.
          authorizedCapabilityFallbackVersion = expectedVersion;
        }
        if (staged) {
          let localRecordChanged = false;
          let promotionStarted = false;
          let retryAuthorizedStage = false;
          let cleanupSucceeded = true;
          try {
            validateAuthorizedTeamProjectPullReceipt(staged.receipt, {
              projectId,
              scope,
              expectedVersion,
            });
            reportAuthorizedPullTiming('authorized-receipt-validated');
            const prepared = await preparePulledProjectRegistration(
              projectId,
              scope,
              staged.stageDir,
            );
            const selectedCatalogProject = resolveSharedProject
              ? await resolveSharedProject(projectId, scope)
              : null;
            if (resolveSharedProject && (!selectedCatalogProject || selectedCatalogProject.ownerMemberId !== scope.ownerMemberId)) {
              throw new Error('authorized team project catalog changed before promotion');
            }
            if (!(await authorizedInvocationIsStillValid())) {
              throw new Error(
                'authorized team project scope changed before promotion',
              );
            }
            reportAuthorizedPullTiming('authorized-scope-revalidated');
            reportAuthorizedPullTiming('promotion-started');
            promotionStarted = true;
            const result = await (
              authorizedPull.promote ?? promoteAuthorizedTeamProjectStage
            )({
              receipt: staged.receipt,
              liveDir: resolvePullDir(projectId),
              stageDir: staged.stageDir,
              expectedStageIdentity: staged.identity,
              journalDir: authorizedPull.journalDir,
              isScopeStillAuthorized:
                authorizedStageInvocation.isStillExpected,
              isExpectedVersion:
                authorizedStageInvocation.isStillExpected,
              validateReceipt: () =>
                validateAuthorizedTeamProjectPullReceipt(staged!.receipt, {
                  projectId,
                  scope,
                  expectedVersion,
                }),
              commit: () => {
                const committed = {
                  localRecordChanged: registerPreparedPulledProject(
                    prepared,
                    scope,
                    selectedCatalogProject,
                    staged!.receipt,
                  ),
                };
                reportAuthorizedPullTiming(
                  'version-persisted',
                  undefined,
                  staged!.receipt.version,
                );
                return committed;
              },
              onPostCommitCleanupError: (error) => {
                console.warn(
                  '[od] authorized team project committed; deferred promotion cleanup:',
                  {
                    projectId,
                    version: expectedVersion,
                    ...errorLogFields(error),
                  },
                );
              },
            });
            reportAuthorizedPullTiming('promotion-done', 'pulled');
            localRecordChanged = result.localRecordChanged;
          } catch (error) {
            if (promotionStarted) {
              reportAuthorizedPullTiming('promotion-done', 'failed');
            }
            const versionStillExpected =
              authorizedStageInvocation.isStillExpected();
            const reason = !versionStillExpected
              ? 'version-superseded'
              : 'promotion-failed';
            retryAuthorizedStage = await shouldRetryStaleReceipt(
              error,
              authorizedAttempt,
            );
            if (!retryAuthorizedStage) {
              console.warn('[od] failed to promote authorized team project', {
                projectId,
                version: expectedVersion,
                reason,
                ...errorLogFields(error),
              });
              return complete({ status: 'register_failed' });
            }
          } finally {
            try {
              await staged.cleanup();
            } catch (error) {
              cleanupSucceeded = false;
              console.warn('[od] failed to clean authorized team project stage:', {
                projectId,
                version: expectedVersion,
                ...errorLogFields(error),
              });
            }
          }
          if (retryAuthorizedStage) {
            if (!cleanupSucceeded) {
              return complete({ status: 'register_failed' });
            }
            continue;
          }
          notifyFilesChanged?.(projectId);
          if (localRecordChanged) notifyProjectMetadataChanged?.(projectId);
          markTeamProjectRevoked?.(projectId, false);
          // Real hub content is on disk and registered — the local record is no
          // longer an unmaterialized placeholder, so publishing may resume.
          markSharedProjectPlaceholder?.(projectId, false);
          return complete({
            status: 'pulled',
            version: staged.receipt.version,
          });
        }
        break;
      }
    }
    const reuseInitialAuthorization = Boolean(
      scope &&
      isFreshProactivePullAuthorizationWitness(authorizationWitness, {
        projectId,
        workspaceId: scope.workspaceId,
        resourceTeamId: scope.resourceTeamId,
        viewerMemberId: scope.viewerMemberId,
        ownerMemberId: scope.ownerMemberId,
      }, expectedVersion),
    );
    if (reuseInitialAuthorization) {
      reportPullTiming({
        phase: 'initial-authorization-reused',
        projectId,
        version: authorizationWitness!.version,
        atMs: Date.now(),
      });
    } else {
      // The initial active-scope check and authoritative catalog lookup are
      // independent, read-only safety gates. A fresh, branded proactive
      // witness already ran both immediately before this internal call; HTTP
      // callers have no path to provide one and always execute these gates.
      const initialSharedProjectRead = resolveSharedProject
        ? Promise.resolve()
            .then(() => resolveSharedProject(projectId, scope))
            .then(
              (project) => ({ ok: true as const, project }),
              () => ({ ok: false as const }),
            )
        : null;
      if (scope && !(await capturedScopeIsStillAuthorized(scope))) {
        return complete({ status: 'register_failed' });
      }
      // Revocation gate: a project may only be pulled while it is still shared
      // to the caller's team. Transient uncertainty fails closed for scoped
      // pulls; the post-transport gate below always repeats this uncached.
      if (initialSharedProjectRead) {
        let stillShared = true;
        const initialSharedProject = await initialSharedProjectRead;
        if (initialSharedProject.ok) {
          authoritativeSharedProject = initialSharedProject.project;
          stillShared = authoritativeSharedProject != null &&
            (!scope || authoritativeSharedProject.ownerMemberId === scope.ownerMemberId);
        } else {
          if (scope) return complete({ status: 'register_failed' });
          stillShared = true;
        }
        if (scope && !(await capturedScopeIsStillAuthorized(scope))) {
          return complete({ status: 'register_failed' });
        }
        if (!stillShared) {
          // The project has left the team: mark the stale local mirror revoked
          // so its files stop being served (files remain on disk).
          markTeamProjectRevoked?.(projectId, true);
          return complete({ status: 'revoked' });
        }
      } else if (scope) {
        return complete({ status: 'register_failed' });
      }
    }
    reportPullTiming({
      phase: 'transport-invoke',
      projectId,
      atMs: Date.now(),
    });
    let result: Awaited<ReturnType<typeof pullLatest>>;
    try {
      result = await pullLatest(projectId, principal);
    } catch (error) {
      reportPullTiming({
        phase: 'transport-done',
        projectId,
        atMs: Date.now(),
        status: 'threw',
      });
      throw error;
    }
    reportPullTiming({
      phase: 'transport-done',
      projectId,
      ...(result.version != null
        ? { version: result.version }
        : authorizedCapabilityFallbackVersion != null
          ? { version: authorizedCapabilityFallbackVersion }
          : {}),
      atMs: Date.now(),
    });
    const materializedVersion =
      result.version ?? authorizedCapabilityFallbackVersion;
    if (materializedVersion !== null) {
      let prepared: PreparedPulledProjectRegistration | null = null;
      try {
        prepared = await preparePulledProjectRegistration(projectId, scope);
      } catch (error) {
        console.warn('[od] failed to prepare pulled team project:', error);
        return complete({ status: 'register_failed' });
      }
      reportPullTiming({
        phase: 'registration-prepared',
        projectId,
        version: materializedVersion,
        atMs: Date.now(),
      });

      // The initial catalog result only authorized starting the transfer. The
      // owner may unshare while bytes are in flight, so scoped materialization
      // requires a second uncached authoritative read after every other async
      // metadata operation has completed.
      if (scope) {
        try {
          authoritativeSharedProject = await resolveSharedProject!(projectId, scope);
        } catch {
          return complete({ status: 'register_failed' });
        }
        if (!authoritativeSharedProject) {
          markTeamProjectRevoked?.(projectId, true);
          return complete({ status: 'revoked' });
        }
        if (authoritativeSharedProject.ownerMemberId !== scope.ownerMemberId) {
          return complete({ status: 'register_failed' });
        }
        reportPullTiming({
          phase: 'catalog-revalidated',
          projectId,
          version: materializedVersion,
          atMs: Date.now(),
        });
        // Keep this check adjacent to the synchronous SQLite transaction.
        // Nothing below may await before materializeTeamMirror revalidates the
        // binding and commits it.
        if (!(await capturedScopeIsStillAuthorized(scope))) {
          return complete({ status: 'register_failed' });
        }
        reportPullTiming({
          phase: 'scope-revalidated',
          projectId,
          version: materializedVersion,
          atMs: Date.now(),
        });
      } else if (resolveSharedProject) {
        try {
          authoritativeSharedProject = await resolveSharedProject(projectId, null);
        } catch {
          authoritativeSharedProject = null;
        }
      }

      let localRecordChanged = false;
      try {
        localRecordChanged = registerPreparedPulledProject(
          prepared,
          scope,
          authoritativeSharedProject,
          undefined,
          result.resourceId?.trim() && result.versionId?.trim()
            ? { resourceId: result.resourceId.trim(), versionId: result.versionId.trim() }
            : undefined,
        );
      } catch (error) {
        console.warn('[od] failed to register pulled team project:', error);
        return complete({ status: 'register_failed' });
      }
      reportPullTiming({
        phase: 'mirror-materialized',
        projectId,
        version: materializedVersion,
        atMs: Date.now(),
      });
      // Persist the exact version before notifying readers. A file-change
      // subscriber may immediately re-check /collab/status; it must never
      // observe the new bytes paired with the previous durable cursor.
      if (scope && deps.writeMaterializedVersion) {
        try {
          reportPullTiming({
            phase: 'version-write-started',
            projectId,
            version: materializedVersion,
            atMs: Date.now(),
          });
          await deps.writeMaterializedVersion(
            projectId,
            scope,
            materializedVersion,
          );
          reportPullTiming({
            phase: 'persisted',
            projectId,
            version: materializedVersion,
            atMs: Date.now(),
          });
          try {
            await deps.onLegacyPullMaterialized?.(
              projectId,
              scope,
              materializedVersion,
            );
          } catch (error) {
            // The bytes, mirror binding, and durable cursor are already
            // committed. Coordinator notification is recoverable from that
            // cursor on its next retry and must never turn success into 502.
            console.warn(
              '[od] failed to notify proactive coordinator of legacy team pull:',
              {
                projectId,
                version: materializedVersion,
                ...errorLogFields(error),
              },
            );
          }
        } catch (error) {
          console.warn('[od] failed to persist pulled team project version:', error);
          return complete({ status: 'register_failed' });
        }
      }
      // The pull already materialized new bytes on disk at this point —
      // notify now rather than relying on the project's chokidar watcher,
      // which the pull's directory-replace can silently orphan (see
      // `notifyFilesChanged`'s doc comment). A currently-open FileViewer tab
      // for this project refreshes on the same `file-changed` path a real
      // local edit would take.
      notifyFilesChanged?.(projectId);
      if (localRecordChanged) {
        // The register above swapped the "共享项目" placeholder record for
        // the real name (or first-registered the record): push the existing
        // `project-metadata-changed` thin signal so the open project view
        // re-reads the record and the sidebar/tab title follows without a
        // manual reload (recvqhwv6RPU1j).
        notifyProjectMetadataChanged?.(projectId);
      }
      // Real hub content is on disk and registered — the local record is no
      // longer an unmaterialized placeholder, so publishing may resume.
      markSharedProjectPlaceholder?.(projectId, false);
    }
    // A successful pull means the project is shared again (or still is): clear
    // any prior revocation so its files are served normally.
    markTeamProjectRevoked?.(projectId, false);
    return complete({ status: 'pulled', version: materializedVersion });
    } finally {
      reportPullTiming({
        phase: 'route-completed',
        projectId,
        ...(terminalVersion != null ? { version: terminalVersion } : {}),
        ...(profileReceivedAtMs != null
          ? { receivedAtMs: profileReceivedAtMs }
          : {}),
        atMs: Date.now(),
        status: terminalStatus,
      });
    }
  }

  // In-flight pulls keyed by project + resource-hub scope. A hub-event
  // proactive pull and a member web's poll-triggered POST that race each
  // other coalesce onto ONE materialization (the `vela resource pull`
  // transport replaces the whole project directory, so a duplicate pull is a
  // full-tree transfer, not a cheap no-op). The scope key includes the
  // principal's team + member ids because the same project can be shared
  // under more than one scope (see `scopedProjectKey` in collab/runtime.ts) —
  // only identically-routed pulls may share a result.
  const pullsInFlight = new Map<string, Promise<CollabSyncPullOutcome>>();
  const projectPullTails = new Map<string, Promise<void>>();

  function pullSharedProjectCoalesced(
    projectId: string,
    principal: ResourceHubPrincipal | null,
    scope: TeamMirrorPullScope | null,
    authorizationWitness?: ProactivePullAuthorizationWitness,
    expectedVersion?: number,
    authorizedStageInvocation?: AuthorizedProactivePullInvocation,
  ): Promise<CollabSyncPullOutcome> {
    const mutationKey = JSON.stringify([
      projectId,
      principal?.teamId ?? null,
      principal?.memberId ?? null,
      scope?.workspaceId ?? null,
      scope?.resourceTeamId ?? null,
      scope?.viewerMemberId ?? null,
      scope?.ownerMemberId ?? null,
    ]);
    const hasInvalidAuthorizedInvocation =
      authorizedStageInvocation !== undefined &&
      !isAuthorizedProactivePullInvocation(
        authorizedStageInvocation,
        {
          projectId,
          workspaceId: scope?.workspaceId ?? '',
          resourceTeamId: scope?.resourceTeamId ?? '',
          viewerMemberId: scope?.viewerMemberId ?? '',
          ownerMemberId: scope?.ownerMemberId ?? '',
        },
        expectedVersion,
      );
    // Valid legacy and authorized callers share one exact-scope mutation key:
    // both replace the same live project tree. Invalid/stale authorized
    // invocations stay isolated so they can only fail closed, never borrow a
    // successful legacy result.
    const key = hasInvalidAuthorizedInvocation
      ? JSON.stringify([mutationKey, 'invalid-stage'])
      : mutationKey;
    const existing = pullsInFlight.get(key);
    if (existing) {
      if (!authorizedStageInvocation) return existing;
      return existing.then((outcome) =>
        isAuthorizedProactivePullInvocation(
          authorizedStageInvocation,
          {
            projectId,
            workspaceId: scope?.workspaceId ?? '',
            resourceTeamId: scope?.resourceTeamId ?? '',
            viewerMemberId: scope?.viewerMemberId ?? '',
            ownerMemberId: scope?.ownerMemberId ?? '',
          },
          expectedVersion,
        )
          ? outcome
          : { status: 'register_failed' },
      );
    }
    const transferToken = scope
      ? deps.beginContentTransfer?.(projectId, scope, expectedVersion)
      : undefined;
    const previous = projectPullTails.get(projectId) ?? Promise.resolve();
    let run!: Promise<CollabSyncPullOutcome>;
    run = (async () => {
      let outcome: CollabSyncPullOutcome | null = null;
      try {
        await previous.catch(() => undefined);
        outcome = await pullSharedProjectOnce(
          projectId,
          principal,
          scope,
          authorizationWitness,
          expectedVersion,
          authorizedStageInvocation,
        );
        return outcome;
      } finally {
        if (scope && transferToken) {
          deps.finishContentTransfer?.(
            projectId,
            scope,
            transferToken,
            outcome?.status === 'pulled'
              ? outcome.version ?? expectedVersion
              : expectedVersion,
          );
        }
        if (pullsInFlight.get(key) === run) {
          pullsInFlight.delete(key);
        }
      }
    })();
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    projectPullTails.set(projectId, tail);
    void tail.finally(() => {
      if (projectPullTails.get(projectId) === tail) {
        projectPullTails.delete(projectId);
      }
    });
    pullsInFlight.set(key, run);
    return run;
  }

  app.post('/api/projects/:id/collab/pull', async (req, res) => {
    const projectId = req.params.id;
    const { verification, principal, scope } =
      await pullAccessForRequest(projectId, req);
    if (!verification.ok) {
      return sendWorkspaceVerificationFailure(res, verification);
    }
    if (!principal || !scope) {
      return res.status(403).json({ error: 'WORKSPACE_PROJECT_PULL_DENIED' });
    }
    if (scope.ownerMemberId === scope.viewerMemberId && deps.ownedContentSync) {
      const update = await deps.ownedContentSync.request({ projectId, ...scope }, { action: 'check', manual: true });
      if (update.state === 'confirmation_required' || update.state === 'ignored' || update.state === 'suppressed') {
        return res.status(409).json({ error: 'COLLAB_OVERWRITE_CONFIRMATION_REQUIRED', update });
      }
      if (update.state !== 'up_to_date') return res.status(update.state === 'busy' ? 409 : 502).json({ error: update.errorCode ?? 'PROJECT_SYNC_FAILED', update });
      return res.json({ ok: true, version: update.localVersion });
    }
    const outcome = await pullSharedProjectCoalesced(projectId, principal, scope);
    if (outcome.status === 'revoked') {
      return res.status(403).json({ error: 'WORKSPACE_PROJECT_PULL_DENIED' });
    }
    if (outcome.status === 'register_failed') {
      return res.status(502).json({ error: 'TEAM_PROJECT_PULL_REGISTER_UNAVAILABLE' });
    }
    res.json({ ok: true, version: outcome.version });
  });

  app.post('/api/projects/:id/collab/update', async (req, res) => {
    const input = req.body as OwnedProjectContentUpdateRequest | undefined;
    if (!input || !['check', 'accept', 'dismiss', 'reset-preference'].includes(input.action)
      || (input.version !== undefined && (!Number.isSafeInteger(input.version) || input.version < 0))
      || ((input.action === 'accept' || input.action === 'dismiss') && input.version === undefined)
      || (input.dontPromptFor24h !== undefined && typeof input.dontPromptFor24h !== 'boolean')
      || (input.manual !== undefined && typeof input.manual !== 'boolean')) {
      return res.status(400).json({ error: 'INVALID_CONTENT_UPDATE_REQUEST' });
    }
    const projectId = req.params.id;
    const { verification, scope } = await pullAccessForRequest(projectId, req);
    if (!verification.ok) return sendWorkspaceVerificationFailure(res, verification);
    if (!scope || scope.ownerMemberId !== scope.viewerMemberId) return res.status(403).json({ error: 'WORKSPACE_PROJECT_PULL_DENIED' });
    if (!deps.ownedContentSync) return res.status(503).json({ error: 'PROJECT_SYNC_UNAVAILABLE' });
    const update = await deps.ownedContentSync.request({ projectId, ...scope }, input);
    return res.json({ update });
  });

  app.put('/api/projects/:id/collab/bootstrap', async (req, res) => {
    const projectId = req.params.id;
    // This endpoint materializes local authority state, so it deliberately uses
    // the fresh mutation verifier and uncached owner lookup, never status's
    // bounded read lease. PUT is idempotent and lets the sidecar safely replay
    // one request on a reset reused socket.
    const { verification, principal, scope } =
      await pullAccessForRequest(projectId, req);
    if (!verification.ok) {
      return sendWorkspaceVerificationFailure(res, verification);
    }
    if (!principal || !scope) {
      return res.status(404).json({ error: 'TEAM_PROJECT_NOT_FOUND' });
    }
    let awaitingFirstMaterialization: boolean;
    try {
      awaitingFirstMaterialization = ensureTeamBoundSharedProjectPlaceholder(
        projectId,
        scope,
      );
    } catch {
      return res.status(503).json({ error: 'TEAM_PROJECT_BOOTSTRAP_UNAVAILABLE' });
    }
    if (awaitingFirstMaterialization) {
      materializePlaceholderOnOpen(projectId, req, {
        ownerMemberId: scope.ownerMemberId,
        callerIsOwner: scope.ownerMemberId === scope.viewerMemberId,
      });
    }
    return res
      .status(awaitingFirstMaterialization ? 202 : 200)
      .json({ ok: true, awaitingFirstMaterialization });
  });

  app.get('/api/projects/:id/collab/status', async (req, res) => {
    const projectId = req.params.id;
    if (isTeamProjectRevoked?.(projectId)) {
      return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
    }
    const {
      verification,
      context,
      principal,
      workspaceId: resolvedWorkspaceId,
    } = await statusIdentityForRequest(projectId, req);
    if (!verification.ok) {
      return sendWorkspaceVerificationFailure(res, verification);
    }
    if (!context || !resolvedWorkspaceId) {
      return res.status(403).json({ error: 'WORKSPACE_PROJECT_STATUS_DENIED' });
    }
    let syncState = projectSyncState(projectId, principal);
    let ownerMemberId = projectOwnerMemberId(projectId, principal);
    let ownerDisplayName: string | undefined;
    let ownerRole: 'owner' | 'admin' | 'member' | undefined;
    // Resolve ownership first through the CACHED hub owner lookup. This decides
    // whether the project is shared at all — and a project that is local-only AND
    // unowned on the hub is a genuine personal project with no hub-published head.
    // Answering its version from local state lets us skip the uncached ~2s
    // publishedHead round-trip that otherwise ran on every status poll. That hub
    // call was the reason a member's OWN project flashed the "shared read-only"
    // notice for seconds after opening: the front end fails closed until
    // /collab/status confirms ownership, so a slow status made the flash long.
    const statusOwnerResolver =
      resolveSharedProjectOwnerForStatus ?? resolveSharedProjectOwner;
    if (ownerMemberId == null && statusOwnerResolver) {
      try {
        const hubOwner =
          resolvedWorkspaceId && principal?.memberId
            ? await statusOwnerResolver(projectId, {
                workspaceId: resolvedWorkspaceId,
                workspaceMemberId: principal.memberId,
              })
            : null;
        if (hubOwner != null) {
          if (syncState === 'local_only') syncState = 'synced';
          ownerMemberId = hubOwner;
        }
      } catch {
        // Hub unavailable: fall back to the local state.
      }
    }
    // The caller owns the project when the resolved owner id matches their own
    // member id. The owner is the single writer of their own project: the front
    // end shows them an editable surface (not the "shared by X" banner) and they
    // never auto-pull, so they need NEITHER the owner display-name directory
    // lookup NOR the hub published-head round-trip. Both are uncached ~1-3s vela
    // calls, and running them made a member's own shared project sit in the
    // fail-closed "shared read-only" state (disabled history/share, disabled
    // composer) for tens of seconds before /collab/status confirmed ownership.
    const callerIsOwner =
      ownerMemberId != null && principal?.memberId != null && ownerMemberId === principal.memberId;
    // Anyone opening a shared project absent from this daemon's local DB needs
    // the placeholder so the project's other routes stop 404ing while the pull
    // runs (see ensureSharedProjectPlaceholder). This covers BOTH a member
    // viewing someone else's shared project AND an owner opening their OWN shared
    // project that was created/shared on another machine (or attributed to them
    // by a smoke test) and never materialized here: the owner never auto-pulls,
    // so without this its conversations/events/tabs 404 forever and the left pane
    // hangs for a minute. ensureSharedProjectPlaceholder no-ops once the project
    // is known locally, so an owner's normal local project is untouched. The web
    // polls /collab/status on open, so this fires before the conversations/events
    // retry storm builds up.
    if (ownerMemberId) {
      ensureSharedProjectPlaceholder(projectId);
    }
    // Whether this daemon's only local record for the project is still an
    // unmaterialized placeholder. Purely local and synchronous — it needs no
    // hub round-trip, which is exactly why it is the signal the client can act
    // on from the FIRST status response (see `awaitingFirstMaterialization` on
    // CollabSyncStatusResponse).
    const awaitingFirstMaterialization = Boolean(
      projectStore?.get && isUnmaterializedSharedPlaceholder(projectStore.get(projectId)),
    );
    if (awaitingFirstMaterialization) {
      materializePlaceholderOnOpen(projectId, req, {
        ownerMemberId,
        callerIsOwner,
      });
    }
    // A verified local mirror binding is enough to return shared identity and
    // unlock presence immediately. The owner-name directory and published-head
    // calls are remote enrichment: neither may hold this status response open.
    // Cache them by the exact viewer/team/owner/project tuple so a later poll can
    // consume the result without leaking it across workspace scopes. Unknown local
    // ownership still fails closed above; this path never guesses an owner. The
    // web's default status poll is 5s, so settled enrichment becomes visible on
    // the next poll (<=5s); this local-first fix does not add another SSE contract.
    const needsHubHead = (syncState !== 'local_only' || ownerMemberId != null) && !callerIsOwner;
    const enrichmentKey = JSON.stringify([
      resolvedWorkspaceId ?? '',
      principal?.teamId ?? '',
      principal?.memberId ?? '',
      ownerMemberId ?? '',
      projectId,
    ]);
    const cachedOwnerName = readLruEntry(ownerEnrichmentCache, enrichmentKey);
    const ownerNameEntry = cachedOwnerName?.entry ?? null;
    if (ownerNameEntry) {
      ownerDisplayName = ownerNameEntry.displayName;
      ownerRole = ownerNameEntry.role;
    }
    if (
      ownerMemberId &&
      resolvedWorkspaceId &&
      context &&
      principal &&
      !callerIsOwner &&
      resolveOwnerDisplayName &&
      (!cachedOwnerName || Date.now() - cachedOwnerName.resolvedAt >= OWNER_ENRICHMENT_TTL_MS) &&
      !ownerEnrichmentInFlight.has(enrichmentKey)
    ) {
      const refreshOwner = resolveOwnerDisplayName(ownerMemberId, context)
        .then((entry) => {
          writeLruEntry(ownerEnrichmentCache, enrichmentKey, {
            entry,
            resolvedAt: Date.now(),
          });
        })
        .catch(() => undefined)
        .finally(() => {
          if (ownerEnrichmentInFlight.get(enrichmentKey) === refreshOwner) {
            ownerEnrichmentInFlight.delete(enrichmentKey);
          }
        });
      ownerEnrichmentInFlight.set(enrichmentKey, refreshOwner);
    }

    let headResult =
      readLruEntry(headEnrichmentCache, enrichmentKey) ??
      { head: publishedVersion(projectId, principal), scope: null };
    if (needsHubHead && !headEnrichmentInFlight.has(enrichmentKey)) {
      const expectedWorkspaceId = resolvedWorkspaceId;
      const expectedPrincipal = principal;
      const expectedOwnerMemberId = ownerMemberId;
      const refreshHead = (async () => {
        const { principal: resourcePrincipal, scope } =
          await pullAccessForRequest(
            projectId,
            req,
            expectedOwnerMemberId,
            {
              principal: expectedPrincipal,
              workspaceId: expectedWorkspaceId,
            },
          );
        if (
          !scope ||
          !expectedPrincipal ||
          scope.workspaceId !== expectedWorkspaceId ||
          scope.resourceTeamId !== expectedPrincipal.teamId ||
          scope.viewerMemberId !== expectedPrincipal.memberId ||
          scope.ownerMemberId !== expectedOwnerMemberId
        ) {
          return;
        }
        const head = await publishedHead(projectId, resourcePrincipal);
        writeLruEntry(headEnrichmentCache, enrichmentKey, { head, scope });
      })()
        .catch(() => undefined)
        .finally(() => {
          if (headEnrichmentInFlight.get(enrichmentKey) === refreshHead) {
            headEnrichmentInFlight.delete(enrichmentKey);
          }
        });
      headEnrichmentInFlight.set(enrichmentKey, refreshHead);
    }
    let materializedVersion: number | null = null;
    if (headResult.scope && deps.readMaterializedVersion) {
      try {
        materializedVersion =
          deps.readMaterializedVersion(projectId, headResult.scope) ?? null;
      } catch {
        materializedVersion = null;
      }
    }
    const transferScope =
      resolvedWorkspaceId
      && principal
      && ownerMemberId
        ? {
            workspaceId: resolvedWorkspaceId,
            resourceTeamId: principal.teamId,
            viewerMemberId: principal.memberId,
            ownerMemberId,
          }
        : null;
    const ownedContentUpdate = callerIsOwner && transferScope && deps.ownedContentSync
      ? deps.ownedContentSync.read({ projectId, ...transferScope }) : null;
    res.json({
      ...(ownedContentUpdate ? { ownedContentUpdate } : {}),
      publishedVersion: ownedContentUpdate?.latestVersion ?? headResult.head,
      materializedVersion: ownedContentUpdate?.localVersion ?? materializedVersion,
      contentTransferState:
        transferScope
          ? deps.readContentTransferState?.(projectId, transferScope) ?? null
          : null,
      awaitingFirstMaterialization,
      syncState,
      ownerMemberId,
      ...(ownerDisplayName ? { ownerDisplayName } : {}),
      ...(ownerRole ? { ownerRole } : {}),
    });
  });

  return {
    async pullSharedProject(
      projectId: string,
      scope: TeamMirrorPullScope,
      authorizationWitness?: ProactivePullAuthorizationWitness,
      expectedVersion?: number,
      authorizedStageInvocation?: AuthorizedProactivePullInvocation,
    ): Promise<CollabSyncPullOutcome> {
      const principal: ResourceHubPrincipal = {
        teamId: scope.resourceTeamId,
        memberId: scope.ownerMemberId,
        role: 'member',
        lifecycleState: 'active',
        workspaceType: 'team',
      };
      return pullSharedProjectCoalesced(
        projectId,
        principal,
        scope,
        authorizationWitness,
        expectedVersion,
        authorizedStageInvocation,
      );
    },
  };
}

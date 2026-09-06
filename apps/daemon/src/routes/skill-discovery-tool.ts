import { createHash, randomBytes } from 'node:crypto';

import {
  OfficialSkillDiscoverySearchRequestV1Schema,
  OfficialSkillDiscoveryLoadResponseV1Schema,
  PublicSkillDiscoveryStateV1Schema,
  SkillDiscoveryToolDeactivateRequestV1Schema,
  SkillDiscoveryToolLoadCommitRequestV1Schema,
  SkillDiscoveryToolLoadPrepareResponseV1Schema,
  SkillDiscoveryToolLoadRequestV1Schema,
  SkillDiscoveryToolRehydrateRequestV1Schema,
  SkillDiscoveryToolResolveRequestV1Schema,
  type ApiErrorCode,
  type OfficialSkillDiscoveryLoadRequestV1,
  type OfficialSkillDiscoverySearchRequestV1,
  type OfficialSkillDiscoveryMaterializationV1,
  type SkillDiscoveryPreparedLoadV1,
  type SkillDiscoveryToolLoadRequestV1,
  type SkillDiscoveryToolResolveRequestV1,
} from '@open-design/contracts';
import type Database from 'better-sqlite3';
import type { Express, Request, RequestHandler, Response } from 'express';

import {
  OfficialSkillDiscoveryCatalogError,
  readOfficialSkillDiscoveryDiagnosticsV1,
  resolveOfficialSkillDiscoveryResourceBundleV1,
  resolveOfficialSkillDiscoveryLoadV1,
  searchOfficialSkillDiscoveryCatalogV1,
  type OfficialSkillDiscoveryCatalogSourcesV1,
  type OfficialSkillDiscoveryResourceBundleV1,
} from '../skill-discovery/catalog.js';
import { skillDiscoveryMaterializationAlias } from '../skill-discovery/materialize.js';
import {
  SkillDiscoveryStateError,
  applySkillDiscoveryLoad,
  deactivateSkillDiscoveryAuxiliary,
  planSkillDiscoveryLoad,
  readSkillDiscoveryState,
  recordSkillDiscoverySearch,
  renderSkillDiscoveryLifecycleCapsule,
  resolveSkillDiscovery,
  type SkillDiscoveryLoadInput,
  type SkillDiscoveryState,
} from '../skill-discovery/state.js';
import type { ToolTokenGrant } from '../tool-tokens.js';
import { getStrategyTaskExecutionByRunId } from '../strategies/task-store.js';

type SendApiError = (
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  extras?: Record<string, unknown>,
) => void;

export interface SkillDiscoveryRunScope {
  runId: string;
  projectId: string;
  conversationId: string;
}

interface PendingSkillDiscoveryLoad {
  scope: SkillDiscoveryRunScope;
  request: OfficialSkillDiscoveryLoadRequestV1;
  loaded: SkillDiscoveryPreparedLoadV1;
  loadInput: Omit<SkillDiscoveryLoadInput, 'expectedStateRevision'>;
  expectedStateRevision: number;
  alias: string;
  bundleFingerprint: string;
  expiresAt: number;
  cleanupTimer: NodeJS.Timeout;
}

const PENDING_LOAD_TTL_MS = 30_000;

export interface RegisterSkillDiscoveryToolRoutesDeps {
  auth: {
    authorizeToolRequest: (
      req: Request,
      res: Response,
      operation: string,
    ) => ToolTokenGrant | null;
  };
  http: {
    sendApiError: SendApiError;
    requireLocalDaemonRequest: RequestHandler;
  };
  discoveryEnabled: () => boolean;
  db: Database.Database;
  /** Re-read official sources on every request so search/load cannot trust a stale snapshot. */
  resolveCatalogSources: () => OfficialSkillDiscoveryCatalogSourcesV1;
  /** Resolve conversation identity from the daemon-owned run, never from request input. */
  resolveRunScope: (grant: ToolTokenGrant) => SkillDiscoveryRunScope | null;
  /** Test seam for pending-grant expiry; production uses the wall clock. */
  now?: () => number;
}

export function registerSkillDiscoveryToolRoutes(
  app: Express,
  ctx: RegisterSkillDiscoveryToolRoutesDeps,
): void {
  const pendingLoads = new Map<string, PendingSkillDiscoveryLoad>();

  // Observer-only, product-owned metadata. Never returns a tool token, user
  // state, local source path, resource bytes, or full task-profile bodies.
  app.get('/api/diagnostics/skill-discovery-catalog',
    ctx.http.requireLocalDaemonRequest, (_req, res) => {
      try {
        res.json(readOfficialSkillDiscoveryDiagnosticsV1(
          ctx.resolveCatalogSources(), ctx.discoveryEnabled(),
        ));
      } catch {
        ctx.http.sendApiError(res, 503, 'INTERNAL_ERROR',
          'Official Skill Discovery catalog diagnostics are unavailable.');
      }
    });

  app.post('/api/tools/skills/search', (req, res) => {
    withAuthorizedScope(req, res, ctx, 'skills:search', (scope) => {
      if (!requireActiveDiscoveryState(ctx, res, scope)) return;
      const parsed = OfficialSkillDiscoverySearchRequestV1Schema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(ctx, res, parsed.error.issues);
      }

      const search = searchOfficialSkillDiscoveryCatalogV1({
        ...ctx.resolveCatalogSources(),
        request: parsed.data,
      });
      recordSkillDiscoverySearch(ctx.db, {
        conversationId: scope.conversationId,
        runId: scope.runId,
        queryDigest: digestText(parsed.data.query),
        filters: {
          ...(parsed.data.role ? { role: parsed.data.role } : {}),
          ...(parsed.data.outputKind ? { outputKind: parsed.data.outputKind } : {}),
          ...(parsed.data.limit ? { limit: parsed.data.limit } : {}),
        },
        candidates: search.candidates.map(({ id, score }) => ({ id, score })),
        catalogRevision: search.revision,
      });
      res.json({ search });
    });
  });

  app.post('/api/tools/skills/load', async (req, res) => {
    await withAuthorizedScope(req, res, ctx, 'skills:load', async (scope) => {
      const stateBeforeLoad = requireActiveDiscoveryState(ctx, res, scope);
      if (!stateBeforeLoad) return;
      const parsed = SkillDiscoveryToolLoadRequestV1Schema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(ctx, res, parsed.error.issues);
      }

      const { purpose, replaceId, ...catalogRequest } = parsed.data;
      const catalogSources = ctx.resolveCatalogSources();
      const loadedBeforeMaterialization = resolveOfficialSkillDiscoveryLoadV1({
        ...catalogSources,
        request: catalogRequest,
      });
      assertFrozenSkillDecision(ctx, scope, {
        kind: 'load', id: loadedBeforeMaterialization.candidate.id,
        role: loadedBeforeMaterialization.resolvedRole,
        candidateDigest: loadedBeforeMaterialization.candidate.candidateDigest,
        contentDigest: loadedBeforeMaterialization.candidate.contentDigest,
        ...(replaceId ? { replaceId } : {}),
      });
      const plannedAt = ctx.now?.() ?? Date.now();
      const loadInput = {
        conversationId: scope.conversationId,
        runId: scope.runId,
        loaded: {
          id: loadedBeforeMaterialization.candidate.id,
          kind: loadedBeforeMaterialization.candidate.origin.kind === 'bundled-task-profile'
            ? 'task-profile' as const
            : 'functional' as const,
          role: loadedBeforeMaterialization.resolvedRole,
          version: loadedBeforeMaterialization.candidate.version,
          candidateDigest: loadedBeforeMaterialization.candidate.candidateDigest,
          contentDigest: loadedBeforeMaterialization.candidate.contentDigest,
          catalogRevision: loadedBeforeMaterialization.revision,
          purposeDigest: digestText(purpose),
        },
        conflictsWith: loadedBeforeMaterialization.candidate.conflictsWith,
        ...(replaceId ? { replaceId } : {}),
        now: plannedAt,
      };
      const plan = planSkillDiscoveryLoad(stateBeforeLoad, loadInput);
      const bundle = resolveOfficialSkillDiscoveryResourceBundleV1({
        ...catalogSources,
        request: catalogRequest,
      });
      const { materialization: _unusedMaterialization, ...preparedLoaded } =
        loadedBeforeMaterialization;
      const pendingToken = createPendingLoadToken();
      const pendingTokenHash = hashPendingLoadToken(pendingToken);
      const expiresAt = plannedAt + PENDING_LOAD_TTL_MS;
      const alias = skillDiscoveryMaterializationAlias({
        id: loadedBeforeMaterialization.candidate.id,
        candidateDigest: loadedBeforeMaterialization.candidate.candidateDigest,
      });
      const cleanupTimer = setTimeout(() => {
        pendingLoads.delete(pendingTokenHash);
      }, PENDING_LOAD_TTL_MS);
      cleanupTimer.unref?.();
      dropPendingLoadsForScope(pendingLoads, scope);
      pendingLoads.set(pendingTokenHash, {
        scope,
        request: catalogRequest,
        loaded: preparedLoaded,
        loadInput,
        expectedStateRevision: plan.expectedStateRevision,
        alias,
        bundleFingerprint: fingerprintBundle(bundle),
        expiresAt,
        cleanupTimer,
      });

      res.json(SkillDiscoveryToolLoadPrepareResponseV1Schema.parse({
        pendingToken,
        expiresAt,
        expectedStateRevision: plan.expectedStateRevision,
        alias,
        loaded: preparedLoaded,
        resources: bundle.files.map((file) => ({
          relativePath: file.relativePath,
          digest: file.digest,
          size: file.size,
          mode: file.mode,
          bytesBase64: file.bytes.toString('base64'),
        })),
      }));
    });
  });

  app.post('/api/tools/skills/load/commit', async (req, res) => {
    await withAuthorizedScope(req, res, ctx, 'skills:load', async (scope) => {
      const parsed = SkillDiscoveryToolLoadCommitRequestV1Schema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(ctx, res, parsed.error.issues);
      }

      // Consume before any further validation. Two concurrent commits can never
      // both reach ledger apply, and every failed commit requires a fresh prepare.
      const pendingTokenHash = hashPendingLoadToken(parsed.data.pendingToken);
      const pending = pendingLoads.get(pendingTokenHash);
      if (pending) {
        pendingLoads.delete(pendingTokenHash);
        clearTimeout(pending.cleanupTimer);
      }
      if (!pending || pending.expiresAt <= (ctx.now?.() ?? Date.now())) {
        return sendPendingLoadConflict(ctx, res);
      }
      if (!sameScope(pending.scope, scope)) {
        return sendPendingLoadConflict(ctx, res);
      }
      if (parsed.data.expectedStateRevision !== pending.expectedStateRevision) {
        return sendPendingLoadConflict(ctx, res);
      }
      const stateBeforeCommit = requireActiveDiscoveryState(ctx, res, scope);
      if (!stateBeforeCommit) return;
      if (stateBeforeCommit.revision !== pending.expectedStateRevision) {
        return sendPendingLoadConflict(ctx, res);
      }

      const catalogSources = ctx.resolveCatalogSources();
      const freshlyLoaded = resolveOfficialSkillDiscoveryLoadV1({
        ...catalogSources,
        request: pending.request,
      });
      const { materialization: _freshMaterialization, ...freshPreparedLoad } = freshlyLoaded;
      if (stableJson(freshPreparedLoad) !== stableJson(pending.loaded)) {
        return sendPendingLoadConflict(ctx, res, 'Official Skill load metadata changed after prepare.');
      }
      const freshBundle = resolveOfficialSkillDiscoveryResourceBundleV1({
        ...catalogSources,
        request: pending.request,
      });
      if (fingerprintBundle(freshBundle) !== pending.bundleFingerprint) {
        return sendPendingLoadConflict(ctx, res, 'Official Skill resources changed after prepare.');
      }

      const expectedReceipt = expectedMaterializationReceipt(pending.alias, freshBundle);
      if (stableJson(parsed.data.materialization) !== stableJson(expectedReceipt)) {
        return sendPendingLoadConflict(ctx, res, 'Skill materialization receipt did not match prepare.');
      }

      const loaded = OfficialSkillDiscoveryLoadResponseV1Schema.parse({
        ...freshPreparedLoad,
        materialization: parsed.data.materialization,
      });
      assertFrozenSkillDecision(ctx, scope, {
        kind: 'load', id: loaded.candidate.id, role: loaded.resolvedRole,
        candidateDigest: loaded.candidate.candidateDigest,
        contentDigest: loaded.candidate.contentDigest,
        ...(pending.loadInput.replaceId ? { replaceId: pending.loadInput.replaceId } : {}),
      });
      const state = applySkillDiscoveryLoad(ctx.db, {
        ...pending.loadInput,
        expectedStateRevision: pending.expectedStateRevision,
      });
      res.json({ loaded, state: publicState(state) });
    });
  });

  app.post('/api/tools/skills/resolve', (req, res) => {
    withAuthorizedScope(req, res, ctx, 'skills:resolve', (scope) => {
      if (!requireActiveDiscoveryState(ctx, res, scope)) return;
      const parsed = SkillDiscoveryToolResolveRequestV1Schema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(ctx, res, parsed.error.issues);
      }
      assertFrozenSkillDecision(ctx, scope, { kind: parsed.data.resolution });
      const state = resolveSkillDiscovery(ctx.db, {
        conversationId: scope.conversationId,
        runId: scope.runId,
        resolution: parsed.data.resolution,
        reasonDigest: digestText(parsed.data.reason),
      });
      res.json({ state: publicState(state) });
    });
  });

  app.post('/api/tools/skills/deactivate', (req, res) => {
    withAuthorizedScope(req, res, ctx, 'skills:deactivate', (scope) => {
      if (!requireActiveDiscoveryState(ctx, res, scope)) return;
      const parsed = SkillDiscoveryToolDeactivateRequestV1Schema.safeParse(req.body);
      if (!parsed.success) {
        return sendValidationError(ctx, res, parsed.error.issues);
      }
      assertFrozenSkillDecision(ctx, scope, { kind: 'deactivate' });
      const state = deactivateSkillDiscoveryAuxiliary(ctx.db, {
        conversationId: scope.conversationId,
        runId: scope.runId,
        id: parsed.data.id,
        reasonDigest: digestText(parsed.data.reason),
      });
      res.json({ state: publicState(state) });
    });
  });

  app.get('/api/tools/skills/status', (req, res) => {
    withAuthorizedScope(req, res, ctx, 'skills:status', (scope) => {
      if (Object.keys(req.query).length > 0) {
        return ctx.http.sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'status does not accept query parameters',
        );
      }
      const state = requireActiveDiscoveryState(ctx, res, scope);
      if (!state) return;
      res.json({ state: publicState(state) });
    });
  });

  app.post('/api/tools/skills/rehydrate', (req, res) => {
    withAuthorizedScope(req, res, ctx, 'skills:status', (scope) => {
      const parsed = SkillDiscoveryToolRehydrateRequestV1Schema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendValidationError(ctx, res, parsed.error.issues);
      }
      const state = requireActiveDiscoveryState(ctx, res, scope);
      if (!state) return;
      res.json({
        state: publicState(state),
        lifecycleCapsule: renderSkillDiscoveryLifecycleCapsule(state),
      });
    });
  });
}

function assertFrozenSkillDecision(
  ctx: RegisterSkillDiscoveryToolRoutesDeps,
  scope: SkillDiscoveryRunScope,
  mutation: { kind: 'none' | 'clarify' | 'deactivate' }
    | { kind: 'load'; id: string; role: string; candidateDigest: string; contentDigest: string; replaceId?: string },
): void {
  const task = getStrategyTaskExecutionByRunId(ctx.db, scope.runId);
  const decision = task?.planContract?.skillDecision;
  if (!decision) return;
  const allowed = mutation.kind === 'deactivate'
    || (mutation.kind === 'load' && mutation.role === 'auxiliary')
    || (mutation.kind === 'none' ? decision.primarySkillId === null
    : mutation.kind === 'load' && !mutation.replaceId && decision.skills.some((skill) => (
      skill.id === mutation.id && skill.role === mutation.role
      && skill.candidateDigest === mutation.candidateDigest
      && skill.contentDigest === mutation.contentDigest
    )));
  if (!allowed) throw new SkillDiscoveryStateError(
    'The accepted OD Next Plan freezes primary selection; primary replacement is not allowed.',
  );
}

async function withAuthorizedScope(
  req: Request,
  res: Response,
  ctx: RegisterSkillDiscoveryToolRoutesDeps,
  operation:
    | 'skills:search'
    | 'skills:load'
    | 'skills:deactivate'
    | 'skills:resolve'
    | 'skills:status',
  handler: (scope: SkillDiscoveryRunScope) => void | Promise<void>,
): Promise<void> {
  try {
    const grant = ctx.auth.authorizeToolRequest(req, res, operation);
    if (!grant) return;
    const scope = ctx.resolveRunScope(grant);
    if (
      !scope
      || scope.runId !== grant.runId
      || scope.projectId !== grant.projectId
      || !scope.conversationId
    ) {
      ctx.http.sendApiError(
        res,
        409,
        'SKILL_DISCOVERY_SCOPE_UNAVAILABLE',
        'The tool token does not resolve to an active Skill discovery conversation.',
      );
      return;
    }
    await handler(scope);
  } catch (error) {
    sendRouteError(ctx, res, error);
  }
}

function sendRouteError(
  ctx: RegisterSkillDiscoveryToolRoutesDeps,
  res: Response,
  error: unknown,
): void {
  if (error instanceof SkillDiscoveryStateError) {
    ctx.http.sendApiError(res, 409, 'SKILL_DISCOVERY_STATE_CONFLICT', error.message);
    return;
  }
  if (error instanceof OfficialSkillDiscoveryCatalogError) {
    const changed = /changed|digest|revision|unavailable|requested .* role/iu.test(error.message);
    ctx.http.sendApiError(
      res,
      changed ? 409 : 500,
      changed ? 'SKILL_DISCOVERY_CATALOG_CHANGED' : 'SKILL_DISCOVERY_CATALOG_INVALID',
      error.message,
      changed ? { retryable: true } : undefined,
    );
    return;
  }
  ctx.http.sendApiError(
    res,
    500,
    'INTERNAL_ERROR',
    error instanceof Error ? error.message : String(error),
  );
}

function requireActiveDiscoveryState(
  ctx: RegisterSkillDiscoveryToolRoutesDeps,
  res: Response,
  scope: SkillDiscoveryRunScope,
): SkillDiscoveryState | null {
  const state = readSkillDiscoveryState(ctx.db, scope.conversationId);
  if (!state) {
    ctx.http.sendApiError(
      res,
      409,
      'SKILL_DISCOVERY_NOT_INITIALIZED',
      'Skill discovery is not enabled for this conversation.',
    );
    return null;
  }
  if (state.activeRunId !== scope.runId || state.projectId !== scope.projectId) {
    ctx.http.sendApiError(
      res,
      409,
      'SKILL_DISCOVERY_SCOPE_UNAVAILABLE',
      'Skill discovery state does not belong to the active tool-token run.',
    );
    return null;
  }
  return state;
}

function sendValidationError(
  ctx: RegisterSkillDiscoveryToolRoutesDeps,
  res: Response,
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): void {
  ctx.http.sendApiError(res, 400, 'BAD_REQUEST', formatIssues(issues));
}

function formatIssues(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): string {
  return issues
    .map((issue) => `${issue.path.map(String).join('.') || 'body'}: ${issue.message}`)
    .join('; ');
}

function digestText(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function createPendingLoadToken(): string {
  return `odsp_${randomBytes(32).toString('base64url')}`;
}

function hashPendingLoadToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function fingerprintBundle(bundle: OfficialSkillDiscoveryResourceBundleV1): string {
  return digestText(stableJson({
    skillId: bundle.skillId,
    candidateDigest: bundle.candidateDigest,
    files: bundle.files.map(({ relativePath, digest, size, mode }) => ({
      relativePath,
      digest,
      size,
      mode,
    })),
  }));
}

function expectedMaterializationReceipt(
  alias: string,
  bundle: OfficialSkillDiscoveryResourceBundleV1,
): OfficialSkillDiscoveryMaterializationV1 {
  if (bundle.files.length === 0) {
    return { materializedRoot: null, resources: [] };
  }
  return {
    materializedRoot: `.od-skills/${alias}`,
    resources: bundle.files
      .map(({ relativePath, digest, size }) => ({ relativePath, digest, size }))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en')),
  };
}

function sameScope(left: SkillDiscoveryRunScope, right: SkillDiscoveryRunScope): boolean {
  return left.runId === right.runId
    && left.projectId === right.projectId
    && left.conversationId === right.conversationId;
}

function dropPendingLoadsForScope(
  pendingLoads: Map<string, PendingSkillDiscoveryLoad>,
  scope: SkillDiscoveryRunScope,
): void {
  for (const [tokenHash, pending] of pendingLoads) {
    if (!sameScope(pending.scope, scope)) continue;
    pendingLoads.delete(tokenHash);
    clearTimeout(pending.cleanupTimer);
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function sendPendingLoadConflict(
  ctx: RegisterSkillDiscoveryToolRoutesDeps,
  res: Response,
  message = 'Prepared Skill load is invalid, expired, consumed, or out of scope.',
): void {
  ctx.http.sendApiError(
    res,
    409,
    'SKILL_DISCOVERY_STATE_CONFLICT',
    message,
    { retryable: true },
  );
}

function publicState(state: SkillDiscoveryState) {
  return PublicSkillDiscoveryStateV1Schema.parse({
    schemaVersion: state.schemaVersion,
    status: state.status,
    catalogRevision: state.catalogRevision,
    activePrimary: state.activePrimary,
    activeAuxiliaries: state.activeAuxiliaries,
    superseded: state.superseded,
    lastResolution: state.lastResolution,
    revision: state.revision,
  });
}

// Keep these request types reachable for focused CLI/route compatibility tests.
export type {
  SkillDiscoveryToolLoadRequestV1 as SkillDiscoveryLoadRouteRequest,
  SkillDiscoveryToolResolveRequestV1 as SkillDiscoveryResolveRouteRequest,
  OfficialSkillDiscoverySearchRequestV1 as SkillDiscoverySearchRouteRequest,
};

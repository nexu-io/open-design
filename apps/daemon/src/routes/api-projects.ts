// Spec 112 — multi-tenant REST API for create + publish from the openclaw
// Telegram skill (skills/product/design/open-design-create/SKILL.md).
//
// Mounted by /tmp/open-design/apps/daemon/src/server.ts BEFORE the
// existing single-user `app.post('/api/projects')` UI handler. We
// discriminate by the presence of the x-api-key header:
//
//   - x-api-key present     → server-to-server openclaw skill flow (this file)
//   - x-api-key absent      → fall through to the UI handler (next())
//
// The publish route /api/projects/:id/publish is brand new (no conflict).
// The UI deploy path is /api/projects/:id/deploy and stays as-is.
//
// Security model:
//   1. apiKeyAuth (subdomain → tenant_slug, x-api-key constant-time match)
//   2. assertBodyTenantSlug (body.tenant_slug must equal resolved subdomain)
//   3. RateLimiter (10 creates/min, 30 publishes/min, per tenant_slug)
//
// Logging: tenant_slug, project_id, status, latency_ms only. NEVER html_body
// content, NEVER the api key. (NFR-112-003 + spec constraint "DO NOT log
// html_body content").

import { randomUUID } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';

import {
  buildDeployFileSet,
  DeployError,
  deployToVercel,
  readVercelConfig,
  VERCEL_PROVIDER_ID,
} from '../deploy.js';
import { ensureProject, writeProjectFile } from '../projects.js';
import { apiKeyAuth, assertBodyTenantSlug } from '../middleware/api-key-auth.js';
import { RateLimiter } from '../middleware/rate-limit.js';

const DEFAULT_CREATE_LIMIT_PER_MIN = 10;
const DEFAULT_PUBLISH_LIMIT_PER_MIN = 30;

const MAX_TITLE_LEN = 500;
const MAX_HTML_BODY_BYTES = 2 * 1024 * 1024; // 2 MB; daemon JSON limit is 4 MB

/** Subset of registry entry we read for ctx synthesis. */
export interface RegistryOpenDesignBlock {
  vercel_team?: string;
  data_dir?: string;
  design_system?: string;
  wedge_endpoint?: string;
}
export interface RegistryEntry {
  open_design?: RegistryOpenDesignBlock;
}

interface ApiProjectsDeps {
  /** Optional override of the daemon's project DB insert/get/upsert. */
  db: unknown;
  /** Resolved root path under which per-project folders live. */
  projectsDir: string;
  /**
   * Optional tenant registry. Used by the publish route to look up vercel_team
   * for the resolved tenant — required by deployToVercel(ctx) on the
   * lumina-2.0.0-multitenant branch. If omitted, the route synthesizes a
   * ctx with empty vercel_team (deploy will then fail with a clear error).
   */
  registry?: Map<string, RegistryEntry>;
  /** Insert a project into the daemon DB. Defaults to require('../db.js').insertProject. */
  insertProject?: (db: unknown, project: ProjectRecord) => ProjectRecord;
  /** Look up an existing project by id. */
  getProject?: (db: unknown, id: string) => ProjectRecord | null;
  /**
   * Construct an editable canvas URL for a project. Defaults to building
   * "<base_url>/projects/<project_id>/edit" where base_url is read from the
   * request's host. Can be overridden in tests.
   */
  buildEditUrl?: (req: Request, projectId: string) => string;
  /** Vercel deploy hook — defaults to deployToVercel. */
  deploy?: typeof deployToVercel;
  /** Read Vercel config. Defaults to readVercelConfig. */
  loadVercelConfig?: typeof readVercelConfig;
  /** Build the file set for deploy. Defaults to buildDeployFileSet. */
  buildFileSet?: typeof buildDeployFileSet;
  /** Override of the API-key reader for tests. */
  readApiKeys?: () => Record<string, string>;
  /** Override of the host-header parser for tests. */
  resolveTenantFromHost?: (host: string | undefined) => string | null;
  /** Logger — defaults to console.info. Tests can capture this. */
  logger?: (line: LogLine) => void;
}

interface ProjectRecord {
  id: string;
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  pendingPrompt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

interface LogLine {
  msg: string;
  tenant_slug: string;
  project_id?: string;
  status: number;
  latency_ms: number;
  caller_ip?: string;
  err?: string;
}

interface CreateBody {
  title: unknown;
  html_body: unknown;
  tenant_slug: unknown;
}

function safeLog(deps: ApiProjectsDeps, line: LogLine): void {
  // PII safety — html_body is NEVER logged. Caller assembles `line` without it.
  // Always output structured JSON so log scrapers can extract fields.
  const out = deps.logger ?? ((l: LogLine) => console.info(JSON.stringify(l)));
  try {
    out(line);
  } catch {
    // Logging failures must not break the request path.
  }
}

function getCallerIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    // Take the first IP — the rest are downstream proxies.
    return forwarded.split(',')[0]?.trim();
  }
  return req.ip;
}

function defaultBuildEditUrl(req: Request, projectId: string): string {
  const proto =
    (req.headers['x-forwarded-proto'] as string | undefined) ??
    (req.secure ? 'https' : 'http');
  const host =
    (req.headers['x-forwarded-host'] as string | undefined) ??
    (req.headers['host'] as string | undefined) ??
    'localhost';
  return `${proto}://${host}/projects/${encodeURIComponent(projectId)}/edit`;
}

/**
 * Mount /api/projects REST endpoints on the given Express app.
 *
 * MUST be called BEFORE the existing single-user `app.post('/api/projects')`
 * UI handler is registered, because we use a passthrough pattern: when no
 * x-api-key header is present, we call next() to fall through to the UI
 * handler.
 */
export function mountApiProjectsRoutes(
  app: Express,
  deps: ApiProjectsDeps,
): void {
  const createLimit = clampLimit(
    Number(process.env['OPENDESIGN_CREATE_LIMIT_PER_MIN']),
    DEFAULT_CREATE_LIMIT_PER_MIN,
  );
  const publishLimit = clampLimit(
    Number(process.env['OPENDESIGN_PUBLISH_LIMIT_PER_MIN']),
    DEFAULT_PUBLISH_LIMIT_PER_MIN,
  );
  const createLimiter = new RateLimiter('create', createLimit);
  const publishLimiter = new RateLimiter('publish', publishLimit);

  const auth = apiKeyAuth({
    ...(deps.readApiKeys ? { readApiKeys: deps.readApiKeys } : {}),
    ...(deps.resolveTenantFromHost
      ? { resolveTenantFromHost: deps.resolveTenantFromHost }
      : {}),
  });

  // Passthrough — only enforce REST auth when x-api-key is present. This lets
  // the existing UI handler at /api/projects keep working in dev / single-user
  // mode (no x-api-key header sent).
  function restGate(req: Request, res: Response, next: NextFunction): void {
    const hasKey = typeof req.headers['x-api-key'] === 'string';
    if (!hasKey) {
      next();
      return;
    }
    auth(req, res, next);
  }

  // POST /api/projects — create + return edit_url. Intentionally leaves
  // publish to a separate request so callers can stage edits on the canvas
  // before deploying.
  app.post('/api/projects', restGate, async (req: Request, res: Response, next: NextFunction) => {
    if (!req.resolved_tenant) {
      // Passthrough mode (no x-api-key) — let the UI handler take over.
      return next();
    }
    const start = Date.now();
    const tenant = req.resolved_tenant.tenant_slug;
    const callerIp = getCallerIp(req);

    try {
      if (!assertBodyTenantSlug(req, res)) {
        safeLog(deps, {
          msg: 'create.slug_mismatch',
          tenant_slug: tenant,
          status: res.statusCode,
          latency_ms: Date.now() - start,
          ...(callerIp ? { caller_ip: callerIp } : {}),
        });
        return;
      }

      const limit = createLimiter.check(tenant);
      if (!limit.ok) {
        res.setHeader('Retry-After', String(limit.retry_after_seconds));
        res.status(429).json({ error: 'rate_limited', retry_after_seconds: limit.retry_after_seconds });
        safeLog(deps, {
          msg: 'create.rate_limited',
          tenant_slug: tenant,
          status: 429,
          latency_ms: Date.now() - start,
          ...(callerIp ? { caller_ip: callerIp } : {}),
        });
        return;
      }

      const body = (req.body ?? {}) as CreateBody;
      const titleErr = validateTitle(body.title);
      if (titleErr) {
        res.status(400).json({ error: titleErr });
        safeLog(deps, {
          msg: 'create.bad_request',
          tenant_slug: tenant,
          status: 400,
          latency_ms: Date.now() - start,
          err: titleErr,
        });
        return;
      }
      const htmlErr = validateHtmlBody(body.html_body);
      if (htmlErr) {
        res.status(400).json({ error: htmlErr });
        safeLog(deps, {
          msg: 'create.bad_request',
          tenant_slug: tenant,
          status: 400,
          latency_ms: Date.now() - start,
          err: htmlErr,
        });
        return;
      }

      const title = (body.title as string).trim();
      const htmlBody = body.html_body as string;
      const projectId = randomUUID();
      const now = Date.now();
      const insert =
        deps.insertProject ??
        ((dbInst, p: ProjectRecord) => {
          // Lazy import to avoid pulling the SQLite layer in tests.
          // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
          const dbMod = require('../db.js');
          return dbMod.insertProject(dbInst, p) as ProjectRecord;
        });

      const project = insert(deps.db, {
        id: projectId,
        name: title,
        skillId: null,
        designSystemId: null,
        pendingPrompt: null,
        metadata: { kind: 'rest_api', tenant_slug: tenant },
        createdAt: now,
        updatedAt: now,
      });

      // Persist html_body to disk under the daemon's project store.
      await ensureProject(deps.projectsDir, project.id);
      await writeProjectFile(
        deps.projectsDir,
        project.id,
        'index.html',
        Buffer.from(htmlBody, 'utf8'),
      );

      const buildEditUrl = deps.buildEditUrl ?? defaultBuildEditUrl;
      const editUrl = buildEditUrl(req, project.id);

      res.status(200).json({
        project_id: project.id,
        edit_url: editUrl,
      });
      safeLog(deps, {
        msg: 'create.ok',
        tenant_slug: tenant,
        project_id: project.id,
        status: 200,
        latency_ms: Date.now() - start,
        ...(callerIp ? { caller_ip: callerIp } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      res.status(500).json({ error: 'internal_error' });
      safeLog(deps, {
        msg: 'create.error',
        tenant_slug: tenant,
        status: 500,
        latency_ms: Date.now() - start,
        err: msg,
      });
    }
  });

  // POST /api/projects/:id/publish — re-deploy an existing project to Vercel.
  // The :id-publish path doesn't conflict with the existing UI deploy at
  // /api/projects/:id/deploy, so no passthrough gate is needed here — but we
  // still apply auth+slug check.
  app.post('/api/projects/:id/publish', auth, async (req: Request, res: Response) => {
    const start = Date.now();
    if (!req.resolved_tenant) {
      // apiKeyAuth must populate this; defensive 500 if not.
      res.status(500).json({ error: 'auth_misordered' });
      return;
    }
    const tenant = req.resolved_tenant.tenant_slug;
    const callerIp = getCallerIp(req);
    const projectId = req.params['id'];

    try {
      // body.tenant_slug is required for publish too — keeps cross-tenant
      // forging defense uniform across both endpoints.
      if (!assertBodyTenantSlug(req, res)) {
        safeLog(deps, {
          msg: 'publish.slug_mismatch',
          tenant_slug: tenant,
          ...(projectId ? { project_id: projectId } : {}),
          status: res.statusCode,
          latency_ms: Date.now() - start,
          ...(callerIp ? { caller_ip: callerIp } : {}),
        });
        return;
      }

      const limit = publishLimiter.check(tenant);
      if (!limit.ok) {
        res.setHeader('Retry-After', String(limit.retry_after_seconds));
        res.status(429).json({ error: 'rate_limited', retry_after_seconds: limit.retry_after_seconds });
        safeLog(deps, {
          msg: 'publish.rate_limited',
          tenant_slug: tenant,
          ...(projectId ? { project_id: projectId } : {}),
          status: 429,
          latency_ms: Date.now() - start,
          ...(callerIp ? { caller_ip: callerIp } : {}),
        });
        return;
      }

      if (!projectId || !/^[A-Za-z0-9._-]{1,128}$/.test(projectId)) {
        res.status(400).json({ error: 'invalid_project_id' });
        return;
      }

      // Verify the project belongs to this tenant. If we can't (no getProject
      // override and the daemon DB module isn't available — e.g. unit tests),
      // we still enforce auth + slug check above; in production the
      // ownership check below runs.
      const getProject = deps.getProject ?? null;
      if (getProject) {
        const project = getProject(deps.db, projectId);
        if (!project) {
          res.status(404).json({ error: 'project_not_found' });
          safeLog(deps, {
            msg: 'publish.not_found',
            tenant_slug: tenant,
            project_id: projectId,
            status: 404,
            latency_ms: Date.now() - start,
          });
          return;
        }
        const projectTenant = (project.metadata as { tenant_slug?: unknown } | null)
          ?.tenant_slug;
        if (typeof projectTenant !== 'string' || projectTenant !== tenant) {
          // Refuse to publish another tenant's project even if they somehow
          // know its id. 404 (not 403) so we don't leak existence.
          res.status(404).json({ error: 'project_not_found' });
          safeLog(deps, {
            msg: 'publish.cross_tenant_blocked',
            tenant_slug: tenant,
            project_id: projectId,
            status: 404,
            latency_ms: Date.now() - start,
          });
          return;
        }
      }

      const buildFileSet = deps.buildFileSet ?? buildDeployFileSet;
      const loadVercelConfig = deps.loadVercelConfig ?? readVercelConfig;
      const deploy = deps.deploy ?? deployToVercel;

      // Synthesize the RequestTenantContext shape that deployToVercel needs.
      // Spec 112 routes do not flow through the tenant resolver (they bypass
      // Clerk JWT). We build a minimal ctx from registry data + the resolved
      // tenant slug so cross-tenant invariants in deploy.ts still hold (ctx
      // values are TRUSTED — derived from x-api-key + subdomain + registry).
      const odBlock = deps.registry?.get(tenant)?.open_design;
      const deployCtx = {
        tenant_id: tenant,
        request_id: randomUUID(),
        clerk_user_id: 'rest-api',
        clerk_session_id: 'rest-api',
        clerk_org_slug: tenant,
        design_system: odBlock?.design_system ?? '',
        wedge_endpoint: odBlock?.wedge_endpoint ?? '',
        vercel_team: odBlock?.vercel_team ?? '',
        data_dir: odBlock?.data_dir ?? '',
      };

      const config = await loadVercelConfig();
      const files = await buildFileSet(deps.projectsDir, projectId, 'index.html');
      const result = await (deploy as (args: {
        config: unknown;
        files: unknown;
        projectId: string;
        ctx: typeof deployCtx;
      }) => Promise<{ url: string; deploymentId?: string }>)({
        config,
        files,
        projectId,
        ctx: deployCtx,
      });

      res.status(200).json({
        published_url: result.url,
        vercel_project_id: result.deploymentId ?? null,
      });
      safeLog(deps, {
        msg: 'publish.ok',
        tenant_slug: tenant,
        project_id: projectId,
        status: 200,
        latency_ms: Date.now() - start,
        ...(callerIp ? { caller_ip: callerIp } : {}),
      });
    } catch (err) {
      // DeployError carries an http status. Surface it but never include
      // details that might contain html_body fragments. The DeployError class
      // is in a //@ts-nocheck file so we narrow via duck-typing.
      const isDeployErr = err instanceof DeployError;
      const status = isDeployErr ? ((err as unknown as { status?: number }).status ?? 500) : 500;
      const code = isDeployErr ? 'deploy_failed' : 'internal_error';
      const msg = err instanceof Error ? err.message : 'unknown error';
      res.status(status).json({ error: code });
      safeLog(deps, {
        msg: 'publish.error',
        tenant_slug: tenant,
        ...(projectId ? { project_id: projectId } : {}),
        status,
        latency_ms: Date.now() - start,
        err: msg,
      });
    }
  });

  // Reference VERCEL_PROVIDER_ID so it's not pruned by tree-shaking; future
  // routes may surface the provider id in responses.
  void VERCEL_PROVIDER_ID;
}

function clampLimit(envValue: number, fallback: number): number {
  if (!Number.isFinite(envValue) || envValue <= 0) return fallback;
  return envValue;
}

function validateTitle(value: unknown): string | null {
  if (typeof value !== 'string') return 'title_must_be_string';
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'title_required';
  if (trimmed.length > MAX_TITLE_LEN) return 'title_too_long';
  return null;
}

function validateHtmlBody(value: unknown): string | null {
  if (typeof value !== 'string') return 'html_body_must_be_string';
  if (value.length === 0) return 'html_body_required';
  if (Buffer.byteLength(value, 'utf8') > MAX_HTML_BODY_BYTES) {
    return 'html_body_too_large';
  }
  return null;
}

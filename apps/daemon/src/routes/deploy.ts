import type { Express } from 'express';
import { API_ERROR_CODES, type ApiErrorCode } from '@open-design/contracts';
import type { RouteDeps } from '../server-context.js';
import type { AuthorizeProjectRequest } from '../collab/project-request-authority.js';

const API_ERROR_CODE_SET = new Set<string>(API_ERROR_CODES);

export interface RegisterDeployRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'ids' | 'deploy' | 'projectStore'> {
  authorizeProjectRequest: AuthorizeProjectRequest;
}

export function registerDeployRoutes(app: Express, ctx: RegisterDeployRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { PROJECTS_DIR } = ctx.paths;
  const { randomUUID } = ctx.ids;
  const { getProject } = ctx.projectStore;
  const { VERCEL_PROVIDER_ID, CLOUDFLARE_PAGES_PROVIDER_ID, DISPLAYDEV_PROVIDER_ID, isDeployProviderId, publicDeployConfigForProvider, readDeployConfig, writeDeployConfig, listCloudflarePagesZones, DeployError, listDeployments, publicDeployments, getDeployment, buildDeployFileSet, cloudflarePagesProjectNameForDeploy, deployToCloudflarePages, deployToDisplayDev, deployToVercel, upsertDeployment, publicDeployment, cloudflarePagesDeploymentMetadata, prepareDeployPreflight, fetchDisplayDevArtifactAccessSettings } = ctx.deploy;

  /**
   * A DeployError now carries a specific `code` (MISSING_REFERENCES,
   * CF_ASSET_TOO_LARGE, VERCEL_TOKEN_REQUIRED, …). Pass it through instead of
   * flattening every failure to BAD_REQUEST: the client mirrors the envelope
   * code into `artifact_deploy_result.error_code`, so without this every
   * distinct cause — missing token, non-HTML file, unresolved asset reference,
   * oversized asset — collapsed into one opaque HTTP_400 bucket.
   *
   * Provider transport failures deliberately arrive WITHOUT a code (see
   * cloudflareError / vercelError in apps/daemon/src/deploy.ts): they fall back
   * to the generic envelope code so the client keeps bucketing them by the real
   * provider status (HTTP_403 / HTTP_429 / HTTP_502) instead of collapsing
   * auth, quota and upstream faults into one.
   */
  const deployErrorCodeFor = (err: any, status: number): string =>
    (err instanceof DeployError && err.code) ||
    (status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST');

  // ---- Deploy --------------------------------------------------------------

  app.get('/api/deploy/config', async (req, res) => {
    try {
      const providerId =
        typeof req.query.providerId === 'string' ? req.query.providerId : VERCEL_PROVIDER_ID;
      if (!isDeployProviderId(providerId)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'unsupported deploy provider');
      }
      /** @type {import('@open-design/contracts').DeployConfigResponse} */
      const body = publicDeployConfigForProvider(providerId, await readDeployConfig(providerId));
      res.json(body);
    } catch (err: any) {
      const status = err instanceof DeployError ? err.status : 500;
      sendApiError(
        res,
        status,
        status === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

  app.put('/api/deploy/config', async (req, res) => {
    try {
      const input = req.body || {};
      const providerId =
        typeof input.providerId === 'string' ? input.providerId : VERCEL_PROVIDER_ID;
      if (!isDeployProviderId(providerId)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'unsupported deploy provider');
      }
      /** @type {import('@open-design/contracts').DeployConfigResponse} */
      const body = await writeDeployConfig(providerId, input);
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, deployErrorCodeFor(err, 400), String(err?.message || err));
    }
  });

  app.get('/api/deploy/cloudflare-pages/zones', async (_req, res) => {
    try {
      /** @type {import('@open-design/contracts').CloudflarePagesZonesResponse} */
      const body = await listCloudflarePagesZones(await readDeployConfig(CLOUDFLARE_PAGES_PROVIDER_ID));
      res.json(body);
    } catch (err: any) {
      const status = err instanceof DeployError ? err.status : 400;
      const init =
        err instanceof DeployError && err.details
          ? { details: err.details }
          : {};
      sendApiError(res, status, deployErrorCodeForError(err, status), String(err?.message || err), init);
    }
  });

  app.get('/api/projects/:id/deployments', async (req, res) => {
    try {
      if (!getProject(db, req.params.id)) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await ctx.authorizeProjectRequest(req, res, req.params.id, { mode: 'read' })) return;
      const deployments = await hydrateDisplayDevDeploymentAccess(listDeployments(db, req.params.id), {
        DISPLAYDEV_PROVIDER_ID,
        DeployError,
        readDeployConfig,
        fetchDisplayDevArtifactAccessSettings,
      });
      /** @type {import('@open-design/contracts').ProjectDeploymentsResponse} */
      const body = { deployments: publicDeployments(deployments) };
      res.json(body);
    } catch (err: any) {
      const status = err instanceof DeployError ? err.status : 400;
      const init =
        err instanceof DeployError && err.details
          ? { details: err.details }
          : {};
      sendApiError(res, status, deployErrorCodeForError(err, status), String(err?.message || err), init);
    }
  });

  app.post('/api/projects/:id/deploy', async (req, res) => {
    try {
      const {
        fileName,
        providerId = VERCEL_PROVIDER_ID,
        cloudflarePages,
        displayDev,
        target: rawTarget,
      } = req.body || {};
      // Omitted target defaults to production; any supplied value must be exact.
      if (rawTarget !== undefined && rawTarget !== 'preview' && rawTarget !== 'production') {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid target: expected "preview" or "production"');
      }
      const target: 'preview' | 'production' = rawTarget === 'preview' ? 'preview' : 'production';
      // Vercel production-target deploys are out of scope for this PR (P2 review
      // finding on PR #4576) — deployToVercel() never receives `target` and
      // always behaves as preview, so an explicit target=production request
      // must be rejected before any deploy call instead of silently deploying
      // as preview. Only the explicitly-supplied raw value gates this: the
      // omitted-target default (which resolves to 'production' above for
      // Cloudflare Pages parity) must keep deploying Vercel as before.
      if (providerId === VERCEL_PROVIDER_ID && rawTarget === 'production') {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'Vercel does not support target=production yet; use target=preview or omit target',
        );
      }
      if (!isDeployProviderId(providerId)) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'unsupported deploy provider',
        );
      }
      if (typeof fileName !== 'string' || !fileName.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'fileName required');
      }
      const deployProject = getProject(db, req.params.id);
      if (!deployProject) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await ctx.authorizeProjectRequest(
        req,
        res,
        req.params.id,
        { mode: 'write', capability: 'writeFiles' },
      )) return;

      const prior = getDeployment(db, req.params.id, fileName, providerId);
      const files = await buildDeployFileSet(
        PROJECTS_DIR,
        req.params.id,
        fileName,
        {
          metadata: deployProject?.metadata,
          includeProjectFiles: providerId !== DISPLAYDEV_PROVIDER_ID,
        },
      );
      const project = getProject(db, req.params.id);
      const cloudflarePagesProjectName =
        providerId === CLOUDFLARE_PAGES_PROVIDER_ID
          ? cloudflarePagesProjectNameForDeploy(db, req.params.id, project?.name, prior)
          : '';
      const result = providerId === CLOUDFLARE_PAGES_PROVIDER_ID
        ? await deployToCloudflarePages({
            config: {
              ...await readDeployConfig(CLOUDFLARE_PAGES_PROVIDER_ID),
              projectName: cloudflarePagesProjectName,
            },
            files,
            projectId: req.params.id,
            cloudflarePages,
            priorMetadata: prior?.providerMetadata,
            target,
          })
        : providerId === DISPLAYDEV_PROVIDER_ID
          ? await deployToDisplayDev({
              config: await readDeployConfig(DISPLAYDEV_PROVIDER_ID),
              files,
              projectId: req.params.id,
              displayDev,
              priorMetadata: prior?.providerMetadata,
            })
          : await deployToVercel({
              config: await readDeployConfig(VERCEL_PROVIDER_ID),
              files,
              projectId: req.params.id,
            });
      const now = Date.now();
      /** @type {import('@open-design/contracts').DeployProjectFileResponse} */
      const body = upsertDeployment(db, {
        id: prior?.id ?? randomUUID(),
        projectId: req.params.id,
        fileName,
        providerId,
        url: result.url,
        deploymentId: result.deploymentId,
        deploymentCount: (prior?.deploymentCount ?? 0) + 1,
        target: result.target ?? target,
        status: result.status,
        statusMessage: result.statusMessage,
        reachableAt: result.reachableAt,
        cloudflarePages: result.cloudflarePages,
        providerMetadata:
          providerId === CLOUDFLARE_PAGES_PROVIDER_ID
            ? (result.providerMetadata ?? cloudflarePagesDeploymentMetadata(cloudflarePagesProjectName))
            : providerId === DISPLAYDEV_PROVIDER_ID
              ? result.providerMetadata
            : prior?.providerMetadata,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
      });
      const responseDeployment = providerId === DISPLAYDEV_PROVIDER_ID
        ? await hydrateDisplayDevDeploymentAccess(body, {
            DISPLAYDEV_PROVIDER_ID,
            DeployError,
            readDeployConfig,
            fetchDisplayDevArtifactAccessSettings,
          })
        : body;
      res.json(publicDeployment(responseDeployment));
    } catch (err: any) {
      const status = err instanceof DeployError ? err.status : 400;
      const init =
        err instanceof DeployError && err.details
          ? { details: err.details }
          : {};
      sendApiError(
        res,
        status,
        deployErrorCodeForError(err, status, { notFound: 'FILE_NOT_FOUND' }),
        String(err?.message || err),
        init,
      );
    }
  });

  app.post('/api/projects/:id/deploy/preflight', async (req, res) => {
    try {
      const { fileName, providerId = VERCEL_PROVIDER_ID } = req.body || {};
      if (!isDeployProviderId(providerId)) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'unsupported deploy provider',
        );
      }
      if (typeof fileName !== 'string' || !fileName.trim()) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'fileName required');
      }
      const preflightProject = getProject(db, req.params.id);
      if (!await ctx.authorizeProjectRequest(req, res, req.params.id, { mode: 'read' })) return;
      /** @type {import('@open-design/contracts').DeployPreflightResponse} */
      const body = await prepareDeployPreflight(
        PROJECTS_DIR,
        req.params.id,
        fileName,
        {
          metadata: preflightProject?.metadata,
          providerId,
          includeProjectFiles: providerId !== DISPLAYDEV_PROVIDER_ID,
        },
      );
      res.json(body);
    } catch (err: any) {
      // DeployError is a known/expected outcome (validation, missing file).
      // Anything else points at a bug or an unexpected runtime state, so
      // surface it in the daemon log without leaking internals to the
      // client which still gets a generic 400.
      if (!(err instanceof DeployError)) {
        console.error('[deploy/preflight]', err);
      }
      const status = err instanceof DeployError ? err.status : 400;
      sendApiError(
        res,
        status,
        deployErrorCodeFor(err, status),
        String(err?.message || err),
      );
    }
  });

}

type JsonObject = Record<string, unknown>;
type DeployRouteDeployment = {
  providerId?: string | null;
  providerMetadata?: JsonObject | null;
};

type DisplayDevHydrationDeps = {
  DISPLAYDEV_PROVIDER_ID: string;
  DeployError: new (message: string, status?: number, details?: unknown, code?: string) => Error & {
    status: number;
    details?: unknown;
  };
  readDeployConfig: (providerId: string) => Promise<unknown>;
  fetchDisplayDevArtifactAccessSettings: (config: unknown, shortId: string) => Promise<JsonObject>;
};

async function hydrateDisplayDevDeploymentAccess<T extends DeployRouteDeployment>(
  deployments: T[],
  deps: DisplayDevHydrationDeps,
): Promise<T[]>;
async function hydrateDisplayDevDeploymentAccess<T extends DeployRouteDeployment>(
  deployment: T,
  deps: DisplayDevHydrationDeps,
): Promise<T>;
async function hydrateDisplayDevDeploymentAccess<T extends DeployRouteDeployment>(
  deploymentOrDeployments: T | T[],
  deps: DisplayDevHydrationDeps,
): Promise<T | T[]> {
  if (Array.isArray(deploymentOrDeployments)) {
    let displayDevConfig: Promise<unknown> | undefined;
    const getDisplayDevConfig = async () => {
      displayDevConfig ??= deps.readDeployConfig(deps.DISPLAYDEV_PROVIDER_ID);
      return displayDevConfig;
    };
    return Promise.all(
      deploymentOrDeployments.map(async (deployment) => {
        try {
          return await hydrateSingleDisplayDevDeploymentAccess(
            deployment,
            deps,
            getDisplayDevConfig,
          );
        } catch {
          return deployment;
        }
      }),
    );
  }
  return hydrateSingleDisplayDevDeploymentAccess(
    deploymentOrDeployments,
    deps,
    () => deps.readDeployConfig(deps.DISPLAYDEV_PROVIDER_ID),
  );
}

async function hydrateSingleDisplayDevDeploymentAccess<T extends DeployRouteDeployment>(
  deployment: T,
  deps: DisplayDevHydrationDeps,
  getDisplayDevConfig: () => Promise<unknown | null>,
): Promise<T> {
  if (deployment?.providerId !== deps.DISPLAYDEV_PROVIDER_ID) return deployment;
  const providerMetadata = isRecord(deployment.providerMetadata) ? deployment.providerMetadata : {};
  const displayDev = isRecord(providerMetadata.displayDev) ? providerMetadata.displayDev : null;
  if (displayDev?.mode !== 'authenticated') {
    return deployment;
  }
  if (typeof displayDev.shortId !== 'string' || !displayDev.shortId.trim()) {
    throw new deps.DeployError('display.dev authenticated deployment is missing artifact id.', 502);
  }
  const config = await getDisplayDevConfig();
  if (!config || typeof config !== 'object') {
    throw new deps.DeployError('display.dev deploy config is required to read access settings.', 400);
  }
  const accessSettings = await deps.fetchDisplayDevArtifactAccessSettings(config, displayDev.shortId.trim());
  return {
    ...deployment,
    providerMetadata: {
      ...providerMetadata,
      displayDev: {
        ...displayDev,
        ...accessSettings,
      },
    },
  };
}

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export interface RegisterDeploymentCheckRoutesDeps extends RouteDeps<'db' | 'http' | 'deploy' | 'projectStore'> {
  authorizeProjectRequest: AuthorizeProjectRequest;
}

export function registerDeploymentCheckRoutes(app: Express, ctx: RegisterDeploymentCheckRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { getProject } = ctx.projectStore;
  const {
    getDeploymentById,
    CLOUDFLARE_PAGES_PROVIDER_ID,
    DISPLAYDEV_PROVIDER_ID,
    DeployError,
    readDeployConfig,
    fetchDisplayDevArtifactAccessSettings,
    cloudflarePagesProjectNameFromDeployment,
    checkCloudflarePagesDeploymentLinks,
    checkDeploymentUrl,
    upsertDeployment,
    publicDeployment,
  } = ctx.deploy;

  app.post(
    '/api/projects/:id/deployments/:deploymentId/check-link',
    async (req, res) => {
      try {
        if (!getProject(db, req.params.id)) {
          return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
        }
        if (!await ctx.authorizeProjectRequest(
          req,
          res,
          req.params.id,
          { mode: 'write', capability: 'writeFiles' },
        )) return;
        const existing = getDeploymentById(
          db,
          req.params.id,
          req.params.deploymentId,
        );
        if (!existing) {
          return sendApiError(
            res,
            404,
            'FILE_NOT_FOUND',
            'deployment not found',
          );
        }
        const stableCloudflareProjectName =
          existing.providerId === CLOUDFLARE_PAGES_PROVIDER_ID
            ? cloudflarePagesProjectNameFromDeployment(existing)
            : '';
        if (existing.providerId === CLOUDFLARE_PAGES_PROVIDER_ID && existing.cloudflarePages?.pagesDev?.url) {
          const checked = await checkCloudflarePagesDeploymentLinks(existing);
          const now = Date.now();
          /** @type {import('@open-design/contracts').CheckDeploymentLinkResponse} */
          const body = upsertDeployment(db, {
            ...existing,
            ...checked,
            reachableAt: checked.status === 'ready' ? now : existing.reachableAt,
            updatedAt: now,
          });
          const responseDeployment = await hydrateDisplayDevDeploymentAccess(body, {
            DISPLAYDEV_PROVIDER_ID,
            DeployError,
            readDeployConfig,
            fetchDisplayDevArtifactAccessSettings,
          });
          return res.json(publicDeployment(responseDeployment));
        }
        const checkUrl = stableCloudflareProjectName
          ? `https://${stableCloudflareProjectName}.pages.dev`
          : existing.url;
        const result = await checkDeploymentUrl(checkUrl);
        const now = Date.now();
        /** @type {import('@open-design/contracts').CheckDeploymentLinkResponse} */
        const body = upsertDeployment(db, {
          ...existing,
          url: checkUrl || existing.url,
          status: result.reachable ? 'ready' : result.status || 'link-delayed',
          statusMessage: result.reachable
            ? 'Public link is ready.'
            : result.statusMessage ||
              'Vercel is still preparing the public link.',
          reachableAt: result.reachable ? now : existing.reachableAt,
          updatedAt: now,
        });
        const responseDeployment = await hydrateDisplayDevDeploymentAccess(body, {
          DISPLAYDEV_PROVIDER_ID,
          DeployError,
          readDeployConfig,
          fetchDisplayDevArtifactAccessSettings,
        });
        res.json(publicDeployment(responseDeployment));
      } catch (err: any) {
        const status = err instanceof DeployError ? err.status : 400;
        const init =
          err instanceof DeployError && err.details
            ? { details: err.details }
            : {};
        sendApiError(
          res,
          status,
          deployErrorCodeForError(err, status, { notFound: 'FILE_NOT_FOUND' }),
          String(err?.message || err),
          init,
        );
      }
    },
  );

}

function deployErrorCodeForStatus(
  status: number,
  options: { notFound?: ApiErrorCode } = {},
): ApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 409) return 'CONFLICT';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 422) return 'VALIDATION_FAILED';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'UPSTREAM_UNAVAILABLE';
  if (status === 404) return options.notFound ?? 'BAD_REQUEST';
  return 'BAD_REQUEST';
}

function deployErrorCodeForError(
  err: unknown,
  status: number,
  options: { notFound?: ApiErrorCode } = {},
): ApiErrorCode {
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  if (isApiErrorCode(code)) return code;
  return deployErrorCodeForStatus(status, options);
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && API_ERROR_CODE_SET.has(value);
}

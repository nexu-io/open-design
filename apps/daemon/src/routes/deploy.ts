import type { Express } from 'express';
import { API_ERROR_CODES, type ApiErrorCode, type DeployConfigResponse } from '@open-design/contracts';
import type { RouteDeps } from '../server-context.js';
import type { AuthorizeProjectRequest } from '../collab/project-request-authority.js';

const API_ERROR_CODE_SET = new Set<string>(API_ERROR_CODES);

export interface RegisterDeployRoutesDeps extends RouteDeps<
  'db' | 'http' | 'paths' | 'ids' | 'deploy' | 'projectStore'
> {
  authorizeProjectRequest: AuthorizeProjectRequest;
}

export function registerDeployRoutes(
  app: Express,
  ctx: RegisterDeployRoutesDeps,
) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { PROJECTS_DIR } = ctx.paths;
  const { randomUUID } = ctx.ids;
  const { getProject, validateProjectPath } = ctx.projectStore;
  const {
    VERCEL_PROVIDER_ID,
    CLOUDFLARE_PAGES_PROVIDER_ID,
    DISPLAYDEV_PROVIDER_ID,
    isDeployProviderId,
    publicDeployConfigForProvider,
    readDeployConfig,
    writeDeployConfig,
    listCloudflarePagesZones,
    DeployError,
    listDeployments,
    publicDeployments,
    getDeployment,
    getDeploymentById,
    renameDeploymentFileName,
    buildDeployFileSet,
    cloudflarePagesProjectNameForDeploy,
    deployToCloudflarePages,
    deployToDisplayDev,
    deployToVercel,
    upsertDeployment,
    publicDeployment,
    cloudflarePagesDeploymentMetadata,
    prepareDeployPreflight,
    fetchDisplayDevArtifactAccessSettings,
  } = ctx.deploy;

  // ---- Deploy --------------------------------------------------------------

  app.get('/api/deploy/config', async (req, res) => {
    try {
      const providerId =
        typeof req.query.providerId === 'string'
          ? req.query.providerId
          : VERCEL_PROVIDER_ID;
      if (!isDeployProviderId(providerId)) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'unsupported deploy provider',
        );
      }
      /** @type {import('@open-design/contracts').DeployConfigResponse} */
      const body = publicDeployConfigForProvider(
        providerId,
        await readDeployConfig(providerId),
      );
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
        typeof input.providerId === 'string'
          ? input.providerId
          : VERCEL_PROVIDER_ID;
      if (!isDeployProviderId(providerId)) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'unsupported deploy provider',
        );
      }
      /** @type {import('@open-design/contracts').DeployConfigResponse} */
      const body = await writeDeployConfig(providerId, input);
      res.json(body);
    } catch (err: any) {
      const status = err instanceof DeployError ? err.status : 400;
      sendApiError(
        res,
        status,
        deployErrorCodeForError(err, status),
        String(err?.message || err),
      );
    }
  });

  app.get('/api/deploy/cloudflare-pages/zones', async (_req, res) => {
    try {
      /** @type {import('@open-design/contracts').CloudflarePagesZonesResponse} */
      const body = await listCloudflarePagesZones(
        await readDeployConfig(CLOUDFLARE_PAGES_PROVIDER_ID),
      );
      res.json(body);
    } catch (err: any) {
      const status = err instanceof DeployError ? err.status : 400;
      const init =
        err instanceof DeployError && err.details
          ? { details: err.details }
          : {};
      sendApiError(
        res,
        status,
        deployErrorCodeForError(err, status),
        String(err?.message || err),
        init,
      );
    }
  });

  app.get('/api/projects/:id/deployments', async (req, res) => {
    try {
      if (!getProject(db, req.params.id)) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (
        !(await ctx.authorizeProjectRequest(req, res, req.params.id, {
          mode: 'read',
        }))
      )
        return;
      /** @type {import('@open-design/contracts').ProjectDeploymentsResponse} */
      const body = {
        deployments: publicDeployments(listDeployments(db, req.params.id)),
      };
      res.json(body);
    } catch (err: any) {
      const status = err instanceof DeployError ? err.status : 400;
      const init =
        err instanceof DeployError && err.details
          ? { details: err.details }
          : {};
      sendApiError(
        res,
        status,
        deployErrorCodeForError(err, status),
        String(err?.message || err),
        init,
      );
    }
  });

  app.get('/api/projects/:id/deployments/:deploymentId', async (req, res) => {
    try {
      if (!getProject(db, req.params.id)) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (
        !(await ctx.authorizeProjectRequest(req, res, req.params.id, {
          mode: 'write',
          capability: 'writeFiles',
        }))
      )
        return;
      const deployment = getDeploymentById(
        db,
        req.params.id,
        req.params.deploymentId,
      );
      if (!deployment) {
        return sendApiError(res, 404, 'FILE_NOT_FOUND', 'deployment not found');
      }
      const hydrated = await hydrateDisplayDevDeploymentAccess(deployment, {
        DISPLAYDEV_PROVIDER_ID,
        DeployError,
        readDeployConfig,
        fetchDisplayDevArtifactAccessSettings,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.json(
        publicDeployment(hydrated, {
          includeDisplayDevRecipients: true,
          includeDisplayDevClaimUrl: true,
        }),
      );
    } catch (err: any) {
      const status = err instanceof DeployError ? err.status : 400;
      const init =
        err instanceof DeployError && err.details
          ? { details: err.details }
          : {};
      sendApiError(
        res,
        status,
        deployErrorCodeForError(err, status, {
          notFound: 'FILE_NOT_FOUND',
        }),
        String(err?.message || err),
        init,
      );
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
      if (
        rawTarget !== undefined &&
        rawTarget !== 'preview' &&
        rawTarget !== 'production'
      ) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'invalid target: expected "preview" or "production"',
        );
      }
      const target: 'preview' | 'production' =
        rawTarget === 'preview' ? 'preview' : 'production';
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
      if (providerId === DISPLAYDEV_PROVIDER_ID && rawTarget === 'production') {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'display.dev does not support target=production; use target=preview or omit target',
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
      const normalizedFileName = validateProjectPath(fileName);
      const deployProject = getProject(db, req.params.id);
      if (!deployProject) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (
        !(await ctx.authorizeProjectRequest(req, res, req.params.id, {
          mode: 'write',
          capability: 'writeFiles',
        }))
      )
        return;

      const responseBody = await withDeploymentOperationLock(
        deploymentOperationKey(req.params.id, normalizedFileName, providerId),
        async () => {
          const exactPrior = getDeployment(
            db,
            req.params.id,
            normalizedFileName,
            providerId,
          );
          const prior =
            exactPrior ??
            migrateLegacyDeploymentFileName({
              db,
              projectId: req.params.id,
              providerId,
              normalizedFileName,
              listDeployments,
              renameDeploymentFileName,
              validateProjectPath,
              DeployError,
            });
          const files = await buildDeployFileSet(
            PROJECTS_DIR,
            req.params.id,
            normalizedFileName,
            {
              metadata: deployProject?.metadata,
              includeProjectFiles: providerId !== DISPLAYDEV_PROVIDER_ID,
            },
          );
          const project = getProject(db, req.params.id);
          const cloudflarePagesProjectName =
            providerId === CLOUDFLARE_PAGES_PROVIDER_ID
              ? cloudflarePagesProjectNameForDeploy(
                  db,
                  req.params.id,
                  project?.name,
                  prior,
                )
              : '';
          const savedDisplayDevConfig =
            providerId === DISPLAYDEV_PROVIDER_ID
              ? await readDeployConfig(DISPLAYDEV_PROVIDER_ID)
              : undefined;
          const displayDevDeployConfig = savedDisplayDevConfig
            ? displayDevConfigForRequest(
                savedDisplayDevConfig,
                displayDev,
                DeployError,
              )
            : undefined;
          const result =
            providerId === CLOUDFLARE_PAGES_PROVIDER_ID
              ? await deployToCloudflarePages({
                  config: {
                    ...(await readDeployConfig(CLOUDFLARE_PAGES_PROVIDER_ID)),
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
                    config: displayDevDeployConfig,
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
          let displayDevConfigSaveFailed = false;
          let savedConfigResponse: DeployConfigResponse | undefined;
          if (
            providerId === DISPLAYDEV_PROVIDER_ID &&
            savedDisplayDevConfig &&
            displayDevConfigPersistenceRequested(displayDev)
          ) {
            try {
              savedConfigResponse = await writeDeployConfig(
                DISPLAYDEV_PROVIDER_ID,
                displayDevConfigPersistenceInput(
                  displayDev,
                  displayDevDeployConfig!,
                ),
                { expectedToken: savedDisplayDevConfig.token },
              );
            } catch {
              displayDevConfigSaveFailed = true;
            }
          }
          const now = Date.now();
          /** @type {import('@open-design/contracts').DeployProjectFileResponse} */
          const body = upsertDeployment(db, {
            id: prior?.id ?? randomUUID(),
            projectId: req.params.id,
            fileName: normalizedFileName,
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
                ? (result.providerMetadata ??
                  cloudflarePagesDeploymentMetadata(cloudflarePagesProjectName))
                : providerId === DISPLAYDEV_PROVIDER_ID
                  ? result.providerMetadata
                  : prior?.providerMetadata,
            createdAt: prior?.createdAt ?? now,
            updatedAt: now,
          });
          let responseDeployment = body;
          if (providerId === DISPLAYDEV_PROVIDER_ID) {
            try {
              responseDeployment = await hydrateDisplayDevDeploymentAccess(
                body,
                {
                  DISPLAYDEV_PROVIDER_ID,
                  DeployError,
                  readDeployConfig,
                  fetchDisplayDevArtifactAccessSettings,
                  config: displayDevDeployConfig,
                },
              );
            } catch {
              responseDeployment = body;
            }
          }
          const publicResponse = publicDeployment(responseDeployment, {
            includeDisplayDevRecipients: true,
            includeDisplayDevClaimUrl: true,
          });
          return {
            ...publicResponse,
            ...(displayDevConfigSaveFailed ? { displayDevConfigSaveFailed: true } : {}),
            ...(savedConfigResponse ? { savedDisplayDevConfig: savedConfigResponse } : {}),
          };
        },
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json(responseBody);
    } catch (err: any) {
      const status = err instanceof DeployError ? err.status : 400;
      const init =
        err instanceof DeployError && err.details
          ? { details: err.details }
          : {};
      sendApiError(
        res,
        status,
        deployErrorCodeForError(err, status, {
          notFound: 'FILE_NOT_FOUND',
        }),
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
      const normalizedFileName = validateProjectPath(fileName);
      const preflightProject = getProject(db, req.params.id);
      if (
        !(await ctx.authorizeProjectRequest(req, res, req.params.id, {
          mode: 'read',
        }))
      )
        return;
      /** @type {import('@open-design/contracts').DeployPreflightResponse} */
      const body = await prepareDeployPreflight(
        PROJECTS_DIR,
        req.params.id,
        normalizedFileName,
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
        deployErrorCodeForError(err, status, { notFound: 'FILE_NOT_FOUND' }),
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
  DeployError: new (
    message: string,
    status?: number,
    details?: unknown,
    code?: string,
  ) => Error & {
    status: number;
    details?: unknown;
  };
  readDeployConfig: (providerId: string) => Promise<unknown>;
  fetchDisplayDevArtifactAccessSettings: (
    config: unknown,
    shortId: string,
  ) => Promise<JsonObject>;
  config?: unknown;
};

async function hydrateDisplayDevDeploymentAccess<
  T extends DeployRouteDeployment,
>(deployment: T, deps: DisplayDevHydrationDeps): Promise<T> {
  if (deployment?.providerId !== deps.DISPLAYDEV_PROVIDER_ID) return deployment;
  const providerMetadata = isRecord(deployment.providerMetadata)
    ? deployment.providerMetadata
    : {};
  const displayDev = isRecord(providerMetadata.displayDev)
    ? providerMetadata.displayDev
    : null;
  if (displayDev?.mode !== 'authenticated') {
    return deployment;
  }
  if (typeof displayDev.shortId !== 'string' || !displayDev.shortId.trim()) {
    throw new deps.DeployError(
      'display.dev authenticated deployment is missing artifact id.',
      502,
      undefined,
      'UPSTREAM_UNAVAILABLE',
    );
  }
  const config =
    deps.config ?? (await deps.readDeployConfig(deps.DISPLAYDEV_PROVIDER_ID));
  if (!config || typeof config !== 'object') {
    throw new deps.DeployError(
      'display.dev deploy config is required to read access settings.',
      400,
    );
  }
  const accessSettings = await deps.fetchDisplayDevArtifactAccessSettings(
    config,
    displayDev.shortId.trim(),
  );
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

export interface RegisterDeploymentCheckRoutesDeps extends RouteDeps<
  'db' | 'http' | 'deploy' | 'projectStore'
> {
  authorizeProjectRequest: AuthorizeProjectRequest;
}

export function registerDeploymentCheckRoutes(
  app: Express,
  ctx: RegisterDeploymentCheckRoutesDeps,
) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { getProject, validateProjectPath } = ctx.projectStore;
  const {
    getDeploymentById,
    CLOUDFLARE_PAGES_PROVIDER_ID,
    DISPLAYDEV_PROVIDER_ID,
    DeployError,
    readDeployConfig,
    fetchDisplayDevArtifactAccessSettings,
    assertDisplayDevPreviewUrl,
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
          return sendApiError(
            res,
            404,
            'PROJECT_NOT_FOUND',
            'project not found',
          );
        }
        if (
          !(await ctx.authorizeProjectRequest(req, res, req.params.id, {
            mode: 'write',
            capability: 'writeFiles',
          }))
        )
          return;
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
        const responseBody = await withDeploymentOperationLock(
          deploymentOperationKey(
            req.params.id,
            validateProjectPath(existing.fileName),
            existing.providerId,
          ),
          async () => {
            const current = getDeploymentById(
              db,
              req.params.id,
              req.params.deploymentId,
            );
            if (!current) {
              throw new DeployError('deployment not found', 404);
            }
            if (current.providerId === DISPLAYDEV_PROVIDER_ID) {
              const displayDevConfig = await readDeployConfig(
                DISPLAYDEV_PROVIDER_ID,
              );
              const displayDevCheckUrl = assertDisplayDevPreviewUrl(
                displayDevConfig,
                current.url,
              );
              const displayDevMode = current.providerMetadata?.displayDev?.mode;
              if (displayDevMode === 'anonymous') {
                const checked = await checkDeploymentUrl(displayDevCheckUrl);
                const now = Date.now();
                /** @type {import('@open-design/contracts').CheckDeploymentLinkResponse} */
                const body = upsertDeployment(db, {
                  ...current,
                  status: checked.reachable
                    ? 'ready'
                    : checked.status || 'link-delayed',
                  statusMessage: checked.reachable
                    ? 'Public link is ready.'
                    : checked.statusMessage ||
                      'display.dev preview is not reachable.',
                  reachableAt: checked.reachable ? now : current.reachableAt,
                  updatedAt: now,
                });
                return publicDeployment(body, {
                  includeDisplayDevClaimUrl: true,
                });
              }
              const hydrated = await hydrateDisplayDevDeploymentAccess(
                current,
                {
                  DISPLAYDEV_PROVIDER_ID,
                  DeployError,
                  readDeployConfig,
                  fetchDisplayDevArtifactAccessSettings,
                  config: displayDevConfig,
                },
              );
              const checked = await checkDeploymentUrl(displayDevCheckUrl);
              const status = checked.reachable
                ? 'ready'
                : checked.statusCode === 401 || checked.statusCode === 403
                  ? 'protected'
                  : checked.status || 'link-delayed';
              const now = Date.now();
              /** @type {import('@open-design/contracts').CheckDeploymentLinkResponse} */
              const body = upsertDeployment(db, {
                ...hydrated,
                status,
                statusMessage: checked.reachable
                  ? 'Public link is ready.'
                  : status === 'protected'
                    ? 'Authentication is required to open this display.dev preview.'
                    : checked.statusMessage ||
                      'display.dev preview is not reachable.',
                reachableAt:
                  checked.reachable || status === 'protected'
                    ? now
                    : current.reachableAt,
                updatedAt: now,
              });
              return publicDeployment(body, {
                includeDisplayDevRecipients: true,
                includeDisplayDevClaimUrl: true,
              });
            }
            const stableCloudflareProjectName =
              current.providerId === CLOUDFLARE_PAGES_PROVIDER_ID
                ? cloudflarePagesProjectNameFromDeployment(current)
                : '';
            if (
              current.providerId === CLOUDFLARE_PAGES_PROVIDER_ID &&
              current.cloudflarePages?.pagesDev?.url
            ) {
              const checked =
                await checkCloudflarePagesDeploymentLinks(current);
              const now = Date.now();
              /** @type {import('@open-design/contracts').CheckDeploymentLinkResponse} */
              const body = upsertDeployment(db, {
                ...current,
                ...checked,
                reachableAt:
                  checked.status === 'ready' ? now : current.reachableAt,
                updatedAt: now,
              });
              return publicDeployment(body);
            }
            const checkUrl = stableCloudflareProjectName
              ? `https://${stableCloudflareProjectName}.pages.dev`
              : current.url;
            const result = await checkDeploymentUrl(checkUrl);
            const now = Date.now();
            /** @type {import('@open-design/contracts').CheckDeploymentLinkResponse} */
            const body = upsertDeployment(db, {
              ...current,
              url: checkUrl || current.url,
              status: result.reachable
                ? 'ready'
                : result.status || 'link-delayed',
              statusMessage: result.reachable
                ? 'Public link is ready.'
                : result.statusMessage ||
                  'Vercel is still preparing the public link.',
              reachableAt: result.reachable ? now : current.reachableAt,
              updatedAt: now,
            });
            return publicDeployment(body);
          },
        );
        res.setHeader('Cache-Control', 'no-store');
        res.json(responseBody);
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

function migrateLegacyDeploymentFileName(input: {
  db: unknown;
  projectId: string;
  providerId: string;
  normalizedFileName: string;
  listDeployments: (db: any, projectId: string) => any[];
  renameDeploymentFileName: (
    db: any,
    projectId: string,
    id: string,
    fileName: string,
  ) => any;
  validateProjectPath: (fileName: string) => string;
  DeployError: new (...args: any[]) => Error;
}) {
  const matches = input
    .listDeployments(input.db, input.projectId)
    .filter((deployment) => {
      if (deployment.providerId !== input.providerId) return false;
      try {
        return (
          input.validateProjectPath(deployment.fileName) ===
          input.normalizedFileName
        );
      } catch {
        return false;
      }
    });
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new input.DeployError(
      'Multiple deployments resolve to the same file path.',
      409,
      undefined,
      'CONFLICT',
    );
  }
  return input.renameDeploymentFileName(
    input.db,
    input.projectId,
    matches[0].id,
    input.normalizedFileName,
  );
}

function deployErrorCodeForStatus(
  status: number,
  options: { notFound?: ApiErrorCode } = {},
): ApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 409 || status === 412 || status === 428) return 'CONFLICT';
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
  const code =
    err && typeof err === 'object'
      ? (err as { code?: unknown }).code
      : undefined;
  if (isApiErrorCode(code)) return code;
  return deployErrorCodeForStatus(status, options);
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && API_ERROR_CODE_SET.has(value);
}

const deploymentOperationTails = new Map<string, Promise<void>>();

function deploymentOperationKey(
  projectId: string,
  fileName: string,
  providerId: string,
): string {
  return `${projectId}\n${fileName}\n${providerId}`;
}

async function withDeploymentOperationLock<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const predecessor = deploymentOperationTails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = predecessor.catch(() => undefined).then(() => gate);
  deploymentOperationTails.set(key, tail);
  await predecessor.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (deploymentOperationTails.get(key) === tail) {
      deploymentOperationTails.delete(key);
    }
  }
}

function displayDevConfigForRequest(
  savedConfig: Record<string, any>,
  selection: unknown,
  DeployError: new (...args: any[]) => Error,
) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    return savedConfig;
  }
  const authentication = (selection as { authentication?: unknown })
    .authentication;
  const saveDefaults = (selection as { saveDefaults?: unknown }).saveDefaults;
  if (saveDefaults !== undefined && typeof saveDefaults !== 'boolean') {
    throw new DeployError('display.dev saveDefaults must be a boolean.', 400);
  }
  // Use the draft defaults now, but persist them only after publish succeeds.
  const requestConfig = saveDefaults === true
    ? {
        ...savedConfig,
        displayDev: displayDevConfigPersistenceInput(selection, savedConfig).displayDev,
      }
    : savedConfig;
  if (authentication === undefined) return requestConfig;
  if (
    !authentication ||
    typeof authentication !== 'object' ||
    Array.isArray(authentication)
  ) {
    throw new DeployError('display.dev authentication must be an object.', 400);
  }
  const { mode, save } = authentication as { mode?: unknown; save?: unknown };
  if (save !== undefined && typeof save !== 'boolean') {
    throw new DeployError(
      'display.dev authentication save must be a boolean.',
      400,
    );
  }
  if (mode === 'anonymous') return { ...requestConfig, token: '' };
  if (mode === 'saved-key') {
    if (typeof savedConfig.token !== 'string' || !savedConfig.token.trim()) {
      throw new DeployError(
        'The saved display.dev API key was removed. Reload settings or enter an API key before publishing.',
        409,
        undefined,
        'CONFLICT',
      );
    }
    return requestConfig;
  }
  if (mode === 'api-key') {
    const { apiKey } = authentication as { apiKey?: unknown };
    if (typeof apiKey !== 'string' || !apiKey.trim()) {
      throw new DeployError(
        'display.dev authentication API key is required.',
        400,
      );
    }
    return { ...requestConfig, token: apiKey };
  }
  throw new DeployError(
    'display.dev authentication mode must be "anonymous", "saved-key", or "api-key".',
    400,
  );
}

function displayDevConfigPersistenceRequested(selection: unknown): boolean {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection))
    return false;
  const value = selection as {
    saveDefaults?: unknown;
    authentication?: { save?: unknown };
  };
  return value.saveDefaults === true || value.authentication?.save === true;
}

function displayDevConfigPersistenceInput(
  selection: unknown,
  effectiveConfig: Record<string, any>,
): Record<string, unknown> {
  const value = selection as {
    name?: unknown;
    saveDefaults?: unknown;
    authentication?: { mode?: unknown; save?: unknown };
  };
  const input: Record<string, unknown> = {};
  if (value.authentication?.save === true) {
    if (value.authentication.mode === 'anonymous') input.clearToken = true;
    else input.token = effectiveConfig.token;
  }
  if (value.saveDefaults === true) {
    input.displayDev = {
      defaultArtifactName:
        typeof value.name === 'string' ? value.name.trim() : '',
    };
  }
  return input;
}

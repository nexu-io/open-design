import type { Express } from 'express';
import type { RouteDeps } from './server-context.js';

export interface RegisterDeployRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'ids' | 'deploy' | 'projectStore'> {}

export function registerDeployRoutes(app: Express, ctx: RegisterDeployRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { PROJECTS_DIR } = ctx.paths;
  const { randomUUID } = ctx.ids;
  const { getProject } = ctx.projectStore;
  const { VERCEL_PROVIDER_ID, CLOUDFLARE_PAGES_PROVIDER_ID, isDeployProviderId, publicDeployConfigForProvider, readDeployConfig, writeDeployConfig, listCloudflarePagesZones, DeployError, listDeployments, publicDeployments, getDeployment, buildDeployFileSet, cloudflarePagesProjectNameForDeploy, deployToCloudflarePages, deployToVercel, upsertDeployment, publicDeployment, cloudflarePagesDeploymentMetadata, prepareDeployPreflight } = ctx.deploy;
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
      sendApiError(res, 500, 'INTERNAL_ERROR', String(err?.message || err));
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
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
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
      sendApiError(res, status, 'BAD_REQUEST', String(err?.message || err), init);
    }
  });

  app.get('/api/projects/:id/deployments', (req, res) => {
    try {
      /** @type {import('@open-design/contracts').ProjectDeploymentsResponse} */
      const body = { deployments: publicDeployments(listDeployments(db, req.params.id)) };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  app.post('/api/projects/:id/deploy', async (req, res) => {
    try {
      const { fileName, providerId = VERCEL_PROVIDER_ID, cloudflarePages } = req.body || {};
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

      const prior = getDeployment(db, req.params.id, fileName, providerId);
      const deployProject = getProject(db, req.params.id);
      const files = await buildDeployFileSet(
        PROJECTS_DIR,
        req.params.id,
        fileName,
        { metadata: deployProject?.metadata },
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
        target: 'preview',
        status: result.status,
        statusMessage: result.statusMessage,
        reachableAt: result.reachableAt,
        cloudflarePages: result.cloudflarePages,
        providerMetadata:
          providerId === CLOUDFLARE_PAGES_PROVIDER_ID
            ? (result.providerMetadata ?? cloudflarePagesDeploymentMetadata(cloudflarePagesProjectName))
            : prior?.providerMetadata,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
      });
      res.json(publicDeployment(body));
    } catch (err: any) {
      const status = err instanceof DeployError ? err.status : 400;
      const init =
        err instanceof DeployError && err.details
          ? { details: err.details }
          : {};
      sendApiError(
        res,
        status,
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
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
      /** @type {import('@open-design/contracts').DeployPreflightResponse} */
      const body = await prepareDeployPreflight(
        PROJECTS_DIR,
        req.params.id,
        fileName,
        { metadata: preflightProject?.metadata, providerId },
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
        status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST',
        String(err?.message || err),
      );
    }
  });

}

export interface RegisterDeploymentCheckRoutesDeps extends RouteDeps<'db' | 'http' | 'deploy'> {}

export function registerDeploymentCheckRoutes(app: Express, ctx: RegisterDeploymentCheckRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { getDeploymentById, CLOUDFLARE_PAGES_PROVIDER_ID, cloudflarePagesProjectNameFromDeployment, checkCloudflarePagesDeploymentLinks, checkDeploymentUrl, upsertDeployment, publicDeployment } = ctx.deploy;

  app.post(
    '/api/projects/:id/deployments/:deploymentId/check-link',
    async (req, res) => {
      try {
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
          return res.json(publicDeployment(body));
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
        res.json(publicDeployment(body));
      } catch (err: any) {
        sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
      }
    },
  );

}

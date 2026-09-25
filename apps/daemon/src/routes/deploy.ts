import type { Express } from 'express';
import type { RouteDeps } from '../server-context.js';
import type { AuthorizeProjectRequest } from '../collab/project-request-authority.js';
import { clientRequestIdFor } from '../http/client-request-id.js';
import { classifyDeployFailure } from '../deploy/failure-detail.js';
import { detachCloudflareWorkerDomain, getCloudflareWorkerDomain, isOwnedCustomDomain, listCloudflareZones, normalizeHostname, ownedCustomDomainsFromMetadata, pendingCustomDomainsFromMetadata, recordedCustomDomainFromMetadata, releasedCustomDomainsFromWorkersDeploy, resolveWorkerScriptName, retiredAccessAppIdFromWorkersDeploy, vouchedCustomDomains, type CloudflareOwnedCustomDomain } from '../deploy/cloudflare-workers.js';
import { getCloudflareAccessToken } from '../deploy.js';
import { proxyDispatcherRequestInit } from '../connectionTest.js';

export interface RegisterDeployRoutesDeps extends RouteDeps<'db' | 'http' | 'paths' | 'ids' | 'deploy' | 'projectStore'> {
  authorizeProjectRequest: AuthorizeProjectRequest;
}

// Resolve the live Cloudflare Workers credential for a route. In oauth mode a
// DeployError from the refresh (CFW_OAUTH_RECONNECT_REQUIRED, …) must reach the
// client as-is: swallowing it into "token required"/"not configured" tells an
// OAuth user to paste an API token.
async function resolveCloudflareWorkersRouteToken(config: { token?: string | undefined; credentialMode?: string | undefined }): Promise<string> {
  if (config.credentialMode === 'oauth') return getCloudflareAccessToken('cloudflare-workers');
  return config.token || '';
}

// Per-SCRIPT single-flight for Cloudflare Workers deploys: the provider's
// list-then-create steps (Access app, D1, R2) race when two deploys of the same
// Worker overlap (double-click, agent retry), and the loser fails after its
// script PUT is already live. The shared resource is the script name, not the
// project: the Workers config is global, so a `scriptName` override applies to
// every project, and two projects whose names slug identically also collide.
const cloudflareWorkersDeploysInFlight = new Map<string, Promise<unknown>>();
export function isCloudflareWorkersDeployInFlight(scriptName: string): boolean {
  return cloudflareWorkersDeploysInFlight.has(scriptName);
}
async function withCloudflareWorkersDeploySingleFlight<T>(scriptName: string, run: () => Promise<T>): Promise<T> {
  if (cloudflareWorkersDeploysInFlight.has(scriptName)) {
    throw new DeployErrorLike('A Cloudflare Workers deploy of "' + scriptName + '" is already in progress.', 409, 'DEPLOY_IN_PROGRESS');
  }
  const p = run();
  cloudflareWorkersDeploysInFlight.set(scriptName, p);
  try {
    return await p;
  } finally {
    cloudflareWorkersDeploysInFlight.delete(scriptName);
  }
}

type FailedDeployStep = { name?: unknown; status?: unknown; detail?: unknown };

/** The Access app id a failed Workers deploy created, if it got that far. The
 * provider annotates its DeployError with the step list it completed. */
function accessAppIdFromFailedWorkersDeploy(err: unknown): string | undefined {
  const steps = (err as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps)) return undefined;
  const step = (steps as FailedDeployStep[]).find(
    (s) => s?.name === 'access-app' && s?.status === 'done' && typeof s?.detail === 'string' && s.detail,
  );
  return step ? String(step.detail) : undefined;
}

/** The custom hostnames a failed Workers deploy attached before it failed. The
 * provider annotates its error with them (`attachedCustomDomains`); the same
 * normalizer that reads a record's ownership reads the annotation, so a
 * malformed entry is dropped rather than recorded. */
function attachedCustomDomainsFromFailedWorkersDeploy(err: unknown): CloudflareOwnedCustomDomain[] {
  const attached = (err as { attachedCustomDomains?: unknown } | null)?.attachedCustomDomains;
  if (!Array.isArray(attached)) return [];
  return ownedCustomDomainsFromMetadata({ ownedCustomDomains: attached });
}

/** The stale owned hostnames a Workers deploy detached (`detachedCustomDomains`
 * on the error of a failed deploy, or on the result metadata of a successful
 * one). Each of them is gone from Cloudflare, so no record may keep vouching
 * for it. */
function detachedCustomDomainsFromWorkersDeploy(source: unknown): CloudflareOwnedCustomDomain[] {
  const detached = (source as { detachedCustomDomains?: unknown } | null | undefined)?.detachedCustomDomains;
  if (!Array.isArray(detached)) return [];
  return ownedCustomDomainsFromMetadata({ ownedCustomDomains: detached });
}

/** Result metadata is persisted as the record's providerMetadata; the
 * bookkeeping a deploy reports for the ROUTE to act on (hostnames it detached,
 * the Access app it retired) is consumed here and must not be stored as if it
 * described the record. */
function persistableWorkersResultMetadata(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata;
  const { detachedCustomDomains: _detached, retiredAccessAppId: _retired, ...rest } = metadata as Record<string, unknown>;
  return rest;
}
class DeployErrorLike extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function registerDeployRoutes(app: Express, ctx: RegisterDeployRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { PROJECTS_DIR } = ctx.paths;
  const { randomUUID } = ctx.ids;
  const { getProject } = ctx.projectStore;
  const { VERCEL_PROVIDER_ID, CLOUDFLARE_PAGES_PROVIDER_ID, CLOUDFLARE_WORKERS_PROVIDER_ID, isDeployProviderId, publicDeployConfigForProvider, readDeployConfig, writeDeployConfig, listCloudflarePagesZones, DeployError, listDeployments, listDeploymentsByProvider, publicDeployments, getDeployment, buildDeployFileSet, cloudflarePagesProjectNameForDeploy, deployToCloudflarePages, deployToCloudflareWorkers, probeCloudflareWorkersCapabilities, deployToVercel, upsertDeployment, publicDeployment, cloudflarePagesDeploymentMetadata, prepareDeployPreflight } = ctx.deploy;

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
    (err instanceof DeployErrorLike && err.code) ||
    (status === 404 ? 'FILE_NOT_FOUND' : 'BAD_REQUEST');
  const deployErrorStatus = (err: any): number =>
    err instanceof DeployError || err instanceof DeployErrorLike ? err.status : 400;

  /** A Workers record's script name: the one it recorded at deploy time, else
   * (records written before `scriptName` was stored) resolved the way a deploy
   * resolves it — the configured override, else its project's name. */
  function workersRecordScriptName(
    record: { projectId: string; providerMetadata?: any },
    configuredScriptName: string | undefined,
  ): string {
    const recorded = record.providerMetadata?.scriptName;
    if (typeof recorded === 'string' && recorded) return recorded;
    const project = getProject(db, record.projectId);
    return resolveWorkerScriptName(configuredScriptName, project?.name || record.projectId);
  }

  /**
   * Ownership inputs for a Workers deploy, gathered from EVERY record of this
   * provider that deployed the same script — not only the (project, file)
   * record the deploy replaces. The Workers config is global: a `scriptName`
   * override (or two projects whose names slug identically) makes several
   * records share one Worker, and with it one Access app and one set of
   * attached hostnames. Read from a single record, a deploy of file B refuses
   * the Access app file A created (CFW_ACCESS_APP_FOREIGN) and classifies the
   * hostname A attached as foreign — never detached, never re-protected.
   *
   * The replaced record comes first so its ids win where records disagree;
   * every sibling's owned hostnames are unioned in.
   */
  function priorWorkersOwnershipForScript(input: {
    scriptName: string;
    configuredScriptName: string | undefined;
    prior: ReturnType<typeof getDeployment>;
  }): {
    priorAccessAppId: string | undefined;
    priorOwnedCustomDomains: CloudflareOwnedCustomDomain[];
    /** Write-ahead hostnames (see pendingCustomDomainsFromMetadata), unioned
     * across the same records; vouched for by hostname like owned ones. */
    priorPendingCustomDomains: string[];
    priorCustomDomain: Record<string, unknown> | undefined;
  } {
    const { prior } = input;
    const siblings = listDeploymentsByProvider(db, CLOUDFLARE_WORKERS_PROVIDER_ID)
      .filter((record: { id: string; projectId: string; providerMetadata?: any }) => {
        if (record.id === prior?.id) return false;
        try {
          return workersRecordScriptName(record, input.configuredScriptName) === input.scriptName;
        } catch (err) {
          // A record whose script name cannot be resolved (no recorded name and
          // a project whose name no longer slugs) cannot vouch for anything;
          // skip it rather than fail every deploy on one stale sibling.
          console.warn('[od] skipping Cloudflare Workers record with unresolvable script name', record.id, String((err as Error)?.message || err));
          return false;
        }
      });
    const records: Array<{ providerMetadata?: any }> = prior ? [prior, ...siblings] : siblings;
    let priorAccessAppId: string | undefined;
    let priorCustomDomain: Record<string, unknown> | undefined;
    const priorOwnedCustomDomains: CloudflareOwnedCustomDomain[] = [];
    const priorPendingCustomDomains: string[] = [];
    for (const record of records) {
      const metadata = record.providerMetadata;
      if (!priorAccessAppId && typeof metadata?.accessAppId === 'string' && metadata.accessAppId) {
        priorAccessAppId = metadata.accessAppId;
      }
      if (!priorCustomDomain) priorCustomDomain = recordedCustomDomainFromMetadata(metadata);
      for (const owned of ownedCustomDomainsFromMetadata(metadata)) {
        if (!priorOwnedCustomDomains.some((have) => have.hostname === owned.hostname && have.id === owned.id)) {
          priorOwnedCustomDomains.push(owned);
        }
      }
      for (const pending of pendingCustomDomainsFromMetadata(metadata)) {
        if (!priorPendingCustomDomains.includes(pending)) priorPendingCustomDomains.push(pending);
      }
    }
    return { priorAccessAppId, priorOwnedCustomDomains, priorPendingCustomDomains, priorCustomDomain };
  }

  /**
   * Write-ahead for a custom-domain attach. Runs (awaited) immediately BEFORE
   * the provider's attach call and persists the hostname as pending on the
   * (project, file) record, so a crash between the attach and the deploy's own
   * record write leaves a record that still vouches for the hostname. A pending
   * entry is cleared once real ownership lands (the deploy's success metadata
   * replaces the record; a failed deploy that reports the attach drops it) and
   * carried otherwise. Everything else on a prior record is preserved; a first
   * deploy leaves a `failed` placeholder the deploy overwrites on completion.
   * Throws when the write cannot land: an attach nobody can vouch for must not
   * happen, and nothing on Cloudflare has changed yet at this point.
   */
  function recordPendingWorkersCustomDomain(input: {
    projectId: string;
    fileName: string;
    target: 'preview' | 'production';
    scriptName: string;
    hostname: string;
  }): void {
    const hostname = normalizeHostname(input.hostname);
    if (!hostname) return;
    const live = getDeployment(db, input.projectId, input.fileName, CLOUDFLARE_WORKERS_PROVIDER_ID);
    const liveMetadata =
      live?.providerMetadata && typeof live.providerMetadata === 'object' && !Array.isArray(live.providerMetadata)
        ? (live.providerMetadata as Record<string, unknown>)
        : {};
    const pending = pendingCustomDomainsFromMetadata(liveMetadata);
    if (pending.includes(hostname)) return;
    const metadata: Record<string, unknown> = {
      ...liveMetadata,
      scriptName: input.scriptName,
      pendingCustomDomains: [...pending, hostname].map((entry) => ({ hostname: entry })),
    };
    const now = Date.now();
    upsertDeployment(db, {
      id: live?.id ?? randomUUID(),
      projectId: input.projectId,
      fileName: input.fileName,
      providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
      url: live?.url ?? '',
      deploymentId: live?.deploymentId,
      deploymentCount: live?.deploymentCount ?? 0,
      target: live?.target ?? input.target,
      status: live?.status ?? 'failed',
      statusMessage: live ? live.statusMessage : 'Cloudflare Workers deploy was interrupted before it finished.',
      reachableAt: live?.reachableAt,
      providerMetadata: metadata,
      createdAt: live?.createdAt ?? now,
      updatedAt: now,
    });
  }

  /**
   * After a detach, no Workers record may keep vouching for the hostname.
   * Ownership means "OpenDesign attached it", and that attachment is gone; a
   * record still listing it would classify a later dashboard re-attach of the
   * same hostname as owned — and the next deploy would detach it again. Every
   * record of the provider is scanned because the Workers config is global.
   * The displayed `customDomain` goes with it when it names that hostname.
   */
  function forgetDetachedWorkersHostname(domain: { id: string; hostname: string }): void {
    const sameDomain = (entry: { id?: string | undefined; hostname: string }): boolean =>
      (Boolean(domain.id) && entry.id === domain.id) || (Boolean(domain.hostname) && entry.hostname === domain.hostname);
    const records: Array<{
      id: string;
      projectId: string;
      fileName: string;
      url: string;
      deploymentId?: string | undefined;
      deploymentCount: number;
      target: 'preview' | 'production';
      status: string;
      statusMessage?: string | undefined;
      reachableAt?: number | undefined;
      providerMetadata?: unknown;
      createdAt: number;
    }> = listDeploymentsByProvider(db, CLOUDFLARE_WORKERS_PROVIDER_ID);
    for (const record of records) {
      const metadata = record.providerMetadata;
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) continue;
      const owned = ownedCustomDomainsFromMetadata(metadata);
      const remaining = owned.filter((entry) => !sameDomain(entry));
      const pending = pendingCustomDomainsFromMetadata(metadata);
      const remainingPending = pending.filter((hostname) => !sameDomain({ hostname }));
      const displayed = recordedCustomDomainFromMetadata(metadata);
      const dropDisplayed =
        displayed !== undefined &&
        sameDomain({
          id: displayed.id !== undefined && displayed.id !== null && String(displayed.id) ? String(displayed.id) : undefined,
          hostname: normalizeHostname(String(displayed.hostname)),
        });
      if (remaining.length === owned.length && remainingPending.length === pending.length && !dropDisplayed) continue;
      const next: Record<string, unknown> = { ...(metadata as Record<string, unknown>), ownedCustomDomains: remaining };
      if (remainingPending.length > 0) next.pendingCustomDomains = remainingPending.map((hostname) => ({ hostname }));
      else delete next.pendingCustomDomains;
      if (dropDisplayed) delete next.customDomain;
      upsertDeployment(db, {
        id: record.id,
        projectId: record.projectId,
        fileName: record.fileName,
        providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
        url: record.url,
        deploymentId: record.deploymentId,
        deploymentCount: record.deploymentCount,
        target: record.target,
        status: record.status,
        statusMessage: record.statusMessage,
        reachableAt: record.reachableAt,
        providerMetadata: next,
        createdAt: record.createdAt,
        updatedAt: Date.now(),
      });
    }
  }

  /**
   * After a prior Access app is deleted (Access turned off), no Workers record
   * may keep carrying its id: the record would report the Worker as protected
   * (`accessProtected`/`accessVerified`) by an app that no longer exists, and
   * the next deploy of that record would try to retire it again. Every record
   * of the provider is scanned because the Workers config is global — the
   * same app guarded every (project, file) that deployed the script.
   */
  function forgetRetiredWorkersAccessApp(accessAppId: string): void {
    if (!accessAppId) return;
    const records: Array<{
      id: string;
      projectId: string;
      fileName: string;
      url: string;
      deploymentId?: string | undefined;
      deploymentCount: number;
      target: 'preview' | 'production';
      status: string;
      statusMessage?: string | undefined;
      reachableAt?: number | undefined;
      providerMetadata?: unknown;
      createdAt: number;
    }> = listDeploymentsByProvider(db, CLOUDFLARE_WORKERS_PROVIDER_ID);
    for (const record of records) {
      const metadata = record.providerMetadata;
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) continue;
      if ((metadata as Record<string, unknown>).accessAppId !== accessAppId) continue;
      const { accessAppId: _id, accessProtected: _protected, accessVerified: _verified, createdByOpenDesign: _created, ...next } = metadata as Record<string, unknown>;
      upsertDeployment(db, {
        id: record.id,
        projectId: record.projectId,
        fileName: record.fileName,
        providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
        url: record.url,
        deploymentId: record.deploymentId,
        deploymentCount: record.deploymentCount,
        target: record.target,
        status: record.status,
        statusMessage: record.statusMessage,
        reachableAt: record.reachableAt,
        providerMetadata: next,
        createdAt: record.createdAt,
        updatedAt: Date.now(),
      });
    }
  }

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
      sendApiError(res, status, deployErrorCodeFor(err, status), String(err?.message || err), init);
    }
  });

  app.get('/api/deploy/cloudflare-workers/capabilities', async (_req, res) => {
    try {
      const config = await readDeployConfig(CLOUDFLARE_WORKERS_PROVIDER_ID);
      const empty = { workers: false, workersDevSubdomain: '', r2: false, d1: false, access: false, configured: false };
      if (!config?.accountId) {
        res.json(empty);
        return;
      }
      const token = await resolveCloudflareWorkersRouteToken(config);
      if (!token) {
        res.json(empty);
        return;
      }
      const caps = await probeCloudflareWorkersCapabilities({ token, accountId: config.accountId });
      res.json({ ...caps, configured: true });
    } catch (err: any) {
      const status = err instanceof DeployError ? err.status : 400;
      sendApiError(res, status, deployErrorCodeFor(err, status), String(err?.message || err));
    }
  });

  app.get('/api/deploy/cloudflare-workers/zones', async (_req, res) => {
    try {
      const config = await readDeployConfig(CLOUDFLARE_WORKERS_PROVIDER_ID);
      // `/zones?account.id=` (empty) lists every zone the token can see, across
      // accounts; a picked foreign zone then fails at attach. Require the account.
      if (!config.accountId) {
        return sendApiError(res, 400, 'CFW_ACCOUNT_ID_REQUIRED', 'Cloudflare account ID is required.');
      }
      const token = await resolveCloudflareWorkersRouteToken(config);
      if (!token) {
        res.json({ zones: [] });
        return;
      }
      const zones = await listCloudflareZones({ token, accountId: config.accountId });
      res.json({ zones });
    } catch (err: any) {
      const status = err instanceof DeployError ? err.status : 400;
      sendApiError(res, status, deployErrorCodeFor(err, status), String(err?.message || err));
    }
  });

  app.delete('/api/deploy/cloudflare-workers/domains/:domainId', async (req, res) => {
    try {
      const config = await readDeployConfig(CLOUDFLARE_WORKERS_PROVIDER_ID);
      if (!config.accountId) {
        return sendApiError(res, 400, 'CFW_ACCOUNT_ID_REQUIRED', 'Cloudflare account ID is required.');
      }
      // Mirror the capabilities/zones token resolution: oauth refreshes the
      // rotating access token, token mode reads the configured static token.
      const token = await resolveCloudflareWorkersRouteToken(config);
      if (!token) {
        return sendApiError(res, 400, 'CFW_TOKEN_REQUIRED', 'Cloudflare API token is required.');
      }
      // One proxy dispatcher for both Cloudflare calls of this request, the
      // same one the OAuth connect/refresh/revoke ride (routes/cloudflare.ts).
      const proxyDispatcher = proxyDispatcherRequestInit(process.env);
      try {
        const cfg = { token, accountId: config.accountId, requestInit: proxyDispatcher.requestInit };
        // Ownership check: the domain id is client-supplied, and the token can
        // reach every custom domain in the account. Detach ONLY a hostname that
        // Cloudflare routes to the OpenDesign script (the same resolution the
        // deploy performs: the configured override, else the project's name).
        const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
        const project = projectId ? getProject(db, projectId) : null;
        const scriptName = resolveWorkerScriptName(config.scriptName || undefined, project?.name || projectId);
        const domain = await getCloudflareWorkerDomain(cfg, req.params.domainId);
        if (!domain) {
          res.json({ ok: true, deleted: false });
          return;
        }
        if (domain.service !== scriptName) {
          return sendApiError(
            res,
            409,
            'CFW_DOMAIN_FOREIGN',
            'Custom domain "' + (domain.hostname || domain.id) + '" is routed to the Worker "' + domain.service + '", not to "' + scriptName + '"; refusing to detach it.',
          );
        }
        // Same ownership rule as the deploy's reconcile: only a hostname a prior
        // OpenDesign deployment attached (recorded on its providerMetadata) may
        // be detached here. A hostname someone routed to the script from the
        // dashboard is theirs — refusing is the only safe answer for a
        // client-supplied id. The Workers config is global, so every record of
        // this provider counts, not just the requesting project's.
        // A hostname a deploy wrote ahead of its attach (pending) is vouched for
        // by hostname: the attach may have landed even though its record never did.
        const owned = listDeploymentsByProvider(db, CLOUDFLARE_WORKERS_PROVIDER_ID)
          .flatMap((deployment: { providerMetadata?: unknown }) =>
            vouchedCustomDomains(ownedCustomDomainsFromMetadata(deployment.providerMetadata), pendingCustomDomainsFromMetadata(deployment.providerMetadata)));
        if (!isOwnedCustomDomain(domain, owned)) {
          return sendApiError(
            res,
            409,
            'CFW_DOMAIN_FOREIGN',
            'Custom domain "' + (domain.hostname || domain.id) + '" was not attached by an OpenDesign deployment; refusing to detach it. Remove it in the Cloudflare dashboard instead.',
          );
        }
        const deleted = await detachCloudflareWorkerDomain(cfg, req.params.domainId);
        forgetDetachedWorkersHostname(domain);
        res.json(deleted ? { ok: true } : { ok: true, deleted: false });
      } finally {
        await proxyDispatcher.close();
      }
    } catch (err: any) {
      const status = err instanceof DeployError ? err.status : 400;
      sendApiError(res, status, deployErrorCodeFor(err, status), String(err?.message || err));
    }
  });

  app.get('/api/projects/:id/deployments', async (req, res) => {
    try {
      if (!getProject(db, req.params.id)) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!await ctx.authorizeProjectRequest(req, res, req.params.id, { mode: 'read' })) return;
      /** @type {import('@open-design/contracts').ProjectDeploymentsResponse} */
      const body = { deployments: publicDeployments(listDeployments(db, req.params.id)) };
      res.json(body);
    } catch (err: any) {
      sendApiError(res, 400, 'BAD_REQUEST', String(err?.message || err));
    }
  });

  // Invariant: a Cloudflare resource OpenDesign created or attached is always
  // recorded as owned, even when the deploy that did so fails afterwards.
  //
  // - The Access app (created before the script PUT; the deploy can still fail
  //   on the custom-domain attach, the perimeter HEAD on a hostname whose
  //   certificate is still issuing, a 429-exhausted workers.dev enable).
  //   Without the record the next deploy finds an app it does not "own" and
  //   refuses with CFW_ACCESS_APP_FOREIGN forever, and turning Access off never
  //   retires it — the site stays gated by an app the UI says does not exist.
  // - The custom hostname (attached after the script PUT; the deploy can still
  //   fail on a stale-hostname detach, the final Access PUT, the perimeter
  //   HEAD). Without the record the hostname is routed to the script but
  //   classified FOREIGN: a later config change never detaches it and the
  //   detach route refuses it with CFW_DOMAIN_FOREIGN — the user's dropped
  //   hostname keeps serving the site with no way to remove it here.
  //
  // A prior record keeps its live URL/status and only gains the ids; a first
  // deploy leaves a `failed` record carrying them. Ownership only grows here:
  // a failed deploy detaches nothing it can vouch for, so every hostname the
  // prior record owned stays owned.
  function recordOwnedResourcesFromFailedWorkersDeploy(input: {
    projectId: string;
    fileName: string;
    target: 'preview' | 'production';
    prior: ReturnType<typeof getDeployment>;
    /** The script the failed attempt deployed to; recorded so the sibling
     * scan (workersRecordScriptName) matches this record without having to
     * re-resolve it from a project that may since be renamed or gone. */
    scriptName: string;
    err: unknown;
  }): void {
    const accessAppId = accessAppIdFromFailedWorkersDeploy(input.err);
    const attachedCustomDomains = attachedCustomDomainsFromFailedWorkersDeploy(input.err);
    const releasedCustomDomains = releasedCustomDomainsFromWorkersDeploy(input.err);
    if (!accessAppId && attachedCustomDomains.length === 0 && releasedCustomDomains.length === 0) return;
    const { prior } = input;
    // The record may have moved on since `prior` was read: the attach
    // write-ahead (recordPendingWorkersCustomDomain) lands on it mid-deploy.
    // Metadata merges from the LIVE record so that write-ahead is not undone;
    // status/url/message still come from `prior`, the state before this
    // attempt, so a placeholder the write-ahead created does not mask the
    // real failure message.
    const live = getDeployment(db, input.projectId, input.fileName, CLOUDFLARE_WORKERS_PROVIDER_ID) ?? prior;
    const priorMetadata =
      live?.providerMetadata && typeof live.providerMetadata === 'object' && !Array.isArray(live.providerMetadata)
        ? live.providerMetadata
        : {};
    const priorOwned = ownedCustomDomainsFromMetadata(priorMetadata);
    const newlyOwned = attachedCustomDomains.filter(
      (attached) => !priorOwned.some((owned) => owned.hostname === attached.hostname && owned.id === attached.id),
    );
    // Real ownership landed for an attached hostname: its write-ahead is done.
    // A hostname the deploy is certain is NOT attached (a 4xx-refused attach,
    // an attach it withdrew again) has nothing to vouch for: its write-ahead
    // goes too. An ambiguous failure (5xx, transport) is not released by the
    // provider, so its write-ahead stays until a later deploy reconciles it.
    const pending = pendingCustomDomainsFromMetadata(priorMetadata);
    const remainingPending = pending.filter(
      (hostname) => !attachedCustomDomains.some((attached) => attached.hostname === hostname) && !releasedCustomDomains.includes(hostname),
    );
    const resolvesPending = remainingPending.length !== pending.length;
    const gainsAccessApp = Boolean(accessAppId) && priorMetadata.accessAppId !== accessAppId;
    if (!gainsAccessApp && newlyOwned.length === 0 && !resolvesPending) return;
    const metadata: Record<string, unknown> = { ...priorMetadata, scriptName: input.scriptName };
    if (gainsAccessApp) Object.assign(metadata, { accessAppId, accessProtected: true, createdByOpenDesign: true });
    if (newlyOwned.length > 0) metadata.ownedCustomDomains = [...priorOwned, ...newlyOwned];
    if (resolvesPending) {
      if (remainingPending.length > 0) metadata.pendingCustomDomains = remainingPending.map((hostname) => ({ hostname }));
      else delete metadata.pendingCustomDomains;
    }
    const now = Date.now();
    try {
      upsertDeployment(db, {
        id: live?.id ?? prior?.id ?? randomUUID(),
        projectId: input.projectId,
        fileName: input.fileName,
        providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
        url: prior?.url ?? '',
        deploymentId: prior?.deploymentId,
        deploymentCount: prior?.deploymentCount ?? 0,
        target: prior?.target ?? input.target,
        status: prior?.status ?? 'failed',
        statusMessage: prior ? prior.statusMessage : String((input.err as Error)?.message || input.err),
        reachableAt: prior?.reachableAt,
        providerMetadata: metadata,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
      });
    } catch (persistErr) {
      console.warn('[od] could not record Cloudflare resources owned by a failed deploy', String((persistErr as Error)?.message || persistErr));
    }
  }

  app.post('/api/projects/:id/deploy', async (req, res) => {
    const startedAt = Date.now();
    let stage: 'file_plan' | 'provider' = 'file_plan';
    try {
      const { fileName, providerId = VERCEL_PROVIDER_ID, cloudflarePages, target: rawTarget } = req.body || {};
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

      // The Workers config and script name are resolved BEFORE any record is
      // read: the single-flight guard is keyed on the script name, and the
      // prior record, the ownership scan, and the record upsert (success AND
      // failure) all run INSIDE it. Read outside the lock, a concurrent deploy
      // of the same script would gather ownership before the winner recorded
      // its Access app / hostnames, then overwrite the winner's record with
      // that stale view once the lock was released.
      const workersConfig = providerId === CLOUDFLARE_WORKERS_PROVIDER_ID
        ? await readDeployConfig(CLOUDFLARE_WORKERS_PROVIDER_ID)
        : undefined;
      const workersScriptName = providerId === CLOUDFLARE_WORKERS_PROVIDER_ID
        ? resolveWorkerScriptName(workersConfig?.scriptName || undefined, deployProject.name || req.params.id)
        : '';
      const runDeploy = async () => {
        const prior = getDeployment(db, req.params.id, fileName, providerId);
        // Held so a failed Workers deploy can persist the Access app / hostnames
        // it created (see the invariant above) while the lock is still ours.
        const workersFailureContext = providerId === CLOUDFLARE_WORKERS_PROVIDER_ID
          ? { projectId: req.params.id, fileName, target, prior, scriptName: workersScriptName }
          : null;
        try {
          const files = await buildDeployFileSet(
            PROJECTS_DIR,
            req.params.id,
            fileName,
            { metadata: deployProject?.metadata, includeProjectFiles: true },
          );
          const project = getProject(db, req.params.id);
          stage = 'provider';
          const cloudflarePagesProjectName =
            providerId === CLOUDFLARE_PAGES_PROVIDER_ID
              ? cloudflarePagesProjectNameForDeploy(db, req.params.id, project?.name, prior)
              : '';
          // Ownership is answered per SCRIPT, across every record that deployed it
          // (see priorWorkersOwnershipForScript), not per (project, file) record.
          const workersOwnership = providerId === CLOUDFLARE_WORKERS_PROVIDER_ID
            ? priorWorkersOwnershipForScript({
                scriptName: workersScriptName,
                configuredScriptName: workersConfig?.scriptName || undefined,
                prior,
              })
            : null;
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
            : providerId === CLOUDFLARE_WORKERS_PROVIDER_ID
              ? await deployToCloudflareWorkers({
                  config: workersConfig!,
                  files,
                  projectId: req.params.id,
                  projectName: project?.name,
                  target,
                  customDomain: workersConfig?.customDomain,
                  access: workersConfig?.access,
                  priorAccessAppId: workersOwnership?.priorAccessAppId,
                  priorOwnedCustomDomains: workersOwnership?.priorOwnedCustomDomains,
                  priorPendingCustomDomains: workersOwnership?.priorPendingCustomDomains,
                  priorCustomDomain: workersOwnership?.priorCustomDomain,
                  // Write-ahead: the hostname is on the record as pending
                  // before the attach call goes out (see the invariant above).
                  onBeforeAttach: (hostname: string) =>
                    recordPendingWorkersCustomDomain({
                      projectId: req.params.id,
                      fileName,
                      target,
                      scriptName: workersScriptName,
                      hostname,
                    }),
                  // Re-resolved per Cloudflare call (oauth: refreshed within the
                  // expiry skew), so a multi-minute deploy never outlives its token.
                  tokenProvider: () => resolveCloudflareWorkersRouteToken(workersConfig!),
                })
              : await deployToVercel({
                  config: await readDeployConfig(VERCEL_PROVIDER_ID),
                  files,
                  projectId: req.params.id,
                });
          if (providerId === CLOUDFLARE_WORKERS_PROVIDER_ID) {
            // A successful deploy detaches the stale owned hostnames and, with
            // Access off, deletes the prior Access app. The record written
            // below only describes THIS (project, file); a sibling record of
            // the same script would keep vouching for a detached hostname or
            // reporting the deleted app as protection — settle them first.
            for (const detached of detachedCustomDomainsFromWorkersDeploy(result.providerMetadata)) {
              forgetDetachedWorkersHostname({ id: detached.id ?? '', hostname: detached.hostname });
            }
            const retiredAccessAppId = retiredAccessAppIdFromWorkersDeploy(result.providerMetadata);
            if (retiredAccessAppId) forgetRetiredWorkersAccessApp(retiredAccessAppId);
          }
          const now = Date.now();
          /** @type {import('@open-design/contracts').DeployProjectFileResponse} */
          return upsertDeployment(db, {
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
            // providerMetadata is stripped by publicDeployment; the db's
            // normalizeDeployment lifts the Workers result (accessProtected/steps/
            // check/customDomain) into `cloudflareWorkers`, which is what reaches
            // the client from both this response and the deployments list.
            providerMetadata:
              providerId === CLOUDFLARE_PAGES_PROVIDER_ID
                ? (result.providerMetadata ?? cloudflarePagesDeploymentMetadata(cloudflarePagesProjectName))
                : providerId === CLOUDFLARE_WORKERS_PROVIDER_ID
                  ? persistableWorkersResultMetadata(result.providerMetadata)
                  : prior?.providerMetadata,
            createdAt: prior?.createdAt ?? now,
            updatedAt: now,
          });
        } catch (err) {
          if (workersFailureContext) {
            recordOwnedResourcesFromFailedWorkersDeploy({ ...workersFailureContext, err });
            // A stale hostname this attempt detached is gone from Cloudflare;
            // no record may keep vouching for it. Runs AFTER the ownership
            // record above, which re-writes the prior owned list wholesale.
            for (const detached of detachedCustomDomainsFromWorkersDeploy(err)) {
              forgetDetachedWorkersHostname({ id: detached.id ?? '', hostname: detached.hostname });
            }
            // The prior Access app this attempt deleted (Access off) is gone
            // even though the deploy failed afterwards; no record may keep
            // reporting it as the Worker's protection.
            const retiredAccessAppId = retiredAccessAppIdFromWorkersDeploy(err);
            if (retiredAccessAppId) forgetRetiredWorkersAccessApp(retiredAccessAppId);
          }
          throw err;
        }
      };
      // The single-flight guard for Workers is keyed on the resolved script name
      // (the same resolution the provider performs) and armed before the prior
      // record is read, so the loser is refused up front — before it can read
      // stale ownership or write a record — instead of after its script PUT.
      const body = providerId === CLOUDFLARE_WORKERS_PROVIDER_ID
        ? await withCloudflareWorkersDeploySingleFlight(workersScriptName, runDeploy)
        : await runDeploy();
      res.json(publicDeployment(body));
    } catch (err: any) {
      const status = deployErrorStatus(err);
      const code = deployErrorCodeFor(err, status);
      const failure = classifyDeployFailure(stage, err, err instanceof DeployError || err instanceof DeployErrorLike);
      const requestId = clientRequestIdFor(req);
      // Structured companion to the response: automatic diagnostics bundles
      // include the daemon log, and `requestId` joins it to the client event.
      console.warn('[od] deploy failure', JSON.stringify({
        providerId: typeof req.body?.providerId === 'string' ? req.body.providerId : VERCEL_PROVIDER_ID,
        status,
        errorCode: code,
        ...failure,
        ...(requestId ? { requestId } : {}),
        durationMs: Math.max(0, Date.now() - startedAt),
      }));
      const init =
        err instanceof DeployError && err.details
          ? { details: err.details, failure }
          : { failure };
      sendApiError(
        res,
        status,
        code,
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
        { metadata: preflightProject?.metadata, providerId, includeProjectFiles: true },
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

export interface RegisterDeploymentCheckRoutesDeps extends RouteDeps<'db' | 'http' | 'deploy' | 'projectStore'> {
  authorizeProjectRequest: AuthorizeProjectRequest;
}

export function registerDeploymentCheckRoutes(app: Express, ctx: RegisterDeploymentCheckRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { getProject } = ctx.projectStore;
  const { getDeploymentById, CLOUDFLARE_PAGES_PROVIDER_ID, cloudflarePagesProjectNameFromDeployment, checkCloudflarePagesDeploymentLinks, checkDeploymentUrl, upsertDeployment, publicDeployment } = ctx.deploy;

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

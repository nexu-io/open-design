import fs from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash as blake3Hash } from 'blake3-wasm';
import { readProjectFile, validateProjectPath } from './projects.js';

export const VERCEL_PROVIDER_ID = 'vercel-self';
export const CLOUDFLARE_PAGES_PROVIDER_ID = 'cloudflare-pages';
export const SAVED_TOKEN_MASK = 'saved-vercel-token';
export const SAVED_CLOUDFLARE_TOKEN_MASK = 'saved-cloudflare-token';

type JsonObject = Record<string, any>;
type DeployProviderId = typeof VERCEL_PROVIDER_ID | typeof CLOUDFLARE_PAGES_PROVIDER_ID;
type DeployErrorDetails = JsonObject | string | undefined;
type DeployConfig = {
  token: string;
  teamId?: string | undefined;
  teamSlug?: string | undefined;
  accountId?: string | undefined;
  projectName?: string | undefined;
  cloudflarePages?: CloudflarePagesConfigHints | undefined;
};
type CloudflarePagesConfigHints = {
  lastZoneId?: string;
  lastZoneName?: string;
  lastDomainPrefix?: string;
};
type DeployFile = { file: string; data: Buffer | Uint8Array | string; contentType?: string; sourcePath?: string };
type DeployFilePlan = { entryPath: string; html: string; files: DeployFile[]; missing: string[]; invalid: string[] };
type DeployOptions = { metadata?: unknown; hookScriptUrl?: string; providerId?: DeployProviderId };
type CloudflarePagesDeploySelection = { zoneId: string; zoneName: string; domainPrefix: string; hostname: string };
type CloudflareDnsRecord = JsonObject & { id?: string; type?: string; name?: string; content?: string; comment?: string };
type DeployLinkStatus = 'ready' | 'protected' | 'failed' | 'link-delayed';
type DeploymentUrlCheck = { reachable: boolean; status?: DeployLinkStatus; statusCode?: number; statusMessage?: string };
type MaybeJsonObject = JsonObject | null | undefined;

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

const VERCEL_API = 'https://api.vercel.com';
const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
const CLOUDFLARE_API_PAGE_SIZE = 100;
const CLOUDFLARE_API_MAX_PAGES = 100;
export const CLOUDFLARE_PAGES_ASSET_UPLOAD_MAX_FILES = 100;
export const CLOUDFLARE_PAGES_ASSET_UPLOAD_MAX_BODY_BYTES = 75 * 1024 * 1024;
export const CLOUDFLARE_PAGES_ASSET_MAX_BYTES = 25 * 1024 * 1024;
const VERCEL_PROTECTED_MESSAGE =
  'Deployment is protected by Vercel. Disable Deployment Protection or use a custom domain to make this link public.';

export class DeployError extends Error {
  status: number;
  details: DeployErrorDetails;
  code?: string | undefined;

  constructor(message: string, status = 400, details: DeployErrorDetails = undefined, code?: string) {
    super(message);
    this.name = 'DeployError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

export function deployConfigPath(providerId: DeployProviderId = VERCEL_PROVIDER_ID) {
  const base = process.env.OD_USER_STATE_DIR || path.join(os.homedir(), '.open-design');
  return path.join(base, providerId === CLOUDFLARE_PAGES_PROVIDER_ID ? 'cloudflare-pages.json' : 'vercel.json');
}

export async function readVercelConfig(): Promise<DeployConfig> {
  try {
    const raw = await readFile(deployConfigPath(VERCEL_PROVIDER_ID), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      token: typeof parsed.token === 'string' ? parsed.token : '',
      teamId: typeof parsed.teamId === 'string' ? parsed.teamId : '',
      teamSlug: typeof parsed.teamSlug === 'string' ? parsed.teamSlug : '',
    };
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return { token: '', teamId: '', teamSlug: '' };
    throw err;
  }
}

export async function readCloudflarePagesConfig(): Promise<DeployConfig> {
  try {
    const raw = await readFile(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      token: typeof parsed.token === 'string' ? parsed.token : '',
      accountId: typeof parsed.accountId === 'string' ? parsed.accountId : '',
      projectName: typeof parsed.projectName === 'string' ? parsed.projectName : '',
      cloudflarePages: normalizeCloudflarePagesConfigHints(parsed.cloudflarePages),
    };
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return { token: '', accountId: '', projectName: '', cloudflarePages: {} };
    throw err;
  }
}

export async function writeVercelConfig(input: Partial<DeployConfig>) {
  const current = await readVercelConfig();
  const tokenInput = typeof input?.token === 'string' ? input.token.trim() : '';
  const next = {
    token:
      tokenInput && tokenInput !== SAVED_TOKEN_MASK
        ? tokenInput
        : current.token,
    teamId: typeof input?.teamId === 'string' ? input.teamId.trim() : current.teamId,
    teamSlug:
      typeof input?.teamSlug === 'string' ? input.teamSlug.trim() : current.teamSlug,
  };
  await writeDeployConfigFile(deployConfigPath(VERCEL_PROVIDER_ID), next);
  return publicDeployConfig(next);
}

export async function writeCloudflarePagesConfig(input: Partial<DeployConfig>) {
  const current = await readCloudflarePagesConfig();
  const tokenInput = typeof input?.token === 'string' ? input.token.trim() : '';
  const cloudflarePages = normalizeCloudflarePagesConfigHints(input?.cloudflarePages, current.cloudflarePages);
  const next: DeployConfig = {
    token:
      tokenInput && tokenInput !== SAVED_CLOUDFLARE_TOKEN_MASK
        ? tokenInput
        : current.token,
    accountId: typeof input?.accountId === 'string' ? input.accountId.trim() : current.accountId,
    // Legacy installs may already have a saved Cloudflare Pages projectName.
    // New writes intentionally stop treating it as user configuration: the
    // deploy route derives a Pages project name from the current OD project,
    // mirroring Vercel's automatic `od-${projectId}` deployment name.
    projectName: '',
  };
  if (Object.keys(cloudflarePages).length > 0) next.cloudflarePages = cloudflarePages;
  if (!next.token) throw new DeployError('Cloudflare API token is required.', 400);
  if (!next.accountId) throw new DeployError('Cloudflare account ID is required.', 400);
  await writeDeployConfigFile(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID), next);
  return publicCloudflarePagesConfig(next);
}

async function writeDeployConfigFile(file: string, config: DeployConfig) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // Best effort on filesystems that do not support chmod.
  }
}

export function publicDeployConfig(config: Partial<DeployConfig>) {
  return {
    providerId: VERCEL_PROVIDER_ID,
    configured: Boolean(config?.token),
    tokenMask: config?.token ? SAVED_TOKEN_MASK : '',
    teamId: config?.teamId || '',
    teamSlug: config?.teamSlug || '',
    target: 'preview',
  };
}

export function publicCloudflarePagesConfig(config: Partial<DeployConfig>) {
  const cloudflarePages = normalizeCloudflarePagesConfigHints(config?.cloudflarePages);
  const body: JsonObject = {
    providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
    configured: Boolean(config?.token && config?.accountId),
    tokenMask: config?.token ? SAVED_CLOUDFLARE_TOKEN_MASK : '',
    teamId: '',
    teamSlug: '',
    accountId: config?.accountId || '',
    projectName: config?.projectName || '',
    target: 'preview',
  };
  if (Object.keys(cloudflarePages).length > 0) body.cloudflarePages = cloudflarePages;
  return body;
}

export async function readDeployConfig(providerId: DeployProviderId = VERCEL_PROVIDER_ID) {
  if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID) return readCloudflarePagesConfig();
  return readVercelConfig();
}

export async function writeDeployConfig(providerId: DeployProviderId = VERCEL_PROVIDER_ID, input: Partial<DeployConfig> = {}) {
  if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID) return writeCloudflarePagesConfig(input);
  return writeVercelConfig(input);
}

export function publicDeployConfigForProvider(providerId: DeployProviderId = VERCEL_PROVIDER_ID, config: Partial<DeployConfig> = {}) {
  if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID) return publicCloudflarePagesConfig(config);
  return publicDeployConfig(config);
}

export function isDeployProviderId(value: unknown): value is DeployProviderId {
  return value === VERCEL_PROVIDER_ID || value === CLOUDFLARE_PAGES_PROVIDER_ID;
}

function normalizeCloudflarePagesConfigHints(input: unknown, fallback: CloudflarePagesConfigHints = {}): CloudflarePagesConfigHints {
  const hasSource = Boolean(input && typeof input === 'object');
  const source = (hasSource ? input : {}) as CloudflarePagesConfigHints;
  const prior = (!hasSource && fallback && typeof fallback === 'object' ? fallback : {}) as CloudflarePagesConfigHints;
  const lastZoneId =
    typeof source.lastZoneId === 'string'
      ? source.lastZoneId.trim()
      : typeof prior.lastZoneId === 'string'
        ? prior.lastZoneId.trim()
        : '';
  const lastZoneName =
    typeof source.lastZoneName === 'string'
      ? normalizeCloudflareZoneName(source.lastZoneName)
      : typeof prior.lastZoneName === 'string'
        ? normalizeCloudflareZoneName(prior.lastZoneName)
        : '';
  const lastDomainPrefix =
    typeof source.lastDomainPrefix === 'string'
      ? normalizeCloudflareDomainPrefix(source.lastDomainPrefix)
      : typeof prior.lastDomainPrefix === 'string'
        ? normalizeCloudflareDomainPrefix(prior.lastDomainPrefix)
        : '';
  return {
    ...(lastZoneId ? { lastZoneId } : {}),
    ...(lastZoneName ? { lastZoneName } : {}),
    ...(lastDomainPrefix ? { lastDomainPrefix } : {}),
  };
}

// Walk the entry HTML and any referenced CSS, producing the full set of
// files that would be uploaded for a deploy along with the lists of
// missing and invalid references. Does not throw on a partial result so
// callers can distinguish between "ready to ship" and "ready except for
// these specific issues" without parsing an error string.
export async function buildDeployFilePlan(projectsRoot: string, projectId: string, entryName: string, options: DeployOptions = {}): Promise<DeployFilePlan> {
  const entryPath = validateProjectPath(entryName);
  if (!/\.html?$/i.test(entryPath)) {
    throw new DeployError('Only HTML files can be deployed.', 400);
  }

  const entry = await readProjectFile(projectsRoot, projectId, entryPath, options.metadata);
  const html = entry.buffer.toString('utf8');
  const entryBase = path.posix.dirname(entryPath);
  const deployHtml = injectDeployHookScript(
    rewriteEntryHtmlReferences(html, entryBase),
    options.hookScriptUrl ?? process.env.OD_DEPLOY_HOOK_SCRIPT_URL,
  );
  const files = new Map<string, DeployFile>();
  files.set('index.html', {
    file: 'index.html',
    data: Buffer.from(deployHtml, 'utf8'),
    contentType: entry.mime,
    sourcePath: entryPath,
  });

  const visited = new Set<string>([entryPath]);
  const missing: string[] = [];
  const invalid: string[] = [];
  const pending: { ref: string; base: string }[] = extractHtmlReferences(html).map((ref) => ({
    ref,
    base: entryBase,
  }));

  // Inline `<style>` blocks and `style="..."` attributes can reference
  // background images, custom fonts, and stylesheets via @import. They
  // are resolved relative to the entry HTML, same as src/href.
  for (const ref of extractInlineCssReferences(html)) {
    pending.push({ ref, base: entryBase });
  }

  const supportingFiles = 'supportingFiles' in (entry.artifactManifest ?? {})
    ? ((entry.artifactManifest as { supportingFiles?: string[] }).supportingFiles ?? [])
    : [];
  for (const manifestRef of supportingFiles) {
    pending.push({ ref: manifestRef, base: entryBase });
  }

  while (pending.length > 0) {
    const item = pending.shift();
    if (!item) break;
    const resolved = resolveReferencedPath(item.ref, item.base);
    if (!resolved) continue;
    let safePath;
    try {
      safePath = validateProjectPath(resolved);
    } catch {
      invalid.push(item.ref);
      continue;
    }
    if (safePath === entryPath || visited.has(safePath)) continue;
    visited.add(safePath);

    let projectFile;
    try {
      projectFile = await readProjectFile(projectsRoot, projectId, safePath, options.metadata);
    } catch (err) {
      if (isErrnoException(err) && err.code === 'ENOENT') {
        missing.push(safePath);
        continue;
      }
      invalid.push(safePath);
      continue;
    }

    files.set(safePath, {
      file: safePath,
      data: projectFile.buffer,
      contentType: projectFile.mime,
      sourcePath: safePath,
    });

    if (/\.css$/i.test(safePath)) {
      const cssBase = path.posix.dirname(safePath);
      for (const ref of extractCssReferences(projectFile.buffer.toString('utf8'))) {
        pending.push({ ref, base: cssBase });
      }
    }
  }

  return {
    entryPath,
    html,
    files: Array.from(files.values()),
    missing,
    invalid,
  };
}

export async function buildDeployFileSet(projectsRoot: string, projectId: string, entryName: string, options: DeployOptions = {}) {
  const plan = await buildDeployFilePlan(projectsRoot, projectId, entryName, options);
  if (plan.missing.length || plan.invalid.length) {
    const parts = [];
    if (plan.missing.length) parts.push(`missing: ${plan.missing.join(', ')}`);
    if (plan.invalid.length) parts.push(`invalid: ${plan.invalid.join(', ')}`);
    throw new DeployError(`Could not deploy referenced files (${parts.join('; ')}).`, 400, {
      missing: plan.missing,
      invalid: plan.invalid,
    });
  }
  return plan.files;
}

export async function deployToVercel({ config, files, projectId }: { config: DeployConfig; files: DeployFile[]; projectId: string }) {
  if (!config?.token) {
    throw new DeployError('Vercel token is required.', 400);
  }

  const createResp = await fetch(`${VERCEL_API}/v13/deployments${vercelTeamQuery(config)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: safeVercelProjectName(`od-${projectId}`),
      files: files.map((f) => ({
        file: f.file,
        data: Buffer.from(f.data).toString('base64'),
        encoding: 'base64',
      })),
      projectSettings: { framework: null },
    }),
  });

  const created = await readVercelJson(createResp);
  if (!createResp.ok) throw vercelError(created, createResp.status);

  const deploymentId = created.id || created.uid;
  const initialUrl = deploymentUrl(created);
  const ready = deploymentId
    ? await pollVercelDeployment(config, deploymentId)
    : created;
  if (ready?.readyState === 'ERROR') {
    throw new DeployError(ready?.error?.message || 'Vercel deployment failed.', 502, ready);
  }

  const candidates = deploymentUrlCandidates(ready, created);
  const link = await waitForReachableDeploymentUrl(
    candidates.length ? candidates : [initialUrl],
    { providerLabel: 'Vercel' },
  );

  return {
    providerId: VERCEL_PROVIDER_ID,
    url: link.url || deploymentUrl(ready) || initialUrl,
    deploymentId,
    target: 'preview',
    status: link.status,
    statusMessage: link.statusMessage,
    reachableAt: link.reachableAt,
  };
}

export async function listCloudflarePagesZones(config: DeployConfig) {
  if (!config?.token) throw new DeployError('Cloudflare API token is required.', 400);
  if (!config?.accountId) throw new DeployError('Cloudflare account ID is required.', 400);
  const accountId = config.accountId;
  const zones = await fetchCloudflarePaginatedResult(
    config,
    (page, perPage) => {
      const params = new URLSearchParams({
        'account.id': accountId,
        status: 'active',
        type: 'full',
        page: String(page),
        per_page: String(perPage),
      });
      return `${CLOUDFLARE_API}/zones?${params.toString()}`;
    },
    'Cloudflare zones lookup failed.',
  );
  return {
    zones: zones
      .map((zone) => ({
        id: typeof zone?.id === 'string' ? zone.id : '',
        name: normalizeCloudflareZoneName(zone?.name),
        status: typeof zone?.status === 'string' ? zone.status : undefined,
        type: typeof zone?.type === 'string' ? zone.type : undefined,
      }))
      .filter((zone) => zone.id && zone.name),
    cloudflarePages: normalizeCloudflarePagesConfigHints(config?.cloudflarePages),
  };
}

export async function deployToCloudflarePages(input: { config: DeployConfig; files: DeployFile[]; projectId?: string; cloudflarePages?: unknown; priorMetadata?: JsonObject | undefined }) {
  const {
    config,
    files,
    projectId = '',
    cloudflarePages = undefined,
    priorMetadata = undefined,
  } = input || {};
  if (!config?.token) throw new DeployError('Cloudflare API token is required.', 400);
  if (!config?.accountId) throw new DeployError('Cloudflare account ID is required.', 400);
  if (!config?.projectName) throw new DeployError('Cloudflare Pages project name could not be generated.', 400);

  const customDomainSelection = await validateCloudflarePagesDeploySelection(
    config,
    normalizeCloudflarePagesDeploySelection(cloudflarePages),
  );

  await ensureCloudflarePagesProject(config);

  const uploadToken = await getCloudflarePagesUploadToken(config);
  await uploadCloudflarePagesAssets(uploadToken, files);

  const form = new FormData();
  const manifest: Record<string, string> = {};
  for (const file of files) {
    manifest[`/${file.file}`] = cloudflarePagesAssetHash(file);
  }
  form.append('manifest', JSON.stringify(manifest));
  form.append('branch', 'main');

  const deployResp = await fetch(cloudflarePagesProjectUrl(config, 'deployments'), {
    method: 'POST',
    headers: cloudflareHeaders(config),
    body: form,
  });
  const deployed = await readCloudflareJson(deployResp);
  if (!deployResp.ok || deployed?.success === false) {
    throw cloudflareError(deployed, deployResp.status, 'Cloudflare Pages deployment failed.');
  }

  const deployment = deployed?.result ?? deployed;
  const productionUrl = cloudflarePagesProductionUrl(config);
  const link = await waitForReachableDeploymentUrl(
    productionUrl ? [productionUrl] : [deployment?.url],
    { providerLabel: 'Cloudflare Pages' },
  );
  const pagesDevUrl = productionUrl || link.url || deploymentUrl(deployment);
  const pagesDev = {
    url: pagesDevUrl,
    status: normalizeDeploymentLinkStatus(link.status),
    statusMessage: link.statusMessage,
    reachableAt: link.reachableAt,
  };
  const customDomain = customDomainSelection
    ? await setupCloudflarePagesCustomDomain({
        config,
        projectId,
        selection: customDomainSelection,
        pagesDevUrl,
        priorMetadata,
      })
    : undefined;
  const cloudflarePagesInfo = {
    projectName: config.projectName,
    pagesDev,
    ...(customDomain ? { customDomain } : {}),
  };
  const aggregate = aggregateCloudflarePagesStatus(pagesDev, customDomain);

  return {
    providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
    url: pagesDevUrl,
    deploymentId: deployment?.id,
    target: 'preview',
    status: aggregate.status,
    statusMessage: aggregate.statusMessage,
    reachableAt: link.reachableAt,
    cloudflarePages: cloudflarePagesInfo,
    providerMetadata: cloudflarePagesProviderMetadata(config.projectName, cloudflarePagesInfo, { projectId }),
  };
}

function normalizeDeploymentLinkStatus(status: unknown): DeployLinkStatus {
  return status === 'ready' || status === 'protected' || status === 'failed'
    ? status
    : 'link-delayed';
}

function normalizeCloudflarePagesDeploySelection(input: unknown): CloudflarePagesDeploySelection | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as JsonObject;
  const rawZoneId = typeof source.zoneId === 'string' ? source.zoneId.trim() : '';
  const rawZoneName = typeof source.zoneName === 'string' ? source.zoneName.trim() : '';
  const rawPrefix = typeof source.domainPrefix === 'string' ? source.domainPrefix.trim() : '';
  if (!rawZoneId && !rawZoneName && !rawPrefix) return null;
  const zoneName = normalizeCloudflareZoneName(rawZoneName);
  const domainPrefix = normalizeCloudflareDomainPrefix(rawPrefix);
  if (!rawZoneId) throw new DeployError('Cloudflare zone is required for a custom domain.', 400);
  if (!zoneName || !isValidCloudflareZoneName(zoneName)) {
    throw new DeployError('Select a valid Cloudflare domain for the custom domain.', 400);
  }
  if (!domainPrefix) {
    throw new DeployError('Enter a valid subdomain prefix, for example "demo".', 400);
  }
  return {
    zoneId: rawZoneId,
    zoneName,
    domainPrefix,
    hostname: `${domainPrefix}.${zoneName}`,
  };
}

async function validateCloudflarePagesDeploySelection(config: DeployConfig, selection: CloudflarePagesDeploySelection | null): Promise<CloudflarePagesDeploySelection | null> {
  if (!selection) return null;
  const resp = await fetch(`${CLOUDFLARE_API}/zones/${encodeURIComponent(selection.zoneId)}`, {
    headers: cloudflareHeaders(config),
  });
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json?.success === false) {
    throw cloudflareError(json, resp.status, 'Cloudflare zone lookup failed.');
  }
  const zone = json?.result ?? json;
  const zoneName = normalizeCloudflareZoneName(zone?.name);
  if (!zoneName || zoneName !== selection.zoneName) {
    throw new DeployError('Cloudflare zone selection no longer matches the selected domain.', 400, {
      errorCode: 'cloudflare_zone_mismatch',
    });
  }
  if (zone?.status && zone.status !== 'active') {
    throw new DeployError('Cloudflare custom domains require an active zone.', 400, {
      errorCode: 'cloudflare_zone_inactive',
    });
  }
  if (zone?.type && zone.type !== 'full') {
    throw new DeployError('Cloudflare custom domains require a full DNS zone.', 400, {
      errorCode: 'cloudflare_zone_not_full',
    });
  }
  return { ...selection, zoneName };
}

async function setupCloudflarePagesCustomDomain({ config, projectId, selection, pagesDevUrl, priorMetadata }: { config: DeployConfig; projectId: string; selection: CloudflarePagesDeploySelection; pagesDevUrl: string; priorMetadata?: JsonObject | undefined }) {
  if (!config.projectName) throw new DeployError('Cloudflare Pages project name could not be generated.', 400);
  const pagesTarget = normalizeHostname(hostnameFromUrl(pagesDevUrl) || `${config.projectName}.pages.dev`);
  const marker = cloudflarePagesDnsMarker(projectId, config.projectName, pagesTarget);
  const base = {
    hostname: selection.hostname,
    url: `https://${selection.hostname}`,
    zoneId: selection.zoneId,
    zoneName: selection.zoneName,
    domainPrefix: selection.domainPrefix,
  };

  let dns;
  try {
    dns = await ensureCloudflarePagesCnameRecord({
      config,
      selection,
      target: pagesTarget,
      marker,
      priorMetadata,
    });
  } catch (err) {
    const details = err instanceof DeployError && err.details && typeof err.details === 'object'
      ? err.details
      : {};
    return {
      ...base,
      status: details.errorCode === 'cloudflare_dns_record_conflict' ? 'conflict' : 'failed',
      statusMessage: errorMessage(err, 'Cloudflare DNS record setup failed.'),
      errorCode: details.errorCode || 'cloudflare_dns_record_failed',
      errorMessage: errorMessage(err, 'Cloudflare DNS record setup failed.'),
      dnsStatus: details.dnsStatus || (details.errorCode === 'cloudflare_dns_record_conflict' ? 'conflict' : 'failed'),
      dnsRecordId: details.dnsRecordId,
      dnsOwnership: details.dnsOwnership || 'external',
      domainStatus: 'skipped',
    };
  }

  let domain;
  try {
    domain = await ensureCloudflarePagesDomain(config, selection.hostname);
  } catch (err) {
    const details = err instanceof DeployError && err.details && typeof err.details === 'object'
      ? err.details
      : {};
    return {
      ...base,
      status: details.errorCode === 'cloudflare_domain_already_bound' ? 'conflict' : 'failed',
      statusMessage: errorMessage(err, 'Cloudflare Pages custom domain setup failed.'),
      errorCode: details.errorCode || 'cloudflare_domain_setup_failed',
      errorMessage: errorMessage(err, 'Cloudflare Pages custom domain setup failed.'),
      dnsStatus: dns.dnsStatus,
      dnsRecordId: dns.dnsRecordId,
      dnsOwnership: dns.dnsOwnership,
      domainStatus: details.domainStatus || 'failed',
    };
  }

  const domainStatus = normalizeCloudflarePagesDomainStatus(domain?.status);
  const customLink = domainStatus === 'active'
    ? await checkDeploymentUrl(base.url)
    : null;
  const ready = domainStatus === 'active' && customLink?.reachable;
  const failed = domainStatus === 'failed';
  return {
    ...base,
    status: ready ? 'ready' : failed ? 'failed' : 'pending',
    statusMessage: ready
      ? 'Custom domain is ready.'
      : failed
        ? 'Cloudflare Pages reported a custom-domain error.'
        : customLink?.statusMessage || 'Custom domain is being verified by Cloudflare Pages.',
    errorCode: failed ? 'cloudflare_domain_setup_failed' : undefined,
    dnsStatus: dns.dnsStatus,
    dnsRecordId: dns.dnsRecordId,
    dnsOwnership: dns.dnsOwnership,
    domainStatus,
    pagesDomainStatus: typeof domain?.status === 'string' ? domain.status : undefined,
    validationData: domain?.validation_data,
    verificationData: domain?.verification_data,
  };
}

async function ensureCloudflarePagesCnameRecord({ config, selection, target, marker, priorMetadata }: { config: DeployConfig; selection: CloudflarePagesDeploySelection; target: string; marker: string; priorMetadata?: JsonObject | undefined }) {
  const records = await listCloudflareDnsRecords(config, selection.zoneId, selection.hostname);
  const targetHost = normalizeHostname(target);
  const exact = findExactCloudflarePagesCname(records, selection, targetHost);
  if (exact) {
    return cloudflarePagesCnameReuseResult(exact, marker);
  }

  const conflicting = findCloudflarePagesHostnameRecord(records, selection);
  if (conflicting) {
    if (canPatchCloudflarePagesCname(conflicting, selection, marker, priorMetadata)) {
      const conflictingId = conflicting.id;
      if (!conflictingId) throw new DeployError('Cloudflare DNS record id is missing.', 502);
      const patched = await patchCloudflareDnsRecord(config, selection.zoneId, conflictingId, {
        type: 'CNAME',
        name: selection.hostname,
        content: targetHost,
        proxied: true,
        ttl: 1,
        comment: marker,
      });
      return {
        dnsStatus: 'patched',
        dnsRecordId: patched?.id || conflictingId,
        dnsOwnership: 'marked',
        marker,
      };
    }
    throw cloudflarePagesDnsConflictError(selection, conflicting);
  }

  try {
    const created = await createCloudflareDnsRecord(config, selection.zoneId, {
      type: 'CNAME',
      name: selection.hostname,
      content: targetHost,
      proxied: true,
      ttl: 1,
      comment: marker,
    });
    return {
      dnsStatus: 'created',
      dnsRecordId: created?.id,
      dnsOwnership: 'marked',
      marker,
    };
  } catch (err) {
    const racedRecord = await maybeReuseCloudflarePagesCnameAfterDuplicate({
      err,
      config,
      selection,
      targetHost,
      marker,
    });
    if (racedRecord) return racedRecord;
    if (!(err instanceof DeployError) || !isCloudflareCommentError(err.details || err.message)) throw err;
    try {
      const created = await createCloudflareDnsRecord(config, selection.zoneId, {
        type: 'CNAME',
        name: selection.hostname,
        content: targetHost,
        proxied: true,
        ttl: 1,
      });
      return {
        dnsStatus: 'created',
        dnsRecordId: created?.id,
        dnsOwnership: 'unmarked',
        marker,
      };
    } catch (retryErr) {
      const racedRetryRecord = await maybeReuseCloudflarePagesCnameAfterDuplicate({
        err: retryErr,
        config,
        selection,
        targetHost,
        marker,
      });
      if (racedRetryRecord) return racedRetryRecord;
      throw retryErr;
    }
  }
}

function findExactCloudflarePagesCname(records: CloudflareDnsRecord[], selection: CloudflarePagesDeploySelection, targetHost: string) {
  return records.find((record) => (
    String(record?.type || '').toUpperCase() === 'CNAME' &&
    normalizeHostname(record?.name) === selection.hostname &&
    normalizeHostname(record?.content) === targetHost
  ));
}

function findCloudflarePagesHostnameRecord(records: CloudflareDnsRecord[], selection: CloudflarePagesDeploySelection) {
  return records.find((record) => normalizeHostname(record?.name) === selection.hostname);
}

function cloudflarePagesCnameReuseResult(record: CloudflareDnsRecord, marker: string) {
  return {
    dnsStatus: 'reused',
    dnsRecordId: typeof record.id === 'string' ? record.id : undefined,
    dnsOwnership: record.comment === marker ? 'marked' : 'unmarked',
    marker,
  };
}

function cloudflarePagesDnsConflictError(selection: CloudflarePagesDeploySelection, conflicting: CloudflareDnsRecord) {
  return new DeployError(
    `Cloudflare DNS already has a different record for ${selection.hostname}.`,
    409,
    {
      errorCode: 'cloudflare_dns_record_conflict',
      dnsStatus: 'conflict',
      dnsRecordId: conflicting.id,
      dnsOwnership: 'external',
    },
  );
}

async function maybeReuseCloudflarePagesCnameAfterDuplicate({ err, config, selection, targetHost, marker }: { err: unknown; config: DeployConfig; selection: CloudflarePagesDeploySelection; targetHost: string; marker: string }) {
  if (!(err instanceof DeployError) || !isCloudflareAlreadyExists(err.details || err.message)) return null;
  const racedRecords = await listCloudflareDnsRecords(config, selection.zoneId, selection.hostname);
  const exact = findExactCloudflarePagesCname(racedRecords, selection, targetHost);
  if (exact) return cloudflarePagesCnameReuseResult(exact, marker);
  const conflicting = findCloudflarePagesHostnameRecord(racedRecords, selection);
  if (conflicting) throw cloudflarePagesDnsConflictError(selection, conflicting);
  throw err;
}

async function listCloudflareDnsRecords(config: DeployConfig, zoneId: string, hostname: string): Promise<CloudflareDnsRecord[]> {
  const params = new URLSearchParams({
    name: hostname,
    per_page: '100',
  });
  const resp = await fetch(`${cloudflareZoneDnsRecordsUrl(zoneId)}?${params.toString()}`, {
    headers: cloudflareHeaders(config),
  });
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json?.success === false) {
    throw cloudflareError(json, resp.status, 'Cloudflare DNS record lookup failed.');
  }
  return Array.isArray(json?.result) ? json.result : [];
}

async function createCloudflareDnsRecord(config: DeployConfig, zoneId: string, body: JsonObject) {
  const resp = await fetch(cloudflareZoneDnsRecordsUrl(zoneId), {
    method: 'POST',
    headers: cloudflareHeaders(config, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json?.success === false) {
    throw cloudflareError(json, resp.status, 'Cloudflare DNS record creation failed.');
  }
  return json?.result ?? json;
}

async function patchCloudflareDnsRecord(config: DeployConfig, zoneId: string, dnsRecordId: string, body: JsonObject) {
  const resp = await fetch(`${cloudflareZoneDnsRecordsUrl(zoneId)}/${encodeURIComponent(dnsRecordId)}`, {
    method: 'PATCH',
    headers: cloudflareHeaders(config, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json?.success === false) {
    throw cloudflareError(json, resp.status, 'Cloudflare DNS record update failed.');
  }
  return json?.result ?? json;
}

function canPatchCloudflarePagesCname(record: CloudflareDnsRecord, selection: CloudflarePagesDeploySelection, marker: string, priorMetadata?: JsonObject) {
  const prior = priorMetadata?.cloudflarePagesCustomDomain;
  return (
    record &&
    String(record.type || '').toUpperCase() === 'CNAME' &&
    typeof record.id === 'string' &&
    record.id &&
    record.id === prior?.dnsRecordId &&
    normalizeHostname(record.name) === selection.hostname &&
    record.comment === marker &&
    prior?.marker === marker
  );
}

async function ensureCloudflarePagesDomain(config: DeployConfig, hostname: string) {
  const existing = await findCloudflarePagesDomain(config, hostname);
  if (existing) return existing;

  const resp = await fetch(cloudflarePagesProjectUrl(config, 'domains'), {
    method: 'POST',
    headers: cloudflareHeaders(config, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: hostname }),
  });
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json?.success === false) {
    if (isCloudflareAlreadyExists(json)) {
      const retry = await findCloudflarePagesDomain(config, hostname);
      if (retry) return retry;
      throw new DeployError(
        `Cloudflare Pages says ${hostname} is already bound to another project.`,
        409,
        {
          errorCode: 'cloudflare_domain_already_bound',
          domainStatus: 'conflict',
        },
      );
    }
    throw cloudflareError(json, resp.status, 'Cloudflare Pages custom domain setup failed.');
  }
  return json?.result ?? json;
}

async function findCloudflarePagesDomain(config: DeployConfig, hostname: string) {
  const domains = await fetchCloudflarePaginatedResult(
    config,
    (page, perPage) => {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      });
      return `${cloudflarePagesProjectUrl(config, 'domains')}?${params.toString()}`;
    },
    'Cloudflare Pages custom domain lookup failed.',
  );
  return domains.find((domain) => normalizeHostname(domain?.name) === normalizeHostname(hostname)) || null;
}

export async function readCloudflarePagesDomain(config: DeployConfig, hostname: string) {
  if (!config?.token) throw new DeployError('Cloudflare API token is required.', 400);
  if (!config?.accountId) throw new DeployError('Cloudflare account ID is required.', 400);
  if (!config?.projectName) throw new DeployError('Cloudflare Pages project name could not be generated.', 400);
  return findCloudflarePagesDomain(config, hostname);
}

function normalizeCloudflarePagesDomainStatus(status: unknown) {
  const value = String(status || '').toLowerCase();
  if (value === 'active') return 'active';
  if (value === 'error' || value === 'blocked' || value === 'deactivated') return 'failed';
  return 'pending';
}

export function aggregateCloudflarePagesStatus(pagesDev: JsonObject, customDomain?: JsonObject) {
  if (!customDomain) {
    return {
      status: pagesDev.status,
      statusMessage: pagesDev.statusMessage,
    };
  }
  if (customDomain.status === 'ready') {
    return {
      status: pagesDev.status === 'ready' ? 'ready' : 'link-delayed',
      statusMessage: pagesDev.status === 'ready'
        ? 'Cloudflare Pages and custom domain are ready.'
        : pagesDev.statusMessage || 'Cloudflare Pages is still preparing its pages.dev link.',
    };
  }
  if (customDomain.status === 'pending') {
    return {
      status: 'link-delayed',
      statusMessage: customDomain.statusMessage || 'Custom domain is still being prepared.',
    };
  }
  const customFailureMessage = customDomain.errorMessage || customDomain.statusMessage || 'Custom domain setup failed.';
  return {
    status: pagesDev.status,
    statusMessage: pagesDev.status === 'ready'
      ? `pages.dev is ready. ${customFailureMessage}`
      : pagesDev.statusMessage || customFailureMessage,
  };
}

function cloudflarePagesProviderMetadata(projectName: string, cloudflarePagesInfo: JsonObject, { projectId = '' }: { projectId?: string } = {}) {
  const custom = cloudflarePagesInfo?.customDomain;
  return {
    cloudflarePagesProjectName: projectName,
    cloudflarePages: cloudflarePagesInfo,
    ...(custom ? {
      cloudflarePagesCustomDomain: {
        projectId,
        pagesProjectName: projectName,
        hostname: custom.hostname,
        zoneId: custom.zoneId,
        zoneName: custom.zoneName,
        domainPrefix: custom.domainPrefix,
        marker: cloudflarePagesDnsMarker(projectId, projectName, hostnameFromUrl(cloudflarePagesInfo.pagesDev?.url)),
        dnsRecordId: custom.dnsRecordId,
        dnsOwnership: custom.dnsOwnership,
      },
    } : {}),
  };
}

async function ensureCloudflarePagesProject(config: DeployConfig) {
  const getResp = await fetch(cloudflarePagesProjectUrl(config), {
    headers: cloudflareHeaders(config),
  });
  const found = await readCloudflareJson(getResp);
  if (getResp.ok && found?.success !== false) return found?.result ?? found;
  if (getResp.status !== 404) {
    throw cloudflareError(found, getResp.status, 'Cloudflare Pages project lookup failed.');
  }

  const createResp = await fetch(cloudflareAccountPagesProjectsUrl(config), {
    method: 'POST',
    headers: cloudflareHeaders(config, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      name: config.projectName,
      production_branch: 'main',
    }),
  });
  const created = await readCloudflareJson(createResp);
  if (!createResp.ok || created?.success === false) {
    if (isCloudflarePagesProjectAlreadyExists(created)) {
      const retryResp = await fetch(cloudflarePagesProjectUrl(config), {
        headers: cloudflareHeaders(config),
      });
      const retryFound = await readCloudflareJson(retryResp);
      if (retryResp.ok && retryFound?.success !== false) {
        return retryFound?.result ?? retryFound;
      }
    }
    throw cloudflareError(created, createResp.status, 'Cloudflare Pages project creation failed.');
  }
  return created?.result ?? created;
}

function isCloudflarePagesProjectAlreadyExists(body: unknown) {
  const text = JSON.stringify(body || {}).toLowerCase();
  return (
    text.includes('already exists') ||
    text.includes('already exist') ||
    text.includes('project exists') ||
    text.includes('project name is taken') ||
    text.includes('duplicate')
  );
}

async function getCloudflarePagesUploadToken(config: DeployConfig): Promise<string> {
  const tokenResp = await fetch(cloudflarePagesProjectUrl(config, 'upload-token'), {
    headers: cloudflareHeaders(config),
  });
  const tokenBody = await readCloudflareJson(tokenResp);
  const jwt = tokenBody?.result?.jwt || tokenBody?.jwt;
  if (!tokenResp.ok || tokenBody?.success === false || !jwt) {
    throw cloudflareError(tokenBody, tokenResp.status, 'Cloudflare Pages upload token request failed.');
  }
  return jwt;
}

async function uploadCloudflarePagesAssets(uploadToken: string, files: DeployFile[]) {
  const uniqueFiles = new Map<string, { hash: string; data: Buffer; contentType: string }>();
  for (const file of files) {
    const data = Buffer.from(file.data);
    if (data.length > CLOUDFLARE_PAGES_ASSET_MAX_BYTES) {
      throw new DeployError(
        `Cloudflare Pages assets must be ${formatMib(CLOUDFLARE_PAGES_ASSET_MAX_BYTES)} or smaller: ${file.file} is ${formatMib(data.length)}.`,
        400,
      );
    }
    const hash = cloudflarePagesAssetHash({ ...file, data });
    if (!uniqueFiles.has(hash)) {
      uniqueFiles.set(hash, {
        hash,
        data,
        contentType: file.contentType || 'application/octet-stream',
      });
    }
  }
  const hashes = Array.from(uniqueFiles.keys());
  const missing = await cloudflarePagesMissingAssetHashes(uploadToken, hashes);
  if (missing.length > 0) {
    const missingFiles = missing.map((hash) => {
      const file = uniqueFiles.get(hash);
      if (!file) throw new DeployError(`Cloudflare reported an unknown asset hash: ${hash}`, 502);
      return {
        ...file,
        hash,
      };
    });

    for (const batch of chunkCloudflarePagesAssetUploads(missingFiles)) {
      const payload = batch.map((file) => ({
        key: file.hash,
        value: file.data.toString('base64'),
        metadata: {
          contentType: file.contentType,
        },
        base64: true,
      }));
      const uploadResp = await fetch(`${CLOUDFLARE_API}/pages/assets/upload`, {
        method: 'POST',
        headers: cloudflareAssetHeaders(uploadToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const uploaded = await readCloudflareJson(uploadResp);
      if (!uploadResp.ok || uploaded?.success === false) {
        throw cloudflareError(uploaded, uploadResp.status, 'Cloudflare Pages asset upload failed.');
      }
    }
  }

  const upsertResp = await fetch(`${CLOUDFLARE_API}/pages/assets/upsert-hashes`, {
    method: 'POST',
    headers: cloudflareAssetHeaders(uploadToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ hashes }),
  });
  const upserted = await readCloudflareJson(upsertResp);
  if (!upsertResp.ok || upserted?.success === false) {
    throw cloudflareError(upserted, upsertResp.status, 'Cloudflare Pages asset hash update failed.');
  }
}

export function chunkCloudflarePagesAssetUploads(
  files: { hash: string; data: Buffer | Uint8Array | string; contentType?: string }[],
  {
    maxFiles = CLOUDFLARE_PAGES_ASSET_UPLOAD_MAX_FILES,
    maxBytes = CLOUDFLARE_PAGES_ASSET_UPLOAD_MAX_BODY_BYTES,
  } = {},
) {
  const chunks: typeof files[] = [];
  let current: typeof files = [];
  let currentBytes = 2; // JSON array brackets.

  for (const file of files) {
    const nextBytes = estimateCloudflarePagesAssetUploadPayloadBytes(file);
    const wouldExceedCount = current.length >= maxFiles;
    const wouldExceedBytes = current.length > 0 && currentBytes + nextBytes > maxBytes;
    if (wouldExceedCount || wouldExceedBytes) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(file);
    currentBytes += nextBytes;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

function estimateCloudflarePagesAssetUploadPayloadBytes(file: { hash?: string; data?: Buffer | Uint8Array | string; contentType?: string }) {
  const data = Buffer.from(file?.data ?? '');
  const encodedBytes = Math.ceil(data.length / 3) * 4;
  const contentTypeBytes = Buffer.byteLength(file?.contentType || 'application/octet-stream');
  const hashBytes = Buffer.byteLength(file?.hash || '');
  // Conservative JSON/object overhead for `key`, `value`, `metadata`, and commas.
  return encodedBytes + contentTypeBytes + hashBytes + 128;
}

async function cloudflarePagesMissingAssetHashes(uploadToken: string, hashes: string[]): Promise<string[]> {
  const resp = await fetch(`${CLOUDFLARE_API}/pages/assets/check-missing`, {
    method: 'POST',
    headers: cloudflareAssetHeaders(uploadToken, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ hashes }),
  });
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json?.success === false) {
    throw cloudflareError(json, resp.status, 'Cloudflare Pages asset lookup failed.');
  }
  const result = json?.result ?? json;
  return Array.isArray(result) ? result : Array.isArray(result?.hashes) ? result.hashes : hashes;
}

export function cloudflarePagesAssetHash(file: Pick<DeployFile, 'file' | 'data'>) {
  const data = Buffer.from(file.data);
  const extension = path.posix.extname(file.file).slice(1);
  return blake3Hash(`${data.toString('base64')}${extension}`).toString('hex').slice(0, 32);
}

export function extractHtmlReferences(html: string) {
  const refs: string[] = [];
  for (const tag of parseHtmlTags(html)) {
    const attrs = parseHtmlAttributes(tag.attrs);
    for (const name of ['src', 'poster']) {
      const value = attrs.get(name);
      if (value) refs.push(value);
    }
    const href = attrs.get('href');
    if (href && shouldCollectHref(tag.name, attrs)) refs.push(href);
    const srcset = attrs.get('srcset');
    if (srcset) {
      for (const part of srcset.split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (url) refs.push(url);
      }
    }
  }
  return refs;
}

// Character classes scope the lazy match so unclosed url(((( or
// `@import "foo` cannot trigger O(n^2) regex backtracking on
// attacker-controlled CSS. The tradeoff is that quoted urls
// containing literal `)` characters must be percent-encoded; CSS
// authors are already expected to do this in practice.
const CSS_URL_REGEX = /url\(\s*(['"]?)([^)]*?)\1\s*\)/gi;
const CSS_IMPORT_REGEX = /@import\s+(?:url\(\s*)?(['"])([^'"]*?)\1/gi;

export function extractCssReferences(css: string) {
  const refs: string[] = [];
  const urlRe = new RegExp(CSS_URL_REGEX.source, CSS_URL_REGEX.flags);
  let match;
  while ((match = urlRe.exec(css))) refs.push(match[2] ?? '');
  const importRe = new RegExp(CSS_IMPORT_REGEX.source, CSS_IMPORT_REGEX.flags);
  while ((match = importRe.exec(css))) refs.push(match[2] ?? '');
  return refs;
}

// Collect url() / @import references from inline `<style>` blocks and
// `style="..."` attributes. These bypass the external-stylesheet path
// (link rel=stylesheet -> .css file -> extractCssReferences) but still
// pull in real assets, e.g. background images and @font-face sources.
//
// Style-like text that lives inside `<script>` string literals or HTML
// comments is intentionally skipped, mirroring how extractHtmlReferences
// treats those raw-text regions.
export function extractInlineCssReferences(html: string) {
  const source = String(html);
  const refs: string[] = [];
  const skipRanges = htmlRawTextRanges(source);

  const styleBlockRe = /<style\b[^<>]*>([\s\S]*?)<\/style\s*>/gi;
  let block;
  while ((block = styleBlockRe.exec(source))) {
    if (isOffsetInRanges(block.index, skipRanges)) continue;
    refs.push(...extractCssReferences(block[1] ?? ''));
  }

  for (const tag of parseHtmlTags(source)) {
    const attrs = parseHtmlAttributes(tag.attrs);
    const style = attrs.get('style');
    if (style) refs.push(...extractCssReferences(style));
  }

  return refs;
}

// Rewrite url() / @import references inside a CSS string so that paths
// resolved relative to `baseDir` survive the entry-HTML being moved to
// the deploy root. Mirrors `rewriteHtmlReference` for HTML attributes.
// Uses the same hardened character classes as `extractCssReferences` so
// extract and rewrite see the same set of references.
export function rewriteCssReferences(css: string, baseDir: string) {
  return String(css)
    .replace(CSS_URL_REGEX, (match, quote, value) => {
      if (!value) return match;
      const rewritten = rewriteHtmlReference(value, baseDir);
      return `url(${quote}${rewritten}${quote})`;
    })
    .replace(/(@import\s+)(['"])([^'"]*?)\2/gi, (_full, prefix, quote, value) => {
      const rewritten = rewriteHtmlReference(value, baseDir);
      return `${prefix}${quote}${rewritten}${quote}`;
    });
}

export function resolveReferencedPath(raw: unknown, baseDir: string) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) return null;
  if (trimmed.startsWith('//')) return null;
  const withoutHash = trimmed.split('#')[0] ?? '';
  const withoutQuery = withoutHash.split('?')[0] ?? '';
  if (!withoutQuery) return null;
  if (withoutQuery.startsWith('/')) return withoutQuery.slice(1);
  return path.posix.normalize(path.posix.join(baseDir || '.', withoutQuery));
}

export function rewriteEntryHtmlReferences(html: string, baseDir: string) {
  const source = String(html);
  // Compute raw-text ranges against the input first so the style-block
  // pre-pass can skip `<style>...</style>` text that lives inside a
  // `<script>` string literal or an HTML comment. Without this gate, a
  // template like `const tpl = '<style>...url("foo")...</style>'` would
  // get mutated, changing runtime JS behavior.
  const inputRawTextRanges = htmlRawTextRanges(source);
  const styleRewritten = source.replace(
    /(<style\b[^<>]*>)([\s\S]*?)(<\/style\s*>)/gi,
    (full, openTag, content, closeTag, offset) => {
      if (isOffsetInRanges(offset, inputRawTextRanges)) return full;
      return `${openTag}${rewriteCssReferences(content, baseDir)}${closeTag}`;
    },
  );
  // Re-derive raw-text ranges against the post-style HTML: rewriting can
  // shift offsets, and the tag-attribute pass below skips raw-text
  // regions by absolute offset. Two scans are intentional, deploy is
  // not a hot path and the cost is linear in document size.
  const rawTextRanges = htmlRawTextRanges(styleRewritten);
  return styleRewritten.replace(/<([A-Za-z][A-Za-z0-9:-]*)([^<>]*?)>/g, (tag, rawName, rawAttrs, offset) => {
    if (isOffsetInRanges(offset, rawTextRanges)) return tag;
    const tagName = String(rawName).toLowerCase();
    const attrs = parseHtmlAttributes(rawAttrs);
    return `<${rawName}${rewriteHtmlAttributes(rawAttrs, tagName, attrs, baseDir)}>`;
  });
}

// Soft thresholds chosen against Vercel's v13 deployment shape and
// typical first-paint budgets. Per-asset is a usability hint, not a
// hard cap; bundle is a margin against Vercel's 100MB request body
// (each file is base64-encoded which adds ~33%, so 75MiB pre-encoded
// is the safer ceiling).
export const DEPLOY_PREFLIGHT_LARGE_ASSET_BYTES = 4 * 1024 * 1024;
export const DEPLOY_PREFLIGHT_LARGE_BUNDLE_BYTES = 75 * 1024 * 1024;
export const DEPLOY_PREFLIGHT_LARGE_HTML_BYTES = 1 * 1024 * 1024;

function isExternalUrl(value: unknown) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) return true;
  if (trimmed.startsWith('//')) return true;
  return false;
}

function pushUnique(list: { warnings: JsonObject[]; seen: Set<string> }, warning: JsonObject) {
  const key = `${warning.code}:${warning.path ?? ''}:${warning.url ?? ''}`;
  if (list.seen.has(key)) return;
  list.seen.add(key);
  list.warnings.push(warning);
}

// Walk the entry HTML once to gather signals that affect deployment
// quality without touching the network. Returns a structured warning
// list the UI can render verbatim.
//
// `entryPath` is used as the warning `path` for HTML-level findings so
// the UI can deep-link from a warning into the source file the author
// is actually editing. `files` carries deploy-relative paths (the entry
// HTML is always renamed to `index.html`) so per-asset warnings live in
// the deploy namespace.
/**
 * @param {{
 *   entryPath: string,
 *   html: string,
 *   files: any[],
 *   missing?: any[],
 *   invalid?: any[]
 * }} input
 * @returns {{ warnings: any[], totalBytes: number, totalFiles: number }}
 */
export function analyzeDeployPlan(input: {
  entryPath: string;
  html: string;
  files: DeployFile[];
  missing?: string[];
  invalid?: string[];
}): { warnings: JsonObject[]; totalBytes: number; totalFiles: number } {
  const { entryPath, html, files } = input;
  const missing = input.missing ?? [];
  const invalid = input.invalid ?? [];
  const acc: { warnings: JsonObject[]; seen: Set<string> } = { warnings: [], seen: new Set() };

  for (const ref of missing) {
    pushUnique(acc, {
      code: 'broken-reference',
      path: ref,
      message: `Referenced file is missing on disk: ${ref}`,
    });
  }
  for (const ref of invalid) {
    pushUnique(acc, {
      code: 'invalid-reference',
      path: ref,
      message: `Reference is not a valid project path: ${ref}`,
    });
  }

  let totalBytes = 0;
  let entrySize = 0;
  for (const f of files || []) {
    const size = f.data?.length ?? 0;
    totalBytes += size;
    if (f.file === 'index.html') entrySize = size;
    if (size > DEPLOY_PREFLIGHT_LARGE_ASSET_BYTES && f.file !== 'index.html') {
      pushUnique(acc, {
        code: 'large-asset',
        path: f.file,
        size,
        message: `Asset is ${formatMib(size)}, larger than ${formatMib(DEPLOY_PREFLIGHT_LARGE_ASSET_BYTES)}; consider compressing or hosting on a CDN.`,
      });
    }
  }

  if (entrySize > DEPLOY_PREFLIGHT_LARGE_HTML_BYTES) {
    pushUnique(acc, {
      // Report against the source entry path so the UI can deep-link
      // back to the file the author edits, not the deploy-renamed
      // `index.html` which does not exist in the project tree.
      code: 'large-html',
      path: entryPath,
      size: entrySize,
      message: `Entry HTML is ${formatMib(entrySize)}; large HTML inflates time-to-first-paint.`,
    });
  }
  if (totalBytes > DEPLOY_PREFLIGHT_LARGE_BUNDLE_BYTES) {
    pushUnique(acc, {
      code: 'large-bundle',
      size: totalBytes,
      message: `Bundle is ${formatMib(totalBytes)}; Vercel rejects deploy bodies above ~100MB after base64 encoding.`,
    });
  }

  const source = String(html ?? '');
  // Anchor to the document prolog so a `<!doctype html>` substring that
  // happens to live inside a `<script>` template literal or a comment
  // is not treated as a real declaration. Per HTML5, the prolog may
  // begin with an optional BOM, then any number of HTML comments and
  // whitespace, then the doctype. Built via `new RegExp` so the BOM
  // appears as an explicit U+FEFF escape rather than a literal
  // zero-width character in the regex source.
  if (!new RegExp('^\\uFEFF?\\s*(?:<!--[\\s\\S]*?-->\\s*)*<!doctype\\s+html', 'i').test(source)) {
    pushUnique(acc, {
      code: 'no-doctype',
      path: entryPath,
      message: 'Entry HTML is missing `<!DOCTYPE html>`; browsers may render in quirks mode.',
    });
  }

  let hasViewport = false;
  for (const tag of parseHtmlTags(source)) {
    const attrs = parseHtmlAttributes(tag.attrs);
    if (
      tag.name === 'meta' &&
      String(attrs.get('name') || '').toLowerCase() === 'viewport'
    ) {
      hasViewport = true;
    }
    if (tag.name === 'script') {
      const src = attrs.get('src');
      if (isExternalUrl(src)) {
        pushUnique(acc, {
          code: 'external-script',
          path: entryPath,
          url: src,
          message: `External script will not be vendored into the deploy: ${src}`,
        });
      }
    }
    if (tag.name === 'link') {
      const rel = String(attrs.get('rel') || '').toLowerCase();
      const href = attrs.get('href');
      if (rel.split(/\s+/).includes('stylesheet') && isExternalUrl(href)) {
        pushUnique(acc, {
          code: 'external-stylesheet',
          path: entryPath,
          url: href,
          message: `External stylesheet will not be vendored into the deploy: ${href}`,
        });
      }
    }
  }
  if (!hasViewport) {
    pushUnique(acc, {
      code: 'no-viewport',
      path: entryPath,
      message: 'Entry HTML is missing `<meta name="viewport">`; mobile rendering will be off.',
    });
  }

  return { warnings: acc.warnings, totalBytes, totalFiles: (files || []).length };
}

function formatMib(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

// One-shot orchestrator: build the file plan, run the analyzer, and
// return the typed preflight payload exposed by the daemon.
export async function prepareDeployPreflight(projectsRoot: string, projectId: string, entryName: string, options: DeployOptions = {}) {
  const plan = await buildDeployFilePlan(projectsRoot, projectId, entryName, options);
  const { warnings, totalBytes, totalFiles } = analyzeDeployPlan(plan);
  return {
    providerId: options.providerId || VERCEL_PROVIDER_ID,
    entry: plan.entryPath,
    files: plan.files.map((f) => ({
      path: f.file,
      size: f.data?.length ?? 0,
      mime: f.contentType || 'application/octet-stream',
      sourcePath: f.sourcePath,
    })),
    totalFiles,
    totalBytes,
    warnings,
  };
}

export function injectDeployHookScript(html: string, scriptUrl: unknown) {
  const normalized = normalizeDeployHookScriptUrl(scriptUrl);
  if (!normalized) return html;

  const tag =
    `<script src="${escapeHtmlAttribute(normalized)}" defer ` +
    'data-open-design-deploy-hook="true" data-closeable="true"></script>';
  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${tag}</body>`);
  }
  return `${html}${tag}`;
}

export function normalizeDeployHookScriptUrl(raw: unknown) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

function escapeHtmlAttribute(value: unknown) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function rewriteSrcset(raw: string, baseDir: string) {
  return String(raw)
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return part;
      const pieces = trimmed.split(/\s+/);
      const nextUrl = rewriteHtmlReference(pieces[0] ?? '', baseDir);
      return [nextUrl, ...pieces.slice(1)].join(' ');
    })
    .join(', ');
}

function parseHtmlTags(html: string) {
  const tags: { name: string; attrs: string }[] = [];
  const rawTextRanges = htmlRawTextRanges(html);
  const tagRe = /<([A-Za-z][A-Za-z0-9:-]*)([^<>]*?)>/g;
  let match;
  while ((match = tagRe.exec(String(html)))) {
    if (isOffsetInRanges(match.index, rawTextRanges)) continue;
    tags.push({
      name: String(match[1]).toLowerCase(),
      attrs: match[2] || '',
    });
  }
  return tags;
}

function htmlRawTextRanges(html: string) {
  const source = String(html);
  const ranges: [number, number][] = [];

  const commentRe = /<!--[\s\S]*?-->/g;
  let match;
  while ((match = commentRe.exec(source))) {
    ranges.push([match.index, match.index + match[0].length]);
  }

  const rawTagRe = /<(script|style)\b[^<>]*>/gi;
  while ((match = rawTagRe.exec(source))) {
    const tagName = String(match[1]).toLowerCase();
    const contentStart = match.index + match[0].length;
    const closeRe = new RegExp(`</${tagName}\\s*>`, 'gi');
    closeRe.lastIndex = contentStart;
    const close = closeRe.exec(source);
    const contentEnd = close ? close.index : source.length;
    if (contentEnd > contentStart) ranges.push([contentStart, contentEnd]);
    rawTagRe.lastIndex = close ? close.index + close[0].length : source.length;
  }

  return ranges;
}

function isOffsetInRanges(offset: number, ranges: [number, number][]) {
  return ranges.some(([start, end]) => offset >= start && offset < end);
}

function parseHtmlAttributes(rawAttrs: string) {
  const attrs = new Map<string, string>();
  const attrRe = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = attrRe.exec(String(rawAttrs)))) {
    attrs.set(String(match[1]).toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function rewriteHtmlAttributes(rawAttrs: string, tagName: string, attrs: Map<string, string>, baseDir: string) {
  const shouldRewriteHref = shouldCollectHref(tagName, attrs);
  return String(rawAttrs).replace(
    /([^\s"'<>/=]+)(\s*=\s*)("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
    (full, rawName, equals, rawValue, doubleQuoted, singleQuoted, unquoted) => {
      const name = String(rawName).toLowerCase();
      if (
        name !== 'src' &&
        name !== 'poster' &&
        name !== 'srcset' &&
        name !== 'href' &&
        name !== 'style'
      ) {
        return full;
      }
      if (name === 'href' && !shouldRewriteHref) return full;

      const value = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
      let nextValue;
      if (name === 'srcset') nextValue = rewriteSrcset(value, baseDir);
      else if (name === 'style') nextValue = rewriteCssReferences(value, baseDir);
      else nextValue = rewriteHtmlReference(value, baseDir);
      if (doubleQuoted !== undefined) return `${rawName}${equals}"${nextValue}"`;
      if (singleQuoted !== undefined) return `${rawName}${equals}'${nextValue}'`;
      return `${rawName}${equals}${nextValue}`;
    },
  );
}

function shouldCollectHref(tagName: string, attrs: Map<string, string>) {
  if (tagName !== 'link') return false;
  const rel = String(attrs.get('rel') || '').toLowerCase();
  if (!rel) return false;
  return rel.split(/\s+/).some((item) => (
    item === 'stylesheet' ||
    item === 'icon' ||
    item === 'apple-touch-icon' ||
    item === 'manifest' ||
    item === 'preload' ||
    item === 'modulepreload' ||
    item === 'prefetch'
  ));
}

function rewriteHtmlReference(raw: string, baseDir: string) {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('/') || trimmed.startsWith('#')) return raw;
  const resolved = resolveReferencedPath(raw, baseDir);
  if (!resolved) return raw;
  const suffix = referenceSuffix(trimmed);
  return `${resolved}${suffix}`;
}

function referenceSuffix(raw: string) {
  const queryIdx = raw.indexOf('?');
  const hashIdx = raw.indexOf('#');
  const suffixIdx =
    queryIdx === -1 ? hashIdx : hashIdx === -1 ? queryIdx : Math.min(queryIdx, hashIdx);
  return suffixIdx === -1 ? '' : raw.slice(suffixIdx);
}

async function pollVercelDeployment(config: DeployConfig, id: string) {
  let last: JsonObject | null = null;
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, i < 5 ? 1000 : 2000));
    const resp = await fetch(
      `${VERCEL_API}/v13/deployments/${encodeURIComponent(id)}${vercelTeamQuery(config)}`,
      { headers: { Authorization: `Bearer ${config.token}` } },
    );
    const json = await readVercelJson(resp);
    if (!resp.ok) throw vercelError(json, resp.status);
    last = json;
    if (json.readyState === 'READY' || json.readyState === 'ERROR') return json;
  }
  return last;
}

export async function waitForReachableDeploymentUrl(
  urls: unknown[],
  { timeoutMs = 60_000, intervalMs = 2_000, providerLabel = 'Deployment provider' } = {},
) {
  const candidates = [...new Set((urls || []).map(normalizeDeploymentUrl).filter(Boolean))];
  const fallbackUrl = candidates[0] || '';
  if (!fallbackUrl) {
    return {
      status: 'link-delayed',
      url: '',
      statusMessage: `${providerLabel} did not return a public deployment URL.`,
    };
  }

  const startedAt = Date.now();
  let lastMessage = '';
  while (Date.now() - startedAt <= timeoutMs) {
    for (const url of candidates) {
      const result = await checkDeploymentUrl(url);
      if (result.reachable) {
        return {
          status: 'ready',
          url,
          statusMessage: 'Public link is ready.',
          reachableAt: Date.now(),
        };
      }
      if (result.status === 'protected') {
        return {
          status: 'protected',
          url,
          statusMessage: result.statusMessage || VERCEL_PROTECTED_MESSAGE,
        };
      }
      lastMessage = result.statusMessage || lastMessage;
    }
    if (Date.now() - startedAt >= timeoutMs) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return {
    status: 'link-delayed',
    url: fallbackUrl,
    statusMessage:
      lastMessage || `${providerLabel} returned a deployment URL, but it is not reachable yet.`,
  };
}

export async function checkDeploymentUrl(url: unknown, { timeoutMs = 8_000 }: { timeoutMs?: number } = {}): Promise<DeploymentUrlCheck> {
  const normalized = normalizeDeploymentUrl(url);
  if (!normalized) {
    return { reachable: false, statusMessage: 'Deployment URL is empty.' };
  }
  const head = await requestDeploymentUrl(normalized, 'HEAD', timeoutMs);
  if (head.reachable) return head;
  if (head.status === 'protected') return head;
  if (head.statusCode && (head.statusCode === 405 || head.statusCode === 403 || head.statusCode >= 400)) {
    const get = await requestDeploymentUrl(normalized, 'GET', timeoutMs);
    if (get.reachable) return get;
    if (get.status === 'protected') return get;
    return get.statusMessage ? get : head;
  }
  const get = await requestDeploymentUrl(normalized, 'GET', timeoutMs);
  return get.reachable ? get : (get.statusMessage ? get : head);
}

async function requestDeploymentUrl(url: string, method: 'HEAD' | 'GET', timeoutMs: number): Promise<DeploymentUrlCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method,
      redirect: 'manual',
      signal: controller.signal,
    });
    if (resp.status >= 200 && resp.status < 400) {
      return { reachable: true, statusCode: resp.status };
    }
    const body = method === 'GET' || resp.status === 401
      ? await resp.text()
      : '';
    if (resp.status === 401 && isVercelProtectedResponse(resp, body)) {
      return {
        reachable: false,
        status: 'protected',
        statusCode: resp.status,
        statusMessage: VERCEL_PROTECTED_MESSAGE,
      };
    }
    return {
      reachable: false,
      statusCode: resp.status,
      statusMessage: `Public link returned HTTP ${resp.status}.`,
    };
  } catch (err) {
    return {
      reachable: false,
      statusMessage: `Public link is not reachable yet: ${errorMessage(err, String(err))}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function isVercelProtectedResponse(resp: Response, body = '') {
  const server = resp.headers?.get?.('server') || '';
  const setCookie = resp.headers?.get?.('set-cookie') || '';
  const text = String(body || '');
  return (
    /vercel/i.test(server) ||
    /_vercel_sso_nonce/i.test(setCookie) ||
    /Authentication Required/i.test(text) ||
    /Vercel Authentication/i.test(text) ||
    /vercel\.com\/sso-api/i.test(text)
  );
}

export function deploymentUrlCandidates(...responses: MaybeJsonObject[]) {
  const urls: string[] = [];
  for (const json of responses) {
    if (!json) continue;
    if (json.url) urls.push(json.url);
    for (const alias of json.alias ?? []) urls.push(alias);
    for (const alias of json.aliases ?? []) {
      if (typeof alias === 'string') urls.push(alias);
      else if (alias?.domain) urls.push(alias.domain);
      else if (alias?.url) urls.push(alias.url);
    }
  }
  return [...new Set(urls.map(normalizeDeploymentUrl).filter(Boolean))];
}

export function normalizeDeploymentUrl(url: unknown) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function vercelTeamQuery(config: DeployConfig) {
  const params = new URLSearchParams();
  if (config.teamId) params.set('teamId', config.teamId);
  else if (config.teamSlug) params.set('slug', config.teamSlug);
  const s = params.toString();
  return s ? `?${s}` : '';
}

function cloudflareAccountPagesProjectsUrl(config: DeployConfig) {
  if (!config.accountId) throw new DeployError('Cloudflare account ID is required.', 400);
  return `${CLOUDFLARE_API}/accounts/${encodeURIComponent(config.accountId)}/pages/projects`;
}

function cloudflarePagesProjectUrl(config: DeployConfig, suffix = '') {
  if (!config.projectName) throw new DeployError('Cloudflare Pages project name could not be generated.', 400);
  const base = `${cloudflareAccountPagesProjectsUrl(config)}/${encodeURIComponent(config.projectName)}`;
  return suffix ? `${base}/${suffix}` : base;
}

function cloudflarePagesProductionUrl(config: DeployConfig) {
  return config?.projectName ? `https://${config.projectName}.pages.dev` : '';
}

function cloudflareZoneDnsRecordsUrl(zoneId: string) {
  return `${CLOUDFLARE_API}/zones/${encodeURIComponent(zoneId)}/dns_records`;
}

export function cloudflarePagesProjectNameForProject(projectId: string, projectName = '') {
  const idSuffix = safeDnsLabel(projectId).slice(0, 12) || randomUUID().slice(0, 8);
  const nameBase = safeDnsLabel(projectName) || 'project';
  const fixedLength = 'od--'.length + idSuffix.length;
  const baseLength = Math.max(1, 63 - fixedLength);
  return safeDnsLabel(`od-${nameBase.slice(0, baseLength)}-${idSuffix}`);
}

function cloudflareHeaders(config: DeployConfig, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${config.token}`,
    ...extra,
  };
}

function cloudflareAssetHeaders(token: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function readCloudflareJson(resp: Response): Promise<JsonObject> {
  try {
    return await resp.json() as JsonObject;
  } catch {
    throw new DeployError('Cloudflare returned a non-JSON response.', resp.status || 502);
  }
}

async function fetchCloudflarePaginatedResult(config: DeployConfig, buildUrl: (page: number, perPage: number) => string, fallback: string, options: { perPage?: number } = {}) {
  const results: JsonObject[] = [];
  const perPage = options.perPage || CLOUDFLARE_API_PAGE_SIZE;
  for (let page = 1; page <= CLOUDFLARE_API_MAX_PAGES; page += 1) {
    const resp = await fetch(buildUrl(page, perPage), {
      headers: cloudflareHeaders(config),
    });
    const json = await readCloudflareJson(resp);
    if (!resp.ok || json?.success === false) {
      throw cloudflareError(json, resp.status, fallback);
    }
    const pageItems = Array.isArray(json?.result) ? json.result : [];
    results.push(...pageItems);
    if (!shouldFetchNextCloudflarePage(json?.result_info, page, perPage, pageItems.length)) break;
  }
  return results;
}

function shouldFetchNextCloudflarePage(resultInfo: JsonObject | undefined, page: number, perPage: number, itemCount: number) {
  if (itemCount <= 0) return false;
  const totalPages = Number(resultInfo?.total_pages);
  if (Number.isFinite(totalPages) && totalPages > 0) return page < totalPages;
  const totalCount = Number(resultInfo?.total_count);
  const responsePerPage = Number(resultInfo?.per_page);
  const effectivePerPage = Number.isFinite(responsePerPage) && responsePerPage > 0
    ? responsePerPage
    : perPage;
  if (Number.isFinite(totalCount) && totalCount >= 0) {
    return page * effectivePerPage < totalCount;
  }
  const count = Number(resultInfo?.count);
  if (Number.isFinite(count) && count >= 0) return count >= effectivePerPage;
  return itemCount >= perPage;
}

async function readVercelJson(resp: Response): Promise<JsonObject> {
  try {
    return await resp.json() as JsonObject;
  } catch {
    throw new DeployError('Vercel returned a non-JSON response.', resp.status || 502);
  }
}

function cloudflareError(json: JsonObject, status: number, fallback: string) {
  const message =
    json?.errors?.find?.((err: JsonObject) => err?.message)?.message ||
    json?.messages?.find?.((item: JsonObject) => item?.message)?.message ||
    json?.message ||
    fallback ||
    `Cloudflare request failed (${status}).`;
  return new DeployError(message, status, json);
}

function isCloudflareAlreadyExists(body: unknown) {
  const text = JSON.stringify(body || {}).toLowerCase();
  return (
    text.includes('already exists') ||
    text.includes('already exist') ||
    text.includes('already bound') ||
    text.includes('already been taken') ||
    text.includes('already in use') ||
    text.includes('duplicate')
  );
}

function isCloudflareCommentError(value: unknown) {
  return /comment/i.test(typeof value === 'string' ? value : JSON.stringify(value || {}));
}

function vercelError(json: JsonObject, status: number) {
  const code = json?.error?.code;
  const message = json?.error?.message || json?.message || `Vercel request failed (${status}).`;
  if (code === 'forbidden' || /permission/i.test(message)) {
    return new DeployError("You don't have permission to create a project.", status, json);
  }
  return new DeployError(message, status, json);
}

function deploymentUrl(json: JsonObject | null | undefined) {
  const url = json?.url || json?.alias?.[0] || '';
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function hostnameFromUrl(raw: unknown) {
  const normalized = normalizeDeploymentUrl(raw);
  if (!normalized) return '';
  try {
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return normalizeHostname(raw);
  }
}

function normalizeHostname(raw: unknown) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]!
    .replace(/\.$/, '');
}

function normalizeCloudflareZoneName(raw: unknown) {
  return normalizeHostname(raw);
}

function isValidCloudflareZoneName(raw: unknown) {
  const name = normalizeCloudflareZoneName(raw);
  if (!name || name.length > 253 || name.includes('..')) return false;
  return name.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

function normalizeCloudflareDomainPrefix(raw: unknown) {
  const prefix = String(raw || '').trim().toLowerCase();
  if (!prefix || prefix === '@' || prefix.includes('.') || prefix.includes('*')) return '';
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(prefix) ? prefix : '';
}

function cloudflarePagesDnsMarker(projectId: string, projectName: string, pagesTarget: string) {
  return `od:cfp:${shortCloudflareHash(projectId || projectName)}:${shortCloudflareHash(pagesTarget || projectName)}`;
}

function shortCloudflareHash(value: unknown) {
  return blake3Hash(String(value || '')).toString('hex').slice(0, 12);
}

function safeVercelProjectName(raw: unknown) {
  return safeProjectLabel(raw, 80) || `od-${randomUUID().slice(0, 8)}`;
}

function safeDnsLabel(raw: unknown) {
  return safeProjectLabel(raw, 63);
}

function safeProjectLabel(raw: unknown, maxLength: number) {
  return String(raw)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

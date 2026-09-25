import { createHash } from 'node:crypto';
import path from 'node:path';
import { CLOUDFLARE_WORKERS_PROVIDER_ID, DeployError } from '../deploy.js';

type JsonObject = Record<string, unknown>;

type WorkersDeployConfig = {
  token: string;
  accountId: string;
  scriptName?: string | undefined;
  compatibilityDate?: string | undefined;
  bindings?: CloudflareWorkersBinding[] | undefined;
};

type WorkersFile = {
  file: string;
  data: Buffer | Uint8Array | string;
  contentType?: string;
};

type CloudflareWorkersDeployResult = {
  providerId: string;
  url: string;
  deploymentId: string;
  target: 'preview' | 'production';
  status: string;
  statusMessage?: string;
  reachableAt?: number;
  providerMetadata?: JsonObject;
};

type DeployStep = {
  name: string;
  status: 'done' | 'error';
  detail?: string;
};

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
const WORKERS_ASSET_MAX_FILE_BYTES = 25 * 1024 * 1024;
const WORKERS_ASSET_MAX_FILE_COUNT = 20000;
const WORKERS_SCRIPT_NAME_MAX_LENGTH = 63;
const DEFAULT_WORKER_MODULE = 'export default { fetch: (req, env) => env.ASSETS.fetch(req) };';
const DEFAULT_COMPATIBILITY_DATE = '2025-01-01';

function cloudflareHeaders(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: 'Bearer ' + token, ...extra };
}

async function readCloudflareJson(resp: Response): Promise<JsonObject> {
  try {
    return (await resp.json()) as JsonObject;
  } catch {
    throw new DeployError('Cloudflare returned a non-JSON response.', resp.status || 502, undefined, 'CF_BAD_RESPONSE');
  }
}

function cloudflareErrorMessage(json: JsonObject, fallback: string | undefined, status: number): string {
  const errors = Array.isArray(json?.errors) ? (json.errors as JsonObject[]) : [];
  const messages = Array.isArray(json?.messages) ? (json.messages as JsonObject[]) : [];
  const message =
    errors.find((err) => err?.message)?.message ||
    messages.find((item) => item?.message)?.message ||
    json?.message ||
    fallback ||
    'Cloudflare request failed (' + status + ').';
  return String(message);
}

function cloudflareError(json: JsonObject, status: number, fallback: string): DeployError {
  const message = cloudflareErrorMessage(json, fallback, status);
  if (status === 403) return new DeployError(message, status, json, 'PROVIDER_FORBIDDEN');
  if (status === 413) return new DeployError(message, status, json, 'CFW_ASSET_TOO_LARGE');
  return new DeployError(message, status, json);
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  // Non-idempotent methods (POST/PATCH) may already have committed before a 5xx
  // is returned, so retrying a 5xx would mint duplicate resources (immutable
  // versions, orphan D1 databases, duplicate IdPs). A 429 is always safe to
  // retry — the request was rate-limited, not processed. Idempotent verbs retry
  // both 429 and 5xx.
  const method = (init.method ?? 'GET').toUpperCase();
  const nonIdempotent = method === 'POST' || method === 'PATCH';
  let last: Response | undefined;
  for (let i = 0; i < attempts; i += 1) {
    const resp = await fetch(url, init);
    const is429 = resp.status === 429;
    const is5xx = resp.status >= 500 && resp.status < 600;
    if (!is429 && !(is5xx && !nonIdempotent)) return resp;
    last = resp;
    if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** i));
  }
  return last as unknown as Response;
}

// Follow `result_info.total_pages` so a resource beyond page 1 is never missed
// (a missed page turns a list-then-create into a duplicate create).
async function listCloudflareAllPages(config: WorkersDeployConfig, path: string, perPage = 100): Promise<JsonObject[]> {
  const base = CLOUDFLARE_API + path;
  const all: JsonObject[] = [];
  let page = 1;
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const resp = await fetchWithRetry(
      base + sep + 'page=' + page + '&per_page=' + perPage,
      { method: 'GET', headers: cloudflareHeaders(config.token) },
    );
    // Degrade to an empty list on a non-ok or malformed response so the zones/
    // D1/R2 pickers can fall back to free-text input. Fail-closed list
    // semantics live in the deploy-path functions that need them (e.g.
    // findCloudflareAccessAppByWorker throws on a list error in its own loop).
    if (!resp.ok) return [];
    let json: JsonObject;
    try {
      json = (await resp.json()) as JsonObject;
    } catch {
      return [];
    }
    if (json.success !== true || !Array.isArray(json.result)) return [];
    all.push(...(json.result as JsonObject[]));
    const info = (json.result_info ?? {}) as JsonObject;
    const totalPages = typeof info.total_pages === 'number' && info.total_pages > 0 ? info.total_pages : 1;
    if (page >= totalPages) return all;
    page += 1;
  }
}

function cloudflareWorkersAssetPathKey(file: string): string {
  const normalized = '/' + file.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.split('/').includes('..')) {
    throw new DeployError('Asset path "' + file + '" contains an invalid ".." segment.', 400, undefined, 'CFW_UPLOAD_FAILED');
  }
  return normalized;
}

export function cloudflareWorkersAssetHash(file: Pick<WorkersFile, 'file' | 'data'>): string {
  const data = Buffer.from(file.data);
  const extension = path.posix.extname(file.file).slice(1);
  return createHash('sha256').update(data.toString('base64') + extension).digest('hex').slice(0, 32);
}

export function cloudflareWorkersScriptNameForProject(name: string): string {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, WORKERS_SCRIPT_NAME_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');
  if (!slug) {
    throw new DeployError('Could not generate a valid Workers script name from the project name.', 400, undefined, 'CFW_SCRIPT_UPLOAD_FAILED');
  }
  return slug;
}

function resolveWorkerScriptName(override: string | undefined, fallbackName: string): string {
  if (override) {
    const valid = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(override);
    if (!valid) {
      throw new DeployError(
        'Invalid Workers script name "' + override + '". Use lowercase letters, numbers and dashes (max 63 chars, no leading/trailing dash).',
        400,
        undefined,
        'CFW_SCRIPT_UPLOAD_FAILED',
      );
    }
    return override;
  }
  return cloudflareWorkersScriptNameForProject(fallbackName);
}

function splitWorkerModule(files: WorkersFile[]): { moduleCode: string; assetFiles: WorkersFile[] } {
  const entry = files.find((file) => file.file === '_worker.js' || file.file === 'worker.js');
  if (entry) {
    return { moduleCode: Buffer.from(entry.data).toString('utf8'), assetFiles: files.filter((file) => file !== entry) };
  }
  return { moduleCode: DEFAULT_WORKER_MODULE, assetFiles: files };
}

function buildCloudflareWorkersManifest(files: WorkersFile[]): { manifest: JsonObject; hashToFile: Map<string, WorkersFile> } {
  if (files.length > WORKERS_ASSET_MAX_FILE_COUNT) {
    throw new DeployError(
      'Too many assets: ' + files.length + ' exceeds the ' + WORKERS_ASSET_MAX_FILE_COUNT + ' file limit.',
      400,
      undefined,
      'CFW_TOO_MANY_ASSETS',
    );
  }
  const manifest: JsonObject = {};
  const hashToFile = new Map<string, WorkersFile>();
  for (const file of files) {
    const raw = Buffer.from(file.data);
    if (raw.length > WORKERS_ASSET_MAX_FILE_BYTES) {
      throw new DeployError(
        'Asset "' + file.file + '" is ' + raw.length + ' bytes, over the 25 MiB limit.',
        400,
        undefined,
        'CFW_ASSET_TOO_LARGE',
      );
    }
    const key = cloudflareWorkersAssetPathKey(file.file);
    const hash = cloudflareWorkersAssetHash(file);
    manifest[key] = { hash, size: raw.length };
    hashToFile.set(hash, file);
  }
  return { manifest, hashToFile };
}

async function startAssetsUploadSession(config: WorkersDeployConfig, scriptName: string, manifest: JsonObject): Promise<{ jwt: string; buckets: string[][] }> {
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/scripts/' + encodeURIComponent(scriptName) + '/assets-upload-session',
    { method: 'POST', headers: cloudflareHeaders(config.token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ manifest }) },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare assets upload session failed.');
  const result = (json.result ?? {}) as JsonObject;
  return { jwt: String(result.jwt ?? ''), buckets: (Array.isArray(result.buckets) ? result.buckets : []) as string[][] };
}

async function uploadAssetBuckets(
  config: WorkersDeployConfig,
  sessionJwt: string,
  buckets: string[][],
  hashToFile: Map<string, WorkersFile>,
): Promise<string> {
  let completionJwt = sessionJwt;
  for (const bucket of buckets) {
    const form = new FormData();
    for (const hash of bucket) {
      const file = hashToFile.get(hash);
      if (!file) continue;
      const content = Buffer.from(file.data).toString('base64');
      form.append(hash, new Blob([content], { type: file.contentType || 'application/octet-stream' }));
    }
    const resp = await fetchWithRetry(
      CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/assets/upload?base64=true',
      { method: 'POST', headers: { Authorization: 'Bearer ' + sessionJwt }, body: form },
    );
    const json = await readCloudflareJson(resp);
    // A 200-with-error-envelope (`{success:false, errors:[…]}`) must fail closed,
    // not silently leave completionJwt at the previous bucket's value.
    if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare assets upload failed.');
    const result = (json.result ?? {}) as JsonObject;
    if (result.jwt) completionJwt = String(result.jwt);
  }
  return completionJwt;
}

function workerMetadata(config: WorkersDeployConfig, assetsJwt?: string, runWorkerFirst = false): JsonObject {
  const metadata: JsonObject = {
    main_module: 'index.js',
    compatibility_date: config.compatibilityDate || DEFAULT_COMPATIBILITY_DATE,
    keep_bindings: ['secret_text', 'secret_key'],
  };
  const userBindings: JsonObject[] = (config.bindings || []).map((b) => {
    const out: JsonObject = { type: b.type, name: b.name };
    if (b.bucketName !== undefined) out.bucket_name = b.bucketName;
    if (b.id !== undefined) out.id = b.id;
    return out;
  });
  if (assetsJwt !== undefined) {
    metadata.bindings = [{ name: 'ASSETS', type: 'assets' }, ...userBindings];
    const assets: JsonObject = { jwt: assetsJwt };
    if (runWorkerFirst) assets.config = { run_worker_first: true };
    metadata.assets = assets;
  } else if (userBindings.length > 0) {
    metadata.bindings = userBindings;
  }
  return metadata;
}

async function uploadWorkerScript(config: WorkersDeployConfig, scriptName: string, moduleCode: string, assetsJwt: string, runWorkerFirst = false): Promise<JsonObject> {
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(workerMetadata(config, assetsJwt, runWorkerFirst))], { type: 'application/json' }));
  form.append('index.js', new Blob([moduleCode], { type: 'application/javascript+module' }), 'index.js');
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/scripts/' + encodeURIComponent(scriptName),
    { method: 'PUT', headers: cloudflareHeaders(config.token), body: form },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare Workers script upload failed.');
  return json;
}

async function uploadWorkerVersion(config: WorkersDeployConfig, scriptName: string, moduleCode: string, assetsJwt: string, runWorkerFirst = false): Promise<string> {
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(workerMetadata(config, assetsJwt, runWorkerFirst))], { type: 'application/json' }));
  form.append('index.js', new Blob([moduleCode], { type: 'application/javascript+module' }), 'index.js');
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/scripts/' + encodeURIComponent(scriptName) + '/versions',
    { method: 'POST', headers: cloudflareHeaders(config.token), body: form },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare Workers version upload failed.');
  const result = (json.result ?? {}) as JsonObject;
  return String(result.id ?? '');
}

async function readAccountSubdomain(config: WorkersDeployConfig): Promise<string> {
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/subdomain',
    { method: 'GET', headers: cloudflareHeaders(config.token) },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare workers.dev subdomain lookup failed.');
  const subdomain = (json.result ?? {}) as JsonObject;
  if (typeof subdomain.subdomain !== 'string' || !subdomain.subdomain) {
    throw new DeployError(
      'This Cloudflare account has no workers.dev subdomain. Set one in the Cloudflare dashboard before deploying.',
      400,
      undefined,
      'CFW_SUBDOMAIN_FAILED',
    );
  }
  return subdomain.subdomain;
}

async function enableWorkerSubdomain(config: WorkersDeployConfig, scriptName: string, subdomain: string): Promise<string> {
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/scripts/' + encodeURIComponent(scriptName) + '/subdomain',
    { method: 'POST', headers: cloudflareHeaders(config.token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ enabled: true, previews_enabled: true }) },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare workers.dev enable failed.');
  return 'https://' + scriptName + '.' + subdomain + '.workers.dev';
}

export async function deployToCloudflareWorkers(input: {
  config: {
    token: string;
    accountId?: string | undefined;
    scriptName?: string | undefined;
    compatibilityDate?: string | undefined;
    bindings?: CloudflareWorkersBinding[] | undefined;
  };
  files: WorkersFile[];
  projectId?: string;
  projectName?: string;
  target?: 'preview' | 'production';
  customDomain?: { hostname: string; zoneId: string } | undefined;
}): Promise<CloudflareWorkersDeployResult> {
  const { config, files, projectId = '', projectName = '', target = 'production', customDomain } = input ?? {};
  const accountId = config?.accountId;
  if (!accountId) throw new DeployError('Cloudflare account ID is required.', 400, undefined, 'CFW_ACCOUNT_ID_REQUIRED');
  const token: string = config.token;
  if (!token) throw new DeployError('Cloudflare API token is required.', 400, undefined, 'CFW_TOKEN_REQUIRED');
  const cfg: WorkersDeployConfig = {
    token,
    accountId,
    scriptName: config.scriptName,
    compatibilityDate: config.compatibilityDate,
    bindings: config.bindings,
  };
  if (cfg.bindings && cfg.bindings.length > 0) {
    const resolved = cfg.bindings.map((binding) => ({ ...binding }));
    for (const binding of resolved) {
      if (binding.type === 'd1' && binding.databaseName && !binding.id) {
        binding.id = await ensureCloudflareD1Database(cfg, binding.databaseName);
      }
      if (binding.type === 'r2_bucket' && binding.bucketName) {
        await ensureCloudflareR2Bucket(cfg, binding.bucketName);
      }
    }
    cfg.bindings = resolved;
  }
  const bindingTypes = new Set((cfg.bindings || []).map((b) => b.type));
  const needsR2 = bindingTypes.has('r2_bucket');
  const needsD1 = bindingTypes.has('d1');
  if (needsR2 || needsD1) {
    const caps = await probeCloudflareWorkersCapabilities({ token: cfg.token, accountId: cfg.accountId });
    if (needsR2 && !caps.r2) throw new DeployError('Cloudflare R2 is not enabled on this account. Enable R2 in the dashboard.', 400, undefined, 'CFW_R2_UNAVAILABLE');
    if (needsD1 && !caps.d1) throw new DeployError('This Cloudflare token lacks D1 permission.', 400, undefined, 'CFW_D1_UNAVAILABLE');
  }

  const steps: DeployStep[] = [];
  try {
    const scriptName = resolveWorkerScriptName(cfg.scriptName, projectName || projectId);
    const { moduleCode, assetFiles } = splitWorkerModule(files);
    const isCustomModule = moduleCode !== DEFAULT_WORKER_MODULE;
    const { manifest, hashToFile } = buildCloudflareWorkersManifest(assetFiles);
    const session = await startAssetsUploadSession(cfg, scriptName, manifest);
    const completionJwt = await uploadAssetBuckets(cfg, session.jwt, session.buckets, hashToFile);
    steps.push({ name: 'assets', status: 'done', detail: String(assetFiles.length) });

    if (target === 'preview') {
      const subdomain = await readAccountSubdomain(cfg);
      const versionId = await uploadWorkerVersion(cfg, scriptName, moduleCode, completionJwt, isCustomModule);
      steps.push({ name: 'version', status: 'done' });
      const metadata: JsonObject = { scriptName, versionId };
      metadata.steps = steps;
      const prefix = versionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'preview';
      return {
        providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
        url: 'https://' + prefix + '-' + scriptName + '.' + subdomain + '.workers.dev',
        deploymentId: versionId,
        target,
        status: 'ready',
        reachableAt: Date.now(),
        providerMetadata: metadata,
      };
    }

    await uploadWorkerScript(cfg, scriptName, moduleCode, completionJwt, isCustomModule);
    steps.push({ name: 'script', status: 'done' });
    const subdomain = await readAccountSubdomain(cfg);
    const url = 'https://' + scriptName + '.' + subdomain + '.workers.dev';
    const metadata: JsonObject = { scriptName };
    await enableWorkerSubdomain(cfg, scriptName, subdomain);
    steps.push({ name: 'subdomain', status: 'done', detail: url });
    try {
      const checkResp = await fetch(url, { method: 'HEAD', redirect: 'manual' });
      const check: JsonObject = { status: checkResp.status, ok: checkResp.ok };
      if (checkResp.status >= 500 || checkResp.status === 1101) check.detail = 'worker-runtime-error';
      metadata.check = check;
    } catch {
      // A failed post-deploy probe is non-fatal; the deploy still succeeded.
    }
    if (customDomain) {
      await attachCloudflareWorkerDomain(cfg, { hostname: customDomain.hostname, service: scriptName, zone_id: customDomain.zoneId });
      metadata.customDomain = { hostname: customDomain.hostname, url: 'https://' + customDomain.hostname };
      steps.push({ name: 'custom-domain', status: 'done', detail: customDomain.hostname });
    }
    metadata.steps = steps;
    return {
      providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
      url,
      deploymentId: scriptName,
      target,
      status: 'ready',
      reachableAt: Date.now(),
      providerMetadata: metadata,
    };
  } catch (err) {
    if (err instanceof DeployError) {
      steps.push({ name: 'error', status: 'error', detail: err.message });
      (err as DeployError & { steps?: DeployStep[] }).steps = steps;
    }
    throw err;
  }
}

export type CloudflareWorkersBinding = {
  type: string;
  name: string;
  bucketName?: string;
  databaseName?: string;
  id?: string;
};

export type CloudflareWorkersCapabilities = {
  workers: boolean;
  workersDevSubdomain: string;
  r2: boolean;
  r2Reason?: string;
  d1: boolean;
  d1Reason?: string;
};

export async function probeCloudflareWorkersCapabilities(input: { token: string; accountId: string }): Promise<CloudflareWorkersCapabilities> {
  const token = input.token;
  const accountId = input.accountId;
  const base = CLOUDFLARE_API + '/accounts/' + encodeURIComponent(accountId);
  const caps: CloudflareWorkersCapabilities = { workers: false, workersDevSubdomain: '', r2: false, d1: false };

  async function probe(path: string): Promise<{ success: boolean; code?: number; subdomain?: string }> {
    try {
      const resp = await fetch(base + path, { headers: cloudflareHeaders(token) });
      const json = (await resp.json().catch(() => ({}))) as JsonObject;
      const errs = (Array.isArray(json.errors) ? json.errors : []) as JsonObject[];
      const code = typeof errs[0]?.code === 'number' ? (errs[0].code as number) : undefined;
      const subdomain = ((json.result as JsonObject | undefined)?.subdomain as string | undefined) || '';
      const result: { success: boolean; code?: number; subdomain?: string } = { success: json.success === true };
      if (code !== undefined) result.code = code;
      if (subdomain) result.subdomain = subdomain;
      return result;
    } catch {
      return { success: false };
    }
  }

  const workers = await probe('/workers/scripts');
  caps.workers = workers.success;

  const sub = await probe('/workers/subdomain');
  caps.workersDevSubdomain = sub.subdomain || '';

  const r2 = await probe('/r2/buckets');
  caps.r2 = r2.success;
  if (!r2.success) caps.r2Reason = r2.code === 10042 ? 'r2-not-enabled' : r2.code === 10000 ? 'no-permission' : 'unknown';

  const d1 = await probe('/d1/database');
  caps.d1 = d1.success;
  if (!d1.success) caps.d1Reason = d1.code === 10000 ? 'no-permission' : 'unknown';

  return caps;
}

export type CloudflareR2Bucket = { name: string };
export type CloudflareD1Database = { name: string; id: string };

/** List an account's R2 buckets. A not-enabled R2 error (and any other
 * Cloudflare failure, e.g. a token without R2 permission) resolves to an
 * empty list rather than throwing, so the bindings editor can fall back to a
 * free-text bucket name input. */
export async function listCloudflareR2Buckets(
  token: string,
  accountId: string,
): Promise<CloudflareR2Bucket[]> {
  const base = CLOUDFLARE_API + '/accounts/' + encodeURIComponent(accountId) + '/r2/buckets';
  const out: CloudflareR2Bucket[] = [];
  let cursor: string | undefined;
  for (;;) {
    const url = base + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '');
    const resp = await fetch(url, { headers: cloudflareHeaders(token) });
    const json = (await resp.json().catch(() => ({}))) as JsonObject;
    if (!resp.ok || json.success !== true) return out;
    const result = json.result as JsonObject | undefined;
    const buckets = Array.isArray(result?.buckets) ? (result.buckets as JsonObject[]) : [];
    for (const bucket of buckets) {
      const name = typeof bucket?.name === 'string' ? bucket.name : '';
      if (name) out.push({ name });
    }
    const nextCursor = typeof result?.cursor === 'string' && result.cursor.length > 0 ? result.cursor : undefined;
    if (!nextCursor) return out;
    cursor = nextCursor;
  }
}

/** List an account's D1 databases by uuid (the id a Workers binding needs). */
export async function listCloudflareD1Databases(
  token: string,
  accountId: string,
): Promise<CloudflareD1Database[]> {
  const databases = await listCloudflareAllPages(
    { token, accountId } as WorkersDeployConfig,
    '/accounts/' + encodeURIComponent(accountId) + '/d1/database',
  );
  return databases
    .map((db) => ({
      name: typeof db?.name === 'string' ? db.name : '',
      id: typeof db?.uuid === 'string' ? db.uuid : '',
    }))
    .filter((db) => db.name.length > 0 && db.id.length > 0);
}

/** Resolve a D1 database by human name, creating it when it does not exist.
 * Returns the database uuid a Workers binding needs. */
export async function ensureCloudflareD1Database(config: WorkersDeployConfig, databaseName: string): Promise<string> {
  const existing = await listCloudflareD1Databases(config.token, config.accountId);
  const match = existing.find((db) => db.name === databaseName);
  if (match) return match.id;
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/d1/database',
    { method: 'POST', headers: cloudflareHeaders(config.token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ name: databaseName }) },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare D1 database creation failed.');
  const result = (json.result ?? {}) as JsonObject;
  return String(result.uuid ?? '');
}

/** Resolve an R2 bucket by name, creating it when it does not exist. The
 * bucket name is the identifier, so it is returned unchanged. */
export async function ensureCloudflareR2Bucket(config: WorkersDeployConfig, bucketName: string): Promise<string> {
  const existing = await listCloudflareR2Buckets(config.token, config.accountId);
  if (existing.some((bucket) => bucket.name === bucketName)) return bucketName;
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/r2/buckets',
    { method: 'POST', headers: cloudflareHeaders(config.token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ name: bucketName }) },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare R2 bucket creation failed.');
  return bucketName;
}

/** List an account's zones. A non-ok response or error resolves to an empty
 * list so the domain picker can degrade to free-text input. */
export async function listCloudflareZones(config: WorkersDeployConfig): Promise<{ id: string; name: string; status: string }[]> {
  // Zones are a top-level resource filtered by account id, not nested under
  // /accounts/{id} (that path 404s with "No route for that URI").
  const zones = await listCloudflareAllPages(
    config,
    '/zones?account.id=' + encodeURIComponent(config.accountId),
    50,
  );
  return zones.map((zone) => ({
    id: typeof zone?.id === 'string' ? zone.id : '',
    name: typeof zone?.name === 'string' ? zone.name : '',
    status: typeof zone?.status === 'string' ? zone.status : '',
  }));
}

/** Attach a hostname within an account zone to a Workers script as a custom
 * domain (production environment). */
export async function attachCloudflareWorkerDomain(
  config: WorkersDeployConfig,
  input: { hostname: string; service: string; zone_id: string },
): Promise<void> {
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/domains',
    {
      method: 'PUT',
      headers: cloudflareHeaders(config.token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ hostname: input.hostname, service: input.service, zone_id: input.zone_id, environment: 'production' }),
    },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) {
    // A hostname already bound to a DIFFERENT worker/service surfaces as a
    // conflict from Cloudflare. Map it to a specific code so the client can
    // tell "already taken" apart from auth/quota/transport failures.
    const message = cloudflareErrorMessage(json, 'Cloudflare Workers custom domain attach failed.', resp.status);
    if (/already|conflict|another/i.test(message)) {
      throw new DeployError(message, resp.status, json, 'CFW_DOMAIN_CONFLICT');
    }
    throw cloudflareError(json, resp.status, 'Cloudflare Workers custom domain attach failed.');
  }
}

/** Detach a custom domain from Workers. A 404 means the hostname is already
 * gone, which is treated as a no-op and reported as false (the caller can
 * distinguish "deleted" from "already absent"). */
export async function detachCloudflareWorkerDomain(config: WorkersDeployConfig, domainId: string): Promise<boolean> {
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/domains/' + encodeURIComponent(domainId),
    { method: 'DELETE', headers: cloudflareHeaders(config.token) },
  );
  if (resp.status === 404) return false;
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare Workers custom domain detach failed.');
  return true;
}

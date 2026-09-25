import { createHash } from 'node:crypto';
import path from 'node:path';
import { CLOUDFLARE_WORKERS_PROVIDER_ID, DeployError, getCloudflareAccessToken, getCloudflareOAuthStoredEmail, isCloudflareAccessRedirect, normalizeCloudflareWorkersBindings } from '../deploy.js';

type JsonObject = Record<string, unknown>;

/** The bearer credential a Cloudflare call is signed with. A static string is
 * the configured API token; a provider is re-resolved before EVERY request so a
 * deploy that outlives an OAuth access token's remaining lifetime picks up the
 * refreshed token instead of sending one captured at deploy start. */
export type CloudflareTokenProvider = () => Promise<string>;

type WorkersDeployConfig = {
  token: string | CloudflareTokenProvider;
  accountId: string;
  scriptName?: string | undefined;
  compatibilityDate?: string | undefined;
  credentialMode?: string | undefined;
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

async function resolveConfigToken(config: Pick<WorkersDeployConfig, 'token'>): Promise<string> {
  return typeof config.token === 'function' ? config.token() : config.token;
}

// Every authenticated call goes through here so the credential is resolved at
// request time (see CloudflareTokenProvider), never captured once per deploy.
async function authHeaders(config: Pick<WorkersDeployConfig, 'token'>, extra: Record<string, string> = {}): Promise<Record<string, string>> {
  return cloudflareHeaders(await resolveConfigToken(config), extra);
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

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3, options: { retryServerErrors?: boolean } = {}): Promise<Response> {
  // Non-idempotent methods (POST/PATCH) may already have committed before a 5xx
  // is returned, so retrying a 5xx would mint duplicate resources (immutable
  // versions, orphan D1 databases, duplicate IdPs). A 429 is always safe to
  // retry — the request was rate-limited, not processed. Idempotent verbs retry
  // both 429 and 5xx.
  const method = (init.method ?? 'GET').toUpperCase();
  const nonIdempotent = method === 'POST' || method === 'PATCH' || options.retryServerErrors === false;
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
      { method: 'GET', headers: await authHeaders(config) },
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
    const result = json.result as JsonObject[];
    if (cloudflareListPageRepeats(all, result)) return all;
    all.push(...result);
    if (!cloudflareListHasMorePages(json, result.length, page, perPage)) return all;
    page += 1;
  }
}

// Hard ceiling on pages followed per list, so an endpoint that always reports a
// full page (or ignores `page=` and never repeats an id) cannot loop forever.
const CLOUDFLARE_LIST_MAX_PAGES = 100;

function cloudflareListItemKey(item: JsonObject | null | undefined): string | undefined {
  const key = item?.id ?? item?.uuid;
  return key === undefined || key === null ? undefined : String(key);
}

// An endpoint that ignores `page=` answers every page with the same items. When
// any id on the incoming page was already seen on the previous page, the list
// is exhausted: the caller drops the incoming page instead of appending
// duplicates.
function cloudflareListPageRepeats(collected: JsonObject[], incoming: JsonObject[]): boolean {
  if (collected.length === 0 || incoming.length === 0) return false;
  const previous = new Set<string>();
  for (const item of collected) {
    const key = cloudflareListItemKey(item);
    if (key !== undefined) previous.add(key);
  }
  if (previous.size === 0) return false;
  return incoming.some((item) => {
    const key = cloudflareListItemKey(item);
    return key !== undefined && previous.has(key);
  });
}

// Cloudflare list envelopes are inconsistent: Workers scripts carry
// `result_info.total_pages`, D1 and Access carry `total_count`/`count`/`page`/
// `per_page` only. When neither is present, keep paging while a page is full.
// The page size Cloudflare ACTUALLY applied (`result_info.per_page`) wins over
// the one requested: an endpoint that clamps `per_page` to a smaller value
// would otherwise look exhausted after a "short" first page.
function cloudflareListHasMorePages(json: JsonObject, pageLength: number, page: number, perPage: number): boolean {
  if (pageLength === 0) return false;
  if (page >= CLOUDFLARE_LIST_MAX_PAGES) return false;
  const info = (json.result_info ?? {}) as JsonObject;
  const totalPages = Number(info.total_pages);
  if (Number.isFinite(totalPages) && totalPages > 0) return page < totalPages;
  const responsePerPage = Number(info.per_page);
  const effectivePerPage = Number.isFinite(responsePerPage) && responsePerPage > 0 ? responsePerPage : perPage;
  const totalCount = Number(info.total_count);
  if (Number.isFinite(totalCount) && totalCount >= 0) return page * effectivePerPage < totalCount;
  const count = Number(info.count);
  if (Number.isFinite(count) && count >= 0) return count >= effectivePerPage;
  return pageLength >= effectivePerPage;
}

// Fail-closed variant for the deploy path: a list failure (429 exhausted, 5xx,
// missing read scope, malformed body) throws instead of degrading to `[]`,
// because every deploy-path caller treats `[]` as "does not exist" and then
// POSTs a duplicate (D1/R2/IdP) or falls back to a post-PUT Access create.
async function listCloudflareAllPagesStrict(config: WorkersDeployConfig, path: string, perPage = 100, what = 'Cloudflare list'): Promise<JsonObject[]> {
  const base = CLOUDFLARE_API + path;
  const all: JsonObject[] = [];
  let page = 1;
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const resp = await fetchWithRetry(
      base + sep + 'page=' + page + '&per_page=' + perPage,
      { method: 'GET', headers: await authHeaders(config) },
    );
    const json = await readCloudflareJson(resp);
    if (!resp.ok || json.success !== true || !Array.isArray(json.result)) {
      throw cloudflareError(json, resp.ok ? 502 : resp.status, what + ' failed.');
    }
    const result = json.result as JsonObject[];
    if (cloudflareListPageRepeats(all, result)) return all;
    all.push(...result);
    if (!cloudflareListHasMorePages(json, result.length, page, perPage)) return all;
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

export function resolveWorkerScriptName(override: string | undefined, fallbackName: string): string {
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
    { method: 'POST', headers: await authHeaders(config, { 'Content-Type': 'application/json' }), body: JSON.stringify({ manifest }) },
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

async function getCloudflareWorkerScript(config: WorkersDeployConfig, scriptName: string): Promise<JsonObject | null> {
  const scripts = await listCloudflareAllPagesStrict(
    config,
    '/accounts/' + encodeURIComponent(config.accountId) + '/workers/scripts',
    100,
    'Cloudflare Workers scripts list',
  );
  return scripts.find((item) => item?.id === scriptName) ?? null;
}

// The script PUT consumes the assets completion JWT. A 5xx may arrive AFTER the
// PUT committed, in which case a blind retry fails with a JWT error while the
// new version is already live. So: never retry the PUT on 5xx blindly — check
// whether the script's modified_on advanced past this deploy's start first.
async function uploadWorkerScript(
  config: WorkersDeployConfig,
  scriptName: string,
  moduleCode: string,
  assetsJwt: string,
  runWorkerFirst = false,
  startedAt = Date.now(),
): Promise<JsonObject> {
  const url = CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/scripts/' + encodeURIComponent(scriptName);
  let lastJson: JsonObject = {};
  let lastStatus = 502;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(workerMetadata(config, assetsJwt, runWorkerFirst))], { type: 'application/json' }));
    form.append('index.js', new Blob([moduleCode], { type: 'application/javascript+module' }), 'index.js');
    const resp = await fetchWithRetry(url, { method: 'PUT', headers: await authHeaders(config), body: form }, 3, { retryServerErrors: false });
    const json = await readCloudflareJson(resp);
    if (resp.ok && json.success !== false) return json;
    lastJson = json;
    lastStatus = resp.status;
    const is5xx = resp.status >= 500 && resp.status < 600;
    if (!is5xx) break;
    let committed = false;
    try {
      const script = await getCloudflareWorkerScript(config, scriptName);
      const modifiedOn = typeof script?.modified_on === 'string' ? Date.parse(script.modified_on) : NaN;
      committed = Number.isFinite(modifiedOn) && modifiedOn >= startedAt - 1000;
    } catch {
      committed = false;
    }
    if (committed) return { success: true, result: { id: scriptName, committed_after_5xx: true } };
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
  }
  throw cloudflareError(lastJson, lastStatus, 'Cloudflare Workers script upload failed.');
}

async function uploadWorkerVersion(config: WorkersDeployConfig, scriptName: string, moduleCode: string, assetsJwt: string, runWorkerFirst = false): Promise<string> {
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(workerMetadata(config, assetsJwt, runWorkerFirst))], { type: 'application/json' }));
  form.append('index.js', new Blob([moduleCode], { type: 'application/javascript+module' }), 'index.js');
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/scripts/' + encodeURIComponent(scriptName) + '/versions',
    { method: 'POST', headers: await authHeaders(config), body: form },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare Workers version upload failed.');
  const result = (json.result ?? {}) as JsonObject;
  return String(result.id ?? '');
}

async function readAccountSubdomain(config: WorkersDeployConfig): Promise<string> {
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/subdomain',
    { method: 'GET', headers: await authHeaders(config) },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare workers.dev subdomain lookup failed.');
  const subdomain = (json.result ?? {}) as JsonObject;
  return typeof subdomain.subdomain === 'string' ? subdomain.subdomain : '';
}

function noWorkersDevSubdomainError(): DeployError {
  return new DeployError(
    'This Cloudflare account has no workers.dev subdomain. Set one in the Cloudflare dashboard (or configure a custom domain) before deploying.',
    400,
    undefined,
    'CFW_SUBDOMAIN_FAILED',
  );
}

// Preview URLs only resolve when the script's subdomain config has
// previews_enabled. Turn it on without changing the production workers.dev
// exposure state (a preview deploy must not flip production public).
async function ensureWorkerPreviewsEnabled(config: WorkersDeployConfig, scriptName: string): Promise<void> {
  const url = CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/scripts/' + encodeURIComponent(scriptName) + '/subdomain';
  const getResp = await fetchWithRetry(url, { method: 'GET', headers: await authHeaders(config) });
  const getJson = await readCloudflareJson(getResp);
  if (!getResp.ok || getJson.success === false) throw cloudflareError(getJson, getResp.status, 'Cloudflare workers.dev subdomain config lookup failed.');
  const current = (getJson.result ?? {}) as JsonObject;
  if (current.previews_enabled === true) return;
  const resp = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: await authHeaders(config, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ enabled: current.enabled === true, previews_enabled: true }),
    },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare workers.dev preview enable failed.');
}

async function enableWorkerSubdomain(config: WorkersDeployConfig, scriptName: string, subdomain: string): Promise<string> {
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/scripts/' + encodeURIComponent(scriptName) + '/subdomain',
    { method: 'POST', headers: await authHeaders(config, { 'Content-Type': 'application/json' }), body: JSON.stringify({ enabled: true, previews_enabled: true }) },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare workers.dev enable failed.');
  return 'https://' + scriptName + '.' + subdomain + '.workers.dev';
}

export type CloudflareWorkersAccessRule =
  | { kind: 'emails'; emails: string[] }
  | { kind: 'emailDomain'; emailDomain: string }
  | { kind: 'self' }
  | { kind: 'policy'; policyId: string };

function accessRuleInclude(rule: CloudflareWorkersAccessRule, selfEmail: string): JsonObject[] {
  switch (rule.kind) {
    case 'emails':
      return (rule.emails || []).filter(Boolean).map((email) => ({ email: { email } }));
    case 'emailDomain':
      return rule.emailDomain ? [{ email_domain: { domain: rule.emailDomain } }] : [];
    case 'self':
      return selfEmail ? [{ email: { email: selfEmail } }] : [];
    case 'policy':
      return [];
  }
}

function selfEmailUnresolvedError(): DeployError {
  return new DeployError(
    'Could not resolve the connected Cloudflare account email for "only me" access. Reconnect Cloudflare (the connection needs the "User Details Read" permission) or specify a specific email instead.',
    400,
    undefined,
    'CFW_ACCESS_SELF_EMAIL',
  );
}

async function resolveCloudflareSelfEmail(token: string): Promise<string> {
  const resp = await fetch(CLOUDFLARE_API + '/user', { headers: cloudflareHeaders(token) });
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success !== true) return '';
  const result = (json.result ?? {}) as JsonObject;
  return typeof result.email === 'string' ? result.email : '';
}

async function getCloudflareWorkerTag(config: WorkersDeployConfig, scriptName: string): Promise<string> {
  const scripts = await listCloudflareAllPagesStrict(
    config,
    '/accounts/' + encodeURIComponent(config.accountId) + '/workers/scripts',
    100,
    'Cloudflare Workers scripts list',
  );
  const script = scripts.find((item) => item?.id === scriptName);
  return typeof script?.tag === 'string' ? script.tag : '';
}

// One-time PIN (OTP) is not auto-added to new Zero Trust orgs — the default is
// the "Cloudflare" login (full Cloudflare account sign-in). To make the email
// one-time code the sign-in method, register an `onetimepin` identity provider
// and pin the app to it via `allowed_idps`.
async function ensureCloudflareOtpIdentityProvider(config: WorkersDeployConfig): Promise<string> {
  const base = CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/access/identity_providers';
  const providers = await listCloudflareAllPagesStrict(
    config,
    '/accounts/' + encodeURIComponent(config.accountId) + '/access/identity_providers',
    100,
    'Cloudflare Access identity providers list',
  );
  const existing = providers.find((p) => p?.type === 'onetimepin');
  if (existing && typeof existing.id === 'string') return existing.id;
  const createResp = await fetchWithRetry(
    base,
    {
      method: 'POST',
      headers: await authHeaders(config, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: 'One-time PIN login', type: 'onetimepin', config: {} }),
    },
  );
  const createJson = await readCloudflareJson(createResp);
  if (!createResp.ok || createJson.success === false) {
    throw new DeployError(
      'Cloudflare Access one-time PIN (OTP) login needs the "Identity Providers Write" permission. Reconnect Cloudflare to grant it, then redeploy.',
      createResp.status || 403,
      undefined,
      'CFW_ACCESS_OTP_SCOPE_REQUIRED',
    );
  }
  const created = (createJson.result ?? {}) as JsonObject;
  if (typeof created.id === 'string') return created.id;
  throw new DeployError('Cloudflare Access one-time PIN provider returned no id.', 502, undefined, 'CFW_ACCESS_CREATE_FAILED');
}

// An Access destination (a Worker tag) can belong to only one application —
// POSTing a second app for the same Worker fails with
// "access.api.error.conflict: destination belongs to another application".
// Find the app that already claims this Worker so we can update it in place.
async function findCloudflareAccessAppByWorker(config: WorkersDeployConfig, workerId: string): Promise<JsonObject | null> {
  const base = CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/access/apps';
  let page = 1;
  for (;;) {
    const resp = await fetchWithRetry(
      base + '?page=' + page + '&per_page=100',
      { method: 'GET', headers: await authHeaders(config) },
    );
    const json = await readCloudflareJson(resp);
    // A genuine list failure (permission/5xx) must fail closed, not be conflated
    // with "zero apps" — otherwise the caller escalates to a duplicate POST.
    // That includes a 200 whose envelope says `success: false` or carries no
    // array: treating it as an empty list is the same fail-open path.
    if (!resp.ok || json.success !== true || !Array.isArray(json.result)) {
      throw cloudflareError(json, resp.ok ? 502 : resp.status, 'Cloudflare Access apps list failed.');
    }
    const apps = json.result as JsonObject[];
    const match = apps.find((a) => {
      const dests = Array.isArray(a?.destinations) ? (a.destinations as JsonObject[]) : [];
      return dests.some((d) => d?.type === 'worker' && d?.worker_id === workerId);
    });
    if (match) return match;
    if (!cloudflareListHasMorePages(json, apps.length, page, 100)) return null;
    page += 1;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}

function uniqueHostnames(hostnames: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of hostnames) {
    const hostname = normalizeHostname(raw);
    if (hostname && !out.includes(hostname)) out.push(hostname);
  }
  return out;
}

export type CloudflareWorkerAttachedDomain = { id: string; hostname: string };

/** The custom hostnames Cloudflare ACTUALLY routes to a script (the account's
 * Workers custom domains filtered to `service=<scriptName>`). Strict: a list
 * failure throws, because every caller derives the Access perimeter from this
 * answer and an empty fallback would silently leave a routed hostname public. */
export async function listCloudflareWorkerDomainsForScript(
  config: WorkersDeployConfig,
  scriptName: string,
): Promise<CloudflareWorkerAttachedDomain[]> {
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/domains?service=' + encodeURIComponent(scriptName),
    { method: 'GET', headers: await authHeaders(config) },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success !== true || !Array.isArray(json.result)) {
    throw cloudflareError(json, resp.ok ? 502 : resp.status, 'Cloudflare Workers custom domains list failed.');
  }
  return (json.result as JsonObject[])
    // The `service` filter is a server-side hint; re-check it here so a
    // hostname routed to ANOTHER script can never be detached by this deploy.
    .filter((domain) => domain?.service === scriptName)
    .map((domain) => ({
      id: domain?.id !== undefined && domain?.id !== null ? String(domain.id) : '',
      hostname: typeof domain?.hostname === 'string' ? normalizeHostname(domain.hostname) : '',
    }))
    .filter((domain) => domain.id.length > 0 && domain.hostname.length > 0);
}

async function createCloudflareAccessApp(
  config: WorkersDeployConfig,
  input: {
    scriptName: string;
    rule: CloudflareWorkersAccessRule;
    includePreview: boolean;
    workerId?: string;
    /** Every zone hostname the Access app must cover as a `public`
     * destination, in addition to the worker/preview_worker tag destinations.
     * Callers decide the exact set per phase: the pre-PUT create covers the
     * currently-routed hostnames, the post-attach reconcile the newly-routed set. */
    publicHostnames?: readonly string[] | undefined;
    /** Pre-resolved "only me" email (from the stored OAuth record); when
     * absent the live `GET /user` lookup runs here. */
    selfEmail?: string | undefined;
    priorAccessAppId?: string | undefined;
    /** When set, PUT directly to this app id and skip the find-by-tag lookup and
     * the foreign-ownership check (the caller already owns the app). */
    knownAppId?: string | undefined;
  },
): Promise<{ appId: string; workerId: string }> {
  const selfEmail = input.rule.kind === 'self'
    ? (input.selfEmail || await resolveCloudflareSelfEmail(await resolveConfigToken(config)))
    : '';
  if (input.rule.kind === 'self' && !selfEmail) {
    throw selfEmailUnresolvedError();
  }
  // Access destinations key on the Worker's tag (a UUID from GET /workers/scripts),
  // not its script name — the name is rejected with "worker_id ... is invalid".
  const workerId = input.workerId || await getCloudflareWorkerTag(config, input.scriptName);
  if (!workerId) {
    throw new DeployError(
      'Could not resolve the Cloudflare Worker tag for "' + input.scriptName + '".',
      502,
      undefined,
      'CFW_ACCESS_CREATE_FAILED',
    );
  }
  const destinations: JsonObject[] = [{ type: 'worker', worker_id: workerId }];
  if (input.includePreview) destinations.push({ type: 'preview_worker', worker_id: workerId });
  // A worker-tag destination covers workers.dev + preview URLs only. A custom
  // hostname is a zone hostname and needs its own `public` destination, or the
  // site is served unprotected on the custom domain. Every hostname Cloudflare
  // routes to the script is covered — not just the configured one — so a
  // domain a previous deploy attached can never sit outside the perimeter.
  for (const hostname of uniqueHostnames(input.publicHostnames ?? [])) {
    destinations.push({ type: 'public', uri: hostname });
  }
  const ownedAppName = cloudflareAccessAppNameForScript(input.scriptName);
  const body: JsonObject = {
    name: ownedAppName,
    type: 'self_hosted',
    destinations,
  };
  if (input.rule.kind === 'policy') {
    // A referenced policy may already carry its own SSO IdPs, so leave
    // allowed_idps unset (do NOT pin the app to the email one-time PIN).
    body.policies = [{ id: input.rule.policyId, precedence: 1 }];
  } else {
    const otpId = await ensureCloudflareOtpIdentityProvider(config);
    body.allowed_idps = [otpId];
    const include = accessRuleInclude(input.rule, selfEmail);
    if (include.length === 0) {
      throw new DeployError('Cloudflare Access rule is empty — add at least one email or a domain.', 400, undefined, 'CFW_ACCESS_EMPTY_RULE');
    }
    body.policies = [{ name: 'Allow', decision: 'allow', include, precedence: 1 }];
  }
  const existing = input.knownAppId ? null : await findCloudflareAccessAppByWorker(config, workerId);
  const existingId = input.knownAppId || (existing && typeof existing.id === 'string' ? existing.id : '');
  const existingName = existing && typeof existing.name === 'string' ? existing.name : '';
  // Only replace an app we created: the id recorded by our previous deploy, or
  // an app carrying our own `<script> (OpenDesign)` name — a deploy that created
  // the app and then failed before its record was written leaves exactly that
  // behind, and must be adopted rather than locking the user out of their own
  // app. A user-managed Access app that claims this Worker must not be
  // overwritten with our OTP + email rule and later deleted when Access is
  // switched off. knownAppId callers skip this check — they pin the id they own.
  const adoptable = existingId !== '' && existingName === ownedAppName;
  if (!input.knownAppId && existingId && existingId !== input.priorAccessAppId && !adoptable) {
    const name = typeof existing?.name === 'string' ? existing.name : existingId;
    throw new DeployError(
      'Cloudflare Access app "' + name + '" already protects this Worker but was not created by OpenDesign. Remove it or turn off OpenDesign Access to continue.',
      409,
      { appId: existingId, name },
      'CFW_ACCESS_APP_FOREIGN',
    );
  }
  const path = existingId
    ? CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/access/apps/' + encodeURIComponent(existingId)
    : CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/access/apps';
  const resp = await fetchWithRetry(
    path,
    {
      method: existingId ? 'PUT' : 'POST',
      headers: await authHeaders(config, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) {
    throw cloudflareError(json, resp.status, 'Cloudflare Access app ' + (existingId ? 'update' : 'creation') + ' failed.');
  }
  const result = (json.result ?? {}) as JsonObject;
  const appId = typeof result.id === 'string' ? result.id : existingId;
  if (!appId) throw new DeployError('Cloudflare Access app returned no app id.', 502, undefined, 'CFW_ACCESS_CREATE_FAILED');
  return { appId, workerId };
}

/** The name OpenDesign gives the Access app it creates for a Worker. It doubles
 * as the ownership marker used to adopt an app whose id was never recorded. */
export function cloudflareAccessAppNameForScript(scriptName: string): string {
  return scriptName + ' (OpenDesign)';
}

const ACCESS_PERIMETER_ATTEMPTS = 3;
const ACCESS_PERIMETER_RETRY_BASE_MS = 300;

// One HEAD against a public URL; resolves to the failure instead of throwing so
// the caller can retry a bounded number of times.
async function probeCloudflareAccessPerimeterOnce(url: string): Promise<DeployError | null> {
  let resp: Response;
  try {
    resp = await fetch(url, { method: 'HEAD', redirect: 'manual' });
  } catch (err) {
    return new DeployError(
      'Could not verify Cloudflare Access on ' + url + ': ' + String((err as Error)?.message || err),
      502,
      { url },
      'CFW_ACCESS_UNVERIFIED',
    );
  }
  const location = resp.headers?.get?.('location') || '';
  if (!isCloudflareAccessRedirect(resp.status, location)) {
    return new DeployError(
      url + ' is not behind Cloudflare Access (HTTP ' + resp.status + '). The deploy was not marked ready.',
      502,
      { url, status: resp.status },
      'CFW_ACCESS_UNVERIFIED',
    );
  }
  return null;
}

// Hard post-deploy assertion: every URL a deploy with Access enabled reports
// must answer with an Access login redirect. This holds regardless of any
// future ordering bug in the steps above. A fresh custom hostname (certificate
// still issuing) or a just-enabled workers.dev name can take a moment to
// answer at all, so each URL gets a short bounded retry before the deploy is
// declared unverified.
async function verifyCloudflareAccessPerimeter(urls: string[]): Promise<void> {
  for (const url of urls) {
    let failure: DeployError | null = null;
    for (let attempt = 0; attempt < ACCESS_PERIMETER_ATTEMPTS; attempt += 1) {
      failure = await probeCloudflareAccessPerimeterOnce(url);
      if (!failure) break;
      if (attempt < ACCESS_PERIMETER_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, ACCESS_PERIMETER_RETRY_BASE_MS * 2 ** attempt));
      }
    }
    if (failure) throw failure;
  }
}

function accessAppReferencesWorker(app: JsonObject | null, workerId: string): boolean {
  const dests = Array.isArray(app?.destinations) ? (app!.destinations as JsonObject[]) : [];
  return dests.some((d) => (d?.type === 'worker' || d?.type === 'preview_worker') && d?.worker_id === workerId);
}

async function getCloudflareAccessApp(config: WorkersDeployConfig, appId: string): Promise<JsonObject | null> {
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/access/apps/' + encodeURIComponent(appId),
    { method: 'GET', headers: await authHeaders(config) },
  );
  if (resp.status === 404) return null;
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare Access app lookup failed.');
  return (json.result ?? null) as JsonObject | null;
}

type PriorAccessAppRetirement = 'deleted' | 'retained' | 'failed';

// Retire the Access app recorded by the previous deploy — but only when it
// still guards THIS Worker. After a scriptName change the prior app protects
// the still-live old Worker; deleting it would make that Worker public.
//
// A failure here is never silent: the app may still exist (and still gate the
// Worker), and its id is the only handle OpenDesign has on it. The caller keeps
// that id on the deployment record when the retire fails, and the
// `access-app-retire` error step makes the leftover visible in the UI.
async function retirePriorAccessApp(
  config: WorkersDeployConfig,
  priorAccessAppId: string,
  workerId: string,
  steps: DeployStep[],
): Promise<PriorAccessAppRetirement> {
  try {
    const prior = await getCloudflareAccessApp(config, priorAccessAppId);
    if (prior && !accessAppReferencesWorker(prior, workerId)) {
      steps.push({ name: 'access-app-prior-retained', status: 'done', detail: priorAccessAppId });
      return 'retained';
    }
    await deleteCloudflareAccessApp(config, priorAccessAppId);
    return 'deleted';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cloudflare-workers] could not retire Access app ${priorAccessAppId}; keeping its id on the record: ${message}`);
    steps.push({ name: 'access-app-retire', status: 'error', detail: priorAccessAppId + ': ' + message });
    return 'failed';
  }
}

/** A custom hostname OpenDesign attached to the Worker, as recorded on the
 * deployment. `id` is the Workers custom-domain id; it can be missing when
 * Cloudflare's attach response carried none, in which case the hostname is
 * the only key. */
export type CloudflareOwnedCustomDomain = { id?: string | undefined; hostname: string };

/** The custom hostnames a prior OpenDesign deployment attached, read from its
 * providerMetadata. Records written before `ownedCustomDomains` existed carry a
 * single `customDomain`; that one was attached by OpenDesign too. */
export function ownedCustomDomainsFromMetadata(metadata: unknown): CloudflareOwnedCustomDomain[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const record = metadata as JsonObject;
  const out: CloudflareOwnedCustomDomain[] = [];
  const push = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const entry = value as JsonObject;
    const hostname = typeof entry.hostname === 'string' ? normalizeHostname(entry.hostname) : '';
    if (!hostname) return;
    const id = entry.id !== undefined && entry.id !== null && String(entry.id) ? String(entry.id) : undefined;
    if (out.some((owned) => owned.hostname === hostname && owned.id === id)) return;
    out.push(id ? { id, hostname } : { hostname });
  };
  if (Array.isArray(record.ownedCustomDomains)) {
    for (const entry of record.ownedCustomDomains) push(entry);
  } else {
    push(record.customDomain);
  }
  return out;
}

/** Ownership test for a hostname Cloudflare routes to the script: it is ours
 * only when a prior OpenDesign deployment recorded it — by domain id when the
 * record has one, by hostname otherwise. Anything else was attached outside
 * OpenDesign (dashboard, wrangler) and is never detached by a deploy. */
export function isOwnedCustomDomain(
  domain: CloudflareWorkerAttachedDomain,
  owned: readonly CloudflareOwnedCustomDomain[],
): boolean {
  return owned.some((entry) => (entry.id ? entry.id === domain.id : entry.hostname === domain.hostname));
}

async function deleteCloudflareAccessApp(config: WorkersDeployConfig, appId: string): Promise<void> {
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/access/apps/' + encodeURIComponent(appId),
    { method: 'DELETE', headers: await authHeaders(config) },
  );
  if (resp.status === 404) return;
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare Access app deletion failed.');
}

export async function deployToCloudflareWorkers(input: {
  config: {
    token: string;
    accountId?: string | undefined;
    scriptName?: string | undefined;
    compatibilityDate?: string | undefined;
    credentialMode?: string | undefined;
    bindings?: CloudflareWorkersBinding[] | undefined;
  };
  files: WorkersFile[];
  projectId?: string;
  projectName?: string;
  target?: 'preview' | 'production';
  access?: { enabled: boolean; rule?: CloudflareWorkersAccessRule };
  priorAccessAppId?: string;
  customDomain?: { hostname: string; zoneId: string } | undefined;
  /** Custom hostnames a prior OpenDesign deployment attached (see
   * ownedCustomDomainsFromMetadata). Only these are reconciled by this deploy. */
  priorOwnedCustomDomains?: readonly CloudflareOwnedCustomDomain[] | undefined;
  /** Re-resolved before every Cloudflare call. Defaults to the OAuth access
   * token resolver in 'oauth' mode and to the static `config.token` otherwise. */
  tokenProvider?: CloudflareTokenProvider | undefined;
}): Promise<CloudflareWorkersDeployResult> {
  const startedAt = Date.now();
  const { config, files, projectId = '', projectName = '', target = 'production', access, priorAccessAppId, customDomain } = input ?? {};
  const priorOwnedCustomDomains = input?.priorOwnedCustomDomains ?? [];
  const accountId = config?.accountId;
  if (!accountId) throw new DeployError('Cloudflare account ID is required.', 400, undefined, 'CFW_ACCOUNT_ID_REQUIRED');
  // Fail closed on the enabled-but-inert shape: `{enabled:true}` with no rule
  // would otherwise deploy live and unprotected while the UI believes Access is on.
  if (access?.enabled && !access.rule) {
    throw new DeployError('Cloudflare Access is enabled but has no rule — add an email, domain, or policy.', 400, undefined, 'CFW_ACCESS_EMPTY_RULE');
  }
  const accessOn = Boolean(access?.enabled && access.rule);
  // Validate bindings before any network call (a `[null]` binding used to
  // TypeError inside workerMetadata after the assets were already uploaded).
  const validatedBindings = normalizeCloudflareWorkersBindings(config.bindings);
  // The live credential is a PROVIDER, not a captured string: the configured
  // static API token in 'token' mode, or the rotating OAuth access token
  // (refreshed behind a single-flight lock in deploy.ts) in 'oauth' mode. A
  // deploy can run for minutes (asset buckets, certificate-issuing custom
  // hostnames, perimeter retries), so every Cloudflare call re-resolves it
  // instead of reusing whatever was valid at deploy start. It is resolved once
  // up front only to fail fast on a missing credential.
  const getToken: CloudflareTokenProvider = input.tokenProvider
    ?? (config.credentialMode === 'oauth'
      ? () => getCloudflareAccessToken(CLOUDFLARE_WORKERS_PROVIDER_ID)
      : async () => config.token);
  const token = await getToken();
  if (!token) throw new DeployError('Cloudflare API token is required.', 400, undefined, 'CFW_TOKEN_REQUIRED');
  const cfg: WorkersDeployConfig = {
    token: getToken,
    accountId,
    scriptName: config.scriptName,
    compatibilityDate: config.compatibilityDate,
    credentialMode: config.credentialMode,
    bindings: validatedBindings,
  };
  // Resolve the "only me" email BEFORE any upload. In OAuth mode the email
  // captured at connect time is authoritative (`GET /user` needs a scope an
  // older connection may never have granted); token mode and records written
  // before the capture existed fall back to the live lookup. Either way an
  // unresolvable rule fails here, not after the assets are already uploaded.
  let selfEmail = '';
  if (accessOn && access!.rule!.kind === 'self') {
    if (config.credentialMode === 'oauth') selfEmail = await getCloudflareOAuthStoredEmail();
    if (!selfEmail) selfEmail = await resolveCloudflareSelfEmail(token);
    if (!selfEmail) throw selfEmailUnresolvedError();
  }
  const steps: DeployStep[] = [];
  try {
    // Validate the script name and the asset set BEFORE any resource is
    // created: an unviable deploy (bad script name, too many / oversized /
    // invalid-path assets) must not first mint a D1 database or R2 bucket.
    const scriptName = resolveWorkerScriptName(cfg.scriptName, projectName || projectId);
    const { moduleCode, assetFiles } = splitWorkerModule(files);
    const isCustomModule = moduleCode !== DEFAULT_WORKER_MODULE;
    const { manifest, hashToFile } = buildCloudflareWorkersManifest(assetFiles);

    // The ensure calls ARE the capability check: they succeed only when R2/D1 are
    // enabled and the token can reach them. (A separate unretried probe after
    // them used to flip a fresh success into CFW_R2_UNAVAILABLE on one 429.)
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

    if (target === 'preview') {
      // A version upload needs an existing script, and preview URLs need the
      // account subdomain — check both before uploading any asset.
      const workerId = await getCloudflareWorkerTag(cfg, scriptName);
      if (!workerId) {
        throw new DeployError(
          'Preview deploys need a production deploy first: the Worker "' + scriptName + '" does not exist yet.',
          400,
          undefined,
          'CFW_PREVIEW_REQUIRES_PRODUCTION',
        );
      }
      const subdomain = await readAccountSubdomain(cfg);
      if (!subdomain) throw noWorkersDevSubdomainError();
      // The Access app is shared with production and its PUT replaces every
      // destination, so a preview deploy must keep covering each hostname
      // Cloudflare routes to the script (strict list — see production below).
      const previewPublicHostnames = accessOn
        ? (await listCloudflareWorkerDomainsForScript(cfg, scriptName)).map((domain) => domain.hostname)
        : [];
      const session = await startAssetsUploadSession(cfg, scriptName, manifest);
      const completionJwt = await uploadAssetBuckets(cfg, session.jwt, session.buckets, hashToFile);
      steps.push({ name: 'assets', status: 'done', detail: String(assetFiles.length) });
      const metadata: JsonObject = { scriptName };
      if (accessOn) {
        // Preview URLs are covered by the preview_worker destination; make sure
        // the app exists BEFORE the version goes live.
        const app = await createCloudflareAccessApp(cfg, {
          scriptName,
          rule: access!.rule!,
          includePreview: true,
          workerId,
          publicHostnames: previewPublicHostnames,
          selfEmail,
          priorAccessAppId,
        });
        metadata.accessProtected = true;
        metadata.accessAppId = app.appId;
        metadata.createdByOpenDesign = true;
        steps.push({ name: 'access-app', status: 'done', detail: app.appId });
      } else if (priorAccessAppId) {
        // Preview never reconciles the production app; keep its id on the record
        // so a later production deploy with Access off can still retire it.
        metadata.accessAppId = priorAccessAppId;
        metadata.createdByOpenDesign = true;
      }
      // A preview deploy never reconciles (deletes) the production Access app:
      // flipping Access off and running a preview must not expose production.
      const versionId = await uploadWorkerVersion(cfg, scriptName, moduleCode, completionJwt, isCustomModule);
      metadata.versionId = versionId;
      steps.push({ name: 'version', status: 'done' });
      await ensureWorkerPreviewsEnabled(cfg, scriptName);
      steps.push({ name: 'previews', status: 'done' });
      const prefix = versionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'preview';
      const url = 'https://' + prefix + '-' + scriptName + '.' + subdomain + '.workers.dev';
      if (accessOn) {
        await verifyCloudflareAccessPerimeter([url]);
        metadata.accessVerified = true;
      }
      metadata.steps = steps;
      return {
        providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
        url,
        deploymentId: versionId,
        target,
        status: 'ready',
        reachableAt: Date.now(),
        providerMetadata: metadata,
      };
    }

    // Production. Resolve everything that can fail BEFORE the live script PUT:
    // the account subdomain (an account with none and no custom domain cannot
    // deploy — better to learn that before a new version is live) and the
    // Worker tag (needed for the Access destination).
    const subdomain = await readAccountSubdomain(cfg);
    if (!subdomain && !customDomain) throw noWorkersDevSubdomainError();
    // Custom hostnames come in two kinds. OWNED: attached by a prior OpenDesign
    // deployment (recorded on its providerMetadata) — reconciled here, i.e.
    // detached once the config no longer names them. FOREIGN: routed to the
    // script by someone else (dashboard, wrangler) — never detached, but kept
    // inside the Access perimeter, because they DO serve this Worker. The list
    // is strict — a failure here must not silently shrink the perimeter — and
    // runs before the upload so nothing is spent on a deploy that cannot be
    // reconciled.
    const attachedDomains = await listCloudflareWorkerDomainsForScript(cfg, scriptName);
    const configuredHostname = customDomain ? normalizeHostname(customDomain.hostname) : '';
    const configuredAlreadyAttached = attachedDomains.some((domain) => domain.hostname === configuredHostname);
    const staleDomains = attachedDomains.filter(
      (domain) => domain.hostname !== configuredHostname && isOwnedCustomDomain(domain, priorOwnedCustomDomains),
    );
    const foreignHostnames = attachedDomains
      .filter((domain) => domain.hostname !== configuredHostname && !isOwnedCustomDomain(domain, priorOwnedCustomDomains))
      .map((domain) => domain.hostname);
    // The Access app covers, for the whole deploy, every hostname Cloudflare
    // routes to the script PLUS the configured hostname — before it is attached.
    // A `public` destination on a hostname not (yet) routed to this Worker is
    // inert, so claiming it up front costs nothing and there is never an
    // instant where the hostname is live but outside the perimeter. If the
    // attach then fails, the claim is dropped again (see the attach below).
    const prePutPublicHostnames = uniqueHostnames([
      ...(configuredHostname ? [configuredHostname] : []),
      ...attachedDomains.map((domain) => domain.hostname),
    ]);
    const session = await startAssetsUploadSession(cfg, scriptName, manifest);
    const completionJwt = await uploadAssetBuckets(cfg, session.jwt, session.buckets, hashToFile);
    steps.push({ name: 'assets', status: 'done', detail: String(assetFiles.length) });

    // Create/update the Access app BEFORE the live script PUT so there is never
    // a window where the Worker is live but unprotected. On a first deploy the
    // Worker has no tag yet (getCloudflareWorkerTag returns ''), so fall back to
    // post-PUT creation in that case.
    const metadata: JsonObject = { scriptName };
    let workerId = accessOn || priorAccessAppId ? await getCloudflareWorkerTag(cfg, scriptName) : '';
    let accessAppId = '';
    if (accessOn && workerId) {
      const app = await createCloudflareAccessApp(cfg, { scriptName, rule: access!.rule!, includePreview: true, workerId, publicHostnames: prePutPublicHostnames, selfEmail, priorAccessAppId });
      accessAppId = app.appId;
      metadata.accessProtected = true;
      metadata.accessAppId = app.appId;
      metadata.createdByOpenDesign = true;
      steps.push({ name: 'access-app', status: 'done', detail: app.appId });
    }

    await uploadWorkerScript(cfg, scriptName, moduleCode, completionJwt, isCustomModule, startedAt);
    steps.push({ name: 'script', status: 'done' });
    if (accessOn && !accessAppId) {
      // First deploy: the Worker now exists, so its tag is resolvable.
      const app = await createCloudflareAccessApp(cfg, { scriptName, rule: access!.rule!, includePreview: true, publicHostnames: prePutPublicHostnames, selfEmail, priorAccessAppId });
      accessAppId = app.appId;
      workerId = app.workerId;
      metadata.accessProtected = true;
      metadata.accessAppId = app.appId;
      metadata.createdByOpenDesign = true;
      steps.push({ name: 'access-app', status: 'done', detail: app.appId });
    }
    // Reconcile the previously recorded app: delete it only when it is not the
    // app now governing this Worker AND it still points at this Worker (after a
    // scriptName change it protects the still-live old Worker — keep it).
    if (priorAccessAppId && priorAccessAppId !== accessAppId) {
      const retirement = await retirePriorAccessApp(cfg, priorAccessAppId, workerId, steps);
      // Access off and the delete did not go through: the app may still exist
      // and its id is the only handle on it. Keep it on the record so the next
      // deploy retries the retire instead of forgetting the app forever.
      if (retirement === 'failed' && !accessAppId) {
        metadata.accessAppId = priorAccessAppId;
        metadata.createdByOpenDesign = true;
      }
    }

    let url = customDomain ? 'https://' + customDomain.hostname : '';
    if (subdomain) {
      url = await enableWorkerSubdomain(cfg, scriptName, subdomain);
      steps.push({ name: 'subdomain', status: 'done', detail: url });
    }
    let attachedDomainId = '';
    if (customDomain) {
      let domainId: string;
      try {
        domainId = await attachCloudflareWorkerDomain(cfg, { hostname: customDomain.hostname, service: scriptName, zone_id: customDomain.zoneId });
      } catch (err) {
        // Compensation: the Access app claimed the configured hostname before
        // the attach. The attach failed, so drop that claim again — only when
        // the hostname was NOT already routed, since a still-routed hostname
        // must stay covered. The original attach error is what surfaces.
        if (accessOn && accessAppId && !configuredAlreadyAttached) {
          try {
            await createCloudflareAccessApp(cfg, {
              scriptName,
              rule: access!.rule!,
              includePreview: true,
              workerId,
              publicHostnames: prePutPublicHostnames.filter((hostname) => hostname !== configuredHostname),
              selfEmail,
              knownAppId: accessAppId,
            });
          } catch (compensationErr) {
            console.error(
              `[cloudflare-workers] custom domain attach failed; could not drop "${configuredHostname}" from Access app ${accessAppId} again (inert until the hostname is routed): ${String((compensationErr as Error)?.message || compensationErr)}`,
            );
          }
        }
        throw err;
      }
      attachedDomainId = domainId;
      const customUrl = 'https://' + customDomain.hostname;
      metadata.customDomain = domainId
        ? { id: domainId, hostname: customDomain.hostname, url: customUrl }
        : { hostname: customDomain.hostname, url: customUrl };
      steps.push({ name: 'custom-domain', status: 'done', detail: customDomain.hostname });
    }
    // Detach every OWNED hostname the config no longer names. Until this point
    // each of them was covered by the Access app (when Access is on); a detach
    // failure throws, so the deploy is never reported ready with a hostname the
    // user dropped still serving the site. Foreign hostnames are not touched.
    for (const stale of staleDomains) {
      await detachCloudflareWorkerDomain(cfg, stale.id);
      steps.push({ name: 'custom-domain-detach', status: 'done', detail: stale.hostname });
    }
    // What this deployment owns from here on: the configured hostname (just
    // attached) and nothing else — every other owned hostname was detached above.
    metadata.ownedCustomDomains = customDomain
      ? [attachedDomainId ? { id: attachedDomainId, hostname: configuredHostname } : { hostname: configuredHostname }]
      : [];
    // After detach, drop the now-unrouted stale hostnames from the app. Only
    // needed when something was actually detached — a steady-state redeploy
    // (already attached, no stale) is covered exactly by the pre-PUT app and
    // needs no extra PUT. Foreign hostnames stay covered.
    if (accessOn && accessAppId && staleDomains.length > 0) {
      const finalPublicHostnames = uniqueHostnames([...(configuredHostname ? [configuredHostname] : []), ...foreignHostnames]);
      await createCloudflareAccessApp(cfg, {
        scriptName,
        rule: access!.rule!,
        includePreview: true,
        workerId,
        publicHostnames: finalPublicHostnames,
        selfEmail,
        knownAppId: accessAppId,
      });
    }
    const publicUrls = [url, ...(customDomain && url !== 'https://' + customDomain.hostname ? ['https://' + customDomain.hostname] : [])];
    if (accessOn) {
      // Hard constraint: a deploy with Access on is only `ready` when every URL
      // it reports actually challenges with an Access login.
      await verifyCloudflareAccessPerimeter(publicUrls);
      metadata.accessVerified = true;
    } else {
      try {
        const checkResp = await fetch(url, { method: 'HEAD', redirect: 'manual' });
        const check: JsonObject = { status: checkResp.status, ok: checkResp.ok };
        if (checkResp.status >= 500 || checkResp.status === 1101) check.detail = 'worker-runtime-error';
        metadata.check = check;
      } catch {
        // A failed post-deploy probe is non-fatal; the deploy still succeeded.
      }
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
    // Attach the partial steps (including any created accessAppId) to EVERY
    // error, not just DeployError — a transport failure after the Access app
    // step must still let the route record the app id instead of orphaning it.
    steps.push({ name: 'error', status: 'error', detail: err instanceof Error ? err.message : String(err) });
    (err as { steps?: DeployStep[] }).steps = steps;
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
  access: boolean;
  accessReason?: string;
};

export async function probeCloudflareWorkersCapabilities(input: { token: string; accountId: string }): Promise<CloudflareWorkersCapabilities> {
  const token = input.token;
  const accountId = input.accountId;
  const base = CLOUDFLARE_API + '/accounts/' + encodeURIComponent(accountId);
  const caps: CloudflareWorkersCapabilities = { workers: false, workersDevSubdomain: '', r2: false, d1: false, access: false };

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

  const access = await probe('/access/apps');
  caps.access = access.success;
  if (!access.success) caps.accessReason = access.code === 9999 ? 'access-not-enabled' : access.code === 10000 ? 'no-permission' : 'unknown';

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
  options: { strict?: boolean; nameContains?: string } = {},
): Promise<CloudflareR2Bucket[]> {
  const base = CLOUDFLARE_API + '/accounts/' + encodeURIComponent(accountId) + '/r2/buckets';
  const out: CloudflareR2Bucket[] = [];
  let cursor: string | undefined;
  for (;;) {
    const params = new URLSearchParams({ per_page: '1000' });
    if (options.nameContains) params.set('name_contains', options.nameContains);
    if (cursor) params.set('cursor', cursor);
    const url = base + '?' + params.toString();
    const resp = options.strict
      ? await fetchWithRetry(url, { method: 'GET', headers: cloudflareHeaders(token) })
      : await fetch(url, { headers: cloudflareHeaders(token) });
    const json = (await resp.json().catch(() => ({}))) as JsonObject;
    if (!resp.ok || json.success !== true) {
      // The deploy path (strict) must fail closed: `[]` means "create it" to
      // ensureCloudflareR2Bucket, which would then hit "bucket already exists".
      if (options.strict) throw cloudflareError(json, resp.ok ? 502 : resp.status, 'Cloudflare R2 bucket list failed.');
      return out;
    }
    const result = json.result as JsonObject | undefined;
    const buckets = Array.isArray(result?.buckets) ? (result.buckets as JsonObject[]) : [];
    for (const bucket of buckets) {
      const name = typeof bucket?.name === 'string' ? bucket.name : '';
      if (name) out.push({ name });
    }
    const info = json.result_info as JsonObject | undefined;
    const nextCursor = typeof info?.cursor === 'string' && info.cursor.length > 0 ? info.cursor : undefined;
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
  // Exact-name filter + fail-closed list: a degraded `[]` here would POST a
  // duplicate database instead of reusing the existing one.
  const existing = await listCloudflareAllPagesStrict(
    config,
    '/accounts/' + encodeURIComponent(config.accountId) + '/d1/database?name=' + encodeURIComponent(databaseName),
    100,
    'Cloudflare D1 database list',
  );
  const match = existing.find((db) => db?.name === databaseName && typeof db?.uuid === 'string' && db.uuid);
  if (match) return String(match.uuid);
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/d1/database',
    { method: 'POST', headers: await authHeaders(config, { 'Content-Type': 'application/json' }), body: JSON.stringify({ name: databaseName }) },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare D1 database creation failed.');
  const result = (json.result ?? {}) as JsonObject;
  return String(result.uuid ?? '');
}

/** Resolve an R2 bucket by name, creating it when it does not exist. The
 * bucket name is the identifier, so it is returned unchanged. */
export async function ensureCloudflareR2Bucket(config: WorkersDeployConfig, bucketName: string): Promise<string> {
  const existing = await listCloudflareR2Buckets(await resolveConfigToken(config), config.accountId, { strict: true, nameContains: bucketName });
  if (existing.some((bucket) => bucket.name === bucketName)) return bucketName;
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/r2/buckets',
    { method: 'POST', headers: await authHeaders(config, { 'Content-Type': 'application/json' }), body: JSON.stringify({ name: bucketName }) },
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
): Promise<string> {
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/domains',
    {
      method: 'PUT',
      headers: await authHeaders(config, { 'Content-Type': 'application/json' }),
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
  const result = (json.result ?? {}) as JsonObject;
  return result.id !== undefined && result.id !== null ? String(result.id) : '';
}

/** Detach a custom domain from Workers. A 404 means the hostname is already
 * gone, which is treated as a no-op and reported as false (the caller can
 * distinguish "deleted" from "already absent"). */
export async function detachCloudflareWorkerDomain(config: WorkersDeployConfig, domainId: string): Promise<boolean> {
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/domains/' + encodeURIComponent(domainId),
    { method: 'DELETE', headers: await authHeaders(config) },
  );
  if (resp.status === 404) return false;
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare Workers custom domain detach failed.');
  return true;
}

export type CloudflareWorkerDomain = { id: string; hostname: string; service: string };

/** Read one Workers custom domain by id. `null` on 404 (already gone). Strict
 * otherwise: the caller uses `service` as an ownership check before a detach,
 * and an empty fallback would let a hostname routed to another script go. */
export async function getCloudflareWorkerDomain(config: WorkersDeployConfig, domainId: string): Promise<CloudflareWorkerDomain | null> {
  const resp = await fetchWithRetry(
    CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/domains/' + encodeURIComponent(domainId),
    { method: 'GET', headers: await authHeaders(config) },
  );
  if (resp.status === 404) return null;
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success !== true || !json.result || typeof json.result !== 'object') {
    throw cloudflareError(json, resp.ok ? 502 : resp.status, 'Cloudflare Workers custom domain lookup failed.');
  }
  const result = json.result as JsonObject;
  return {
    id: result.id !== undefined && result.id !== null ? String(result.id) : domainId,
    hostname: typeof result.hostname === 'string' ? normalizeHostname(result.hostname) : '',
    service: typeof result.service === 'string' ? result.service : '',
  };
}

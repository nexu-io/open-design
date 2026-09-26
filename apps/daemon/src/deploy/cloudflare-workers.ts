import { createHash } from 'node:crypto';
import path from 'node:path';
import { CLOUDFLARE_WORKERS_PROVIDER_ID, DeployError, getCloudflareAccessToken, getCloudflareOAuthStoredEmail, isCloudflareAccessChallengeResponse, isCloudflareAccessRedirect, normalizeCloudflareWorkersBindings } from '../deploy.js';
import { proxyDispatcherRequestInit } from '../connectionTest.js';

type JsonObject = Record<string, unknown>;

/** The bearer credential a Cloudflare call is signed with. A static string is
 * the configured API token; a provider is re-resolved before EVERY request so a
 * deploy that outlives an OAuth access token's remaining lifetime picks up the
 * refreshed token instead of sending one captured at deploy start. */
export type CloudflareTokenProvider = () => Promise<string>;

/** The per-call HTTP dispatcher every Cloudflare request rides. It carries the
 * user's HTTP/SOCKS proxy (the same one the OAuth connect/refresh/revoke use);
 * without it a deploy bypasses the proxy and fails on exactly the machines
 * where the connect only worked because of it. */
export type WorkersRequestInit = Pick<RequestInit, 'dispatcher'>;

type WorkersDeployConfig = {
  token: string | CloudflareTokenProvider;
  accountId: string;
  scriptName?: string | undefined;
  compatibilityDate?: string | undefined;
  credentialMode?: string | undefined;
  bindings?: CloudflareWorkersBinding[] | undefined;
  /** Attached to every request. Set once per top-level call (deploy, probe,
   * list) by `withWorkersDispatcher`; an exported helper called without it
   * opens and closes its own. */
  requestInit?: WorkersRequestInit | undefined;
};

// One proxy dispatcher per top-level Cloudflare operation, closed when it
// ends. A caller that already holds one (the deploy's helpers, a route that
// opened its own) passes it through; only a bare call opens a new one.
async function withWorkersDispatcher<T>(
  given: WorkersRequestInit | undefined,
  run: (requestInit: WorkersRequestInit) => Promise<T>,
): Promise<T> {
  if (given) return run(given);
  const proxy = proxyDispatcherRequestInit(process.env);
  try {
    return await run(proxy.requestInit);
  } finally {
    await proxy.close();
  }
}

function withRequestInit(
  config: Pick<WorkersDeployConfig, 'requestInit'>,
  init: RequestInit,
  timeoutMs = CLOUDFLARE_API_TIMEOUT_MS,
): RequestInit {
  return { signal: AbortSignal.timeout(timeoutMs), ...init, ...(config.requestInit ?? {}) };
}

// A fetch that ran out of its AbortSignal.timeout budget. Node rejects with a
// DOMException named `TimeoutError`; a user-aborted signal is `AbortError`.
function isFetchTimeout(err: unknown): boolean {
  return (err as { name?: unknown } | null)?.name === 'TimeoutError';
}

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
/** Budget for one Cloudflare API request. Without it a stalled upload or a
 * half-open connection through a user's proxy hangs the deploy forever; the
 * caller's retry loop never even gets to run. */
export const CLOUDFLARE_API_TIMEOUT_MS = 30_000;
/** Budget for the short public probes (Access perimeter GET, readiness HEAD,
 * self-email lookup). These are advisory and re-probed later, so they get a
 * tighter budget than an API mutation. */
export const CLOUDFLARE_PROBE_TIMEOUT_MS = 10_000;
/** Budget for a request that carries a body the API must ingest (an assets
 * bucket, the script PUT, a version POST). Sized from the body: a fixed floor
 * plus an allowance per MiB, capped. A single 25 MiB asset is ~33 MiB once
 * base64-encoded; on a slow uplink it needs minutes, and the flat API budget
 * aborted it every time. */
export const CLOUDFLARE_UPLOAD_TIMEOUT_BASE_MS = CLOUDFLARE_API_TIMEOUT_MS;
export const CLOUDFLARE_UPLOAD_TIMEOUT_PER_MIB_MS = 10_000;
export const CLOUDFLARE_UPLOAD_TIMEOUT_MAX_MS = 10 * 60_000;
export function cloudflareUploadTimeoutMs(bodyBytes: number): number {
  const bytes = Number.isFinite(bodyBytes) && bodyBytes > 0 ? bodyBytes : 0;
  const perMib = (bytes / (1024 * 1024)) * CLOUDFLARE_UPLOAD_TIMEOUT_PER_MIB_MS;
  return Math.min(CLOUDFLARE_UPLOAD_TIMEOUT_MAX_MS, Math.ceil(CLOUDFLARE_UPLOAD_TIMEOUT_BASE_MS + perMib));
}
// A body-carrying request that ran out of its sized budget. Typed so the
// client can tell "the upload itself did not finish" from a provider refusal.
function uploadTimedOutError(what: string, bodyBytes: number, timeoutMs: number): DeployError {
  return new DeployError(
    what + ' did not finish within ' + Math.round(timeoutMs / 1000) + 's (' + bodyBytes + ' bytes). Check the connection and retry.',
    504,
    { bodyBytes, timeoutMs },
    'CFW_UPLOAD_FAILED',
  );
}
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
// Account-scoped single-flight for the ensures that act on ACCOUNT-GLOBAL
// resources: the Access one-time PIN identity provider, D1 databases and R2
// buckets. The deploy's own single-flight is keyed by SCRIPT NAME, so two
// deploys of DIFFERENT scripts run concurrently — and every one of those ensures
// is a list-then-create, so both can miss. The loser then either aborts its
// deploy on a 4xx "already exists" (D1/R2), or, for the identity provider,
// successfully creates a SECOND "One-time PIN login": Cloudflare does not dedupe
// identity providers by type, so the duplicates accumulate on the account
// unseen.
//
// Unlike the script-keyed guard this one SERIALIZES instead of refusing: the two
// deploys are legitimately unrelated, so the second must observe the first one's
// result rather than fail.
const cloudflareAccountEnsuresInFlight = new Map<string, Promise<unknown>>();

async function withCloudflareAccountEnsureSingleFlight<T>(accountId: string, run: () => Promise<T>): Promise<T> {
  const prior = cloudflareAccountEnsuresInFlight.get(accountId) ?? Promise.resolve();
  // A predecessor's rejection is not this ensure's failure — the queued call
  // must still run, and may well succeed — so the chain swallows it here.
  const mine = prior.catch(() => undefined).then(run);
  cloudflareAccountEnsuresInFlight.set(accountId, mine);
  try {
    return await mine;
  } finally {
    // Only the LAST waiter clears the key: an earlier settle must not drop a
    // successor's promise, which would let a third caller jump the queue.
    if (cloudflareAccountEnsuresInFlight.get(accountId) === mine) cloudflareAccountEnsuresInFlight.delete(accountId);
  }
}

/** Whether a refused create is worth adopting rather than reporting: a 4xx means
 * the resource may already exist, because a concurrent deploy of another script
 * can have created it between this one's list and its POST. Auth failures are
 * excluded — re-listing would fail identically, and the caller needs the real
 * status (the identity-provider path maps 401/403 to a scope error). */
function isAdoptableCreateConflict(status: number): boolean {
  return status >= 400 && status < 500 && status !== 401 && status !== 403;
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

async function fetchWithRetry(
  config: Pick<WorkersDeployConfig, 'requestInit'>,
  url: string,
  init: RequestInit,
  attempts = 3,
  options: { retryServerErrors?: boolean; timeoutMs?: number } = {},
): Promise<Response> {
  // Non-idempotent methods (POST/PATCH) may already have committed before a 5xx
  // is returned, so retrying a 5xx would mint duplicate resources (immutable
  // versions, orphan D1 databases, duplicate IdPs). A 429 is always safe to
  // retry — the request was rate-limited, not processed. Idempotent verbs retry
  // both 429 and 5xx.
  const method = (init.method ?? 'GET').toUpperCase();
  const nonIdempotent = method === 'POST' || method === 'PATCH' || options.retryServerErrors === false;
  let last: Response | undefined;
  for (let i = 0; i < attempts; i += 1) {
    // A fresh signal per attempt: a retry must get the full budget, not what
    // the attempt before it left over.
    const resp = await fetch(url, withRequestInit(config, init, options.timeoutMs));
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
    const resp = await fetchWithRetry(config,
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
    const unseen = cloudflareListUnseenItems(all, result);
    if (result.length > 0 && unseen.length === 0) return all;
    all.push(...unseen);
    if (!cloudflareListHasMorePages(json, result.length, page, perPage)) return all;
    page += 1;
  }
}

// Hard ceiling on pages followed per list, so an endpoint that always reports a
// full page (or ignores `page=` and never repeats an id) cannot loop forever.
export const CLOUDFLARE_LIST_MAX_PAGES = 100;

function cloudflareListItemKey(item: JsonObject | null | undefined): string | undefined {
  const key = item?.id ?? item?.uuid;
  return key === undefined || key === null ? undefined : String(key);
}

// The items of an incoming page not already collected, by id. An endpoint that
// ignores `page=` answers every page with the same items, and one whose
// underlying set shifts between requests (a create or delete racing the list)
// can repeat SOME ids on the next page while still carrying new ones. Only the
// repeats are dropped, never the whole page — a resource that first appears on
// a partially overlapping page must still be seen (a missed one turns a
// list-then-create into a duplicate create). The caller stops paging when a
// non-empty page yields nothing new. Items without an id cannot be deduplicated
// and are always kept.
function cloudflareListUnseenItems(collected: JsonObject[], incoming: JsonObject[]): JsonObject[] {
  if (collected.length === 0 || incoming.length === 0) return incoming;
  const previous = new Set<string>();
  for (const item of collected) {
    const key = cloudflareListItemKey(item);
    if (key !== undefined) previous.add(key);
  }
  if (previous.size === 0) return incoming;
  return incoming.filter((item) => {
    const key = cloudflareListItemKey(item);
    return key === undefined || !previous.has(key);
  });
}

// Cloudflare list envelopes are inconsistent: Workers scripts carry
// `result_info.total_pages`, D1 and Access carry `total_count`/`count`/`page`/
// `per_page` only. When neither is present, keep paging while a page is full.
// A field can also be present and unusable — `null` or `''` — and must be read
// as absent, never as a number: Number(null) is 0, and a 0 count ends
// pagination after page one, where a missed page is a missed resource that
// every strict caller reads as "does not exist".
// The page size Cloudflare ACTUALLY applied (`result_info.per_page`) wins over
// the one requested: an endpoint that clamps `per_page` to a smaller value
// would otherwise look exhausted after a "short" first page.
function cloudflareListReportsAnotherPage(json: JsonObject, pageLength: number, page: number, perPage: number): boolean {
  if (pageLength === 0) return false;
  const info = (json.result_info ?? {}) as JsonObject;
  const totalPages = Number(info.total_pages);
  if (Number.isFinite(totalPages) && totalPages > 0) return page < totalPages;
  const responsePerPage = Number(info.per_page);
  const effectivePerPage = Number.isFinite(responsePerPage) && responsePerPage > 0 ? responsePerPage : perPage;
  const totalCount = typeof info.total_count === 'number' ? info.total_count : NaN;
  if (Number.isFinite(totalCount) && totalCount >= 0) return page * effectivePerPage < totalCount;
  const count = typeof info.count === 'number' ? info.count : NaN;
  if (Number.isFinite(count) && count >= 0) return count >= effectivePerPage;
  return pageLength >= effectivePerPage;
}

// The same question with the page ceiling applied — the LENIENT stop. Only the
// picker-facing lists may end here early: they degrade to a partial list on
// purpose. The strict deploy-path reader must tell "the list ended" from "I
// stopped reading", so it asks cloudflareListReportsAnotherPage directly and
// fails closed when the ceiling is what stopped it.
function cloudflareListHasMorePages(json: JsonObject, pageLength: number, page: number, perPage: number): boolean {
  if (page >= CLOUDFLARE_LIST_MAX_PAGES) return false;
  return cloudflareListReportsAnotherPage(json, pageLength, page, perPage);
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
    const resp = await fetchWithRetry(config,
      base + sep + 'page=' + page + '&per_page=' + perPage,
      { method: 'GET', headers: await authHeaders(config) },
    );
    const json = await readCloudflareJson(resp);
    if (!resp.ok || json.success !== true || !Array.isArray(json.result)) {
      throw cloudflareError(json, resp.ok ? 502 : resp.status, what + ' failed.');
    }
    const result = json.result as JsonObject[];
    const unseen = cloudflareListUnseenItems(all, result);
    if (result.length > 0 && unseen.length === 0) return all;
    all.push(...unseen);
    const more = cloudflareListReportsAnotherPage(json, result.length, page, perPage);
    if (!more) return all;
    // The ceiling is where the LENIENT reader stops, and this function is not
    // it: returning the pages read so far hands every caller below a list that
    // was never read to its end, and every one of them reads a missing item as
    // "does not exist". A truncated scripts list reports an existing script as
    // absent — the verdict that makes scriptCreatedByThisRun true, passes
    // scriptExists=false to the bindings read, and lets the PUT replace the
    // user's KV/queue/DurableObject/service/vars bindings with nothing. D1 and
    // the Access IdP take the same wrong turn into a duplicate create. Fail
    // closed instead: a read that did not finish proves nothing.
    if (page >= CLOUDFLARE_LIST_MAX_PAGES) {
      throw new DeployError('Cloudflare list too large to read completely.', 502, undefined, 'CFW_LIST_TRUNCATED');
    }
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

// `_worker.js` is the entry name a site opts into by writing it. A root
// `worker.js` is NOT one: that is the conventional filename for a Web Worker a
// page loads from its own HTML, so reading it as the entry module both dropped
// the file from the asset manifest (it 404'd on the deployed site) and PUT a
// Web Worker as the script's main module.
function splitWorkerModule(files: WorkersFile[]): { moduleCode: string; assetFiles: WorkersFile[] } {
  const entry = files.find((file) => file.file === '_worker.js');
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
  const resp = await fetchWithRetry(config,
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
    let bodyBytes = 0;
    for (const hash of bucket) {
      const file = hashToFile.get(hash);
      if (!file) continue;
      const content = Buffer.from(file.data).toString('base64');
      bodyBytes += content.length;
      // A named File part, not a bare Blob: the multipart entry must carry a
      // filename or the assets endpoint drops it as a plain form field and the
      // upload session never completes.
      const type = file.contentType || 'application/octet-stream';
      form.append(hash, new File([content], hash, { type }), hash);
    }
    const timeoutMs = cloudflareUploadTimeoutMs(bodyBytes);
    let resp: Response;
    try {
      resp = await fetchWithRetry(config,
        CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/assets/upload?base64=true',
        { method: 'POST', headers: { Authorization: 'Bearer ' + sessionJwt }, body: form },
        3,
        { timeoutMs },
      );
    } catch (err) {
      if (isFetchTimeout(err)) throw uploadTimedOutError('Cloudflare assets upload', bodyBytes, timeoutMs);
      throw err;
    }
    const json = await readCloudflareJson(resp);
    // A 200-with-error-envelope (`{success:false, errors:[…]}`) must fail closed,
    // not silently leave completionJwt at the previous bucket's value.
    if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare assets upload failed.');
    const result = (json.result ?? {}) as JsonObject;
    if (result.jwt) completionJwt = String(result.jwt);
  }
  return completionJwt;
}

/** Binding types OpenDesign owns: the assets binding it injects, plus the R2 and
 * D1 bindings the config declares, which the deploy ensures and rewrites (a D1
 * databaseName is resolved to an id). Upload metadata REPLACES the script's
 * whole binding set, so naming only these types deleted every binding the user
 * had added by any other means. */
const WORKERS_MANAGED_BINDING_TYPES = new Set(['assets', 'r2_bucket', 'd1']);

/** Carried across an upload by `keep_bindings` rather than by re-sending: the
 * settings API redacts their values, so a re-sent entry would write "no value"
 * instead of copying the one on the script. */
const WORKERS_VALUE_OPAQUE_BINDING_TYPES = new Set(['secret_text', 'secret_key']);

/** The bindings already on the script that OpenDesign does not manage, ready to
 * be carried into the next upload's metadata. Entries whose shape cannot be
 * understood are dropped rather than forwarded: a malformed entry fails the
 * whole PUT, and one unreadable entry is not a reason to fail a deploy. */
function preservedWorkerBindings(existing: unknown): JsonObject[] {
  if (!Array.isArray(existing)) return [];
  const out: JsonObject[] = [];
  for (const entry of existing) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const binding = entry as JsonObject;
    const type = typeof binding.type === 'string' ? binding.type : '';
    const name = typeof binding.name === 'string' ? binding.name : '';
    if (!type || !name) continue;
    if (WORKERS_MANAGED_BINDING_TYPES.has(type)) continue;
    if (WORKERS_VALUE_OPAQUE_BINDING_TYPES.has(type)) continue;
    out.push(binding);
  }
  return out;
}

/** The config's own bindings first, then the carried ones that do not collide by
 * name: the OpenDesign config is authoritative for the names it declares. */
function mergeWorkerBindings(managed: JsonObject[], preserved: JsonObject[]): JsonObject[] {
  const declared = new Set(managed.map((binding) => String(binding.name)));
  return [...managed, ...preserved.filter((binding) => !declared.has(String(binding.name)))];
}

/** The one failure this read may not paper over: the deploy is about to replace
 * the script's whole binding set and could not read what is in it. */
function bindingsReadFailedError(cause?: unknown): DeployError {
  return new DeployError(
    'Cloudflare Workers settings read failed; refusing to replace the binding set.',
    502,
    cause === undefined ? undefined : (cause instanceof Error ? cause.message : String(cause)),
    'CFW_BINDINGS_READ_FAILED',
  );
}

/** The bindings a PUT would otherwise delete.
 *
 * A script that does not exist yet has none to carry, so the first-deploy path
 * returns early and pays no extra call. For a script that DOES exist the read
 * is load-bearing rather than best-effort: upload metadata REPLACES the
 * binding set, so an unread set does not mean "nothing to carry" — it means
 * "unknown bindings, about to be deleted". Returning [] there (the shape this
 * had) let one transient 429 or 5xx silently drop the user's KV namespaces,
 * queues, Durable Objects, services, vars, Hyperdrive and Vectorize configs;
 * the value-opaque secret types survive only because `keep_bindings` carries
 * them, which is exactly the half that does not help. Refuse the deploy
 * instead: a refused deploy is recoverable and says so, a replaced binding set
 * is neither.
 *
 * The one non-ok answer that is evidence rather than ignorance is 404: the
 * script is not there, so there are no bindings to carry. `scriptExists` comes
 * from a pre-PUT read that degrades to `unknown` — never `absent` — when that
 * read fails transiently, so a FIRST deploy can arrive here claiming a script
 * that does not exist, and refusing it told the user to preserve a binding set
 * that has never existed. Every other non-ok status (429, 5xx, transport) still
 * refuses: those mean the set is unknown, not empty, which is the distinction
 * this read exists to make. Whether the script exists is settled by the PUT
 * that follows, not by this read. */
async function readExistingWorkerBindings(
  config: WorkersDeployConfig,
  scriptName: string,
  scriptExists: boolean,
): Promise<JsonObject[]> {
  if (!scriptExists) return [];
  try {
    const resp = await fetchWithRetry(config,
      CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/scripts/' + encodeURIComponent(scriptName) + '/settings',
      { method: 'GET', headers: await authHeaders(config) },
    );
    // Checked before the body is parsed: a 404 from this endpoint means "no such
    // script", and the status is the whole fact. Parsing first let a non-JSON
    // 404 body turn that evidence back into an unreadable-set refusal.
    if (resp.status === 404) return [];
    const json = await readCloudflareJson(resp);
    if (!resp.ok || json.success === false) throw bindingsReadFailedError();
    const result = (json.result ?? {}) as JsonObject;
    return preservedWorkerBindings(result.bindings);
  } catch (err) {
    // A transport failure, a non-JSON body, a Cloudflare-level refusal and a
    // 429/5xx are one fact for this decision: the set is unknown.
    if (err instanceof DeployError && err.code === 'CFW_BINDINGS_READ_FAILED') throw err;
    throw bindingsReadFailedError(err);
  }
}

function workerMetadata(config: WorkersDeployConfig, assetsJwt?: string, runWorkerFirst = false, preservedBindings: JsonObject[] = []): JsonObject {
  const metadata: JsonObject = {
    main_module: 'index.js',
    compatibility_date: config.compatibilityDate || DEFAULT_COMPATIBILITY_DATE,
    keep_bindings: ['secret_text', 'secret_key'],
  };
  const userBindings: JsonObject[] = (config.bindings || []).map((b) => {
    // Only the field the binding's TYPE owns. Emitting by field presence put
    // `id` on an R2 binding, `bucket_name` on a D1 one, and both on anything
    // else — a shape Cloudflare refuses on the live script PUT, long after the
    // assets upload has been spent.
    if (b.type === 'r2_bucket') return { type: b.type, name: b.name, ...(b.bucketName !== undefined ? { bucket_name: b.bucketName } : {}) };
    if (b.type === 'd1') return { type: b.type, name: b.name, ...(b.id !== undefined ? { id: b.id } : {}) };
    return { type: b.type, name: b.name };
  });
  const bindings = mergeWorkerBindings(userBindings, preservedBindings);
  if (assetsJwt !== undefined) {
    metadata.bindings = [{ name: 'ASSETS', type: 'assets' }, ...bindings];
    const assets: JsonObject = { jwt: assetsJwt };
    if (runWorkerFirst) assets.config = { run_worker_first: true };
    metadata.assets = assets;
  } else if (bindings.length > 0) {
    metadata.bindings = bindings;
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

// What the script's `modified_on` looked like BEFORE this deploy's first PUT.
// `absent`: no script of that name existed, so any script found afterwards was
// created by this deploy. `known`: the stamp to beat. `unknown`: the pre-read
// failed or carried no usable stamp, so a later 5xx can never be proven
// committed and the PUT is retried instead.
type ScriptModifiedBaseline =
  | { kind: 'absent' }
  | { kind: 'known'; modifiedOn: number }
  | { kind: 'unknown' };

function parseScriptModifiedOn(script: JsonObject | null): number {
  return typeof script?.modified_on === 'string' ? Date.parse(script.modified_on) : NaN;
}

async function readScriptModifiedBaseline(config: WorkersDeployConfig, scriptName: string): Promise<ScriptModifiedBaseline> {
  try {
    const script = await getCloudflareWorkerScript(config, scriptName);
    if (!script) return { kind: 'absent' };
    const modifiedOn = parseScriptModifiedOn(script);
    return Number.isFinite(modifiedOn) ? { kind: 'known', modifiedOn } : { kind: 'unknown' };
  } catch {
    return { kind: 'unknown' };
  }
}

// Whether a script PUT that answered 5xx nevertheless landed: true only when
// the script's `modified_on` is strictly newer than the baseline read before
// the first PUT (or the script now exists where none did). The comparison is
// Cloudflare-clock to Cloudflare-clock on purpose — measuring against the
// daemon's `Date.now()` turns clock skew into a false "committed" and skips a
// PUT that never happened.
function scriptCommittedSinceBaseline(baseline: ScriptModifiedBaseline, script: JsonObject | null): boolean {
  if (baseline.kind === 'unknown' || !script) return false;
  if (baseline.kind === 'absent') return true;
  const modifiedOn = parseScriptModifiedOn(script);
  return Number.isFinite(modifiedOn) && modifiedOn > baseline.modifiedOn;
}

// The script PUT consumes the assets completion JWT. A 5xx may arrive AFTER the
// PUT committed, in which case a blind retry fails with a JWT error while the
// new version is already live. So: never retry the PUT on 5xx blindly — read
// the script's modified_on before the first PUT and check whether it advanced.
type WorkerScriptUploadResult = {
  json: JsonObject;
  /** True when no script of this name existed before this run's PUT, so this
   * run is the one that CREATED it. Cloudflare assigns a workers.dev route at
   * creation, so a first deploy reads that route back as already-enabled: the
   * flag is what keeps the exposure from being read as the user's own. */
  scriptCreatedByThisRun: boolean;
};

async function uploadWorkerScript(
  config: WorkersDeployConfig,
  scriptName: string,
  moduleCode: string,
  assetsJwt: string,
  runWorkerFirst = false,
): Promise<WorkerScriptUploadResult> {
  const url = CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/scripts/' + encodeURIComponent(scriptName);
  const baseline = await readScriptModifiedBaseline(config, scriptName);
  // `absent` is the only baseline that proves creation: a script found
  // afterwards cannot be this run's. A failed pre-read stays `unknown` — it
  // proves nothing either way, and claiming creation would withdraw a route the
  // user may already have had public. (`workerId === ''` carries the same fact
  // on the Access path, but it is `''` for EVERY deploy with Access off, so it
  // cannot be ORed in here without marking every such deploy's route as ours.)
  const scriptCreatedByThisRun = baseline.kind === 'absent';
  // Read ONCE, before the retry loop: what to carry is a property of the script
  // as this deploy found it, not of an attempt.
  const preservedBindings = await readExistingWorkerBindings(config, scriptName, baseline.kind !== 'absent');
  let lastJson: JsonObject = {};
  let lastStatus = 502;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const form = new FormData();
    const metadataJson = JSON.stringify(workerMetadata(config, assetsJwt, runWorkerFirst, preservedBindings));
    form.append('metadata', new Blob([metadataJson], { type: 'application/json' }));
    form.append('index.js', new Blob([moduleCode], { type: 'application/javascript+module' }), 'index.js');
    const bodyBytes = Buffer.byteLength(metadataJson) + Buffer.byteLength(moduleCode);
    const timeoutMs = cloudflareUploadTimeoutMs(bodyBytes);
    let resp: Response;
    try {
      resp = await fetchWithRetry(config, url, { method: 'PUT', headers: await authHeaders(config), body: form }, 3, { retryServerErrors: false, timeoutMs });
    } catch (err) {
      if (isFetchTimeout(err)) throw uploadTimedOutError('Cloudflare Workers script upload', bodyBytes, timeoutMs);
      throw err;
    }
    const json = await readCloudflareJson(resp);
    if (resp.ok && json.success !== false) return { json, scriptCreatedByThisRun };
    lastJson = json;
    lastStatus = resp.status;
    const is5xx = resp.status >= 500 && resp.status < 600;
    if (!is5xx) break;
    let committed = false;
    try {
      committed = scriptCommittedSinceBaseline(baseline, await getCloudflareWorkerScript(config, scriptName));
    } catch {
      committed = false;
    }
    if (committed) return { json: { success: true, result: { id: scriptName, committed_after_5xx: true } }, scriptCreatedByThisRun };
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
  }
  throw cloudflareError(lastJson, lastStatus, 'Cloudflare Workers script upload failed.');
}

async function uploadWorkerVersion(config: WorkersDeployConfig, scriptName: string, moduleCode: string, assetsJwt: string, runWorkerFirst = false): Promise<string> {
  // A version's metadata replaces its binding set the same way a PUT's does, and
  // the preview URL serves that version: bindings dropped here are bindings the
  // preview 500s on. The script exists by construction (a preview deploy
  // requires a production one).
  const preservedBindings = await readExistingWorkerBindings(config, scriptName, true);
  const form = new FormData();
  const metadataJson = JSON.stringify(workerMetadata(config, assetsJwt, runWorkerFirst, preservedBindings));
  form.append('metadata', new Blob([metadataJson], { type: 'application/json' }));
  form.append('index.js', new Blob([moduleCode], { type: 'application/javascript+module' }), 'index.js');
  const bodyBytes = Buffer.byteLength(metadataJson) + Buffer.byteLength(moduleCode);
  const timeoutMs = cloudflareUploadTimeoutMs(bodyBytes);
  let resp: Response;
  try {
    resp = await fetchWithRetry(config,
      CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/scripts/' + encodeURIComponent(scriptName) + '/versions',
      { method: 'POST', headers: await authHeaders(config), body: form },
      3,
      { timeoutMs },
    );
  } catch (err) {
    if (isFetchTimeout(err)) throw uploadTimedOutError('Cloudflare Workers version upload', bodyBytes, timeoutMs);
    throw err;
  }
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, 'Cloudflare Workers version upload failed.');
  const result = (json.result ?? {}) as JsonObject;
  return String(result.id ?? '');
}

async function readAccountSubdomain(config: WorkersDeployConfig): Promise<string> {
  const resp = await fetchWithRetry(config,
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

function workerSubdomainConfigUrl(config: WorkersDeployConfig, scriptName: string): string {
  return CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/workers/scripts/' + encodeURIComponent(scriptName) + '/subdomain';
}

// The script's current workers.dev config (`enabled`, `previews_enabled`).
// Every write to that config is a full replace, so a writer that changes one
// flag must read the other first or it clobbers it.
async function readWorkerSubdomainConfig(config: WorkersDeployConfig, scriptName: string): Promise<{ enabled: boolean; previewsEnabled: boolean }> {
  const getResp = await fetchWithRetry(config, workerSubdomainConfigUrl(config, scriptName), { method: 'GET', headers: await authHeaders(config) });
  const getJson = await readCloudflareJson(getResp);
  if (!getResp.ok || getJson.success === false) throw cloudflareError(getJson, getResp.status, 'Cloudflare workers.dev subdomain config lookup failed.');
  const current = (getJson.result ?? {}) as JsonObject;
  return { enabled: current.enabled === true, previewsEnabled: current.previews_enabled === true };
}

async function writeWorkerSubdomainConfig(
  config: WorkersDeployConfig,
  scriptName: string,
  body: { enabled: boolean; previews_enabled: boolean },
  what: string,
): Promise<void> {
  const resp = await fetchWithRetry(
    config,
    workerSubdomainConfigUrl(config, scriptName),
    { method: 'POST', headers: await authHeaders(config, { 'Content-Type': 'application/json' }), body: JSON.stringify(body) },
  );
  const json = await readCloudflareJson(resp);
  if (!resp.ok || json.success === false) throw cloudflareError(json, resp.status, what);
}

type WorkerPreviewsEnableResult = {
  /** True when previews_enabled was OFF before this call turned it on — the
   * exposure a later compensation must put back — or when this run created the
   * script, whose creation defaults are what the read-back is showing. */
  enabledByThisRun: boolean;
};

// Preview URLs only resolve when the script's subdomain config has
// previews_enabled. Turn it on without changing the production workers.dev
// exposure state (a preview deploy must not flip production public).
async function ensureWorkerPreviewsEnabled(
  config: WorkersDeployConfig,
  scriptName: string,
  scriptCreatedByThisRun: boolean,
): Promise<WorkerPreviewsEnableResult> {
  const current = await readWorkerSubdomainConfig(config, scriptName);
  // Already on: normally an exposure this run did not create and must not put
  // back. It is this run's all the same when this run created the script — what
  // the read-back shows is then Cloudflare's creation default, not a state the
  // user ever chose.
  if (current.previewsEnabled) return { enabledByThisRun: scriptCreatedByThisRun };
  await writeWorkerSubdomainConfig(
    config,
    scriptName,
    { enabled: current.enabled, previews_enabled: true },
    'Cloudflare workers.dev preview enable failed.',
  );
  return { enabledByThisRun: true };
}

// Turn previews_enabled back off (compensation only), leaving the production
// workers.dev route as it is.
async function disableWorkerPreviews(config: WorkersDeployConfig, scriptName: string): Promise<void> {
  const current = await readWorkerSubdomainConfig(config, scriptName);
  await writeWorkerSubdomainConfig(
    config,
    scriptName,
    { enabled: current.enabled, previews_enabled: false },
    'Cloudflare workers.dev preview disable failed.',
  );
}

type WorkerSubdomainEnableResult = {
  url: string;
  /** True when the workers.dev route was OFF before this call turned it on, or
   * when this run created the script (Cloudflare assigns the route at
   * creation, so the read-back would otherwise look like the user's own) — the
   * one fact a later compensation needs: a deploy that cannot be verified must
   * put back the exposure it created, and must not turn off a route the user
   * already had public. */
  enabledByThisRun: boolean;
};

// Turn the script's workers.dev route on. The POST replaces the whole config,
// so the current state is read first and `previews_enabled` is written back
// exactly as it was: a production deploy must not switch preview URLs on (an
// exposure nothing would ever withdraw) or off.
async function enableWorkerSubdomain(
  config: WorkersDeployConfig,
  scriptName: string,
  subdomain: string,
  scriptCreatedByThisRun: boolean,
): Promise<WorkerSubdomainEnableResult> {
  const current = await readWorkerSubdomainConfig(config, scriptName);
  await writeWorkerSubdomainConfig(
    config,
    scriptName,
    { enabled: true, previews_enabled: current.previewsEnabled },
    'Cloudflare workers.dev enable failed.',
  );
  return {
    url: 'https://' + scriptName + '.' + subdomain + '.workers.dev',
    enabledByThisRun: !current.enabled || scriptCreatedByThisRun,
  };
}

// Turn the script's workers.dev route back off (compensation only). The POST
// replaces the whole config, so previews_enabled is read first and written
// back as it is — a production compensation must not switch previews off.
async function disableWorkerSubdomain(config: WorkersDeployConfig, scriptName: string): Promise<void> {
  const current = await readWorkerSubdomainConfig(config, scriptName);
  await writeWorkerSubdomainConfig(
    config,
    scriptName,
    { enabled: false, previews_enabled: current.previewsEnabled },
    'Cloudflare workers.dev disable failed.',
  );
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

async function resolveCloudflareSelfEmail(token: string, requestInit: WorkersRequestInit = {}): Promise<string> {
  const resp = await fetch(CLOUDFLARE_API + '/user', { headers: cloudflareHeaders(token), signal: AbortSignal.timeout(CLOUDFLARE_PROBE_TIMEOUT_MS), ...requestInit });
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

/** The account's one-time PIN identity provider id, or '' when the account has
 * none. Strict about the list itself: a failed list throws, because reading it
 * as "no provider" is exactly what makes the caller POST a duplicate. Only the
 * adopt path, which is already handling a failure, swallows that throw. */
async function findOnetimepinIdentityProvider(config: WorkersDeployConfig): Promise<string> {
  const providers = await listCloudflareAllPagesStrict(
    config,
    '/accounts/' + encodeURIComponent(config.accountId) + '/access/identity_providers',
    100,
    'Cloudflare Access identity providers list',
  );
  const existing = providers.find((p) => p?.type === 'onetimepin');
  return existing && typeof existing.id === 'string' ? existing.id : '';
}

// One-time PIN (OTP) is not auto-added to new Zero Trust orgs — the default is
// the "Cloudflare" login (full Cloudflare account sign-in). To make the email
// one-time code the sign-in method, register an `onetimepin` identity provider
// and pin the app to it via `allowed_idps`.
async function ensureCloudflareOtpIdentityProvider(config: WorkersDeployConfig): Promise<string> {
  return withCloudflareAccountEnsureSingleFlight(config.accountId, async () => {
    // This list is what makes a second deploy adopt the first one's provider
    // instead of minting another; the single-flight above is what makes it run
    // after that create rather than beside it.
    const existingId = await findOnetimepinIdentityProvider(config);
    if (existingId) return existingId;
    const createResp = await fetchWithRetry(config,
      CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/access/identity_providers',
      {
        method: 'POST',
        headers: await authHeaders(config, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: 'One-time PIN login', type: 'onetimepin', config: {} }),
      },
    );
    const createJson = await readCloudflareJson(createResp);
    if (!createResp.ok || createJson.success === false) {
      // Only an auth failure means the token lacks the scope. A 5xx / 429 / 400
      // is a transient or malformed-request failure and must keep its real
      // status, so the client can retry it instead of sending the user to
      // reconnect Cloudflare for a permission it already has.
      if (createResp.status === 401 || createResp.status === 403) {
        throw new DeployError(
          'Cloudflare Access one-time PIN (OTP) login needs the "Identity Providers Write" permission. Reconnect Cloudflare to grant it, then redeploy.',
          createResp.status,
          undefined,
          'CFW_ACCESS_OTP_SCOPE_REQUIRED',
        );
      }
      // A conflict means the provider may have been created between our list and
      // our POST. Cloudflare does not dedupe identity providers by type, so
      // POSTing again is how duplicates accumulate — adopt the existing one.
      if (isAdoptableCreateConflict(createResp.status)) {
        const adopted = await findOnetimepinIdentityProvider(config).catch(() => '');
        if (adopted) return adopted;
      }
      throw cloudflareError(createJson, createResp.ok ? 502 : createResp.status, 'Cloudflare Access one-time PIN provider creation failed.');
    }
    const created = (createJson.result ?? {}) as JsonObject;
    if (typeof created.id === 'string') return created.id;
    throw new DeployError('Cloudflare Access one-time PIN provider returned no id.', 502, undefined, 'CFW_ACCESS_CREATE_FAILED');
  });
}

// An Access destination (a Worker tag) can belong to only one application —
// POSTing a second app for the same Worker fails with
// "access.api.error.conflict: destination belongs to another application".
// Find the app that already claims this Worker so we can update it in place.
async function findCloudflareAccessAppByWorker(config: WorkersDeployConfig, workerId: string): Promise<JsonObject | null> {
  const base = CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/access/apps';
  const all: JsonObject[] = [];
  let page = 1;
  for (;;) {
    const resp = await fetchWithRetry(config,
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
    // Only the repeats of an incoming page are dropped, never the whole page
    // (see cloudflareListUnseenItems): an endpoint that ignores `page=` answers
    // every page identically, and one whose app set shifts between requests can
    // repeat SOME ids while still carrying new ones. A page with nothing new
    // means the read is over — return null before the ceiling can be blamed.
    const unseen = cloudflareListUnseenItems(all, apps);
    if (apps.length > 0 && unseen.length === 0) return null;
    all.push(...unseen);
    // The LENIENT stop is not this one: it reads "the ceiling is where I stop"
    // as "the list ended", and every caller below reads a missing app as "no app
    // claims this Worker" — then POSTs a SECOND app for a Worker that already
    // has one (Cloudflare refuses the destination, and the deploy fails after
    // its script PUT). A listing that was never read to its end proves nothing
    // about absence, so the ceiling fails closed instead, exactly as
    // listCloudflareAllPagesStrict does for the other deploy-path reads. Asking
    // cloudflareListReportsAnotherPage directly is what tells "the list ended"
    // from "I stopped reading".
    if (!cloudflareListReportsAnotherPage(json, apps.length, page, 100)) return null;
    if (page >= CLOUDFLARE_LIST_MAX_PAGES) {
      throw new DeployError('Cloudflare list too large to read completely.', 502, undefined, 'CFW_LIST_TRUNCATED');
    }
    page += 1;
  }
}

export function normalizeHostname(hostname: string): string {
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
 * answer and an empty fallback would silently leave a routed hostname public.
 * Read to its last page, like the other deploy-path reads: this set becomes the
 * Access app's public destinations, so a routed hostname the read never reached
 * would sit outside the perimeter entirely. */
export async function listCloudflareWorkerDomainsForScript(
  config: WorkersDeployConfig,
  scriptName: string,
): Promise<CloudflareWorkerAttachedDomain[]> {
  const result = await listCloudflareAllPagesStrict(
    config,
    '/accounts/' + encodeURIComponent(config.accountId) + '/workers/domains?service=' + encodeURIComponent(scriptName),
    100,
    'Cloudflare Workers custom domains list',
  );
  return result
    // The `service` filter is a server-side hint; re-check it here so a
    // hostname routed to ANOTHER script can never be detached by this deploy.
    .filter((domain) => domain?.service === scriptName)
    .map((domain) => ({
      id: domain?.id !== undefined && domain?.id !== null ? String(domain.id) : '',
      hostname: typeof domain?.hostname === 'string' ? normalizeHostname(domain.hostname) : '',
    }))
    .filter((domain) => domain.id.length > 0 && domain.hostname.length > 0);
}

/** The Workers custom-domain record for ONE hostname, whichever script it is
 * routed to — `null` when the hostname is not a Workers custom domain at all.
 * The query is deliberately NOT filtered by service: the attach path uses the
 * answer to refuse a hostname that already belongs to another Worker, and a
 * service-filtered list can never see that Worker. Strict for the same
 * reason — a lenient `null` on a list failure would turn the refusal into a
 * hijack. Paged to the end for the same reason: a hostname bound to another
 * Worker on a page this read never reached would read as free, and the PUT that
 * follows would re-point it. The `hostname` query is a server-side hint; the
 * match is re-checked. */
export async function findCloudflareWorkerDomainByHostname(
  config: WorkersDeployConfig,
  hostname: string,
): Promise<CloudflareWorkerDomain | null> {
  const wanted = normalizeHostname(hostname);
  const result = await listCloudflareAllPagesStrict(
    config,
    '/accounts/' + encodeURIComponent(config.accountId) + '/workers/domains?hostname=' + encodeURIComponent(wanted),
    100,
    'Cloudflare Workers custom domain lookup',
  );
  const match = result.find(
    (domain) => typeof domain?.hostname === 'string' && normalizeHostname(domain.hostname) === wanted,
  );
  if (!match) return null;
  return {
    id: match.id !== undefined && match.id !== null ? String(match.id) : '',
    hostname: wanted,
    service: typeof match.service === 'string' ? match.service : '',
  };
}

/** The attach was refused before any PUT: the hostname is already routed to
 * another Worker, and re-pointing it would hijack that Worker's traffic. */
function customDomainBoundElsewhereError(hostname: string, bound: CloudflareWorkerDomain): DeployError {
  return new DeployError(
    'Custom domain "' + hostname + '" is already routed to Cloudflare Worker "' + bound.service + '". Detach it from that Worker first, or choose another hostname.',
    409,
    { hostname, service: bound.service, ...(bound.id ? { id: bound.id } : {}) },
    'CFW_DOMAIN_CONFLICT',
  );
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
    ? (input.selfEmail || await resolveCloudflareSelfEmail(await resolveConfigToken(config), config.requestInit))
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
  const resp = await fetchWithRetry(config,
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

export type CloudflareAccessPerimeterRetry = { attempts: number; baseMs: number; maxDelayMs: number };

/** Default probe budget for the post-deploy Access check: six probes with
 * exponential backoff capped per wait, about 7.5s of waiting in total. A
 * workers.dev name enabled seconds ago can take that long to answer at the
 * edge at all; the previous three-probe budget (under a second) declared such
 * a deploy unverified while it was merely still propagating. */
export const CLOUDFLARE_ACCESS_PERIMETER_RETRY_DEFAULTS: Readonly<CloudflareAccessPerimeterRetry> = Object.freeze({
  attempts: 6,
  baseMs: 300,
  maxDelayMs: 3000,
});

let accessPerimeterRetry: CloudflareAccessPerimeterRetry = { ...CLOUDFLARE_ACCESS_PERIMETER_RETRY_DEFAULTS };

/** Test hook: shrink (or restore, with no argument) the perimeter probe budget
 * so a suite asserting the unverified path does not wait out the real one.
 * Refuses a budget that would verify nothing (see the probe loop): a zero-probe
 * budget leaves every URL's verdict at the seeded `protected`, which reports a
 * deploy Access-verified on no evidence at all. */
export function configureCloudflareAccessPerimeterRetry(overrides?: Partial<CloudflareAccessPerimeterRetry>): void {
  const next = { ...CLOUDFLARE_ACCESS_PERIMETER_RETRY_DEFAULTS, ...(overrides ?? {}) };
  if (!Number.isFinite(next.attempts) || next.attempts <= 0) {
    throw new RangeError('Cloudflare Access perimeter retry attempts must be a positive number of probes; a zero-probe budget verifies nothing.');
  }
  accessPerimeterRetry = next;
}

/** What a perimeter probe learned about a public URL. The two failure kinds
 * are kept apart on purpose: only `unprotected` is an exposure. Everything a
 * probe cannot read as either one is `unreachable`, which defers. */
export type CloudflareAccessPerimeterVerdict =
  | { outcome: 'protected' }
  /** Nothing proved the URL is exposed — and nothing proved it is gated, so
   * the deploy is not `ready` either. Either no HTTP answer at all (DNS not
   * yet propagated, certificate still issuing, connection reset), or an answer
   * that settles neither question (a 4xx/5xx that is not the Access challenge:
   * a 404 while a route propagates, a 503 from an erroring Worker, a 429 from
   * the edge). An outage is not an exposure. */
  | { outcome: 'unreachable'; error: DeployError }
  /** A PROVEN non-gate answer: a 2xx, which serves the app itself. This is the
   * exposure the caller must withdraw. A 3xx to somewhere that is not the
   * Access login is deliberately NOT here: a custom Access login domain, an
   * enterprise IdP or the app's own redirect answers 3xx while the gate is
   * doing its job, so a 3xx proves nothing and defers as `unreachable`. */
  | { outcome: 'unprotected'; error: DeployError };

// One GET against a public URL; resolves to a verdict instead of throwing so
// the caller can retry a bounded number of times. GET, not HEAD: this probe
// asks the question a visitor's browser asks, and the challenge the edge
// serves for it — the login location, the cookie jar, the cf-mitigated stamp —
// is what a HEAD-only answer would not have to produce.
async function probeCloudflareAccessPerimeterOnce(url: string, requestInit: WorkersRequestInit): Promise<CloudflareAccessPerimeterVerdict> {
  let resp: Response;
  try {
    resp = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(CLOUDFLARE_PROBE_TIMEOUT_MS), ...requestInit });
  } catch (err) {
    // A timeout is "no answer", the same as a refused connection: nothing
    // proves the URL is exposed, so the caller defers rather than withdraws.
    const reason = isFetchTimeout(err)
      ? 'no response within ' + CLOUDFLARE_PROBE_TIMEOUT_MS + 'ms'
      : String((err as Error)?.message || err);
    return {
      outcome: 'unreachable',
      error: new DeployError(
        'Could not reach ' + url + ' to verify Cloudflare Access: ' + reason,
        502,
        { url },
        'CFW_ACCESS_UNVERIFIED',
      ),
    };
  }
  const status = resp.status;
  const location = resp.headers?.get?.('location') || '';
  if (isCloudflareAccessRedirect(status, location)) return { outcome: 'protected' };
  // Only a 2xx proves the gate absent: it serves the app itself. A 3xx is NOT
  // proof of anything — a custom Access login domain, an enterprise IdP or the
  // app's own redirect answers 3xx while the gate is very much present, and
  // reading one as ungated withdrew a working deploy's workers.dev route and
  // hostname. It falls through to `unreachable`, which defers.
  if (status < 300) {
    return {
      outcome: 'unprotected',
      error: new DeployError(
        url + ' is not behind Cloudflare Access (HTTP ' + status + '). The deploy was not marked ready.',
        502,
        { url, status },
        'CFW_ACCESS_UNVERIFIED',
      ),
    };
  }
  // 401/403 is how Access challenges a request it will not redirect (an API
  // call, a client that does not follow the login flow). Only EDGE evidence
  // counts: the Access login location, the Access cookies, or the edge's own
  // cf-mitigated challenge stamp. The body deliberately does NOT, because this
  // probe's URL belongs to the Worker being deployed — an app whose own 403
  // contains the words "Cloudflare Access" would verify its own gate and an
  // ungated URL would be reported protected. A bare 401/403 falls through to
  // `unreachable` below, which defers instead of verifying.
  if (status === 401 || status === 403) {
    if (isCloudflareAccessChallengeResponse(resp)) return { outcome: 'protected' };
  }
  // Anything else — a 404 while a hostname's route propagates, a 503 from a
  // Worker that is erroring, a 429 from the edge — answers neither question.
  // Deferring is the only safe reading: classifying it as ungated would
  // withdraw a working deploy's attach and workers.dev route over an outage.
  return {
    outcome: 'unreachable',
    error: new DeployError(
      'Could not verify that ' + url + ' is behind Cloudflare Access: HTTP ' + status + ' proves neither the Access challenge nor an ungated URL. The deploy was not marked ready.',
      502,
      { url, status },
      'CFW_ACCESS_UNVERIFIED',
    ),
  };
}

// Hard post-deploy assertion: every URL a deploy with Access enabled reports
// must answer with an Access login redirect. This holds regardless of any
// future ordering bug in the steps above. A fresh custom hostname (certificate
// still issuing) or a just-enabled workers.dev name can take a moment to
// answer at all, so each URL gets a short bounded retry. Every URL is probed
// and the verdicts are ranked: one `unprotected` URL is an exposure and
// outranks any number of `unreachable` ones, because the caller withdraws on
// `unprotected` only and merely defers on `unreachable`.
export async function verifyCloudflareAccessPerimeter(urls: string[], requestInit: WorkersRequestInit): Promise<CloudflareAccessPerimeterVerdict> {
  // Zero probes prove nothing: an empty list must never come back `protected`
  // (the loop below would fall through to it). It is `unreachable`, so the
  // caller defers rather than marks the deploy ready or withdraws anything.
  if (urls.length === 0) {
    return {
      outcome: 'unreachable',
      error: new DeployError(
        'No public URL to verify Cloudflare Access against. The deploy was not marked ready.',
        502,
        { urls: [] },
        'CFW_ACCESS_UNVERIFIED',
      ),
    };
  }
  // At least one probe per URL: the per-URL verdict below is SEEDED at
  // `protected` and only the loop can change it, so a budget that floors to
  // zero would return that seed without ever asking a question — Access
  // verified on no evidence. The setter refuses such an override; this floor
  // is what keeps the loop itself unable to reach it.
  const attempts = Math.max(1, Math.floor(accessPerimeterRetry.attempts));
  const { baseMs, maxDelayMs } = accessPerimeterRetry;
  let unreachable: CloudflareAccessPerimeterVerdict | null = null;
  for (const url of urls) {
    let verdict: CloudflareAccessPerimeterVerdict = { outcome: 'protected' };
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      verdict = await probeCloudflareAccessPerimeterOnce(url, requestInit);
      if (verdict.outcome === 'protected') break;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(maxDelayMs, baseMs * 2 ** attempt)));
      }
    }
    if (verdict.outcome === 'unprotected') return verdict;
    if (verdict.outcome === 'unreachable' && !unreachable) unreachable = verdict;
  }
  return unreachable ?? { outcome: 'protected' };
}

// A perimeter probe that got no answer is not an exposure, so nothing is
// withdrawn: the attach and its write-ahead stay. The deploy is reported
// `link-delayed` with the gate explicitly unverified, and the later link check
// (checkDeploymentUrl) re-probes the URL and reports the Access redirect as
// `protected` once DNS and the certificate have caught up.
function deferAccessVerification(metadata: JsonObject, steps: DeployStep[], verdict: { error: DeployError }): string {
  metadata.accessVerified = false;
  metadata.accessVerificationDeferred = verdict.error.message;
  steps.push({ name: 'access-verify', status: 'done', detail: 'deferred: ' + verdict.error.message });
  return verdict.error.message;
}

// Compensation for a perimeter check that failed: the deploy is not `ready`,
// so no exposure THIS run created may outlive it. The workers.dev route goes
// back off only when this run turned it on (a route the user already had
// public stays as it was), and the hostname this run attached is detached. A
// hostname that was already routed to the script before this run is not this
// run's exposure and is left alone. Each step is best-effort and lands on the
// step list; the perimeter error is what surfaces. A detached hostname is
// dropped from `attachedCustomDomains` so the failed-deploy bookkeeping does
// not record as owned an attachment that no longer exists, and added to
// `releasedCustomDomains` so the route drops its attach write-ahead too. A
// hostname whose domain id cannot be resolved is NOT detached — it is still
// routed and public — so it stays owned (and out of `releasedCustomDomains`)
// and only the step records the failure.
async function withdrawUnverifiedExposure(
  config: WorkersDeployConfig,
  input: {
    scriptName: string;
    subdomainEnabledByThisRun: boolean;
    attachedCustomDomains: CloudflareOwnedCustomDomain[];
    detachableHostnames: readonly string[];
    releasedCustomDomains: string[];
    steps: DeployStep[];
  },
): Promise<void> {
  const { steps } = input;
  const describe = (err: unknown) => (err instanceof Error ? err.message : String(err));
  if (input.subdomainEnabledByThisRun) {
    try {
      await disableWorkerSubdomain(config, input.scriptName);
      steps.push({ name: 'subdomain-disable', status: 'done' });
    } catch (err) {
      console.error(`[cloudflare-workers] Access unverified; could not turn workers.dev back off for ${input.scriptName}: ${describe(err)}`);
      steps.push({ name: 'subdomain-disable', status: 'error', detail: describe(err) });
    }
  }
  for (const attached of [...input.attachedCustomDomains]) {
    if (!input.detachableHostnames.includes(attached.hostname)) continue;
    try {
      let domainId = attached.id ?? '';
      if (!domainId) {
        // The attach response carried no id; the list does.
        const routed = await listCloudflareWorkerDomainsForScript(config, input.scriptName);
        domainId = routed.find((domain) => domain.hostname === attached.hostname)?.id ?? '';
      }
      if (domainId) {
        await detachCloudflareWorkerDomain(config, domainId);
        const index = input.attachedCustomDomains.indexOf(attached);
        if (index >= 0) input.attachedCustomDomains.splice(index, 1);
        if (!input.releasedCustomDomains.includes(attached.hostname)) input.releasedCustomDomains.push(attached.hostname);
        steps.push({ name: 'custom-domain-detach', status: 'done', detail: attached.hostname });
      } else {
        // No id on the attach response and none from the strict re-list: there
        // is nothing to DELETE with, so the hostname is STILL ROUTED AND
        // PUBLIC. Dropping it from `attachedCustomDomains` and calling it
        // released would tell three bookkeeping paths (the error's attach list,
        // the route's write-ahead, and the exposure record the link check
        // reads) that a live hostname is gone — which is how an exposure gets
        // forgotten. It stays owned; the step says what happened.
        console.error(`[cloudflare-workers] Access unverified; could not resolve the domain id to detach ${attached.hostname}; it stays routed and is kept as owned`);
        steps.push({ name: 'custom-domain-detach', status: 'error', detail: attached.hostname + ': could not resolve the domain id to detach' });
      }
    } catch (err) {
      console.error(`[cloudflare-workers] Access unverified; could not detach ${attached.hostname} again: ${describe(err)}`);
      steps.push({ name: 'custom-domain-detach', status: 'error', detail: attached.hostname + ': ' + describe(err) });
    }
  }
}

// Preview counterpart of withdrawUnverifiedExposure: the only exposure a
// preview deploy can create is previews_enabled, and only when THIS run turned
// it on. Best-effort; the perimeter error is what surfaces.
async function withdrawUnverifiedPreviewExposure(
  config: WorkersDeployConfig,
  input: { scriptName: string; previewsEnabledByThisRun: boolean; steps: DeployStep[] },
): Promise<void> {
  if (!input.previewsEnabledByThisRun) return;
  try {
    await disableWorkerPreviews(config, input.scriptName);
    input.steps.push({ name: 'previews-disable', status: 'done' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cloudflare-workers] Access unverified; could not turn previews back off for ${input.scriptName}: ${message}`);
    input.steps.push({ name: 'previews-disable', status: 'error', detail: message });
  }
}

/** The exposure a deploy created and could not verify because its public URL
 * did not answer (`link-delayed`, `accessVerified: false`). Recorded on the
 * deploy's metadata so the later link check can withdraw it if the URL turns
 * out to answer WITHOUT the Access gate — the same compensation the deploy
 * itself applies when the answer arrives in time. Only what THIS run created
 * is listed: a route or hostname the user already had public is never here. */
export type CloudflareUnverifiedExposure = {
  scriptName: string;
  /** Production: this run turned the workers.dev route on. */
  subdomainEnabledByThisRun?: boolean;
  /** Preview: this run turned previews_enabled on. */
  previewsEnabledByThisRun?: boolean;
  /** Production: hostnames this run attached that were not routed before. */
  detachableCustomDomains?: CloudflareOwnedCustomDomain[];
};

const UNVERIFIED_EXPOSURE_KEY = 'unverifiedExposure';

/** The metadata form of an exposure (see unverifiedExposureFromMetadata for
 * the inverse), or undefined when there is nothing left to withdraw. */
export function serializeUnverifiedExposure(exposure: CloudflareUnverifiedExposure): JsonObject | undefined {
  const detachable = exposure.detachableCustomDomains ?? [];
  if (!exposure.subdomainEnabledByThisRun && !exposure.previewsEnabledByThisRun && detachable.length === 0) return undefined;
  const recorded: JsonObject = { scriptName: exposure.scriptName };
  if (exposure.subdomainEnabledByThisRun) recorded.subdomainEnabledByThisRun = true;
  if (exposure.previewsEnabledByThisRun) recorded.previewsEnabledByThisRun = true;
  if (detachable.length > 0) {
    recorded.detachableCustomDomains = detachable.map((domain) => (domain.id ? { id: domain.id, hostname: domain.hostname } : { hostname: domain.hostname }));
  }
  return recorded;
}

/** The union of an exposure a record already carries and one this run created,
 * for the records whose metadata REPLACES a prior record's — a preview deploy's
 * does (see the preview branch below). Both halves describe live, unwithdrawn
 * exposure, and each field is a separate handle: the workers.dev route, the
 * preview route, and each attached hostname. Replacing instead of merging drops
 * the half that is not this run's, which is a route or hostname that IS public
 * and ends up recorded nowhere, with the link check that must withdraw it
 * holding nothing to act on. Hostnames are unioned by name (one hostname is one
 * handle, however many records list it); `own` names the script, which is the
 * same script for both halves. */
export function mergeUnverifiedExposure(
  prior: CloudflareUnverifiedExposure | undefined,
  own: CloudflareUnverifiedExposure,
): CloudflareUnverifiedExposure {
  const merged: CloudflareUnverifiedExposure = { scriptName: own.scriptName };
  if (prior?.subdomainEnabledByThisRun || own.subdomainEnabledByThisRun) merged.subdomainEnabledByThisRun = true;
  if (prior?.previewsEnabledByThisRun || own.previewsEnabledByThisRun) merged.previewsEnabledByThisRun = true;
  const detachable: CloudflareOwnedCustomDomain[] = [];
  for (const domain of [...(prior?.detachableCustomDomains ?? []), ...(own.detachableCustomDomains ?? [])]) {
    if (!detachable.some((kept) => kept.hostname === domain.hostname)) detachable.push(domain);
  }
  if (detachable.length > 0) merged.detachableCustomDomains = detachable;
  return merged;
}

function recordUnverifiedExposure(metadata: JsonObject, exposure: CloudflareUnverifiedExposure): void {
  const recorded = serializeUnverifiedExposure(exposure);
  if (recorded) metadata[UNVERIFIED_EXPOSURE_KEY] = recorded;
}

/**
 * What is STILL exposed after a withdrawal attempt: the part of `exposure`
 * whose compensation did not succeed. The workers.dev route (or previews)
 * stays listed unless its disable step reported `done`, and a hostname stays
 * listed unless it is among the ones actually detached. Every step of the
 * withdrawal is best-effort, so a caller that cleared the whole record on any
 * outcome would drop the only handle on a route that is still public — with
 * nothing left to retry. Undefined means everything was withdrawn.
 */
export function remainingUnverifiedExposure(
  exposure: CloudflareUnverifiedExposure,
  withdrawn: { steps: readonly DeployStep[]; detachedCustomDomains: readonly CloudflareOwnedCustomDomain[] },
): CloudflareUnverifiedExposure | undefined {
  const stepDone = (name: string): boolean => withdrawn.steps.some((step) => step.name === name && step.status === 'done');
  const remaining: CloudflareUnverifiedExposure = { scriptName: exposure.scriptName };
  if (exposure.subdomainEnabledByThisRun && !stepDone('subdomain-disable')) remaining.subdomainEnabledByThisRun = true;
  if (exposure.previewsEnabledByThisRun && !stepDone('previews-disable')) remaining.previewsEnabledByThisRun = true;
  const stillAttached = (exposure.detachableCustomDomains ?? []).filter(
    (domain) => !withdrawn.detachedCustomDomains.some((detached) => detached.hostname === domain.hostname),
  );
  if (stillAttached.length > 0) remaining.detachableCustomDomains = stillAttached;
  return serializeUnverifiedExposure(remaining) ? remaining : undefined;
}

/** Annotate the perimeter error of an UNPROTECTED deploy with what the verdict
 * proved and what the withdrawal could not take back. The deploy is about to
 * fail, and the route's failure bookkeeping would otherwise record OWNERSHIP
 * alone: a workers.dev route or hostname that IS public ends up recorded
 * nowhere (nothing left that knows to withdraw it), and the record carries no
 * Access marker — so the next check-link hands it to the generic reachability
 * probe, where a plain 200 becomes status `ready` / "Public link is ready." —
 * the very answer this deploy proved was an exposure.
 *
 * The annotated fields are the ones the link check writes when it reaches this
 * verdict itself (see routes/deploy.ts failUnverified), so a record written
 * from a failed deploy and one written from a failed check carry the same
 * state. Only what is STILL exposed is attached: a withdrawal that took
 * everything back leaves no `unverifiedExposure` key, and the record is then
 * the verdict alone (retried, never promoted on a plain 200). */
function markAccessUnverifiedFailure<T extends Error>(
  error: T,
  exposure: CloudflareUnverifiedExposure,
  withdrawn: { steps: readonly DeployStep[]; detachedCustomDomains: readonly CloudflareOwnedCustomDomain[] },
): T {
  const remaining = remainingUnverifiedExposure(exposure, withdrawn);
  const recorded = remaining ? serializeUnverifiedExposure(remaining) : undefined;
  const annotated = error as T & { accessProtected?: boolean; check?: JsonObject; unverifiedExposure?: JsonObject };
  annotated.accessProtected = true;
  const details = (error as { details?: { status?: unknown } }).details;
  annotated.check = {
    ...(typeof details?.status === 'number' ? { status: details.status } : {}),
    ok: false,
    detail: 'CFW_ACCESS_UNVERIFIED',
  };
  if (recorded) annotated.unverifiedExposure = recorded;
  return error;
}

/** The exposure a deferred deploy recorded (see CloudflareUnverifiedExposure),
 * when well-formed. */
export function unverifiedExposureFromMetadata(metadata: unknown): CloudflareUnverifiedExposure | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const raw = (metadata as JsonObject)[UNVERIFIED_EXPOSURE_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const entry = raw as JsonObject;
  const scriptName = typeof entry.scriptName === 'string' ? entry.scriptName : '';
  if (!scriptName) return undefined;
  const out: CloudflareUnverifiedExposure = { scriptName };
  if (entry.subdomainEnabledByThisRun === true) out.subdomainEnabledByThisRun = true;
  if (entry.previewsEnabledByThisRun === true) out.previewsEnabledByThisRun = true;
  const detachable = ownedCustomDomainsFromMetadata({ ownedCustomDomains: entry.detachableCustomDomains });
  if (detachable.length > 0) out.detachableCustomDomains = detachable;
  return out;
}

/** Withdraw an exposure a deferred deploy recorded, once the link check has
 * proven the URL answers without the gate. Best-effort per step, like the
 * in-deploy compensation; returns what it did so the caller can record it and
 * stop vouching for the hostnames that are gone. */
export async function withdrawRecordedUnverifiedExposure(
  config: { token: string | CloudflareTokenProvider; accountId: string; requestInit?: WorkersRequestInit | undefined },
  exposure: CloudflareUnverifiedExposure,
): Promise<{ steps: DeployStep[]; detachedCustomDomains: CloudflareOwnedCustomDomain[] }> {
  return withWorkersDispatcher(config.requestInit, async (requestInit) => {
    const cfg: WorkersDeployConfig = { token: config.token, accountId: config.accountId, requestInit };
    const steps: DeployStep[] = [];
    if (exposure.previewsEnabledByThisRun) {
      await withdrawUnverifiedPreviewExposure(cfg, { scriptName: exposure.scriptName, previewsEnabledByThisRun: true, steps });
    }
    const attached = [...(exposure.detachableCustomDomains ?? [])];
    const released: string[] = [];
    if (exposure.subdomainEnabledByThisRun || attached.length > 0) {
      await withdrawUnverifiedExposure(cfg, {
        scriptName: exposure.scriptName,
        subdomainEnabledByThisRun: Boolean(exposure.subdomainEnabledByThisRun),
        attachedCustomDomains: attached,
        detachableHostnames: attached.map((domain) => domain.hostname),
        releasedCustomDomains: released,
        steps,
      });
    }
    // withdrawUnverifiedExposure removes each hostname it detached from the
    // attached list; whatever is left could not be detached and stays owned.
    const detachedCustomDomains = (exposure.detachableCustomDomains ?? []).filter(
      (domain) => !attached.some((remaining) => remaining.hostname === domain.hostname),
    );
    return { steps, detachedCustomDomains };
  });
}

function accessAppReferencesWorker(app: JsonObject | null, workerId: string): boolean {
  const dests = Array.isArray(app?.destinations) ? (app!.destinations as JsonObject[]) : [];
  return dests.some((d) => (d?.type === 'worker' || d?.type === 'preview_worker') && d?.worker_id === workerId);
}

async function getCloudflareAccessApp(config: WorkersDeployConfig, appId: string): Promise<JsonObject | null> {
  const resp = await fetchWithRetry(config,
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

/** Hostnames a deploy was ABOUT to attach when its record was last written
 * (`providerMetadata.pendingCustomDomains`, written ahead of the attach call
 * via `onBeforeAttach`). Without the write-ahead, a crash between the attach
 * and the deploy's record write leaves the hostname routed to the script but
 * recorded nowhere — foreign forever. A pending hostname is vouched for by
 * hostname only (no domain id exists yet) until real ownership lands or a
 * later production deploy reconciles it. */
export function pendingCustomDomainsFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const pending = (metadata as JsonObject).pendingCustomDomains;
  if (!Array.isArray(pending)) return [];
  const out: string[] = [];
  for (const entry of pending) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const raw = (entry as JsonObject).hostname;
    const hostname = typeof raw === 'string' ? normalizeHostname(raw) : '';
    if (hostname && !out.includes(hostname)) out.push(hostname);
  }
  return out;
}

/** Hostnames a Workers deploy reported as certainly NOT attached
 * (`releasedCustomDomains` on its error): a 4xx-refused attach, or an attach
 * this run withdrew again. Their attach write-ahead can be dropped. */
export function releasedCustomDomainsFromWorkersDeploy(source: unknown): string[] {
  const released = (source as { releasedCustomDomains?: unknown } | null | undefined)?.releasedCustomDomains;
  if (!Array.isArray(released)) return [];
  const out: string[] = [];
  for (const entry of released) {
    const hostname = typeof entry === 'string' ? normalizeHostname(entry) : '';
    if (hostname && !out.includes(hostname)) out.push(hostname);
  }
  return out;
}

/** Hostnames a successful PRODUCTION deploy resolved
 * (`resolvedPendingCustomDomains` on its result metadata): every write-ahead it
 * was handed. The strict routed list it reconciled proved each one is now
 * either owned by this deploy's record (the configured hostname), detached
 * (a stale owned hostname), or never attached — so no record of the script
 * has anything left to vouch for. */
export function resolvedPendingCustomDomainsFromWorkersDeploy(source: unknown): string[] {
  const resolved = (source as { resolvedPendingCustomDomains?: unknown } | null | undefined)?.resolvedPendingCustomDomains;
  if (!Array.isArray(resolved)) return [];
  const out: string[] = [];
  for (const entry of resolved) {
    const hostname = typeof entry === 'string' ? normalizeHostname(entry) : '';
    if (hostname && !out.includes(hostname)) out.push(hostname);
  }
  return out;
}

/** The prior Access app id a Workers deploy deleted with Access off
 * (`retiredAccessAppId` on its result metadata or its error). */
export function retiredAccessAppIdFromWorkersDeploy(source: unknown): string | undefined {
  const id = (source as { retiredAccessAppId?: unknown } | null | undefined)?.retiredAccessAppId;
  return typeof id === 'string' && id ? id : undefined;
}

/** The Access apps an OpenDesign deploy RETAINED: apps it created that still
 * guard the Worker a script-name change moved away from, so deleting them would
 * make that Worker public. They are NOT this Worker's protection —
 * `accessAppId` never names one — but they are the only handles OpenDesign has
 * on apps it owns, and a step-log string is not a handle a later deploy or the
 * UI can read back, so the record carries them under their own key. */
export function retainedAccessAppIdsFromMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const value = (metadata as JsonObject).retainedAccessAppIds;
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !entry) continue;
    if (!out.includes(entry)) out.push(entry);
  }
  return out;
}

/** Everything a set of records vouches for: the recorded owned hostnames plus
 * every pending hostname not already among them, as hostname-only entries so
 * `isOwnedCustomDomain` matches a pending one by hostname. */
export function vouchedCustomDomains(
  owned: readonly CloudflareOwnedCustomDomain[],
  pending: readonly string[],
): CloudflareOwnedCustomDomain[] {
  const out: CloudflareOwnedCustomDomain[] = [...owned];
  for (const hostname of pending) {
    if (!out.some((entry) => entry.hostname === hostname)) out.push({ hostname });
  }
  return out;
}

/** The custom hostname a prior deployment recorded for display
 * (`providerMetadata.customDomain`: id, hostname, url), when well-formed. A
 * preview deploy copies it forward because its metadata replaces the record's. */
export function recordedCustomDomainFromMetadata(metadata: unknown): JsonObject | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const value = (metadata as JsonObject).customDomain;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entry = value as JsonObject;
  return typeof entry.hostname === 'string' && entry.hostname ? { ...entry } : undefined;
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
  const resp = await fetchWithRetry(config,
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
  /** Hostnames a prior deploy wrote ahead of its attach and never resolved
   * (see pendingCustomDomainsFromMetadata). Vouched for by hostname, like an
   * owned entry without an id; a preview deploy carries them forward. */
  priorPendingCustomDomains?: readonly string[] | undefined;
  /** Write-ahead hook, awaited immediately BEFORE the custom-domain attach with
   * the hostname about to be attached. The route persists it as pending so a
   * crash between the attach and the record write cannot orphan the hostname.
   * A throw here aborts the deploy before anything is attached. */
  onBeforeAttach?: ((hostname: string) => Promise<void> | void) | undefined;
  /** The custom hostname a prior deployment recorded for display (see
   * recordedCustomDomainFromMetadata). A preview deploy carries it forward. */
  priorCustomDomain?: JsonObject | undefined;
  /** The exposure a prior OpenDesign deployment deferred (see
   * CloudflareUnverifiedExposure). A preview deploy carries it forward for the
   * same reason it carries the custom domain: its metadata REPLACES the
   * record's, and an exposure dropped here is a public route or hostname the
   * link check that must withdraw it no longer knows about. */
  priorUnverifiedExposure?: CloudflareUnverifiedExposure | undefined;
  /** Re-resolved before every Cloudflare call. Defaults to the OAuth access
   * token resolver in 'oauth' mode and to the static `config.token` otherwise. */
  tokenProvider?: CloudflareTokenProvider | undefined;
}): Promise<CloudflareWorkersDeployResult> {
  // Every Cloudflare call of this deploy — list, upload, PUT, Access, probe —
  // rides one proxy dispatcher, closed when the deploy ends.
  return withWorkersDispatcher(undefined, (requestInit) => deployToCloudflareWorkersWith(input, requestInit));
}

async function deployToCloudflareWorkersWith(
  input: Parameters<typeof deployToCloudflareWorkers>[0],
  requestInit: WorkersRequestInit,
): Promise<CloudflareWorkersDeployResult> {
  const { config, files, projectId = '', projectName = '', target = 'production', access, priorAccessAppId, customDomain, priorCustomDomain, priorUnverifiedExposure, onBeforeAttach } = input ?? {};
  const priorOwnedCustomDomains = input?.priorOwnedCustomDomains ?? [];
  const priorPendingCustomDomains = input?.priorPendingCustomDomains ?? [];
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
    requestInit,
  };
  // Resolve the "only me" email BEFORE any upload. In OAuth mode the email
  // captured at connect time is authoritative (`GET /user` needs a scope an
  // older connection may never have granted); token mode and records written
  // before the capture existed fall back to the live lookup. Either way an
  // unresolvable rule fails here, not after the assets are already uploaded.
  let selfEmail = '';
  if (accessOn && access!.rule!.kind === 'self') {
    if (config.credentialMode === 'oauth') selfEmail = await getCloudflareOAuthStoredEmail();
    if (!selfEmail) selfEmail = await resolveCloudflareSelfEmail(token, cfg.requestInit);
    if (!selfEmail) throw selfEmailUnresolvedError();
  }
  const steps: DeployStep[] = [];
  // Custom hostnames THIS deploy attached. Reported on the error when the deploy
  // fails afterwards, so the route can record them as owned — otherwise a
  // hostname attached by a failed deploy is routed to the script but never
  // owned, and no later deploy or detach request may touch it.
  const attachedCustomDomains: CloudflareOwnedCustomDomain[] = [];
  // Stale OWNED hostnames THIS deploy detached. Reported on the error when the
  // deploy fails afterwards, so the route stops vouching for them — otherwise
  // the record keeps listing a hostname that is no longer routed, and a later
  // dashboard re-attach of it would be classified owned and detached again.
  const detachedCustomDomains: CloudflareOwnedCustomDomain[] = [];
  // Hostnames THIS deploy is certain are NOT attached to the script: an attach
  // Cloudflare rejected outright (4xx — never processed), or one this run
  // attached and then detached again. Reported on the error so the route drops
  // their attach write-ahead (`pendingCustomDomains`); an ambiguous failure
  // (5xx, transport) is NOT listed and its write-ahead stays.
  const releasedCustomDomains: string[] = [];
  // The prior Access app this deploy deleted with Access off. Reported on the
  // result AND on the error so every record still carrying that id stops
  // claiming the Worker is protected by an app that no longer exists.
  let retiredAccessAppId = '';
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
      // A preview never touches custom-domain routing, but this metadata
      // REPLACES the record's (routes/deploy.ts), so the production ownership
      // must ride along — the same reason priorAccessAppId is kept below.
      // Without it the next production deploy or detach finds the hostname
      // routed to the script but recorded nowhere, and classifies it foreign.
      metadata.ownedCustomDomains = priorOwnedCustomDomains.map((owned) =>
        owned.id ? { id: owned.id, hostname: owned.hostname } : { hostname: owned.hostname });
      // Pending write-aheads ride along unchanged (carried, never promoted):
      // only a production deploy resolves them — and when it does, it reports
      // them as `resolvedPendingCustomDomains` so the route clears the copies
      // carried here (this record is then a sibling of the resolving one).
      if (priorPendingCustomDomains.length > 0) {
        metadata.pendingCustomDomains = priorPendingCustomDomains.map((hostname) => ({ hostname }));
      }
      if (priorCustomDomain) metadata.customDomain = { ...priorCustomDomain };
      // A deferred deploys's unwithdrawn exposure rides along for the same
      // reason as the ownership above: dropping it would leave a route or
      // hostname that IS public recorded nowhere, so the link check that
      // withdraws it would find nothing to withdraw. Carrying it changes no
      // call this deploy makes — a preview never withdraws anything itself.
      if (priorUnverifiedExposure) recordUnverifiedExposure(metadata, priorUnverifiedExposure);
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
      // A preview deploy is never the run that created the script: the
      // CFW_PREVIEW_REQUIRES_PRODUCTION gate above proved it already existed.
      const previews = await ensureWorkerPreviewsEnabled(cfg, scriptName, false);
      steps.push({ name: 'previews', status: 'done' });
      const prefix = versionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'preview';
      const url = 'https://' + prefix + '-' + scriptName + '.' + subdomain + '.workers.dev';
      let accessDeferred = '';
      if (accessOn) {
        // Same hard constraint as production: a preview URL that answers
        // WITHOUT the gate must not stay reachable through an exposure this
        // run created — previews_enabled goes back off when this run turned
        // it on. A URL that does not answer at all is deferred, not withdrawn.
        const verdict = await verifyCloudflareAccessPerimeter([url], cfg.requestInit ?? {});
        if (verdict.outcome === 'unprotected') {
          // The exposure is captured as this run's own before the withdrawal
          // (which reports what it did through `steps`), so what the failure
          // carries is what the verdict proved and the withdrawal could not
          // undo — never a claim that the route is back off.
          const ownExposure: CloudflareUnverifiedExposure = { scriptName, previewsEnabledByThisRun: previews.enabledByThisRun };
          await withdrawUnverifiedPreviewExposure(cfg, { scriptName, previewsEnabledByThisRun: previews.enabledByThisRun, steps });
          throw markAccessUnverifiedFailure(verdict.error, ownExposure, { steps, detachedCustomDomains: [] });
        }
        if (verdict.outcome === 'unreachable') {
          accessDeferred = deferAccessVerification(metadata, steps, verdict);
          // What the link check may still have to withdraw (see check-link).
          // MERGED with the production exposure carried forward above, never
          // replacing it: that carried record is the only handle on the
          // workers.dev route and on the hostnames a deferred PRODUCTION deploy
          // left public, and this run's previews_enabled is added to it.
          // Recording only this run's own exposure here would drop the carried
          // half from the record entirely (recordUnverifiedExposure assigns).
          recordUnverifiedExposure(metadata, mergeUnverifiedExposure(priorUnverifiedExposure, {
            scriptName,
            previewsEnabledByThisRun: previews.enabledByThisRun,
          }));
        } else {
          metadata.accessVerified = true;
        }
      }
      metadata.steps = steps;
      return {
        providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
        url,
        deploymentId: versionId,
        target,
        ...(accessDeferred
          ? { status: 'link-delayed', statusMessage: accessDeferred }
          : { status: 'ready', reachableAt: Date.now() }),
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
    // A hostname a prior deploy wrote ahead of its attach counts as owned (by
    // hostname): the attach may have landed even though the record never did.
    const vouchedDomains = vouchedCustomDomains(priorOwnedCustomDomains, priorPendingCustomDomains);
    const staleDomains = attachedDomains.filter(
      (domain) => domain.hostname !== configuredHostname && isOwnedCustomDomain(domain, vouchedDomains),
    );
    const foreignHostnames = attachedDomains
      .filter((domain) => domain.hostname !== configuredHostname && !isOwnedCustomDomain(domain, vouchedDomains))
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

    const uploaded = await uploadWorkerScript(cfg, scriptName, moduleCode, completionJwt, isCustomModule);
    const scriptCreatedByThisRun = uploaded.scriptCreatedByThisRun;
    steps.push({ name: 'script', status: 'done' });
    if (accessOn && !accessAppId && subdomain) {
      // First deploy: the PUT just CREATED the script, and Cloudflare assigns a
      // workers.dev route at creation — which is why the read-back in
      // enableWorkerSubdomain reports the route as already on for a script this
      // run created. The route is therefore live and ungated from here until
      // the Access app below exists (an IdP list, an app lookup and an app
      // POST), so turn it off for that window; the enableWorkerSubdomain
      // further down turns it back on once the app is in place. No account
      // subdomain means no route to turn off — and nothing would turn it back
      // on either — so the guard skips the call rather than write a no-op.
      // BEST-EFFORT, and the only step of this deploy that is: a failure here (a
      // 429 that outlasted its retries, a 5xx, a proxy error) must not abort the
      // deploy. The Worker is already live and the route is ON, so the Access app
      // below is what closes the gate — aborting instead would leave that Worker
      // public with nothing recorded (no attach, no released hostname, no
      // access-app step, no exposure) and no later check holding a handle to
      // withdraw it. The step records the failure and the deploy carries on.
      try {
        await disableWorkerSubdomain(cfg, scriptName);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cloudflare-workers] could not hold the workers.dev route off for ${scriptName} while the Access app is created: ${message}`);
        steps.push({ name: 'subdomain-disable', status: 'error', detail: message });
      }
    }
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
      // Access off and the app is gone: every OTHER record of this script that
      // recorded the id would keep reporting the Worker as protected by it.
      if (retirement === 'deleted' && !accessAppId) {
        retiredAccessAppId = priorAccessAppId;
        metadata.retiredAccessAppId = priorAccessAppId;
      }
      if (retirement === 'retained') {
        // The prior app still guards the Worker this script name moved away
        // from, so it is not this deploy's to delete — and when this record was
        // the only one naming it, the step log was the only place its id
        // survived. Keep it under its own key, never as `accessAppId`: that
        // would report THIS Worker as protected by an app guarding another one.
        const retained = retainedAccessAppIdsFromMetadata(metadata);
        if (!retained.includes(priorAccessAppId)) retained.push(priorAccessAppId);
        metadata.retainedAccessAppIds = retained;
      }
    }

    let url = customDomain ? 'https://' + customDomain.hostname : '';
    // Whether THIS run turned the workers.dev route on: when Access is on, a
    // failed perimeter check must undo the exposure, and undoing must not turn
    // off a route the user had public.
    let subdomainEnabledByThisRun = false;
    if (subdomain) {
      const enabled = await enableWorkerSubdomain(cfg, scriptName, subdomain, scriptCreatedByThisRun);
      url = enabled.url;
      subdomainEnabledByThisRun = enabled.enabledByThisRun;
      steps.push({ name: 'subdomain', status: 'done', detail: url });
    }
    let attachedDomainId = '';
    if (customDomain) {
      let domainId: string;
      try {
        // A bare PUT on /workers/domains re-points a hostname that is already
        // bound to ANOTHER Worker: the attach would hijack it. Refuse up front,
        // before the write-ahead and with no PUT sent, unless the strict list
        // above already proved the hostname is routed to this very script (a
        // re-attach of our own hostname cannot conflict).
        if (!configuredAlreadyAttached) {
          const bound = await findCloudflareWorkerDomainByHostname(cfg, configuredHostname);
          if (bound && bound.service !== scriptName) throw customDomainBoundElsewhereError(configuredHostname, bound);
        }
        // Write-ahead: the route records the hostname as pending BEFORE the
        // attach, so a crash between the attach and the deploy's record write
        // still leaves a record vouching for it.
        if (onBeforeAttach) await onBeforeAttach(configuredHostname);
        domainId = await attachCloudflareWorkerDomain(cfg, { hostname: customDomain.hostname, service: scriptName, zone_id: customDomain.zoneId });
      } catch (err) {
        // A 4xx is Cloudflare refusing the attach outright: the hostname is
        // certainly not routed to the script, so the write-ahead that vouches
        // for it can go. A 5xx or a transport failure may have landed the
        // attach; the write-ahead stays until a later deploy reconciles it.
        // A hostname that was routed before this run is not released: the
        // record that vouches for it may be the write-ahead alone.
        const refused = err instanceof DeployError && err.status >= 400 && err.status < 500;
        if (refused && !configuredAlreadyAttached && !releasedCustomDomains.includes(configuredHostname)) {
          releasedCustomDomains.push(configuredHostname);
        }
        // Compensation: the Access app claimed the configured hostname before
        // the attach. The attach failed, so drop that claim again — but ONLY
        // on a refusal (a 4xx), which proves the attach did not land. A 5xx or
        // a transport failure may have committed the PUT, and a hostname
        // routed to the script with no app covering it is exactly the exposure
        // this path exists to rule out. Keeping the claim is safe in that
        // case: a public destination on a hostname that is not routed is
        // inert, and the next deploy reconciles it. Only when the hostname was
        // NOT already routed, since a still-routed hostname must stay covered.
        // The original attach error is what surfaces.
        if (accessOn && accessAppId && !configuredAlreadyAttached && refused) {
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
      attachedCustomDomains.push(domainId ? { id: domainId, hostname: configuredHostname } : { hostname: configuredHostname });
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
      detachedCustomDomains.push({ id: stale.id, hostname: stale.hostname });
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
    let accessDeferred = '';
    if (accessOn) {
      // Hard constraint: a deploy with Access on is only `ready` when every URL
      // it reports actually challenges with an Access login. A URL that answers
      // WITHOUT that challenge is an exposure: what this run created
      // (workers.dev route, attached hostname) is withdrawn before the failure
      // surfaces — the site must not stay reachable on a URL the deploy proved
      // is ungated. A URL that does not answer at all (DNS still propagating,
      // certificate still issuing) proves nothing either way: the attach and
      // its write-ahead stay and the verification is deferred to the link check.
      const verdict = await verifyCloudflareAccessPerimeter(publicUrls, cfg.requestInit ?? {});
      if (verdict.outcome === 'unprotected') {
        // This run's own exposure, captured BEFORE the withdrawal: that call
        // splices each hostname it detached out of `attachedCustomDomains`, so
        // the list afterwards says what survived, not what was created.
        const detachable = configuredHostname && !configuredAlreadyAttached
          ? attachedCustomDomains.filter((domain) => domain.hostname === configuredHostname)
          : [];
        const attachedBefore = [...detachable];
        await withdrawUnverifiedExposure(cfg, {
          scriptName,
          subdomainEnabledByThisRun,
          attachedCustomDomains,
          detachableHostnames: configuredHostname && !configuredAlreadyAttached ? [configuredHostname] : [],
          releasedCustomDomains,
          steps,
        });
        throw markAccessUnverifiedFailure(
          verdict.error,
          { scriptName, subdomainEnabledByThisRun, detachableCustomDomains: detachable },
          {
            steps,
            detachedCustomDomains: attachedBefore.filter(
              (domain) => !attachedCustomDomains.some((kept) => kept.hostname === domain.hostname),
            ),
          },
        );
      }
      if (verdict.outcome === 'unreachable') {
        accessDeferred = deferAccessVerification(metadata, steps, verdict);
        // What the link check may still have to withdraw (see check-link):
        // the same set the in-deploy compensation above would have, MERGED with
        // the exposure a prior record already carries and never replacing it —
        // the rule mergeUnverifiedExposure documents, and the same merge the
        // preview branch below applies. Production's metadata REPLACES the
        // record's too, and this run's own set is empty whenever it attached no
        // new hostname and found the workers.dev route already on: recording
        // only that set writes no key at all, so a route or hostname a deferred
        // deploy left public ends up recorded nowhere and the link check that
        // must withdraw it holds nothing to act on. A merged hostname this run
        // has already detached is harmless — withdrawUnverifiedExposure reads a
        // 404 from the detach as done.
        recordUnverifiedExposure(metadata, mergeUnverifiedExposure(priorUnverifiedExposure, {
          scriptName,
          subdomainEnabledByThisRun,
          detachableCustomDomains: configuredHostname && !configuredAlreadyAttached
            ? attachedCustomDomains.filter((domain) => domain.hostname === configuredHostname)
            : [],
        }));
      } else {
        metadata.accessVerified = true;
      }
    } else {
      try {
        const checkResp = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(CLOUDFLARE_PROBE_TIMEOUT_MS), ...(cfg.requestInit ?? {}) });
        // No `detail` is derived here. A 5xx from this probe is as likely to be
        // Cloudflare's own edge (520-527, an edge 503) as the Worker throwing,
        // and 1101 is a Workers *error code* the edge reports in a response
        // body — never an HTTP status a HEAD can see. Naming the Worker for any
        // 5xx would report an edge outage as the app's own failure; the report
        // renders the status itself.
        const check: JsonObject = { status: checkResp.status, ok: checkResp.ok };
        metadata.check = check;
      } catch {
        // A failed post-deploy probe is non-fatal; the deploy still succeeded.
      }
    }
    // Stale owned hostnames this deploy detached. A SIBLING record of the same
    // script (the Workers config is global) may still list one as owned; the
    // route stops every record vouching for them before it writes this one.
    if (detachedCustomDomains.length > 0) {
      metadata.detachedCustomDomains = detachedCustomDomains.map((domain) => (domain.id ? { id: domain.id, hostname: domain.hostname } : { hostname: domain.hostname }));
    }
    // Every write-ahead this deploy was handed is resolved by the strict list
    // it just reconciled (configured → owned above; routed → detached above;
    // else never attached). The route drops the copies every record of this
    // script carries — this record's own are gone with the metadata replace,
    // but a sibling (a preview that carried them) would keep vouching.
    if (priorPendingCustomDomains.length > 0) {
      metadata.resolvedPendingCustomDomains = [...priorPendingCustomDomains];
    }
    metadata.steps = steps;
    return {
      providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
      url,
      deploymentId: scriptName,
      target,
      ...(accessDeferred
        ? { status: 'link-delayed', statusMessage: accessDeferred }
        : { status: 'ready', reachableAt: Date.now() }),
      providerMetadata: metadata,
    };
  } catch (err) {
    // Attach the partial steps (including any created accessAppId) and the
    // custom hostnames attached so far to EVERY error, not just DeployError — a
    // transport failure after the Access app step or the attach must still let
    // the route record what this deploy now owns instead of orphaning it.
    steps.push({ name: 'error', status: 'error', detail: err instanceof Error ? err.message : String(err) });
    (err as { steps?: DeployStep[] }).steps = steps;
    (err as { attachedCustomDomains?: CloudflareOwnedCustomDomain[] }).attachedCustomDomains = attachedCustomDomains;
    (err as { detachedCustomDomains?: CloudflareOwnedCustomDomain[] }).detachedCustomDomains = detachedCustomDomains;
    (err as { releasedCustomDomains?: string[] }).releasedCustomDomains = releasedCustomDomains;
    if (retiredAccessAppId) (err as { retiredAccessAppId?: string }).retiredAccessAppId = retiredAccessAppId;
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

export async function probeCloudflareWorkersCapabilities(input: { token: string; accountId: string; requestInit?: WorkersRequestInit | undefined }): Promise<CloudflareWorkersCapabilities> {
  return withWorkersDispatcher(input.requestInit, (requestInit) => probeCloudflareWorkersCapabilitiesWith(input, requestInit));
}

async function probeCloudflareWorkersCapabilitiesWith(input: { token: string; accountId: string }, requestInit: WorkersRequestInit): Promise<CloudflareWorkersCapabilities> {
  const token = input.token;
  const accountId = input.accountId;
  const base = CLOUDFLARE_API + '/accounts/' + encodeURIComponent(accountId);
  const caps: CloudflareWorkersCapabilities = { workers: false, workersDevSubdomain: '', r2: false, d1: false, access: false };

  async function probe(path: string): Promise<{ success: boolean; code?: number; subdomain?: string }> {
    try {
      const resp = await fetch(base + path, { headers: cloudflareHeaders(token), signal: AbortSignal.timeout(CLOUDFLARE_API_TIMEOUT_MS), ...requestInit });
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
  options: { strict?: boolean; nameContains?: string; requestInit?: WorkersRequestInit | undefined } = {},
): Promise<CloudflareR2Bucket[]> {
  return withWorkersDispatcher(options.requestInit, (requestInit) => listCloudflareR2BucketsWith(token, accountId, options, requestInit));
}

async function listCloudflareR2BucketsWith(
  token: string,
  accountId: string,
  options: { strict?: boolean; nameContains?: string },
  requestInit: WorkersRequestInit,
): Promise<CloudflareR2Bucket[]> {
  const base = CLOUDFLARE_API + '/accounts/' + encodeURIComponent(accountId) + '/r2/buckets';
  const out: CloudflareR2Bucket[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  // R2 pages by an OPAQUE cursor: no page count and no total, so the bounds in
  // listCloudflareAllPages do not apply here. Both stops are needed, because
  // this list runs inside a deploy (ensureCloudflareR2Bucket reads it): a
  // cursor Cloudflare keeps handing back without advancing, or an endpoint
  // that ignores `cursor=`, would otherwise spin here forever holding the
  // script's deploy single-flight and wedge every later deploy of that script.
  // Past the shared list ceiling the listing is treated as exhausted.
  for (let page = 1; page <= CLOUDFLARE_LIST_MAX_PAGES; page++) {
    const params = new URLSearchParams({ per_page: '1000' });
    if (options.nameContains) params.set('name_contains', options.nameContains);
    if (cursor) params.set('cursor', cursor);
    const url = base + '?' + params.toString();
    const resp = options.strict
      ? await fetchWithRetry({ requestInit }, url, { method: 'GET', headers: cloudflareHeaders(token) })
      : await fetch(url, { headers: cloudflareHeaders(token), signal: AbortSignal.timeout(CLOUDFLARE_API_TIMEOUT_MS), ...requestInit });
    const json = (await resp.json().catch(() => ({}))) as JsonObject;
    if (!resp.ok || json.success !== true) {
      // The deploy path (strict) must fail closed: `[]` means "create it" to
      // ensureCloudflareR2Bucket, which would then hit "bucket already exists".
      if (options.strict) throw cloudflareError(json, resp.ok ? 502 : resp.status, 'Cloudflare R2 bucket list failed.');
      return out;
    }
    const result = json.result as JsonObject | undefined;
    const buckets = Array.isArray(result?.buckets) ? (result.buckets as JsonObject[]) : [];
    let added = 0;
    for (const bucket of buckets) {
      const name = typeof bucket?.name === 'string' ? bucket.name : '';
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ name });
      added += 1;
    }
    const info = json.result_info as JsonObject | undefined;
    const nextCursor = typeof info?.cursor === 'string' && info.cursor.length > 0 ? info.cursor : undefined;
    if (!nextCursor) return out;
    // A page that contributes no name the list did not already have is not
    // progress, and following its cursor again is exactly how a stuck cursor
    // becomes an unbounded loop. A bucket carries no id to dedupe on (`name`
    // is its whole identity), so the collected-name set is the progress
    // measure. A name-less entry is skipped, never counted as progress.
    if (added === 0) return out;
    cursor = nextCursor;
  }
  return out;
}

/** List an account's D1 databases by uuid (the id a Workers binding needs). */
export async function listCloudflareD1Databases(
  token: string,
  accountId: string,
  options: { requestInit?: WorkersRequestInit | undefined } = {},
): Promise<CloudflareD1Database[]> {
  const databases = await withWorkersDispatcher(options.requestInit, (requestInit) => listCloudflareAllPages(
    { token, accountId, requestInit } as WorkersDeployConfig,
    '/accounts/' + encodeURIComponent(accountId) + '/d1/database',
  ));
  return databases
    .map((db) => ({
      name: typeof db?.name === 'string' ? db.name : '',
      id: typeof db?.uuid === 'string' ? db.uuid : '',
    }))
    .filter((db) => db.name.length > 0 && db.id.length > 0);
}

/** The uuid of an account's D1 database with this exact name, or '' when there is
 * none. Strict about the list itself, for the reason in
 * findOnetimepinIdentityProvider: a degraded `[]` would POST a duplicate. */
async function findD1DatabaseIdByName(config: WorkersDeployConfig, databaseName: string): Promise<string> {
  const existing = await listCloudflareAllPagesStrict(
    config,
    '/accounts/' + encodeURIComponent(config.accountId) + '/d1/database?name=' + encodeURIComponent(databaseName),
    100,
    'Cloudflare D1 database list',
  );
  const match = existing.find((db) => db?.name === databaseName && typeof db?.uuid === 'string' && db.uuid);
  return match ? String(match.uuid) : '';
}

/** Resolve a D1 database by human name, creating it when it does not exist.
 * Returns the database uuid a Workers binding needs. */
export async function ensureCloudflareD1Database(config: WorkersDeployConfig, databaseName: string): Promise<string> {
  return withCloudflareAccountEnsureSingleFlight(config.accountId, async () => {
    // Exact-name filter + fail-closed list: a degraded `[]` here would POST a
    // duplicate database instead of reusing the existing one.
    const existingId = await findD1DatabaseIdByName(config, databaseName);
    if (existingId) return existingId;
    const resp = await fetchWithRetry(config,
      CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/d1/database',
      { method: 'POST', headers: await authHeaders(config, { 'Content-Type': 'application/json' }), body: JSON.stringify({ name: databaseName }) },
    );
    const json = await readCloudflareJson(resp);
    if (!resp.ok || json.success === false) {
      // A conflict means a concurrent deploy of a DIFFERENT script created this
      // database between our list and our POST. Re-list and adopt it rather than
      // aborting a deploy whose only sin was race timing.
      if (isAdoptableCreateConflict(resp.status)) {
        const adopted = await findD1DatabaseIdByName(config, databaseName).catch(() => '');
        if (adopted) return adopted;
      }
      throw cloudflareError(json, resp.status, 'Cloudflare D1 database creation failed.');
    }
    const result = (json.result ?? {}) as JsonObject;
    const uuid = typeof result.uuid === 'string' ? result.uuid : '';
    // A create that answers without a uuid leaves nothing to bind. Fail here,
    // before any asset upload, instead of forwarding `id: ''` into the script
    // metadata and failing the live PUT after the uploads are spent.
    if (!uuid) {
      throw new DeployError(
        'Cloudflare D1 database "' + databaseName + '" was created but the response carried no uuid to bind.',
        502,
        json,
        'CFW_D1_CREATE_FAILED',
      );
    }
    return uuid;
  });
}

/** Whether the account has an R2 bucket of this exact name. Strict about the
 * list itself, for the reason in findOnetimepinIdentityProvider. */
async function r2BucketExistsByName(config: WorkersDeployConfig, bucketName: string): Promise<boolean> {
  const buckets = await listCloudflareR2Buckets(await resolveConfigToken(config), config.accountId, { strict: true, nameContains: bucketName, requestInit: config.requestInit });
  return buckets.some((bucket) => bucket.name === bucketName);
}

/** Resolve an R2 bucket by name, creating it when it does not exist. The
 * bucket name is the identifier, so it is returned unchanged. */
export async function ensureCloudflareR2Bucket(config: WorkersDeployConfig, bucketName: string): Promise<string> {
  return withCloudflareAccountEnsureSingleFlight(config.accountId, async () => {
    if (await r2BucketExistsByName(config, bucketName)) return bucketName;
    const resp = await fetchWithRetry(config,
      CLOUDFLARE_API + '/accounts/' + encodeURIComponent(config.accountId) + '/r2/buckets',
      { method: 'POST', headers: await authHeaders(config, { 'Content-Type': 'application/json' }), body: JSON.stringify({ name: bucketName }) },
    );
    const json = await readCloudflareJson(resp);
    if (!resp.ok || json.success === false) {
      // A conflict means a concurrent deploy of a DIFFERENT script created this
      // bucket between our list and our POST. A bucket's name IS its identity,
      // so adopting it means returning the name we already hold.
      if (isAdoptableCreateConflict(resp.status)) {
        const adopted = await r2BucketExistsByName(config, bucketName).catch(() => false);
        if (adopted) return bucketName;
      }
      throw cloudflareError(json, resp.status, 'Cloudflare R2 bucket creation failed.');
    }
    return bucketName;
  });
}

/** List an account's zones. A non-ok response or error resolves to an empty
 * list so the domain picker can degrade to free-text input. */
export async function listCloudflareZones(config: WorkersDeployConfig): Promise<{ id: string; name: string; status: string }[]> {
  // Zones are a top-level resource filtered by account id, not nested under
  // /accounts/{id} (that path 404s with "No route for that URI").
  const zones = await withWorkersDispatcher(config.requestInit, (requestInit) => listCloudflareAllPages(
    { ...config, requestInit },
    '/zones?account.id=' + encodeURIComponent(config.accountId),
    50,
  ));
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
  const resp = await fetchWithRetry(config,
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
  const resp = await fetchWithRetry(config,
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
  const resp = await fetchWithRetry(config,
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

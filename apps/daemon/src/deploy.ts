import fs from 'node:fs';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash as blake3Hash } from 'blake3-wasm';
import { listFiles, readProjectFile, validateProjectPath } from './projects.js';
import { findRealTagOffset, HTML_TAG_PATTERNS } from '@open-design/contracts/runtime/html-injection-points';
import { proxyDispatcherRequestInit } from './connectionTest.js';
import { refreshCloudflareToken, revokeCloudflareToken, validateCloudflareOAuthScopes } from './integrations/cloudflare-oauth.js';
import {
  clearCloudflareOAuthToken,
  clearCloudflareOAuthTokenForRevoke,
  cloudflareOAuthExpiresAt,
  dropPendingCloudflareOAuthRevokes,
  fsyncDirectory,
  getCloudflareOAuthToken,
  getPendingCloudflareOAuthRevokes,
  isCloudflareOAuthTokenExpired,
  recordPendingCloudflareOAuthRevoke,
  restoreCloudflareOAuthTokenAndDropRevokes,
  setCloudflareOAuthTokenIfGenerationMatches,
  type StoredCloudflareOAuthToken,
} from './integrations/cloudflare-tokens.js';

export const VERCEL_PROVIDER_ID = 'vercel-self';
export const CLOUDFLARE_PAGES_PROVIDER_ID = 'cloudflare-pages';
export const CLOUDFLARE_WORKERS_PROVIDER_ID = 'cloudflare-workers';
export const SAVED_TOKEN_MASK = 'saved-vercel-token';
export const SAVED_CLOUDFLARE_TOKEN_MASK = 'saved-cloudflare-token';
export const SAVED_CLOUDFLARE_WORKERS_TOKEN_MASK = 'saved-cloudflare-workers-token';

type JsonObject = Record<string, any>;
type DeployProviderId = typeof VERCEL_PROVIDER_ID | typeof CLOUDFLARE_PAGES_PROVIDER_ID | typeof CLOUDFLARE_WORKERS_PROVIDER_ID;
type DeployErrorDetails = JsonObject | string | undefined;
type CloudflareWorkersAccessRule =
  | { kind: 'emails'; emails: string[] }
  | { kind: 'emailDomain'; emailDomain: string }
  | { kind: 'self' }
  | { kind: 'policy'; policyId: string };

type DeployConfig = {
  token: string;
  teamId?: string | undefined;
  teamSlug?: string | undefined;
  accountId?: string | undefined;
  projectName?: string | undefined;
  cloudflarePages?: CloudflarePagesConfigHints | undefined;
  scriptName?: string | undefined;
  compatibilityDate?: string | undefined;
  credentialMode?: string | undefined;
  clientId?: string | undefined;
  redirectUri?: string | undefined;
  scopes?: string[] | undefined;
  bindings?: CloudflareWorkersConfigBinding[] | undefined;
  access?: { enabled: boolean; rule?: CloudflareWorkersAccessRule } | undefined;
  customDomain?: { hostname: string; zoneId: string } | undefined;
  /** The attempt id of an OAuth connect whose intent is recorded but whose
   * `credentialMode` commit has not landed yet (see
   * markCloudflareOAuthGrantPending). Any value means a connect is in flight,
   * and the read path treats it as authoritative over both the stored mode and
   * the static token beside it: that grant IS the credential the connect is
   * storing, and signing with anything else leaves it valid with no holder.
   *
   * The VALUE names which attempt, which is what makes the marker an identity
   * and not just a flag: only the commit that carries this id may land the mode
   * over it, so a save that abandons the connect (dropping the marker) cannot
   * be undone by the commit that was still in flight — see
   * commitCloudflareOAuthMode. */
  pendingOAuthGrant?: string | undefined;
  /** Durable intent of a credential transition OFF oauth (see
   * writeCloudflareWorkersConfig): the grant is on its way out, so the read
   * path stops deriving oauth from it before it is destroyed — the window
   * between the clear and the mode write can never read as oauth with nothing
   * behind it. */
  pendingOAuthGrantClear?: boolean | undefined;
  /** Set on the safe default returned when the on-disk file is unparsable
   * (CFW_CONFIG_CORRUPT); never persisted. */
  configError?: string | undefined;
};
type CloudflarePagesConfigHints = {
  lastZoneId?: string;
  lastZoneName?: string;
  lastDomainPrefix?: string;
};
type DeployFile = { file: string; data: Buffer | Uint8Array | string; contentType?: string; sourcePath?: string };
type DeployFilePlan = { entryPath: string; html: string; files: DeployFile[]; missing: string[]; invalid: string[] };
type DeployOptions = {
  metadata?: unknown;
  hookScriptUrl?: string;
  providerId?: DeployProviderId;
  includeProjectFiles?: boolean;
};
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
const CLOUDFLARE_ACCESS_PROTECTED_MESSAGE =
  'Deployment is protected by Cloudflare Access. Authorized users must sign in to open it.';

/** True when `location` is an absolute URL whose HOST is Cloudflare Access
 * (`<team>.cloudflareaccess.com`). Matched on the parsed hostname, never as a
 * substring: `https://evil.example/?cloudflareaccess.com` and
 * `https://evil.example/cloudflareaccess.com` are not Access, and a perimeter
 * check that accepted them would mark an unprotected deploy as gated. */
export function isCloudflareAccessUrl(location: string): boolean {
  let url: URL;
  try {
    url = new URL(String(location || ''));
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const hostname = url.hostname.toLowerCase();
  return hostname === 'cloudflareaccess.com' || hostname.endsWith('.cloudflareaccess.com');
}

export function isCloudflareAccessRedirect(status: number, location: string): boolean {
  if (status < 300 || status >= 400) return false;
  return isCloudflareAccessUrl(location);
}

/** Cloudflare's EDGE answering a request, from the response headers alone —
 * never the body. There are exactly three kinds of evidence: the Access login
 * location, the Access cookie jar, and the edge's own `cf-mitigated` challenge
 * stamp.
 *
 * The body is deliberately not read. A 401/403 body is written by whatever
 * answered the probe, and for the Access perimeter assertion that is the
 * deploy's OWN Worker: an app whose 403 happens to contain the words
 * "Cloudflare Access" made verifyCloudflareAccessPerimeter report the URL as
 * gated while it was served ungated. Body text proves a string, not a gate.
 *
 * `cf-mitigated` is stamped by Cloudflare's edge when it serves a managed
 * challenge, and is matched as a word so a value that merely contains it
 * elsewhere is not evidence.
 *
 * Used by the SHARED deploy-URL probe (requestDeploymentUrl), which serves
 * Vercel, Pages and Workers alike: a response that only mentions "Cloudflare
 * Access" in its body would otherwise be reported as an Access-gated
 * deployment — the record is stamped protected, the user is told to sign in to
 * an Access app that does not exist, and the deployment's real protection
 * (Vercel Deployment Protection) is never named. */
export function isCloudflareAccessChallengeResponse(resp: Response): boolean {
  const location = resp.headers?.get?.('location') || '';
  if (isCloudflareAccessUrl(location)) return true;
  const setCookie = resp.headers?.get?.('set-cookie') || '';
  // Only the real Access cookie proves the gate. A broader cf[-_]access match
  // would read an app's own cookie whose name merely contains the substring as
  // an Access gate, stamping a protected verdict on a deployment the probe then
  // mislabels as "sign in to Cloudflare Access".
  if (/cf_authorization/i.test(setCookie)) return true;
  return /\bchallenge\b/i.test(resp.headers?.get?.('cf-mitigated') || '');
}

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
  // The Workers config lives under the daemon-resolved data root (same as its
  // OAuth token) so an isolated OD_DATA_DIR namespace holds both. Vercel/Pages
  // keep the legacy OD_USER_STATE_DIR/home location unchanged.
  const base = providerId === CLOUDFLARE_WORKERS_PROVIDER_ID
    ? cloudflareWorkersBaseDir()
    : process.env.OD_USER_STATE_DIR || path.join(os.homedir(), '.open-design');
  const name = providerId === CLOUDFLARE_PAGES_PROVIDER_ID
    ? 'cloudflare-pages.json'
    : providerId === CLOUDFLARE_WORKERS_PROVIDER_ID
      ? 'cloudflare-workers.json'
      : 'vercel.json';
  return path.join(base, name);
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
  if (!next.token) throw new DeployError('Cloudflare API token is required.', 400, undefined, 'CF_TOKEN_REQUIRED');
  if (!next.accountId) throw new DeployError('Cloudflare account ID is required.', 400, undefined, 'CF_ACCOUNT_ID_REQUIRED');
  await writeDeployConfigFile(deployConfigPath(CLOUDFLARE_PAGES_PROVIDER_ID), next);
  return publicCloudflarePagesConfig(next);
}

async function writeDeployConfigFile(file: string, config: DeployConfig) {
  await mkdir(path.dirname(file), { recursive: true });
  // Atomic replace: write a sibling temp file then rename over the target so a
  // crash mid-write can never leave a truncated/partial config behind — the
  // previous file stays valid until the rename lands. The temp name carries a
  // random suffix and is opened with exclusive creation: the Vercel/Pages
  // writers are not serialized, and a pid+millisecond name let two same-tick
  // writes share one temp file (the second rename then failed with ENOENT).
  const tmp = `${file}.tmp-${randomUUID()}`;
  try {
    // fsync BEFORE the rename: a rename is only atomic with respect to the
    // directory entry. Without flushing the temp file's bytes first, a power
    // loss after the rename can leave the target pointing at an empty or
    // truncated file (data lost, entry kept) — exactly the corruption the
    // atomic replace is meant to rule out.
    const handle = await open(tmp, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(config, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      fs.chmodSync(tmp, 0o600);
    } catch {
      // Best effort on filesystems that do not support chmod.
    }
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
  // fsync AFTER the rename too: the temp-file flush made the bytes durable, but
  // the rename is an entry in the parent directory and a power loss can still
  // lose that entry. Best-effort where the platform cannot sync a directory.
  await fsyncDirectory(path.dirname(file));
}

// Serialize every Workers-config read-modify-write so a settings PUT, a
// disconnect reset, and a connect commit can never interleave and lose each
// other's updates.
let cloudflareConfigMutationTail: Promise<unknown> = Promise.resolve();
async function withCloudflareConfigMutation<T>(fn: () => Promise<T>): Promise<T> {
  const run = cloudflareConfigMutationTail.then(fn, fn);
  cloudflareConfigMutationTail = run.catch(() => {});
  return run;
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

function normalizeCloudflareWorkersAccessRule(rule: unknown): CloudflareWorkersAccessRule | undefined {
  if (!rule || typeof rule !== 'object') return undefined;
  const r = rule as JsonObject;
  // An empty rule (`emails: []`, blank domain) is a truthy object that would
  // pass the "enabled but no rule" checks and only fail inside the Access app
  // create — after the IdP and (on a first deploy) the live script PUT. Return
  // undefined so the write-time validation rejects it up front.
  if (r.kind === 'emails') {
    const emails = Array.isArray(r.emails)
      ? r.emails.filter((e): e is string => typeof e === 'string').map((e) => e.trim()).filter(Boolean)
      : [];
    return emails.length > 0 ? { kind: 'emails', emails } : undefined;
  }
  if (r.kind === 'emailDomain') {
    const emailDomain = typeof r.emailDomain === 'string' ? r.emailDomain.trim() : '';
    return emailDomain ? { kind: 'emailDomain', emailDomain } : undefined;
  }
  if (r.kind === 'self') return { kind: 'self' };
  if (r.kind === 'policy') {
    const policyId = typeof r.policyId === 'string' ? r.policyId.trim() : '';
    return policyId ? { kind: 'policy', policyId } : undefined;
  }
  return undefined;
}

const CLOUDFLARE_WORKERS_BINDING_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CLOUDFLARE_WORKERS_RESERVED_BINDING_NAMES = new Set(['ASSETS']);

/** The binding types the OpenDesign config owns, and the fields each type owns.
 * This mirrors the type->field map the settings UI renders
 * (`apps/web/src/components/FileViewer.tsx`): its R2 branch edits `bucketName`,
 * its D1 branch edits `id` / `databaseName`, and neither touches the other's. */
export type CloudflareWorkersConfigBinding = {
  type: string;
  name: string;
  bucketName?: string;
  databaseName?: string;
  id?: string;
};

/** Validate ONE config binding and reduce it to the fields its type owns.
 *
 * Throws `CFW_BINDINGS_INVALID` rather than dropping anything: an unsupported
 * type is REJECTED, because silently dropping it deploys live with a binding the
 * user asked for and did not get. Reducing by TYPE rather than by field presence
 * is what stops `{type:'r2_bucket', bucketName:'x', id:'abc'}` from carrying that
 * stray `id` into the live script PUT, after the assets upload has been spent. */
function normalizeCloudflareWorkersBinding(entry: unknown, index: number): CloudflareWorkersConfigBinding {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new DeployError('Cloudflare Workers binding #' + (index + 1) + ' must be an object.', 400, undefined, 'CFW_BINDINGS_INVALID');
  }
  const b = entry as JsonObject;
  const type = typeof b.type === 'string' ? b.type.trim() : '';
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!type) throw new DeployError('Cloudflare Workers binding #' + (index + 1) + ' needs a string "type".', 400, undefined, 'CFW_BINDINGS_INVALID');
  if (type !== 'r2_bucket' && type !== 'd1') {
    throw new DeployError('Cloudflare Workers binding #' + (index + 1) + ' has unsupported type "' + type + '" (supported: r2_bucket, d1).', 400, undefined, 'CFW_BINDINGS_INVALID');
  }
  if (!CLOUDFLARE_WORKERS_BINDING_NAME.test(name)) {
    throw new DeployError('Cloudflare Workers binding name "' + name + '" is invalid (letters, digits and underscores; cannot start with a digit).', 400, undefined, 'CFW_BINDINGS_INVALID');
  }
  if (CLOUDFLARE_WORKERS_RESERVED_BINDING_NAMES.has(name)) {
    throw new DeployError('Cloudflare Workers binding name "' + name + '" is reserved for the static assets binding.', 400, undefined, 'CFW_BINDINGS_INVALID');
  }
  if (type === 'r2_bucket') {
    const bucketName = typeof b.bucketName === 'string' ? b.bucketName.trim() : '';
    if (!bucketName) {
      throw new DeployError('Cloudflare Workers R2 binding "' + name + '" needs a bucketName.', 400, undefined, 'CFW_BINDINGS_INVALID');
    }
    return { type, name, bucketName };
  }
  const id = typeof b.id === 'string' ? b.id.trim() : '';
  const databaseName = typeof b.databaseName === 'string' ? b.databaseName.trim() : '';
  if (!id && !databaseName) {
    throw new DeployError('Cloudflare Workers D1 binding "' + name + '" needs a databaseName or id.', 400, undefined, 'CFW_BINDINGS_INVALID');
  }
  return { type, name, ...(id ? { id } : {}), ...(databaseName ? { databaseName } : {}) };
}

/** Validate the Workers bindings a config carries. Throws a DeployError
 * (`CFW_BINDINGS_INVALID`) instead of letting a malformed entry TypeError at
 * deploy time after the assets were uploaded, or letting a user binding named
 * `ASSETS` collide with the injected assets binding. */
export function normalizeCloudflareWorkersBindings(value: unknown): CloudflareWorkersConfigBinding[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new DeployError('Cloudflare Workers bindings must be an array.', 400, undefined, 'CFW_BINDINGS_INVALID');
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const binding = normalizeCloudflareWorkersBinding(entry, index);
    if (seen.has(binding.name)) {
      throw new DeployError('Cloudflare Workers binding name "' + binding.name + '" is duplicated.', 400, undefined, 'CFW_BINDINGS_INVALID');
    }
    seen.add(binding.name);
    return binding;
  });
}

/** The persisted binding set, read back. Entries this build cannot understand are
 * DROPPED rather than thrown: this gates a config READ that every Workers route
 * depends on, so a hand-edited or older file must degrade to "fewer bindings"
 * instead of bricking the settings panel. The write path above still rejects
 * them — a value the user just typed is an error to report, not to swallow.
 * Objects only, so a hand-written `[null]` cannot reach the client, where the
 * settings normalizer calls `binding.name.trim()`. */
function persistedCloudflareWorkersBindings(value: unknown): CloudflareWorkersConfigBinding[] {
  if (!Array.isArray(value)) return [];
  const out: CloudflareWorkersConfigBinding[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    let binding: CloudflareWorkersConfigBinding;
    try {
      binding = normalizeCloudflareWorkersBinding(entry, out.length);
    } catch {
      continue;
    }
    if (seen.has(binding.name)) continue;
    seen.add(binding.name);
    out.push(binding);
  }
  return out;
}

/** Validate a persisted OAuth scope selection. An empty array clears the
 * selection (the connect flow then requests the default set); a non-empty one
 * must consist of supported scopes only, so `/oauth/start` can never be fed a
 * persisted typo that would fail authorization or be silently widened. */
function normalizeCloudflareWorkersScopes(value: unknown): string[] {
  if (Array.isArray(value) && value.length === 0) return [];
  try {
    return validateCloudflareOAuthScopes(value);
  } catch (err) {
    throw new DeployError(err instanceof Error ? err.message : String(err), 400, undefined, 'CFW_INVALID_SCOPES');
  }
}

function normalizeCloudflareWorkersAccess(value: unknown): { enabled: boolean; rule?: CloudflareWorkersAccessRule } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as JsonObject;
  if (v.enabled !== true) return { enabled: false };
  const rule = normalizeCloudflareWorkersAccessRule(v.rule);
  // Enabled access with an unrecognised/empty rule must stay ENABLED-but-inert
  // (rule omitted), never silently flip to "off": the deploy then fails closed
  // with CFW_ACCESS_EMPTY_RULE instead of going live unprotected while the UI
  // believes Access is on.
  return rule === undefined ? { enabled: true } : { enabled: true, rule };
}

function normalizeCloudflareWorkersCustomDomain(value: unknown): { hostname: string; zoneId: string } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as JsonObject;
  const hostname = typeof v.hostname === 'string' ? v.hostname.trim() : '';
  const zoneId = typeof v.zoneId === 'string' ? v.zoneId.trim() : '';
  if (!hostname || !zoneId) return undefined;
  return { hostname, zoneId };
}

export const CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE = 'CFW_CONFIG_CORRUPT';

function emptyCloudflareWorkersConfig(): DeployConfig {
  return {
    token: '',
    accountId: '',
    scriptName: '',
    compatibilityDate: '',
    credentialMode: 'token',
    clientId: '',
    redirectUri: '',
    scopes: [],
  };
}

async function readCloudflareWorkersConfigFile(): Promise<DeployConfig> {
  const file = deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID);
  try {
    const raw = await readFile(file, 'utf8');
    let parsed: JsonObject;
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SyntaxError('config is not a JSON object');
      parsed = value as JsonObject;
    } catch (err) {
      // Mirror the OAuth token reader: an unparsable file must not brick every
      // Workers route (config GET/PUT, capabilities, zones, deploy) — degrade to
      // the unconfigured default, say so loudly, and let the next settings save
      // rewrite the file. The marker reaches the client via the public config.
      if (!(err instanceof SyntaxError)) throw err;
      console.error(
        `[deploy] ${CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE}: ${file} is not valid JSON (${err.message}); treating Cloudflare Workers as unconfigured until the settings are saved again.`,
      );
      return { ...emptyCloudflareWorkersConfig(), configError: CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE };
    }
    return {
      token: typeof parsed.token === 'string' ? parsed.token : '',
      accountId: typeof parsed.accountId === 'string' ? parsed.accountId : '',
      scriptName: typeof parsed.scriptName === 'string' ? parsed.scriptName : '',
      compatibilityDate: typeof parsed.compatibilityDate === 'string' ? parsed.compatibilityDate : '',
      credentialMode: typeof parsed.credentialMode === 'string' ? parsed.credentialMode : 'token',
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : '',
      redirectUri: typeof parsed.redirectUri === 'string' ? parsed.redirectUri : '',
      scopes: Array.isArray(parsed.scopes)
        ? parsed.scopes.filter((s: unknown): s is string => typeof s === 'string')
        : [],
      bindings: persistedCloudflareWorkersBindings(parsed.bindings),
      access: normalizeCloudflareWorkersAccess(parsed.access),
      customDomain: normalizeCloudflareWorkersCustomDomain(parsed.customDomain),
      pendingOAuthGrant:
        typeof parsed.pendingOAuthGrant === 'string' && parsed.pendingOAuthGrant.trim()
          ? parsed.pendingOAuthGrant.trim()
          : undefined,
      pendingOAuthGrantClear: parsed.pendingOAuthGrantClear === true,
    };
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return emptyCloudflareWorkersConfig();
    throw err;
  }
}

/** The live OAuth grant on disk, or null when there is none for the credential
 * authority to be derived from: nothing stored, a grant with no refresh token
 * that is already within the expiry skew, or no configured data root. Never
 * throws: it gates a config READ, which must not gain a new failure mode.
 *
 * Expiry alone does not disqualify a grant. One that carries a refresh token
 * needs nothing from the config to be refreshed: the record holds the clientId
 * the refresh is bound to (buildStoredCloudflareToken persists it, and
 * refreshCloudflareOAuthAccessToken prefers current.clientId), and the resolver
 * refreshes before it signs. Reading an expired-but-refreshable grant as "no
 * grant" left a connect-only user — no static token, so this derivation is the
 * only thing that can route to the grant — in token mode with an empty token:
 * every deploy failed CFW_TOKEN_REQUIRED while /auth/status reported a connected
 * profile. Only a grant that cannot refresh at all is unusable once expired (the
 * resolver refuses that one with CFW_OAUTH_RECONNECT_REQUIRED), which is the
 * state a reconnect fixes. */

async function liveCloudflareOAuthGrant(): Promise<StoredCloudflareOAuthToken | null> {
  try {
    const current = await getCloudflareOAuthToken(cloudflareOAuthTokensDir());
    if (!current) return null;
    if (!current.refreshToken && isCloudflareOAuthTokenExpired(current, Date.now(), CLOUDFLARE_OAUTH_EXPIRY_SKEW_MS)) return null;
    return current;
  } catch {
    return null;
  }
}

/** The Workers config with the credential authority resolved from what is
 * actually on disk, not from the stored mode flag alone.
 *
 * The OAuth commit spans two files — the token first, the config's
 * `credentialMode` second (see commitCloudflareOAuthMode) — so a crash between
 * the two leaves a live grant on disk while the config still says 'token'.
 * Reading 'token' there makes every deploy ignore the grant sitting next to it
 * and fall back to a static API token a connect-only user never had, with
 * nothing left that knows the grant is there to revoke. So a present, usable
 * grant decides the mode, but only where the config has no static token of its
 * own to prefer: an explicit token is the user's stated choice of authority and
 * is never overruled. Deriving oauth from the grant regardless made 'token'
 * unreachable for as long as a grant existed — the selector flipped straight
 * back on every read, so a user could not leave OAuth mode at all. Leaving is
 * what disconnect does, and it clears the grant before resetting the mode, so
 * this derivation is never handed a stale grant to re-assert.
 *
 * A credential TRANSITION in flight is decided by its durable marker before any
 * of that derivation runs (see markCloudflareOAuthGrantPending and
 * writeCloudflareWorkersConfig). The marker is written BEFORE the destructive
 * half of the transition, so it is the only honest answer for the window in
 * which the two files beside it disagree: a live grant whose config has not
 * committed 'oauth' yet (the connect crash) is the authority, and a config
 * leaving oauth decides token mode even while the grant is still on disk.
 * Without it, the first window signs with a static token while the grant stays
 * valid with no holder, and the second reports oauth with nothing behind it.
 *
 * A config that reads as corrupt is returned untouched: it is already a distinct
 * degraded state whose recovery is a settings save, and the disconnect reset
 * documents that it reads as token mode. */
export async function readCloudflareWorkersConfig(): Promise<DeployConfig> {
  const config = await readCloudflareWorkersConfigFile();
  if (config.configError) return config;
  if (config.pendingOAuthGrantClear) return { ...config, credentialMode: 'token' };
  if (config.pendingOAuthGrant) {
    // The grant the connect is storing is the authority from the instant the
    // marker lands — the stored mode and any static token are what that write
    // has not replaced yet. The grant's own clientId is still preferred (the
    // same reason as the derivation below), read best-effort so a marker whose
    // grant was cleared underneath it stays a read, not a new failure mode.
    //
    // The marker is honored only while the credential it describes is still
    // there. It is written BEFORE the token (markCloudflareOAuthGrantPending),
    // so a crash or a failed token write between the two leaves it durable with
    // no grant on disk; honoring it unconditionally answered 'oauth' for every
    // later read, which in turn let a settings PUT carrying credentialMode
    // 'oauth' skip its token check (the current mode already read as oauth) and
    // persist a mode with nothing behind it. With no grant the marker decides
    // nothing, and the derivation below reads the file on its own terms. The
    // crash between the token write and the mode commit still reads oauth,
    // because there the grant exists.
    const grant = await liveCloudflareOAuthGrant();
    if (grant) return { ...config, credentialMode: 'oauth', clientId: grant.clientId || config.clientId };
  }
  if (config.credentialMode === 'oauth') return config;
  // A static credential the user saved outranks the grant (see above), and it is
  // checked before the grant is even read, so a token-mode config neither pays
  // for nor depends on the OAuth token file.
  if (config.token) return config;
  const grant = await liveCloudflareOAuthGrant();
  if (!grant) return config;
  return {
    ...config,
    credentialMode: 'oauth',
    // The token's own clientId is authoritative for the connection it issued
    // (refreshCloudflareOAuthAccessToken reads it the same way), so a config
    // that never got the identity write still names the client that can refresh
    // the grant, and reads as configured instead of as a broken connection.
    clientId: grant.clientId || config.clientId,
  };
}

export async function writeCloudflareWorkersConfig(input: Partial<DeployConfig>) {
  return withCloudflareConfigMutation(async () => {
  // A settings save is an OAuth mutation like any other: a transition that
  // crashed before it could confirm the revoke it recorded settles here first,
  // so the grant dies on the first save after the crash instead of never.
  // INSIDE the lock (see settleCloudflareOAuthGrantRevokes): a settle that ran
  // ahead of the lock could revoke the handle a transition already inside it
  // had just recorded, and then watch that transition's rollback restore the
  // grant it killed.
  await settlePendingCloudflareOAuthGrantRevokes();
  const current = await readCloudflareWorkersConfig();
  const tokenInput = typeof input?.token === 'string' ? input.token.trim() : '';
  // The authority switch to 'oauth' must not be reachable via a bare config PUT:
  // require a durable OAuth token before accepting the flip (fail closed).
  let credentialMode = current.credentialMode;
  if (typeof input?.credentialMode === 'string') {
    if (input.credentialMode !== 'token' && input.credentialMode !== 'oauth') {
      throw new DeployError(
        'Cloudflare credential mode must be "token" or "oauth".',
        400,
        undefined,
        'CFW_INVALID_CREDENTIAL_MODE',
      );
    }
    // The authority switch to 'oauth' must not be reachable via a bare config PUT:
    // require a durable OAuth token before accepting the flip (fail closed).
    if (input.credentialMode === 'oauth' && current.credentialMode !== 'oauth') {
      const oauthToken = await getCloudflareOAuthToken(cloudflareOAuthTokensDir());
      if (!oauthToken) {
        throw new DeployError(
          'Connect Cloudflare first — an OAuth token is required to switch credential mode to oauth.',
          400,
          undefined,
          'CFW_OAUTH_RECONNECT_REQUIRED',
        );
      }
    }
    credentialMode = input.credentialMode;
  }
  const next: DeployConfig = {
    token:
      tokenInput && tokenInput !== SAVED_CLOUDFLARE_WORKERS_TOKEN_MASK
        ? tokenInput
        : current.token,
    accountId: typeof input?.accountId === 'string' ? input.accountId.trim() : current.accountId,
    scriptName: typeof input?.scriptName === 'string' ? input.scriptName.trim() : current.scriptName,
    compatibilityDate:
      typeof input?.compatibilityDate === 'string' ? input.compatibilityDate.trim() : current.compatibilityDate,
    credentialMode,
    clientId: typeof input?.clientId === 'string' ? input.clientId.trim() : current.clientId,
    redirectUri: typeof input?.redirectUri === 'string' ? input.redirectUri.trim() : current.redirectUri,
    scopes: input?.scopes !== undefined ? normalizeCloudflareWorkersScopes(input.scopes) : current.scopes,
    bindings: input?.bindings !== undefined ? normalizeCloudflareWorkersBindings(input.bindings) : current.bindings,
    access: input?.access !== undefined ? normalizeCloudflareWorkersAccess(input.access) : current.access,
    customDomain: input?.customDomain !== undefined ? normalizeCloudflareWorkersCustomDomain(input.customDomain) : current.customDomain,
  };
  // The pending-credential markers are not part of the request, and `next`
  // REPLACES the record that carries them: carry them forward. Only an
  // abandonment may drop one — the oauth->token transition below, the
  // disconnect reset, and clearPendingCloudflareOAuthGrant — because a connect's
  // commit refuses to land its mode when the marker no longer names its attempt
  // (commitCloudflareOAuthMode). A save that erased them would make every
  // in-flight connect read as abandoned and refuse a commit that is still
  // perfectly alive, on nothing more than the user editing their settings.
  if (current.pendingOAuthGrant) next.pendingOAuthGrant = current.pendingOAuthGrant;
  if (current.pendingOAuthGrantClear) next.pendingOAuthGrantClear = current.pendingOAuthGrantClear;
  // A save that chooses 'oauth' supersedes a half-finished exit from oauth —
  // the rule markCloudflareOAuthGrantPending applies to a connect. The check
  // above proved a grant is in the store, and the marker's whole purpose is to
  // keep every read answering token mode while a grant is being taken OFF disk.
  // Carried forward here, it persisted a record whose derived mode read 'token'
  // while the response echoed 'oauth': configured:true on the settings surface
  // over a config no deploy would sign OAuth with. A clear that a crash
  // interrupted before its destructive half has nothing left to finish — the
  // grant it was going to take off disk is the one this save names as the
  // authority — and one that did run left an empty store the check refused.
  if (input?.credentialMode === 'oauth') delete next.pendingOAuthGrantClear;
  // Persist exactly what the read path will see. The read path applies the same
  // normalizers, so an un-normalized write that reads back as `undefined` would
  // silently downgrade "Access on" / "custom domain" to "off" on the next deploy
  // while the PUT response echoed the intended value.
  if (input?.access !== undefined && input.access !== null && next.access === undefined) {
    throw new DeployError('Cloudflare Access is enabled but has no valid rule — add at least one email, a domain, a policy id, or "only me".', 400, undefined, 'CFW_ACCESS_EMPTY_RULE');
  }
  if (input?.customDomain !== undefined && input.customDomain !== null && next.customDomain === undefined) {
    throw new DeployError('Cloudflare Workers custom domain needs both a hostname and a zoneId.', 400, undefined, 'CFW_CUSTOM_DOMAIN_INVALID');
  }
  // In 'oauth' mode the API token is optional — the deploy uses the rotating
  // OAuth access token instead. Only require a static token in 'token' mode.
  if (next.credentialMode !== 'oauth' && !next.token) {
    throw new DeployError('Cloudflare API token is required.', 400, undefined, 'CFW_TOKEN_REQUIRED');
  }
  if (!next.accountId) throw new DeployError('Cloudflare account ID is required.', 400, undefined, 'CFW_ACCOUNT_ID_REQUIRED');
  if (next.access?.enabled && !next.access.rule) {
    throw new DeployError('Cloudflare Access is enabled but has no rule — add an email, domain, or policy.', 400, undefined, 'CFW_ACCESS_EMPTY_RULE');
  }
  // Switching the authority from oauth to a static token is a credential
  // TRANSITION, not a config edit: the grant being left behind is the only
  // thing that can still mint access tokens, and nothing else would ever
  // revoke it — the refresh token stays valid on Cloudflare's side while
  // /auth/status keeps reporting the profile as connected, long after the
  // deploys stopped using it. The order below is what keeps a save that FAILS
  // from destroying anything it cannot account for:
  //
  // 1. the intent, durably, while the credential is still there. From this
  //    write on every read of the config is in token mode whatever the file's
  //    stored mode says (readCloudflareWorkersConfig), so the window in which
  //    the grant is gone and the file still reads 'oauth' with nothing behind
  //    it cannot exist;
  // 2. the destructive half — the grant goes off disk, and is recorded as a
  //    durable revoke handle in the same locked write (see
  //    clearCloudflareOAuthTokenForRevoke). A crash from here on leaves the
  //    grant named by a file on disk, which is what lets the next OAuth
  //    mutation finish the revoke this save never got to;
  // 3. the mode the user chose, validated above (a token-mode save always has a
  //    static token, so even this write failing leaves a working credential);
  // 4. the revoke, LAST, and only once the transition has actually LANDED. A
  //    save that fails at 3 has replaced nothing: the marker settles that the
  //    config reads token mode, but the static token it would sign with is the
  //    one from the record that was just discarded, and the mode the user chose
  //    never reached the file. So a failure at 3 ROLLS BACK — the displaced
  //    grant goes back on disk and the pre-transition record is rewritten
  //    without the marker, which is the state this save found. The revoke is
  //    reserved for a rollback that itself fails, where nothing is left that
  //    could hold the grant.
  //
  // It runs after the validations above, so a refused save never gets here.
  const cloudflareConfigFile = deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID);
  // A crash between the intent write and the destructive clear below leaves
  // pendingOAuthGrantClear set with the grant still on disk and no revoke handle:
  // the derived mode then reads 'token', so a later save would skip this branch
  // and never finish the clear+revoke. Enter the transition when the marker is
  // already pending too, so the abandoned clear runs and the settle below drains
  // the handle it records. Re-running the clear on an empty store is a no-op.
  if (input?.credentialMode === 'token' && (current.credentialMode === 'oauth' || current.pendingOAuthGrantClear === true)) {
    const intent: DeployConfig = { ...persistableCloudflareWorkersConfig(current), pendingOAuthGrantClear: true };
    // A connect in flight is being abandoned by this transition.
    delete intent.pendingOAuthGrant;
    await writeDeployConfigFile(cloudflareConfigFile, intent);
    const displaced = await clearCloudflareOAuthTokenForRevoke(cloudflareOAuthTokensDir());
    // This save IS the abandonment the pending markers exist to record: the
    // credential a connect in flight was storing is destroyed here, so the
    // record written below must not carry that attempt's marker forward (the
    // carry-forward above put it there). A marker that still names an attempt is
    // what lets that attempt's commit land the mode — and landing oauth over
    // this save would undo the authority the user just chose, over a credential
    // this save has already revoked.
    delete next.pendingOAuthGrant;
    delete next.pendingOAuthGrantClear;
    try {
      await writeDeployConfigFile(cloudflareConfigFile, next);
    } catch (err) {
      // The replacement never landed, so this save is a no-op that must not
      // destroy anything. Revoking here left the user with NEITHER credential:
      // the static token they typed existed only in the record that was thrown
      // away, the surviving config read token mode with an empty token, and the
      // revoke cannot be undone. Roll back instead — grant first, so the record
      // rewritten below never names oauth with nothing behind it, then the
      // pre-transition config with the marker this transition added dropped.
      try {
        // The grant is the config's credential again, so the revoke handle this
        // transition recorded in the same write as the clear has to go with it:
        // left behind, the next OAuth mutation would revoke a credential the
        // config still names and the user is still using. Both halves are ONE
        // write (restoreCloudflareOAuthTokenAndDropRevokes). Two writes left the
        // window this rollback exists to close: a crash between them, or a drop
        // that failed and was swallowed, stranded a restored credential on disk
        // with a pending handle still naming it.
        //
        // The restore lands the grant only while its handle still names it. A
        // handle that is gone means a settle confirmed the revoke — Cloudflare
        // has killed the grant — and putting it back would name a dead
        // credential as the authority. The intent marker from step 1 is then
        // left standing: the config keeps reading token mode over an empty
        // store, which is the crash state the branch condition above already
        // re-enters and finishes on the next save.
        const landed = displaced
          ? await restoreCloudflareOAuthTokenAndDropRevokes(cloudflareOAuthTokensDir(), displaced)
          : true;
        if (landed) {
          const restored: DeployConfig = { ...persistableCloudflareWorkersConfig(current) };
          delete restored.pendingOAuthGrant;
          delete restored.pendingOAuthGrantClear;
          await writeDeployConfigFile(cloudflareConfigFile, restored);
        }
      } catch (rollbackErr) {
        // The rollback itself failed, so no state is left to hand the grant
        // back to: a store the restored config no longer names must not keep
        // reporting a connected profile, and an unheld grant must not stay
        // valid at Cloudflare. Both steps are best-effort; the save's own error
        // is what surfaces.
        console.error(
          `[deploy] rolling back the failed Cloudflare credential transition did not complete (${rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr)}); revoking the displaced OAuth grant.`,
        );
        await clearCloudflareOAuthToken(cloudflareOAuthTokensDir()).catch(() => {});
        if (displaced && await revokeClearedCloudflareGrant(displaced, next.clientId)) {
          await dropCloudflareGrantRevokeHandle(displaced);
        }
      }
      throw err;
    }
    // The transition landed. The revoke handle recorded by the clear's own
    // write is settled here — and would have been left for the next OAuth
    // mutation to settle had this process died between the two.
    await settlePendingCloudflareOAuthGrantRevokes(next.clientId);
  } else {
    await writeDeployConfigFile(cloudflareConfigFile, next);
  }
  return publicCloudflareWorkersConfig(next);
  });
}

/** The Workers config as it may be written back to disk: the read-time
 * `configError` marker is never persisted. Every partial mutation below
 * spreads the current config, which carries the marker after a corrupt read;
 * without this strip the sentinel would land in the file. */
function persistableCloudflareWorkersConfig(config: DeployConfig): DeployConfig {
  const { configError: _configError, ...rest } = config;
  return rest;
}

/** Refuse a partial Workers-config mutation while the file on disk is
 * unparsable. `readCloudflareWorkersConfig` degrades a corrupt file to the
 * empty defaults so the routes keep working, but a partial write built on
 * those defaults would REPLACE the user's (recoverable) file with an empty
 * config — a disconnect or a connect would erase the account id, script name,
 * bindings, Access rule and custom domain. Only an explicit settings PUT
 * (`writeCloudflareWorkersConfig`, which builds the whole record from the
 * request) heals the file. */
function refuseCloudflareWorkersConfigMutationIfCorrupt(current: DeployConfig, what: string): void {
  if (!current.configError) return;
  throw new DeployError(
    `Cloudflare Workers config file is not valid JSON; refusing to ${what} until the Workers settings are saved again.`,
    409,
    undefined,
    CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE,
  );
}

/** Record the durable intent of an OAuth connect: the grant's write is about to
 * land and its `credentialMode` commit comes second, so a crash between the two
 * leaves a live grant beside a config that still says 'token' — and when that
 * config also holds a static token, every deploy silently keeps signing with
 * the static one while the grant stays valid with nobody holding it. Writing
 * the marker FIRST makes the read path answer with the credential the connect
 * is actually storing, from before the token exists until the commit lands.
 * Dropped by commitCloudflareOAuthMode, by the settings PUT that takes the
 * transition branch, by the disconnect reset, and by every path that abandons
 * the attempt (clearPendingCloudflareOAuthGrant). Refuses to run on a corrupt
 * config file (CFW_CONFIG_CORRUPT), like the other partial mutations.
 *
 * Returns the id it recorded. That id is the attempt's identity, and it is the
 * ONLY thing that lets the commit half of this connect tell "the marker is
 * still mine" from "something destroyed the credential this marker stood for
 * while my token write was in flight": the marker is a boolean-shaped flag no
 * more, and the commit is handed this id to check against.
 *
 * Reads the FILE, not the derived config: what this writes back is the stored
 * record plus the marker, never a mode the derivation inferred from the grant
 * beside it. */
export async function markCloudflareOAuthGrantPending(): Promise<string> {
  const attemptId = randomUUID();
  return withCloudflareConfigMutation(async () => {
    // A reconnect is an OAuth mutation like any other (see
    // writeCloudflareWorkersConfig): it settles a transition's unconfirmed
    // revoke before it records its own intent — inside the lock, for the
    // reason given there.
    await settlePendingCloudflareOAuthGrantRevokes();
    const current = await readCloudflareWorkersConfigFile();
    refuseCloudflareWorkersConfigMutationIfCorrupt(current, 'record the pending OAuth grant');
    const next: DeployConfig = { ...persistableCloudflareWorkersConfig(current), pendingOAuthGrant: attemptId };
    // The opposite intent cannot be pending at the same time: a connect
    // supersedes a half-finished exit from oauth, and its own commit settles
    // the mode.
    delete next.pendingOAuthGrantClear;
    await writeDeployConfigFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), next);
    return attemptId;
  });
}

/** Drop a pending-credential-transition marker without touching the mode: the
 * paths that ABANDON an OAuth attempt (a guarded token write that lost its
 * race, a config commit whose credential was restored or cleared) leave the
 * config as they found it, minus the intent that attempt recorded. A marker
 * left behind would make every later read answer 'oauth' with no credential
 * behind it — deploys failing CFW_OAUTH_RECONNECT_REQUIRED while /auth/status
 * reports a disconnected profile. A no-op when nothing is pending, and on a
 * corrupt file (which cannot carry a marker and must not be rewritten). */
export async function clearPendingCloudflareOAuthGrant(): Promise<void> {
  return withCloudflareConfigMutation(async () => {
    const current = await readCloudflareWorkersConfigFile();
    if (!current.pendingOAuthGrant && !current.pendingOAuthGrantClear) return;
    if (current.configError) return;
    const next: DeployConfig = { ...persistableCloudflareWorkersConfig(current) };
    delete next.pendingOAuthGrant;
    delete next.pendingOAuthGrantClear;
    await writeDeployConfigFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), next);
  });
}

/** Switch the Workers credential authority to OAuth — invoked only after the
 * OAuth token has been durably persisted, so a failed/cancelled flow leaves the
 * prior credential mode (and any static token) intact. When identity is given,
 * the config clientId/redirectUri are updated in the same write as the mode
 * switch, so a replacement client is never recorded before its token is.
 * Refuses to run on a corrupt config file (CFW_CONFIG_CORRUPT); the connect
 * route then rolls the token write back.
 *
 * Refuses with CFW_OAUTH_RECONNECT_REQUIRED when the token store is empty. This
 * write is only ever the SECOND half of the OAuth commit — the connect route's
 * persistCredential writes the token first — so a store with nothing in it means
 * the credential this commit is the second half of has been cleared or revoked
 * underneath it, and recording 'oauth' then names a mode with no credential
 * behind it. The connect route's rollback owns the failure semantics.
 *
 * `attemptId` is the id markCloudflareOAuthGrantPending recorded for THIS
 * attempt, and passing it is what makes the empty-store check sufficient. The
 * check alone cannot see the whole window: the connect's token write runs
 * OUTSIDE the config lock, so a settings PUT can take the oauth->token
 * transition (clearing the store, revoking the grant the connect minted, and
 * dropping the marker) and the connect's guarded write can still land after it —
 * the store then holds a credential again, and a commit that only asked "is
 * anything stored?" would re-write credentialMode 'oauth' over the authority the
 * user just chose. The marker id answers the question that actually matters:
 * does the intent this attempt recorded still stand? A commit whose id is gone
 * refuses, and the connect route's rollback owns the failure semantics. */
export async function commitCloudflareOAuthMode(
  identity?: { clientId: string; redirectUri: string },
  attemptId?: string,
): Promise<void> {
  return withCloudflareConfigMutation(async () => {
    const current = await readCloudflareWorkersConfig();
    refuseCloudflareWorkersConfigMutationIfCorrupt(current, 'switch the credential mode to oauth');
    // The marker this attempt recorded has to still be the one on file. It is
    // dropped by everything that destroys the credential the marker stands for
    // — the oauth->token transition (which also revokes it), the disconnect
    // reset, the abandonment paths — and overwritten by a newer connect, whose
    // own commit is then the one that may land the mode. Landing it here would
    // re-assert an authority that no longer holds this attempt's grant.
    if (attemptId !== undefined && current.pendingOAuthGrant !== attemptId) {
      throw new DeployError(
        'Connect Cloudflare first — the OAuth attempt this mode switch belongs to was abandoned while its credential was being stored, so its grant is no longer the authority this config may record.',
        400,
        undefined,
        'CFW_OAUTH_RECONNECT_REQUIRED',
      );
    }
    // The connect window is exactly when a settings PUT can read mode 'token' on
    // disk beside the live grant persistCredential has just written, derive
    // 'oauth' from that grant (readCloudflareWorkersConfig), and take the
    // oauth->token transition branch — clearing and revoking the grant the
    // connect just minted. Writing 'oauth' anyway records the mode with nothing
    // behind it: the settings surface reports configured:true while
    // /auth/status reports disconnected, and every deploy fails
    // CFW_OAUTH_RECONNECT_REQUIRED. Refuse instead, so the connect route's
    // rollback stays the single owner of the failure semantics. This runs under
    // the same mutation lock as the settings PUT's transition, so the two cannot
    // interleave.
    if (!(await getCloudflareOAuthToken(cloudflareOAuthTokensDir()))) {
      throw new DeployError(
        'Connect Cloudflare first — an OAuth token is required to switch credential mode to oauth.',
        400,
        undefined,
        'CFW_OAUTH_RECONNECT_REQUIRED',
      );
    }
    const next: DeployConfig = { ...persistableCloudflareWorkersConfig(current), credentialMode: 'oauth' };
    if (identity) {
      next.clientId = identity.clientId;
      next.redirectUri = identity.redirectUri;
    }
    // The mode this commit lands is what both markers stood in for: the
    // connect is no longer pending (mode oauth is now durable) and any
    // half-finished exit from oauth is settled by it.
    delete next.pendingOAuthGrant;
    delete next.pendingOAuthGrantClear;
    await writeDeployConfigFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), next);
    // The commit is the second half of a connect: it settles every unconfirmed
    // revoke on the way past — a crashed exit from OAuth's debt, and the grant
    // this connect's own token write displaced, which that write recorded as a
    // handle in the same locked write (setCloudflareOAuthTokenGuarded). AFTER
    // the mode lands, never before: until this write the displaced grant's fate
    // is undecided — a commit that refuses hands it back to the connect route's
    // rollback, which restores it as the live credential — and a settle ahead of
    // the write revoked it first, so the rollback restored a grant Cloudflare
    // had already killed. Still inside the lock, for the reason
    // settleCloudflareOAuthGrantRevokes gives.
    await settlePendingCloudflareOAuthGrantRevokes(identity?.clientId);
  });
}

/** Reset the credential authority back to a static token after disconnect,
 * bypassing the token validation in writeCloudflareWorkersConfig (a user who
 * only ever used OAuth has no static token to require). On a corrupt config
 * file the mode write is skipped rather than refused — a corrupt file already
 * reads as token mode, so the state that write would establish is the state the
 * daemon reports, while a write would erase the recoverable file. The
 * credential still goes off disk there: the user asked for it to be gone, and a
 * config file that cannot be parsed says nothing about the token store.
 *
 * Disconnect is a credential transition OFF oauth like any other, and it runs
 * in the order a settings save does (see writeCloudflareWorkersConfig above),
 * for the same reason: the span between the credential leaving the store and
 * the mode landing must not be a state a crash can freeze. Taking the
 * credential off disk first — which is what the disconnect route did, before
 * this function recorded anything — left the stored mode 'oauth' beside an
 * empty store with nothing on disk marking the transition in flight. A crash, a
 * SIGKILL, or a daemon stop during the revoke round trip (one attempt per
 * handle, 10s timeout) then made that state durable: readCloudflareWorkersConfig
 * fell through to the stored 'oauth', the settings surface reported
 * configured:true while /auth/status reported disconnected, and every deploy
 * failed CFW_OAUTH_RECONNECT_REQUIRED — with no in-app remedy, because the
 * Disconnect and Reconnect buttons only render while the status reads connected
 * or expired.
 *
 * 1. the intent, durably, while the credential is still there, so every read
 *    from that write on answers token mode whatever the file's stored mode says
 *    (readCloudflareWorkersConfig) — and so a later token-mode save re-enters
 *    this transition to finish a clear a crash interrupted;
 * 2. the destructive half — the grant goes off disk, and is recorded as a
 *    durable revoke handle in the same locked write
 *    (clearCloudflareOAuthTokenForRevoke), so the grant is named by a file from
 *    the instant it leaves the store;
 * 3. the mode the user chose, with both markers dropped: the mode is now the
 *    durable statement, and the displaced credential is named by the revoke
 *    handle rather than by a pending intent;
 * 4. the revoke, LAST and only once the transition has landed, named by the
 *    record the clear returned (RFC 7009 §2.1) rather than by a re-read of the
 *    config — which is also what kept the revoke from being network-bound ahead
 *    of the mode write. A revoke that times out, is refused, or answers 5xx
 *    keeps its handle for the next OAuth mutation, as does a process that dies
 *    here.
 *
 * Nothing rolls back on a failure after step 1: the user asked for the
 * credential to be gone, and the marker written there keeps every read honest
 * about that even when the steps behind it did not finish. */
export async function resetCloudflareCredentialMode(): Promise<void> {
  return withCloudflareConfigMutation(async () => {
    const cloudflareConfigFile = deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID);
    const current = await readCloudflareWorkersConfig();
    if (current.configError) {
      console.warn(
        `[deploy] ${CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE}: leaving the unparsable Cloudflare Workers config untouched on disconnect; save the Workers settings to rewrite it.`,
      );
      // A corrupt file cannot carry the intent marker, but the credential the
      // user asked to destroy must still go, along with the revokes recorded by
      // every credential destruction before it: an orphaned grant is exactly
      // what must not survive a disconnect. The settle drops a handle only on a
      // revoke Cloudflare confirmed, so a grant whose revoke is still owed keeps
      // the record that names it.
      const displacedOnCorruptConfig = await clearCloudflareOAuthTokenForRevoke(cloudflareOAuthTokensDir());
      await settlePendingCloudflareOAuthGrantRevokes(displacedOnCorruptConfig?.clientId);
      return;
    }
    // 1. The intent, while the credential is still on disk. Dropping
    // pendingOAuthGrant abandons any connect in flight: this transition is about
    // to destroy the credential that attempt is storing, and a commit still
    // naming this attempt's marker would land oauth over the authority the user
    // has just left (commitCloudflareOAuthMode).
    const intent: DeployConfig = { ...persistableCloudflareWorkersConfig(current), pendingOAuthGrantClear: true };
    delete intent.pendingOAuthGrant;
    await writeDeployConfigFile(cloudflareConfigFile, intent);
    // 2. The destructive half, recorded as a durable revoke handle in the same
    // locked write, so a process that dies from here on leaves the grant named
    // by a file on disk.
    const displaced = await clearCloudflareOAuthTokenForRevoke(cloudflareOAuthTokensDir());
    // 3. The mode the user chose. Both markers go: no marker may keep a read
    // answering 'oauth' with nothing behind it, and none may keep answering
    // token mode over a credential the next connect legitimately stores.
    const next: DeployConfig = { ...persistableCloudflareWorkersConfig(current), credentialMode: 'token' };
    delete next.pendingOAuthGrant;
    delete next.pendingOAuthGrantClear;
    await writeDeployConfigFile(cloudflareConfigFile, next);
    // 4. The revoke, named by the record the clear returned.
    await settlePendingCloudflareOAuthGrantRevokes(displaced?.clientId);
  });
}

export function publicCloudflareWorkersConfig(config: Partial<DeployConfig>) {
  // Readiness is mode-aware: in 'oauth' mode there is intentionally no static
  // token, so a configured account + client is enough. The live OAuth connection
  // status is reported separately by GET /api/cloudflare/auth/status.
  const oauthReady = config?.credentialMode === 'oauth'
    ? Boolean(config?.accountId && config?.clientId)
    : Boolean(config?.token && config?.accountId);
  const body: JsonObject = {
    providerId: CLOUDFLARE_WORKERS_PROVIDER_ID,
    configured: oauthReady,
    tokenMask: config?.token ? SAVED_CLOUDFLARE_WORKERS_TOKEN_MASK : '',
    teamId: '',
    teamSlug: '',
    accountId: config?.accountId || '',
    scriptName: config?.scriptName || '',
    compatibilityDate: config?.compatibilityDate || '',
    credentialMode: config?.credentialMode || 'token',
    clientId: config?.clientId || '',
    redirectUri: config?.redirectUri || '',
    scopes: Array.isArray(config?.scopes) ? config.scopes : [],
    bindings: config?.bindings || [],
    access: config?.access || { enabled: false },
    customDomain: config?.customDomain,
    target: 'preview',
  };
  if (config?.configError) body.configError = config.configError;
  return body;
}

/** Resolved data root for the Workers config + OAuth token files, injected by
 * the daemon at startup from RUNTIME_DATA_DIR so both the config and the token
 * stay inside the runtime data root (never an independently recomputed
 * OD_USER_STATE_DIR / home fallback that packaged or isolated namespaces would
 * write outside of — or leak across). */
let cloudflareWorkersDataRoot: string | undefined;

export function configureCloudflareWorkersDataDir(rootDir: string): void {
  cloudflareWorkersDataRoot = rootDir;
}

function cloudflareWorkersBaseDir(): string {
  // No env/home fallback: the data root is an explicit dependency injected by
  // the daemon via configureCloudflareWorkersDataDir(RUNTIME_DATA_DIR). Fail
  // closed rather than silently writing Workers config/credentials outside the
  // runtime data root (the escape pattern the data-dir contract forbids).
  if (!cloudflareWorkersDataRoot) {
    throw new DeployError(
      'Cloudflare Workers data dir is not configured (call configureCloudflareWorkersDataDir with RUNTIME_DATA_DIR).',
      500,
      undefined,
      'CFW_DATA_DIR_UNCONFIGURED',
    );
  }
  return cloudflareWorkersDataRoot;
}

/** Directory that holds 'cloudflare-oauth-tokens.json' — the daemon-resolved
 * data root (fails closed with CFW_DATA_DIR_UNCONFIGURED if not configured). */
export function cloudflareOAuthTokensDir(): string {
  return cloudflareWorkersBaseDir();
}

/** Refresh an access token this many ms before its recorded expiry. Sized to
 * a worst-case deploy (asset buckets, a certificate-issuing custom hostname,
 * perimeter retries), so a token handed out at deploy start is still valid at
 * its last call; per-call re-resolution (CloudflareTokenProvider) covers the
 * rest. */
export const CLOUDFLARE_OAUTH_EXPIRY_SKEW_MS = 10 * 60_000;

/** In-process single-flight mutex, keyed by dataDir. Concurrent deploys that
 * all find an expired token share one refresh instead of stampeding the token
 * endpoint. */
const cloudflareOAuthRefreshLocks = new Map<string, Promise<string>>();

/**
 * Resolve the live Cloudflare credential for a deploy. In 'token' mode this is
 * the static API token; in 'oauth' mode it is the rotating access token from
 * 'cloudflare-oauth-tokens.json', refreshed when it is within the expiry skew.
 * The read -> refresh -> persist sequence is single-flight, and the file is
 * re-read before every refresh so a connect/disconnect that landed while a
 * caller waited on the mutex is never clobbered. Coordination is in-process
 * only: one daemon per data dir is the contract (see cloudflare-tokens.ts).
 */
export async function getCloudflareAccessToken(
  providerId: DeployProviderId = CLOUDFLARE_WORKERS_PROVIDER_ID,
): Promise<string> {
  if (providerId !== CLOUDFLARE_WORKERS_PROVIDER_ID) {
    throw new DeployError(
      'getCloudflareAccessToken only supports the Cloudflare Workers provider.',
      400,
      undefined,
      'CFW_UNSUPPORTED_PROVIDER',
    );
  }
  const config = await readCloudflareWorkersConfig();
  if (config.credentialMode !== 'oauth') {
    if (!config.token) {
      throw new DeployError(
        'Cloudflare API token is required.',
        400,
        undefined,
        'CFW_TOKEN_REQUIRED',
      );
    }
    return config.token;
  }

  const dataDir = cloudflareOAuthTokensDir();
  // Fast path: a fresh token skips the mutex entirely.
  const current = await getCloudflareOAuthToken(dataDir);
  if (
    current &&
    !isCloudflareOAuthTokenExpired(
      current,
      Date.now(),
      CLOUDFLARE_OAUTH_EXPIRY_SKEW_MS,
    )
  ) {
    // The token is the authoritative record: it carries its own clientId /
    // redirectUri, so a still-fresh token is trusted as-is. This is what makes
    // a crash between the token write and the config-identity write harmless —
    // the credential never depends on the config matching the token.
    return current.accessToken;
  }

  // Single-flight refresh: concurrent deploy calls await the same promise.
  const inflight = cloudflareOAuthRefreshLocks.get(dataDir);
  if (inflight) return inflight;
  const task = refreshCloudflareOAuthAccessToken(config, dataDir);
  cloudflareOAuthRefreshLocks.set(dataDir, task);
  try {
    return await task;
  } finally {
    if (cloudflareOAuthRefreshLocks.get(dataDir) === task) {
      cloudflareOAuthRefreshLocks.delete(dataDir);
    }
  }
}

/**
 * The email recorded on the stored Cloudflare OAuth token at connect time, or
 * '' when none is stored (token mode, a record written before the email was
 * captured, or a client that lacks `user-details.read`). The Access "only me"
 * rule resolves from this before any upload; callers fall back to `GET /user`.
 */
export async function getCloudflareOAuthStoredEmail(): Promise<string> {
  const current = await getCloudflareOAuthToken(cloudflareOAuthTokensDir());
  return (current?.email ?? '').trim();
}

/** Upper bound on the refresh token-endpoint round trip. The refresh runs
 * under the single-flight lock, so a hung connection would otherwise park
 * every deploy call in the daemon behind it until the socket died on its own. */
export const CLOUDFLARE_OAUTH_REFRESH_TIMEOUT_MS = 20_000;
/** Bound on the best-effort revoke of a rotated grant nobody holds. */
const CLOUDFLARE_OAUTH_REVOKE_TIMEOUT_MS = 10_000;

/** Best-effort revoke of the grant a credential-mode transition just took off
 * disk — the clear-then-revoke pair the disconnect route performs (see
 * POST /api/cloudflare/oauth/disconnect). The displaced record's own clientId
 * is authoritative (RFC 7009 §2.1: the revoke names the client the token was
 * issued to); the config's is a fallback for a record written before the
 * identity was recorded. Never throws: the grant is already off disk, and the
 * mode the user chose does not depend on Cloudflare answering here.
 *
 * Returns whether the intent is SETTLED, and only a 2xx is. A refusal
 * (400 invalid_token) is not an answer that the grant is dead — Cloudflare
 * declines to revoke tokens it does not recognize, which includes a token that
 * is still live — and a 429 or a 5xx is the endpoint itself failing, so neither
 * may be mistaken for "revoked". Anything but a 2xx, and any transport failure
 * or timeout, answers false, which keeps the durable handle on disk as the one
 * record that still names a live grant; the next OAuth mutation retries it. */
async function revokeClearedCloudflareGrant(
  displaced: StoredCloudflareOAuthToken,
  fallbackClientId?: string,
): Promise<boolean> {
  const token = displaced.refreshToken || displaced.accessToken;
  if (!token) return true;
  const clientId = (displaced.clientId ?? '').trim() || (fallbackClientId ?? '').trim();
  const proxyDispatcher = proxyDispatcherRequestInit(process.env);
  try {
    const { ok, status } = await revokeCloudflareToken({
      token,
      tokenTypeHint: displaced.refreshToken ? 'refresh_token' : 'access_token',
      ...(clientId ? { clientId } : {}),
      fetchImpl: (input, init) => fetch(input, { ...init, ...proxyDispatcher.requestInit }),
      signal: AbortSignal.timeout(CLOUDFLARE_OAUTH_REVOKE_TIMEOUT_MS),
    });
    // A non-2xx is NOT the answer the handle was recorded for. Returning true
    // for one erased the only record of a grant that is still live — on a 503
    // the handle was dropped and the refresh token stayed valid with nothing
    // left anywhere that named it. The handle stays unless Cloudflare said 2xx.
    if (!ok) console.warn(`[cloudflare-oauth] revoke of the displaced OAuth grant was refused by Cloudflare (HTTP ${status})`);
    return ok;
  } catch (err: unknown) {
    console.warn('[cloudflare-oauth] revoke of the displaced OAuth grant failed:', err instanceof Error ? err.message : String(err));
    return false;
  } finally {
    await proxyDispatcher.close();
  }
}

/** Drop the durable revoke handle a transition recorded for one grant, once
 * that grant is accounted for locally (restored to the store by a rollback, or
 * revoked at Cloudflare). Best-effort: an unwritable store keeps the handle,
 * and the handle is dropped only by name, so a failed drop can never take a
 * different grant's handle with it. */
async function dropCloudflareGrantRevokeHandle(displaced: StoredCloudflareOAuthToken | null): Promise<void> {
  const token = displaced ? displaced.refreshToken || displaced.accessToken : '';
  if (!token) return;
  try {
    await dropPendingCloudflareOAuthRevokes(cloudflareOAuthTokensDir(), [token]);
  } catch (err: unknown) {
    console.warn(
      '[cloudflare-oauth] could not drop the Cloudflare grant revoke handle the rollback accounted for:',
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Finish the revokes a credential transition recorded but never confirmed.
 *
 * A transition that takes the OAuth grant off disk records it as a durable
 * revoke handle IN THE SAME WRITE as the clear
 * (clearCloudflareOAuthTokenForRevoke), so a crash between the clear and the
 * revoke — or between the clear and the mode write, which leaves the config
 * reading token mode over an empty store — cannot leave a refresh token valid
 * at Cloudflare with no file that names it. The recovered state is this call:
 * every OAuth mutation runs it on the way past, so the grant dies at the first
 * connect, disconnect, or settings save after the crash instead of never.
 *
 * `fallbackClientId` identifies the client for a handle recorded before the
 * record carried its own identity. Best-effort throughout: a handle whose
 * revoke cannot be completed — a transport failure, a timeout, or any answer
 * that is not a 2xx — stays on disk for the next mutation, and nothing here
 * throws; the mutation it runs ahead of is the caller's business, not this
 * debt's. */
export async function settlePendingCloudflareOAuthGrantRevokes(
  fallbackClientId?: string,
): Promise<void> {
  const dataDir = cloudflareOAuthTokensDir();
  let pending: StoredCloudflareOAuthToken[];
  try {
    pending = await getPendingCloudflareOAuthRevokes(dataDir);
  } catch (err: unknown) {
    console.warn(
      '[cloudflare-oauth] could not read the OAuth token store to settle a pending grant revoke:',
      err instanceof Error ? err.message : String(err),
    );
    return;
  }
  if (pending.length === 0) return;
  const settled: string[] = [];
  for (const handle of pending) {
    if (await revokeClearedCloudflareGrant(handle, fallbackClientId)) {
      const token = handle.refreshToken || handle.accessToken;
      if (token) settled.push(token);
    }
  }
  if (settled.length === 0) return;
  try {
    await dropPendingCloudflareOAuthRevokes(dataDir, settled);
  } catch (err: unknown) {
    console.warn(
      '[cloudflare-oauth] could not drop a settled Cloudflare grant revoke handle; the next OAuth mutation retries it:',
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** settlePendingCloudflareOAuthGrantRevokes as a standalone OAuth mutation: the
 * same settle, taken under the Workers-config mutation lock. Every settle has to
 * run there, not only the ones that precede a config write. A settle outside
 * the lock can read a handle a transition has JUST recorded, revoke it with a
 * 2xx, and then watch that transition's rollback put the grant back as the live
 * credential (restoreCloudflareOAuthTokenAndDropRevokes): the config then
 * names a grant Cloudflare has already killed, the status surface reports a
 * connection, and every deploy on it fails. Under the lock the settle observes
 * the transition either whole or not at all. Callers already inside the lock
 * use settlePendingCloudflareOAuthGrantRevokes directly — the lock is not
 * re-entrant. */
export async function settleCloudflareOAuthGrantRevokes(fallbackClientId?: string): Promise<void> {
  return withCloudflareConfigMutation(() => settlePendingCloudflareOAuthGrantRevokes(fallbackClientId));
}

/** Run the read -> refresh -> persist sequence for a dataDir. The caller holds
 * the single-flight lock for this dataDir. */
async function refreshCloudflareOAuthAccessToken(
  config: DeployConfig,
  dataDir: string,
): Promise<string> {
  // Re-read under the lock: a reconnect (or an earlier refresh) may have
  // rotated the token while this caller was waiting for the mutex.
  const current = await getCloudflareOAuthToken(dataDir);
  if (
    current &&
    !isCloudflareOAuthTokenExpired(
      current,
      Date.now(),
      CLOUDFLARE_OAUTH_EXPIRY_SKEW_MS,
    )
  ) {
    return current.accessToken;
  }
  if (!current?.refreshToken) {
    throw new DeployError(
      'Cloudflare OAuth token is expired and has no refresh token — reconnect Cloudflare.',
      401,
      undefined,
      'CFW_OAUTH_RECONNECT_REQUIRED',
    );
  }
  // The token's own clientId is authoritative for refresh (RFC 6749 §6: the
  // refresh_token is bound to the client_id that received it). The config's
  // clientId is only a hint for the NEXT connect, so a crash between the token
  // write and the config-identity write can never break an existing credential.
  const clientId = (current.clientId ?? '').trim() || (config.clientId ?? '').trim();
  if (!clientId) {
    throw new DeployError(
      'Cloudflare OAuth client ID is required to refresh the access token.',
      400,
      undefined,
      'CFW_OAUTH_CLIENT_ID_REQUIRED',
    );
  }

  let refreshed: Awaited<ReturnType<typeof refreshCloudflareToken>>;
  // The token endpoint goes through the same HTTP/SOCKS proxy dispatcher the
  // connect and paste-back exchanges use (routes/cloudflare.ts). A bare fetch
  // here would bypass the user's proxy, so the refresh fails on exactly the
  // machines where the connect only worked because of it. The call is bounded
  // because it holds the single-flight lock (see CLOUDFLARE_OAUTH_REFRESH_TIMEOUT_MS).
  const proxyDispatcher = proxyDispatcherRequestInit(process.env);
  try {
    refreshed = await refreshCloudflareToken({
      clientId,
      refreshToken: current.refreshToken,
      fetchImpl: (input, init) => fetch(input, {
        ...init,
        ...proxyDispatcher.requestInit,
        signal: AbortSignal.timeout(CLOUDFLARE_OAUTH_REFRESH_TIMEOUT_MS),
      }),
    });
  } catch (err) {
    // A reconnect in this daemon may have replaced the credential while the
    // token endpoint was being called (the refresh runs outside the store's
    // lock). Cloudflare then rejects THIS call's now-superseded refresh token
    // with `invalid_grant` even though a fresh credential is already on disk —
    // so re-read before declaring the grant dead. A newer, unexpired
    // generation means the other writer won: adopt its token instead of
    // demanding a reconnect.
    const latest = await getCloudflareOAuthToken(dataDir);
    if (
      latest &&
      (latest.generation ?? 0) > (current.generation ?? 0) &&
      !isCloudflareOAuthTokenExpired(latest, Date.now(), CLOUDFLARE_OAUTH_EXPIRY_SKEW_MS)
    ) {
      return latest.accessToken;
    }
    throw classifyCloudflareRefreshFailure(err);
  } finally {
    await proxyDispatcher.close();
  }

  const stored: StoredCloudflareOAuthToken = {
    accessToken: refreshed.access_token,
    tokenType: refreshed.token_type ?? current.tokenType,
    clientId: current.clientId ?? clientId,
    generation: (current.generation ?? 0) + 1,
    savedAt: Date.now(),
  };
  if (current.redirectUri) stored.redirectUri = current.redirectUri;
  if (current.accountId) stored.accountId = current.accountId;
  if (current.email) stored.email = current.email;
  if (refreshed.refresh_token) stored.refreshToken = refreshed.refresh_token;
  else if (current.refreshToken) stored.refreshToken = current.refreshToken;
  if (refreshed.scope) stored.scope = refreshed.scope;
  else if (current.scope) stored.scope = current.scope;
  // `expires_in` reaches here UNVALIDATED (see cloudflareOAuthExpiresAt): the
  // shared token endpoint casts the parsed body with no checking, so a rotated
  // grant whose response omits the field, or sends it as a string, must not
  // produce a record with no `expiresAt`. Such a record reads as NON-EXPIRING
  // (isCloudflareOAuthTokenExpired returns false without a numeric value), so
  // the fast path in getCloudflareAccessToken would hand out this access token
  // forever instead of rotating again. Inherit the superseded record's TTL, and
  // stamp a conservative one when even that is missing.
  stored.expiresAt = cloudflareOAuthExpiresAt({
    expiresIn: refreshed.expires_in,
    priorExpiresAt: current.expiresAt,
  });
  // Compare-and-set persist: only write if the store still holds the same
  // generation the refresh read before the token-endpoint call. A disconnect
  // that cleared the token (or a reconnect that replaced it) during that call
  // makes this return false instead of resurrecting a credential the user
  // already revoked.
  const persisted = await setCloudflareOAuthTokenIfGenerationMatches(
    dataDir,
    stored,
    current.generation ?? 0,
  );
  if (!persisted) {
    // The store moved on (disconnect or reconnect) while the token endpoint
    // was rotating the grant. The record above is never written, so the
    // refresh token it carries would otherwise stay valid with no holder.
    // Name it durably FIRST, under the token lock, and only then revoke it: a
    // revoke that times out, answers 5xx, or never runs because the process
    // dies here used to leave the rotated grant valid with no file naming it.
    // The handle is retired only by a 2xx; otherwise the next OAuth mutation's
    // settle retries it. Named by what the token endpoint actually issued, not
    // by the record above — that one inherits the OLD refresh token when the
    // response rotated none, and the old grant is the store's to account for.
    const rotated: StoredCloudflareOAuthToken = {
      accessToken: refreshed.access_token,
      ...(refreshed.refresh_token ? { refreshToken: refreshed.refresh_token } : {}),
      tokenType: stored.tokenType,
      clientId,
      generation: stored.generation,
      savedAt: stored.savedAt,
    };
    try {
      await recordPendingCloudflareOAuthRevoke(dataDir, rotated);
    } catch (err: unknown) {
      console.warn(
        '[cloudflare-oauth] could not record the superseded refresh grant as a revoke handle:',
        err instanceof Error ? err.message : String(err),
      );
    }
    if (await revokeClearedCloudflareGrant(rotated, clientId)) await dropCloudflareGrantRevokeHandle(rotated);
    const latest = await getCloudflareOAuthToken(dataDir);
    if (latest && !isCloudflareOAuthTokenExpired(latest, Date.now(), CLOUDFLARE_OAUTH_EXPIRY_SKEW_MS)) {
      // A reconnect wrote a newer, still-valid credential — adopt it rather
      // than clobber. An expired newer record is no credential at all: handing
      // out its access token would fail the very call this refresh serves.
      return latest.accessToken;
    }
    // Disconnect cleared the token while the refresh was in flight, or the
    // credential that replaced it is itself already expired.
    throw new DeployError(
      'Cloudflare OAuth was disconnected or replaced by an expired credential while refreshing — reconnect Cloudflare.',
      401,
      undefined,
      'CFW_OAUTH_RECONNECT_REQUIRED',
    );
  }
  return stored.accessToken;
}

/** Map a token-endpoint refresh failure onto a DeployError the routes already
 * understand. The OAuth client throws a plain Error ("token endpoint rejected
 * request: HTTP 400 … invalid_grant"), which used to surface as a generic 400
 * BAD_REQUEST with the raw body — so a dead refresh token never told the user
 * to reconnect. A 4xx from the token endpoint means the grant is gone
 * (revoked, rotated, client changed): CFW_OAUTH_RECONNECT_REQUIRED. Anything
 * else (network, 5xx) is a transient upstream failure and must NOT prompt a
 * reconnect that would discard a still-valid grant. */
export function classifyCloudflareRefreshFailure(err: unknown): DeployError {
  if (err instanceof DeployError) return err;
  // The bounded fetch gave up (AbortSignal.timeout rejects with a
  // `TimeoutError` DOMException; a plain abort with `AbortError`). Cloudflare
  // never answered, so the grant is not known to be dead: transient, no
  // reconnect.
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : undefined;
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new DeployError(
      'Cloudflare OAuth token refresh timed out after ' + Math.round(CLOUDFLARE_OAUTH_REFRESH_TIMEOUT_MS / 1000) + 's — Cloudflare did not answer; try again.',
      502,
      undefined,
      'CFW_OAUTH_REFRESH_FAILED',
    );
  }
  const detail = err instanceof Error ? err.message : String(err);
  const httpStatus = /\bHTTP (\d{3})\b/.exec(detail);
  const status = httpStatus ? Number(httpStatus[1]) : 0;
  if (status >= 400 && status < 500 && status !== 429) {
    return new DeployError(
      'Cloudflare rejected the OAuth refresh (' + detail + ') — reconnect Cloudflare.',
      401,
      undefined,
      'CFW_OAUTH_RECONNECT_REQUIRED',
    );
  }
  return new DeployError(
    'Cloudflare OAuth token refresh failed: ' + detail,
    502,
    undefined,
    'CFW_OAUTH_REFRESH_FAILED',
  );
}

export async function readDeployConfig(providerId: DeployProviderId = VERCEL_PROVIDER_ID) {
  if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID) return readCloudflarePagesConfig();
  if (providerId === CLOUDFLARE_WORKERS_PROVIDER_ID) return readCloudflareWorkersConfig();
  return readVercelConfig();
}

export async function writeDeployConfig(providerId: DeployProviderId = VERCEL_PROVIDER_ID, input: Partial<DeployConfig> = {}) {
  if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID) return writeCloudflarePagesConfig(input);
  if (providerId === CLOUDFLARE_WORKERS_PROVIDER_ID) return writeCloudflareWorkersConfig(input);
  return writeVercelConfig(input);
}

export function publicDeployConfigForProvider(providerId: DeployProviderId = VERCEL_PROVIDER_ID, config: Partial<DeployConfig> = {}) {
  if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID) return publicCloudflarePagesConfig(config);
  if (providerId === CLOUDFLARE_WORKERS_PROVIDER_ID) return publicCloudflareWorkersConfig(config);
  return publicDeployConfig(config);
}

export function isDeployProviderId(value: unknown): value is DeployProviderId {
  return value === VERCEL_PROVIDER_ID || value === CLOUDFLARE_PAGES_PROVIDER_ID || value === CLOUDFLARE_WORKERS_PROVIDER_ID;
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
    throw new DeployError('Only HTML files can be deployed.', 400, undefined, 'NOT_HTML');
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

  if (options.includeProjectFiles) {
    await addVisibleProjectFilesToDeployPlan(files, {
      projectsRoot,
      projectId,
      metadata: options.metadata,
    });
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
    }, 'MISSING_REFERENCES');
  }
  return plan.files;
}

async function addVisibleProjectFilesToDeployPlan(
  files: Map<string, DeployFile>,
  input: { projectsRoot: string; projectId: string; metadata?: unknown },
) {
  if (isLinkedFolderProject(input.metadata)) return;
  const projectFiles = await listFiles(input.projectsRoot, input.projectId, { metadata: input.metadata });
  for (const item of projectFiles) {
    if (!item?.name || files.has(item.name)) continue;
    const safePath = validateProjectPath(item.name);
    // The selected entry is already mapped to provider-root index.html. Keep
    // the original root index reserved so choosing index-v1.html does not get
    // overwritten by the old launcher at the same deploy path.
    if (safePath === 'index.html') continue;
    const projectFile = await readProjectFile(input.projectsRoot, input.projectId, safePath, input.metadata);
    files.set(safePath, {
      file: safePath,
      data: projectFile.buffer,
      contentType: projectFile.mime,
      sourcePath: safePath,
    });
  }
}

function isLinkedFolderProject(metadata: unknown) {
  return Boolean(
    metadata
      && typeof metadata === 'object'
      && typeof (metadata as { baseDir?: unknown }).baseDir === 'string',
  );
}

export async function deployToVercel({ config, files, projectId }: { config: DeployConfig; files: DeployFile[]; projectId: string }) {
  if (!config?.token) {
    throw new DeployError('Vercel token is required.', 400, undefined, 'VERCEL_TOKEN_REQUIRED');
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
    throw new DeployError(ready?.error?.message || 'Vercel deployment failed.', 502, ready, 'VERCEL_DEPLOY_FAILED');
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
  if (!config?.token) throw new DeployError('Cloudflare API token is required.', 400, undefined, 'CF_TOKEN_REQUIRED');
  if (!config?.accountId) throw new DeployError('Cloudflare account ID is required.', 400, undefined, 'CF_ACCOUNT_ID_REQUIRED');
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

export async function deployToCloudflarePages(input: { config: DeployConfig; files: DeployFile[]; projectId?: string; cloudflarePages?: unknown; priorMetadata?: JsonObject | undefined; target?: 'preview' | 'production' }) {
  const {
    config,
    files,
    projectId = '',
    cloudflarePages = undefined,
    priorMetadata = undefined,
    target = 'production',
  } = input || {};
  if (!config?.token) throw new DeployError('Cloudflare API token is required.', 400, undefined, 'CF_TOKEN_REQUIRED');
  if (!config?.accountId) throw new DeployError('Cloudflare account ID is required.', 400, undefined, 'CF_ACCOUNT_ID_REQUIRED');
  if (!config?.projectName) throw new DeployError('Cloudflare Pages project name could not be generated.', 400, undefined, 'CF_PROJECT_NAME_UNRESOLVED');

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
  const deployBranch = target === 'preview' ? 'preview' : 'main';
  form.append('branch', deployBranch);

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
  const urlCandidates = target === 'preview'
    ? (deployment?.url ? [deployment.url] : [])
    : (productionUrl ? [productionUrl] : [deployment?.url]);
  const link = await waitForReachableDeploymentUrl(
    urlCandidates,
    { providerLabel: 'Cloudflare Pages' },
  );
  const pagesDevUrl = target === 'preview'
    ? (link.url || deploymentUrl(deployment) || productionUrl)
    : (productionUrl || link.url || deploymentUrl(deployment));
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
    target,
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
  if (!rawZoneId) throw new DeployError('Cloudflare zone is required for a custom domain.', 400, undefined, 'CF_ZONE_REQUIRED');
  if (!zoneName || !isValidCloudflareZoneName(zoneName)) {
    throw new DeployError('Select a valid Cloudflare domain for the custom domain.', 400, undefined, 'CF_ZONE_INVALID');
  }
  if (!domainPrefix) {
    throw new DeployError('Enter a valid subdomain prefix, for example "demo".', 400, undefined, 'CF_SUBDOMAIN_INVALID');
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
    }, 'CF_ZONE_MISMATCH');
  }
  if (zone?.status && zone.status !== 'active') {
    throw new DeployError('Cloudflare custom domains require an active zone.', 400, {
      errorCode: 'cloudflare_zone_inactive',
    }, 'CF_ZONE_INACTIVE');
  }
  if (zone?.type && zone.type !== 'full') {
    throw new DeployError('Cloudflare custom domains require a full DNS zone.', 400, {
      errorCode: 'cloudflare_zone_not_full',
    }, 'CF_ZONE_PARTIAL');
  }
  return { ...selection, zoneName };
}

async function setupCloudflarePagesCustomDomain({ config, projectId, selection, pagesDevUrl, priorMetadata }: { config: DeployConfig; projectId: string; selection: CloudflarePagesDeploySelection; pagesDevUrl: string; priorMetadata?: JsonObject | undefined }) {
  if (!config.projectName) throw new DeployError('Cloudflare Pages project name could not be generated.', 400, undefined, 'CF_PROJECT_NAME_UNRESOLVED');
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
      if (!conflictingId) throw new DeployError('Cloudflare DNS record id is missing.', 502, undefined, 'CF_DNS_RECORD_MISSING');
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
    'CF_DNS_RECORD_CONFLICT',
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
        'CF_DOMAIN_ALREADY_BOUND',
      );
    }
    throw cloudflareError(json, resp.status, 'Cloudflare Pages custom domain setup failed.');
  }
  return json?.result ?? json;
}

async function findCloudflarePagesDomain(config: DeployConfig, hostname: string) {
  const normalizedHostname = normalizeHostname(hostname);
  if (!normalizedHostname) return null;
  const resp = await fetch(cloudflarePagesProjectDomainUrl(config, normalizedHostname), {
    headers: cloudflareHeaders(config),
  });
  const json = await readCloudflareJson(resp);
  if (resp.status === 404) return null;
  if (!resp.ok || json?.success === false) {
    throw cloudflareError(json, resp.status, 'Cloudflare Pages custom domain lookup failed.');
  }
  const domain = json?.result ?? json;
  return normalizeHostname(domain?.name) === normalizedHostname ? domain : null;
}

export async function readCloudflarePagesDomain(config: DeployConfig, hostname: string) {
  if (!config?.token) throw new DeployError('Cloudflare API token is required.', 400, undefined, 'CF_TOKEN_REQUIRED');
  if (!config?.accountId) throw new DeployError('Cloudflare account ID is required.', 400, undefined, 'CF_ACCOUNT_ID_REQUIRED');
  if (!config?.projectName) throw new DeployError('Cloudflare Pages project name could not be generated.', 400, undefined, 'CF_PROJECT_NAME_UNRESOLVED');
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
        undefined,
        'CF_ASSET_TOO_LARGE',
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
      if (!file) throw new DeployError(`Cloudflare reported an unknown asset hash: ${hash}`, 502, undefined, 'CF_UNKNOWN_ASSET_HASH');
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
  // zero-width character in the regex source. The comment body is
  // tempered (`(?:[^-]|-(?!->))*`) rather than a lazy `[\s\S]*?` so each
  // comment matches deterministically — a lazy body inside the outer `*`
  // backtracks 2^n ways on a comment-only prolog with no doctype (ReDoS).
  if (!new RegExp('^\\uFEFF?\\s*(?:<!--(?:[^-]|-(?!->))*-->\\s*)*<!doctype\\s+html', 'i').test(source)) {
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
  // The document's own `</body>`, not one an author wrote into a script string:
  // splicing there would end their script with this tag's `</script>` and leak
  // the rest of it onto the deployed page (nexu-io/open-design#7410).
  const bodyClose = findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose);
  if (bodyClose >= 0) return `${html.slice(0, bodyClose)}${tag}${html.slice(bodyClose)}`;
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

/** The sentence for a link check whose probe returned no verdict of its own.
 *
 * The provider owns it: this fallback serves Vercel AND a Cloudflare Workers
 * record whose Access is off, and one hard-coded "Vercel" sentence told Workers
 * users about a provider that was never theirs. */
export function pendingPublicLinkMessage(providerId: string): string {
  return providerId === CLOUDFLARE_WORKERS_PROVIDER_ID
    ? 'Cloudflare Workers is still preparing the public link.'
    : 'Vercel is still preparing the public link.';
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
    const location = resp.headers?.get?.('location') || '';
    if (isCloudflareAccessRedirect(resp.status, location)) {
      return {
        reachable: false,
        status: 'protected',
        statusCode: resp.status,
        statusMessage: CLOUDFLARE_ACCESS_PROTECTED_MESSAGE,
      };
    }
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
    // Header evidence only: this probe is shared by every provider, so body
    // text is not proof of Access. See isCloudflareAccessChallengeResponse.
    if (resp.status === 401 && isCloudflareAccessChallengeResponse(resp)) {
      return {
        reachable: false,
        status: 'protected',
        statusCode: resp.status,
        statusMessage: CLOUDFLARE_ACCESS_PROTECTED_MESSAGE,
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
  if (!config.accountId) throw new DeployError('Cloudflare account ID is required.', 400, undefined, 'CF_ACCOUNT_ID_REQUIRED');
  return `${CLOUDFLARE_API}/accounts/${encodeURIComponent(config.accountId)}/pages/projects`;
}

function cloudflarePagesProjectUrl(config: DeployConfig, suffix = '') {
  if (!config.projectName) throw new DeployError('Cloudflare Pages project name could not be generated.', 400, undefined, 'CF_PROJECT_NAME_UNRESOLVED');
  const base = `${cloudflareAccountPagesProjectsUrl(config)}/${encodeURIComponent(config.projectName)}`;
  return suffix ? `${base}/${suffix}` : base;
}

function cloudflarePagesProjectDomainUrl(config: DeployConfig, hostname: string) {
  return `${cloudflarePagesProjectUrl(config, 'domains')}/${encodeURIComponent(hostname)}`;
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
    throw new DeployError('Cloudflare returned a non-JSON response.', resp.status || 502, undefined, 'CF_BAD_RESPONSE');
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
    throw new DeployError('Vercel returned a non-JSON response.', resp.status || 502, undefined, 'VERCEL_BAD_RESPONSE');
  }
}

function cloudflareError(json: JsonObject, status: number, fallback: string) {
  const message =
    json?.errors?.find?.((err: JsonObject) => err?.message)?.message ||
    json?.messages?.find?.((item: JsonObject) => item?.message)?.message ||
    json?.message ||
    fallback ||
    `Cloudflare request failed (${status}).`;
  // Deliberately NO structured code: this is the catch-all for any Cloudflare
  // API rejection, where the provider's HTTP status IS the signal. The client
  // (apps/web/src/providers/registry.ts) only falls back to `HTTP_${status}`
  // when the envelope code is generic, so stamping one code here would fold
  // auth (403), quota (429) and upstream faults (5xx) into a single bucket —
  // the opposite of what this file's specific codes are for. Add a code here
  // only for a failure whose CAUSE is known, not merely its status.
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
    return new DeployError("You don't have permission to create a project.", status, json, 'PROVIDER_FORBIDDEN');
  }
  // Catch-all — no structured code, so the client keeps bucketing by the real
  // provider status. See cloudflareError above.
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

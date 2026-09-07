import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readCurrentAppVersionInfo } from '../app-version.js';
import {
  withDeployConfigFileLock,
  writeDeployConfigFile,
} from '../deploy/config-file.js';
import { DeployError, type DeployErrorDetails } from '../deploy/errors.js';

type JsonObject = Record<string, any>;

export const DISPLAYDEV_PROVIDER_ID = 'displaydev-self';
export const SAVED_DISPLAYDEV_TOKEN_MASK = 'saved-displaydev-token';
export const DISPLAYDEV_FETCH_TIMEOUT_MS = 15_000;

const DISPLAYDEV_API = 'https://api.display.dev';
const DISPLAYDEV_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAYDEV_EMAIL_MAX_LENGTH = 254;
const DISPLAYDEV_ARTIFACT_NAME_MAX_LENGTH = 200;
const DISPLAYDEV_API_KEY_PATTERN =
  /^(?:dsp_live_|sk_live|org_live)[A-Za-z0-9_-]+$/u;

export type DisplayDevConfigHints = {
  defaultArtifactName?: string;
};

export type DisplayDevConfig = {
  token: string;
  apiUrl?: string | undefined;
  displayDev?: DisplayDevConfigHints | undefined;
};

export type DisplayDevConfigInput = Partial<DisplayDevConfig> & {
  clearToken?: boolean | undefined;
};

type DisplayDevDeploySelection = {
  name?: string;
  visibility?: 'public' | 'company' | 'private';
  sharedWith?: string[];
  clearSharedWith?: boolean;
};

type DisplayDevAccessSettings = {
  visibility: 'public' | 'company' | 'private';
  sharedWith: string[];
};

type DisplayDevCurrentArtifact = {
  version: number;
};

type DisplayDevDeployFile = {
  file: string;
  data: Buffer | Uint8Array | string;
  contentType?: string;
  sourcePath?: string;
};

export function displayDevConfigPath(runtimeDataDir: string): string {
  if (!runtimeDataDir) {
    throw new Error(
      'display.dev config requires the resolved daemon data directory.',
    );
  }
  return path.join(runtimeDataDir, 'displaydev.json');
}

export async function readDisplayDevConfig(
  runtimeDataDir: string,
): Promise<DisplayDevConfig> {
  try {
    const raw = await readFile(displayDevConfigPath(runtimeDataDir), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      token: displayDevPersistedTokenFromInput(parsed),
      apiUrl: validateDisplayDevApiUrl(parsed.apiUrl),
      displayDev: normalizeDisplayDevConfigHints(parsed.displayDev),
    };
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      return {
        token: '',
        apiUrl: DISPLAYDEV_API,
        displayDev: {},
      };
    }
    throw err;
  }
}

async function readDisplayDevConfigForWrite(
  runtimeDataDir: string,
  options: {
    replaceMalformedToken: boolean;
    replaceMalformedDisplayDev: boolean;
  },
): Promise<DisplayDevConfig> {
  try {
    const raw = await readFile(displayDevConfigPath(runtimeDataDir), 'utf8');
    const parsed = JSON.parse(raw);
    let apiUrl = DISPLAYDEV_API;
    let token = '';
    let displayDev: DisplayDevConfigHints = {};
    try {
      apiUrl = validateDisplayDevApiUrl(parsed?.apiUrl);
    } catch {
      apiUrl = DISPLAYDEV_API;
    }
    try {
      token = displayDevPersistedTokenFromInput(parsed);
    } catch (err) {
      if (!options.replaceMalformedToken) throw err;
    }
    try {
      displayDev = normalizeDisplayDevConfigHints(parsed?.displayDev);
    } catch (err) {
      if (!options.replaceMalformedDisplayDev) throw err;
    }
    return {
      token,
      apiUrl,
      displayDev,
    };
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      return {
        token: '',
        apiUrl: DISPLAYDEV_API,
        displayDev: {},
      };
    }
    if (err instanceof SyntaxError) {
      if (!options.replaceMalformedToken) {
        throw new DeployError(
          'display.dev saved config must contain valid JSON.',
          400,
        );
      }
      return {
        token: '',
        apiUrl: DISPLAYDEV_API,
        displayDev: {},
      };
    }
    throw err;
  }
}

export async function writeDisplayDevConfig(
  input: DisplayDevConfigInput,
  runtimeDataDir: string,
  options: { expectedToken?: string } = {},
) {
  const configPath = displayDevConfigPath(runtimeDataDir);
  return withDeployConfigFileLock(configPath, async () => {
    const source = displayDevConfigInputObject(input);
    const tokenInput = displayDevConfigTokenFromInput(source);
    const clearToken = displayDevClearTokenFromInput(source);
    const hasDisplayDevOverride =
      source.displayDev !== undefined && source.displayDev !== null;
    const displayDevOverride = hasDisplayDevOverride
      ? normalizeDisplayDevConfigHints(source.displayDev)
      : undefined;
    const replacesToken = Boolean(
      (tokenInput && tokenInput !== SAVED_DISPLAYDEV_TOKEN_MASK) || clearToken,
    );
    const current = await readDisplayDevConfigForWrite(runtimeDataDir, {
      replaceMalformedToken: replacesToken,
      replaceMalformedDisplayDev: hasDisplayDevOverride || replacesToken,
    });
    if (
      options.expectedToken !== undefined &&
      current.token !== options.expectedToken
    ) {
      throw new DeployError(
        'display.dev API key changed while the publish was in progress.',
        409,
        undefined,
        'CONFLICT',
      );
    }
    if (
      tokenInput === SAVED_DISPLAYDEV_TOKEN_MASK &&
      !current.token &&
      !clearToken
    ) {
      throw new DeployError(
        'The saved display.dev API key was removed.',
        409,
        undefined,
        'CONFLICT',
      );
    }
    const displayDev = displayDevOverride ?? current.displayDev ?? {};
    const next: DisplayDevConfig = {
      token:
        tokenInput && tokenInput !== SAVED_DISPLAYDEV_TOKEN_MASK
          ? displayDevTokenFromInput(tokenInput)
          : clearToken
            ? ''
            : current.token,
      apiUrl: normalizeDisplayDevApiUrl(current.apiUrl),
    };
    if (Object.keys(displayDev).length > 0) next.displayDev = displayDev;
    await writeDeployConfigFile(configPath, next);
    return publicDisplayDevConfig(next);
  });
}

export function publicDisplayDevConfig(config: Partial<DisplayDevConfig>) {
  const displayDev = normalizeDisplayDevConfigHints(config?.displayDev);
  const body: JsonObject = {
    providerId: DISPLAYDEV_PROVIDER_ID,
    configured: Boolean(config?.token),
    tokenMask: config?.token ? SAVED_DISPLAYDEV_TOKEN_MASK : '',
    teamId: '',
    teamSlug: '',
    target: 'preview',
  };
  if (Object.keys(displayDev).length > 0) body.displayDev = displayDev;
  return body;
}

export async function deployToDisplayDev(input: {
  config: DisplayDevConfig;
  files: DisplayDevDeployFile[];
  projectId: string;
  displayDev?: unknown;
  priorMetadata?: JsonObject | undefined;
}) {
  const {
    config,
    files,
    projectId,
    displayDev = undefined,
    priorMetadata = undefined,
  } = input || {};
  const entry = files?.[0];
  if (!entry)
    throw new DeployError('No file found to publish to display.dev.', 400);
  if (files.length > 1) {
    throw new DeployError(
      'display.dev deploy currently supports single-file HTML previews only. Remove or inline referenced assets before deploying to display.dev.',
      400,
      {
        providerId: DISPLAYDEV_PROVIDER_ID,
        unsupportedFiles: files
          .slice(1)
          .map((file) => file.sourcePath || file.file),
      },
    );
  }

  const selection = normalizeDisplayDevDeploySelection(displayDev);
  const configHints = normalizeDisplayDevConfigHints(config?.displayDev);
  const apiUrl = displayDevApiUrl(config);
  // Validate the local preview policy before any lookup or publish request.
  displayDevTestPreviewOrigins(new URL(apiUrl));
  const auth = displayDevAuthorization(config);
  if (
    !auth &&
    (selection.visibility ||
      selection.sharedWith?.length ||
      selection.clearSharedWith)
  ) {
    throw new DeployError(
      'A display.dev API key is required to apply access settings.',
      400,
    );
  }
  const priorDisplayDev = asRecord(priorMetadata?.displayDev);
  const priorShortId =
    typeof priorDisplayDev?.shortId === 'string'
      ? priorDisplayDev.shortId.trim()
      : '';
  const priorMode = priorDisplayDev?.mode;
  if (priorMode === 'authenticated' && priorShortId && !auth) {
    throw new DeployError(
      'A display.dev API key is required to redeploy this artifact.',
      400,
    );
  }
  const currentArtifact =
    auth && priorShortId
      ? await fetchDisplayDevCurrentArtifact(apiUrl, auth, priorShortId, {
          allowMissing: priorMode === 'anonymous',
        })
      : null;
  const shouldUpdate = currentArtifact !== null;
  const body = new FormData();
  const data = Buffer.from(entry.data);
  body.append(
    'file',
    new Blob([data], { type: entry.contentType || 'text/html' }),
    entry.sourcePath || entry.file || 'index.html',
  );
  const defaultName = configHints.defaultArtifactName;
  const rawName = shouldUpdate
    ? selection.name || ''
    : selection.name ||
      defaultName ||
      (auth ? displayDevDefaultArtifactName(entry, projectId) : '');
  const name = rawName ? displayDevNameFromInput(rawName, 'name') : '';
  if (name) body.append('name', name);
  if (auth) {
    if (shouldUpdate) {
      if (selection.visibility) body.append('visibility', selection.visibility);
      if (selection.sharedWith?.length) {
        for (const email of selection.sharedWith)
          body.append('sharedWith', email);
      } else if (selection.clearSharedWith) {
        body.append('clearSharedWith', 'true');
      }
    } else {
      if (selection.visibility) body.append('visibility', selection.visibility);
      const sharedWith = selection.sharedWith?.length
        ? selection.sharedWith
        : selection.clearSharedWith
          ? []
          : [];
      for (const email of sharedWith) body.append('sharedWith', email);
    }
  }

  const idempotencyKey = shouldUpdate
    ? ''
    : displayDevIdempotencyKey({
        auth,
        data,
        entry,
        projectId,
        selection,
        ...(!auth && priorMode === 'anonymous' && priorShortId
          ? { priorAnonymousShortId: priorShortId }
          : {}),
        ...(Object.keys(configHints).length > 0
          ? { defaults: configHints }
          : {}),
      });
  const { resp, json } = await displayDevFetchJson(
    shouldUpdate
      ? `${apiUrl}/v1/artifacts/${encodeURIComponent(priorShortId)}`
      : auth
        ? `${apiUrl}/v1/artifacts`
        : `${apiUrl}/v1/public/artifacts`,
    {
      method: shouldUpdate ? 'PUT' : 'POST',
      headers: await displayDevHeaders(auth, {
        ...(currentArtifact?.version
          ? { 'If-Match': `"v${currentArtifact.version}"` }
          : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      }),
      body,
    },
  );
  if (!resp.ok) throw displayDevError(json, resp.status);

  const result = auth
    ? decodeAuthenticatedDisplayDevResult(
        json,
        shouldUpdate ? priorShortId : undefined,
      )
    : decodeAnonymousDisplayDevResult(json, config);
  const previewUrl = assertDisplayDevPreviewUrl(config, result.url);
  const now = Date.now();
  return {
    providerId: DISPLAYDEV_PROVIDER_ID,
    url: previewUrl,
    deploymentId: result.shortId,
    target: 'preview' as const,
    status: 'ready' as const,
    reachableAt: now,
    providerMetadata: {
      displayDev: {
        shortId: result.shortId,
        mode: auth ? 'authenticated' : 'anonymous',
        ...('version' in result ? { version: result.version } : {}),
        ...('claimUrl' in result
          ? { claimUrl: result.claimUrl, expiresAt: result.expiresAt }
          : {}),
      },
    },
  };
}

export async function fetchDisplayDevArtifactAccessSettings(
  config: DisplayDevConfig,
  shortId: string,
): Promise<DisplayDevAccessSettings> {
  const normalizedShortId = typeof shortId === 'string' ? shortId.trim() : '';
  if (!normalizedShortId) {
    throw new DeployError(
      'display.dev artifact id is required to read access settings.',
      400,
    );
  }
  const auth = displayDevAuthorization(config);
  if (!auth) {
    throw new DeployError(
      'display.dev API key is required to read access settings.',
      400,
    );
  }
  const apiUrl = displayDevApiUrl(config);
  const { resp, json } = await displayDevFetchJson(
    `${apiUrl}/v1/artifacts/${encodeURIComponent(normalizedShortId)}`,
    {
      method: 'GET',
      headers: await displayDevHeaders(auth),
    },
  );
  if (!resp.ok) throw displayDevError(json, resp.status);
  assertDisplayDevArtifactIdentity(json, normalizedShortId);
  return displayDevAccessSettingsFromArtifact(json);
}

export function assertDisplayDevPreviewUrl(
  config: DisplayDevConfig,
  input: unknown,
): string {
  const previewUrl = displayDevHttpUrlFromInput(input, 'deployment URL', {
    url: input,
  });
  const preview = new URL(previewUrl);
  const api = new URL(displayDevApiUrl(config));
  const testPreviewOrigins = displayDevTestPreviewOrigins(api);
  const usesProductionApi = api.origin === DISPLAYDEV_API;
  const allowedProductionHost =
    preview.hostname === 'dsp.so' || preview.hostname.endsWith('.dsp.so');
  const hasUnsafeAuthority = Boolean(
    preview.username || preview.password || preview.port,
  );
  const allowedConfiguredHost =
    !usesProductionApi &&
    !preview.username &&
    !preview.password &&
    (preview.origin === api.origin || testPreviewOrigins.includes(preview.origin));
  if (
    (usesProductionApi &&
      (preview.protocol !== 'https:' ||
        !allowedProductionHost ||
        hasUnsafeAuthority)) ||
    (!usesProductionApi && !allowedConfiguredHost)
  ) {
    throw new DeployError(
      'display.dev returned a deployment URL outside the configured provider origin.',
      502,
      { url: previewUrl },
      'UPSTREAM_UNAVAILABLE',
    );
  }
  return previewUrl;
}

function displayDevTestPreviewOrigins(api: URL): string[] {
  // The effective API URL already enforces the test-only API opt-in.
  if (api.origin === DISPLAYDEV_API) return [];
  const raw = process.env.OD_DISPLAYDEV_TEST_PREVIEW_ORIGINS;
  if (raw === undefined) return [];
  try {
    const origins: unknown = JSON.parse(raw);
    if (!Array.isArray(origins)) throw new Error('Expected an origin array.');
    return origins.map((origin: unknown) => {
      if (typeof origin !== 'string') throw new Error('Expected an origin string.');
      const url = new URL(origin);
      const localHost =
        url.hostname === 'localhost' ||
        url.hostname.endsWith('.localhost') ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '[::1]' ||
        url.hostname.endsWith('.test');
      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.origin !== origin ||
        url.hostname.includes('*') ||
        !localHost
      ) {
        throw new Error('Expected an exact local/test HTTP(S) origin.');
      }
      return url.origin;
    });
  } catch {
    throw new DeployError(
      'OD_DISPLAYDEV_TEST_PREVIEW_ORIGINS must be a JSON array of exact local/test HTTP(S) origins.',
      400,
    );
  }
}

function normalizeDisplayDevConfigHints(
  input: unknown,
  fallback: DisplayDevConfigHints = {},
): DisplayDevConfigHints {
  const inputObject = displayDevObjectFromInput(input);
  const hasSource = Boolean(inputObject);
  const source = inputObject ?? {};
  const prior =
    !hasSource && fallback && typeof fallback === 'object' ? fallback : {};
  const hasDefaultArtifactNameInput = Object.prototype.hasOwnProperty.call(
    source,
    'defaultArtifactName',
  );
  const defaultArtifactName = hasDefaultArtifactNameInput
    ? displayDevNameFromInput(source.defaultArtifactName, 'defaultArtifactName')
    : typeof prior.defaultArtifactName === 'string'
      ? prior.defaultArtifactName.trim()
      : '';
  return {
    ...(defaultArtifactName ? { defaultArtifactName } : {}),
  };
}

function normalizeDisplayDevDeploySelection(
  input: unknown,
): DisplayDevDeploySelection {
  const inputObject = displayDevObjectFromInput(input);
  if (!inputObject) return {};
  const hasNameInput = Object.prototype.hasOwnProperty.call(
    inputObject,
    'name',
  );
  const name = hasNameInput
    ? displayDevNameFromInput(inputObject.name, 'name')
    : '';
  const hasVisibilityInput = Object.prototype.hasOwnProperty.call(
    inputObject,
    'visibility',
  );
  const visibility = hasVisibilityInput
    ? displayDevVisibilityFromInput(inputObject.visibility)
    : undefined;
  const hasSharedWithInput = Object.prototype.hasOwnProperty.call(
    inputObject,
    'sharedWith',
  );
  const rawSharedWith = hasSharedWithInput
    ? displayDevSharedWithFromInput(inputObject.sharedWith)
    : [];
  const sharedWith = normalizeDisplayDevEmailList(rawSharedWith, 'sharedWith');
  return {
    ...(name ? { name } : {}),
    ...(visibility ? { visibility } : {}),
    ...(sharedWith.length ? { sharedWith } : {}),
    ...(hasSharedWithInput && sharedWith.length === 0
      ? { clearSharedWith: true }
      : {}),
  };
}

function displayDevConfigInputObject(input: unknown): JsonObject {
  if (input === undefined || input === null) return {};
  if (typeof input === 'object' && !Array.isArray(input))
    return input as JsonObject;
  throw new DeployError('display.dev config must be an object.', 400);
}

function displayDevObjectFromInput(input: unknown): JsonObject | null {
  if (input == null) return null;
  if (typeof input === 'object' && !Array.isArray(input))
    return input as JsonObject;
  throw new DeployError('display.dev settings must be an object.', 400);
}

function displayDevVisibilityFromInput(
  value: unknown,
  field = 'visibility',
): DisplayDevDeploySelection['visibility'] {
  if (value === 'public' || value === 'company' || value === 'private')
    return value;
  throw new DeployError(
    `display.dev ${field} must be "public", "company", or "private".`,
    400,
  );
}

function displayDevSharedWithFromInput(value: unknown): string[] {
  if (Array.isArray(value))
    return displayDevStringArrayFromInput(value, 'sharedWith');
  if (typeof value === 'string') return value.split(',');
  throw new DeployError(
    'display.dev sharedWith must be a string or an array of strings.',
    400,
  );
}

function displayDevStringArrayFromInput(
  value: unknown,
  field: string,
): string[] {
  if (!Array.isArray(value)) {
    throw new DeployError(
      `display.dev ${field} must be an array of strings.`,
      400,
    );
  }
  if (value.every((item) => typeof item === 'string')) return value;
  throw new DeployError(`display.dev ${field} must contain only strings.`, 400);
}

function displayDevNameFromInput(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new DeployError(`display.dev ${field} must be a string.`, 400);
  }
  const name = value.trim();
  if (!name) return '';
  if (name.length > DISPLAYDEV_ARTIFACT_NAME_MAX_LENGTH) {
    throw new DeployError(
      `display.dev ${field} must be ${DISPLAYDEV_ARTIFACT_NAME_MAX_LENGTH} characters or fewer.`,
      400,
    );
  }
  if (!/[A-Za-z0-9]/u.test(name)) {
    throw new DeployError(
      `display.dev ${field} must contain at least one letter or number.`,
      400,
    );
  }
  return name;
}

function normalizeDisplayDevEmailList(
  values: string[],
  field: string,
): string[] {
  const emails: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const email = value.trim().toLowerCase();
    if (
      email.length > DISPLAYDEV_EMAIL_MAX_LENGTH ||
      !DISPLAYDEV_EMAIL_PATTERN.test(email)
    ) {
      throw new DeployError(
        `display.dev ${field} must contain only valid email addresses.`,
        400,
      );
    }
    if (!seen.has(email)) {
      seen.add(email);
      emails.push(email);
    }
  }
  return emails;
}

function displayDevAccessSettingsFromArtifact(
  input: unknown,
): DisplayDevAccessSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new DeployError(
      'display.dev did not return artifact access settings.',
      502,
      input as DeployErrorDetails,
      'UPSTREAM_UNAVAILABLE',
    );
  }
  const source = input as JsonObject;
  const visibility = displayDevVisibilityFromArtifact(source.visibility);
  const sharedWith = displayDevSharedWithFromArtifact(source.sharedWith);
  return { visibility, sharedWith };
}

function displayDevVisibilityFromArtifact(
  value: unknown,
): DisplayDevAccessSettings['visibility'] {
  if (value === 'public' || value === 'company' || value === 'private')
    return value;
  throw new DeployError(
    'display.dev did not return a valid artifact visibility.',
    502,
    undefined,
    'UPSTREAM_UNAVAILABLE',
  );
}

function displayDevSharedWithFromArtifact(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string')
  ) {
    throw new DeployError(
      'display.dev did not return valid artifact recipients.',
      502,
      undefined,
      'UPSTREAM_UNAVAILABLE',
    );
  }
  try {
    return normalizeDisplayDevEmailList(value, 'sharedWith');
  } catch {
    throw new DeployError(
      'display.dev did not return valid artifact recipients.',
      502,
      undefined,
      'UPSTREAM_UNAVAILABLE',
    );
  }
}

function displayDevDefaultArtifactName(
  entry: DisplayDevDeployFile,
  projectId: string,
): string {
  const source =
    entry.sourcePath || entry.file || projectId || 'open-design-preview';
  const base = path
    .basename(source)
    .replace(/\.[^.]*$/, '')
    .trim();
  return base || projectId || 'open-design-preview';
}

function normalizeDisplayDevApiUrl(
  input: unknown,
  fallback = DISPLAYDEV_API,
): string {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return fallback || DISPLAYDEV_API;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:')
      return fallback || DISPLAYDEV_API;
    return url.toString().replace(/\/+$/u, '');
  } catch {
    return fallback || DISPLAYDEV_API;
  }
}

function validateDisplayDevApiUrl(
  input: unknown,
  fallback = DISPLAYDEV_API,
): string {
  if (input === undefined || input === null) return fallback || DISPLAYDEV_API;
  if (typeof input !== 'string') {
    throw new DeployError('display.dev API URL must be a string.', 400);
  }
  const raw = input.trim();
  if (!raw) return fallback || DISPLAYDEV_API;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DeployError(
      'display.dev API URL must be a valid HTTP or HTTPS URL.',
      400,
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new DeployError(
      'display.dev API URL must be a valid HTTP or HTTPS URL.',
      400,
    );
  }
  return url.toString().replace(/\/+$/u, '');
}

function displayDevTokenFromInput(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  const token = raw.replace(/^Bearer\s+/iu, '').trim();
  if (!DISPLAYDEV_API_KEY_PATTERN.test(token)) {
    throw new DeployError('display.dev API key has an invalid format.', 400);
  }
  return token;
}

function displayDevPersistedTokenFromInput(input: unknown): string {
  const source = asRecord(input);
  if (!source || !Object.prototype.hasOwnProperty.call(source, 'token'))
    return '';
  if (typeof source.token !== 'string') {
    throw new DeployError('display.dev saved token must be a string.', 400);
  }
  return displayDevTokenFromInput(source.token);
}

function displayDevConfigTokenFromInput(input: JsonObject): string {
  if (!Object.prototype.hasOwnProperty.call(input, 'token')) return '';
  if (typeof input.token !== 'string') {
    throw new DeployError('display.dev token must be a string.', 400);
  }
  return input.token.trim();
}

function displayDevClearTokenFromInput(input: JsonObject): boolean {
  if (!Object.prototype.hasOwnProperty.call(input, 'clearToken')) return false;
  if (typeof input.clearToken !== 'boolean') {
    throw new DeployError('display.dev clearToken must be a boolean.', 400);
  }
  return input.clearToken;
}

function displayDevAuthorization(config: DisplayDevConfig): string {
  const source = asRecord(config);
  if (
    source &&
    Object.prototype.hasOwnProperty.call(source, 'token') &&
    typeof source.token !== 'string'
  ) {
    throw new DeployError('display.dev token must be a string.', 400);
  }
  const token = displayDevTokenFromInput(
    typeof source?.token === 'string' ? source.token : '',
  );
  return token ? `Bearer ${token}` : '';
}

async function displayDevHeaders(auth: string, extra: Record<string, string> = {}) {
  const { version } = await readCurrentAppVersionInfo();
  return {
    ...(auth ? { Authorization: auth } : {}),
    'X-Client-Source': `od-deploy-provider@${version}`,
    'X-Actor-Type': 'human',
    'X-Actor-Name': 'open-design',
    ...extra,
  };
}

function displayDevApiUrl(config: DisplayDevConfig): string {
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.OD_DISPLAYDEV_ALLOW_TEST_API_URL === '1'
  ) {
    return validateDisplayDevApiUrl(config?.apiUrl);
  }
  return DISPLAYDEV_API;
}

function displayDevIdempotencyKey(input: {
  auth: string;
  data: Buffer;
  entry: DisplayDevDeployFile;
  projectId: string;
  priorAnonymousShortId?: string;
  selection: DisplayDevDeploySelection;
  defaults?: DisplayDevConfigHints;
}): string {
  const digest = createHash('sha256')
    .update(input.projectId)
    .update('\0')
    .update(input.entry.sourcePath || input.entry.file || 'index.html')
    .update('\0')
    .update(input.auth ? 'authenticated' : 'anonymous')
    .update('\0')
    .update(input.priorAnonymousShortId || 'first-publish')
    .update('\0')
    .update(
      JSON.stringify({
        selection: input.selection,
        defaults: input.defaults ?? {},
      }),
    )
    .update('\0')
    .update(input.data)
    .digest('hex');
  return `open-design-${digest}`;
}

function invalidDisplayDevResponse(
  message: string,
  details: JsonObject,
): DeployError {
  return new DeployError(message, 502, details, 'UPSTREAM_UNAVAILABLE');
}

function decodeAuthenticatedDisplayDevResult(
  input: JsonObject,
  expectedShortId?: string,
): { shortId: string; url: string; version: number } {
  const shortId = displayDevRequiredString(input.shortId, 'artifact id', input);
  if (expectedShortId && shortId !== expectedShortId) {
    throw invalidDisplayDevResponse(
      'display.dev returned a different artifact id.',
      input,
    );
  }
  displayDevRequiredString(input.name, 'artifact name', input);
  return {
    shortId,
    url: displayDevHttpUrlFromInput(input.url, 'deployment URL', input),
    version: displayDevPositiveIntegerFromInput(
      input.version,
      'version',
      input,
    ),
  };
}

function decodeAnonymousDisplayDevResult(input: JsonObject, config: DisplayDevConfig): {
  shortId: string;
  url: string;
  claimUrl: string;
  expiresAt: string;
} {
  const claimUrl = displayDevHttpUrlFromInput(input.claimUrl, 'claim URL', input);
  const claim = new URL(claimUrl);
  if (
    new URL(displayDevApiUrl(config)).origin === DISPLAYDEV_API &&
    (claim.origin !== 'https://app.display.dev' || claim.username || claim.password)
  ) {
    throw invalidDisplayDevResponse('display.dev returned a claim URL outside the trusted app origin.', input);
  }
  return {
    shortId: displayDevRequiredString(input.shortId, 'artifact id', input),
    url: displayDevHttpUrlFromInput(input.previewUrl, 'deployment URL', input),
    claimUrl,
    expiresAt: displayDevTimestampFromInput(
      input.expiresAt,
      'expiresAt',
      input,
    ),
  };
}

function displayDevRequiredString(
  input: unknown,
  field: string,
  details: JsonObject,
): string {
  if (typeof input !== 'string' || !input.trim()) {
    throw invalidDisplayDevResponse(
      `display.dev returned an invalid ${field}.`,
      details,
    );
  }
  return input.trim();
}

function assertDisplayDevArtifactIdentity(
  input: JsonObject,
  expectedShortId: string,
): void {
  const shortId = displayDevRequiredString(input.shortId, 'artifact id', input);
  if (shortId !== expectedShortId) {
    throw invalidDisplayDevResponse(
      'display.dev returned a different artifact id.',
      input,
    );
  }
}

function displayDevHttpUrlFromInput(
  input: unknown,
  field: string,
  details: JsonObject,
): string {
  const raw = displayDevRequiredString(input, field, details);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalidDisplayDevResponse(
      `display.dev returned an invalid ${field}.`,
      details,
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw invalidDisplayDevResponse(
      `display.dev returned an invalid ${field}.`,
      details,
    );
  }
  return url.toString();
}

function displayDevPositiveIntegerFromInput(
  input: unknown,
  field: string,
  details: JsonObject,
): number {
  if (!Number.isInteger(input) || (input as number) < 1) {
    throw invalidDisplayDevResponse(
      `display.dev returned an invalid ${field}.`,
      details,
    );
  }
  return input as number;
}

function displayDevTimestampFromInput(
  input: unknown,
  field: string,
  details: JsonObject,
): string {
  if (
    typeof input !== 'string' ||
    !input.trim() ||
    !Number.isFinite(Date.parse(input))
  ) {
    throw invalidDisplayDevResponse(
      `display.dev returned an invalid ${field}.`,
      details,
    );
  }
  return input;
}

async function fetchDisplayDevCurrentArtifact(
  apiUrl: string,
  auth: string,
  shortId: string,
  { allowMissing }: { allowMissing: boolean },
): Promise<DisplayDevCurrentArtifact | null> {
  const { resp, json } = await displayDevFetchJson(
    `${apiUrl}/v1/artifacts/${encodeURIComponent(shortId)}`,
    {
      method: 'GET',
      headers: await displayDevHeaders(auth),
    },
    { allowStatusesWithoutJson: [404] },
  );
  if (resp.status === 404) {
    if (allowMissing) return null;
    throw new DeployError(
      'display.dev artifact was not found or is not accessible with this API key.',
      502,
      { upstreamStatus: 404 },
      'UPSTREAM_UNAVAILABLE',
    );
  }
  if (!resp.ok) throw displayDevError(json, resp.status);
  assertDisplayDevArtifactIdentity(json, shortId);

  const version = Number.isInteger(json.currentVersion)
    ? json.currentVersion
    : Number.isInteger(json.version)
      ? json.version
      : displayDevVersionFromEtag(resp.headers.get('etag'));
  if (typeof version !== 'number' || version < 1) {
    throw new DeployError(
      'display.dev did not return the current artifact version.',
      502,
      json,
      'UPSTREAM_UNAVAILABLE',
    );
  }
  return {
    version,
  };
}

function displayDevVersionFromEtag(etag: string | null): number | undefined {
  const match = etag?.match(/^"v([1-9]\d*)"$/u);
  return match ? Number(match[1]) : undefined;
}

async function displayDevFetchJson(
  input: string | URL | Request,
  init?: RequestInit,
  options: { allowStatusesWithoutJson?: number[] } = {},
): Promise<{ resp: Response; json: JsonObject }> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(
    () => timeoutController.abort(),
    DISPLAYDEV_FETCH_TIMEOUT_MS,
  );
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;
  try {
    const resp = await fetch(input, { ...init, redirect: 'manual', signal });
    if (resp.status >= 300 && resp.status < 400) {
      throw new DeployError(
        'display.dev returned an unexpected redirect.',
        502,
        { upstreamStatus: resp.status },
        'UPSTREAM_UNAVAILABLE',
      );
    }
    if (options.allowStatusesWithoutJson?.includes(resp.status)) {
      return { resp, json: {} };
    }
    return { resp, json: await readDisplayDevJson(resp) };
  } catch (err) {
    if (err instanceof DeployError) throw err;
    throw new DeployError(
      'display.dev is unreachable.',
      502,
      { reason: err instanceof Error ? err.message : String(err) },
      'UPSTREAM_UNAVAILABLE',
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function readDisplayDevJson(resp: Response): Promise<JsonObject> {
  try {
    const value = (await resp.json()) as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new DeployError(
        'display.dev returned an invalid JSON response.',
        502,
        { upstreamStatus: resp.status || null },
        'UPSTREAM_UNAVAILABLE',
      );
    }
    return value as JsonObject;
  } catch (err) {
    if (err instanceof DeployError) throw err;
    const status = resp.ok ? 502 : displayDevRouteStatusForStatus(resp.status);
    const code = resp.ok
      ? 'UPSTREAM_UNAVAILABLE'
      : displayDevApiErrorCodeForStatus(resp.status);
    throw new DeployError(
      'display.dev returned a non-JSON response.',
      status,
      { upstreamStatus: resp.status || null },
      code,
    );
  }
}

function displayDevError(json: JsonObject, status: number): DeployError {
  const message =
    json?.message ||
    json?.error?.message ||
    (typeof json?.error === 'string' ? json.error : '') ||
    `display.dev publish failed (${status}).`;
  return new DeployError(
    message,
    displayDevRouteStatusForStatus(status),
    json,
    displayDevApiErrorCodeForStatus(status),
  );
}

function displayDevApiErrorCodeForStatus(status: number): string {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 409 || status === 412 || status === 428) return 'CONFLICT';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 422) return 'VALIDATION_FAILED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 404 || status >= 500) return 'UPSTREAM_UNAVAILABLE';
  return 'BAD_REQUEST';
}

function displayDevRouteStatusForStatus(status: number): number {
  return status === 404 ? 502 : status;
}

function asRecord(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

import type { Express, Request, Response } from 'express';
import type {
  TestRuntimeAcceptanceRequest,
  TestRuntimeContextRequest,
} from '@open-design/contracts/api/touchpointTestRuntime';
import { createHash, randomUUID } from 'node:crypto';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';

import {
  applyAgentLaunchEnv,
  getAgentDef,
  resolveAgentLaunch,
  spawnEnvForAgent,
} from '../agents.js';
import { readAnalyticsContext } from '../analytics.js';
import { agentCliEnvForAgent, type AppConfigPrefs, writeAppConfig } from '../app-config.js';
import {
  validateExternalPluginContext,
  validatePluginWorkflowId,
} from '../mcp-observability.js';
import {
  cancelVelaLogin,
  forgetVelaLogin,
  mergeVelaEnv,
  mirrorAmrEntryAnalytics,
  mirrorAmrOnboardingProfileAnalytics,
  parseAmrEntryAnalyticsPayload,
  parseAmrOnboardingProfileAnalyticsPayload,
  parseVelaAuthAttemptId,
  parseVelaAuthRequestId,
  applyVelaLiveAccount,
  clearAllVelaLiveAccounts,
  clearVelaAuthorizationState,
  markVelaAuthorizationExpired,
  parseVelaLoginAttribution,
  peekVelaLiveAccount,
  readVelaApiContext,
  readVelaCredentialRevision,
  readVelaControlApiContext,
  readVelaLoginStatus,
  resolveVelaConsoleOrigin,
  readVelaLoginAttemptSnapshot,
  setVelaLiveAccount,
  shouldRefreshVelaLiveAccount,
  velaLiveAccountCacheKey,
  spawnVelaLoginWithFallback,
  type VelaLiveAccount,
} from '../integrations/vela.js';
import {
  clearVelaWalletSnapshotCache,
  velaWalletSnapshotReader,
} from '../integrations/vela-wallet.js';
import { amrModelLoadingCache } from '../runtimes/amr-model-cache.js';
import { buildAmrModelCacheKey } from '../runtimes/amr-model-probe.js';
import {
  fetchVelaBillingSummary,
  fetchVelaPresetModels,
  fetchVelaRemoteModelsWithRetry,
} from '../runtimes/defs/amr.js';
import { classifyAmrAccountFailure } from '../integrations/vela-errors.js';
import {
  createTouchpointContentCache,
  MAX_CONTENT_BYTES,
  type HeldContentRef,
  type TouchpointContentCache,
  type TouchpointContentKey,
} from './touchpoint-content-cache.js';
import {
  touchpointStatusIsTransient,
  TOUCHPOINT_OFFLINE_REPLAY_HEADER,
  type TouchpointOfflineReplayReason,
} from '@open-design/contracts/api/touchpointOffline';

const AMR_API_PROXY_PREFIX = '/api/integrations/vela/api-proxy';
const VELA_MESSAGE_CENTER_PREFIX = '/api/integrations/vela/message-center';
const VELA_PUBLIC_MESSAGE_CENTER_PREFIX = '/api/integrations/vela/message-center-public';
const AMR_API_UPSTREAM_ORIGIN = 'https://amr-api.open-design.ai';
const PROXY_HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const VELA_WORKSPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function isRealtimeTestRuntimePayload(
  payload: unknown,
): payload is (TestRuntimeContextRequest | TestRuntimeAcceptanceRequest) & Record<string, unknown> {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    'scenario' in payload &&
    payload.scenario === 'realtime'
  );
}

function hasLegacySimulatedRuntimeInput(req: Request): boolean {
  const runtimePath = req.path.replace(/^\/api\/touchpoints\/test-runtime/u, '') || '/';
  if (req.method === 'POST' && runtimePath === '/context') {
    const payload = req.body;
    return !(
      isRealtimeTestRuntimePayload(payload) &&
      typeof payload.deploymentId === 'string' &&
      Object.keys(payload).length === 2
    );
  }
  if (req.method === 'POST' && /\/acceptances$/u.test(runtimePath)) {
    return !isRealtimeTestRuntimePayload(req.body);
  }
  const scenario = req.query.scenario;
  return 'simulatedAt' in req.query || (scenario !== undefined && scenario !== 'realtime');
}

/**
 * Upper bound, in ms, on how long a cold-cache `/status` read waits for the
 * live billing fetch before answering without `account`. `vela billing
 * summary` is a real subprocess spawn (up to the 10s exec timeout in
 * fetchVelaBillingSummary) and every logout clears the live-account cache
 * (see `clearAllVelaLiveAccounts`), so "sign out then sign back in" always
 * lands here cold. Without a bound, a slow or hung billing probe delays the
 * whole login-status response — the very check the avatar/menu/settings
 * surfaces need FIRST — by however long the subprocess takes. Kept short
 * (well under the exec timeout) so /status stays fast even when billing is
 * slow; the single-flight fetch is NOT canceled when the wait lapses, so it
 * keeps running and populates the cache (see `setVelaLiveAccount`) for the
 * next read. Every consumer already re-reads /status on its own (mount,
 * window focus/visibilitychange, or the `od:amr-login-status-change` event
 * dispatched right after sign-in resolves), so the plan/balance simply
 * arrives on that next read instead of holding this one hostage.
 */
const VELA_STATUS_LIVE_ACCOUNT_WAIT_MS = 1_200;

/** Sentinel returned by {@link raceVelaLiveAccountFetch} when the wait lapses. */
const VELA_LIVE_ACCOUNT_PENDING = Symbol('vela-live-account-pending');

/**
 * Race an in-flight live-account fetch against a short timeout. Resolves with
 * the fetched account (or null on failure — the fetch itself never rejects,
 * see {@link fetchVelaLiveAccountSingleFlight}'s `.catch`) when it lands
 * before `timeoutMs`; otherwise resolves with the pending sentinel WITHOUT
 * touching `pending` — the fetch keeps running and still populates the
 * live-account cache when it eventually settles.
 */
function raceVelaLiveAccountFetch(
  pending: Promise<VelaLiveAccount | null>,
  timeoutMs: number,
): Promise<VelaLiveAccount | null | typeof VELA_LIVE_ACCOUNT_PENDING> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(VELA_LIVE_ACCOUNT_PENDING);
    }, timeoutMs);
    pending.then(
      (account) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(account);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

type ReadAppConfig = (dataDir: string) => Promise<AppConfigPrefs>;
type PublicBaseUrlResolver = (req: Request) => string;

export interface RegisterVelaRoutesDeps {
  paths: {
    RUNTIME_DATA_DIR: string;
  };
  appConfig: {
    readAppConfig: ReadAppConfig;
  };
  http: {
    getPublicBaseUrl?: PublicBaseUrlResolver;
  };
  env?: NodeJS.ProcessEnv;
  /** Reconcile account-scoped caches/streams after credential observation. */
  onCredentialStateObserved?: () => void;
}

interface AmrModelProbe {
  launchPath: string;
  env: NodeJS.ProcessEnv;
  configuredEnv: Record<string, string>;
  cacheKey: string;
}

function velaApiProxyBaseUrl(req: Request, getPublicBaseUrl: PublicBaseUrlResolver): string {
  return `${getPublicBaseUrl(req)}${AMR_API_PROXY_PREFIX}`;
}

function pluginLoginCorrelationEnv(input: {
  body: unknown;
  analyticsContext: ReturnType<typeof readAnalyticsContext>;
  metricsEnabled: boolean;
}): Record<string, string> {
  const { analyticsContext } = input;
  if (
    !input.metricsEnabled
    || !analyticsContext
    || analyticsContext.clientType !== 'external_mcp'
    || analyticsContext.entrySurface !== 'external_mcp'
  ) {
    return {};
  }
  const body =
    input.body && typeof input.body === 'object' && !Array.isArray(input.body)
      ? input.body as Record<string, unknown>
      : {};
  try {
    const context = validateExternalPluginContext({
      id: analyticsContext.externalPluginId,
      version: analyticsContext.externalPluginVersion,
      distributionMechanism: analyticsContext.distributionMechanism,
      publisherClass: analyticsContext.publisherClass,
    });
    const pluginWorkflowId = validatePluginWorkflowId(body.pluginWorkflowId);
    return {
      OD_INSTALLATION_ID: analyticsContext.deviceId,
      OPEN_DESIGN_PLUGIN_WORKFLOW_ID: pluginWorkflowId,
      OPEN_DESIGN_EXTERNAL_PLUGIN_ID: context.id,
      OPEN_DESIGN_EXTERNAL_PLUGIN_VERSION: context.version,
      OPEN_DESIGN_DISTRIBUTION_MECHANISM: context.distributionMechanism,
      OPEN_DESIGN_PUBLISHER_CLASS: context.publisherClass,
    };
  } catch {
    // Login must remain functional when analytics metadata is absent or
    // malformed. Invalid self-reported attribution is dropped rather than
    // being trusted or turned into an authentication dependency.
    return {};
  }
}

function velaProxyRequestBody(req: Request): Buffer | null {
  if (req.method === 'GET' || req.method === 'HEAD') return null;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (req.body == null) return null;
  return Buffer.from(JSON.stringify(req.body));
}

function shouldStreamVelaProxyRequest(req: Request, body: Buffer | null): boolean {
  return req.method !== 'GET' && req.method !== 'HEAD' && body == null;
}

function connectionHeaderTokens(value: string | string[] | undefined): Set<string> {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return new Set(
    values
      .flatMap((entry) => entry.split(','))
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isProxyHopByHopHeader(name: string, connectionTokens: Set<string>): boolean {
  const lower = name.toLowerCase();
  return PROXY_HOP_BY_HOP_HEADERS.has(lower) || connectionTokens.has(lower);
}

/**
 * Pipe one leg of the AMR proxy with an explicit source-error guard.
 *
 * `.pipe()` does NOT forward a source `'error'` to the destination, and a
 * stream that emits `'error'` with no listener throws — crashing the privileged
 * daemon. Both legs of this proxy have real-world error paths: the upstream
 * response body can `ECONNRESET` mid-stream (a network drop, routine), and the
 * inbound request body errors when a client aborts an upload. Routing the
 * source error to `onSourceError` (which tears the proxy down) instead of
 * leaving it unhandled is the invariant that keeps the daemon alive. Exported
 * for test.
 */
export function pipeProxyStreamWithGuard(
  source: NodeJS.ReadableStream,
  dest: NodeJS.WritableStream,
  onSourceError: (err: Error) => void,
): void {
  source.on('error', onSourceError);
  source.pipe(dest);
}

function proxyAmrApiRequest(req: Request, res: Response): void {
  const suffix = req.originalUrl.slice(AMR_API_PROXY_PREFIX.length);
  if (!suffix.startsWith('/api/v1/')) {
    res.status(404).json({ error: 'unknown_amr_api_proxy_path' });
    return;
  }
  const target = new URL(suffix, AMR_API_UPSTREAM_ORIGIN);
  if (!target.pathname.startsWith('/api/v1/')) {
    res.status(404).json({ error: 'unknown_amr_api_proxy_path' });
    return;
  }
  const workspaceId = req.headers['x-vela-workspace-id'];
  if (
    workspaceId !== undefined
    && (Array.isArray(workspaceId) || !VELA_WORKSPACE_ID_PATTERN.test(workspaceId))
  ) {
    res.status(400).json({ error: 'invalid_workspace_id' });
    return;
  }
  const requestConnectionTokens = connectionHeaderTokens(req.headers.connection);
  if (workspaceId !== undefined && requestConnectionTokens.has('x-vela-workspace-id')) {
    res.status(400).json({ error: 'invalid_workspace_id' });
    return;
  }
  const body = velaProxyRequestBody(req);
  const streamBody = shouldStreamVelaProxyRequest(req, body);
  const headers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (lower === 'host' || isProxyHopByHopHeader(lower, requestConnectionTokens)) {
      continue;
    }
    if (lower === 'content-length' && body) continue;
    if (value !== undefined) headers[key] = value;
  }
  if (body) headers['content-length'] = String(body.length);

  const upstream = https.request(
    target,
    {
      method: req.method,
      headers,
      lookup: (hostname, options, callback) => {
        dns.lookup(hostname, { ...options, family: 4, all: false }, callback);
      },
    },
    (upstreamRes) => {
      res.status(upstreamRes.statusCode ?? 502);
      const responseConnectionTokens = connectionHeaderTokens(upstreamRes.headers.connection);
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (
          value !== undefined
          && !isProxyHopByHopHeader(key, responseConnectionTokens)
        ) {
          res.setHeader(key, value);
        }
      }
      pipeProxyStreamWithGuard(upstreamRes, res, (err) => {
        if (!res.headersSent) {
          res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
        } else {
          res.destroy();
        }
      });
    },
  );
  upstream.setTimeout(30_000, () => upstream.destroy(new Error('AMR API proxy timed out')));
  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    } else {
      res.end();
    }
  });
  const abortUpstream = () => {
    if (!res.writableEnded && !upstream.destroyed) upstream.destroy();
  };
  req.once('aborted', abortUpstream);
  res.once('close', abortUpstream);
  if (body) upstream.write(body);
  if (streamBody) {
    pipeProxyStreamWithGuard(req, upstream, () => upstream.destroy());
  } else {
    upstream.end();
  }
}

function isAllowedMessageCenterRequest(method: string, pathname: string): boolean {
  if (method === 'GET' && pathname === '/messages') return true;
  if (method !== 'POST') return false;
  return pathname === '/read-all' || /^\/messages\/[^/]+\/read$/.test(pathname);
}

function proxyVelaMessageCenterRequest(
  req: Request,
  res: Response,
  context: { apiUrl: string; controlKey?: string },
  proxyPrefix = VELA_MESSAGE_CENTER_PREFIX,
): void {
  const suffix = req.originalUrl.slice(proxyPrefix.length);
  const parsedSuffix = new URL(suffix, 'http://message-center.local');
  if (!isAllowedMessageCenterRequest(req.method, parsedSuffix.pathname)) {
    res.status(404).json({ error: 'unknown_message_center_path' });
    return;
  }
  const target = new URL(
    `/api/v1/message-center${parsedSuffix.pathname}${parsedSuffix.search}`,
    context.apiUrl,
  );
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    res.status(500).json({ error: 'invalid_vela_api_url' });
    return;
  }
  const body = velaProxyRequestBody(req);
  const headers: Record<string, string> = {
    accept: typeof req.headers.accept === 'string' ? req.headers.accept : 'application/json',
  };
  if (context.controlKey) headers.authorization = `Bearer ${context.controlKey}`;
  if (typeof req.headers['content-type'] === 'string') {
    headers['content-type'] = req.headers['content-type'];
  }
  if (body) headers['content-length'] = String(body.length);
  const transport = target.protocol === 'https:' ? https : http;
  const upstream = transport.request(
    target,
    { method: req.method, headers },
    (upstreamRes) => {
      res.status(upstreamRes.statusCode ?? 502);
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (value !== undefined) res.setHeader(key, value);
      }
      pipeProxyStreamWithGuard(upstreamRes, res, (err) => {
        if (!res.headersSent) {
          res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
        } else {
          res.end();
        }
      });
    },
  );
  upstream.setTimeout(30_000, () => upstream.destroy(new Error('Vela Message Center timed out')));
  upstream.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
    } else {
      res.end();
    }
  });
  if (body) upstream.write(body);
  upstream.end();
}

/**
 * The largest upstream body this proxy will hold in memory to assemble content.
 *
 * Assembly is the only reason this route reads a body instead of forwarding it,
 * and it can only ever produce a package the browser's own budget accepts
 * (`MAX_CONTENT_BYTES`, mirrored by the web host). A body that cannot fit that
 * budget is un-assemblable by construction, so holding it buys nothing and
 * costs the daemon its memory — and, through the synchronous decompressors
 * below, its event loop, which for a privileged local process means the whole
 * app stops. Past this ceiling the route degrades back to what it replaced: a
 * stream. Base64 inflates resource bytes by 4/3 and the decision carries
 * manifest and metadata around them, hence the headroom.
 */
const MAX_BUFFERED_DECISION_BYTES = 4 * MAX_CONTENT_BYTES;

/**
 * Decode an upstream body the daemon has to read rather than forward.
 *
 * Returns `null` for an encoding this build cannot decode, and for one whose
 * decoded size passes `maxOutputBytes`. Both mean the same thing to the caller
 * — "hand the original bytes back untouched" — because reading the body is an
 * optimization, never a precondition for answering the browser. Refusing on
 * size matters because compression ratios are unbounded: a 200KB reply can name
 * 200MB of output, and without a limit zlib allocates every byte of it before
 * anyone downstream is in a position to say no.
 */
function decodeProxyBody(
  body: Buffer,
  encoding: string | undefined,
  maxOutputBytes: number,
): Buffer | null {
  const label = (encoding ?? '').trim().toLowerCase();
  // zlib raises ERR_BUFFER_TOO_LARGE instead of expanding past this, so the
  // refusal costs nothing and the catch below turns it into the normal path.
  const limits = { maxOutputLength: maxOutputBytes };
  try {
    if (!label || label === 'identity') return body.byteLength <= maxOutputBytes ? body : null;
    if (label === 'gzip' || label === 'x-gzip') return zlib.gunzipSync(body, limits);
    if (label === 'deflate') return zlib.inflateSync(body, limits);
    if (label === 'br') return zlib.brotliDecompressSync(body, limits);
  } catch {
    return null;
  }
  return null;
}

/** The daemon's own content-assembly parameters, which no browser ever sends. */
const HELD_CONTENT_PARAMS = ['heldContentId', 'heldContentLocale'] as const;

/**
 * The (placementKey, locale) a production decision request is about, or `null`
 * when this request is not one the daemon may assemble content for.
 *
 * A caller that already carries either held-content parameter is passed through
 * untouched: the daemon never rewrites someone else's conditional request.
 */
function touchpointContentKeyForRequest(url: URL, scope: string): TouchpointContentKey | null {
  if (HELD_CONTENT_PARAMS.some((param) => url.searchParams.has(param))) return null;
  const placementKey = url.searchParams.get('placementKey');
  const locale = url.searchParams.get('locale');
  return placementKey && locale ? { scope, placementKey, locale } : null;
}

/**
 * Which (environment, account) a cached package belongs to (OPEND-3436).
 *
 * The account is named by a digest of the control key rather than by
 * `user.id`, and that is deliberate. The control key IS the credential this
 * environment issued to this account, so two accounts can never collide and a
 * signed-out daemon can never read a signed-in one's packages. `user.id` would
 * be the more natural identifier and is the wrong one here: it is populated on
 * some of the paths that build a control context and `null` on others, so a
 * single account would flip between two scopes depending on which read
 * answered — and a flip means a cache that is silently never hit.
 *
 * The cost is that rotating the key orphans that account's packages. That is
 * one refetch, on a path the user is already reauthenticating through, and it
 * fails in the safe direction.
 */
function touchpointCacheScope(context: {
  profile?: string;
  apiUrl: string;
  controlKey: string;
}): string {
  const account = createHash('sha256').update(context.controlKey).digest('hex');
  return `${context.profile ?? ''}\u0000${context.apiUrl}\u0000${account}`;
}

function proxyTouchpointRuntimeRequest(
  req: Request,
  res: Response,
  context: { profile?: string; apiUrl: string; controlKey?: string },
  runtime: 'test' | 'production',
  contentCache?: TouchpointContentCache,
): void {
  // Express retains the mounted path for these route patterns, so normalize
  // it before applying the strict suffix allowlist.
  const runtimePath =
    req.path.replace(new RegExp(`^/api/touchpoints/${runtime}-runtime`), '') || '/';
  // Production has one deliberately narrow read-only decision endpoint. Test
  // keeps its separately enumerated context/deployment routes; neither proxy
  // forwards a browser-supplied Vela credential or arbitrary path.
  let suffix: string | null = null;
  if (runtime === 'production') {
    if (req.method === 'GET' && runtimePath === '/') suffix = '/production';
    else if (req.method === 'POST' && runtimePath === '/events') suffix = '/events';
  } else if (
    req.method === 'POST' &&
    /^\/test-deployments\/[A-Za-z0-9_-]{1,128}\/acceptances$/u.test(runtimePath)
  ) {
    suffix = runtimePath;
  } else if (req.method === 'GET' && runtimePath === '/deployments') {
    suffix = '/test-deployments';
  } else if (req.method === 'GET' && runtimePath === '/') {
    suffix = '/test';
  } else if (req.method === 'POST' && runtimePath === '/context') {
    suffix = '/test-context';
  }
  if (!suffix || !context.controlKey) {
    res.status(context.controlKey ? 404 : 401).json({
      error: context.controlKey ? 'unknown_touchpoint_runtime_path' : 'vela_control_key_required',
    });
    return;
  }
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetPath = suffix.startsWith('/test-deployments/')
    ? `/api/v1/touchpoints${suffix}`
    : `/api/v1/touchpoints/runtime${suffix}`;
  const target = new URL(`${targetPath}${query}`, context.apiUrl);
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    res.status(500).json({ error: 'invalid_vela_api_url' });
    return;
  }
  const body = req.method === 'POST' ? velaProxyRequestBody(req) : null;
  // Content assembly applies to exactly one route: the read-only production
  // decision. Everything else keeps the verbatim streaming path.
  const contentKey =
    contentCache && runtime === 'production' && req.method === 'GET' && suffix === '/production'
      ? touchpointContentKeyForRequest(
          target,
          touchpointCacheScope({ ...context, controlKey: context.controlKey }),
        )
      : null;

  const controlKey = context.controlKey;
  /**
   * A caller that walked away takes its upstream request with it.
   *
   * The browser's own per-attempt budget is shorter than this proxy's, so an
   * abandoned attempt would otherwise stay alive here: still downloading, still
   * buffering, and still writing the assembly record that a later, LIVE request
   * is about to rebuild from. `res.headersSent` does not catch it, because an
   * attempt aborted before a single byte went out has sent no headers. Nobody
   * reads an orphan's response; its side effects are the whole problem, and
   * they stretch the window for crossing two campaigns from one round trip to
   * the caller's entire budget.
   *
   * One request is in flight at a time -- the assembly fallback replaces it
   * rather than adding to it -- so a single mutable reference covers both.
   */
  let currentUpstream: http.ClientRequest | null = null;
  /**
   * Set when the caller walked away, so the failure handlers below can tell an
   * upstream that died from an upstream this proxy killed. Without it, an
   * aborted attempt reaches the offline path and spends a disk read rebuilding
   * a megabyte-scale package for a response nobody will ever read.
   */
  let callerGone = false;
  const abortUpstream = (): void => {
    callerGone = true;
    const pending = currentUpstream;
    if (pending && !res.writableEnded && !pending.destroyed) pending.destroy();
  };
  req.once('aborted', abortUpstream);
  res.once('close', abortUpstream);
  /**
   * Answer from the daemon's own store because the runtime could not be
   * reached (OPEND-3436). Reports whether it did, so every caller can fall
   * through to exactly the behaviour it had before this feature existed.
   *
   * The store decides whether there is anything to say: it holds the server's
   * own schedule, retires a package whose window has closed, and refuses one
   * that has not opened. This function only carries the answer.
   */
  const answerFromCache = (reason: TouchpointOfflineReplayReason): boolean => {
    if (!contentKey || !contentCache || callerGone || res.headersSent || res.writableEnded)
      return false;
    const replayed = contentCache.replayOffline(contentKey, reason);
    if (!replayed) return false;
    res.status(200);
    res.setHeader('content-type', 'application/json');
    res.setHeader(TOUCHPOINT_OFFLINE_REPLAY_HEADER, '1');
    res.end(Buffer.from(JSON.stringify(replayed), 'utf8'));
    return true;
  };
  /**
   * `fallback` is the one retry the assembly path is allowed: a trimmed reply
   * the daemon cannot rebuild is re-asked as today's full request. Clearing it
   * on that retry is what keeps the guarantee bounded — the daemon can never
   * loop between a server that trims and a cache that cannot assemble.
   */
  const send = (held: HeldContentRef | null, fallback: boolean): void => {
    const attempt = new URL(target);
    if (held) {
      attempt.searchParams.set('heldContentId', held.heldContentId);
      attempt.searchParams.set('heldContentLocale', held.heldContentLocale);
    }
    const headers: Record<string, string> = {
      accept: 'application/json',
      authorization: `Bearer ${controlKey}`,
    };
    // Touchpoint decisions carry base64 content and run to megabytes, and this
    // proxy pipes the upstream body through verbatim. Building the request
    // headers from scratch dropped the caller's `accept-encoding`, so every
    // refresh pulled the payload uncompressed — measured at 383KB against 214KB
    // for the same decision. Forward the caller's preference and hand its
    // `content-encoding` back, so the body stays labelled the way it is framed.
    const acceptEncoding = req.headers['accept-encoding'];
    if (typeof acceptEncoding === 'string' && acceptEncoding)
      headers['accept-encoding'] = acceptEncoding;
    if (body) {
      headers['content-type'] =
        typeof req.headers['content-type'] === 'string'
          ? req.headers['content-type']
          : 'application/json';
      headers['content-length'] = String(body.length);
    }
    const transport = attempt.protocol === 'https:' ? https : http;
    const upstream = transport.request(attempt, { method: req.method, headers }, (upstreamRes) => {
      const passThrough = () => {
        res.status(upstreamRes.statusCode ?? 502);
        res.setHeader('content-type', upstreamRes.headers['content-type'] ?? 'application/json');
        // Without this the client would decode gzip bytes as JSON. It is set only
        // when upstream actually encoded, so an unencoded reply is unaffected.
        const contentEncoding = upstreamRes.headers['content-encoding'];
        if (typeof contentEncoding === 'string' && contentEncoding)
          res.setHeader('content-encoding', contentEncoding);
        pipeProxyStreamWithGuard(upstreamRes, res, () => res.destroy());
      };
      if (!contentKey || !contentCache) {
        passThrough();
        return;
      }
      // Reading the body is what makes assembly possible, so this route buffers
      // instead of piping. Whatever the daemon cannot read or rebuild is handed
      // back exactly as upstream framed it.
      const chunks: Buffer[] = [];
      let size = 0;
      let failed = false;
      let streaming = false;
      let answered = false;
      const forward = (chunk: Buffer): void => {
        if (!chunk.byteLength) return;
        if (!res.write(chunk)) {
          upstreamRes.pause();
          res.once('drain', () => upstreamRes.resume());
        }
      };
      /**
       * Assembly gives up the moment the body stops being assemblable.
       *
       * From here the route is the pipe it was before content assembly existed:
       * what is already buffered goes out first, the rest is forwarded chunk by
       * chunk against the socket's own backpressure, and the daemon's memory
       * stays bounded by `MAX_BUFFERED_DECISION_BYTES`. Degrading rather than
       * refusing keeps this to a single WAN fetch, and the browser cannot tell
       * the difference: it gets the same bytes, framed the same way.
       */
      const degradeToStreaming = (): void => {
        streaming = true;
        res.status(upstreamRes.statusCode ?? 502);
        res.setHeader('content-type', upstreamRes.headers['content-type'] ?? 'application/json');
        const contentEncoding = upstreamRes.headers['content-encoding'];
        if (typeof contentEncoding === 'string' && contentEncoding)
          res.setHeader('content-encoding', contentEncoding);
        const buffered = Buffer.concat(chunks, size);
        chunks.length = 0;
        size = 0;
        forward(buffered);
      };
      /**
       * What a status licenses is not a function of how big its body is.
       *
       * Degrading to streaming sends headers, and sending headers retires the
       * status block in the `end` handler below. So a 410 that outgrew the
       * buffer would never reclaim — the browser clears the screen while the
       * stored package survives its own withdrawal, ready to replay the next
       * time the daemon cannot reach the runtime — and an oversized 5xx would
       * be forwarded instead of answered from cache, which is precisely the
       * outage this route exists to survive.
       *
       * Neither decision needs the bytes. A body this size is by construction
       * one no revocation receipt can be read out of, and
       * `touchpointWithdrawalReclaims` already rules that an unreadable receipt
       * is the whole deployment being withdrawn.
       *
       * Returns whether the response has been answered from cache, in which
       * case the rest of the upstream body has no reader left.
       */
      const settleOversizedStatus = (): boolean => {
        const status = upstreamRes.statusCode ?? 502;
        if (status === 410 && contentKey && contentCache) {
          contentCache.forgetWithdrawn(contentKey, null);
          // The 410 itself still goes to the browser, exactly as upstream
          // framed it. Deciding what to do with it is not this proxy's job.
          return false;
        }
        return touchpointStatusIsTransient(status) && answerFromCache('upstream_unavailable');
      };
      upstreamRes.on('error', () => {
        if (answered) return;
        failed = true;
        if (res.headersSent) res.end();
        else if (!answerFromCache('upstream_unreachable'))
          res.status(502).json({ error: 'touchpoint_runtime_unavailable' });
      });
      upstreamRes.on('data', (chunk: Buffer) => {
        if (answered) return;
        if (streaming) {
          forward(chunk);
          return;
        }
        chunks.push(chunk);
        size += chunk.length;
        if (size <= MAX_BUFFERED_DECISION_BYTES) return;
        if (settleOversizedStatus()) {
          // Answered from cache. Keeping the rest would put the daemon's memory
          // back above the ceiling for a body nobody will read.
          answered = true;
          chunks.length = 0;
          size = 0;
          upstreamRes.destroy();
          return;
        }
        degradeToStreaming();
      });
      upstreamRes.on('end', () => {
        if (answered) return;
        if (streaming) {
          res.end();
          return;
        }
        if (failed || res.headersSent) return;
        const raw = Buffer.concat(chunks, size);
        chunks.length = 0;
        const echo = () => {
          res.status(upstreamRes.statusCode ?? 502);
          res.setHeader('content-type', upstreamRes.headers['content-type'] ?? 'application/json');
          const contentEncoding = upstreamRes.headers['content-encoding'];
          if (typeof contentEncoding === 'string' && contentEncoding)
            res.setHeader('content-encoding', contentEncoding);
          res.end(raw);
        };
        const decoded = decodeProxyBody(
          raw,
          upstreamRes.headers['content-encoding'] as string | undefined,
          MAX_BUFFERED_DECISION_BYTES,
        );
        const status = upstreamRes.statusCode ?? 502;
        if (status !== 200) {
          // A withdrawal is the server exercising its authority, and the one
          // answer that licenses destroying a stored package. Which 410s do so
          // is `touchpointWithdrawalReclaims`, stated once in the contract so
          // the daemon and the browser cannot disagree about what a 410 means.
          // The 410 itself is forwarded either way — deciding what the browser
          // does with it is not this proxy's job.
          if (status === 410 && contentKey && contentCache) {
            let body: unknown = null;
            try {
              if (decoded) body = JSON.parse(decoded.toString('utf8'));
            } catch {
              body = null;
            }
            contentCache.forgetWithdrawn(contentKey, body);
          }
          // 5xx is "temporarily unavailable", which is a transport condition
          // wearing a status code. Everything else — 401, 403, 404, 410 — is an
          // answer, and a cache may never overrule one.
          else if (touchpointStatusIsTransient(status) && answerFromCache('upstream_unavailable'))
            return;
        }
        if (!decoded || status !== 200) {
          echo();
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(decoded.toString('utf8'));
        } catch {
          echo();
          return;
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          echo();
          return;
        }
        const decision = parsed as Record<string, unknown>;
        if (decision.contentOmitted !== true) {
          contentCache.remember(contentKey, decision);
          res.status(200);
          res.setHeader('content-type', upstreamRes.headers['content-type'] ?? 'application/json');
          res.end(decoded);
          return;
        }
        // `held` is the pair this attempt offered upstream. Upstream only trims
        // a reply the daemon asked it to trim, so on the trimmed path it is
        // non-null by construction; rebuilding without it would rebuild from
        // whatever the record says NOW, which a concurrent full response for
        // the same placement may already have replaced.
        const full = held ? contentCache.reassemble(contentKey, held, decision) : null;
        if (full) {
          res.status(200);
          res.setHeader('content-type', 'application/json');
          res.end(Buffer.from(JSON.stringify(full), 'utf8'));
          return;
        }
        // The one thing that must never happen is a campaign that does not show
        // because a cache went bad. Ask again the way today's daemon asks, with
        // no held content, and answer from that.
        if (fallback) send(null, false);
        else echo();
      });
    });
    currentUpstream = upstream;
    upstream.setTimeout(30_000, () =>
      upstream.destroy(new Error('Touchpoint runtime request timed out')),
    );
    upstream.on('error', () => {
      if (res.headersSent) res.end();
      // DNS failure, refused connection, reset socket, or this proxy's own
      // timeout: the runtime was not reached, so the last thing it said is the
      // best thing the daemon has.
      else if (!answerFromCache('upstream_unreachable'))
        res.status(502).json({ error: 'touchpoint_runtime_unavailable' });
    });
    if (body) upstream.write(body);
    upstream.end();
  };

  const held = contentKey && contentCache ? contentCache.held(contentKey) : null;
  send(held, held !== null);
}

export function registerVelaRoutes(app: Express, deps: RegisterVelaRoutesDeps): void {
  const env = deps.env ?? process.env;
  const onCredentialStateObserved =
    deps.onCredentialStateObserved ?? (() => undefined);
  const { RUNTIME_DATA_DIR } = deps.paths;
  // Daemon-owned data, so it hangs off the resolved runtime data root like every
  // other daemon path (AGENTS.md "Daemon data directory contract"). Two
  // namespaces therefore get two roots and cannot see each other's content.
  const touchpointContentCache = createTouchpointContentCache(RUNTIME_DATA_DIR);
  const { readAppConfig } = deps.appConfig;
  const getPublicBaseUrl = deps.http.getPublicBaseUrl ?? ((req: Request) => {
    const proto = req.protocol || 'http';
    const host = req.get('host');
    return host ? `${proto}://${host}` : 'http://localhost:7456';
  });

  function resolveAmrModelProbeForEnv(configuredEnv: Record<string, string>): AmrModelProbe {
    const def = getAgentDef('amr');
    if (!def) throw new Error('AMR runtime definition is missing');
    const agentLaunch = resolveAgentLaunch(def, configuredEnv);
    const launchPath = agentLaunch.launchPath ?? agentLaunch.selectedPath;
    if (!launchPath) throw new Error('AMR vela binary could not be resolved');
    const spawnEnv = applyAgentLaunchEnv(
      spawnEnvForAgent(
        def.id,
        {
          ...env,
          ...(def.env || {}),
        },
        configuredEnv,
        undefined,
      ),
      agentLaunch,
    );
    const credentialRevision = readVelaCredentialRevision(env, configuredEnv);
    const cacheKey = buildAmrModelCacheKey({
      launchPath,
      env: spawnEnv,
      credentialRevision,
    });
    return { launchPath, env: spawnEnv, configuredEnv, cacheKey };
  }

  async function resolveAmrModelProbe(): Promise<AmrModelProbe> {
    const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
    const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
    return resolveAmrModelProbeForEnv(configuredEnv);
  }

  // Single-flight the live billing fetch per credential revision. Treating
  // `peekVelaLiveAccount(key) === null` as the cold signal (rather than the
  // refresh throttle) means a concurrent second /status that arrives during the
  // first fetch awaits the SAME promise instead of slipping past the throttle
  // and returning config-only — which the read-once surfaces can't recover from.
  const inFlightVelaAccountFetches = new Map<
    string,
    Promise<VelaLiveAccount | null>
  >();
  const inFlightVelaAccountInvalidations = new Set<string>();
  function fetchVelaLiveAccountSingleFlight(
    accountCacheKey: string,
    probe: AmrModelProbe,
    options: { invalidateModelsOnPlanChange?: boolean } = {},
  ): Promise<VelaLiveAccount | null> {
    if (options.invalidateModelsOnPlanChange === true) {
      inFlightVelaAccountInvalidations.add(accountCacheKey);
    }
    const existing = inFlightVelaAccountFetches.get(accountCacheKey);
    if (existing) return existing;
    const pending = (async () => {
      const previousAccount = peekVelaLiveAccount(accountCacheKey);
      amrModelLoadingCache.warm(probe.cacheKey, () =>
        fetchVelaRemoteModelsWithRetry(probe.launchPath, probe.env),
      );
      const account = await fetchVelaBillingSummary(probe.launchPath, probe.env);
      if (
        inFlightVelaAccountInvalidations.has(accountCacheKey) &&
        (!previousAccount || previousAccount.plan !== account.plan)
      ) {
        amrModelLoadingCache.invalidate(probe.cacheKey);
      }
      setVelaLiveAccount(accountCacheKey, account);
      return account;
    })()
      .catch((err) => {
        // Keep the refresh throttle as a short negative cache/backoff. /status
        // is read by focus/menu/login surfaces, so a persistent optional
        // billing failure must not make every poll await the same slow probe.
        console.warn('[amr] live account fetch failed', err);
        if (classifyAmrAccountFailure(err instanceof Error ? err.message : String(err))?.code === 'AMR_AUTH_REQUIRED') {
          markVelaAuthorizationExpired(env, probe.configuredEnv);
        }
        return null;
      })
      .finally(() => {
        inFlightVelaAccountFetches.delete(accountCacheKey);
        inFlightVelaAccountInvalidations.delete(accountCacheKey);
      });
    inFlightVelaAccountFetches.set(accountCacheKey, pending);
    return pending;
  }

  app.get('/api/amr/models', async (_req, res) => {
    try {
      const probe = await resolveAmrModelProbe();
      const response = await amrModelLoadingCache.get(probe.cacheKey, {
        fetchPreset: () => fetchVelaPresetModels(probe.launchPath, probe.env),
        fetchRemote: () => fetchVelaRemoteModelsWithRetry(probe.launchPath, probe.env),
      });
      res.json(response);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/integrations/vela/status', async (_req, res) => {
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
      onCredentialStateObserved();
      const amrDef = getAgentDef('amr');
      const amrLaunch = amrDef ? resolveAgentLaunch(amrDef, configuredEnv) : null;
      if (!(amrLaunch?.launchPath ?? amrLaunch?.selectedPath)) {
        res.status(503).json({ error: 'amr-runtime-unavailable' });
        return;
      }
      const refresh = _req.query.refresh === '1' || _req.query.refresh === 'true';
      const status = readVelaLoginStatus(mergeVelaEnv(env, configuredEnv));
      // Reported on every response, signed in or not: the client builds console
      // links (wallet, plans, upgrade) from it and must not have to carry a
      // hostname table for internal AMR environments. The resolver also sees
      // the settings-selected profile, so this cannot retain the package's
      // console origin after an environment switch.
      const consoleOrigin = resolveVelaConsoleOrigin(env, configuredEnv);
      if (consoleOrigin) status.consoleOrigin = consoleOrigin;
      if (status.loggedIn && status.sessionState === 'authenticated') {
        // Key the live-account cache by the full credential revision (not just
        // profile) so a logout / account switch can never surface the previous
        // account's plan or balance. Merge the cached projection synchronously
        // (works for env-backed sessions where status.user is null too); the
        // background refresh below updates the cache for the next poll.
        const accountCacheKey = velaLiveAccountCacheKey(
          readVelaCredentialRevision(env, configuredEnv),
        );
        const probe = resolveAmrModelProbeForEnv(configuredEnv);
        const cachedAccount = peekVelaLiveAccount(accountCacheKey);
        if (refresh) {
          const liveAccount = await fetchVelaLiveAccountSingleFlight(accountCacheKey, probe, {
            invalidateModelsOnPlanChange: true,
          });
          applyVelaLiveAccount(status, liveAccount);
        } else if (!cachedAccount) {
          // Cold cache (or a fetch already in flight): wait up to
          // VELA_STATUS_LIVE_ACCOUNT_WAIT_MS for the single-flight billing
          // fetch so the first open still carries plan/balance in the common
          // case (billing typically answers in well under a second). On
          // failure the helper resolves null and the refresh throttle
          // becomes a short negative cache/backoff, so repeated menu/focus
          // polls degrade to config-only instead of each awaiting the same
          // slow probe. If billing is genuinely slow (or hung), the wait
          // lapses and this response goes out with `account` absent rather
          // than blocking the login-status check itself — the fetch is left
          // running and populates the cache for the next /status read (see
          // VELA_STATUS_LIVE_ACCOUNT_WAIT_MS's docblock for why that is
          // always reached soon after).
          if (
            inFlightVelaAccountFetches.has(accountCacheKey) ||
            shouldRefreshVelaLiveAccount(accountCacheKey)
          ) {
            const pending = fetchVelaLiveAccountSingleFlight(accountCacheKey, probe);
            const liveAccount = await raceVelaLiveAccountFetch(
              pending,
              VELA_STATUS_LIVE_ACCOUNT_WAIT_MS,
            );
            if (liveAccount !== VELA_LIVE_ACCOUNT_PENDING) {
              applyVelaLiveAccount(status, liveAccount);
            }
          }
        } else {
          // Warm cache: serve it immediately; refresh in the background for the
          // next poll once the TTL has lapsed.
          applyVelaLiveAccount(status, cachedAccount);
          if (shouldRefreshVelaLiveAccount(accountCacheKey)) {
            void fetchVelaLiveAccountSingleFlight(accountCacheKey, probe, {
              invalidateModelsOnPlanChange: true,
            }).catch(() => {});
          }
        }
      }
      const authoritativeStatus = readVelaLoginStatus(env, configuredEnv);
      if (authoritativeStatus.sessionState === 'reauth_required') {
        Object.assign(status, authoritativeStatus);
      }
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/integrations/vela/wallet', async (req, res) => {
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
      const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
      const snapshot = await velaWalletSnapshotReader.read({
        env,
        configuredEnv,
        refresh,
      });
      if (refresh) {
        try {
          const modelProbe = resolveAmrModelProbeForEnv(configuredEnv);
          amrModelLoadingCache.invalidate(modelProbe.cacheKey);
        } catch (err) {
          console.warn('[amr] model cache invalidation after wallet refresh failed', err);
        }
      }
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.all('/api/integrations/vela/api-proxy/*splat', proxyAmrApiRequest);

  // The helper is a strict method/path allowlist; register it for POST so the
  // authenticated Test context selection can reach Vela, while unknown paths
  // and methods remain default-deny.
  app.all(
    ['/api/touchpoints/production-runtime', '/api/touchpoints/production-runtime/*splat'],
    async (req, res) => {
      try {
        const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
        const context = readVelaControlApiContext(
          env,
          agentCliEnvForAgent(appConfig.agentCliEnv, 'amr'),
        );
        if (!context) {
          res.status(401).json({ error: 'vela_control_key_required' });
          return;
        }
        // Local end-to-end runs may keep their login/Test origin while
        // exercising a separately owned publish-side API. Never forward a
        // stored credential to an arbitrary remote origin through this knob.
        const localPublishOrigin = env.OPEN_DESIGN_CMS_PRODUCTION_API_URL?.trim();
        if (localPublishOrigin) {
          const target = new URL(localPublishOrigin);
          const login = new URL(context.apiUrl);
          const loopback = new Set(['127.0.0.1', '[::1]']);
          if (
            context.profile !== 'local' ||
            target.protocol !== 'http:' ||
            login.protocol !== 'http:' ||
            !loopback.has(target.hostname) ||
            !loopback.has(login.hostname) ||
            target.username ||
            target.password ||
            target.pathname !== '/' ||
            target.search ||
            target.hash
          ) {
            res.status(400).json({ error: 'invalid_local_cms_production_origin' });
            return;
          }
          proxyTouchpointRuntimeRequest(
            req,
            res,
            { ...context, apiUrl: target.origin },
            'production',
            touchpointContentCache,
          );
          return;
        }
        proxyTouchpointRuntimeRequest(req, res, context, 'production', touchpointContentCache);
      } catch {
        res.status(502).json({ error: 'touchpoint_runtime_unavailable' });
      }
    },
  );

  app.all(
    ['/api/touchpoints/test-runtime', '/api/touchpoints/test-runtime/*splat'],
    async (req, res) => {
      if (hasLegacySimulatedRuntimeInput(req)) {
        res.status(400).json({ error: 'realtime_test_runtime_required' });
        return;
      }
      try {
        const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
        const context = readVelaControlApiContext(
          env,
          agentCliEnvForAgent(appConfig.agentCliEnv, 'amr'),
        );
        if (!context) {
          res.status(401).json({ error: 'vela_control_key_required' });
          return;
        }
        proxyTouchpointRuntimeRequest(req, res, context, 'test');
      } catch {
        res.status(502).json({ error: 'touchpoint_runtime_unavailable' });
      }
    },
  );

  app.get('/api/integrations/vela/message-center-public/messages', async (req, res) => {
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
      const context = readVelaApiContext(env, configuredEnv);
      proxyVelaMessageCenterRequest(req, res, context, VELA_PUBLIC_MESSAGE_CENTER_PREFIX);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.all('/api/integrations/vela/message-center/*splat', async (req, res) => {
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
      const context = readVelaControlApiContext(env, configuredEnv);
      if (!context) {
        res.status(401).json({ error: 'vela_control_key_required' });
        return;
      }
      proxyVelaMessageCenterRequest(req, res, context);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/integrations/vela/login', async (req, res) => {
    // Resolve a request-owned correlation id before any config or spawn work.
    // A pre-spawn failure must never inherit the previous login's snapshot.
    const requestAuthAttemptId = parseVelaAuthAttemptId(req.body) ?? randomUUID();
    const requestAuthRequestId = parseVelaAuthRequestId(req.body);
    const bodyHasRequestId = Boolean(
      req.body
      && typeof req.body === 'object'
      && !Array.isArray(req.body)
      && Object.prototype.hasOwnProperty.call(req.body, 'authRequestId'),
    );
    if (bodyHasRequestId && !requestAuthRequestId) {
      res.status(400).json({ error: 'invalid_auth_request_id' });
      return;
    }
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
      const analyticsContext = readAnalyticsContext(req);
      const attribution = parseVelaLoginAttribution(req.body);
      const correlationEnv = pluginLoginCorrelationEnv({
        body: req.body,
        analyticsContext,
        metricsEnabled: appConfig.telemetry?.metrics === true,
      });
      let loginAttribution = attribution;
      if (attribution) {
        if (analyticsContext && appConfig.telemetry?.metrics === true) {
          loginAttribution = { ...attribution, odDeviceId: analyticsContext.deviceId };
        } else {
          const withoutDeviceId = { ...attribution };
          delete withoutDeviceId.odDeviceId;
          loginAttribution = withoutDeviceId;
        }
      }
      // Start device authorization over a direct connection first. The
      // daemon-local IPv4 proxy (added in #4210 for hosts whose direct
      // amr-api.open-design.ai edge path is broken, #3726) re-originates the
      // request through the daemon. Behind a corporate transparent proxy that
      // hijacks amr-api.open-design.ai onto an internal gateway (e.g.
      // 飞连/CorpLink → 30.x), that extra hop makes the upstream lose the
      // client IP and reject device authorization with
      // "502: Invalid IP address: undefined", even though the direct path
      // resolves fine. So only fall back to the proxy when the direct child
      // actually terminates before activation (including after this request
      // returns) — never merely because it is slow, already activated, or a
      // login is already in flight.
      const spawned = await spawnVelaLoginWithFallback({
        authAttemptId: requestAuthAttemptId,
        authRequestId: requestAuthRequestId,
        configuredEnv,
        attribution: loginAttribution,
        correlationEnv,
        proxyApiUrl: velaApiProxyBaseUrl(req, getPublicBaseUrl),
        // Block until the direct attempt reaches device-auth steady state or
        // exits/errors before it. If it remains alive beyond this grace, the
        // attempt supervisor keeps watching after this route returns and owns
        // a single non-overlapping proxy retry on a later pre-activation exit.
        waitForActivation: true,
      });
      const snapshot = readVelaLoginAttemptSnapshot();
      res.status(202).json({
        ...spawned,
        ...(snapshot.authAttemptId === requestAuthAttemptId ? snapshot : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = /already running/i.test(message) ? 409 : 500;
      const snapshot = readVelaLoginAttemptSnapshot();
      // 409 intentionally joins the already-running attempt so concurrent UI
      // initiators can reconcile to its canonical id. Every other failure only
      // exposes state created for this request; config/read failures before
      // beginVelaLoginAttempt therefore cannot contaminate analytics.
      const responseSnapshot = status === 409
        || snapshot.authAttemptId === requestAuthAttemptId
        ? snapshot
        : {};
      res.status(status).json({
        error: message,
        ...responseSnapshot,
      });
    }
  });

  app.post('/api/integrations/vela/login/cancel', (req, res) => {
    try {
      const bodyHasAttemptId = Boolean(
        req.body
        && typeof req.body === 'object'
        && !Array.isArray(req.body)
        && Object.prototype.hasOwnProperty.call(req.body, 'authAttemptId'),
      );
      const authAttemptId = parseVelaAuthAttemptId(req.body);
      const bodyHasRequestId = Boolean(
        req.body
        && typeof req.body === 'object'
        && !Array.isArray(req.body)
        && Object.prototype.hasOwnProperty.call(req.body, 'authRequestId'),
      );
      const authRequestId = parseVelaAuthRequestId(req.body);
      if (
        (bodyHasAttemptId && !authAttemptId)
        || (bodyHasRequestId && !authRequestId)
        || (bodyHasAttemptId && bodyHasRequestId)
      ) {
        res.status(400).json({ error: 'invalid_auth_attempt_id' });
        return;
      }
      // No body remains a compatibility path for older web clients. New
      // callers always target the attempt they observed so a delayed cancel
      // can never terminate a newer login.
      res.json(cancelVelaLogin(
        authAttemptId ?? undefined,
        authRequestId ?? undefined,
      ));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/integrations/vela/analytics-entry', async (req, res) => {
    const payload = parseAmrEntryAnalyticsPayload(req.body);
    if (!payload) {
      res.status(400).json({ error: 'invalid_amr_entry_analytics' });
      return;
    }
    const analyticsContext = readAnalyticsContext(req);
    if (!analyticsContext) {
      res.status(202).json({ mirrored: false });
      return;
    }
    const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
    if (appConfig.telemetry?.metrics !== true) {
      res.status(202).json({ mirrored: false });
      return;
    }
    const result = await mirrorAmrEntryAnalytics(payload, {
      analyticsContext,
      env,
    });
    res.status(202).json(result);
  });

  app.post('/api/integrations/vela/analytics-profile', async (req, res) => {
    const payload = parseAmrOnboardingProfileAnalyticsPayload(req.body);
    if (!payload) {
      res.status(400).json({ error: 'invalid_amr_profile_analytics' });
      return;
    }
    const analyticsContext = readAnalyticsContext(req);
    if (!analyticsContext) {
      res.status(202).json({ mirrored: false });
      return;
    }
    const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
    if (appConfig.telemetry?.metrics !== true) {
      res.status(202).json({ mirrored: false });
      return;
    }
    const canonicalPayload = { ...payload, odDeviceId: analyticsContext.deviceId };
    const result = await mirrorAmrOnboardingProfileAnalytics(canonicalPayload, {
      analyticsContext,
      env,
    });
    res.status(202).json(result);
  });

  app.post('/api/integrations/vela/logout', async (_req, res) => {
    try {
      const appConfig = await readAppConfig(RUNTIME_DATA_DIR);
      const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, 'amr');
      forgetVelaLogin(mergeVelaEnv(env, configuredEnv));
      clearVelaAuthorizationState();
      // Drop any cached plan/balance so the next login can't surface this
      // (now signed-out) account's billing data.
      clearAllVelaLiveAccounts();
      clearVelaWalletSnapshotCache();
      delete env.VELA_RUNTIME_KEY;
      delete env.VELA_LINK_URL;
      const agentCliEnv = { ...(appConfig.agentCliEnv ?? {}) };
      const amrEnv = { ...(agentCliEnv.amr ?? {}) };
      delete amrEnv.VELA_RUNTIME_KEY;
      delete amrEnv.VELA_LINK_URL;
      if (Object.keys(amrEnv).length > 0) {
        agentCliEnv.amr = amrEnv;
      } else {
        delete agentCliEnv.amr;
      }
      await writeAppConfig(RUNTIME_DATA_DIR, { agentCliEnv });
      onCredentialStateObserved();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}

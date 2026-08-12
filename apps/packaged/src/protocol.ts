import { net, protocol } from "electron";

const OD_SCHEME = "od";
const OD_ENTRY_URL = `${OD_SCHEME}://app/`;
type OdProtocolFetch = (request: Request) => Promise<Response>;

/**
 * The web sidecar's HTTP origin, or `null` when there is no usable one.
 *
 * `WebStatusSnapshot.url` is nullable at the source, so the nullability is
 * carried all the way into the proxy instead of being papered over at the
 * registration site with a placeholder address.
 */
type OdProtocolTarget = string | null;

/**
 * Supplies the CURRENT web sidecar address, consulted once per proxied
 * request.
 *
 * Deliberately a provider and not a plain string. The packaged restart
 * supervisor can respawn the web sidecar on a fresh ephemeral port, so a
 * snapshot would keep dialling the retired process. Resolving per request also
 * preserves the explicit unavailable state while a replacement starts.
 */
type OdProtocolTargetResolver = () => OdProtocolTarget;

protocol.registerSchemesAsPrivileged([
  {
    privileges: {
      corsEnabled: true,
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
    },
    scheme: OD_SCHEME,
  },
]);

/**
 * Rewrite an incoming `od://` request onto the web sidecar's current address,
 * or report that there is nothing to rewrite onto.
 *
 * Returns `null` — rather than throwing — for both "no address" and "address
 * is not a URL". Throwing here used to escape the handler entirely (the call
 * sat outside its try/catch), which is precisely the unhandled-rejection shape
 * that surfaces as Electron's "JavaScript error in main process" dialog and
 * that the #895 catch exists to prevent. A `null` lets the caller answer with
 * an honest status instead.
 */
function toWebRuntimeUrl(webRuntimeUrl: OdProtocolTarget, requestUrl: string): string | null {
  if (webRuntimeUrl == null || webRuntimeUrl.length === 0) return null;
  let target: URL;
  try {
    target = new URL(webRuntimeUrl);
  } catch {
    return null;
  }
  const incoming = new URL(requestUrl);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  target.hash = incoming.hash;
  return target.toString();
}

const OD_PROXY_RETRYABLE_METHODS = new Set(["GET", "HEAD"]);

/**
 * Error tokens that mean the LOCAL machine is out of network resources —
 * sockets, file descriptors, ephemeral ports, kernel buffers. Kept as an
 * explicit whitelist: everything not listed here retains the proxy's normal
 * resilience behavior (undici fallback, transient retry).
 */
const OD_RESOURCE_EXHAUSTION_ERROR_TOKENS: readonly string[] = [
  "ERR_INSUFFICIENT_RESOURCES",
  "EMFILE",
  "ENFILE",
  "EADDRNOTAVAIL",
  "ENOBUFS",
];

/**
 * Is this failure the local machine running out of network resources?
 *
 * INVARIANT: a request that fails because this machine is out of
 * sockets/file descriptors must cost exactly ONE upstream attempt. Both of
 * the proxy's resilience layers amplify load, and when the failure is
 * exhaustion, amplification is precisely the wrong medicine: in the incident
 * that motivated this classifier, the undici fallback re-issued every failed
 * net.fetch (7890 doubled requests measured) and the linear-backoff transient
 * retry stacked another 1334 attempts on top — each new attempt consuming
 * exactly the resource the machine had already run out of, and prolonging the
 * outage it was trying to ride through.
 *
 * Matching looks at BOTH `Error.code` and the message because the two fetch
 * transports report differently: Electron's net.fetch surfaces Chromium
 * network-stack failures as plain Errors whose message carries the
 * `net::ERR_...` token while `code` stays unset, whereas Node/undici throws
 * ErrnoExceptions that carry the token in `code`.
 */
function isLocalResourceExhaustionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return OD_RESOURCE_EXHAUSTION_ERROR_TOKENS.some(
    (token) => code === token || error.message.includes(token),
  );
}
const OD_PROXY_RETRY_ATTEMPTS = 3;
const OD_PROXY_RETRY_BACKOFF_MS = 150; // 150ms, 300ms — throw path only, ~450ms worst-case added

type OdProxyRetryOptions = {
  attempts?: number;
  backoffMs?: number;
  delay?: (ms: number) => Promise<void>;
};

const defaultRetryDelay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch the rewritten sidecar target, absorbing transient socket throws
 * for idempotent requests.
 *
 * A single transient fetch failure must never become the document the
 * window renders: undici can throw mid-fetch from socket internals (the
 * `setTypeOfService EINVAL` family of issue #895) even while the web
 * sidecar is healthy, and when that happens on the top navigation
 * (`od://app/`) the synthetic 502 from `buildProxyErrorResponse` IS the
 * whole window — the React app never mounts and nothing reloads it.
 * GET/HEAD carry no body, so re-issuing the Request per attempt is safe;
 * non-idempotent methods keep single-attempt semantics. Responses that
 * resolve — including upstream 5xx — are never retried here: those are
 * app-level answers the renderer owns.
 *
 * Deliberately not conditioned on `Sec-Fetch-Dest: document`: uniform
 * idempotent retry is simpler, and Sec-Fetch header presence on a custom
 * scheme is not a stable contract across Electron versions.
 */
/**
 * One proxied fetch with EXPLICIT cancellation plumbing. The renderer's 6-per-
 * origin connection pool made this load-bearing: an EventSource the renderer
 * closes (or a fetch it aborts) MUST release the upstream net.fetch connection,
 * or long-lived streams (workspace/collab SSE, chat run streams) leak pool
 * slots until every od:// request in the app hangs forever — tofu icons,
 * dead fetches, the works. Electron's protocol.handle does not reliably
 * propagate client disconnects to the handler's Response, so we wire BOTH
 * paths ourselves:
 *   - request.signal abort (when Electron does fire it) aborts the upstream;
 *   - the returned body stream's cancel() (fired when the protocol consumer
 *     tears down) aborts the upstream too.
 */
/**
 * Two response-header repairs every proxied response needs:
 *
 * 1. Drop `content-encoding`/`content-length`/`transfer-encoding`. The
 *    main-process fetch has ALREADY decompressed the upstream body, but the
 *    stale headers ride along, so Chromium's renderer-side consumers that
 *    honor them (the font loader chief among them) try to gunzip plain
 *    bytes and fail with a generic network error. That is exactly why every
 *    packaged icon font rendered as tofu squares while plain fetch() of the
 *    same TTF returned 200 — the fetch path never re-decodes. Classic
 *    protocol.handle-proxy pitfall.
 * 2. Stamp `Access-Control-Allow-Origin: *`. Font loads are CORS-mode
 *    requests per the CSS Fonts spec; od:// is reachable only from this
 *    app's own renderer, so the wildcard leaks nothing.
 */
function sanitizeProxyResponseHeaders(headers: Headers): Headers {
  const out = new Headers(headers);
  out.delete("content-encoding");
  out.delete("content-length");
  out.delete("transfer-encoding");
  out.set("Access-Control-Allow-Origin", "*");
  return out;
}

async function fetchOdTargetOnce(
  request: Request,
  target: string,
  fetchImpl: OdProtocolFetch,
): Promise<Response> {
  const controller = new AbortController();
  const abortUpstream = () => controller.abort();
  if (request.signal != null) {
    if (request.signal.aborted) controller.abort();
    else request.signal.addEventListener("abort", abortUpstream, { once: true });
  }
  const upstream = await fetchImpl(
    new Request(target, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      // @ts-expect-error -- duplex is required by undici/net.fetch for
      // streaming request bodies and absent from the lib.dom Request typings.
      duplex: "half",
      signal: controller.signal,
    }),
  );
  if (upstream.body == null) {
    return new Response(null, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: sanitizeProxyResponseHeaders(upstream.headers),
    });
  }
  const reader = upstream.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(streamController) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          streamController.close();
          return;
        }
        streamController.enqueue(value);
      } catch (error) {
        streamController.error(error);
      }
    },
    cancel() {
      // Protocol consumer went away (renderer closed the EventSource, tab
      // navigated, fetch aborted) — release the upstream connection NOW.
      abortUpstream();
      return reader.cancel().catch(() => undefined);
    },
  });
  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: sanitizeProxyResponseHeaders(upstream.headers),
  });
}

/**
 * Did the RENDERER walk away from this request?
 *
 * Rapid navigation (project page ⇄ Community) cancels the in-flight
 * subresource requests of the page being left — that is Chromium working as
 * designed, not a fault. It matters here because `fetchOdTargetOnce` forwards
 * the incoming signal to the upstream, so a cancelled request rejects: without
 * this check the retry loop treats it as a transient socket fault, re-issues a
 * request whose signal is ALREADY aborted (so every remaining attempt fails
 * instantly), and the handler then manufactures a 502 for a response nobody is
 * going to read. Packaged 0.16.2-beta.139 logged 84 such "proxy fetch failed"
 * warnings — all fonts, icons and a `presence/leave` POST, all clustered inside
 * navigation bursts — which is pure noise masquerading as a gateway outage.
 */
function isClientCancelled(request: Request): boolean {
  return request.signal?.aborted === true;
}

const OD_CLIENT_CANCELLED_STATUS = 499; // nginx's "Client Closed Request"

/**
 * A cancelled request still needs SOME response — rejecting would bubble to
 * Electron's uncaught handler (the #895 dialog). Answer with a status that is
 * honestly distinguishable from an upstream failure so logs and any consumer
 * that does read it can tell "you cancelled this" from "the sidecar is down".
 */
function buildClientCancelledResponse(target: string): Response {
  return new Response(
    JSON.stringify({ error: "OD_PROTOCOL_CLIENT_ABORTED", target }),
    {
      status: OD_CLIENT_CANCELLED_STATUS,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
    },
  );
}

const OD_TARGET_UNAVAILABLE_STATUS = 503; // Service Unavailable

/**
 * Answer for a request that has nowhere to go: the web sidecar reported no
 * address, or reported one that will not parse.
 *
 * The registration site used to substitute `http://127.0.0.1:0` whenever the
 * address was missing. Port 0 means "kernel, pick me a free port" to a
 * *listener*; as a *connect* target it is meaningless, so that fallback turned
 * "the web runtime is not up" into a connection error against a nonsense port
 * — a misleading symptom that costs real time to chase. 503 says the true
 * thing, and is distinguishable from both the 502 upstream-failure document
 * and the 499 client-cancellation document.
 */
function buildTargetUnavailableResponse(request: Request, address: OdProtocolTarget): Response {
  return new Response(
    JSON.stringify({
      error: "OD_PROTOCOL_TARGET_UNAVAILABLE",
      message:
        address == null || address.length === 0
          ? "web sidecar reported no address"
          : "web sidecar address is not a valid URL",
      ...(address == null || address.length === 0 ? {} : { address }),
      requested: request.url,
    }),
    {
      status: OD_TARGET_UNAVAILABLE_STATUS,
      headers: {
        "content-type": "application/json",
        // Same rationale as the 502 path: keep the failure readable from
        // CORS-mode consumers instead of masking it as an opaque network error.
        "access-control-allow-origin": "*",
      },
    },
  );
}

async function fetchOdTargetWithTransientRetry(
  request: Request,
  target: string,
  fetchImpl: OdProtocolFetch,
  options: OdProxyRetryOptions,
): Promise<Response> {
  const attempts = OD_PROXY_RETRYABLE_METHODS.has(request.method)
    ? (options.attempts ?? OD_PROXY_RETRY_ATTEMPTS)
    : 1;
  const backoffMs = options.backoffMs ?? OD_PROXY_RETRY_BACKOFF_MS;
  const delay = options.delay ?? defaultRetryDelay;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetchOdTargetOnce(request, target, fetchImpl);
    } catch (error) {
      lastError = error;
      // Retrying a request the client abandoned can only fail again, and each
      // extra attempt is a misleading "proxy fetch failed" line in the log.
      if (isClientCancelled(request)) break;
      // Resource exhaustion fails fast: every extra attempt consumes exactly
      // the resource the machine has run out of. ECONNREFUSED is deliberately
      // NOT in that whitelist — this retry budget is what bridges the daemon
      // startup race. See isLocalResourceExhaustionError.
      if (isLocalResourceExhaustionError(error)) break;
      if (attempt === attempts) break;
      const waitMs = backoffMs * attempt;
      // Main-process console output lands in the packaged desktop logs, so
      // real-world transient frequency stays diagnosable.
      console.warn("[open-design packaged] od:// proxy fetch failed; retrying", {
        attempt,
        attempts,
        message: error instanceof Error ? error.message : String(error),
        target,
        waitMs,
      });
      await delay(waitMs);
    }
  }
  throw lastError;
}

function buildProxyErrorResponse(error: unknown, target: string): Response {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    error instanceof Error && typeof (error as NodeJS.ErrnoException).code === "string"
      ? (error as NodeJS.ErrnoException).code
      : null;
  return new Response(
    JSON.stringify({
      error: "OD_PROTOCOL_PROXY_FAILED",
      message,
      ...(code === null ? {} : { code }),
      target,
    }),
    {
      status: 502,
      headers: {
        "content-type": "application/json",
        // Keep proxy failures readable from CORS-mode consumers (fonts,
        // module scripts) instead of masking them as opaque network errors.
        "access-control-allow-origin": "*",
      },
    },
  );
}

/**
 * Inner request handler for the `od://` Electron protocol — every
 * renderer fetch flows through here and gets proxied to the local web
 * sidecar via Node's global `fetch` (which is undici under the hood).
 *
 * Pulled out as a named export so unit tests can drive it with a stub
 * `fetchImpl` without spinning up Electron, and so the try/catch
 * stays auditable from one place.
 *
 * Why the try/catch matters: undici can throw `setTypeOfService
 * EINVAL` from socket internals on certain macOS / VPN configurations
 * (issue #895). Without the catch, the rejection bubbles all the way
 * up to the Electron main process and surfaces as a native
 * "JavaScript error in main process" dialog the next time the user
 * does anything that triggers a renderer-to-sidecar fetch (e.g.
 * Settings → Pets → Community). Returning a 502 instead lets the
 * renderer see a normal failure and keeps the process alive.
 *
 * Idempotent requests first pass through
 * `fetchOdTargetWithTransientRetry`, so a one-off transient throw on
 * the top navigation cannot end up as the 502 document covering the
 * window; the 502 remains the exhaustion fallback.
 */
export async function handleOdRequest(
  request: Request,
  webRuntimeUrl: OdProtocolTarget,
  fetchImpl: OdProtocolFetch = fetch,
  retryOptions: OdProxyRetryOptions = {},
): Promise<Response> {
  const target = toWebRuntimeUrl(webRuntimeUrl, request.url);
  // No address to proxy to. Say so plainly rather than dialling a placeholder.
  if (target == null) return buildTargetUnavailableResponse(request, webRuntimeUrl);
  try {
    return await fetchOdTargetWithTransientRetry(request, target, fetchImpl, retryOptions);
  } catch (error) {
    // A request the renderer cancelled is not a gateway failure — reporting it
    // as 502 both lies in the logs and hands error-shaped JSON to any consumer
    // that fails to check `res.ok`.
    if (isClientCancelled(request)) return buildClientCancelledResponse(target);
    return buildProxyErrorResponse(error, target);
  }
}

export function packagedEntryUrl(): string {
  return OD_ENTRY_URL;
}

/**
 * Route the od:// proxy through Electron's `net.fetch` (Chromium's network
 * stack, ~6 pooled connections per origin like a browser tab) instead of Node's
 * global `fetch` (undici), which caps a single origin far lower. Proxying every
 * renderer request through undici serialized them: a project-open request burst
 * that a browser tab runs in parallel dribbled out over minutes in the packaged
 * app. `net.fetch` gives the packaged client the same concurrency as the
 * browser.
 *
 * Electron can nevertheless reject particular renderer-owned subresource
 * requests with a generic `net::ERR_FAILED` even while the same URL succeeds
 * through ordinary fetch and the sidecar returns 200. CSS mask images are one
 * concrete case: packaged agent icons disappeared while their SVG files were
 * present and directly readable. For GET/HEAD only, fall back to undici after
 * that transport-level rejection. Those methods are safe to replay; write
 * requests deliberately stay on a single transport.
 *
 * Set OD_OD_PROXY_FETCH=undici to force the old path for all requests if
 * `net.fetch` regresses a broader streaming edge on a specific Electron/OS
 * combo.
 */
function resolveOdProxyFetch(): OdProtocolFetch {
  if (process.env.OD_OD_PROXY_FETCH === "undici") return fetch;
  const undiciFetch = fetch;
  return async (request) => {
    try {
      return await net.fetch(request);
    } catch (error) {
      if (!OD_PROXY_RETRYABLE_METHODS.has(request.method) || isClientCancelled(request)) {
        throw error;
      }
      // The fallback exists to rescue Electron-specific transport rejections
      // (net::ERR_FAILED on CSS-mask GETs) that undici serves fine. Local
      // resource exhaustion is not that: undici draws on the same exhausted
      // machine, so replaying there only doubles the failing load. Rethrow and
      // let the handler answer 502 at once. See isLocalResourceExhaustionError.
      if (isLocalResourceExhaustionError(error)) throw error;
      console.warn("[open-design packaged] net.fetch failed; falling back to undici", {
        message: error instanceof Error ? error.message : String(error),
        method: request.method,
        target: request.url,
      });
      return await undiciFetch(request);
    }
  };
}

/**
 * Install the `od://` handler, resolving the proxy target through
 * `resolveWebRuntimeUrl` on EVERY request.
 *
 * See `OdProtocolTargetResolver` for why this takes a provider rather than the
 * address itself.
 */
export function registerOdProtocol(resolveWebRuntimeUrl: OdProtocolTargetResolver): void {
  const fetchImpl = resolveOdProxyFetch();
  protocol.handle(OD_SCHEME, async (request) => {
    return await handleOdRequest(request, resolveWebRuntimeUrl(), fetchImpl);
  });
}

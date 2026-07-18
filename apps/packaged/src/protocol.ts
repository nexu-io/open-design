import { protocol } from "electron";

const OD_SCHEME = "od";
const OD_ENTRY_URL = `${OD_SCHEME}://app/`;
type OdProtocolFetch = (request: Request) => Promise<Response>;

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

function toWebRuntimeUrl(webRuntimeUrl: string, requestUrl: string): string {
  const incoming = new URL(requestUrl);
  const target = new URL(webRuntimeUrl);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  target.hash = incoming.hash;
  return target.toString();
}

const OD_PROXY_RETRYABLE_METHODS = new Set(["GET", "HEAD"]);
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
      return await fetchImpl(new Request(target, request));
    } catch (error) {
      lastError = error;
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
      headers: { "content-type": "application/json" },
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
  webRuntimeUrl: string,
  fetchImpl: OdProtocolFetch = fetch,
  retryOptions: OdProxyRetryOptions = {},
): Promise<Response> {
  const target = toWebRuntimeUrl(webRuntimeUrl, request.url);
  try {
    return await fetchOdTargetWithTransientRetry(request, target, fetchImpl, retryOptions);
  } catch (error) {
    return buildProxyErrorResponse(error, target);
  }
}

export function packagedEntryUrl(): string {
  return OD_ENTRY_URL;
}

export function registerOdProtocol(webRuntimeUrl: string): void {
  protocol.handle(OD_SCHEME, async (request) => {
    return await handleOdRequest(request, webRuntimeUrl);
  });
}

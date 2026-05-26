import { protocol } from "electron";

const OD_SCHEME = "od";
const OD_ENTRY_URL = `${OD_SCHEME}://app/`;

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
 */
export async function handleOdRequest(
  request: Request,
  webRuntimeUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const target = toWebRuntimeUrl(webRuntimeUrl, request.url);
  try {
    return await fetchImpl(new Request(target, request));
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

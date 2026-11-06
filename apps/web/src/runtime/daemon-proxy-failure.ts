/**
 * The same-origin API proxies in front of the daemon do not reject `fetch`
 * when the daemon is down — they answer. The web sidecar ends a connection
 * error as a plain-text `502`, and Next's dev rewrite as a plain-text `500`
 * when `OD_PORT` points at a dead port. Both look like ordinary HTTP failures
 * to a caller, so "the daemon is unreachable" arrives dressed as "the server
 * returned an error" unless it is recognised here.
 *
 * Recognise only the connection-level errno shape. `EPIPE` is included
 * because the sidecar itself classifies it as connection-level (its replay
 * check accepts exactly ECONNRESET and EPIPE), and when a replay is not
 * applicable it surfaces as a plain-text 502 containing `write EPIPE`. An upstream/product 5xx is
 * normally JSON and must stay a business response — widening this to any 5xx
 * would relabel real server errors as an outage, which is the opposite
 * mistake and just as misleading.
 */
const PROXY_CONNECTION_ERRNO =
  /\b(?:ECONNREFUSED|ECONNRESET|EPIPE|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT)\b/u;

export async function isDaemonProxyConnectionFailure(resp: Response): Promise<boolean> {
  if (resp.status !== 502 && resp.status !== 500) return false;
  const contentType = resp.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('text/plain')) return false;
  try {
    return PROXY_CONNECTION_ERRNO.test(await resp.clone().text());
  } catch {
    return false;
  }
}

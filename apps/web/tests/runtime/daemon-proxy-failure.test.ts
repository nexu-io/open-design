import { describe, expect, it } from 'vitest';

import { isDaemonProxyConnectionFailure } from '../../src/runtime/daemon-proxy-failure';

// The proxies in front of the daemon answer instead of failing the fetch when
// the daemon is down, so "unreachable" arrives dressed as an HTTP response.
// This classifier is the shared path behind the daemon-down diagnostic for
// exports and project writes, so both halves of its contract are pinned:
// every connection-level shape the proxies actually emit is recognised, and
// nothing else is — widening it would relabel genuine upstream failures as an
// outage, which misleads in the opposite direction.

function response(status: number, body: string, contentType: string): Response {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

describe('isDaemonProxyConnectionFailure', () => {
  it.each([
    ['sidecar refused connection', 502, 'connect ECONNREFUSED 127.0.0.1:7456'],
    ['sidecar reset mid-request', 502, 'read ECONNRESET'],
    // The sidecar's own replay check accepts exactly ECONNRESET and EPIPE as
    // connection-level; when a replay is not applicable the EPIPE surfaces as
    // this plain-text 502.
    ['sidecar broken pipe', 502, 'write EPIPE'],
    ['next dev rewrite against a dead port', 500, 'connect ECONNREFUSED 127.0.0.1:7456'],
    ['host unreachable', 502, 'connect EHOSTUNREACH 10.0.0.5:7456'],
    ['connect timeout', 502, 'connect ETIMEDOUT 10.0.0.5:7456'],
  ])('recognises %s', async (_name, status, body) => {
    await expect(
      isDaemonProxyConnectionFailure(response(status, body, 'text/plain; charset=utf-8')),
    ).resolves.toBe(true);
  });

  it.each([
    // A JSON 5xx is a business/upstream response, not an outage.
    ['json 502 from upstream', 502, '{"error":{"message":"renderer exploded"}}', 'application/json'],
    // Plain text without a connection errno proves nothing about the daemon.
    ['plain 502 without errno', 502, 'Bad Gateway', 'text/plain'],
    // Other statuses are never the proxies' connection-failure shape.
    ['plain 404', 404, 'connect ECONNREFUSED 127.0.0.1:7456', 'text/plain'],
    ['plain 200', 200, 'connect ECONNREFUSED 127.0.0.1:7456', 'text/plain'],
  ])('rejects %s', async (_name, status, body, contentType) => {
    await expect(
      isDaemonProxyConnectionFailure(response(status, body, contentType)),
    ).resolves.toBe(false);
  });
});

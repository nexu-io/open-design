import { describe, expect, it } from 'vitest';

import { byokErrorCode } from '../../src/analytics/byok-error-code';

/**
 * `settings_byok_test_result` used to report `result.kind` verbatim, so every
 * response the daemon's status→kind map had no case for collapsed into the
 * union's `unknown` member. In the field that is 801 tests across 201 devices
 * in 24h — 10% of ALL connection tests — where the user is told "connection
 * failed" and we cannot say why.
 *
 * Nothing upstream was missing: `ConnectionTestResponse` already carries
 * `status` for HTTP-shaped failures and a secret-redacted `detail` for
 * transport ones. Only the emission site threw both away.
 */
describe('byokErrorCode', () => {
  it('keeps a kind the daemon actually classified', () => {
    expect(byokErrorCode({ kind: 'auth_failed', status: 401 })).toBe('auth_failed');
  });

  it('recovers the HTTP status the kind map has no case for', () => {
    // 402 = provider out of credits. Previously indistinguishable from a TLS
    // failure or an HTML login portal behind the base URL.
    expect(byokErrorCode({ kind: 'unknown', status: 402 })).toBe('HTTP_402');
    expect(byokErrorCode({ kind: 'unknown', status: 409 })).toBe('HTTP_409');
  });

  it('recovers a Node error code out of the transport detail', () => {
    expect(byokErrorCode({ kind: 'unknown', detail: 'connect ECONNREFUSED 127.0.0.1:11434' })).toBe(
      'ECONNREFUSED',
    );
    expect(byokErrorCode({ kind: 'unknown', detail: 'getaddrinfo ENOTFOUND api.example.com' })).toBe(
      'ENOTFOUND',
    );
    expect(byokErrorCode({ kind: 'unknown', detail: 'UND_ERR_CONNECT_TIMEOUT' })).toBe(
      'UND_ERR_CONNECT_TIMEOUT',
    );
  });

  it('names a self-signed / TLS rejection', () => {
    expect(
      byokErrorCode({ kind: 'unknown', detail: 'DEPTH_ZERO_SELF_SIGNED_CERT' }),
    ).toBe('DEPTH_ZERO_SELF_SIGNED_CERT');
    expect(
      byokErrorCode({ kind: 'unknown', detail: 'unable to verify the first certificate' }),
    ).toBe('TLS_FAILED');
  });

  it('names a base URL that answered with something that is not JSON', () => {
    // The classic "base URL points at an HTML login portal" case.
    expect(
      byokErrorCode({ kind: 'unknown', detail: 'Unexpected token < in JSON at position 0' }),
    ).toBe('INVALID_JSON_RESPONSE');
  });

  it('marks a genuinely signal-free failure as its own countable bucket', () => {
    // Distinct from `unknown` on purpose: the residue must be measurable
    // instead of being mixed back in with failures we CAN classify.
    expect(byokErrorCode({ kind: 'unknown' })).toBe('UNKNOWN_NO_SIGNAL');
    expect(byokErrorCode({})).toBe('UNKNOWN_NO_SIGNAL');
  });

  it('treats a missing kind the same as an unclassified one', () => {
    expect(byokErrorCode({ kind: '', status: 429 })).toBe('HTTP_429');
    expect(byokErrorCode({ kind: null, status: 500 })).toBe('HTTP_500');
  });
});

/**
 * End-to-end shape guard (review of PR #5960).
 *
 * The first cut of these tests fed `byokErrorCode` a synthetic `detail` string
 * that production never emits, so they passed while the certificate bucket
 * stayed empty in the field. undici surfaces a TLS failure as a `TypeError`
 * whose message is the generic `fetch failed`, with the real reason only on
 * `cause.code` — and `networkErrorToKind` maps only an allowlist, so a
 * self-signed cert lands as `kind: 'unknown'`.
 *
 * The daemon now appends the cause code to `detail` (see
 * apps/daemon/src/connectionTest.ts `networkErrorDetail`); these assert against
 * the shape it actually produces.
 */
describe('byokErrorCode against real daemon detail shapes', () => {
  it('names a self-signed certificate from the undici cause code', () => {
    expect(
      byokErrorCode({ kind: 'unknown', detail: 'fetch failed (DEPTH_ZERO_SELF_SIGNED_CERT)' }),
    ).toBe('DEPTH_ZERO_SELF_SIGNED_CERT');
  });

  it('names a self-signed chain', () => {
    expect(
      byokErrorCode({ kind: 'unknown', detail: 'fetch failed (SELF_SIGNED_CERT_IN_CHAIN)' }),
    ).toBe('SELF_SIGNED_CERT_IN_CHAIN');
  });

  it('names a refused connection carried the same way', () => {
    expect(byokErrorCode({ kind: 'unknown', detail: 'fetch failed (ECONNREFUSED)' })).toBe(
      'ECONNREFUSED',
    );
  });

  it('still degrades to the measurable residue when there is genuinely no cause', () => {
    expect(byokErrorCode({ kind: 'unknown', detail: 'fetch failed' })).toBe('UNKNOWN_NO_SIGNAL');
  });
});

/**
 * Status-vs-detail precedence (review of PR #5960).
 *
 * The daemon returns `{ ok: false, kind: 'unknown', status: <2xx>, detail:
 * <parse error> }` when a 2xx body fails `JSON.parse`
 * (apps/daemon/src/connectionTest.ts) — that IS the "base URL points at an HTML
 * login portal" case. An unconditional status fallback reported it as
 * `HTTP_200` and made every detail classifier unreachable for it, so the
 * headline case this helper advertises could never resolve.
 */
describe('byokErrorCode status precedence', () => {
  it('names the HTML-login-portal case instead of reporting HTTP_200', () => {
    expect(
      byokErrorCode({
        kind: 'unknown',
        status: 200,
        detail: 'Unexpected token < in JSON at position 0',
      }),
    ).toBe('INVALID_JSON_RESPONSE');
  });

  it('does not let any 2xx claim a failure it cannot explain', () => {
    expect(byokErrorCode({ kind: 'unknown', status: 204, detail: 'ECONNRESET' })).toBe(
      'ECONNRESET',
    );
    // Nothing to go on beyond a success status — the residue stays measurable
    // rather than being mislabelled HTTP_200.
    expect(byokErrorCode({ kind: 'unknown', status: 200, detail: '' })).toBe('UNKNOWN_NO_SIGNAL');
  });

  it('still lets a real error status win', () => {
    expect(byokErrorCode({ kind: 'unknown', status: 402, detail: 'insufficient credits' })).toBe(
      'HTTP_402',
    );
    expect(byokErrorCode({ kind: 'unknown', status: 302, detail: 'redirect' })).toBe('HTTP_302');
  });
});

/**
 * OpenSSL cause codes (review of PR #5960).
 *
 * Forwarding `cause.code` from the daemon created a second gap: OpenSSL's TLS
 * codes carry no Node-errno shape and no lowercase word, so
 * `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` matched neither the errno pattern nor a
 * `\bcertificate\b` fallback and came back `UNKNOWN_NO_SIGNAL` — the signal was
 * preserved on the wire and then dropped here. The daemon appends the cause in
 * a known trailing position, so read that rather than enumerate a set that
 * upstream keeps growing.
 */
describe('byokErrorCode against OpenSSL cause codes', () => {
  it.each([
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'CERT_NOT_YET_VALID',
    'CERT_HAS_EXPIRED',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'EPROTO',
  ])('names %s from the daemon-appended cause', (code) => {
    expect(byokErrorCode({ kind: 'unknown', detail: `fetch failed (${code})` })).toBe(code);
  });

  it('falls back to TLS_FAILED for a cert failure with no parseable code', () => {
    expect(
      byokErrorCode({ kind: 'unknown', detail: 'CERT verification failed somewhere upstream' }),
    ).toBe('TLS_FAILED');
  });

  it('keeps the JSON-portal case ahead of a bare success status', () => {
    expect(
      byokErrorCode({ kind: 'unknown', status: 200, detail: 'Unexpected token < in JSON at position 0' }),
    ).toBe('INVALID_JSON_RESPONSE');
  });
});

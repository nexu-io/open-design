/**
 * Derives `settings_byok_test_result.error_code`.
 *
 * The emission site used to report `result.kind` verbatim, so every provider
 * response the daemon could not name collapsed into the union's `unknown`
 * member — 1148 events across 276 devices in 3 days (17% of all BYOK test
 * failures), with no way to separate an out-of-credits 402 from a TLS failure
 * from a base URL pointing at an HTML login portal.
 *
 * Nothing upstream was missing: `ConnectionTestResponse` already carries
 * `status` for every HTTP-shaped failure and a secret-redacted `detail` for the
 * transport ones. Only the emission site threw both away. A real `kind` still
 * wins; the fallthrough now recovers whatever signal is actually present.
 */

// The daemon appends the transport cause as a trailing `(CODE)` (see
// `networkErrorDetail` in apps/daemon/src/connectionTest.ts). Reading that
// position directly beats enumerating codes: OpenSSL's set alone includes
// UNABLE_TO_GET_ISSUER_CERT_LOCALLY, CERT_NOT_YET_VALID and CERT_HAS_EXPIRED,
// none of which match a Node-errno shape, and an allowlist would silently drop
// every code added upstream after this file was written.
const APPENDED_CAUSE_CODE = /\(([A-Z][A-Z0-9_]{2,})\)\s*$/;

// Codes appearing inline rather than in the daemon's appended position.
const NODE_ERROR_CODE = /\b(E[A-Z]{3,}|UND_ERR_[A-Z_]+|ERR_[A-Z_]+|(?:[A-Z][A-Z0-9]*_)+[A-Z0-9]{2,})\b/;

export interface ByokErrorCodeInput {
  kind?: string | null;
  status?: number | null;
  detail?: string | null;
}

/** True when the daemon named the failure, rather than falling through. */
function isClassified(kind: string): boolean {
  return kind.length > 0 && kind.toLowerCase() !== 'unknown';
}

export function byokErrorCode(result: ByokErrorCodeInput): string {
  const kind = typeof result.kind === 'string' ? result.kind : '';
  if (isClassified(kind)) return kind;

  // An HTTP-shaped failure the status→kind map has no case for: 402 (out of
  // credits), 400 without auth-ish text, 409, 413, 422, …
  //
  // The cut is at 300, not 0: a 2xx that still failed the test failed for a
  // reason the status cannot express. The daemon returns
  // `{ status: 200, detail: 'Unexpected token < …' }` when a 2xx body fails
  // JSON.parse — exactly the "base URL points at an HTML login portal" case
  // this helper exists to name. Letting any non-zero status win reported that
  // as `HTTP_200` and made every detail classifier below unreachable for it.
  // 3xx stays on this side of the cut: the daemon fetches with
  // `redirect: 'error'`, so a redirect is a real failure the status does name.
  if (typeof result.status === 'number' && result.status >= 300) {
    return `HTTP_${result.status}`;
  }

  // No status means the request never got a response. The daemon's network
  // classifier drops `cause.code` when it isn't in its allowlist, but the raw
  // code survives in `detail` — appended in a known position first, inline
  // otherwise.
  const detail = typeof result.detail === 'string' ? result.detail : '';
  const appended = APPENDED_CAUSE_CODE.exec(detail)?.[1];
  if (appended) return appended;
  const nodeCode = NODE_ERROR_CODE.exec(detail)?.[1];
  if (nodeCode) return nodeCode;
  // `CERT` covers the OpenSSL family whose names carry no lowercase word —
  // `\bcertificate\b` never matches UNABLE_TO_GET_ISSUER_CERT_LOCALLY.
  if (/\bcertificate\b|\bTLS\b|\bSSL\b|CERT/i.test(detail)) return 'TLS_FAILED';
  if (/\bJSON\b|\bunexpected token\b/i.test(detail)) return 'INVALID_JSON_RESPONSE';

  // Genuinely nothing to go on — distinct from `unknown` so the residue is
  // measurable instead of being mixed back in with classifiable failures.
  return 'UNKNOWN_NO_SIGNAL';
}

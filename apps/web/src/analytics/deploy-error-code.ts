/**
 * Classify a failed-deploy error into a stable, queryable analytics code for
 * `artifact_deploy_result.error_code`.
 *
 * The deploy catch used to report `err.name` for every unclassified failure,
 * which collapses to the generic `"Error"` for the common case (a plain `Error`
 * thrown from the deploy runtime / provider API). That left ~half of failed
 * deploys indistinguishable in analytics (`error_code = "Error"`) — no way to
 * tell an auth failure from a network drop from a provider 5xx — which is
 * exactly the opaque bucket a deploy root-cause fix needs to see.
 *
 * This maps the common transport / provider-API failure signatures to specific
 * codes. It deliberately emits only FIXED codes (never free-form message text),
 * so no deploy token, account id, zone, or URL from the error message can leak
 * into analytics. A structured `.code` on the error always wins over message
 * classification; anything the classifier can't place falls back to `err.name`.
 *
 * Mirrors apps/web/src/analytics/export-error-code.ts (issue-#5220 pattern).
 */

// The daemon deploy route (apps/daemon/src/routes/deploy.ts) collapses every
// non-404 failure's code to `BAD_REQUEST` (and 404 to `FILE_NOT_FOUND`) while
// keeping the real provider HTTP status + message. Those envelope codes carry no
// signal, so they must NOT win over status/message-based bucketing — treated as
// "no structured code" both at the throw site and here as a safety net.
export const GENERIC_DEPLOY_ENVELOPE_CODES = new Set(['BAD_REQUEST', 'FILE_NOT_FOUND', 'INTERNAL', 'INTERNAL_ERROR', 'UNKNOWN']);

export function deployErrorCode(err: unknown): string {
  const structured = (err as { code?: unknown } | null | undefined)?.code;
  if (typeof structured === 'string' && structured.length > 0 && !GENERIC_DEPLOY_ENVELOPE_CODES.has(structured)) {
    return structured;
  }
  if (!(err instanceof Error)) return 'UNKNOWN';
  const message = err.message ?? '';
  // Daemon↔desktop sidecar version skew (new daemon → old desktop): the same
  // fingerprint the export path classifies. Check BEFORE the broader
  // renderer-unavailable branch, which the wrapped skew text also matches.
  if (/unknown \w+ sidecar message/i.test(message)) return 'DESKTOP_SIDECAR_UNKNOWN_MESSAGE';
  if (/renderer (?:is )?unavailable/i.test(message)) return 'DESKTOP_RENDERER_UNAVAILABLE';
  // Transport failures — a request that never got a response from the provider.
  if (/\b(?:ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ENETUNREACH|network error|failed to fetch|fetch failed)\b/i.test(message)) {
    return 'NETWORK';
  }
  if (/\btimed?\s*out\b|\bETIMEDOUT\b/i.test(message)) return 'TIMEOUT';
  // Provider API rejected the request. Prefer the semantic reason, then bucket
  // by HTTP status so auth (401/403), missing target (404), quota, and provider
  // faults (5xx) separate instead of collapsing to "Error".
  if (/\brate.?limit/i.test(message) || /\b429\b/.test(message)) return 'RATE_LIMITED';
  if (/\b(?:unauthori[sz]ed|forbidden|invalid (?:api )?(?:key|token|credential))\b/i.test(message)) {
    return 'FORBIDDEN';
  }
  if (/\bnot found\b/i.test(message)) return 'NOT_FOUND';
  const status = /\b([45]\d\d)\b/.exec(message)?.[1];
  if (status) return `HTTP_${status}`;
  return err.name || 'UNKNOWN';
}

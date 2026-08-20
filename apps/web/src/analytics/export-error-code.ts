/**
 * Classify a failed-export error into a stable, queryable analytics code for
 * `artifact_export_result.error_code`.
 *
 * The export UI used to report `err.name` for every failure, which collapses
 * to the generic `"Error"` for the common case (a plain `Error` thrown from
 * the export runtime). That made distinct failure modes indistinguishable in
 * analytics — in particular the daemon↔desktop sidecar version skew, where a
 * freshly-updated daemon sends a `render-slides` message an older desktop
 * process doesn't understand and the daemon surfaces
 * `desktop renderer unavailable: unknown desktop sidecar message: render-slides`.
 *
 * This maps the known daemon/runtime failure signatures to specific codes so
 * `error_code` separates "version-skewed mesh" from ordinary render failures
 * (timeouts, unreadable payloads, etc.). A structured `.code` on the error
 * (e.g. a future typed daemon error) always wins over message classification.
 */
// The daemon's envelope codes are generic wrappers, not a classification, so
// they must not win over message bucketing. Mirrors the deploy helper's guard.
const GENERIC_EXPORT_ENVELOPE_CODES = new Set([
  'BAD_REQUEST', 'FILE_NOT_FOUND', 'INTERNAL', 'INTERNAL_ERROR', 'UPSTREAM_UNAVAILABLE', 'UNKNOWN',
]);

export function exportErrorCode(err: unknown): string {
  const structured = (err as { code?: unknown } | null | undefined)?.code;
  if (typeof structured === 'string' && structured.length > 0 && !GENERIC_EXPORT_ENVELOPE_CODES.has(structured)) {
    return structured;
  }
  if (!(err instanceof Error)) return 'UNKNOWN';
  const message = err.message ?? '';
  // The daemon rejected a desktop sidecar message it doesn't recognize — the
  // fingerprint of a version-skewed mesh (new daemon → old desktop). Check this
  // BEFORE the broader "renderer unavailable" branch: the daemon wraps the skew
  // as "desktop renderer unavailable: unknown desktop sidecar message: <type>",
  // so the raw text matches both patterns.
  if (/unknown \w+ sidecar message/i.test(message)) return 'DESKTOP_SIDECAR_UNKNOWN_MESSAGE';
  if (/renderer (?:is )?unavailable/i.test(message)) return 'DESKTOP_RENDERER_UNAVAILABLE';
  // Capture-stage failures specific to export: the render produced nothing
  // usable, so the request never even became an HTTP problem.
  if (/\bnothing was captured\b|\bsnapshot is empty\b/i.test(message)) return 'EMPTY_CAPTURE';
  if (/\bcanvas is not available\b/i.test(message)) return 'CANVAS_UNAVAILABLE';
  if (/\bunreadable response\b/i.test(message)) return 'UNREADABLE_RESPONSE';
  if (/\binvalid data url\b/i.test(message)) return 'INVALID_DATA_URL';
  if (/\bdownload failed\b/i.test(message)) return 'DOWNLOAD_FAILED';
  // Transport failures — a request that never got a response.
  if (/\b(?:ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ENETUNREACH|network error|failed to fetch|fetch failed)\b/i.test(message)) {
    return 'NETWORK';
  }
  if (/\btimed?\s*out\b|\bETIMEDOUT\b/i.test(message)) return 'TIMEOUT';
  if (/\brate.?limit/i.test(message) || /\b429\b/.test(message)) return 'RATE_LIMITED';
  if (/\b(?:unauthori[sz]ed|forbidden|invalid (?:api )?(?:key|token|credential))\b/i.test(message)) {
    return 'FORBIDDEN';
  }
  if (/\bnot found\b/i.test(message)) return 'NOT_FOUND';
  // Same status regex (and the same false-positive guards) as the deploy helper.
  const status = /\b([45]\d\d)\b/.exec(message)?.[1];
  if (status) return `HTTP_${status}`;
  return err.name || 'UNKNOWN';
}

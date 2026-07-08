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
export function exportErrorCode(err: unknown): string {
  const structured = (err as { code?: unknown } | null | undefined)?.code;
  if (typeof structured === 'string' && structured.length > 0) return structured;
  if (!(err instanceof Error)) return 'UNKNOWN';
  const message = err.message ?? '';
  // The daemon rejected a desktop sidecar message it doesn't recognize — the
  // fingerprint of a version-skewed mesh (new daemon → old desktop). Check this
  // BEFORE the broader "renderer unavailable" branch: the daemon wraps the skew
  // as "desktop renderer unavailable: unknown desktop sidecar message: <type>",
  // so the raw text matches both patterns.
  if (/unknown \w+ sidecar message/i.test(message)) return 'DESKTOP_SIDECAR_UNKNOWN_MESSAGE';
  if (/renderer (?:is )?unavailable/i.test(message)) return 'DESKTOP_RENDERER_UNAVAILABLE';
  return err.name || 'UNKNOWN';
}

/**
 * HTTP endpoint exposed by the daemon to stream a diagnostics zip back to
 * the caller. Body is `application/zip`; the response sets a
 * `Content-Disposition` header naming the download.
 *
 * This module is a pure string-constant module with no Node/fs imports, so
 * web/browser code can safely import it to construct the URL or to verify
 * the response content type.
 */
export const DIAGNOSTICS_EXPORT_PATH = "/api/diagnostics/export";

export const DIAGNOSTICS_FILENAME_PREFIX = "open-design-diagnostics";

export const DIAGNOSTICS_CONTENT_TYPE = "application/zip";

/**
 * @module errors
 *
 * Public error taxonomy for managed downloads: the frozen `MANAGED_DOWNLOAD_ERROR_CODES`
 * table, the `ManagedDownloadErrorCode` union derived from it, and the
 * `ManagedDownloadError` class every concern throws. Depends on nothing else in the
 * module; every other file imports the codes and the error class from here.
 */

/**
 * Frozen table of stable machine-readable error codes surfaced by the managed
 * download API. Callers can switch on `error.code` for programmatic handling.
 */
export const MANAGED_DOWNLOAD_ERROR_CODES = Object.freeze({
  ABORTED: "aborted",
  CHECKSUM_MISMATCH: "checksum-mismatch",
  INVALID_TARGET: "invalid-target",
  NETWORK_EXHAUSTED: "network-exhausted",
  OUTPUT_CONFLICT: "output-conflict",
  STORE_CORRUPT: "store-corrupt",
  STORE_NOT_OWNED: "store-not-owned",
  TARGET_CONFLICT: "target-conflict",
  TARGET_LOCKED: "target-locked",
} as const);

/** Union of the stable error-code string literals. */
export type ManagedDownloadErrorCode =
  (typeof MANAGED_DOWNLOAD_ERROR_CODES)[keyof typeof MANAGED_DOWNLOAD_ERROR_CODES];

/**
 * Error thrown by every managed-download operation. Carries a stable {@link
 * ManagedDownloadErrorCode} plus optional structured `details` for diagnostics.
 */
export class ManagedDownloadError extends Error {
  readonly code: ManagedDownloadErrorCode;
  readonly details?: unknown;

  constructor(code: ManagedDownloadErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ManagedDownloadError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

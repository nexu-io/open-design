/**
 * @module @open-design/download
 *
 * Public barrel for the managed-download package. Re-exports the exact prior
 * public surface: the error taxonomy, the data-transfer types, and the five
 * operations (`managedDownload`, `downloadCopyAndClear`, `inspectManagedDownload`,
 * `removeManagedDownload`, `pruneManagedDownloads`). This file contains no logic —
 * every implementation lives in a concern module beside it.
 */

export { MANAGED_DOWNLOAD_ERROR_CODES, ManagedDownloadError } from "./errors.js";
export type { ManagedDownloadErrorCode } from "./errors.js";
export type {
  DownloadCopyAndClearOptions,
  DownloadCopyAndClearResult,
  ManagedDownloadChecksum,
  ManagedDownloadInspection,
  ManagedDownloadOptions,
  ManagedDownloadPayload,
  ManagedDownloadProgress,
  ManagedDownloadResult,
  PruneManagedDownloadsOptions,
  PruneManagedDownloadsResult,
  RemoveManagedDownloadOptions,
  RemoveManagedDownloadResult,
} from "./types.js";
export { managedDownload } from "./managed-download.js";
export { downloadCopyAndClear } from "./copy.js";
export { inspectManagedDownload, removeManagedDownload } from "./remove.js";
export { pruneManagedDownloads } from "./prune.js";

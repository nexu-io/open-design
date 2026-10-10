/**
 * @module @open-design/download
 *
 * Public barrel for managed transfers and native archive operations.
 * Existing transfer APIs retain their contracts; archive helpers provide the
 * explicit release-product transport boundary. Implementations live in the
 * concern modules beside this barrel.
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

export { createTarArchive, extractArchive, listArchive, readTarEntry } from "./archive.js";
export type { ArchiveFormat } from "./archive.js";

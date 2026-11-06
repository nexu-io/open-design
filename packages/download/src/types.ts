/**
 * @module types
 *
 * Public data-transfer types for the managed-download API: the checksum/payload
 * request shapes, progress and result records, and the option/result shapes for
 * copy-and-clear, inspect, remove, and prune. These are pure type declarations
 * with no runtime code and no dependency on other files in the module.
 */

/** Checksum algorithm and expected hex digest for a managed download. */
export type ManagedDownloadChecksum = {
  algorithm: "sha256" | "sha512";
  value: string;
};

/** Remote source description: URL, optional request headers, and expected checksum. */
export type ManagedDownloadPayload = {
  checksum: ManagedDownloadChecksum;
  headers?: Record<string, string>;
  url: string;
};

/** Progress snapshot emitted while a download transfers bytes. */
export type ManagedDownloadProgress = {
  receivedBytes: number;
  sessionReceivedBytes: number;
  totalBytes?: number;
};

/** Options accepted by {@link managedDownload}. */
export type ManagedDownloadOptions = {
  basePath: string;
  bucket: string;
  fileName: string;
  fetch?: typeof globalThis.fetch;
  maxAttempts?: number;
  onProgress?: (progress: ManagedDownloadProgress) => void;
  payload: ManagedDownloadPayload;
  signal?: AbortSignal;
};

/** Result returned by {@link managedDownload} once the file is complete. */
export type ManagedDownloadResult = {
  bucket: string;
  bytes: number;
  checksum: ManagedDownloadChecksum;
  fileName: string;
  path: string;
  reusedComplete: boolean;
  resumed: boolean;
  urlDigest: string;
};

/** Options accepted by {@link downloadCopyAndClear}. */
export type DownloadCopyAndClearOptions = ManagedDownloadOptions & {
  outputPath: string;
};

/** Result returned by {@link downloadCopyAndClear}. */
export type DownloadCopyAndClearResult = {
  bytes: number;
  cleanup: "deferred" | "removed";
  cleanupWarning?: string;
  outputPath: string;
  reusedComplete: boolean;
  resumed: boolean;
};

/** Result returned by {@link inspectManagedDownload}. */
export type ManagedDownloadInspection = {
  bucket: string;
  complete: boolean;
  fileName: string;
  manifest: "complete" | "missing" | "partial" | "unreadable";
  path: string;
};

/** Options accepted by {@link removeManagedDownload} and {@link inspectManagedDownload}. */
export type RemoveManagedDownloadOptions = {
  basePath: string;
  bucket: string;
  fileName: string;
};

/** Result returned by {@link removeManagedDownload}. */
export type RemoveManagedDownloadResult = {
  removed: boolean;
};

/** Options accepted by {@link pruneManagedDownloads}. */
export type PruneManagedDownloadsOptions = {
  basePath: string;
  now?: Date;
  olderThanMs?: number;
};

/** Result returned by {@link pruneManagedDownloads}. */
export type PruneManagedDownloadsResult = {
  removed: number;
  warnings: string[];
};

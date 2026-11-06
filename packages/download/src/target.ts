/**
 * @module target
 *
 * Target resolution and input validation. Normalizes and validates the caller's
 * base path, bucket/file name segments, checksum, and URL, then derives the
 * `NormalizedTarget` — the resolved final/manifest/partial/lock paths plus the
 * identity/url/target digests every downstream concern keys off. Also exposes the
 * standalone `normalizeBasePath` used by prune. Depends only on errors, constants,
 * public types, and the platform path guard.
 */

import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";

import { pathContains } from "@open-design/platform";

import { LOCK_DIR, PARTIAL_DIR, STATE_DIR } from "./constants.js";
import { MANAGED_DOWNLOAD_ERROR_CODES, ManagedDownloadError } from "./errors.js";
import type { ManagedDownloadChecksum, ManagedDownloadOptions } from "./types.js";

/**
 * Fully resolved, validated download target. Carries the normalized inputs plus
 * every derived on-disk path and digest used throughout the download lifecycle.
 */
export type NormalizedTarget = {
  basePath: string;
  bucket: string;
  checksum: ManagedDownloadChecksum;
  fileName: string;
  finalPath: string;
  identityDigest: string;
  lockPath: string;
  manifestPath: string;
  partialPath: string;
  targetKey: string;
  url: string;
  urlDigest: string;
};

/**
 * @internal Extract a human-readable message from an unknown thrown value.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @internal Compute a stable sha256 hex digest of a string.
 */
function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * @internal Validate and normalize a checksum to a supported algorithm and a
 * lowercase hex value of the expected length.
 */
function normalizeChecksum(input: ManagedDownloadChecksum): ManagedDownloadChecksum {
  if (input.algorithm !== "sha256" && input.algorithm !== "sha512") {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, `unsupported checksum algorithm: ${String(input.algorithm)}`);
  }
  const value = input.value.trim().toLowerCase();
  const expectedLength = input.algorithm === "sha256" ? 64 : 128;
  if (!new RegExp(`^[0-9a-f]{${expectedLength}}$`).test(value)) {
    throw new ManagedDownloadError(
      MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET,
      `${input.algorithm} checksum must be ${expectedLength} hex characters`,
    );
  }
  return { algorithm: input.algorithm, value };
}

/**
 * @internal Validate that a value is a safe single path segment (no separators,
 * traversal, null bytes, or absolute paths).
 */
function normalizeSegment(value: string, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, `${label} must be a non-empty string`);
  }
  if (value === "." || value === ".." || value.includes("\0") || /[\\/]/.test(value) || isAbsolute(value)) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, `${label} must be a safe single path segment`);
  }
  return value;
}

/**
 * @internal Validate and canonicalize an http/https URL.
 */
function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("only http and https URLs are supported");
    }
    return url.toString();
  } catch (error) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, errorMessage(error));
  }
}

/**
 * Validate and resolve a base path to an absolute directory path.
 * @returns The resolved absolute base path.
 */
export function normalizeBasePath(basePath: string): string {
  if (typeof basePath !== "string" || basePath.length === 0 || basePath.includes("\0")) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, "basePath must be a non-empty path");
  }
  const resolved = resolve(basePath);
  if (!isAbsolute(resolved)) {
    throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, `basePath must resolve to an absolute path: ${basePath}`);
  }
  return resolved;
}

/**
 * Build a fully-resolved {@link NormalizedTarget} from validated download options,
 * enforcing that every derived path stays contained within the base path.
 * @returns The normalized target descriptor.
 */
export function targetFromOptions(options: Pick<ManagedDownloadOptions, "basePath" | "bucket" | "fileName" | "payload">): NormalizedTarget {
  const basePath = normalizeBasePath(options.basePath);
  const bucket = normalizeSegment(options.bucket, "bucket");
  const fileName = normalizeSegment(options.fileName, "fileName");
  const checksum = normalizeChecksum(options.payload.checksum);
  const url = normalizeUrl(options.payload.url);
  const urlDigest = digest(url);
  const identityDigest = digest(`${url}\0${checksum.algorithm}\0${checksum.value}`);
  const targetKey = digest(`${bucket}\0${fileName}`);
  const finalPath = resolve(basePath, bucket, fileName);
  const manifestPath = resolve(basePath, STATE_DIR, `${targetKey}.json`);
  const partialPath = resolve(basePath, PARTIAL_DIR, `${targetKey}.partial`);
  const lockPath = resolve(basePath, LOCK_DIR, `${targetKey}.lock`);
  for (const path of [finalPath, manifestPath, partialPath, lockPath]) {
    if (!pathContains(basePath, path)) {
      throw new ManagedDownloadError(MANAGED_DOWNLOAD_ERROR_CODES.INVALID_TARGET, "resolved managed download path escaped basePath");
    }
  }
  return { basePath, bucket, checksum, fileName, finalPath, identityDigest, lockPath, manifestPath, partialPath, targetKey, url, urlDigest };
}

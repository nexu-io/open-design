/**
 * @module manifest
 *
 * Per-download manifest: the `DownloadManifest` on-disk record, its validation
 * type guards, a safe reader that distinguishes missing from corrupt, a matcher
 * that confirms a manifest describes the requested target, and a builder for
 * fresh complete/partial manifests. Depends on constants, errors, public types,
 * and the `NormalizedTarget` shape from the target concern.
 */

import { readFile } from "node:fs/promises";

import { MANIFEST_KIND, MANIFEST_SCHEMA_VERSION } from "./constants.js";
import type { NormalizedTarget } from "./target.js";
import type { ManagedDownloadChecksum } from "./types.js";

/**
 * On-disk record describing a single managed download's identity, checksum,
 * completion state, and optional resume validators.
 */
export type DownloadManifest = {
  bucket: string;
  checksum: ManagedDownloadChecksum;
  createdAt: string;
  fileName: string;
  identityDigest: string;
  kind: typeof MANIFEST_KIND;
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  state: "complete" | "partial";
  targetKey: string;
  totalBytes?: number;
  updatedAt: string;
  urlDigest: string;
  validators?: {
    etag?: string;
    lastModified?: string;
  };
};

/**
 * @internal Extract a Node error `code` string from an unknown thrown value.
 */
function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error == null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

/**
 * @internal Type guard for a well-formed checksum record.
 */
function isChecksum(value: unknown): value is ManagedDownloadChecksum {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return false;
  const checksum = value as Partial<ManagedDownloadChecksum>;
  return (
    (checksum.algorithm === "sha256" || checksum.algorithm === "sha512") &&
    typeof checksum.value === "string"
  );
}

/**
 * @internal Type guard for a well-formed download manifest.
 */
function isManifest(value: unknown): value is DownloadManifest {
  if (typeof value !== "object" || value == null || Array.isArray(value)) return false;
  const record = value as Partial<DownloadManifest>;
  return (
    record.kind === MANIFEST_KIND &&
    record.schemaVersion === MANIFEST_SCHEMA_VERSION &&
    typeof record.bucket === "string" &&
    typeof record.fileName === "string" &&
    typeof record.targetKey === "string" &&
    typeof record.identityDigest === "string" &&
    typeof record.urlDigest === "string" &&
    isChecksum(record.checksum) &&
    (record.state === "complete" || record.state === "partial") &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string"
  );
}

/**
 * Read a manifest file, distinguishing three outcomes.
 * @returns The parsed manifest, `null` when the file is absent, or `"invalid"`
 * when present but unparseable/malformed.
 */
export async function readManifest(path: string): Promise<DownloadManifest | "invalid" | null> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isManifest(parsed) ? parsed : "invalid";
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    return "invalid";
  }
}

/**
 * Confirm that a manifest describes exactly the requested target (identity, url,
 * bucket/file name, and checksum all match).
 * @returns `true` when the manifest matches the target.
 */
export function manifestMatchesTarget(manifest: DownloadManifest, target: NormalizedTarget): boolean {
  return (
    manifest.bucket === target.bucket &&
    manifest.fileName === target.fileName &&
    manifest.targetKey === target.targetKey &&
    manifest.identityDigest === target.identityDigest &&
    manifest.urlDigest === target.urlDigest &&
    manifest.checksum.algorithm === target.checksum.algorithm &&
    manifest.checksum.value.toLowerCase() === target.checksum.value
  );
}

/**
 * Build a fresh manifest for a target in the given state, optionally patching in
 * `totalBytes`/`validators`.
 * @returns The new manifest record.
 */
export function createManifest(
  target: NormalizedTarget,
  state: "complete" | "partial",
  patch: Partial<Pick<DownloadManifest, "totalBytes" | "validators">> = {},
): DownloadManifest {
  const now = new Date().toISOString();
  return {
    bucket: target.bucket,
    checksum: target.checksum,
    createdAt: now,
    fileName: target.fileName,
    identityDigest: target.identityDigest,
    kind: MANIFEST_KIND,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    state,
    targetKey: target.targetKey,
    updatedAt: now,
    urlDigest: target.urlDigest,
    ...patch,
  };
}

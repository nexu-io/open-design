/**
 * @module transfer
 *
 * The HTTP transfer engine. Parses response metadata (content-length, resume
 * validators, content-range), streams a response body into the partial file while
 * emitting progress, and drives the resume-or-restart-with-retries loop that
 * fills the partial file. Depends on errors, public progress types, the target
 * and manifest shapes, and the fs-io write/stat primitives.
 */

import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { MANAGED_DOWNLOAD_ERROR_CODES, ManagedDownloadError } from "./errors.js";
import { statFileSize, writeJson } from "./fs-io.js";
import { createManifest, type DownloadManifest } from "./manifest.js";
import type { NormalizedTarget } from "./target.js";
import type { ManagedDownloadProgress } from "./types.js";

/**
 * @internal Outcome of a single transfer attempt: whether it resumed and the
 * discovered total byte count.
 */
type DownloadAttemptResult = {
  resumed: boolean;
  totalBytes?: number;
};

/**
 * @internal Extract a human-readable message from an unknown thrown value.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @internal Parse a non-negative `content-length` header value.
 */
function contentLength(response: Response): number | undefined {
  const raw = response.headers.get("content-length");
  if (raw == null) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

/**
 * @internal Extract resume validators (etag/last-modified) from a response.
 */
function validatorsFromResponse(response: Response): DownloadManifest["validators"] | undefined {
  const etag = response.headers.get("etag") ?? undefined;
  const lastModified = response.headers.get("last-modified") ?? undefined;
  return etag == null && lastModified == null ? undefined : { ...(etag == null ? {} : { etag }), ...(lastModified == null ? {} : { lastModified }) };
}

/**
 * @internal Detect whether saved validators conflict with a fresh response,
 * signalling the remote resource changed and a resume is unsafe.
 */
function validatorsConflict(saved: DownloadManifest["validators"] | undefined, response: Response): boolean {
  if (saved == null) return false;
  const etag = response.headers.get("etag") ?? undefined;
  const lastModified = response.headers.get("last-modified") ?? undefined;
  if (saved.etag != null && etag != null && saved.etag !== etag) return true;
  if (saved.lastModified != null && lastModified != null && saved.lastModified !== lastModified) return true;
  return false;
}

/**
 * @internal Parse a `content-range` header into start/end/total bytes.
 * @returns The parsed range, or `null` if absent or malformed.
 */
function parseContentRange(value: string | null): { end: number; start: number; totalBytes?: number } | null {
  if (value == null) return null;
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(value.trim());
  if (match?.[1] == null || match[2] == null || match[3] == null) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  const totalBytes = match[3] === "*" ? undefined : Number(match[3]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
  if (totalBytes != null && (!Number.isInteger(totalBytes) || totalBytes <= end)) return null;
  return { start, end, ...(totalBytes == null ? {} : { totalBytes }) };
}

/**
 * @internal Emit a progress event reflecting bytes already present on disk.
 */
async function emitExistingProgress(path: string, totalBytes: number | undefined, emit: (progress: ManagedDownloadProgress) => void): Promise<void> {
  const existing = await statFileSize(path);
  if (existing == null || existing <= 0) return;
  emit({ receivedBytes: existing, sessionReceivedBytes: 0, ...(totalBytes == null ? {} : { totalBytes }) });
}

/**
 * @internal Stream a response body into the partial file (append when resuming),
 * emitting progress for every chunk.
 */
async function writeResponseBodyToPartial(
  response: Response,
  target: NormalizedTarget,
  options: {
    emit: (progress: ManagedDownloadProgress) => void;
    startBytes: number;
    totalBytes?: number;
  },
): Promise<void> {
  if (response.body == null) throw new Error("download response did not include a body");
  let receivedBytes = options.startBytes;
  let sessionReceivedBytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.byteLength;
      sessionReceivedBytes += chunk.byteLength;
      options.emit({
        receivedBytes,
        sessionReceivedBytes,
        ...(options.totalBytes == null ? {} : { totalBytes: options.totalBytes }),
      });
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as never),
    meter,
    createWriteStream(target.partialPath, { flags: options.startBytes > 0 ? "a" : "w" }),
  );
}

/**
 * @internal Attempt to resume a partial download via a Range request.
 * @returns The attempt result, or `"restart"` when resume is not possible.
 */
async function tryResumeDownload(
  target: NormalizedTarget,
  manifest: DownloadManifest,
  fetchImpl: typeof globalThis.fetch,
  emit: (progress: ManagedDownloadProgress) => void,
  requestHeaders: Record<string, string> | undefined,
): Promise<DownloadAttemptResult | "restart"> {
  const partialBytes = await statFileSize(target.partialPath);
  if (partialBytes == null || partialBytes <= 0) return "restart";
  const response = await fetchImpl(target.url, {
    headers: {
      ...(requestHeaders ?? {}),
      ...(manifest.validators?.etag == null ? {} : { "If-Range": manifest.validators.etag }),
      Range: `bytes=${partialBytes}-`,
    },
  });
  if (response.status !== 206) return "restart";
  const range = parseContentRange(response.headers.get("content-range"));
  if (range == null || range.start !== partialBytes || validatorsConflict(manifest.validators, response)) {
    return "restart";
  }
  const totalBytes = range.totalBytes ?? manifest.totalBytes ?? partialBytes + (contentLength(response) ?? 0);
  await emitExistingProgress(target.partialPath, totalBytes, emit);
  await writeJson(target.manifestPath, {
    ...manifest,
    state: "partial",
    totalBytes,
    updatedAt: new Date().toISOString(),
    validators: manifest.validators ?? validatorsFromResponse(response),
  } satisfies DownloadManifest);
  await writeResponseBodyToPartial(response, target, { emit, startBytes: partialBytes, totalBytes });
  return { resumed: true, totalBytes };
}

/**
 * @internal Download the target from byte zero, discarding any prior partial.
 * @returns The attempt result.
 */
async function downloadFromZero(
  target: NormalizedTarget,
  fetchImpl: typeof globalThis.fetch,
  emit: (progress: ManagedDownloadProgress) => void,
  requestHeaders: Record<string, string> | undefined,
): Promise<DownloadAttemptResult> {
  await rm(target.partialPath, { force: true }).catch(() => undefined);
  const response = await fetchImpl(target.url, { headers: requestHeaders });
  if (!response.ok) throw new Error(`download request returned HTTP ${response.status}`);
  const totalBytes = contentLength(response);
  const validators = validatorsFromResponse(response);
  await writeJson(target.manifestPath, createManifest(target, "partial", { totalBytes, validators }));
  await writeResponseBodyToPartial(response, target, { emit, startBytes: 0, totalBytes });
  return { resumed: false, totalBytes };
}

/**
 * Fill the target's partial file, resuming when possible and otherwise
 * restarting, retrying up to `maxAttempts` times. Throws `NETWORK_EXHAUSTED`
 * when all attempts fail.
 * @returns The final attempt result once the partial is fully transferred.
 */
export async function downloadWithRetries(
  target: NormalizedTarget,
  manifest: DownloadManifest | null,
  options: {
    emit: (progress: ManagedDownloadProgress) => void;
    fetchImpl: typeof globalThis.fetch;
    maxAttempts: number;
    requestHeaders?: Record<string, string>;
  },
): Promise<DownloadAttemptResult> {
  let lastError: unknown;
  let nextManifest = manifest;
  let resumed = false;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      if (nextManifest?.state === "partial") {
        const resume = await tryResumeDownload(target, nextManifest, options.fetchImpl, options.emit, options.requestHeaders);
        if (resume !== "restart") return { ...resume, resumed: true };
        await rm(target.partialPath, { force: true }).catch(() => undefined);
        nextManifest = null;
      }
      const full = await downloadFromZero(target, options.fetchImpl, options.emit, options.requestHeaders);
      resumed = resumed || full.resumed;
      return { ...full, resumed };
    } catch (error) {
      lastError = error;
      const partialBytes = await statFileSize(target.partialPath);
      if (partialBytes != null && partialBytes > 0) {
        nextManifest = {
          ...(nextManifest ?? createManifest(target, "partial")),
          state: "partial",
          updatedAt: new Date().toISOString(),
        };
        await writeJson(target.manifestPath, nextManifest).catch(() => undefined);
      }
    }
  }
  throw new ManagedDownloadError(
    MANAGED_DOWNLOAD_ERROR_CODES.NETWORK_EXHAUSTED,
    `download failed after ${options.maxAttempts} attempts: ${errorMessage(lastError)}`,
  );
}

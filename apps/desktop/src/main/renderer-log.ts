import {
  appendFile,
  mkdir,
  open,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname } from "node:path";

export const DEFAULT_RENDERER_LOG_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_RENDERER_LOG_MAX_ENTRY_BYTES = 256 * 1024;

export type RendererLogEntry = {
  timestamp: string;
  level: string;
  text: string;
};

export type RotatingRendererLogWriterOptions = {
  logPath: string;
  maxBytes?: number;
  onError?: (error: unknown) => void;
};

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export class RotatingRendererLogWriter {
  readonly #logPath: string;
  readonly #backupPath: string;
  readonly #maxBytes: number;
  readonly #onError?: (error: unknown) => void;
  #currentBytes: number | null = null;
  #pending: Promise<void> = Promise.resolve();

  constructor(options: RotatingRendererLogWriterOptions) {
    if (!Number.isSafeInteger(options.maxBytes ?? DEFAULT_RENDERER_LOG_MAX_BYTES)) {
      throw new TypeError("renderer log maxBytes must be a safe integer");
    }
    if ((options.maxBytes ?? DEFAULT_RENDERER_LOG_MAX_BYTES) <= 0) {
      throw new RangeError("renderer log maxBytes must be greater than zero");
    }
    this.#logPath = options.logPath;
    this.#backupPath = `${options.logPath}.1`;
    this.#maxBytes = options.maxBytes ?? DEFAULT_RENDERER_LOG_MAX_BYTES;
    this.#onError = options.onError;
  }

  append(line: string): Promise<boolean> {
    return this.#enqueue(() => this.#appendNow(line));
  }

  initialize(): Promise<boolean> {
    return this.#enqueue(async () => {
      if (this.#currentBytes == null) {
        await this.#initializeSize();
      }
      return true;
    });
  }

  flush(): Promise<void> {
    return this.#pending;
  }

  #enqueue(operation: () => Promise<boolean>): Promise<boolean> {
    const queued = this.#pending.then(operation);
    this.#pending = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued.catch((error: unknown) => {
      this.#currentBytes = null;
      try {
        this.#onError?.(error);
      } catch {
        // A logging error callback must not escape into the caller.
      }
      return false;
    });
  }

  async #appendNow(line: string): Promise<boolean> {
    const lineBytes = Buffer.byteLength(line, "utf8");
    if (lineBytes > this.#maxBytes) {
      throw new RangeError("renderer log entry exceeds the configured file limit");
    }

    let currentBytes =
      this.#currentBytes ?? (await this.#initializeSize());

    if (
      currentBytes > 0 &&
      currentBytes + lineBytes > this.#maxBytes
    ) {
      await this.#rotate(currentBytes);
      currentBytes = 0;
    }

    await appendFile(this.#logPath, line, "utf8");
    this.#currentBytes = currentBytes + lineBytes;
    return true;
  }

  async #initializeSize(): Promise<number> {
    await mkdir(dirname(this.#logPath), { recursive: true });
    await rm(`${this.#backupPath}.tmp`, { force: true });
    await this.#normalizeExistingBackup();

    let currentBytes: number;
    try {
      currentBytes = (await stat(this.#logPath)).size;
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
      currentBytes = 0;
    }
    if (currentBytes > this.#maxBytes) {
      await this.#rotate(currentBytes);
      currentBytes = 0;
    } else if (currentBytes > 0) {
      currentBytes = await this.#normalizeExistingFile(
        this.#logPath,
        currentBytes,
      );
    }
    this.#currentBytes = currentBytes;
    return currentBytes;
  }

  async #normalizeExistingBackup(): Promise<void> {
    let backupBytes: number;
    try {
      backupBytes = (await stat(this.#backupPath)).size;
    } catch (error) {
      if (isMissingFileError(error)) return;
      throw error;
    }
    await this.#normalizeExistingFile(this.#backupPath, backupBytes);
  }

  async #normalizeExistingFile(
    path: string,
    fileBytes: number,
  ): Promise<number> {
    const recentLines = await this.#readRecentCompleteLines(path, fileBytes);
    if (recentLines.length === fileBytes) return fileBytes;

    const target = await open(path, "r+");
    try {
      await target.truncate(0);
      let bytesWritten = 0;
      while (bytesWritten < recentLines.length) {
        const result = await target.write(
          recentLines,
          bytesWritten,
          recentLines.length - bytesWritten,
          bytesWritten,
        );
        if (result.bytesWritten === 0) {
          throw new Error("renderer log rewrite made no progress");
        }
        bytesWritten += result.bytesWritten;
      }
      await target.truncate(recentLines.length);
    } finally {
      await target.close();
    }
    return recentLines.length;
  }

  async #readRecentCompleteLines(
    path: string,
    fileBytes: number,
  ): Promise<Buffer> {
    const bytesToRead = Math.min(fileBytes, this.#maxBytes);
    const startPosition = fileBytes - bytesToRead;
    const buffer = Buffer.allocUnsafe(bytesToRead);
    const source = await open(path, "r");
    let bytesRead = 0;
    try {
      while (bytesRead < bytesToRead) {
        const result = await source.read(
          buffer,
          bytesRead,
          bytesToRead - bytesRead,
          startPosition + bytesRead,
        );
        if (result.bytesRead === 0) break;
        bytesRead += result.bytesRead;
      }
    } finally {
      await source.close();
    }

    let recentLines = buffer.subarray(0, bytesRead);
    if (startPosition > 0) {
      const firstLineEnd = recentLines.indexOf(0x0a);
      recentLines =
        firstLineEnd === -1
          ? recentLines.subarray(recentLines.length)
          : recentLines.subarray(firstLineEnd + 1);
    }
    if (
      recentLines.length > 0 &&
      recentLines[recentLines.length - 1] !== 0x0a
    ) {
      const finalLineEnd = recentLines.lastIndexOf(0x0a);
      recentLines =
        finalLineEnd === -1
          ? recentLines.subarray(recentLines.length)
          : recentLines.subarray(0, finalLineEnd + 1);
    }
    return recentLines;
  }

  async #rotate(currentBytes: number): Promise<void> {
    const temporaryBackupPath = `${this.#backupPath}.tmp`;
    await rm(this.#backupPath, { force: true });
    await rm(temporaryBackupPath, { force: true });

    if (currentBytes <= this.#maxBytes) {
      try {
        await rename(this.#logPath, this.#backupPath);
      } catch (error) {
        if (!isMissingFileError(error)) throw error;
      }
      this.#currentBytes = 0;
      return;
    }

    const recentLines = await this.#readRecentCompleteLines(
      this.#logPath,
      currentBytes,
    );
    await writeFile(temporaryBackupPath, recentLines);
    await rename(temporaryBackupPath, this.#backupPath);
    await rm(this.#logPath, { force: true });
    this.#currentBytes = 0;
  }
}

function truncateAtCodePointBoundary(text: string, length: number): string {
  let safeLength = length;
  if (safeLength > 0) {
    const finalCodeUnit = text.charCodeAt(safeLength - 1);
    const isHighSurrogate =
      finalCodeUnit >= 0xd800 && finalCodeUnit <= 0xdbff;
    const isLowSurrogate =
      finalCodeUnit >= 0xdc00 && finalCodeUnit <= 0xdfff;
    const previousCodeUnit =
      safeLength > 1 ? text.charCodeAt(safeLength - 2) : -1;
    const hasMatchingHighSurrogate =
      previousCodeUnit >= 0xd800 && previousCodeUnit <= 0xdbff;
    if (isHighSurrogate || (isLowSurrogate && !hasMatchingHighSurrogate)) {
      safeLength -= 1;
    }
  }
  return text.slice(0, safeLength);
}

export function serializeRendererLogEntry(
  entry: RendererLogEntry,
  maxLineBytes = DEFAULT_RENDERER_LOG_MAX_ENTRY_BYTES,
): string {
  if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes <= 0) {
    throw new RangeError("renderer log maxLineBytes must be a positive safe integer");
  }

  const serialize = (text: string): string =>
    `${JSON.stringify({
      timestamp: entry.timestamp,
      level: entry.level,
      text,
    })}\n`;
  const unmodified = serialize(entry.text);
  if (Buffer.byteLength(unmodified, "utf8") <= maxLineBytes) {
    return unmodified;
  }

  const originalBytes = Buffer.byteLength(entry.text, "utf8");
  const suffix = `… [truncated from ${originalBytes} bytes]`;
  let best = serialize(suffix);
  if (Buffer.byteLength(best, "utf8") > maxLineBytes) {
    throw new RangeError("renderer log line budget is too small for entry metadata");
  }

  let low = 0;
  let high = entry.text.length;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const prefix = truncateAtCodePointBoundary(entry.text, middle);
    const candidate = serialize(`${prefix}${suffix}`);
    if (Buffer.byteLength(candidate, "utf8") <= maxLineBytes) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

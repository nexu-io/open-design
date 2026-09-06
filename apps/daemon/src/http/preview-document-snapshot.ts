import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const DEFAULT_MAX_ATTEMPTS = 3;

export class PreviewDocumentVersionChangedError extends Error {
  readonly code = 'VERSION_CHANGED';

  constructor(message = 'preview document changed while its exact version was being captured') {
    super(message);
    this.name = 'PreviewDocumentVersionChangedError';
  }
}

export interface PreviewDocumentSnapshot {
  filePath: string;
  documentVersion: string;
  size: number;
  mtime: number;
  release: () => Promise<void>;
}

export interface PreviewDocumentSnapshotStoreOptions {
  rootDir: string;
  maxAttempts?: number;
  /** Deterministic race hook for tests; production callers leave it unset. */
  afterCandidateCaptured?: (attempt: number) => Promise<void> | void;
}

export interface PreviewDocumentSnapshotCaptureOptions {
  /**
   * When a scope already names the exact response version it is allowed to
   * serve, the captured candidate itself is the proof. Comparing its digest to
   * this value avoids rereading a mutable source merely to rediscover the same
   * identity.
   */
  expectedDocumentVersion?: string;
}

function versionFromDigest(digest: ReturnType<typeof createHash>): string {
  return `sha256:${digest.digest('hex')}`;
}

async function versionOfFile(filePath: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return versionFromDigest(digest);
}

function versionOfBuffer(buffer: Buffer): string {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

export class PreviewDocumentSnapshotStore {
  readonly #rootDir: string;
  readonly #maxAttempts: number;
  readonly #afterCandidateCaptured: ((attempt: number) => Promise<void> | void) | undefined;

  constructor(options: PreviewDocumentSnapshotStoreOptions) {
    this.#rootDir = options.rootDir;
    this.#maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS));
    this.#afterCandidateCaptured = options.afterCandidateCaptured;
  }

  async captureFile(
    sourcePath: string,
    options: PreviewDocumentSnapshotCaptureOptions = {},
  ): Promise<PreviewDocumentSnapshot> {
    await mkdir(this.#rootDir, { recursive: true });
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      const candidatePath = this.#candidatePath();
      try {
        const digest = createHash('sha256');
        await pipeline(
          createReadStream(sourcePath),
          new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              digest.update(chunk);
              callback(null, chunk);
            },
          }),
          createWriteStream(candidatePath, { flags: 'wx' }),
        );
        const documentVersion = versionFromDigest(digest);
        await this.#afterCandidateCaptured?.(attempt);
        if (options.expectedDocumentVersion !== undefined) {
          if (documentVersion !== options.expectedDocumentVersion) {
            throw new PreviewDocumentVersionChangedError(
              'preview document no longer matches the version bound to this scope',
            );
          }
          return await this.#snapshot(candidatePath, documentVersion);
        }
        if (await versionOfFile(sourcePath) === documentVersion) {
          return await this.#snapshot(candidatePath, documentVersion);
        }
      } catch (error) {
        await rm(candidatePath, { force: true }).catch(() => undefined);
        if (error instanceof PreviewDocumentVersionChangedError) throw error;
        if (attempt === this.#maxAttempts) throw error;
        continue;
      }
      await rm(candidatePath, { force: true });
    }
    throw new PreviewDocumentVersionChangedError();
  }

  async captureBuffer(
    load: () => Promise<Buffer | string>,
    options: PreviewDocumentSnapshotCaptureOptions = {},
  ): Promise<PreviewDocumentSnapshot> {
    await mkdir(this.#rootDir, { recursive: true });
    for (let attempt = 1; attempt <= this.#maxAttempts; attempt += 1) {
      const candidate = Buffer.from(await load());
      const documentVersion = versionOfBuffer(candidate);
      await this.#afterCandidateCaptured?.(attempt);
      if (options.expectedDocumentVersion !== undefined) {
        if (documentVersion !== options.expectedDocumentVersion) {
          throw new PreviewDocumentVersionChangedError(
            'preview document no longer matches the version bound to this scope',
          );
        }
      } else {
        const verification = Buffer.from(await load());
        if (versionOfBuffer(verification) !== documentVersion) continue;
      }

      const candidatePath = this.#candidatePath();
      try {
        await writeFile(candidatePath, candidate, { flag: 'wx' });
        return await this.#snapshot(candidatePath, documentVersion);
      } catch (error) {
        await rm(candidatePath, { force: true }).catch(() => undefined);
        throw error;
      }
    }
    throw new PreviewDocumentVersionChangedError();
  }

  #candidatePath(): string {
    return path.join(this.#rootDir, `${process.pid}-${randomUUID()}.html`);
  }

  async #snapshot(
    filePath: string,
    documentVersion: string,
  ): Promise<PreviewDocumentSnapshot> {
    const fileStat = await stat(filePath);
    let released = false;
    return {
      filePath,
      documentVersion,
      size: fileStat.size,
      mtime: fileStat.mtimeMs,
      release: async () => {
        if (released) return;
        released = true;
        await rm(filePath, { force: true });
      },
    };
  }
}

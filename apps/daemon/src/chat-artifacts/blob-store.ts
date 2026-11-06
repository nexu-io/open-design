// Content-addressed blob storage for immutable chat artifact snapshots.
//
// DATA ROOT CONTRACT (see the repository AGENTS.md "Daemon data directory
// contract"): this module has NO default and NO cwd fallback. The caller must
// hand it the already-resolved daemon data root — in production that is
// `RUNTIME_DATA_DIR` from `server.ts`, and nothing else. Introducing a default
// here would create a second data root, which the contract forbids.
//
// PRIVACY: a `storageKey` is a daemon-internal RELATIVE key. It never leaves
// the daemon, is never accepted from a caller, and an absolute path is never
// returned to HTTP. `resolveStorageKey` is the ONLY place a key becomes a
// filesystem path, and it re-validates the key shape so a corrupted database
// row cannot traverse out of the blob root.

import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { digestHex, isContentDigest } from './types.js';

/** Directory name under the daemon data root. */
const BLOB_ROOT_DIRNAME = 'chat-artifact-blobs';
const OBJECTS_DIRNAME = 'objects';
const TEMP_DIRNAME = 'tmp';

const OBJECT_KEY_RE = /^objects\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}$/u;
const TEMP_KEY_RE = /^tmp\/[0-9a-f-]{36}\.part$/u;

export interface WrittenTemp {
  /** `sha256:<hex>` computed while streaming; never trusted from a caller. */
  digest: string;
  byteSize: number;
}

export interface TempEntry {
  key: string;
  mtimeMs: number;
  byteSize: number;
}

export interface ChatArtifactBlobStore {
  /** Absolute blob root. Internal diagnostics only — never serialized out. */
  readonly root: string;
  newTempKey(): string;
  storageKeyFor(digest: string): string;
  /** Internal path resolution. Throws on any key that is not well-formed. */
  resolveStorageKey(key: string): string;
  writeTempFromBytes(tempKey: string, bytes: Buffer): Promise<WrittenTemp>;
  writeTempFromPath(tempKey: string, sourceAbsolutePath: string): Promise<WrittenTemp>;
  /** Atomically install a verified temp at its content address. */
  installTemp(tempKey: string, digest: string): Promise<string>;
  discardTemp(tempKey: string): Promise<void>;
  listTempEntries(): Promise<TempEntry[]>;
  hasBlob(storageKey: string): Promise<boolean>;
  readBlob(storageKey: string): Promise<Buffer>;
  createBlobReadStream(storageKey: string): fs.ReadStream;
  /** Size-check an installed blob against the size the database claims. */
  verifyBlob(storageKey: string, expectedByteSize: number): Promise<boolean>;
  removeBlob(storageKey: string): Promise<void>;
  /** Every installed object key. Used by the mark-sweep GC. */
  listObjectKeys(): Promise<string[]>;
}

class FsChatArtifactBlobStore implements ChatArtifactBlobStore {
  readonly root: string;

  constructor(dataDir: string) {
    this.root = path.join(dataDir, BLOB_ROOT_DIRNAME);
  }

  newTempKey(): string {
    return `${TEMP_DIRNAME}/${randomUUID()}.part`;
  }

  storageKeyFor(digest: string): string {
    const hex = digestHex(digest);
    if (!hex) throw new Error('invalid content digest');
    return `${OBJECTS_DIRNAME}/${hex.slice(0, 2)}/${hex.slice(2, 4)}/${hex}`;
  }

  resolveStorageKey(key: string): string {
    if (typeof key !== 'string' || (!OBJECT_KEY_RE.test(key) && !TEMP_KEY_RE.test(key))) {
      throw new Error(`invalid blob storage key: ${JSON.stringify(String(key).slice(0, 64))}`);
    }
    const resolved = path.resolve(this.root, key);
    const rootWithSep = this.root.endsWith(path.sep) ? this.root : `${this.root}${path.sep}`;
    if (!resolved.startsWith(rootWithSep)) {
      throw new Error('invalid blob storage key: escapes the blob root');
    }
    return resolved;
  }

  async writeTempFromBytes(tempKey: string, bytes: Buffer): Promise<WrittenTemp> {
    const target = this.resolveStorageKey(tempKey);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    // Exclusive create: a temp key collision must fail loudly, never silently
    // append to or overwrite another in-flight capture.
    const handle = await fs.promises.open(target, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return {
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      byteSize: bytes.byteLength,
    };
  }

  async writeTempFromPath(tempKey: string, sourceAbsolutePath: string): Promise<WrittenTemp> {
    const target = this.resolveStorageKey(tempKey);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const hash = createHash('sha256');
    let byteSize = 0;
    const source = fs.createReadStream(sourceAbsolutePath);
    const sink = fs.createWriteStream(target, { flags: 'wx' });
    source.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      hash.update(buf);
      byteSize += buf.byteLength;
    });
    await pipeline(source, sink);
    return { digest: `sha256:${hash.digest('hex')}`, byteSize };
  }

  async installTemp(tempKey: string, digest: string): Promise<string> {
    const tempPath = this.resolveStorageKey(tempKey);
    if (!isContentDigest(digest)) {
      await this.discardTemp(tempKey);
      throw new Error('invalid content digest');
    }
    // Re-hash what is actually on disk. The caller's digest is a claim; this is
    // the proof. A mismatch means the bytes moved under us, so nothing is
    // installed and the temp is destroyed rather than left to be picked up.
    const actual = await hashFile(tempPath);
    if (actual.digest !== digest) {
      await this.discardTemp(tempKey);
      throw new Error(
        `blob digest mismatch: temp hashed to ${actual.digest}, caller claimed ${digest}`,
      );
    }
    const storageKey = this.storageKeyFor(digest);
    const finalPath = this.resolveStorageKey(storageKey);
    await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });
    try {
      // link + unlink instead of rename: link fails with EEXIST when the same
      // content is already installed, which is the dedupe signal. rename would
      // silently clobber a good object with an identical one.
      await fs.promises.link(tempPath, finalPath);
    } catch (err) {
      if (!isExistsError(err)) {
        await this.discardTemp(tempKey);
        throw err;
      }
      // Already installed by an earlier capture: identical content by
      // construction, so drop the duplicate.
    }
    await this.discardTemp(tempKey);
    return storageKey;
  }

  async discardTemp(tempKey: string): Promise<void> {
    try {
      await fs.promises.rm(this.resolveStorageKey(tempKey), { force: true });
    } catch {
      // Best effort: an unremovable temp is swept later by the reconciler.
    }
  }

  async listTempEntries(): Promise<TempEntry[]> {
    const dir = path.join(this.root, TEMP_DIRNAME);
    let names: string[];
    try {
      names = await fs.promises.readdir(dir);
    } catch {
      return [];
    }
    const entries: TempEntry[] = [];
    for (const name of names) {
      const key = `${TEMP_DIRNAME}/${name}`;
      if (!TEMP_KEY_RE.test(key)) continue;
      try {
        const stat = await fs.promises.stat(path.join(dir, name));
        entries.push({ key, mtimeMs: stat.mtimeMs, byteSize: stat.size });
      } catch {
        // Raced with another sweep; skip.
      }
    }
    return entries;
  }

  async hasBlob(storageKey: string): Promise<boolean> {
    try {
      await fs.promises.access(this.resolveStorageKey(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  async readBlob(storageKey: string): Promise<Buffer> {
    return fs.promises.readFile(this.resolveStorageKey(storageKey));
  }

  createBlobReadStream(storageKey: string): fs.ReadStream {
    return fs.createReadStream(this.resolveStorageKey(storageKey));
  }

  async verifyBlob(storageKey: string, expectedByteSize: number): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(this.resolveStorageKey(storageKey));
      return stat.size === expectedByteSize;
    } catch {
      return false;
    }
  }

  async removeBlob(storageKey: string): Promise<void> {
    await fs.promises.rm(this.resolveStorageKey(storageKey), { force: true });
  }

  async listObjectKeys(): Promise<string[]> {
    const root = path.join(this.root, OBJECTS_DIRNAME);
    const keys: string[] = [];
    let firstLevel: string[];
    try {
      firstLevel = await fs.promises.readdir(root);
    } catch {
      return [];
    }
    for (const a of firstLevel) {
      let secondLevel: string[];
      try {
        secondLevel = await fs.promises.readdir(path.join(root, a));
      } catch {
        continue;
      }
      for (const b of secondLevel) {
        let files: string[];
        try {
          files = await fs.promises.readdir(path.join(root, a, b));
        } catch {
          continue;
        }
        for (const name of files) {
          const key = `${OBJECTS_DIRNAME}/${a}/${b}/${name}`;
          if (OBJECT_KEY_RE.test(key)) keys.push(key);
        }
      }
    }
    return keys;
  }
}

async function hashFile(absolutePath: string): Promise<{ digest: string; byteSize: number }> {
  const hash = createHash('sha256');
  let byteSize = 0;
  const stream = fs.createReadStream(absolutePath);
  for await (const chunk of stream) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    hash.update(buf);
    byteSize += buf.byteLength;
  }
  return { digest: `sha256:${hash.digest('hex')}`, byteSize };
}

function isExistsError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'EEXIST'
  );
}

const storeCache = new Map<string, ChatArtifactBlobStore>();

/**
 * Build (or reuse) the blob store rooted at an explicit daemon data root.
 *
 * `dataDir` is required and must be absolute. There is deliberately no
 * `process.env.OD_DATA_DIR` read and no cwd fallback here — the daemon
 * resolves its data root exactly once, in `server.ts`, and every path derives
 * from that single truth source.
 */
export function createChatArtifactBlobStore(
  input: { dataDir: string },
): ChatArtifactBlobStore {
  const dataDir = input?.dataDir;
  if (typeof dataDir !== 'string' || dataDir.trim() === '') {
    throw new Error('chat artifact blob store requires an explicit daemon data root');
  }
  if (!path.isAbsolute(dataDir)) {
    throw new Error('chat artifact blob store data root must be an absolute path');
  }
  const resolved = path.resolve(dataDir);
  const cached = storeCache.get(resolved);
  if (cached) return cached;
  const store = new FsChatArtifactBlobStore(resolved);
  storeCache.set(resolved, store);
  return store;
}

/** Test seam: drop cached stores so a temp data dir can be recreated. */
export function resetChatArtifactBlobStoreCache(): void {
  storeCache.clear();
}

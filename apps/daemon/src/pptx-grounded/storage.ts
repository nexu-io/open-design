import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat, mkdir, open, readdir, realpath, rename, rm,
} from 'node:fs/promises';
import path from 'node:path';
import {
  GroundedPptxConflictError,
  GroundedPptxPayloadTooLargeError,
  GroundedPptxStorageCapacityError,
} from './errors.js';

const ROOT_DIR = 'grounded-pptx';
const MANIFEST_FILE = 'manifest.json';
const LOCK_OWNER_FILE = 'owner.json';
const DAEMON_LOCK_DIR = '.quota-lock';
const PROJECT_LOCK_DIR = '.write-lock';
const OWNER_PUBLICATION_GRACE_MS = 5 * 60_000;
const MAX_BLOB_BYTES = 50 * 1024 * 1024;
export const GROUNDED_PPTX_STORAGE_LIMITS = {
  maxBlobBytes: MAX_BLOB_BYTES,
  maxManifestBytes: 1024 * 1024,
  maxRevisions: 100,
  maxProjectBytes: 1024 * 1024 * 1024,
  maxDaemonBytes: 10 * 1024 * 1024 * 1024,
} as const;

export interface GroundedPptxStorageLocation {
  /** Exact configured daemon root pathname that must not be a symlink. */
  runtimeRoot?: string;
  dataRoot: string;
  projectId: string;
}
type StorageLocation = string | GroundedPptxStorageLocation;

export function groundedPptxStorageProjectRoot(location: StorageLocation): string {
  if (typeof location === 'string') return path.join(location, ROOT_DIR);
  const key = createHash('sha256').update(location.projectId).digest('hex');
  return path.join(location.dataRoot, key);
}

function storageDataRoot(location: StorageLocation): string {
  return typeof location === 'string' ? location : location.dataRoot;
}

interface DirectoryIdentity { dev: number; ino: number }
interface ControlledDirectory {
  configuredPath: string;
  realPath: string;
  identity: DirectoryIdentity;
}
interface LockedStorageContext {
  location: StorageLocation;
  runtimeRoot: ControlledDirectory;
  dataRoot: ControlledDirectory;
}

function sameIdentity(left: DirectoryIdentity, right: DirectoryIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function validateControlledDirectory(
  target: string,
  applyPermissions = true,
): Promise<ControlledDirectory> {
  const namedBefore = await lstat(target);
  if (namedBefore.isSymbolicLink() || !namedBefore.isDirectory()) {
    throw new Error('grounded PPTX data root is not a safe directory');
  }
  if (!constants.O_NOFOLLOW || !constants.O_DIRECTORY) {
    throw new Error('symlink-safe grounded PPTX data roots are unsupported on this platform');
  }
  const handle = await open(target, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isDirectory() || opened.dev !== namedBefore.dev || opened.ino !== namedBefore.ino) {
      throw new Error('grounded PPTX data root changed during validation');
    }
    if (applyPermissions) await handle.chmod(0o700);
    const namedAfter = await lstat(target);
    if (namedAfter.isSymbolicLink() || !namedAfter.isDirectory() ||
        namedAfter.dev !== opened.dev || namedAfter.ino !== opened.ino) {
      throw new Error('grounded PPTX data root changed during validation');
    }
    return {
      configuredPath: target,
      realPath: await realpath(target),
      identity: { dev: opened.dev, ino: opened.ino },
    };
  } finally {
    await handle.close();
  }
}

async function revalidateControlledDirectory(directory: ControlledDirectory): Promise<void> {
  const current = await validateControlledDirectory(directory.configuredPath, false);
  if (!sameIdentity(current.identity, directory.identity) || current.realPath !== directory.realPath) {
    throw new Error('grounded PPTX data root identity changed while publication lock was held');
  }
}

async function revalidateLockedStorageContext(context: LockedStorageContext): Promise<void> {
  await revalidateControlledDirectory(context.runtimeRoot);
  await revalidateControlledDirectory(context.dataRoot);
  if (context.runtimeRoot.configuredPath !== context.dataRoot.configuredPath &&
      !context.dataRoot.realPath.startsWith(`${context.runtimeRoot.realPath}${path.sep}`)) {
    throw new Error('grounded PPTX data root escapes configured daemon root');
  }
}

async function ensureControlledDataRoot(location: StorageLocation): Promise<LockedStorageContext> {
  const dataRoot = storageDataRoot(location);
  const runtimeRoot = typeof location === 'string' ? dataRoot : (location.runtimeRoot ?? dataRoot);
  await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
  const runtimeBefore = await validateControlledDirectory(runtimeRoot);
  if (runtimeRoot !== dataRoot) {
    const relative = path.relative(runtimeRoot, dataRoot);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('grounded PPTX data root escapes configured daemon root');
    }
    await mkdir(dataRoot, { recursive: true, mode: 0o700 });
    await revalidateControlledDirectory(runtimeBefore);
  }
  const controlled = runtimeRoot === dataRoot
    ? runtimeBefore
    : await validateControlledDirectory(dataRoot);
  if (runtimeRoot !== dataRoot &&
      !controlled.realPath.startsWith(`${runtimeBefore.realPath}${path.sep}`)) {
    throw new Error('grounded PPTX data root escapes configured daemon root');
  }
  return { location, runtimeRoot: runtimeBefore, dataRoot: controlled };
}

const daemonStorageLocks = new Map<string, Promise<void>>();

async function acquireDaemonPublicationLock(dataRoot: string): Promise<LockOwner> {
  const deadline = Date.now() + 30_000;
  while (true) {
    try {
      return await acquireFilesystemLock(dataRoot, DAEMON_LOCK_DIR, 'daemon publication');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('daemon publication already in progress') ||
          Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

async function withDaemonStorageLock<T>(
  location: StorageLocation,
  operation: (context: LockedStorageContext) => Promise<T>,
): Promise<T> {
  const key = storageDataRoot(location);
  const previous = daemonStorageLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  daemonStorageLocks.set(key, tail);
  await previous;
  let context: LockedStorageContext | undefined;
  let owner: LockOwner | undefined;
  let operationFailed = false;
  try {
    context = await ensureControlledDataRoot(location);
    owner = await acquireDaemonPublicationLock(context.dataRoot.realPath);
    await revalidateLockedStorageContext(context);
    return await operation(context);
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    try {
      if (context && owner) {
        try {
          await revalidateLockedStorageContext(context);
          await releaseFilesystemLock(context.dataRoot.realPath, DAEMON_LOCK_DIR, owner);
        } catch (releaseError) {
          // A replaced pathname no longer names our locked tree. Never clean up
          // through it, even though that can leave a stale lock in the displaced tree.
          if (!operationFailed) throw releaseError;
        }
      }
    } finally {
      release();
      if (daemonStorageLocks.get(key) === tail) daemonStorageLocks.delete(key);
    }
  }
}

async function persistedStorageBytes(root: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === DAEMON_LOCK_DIR || entry.name === PROJECT_LOCK_DIR) continue;
    const target = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error('grounded PPTX daemon storage contains a symlink');
    if (entry.isDirectory()) total += await persistedStorageBytes(target);
    else if (entry.isFile()) total += (await lstat(target)).size;
  }
  return total;
}

async function assertDaemonQuota(
  context: LockedStorageContext,
  additionalBytes: number,
  maximum: number,
): Promise<void> {
  await revalidateLockedStorageContext(context);
  const persistedBytes = await persistedStorageBytes(context.dataRoot.realPath);
  await revalidateLockedStorageContext(context);
  if (persistedBytes + additionalBytes > maximum) {
    throw new GroundedPptxStorageCapacityError('grounded PPTX daemon storage limit exceeded');
  }
}

async function readRegularFileHandle(
  target: string,
  containmentRoot: string,
  maximumBytes: number,
  sizeError: string,
): Promise<Uint8Array> {
  if (!constants.O_NOFOLLOW) throw new Error('symlink-safe file reads are unsupported on this platform');
  const resolvedRoot = await realpath(containmentRoot);
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error(`grounded PPTX path is not a safe regular file: ${path.basename(target)}`);
    if (before.size > maximumBytes) throw new Error(sizeError);
    const named = await lstat(target);
    const resolvedTarget = await realpath(target);
    if (named.isSymbolicLink() || named.dev !== before.dev || named.ino !== before.ino ||
        !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error('grounded PPTX file changed during read');
    }
    const bytes = new Uint8Array(before.size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = await handle.stat();
    const namedAfter = await lstat(target);
    if (offset !== before.size || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size ||
        namedAfter.isSymbolicLink() || namedAfter.dev !== before.dev || namedAfter.ino !== before.ino) {
      throw new Error('grounded PPTX file changed during read');
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

export interface GroundedPptxBlobRef {
  path: string;
  sha256: string;
  size: number;
}

export interface GroundedPptxManifest {
  schemaVersion: 1;
  mode: 'grounded-pptx';
  source: GroundedPptxBlobRef & { originalFilename: string; projectFilePath?: string };
  currentRevisionId: string;
  revisions: Array<GroundedPptxBlobRef & { id: string; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export class GroundedPptxManifestNotFoundError extends Error {}
export class GroundedPptxRevisionNotFoundError extends Error {}

function storageRoot(location: StorageLocation): string {
  return groundedPptxStorageProjectRoot(location);
}

function lockedStorageRoot(context: LockedStorageContext): string {
  if (typeof context.location === 'string') return path.join(context.dataRoot.realPath, ROOT_DIR);
  const key = createHash('sha256').update(context.location.projectId).digest('hex');
  return path.join(context.dataRoot.realPath, key);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function blobRef(relativePath: string, bytes: Uint8Array): GroundedPptxBlobRef {
  return { path: relativePath, sha256: sha256(bytes), size: bytes.byteLength };
}

async function assertDirectoryNotSymlink(target: string): Promise<void> {
  const info = await lstat(target);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`grounded PPTX path is not a safe directory: ${path.basename(target)}`);
  }
}

async function assertRegularFileNotSymlink(target: string): Promise<void> {
  const info = await lstat(target);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`grounded PPTX path is not a safe regular file: ${path.basename(target)}`);
  }
}

async function verifyStorageDirectories(
  location: StorageLocation,
  includeLock = false,
  context?: LockedStorageContext,
): Promise<string> {
  const controlled = context ?? await ensureControlledDataRoot(location);
  await revalidateLockedStorageContext(controlled);
  const projectRoot = controlled.dataRoot.realPath;
  const root = context ? lockedStorageRoot(context) : storageRoot(location);
  await assertDirectoryNotSymlink(root);
  const resolvedRoot = await realpath(root);
  if (!resolvedRoot.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error('grounded PPTX storage escapes project root');
  }
  await assertDirectoryNotSymlink(path.join(root, 'source'));
  await assertDirectoryNotSymlink(path.join(root, 'revisions'));
  if (includeLock) await assertDirectoryNotSymlink(path.join(root, '.write-lock'));
  await revalidateLockedStorageContext(controlled);
  return root;
}

async function writeExclusiveNoFollow(target: string, bytes: Uint8Array | string): Promise<void> {
  if (!constants.O_NOFOLLOW) throw new Error('symlink-safe file writes are unsupported on this platform');
  const handle = await open(
    target,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeManifest(
  root: string,
  manifest: GroundedPptxManifest,
  context?: LockedStorageContext,
): Promise<void> {
  if (context) await revalidateLockedStorageContext(context);
  await assertDirectoryNotSymlink(root);
  const target = path.join(root, MANIFEST_FILE);
  const temporary = `${target}.${randomUUID()}.tmp`;
  const serialized = serializeManifest(manifest);
  if (Buffer.byteLength(serialized) > GROUNDED_PPTX_STORAGE_LIMITS.maxManifestBytes) {
    throw new GroundedPptxStorageCapacityError('grounded PPTX manifest size exceeds limit');
  }
  try {
    if (context) await revalidateLockedStorageContext(context);
    await writeExclusiveNoFollow(temporary, serialized);
    if (context) await revalidateLockedStorageContext(context);
    await rename(temporary, target);
  } finally {
    if (!context) {
      await rm(temporary, { force: true });
    } else {
      try {
        await revalidateLockedStorageContext(context);
        await rm(temporary, { force: true });
      } catch {
        // Never clean a temporary path through a replaced storage identity.
      }
    }
  }
}

function serializeManifest(manifest: GroundedPptxManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function isBlobRef(value: unknown): value is GroundedPptxBlobRef {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.path === 'string' && !path.isAbsolute(item.path) &&
    !item.path.split(/[\\/]/).includes('..') && /^[a-f0-9]{64}$/.test(String(item.sha256)) &&
    Number.isSafeInteger(item.size) && (item.size as number) >= 0;
}

function isManifest(value: unknown): value is GroundedPptxManifest {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const source = item.source as Record<string, unknown> | undefined;
  const revisions = item.revisions;
  return item.schemaVersion === 1 && item.mode === 'grounded-pptx' &&
    typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt)) &&
    typeof item.updatedAt === 'string' && !Number.isNaN(Date.parse(item.updatedAt)) &&
    typeof item.currentRevisionId === 'string' && /^r\d{4,}$/.test(item.currentRevisionId) &&
    isBlobRef(source) && source.path === 'source/original.pptx' &&
    typeof source.originalFilename === 'string' && source.originalFilename.length > 0 &&
    (source.projectFilePath === undefined || (
      typeof source.projectFilePath === 'string' && source.projectFilePath.length > 0 &&
      !path.isAbsolute(source.projectFilePath) && !source.projectFilePath.split(/[\\/]/).includes('..')
    )) &&
    Array.isArray(revisions) && revisions.length > 0 && revisions.every((revision, index) => {
      if (!isBlobRef(revision)) return false;
      const candidate = revision as unknown as Record<string, unknown>;
      const number = typeof candidate.id === 'string' && /^r\d{4,}$/.test(candidate.id)
        ? Number.parseInt(candidate.id.slice(1), 10) : Number.NaN;
      const previousId = index === 0 ? null : (revisions[index - 1] as Record<string, unknown>).id;
      const previous = typeof previousId === 'string' ? Number.parseInt(previousId.slice(1), 10) : 0;
      return Number.isSafeInteger(number) && number > 0 && (index === 0 || number > previous) &&
        candidate.path === `revisions/${candidate.id}.pptx` &&
        typeof candidate.createdAt === 'string' && !Number.isNaN(Date.parse(candidate.createdAt));
    }) && revisions.at(-1)?.id === item.currentRevisionId &&
    new Set(revisions.map((revision) => revision.id)).size === revisions.length;
}

async function verifyManifestFileSet(
  root: string,
  manifest: GroundedPptxManifest,
  allowedOrphanRevision?: string,
): Promise<void> {
  const sourceEntries = await readdir(path.join(root, 'source'), { withFileTypes: true });
  if (sourceEntries.length !== 1 || sourceEntries[0]?.name !== 'original.pptx' || !sourceEntries[0].isFile()) {
    throw new Error('invalid grounded PPTX manifest');
  }
  const actual = (await readdir(path.join(root, 'revisions'), { withFileTypes: true }))
    .map((entry) => entry.isFile() ? entry.name : `!${entry.name}`).sort();
  const expected = manifest.revisions.map((revision) => path.basename(revision.path)).sort();
  const allowed = allowedOrphanRevision ? [...expected, allowedOrphanRevision].sort() : expected;
  const matches = (candidate: string[]) =>
    actual.length === candidate.length && actual.every((name, index) => name === candidate[index]);
  if (!matches(expected) && !matches(allowed)) throw new Error('invalid grounded PPTX manifest');
}

async function readGroundedPptxManifestInternal(
  projectDir: StorageLocation,
  verifyFiles: boolean,
  context?: LockedStorageContext,
): Promise<GroundedPptxManifest> {
  let raw: string;
  const projectRoot = context ? lockedStorageRoot(context) : storageRoot(projectDir);
  try {
    const root = await verifyStorageDirectories(projectDir, false, context);
    const manifestPath = path.join(root, MANIFEST_FILE);
    const bytes = await readRegularFileHandle(
      manifestPath, root, GROUNDED_PPTX_STORAGE_LIMITS.maxManifestBytes,
      'grounded PPTX manifest size exceeds limit',
    );
    raw = Buffer.from(bytes).toString('utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      try {
        await lstat(path.join(projectRoot, MANIFEST_FILE));
      } catch (manifestError) {
        if ((manifestError as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new GroundedPptxManifestNotFoundError('grounded PPTX manifest not found');
        }
      }
    }
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('invalid grounded PPTX manifest');
  }
  if (!isManifest(value)) throw new Error('invalid grounded PPTX manifest');
  if (verifyFiles) await verifyManifestFileSet(projectRoot, value);
  return value;
}

export async function readGroundedPptxManifest(projectDir: StorageLocation): Promise<GroundedPptxManifest> {
  return readGroundedPptxManifestInternal(projectDir, true);
}

async function verifyImmutableBlobs(
  projectDir: StorageLocation,
  manifest: GroundedPptxManifest,
  context?: LockedStorageContext,
): Promise<void> {
  const root = await verifyStorageDirectories(projectDir, true, context);
  for (const ref of [manifest.source, ...manifest.revisions]) {
    if (context) await revalidateLockedStorageContext(context);
    const bytes = await readRegularFileHandle(
      path.join(root, ref.path), root, MAX_BLOB_BYTES, 'grounded PPTX blob size exceeds limit',
    );
    if (bytes.byteLength !== ref.size || sha256(bytes) !== ref.sha256) {
      throw new Error('grounded PPTX immutable blob integrity check failed');
    }
  }
  if (context) await revalidateLockedStorageContext(context);
}

async function readVerifiedBlob(projectDir: StorageLocation, ref: GroundedPptxBlobRef): Promise<Uint8Array> {
  const root = await verifyStorageDirectories(projectDir);
  const target = path.join(root, ref.path);
  if (ref.size > MAX_BLOB_BYTES) throw new Error('grounded PPTX blob size exceeds limit');
  const bytes = await readRegularFileHandle(target, root, MAX_BLOB_BYTES, 'grounded PPTX blob size exceeds limit');
  if (bytes.byteLength !== ref.size || sha256(bytes) !== ref.sha256) throw new Error('grounded PPTX blob integrity check failed');
  return bytes;
}

export async function readGroundedPptxRevision(projectDir: StorageLocation, revisionId: string): Promise<Uint8Array> {
  const manifest = await readGroundedPptxManifest(projectDir);
  const revision = manifest.revisions.find((entry) => entry.id === revisionId);
  if (!revision) throw new GroundedPptxRevisionNotFoundError(`grounded PPTX revision ${revisionId} not found`);
  return readVerifiedBlob(projectDir, revision);
}

async function rejectUnsafeOrPublishedRoot(root: string): Promise<void> {
  try {
    await assertDirectoryNotSymlink(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const name of ['source', 'revisions', '.write-lock']) {
    try {
      const info = await lstat(path.join(root, name));
      if (info.isSymbolicLink()) throw new Error(`grounded PPTX path is not a safe directory: ${name}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  try {
    await assertRegularFileNotSymlink(path.join(root, MANIFEST_FILE));
    throw new GroundedPptxConflictError('project already has a grounded PPTX source');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  // Legacy partial imports predate atomic publication. After rejecting symlinks,
  // an unpublished tree is safe to discard and reconstruct completely.
  await rm(root, { recursive: true, force: true });
}

/** Stages the complete canonical source and atomically publishes revision r0001. */
export async function importGroundedPptxSource(
  projectDir: StorageLocation,
  bytes: Uint8Array,
  originalFilename: string,
  projectFilePath?: string,
  options: { maxDaemonBytes?: number; maxProjectBytes?: number } = {},
): Promise<GroundedPptxManifest> {
  if (bytes.byteLength > MAX_BLOB_BYTES) {
    throw new GroundedPptxPayloadTooLargeError('grounded PPTX source size exceeds limit');
  }
  return withDaemonStorageLock(projectDir, async (context) => {
    const projectRoot = context.dataRoot.realPath;
    const root = lockedStorageRoot(context);
    await revalidateLockedStorageContext(context);
    await rejectUnsafeOrPublishedRoot(root);
    const now = new Date().toISOString();
    const manifest: GroundedPptxManifest = {
      schemaVersion: 1,
      mode: 'grounded-pptx',
      source: {
        ...blobRef('source/original.pptx', bytes), originalFilename,
        ...(projectFilePath ? { projectFilePath } : {}),
      },
      currentRevisionId: 'r0001',
      revisions: [{ id: 'r0001', ...blobRef('revisions/r0001.pptx', bytes), createdAt: now }],
      createdAt: now,
      updatedAt: now,
    };
    const publicationBytes = bytes.byteLength * 2 + Buffer.byteLength(serializeManifest(manifest));
    if (publicationBytes > (options.maxProjectBytes ?? GROUNDED_PPTX_STORAGE_LIMITS.maxProjectBytes)) {
      throw new GroundedPptxStorageCapacityError('grounded PPTX project storage limit exceeded');
    }
    await assertDaemonQuota(context, publicationBytes,
      options.maxDaemonBytes ?? GROUNDED_PPTX_STORAGE_LIMITS.maxDaemonBytes);
    const stage = path.join(projectRoot, `.grounded-pptx-import-${randomUUID()}`);
    const sourceDir = path.join(stage, 'source');
    const revisionsDir = path.join(stage, 'revisions');
    try {
      await revalidateLockedStorageContext(context);
      await mkdir(stage, { mode: 0o700 });
      await revalidateLockedStorageContext(context);
      await mkdir(sourceDir, { mode: 0o700 });
      await mkdir(revisionsDir, { mode: 0o700 });
      await revalidateLockedStorageContext(context);
      await writeExclusiveNoFollow(path.join(sourceDir, 'original.pptx'), bytes);
      await revalidateLockedStorageContext(context);
      await writeExclusiveNoFollow(path.join(revisionsDir, 'r0001.pptx'), bytes);
      await writeManifest(stage, manifest, context);
      await revalidateLockedStorageContext(context);
      try {
        await rename(stage, root);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST' || (error as NodeJS.ErrnoException).code === 'ENOTEMPTY') {
          throw new GroundedPptxConflictError('project already has a grounded PPTX source');
        }
        throw error;
      }
      return manifest;
    } finally {
      try {
        await revalidateLockedStorageContext(context);
        await rm(stage, { recursive: true, force: true });
      } catch {
        // Never clean a staging path through a replaced storage identity.
      }
    }
  });
}

interface LockOwner { token: string; pid: number }

function processIsAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readLockOwner(lockDir: string): Promise<LockOwner | null> {
  try {
    await assertDirectoryNotSymlink(lockDir);
    const ownerPath = path.join(lockDir, LOCK_OWNER_FILE);
    const bytes = await readRegularFileHandle(ownerPath, lockDir, 4096, 'grounded PPTX lock owner size exceeds limit');
    const value = JSON.parse(Buffer.from(bytes).toString('utf8')) as Partial<LockOwner>;
    return typeof value.token === 'string' && Number.isSafeInteger(value.pid)
      ? { token: value.token, pid: value.pid! } : null;
  } catch {
    return null;
  }
}

async function acquireFilesystemLock(root: string, lockName: string, label: string): Promise<LockOwner> {
  const lockDir = path.join(root, lockName);
  const owner = { token: randomUUID(), pid: process.pid };
  const busy = () => new Error(`grounded PPTX ${label} already in progress`);
  try {
    await mkdir(lockDir, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existingInfo = await lstat(lockDir);
    if (existingInfo.isSymbolicLink() || !existingInfo.isDirectory()) {
      throw new Error(`grounded PPTX ${label} lock path is not a safe directory`);
    }
    const existing = await readLockOwner(lockDir);
    if (existing && processIsAlive(existing.pid)) throw busy();
    if (!existing && Date.now() - existingInfo.mtimeMs <= OWNER_PUBLICATION_GRACE_MS) throw busy();
    const claimPath = path.join(lockDir, '.recovery-claim');
    try {
      await writeExclusiveNoFollow(claimPath, randomUUID());
    } catch (claimError) {
      if (['EEXIST', 'ENOENT'].includes((claimError as NodeJS.ErrnoException).code ?? '')) throw busy();
      throw claimError;
    }
    const revalidatedInfo = await lstat(lockDir);
    const revalidatedOwner = await readLockOwner(lockDir);
    if (revalidatedInfo.dev !== existingInfo.dev || revalidatedInfo.ino !== existingInfo.ino ||
        revalidatedInfo.isSymbolicLink() || revalidatedOwner?.token !== existing?.token ||
        revalidatedOwner?.pid !== existing?.pid ||
        (revalidatedOwner !== null && processIsAlive(revalidatedOwner.pid))) {
      await rm(claimPath, { force: true }).catch(() => undefined);
      throw busy();
    }
    const tombstone = path.join(root, `.${lockName}-stale-${randomUUID()}`);
    try {
      await rename(lockDir, tombstone);
    } catch (renameError) {
      if ((renameError as NodeJS.ErrnoException).code === 'ENOENT') throw busy();
      throw renameError;
    }
    await rm(tombstone, { recursive: true, force: true });
    try {
      await mkdir(lockDir, { mode: 0o700 });
    } catch {
      throw busy();
    }
  }
  try {
    await writeExclusiveNoFollow(path.join(lockDir, LOCK_OWNER_FILE), JSON.stringify(owner));
    return owner;
  } catch (error) {
    await rm(lockDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function releaseFilesystemLock(root: string, lockName: string, owner: LockOwner): Promise<void> {
  const lockDir = path.join(root, lockName);
  const current = await readLockOwner(lockDir);
  if (current?.token === owner.token) await rm(lockDir, { recursive: true, force: true });
}

async function acquireWriteLock(root: string): Promise<LockOwner> {
  return acquireFilesystemLock(root, PROJECT_LOCK_DIR, 'revision write');
}

async function releaseWriteLock(root: string, owner: LockOwner): Promise<void> {
  await releaseFilesystemLock(root, PROJECT_LOCK_DIR, owner);
}

export async function withGroundedPptxWriteLock<T>(
  projectDir: StorageLocation,
  operation: () => Promise<T>,
): Promise<T> {
  const root = await verifyStorageDirectories(projectDir);
  const owner = await acquireWriteLock(root);
  try {
    return await operation();
  } finally {
    await releaseWriteLock(root, owner);
  }
}

export async function commitGroundedPptxRevision(
  projectDir: StorageLocation,
  bytes: Uint8Array,
  options: {
    expectedCurrentRevisionId: string;
    maxRevisions?: number;
    maxProjectBytes?: number;
    maxDaemonBytes?: number;
  },
): Promise<GroundedPptxManifest> {
  if (bytes.byteLength > MAX_BLOB_BYTES) {
    throw new GroundedPptxPayloadTooLargeError('grounded PPTX revision size exceeds limit');
  }
  return withDaemonStorageLock(projectDir, async (context) => {
    const root = await verifyStorageDirectories(projectDir, false, context);
    const owner = await acquireWriteLock(root);
    try {
      await revalidateLockedStorageContext(context);
      await verifyStorageDirectories(projectDir, true, context);
      const manifest = await readGroundedPptxManifestInternal(projectDir, false, context);
      if (manifest.currentRevisionId !== options.expectedCurrentRevisionId) {
        throw new GroundedPptxConflictError(`stale grounded PPTX revision: expected ${options.expectedCurrentRevisionId}, current is ${manifest.currentRevisionId}`);
      }
      const current = manifest.revisions.find((entry) => entry.id === manifest.currentRevisionId)!;
      if (sha256(bytes) === current.sha256 && bytes.byteLength === current.size) {
        throw new GroundedPptxConflictError('grounded PPTX mutation is a no-op');
      }
      const maxRevisions = options.maxRevisions ?? GROUNDED_PPTX_STORAGE_LIMITS.maxRevisions;
      if (manifest.revisions.length >= maxRevisions) throw new GroundedPptxStorageCapacityError('grounded PPTX revision limit exceeded');

      const currentNumber = Number.parseInt(manifest.currentRevisionId.slice(1), 10);
      if (!Number.isSafeInteger(currentNumber)) throw new Error('invalid current grounded PPTX revision');
      const revisionId = `r${String(currentNumber + 1).padStart(4, '0')}`;
      const relativePath = `revisions/${revisionId}.pptx`;
      const revisionPath = path.join(root, relativePath);
      await verifyManifestFileSet(root, manifest, path.basename(relativePath));
      await verifyImmutableBlobs(projectDir, manifest, context);
      await revalidateLockedStorageContext(context);
      await assertDirectoryNotSymlink(path.dirname(revisionPath));
      try {
        const orphan = await lstat(revisionPath);
        if (orphan.isSymbolicLink() || !orphan.isFile()) throw new Error('grounded PPTX unpublished revision is unsafe');
        await revalidateLockedStorageContext(context);
        await rm(revisionPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }

      const now = new Date().toISOString();
      const next: GroundedPptxManifest = {
        ...manifest,
        currentRevisionId: revisionId,
        revisions: [...manifest.revisions, { id: revisionId, ...blobRef(relativePath, bytes), createdAt: now }],
        updatedAt: now,
      };
      const oldManifestBytes = (await lstat(path.join(root, MANIFEST_FILE))).size;
      const publicationDelta = bytes.byteLength + Buffer.byteLength(serializeManifest(next)) - oldManifestBytes;
      await revalidateLockedStorageContext(context);
      const currentProjectBytes = await persistedStorageBytes(root);
      await revalidateLockedStorageContext(context);
      const maxProjectBytes = options.maxProjectBytes ?? GROUNDED_PPTX_STORAGE_LIMITS.maxProjectBytes;
      if (currentProjectBytes + publicationDelta > maxProjectBytes) {
        throw new GroundedPptxStorageCapacityError('grounded PPTX project storage limit exceeded');
      }
      await assertDaemonQuota(context, publicationDelta,
        options.maxDaemonBytes ?? GROUNDED_PPTX_STORAGE_LIMITS.maxDaemonBytes);
      await verifyStorageDirectories(projectDir, true, context);
      await revalidateLockedStorageContext(context);
      await writeExclusiveNoFollow(revisionPath, bytes);
      try {
        await writeManifest(root, next, context);
        return next;
      } catch (error) {
        try {
          await revalidateLockedStorageContext(context);
          await rm(revisionPath, { force: true });
        } catch {
          // Never clean a revision path through a replaced storage identity.
        }
        throw error;
      }
    } finally {
      try {
        await revalidateLockedStorageContext(context);
        await releaseWriteLock(root, owner);
      } catch {
        // A replaced pathname no longer names the tree containing our lock.
      }
    }
  });
}

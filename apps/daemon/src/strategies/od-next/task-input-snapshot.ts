import {
  OD_NEXT_REQUEST_INPUT_FACTS_SCHEMA_V1,
  OD_NEXT_TASK_CONFIGURATION_SCHEMA_V1,
  serializeOdNextAttachmentFactsV1,
  serializeOdNextRequestInputFactsV1,
  serializeOdNextWorkspaceInputFactsV1,
  serializeOdNextTaskConfigurationV1,
  type MediaExecutionPolicy,
  type OdNextAttachmentFactV1,
  type OdNextProductionTaskTypeV1,
  type OdNextRequestInputFactsV1,
  type OdNextTaskConfigurationV1,
} from '@open-design/contracts';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { redactSecrets } from '../../redact.js';

const SNAPSHOT_SCHEMA = 'open-design.od-next-task-input-snapshot/v1' as const;
export const DEFAULT_OD_NEXT_ATTACHMENT_FILE_CAP_BYTES = 16 * 1024 * 1024;
export const DEFAULT_OD_NEXT_ATTACHMENT_TOTAL_CAP_BYTES = 32 * 1024 * 1024;
export const DEFAULT_OD_NEXT_ATTACHMENT_COUNT_CAP = 32;
export const DEFAULT_OD_NEXT_INPUT_MANIFEST_CAP_BYTES = 1024 * 1024;

export class OdNextTaskInputSnapshotError extends Error {
  constructor(message: string, readonly code = 'OD_NEXT_INPUT_SNAPSHOT_INVALID') {
    super(message);
    this.name = 'OdNextTaskInputSnapshotError';
  }
}

export interface OdNextTaskInputSnapshotDescriptor {
  taskExecutionId: string;
  snapshotDir: string;
  manifestSha256: string;
}

type SnapshotSource = {
  kind: 'file' | 'image';
  sourcePath: string;
  allowedRoot: string;
};

export type SnapshotFile = {
  id: string;
  relativePath: string;
  kind: 'file' | 'image';
  mediaType: string;
  bytes: number;
  sha256: string;
};

type SnapshotManifest = {
  schema: typeof SNAPSHOT_SCHEMA;
  taskExecutionId: string;
  taskConfiguration: OdNextTaskConfigurationV1;
  requestInputFacts: OdNextRequestInputFactsV1;
  files: SnapshotFile[];
};

export interface LoadedOdNextTaskInputSnapshot {
  taskConfigText: string;
  requestInputText: string;
  taskType: string;
  attachmentFactsText: string;
  workspaceInputFactsText: string;
  attachmentReferences: string[];
  attachmentPaths: string[];
  imagePaths: string[];
  snapshotDir: string;
  files: Array<SnapshotFile & { content: Buffer }>;
}

export interface OdNextRunInputProjection {
  taskConfigText: string;
  requestInputText: string;
  attachmentReferences: string[];
  attachmentPaths: string[];
  imagePaths: string[];
  projectionDir: string;
  projectionAccessRoot: string;
}

export interface SnapshotReadLimits {
  manifestCapBytes?: number;
  fileCapBytes?: number;
  totalCapBytes?: number;
  countCap?: number;
}

export interface SnapshotReadHooks {
  beforeOpenManifest?: (manifestPath: string) => void;
  beforeOpenFile?: (filePath: string) => void;
}

export interface SnapshotCleanupHooks {
  beforeLookupSnapshot?: (snapshotsRoot: string) => void;
  beforeClaimSnapshot?: (snapshotDir: string) => void;
  beforeRemoveClaimedSnapshot?: (claimedSnapshotDir: string) => void;
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (
    relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative)
  );
}

function safeTaskId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    throw new OdNextTaskInputSnapshotError('OD Next task execution id is not a safe path segment.');
  }
  return value;
}

function cleanupErrorCode(error: unknown): string {
  if (error instanceof OdNextTaskInputSnapshotError) return error.code;
  const code = (error as NodeJS.ErrnoException)?.code;
  return typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : 'UNKNOWN';
}

function warnSnapshotCleanupFailure(
  phase: OdNextTaskInputCleanupPhase,
  taskExecutionId: string,
  error: unknown,
): void {
  console.warn(
    `[od-next-task-input] cleanup failed phase=${phase} task=${taskExecutionId} code=${cleanupErrorCode(error)}`,
  );
}

export type OdNextTaskInputCleanupPhase =
  | 'create'
  | 'replace-partial'
  | 'initial-bundle'
  | 'run-claim'
  | 'non-ready';

/** Remove a claimed tree with the host's reparse-aware removal primitive. */
function removeSnapshotTreeWithPlatformPrimitive(target: string): void {
  if (process.platform !== 'win32') {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 3 });
    return;
  }

  // Node 24's Windows recursive remover can enumerate through a junction that
  // replaces a descendant mid-walk. The Windows `rmdir` primitive detects
  // reparse entries during its own traversal and removes the entry rather than
  // enumerating its target. Pass the attacker-influenced path through an
  // environment value so cmd never parses it as command syntax.
  const result = spawnSync(
    process.env.ComSpec ?? process.env.COMSPEC ?? 'cmd.exe',
    ['/d', '/v:off', '/s', '/c', 'rmdir /s /q "%OD_SNAPSHOT_DELETE_TARGET%"'],
    {
      env: { ...process.env, OD_SNAPSHOT_DELETE_TARGET: target },
      stdio: 'ignore',
      windowsVerbatimArguments: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new OdNextTaskInputSnapshotError(
      'OD Next task input cleanup failed in the Windows directory remover.',
      'OD_NEXT_INPUT_SNAPSHOT_CLEANUP_FAILED',
    );
  }
}

function removeManagedSnapshotDir(input: {
  snapshotsRoot: string;
  taskExecutionId: string;
  snapshotDir: string;
  hooks?: SnapshotCleanupHooks;
}): void {
  const snapshotsRoot = path.resolve(input.snapshotsRoot);
  const taskExecutionId = safeTaskId(input.taskExecutionId);
  const expectedSnapshotDir = path.join(snapshotsRoot, taskExecutionId);
  const snapshotDir = path.resolve(input.snapshotDir);
  if (path.relative(expectedSnapshotDir, snapshotDir) !== '') {
    throw new OdNextTaskInputSnapshotError(
      'OD Next task input snapshot is outside its managed root.',
    );
  }

  let rootStat: fs.BigIntStats;
  try {
    rootStat = fs.lstatSync(snapshotsRoot, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return;
    throw error;
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new OdNextTaskInputSnapshotError(
      'OD Next snapshot root must be a managed non-symlink directory.',
    );
  }

  input.hooks?.beforeLookupSnapshot?.(snapshotsRoot);
  let snapshotStat: fs.BigIntStats;
  try {
    snapshotStat = fs.lstatSync(snapshotDir, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return;
    throw error;
  }
  if (snapshotStat.isSymbolicLink() || !snapshotStat.isDirectory()) {
    throw new OdNextTaskInputSnapshotError(
      'OD Next task input snapshot must be a managed non-symlink directory.',
    );
  }

  const rootAfterLookup = fs.lstatSync(snapshotsRoot, { bigint: true });
  if (
    rootAfterLookup.isSymbolicLink()
    || !rootAfterLookup.isDirectory()
    || !sameIdentity(rootStat, rootAfterLookup)
  ) {
    throw new OdNextTaskInputSnapshotError(
      'OD Next snapshot root changed before cleanup could claim its child.',
      'OD_NEXT_INPUT_SNAPSHOT_TOCTOU',
    );
  }

  // Claim the checked entry with one atomic rename before resolving any path
  // for mutation. The random name prevents ordinary producers from finding or
  // reusing the private deletion path while cleanup walks it. Rechecking the
  // identity after rename makes a swap between lstat and rename fail closed:
  // traversal never runs against the replacement (including a junction).
  const claimedSnapshotDir = path.join(
    snapshotsRoot,
    `.deleting-${taskExecutionId}-${randomBytes(16).toString('hex')}`,
  );
  // Linux exposes an opened directory as a traversable procfs path. Darwin's
  // /dev/fd entry is only a synthetic descriptor node: its device identity
  // differs from the directory and child paths cannot be resolved through it.
  // Keep the documented pathname claim on platforms without Linux procfs.
  const rootFd = process.platform === 'linux'
    ? fs.openSync(
        snapshotsRoot,
        fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
      )
    : undefined;
  try {
    const boundRoot = rootFd === undefined
      ? snapshotsRoot
      : `/proc/self/fd/${rootFd}`;
    if (rootFd !== undefined) {
      const openedRootStat = fs.fstatSync(rootFd, { bigint: true });
      const boundRootStat = fs.statSync(boundRoot, { bigint: true });
      if (!sameIdentity(rootStat, openedRootStat) || !sameIdentity(rootStat, boundRootStat)) {
        throw new OdNextTaskInputSnapshotError(
          'OD Next snapshot root changed before cleanup could open it.',
          'OD_NEXT_INPUT_SNAPSHOT_TOCTOU',
        );
      }
    }

    input.hooks?.beforeClaimSnapshot?.(snapshotDir);
    const boundSnapshotDir = path.join(boundRoot, taskExecutionId);
    const boundClaimedSnapshotDir = path.join(boundRoot, path.basename(claimedSnapshotDir));
    fs.renameSync(boundSnapshotDir, boundClaimedSnapshotDir);
    const rootAfterClaim = fs.lstatSync(snapshotsRoot, { bigint: true });
    const claimedStat = fs.lstatSync(boundClaimedSnapshotDir, { bigint: true });
    if (
      rootAfterClaim.isSymbolicLink()
      || !rootAfterClaim.isDirectory()
      || !sameIdentity(rootStat, rootAfterClaim)
      || claimedStat.isSymbolicLink()
      || !claimedStat.isDirectory()
      || !sameIdentity(snapshotStat, claimedStat)
    ) {
      throw new OdNextTaskInputSnapshotError(
        'OD Next task input snapshot changed before cleanup could claim it.',
        'OD_NEXT_INPUT_SNAPSHOT_TOCTOU',
      );
    }
    input.hooks?.beforeRemoveClaimedSnapshot?.(claimedSnapshotDir);
    removeSnapshotTreeWithPlatformPrimitive(boundClaimedSnapshotDir);
  } finally {
    if (rootFd !== undefined) fs.closeSync(rootFd);
  }
}

function sameIdentity(
  stat: fs.BigIntStats,
  opened: fs.BigIntStats,
): boolean {
  return stat.dev === opened.dev && stat.ino === opened.ino;
}

function readFdBounded(
  fd: number,
  expectedSize: bigint,
  maxBytes: number,
  changedMessage: string,
): Buffer {
  if (expectedSize < 0n || expectedSize > BigInt(maxBytes)) {
    throw new OdNextTaskInputSnapshotError(
      'OD Next input exceeds its byte cap.',
      'OD_NEXT_INPUT_SNAPSHOT_OVERSIZE',
    );
  }
  const expected = Number(expectedSize);
  const buffer = Buffer.allocUnsafe(expected + 1);
  let offset = 0;
  while (offset < buffer.length) {
    const read = fs.readSync(fd, buffer, offset, buffer.length - offset, null);
    if (read === 0) break;
    offset += read;
  }
  if (offset !== expected) {
    throw new OdNextTaskInputSnapshotError(
      changedMessage,
      'OD_NEXT_INPUT_SNAPSHOT_TOCTOU',
    );
  }
  return buffer.subarray(0, expected);
}

function readOnlyNoFollowFlags(): number {
  if (typeof fs.constants.O_NOFOLLOW === 'number') {
    return fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
  }
  if (process.platform === 'win32') return fs.constants.O_RDONLY;
  throw new OdNextTaskInputSnapshotError(
    'OD Next cannot safely open managed input files on this platform.',
    'OD_NEXT_INPUT_SNAPSHOT_UNSUPPORTED',
  );
}

/**
 * Open a previously lstat-verified regular file without reading from a raced
 * replacement. POSIX rejects a final symlink in the kernel with O_NOFOLLOW.
 * Node does not expose that flag on Windows, so the read-only handle is
 * accepted only when fstat proves it still has the exact lstat identity. The
 * caller verifies path components before opening and file metadata after the
 * bounded read, closing the remaining Windows TOCTOU windows without a native
 * dependency.
 */
function openVerifiedReadOnly(
  filePath: string,
  pathStat: fs.BigIntStats,
  changedMessage: string,
): { fd: number; stat: fs.BigIntStats } {
  const fd = fs.openSync(filePath, readOnlyNoFollowFlags());
  try {
    const stat = fs.fstatSync(fd, { bigint: true });
    if (!stat.isFile() || !sameIdentity(pathStat, stat)) {
      throw new OdNextTaskInputSnapshotError(
        changedMessage,
        'OD_NEXT_INPUT_SNAPSHOT_TOCTOU',
      );
    }
    return { fd, stat };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function assertManagedPathHasNoSymlinkComponents(
  managedRoot: string,
  targetPath: string,
): void {
  const root = path.resolve(managedRoot);
  const target = path.resolve(targetPath);
  if (!within(root, target)) {
    throw new OdNextTaskInputSnapshotError(
      'OD Next managed input escapes its managed root.',
    );
  }
  const relative = path.relative(root, target);
  const segments = relative.split(path.sep).filter(Boolean);
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new OdNextTaskInputSnapshotError(
        'OD Next managed input path contains a symlink or non-directory component.',
      );
    }
  }
  const real = fs.realpathSync(target);
  if (!within(fs.realpathSync(root), real)) {
    throw new OdNextTaskInputSnapshotError(
      'OD Next managed input realpath escapes its managed root.',
    );
  }
}

function mediaTypeFromBytes(bytes: Buffer): { mediaType: string; extension: string } {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mediaType: 'image/png', extension: '.png' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mediaType: 'image/jpeg', extension: '.jpg' };
  }
  if (bytes.length >= 6 && /GIF8[79]a/.test(bytes.toString('ascii', 0, 6))) {
    return { mediaType: 'image/gif', extension: '.gif' };
  }
  if (
    bytes.length >= 12
    && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mediaType: 'image/webp', extension: '.webp' };
  }
  if (bytes.length >= 5 && bytes.toString('ascii', 0, 5) === '%PDF-') {
    return { mediaType: 'application/pdf', extension: '.pdf' };
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2] ?? -1)) {
    return { mediaType: 'application/zip', extension: '.zip' };
  }
  const decoded = bytes.toString('utf8');
  if (!decoded.includes('\uFFFD') && Buffer.from(decoded).equals(bytes)) {
    const head = decoded.trimStart().toLowerCase();
    if (head.startsWith('<svg')) return { mediaType: 'image/svg+xml', extension: '.svg' };
    if (head.startsWith('<!doctype html') || head.startsWith('<html')) {
      return { mediaType: 'text/html', extension: '.html' };
    }
    if (head.startsWith('{') || head.startsWith('[')) {
      try {
        JSON.parse(decoded);
        return { mediaType: 'application/json', extension: '.json' };
      } catch {
        // Valid UTF-8, but not valid JSON: keep the generic text identity.
      }
    }
    return { mediaType: 'text/plain', extension: '.txt' };
  }
  return { mediaType: 'application/octet-stream', extension: '.bin' };
}

function readSourceWithoutFollowingSymlinks(
  source: SnapshotSource,
  maxBytes: number,
  beforeOpenSource?: (sourcePath: string) => void,
  afterReadSource?: (sourcePath: string) => void,
): Buffer {
  const declaredRoot = path.resolve(source.allowedRoot);
  const resolved = path.resolve(declaredRoot, source.sourcePath);
  if (!within(declaredRoot, resolved)) {
    throw new OdNextTaskInputSnapshotError('OD Next attachment escapes its allowed root.');
  }
  assertManagedPathHasNoSymlinkComponents(declaredRoot, resolved);
  const linkStat = fs.lstatSync(resolved, { bigint: true });
  if (linkStat.isSymbolicLink() || !linkStat.isFile()) {
    throw new OdNextTaskInputSnapshotError('OD Next attachments must be regular non-symlink files.');
  }
  const root = fs.realpathSync(declaredRoot);
  const real = fs.realpathSync(resolved);
  if (!within(root, real)) {
    throw new OdNextTaskInputSnapshotError('OD Next attachment realpath escapes its allowed root.');
  }
  beforeOpenSource?.(resolved);
  const opened = openVerifiedReadOnly(
    resolved,
    linkStat,
    'OD Next attachment changed between path validation and open.',
  );
  const { fd, stat: before } = opened;
  try {
    if (before.size > BigInt(maxBytes)) {
      throw new OdNextTaskInputSnapshotError('OD Next attachment exceeds the per-file byte cap.', 'OD_NEXT_INPUT_SNAPSHOT_OVERSIZE');
    }
    const bytes = readFdBounded(
      fd,
      before.size,
      maxBytes,
      'OD Next attachment changed while it was being frozen.',
    );
    afterReadSource?.(resolved);
    const after = fs.fstatSync(fd, { bigint: true });
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs
      || BigInt(bytes.length) !== after.size
    ) {
      throw new OdNextTaskInputSnapshotError('OD Next attachment changed while it was being frozen.', 'OD_NEXT_INPUT_SNAPSHOT_TOCTOU');
    }
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

function normalizeLocale(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'und';
  try {
    return new Intl.Locale(value.trim().replaceAll('_', '-')).toString();
  } catch {
    return 'und';
  }
}

function safeOptionalConfig(value: unknown, field: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    return undefined;
  }
  if (redactSecrets(normalized) !== normalized) {
    throw new OdNextTaskInputSnapshotError(
      `OD Next ${field} contains secret or credential-shaped content.`,
    );
  }
  return normalized;
}

export function buildOdNextTaskConfigurationV1(input: {
  taskType: OdNextProductionTaskTypeV1;
  locale?: unknown;
  selectedAgentId: string;
  sessionMode?: unknown;
  model?: unknown;
  reasoning?: unknown;
  serviceTier?: unknown;
  mediaExecution: MediaExecutionPolicy;
  route?: 'direct_edit' | 'full_plan';
  mode?: 'simple' | 'complex' | 'unresolved';
}): OdNextTaskConfigurationV1 {
  const selectedAgentId = safeOptionalConfig(input.selectedAgentId, 'selected agent id');
  if (!selectedAgentId || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(selectedAgentId)) {
    throw new OdNextTaskInputSnapshotError('OD Next selected agent id is invalid.');
  }
  const sessionMode = input.sessionMode === 'chat' || input.sessionMode === 'plan'
    ? input.sessionMode
    : 'design';
  const allowedSurfaces = input.mediaExecution.allowedSurfaces
    ? [...new Set(input.mediaExecution.allowedSurfaces)].sort()
    : undefined;
  const allowedModels = input.mediaExecution.allowedModels
    ? [...new Set(input.mediaExecution.allowedModels
        .map((value) => safeOptionalConfig(value, 'media allowed model'))
        .filter((value): value is string => Boolean(value)))].sort()
    : undefined;
  const model = safeOptionalConfig(input.model, 'model selection');
  const reasoning = safeOptionalConfig(input.reasoning, 'reasoning selection');
  const serviceTier = safeOptionalConfig(input.serviceTier, 'service tier selection');
  return {
    schema: OD_NEXT_TASK_CONFIGURATION_SCHEMA_V1,
    taskType: input.taskType,
    locale: normalizeLocale(input.locale),
    selectedAgentId,
    route: input.route ?? 'full_plan',
    mode: input.mode ?? 'unresolved',
    configuration: {
      sessionMode,
      ...(model ? { model } : {}),
      ...(reasoning ? { reasoning } : {}),
      ...(serviceTier ? { serviceTier } : {}),
      mediaExecution: {
        mode: input.mediaExecution.mode,
        ...(allowedSurfaces ? { allowedSurfaces } : {}),
        ...(allowedModels ? { allowedModels } : {}),
      },
    },
  };
}

export function createOdNextTaskInputSnapshot(input: {
  snapshotsRoot: string;
  taskExecutionId: string;
  taskConfiguration: OdNextTaskConfigurationV1;
  projectRoot: string;
  projectAttachments?: readonly string[];
  uploadRoot: string;
  imagePaths?: readonly string[];
  commentCount?: number;
  linkedDirectoryCount?: number;
  mcpServerCount?: number;
  fileCapBytes?: number;
  totalCapBytes?: number;
  countCap?: number;
  beforeOpenSource?: (sourcePath: string) => void;
  afterReadSource?: (sourcePath: string) => void;
}): OdNextTaskInputSnapshotDescriptor {
  const taskExecutionId = safeTaskId(input.taskExecutionId);
  const sources: SnapshotSource[] = [
    ...(input.projectAttachments ?? []).map((sourcePath) => ({
      kind: 'file' as const,
      sourcePath,
      allowedRoot: input.projectRoot,
    })),
    ...(input.imagePaths ?? []).map((sourcePath) => ({
      kind: 'image' as const,
      sourcePath,
      allowedRoot: input.uploadRoot,
    })),
  ];
  const countCap = input.countCap ?? DEFAULT_OD_NEXT_ATTACHMENT_COUNT_CAP;
  if (sources.length > countCap) {
    throw new OdNextTaskInputSnapshotError('OD Next attachment count exceeds the task cap.', 'OD_NEXT_INPUT_SNAPSHOT_OVERSIZE');
  }
  const snapshotsRoot = path.resolve(input.snapshotsRoot);
  const snapshotDir = path.join(snapshotsRoot, taskExecutionId);
  const attachmentsDir = path.join(snapshotDir, 'attachments');
  const fileCap = input.fileCapBytes ?? DEFAULT_OD_NEXT_ATTACHMENT_FILE_CAP_BYTES;
  const totalCap = input.totalCapBytes ?? DEFAULT_OD_NEXT_ATTACHMENT_TOTAL_CAP_BYTES;
  const files: SnapshotFile[] = [];
  const facts: OdNextAttachmentFactV1[] = [];
  let total = 0;
  let snapshotCleanupAllowed = false;
  try {
    fs.mkdirSync(snapshotsRoot, { recursive: true, mode: 0o700 });
    const rootStat = fs.lstatSync(snapshotsRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new OdNextTaskInputSnapshotError(
        'OD Next snapshot root must be a managed non-symlink directory.',
      );
    }
    try {
      fs.mkdirSync(snapshotDir, { recursive: false, mode: 0o700 });
      snapshotCleanupAllowed = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error;
      const existingStat = fs.lstatSync(snapshotDir);
      if (existingStat.isSymbolicLink() || !existingStat.isDirectory()) {
        throw new OdNextTaskInputSnapshotError(
          'OD Next partial snapshot path must be a non-symlink directory.',
        );
      }
      if (fs.existsSync(path.join(snapshotDir, 'manifest.json'))) {
        throw new OdNextTaskInputSnapshotError(
          'OD Next canonical task input snapshot already exists.',
          'OD_NEXT_INPUT_SNAPSHOT_EXISTS',
        );
      }
      // A task id is single-writer under the assistant/task claim. An entry
      // here is therefore a partial initialization left before that claim
      // committed, not a reusable canonical snapshot.
      try {
        removeManagedSnapshotDir({ snapshotsRoot, taskExecutionId, snapshotDir });
      } catch (cleanupError) {
        warnSnapshotCleanupFailure('replace-partial', taskExecutionId, cleanupError);
        throw cleanupError;
      }
      fs.mkdirSync(snapshotDir, { recursive: false, mode: 0o700 });
      snapshotCleanupAllowed = true;
    }
    fs.mkdirSync(attachmentsDir, { recursive: false, mode: 0o700 });
    sources.forEach((source, index) => {
      let bytes: Buffer;
      try {
        bytes = readSourceWithoutFollowingSymlinks(
          source,
          fileCap,
          input.beforeOpenSource,
          input.afterReadSource,
        );
      } catch (error) {
        if (error instanceof OdNextTaskInputSnapshotError) throw error;
        throw new OdNextTaskInputSnapshotError(
          'OD Next attachment could not be read and frozen safely.',
        );
      }
      total += bytes.length;
      if (total > totalCap) {
        throw new OdNextTaskInputSnapshotError('OD Next attachments exceed the task byte cap.', 'OD_NEXT_INPUT_SNAPSHOT_OVERSIZE');
      }
      const identity = sha256(bytes);
      const type = mediaTypeFromBytes(bytes);
      if (source.kind === 'image' && !type.mediaType.startsWith('image/')) {
        throw new OdNextTaskInputSnapshotError('OD Next image attachment bytes are not a supported image type.', 'OD_NEXT_INPUT_SNAPSHOT_TYPE_MISMATCH');
      }
      const id = `attachment-${String(index + 1).padStart(3, '0')}`;
      const relativePath = `attachments/${id}${type.extension}`;
      const destination = path.join(snapshotDir, relativePath);
      const fd = fs.openSync(destination, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o400);
      try {
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      const frozen = fs.readFileSync(destination);
      if (frozen.length !== bytes.length || sha256(frozen) !== identity) {
        throw new OdNextTaskInputSnapshotError('OD Next frozen attachment failed digest verification.');
      }
      files.push({
        id,
        relativePath,
        kind: source.kind,
        mediaType: type.mediaType,
        bytes: frozen.length,
        sha256: identity,
      });
      facts.push({
        id,
        order: index + 1,
        kind: source.kind,
        reference: `task-input:${relativePath}`,
        mediaType: type.mediaType,
        bytes: frozen.length,
        sha256: identity,
      });
    });
    const linkedDirectoryCount = Math.max(0, Math.floor(input.linkedDirectoryCount ?? 0));
    const requestInputFacts: OdNextRequestInputFactsV1 = {
      schema: OD_NEXT_REQUEST_INPUT_FACTS_SCHEMA_V1,
      attachmentTransport: {
        scheme: 'task-input',
        rootEnvironmentVariable: 'OD_TASK_INPUT_DIR',
        access: 'out_of_band',
      },
      attachments: facts,
      comments: { count: Math.max(0, Math.floor(input.commentCount ?? 0)) },
      workspace: {
        project: { reference: 'workspace:project', access: 'out_of_band' },
        linkedDirectories: Array.from({ length: linkedDirectoryCount }, (_, index) => ({
          reference: `linked-dir:${index + 1}`,
          access: 'out_of_band' as const,
        })),
      },
      mcp: {
        serverCount: Math.max(0, Math.floor(input.mcpServerCount ?? 0)),
        registration: 'out_of_band',
      },
    };
    const manifest: SnapshotManifest = {
      schema: SNAPSHOT_SCHEMA,
      taskExecutionId,
      taskConfiguration: input.taskConfiguration,
      requestInputFacts,
      files,
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest));
    const manifestPath = path.join(snapshotDir, 'manifest.json');
    fs.writeFileSync(manifestPath, manifestBytes, { flag: 'wx', mode: 0o400 });
    return { taskExecutionId, snapshotDir, manifestSha256: sha256(manifestBytes) };
  } catch (error) {
    if (snapshotCleanupAllowed) {
      try {
        removeManagedSnapshotDir({ snapshotsRoot, taskExecutionId, snapshotDir });
      } catch (cleanupError) {
        warnSnapshotCleanupFailure('create', taskExecutionId, cleanupError);
      }
    }
    throw error;
  }
}

function parseManifest(bytes: Buffer): SnapshotManifest {
  let parsed: SnapshotManifest;
  try {
    parsed = JSON.parse(bytes.toString('utf8')) as SnapshotManifest;
  } catch {
    throw new OdNextTaskInputSnapshotError('OD Next task input manifest is not valid JSON.');
  }
  if (
    parsed?.schema !== SNAPSHOT_SCHEMA
    || typeof parsed.taskExecutionId !== 'string'
    || !Array.isArray(parsed.files)
    || parsed.taskConfiguration?.schema !== OD_NEXT_TASK_CONFIGURATION_SCHEMA_V1
    || parsed.requestInputFacts?.schema !== OD_NEXT_REQUEST_INPUT_FACTS_SCHEMA_V1
    || parsed.requestInputFacts.attachmentTransport?.scheme !== 'task-input'
    || parsed.requestInputFacts.attachmentTransport?.rootEnvironmentVariable
      !== 'OD_TASK_INPUT_DIR'
    || parsed.requestInputFacts.attachmentTransport?.access !== 'out_of_band'
  ) {
    throw new OdNextTaskInputSnapshotError('OD Next task input manifest is invalid.');
  }
  return parsed;
}

function readManagedSnapshotFile(
  filePath: string,
  maxBytes: number,
  managedRoot: string,
  beforeOpen?: (filePath: string) => void,
): Buffer {
  assertManagedPathHasNoSymlinkComponents(managedRoot, filePath);
  const pathStat = fs.lstatSync(filePath, { bigint: true });
  if (pathStat.isSymbolicLink() || !pathStat.isFile()) {
    throw new OdNextTaskInputSnapshotError(
      'OD Next managed input must be a regular non-symlink file.',
    );
  }
  beforeOpen?.(filePath);
  const opened = openVerifiedReadOnly(
    filePath,
    pathStat,
    'OD Next managed input changed between path validation and open.',
  );
  const { fd, stat: before } = opened;
  try {
    const bytes = readFdBounded(
      fd,
      before.size,
      maxBytes,
      'OD Next managed input changed while it was being verified.',
    );
    const after = fs.fstatSync(fd, { bigint: true });
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs
    ) {
      throw new OdNextTaskInputSnapshotError(
        'OD Next managed input changed while it was being verified.',
        'OD_NEXT_INPUT_SNAPSHOT_TOCTOU',
      );
    }
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}

function removeRunProjectionTree(target: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fs.unlinkSync(target);
    return;
  }
  fs.chmodSync(target, 0o700);
  for (const entry of fs.readdirSync(target)) {
    removeRunProjectionTree(path.join(target, entry));
  }
  fs.rmdirSync(target);
}

export function loadOdNextTaskInputSnapshot(
  descriptor: OdNextTaskInputSnapshotDescriptor,
  snapshotsRoot: string,
  limits: SnapshotReadLimits = {},
  hooks: SnapshotReadHooks = {},
): LoadedOdNextTaskInputSnapshot {
  const rootPath = path.resolve(snapshotsRoot);
  const rootStat = fs.lstatSync(rootPath);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new OdNextTaskInputSnapshotError(
      'OD Next snapshot root must be a managed non-symlink directory.',
    );
  }
  const root = fs.realpathSync(rootPath);
  const descriptorSnapshotDir = path.resolve(descriptor.snapshotDir);
  if (!within(rootPath, descriptorSnapshotDir)) {
    throw new OdNextTaskInputSnapshotError('OD Next task input snapshot is outside its managed root.');
  }
  const snapshotPathStat = fs.lstatSync(descriptorSnapshotDir);
  if (snapshotPathStat.isSymbolicLink() || !snapshotPathStat.isDirectory()) {
    throw new OdNextTaskInputSnapshotError(
      'OD Next task input snapshot must be a managed non-symlink directory.',
    );
  }
  const snapshotDir = fs.realpathSync(descriptorSnapshotDir);
  if (!within(root, snapshotDir) || path.basename(snapshotDir) !== safeTaskId(descriptor.taskExecutionId)) {
    throw new OdNextTaskInputSnapshotError('OD Next task input snapshot is outside its managed root.');
  }
  const manifestPath = path.join(snapshotDir, 'manifest.json');
  const manifestBytes = readManagedSnapshotFile(
    manifestPath,
    limits.manifestCapBytes ?? DEFAULT_OD_NEXT_INPUT_MANIFEST_CAP_BYTES,
    snapshotDir,
    hooks.beforeOpenManifest,
  );
  if (sha256(manifestBytes) !== descriptor.manifestSha256) {
    throw new OdNextTaskInputSnapshotError('OD Next task input manifest digest mismatch.', 'OD_NEXT_INPUT_SNAPSHOT_TAMPERED');
  }
  const manifest = parseManifest(manifestBytes);
  if (manifest.taskExecutionId !== descriptor.taskExecutionId) {
    throw new OdNextTaskInputSnapshotError('OD Next task input manifest ownership mismatch.');
  }
  const countCap = limits.countCap ?? DEFAULT_OD_NEXT_ATTACHMENT_COUNT_CAP;
  const fileCap = limits.fileCapBytes ?? DEFAULT_OD_NEXT_ATTACHMENT_FILE_CAP_BYTES;
  const totalCap = limits.totalCapBytes ?? DEFAULT_OD_NEXT_ATTACHMENT_TOTAL_CAP_BYTES;
  if (manifest.files.length > countCap) {
    throw new OdNextTaskInputSnapshotError(
      'OD Next task input file count exceeds the task cap.',
      'OD_NEXT_INPUT_SNAPSHOT_OVERSIZE',
    );
  }
  if (manifest.requestInputFacts.attachments.length !== manifest.files.length) {
    throw new OdNextTaskInputSnapshotError(
      'OD Next task input facts do not match frozen files.',
      'OD_NEXT_INPUT_SNAPSHOT_TAMPERED',
    );
  }
  const pathsById = new Map<string, string>();
  const contentById = new Map<string, Buffer>();
  const seenIds = new Set<string>();
  const seenRelativePaths = new Set<string>();
  let totalBytes = 0;
  // Validate every declared count/file/aggregate bound before opening the
  // first canonical attachment. A malicious manifest cannot make verification
  // partially read an over-budget set and only fail on its last entry.
  for (const file of manifest.files) {
    if (
      typeof file.id !== 'string'
      || typeof file.relativePath !== 'string'
      || !/^attachments\/attachment-[0-9]{3}\.[a-z0-9]+$/.test(file.relativePath)
      || (file.kind !== 'file' && file.kind !== 'image')
      || typeof file.mediaType !== 'string'
      || !Number.isSafeInteger(file.bytes)
      || file.bytes < 0
      || typeof file.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(file.sha256)
      || seenIds.has(file.id)
      || seenRelativePaths.has(file.relativePath)
    ) {
      throw new OdNextTaskInputSnapshotError('OD Next task input file reference is invalid.');
    }
    if (file.bytes > fileCap || totalBytes + file.bytes > totalCap) {
      throw new OdNextTaskInputSnapshotError(
        'OD Next task input files exceed the configured byte cap.',
        'OD_NEXT_INPUT_SNAPSHOT_OVERSIZE',
      );
    }
    totalBytes += file.bytes;
    seenIds.add(file.id);
    seenRelativePaths.add(file.relativePath);
  }
  for (const file of manifest.files) {
    const absolute = path.resolve(snapshotDir, file.relativePath);
    if (!within(snapshotDir, absolute)) {
      throw new OdNextTaskInputSnapshotError('OD Next task input file escapes its snapshot.');
    }
    const bytes = readManagedSnapshotFile(
      absolute,
      fileCap,
      snapshotDir,
      hooks.beforeOpenFile,
    );
    const detected = mediaTypeFromBytes(bytes);
    if (
      bytes.length !== file.bytes
      || sha256(bytes) !== file.sha256
      || detected.mediaType !== file.mediaType
    ) {
      throw new OdNextTaskInputSnapshotError('OD Next task input file identity mismatch.', 'OD_NEXT_INPUT_SNAPSHOT_TAMPERED');
    }
    pathsById.set(file.id, absolute);
    contentById.set(file.id, bytes);
  }
  if (
    manifest.requestInputFacts.attachments.some((fact, index) => (
      fact.id !== manifest.files[index]?.id
      || fact.order !== index + 1
      || fact.reference !== `task-input:${manifest.files[index]?.relativePath}`
      || fact.sha256 !== manifest.files[index]?.sha256
      || fact.bytes !== manifest.files[index]?.bytes
      || fact.mediaType !== manifest.files[index]?.mediaType
      || fact.kind !== manifest.files[index]?.kind
    ))
  ) {
    throw new OdNextTaskInputSnapshotError('OD Next task input facts do not match frozen files.', 'OD_NEXT_INPUT_SNAPSHOT_TAMPERED');
  }
  const attachmentPaths = manifest.requestInputFacts.attachments.map((fact) => pathsById.get(fact.id)!);
  const imagePaths = manifest.requestInputFacts.attachments
    .filter((fact) => fact.kind === 'image')
    .map((fact) => pathsById.get(fact.id)!);
  return {
    taskConfigText: serializeOdNextTaskConfigurationV1(manifest.taskConfiguration),
    requestInputText: serializeOdNextRequestInputFactsV1(manifest.requestInputFacts),
    taskType: manifest.taskConfiguration.taskType,
    attachmentFactsText: serializeOdNextAttachmentFactsV1(manifest.requestInputFacts),
    workspaceInputFactsText: serializeOdNextWorkspaceInputFactsV1(manifest.requestInputFacts),
    attachmentReferences: manifest.requestInputFacts.attachments.map((fact) => fact.reference),
    attachmentPaths,
    imagePaths,
    snapshotDir,
    files: manifest.files.map((file) => ({
      ...file,
      content: contentById.get(file.id)!,
    })),
  };
}

export function createOdNextRunInputProjection(input: {
  descriptor: OdNextTaskInputSnapshotDescriptor;
  snapshotsRoot: string;
  projectionsRoot: string;
  runId: string;
  limits?: SnapshotReadLimits;
  hooks?: SnapshotReadHooks;
}): OdNextRunInputProjection {
  const loaded = loadOdNextTaskInputSnapshot(
    input.descriptor,
    input.snapshotsRoot,
    input.limits,
    input.hooks,
  );
  const taskExecutionId = safeTaskId(input.descriptor.taskExecutionId);
  const runId = safeTaskId(input.runId);
  const projectionsRoot = path.resolve(input.projectionsRoot);
  const taskProjectionRoot = path.join(projectionsRoot, taskExecutionId);
  const projectionDir = path.join(taskProjectionRoot, runId);
  let projectionPathVerified = false;
  try {
    fs.mkdirSync(projectionsRoot, { recursive: true, mode: 0o700 });
    const rootStat = fs.lstatSync(projectionsRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new OdNextTaskInputSnapshotError(
        'OD Next projection root must be a managed non-symlink directory.',
      );
    }
    if (fs.existsSync(taskProjectionRoot)) {
      const taskRootStat = fs.lstatSync(taskProjectionRoot);
      if (taskRootStat.isSymbolicLink() || !taskRootStat.isDirectory()) {
        throw new OdNextTaskInputSnapshotError(
          'OD Next task projection root must be a non-symlink directory.',
        );
      }
      fs.chmodSync(taskProjectionRoot, 0o700);
    } else {
      fs.mkdirSync(taskProjectionRoot, { recursive: false, mode: 0o700 });
    }
    projectionPathVerified = true;
    removeRunProjectionTree(projectionDir);
    fs.mkdirSync(projectionDir, { recursive: false, mode: 0o700 });
    const attachmentsDir = path.join(projectionDir, 'attachments');
    fs.mkdirSync(attachmentsDir, { recursive: false, mode: 0o700 });
    for (const file of loaded.files) {
      const destination = path.resolve(projectionDir, file.relativePath);
      if (!within(projectionDir, destination)) {
        throw new OdNextTaskInputSnapshotError(
          'OD Next projected input escapes its managed Run directory.',
        );
      }
      fs.writeFileSync(destination, file.content, { flag: 'wx', mode: 0o444 });
      fs.chmodSync(destination, 0o444);
    }
    fs.chmodSync(attachmentsDir, 0o555);
    fs.chmodSync(projectionDir, 0o555);
    fs.chmodSync(taskProjectionRoot, 0o555);
    const projectedPaths = loaded.files.map((file) => (
      path.join(projectionDir, file.relativePath)
    ));
    return {
      taskConfigText: loaded.taskConfigText,
      requestInputText: loaded.requestInputText,
      attachmentReferences: loaded.attachmentReferences,
      attachmentPaths: projectedPaths,
      imagePaths: loaded.files
        .map((file, index) => ({ file, projectedPath: projectedPaths[index]! }))
        .filter(({ file }) => file.kind === 'image')
        .map(({ projectedPath }) => projectedPath),
      projectionDir,
      projectionAccessRoot: taskProjectionRoot,
    };
  } catch (error) {
    if (projectionPathVerified) {
      removeRunProjectionTree(projectionDir);
      if (fs.existsSync(taskProjectionRoot)) {
        try { fs.chmodSync(taskProjectionRoot, 0o555); } catch { /* best effort */ }
      }
    }
    throw error;
  }
}

/**
 * Remove one immutable per-Run projection and its now-empty task directory.
 * Canonical task inputs are intentionally untouched; only the disposable
 * projection returned by createOdNextRunInputProjection is accepted.
 */
export function removeOdNextRunInputProjection(
  projection: Pick<OdNextRunInputProjection, 'projectionDir' | 'projectionAccessRoot'>,
): void {
  const projectionAccessRoot = path.resolve(projection.projectionAccessRoot);
  const projectionDir = path.resolve(projection.projectionDir);
  if (path.dirname(projectionDir) !== projectionAccessRoot) {
    throw new OdNextTaskInputSnapshotError(
      'OD Next Run projection is outside its task access root.',
    );
  }
  let accessRootStat: fs.Stats;
  try {
    accessRootStat = fs.lstatSync(projectionAccessRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return;
    throw error;
  }
  if (accessRootStat.isSymbolicLink() || !accessRootStat.isDirectory()) {
    throw new OdNextTaskInputSnapshotError(
      'OD Next task projection root must remain a non-symlink directory.',
    );
  }
  fs.chmodSync(projectionAccessRoot, 0o700);
  removeRunProjectionTree(projectionDir);
  if (fs.readdirSync(projectionAccessRoot).length === 0) {
    fs.rmdirSync(projectionAccessRoot);
  } else {
    fs.chmodSync(projectionAccessRoot, 0o555);
  }
}

export function removeOdNextTaskInputSnapshot(
  descriptor: OdNextTaskInputSnapshotDescriptor | null | undefined,
  snapshotsRoot: string,
  hooks?: SnapshotCleanupHooks,
): void {
  if (!descriptor) return;
  removeManagedSnapshotDir({
    snapshotsRoot,
    taskExecutionId: descriptor.taskExecutionId,
    snapshotDir: descriptor.snapshotDir,
    ...(hooks ? { hooks } : {}),
  });
}

export function removeOdNextTaskInputSnapshotBestEffort(
  descriptor: OdNextTaskInputSnapshotDescriptor | null | undefined,
  snapshotsRoot: string,
  phase: OdNextTaskInputCleanupPhase,
): void {
  if (!descriptor) return;
  let taskExecutionId = 'invalid';
  try {
    taskExecutionId = safeTaskId(descriptor.taskExecutionId);
    removeOdNextTaskInputSnapshot(descriptor, snapshotsRoot);
  } catch (error) {
    warnSnapshotCleanupFailure(phase, taskExecutionId, error);
  }
}

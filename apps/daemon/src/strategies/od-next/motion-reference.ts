import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync,
  readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync,
  type Stats,
} from 'node:fs';
import path from 'node:path';

import type { AppliedStrategyBindingV2 } from '@open-design/contracts';
import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import type { OdNextTaskResource } from './device-frames.js';

const SOURCE_ROOT = './assets/task-profiles/motion-design/glyph-unfold/';
const FILES = ['guide.md', 'runtime.html', 'prepare.ts'] as const;
export const OD_NEXT_MOTION_REFERENCE_ROOT = '.od-motion/glyph-unfold';
export const OD_NEXT_MOTION_REFERENCE_OWNERSHIP = '.ownership.json';

type FileIdentity = { sha256: string; bytes: number };
type Ownership = { appliedSnapshot: string; packageHash: string; files: Record<string, FileIdentity> };
type OwnedDirectory = { stat: Stats; ownership: Ownership };
export interface OdNextMotionReferenceStagingResult {
  usable: boolean;
  staged: string[];
  skipped: string[];
  appliedSnapshot?: string;
  packageHash?: string;
  reason?: string;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function statIfPresent(target: string): Stats | null {
  try { return lstatSync(target); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino
    && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function sameDirectory(left: Stats, right: Stats): boolean {
  return right.isDirectory() && !right.isSymbolicLink() && left.dev === right.dev && left.ino === right.ino;
}

function readPlainFile(target: string, expectedBytes?: number): Buffer {
  const entry = lstatSync(target);
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Motion reference is not a plain file.');
  const descriptor = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor);
    if (!sameFile(entry, before) || !before.isFile() || (expectedBytes !== undefined && before.size !== expectedBytes)) {
      throw new Error('Motion reference is not the expected regular file.');
    }
    const bytes = readFileSync(descriptor);
    if (!sameFile(before, fstatSync(descriptor)) || !sameFile(before, lstatSync(target))) {
      throw new Error('Motion reference changed while reading.');
    }
    return bytes;
  } finally { closeSync(descriptor); }
}

function readOwnedDirectory(root: string): OwnedDirectory | null {
  try {
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
    const names = readdirSync(root).sort();
    if (JSON.stringify(names) !== JSON.stringify([...FILES, OD_NEXT_MOTION_REFERENCE_OWNERSHIP].sort())) return null;
    const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
      readPlainFile(path.join(root, OD_NEXT_MOTION_REFERENCE_OWNERSHIP)),
    )) as Ownership;
    if (!record || Object.keys(record).sort().join(',') !== 'appliedSnapshot,files,packageHash'
      || typeof record.appliedSnapshot !== 'string' || !record.appliedSnapshot.trim()
      || typeof record.packageHash !== 'string' || !/^[a-f0-9]{64}$/.test(record.packageHash)
      || !record.files || Object.keys(record.files).sort().join(',') !== [...FILES].sort().join(',')) return null;
    for (const name of FILES) {
      const identity = record.files[name];
      if (!identity || Object.keys(identity).sort().join(',') !== 'bytes,sha256'
        || !Number.isSafeInteger(identity.bytes) || identity.bytes < 0
        || typeof identity.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(identity.sha256)) return null;
      const bytes = readPlainFile(path.join(root, name), identity.bytes);
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (sha256(bytes) !== identity.sha256) return null;
    }
    if (!sameDirectory(stat, lstatSync(root))) return null;
    return { stat, ownership: record };
  } catch { return null; }
}

/**
 * Publish only the complete, binding-verified local glyph reference. The directory
 * is the unit of replacement: a conflict leaves every existing file alone.
 * Device frames and all other profile resources remain outside this owner.
 */
export function materializeOdNextMotionReference(input: {
  cwd: string;
  snapshotId: string;
  resources: ReadonlyArray<OdNextTaskResource>;
  binding: AppliedStrategyBindingV2 | null | undefined;
}): OdNextMotionReferenceStagingResult {
  const empty = { usable: false, staged: [], skipped: [] };
  const binding = input.binding;
  if (!binding || binding.id !== 'od-next-strategy'
    || !['motion-design', 'discovery'].includes(binding.selectedTaskProfile.taskType)) return empty;
  const relevant = input.resources.filter((resource) => resource.path.startsWith(SOURCE_ROOT));
  const declared = binding.assetDigests.filter((asset) => asset.path.startsWith(SOURCE_ROOT));
  if (relevant.length === 0 && declared.length === 0) return empty;
  const paths = FILES.map((name) => `${OD_NEXT_MOTION_REFERENCE_ROOT}/${name}`);
  const skipped = (reason: string): OdNextMotionReferenceStagingResult => ({
    usable: false, staged: [], skipped: paths, reason,
    appliedSnapshot: input.snapshotId, packageHash: binding.packageHash,
  });
  const available = (): OdNextMotionReferenceStagingResult => ({
    usable: true, staged: paths, skipped: [],
    appliedSnapshot: input.snapshotId, packageHash: binding.packageHash,
  });
  if (typeof input.snapshotId !== 'string' || !input.snapshotId.trim()) return skipped('snapshot_identity_missing');
  const files = new Map<string, Buffer>();
  try {
    if (strategyPackageHashFromDigests(binding.assetDigests) !== binding.packageHash) return skipped('package_identity_mismatch');
    if (relevant.length !== FILES.length || declared.length !== FILES.length) return skipped('incomplete_resource_set');
    for (const name of FILES) {
      const sourcePath = `${SOURCE_ROOT}${name}`;
      const sources = relevant.filter((resource) => resource.path === sourcePath);
      const digests = declared.filter((asset) => asset.path === sourcePath);
      if (sources.length !== 1 || digests.length !== 1) return skipped('incomplete_resource_set');
      const text = sources[0]!.text;
      const bytes = Buffer.from(text, 'utf8');
      // A JS lone surrogate must not silently become U+FFFD on disk. The loader
      // already rejects invalid source UTF-8; this also protects direct callers.
      if (new TextDecoder('utf-8', { fatal: true }).decode(bytes) !== text
        || sha256(bytes) !== digests[0]!.sha256) return skipped('resource_identity_mismatch');
      files.set(name, bytes);
    }
  } catch { return skipped('resource_identity_mismatch'); }

  let transaction: string | undefined;
  let previous: string | undefined;
  let destination: string | undefined;
  try {
    if (!path.isAbsolute(input.cwd)) return skipped('unsafe_destination');
    const cwdStat = lstatSync(input.cwd);
    if (!cwdStat.isDirectory() || cwdStat.isSymbolicLink()) return skipped('unsafe_destination');
    const cwd = realpathSync(input.cwd);
    const parent = path.join(cwd, '.od-motion');
    const parentBefore = statIfPresent(parent);
    if (parentBefore && (!parentBefore.isDirectory() || parentBefore.isSymbolicLink())) return skipped('unsafe_destination');
    if (!parentBefore) mkdirSync(parent);
    const parentStat = lstatSync(parent);
    const checkParent = () => {
      if (!sameDirectory(parentStat, lstatSync(parent)) || realpathSync(parent) !== parent) {
        throw new Error('Motion reference parent changed.');
      }
    };
    destination = path.join(parent, 'glyph-unfold');
    const existing = statIfPresent(destination);
    const owned = existing ? readOwnedDirectory(destination) : null;
    if (existing && !owned) return skipped('foreign_or_modified_destination');
    const ownership: Ownership = {
      appliedSnapshot: input.snapshotId,
      packageHash: binding.packageHash,
      files: Object.fromEntries([...files].map(([name, bytes]) => [name, { sha256: sha256(bytes), bytes: bytes.length }])),
    };
    if (owned && JSON.stringify(owned.ownership) === JSON.stringify(ownership)) return available();

    transaction = mkdtempSync(path.join(parent, '.glyph-unfold-'));
    const next = path.join(transaction, 'next');
    mkdirSync(next);
    for (const [name, bytes] of files) writeFileSync(path.join(next, name), bytes, { flag: 'wx' });
    writeFileSync(path.join(next, OD_NEXT_MOTION_REFERENCE_OWNERSHIP), `${JSON.stringify(ownership, null, 2)}\n`, { flag: 'wx' });
    const prepared = readOwnedDirectory(next);
    if (!prepared || JSON.stringify(prepared.ownership) !== JSON.stringify(ownership)) throw new Error('Motion reference readback failed.');
    checkParent();
    if (owned) {
      const current = readOwnedDirectory(destination);
      if (!current || !sameDirectory(owned.stat, current.stat)
        || JSON.stringify(current.ownership) !== JSON.stringify(owned.ownership)) {
        return skipped('destination_changed');
      }
      previous = path.join(transaction, 'previous');
      renameSync(destination, previous);
    } else if (statIfPresent(destination)) return skipped('destination_changed');
    checkParent();
    if (statIfPresent(destination)) throw new Error('Motion reference destination became occupied.');
    // No per-file replacement: readers see an old complete directory, a brief
    // absence, or the new complete directory, never a newly published mixture.
    renameSync(next, destination);
    if (previous) {
      const retired = readOwnedDirectory(previous);
      if (retired && JSON.stringify(retired.ownership) === JSON.stringify(owned!.ownership)) {
        rmSync(previous, { recursive: true });
        previous = undefined;
      }
    }
    return available();
  } catch {
    // A failed publish restores the previous complete bundle only into an
    // absent name. A concurrent occupant is never deleted to make room.
    if (previous && destination && !statIfPresent(destination)) {
      try { renameSync(previous, destination); previous = undefined; } catch { /* Keep the recoverable copy. */ }
    }
    return skipped('filesystem_unavailable');
  } finally {
    // Never remove a previous bundle that could not safely be restored.
    if (transaction && !previous) rmSync(transaction, { recursive: true, force: true });
  }
}

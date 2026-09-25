// Ownership-preserving mirror of the brand bundle (#8144).
//
// Finalize copies the brand workspace into the backing project and into the
// linked `user:<id>` design system. Both copies follow the invariant #5472 set
// for design systems: a file is only replaced while it is still byte-identical
// to what the generator last wrote, as recorded in `.od-generated.json`.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  GENERATED_MANIFEST_FILENAME,
  readGeneratedManifest,
  serializeGeneratedManifest,
} from '../design-systems/index.js';

export interface BundleFile {
  /** POSIX path relative to the target root. */
  rel: string;
  content: Buffer;
}

/**
 * Bytes at a bundle path, `undefined` when absent, or `null` when a symlink or
 * a non-regular file sits anywhere on the path. `null` paths are never touched.
 */
export type BundleTargetState = Buffer | undefined | null;

export interface BundlePlan {
  dir: string;
  writes: BundleFile[];
  /** Paths left alone because the user edited or authored them. */
  kept: string[];
  /** Unmodified generator files the bundle no longer produces. */
  stale: string[];
  manifest: Record<string, string>;
}

// Same digest as the design-system generator uses for its text files.
export function hashBundleContent(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function readBundleTarget(root: string, rel: string): BundleTargetState {
  const parts = rel.split('/');
  let abs = root;
  for (const [index, part] of parts.entries()) {
    abs = path.join(abs, part);
    let stats: fs.Stats;
    try {
      stats = fs.lstatSync(abs);
    } catch {
      return undefined;
    }
    const isLeaf = index === parts.length - 1;
    if (isLeaf ? !stats.isFile() : !stats.isDirectory()) return null;
  }
  return fs.readFileSync(abs);
}

/**
 * Decide what a finalize may write into `dir`. `baseline` fingerprints the
 * brand workspace as it stood before this finalize, which is exactly what the
 * previous finalize mirrored; it stands in for the manifest on targets written
 * before the manifest existed, so their untouched files keep refreshing.
 */
export async function planBundleMirror(opts: {
  dir: string;
  files: BundleFile[];
  baseline: Record<string, string>;
  isManaged: (rel: string) => boolean;
  isPrunable?: (rel: string) => boolean;
  /** Target state to use instead of what is on disk, by path. */
  overrides?: Record<string, BundleTargetState>;
}): Promise<BundlePlan> {
  const plan: BundlePlan = { dir: opts.dir, writes: [], kept: [], stale: [], manifest: {} };
  const recorded: Record<string, string> = {};
  for (const [rel, hash] of Object.entries(await readGeneratedManifest(opts.dir))) {
    if (opts.isManaged(rel)) recorded[rel] = hash;
    else plan.manifest[rel] = hash;
  }
  const known = Object.keys(recorded).length > 0 ? recorded : opts.baseline;
  const produced = new Set<string>();
  for (const file of opts.files) {
    produced.add(file.rel);
    const next = hashBundleContent(file.content);
    const current = opts.overrides && file.rel in opts.overrides
      ? opts.overrides[file.rel]
      : readBundleTarget(opts.dir, file.rel);
    if (current === null) {
      plan.kept.push(file.rel);
      continue;
    }
    const currentHash = current === undefined ? undefined : hashBundleContent(current);
    if (currentHash === next) {
      plan.manifest[file.rel] = next;
    } else if (currentHash === undefined || currentHash === known[file.rel]) {
      plan.writes.push(file);
      plan.manifest[file.rel] = next;
    } else {
      plan.kept.push(file.rel);
      const previous = known[file.rel];
      if (previous !== undefined) plan.manifest[file.rel] = previous;
    }
  }
  for (const [rel, hash] of Object.entries(known)) {
    if (produced.has(rel) || !opts.isPrunable?.(rel)) continue;
    const current = readBundleTarget(opts.dir, rel);
    if (current instanceof Buffer && hashBundleContent(current) === hash) plan.stale.push(rel);
  }
  return plan;
}

export async function applyBundleMirror(
  plan: BundlePlan,
  write: (file: BundleFile) => Promise<void> | void,
): Promise<void> {
  for (const file of plan.writes) {
    await write(file);
    // Record what landed: the project writer may normalize bytes on the way in.
    const landed = readBundleTarget(plan.dir, file.rel);
    if (landed instanceof Buffer) plan.manifest[file.rel] = hashBundleContent(landed);
  }
  for (const rel of plan.stale) fs.rmSync(path.join(plan.dir, ...rel.split('/')), { force: true });
  if (readBundleTarget(plan.dir, GENERATED_MANIFEST_FILENAME) !== null) {
    fs.writeFileSync(
      path.join(plan.dir, GENERATED_MANIFEST_FILENAME),
      serializeGeneratedManifest(plan.manifest),
      'utf8',
    );
  }
}

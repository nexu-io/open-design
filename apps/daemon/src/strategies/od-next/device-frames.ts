import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  OD_NEXT_DEVICE_FRAME_ROOT,
  OD_NEXT_MANAGED_RESOURCE_FILES,
  OD_NEXT_STRATEGY_ID,
  detectOdNextLayoutPrimitives,
  hasOdNextDeviceShell,
  odNextManagedResourceName,
  type OdNextLayoutPrimitivesPresenceV1,
  type AppliedPluginSnapshot,
  type OdNextDevicePlatformResolutionV1,
} from '@open-design/contracts';

import { resolvePluginFolder } from '../../plugins/registry.js';
import { loadBundledStrategyPromptAssetsV2 } from '../../plugins/strategy-package.js';

export interface OdNextTaskResource {
  path: string;
  text: string;
}

export class InvalidOdNextDeviceFrameRootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOdNextDeviceFrameRootError';
  }
}

/**
 * Ownership record the materializer keeps beside the shells it wrote.
 *
 * `.od-frames/` is a name this feature introduces inside a directory the user
 * owns, so an imported or older project can already hold a folder of that name
 * with arbitrary files in it. The manifest is the only thing that makes a file
 * ours, and it only ever makes it *provisionally* ours: a name has to be listed
 * here AND the bytes on disk have to still match the digest we recorded, or the
 * file is treated as the user's. That covers both a user's own `iphone.html`
 * that happens to share a managed name and a shell we staged that the user has
 * since edited.
 *
 * The control file is itself a name inside the user's directory, so it is
 * subject to the same rule: when it is occupied by something we did not write,
 * there is no trustworthy ownership record and the directory is left alone
 * entirely. "Something we did not write" is decided against what this
 * materializer can ever produce — a key set inside {@link MANAGED_SHELL_FILES}
 * and 64-hex digests. A manifest naming anything else is not a manifest of
 * ours, and must not be allowed to nominate that name for deletion.
 */
export const OD_NEXT_DEVICE_FRAME_MANIFEST = '.od-next-device-frames.json' as const;
const OD_NEXT_DEVICE_FRAME_MANIFEST_SCHEMA = 'open-design.od-next-device-frames/v1' as const;

/**
 * Every filename this materializer can ever stage, retire, or record. The
 * manifest lives in a directory the project controls, so this set — not the
 * manifest's own key list — is what bounds the files it may touch.
 */
const MANAGED_SHELL_FILES: ReadonlySet<string> = new Set(OD_NEXT_MANAGED_RESOURCE_FILES);

interface OdNextDeviceFrameManifestV1 {
  schema: typeof OD_NEXT_DEVICE_FRAME_MANIFEST_SCHEMA;
  files: Record<string, string>;
}

/**
 * What the control file name currently holds. `absent` and `ours` are the two
 * states in which this materializer may write; `foreign` means the name is
 * taken by something we cannot prove we wrote, which makes every byte under the
 * root unaccounted for.
 */
type OdNextDeviceFrameOwnership =
  | { kind: 'absent' }
  | { kind: 'ours'; files: Record<string, string> }
  | { kind: 'foreign' };

export interface OdNextDeviceFrameStagingResult {
  /** Project-relative paths of the shells now staged and daemon-owned. */
  staged: string[];
  /**
   * Managed names left alone because the bytes on disk are not provably ours:
   * a file we never wrote, a shell edited since we staged it, or — when the
   * control file itself is occupied — every managed name under the root.
   */
  skipped: string[];
}

/**
 * Load the selected task profile's declared resources for an applied OD Next
 * snapshot, re-verified against the snapshot's package identity. Returns an
 * empty list for non-strategy snapshots and for profiles that ship nothing.
 */
export async function loadOdNextTaskResourcesForSnapshot(input: {
  bundledPluginsDir: string;
  snapshot: Pick<AppliedPluginSnapshot, 'pluginId' | 'strategy'> | null | undefined;
}): Promise<OdNextTaskResource[]> {
  const binding = input.snapshot?.strategy;
  if (!binding || input.snapshot?.pluginId !== OD_NEXT_STRATEGY_ID) return [];
  const folder = path.join(input.bundledPluginsDir, 'scenarios', OD_NEXT_STRATEGY_ID);
  const resolved = await resolvePluginFolder({
    folder,
    folderId: OD_NEXT_STRATEGY_ID,
    sourceKind: 'bundled',
    source: folder,
    trust: 'bundled',
  });
  if (!resolved.ok) {
    throw new Error(`Bundled OD Next strategy is unavailable: ${resolved.errors.join('; ')}`);
  }
  return loadBundledStrategyPromptAssetsV2({ plugin: resolved.record, binding })
    .taskResources
    .map((resource) => ({ path: resource.path, text: resource.text }));
}

function digest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Classify the control file. Only a plain file holding exactly what this
 * materializer writes — our schema, keys drawn from {@link MANAGED_SHELL_FILES},
 * 64-hex digests — counts as `ours`. Everything else is `foreign`: unreadable
 * files, malformed JSON, a foreign schema, and same-schema content naming a
 * file we would never stage. "We could not understand it" is not evidence that
 * we wrote it, and neither is "it looks close enough".
 */
async function readOwnership(root: string): Promise<OdNextDeviceFrameOwnership> {
  const target = path.join(root, OD_NEXT_DEVICE_FRAME_MANIFEST);
  const stat = await lstat(target).catch(() => null);
  if (!stat) return { kind: 'absent' };
  if (stat.isSymbolicLink() || !stat.isFile()) return { kind: 'foreign' };
  let raw: string;
  try {
    raw = await readFile(target, 'utf8');
  } catch {
    return { kind: 'foreign' };
  }
  let parsed: Partial<OdNextDeviceFrameManifestV1> | null;
  try {
    parsed = JSON.parse(raw) as Partial<OdNextDeviceFrameManifestV1> | null;
  } catch {
    return { kind: 'foreign' };
  }
  if (
    parsed?.schema !== OD_NEXT_DEVICE_FRAME_MANIFEST_SCHEMA ||
    typeof parsed.files !== 'object' ||
    !parsed.files ||
    Array.isArray(parsed.files)
  ) {
    return { kind: 'foreign' };
  }
  const files: Record<string, string> = {};
  for (const [name, sha] of Object.entries(parsed.files)) {
    // A key we would never have written, or a digest we would never have
    // produced, means this file came from somewhere else. Refuse the whole
    // record rather than salvaging the entries that happen to look right:
    // salvaging is what would let a crafted entry nominate an unrelated
    // project file for retirement.
    if (!MANAGED_SHELL_FILES.has(name) || typeof sha !== 'string' || !/^[a-f0-9]{64}$/.test(sha)) {
      return { kind: 'foreign' };
    }
    files[name] = sha;
  }
  return { kind: 'ours', files };
}

/**
 * Stage the device shells into `<cwd>/.od-frames/` so the rule card's
 * `.od-frames/<shell>.html` paths resolve for every prototype run, whether or
 * not a platform was resolved up front.
 *
 * Non-destructive by construction. A managed name is written or removed only
 * when the manifest claims it *and* the bytes on disk still hash to what we
 * recorded there, so neither a pre-existing `iphone.html` nor a shell the user
 * edited after we staged it is ever overwritten; both are reported as skipped
 * and drop out of the manifest, which hands the name back to the user for good.
 * If the manifest name is itself occupied by something we did not write, the
 * whole directory is left alone. Unrelated files are never written or deleted.
 * The root is refused when it is a symlink or a non-directory, mirroring the
 * frozen Skill guard. In every skipped case the quoted `device-frame-shell`
 * fact still carries the shell source, so the run keeps working.
 */
export async function materializeOdNextDeviceFrames(input: {
  cwd: string;
  resources: ReadonlyArray<OdNextTaskResource>;
}): Promise<OdNextDeviceFrameStagingResult> {
  // Shells and the layout primitives stylesheet share one root, one manifest,
  // and one ownership rule; anything else the profile declares stays in the
  // package and is never written to the project.
  const shells = input.resources.filter((resource) => odNextManagedResourceName(resource.path));
  if (shells.length === 0) return { staged: [], skipped: [] };
  const root = path.join(input.cwd, OD_NEXT_DEVICE_FRAME_ROOT);
  const rootStat = await lstat(root).catch(() => null);
  if (rootStat && (rootStat.isSymbolicLink() || !rootStat.isDirectory())) {
    throw new InvalidOdNextDeviceFrameRootError('Device shell staging root is unsafe.');
  }
  await mkdir(root, { recursive: true });
  const ownership = await readOwnership(root);
  const managedName = (name: string) => `${OD_NEXT_DEVICE_FRAME_ROOT}/${name}`;
  if (ownership.kind === 'foreign') {
    // The control file name is taken by something this materializer did not
    // write, so nothing under the root can be proven to be ours. Write nothing,
    // delete nothing, and do not replace the file holding the name.
    return {
      staged: [],
      skipped: [
        managedName(OD_NEXT_DEVICE_FRAME_MANIFEST),
        ...shells.map((shell) => managedName(path.posix.basename(shell.path))),
      ].sort(),
    };
  }
  const previous = ownership.kind === 'ours' ? ownership.files : {};
  const next: Record<string, string> = {};
  const staged: string[] = [];
  const skipped: string[] = [];

  for (const shell of shells) {
    const name = path.posix.basename(shell.path);
    const target = path.join(root, name);
    const recorded = Object.prototype.hasOwnProperty.call(previous, name) ? previous[name] : undefined;
    const existing = await lstat(target).catch(() => null);
    if (existing) {
      // A file already holds the name. Replace it only after proving the bytes
      // are the ones we last wrote: an unclaimed name, a name that is no longer
      // a plain file, or a digest that moved all mean the user owns it now.
      const current = recorded === undefined || existing.isSymbolicLink() || !existing.isFile()
        ? null
        : await readFile(target, 'utf8').catch(() => null);
      if (current === null || digest(current) !== recorded) {
        skipped.push(managedName(name));
        continue;
      }
    }
    await writeFile(target, shell.text, { encoding: 'utf8' });
    next[name] = digest(shell.text);
    staged.push(managedName(name));
  }

  // Retire shells we staged earlier that the current package no longer ships,
  // and only when the bytes are still ours. The allowlist is re-checked here so
  // the deletion set stays bounded by this feature's own filenames even if the
  // parser above is ever loosened.
  for (const [name, sha] of Object.entries(previous)) {
    if (!MANAGED_SHELL_FILES.has(name)) continue;
    if (name in next || skipped.includes(managedName(name))) continue;
    const target = path.join(root, name);
    const existing = await lstat(target).catch(() => null);
    if (!existing || existing.isSymbolicLink() || !existing.isFile()) continue;
    const current = await readFile(target, 'utf8').catch(() => null);
    if (current !== null && digest(current) === sha) {
      await rm(target, { force: true });
    }
  }

  const manifest: OdNextDeviceFrameManifestV1 = {
    schema: OD_NEXT_DEVICE_FRAME_MANIFEST_SCHEMA,
    files: Object.fromEntries(Object.entries(next).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  };
  await writeFile(
    path.join(root, OD_NEXT_DEVICE_FRAME_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: 'utf8' },
  );
  return { staged: staged.sort(), skipped: skipped.sort() };
}

export interface OdNextDeviceShellObservation {
  platform: OdNextDevicePlatformResolutionV1['platform'];
  resolvedFrom: OdNextDevicePlatformResolutionV1['resolvedFrom'];
  entryFile: string;
  shellPresent: boolean;
}

/**
 * After a prototype run delivered, record whether the canonical entry carries
 * a shipped handset shell. Observation only: this branch has no repair loop
 * to send the finding back to, so the value feeds run analytics and the
 * daemon log, where the rollout can measure how often a resolved platform
 * actually reached the artifact. Null when nothing was resolved or the entry
 * cannot be read.
 */
export async function observeOdNextDeviceShell(input: {
  projectRoot: string;
  entryFile: string | null | undefined;
  resolution: OdNextDevicePlatformResolutionV1 | null | undefined;
}): Promise<OdNextDeviceShellObservation | null> {
  if (!input.resolution || typeof input.entryFile !== 'string' || !input.entryFile) return null;
  const target = path.resolve(input.projectRoot, input.entryFile);
  const relative = path.relative(input.projectRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  let html: string;
  try {
    html = await readFile(target, 'utf8');
  } catch {
    return null;
  }
  return {
    platform: input.resolution.platform,
    resolvedFrom: input.resolution.resolvedFrom,
    entryFile: input.entryFile,
    shellPresent: hasOdNextDeviceShell(html),
  };
}

export interface OdNextLayoutPrimitivesObservation {
  entryFile: string;
  presence: OdNextLayoutPrimitivesPresenceV1;
}

/**
 * Did the delivered entry carry the staged layout primitives, and how? Pure
 * observation for run analytics (see {@link observeOdNextDeviceShell}); it
 * decides nothing about the run.
 */
export async function observeOdNextLayoutPrimitives(input: {
  projectRoot: string;
  entryFile: string | null | undefined;
  primitivesCss: string | null | undefined;
}): Promise<OdNextLayoutPrimitivesObservation | null> {
  if (typeof input.entryFile !== 'string' || !input.entryFile) return null;
  const target = path.resolve(input.projectRoot, input.entryFile);
  const relative = path.relative(input.projectRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  let html: string;
  try {
    html = await readFile(target, 'utf8');
  } catch {
    return null;
  }
  return { entryFile: input.entryFile, presence: detectOdNextLayoutPrimitives(html, input.primitivesCss) };
}

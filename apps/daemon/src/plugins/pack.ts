// Phase 4 / spec §14 / plan §3.X1 — `od plugin pack <folder>`.
//
// Produces a gzip-compressed tar archive of a plugin folder so the
// author can hand it to a peer or upload it to a marketplace
// without going through GitHub. The installer's HTTPS-tarball
// path (§3.A6) consumes the same .tgz shape, so a packed archive
// is byte-equal to what `od plugin install --source <https://...>`
// would download.
//
// What we put in the archive:
//   - open-design.json (required; this is what the installer
//     resolves first)
//   - SKILL.md / .claude-plugin/plugin.json when present
//   - Any other plain files under the folder
//
// What we exclude:
//   - node_modules / .git / dist / build / out / coverage
//     (consistent with the installer's tarball-traversal skiplist
//     — keeps archive size sane and prevents "ship my whole
//     development setup" accidents)
//   - .DS_Store / Thumbs.db (OS noise)
//   - The output archive itself when --out lands inside the folder
//     (would otherwise spiral)
//
// We do NOT chase symlinks (consistent with the installer's
// extract-time symlink rejection, §3.A6 plan).

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { c as tarCreate } from 'tar';

export interface PackPluginInput {
  // Path to the plugin folder. Must contain open-design.json.
  folder: string;
  // Absolute path of the output archive. Default:
  // `<folder>/../<folder-basename>-<version>.tgz` when the manifest
  // ships a version, otherwise `<folder>/../<folder-basename>.tgz`.
  out?: string;
}

export interface PackPluginResult {
  outPath: string;
  bytes:   number;
  // The set of files added to the archive (POSIX paths, relative
  // to the folder). Useful for the CLI's audit log.
  files:   string[];
  // Captured from the manifest at pack time so the CLI can echo
  // back "packed my-plugin@0.1.2" without the caller re-reading.
  pluginId?:      string;
  pluginVersion?: string;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'out', 'coverage',
  '.turbo', '.cache', '.pnpm-store', '.parcel-cache', '.svelte-kit',
  '.nuxt', '.astro', '.vercel', '.vscode',
]);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db']);

export class PackPluginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackPluginError';
  }
}

export async function packPlugin(input: PackPluginInput): Promise<PackPluginResult> {
  const folder = path.resolve(input.folder);

  // Confirm the folder shape — open-design.json must exist + parse.
  let manifestRaw: string;
  try {
    manifestRaw = await fsp.readFile(path.join(folder, 'open-design.json'), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PackPluginError(`folder ${folder} does not contain open-design.json`);
    }
    throw new PackPluginError(`failed to read open-design.json: ${(err as Error).message}`);
  }
  let pluginId: string | undefined;
  let pluginVersion: string | undefined;
  try {
    const parsed = JSON.parse(manifestRaw) as { name?: string; version?: string };
    if (typeof parsed.name === 'string'    && parsed.name.length    > 0) pluginId      = parsed.name;
    if (typeof parsed.version === 'string' && parsed.version.length > 0) pluginVersion = parsed.version;
  } catch (err) {
    throw new PackPluginError(`open-design.json failed to parse as JSON: ${(err as Error).message}`);
  }

  const folderBase = path.basename(folder);
  const defaultOut = pluginVersion
    ? `${folderBase}-${pluginVersion}.tgz`
    : `${folderBase}.tgz`;
  const outPath = path.resolve(input.out ?? path.join(path.dirname(folder), defaultOut));

  // Collect every file we'll archive, building a set ahead of the
  // tar.create call so we can audit the list + reject the case
  // where the output path lands inside the folder.
  const files: string[] = [];
  await walk(folder, '', files, outPath);
  files.sort();

  // tar.create is symlink-aware via portable mode; the option
  // `follow: false` is the default. We pass `cwd` so paths in the
  // archive are folder-relative.
  await tarCreate(
    {
      gzip:    true,
      file:    outPath,
      cwd:     folder,
      portable: true,
      // Reject symlinks at write time — the installer rejects them
      // at extract time too. Keeping the contract symmetric stops
      // an author from packing a symlink and only finding out at
      // install. The walker also pre-filters them; this is a
      // belt-and-suspenders pass.
      filter: (entryPath, stat) => {
        const candidate = stat as { isSymbolicLink?: () => boolean };
        if (typeof candidate.isSymbolicLink === 'function' && candidate.isSymbolicLink()) return false;
        return true;
      },
    },
    files,
  );

  let bytes = 0;
  try {
    const stat = await fsp.stat(outPath);
    bytes = stat.size;
  } catch {
    bytes = 0;
  }

  const result: PackPluginResult = { outPath, bytes, files };
  if (pluginId)      result.pluginId      = pluginId;
  if (pluginVersion) result.pluginVersion = pluginVersion;
  return result;
}

async function walk(
  rootAbs: string,
  rel: string,
  out: string[],
  outArchivePath: string,
): Promise<void> {
  const abs = path.join(rootAbs, rel);
  let entries;
  try {
    entries = await fsp.readdir(abs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // skip symlinks (see filter above)
    const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
    const entryAbs = path.join(rootAbs, entryRel);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(rootAbs, entryRel, out, outArchivePath);
      continue;
    }
    if (!entry.isFile()) continue;
    if (SKIP_FILES.has(entry.name)) continue;
    if (path.resolve(entryAbs) === outArchivePath) continue; // don't pack the archive itself
    // POSIX paths in the manifest list keep the archive
    // diff-friendly across platforms.
    out.push(entryRel.split(path.sep).join('/'));
  }
}

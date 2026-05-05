// Codex hatch-pet registry. Lists pets that the upstream `hatch-pet`
// skill packages under `${CODEX_HOME:-$HOME/.codex}/pets/<id>/` and the
// curated set bundled with this repo under `assets/community-pets/<id>/`.
//
// On-disk shape (per the hatch-pet `references/codex-pet-contract.md`):
//
//   <root>/<id>/
//     pet.json          # { id, displayName, description, spritesheetPath }
//     spritesheet.webp  # 1536x1872 8x9 atlas (or .png / .gif fallback)
//
// We scan both folders lazily on every list request — there are only a
// handful of pets in either location, and watching the filesystem would
// add a daemon-side dependency that doesn't pay off here. When the same
// pet id exists in both, the user's local copy wins so re-baking a
// bundled pet locally is a supported workflow.

import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Pre-scanned set of ids that live under the bundled `assets/community-pets/`
// root. We resolve the `bundled` flag against this set rather than against
// "which folder did we end up reading from", so a pet that exists in BOTH
// the bundled root and the user's `~/.codex/pets/` still surfaces as
// bundled (the sprite content can still come from the user's local copy
// — only the flag is determined by the curated set membership).
type BundledIdSet = Set<string>;

async function readBundledIds(root: string): Promise<BundledIdSet> {
  const ids: BundledIdSet = new Set();
  let entries: Dirent[] = [];
  try {
    entries = await readdir(root, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return ids;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const safeFolderId = sanitizeId(entry.name);
    if (!safeFolderId) continue;
    ids.add(safeFolderId);
  }
  return ids;
}

export interface CodexPetSummaryRecord {
  id: string;
  displayName: string;
  description: string;
  spritesheetUrl: string;
  spritesheetExt: string;
  hatchedAt: number;
  // True when the pet was found in the bundled `assets/community-pets/`
  // folder rather than the user's `~/.codex/pets/`. Surfaced so the UI
  // can render a "Bundled" pill and skip prompting the user to sync
  // pets that already ship with the app.
  bundled?: boolean;
}

export interface CodexPetListResult {
  pets: CodexPetSummaryRecord[];
  rootDir: string;
}

interface PetManifest {
  id?: unknown;
  displayName?: unknown;
  description?: unknown;
  spritesheetPath?: unknown;
}

interface SpritesheetPick {
  absPath: string;
  ext: string;
}

export function resolveCodexPetsRoot(): string {
  const home = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), '.codex');
  return path.join(home, 'pets');
}

const SPRITESHEET_NAMES = [
  'spritesheet.webp',
  'spritesheet.png',
  'spritesheet.gif',
] as const;

// Scan a single root and append summaries to `out`. Pets already in
// `seenIds` are skipped — the user-root scan can therefore preempt a
// bundled pet of the same id without the bundled scan re-emitting a
// duplicate entry with a conflicting `bundled` flag.
//
// `bundledIds` lets us tag a pet as part of the curated set even when
// the sprite content was read from the user's local `~/.codex/pets/`
// copy. Without this, a user who synced every community pet via
// `pnpm sync:community-pets` would always preempt the bundled scan
// and the "Built-in" tab would render empty.
async function scanRoot(
  root: string,
  baseUrl: string,
  bundledFallback: boolean,
  bundledIds: BundledIdSet,
  out: CodexPetSummaryRecord[],
  seenIds: Set<string>,
): Promise<void> {
  let entries: Dirent[] = [];
  try {
    entries = await readdir(root, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // The folder name is the on-disk identity for the pet — the
    // `/api/codex-pets/:id/spritesheet` route resolves directly against
    // it, so we use the sanitised folder name as the public id even
    // when the manifest declares a different `id`. Mirroring the two
    // would let a manifest typo (or a pet whose sanitised id differs
    // from the folder name) silently 404 the download route.
    const safeFolderId = sanitizeId(entry.name);
    if (!safeFolderId) continue;
    if (seenIds.has(safeFolderId)) continue;
    const dir = path.join(root, entry.name);
    const manifestPath = path.join(dir, 'pet.json');
    let manifest: PetManifest = {};
    try {
      const raw = await readFile(manifestPath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        manifest = parsed as PetManifest;
      }
    } catch {
      // Manifest is optional — fall back to folder name for the
      // display name so manually-dropped pets still appear.
    }
    const sheet = await pickSpritesheet(dir, manifest);
    if (!sheet) continue;
    let mtimeMs = 0;
    try {
      const st = await stat(sheet.absPath);
      mtimeMs = st.mtimeMs;
    } catch {
      // ignore — listing should not fail on a transient stat error.
    }
    seenIds.add(safeFolderId);
    const displayName = pickString(manifest.displayName) ?? prettyName(entry.name);
    const description = pickString(manifest.description) ?? '';
    const spritesheetUrl = `${baseUrl}/api/codex-pets/${encodeURIComponent(safeFolderId)}/spritesheet`;
    // Curated-set membership wins over the source-folder default — a
    // pet read from the user's `~/.codex/pets/` is still bundled if its
    // id is part of `assets/community-pets/`.
    const bundled = bundledIds.has(safeFolderId) ? true : bundledFallback;
    out.push({
      id: safeFolderId,
      displayName,
      description,
      spritesheetUrl,
      spritesheetExt: sheet.ext,
      hatchedAt: Math.floor(mtimeMs),
      bundled,
    });
  }
}

export async function listCodexPets(
  options: { baseUrl?: string; bundledRoot?: string } = {},
): Promise<CodexPetListResult> {
  const baseUrl = options.baseUrl ?? '';
  const userRoot = resolveCodexPetsRoot();
  const out: CodexPetSummaryRecord[] = [];
  const seen = new Set<string>();
  // Resolve the curated set membership up front so the user-root scan
  // can stamp `bundled: true` on any local re-bake, and so the
  // bundled-root scan only adds the curated pets the user has not
  // already shadowed.
  const bundledIds = options.bundledRoot
    ? await readBundledIds(options.bundledRoot)
    : new Set<string>();
  // User pets first so a locally re-baked copy preempts the bundled
  // one (same id ⇒ user wins for sprite content).
  await scanRoot(userRoot, baseUrl, false, bundledIds, out, seen);
  if (options.bundledRoot) {
    await scanRoot(options.bundledRoot, baseUrl, true, bundledIds, out, seen);
  }
  // Newest-first across both origins. Sorting by mtime keeps the
  // "recently hatched" framing in the UI honest — a bundled pet from
  // 2024 still sinks below a fresh user-hatched pet from this morning.
  out.sort((a, b) => b.hatchedAt - a.hatchedAt);
  return { pets: out, rootDir: userRoot };
}

// Returns { absPath, ext } for the resolved spritesheet of a given pet
// id, or null if the pet folder / sheet is missing. Used by the
// `/api/codex-pets/:id/spritesheet` route to safely serve the file —
// the id is sanitised on both sides so users cannot path-escape into
// arbitrary folders under their home directory or the bundled assets.
export async function readCodexPetSpritesheet(
  id: string,
  options: { bundledRoot?: string } = {},
): Promise<SpritesheetPick | null> {
  const safeId = sanitizeId(id);
  if (!safeId) return null;
  const roots: string[] = [resolveCodexPetsRoot()];
  if (options.bundledRoot) roots.push(options.bundledRoot);
  for (const root of roots) {
    const dir = path.join(root, safeId);
    // Re-resolve the manifest so a manifest-declared spritesheetPath wins
    // when it differs from our default name (matches the hatch-pet
    // contract).
    let manifest: PetManifest = {};
    try {
      const raw = await readFile(path.join(dir, 'pet.json'), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        manifest = parsed as PetManifest;
      }
    } catch {
      // ignore; pickSpritesheet falls back to the canonical names.
    }
    const sheet = await pickSpritesheet(dir, manifest);
    if (sheet) return sheet;
  }
  return null;
}

async function pickSpritesheet(dir: string, manifest: PetManifest): Promise<SpritesheetPick | null> {
  const candidates: string[] = [];
  const declaredPath = pickString(manifest.spritesheetPath);
  if (declaredPath) {
    // Resolve manifest path relative to the pet folder, then ensure it
    // does not escape that folder.
    const abs = path.resolve(dir, declaredPath);
    if (abs.startsWith(dir + path.sep) || abs === dir) {
      candidates.push(abs);
    }
  }
  for (const name of SPRITESHEET_NAMES) {
    candidates.push(path.join(dir, name));
  }
  for (const abs of candidates) {
    try {
      const st = await stat(abs);
      if (!st.isFile()) continue;
      return { absPath: abs, ext: path.extname(abs).slice(1).toLowerCase() || 'png' };
    } catch {
      continue;
    }
  }
  return null;
}

// Strip anything that might let a request path-escape, then collapse
// runs of dots and reject any that still contain `..` after trimming —
// the daemon serves these ids straight into a `path.join`, and a value
// like `foo..bar` would otherwise be interpreted as `foo/../bar`.
// Mirrors the pet folder names produced by the upstream skill
// (lowercase + hyphens), but also accepts alphanumerics + a small set
// of safe punctuation to handle pets that users authored manually.
function sanitizeId(value: unknown): string {
  const collapsed = String(value ?? '')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/\.+/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);
  if (collapsed.includes('..')) return '';
  return collapsed;
}

function pickString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function prettyName(folder: string): string {
  return folder.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** @module locations
 * Project storage locations: the built-in managed-projects directory plus user-configured
 * external locations, and the `.open-design/project.json` manifest that marks a directory
 * as an Open Design project. All directory resolution here is symlink-aware (realpath +
 * containment assertion) so a location child can never escape its location root.
 * Depends only on core/ (isSafeId); app-config supplies the persisted location prefs shape.
 */
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectLocationPrefs } from '../../app-config.js';
import { expandHomePrefix } from '../../home-expansion.js';
import { isSafeId } from '../core/index.js';

/** Reserved id of the built-in managed-projects location; user locations must not reuse it. */
export const BUILT_IN_PROJECT_LOCATION_ID = 'default';
/** Path (relative to a project directory) of the manifest that marks it as an Open Design project. */
export const PROJECT_MANIFEST_RELATIVE_PATH = path.join('.open-design', 'project.json');

/** A project storage location: persisted prefs plus a flag for the built-in daemon-managed root. */
export interface ProjectLocation extends ProjectLocationPrefs {
  builtIn?: boolean;
}

/** Schema-versioned on-disk manifest identifying a directory as an Open Design project. */
export interface ProjectManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  skillId?: string | null;
  designSystemId?: string | null;
}

/**
 * Builds the always-present built-in location entry backed by the daemon's
 * managed `PROJECTS_DIR`.
 *
 * @param projectsDir Absolute path of the daemon-managed projects root.
 */
export function builtInProjectLocation(projectsDir: string): ProjectLocation {
  return {
    id: BUILT_IN_PROJECT_LOCATION_ID,
    name: 'Open Design projects',
    path: projectsDir,
    builtIn: true,
  };
}

/**
 * Returns every known project location: the built-in managed root first,
 * followed by user-configured external locations (if any).
 *
 * @param projectsDir Absolute path of the daemon-managed projects root.
 * @param external Persisted external location prefs, or `undefined` when none configured.
 */
export function allProjectLocations(projectsDir: string, external: ProjectLocationPrefs[] | undefined): ProjectLocation[] {
  return [builtInProjectLocation(projectsDir), ...(external ?? [])];
}

/**
 * Computes the directory a project occupies inside a location. Rejects unsafe
 * ids up-front so the joined path can never contain traversal segments.
 *
 * @throws Error when `projectId` fails `isSafeId`.
 */
export function locationProjectDir(location: ProjectLocation, projectId: string): string {
  if (!isSafeId(projectId)) throw new Error('invalid project id');
  return path.join(location.path, projectId);
}

/**
 * @internal
 * Containment invariant: a resolved project directory must be a strict child
 * of its (realpath'd) location root — never the root itself, an ancestor, or
 * an absolute escape.
 */
function assertInsideLocation(locationRoot: string, projectDir: string): void {
  const relative = path.relative(locationRoot, projectDir);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('project directory escapes project location');
  }
}

/**
 * Creates a new project directory inside a location and returns its canonical
 * (realpath) form. Fails if the directory already exists (`mkdir` without
 * `recursive`), is a symlink, or resolves outside the location root.
 *
 * @returns The canonical absolute project directory.
 */
export async function createLocationProjectDir(location: ProjectLocation, projectId: string): Promise<string> {
  const root = await realpath(location.path);
  const target = locationProjectDir({ ...location, path: root }, projectId);
  await mkdir(target, { recursive: false });
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('project directory must be a real directory');
  const canonical = await realpath(target);
  assertInsideLocation(root, canonical);
  return canonical;
}

/**
 * Resolves an *existing* child directory of a location to canonical form,
 * enforcing the same safety rules as creation: safe name, real directory (not
 * a symlink), and containment inside the location root.
 *
 * @returns The canonical absolute child directory.
 */
export async function canonicalLocationChildDir(location: ProjectLocation, childName: string): Promise<string> {
  const root = await realpath(location.path);
  if (!isSafeId(childName)) throw new Error('invalid project directory name');
  const target = path.join(root, childName);
  const info = await lstat(target);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('project directory must be a real directory');
  const canonical = await realpath(target);
  assertInsideLocation(root, canonical);
  return canonical;
}

/** Absolute path of a project's `.open-design/project.json` manifest. */
export function manifestPath(projectDir: string): string {
  return path.join(projectDir, PROJECT_MANIFEST_RELATIVE_PATH);
}

/**
 * Normalizes and materializes a user-supplied location path: expands a `~/`
 * prefix, requires the result to be absolute, creates the directory when
 * missing, and returns its canonical (realpath) form.
 *
 * @throws Error when the expanded path is not absolute.
 */
export async function ensureProjectLocation(locationPath: string): Promise<string> {
  const expanded = expandHomePrefix(locationPath.trim());
  if (!path.isAbsolute(expanded)) throw new Error(`project location must be an absolute path: ${locationPath}`);
  await mkdir(expanded, { recursive: true });
  return realpath(expanded);
}

/** Writes a project manifest, creating the `.open-design/` container on demand. */
export async function writeProjectManifest(projectDir: string, manifest: ProjectManifest): Promise<void> {
  const file = manifestPath(projectDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(manifest, null, 2), 'utf8');
}

/**
 * Reads and validates a project manifest. Returns `null` (rather than
 * throwing) for a missing file, malformed JSON, wrong schema version, or
 * unsafe/blank identity fields, so scanners can skip non-project directories
 * cheaply; unexpected I/O errors still propagate.
 */
export async function readProjectManifest(projectDir: string): Promise<ProjectManifest | null> {
  try {
    const raw = await readFile(manifestPath(projectDir), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.schemaVersion !== 1) return null;
    if (typeof obj.id !== 'string' || !isSafeId(obj.id)) return null;
    if (typeof obj.name !== 'string' || !obj.name.trim()) return null;
    const createdAt = typeof obj.createdAt === 'number' && Number.isFinite(obj.createdAt) ? obj.createdAt : Date.now();
    const updatedAt = typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt) ? obj.updatedAt : createdAt;
    return {
      schemaVersion: 1,
      id: obj.id,
      name: obj.name.trim(),
      createdAt,
      updatedAt,
      skillId: typeof obj.skillId === 'string' ? obj.skillId : null,
      designSystemId: typeof obj.designSystemId === 'string' ? obj.designSystemId : null,
    };
  } catch (err: unknown) {
    const e = err as { code?: string; name?: string };
    if (e.code === 'ENOENT' || e.name === 'SyntaxError') return null;
    throw err;
  }
}

/**
 * Enumerates the projects inside a location: every safe, canonical child
 * directory that carries a valid manifest. Children that fail safety
 * resolution are skipped silently — a location may legitimately contain
 * unrelated directories.
 *
 * @returns Pairs of canonical project directory and parsed manifest.
 */
export async function scanProjectLocation(location: ProjectLocation): Promise<Array<{ dir: string; manifest: ProjectManifest }>> {
  const entries = await readdir(location.path, { withFileTypes: true });
  const found: Array<{ dir: string; manifest: ProjectManifest }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let dir: string;
    try {
      dir = await canonicalLocationChildDir(location, entry.name);
    } catch {
      continue;
    }
    const manifest = await readProjectManifest(dir);
    if (manifest) found.push({ dir, manifest });
  }
  return found;
}

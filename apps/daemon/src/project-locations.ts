import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectLocationPrefs } from './app-config.js';
import { expandHomePrefix } from './home-expansion.js';
import { isSafeId } from './projects.js';

export const BUILT_IN_PROJECT_LOCATION_ID = 'default';
export const PROJECT_MANIFEST_RELATIVE_PATH = path.join('.open-design', 'project.json');

export interface ProjectLocation extends ProjectLocationPrefs {
  builtIn?: boolean;
}

export interface ProjectOutputs {
  /** Relative folder for design deliverables (e.g. `designs`). */
  designs?: string;
  /** Relative folder for plans / specs (e.g. `plans`). */
  plans?: string;
  /** Relative folder for binary store / assets (e.g. `store`). */
  store?: string;
}

export interface ProjectManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  skillId?: string | null;
  designSystemId?: string | null;
  /** Agent-chosen output folders, relative to the project root. */
  outputs?: ProjectOutputs;
}

const PROJECT_OUTPUT_DIR_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;

function normalizeOutputsDir(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/\\/g, '/');
  if (!trimmed) return undefined;
  if (trimmed.includes('\0')) return undefined;
  if (trimmed.startsWith('/') || /^[A-Za-z]:/.test(trimmed)) return undefined;
  const parts = trimmed.split('/').filter(Boolean);
  if (parts.length === 0) return undefined;
  // Outputs must stay visible and inside the project: no hidden segments,
  // no traversal, no absolute paths.
  if (parts.some((p) => p === '.' || p === '..' || p.startsWith('.'))) return undefined;
  const joined = parts.join('/');
  if (!PROJECT_OUTPUT_DIR_PATTERN.test(joined)) return undefined;
  return joined;
}

export function normalizeProjectOutputs(value: unknown): ProjectOutputs | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const out: ProjectOutputs = {};
  const designs = normalizeOutputsDir(obj.designs);
  const plans = normalizeOutputsDir(obj.plans);
  const store = normalizeOutputsDir(obj.store);
  if (designs) out.designs = designs;
  if (plans) out.plans = plans;
  if (store) out.store = store;
  return Object.keys(out).length > 0 ? out : undefined;
}

export function isProjectManifestPath(name: unknown): boolean {
  const normalized = String(name ?? '').replace(/\\/g, '/').split('/').filter(Boolean).join('/');
  return normalized === PROJECT_MANIFEST_RELATIVE_PATH.replace(/\\/g, '/');
}

export function builtInProjectLocation(projectsDir: string): ProjectLocation {
  return {
    id: BUILT_IN_PROJECT_LOCATION_ID,
    name: 'OpenDesign projects',
    path: projectsDir,
    builtIn: true,
  };
}

export function allProjectLocations(projectsDir: string, external: ProjectLocationPrefs[] | undefined): ProjectLocation[] {
  return [builtInProjectLocation(projectsDir), ...(external ?? [])];
}

export function locationProjectDir(location: ProjectLocation, projectId: string): string {
  if (!isSafeId(projectId)) throw new Error('invalid project id');
  return path.join(location.path, projectId);
}

function assertInsideLocation(locationRoot: string, projectDir: string): void {
  const relative = path.relative(locationRoot, projectDir);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('project directory escapes project location');
  }
}

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

export function manifestPath(projectDir: string): string {
  return path.join(projectDir, PROJECT_MANIFEST_RELATIVE_PATH);
}

export async function ensureProjectLocation(locationPath: string): Promise<string> {
  const expanded = expandHomePrefix(locationPath.trim());
  if (!path.isAbsolute(expanded)) throw new Error(`project location must be an absolute path: ${locationPath}`);
  await mkdir(expanded, { recursive: true });
  return realpath(expanded);
}

export async function writeProjectManifest(projectDir: string, manifest: ProjectManifest): Promise<void> {
  const file = manifestPath(projectDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(manifest, null, 2), 'utf8');
}

export async function upsertProjectManifestOutputs(
  projectDir: string,
  projectId: string,
  projectName: string,
  outputs: unknown,
): Promise<ProjectManifest> {
  const normalized = normalizeProjectOutputs(outputs);
  if (!normalized) throw new Error('no valid outputs: provide designs, plans, or store as relative folders');
  const existing = await readProjectManifest(projectDir);
  const now = Date.now();
  const next: ProjectManifest = {
    schemaVersion: 1,
    id: existing?.id ?? projectId,
    name: existing?.name ?? projectName,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    skillId: existing?.skillId ?? null,
    designSystemId: existing?.designSystemId ?? null,
    outputs: { ...(existing?.outputs ?? {}), ...normalized },
  };
  await writeProjectManifest(projectDir, next);
  return next;
}

export function resolveProjectOutputs(projectDir: string, manifest: ProjectManifest | null): Required<ProjectOutputs> {
  void projectDir;
  const outputs = manifest?.outputs ?? {};
  return {
    designs: outputs.designs ?? 'designs',
    plans: outputs.plans ?? 'plans',
    store: outputs.store ?? 'store',
  };
}

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
    const normalizedOutputs = normalizeProjectOutputs(obj.outputs);
    return {
      schemaVersion: 1,
      id: obj.id,
      name: obj.name.trim(),
      createdAt,
      updatedAt,
      skillId: typeof obj.skillId === 'string' ? obj.skillId : null,
      designSystemId: typeof obj.designSystemId === 'string' ? obj.designSystemId : null,
      ...(normalizedOutputs ? { outputs: normalizedOutputs } : {}),
    };
  } catch (err: unknown) {
    const e = err as { code?: string; name?: string };
    if (e.code === 'ENOENT' || e.name === 'SyntaxError') return null;
    throw err;
  }
}

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

import { readdir, realpath, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

export interface BrowseDirectory { name: string; path: string }
export interface DirectoryListing { path: string; parent: string | null; directories: BrowseDirectory[] }

const inside = (root: string, candidate: string): boolean => {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export async function canonicalBrowseRoots(setting = process.env.OD_DIRECTORY_BROWSER_ROOTS): Promise<string[]> {
  const configured = setting?.trim()
    ? setting.split(delimiter).map((item) => item.trim()).filter(Boolean)
    : [homedir()];
  const roots: string[] = [];
  for (const candidate of configured) {
    if (!isAbsolute(candidate)) continue;
    try {
      const canonical = await realpath(candidate);
      if ((await stat(canonical)).isDirectory()) roots.push(canonical);
    } catch { /* missing/unreadable roots are omitted */ }
  }
  return [...new Set(roots)];
}

export async function listBrowseDirectories(requested: unknown, configuredRoots?: string[]): Promise<DirectoryListing> {
  const roots = configuredRoots ?? await canonicalBrowseRoots();
  if (typeof requested !== 'string' || !requested || !isAbsolute(requested) || requested.includes('\0')) {
    throw Object.assign(new Error('Invalid directory path'), { status: 400 });
  }
  // Reject path traversal syntax even when normalization would happen to land
  // back inside an allowed root.
  if (requested.split(/[\\/]/).includes('..')) throw Object.assign(new Error('Directory is outside allowed roots'), { status: 403 });
  const lexical = resolve(requested);
  const matching = roots.filter((root) => inside(root, lexical));
  if (!matching.length) throw Object.assign(new Error('Directory is outside allowed roots'), { status: 403 });
  let canonical: string;
  try { canonical = await realpath(lexical); }
  catch { throw Object.assign(new Error('Directory is unavailable'), { status: 404 }); }
  const root = matching.find((candidate) => inside(candidate, canonical));
  if (!root) throw Object.assign(new Error('Directory is outside allowed roots'), { status: 403 });
  if (!(await stat(canonical)).isDirectory()) throw Object.assign(new Error('Not a directory'), { status: 400 });
  let entries;
  try { entries = await readdir(canonical, { withFileTypes: true }); }
  catch { throw Object.assign(new Error('Directory is unreadable'), { status: 403 }); }
  const directories: BrowseDirectory[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const child = resolve(canonical, entry.name);
    try {
      const real = await realpath(child);
      if (!inside(root, real) || !(await stat(real)).isDirectory()) continue;
      directories.push({ name: entry.name, path: real });
    } catch { /* omit inaccessible or broken entries */ }
  }
  directories.sort((a, b) => natural.compare(a.name, b.name));
  const parentPath = canonical === root ? null : resolve(canonical, '..');
  const parent = parentPath && inside(root, parentPath) ? parentPath : null;
  return { path: canonical, parent, directories };
}

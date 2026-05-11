import path from 'node:path';
import fs from 'node:fs';

const BLOCKED_CANONICAL = (() => {
  const raw =
    process.platform === 'win32'
      ? ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)']
      : ['/etc', '/proc', '/sys', '/dev', '/boot'];
  const set = new Set<string>(raw);
  for (const p of raw) {
    try { set.add(fs.realpathSync.native(p)); } catch { /* not resolvable, keep as-is */ }
  }
  return [...set];
})();

const WIN_ROOT_RE = /^[A-Za-z]:\\?$/;

function isFilesystemRoot(p: string): boolean {
  if (process.platform === 'win32') return WIN_ROOT_RE.test(p);
  return p === '/';
}

export function isBlocked(realPath: string): boolean {
  if (isFilesystemRoot(realPath)) return true;
  return BLOCKED_CANONICAL.some(
    (p: string) =>
      realPath === p ||
      realPath.startsWith(p + path.sep) ||
      p.startsWith(realPath + path.sep),
  );
}

export function validateLinkedDirs(
  dirs: unknown,
): { dirs: string[]; error?: undefined } | { error: string; dirs?: undefined } {
  if (!Array.isArray(dirs)) return { error: 'linkedDirs must be an array' };
  const validated: string[] = [];
  for (const d of dirs) {
    if (typeof d !== 'string' || !d.trim()) {
      return { error: 'each linked dir must be a non-empty string' };
    }
    if (!path.isAbsolute(d)) {
      return { error: `linked dir must be an absolute path: ${d}` };
    }
    let realPath: string;
    try {
      realPath = fs.realpathSync.native(path.resolve(d));
    } catch {
      return { error: `directory does not exist or is not accessible: ${d}` };
    }
    try {
      const stat = fs.statSync(realPath);
      if (!stat.isDirectory()) return { error: `not a directory: ${d}` };
    } catch {
      return { error: `directory does not exist or is not accessible: ${d}` };
    }
    if (isBlocked(realPath)) {
      return { error: `system directory not allowed: ${d}` };
    }
    validated.push(realPath);
  }
  return { dirs: [...new Set(validated)] };
}

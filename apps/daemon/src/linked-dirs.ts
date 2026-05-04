import path from 'node:path';
import fs from 'node:fs';

const BLOCKED_PATH_PREFIXES =
  process.platform === 'win32'
    ? ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)']
    : ['/etc', '/proc', '/sys', '/dev', '/boot'];

/** @type {(dirs: unknown) => { dirs: string[], error?: undefined } | { error: string, dirs?: undefined }} */
export function validateLinkedDirs(dirs) {
  if (!Array.isArray(dirs)) return { error: 'linkedDirs must be an array' };
  /** @type {string[]} */
  const validated = [];
  for (const d of dirs) {
    if (typeof d !== 'string' || !d.trim()) {
      return { error: 'each linked dir must be a non-empty string' };
    }
    if (!path.isAbsolute(d)) {
      return { error: `linked dir must be an absolute path: ${d}` };
    }
    const resolved = path.resolve(d);
    const blocked = BLOCKED_PATH_PREFIXES.some(
      (p) => resolved === p || resolved.startsWith(p + path.sep),
    );
    if (blocked) {
      return { error: `system directory not allowed: ${d}` };
    }
    try {
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) return { error: `not a directory: ${d}` };
    } catch {
      return { error: `directory does not exist or is not accessible: ${d}` };
    }
    validated.push(resolved);
  }
  return { dirs: [...new Set(validated)] };
}

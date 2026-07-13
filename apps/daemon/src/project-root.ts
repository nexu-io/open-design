import path from 'node:path';

export function resolveProjectRoot(moduleDir: string): string {
  const base = path.basename(moduleDir);
  const daemonDir =
    base === 'dist' || base === 'src' ? path.dirname(moduleDir) : moduleDir;
  return path.resolve(daemonDir, '../..');
}

export function resolveProjectRootFromNestedModule(moduleDir: string): string {
  let current = path.resolve(moduleDir);
  while (true) {
    const base = path.basename(current);
    if (base === 'dist' || base === 'src') {
      return resolveProjectRoot(current);
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return resolveProjectRoot(moduleDir);
    }
    current = parent;
  }
}

/** @module core/root
 * Daemon repository/package root resolution from a compiled or source module directory.
 * Pure path arithmetic; imports nothing, so any layer (including server bootstrap) can use it.
 */
import path from 'node:path';

/**
 * Resolves the daemon package root from a module directory that sits directly
 * under `dist/` or `src/`. Used at server startup to anchor runtime paths
 * regardless of whether the daemon runs from TypeScript source or built output.
 *
 * @param moduleDir Absolute directory of the calling module.
 * @returns The directory two levels above the `dist`/`src` container.
 */
export function resolveProjectRoot(moduleDir: string): string {
  const base = path.basename(moduleDir);
  const daemonDir =
    base === 'dist' || base === 'src' ? path.dirname(moduleDir) : moduleDir;
  return path.resolve(daemonDir, '../..');
}

/**
 * Like {@link resolveProjectRoot}, but works for modules nested arbitrarily
 * deep below `dist/` or `src/` (e.g. `src/runtimes/`): walks ancestors until
 * it finds the `dist`/`src` container, falling back to treating `moduleDir`
 * itself as directly-nested when no container exists.
 *
 * @param moduleDir Absolute directory of the calling module.
 * @returns The resolved daemon package root.
 */
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

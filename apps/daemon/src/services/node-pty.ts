import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type * as NodePty from 'node-pty';

const NODE_PTY_UNAVAILABLE_CODE = 'NODE_PTY_UNAVAILABLE';

export class NodePtyUnavailableError extends Error {
  readonly code = NODE_PTY_UNAVAILABLE_CODE;

  constructor(cause: unknown) {
    super('The native PTY helper could not be loaded.', { cause });
    this.name = 'NodePtyUnavailableError';
  }
}

export function isNodePtyUnavailableError(error: unknown): error is NodePtyUnavailableError {
  return error instanceof NodePtyUnavailableError
    || (
      error instanceof Error
      && 'code' in error
      && error.code === NODE_PTY_UNAVAILABLE_CODE
    );
}

/**
 * Resolve node-pty's POSIX spawn-helper candidates without importing its
 * native addon. The lookup keeps Terminal users on the package-relative
 * runtime boundary used by the packaged app.
 */
export function spawnHelperCandidatePaths(): string[] {
  if (process.platform === 'win32') return [];
  let packageRoot: string;
  try {
    const require = createRequire(import.meta.url);
    packageRoot = path.dirname(path.dirname(require.resolve('node-pty')));
  } catch {
    return [];
  }
  return [
    path.join(packageRoot, 'build', 'Release', 'spawn-helper'),
    path.join(packageRoot, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
  ];
}

/**
 * npm's published prebuild may unpack spawn-helper without execute bits.
 * Repair it before loading node-pty; failure remains best-effort because the
 * subsequent import/spawn provides the attributable capability error.
 */
export function ensureSpawnHelperExecutable(): void {
  for (const file of spawnHelperCandidatePaths()) {
    try {
      const metadata = fs.statSync(file);
      if (metadata.mode & 0o100) continue;
      fs.chmodSync(file, metadata.mode | 0o111);
    } catch {
      // Missing/read-only candidates are handled by the import or spawn call.
    }
  }
}

let loadedNodePty: typeof NodePty | null = null;

export async function loadNodePty(): Promise<typeof NodePty> {
  if (loadedNodePty != null) return loadedNodePty;
  ensureSpawnHelperExecutable();
  try {
    loadedNodePty = (await import('node-pty')) as typeof NodePty;
    return loadedNodePty;
  } catch (error) {
    throw new NodePtyUnavailableError(error);
  }
}

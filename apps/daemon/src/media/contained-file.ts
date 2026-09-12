import { constants as fsConstants, type BigIntStats } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';

// Test seam mirroring projectFileWriteTestHooks: fires after the canonical
// containment check and before the no-follow open, so a spec can swap the entry
// the way a concurrent writer can.
export const containedFileTestHooks = {
  afterResolve: null as null | ((resolvedPath: string) => Promise<void> | void),
};

// POSIX rejects a final symlink at open() time with O_NOFOLLOW; platforms
// without the flag fall back to the fstat identity check below.
const NO_FOLLOW_READ = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);

function sameIdentity(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

// Canonical containment invariant for project reference images: the realpath'd
// target of the candidate must stay inside `dir`. realpath follows symlinks, so
// a project-local symlink to an outside file throws EPATHESCAPE before any open
// can observe the target's size or bytes.
export async function resolveContainedPath(dir: string, candidate: string): Promise<string> {
  const rootReal = await realpath(dir).catch(() => dir);
  const real = await realpath(candidate);
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) {
    const err = new Error('path escapes project dir via symlink');
    (err as NodeJS.ErrnoException).code = 'EPATHESCAPE';
    throw err;
  }
  return real;
}

export interface ContainedFileHandle {
  size: number;
  mtimeMs: number;
  read(): Promise<Buffer>;
  close(): Promise<void>;
}

// Open a path that resolveContainedPath already proved is inside the project
// without following a final symlink, and prove the handle is the same regular
// file the pathname named. Callers read through this handle so a swap between
// resolution and read can never surface another file's size or bytes.
export async function openContainedFile(resolvedPath: string): Promise<ContainedFileHandle> {
  const expected = await lstat(resolvedPath, { bigint: true });
  if (!expected.isFile()) {
    const err = new Error('not a regular file');
    (err as NodeJS.ErrnoException).code = 'ENOTFILE';
    throw err;
  }
  await containedFileTestHooks.afterResolve?.(resolvedPath);
  const handle = await open(resolvedPath, NO_FOLLOW_READ);
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || !sameIdentity(expected, stat)) {
      const err = new Error('file changed before it could be opened');
      (err as NodeJS.ErrnoException).code = 'ETOCTOU';
      throw err;
    }
    return {
      size: Number(stat.size),
      mtimeMs: Number(stat.mtimeMs),
      read: () => handle.readFile(),
      close: () => handle.close(),
    };
  } catch (err) {
    await handle.close().catch(() => {});
    throw err;
  }
}

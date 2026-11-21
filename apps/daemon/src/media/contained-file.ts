import { constants as fsConstants, type BigIntStats } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';

// Test seam mirroring projectFileWriteTestHooks: fires after the canonical
// resolution of the candidate and before it is statted or opened, so a spec can
// swap the entry or a parent directory the way a concurrent writer can.
export const containedFileTestHooks = {
  afterResolve: null as null | ((resolvedPath: string) => Promise<void> | void),
};

const NO_FOLLOW_READ = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
const NO_FOLLOW_DIR =
  fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0);

function sameIdentity(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

function withinRoot(rootPath: string, candidatePath: string): boolean {
  return candidatePath === rootPath || candidatePath.startsWith(rootPath + path.sep);
}

interface AnchoredRoot {
  path: string;
  close(): Promise<void>;
}

// Pin the project directory to an opened handle so a swap of its pathname cannot
// redirect a later read. Linux exposes the opened directory through procfs,
// which gives the kernel's own real path for the handle; platforms without
// procfs keep the resolved pathname plus the final-component no-follow and
// fstat identity checks, mirroring task-input-snapshot.ts.
async function openAnchoredRoot(dir: string): Promise<AnchoredRoot> {
  const handle = await open(dir, NO_FOLLOW_DIR);
  if (process.platform !== 'linux') {
    return { path: await realpath(dir), close: () => handle.close() };
  }
  try {
    return {
      path: await realpath(`/proc/self/fd/${handle.fd}`),
      close: () => handle.close(),
    };
  } catch (err) {
    await handle.close().catch(() => {});
    throw err;
  }
}

function containmentError(message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = 'EPATHESCAPE';
  return err;
}

export interface ContainedFileHandle {
  resolvedPath: string;
  size: number;
  mtimeMs: number;
  read(): Promise<Buffer>;
  close(): Promise<void>;
}

// Read a project file through an identity-checked chain: the project directory
// is opened once so its inode is pinned, the realpath'd candidate must stay
// beneath that handled root, the entry itself is opened without following a
// final symlink, and on Linux the opened file's procfs real path must still sit
// beneath the handled root. Callers read size and bytes from this same handle,
// so no swap between validation and read can surface another file's bytes.
export async function openContainedFile(
  dir: string,
  candidate: string,
): Promise<ContainedFileHandle> {
  const root = await openAnchoredRoot(dir);
  try {
    const real = await realpath(candidate);
    if (!withinRoot(root.path, real)) throw containmentError('path escapes project dir');
    await containedFileTestHooks.afterResolve?.(real);
    const expected = await lstat(real, { bigint: true });
    if (!expected.isFile()) {
      const err = new Error('not a regular file') as NodeJS.ErrnoException;
      err.code = 'ENOTFILE';
      throw err;
    }
    const handle = await open(real, NO_FOLLOW_READ);
    try {
      const stat = await handle.stat({ bigint: true });
      if (!stat.isFile() || !sameIdentity(expected, stat)) {
        const err = new Error('file changed before it could be opened') as NodeJS.ErrnoException;
        err.code = 'ETOCTOU';
        throw err;
      }
      if (process.platform === 'linux') {
        const openedPath = await realpath(`/proc/self/fd/${handle.fd}`);
        if (!withinRoot(root.path, openedPath)) {
          const err = new Error('file left the project dir while being opened') as NodeJS.ErrnoException;
          err.code = 'ETOCTOU';
          throw err;
        }
      }
      return {
        resolvedPath: real,
        size: Number(stat.size),
        mtimeMs: Number(stat.mtimeMs),
        read: () => handle.readFile(),
        close: () => handle.close(),
      };
    } catch (err) {
      await handle.close().catch(() => {});
      throw err;
    }
  } finally {
    await root.close().catch(() => {});
  }
}

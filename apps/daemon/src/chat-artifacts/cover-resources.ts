import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { isIgnoredProjectDirName } from '../project-ignored-dirs.js';
import { mimeForArtifactPath } from './mime.js';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg']);
const MAX_VISITED_ENTRIES = 10_000;
const IMAGE_ENUMERATION_BUDGET_MS = 2_000;
let activeRawBytes = 0;

export class CoverResourceBudgetError extends Error {}
export class CoverResourceChangedError extends Error {}
export class CoverResourceUnsupportedError extends Error {}

function checkDeadline(deadline?: number): void {
  if (deadline !== undefined && performance.now() >= deadline) throw new CoverResourceBudgetError('cover image enumeration exceeded time budget');
}

/** App-local frozen bytes; the export adapter owns the wire contract. */
export interface CoverResource {
  path: string;
  mime: string;
  bytesBase64: string;
  sha256: string;
}

/** Supplied by the export adapter so transport limits have one truth source. */
export interface CoverResourceBudget {
  readonly entryBytes: number;
  readonly assetBytes: number;
  readonly rawBytes: number;
  readonly resourceCount: number;
  readonly activeRawBytes: number;
}

type ReadResource = {
  buffer: Buffer;
  resource: CoverResource;
  absolute: string;
  size: number;
  mtimeMs: number;
  ino: number;
};

/** One turn owns this cache; several HTML covers share the same byte objects. */
export class CoverResourceCollector {
  private readonly resources = new Map<string, ReadResource>();
  private readonly imagePaths = new Set<string>();
  private pool: Promise<void> | undefined;
  private bytes = 0;
  private owners = 1;
  private released = false;

  constructor(
    private readonly projectRoot: string,
    private readonly budget: CoverResourceBudget,
  ) {}

  retain(): () => void {
    this.owners += 1;
    return () => this.release();
  }

  release(): void {
    this.owners -= 1;
    if (this.owners !== 0 || this.released) return;
    this.released = true;
    activeRawBytes -= this.bytes;
    this.resources.clear();
  }

  async read(projectPath: string, entry = false, deadline?: number): Promise<ReadResource> {
    checkDeadline(deadline);
    if (this.released) throw new Error('cover resources already released');
    const cached = this.resources.get(projectPath);
    if (cached) return cached;
    const parts = projectPath.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..') || /[\\\u0000-\u001f\u007f]/u.test(projectPath)) {
      throw new Error('invalid cover resource path');
    }
    if (parts.some((part) => part.startsWith('.') || isIgnoredProjectDirName(part))) {
      throw new CoverResourceUnsupportedError('explicit dependency requires legacy capture visibility');
    }
    const rootReal = await fs.promises.realpath(this.projectRoot);
    checkDeadline(deadline);
    const absolute = await fs.promises.realpath(path.join(rootReal, ...parts));
    checkDeadline(deadline);
    if (!absolute.startsWith(`${rootReal}${path.sep}`)) throw new Error('cover resource escapes project');
    // Keep symlink-only files out of the dynamic pool. A dependency whose
    // resolved target is safely inside this project retains legacy freezing.
    let current = rootReal;
    for (const part of parts) {
      current = path.join(current, part);
      if ((await fs.promises.lstat(current)).isSymbolicLink()) throw new CoverResourceUnsupportedError('project-internal symlink requires legacy capture');
      checkDeadline(deadline);
    }
    const handle = await fs.promises.open(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    let buffer: Buffer;
    let before: fs.Stats;
    try {
      checkDeadline(deadline);
      before = await handle.stat();
      checkDeadline(deadline);
      const limit = entry ? this.budget.entryBytes : this.budget.assetBytes;
      if (!before.isFile()) throw new Error('cover resource is not a file');
      if (before.size > limit || this.bytes + before.size > this.budget.rawBytes || activeRawBytes + before.size > this.budget.activeRawBytes) {
        throw new CoverResourceBudgetError('cover resources exceed byte budget');
      }
      // Reserve before allocating/reading; a growing file cannot turn readFile
      // into an unbounded allocation after the size check.
      this.bytes += before.size;
      activeRawBytes += before.size;
      buffer = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < buffer.length) {
        const result = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (result.bytesRead === 0) break;
        offset += result.bytesRead;
        checkDeadline(deadline);
      }
      const extra = Buffer.alloc(1);
      const beyond = await handle.read(extra, 0, 1, before.size);
      const after = await handle.stat();
      checkDeadline(deadline);
      if (offset !== buffer.length || beyond.bytesRead || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ino !== before.ino) {
        throw new CoverResourceChangedError('cover resource changed while reading');
      }
    } finally {
      await handle.close();
    }
    checkDeadline(deadline);
    const resource: CoverResource = {
      path: projectPath,
      mime: mimeForArtifactPath(projectPath) ?? 'application/octet-stream',
      bytesBase64: buffer.toString('base64'),
      sha256: createHash('sha256').update(buffer).digest('hex'),
    };
    const value = { buffer, resource, absolute, size: before.size, mtimeMs: before.mtimeMs, ino: before.ino };
    this.resources.set(projectPath, value);
    return value;
  }

  async includeImagePool(): Promise<void> {
    this.pool ??= this.scanImages();
    return this.pool;
  }

  forDocument(entryPath: string, explicitPaths: ReadonlySet<string>): CoverResource[] {
    const selected = new Set([...explicitPaths, ...this.imagePaths]);
    selected.delete(entryPath);
    if (selected.size > this.budget.resourceCount) throw new CoverResourceBudgetError('too many cover resources');
    return [...selected].sort().map((name) => this.resources.get(name)!.resource);
  }

  async verify(paths: ReadonlySet<string>): Promise<boolean> {
    for (const [name, value] of this.resources) {
      if (!paths.has(name)) continue;
      try {
        const current = await fs.promises.stat(value.absolute);
        if (current.size !== value.size || current.mtimeMs !== value.mtimeMs || current.ino !== value.ino) return false;
      } catch { return false; }
    }
    return true;
  }

  private async scanImages(): Promise<void> {
    let visited = 0;
    const deadline = performance.now() + IMAGE_ENUMERATION_BUDGET_MS;
    const walk = async (relative: string): Promise<void> => {
      checkDeadline(deadline);
      const directory = await fs.promises.opendir(path.join(this.projectRoot, relative));
      for await (const item of directory) {
        checkDeadline(deadline);
        if (++visited > MAX_VISITED_ENTRIES) throw new CoverResourceBudgetError('cover enumeration exceeds entry budget');
        if (item.name.startsWith('.') || isIgnoredProjectDirName(item.name) || /[\\\u0000-\u001f\u007f]/u.test(item.name)) continue;
        const name = relative ? `${relative}/${item.name}` : item.name;
        if (item.isDirectory()) { await walk(name); continue; }
        if (!item.isFile() || !IMAGE_EXTENSIONS.has(path.extname(item.name).toLowerCase())) continue;
        if (this.imagePaths.size >= this.budget.resourceCount) throw new CoverResourceBudgetError('cover image pool exceeds count budget');
        const value = await this.read(name, false, deadline);
        checkDeadline(deadline);
        if (isImage(value.buffer, path.extname(item.name).toLowerCase())) this.imagePaths.add(name);
      }
      checkDeadline(deadline);
    };
    await walk('');
  }
}

function isImage(bytes: Buffer, extension: string): boolean {
  if (extension === '.png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === '.jpg' || extension === '.jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === '.gif') return /^GIF8[79]a$/u.test(bytes.subarray(0, 6).toString('ascii'));
  if (extension === '.webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (extension === '.avif') return bytes.subarray(4, 8).toString('ascii') === 'ftyp' && /avif|avis/u.test(bytes.subarray(8, 32).toString('ascii'));
  if (extension === '.svg') {
    // Format identification only; don't allocate a DOM for every optional SVG.
    // The actual renderer remains responsible for decoding the whole document.
    const head = bytes.subarray(0, 4096).toString('utf8').replace(/^\uFEFF/u, '');
    const stripped = head.replace(/^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*/u, '');
    return /^<svg(?:\s|>)/u.test(stripped);
  }
  return false;
}

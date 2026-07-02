// Brand filesystem store. Each brand lives under
// `<brandsRoot>/<id>/` with:
//   - brand.json   : the canonical Brand (when extracted)
//   - meta.json    : the BrandMeta lifecycle record
//   - guide.md     : optional prose brand guide
//   - logos/       : downloaded logo candidate files
//
// Pure fs CRUD: no network, no LLM. IDs are validated against a strict slug
// pattern and every relative-path resolution is guarded against traversal.

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { Brand, BrandMeta } from '@open-design/contracts';

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

type BrandMetaPatch = Partial<Omit<BrandMeta, 'error' | 'extractionTerminalRunId' | 'extractionTerminalError' | 'extractionRunId' | 'blockedReason'>> & {
  error?: string | undefined;
  extractionTerminalRunId?: string | undefined;
  extractionTerminalError?: string | undefined;
  extractionRunId?: string | undefined;
  blockedReason?: string | undefined;
};

/** True when `id` is a safe single-segment brand directory name. */
export function isValidBrandId(id: string): boolean {
  return ID_RE.test(id) && !id.includes('..');
}

/** "https://www.acme.co/pricing" → "acme" (host slug, www-stripped). */
function hostSlug(sourceUrl: string): string {
  let host = '';
  try {
    host = new URL(sourceUrl).hostname;
  } catch {
    host = sourceUrl;
  }
  const core = host
    .replace(/^www\./i, '')
    .split('.')[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') ?? '';
  return core || 'brand';
}

/**
 * Derive a brand id from a source URL: a host slug plus a 6-char random suffix
 * so concurrent extractions of the same host never collide. The suffix uses
 * crypto.randomBytes (not Math.random).
 */
export function newBrandId(sourceUrl: string): string {
  const slug = hostSlug(sourceUrl);
  const suffix = randomBytes(4).toString('hex').slice(0, 6);
  return `${slug}-${suffix}`;
}

function brandDir(brandsRoot: string, id: string): string {
  return path.join(brandsRoot, id);
}

/**
 * Resolve `relParts` under a brand dir with a traversal guard. Returns the
 * absolute path, or null when the id is invalid or the resolved path escapes
 * the brand dir.
 */
export function resolveBrandFile(
  brandsRoot: string,
  id: string,
  relParts: string[],
): string | null {
  if (!isValidBrandId(id)) return null;
  const base = path.resolve(brandDir(brandsRoot, id));
  const target = path.resolve(base, ...relParts);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) return null;
  return target;
}

/** Create the brand dir and write its initial meta.json. */
export function createBrandDir(brandsRoot: string, id: string, meta: BrandMeta): void {
  if (!isValidBrandId(id)) throw new Error(`invalid brand id: ${id}`);
  fs.mkdirSync(brandDir(brandsRoot, id), { recursive: true });
  writeMeta(brandsRoot, id, meta);
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

export function readMeta(brandsRoot: string, id: string): BrandMeta | null {
  const file = resolveBrandFile(brandsRoot, id, ['meta.json']);
  if (!file) return null;
  return readJson<BrandMeta>(file);
}

export function writeMeta(brandsRoot: string, id: string, meta: BrandMeta): void {
  const file = resolveBrandFile(brandsRoot, id, ['meta.json']);
  if (!file) throw new Error(`invalid brand id: ${id}`);
  writeJson(file, meta);
}

/** Shallow-merge a partial patch onto the stored meta (bumps updatedAt).
 *  Returns the merged meta, or null when the brand is missing. */
export function patchMeta(
  brandsRoot: string,
  id: string,
  patch: BrandMetaPatch,
): BrandMeta | null {
  const current = readMeta(brandsRoot, id);
  if (!current) return null;
  const {
    error: patchError,
    extractionTerminalRunId: patchExtractionTerminalRunId,
    extractionTerminalError: patchExtractionTerminalError,
    extractionRunId: patchExtractionRunId,
    blockedReason: patchBlockedReason,
    ...rest
  } = patch;
  const next: BrandMeta = { ...current, ...rest, updatedAt: Date.now() };
  if (Object.prototype.hasOwnProperty.call(patch, 'error')) {
    if (patchError === undefined) {
      delete next.error;
    } else {
      next.error = patchError;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'extractionTerminalRunId')) {
    if (patchExtractionTerminalRunId === undefined) {
      delete next.extractionTerminalRunId;
    } else {
      next.extractionTerminalRunId = patchExtractionTerminalRunId;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'extractionTerminalError')) {
    if (patchExtractionTerminalError === undefined) {
      delete next.extractionTerminalError;
    } else {
      next.extractionTerminalError = patchExtractionTerminalError;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'extractionRunId')) {
    if (patchExtractionRunId === undefined) {
      delete next.extractionRunId;
    } else {
      next.extractionRunId = patchExtractionRunId;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'blockedReason')) {
    if (patchBlockedReason === undefined) {
      delete next.blockedReason;
    } else {
      next.blockedReason = patchBlockedReason;
    }
  }
  writeMeta(brandsRoot, id, next);
  return next;
}

export function readBrand(brandsRoot: string, id: string): Brand | null {
  const file = resolveBrandFile(brandsRoot, id, ['brand.json']);
  if (!file) return null;
  return readJson<Brand>(file);
}

export function writeBrand(brandsRoot: string, id: string, brand: Brand): void {
  const file = resolveBrandFile(brandsRoot, id, ['brand.json']);
  if (!file) throw new Error(`invalid brand id: ${id}`);
  writeJson(file, brand);
}

export function readBrandGuide(brandsRoot: string, id: string): string | null {
  const file = resolveBrandFile(brandsRoot, id, ['guide.md']);
  if (!file) return null;
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function writeBrandGuide(brandsRoot: string, id: string, guide: string): void {
  const file = resolveBrandFile(brandsRoot, id, ['guide.md']);
  if (!file) throw new Error(`invalid brand id: ${id}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, guide, 'utf8');
}

/** Directory names of every brand (valid ids only), newest dir first by mtime. */
export function listBrandIds(brandsRoot: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(brandsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  const ids = entries
    .filter((e) => e.isDirectory() && isValidBrandId(e.name))
    .map((e) => e.name);
  return ids.sort((a, b) => {
    const ma = statMtime(path.join(brandsRoot, a));
    const mb = statMtime(path.join(brandsRoot, b));
    return mb - ma;
  });
}

function statMtime(dir: string): number {
  try {
    return fs.statSync(dir).mtimeMs;
  } catch {
    return 0;
  }
}

/** Remove a brand directory and everything under it. Returns false on miss. */
export function deleteBrandDir(brandsRoot: string, id: string): boolean {
  if (!isValidBrandId(id)) return false;
  const dir = brandDir(brandsRoot, id);
  try {
    fs.rmSync(dir, { recursive: true, force: false });
    return true;
  } catch {
    return false;
  }
}

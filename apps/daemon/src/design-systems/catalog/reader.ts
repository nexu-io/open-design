/** @module reader
 * Read-only catalog operations: listing all design systems (built-in + installed + user), reading a single entry, resolving package info, and pulling individual files.
 * Parses DESIGN.md front-matter and body to populate DesignSystemSummary; delegates asset resolution to assets.ts.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { parseFrontmatter } from '../core/frontmatter.js';
import type { FrontmatterObject, FrontmatterValue } from '../core/frontmatter.js';

import {
  classifyDesignSystemFile,
  isAbsenceError,
  isSafeManifestPath,
  isTextDesignSystemPullFile,
  readProjectManifest,
  sanitizeRelativeFilePath,
  stripPrefixAndValidateId,
} from '../core/file-utils.js';
import {
  buildDesignSystemPullFileAllowlist,
  buildDesignSystemPullIndex,
  readDesignSystemSourceEvidence,
} from './assets.js';
import {
  cleanTitle,
  extractCategory,
  extractSurface,
  isDesignSystemSurface,
  normalizeHex,
  pickSwatchRow,
  extractSwatches,
  summarize,
} from '../core/body.js';
import { readUserMetadata } from '../core/metadata.js';
import type {
  ColorToken,
  DesignSystemListOptions,
  DesignSystemPackageInfo,
  DesignSystemPullFileDetail,
  DesignSystemStaticFileDetail,
  DesignSystemSummary,
  DesignSystemSurface,
  SwatchRow,
} from '../core/types.js';

const STATIC_SYSTEM_FILES = new Set([
  'system/index.html', 'system/kit.html', 'system/kit.dark.html',
  'system/tokens.default.json', 'system/artifacts/landing.html',
  'system/artifacts/deck.html', 'system/artifacts/poster.html',
  'system/artifacts/email.html', 'system/artifacts/newsletter.html',
  'system/artifacts/form.html',
]);

function staticContentType(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif', '.woff': 'font/woff',
    '.woff2': 'font/woff2', '.ttf': 'font/ttf' } as Record<string, string>)[ext] ?? 'application/octet-stream';
}

export async function readDesignSystemStaticFile(
  root: string,
  id: string,
  relativePath: string,
  options: { idPrefix?: string } = {},
): Promise<DesignSystemStaticFileDetail | null> {
  const dirId = stripPrefixAndValidateId(id, options.idPrefix);
  const cleanPath = sanitizeRelativeFilePath(relativePath);
  if (!dirId || !cleanPath || !isSafeManifestPath(cleanPath)) return null;
  const brandRoot = path.join(root, dirId);
  const manifest = await readProjectManifest(brandRoot, dirId);
  const allowed = new Set([
    manifest?.files.design ?? 'DESIGN.md', manifest?.files.tokens ?? 'tokens.css',
    manifest?.files.components ?? 'components.html', manifest?.files.designTokens,
    manifest?.files.tailwind, manifest?.usage ?? 'USAGE.md',
    manifest?.componentsManifest ?? 'components.manifest.json',
    ...(manifest?.preview?.pages ?? []).map((page) => page.path),
    ...(manifest?.fonts ?? []).map((font) => font.file),
  ].filter((value): value is string => typeof value === 'string'));
  if (!STATIC_SYSTEM_FILES.has(cleanPath) && !allowed.has(cleanPath)) return null;
  const filePath = path.resolve(brandRoot, cleanPath);
  const resolvedRoot = path.resolve(brandRoot);
  if (filePath !== resolvedRoot && !filePath.startsWith(`${resolvedRoot}${path.sep}`)) return null;
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return null;
    return { path: cleanPath, name: path.basename(cleanPath), kind: classifyDesignSystemFile(cleanPath, false), size: stats.size, updatedAt: stats.mtime.toISOString(), contentType: staticContentType(cleanPath), bytes: await readFile(filePath) };
  } catch (error) {
    if (isAbsenceError(error)) return null;
    throw error;
  }
}

/**
 * @internal
 * Extracts a string field from a YAML frontmatter object, returning `''` when
 * the field is absent or not a string.
 */
function stringField(data: FrontmatterObject, key: string): string {
  const v: FrontmatterValue | undefined = data[key];
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * @internal
 * Resolves the `surface` frontmatter field to a `DesignSystemSurface` value,
 * or `undefined` when absent or unrecognised.
 */
function frontmatterSurface(data: FrontmatterObject): DesignSystemSurface | undefined {
  const v = stringField(data, 'surface').toLowerCase();
  return isDesignSystemSurface(v) ? v : undefined;
}

/**
 * @internal
 * Parses a `colors` frontmatter object (key → hex string) into a `SwatchRow`.
 * Returns `null` when the field is absent, not an object, or yields no valid hex values.
 */
function swatchesFromFrontmatter(data: FrontmatterObject): SwatchRow | null {
  const raw = data['colors'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const colors: ColorToken[] = [];
  const seen = new Set<string>();
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== 'string') continue;
    const hex = normalizeHex(value);
    if (!hex) continue;
    const cleanName = name.replace(/\s+/g, ' ').trim().toLowerCase();
    const key = `${cleanName}|${hex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push({ name: cleanName, value: hex });
  }
  if (colors.length === 0) return null;
  return pickSwatchRow(colors);
}

/**
 * @internal
 * Picks the final swatch array to include in a `DesignSystemSummary`.
 * Frontmatter wins only when it fills all four semantic slots; otherwise
 * Markdown swatches take priority over a partial frontmatter row.
 *
 * @param frontmatter - Parsed swatch row from YAML `colors` field, or `null`.
 * @param markdownSwatches - Hex values extracted from Markdown body.
 */
function pickFinalSwatchRow(
  frontmatter: SwatchRow | null,
  markdownSwatches: string[],
): string[] {
  if (frontmatter !== null && frontmatter.filledAllSlots) return frontmatter.values;
  if (markdownSwatches.length > 0) return markdownSwatches;
  return frontmatter?.values ?? [];
}

/**
 * Scans `root` for design-system directories (each containing a `DESIGN.md`)
 * and returns lightweight summaries. Directories that lack a `DESIGN.md` or
 * produce I/O errors are silently skipped.
 *
 * @param root - Absolute path to a design-systems root directory.
 * @param options - Optional scan modifiers (id prefix, source tag, editability, default status).
 * @returns Array of summaries, one per successfully read design system.
 */
export async function listDesignSystems(
  root: string,
  options: DesignSystemListOptions = {},
): Promise<DesignSystemSummary[]> {
  const { readdir } = await import('node:fs/promises');
  const out: DesignSystemSummary[] = [];
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const brandRoot = path.join(root, entry.name);
    const manifest = await readProjectManifest(brandRoot, entry.name);
    const designPath = path.join(brandRoot, manifest?.files.design ?? 'DESIGN.md');
    try {
      const stats = await stat(designPath);
      if (!stats.isFile()) continue;
      const raw = await readFile(designPath, 'utf8');
      const metadata = await readUserMetadata(root, entry.name);
      const { data: frontmatter, body } = parseFrontmatter(raw);
      const titleMatch = /^#\s+(.+?)\s*$/m.exec(body);
      const markdownTitle =
        titleMatch?.[1] !== undefined ? cleanTitle(titleMatch[1]) : '';
      const fallbackTitle = markdownTitle || stringField(frontmatter, 'name') || entry.name;
      const title = cleanTitle(
        metadata.title
        ?? manifest?.name
        ?? fallbackTitle,
      );
      const frontmatterCategory = stringField(frontmatter, 'category');
      const category = (
        metadata.category
        ?? manifest?.category
        ?? extractCategory(body)
        ?? frontmatterCategory
      ) || 'Uncategorized';
      const markdownSummary = summarize(body);
      const markdownSwatches = extractSwatches(body);
      const frontmatterSwatchRow = swatchesFromFrontmatter(frontmatter);
      const swatches = pickFinalSwatchRow(frontmatterSwatchRow, markdownSwatches);
      out.push({
        id: `${options.idPrefix ?? ''}${entry.name}`,
        title,
        category,
        summary:
          (manifest?.description?.trim() || markdownSummary)
          || stringField(frontmatter, 'description')
          || '',
        swatches,
        surface:
          metadata.surface
          ?? extractSurface(body)
          ?? frontmatterSurface(frontmatter)
          ?? 'web',
        body: raw,
        source: options.source ?? 'built-in',
        status: metadata.status ?? options.defaultStatus ?? 'published',
        isEditable: options.isEditable ?? false,
        ...(metadata.createdAt ? { createdAt: metadata.createdAt } : {}),
        ...(metadata.updatedAt ? { updatedAt: metadata.updatedAt } : {}),
        ...(metadata.provenance ? { provenance: metadata.provenance } : {}),
        ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
      });
    } catch {
      // Skip directories that produce I/O errors.
    }
  }
  return out;
}

/**
 * Reads the raw DESIGN.md content for a single design system, resolving the
 * file path from `manifest.json` when present.
 *
 * @param root - Absolute path to the design-systems root directory.
 * @param id - Design-system identifier (with optional prefix, e.g. `"user:my-brand"`).
 * @param options - Optional `idPrefix` to strip from `id` before directory lookup.
 * @returns Raw DESIGN.md content, or `null` when the entry does not exist.
 */
export async function readDesignSystem(
  root: string,
  id: string,
  options: { idPrefix?: string } = {},
): Promise<string | null> {
  const dirId = stripPrefixAndValidateId(id, options.idPrefix);
  if (!dirId) return null;
  const brandRoot = path.join(root, dirId);
  const manifest = await readProjectManifest(brandRoot, dirId);
  const file = path.join(brandRoot, manifest?.files.design ?? 'DESIGN.md');
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Returns manifest and source-evidence metadata for a design system, or `null`
 * when no `manifest.json` exists (legacy or user-owned packages without a manifest
 * are excluded).
 *
 * @param root - Absolute path to the design-systems root directory.
 * @param id - Design-system identifier.
 * @param options - Optional `idPrefix` to strip from `id` before directory lookup.
 */
export async function readDesignSystemPackageInfo(
  root: string,
  id: string,
  options: { idPrefix?: string } = {},
): Promise<DesignSystemPackageInfo | null> {
  const dirId = stripPrefixAndValidateId(id, options.idPrefix);
  if (!dirId) return null;
  const brandRoot = path.join(root, dirId);
  const manifest = await readProjectManifest(brandRoot, dirId);
  if (manifest === null) return null;

  const sourceEvidence = await readDesignSystemSourceEvidence(brandRoot, manifest);
  const availableFiles = await listAvailableDesignSystemPackageFiles(brandRoot, manifest);
  return {
    manifest,
    ...(availableFiles.length > 0 ? { availableFiles } : {}),
    ...(sourceEvidence ? { sourceEvidence } : {}),
  };
}

async function listAvailableDesignSystemPackageFiles(
  brandRoot: string,
  manifest: NonNullable<Awaited<ReturnType<typeof readProjectManifest>>>,
): Promise<string[]> {
  const candidates = new Set<string>(STATIC_SYSTEM_FILES);
  const add = (filePath: string | undefined): void => {
    const cleanPath = typeof filePath === 'string' ? sanitizeRelativeFilePath(filePath) : null;
    if (cleanPath) candidates.add(cleanPath);
  };

  add(manifest.files.design);
  add(manifest.files.tokens);
  add(manifest.files.components);
  add(manifest.files.designTokens);
  add(manifest.files.tailwind);
  add(manifest.usage);
  add(manifest.componentsManifest);
  for (const page of manifest.preview?.pages ?? []) add(page.path);
  for (const font of manifest.fonts ?? []) add(font.file);

  const out: string[] = [];
  const resolvedRoot = path.resolve(brandRoot);
  for (const relativePath of Array.from(candidates).sort()) {
    const filePath = path.resolve(brandRoot, relativePath);
    if (filePath !== resolvedRoot && !filePath.startsWith(`${resolvedRoot}${path.sep}`)) continue;
    try {
      const stats = await stat(filePath);
      if (stats.isFile()) out.push(relativePath);
    } catch (err) {
      if (!isAbsenceError(err)) throw err;
    }
  }
  return out;
}

/**
 * Reads a single file from a design system's pull-file allowlist (declared in
 * `manifest.json`). Files outside the manifest allowlist, paths that escape the
 * brand root, or absent files all return `null`.
 *
 * Text files are returned with `encoding: 'utf8'`; binary files with `encoding: 'base64'`.
 *
 * @param root - Absolute path to the design-systems root directory.
 * @param id - Design-system identifier (prefix auto-detected from `id` itself).
 * @param relativePath - Relative file path within the design-system directory (sanitised).
 */
export async function readDesignSystemPullFile(
  root: string,
  id: string,
  relativePath: string,
): Promise<DesignSystemPullFileDetail | null> {
  const dirId = stripPrefixAndValidateId(id, id.startsWith('user:') ? 'user:' : '');
  const cleanPath = sanitizeRelativeFilePath(relativePath);
  if (!dirId || !cleanPath) return null;

  const brandRoot = path.join(root, dirId);
  const manifest = await readProjectManifest(brandRoot, dirId);
  if (manifest === null) return null;

  const allowed = await buildDesignSystemPullFileAllowlist(brandRoot, manifest);
  if (!allowed.has(cleanPath)) return null;

  const resolvedRoot = path.resolve(brandRoot);
  const filePath = path.resolve(brandRoot, cleanPath);
  if (filePath !== resolvedRoot && !filePath.startsWith(`${resolvedRoot}${path.sep}`)) {
    return null;
  }

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return null;
    const bytes = await readFile(filePath);
    const encoding = isTextDesignSystemPullFile(cleanPath) ? 'utf8' : 'base64';
    return {
      path: cleanPath,
      name: path.basename(cleanPath),
      kind: classifyDesignSystemFile(cleanPath, false),
      size: stats.size,
      updatedAt: stats.mtime.toISOString(),
      encoding,
      content: encoding === 'utf8' ? bytes.toString('utf8') : bytes.toString('base64'),
    };
  } catch (err) {
    if (isAbsenceError(err)) return null;
    throw err;
  }
}

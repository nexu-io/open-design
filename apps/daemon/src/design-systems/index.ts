// Design-system registry. Scans <projectRoot>/design-systems/* for design
// system projects. Project folders may opt into manifest.json; legacy folders
// with only DESIGN.md remain valid. Without a manifest, title comes from the
// first H1, category from a `> Category: <name>` blockquote line beneath the
// H1, and summary from the first paragraph between the H1 and next heading.
//
// YAML frontmatter (Google spec, issue #1857): frontmatter `colors` wins
// over Markdown swatches only when its row fills every semantic slot;
// otherwise Markdown wins. Other fields (`name`/`description`/`category`/
// `surface`) fall back to frontmatter when the body has none.

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

import {
  type ComponentsManifest,
  extractComponentsManifest,
  summarizeComponentsManifestForPrompt,
} from '@open-design/contracts';

import { parseFrontmatter } from './frontmatter.js';
import type { FrontmatterObject, FrontmatterValue } from './frontmatter.js';
import { extractSwiftColors } from './swift-colors.js';

export type DesignSystemSurface = 'web' | 'image' | 'video' | 'audio';
export type DesignSystemSource = 'built-in' | 'installed' | 'user';
export type DesignSystemStatus = 'draft' | 'published';
export type DesignSystemRevisionStatus = 'pending' | 'accepted' | 'rejected';
export type DesignSystemArtifactMode = 'generated' | 'agent-managed';

export type DesignSystemSummary = {
  id: string;
  title: string;
  category: string;
  summary: string;
  swatches: string[];
  surface: DesignSystemSurface;
  body: string;
  source: DesignSystemSource;
  status: DesignSystemStatus;
  isEditable: boolean;
  createdAt?: string;
  updatedAt?: string;
  provenance?: DesignSystemProvenance;
  projectId?: string;
};

export type DesignSystemFileKind =
  | 'folder'
  | 'page'
  | 'stylesheet'
  | 'document'
  | 'image'
  | 'data'
  | 'asset';

export type DesignSystemFileSummary = {
  path: string;
  name: string;
  kind: DesignSystemFileKind;
  size?: number;
  updatedAt?: string;
};

export type DesignSystemFileDetail = DesignSystemFileSummary & {
  content: string;
};

export type DesignSystemPullFileDetail = {
  path: string;
  name: string;
  kind: DesignSystemFileKind;
  size: number;
  updatedAt: string;
  encoding: 'utf8' | 'base64';
  content: string;
};

export type DesignSystemStaticFileDetail = {
  path: string;
  name: string;
  kind: DesignSystemFileKind;
  size: number;
  updatedAt: string;
  contentType: string;
  bytes: Buffer;
};

export type DesignSystemPackageInfo = {
  manifest?: DesignSystemProjectManifest;
  availableFiles?: string[];
  sourceEvidence?: {
    scannedFileCount?: number;
    tokenCount?: number;
    snippetCount?: number;
    confidence?: Record<string, string | number>;
    evidenceExcerpt?: string;
    tokenContract?: {
      contract?: string;
      grade?: 'excellent' | 'usable' | 'needs-review' | 'needs-rebuild';
      score?: number;
      recommendRebuild?: boolean;
      sourceBackedA1?: number;
      requiredA1?: number;
      fallbackTokens?: number;
      selfCheckOk?: boolean;
    };
  };
};

export type DesignSystemRevision = {
  id: string;
  designSystemId: string;
  status: DesignSystemRevisionStatus;
  feedback: string;
  baseBody: string;
  proposedBody: string;
  createdAt: string;
  updatedAt: string;
  sectionTitle?: string;
  jobId?: string;
  fileChanges?: DesignSystemRevisionFileChange[];
};

export type DesignSystemRevisionFileChange = {
  path: string;
  baseContent: string;
  proposedContent: string;
};

type ColorToken = { name: string; value: string };
type SwatchRow = { values: string[]; filledAllSlots: boolean };
type DesignSystemProjectManifest = {
  schemaVersion: 'od-design-system-project/v1';
  id: string;
  name: string;
  category: string;
  description?: string;
  files: {
    design: 'DESIGN.md';
    tokens: 'tokens.css';
    designTokens?: 'design-tokens.json';
    tailwind?: 'tailwind-v4.css';
    components?: 'components.html';
  };
  assetsDir?: 'assets';
  previewDir?: 'preview';
  usage?: string;
  componentsManifest?: string;
  fonts?: Array<{
    family: string;
    file: string;
    weight?: number | string;
    style?: string;
  }>;
  preview?: {
    dir: string;
    pages: Array<{
      path: string;
      role?: string;
      title?: string;
    }>;
  };
  sourceFiles?: {
    scanned?: string;
    evidence?: string;
    tokens?: string;
    report?: string;
    snippets?: string;
  };
  importMode?: 'normalized' | 'hybrid' | 'verbatim';
  craft?: {
    applies?: string[];
    suggested?: string[];
    exemptions?: string[];
  };
};

export type DesignSystemProvenance = {
  companyBlurb?: string;
  sourceUrls?: string[];
  githubUrls?: string[];
  localCodeFiles?: string[];
  figFiles?: string[];
  assetFiles?: string[];
  notes?: string;
  sourceNotes?: string;
};

type UserDesignSystemMetadata = {
  title?: string;
  category?: string;
  surface?: DesignSystemSurface;
  status?: DesignSystemStatus;
  artifactMode?: DesignSystemArtifactMode;
  createdAt?: string;
  updatedAt?: string;
  provenance?: DesignSystemProvenance;
  projectId?: string;
};

type AtomicTextFileWrite = {
  targetPath: string;
  content: string;
};

type AtomicTextFileSnapshot =
  | { existed: true; content: string }
  | { existed: false };

export const LEGACY_DESIGN_SYSTEM_ARTIFACTS = [
  {
    legacyPath: 'preview/colors-ui-palette.html',
    replacementPaths: ['preview/colors-primary.html'],
  },
  {
    legacyPath: 'preview/colors-node-types.html',
    replacementPaths: ['preview/colors-theme-light.html', 'preview/colors-theme-dark.html'],
  },
  {
    legacyPath: 'preview/typography-scale.html',
    replacementPaths: ['preview/typography-specimens.html'],
  },
  {
    legacyPath: 'preview/spacing-system.html',
    replacementPaths: ['preview/spacing-tokens.html', 'preview/spacing-radius.html', 'preview/spacing-shadows.html'],
  },
  {
    legacyPath: 'preview/logo-variants.html',
    replacementPaths: ['preview/brand-assets.html'],
  },
  {
    legacyPath: 'ui_kits/generated_interface',
    replacementPaths: ['ui_kits/app/index.html'],
    removeDirectory: true,
  },
] as const;

export type UserDesignSystemInput = {
  title?: string;
  summary?: string;
  category?: string;
  surface?: DesignSystemSurface;
  status?: DesignSystemStatus;
  artifactMode?: DesignSystemArtifactMode;
  body?: string;
  sourceNotes?: string;
  provenance?: DesignSystemProvenance;
};

export type UserDesignSystemRevisionInput = {
  feedback: string;
  baseBody: string;
  proposedBody: string;
  sectionTitle?: string;
  jobId?: string;
  fileChanges?: DesignSystemRevisionFileChange[];
};

export type DesignSystemListOptions = {
  idPrefix?: string;
  source?: DesignSystemSource;
  isEditable?: boolean;
  defaultStatus?: DesignSystemStatus;
};

export async function listDesignSystems(
  root: string,
  options: DesignSystemListOptions = {},
): Promise<DesignSystemSummary[]> {
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
      // Skip.
    }
  }
  return out;
}

function stringField(data: FrontmatterObject, key: string): string {
  const v: FrontmatterValue | undefined = data[key];
  return typeof v === 'string' ? v.trim() : '';
}

function frontmatterSurface(data: FrontmatterObject): DesignSystemSurface | undefined {
  const v = stringField(data, 'surface').toLowerCase();
  return isDesignSystemSurface(v) ? v : undefined;
}

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

function pickFinalSwatchRow(
  frontmatter: SwatchRow | null,
  markdownSwatches: string[],
): string[] {
  if (frontmatter !== null && frontmatter.filledAllSlots) return frontmatter.values;
  if (markdownSwatches.length > 0) return markdownSwatches;
  return frontmatter?.values ?? [];
}

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
  manifest: DesignSystemProjectManifest,
): Promise<string[]> {
  const candidates = new Set<string>(DESIGN_SYSTEM_STATIC_SYSTEM_FILES);
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
 * Structured (compiled) form of a brand's design system. Optional sibling
 * files alongside DESIGN.md that, when present, give agents a
 * machine-readable token contract and a worked fixture instead of having
 * to re-derive both from prose. Both fields are individually optional —
 * the daemon falls back to the DESIGN.md-only path when neither is
 * available, which is the current state for the ~138 brands without
 * hand-authored or derived tokens.
 *
 * - `tokensCss`     — verbatim content of `<brand>/tokens.css`.
 * - `usageMd`       — optional agent-facing router for the package.
 * - `fixtureHtml`   — verbatim content of `<brand>/components.html`.
 * - `componentsManifest` — concise summary derived from components.html
 *                          or read from components.manifest.json cache
 *                          for prompt injection; when absent, callers
 *                          can fall back to `fixtureHtml`.
 * - `pullIndex`     — short manifest-derived file index. It lists
 *                     richer preview/source evidence paths without
 *                     loading those files into the push prompt.
 */
export type DesignSystemAssets = {
  usageMd?: string | undefined;
  tokensCss?: string | undefined;
  fixtureHtml?: string | undefined;
  componentsManifest?: string | undefined;
  pullIndex?: string | undefined;
  importMode?: 'normalized' | 'hybrid' | 'verbatim' | undefined;
  craftApplies?: string[] | undefined;
  craftExemptions?: string[] | undefined;
};

const DESIGN_SYSTEM_ASSETS_CACHE_LIMIT = 128;
const designSystemAssetsCache = new Map<string, Promise<DesignSystemAssets> | DesignSystemAssets>();

export function clearDesignSystemAssetsCacheForTests(): void {
  designSystemAssetsCache.clear();
}

export async function readDesignSystemAssets(
  root: string,
  id: string,
): Promise<DesignSystemAssets> {
  const dirId = stripPrefixAndValidateId(id, id.startsWith('user:') ? 'user:' : '');
  if (!dirId) return {};
  const brandRoot = path.join(root, dirId);
  const manifest = await readProjectManifest(brandRoot, dirId);
  const [usageMd, tokensCss, fixtureHtml, componentsManifestJson] = await Promise.all([
    readManifestFileOptional(brandRoot, manifest?.usage ?? 'USAGE.md'),
    readFileOptional(path.join(brandRoot, manifest?.files.tokens ?? 'tokens.css')),
    manifest?.files.components === undefined && manifest !== null
      ? Promise.resolve(undefined)
      : readFileOptional(path.join(brandRoot, manifest?.files.components ?? 'components.html')),
    readManifestFileOptional(brandRoot, manifest?.componentsManifest ?? 'components.manifest.json'),
  ]);
  return withComponentsManifest(id, {
    usageMd,
    tokensCss,
    fixtureHtml,
    componentsManifestJson,
    pullIndex: buildDesignSystemPullIndex(manifest),
    importMode: manifest?.importMode,
    craftApplies: manifest?.craft?.applies,
    craftExemptions: manifest?.craft?.exemptions,
  });
}

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

export async function readDesignSystemStaticFile(
  root: string,
  id: string,
  relativePath: string,
  options: { idPrefix?: string } = {},
): Promise<DesignSystemStaticFileDetail | null> {
  const dirId = stripPrefixAndValidateId(id, options.idPrefix);
  const cleanPath = sanitizeRelativeFilePath(relativePath);
  if (!dirId || !cleanPath) return null;

  const brandRoot = path.join(root, dirId);
  const manifest = await readProjectManifest(brandRoot, dirId);
  if (!(await isAllowedDesignSystemStaticFile(brandRoot, manifest, cleanPath))) return null;

  const resolvedRoot = path.resolve(brandRoot);
  const filePath = path.resolve(brandRoot, cleanPath);
  if (filePath !== resolvedRoot && !filePath.startsWith(`${resolvedRoot}${path.sep}`)) {
    return null;
  }

  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return null;
    const bytes = await readFile(filePath);
    return {
      path: cleanPath,
      name: path.basename(cleanPath),
      kind: classifyDesignSystemFile(cleanPath, false),
      size: stats.size,
      updatedAt: stats.mtime.toISOString(),
      contentType: designSystemStaticContentType(cleanPath),
      bytes,
    };
  } catch (err) {
    if (isAbsenceError(err)) return null;
    throw err;
  }
}

export function isDesignTokenChannelEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.OD_DESIGN_TOKEN_CHANNEL !== '0';
}

export function digestDesignSystemContext(input: {
  id?: string | null;
  title?: string | null;
  body?: string | null;
  usageMd?: string | null;
  tokensCss?: string | null;
  componentsManifest?: string | null;
  fixtureHtml?: string | null;
  pullIndex?: string | null;
  importMode?: string | null;
}): string | null {
  const hasContent = [
    input.body,
    input.usageMd,
    input.tokensCss,
    input.componentsManifest,
    input.fixtureHtml,
    input.pullIndex,
    input.importMode,
  ].some((value) => typeof value === 'string' && value.length > 0);
  if (!hasContent) return null;

  const payload = {
    id: input.id ?? null,
    title: input.title ?? null,
    body: input.body ?? null,
    usageMd: input.usageMd ?? null,
    tokensCss: input.tokensCss ?? null,
    componentsManifest: input.componentsManifest ?? null,
    fixtureHtml: input.fixtureHtml ?? null,
    pullIndex: input.pullIndex ?? null,
    importMode: input.importMode ?? null,
  };
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

export async function resolveDesignSystemAssets(
  designSystemId: string,
  builtInRoot: string,
  userInstalledRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DesignSystemAssets> {
  if (!isDesignTokenChannelEnabled(env)) {
    return {
      usageMd: undefined,
      tokensCss: undefined,
      fixtureHtml: undefined,
      componentsManifest: undefined,
      pullIndex: undefined,
      importMode: undefined,
      craftApplies: undefined,
      craftExemptions: undefined,
    };
  }

  const fingerprint = await designSystemAssetsCacheFingerprint(
    designSystemId,
    builtInRoot,
    userInstalledRoot,
    env,
  );
  const cacheKey = [
    designSystemId,
    builtInRoot,
    userInstalledRoot,
    env.OD_DESIGN_TOKEN_CHANNEL ?? '',
    fingerprint,
  ].join('\0');
  const cached = designSystemAssetsCache.get(cacheKey);
  if (cached) return cached;

  const pending = resolveDesignSystemAssetsUncached(
    designSystemId,
    builtInRoot,
    userInstalledRoot,
  )
    .then((assets) => {
      designSystemAssetsCache.set(cacheKey, assets);
      pruneDesignSystemAssetsCache();
      return assets;
    })
    .catch((error) => {
      designSystemAssetsCache.delete(cacheKey);
      throw error;
    });
  designSystemAssetsCache.set(cacheKey, pending);
  pruneDesignSystemAssetsCache();
  return pending;
}

async function resolveDesignSystemAssetsUncached(
  designSystemId: string,
  builtInRoot: string,
  userInstalledRoot: string,
): Promise<DesignSystemAssets> {
  const builtIn = await readDesignSystemAssets(builtInRoot, designSystemId);
  if (builtIn.tokensCss !== undefined && builtIn.fixtureHtml !== undefined) {
    return builtIn;
  }

  const userInstalled = await readDesignSystemAssets(userInstalledRoot, designSystemId);
  return withComponentsManifest(designSystemId, {
    usageMd: builtIn.usageMd ?? userInstalled.usageMd,
    tokensCss: builtIn.tokensCss ?? userInstalled.tokensCss,
    fixtureHtml: builtIn.fixtureHtml ?? userInstalled.fixtureHtml,
    componentsManifestJson: undefined,
    componentsManifest: builtIn.componentsManifest ?? userInstalled.componentsManifest,
    pullIndex: builtIn.pullIndex ?? userInstalled.pullIndex,
    importMode: builtIn.importMode ?? userInstalled.importMode,
    craftApplies: builtIn.craftApplies ?? userInstalled.craftApplies,
    craftExemptions: builtIn.craftExemptions ?? userInstalled.craftExemptions,
  });
}

function pruneDesignSystemAssetsCache(): void {
  while (designSystemAssetsCache.size > DESIGN_SYSTEM_ASSETS_CACHE_LIMIT) {
    const oldest = designSystemAssetsCache.keys().next().value;
    if (oldest === undefined) return;
    designSystemAssetsCache.delete(oldest);
  }
}

async function designSystemAssetsCacheFingerprint(
  designSystemId: string,
  builtInRoot: string,
  userInstalledRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const payload = {
    tokenChannel: env.OD_DESIGN_TOKEN_CHANNEL ?? null,
    roots: await Promise.all([
      designSystemAssetsRootFingerprint(builtInRoot, designSystemId),
      designSystemAssetsRootFingerprint(userInstalledRoot, designSystemId),
    ]),
  };
  return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
}

async function designSystemAssetsRootFingerprint(
  root: string,
  id: string,
): Promise<unknown> {
  const dirId = stripPrefixAndValidateId(id, id.startsWith('user:') ? 'user:' : '');
  if (!dirId) return { root, id, invalid: true };
  const brandRoot = path.join(root, dirId);
  const manifest = await readProjectManifest(brandRoot, dirId);
  const candidates = new Set<string>([
    'manifest.json',
    manifest?.usage ?? 'USAGE.md',
    manifest?.files.tokens ?? 'tokens.css',
    manifest?.files.components ?? 'components.html',
    manifest?.componentsManifest ?? 'components.manifest.json',
  ]);
  return {
    root,
    id,
    files: await Promise.all(
      Array.from(candidates)
        .filter((filePath) => typeof filePath === 'string' && filePath.length > 0)
        .sort()
        .map(async (filePath) => fileFingerprint(brandRoot, filePath)),
    ),
  };
}

async function fileFingerprint(root: string, relativePath: string): Promise<unknown> {
  const cleanPath = sanitizeRelativeFilePath(relativePath);
  if (!cleanPath) return { path: relativePath, unsafe: true };
  try {
    const stats = await stat(path.join(root, cleanPath));
    return {
      path: cleanPath,
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
    };
  } catch (err) {
    if (isAbsenceError(err)) return { path: cleanPath, absent: true };
    throw err;
  }
}

function withComponentsManifest(
  designSystemId: string,
  assets: Pick<
    DesignSystemAssets,
    | 'usageMd'
    | 'tokensCss'
    | 'fixtureHtml'
    | 'componentsManifest'
    | 'pullIndex'
    | 'importMode'
    | 'craftApplies'
    | 'craftExemptions'
  > & {
    componentsManifestJson?: string | undefined;
  },
): DesignSystemAssets {
  const { componentsManifestJson, ...publicAssets } = assets;
  const componentsManifest =
    publicAssets.componentsManifest
    ?? summarizeComponentsManifestCache(componentsManifestJson)
    ?? buildComponentsManifestSummary(
      designSystemId,
      publicAssets.fixtureHtml,
      publicAssets.tokensCss,
    );
  return { ...publicAssets, componentsManifest };
}

function summarizeComponentsManifestCache(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim().length === 0) return undefined;
  try {
    return summarizeComponentsManifestForPrompt(JSON.parse(raw) as ComponentsManifest);
  } catch {
    return undefined;
  }
}

function buildComponentsManifestSummary(
  designSystemId: string,
  fixtureHtml: string | undefined,
  tokensCss: string | undefined,
): string | undefined {
  if (fixtureHtml === undefined || fixtureHtml.trim().length === 0) {
    return undefined;
  }

  try {
    const manifest =
      tokensCss === undefined
        ? extractComponentsManifest({ brandId: designSystemId, fixtureHtml })
        : extractComponentsManifest({ brandId: designSystemId, fixtureHtml, tokensCss });
    return summarizeComponentsManifestForPrompt(manifest);
  } catch {
    return undefined;
  }
}

function buildDesignSystemPullIndex(
  manifest: DesignSystemProjectManifest | null,
): string | undefined {
  if (manifest === null) return undefined;
  const entries: string[] = [];
  const add = (filePath: string | undefined, label: string): void => {
    if (!filePath || !isSafeManifestPath(filePath)) return;
    entries.push(`- ${filePath}: ${label}`);
  };

  if (manifest.preview?.pages) {
    for (const page of manifest.preview.pages) {
      if (!isSafeManifestPath(page.path)) continue;
      const labelParts = [page.title, page.role].filter((part) => typeof part === 'string' && part.trim().length > 0);
      entries.push(`- ${page.path}: ${labelParts.join('; ') || 'preview page'}`);
    }
  } else if (manifest.previewDir === 'preview') {
    entries.push('- preview/: preview pages');
  }

  if (manifest.assetsDir === 'assets') entries.push('- assets/: brand assets');
  for (const font of manifest.fonts ?? []) {
    add(font.file, `font: ${font.family}${font.weight ? ` ${font.weight}` : ''}${font.style ? ` ${font.style}` : ''}`);
  }

  add(manifest.sourceFiles?.scanned, 'scanned source file inventory');
  add(manifest.sourceFiles?.evidence, 'import evidence notes');
  add(manifest.sourceFiles?.tokens, 'source-token evidence');
  add(manifest.sourceFiles?.report, 'token contract quality report');
  add(manifest.sourceFiles?.snippets, 'source snippet index');
  add(manifest.files.designTokens, 'derived Design Tokens JSON');
  add(manifest.files.tailwind, 'derived Tailwind v4 theme CSS');

  if (entries.length === 0) return undefined;
  return ['Additional design-system files declared by manifest.json:', ...entries].join('\n');
}

async function buildDesignSystemPullFileAllowlist(
  brandRoot: string,
  manifest: DesignSystemProjectManifest,
): Promise<Set<string>> {
  const allowed = new Set<string>();
  const add = (filePath: string | undefined): void => {
    const cleanPath = typeof filePath === 'string' ? sanitizeRelativeFilePath(filePath) : null;
    if (cleanPath) allowed.add(cleanPath);
  };

  for (const page of manifest.preview?.pages ?? []) add(page.path);
  add(manifest.sourceFiles?.scanned);
  add(manifest.sourceFiles?.evidence);
  add(manifest.sourceFiles?.tokens);
  add(manifest.sourceFiles?.report);
  add(manifest.sourceFiles?.snippets);
  add(manifest.files.designTokens);
  add(manifest.files.tailwind);

  if (manifest.assetsDir === 'assets') {
    await addFilesUnderDeclaredDir(brandRoot, 'assets', allowed);
  }

  if (manifest.sourceFiles?.snippets) {
    await addSnippetIndexEntries(brandRoot, manifest.sourceFiles.snippets, allowed);
  }

  return allowed;
}

const DESIGN_SYSTEM_STATIC_SYSTEM_FILES = new Set([
  'system/index.html',
  'system/kit.html',
  'system/kit.dark.html',
  'system/tokens.default.json',
  'system/artifacts/landing.html',
  'system/artifacts/deck.html',
  'system/artifacts/poster.html',
  'system/artifacts/email.html',
  'system/artifacts/newsletter.html',
  'system/artifacts/form.html',
]);

async function isAllowedDesignSystemStaticFile(
  brandRoot: string,
  manifest: DesignSystemProjectManifest | null,
  relativePath: string,
): Promise<boolean> {
  if (!isSafeManifestPath(relativePath)) return false;
  if (DESIGN_SYSTEM_STATIC_SYSTEM_FILES.has(relativePath)) return true;

  const allowed = new Set<string>();
  const add = (filePath: string | undefined): void => {
    const cleanPath = typeof filePath === 'string' ? sanitizeRelativeFilePath(filePath) : null;
    if (cleanPath) allowed.add(cleanPath);
  };

  add(manifest?.files.design ?? 'DESIGN.md');
  add(manifest?.files.tokens ?? 'tokens.css');
  add(manifest?.files.components ?? 'components.html');
  add(manifest?.files.designTokens);
  add(manifest?.files.tailwind);
  add(manifest?.usage ?? 'USAGE.md');
  add(manifest?.componentsManifest ?? 'components.manifest.json');
  for (const page of manifest?.preview?.pages ?? []) add(page.path);
  for (const font of manifest?.fonts ?? []) add(font.file);

  if (manifest?.assetsDir === 'assets') {
    await addFilesUnderDeclaredDir(brandRoot, 'assets', allowed);
  }

  return allowed.has(relativePath);
}

function designSystemStaticContentType(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.ttf':
      return 'font/ttf';
    case '.otf':
      return 'font/otf';
    default:
      return 'application/octet-stream';
  }
}

async function addFilesUnderDeclaredDir(
  brandRoot: string,
  dir: string,
  allowed: Set<string>,
): Promise<void> {
  if (!isSafeManifestPath(dir)) return;
  const absoluteDir = path.join(brandRoot, dir);
  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch (err) {
    if (isAbsenceError(err)) return;
    throw err;
  }
  await Promise.all(entries.map(async (entry) => {
    const relativePath = `${dir}/${entry.name}`;
    if (!isSafeManifestPath(relativePath)) return;
    if (entry.isDirectory()) {
      await addFilesUnderDeclaredDir(brandRoot, relativePath, allowed);
    } else if (entry.isFile()) {
      allowed.add(relativePath);
    }
  }));
}

async function addSnippetIndexEntries(
  brandRoot: string,
  indexPath: string,
  allowed: Set<string>,
): Promise<void> {
  if (!isSafeManifestPath(indexPath)) return;
  let raw: string | undefined;
  try {
    raw = await readFileOptional(path.join(brandRoot, indexPath));
  } catch {
    return;
  }
  if (raw === undefined) return;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
    const snippets = (parsed as { snippets?: unknown }).snippets;
    if (!Array.isArray(snippets)) return;
    for (const snippet of snippets) {
      if (!snippet || typeof snippet !== 'object' || Array.isArray(snippet)) continue;
      const snippetPath = (snippet as { path?: unknown }).path;
      if (typeof snippetPath === 'string') {
        const cleanPath = sanitizeRelativeFilePath(snippetPath);
        if (cleanPath?.startsWith('source/snippets/')) allowed.add(cleanPath);
      }
    }
  } catch {
    // A malformed snippets index should not widen the allowlist.
  }
}

function isTextDesignSystemPullFile(relativePath: string): boolean {
  const ext = path.extname(relativePath).toLowerCase();
  return new Set([
    '.css',
    '.html',
    '.js',
    '.jsx',
    '.json',
    '.md',
    '.mjs',
    '.svg',
    '.ts',
    '.tsx',
    '.txt',
    '.xml',
    '.yaml',
    '.yml',
  ]).has(ext);
}

async function readDesignSystemSourceEvidence(
  brandRoot: string,
  manifest: DesignSystemProjectManifest,
): Promise<DesignSystemPackageInfo['sourceEvidence'] | undefined> {
  const [scanned, tokens, report, snippets, evidence] = await Promise.all([
    readManifestJsonOptional(brandRoot, manifest.sourceFiles?.scanned),
    readManifestJsonOptional(brandRoot, manifest.sourceFiles?.tokens),
    readManifestJsonOptional(brandRoot, manifest.sourceFiles?.report),
    readManifestJsonOptional(brandRoot, manifest.sourceFiles?.snippets),
    readManifestFileOptional(brandRoot, manifest.sourceFiles?.evidence ?? ''),
  ]);

  const out: NonNullable<DesignSystemPackageInfo['sourceEvidence']> = {};
  if (scanned && typeof scanned === 'object' && !Array.isArray(scanned)) {
    const files = (scanned as { files?: unknown }).files;
    if (Array.isArray(files)) out.scannedFileCount = files.length;
  }
  if (tokens && typeof tokens === 'object' && !Array.isArray(tokens)) {
    const tokenCount = (tokens as { tokenCount?: unknown }).tokenCount;
    if (typeof tokenCount === 'number') out.tokenCount = tokenCount;
    const confidence = (tokens as { confidence?: unknown }).confidence;
    if (confidence && typeof confidence === 'object' && !Array.isArray(confidence)) {
      const cleanConfidence: Record<string, string | number> = {};
      for (const [key, value] of Object.entries(confidence)) {
        if (typeof value === 'string' || typeof value === 'number') cleanConfidence[key] = value;
      }
      if (Object.keys(cleanConfidence).length > 0) out.confidence = cleanConfidence;
    }
  }
  if (snippets && typeof snippets === 'object' && !Array.isArray(snippets)) {
    const entries = (snippets as { snippets?: unknown }).snippets;
    if (Array.isArray(entries)) out.snippetCount = entries.length;
  }
  const tokenContract = summarizeTokenContractReport(report);
  if (tokenContract) out.tokenContract = tokenContract;
  if (typeof evidence === 'string' && evidence.trim().length > 0) {
    out.evidenceExcerpt = evidence.trim().split(/\r?\n/).filter(Boolean).slice(0, 5).join('\n');
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function summarizeTokenContractReport(
  report: unknown,
): NonNullable<NonNullable<DesignSystemPackageInfo['sourceEvidence']>['tokenContract']> | undefined {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return undefined;
  const record = report as Record<string, unknown>;
  const summary = record.summary;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return undefined;
  const summaryRecord = summary as Record<string, unknown>;
  const selfCheck = record.selfCheck;
  const selfCheckRecord =
    selfCheck && typeof selfCheck === 'object' && !Array.isArray(selfCheck)
      ? selfCheck as Record<string, unknown>
      : undefined;
  const grade = typeof summaryRecord.grade === 'string' && isTokenContractGrade(summaryRecord.grade)
    ? summaryRecord.grade
    : undefined;
  const out: NonNullable<NonNullable<DesignSystemPackageInfo['sourceEvidence']>['tokenContract']> = {};
  if (typeof record.contract === 'string') out.contract = record.contract;
  if (grade) out.grade = grade;
  if (typeof summaryRecord.score === 'number') out.score = summaryRecord.score;
  if (typeof summaryRecord.recommendRebuild === 'boolean') out.recommendRebuild = summaryRecord.recommendRebuild;
  if (typeof summaryRecord.sourceBackedA1 === 'number') out.sourceBackedA1 = summaryRecord.sourceBackedA1;
  if (typeof summaryRecord.requiredA1 === 'number') out.requiredA1 = summaryRecord.requiredA1;
  if (typeof summaryRecord.fallbackTokens === 'number') out.fallbackTokens = summaryRecord.fallbackTokens;
  if (typeof selfCheckRecord?.ok === 'boolean') out.selfCheckOk = selfCheckRecord.ok;
  return Object.keys(out).length > 0 ? out : undefined;
}

function isTokenContractGrade(
  value: string,
): value is 'excellent' | 'usable' | 'needs-review' | 'needs-rebuild' {
  return value === 'excellent' || value === 'usable' || value === 'needs-review' || value === 'needs-rebuild';
}

async function readManifestJsonOptional(
  brandRoot: string,
  relativePath: string | undefined,
): Promise<unknown | undefined> {
  if (!relativePath) return undefined;
  const raw = await readManifestFileOptional(brandRoot, relativePath);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export async function createUserDesignSystem(
  root: string,
  input: UserDesignSystemInput,
): Promise<DesignSystemSummary> {
  const title = normalizeTitle(input.title);
  const { dirId, dir } = await reserveUniqueSlugDirectory(root, slugify(title));
  const now = new Date().toISOString();
  const provenance = normalizeProvenance(input.provenance, {
    ...(input.summary ? { companyBlurb: input.summary } : {}),
    ...(input.sourceNotes ? { sourceNotes: input.sourceNotes } : {}),
  });
  const sourceNotes = provenanceToNotes(provenance) || cleanMultiline(input.sourceNotes);
  const body = normalizeBody(input.body) ?? buildDraftDesignSystemBody({
    ...input,
    title,
    sourceNotes,
  });
  const surface = input.surface ?? extractSurface(body) ?? 'web';
  let createdDir = false;
  try {
    createdDir = true;
    await writeFile(path.join(dir, 'DESIGN.md'), body, 'utf8');
    const artifactMode = normalizeArtifactMode(input.artifactMode);
    await writeUserMetadata(root, dirId, {
      title,
      category: cleanText(input.category) || extractCategory(body) || 'Custom',
      surface,
      status: input.status ?? 'draft',
      ...(artifactMode ? { artifactMode } : {}),
      createdAt: now,
      updatedAt: now,
      ...(provenance ? { provenance } : {}),
    });
    if (artifactMode !== 'agent-managed') {
      await writeGeneratedDesignSystemFiles(root, dirId, {
        title,
        category: cleanText(input.category) || extractCategory(body) || 'Custom',
        surface,
        summary: summarize(body),
        ...(provenance ? { provenance } : {}),
        ...(sourceNotes ? { sourceNotes } : {}),
        body,
      });
    }
    const listed = await listDesignSystems(root, {
      idPrefix: 'user:',
      source: 'user',
      isEditable: true,
      defaultStatus: 'draft',
    });
    return listed.find((s) => s.id === `user:${dirId}`)!;
  } catch (err) {
    if (createdDir) await rm(dir, { recursive: true, force: true });
    throw err;
  }
}

export async function updateUserDesignSystem(
  root: string,
  id: string,
  input: UserDesignSystemInput,
): Promise<DesignSystemSummary | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  if (!dirId) return null;
  const dir = path.join(root, dirId);
  const designPath = path.join(dir, 'DESIGN.md');
  let existingBody: string;
  try {
    existingBody = await readFile(designPath, 'utf8');
  } catch {
    return null;
  }
  const existingMeta = await readUserMetadata(root, dirId);
  const now = new Date().toISOString();
  const title = normalizeTitle(input.title ?? existingMeta.title ?? firstHeading(existingBody) ?? dirId);
  const category = cleanText(input.category) || existingMeta.category || extractCategory(existingBody) || 'Custom';
  const surface = input.surface ?? existingMeta.surface ?? extractSurface(existingBody) ?? 'web';
  const nextProvenance = normalizeProvenance(input.provenance, {
    ...(input.sourceNotes ? { sourceNotes: input.sourceNotes } : {}),
  });
  const provenance = nextProvenance ?? existingMeta.provenance;
  const artifactMode = normalizeArtifactMode(input.artifactMode) ?? existingMeta.artifactMode;
  const body =
    normalizeBody(input.body)
    ?? withDesignSystemHeader(existingBody, { title, category, surface });
  await writeFile(designPath, body, 'utf8');
  await writeUserMetadata(root, dirId, {
    ...existingMeta,
    title,
    category,
    surface,
    status: input.status ?? existingMeta.status ?? 'draft',
    ...(artifactMode ? { artifactMode } : {}),
    createdAt: existingMeta.createdAt ?? now,
    updatedAt: now,
    ...(provenance ? { provenance } : {}),
  });
  const sourceNotes = provenanceToNotes(provenance) || cleanMultiline(input.sourceNotes);
  if (artifactMode !== 'agent-managed') {
    await writeGeneratedDesignSystemFiles(root, dirId, {
      title,
      category,
      surface,
      summary: summarize(body),
      ...(provenance ? { provenance } : {}),
      ...(sourceNotes ? { sourceNotes } : {}),
      body,
    });
  }
  const listed = await listDesignSystems(root, {
    idPrefix: 'user:',
    source: 'user',
    isEditable: true,
    defaultStatus: 'draft',
  });
  return listed.find((s) => s.id === `user:${dirId}`) ?? null;
}

// A design-system workspace project mirrors its design system's title:
// ensureUserDesignSystemWorkspaceProject re-stamps the project name from
// the registry title every time the workspace is ensured, so a rename
// applied only to the project row silently reverts on the next open.
// Renames on these projects must instead be written through to the
// design-system title — the sync then carries the new name back onto the
// project and both records agree.
export function workspaceRenameDesignSystemId(project: {
  designSystemId?: string | null;
  metadata?: unknown;
}): string | null {
  const id = typeof project?.designSystemId === 'string' ? project.designSystemId : '';
  if (!id.startsWith('user:')) return null;
  const metadata = project?.metadata;
  const importedFrom =
    metadata && typeof metadata === 'object'
      ? (metadata as Record<string, unknown>).importedFrom
      : undefined;
  return importedFrom === 'design-system' ? id : null;
}

// 'not-applicable': the project is not a design-system workspace (or the
// name is blank) — the rename does not involve a design system at all.
// 'propagated': the bound design system's title now matches the new name.
// 'failed': the project IS bound to a user design system but the title
// could not be written through (e.g. the entry is missing on disk).
// Callers must not persist the project-row rename on 'failed' — doing so
// recreates the silent revert this write-through exists to prevent.
export type WorkspaceRenamePropagation = 'not-applicable' | 'propagated' | 'failed';

export async function propagateWorkspaceProjectRename(
  root: string,
  project: { designSystemId?: string | null; metadata?: unknown },
  name: unknown,
): Promise<WorkspaceRenamePropagation> {
  const id = workspaceRenameDesignSystemId(project);
  if (!id) return 'not-applicable';
  const title = typeof name === 'string' ? name.trim() : '';
  if (!title) return 'not-applicable';
  const updated = await updateUserDesignSystem(root, id, { title });
  return updated != null ? 'propagated' : 'failed';
}

export async function linkUserDesignSystemProject(
  root: string,
  id: string,
  projectId: string,
): Promise<DesignSystemSummary | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  const cleanProjectId = cleanProjectIdForMetadata(projectId);
  if (!dirId || !cleanProjectId) return null;
  try {
    const stats = await stat(path.join(root, dirId, 'DESIGN.md'));
    if (!stats.isFile()) return null;
  } catch {
    return null;
  }
  const existingMeta = await readUserMetadata(root, dirId);
  await writeUserMetadata(root, dirId, {
    ...existingMeta,
    projectId: cleanProjectId,
  });
  const listed = await listDesignSystems(root, {
    idPrefix: 'user:',
    source: 'user',
    isEditable: true,
    defaultStatus: 'draft',
  });
  return listed.find((s) => s.id === `user:${dirId}`) ?? null;
}

export async function createUserDesignSystemRevision(
  root: string,
  id: string,
  input: UserDesignSystemRevisionInput,
): Promise<DesignSystemRevision | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  if (!dirId) return null;
  const dir = path.join(root, dirId);
  try {
    const stats = await stat(path.join(dir, 'DESIGN.md'));
    if (!stats.isFile()) return null;
  } catch {
    return null;
  }
  const feedback = cleanMultiline(input.feedback);
  const baseBody = normalizeBody(input.baseBody);
  const proposedBody = normalizeBody(input.proposedBody);
  if (!feedback || !baseBody || !proposedBody) return null;
  const fileChanges = normalizeRevisionFileChanges(input.fileChanges);
  const now = new Date().toISOString();
  const revision: DesignSystemRevision = {
    id: randomUUID(),
    designSystemId: `user:${dirId}`,
    status: 'pending',
    feedback,
    baseBody,
    proposedBody,
    createdAt: now,
    updatedAt: now,
    ...(cleanText(input.sectionTitle) ? { sectionTitle: cleanText(input.sectionTitle) } : {}),
    ...(input.jobId ? { jobId: input.jobId } : {}),
    ...(fileChanges.length > 0 ? { fileChanges } : {}),
  };
  await writeUserDesignSystemRevision(root, dirId, revision);
  return revision;
}

export async function listUserDesignSystemRevisions(
  root: string,
  id: string,
): Promise<DesignSystemRevision[] | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  if (!dirId) return null;
  try {
    const stats = await stat(path.join(root, dirId, 'DESIGN.md'));
    if (!stats.isFile()) return null;
  } catch {
    return null;
  }
  let entries = [];
  try {
    entries = await readdir(path.join(root, dirId, 'revisions'), { withFileTypes: true });
  } catch {
    return [];
  }
  const revisions: DesignSystemRevision[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const revisionId = entry.name.slice(0, -'.json'.length);
    const revision = await readUserDesignSystemRevision(root, id, revisionId);
    if (revision) revisions.push(revision);
  }
  return revisions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readUserDesignSystemRevision(
  root: string,
  id: string,
  revisionId: string,
): Promise<DesignSystemRevision | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  const cleanRevisionId = sanitizeRevisionId(revisionId);
  if (!dirId || !cleanRevisionId) return null;
  try {
    const raw = await readFile(
      path.join(root, dirId, 'revisions', `${cleanRevisionId}.json`),
      'utf8',
    );
    return parseDesignSystemRevision(JSON.parse(raw), `user:${dirId}`);
  } catch {
    return null;
  }
}

export async function updateUserDesignSystemRevisionStatus(
  root: string,
  id: string,
  revisionId: string,
  status: Extract<DesignSystemRevisionStatus, 'accepted' | 'rejected'>,
): Promise<DesignSystemRevision | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  if (!dirId) return null;
  const revision = await readUserDesignSystemRevision(root, id, revisionId);
  if (!revision) return null;
  const next: DesignSystemRevision = {
    ...revision,
    status,
    updatedAt: new Date().toISOString(),
  };
  if (status === 'accepted') {
    const accepted = await writeAcceptedUserDesignSystemRevision(root, dirId, revision, next);
    if (!accepted) return null;
    return next;
  }
  await writeUserDesignSystemRevision(root, dirId, next);
  return next;
}

export async function deleteUserDesignSystem(root: string, id: string): Promise<boolean> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  if (!dirId) return false;
  try {
    await rm(path.join(root, dirId), { recursive: true, force: false });
    return true;
  } catch {
    return false;
  }
}

export async function listUserDesignSystemFiles(
  root: string,
  id: string,
): Promise<DesignSystemFileSummary[] | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  if (!dirId) return null;
  const base = path.join(root, dirId);
  try {
    const baseStats = await stat(base);
    if (!baseStats.isDirectory()) return null;
  } catch {
    return null;
  }
  await ensureGeneratedDesignSystemFiles(root, dirId);
  const files: DesignSystemFileSummary[] = [];
  await collectDesignSystemFiles(base, '', files);
  return files.sort((a, b) => {
    if (a.kind === 'folder' && b.kind !== 'folder') return -1;
    if (a.kind !== 'folder' && b.kind === 'folder') return 1;
    return a.path.localeCompare(b.path);
  });
}

export async function readUserDesignSystemFile(
  root: string,
  id: string,
  relativePath: string,
): Promise<DesignSystemFileDetail | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  const cleanPath = sanitizeRelativeFilePath(relativePath);
  if (!dirId || !cleanPath) return null;
  const base = path.join(root, dirId);
  const resolvedBase = path.resolve(base);
  const filePath = path.resolve(base, cleanPath);
  if (filePath !== resolvedBase && !filePath.startsWith(`${resolvedBase}${path.sep}`))
    return null;
  await ensureGeneratedDesignSystemFiles(root, dirId);
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return null;
    const content = await readFile(filePath, 'utf8');
    return {
      path: cleanPath,
      name: path.basename(cleanPath),
      kind: classifyDesignSystemFile(cleanPath, false),
      size: stats.size,
      updatedAt: stats.mtime.toISOString(),
      content,
    };
  } catch {
    return null;
  }
}

// Pack a user design system's entire on-disk directory into a shareable .zip.
// The archive is the same file tree the Design Files panel shows (folders walked
// recursively, dotfiles + the internal metadata.json/revisions/ excluded) plus a
// generated SKILLS.md usage guide so a recipient can drop the folder into any AI
// coding tool and get on-brand output without further art direction. Returns null
// for non-user ids (built-in presets live elsewhere and have no editable dir).
export async function buildUserDesignSystemArchive(
  root: string,
  id: string,
): Promise<{ buffer: Buffer; baseName: string; title: string } | null> {
  const dirId = stripPrefixAndValidateId(id, 'user:');
  if (!dirId) return null;
  const base = path.join(root, dirId);
  try {
    const baseStats = await stat(base);
    if (!baseStats.isDirectory()) return null;
  } catch {
    return null;
  }
  await ensureGeneratedDesignSystemFiles(root, dirId);

  const summaries: DesignSystemFileSummary[] = [];
  await collectDesignSystemFiles(base, '', summaries);
  const fileEntries = summaries.filter((entry) => entry.kind !== 'folder');

  const metadata = await readUserMetadata(root, dirId);
  let body = '';
  try {
    body = await readFile(path.join(base, 'DESIGN.md'), 'utf8');
  } catch {
    // DESIGN.md is normally present; an empty body still produces a valid guide.
  }
  const title = normalizeTitle(metadata.title ?? firstHeading(body) ?? dirId);

  const zip = new JSZip();
  for (const entry of fileEntries) {
    const buf = await readFile(path.join(base, ...entry.path.split('/')));
    zip.file(entry.path, buf, {
      date: entry.updatedAt ? new Date(entry.updatedAt) : new Date(0),
      binary: true,
    });
  }

  // Inject the usage guide unless the system already ships its own SKILLS.md.
  if (!fileEntries.some((entry) => entry.path.toLowerCase() === 'skills.md')) {
    const skills = buildDesignSystemSkillsMarkdown({
      title,
      summary: summarize(body),
      category: metadata.category ?? extractCategory(body) ?? 'Custom',
      surface: metadata.surface ?? extractSurface(body) ?? 'web',
      palette: normalizeSwatches(body),
      ...(metadata.provenance ? { provenance: metadata.provenance } : {}),
    });
    zip.file('SKILLS.md', skills, { date: new Date(0), binary: false });
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { buffer, baseName: title || dirId, title };
}

// Surface-specific framing for the SKILLS.md guide: what the system is best at
// and the deliverables an agent should expect to produce from it.
const DESIGN_SYSTEM_SURFACE_GUIDE: Record<
  DesignSystemSurface,
  { deliverables: string; goodFor: string[] }
> = {
  web: {
    deliverables: 'websites, landing pages, dashboards, decks, and product UI',
    goodFor: [
      'Landing pages & marketing sites',
      'Slide decks & pitch decks',
      'Dashboards & product UI',
      'Prototypes & component mockups',
    ],
  },
  image: {
    deliverables: 'social posts, ads, posters, and other image creative',
    goodFor: [
      'Social posts & ad creative',
      'Posters & one-pagers',
      'Cover art & thumbnails',
      'On-brand illustration prompts',
    ],
  },
  video: {
    deliverables: 'video, motion, and animated creative',
    goodFor: [
      'Promo & explainer video',
      'Motion graphics & title cards',
      'Animated social clips',
      'Storyboards & shot lists',
    ],
  },
  audio: {
    deliverables: 'audio, podcast, and sonic-brand work',
    goodFor: [
      'Podcast & episode branding',
      'Audio ad scripts',
      'Sonic-logo & jingle direction',
      'Voice & tone guidance',
    ],
  },
};

// Build the SKILLS.md usage guide bundled into every downloaded design system.
// Pure (no I/O) so it can be unit tested against fixed inputs. The guide teaches
// a recipient how to feed the system to an AI coding tool for on-brand results
// and attributes it to the Open Design open-source project for shareability.
export function buildDesignSystemSkillsMarkdown(input: {
  title: string;
  summary: string;
  category: string;
  surface: DesignSystemSurface;
  palette: GeneratedPalette;
  provenance?: DesignSystemProvenance;
}): string {
  const { title, summary, category, surface, palette } = input;
  const guide = DESIGN_SYSTEM_SURFACE_GUIDE[surface] ?? DESIGN_SYSTEM_SURFACE_GUIDE.web;
  const sourceUrls = (input.provenance?.sourceUrls ?? []).filter(
    (url): url is string => typeof url === 'string' && url.trim().length > 0,
  );

  const lines: string[] = [];
  lines.push(`# How to use the ${title} design system`);
  lines.push('');
  if (summary) {
    lines.push(summary);
    lines.push('');
  }
  lines.push(
    `This package is a portable **${category}** design system for ${guide.deliverables}. ` +
      'Hand the unzipped folder to any AI coding agent — Claude Code, Codex, Cursor, ' +
      'Gemini, OpenCode, or Qwen — alongside `DESIGN.md`, and it will produce on-brand ' +
      'work without further art direction.',
  );
  lines.push('');

  lines.push('## What it is good for');
  lines.push('');
  for (const item of guide.goodFor) lines.push(`- ${item}`);
  lines.push('');

  lines.push('## How to apply it');
  lines.push('');
  lines.push('1. Unzip this folder and open it in your AI coding tool.');
  lines.push(
    '2. Tell the agent: "Use `DESIGN.md` as the design system for everything you generate."',
  );
  lines.push('3. Ask for the artifact you want — e.g. "a pricing page" or "a 10-slide deck".');
  lines.push(
    '4. The agent reads `DESIGN.md` (identity, palette, typography, voice, layout) and the ' +
      '`system/` kit, then matches the brand.',
  );
  lines.push('');
  lines.push(
    '`DESIGN.md` is the single source of truth. The `system/` directory (when present) ships ' +
      'the rendered kit and design tokens — keep them together so the agent can read both.',
  );
  lines.push('');

  lines.push('## Palette quick reference');
  lines.push('');
  lines.push('| Role | Hex |');
  lines.push('| --- | --- |');
  lines.push(`| Background | \`${palette.background}\` |`);
  lines.push(`| Foreground | \`${palette.foreground}\` |`);
  lines.push(`| Accent | \`${palette.accent}\` |`);
  lines.push(`| Border | \`${palette.border}\` |`);
  lines.push(`| Muted | \`${palette.muted}\` |`);
  lines.push('');

  lines.push('## Tips for better results');
  lines.push('');
  lines.push('- Reference `DESIGN.md` explicitly in every prompt so the agent stays on-brand.');
  lines.push(
    '- Ask the agent to pull exact hex values and font families from `DESIGN.md` rather than ' +
      'inventing its own.',
  );
  lines.push(
    '- For multi-page or multi-slide work, ask it to reuse the same tokens across every page.',
  );
  lines.push('- Iterate by pointing at a specific section of `DESIGN.md` when something looks off.');
  lines.push('');

  if (sourceUrls.length > 0) {
    lines.push('## Source');
    lines.push('');
    lines.push(`Extracted from: ${sourceUrls.join(', ')}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(
    'Generated with **Open Design** — the open-source, local-first Claude Design alternative. ' +
      'Generate decks, landing pages, dashboards, and brand systems with your favourite AI ' +
      'coding agent.',
  );
  lines.push('');
  lines.push('https://github.com/nexu-io/open-design');
  lines.push('');

  return lines.join('\n');
}

async function ensureGeneratedDesignSystemFiles(root: string, id: string): Promise<void> {
  const metadata = await readUserMetadata(root, id);
  await migrateLegacyDesignSystemPackage(root, id, metadata);
  if (metadata.artifactMode === 'agent-managed') return;
  try {
    const existing = await stat(path.join(root, id, 'README.md'));
    if (existing.isFile()) return;
  } catch {
    // Generate the derived review files below.
  }
  try {
    const body = await readFile(path.join(root, id, 'DESIGN.md'), 'utf8');
    const title = normalizeTitle(metadata.title ?? firstHeading(body) ?? id);
    const category = metadata.category ?? extractCategory(body) ?? 'Custom';
    const surface = metadata.surface ?? extractSurface(body) ?? 'web';
    await writeGeneratedDesignSystemFiles(root, id, {
      title,
      category,
      surface,
      summary: summarize(body),
      ...(metadata.provenance ? { provenance: metadata.provenance } : {}),
      ...(metadata.provenance ? { sourceNotes: provenanceToNotes(metadata.provenance) } : {}),
      body,
    });
  } catch {
    // Listing/reading still returns whatever exists.
  }
}

async function migrateLegacyDesignSystemPackage(
  root: string,
  id: string,
  metadata: UserDesignSystemMetadata,
): Promise<void> {
  const dir = path.join(root, id);
  let body = '';
  try {
    body = await readFile(path.join(dir, 'DESIGN.md'), 'utf8');
  } catch {
    return;
  }
  const title = normalizeTitle(metadata.title ?? firstHeading(body) ?? id);
  const summary = summarize(body) || 'A reusable Open Design design system.';
  const palette = normalizeSwatches(body);
  const copyIfMissing = async (from: string, to: string): Promise<boolean> => {
    const fromPath = path.join(dir, ...from.split('/'));
    const toPath = path.join(dir, ...to.split('/'));
    try {
      const existing = await stat(toPath);
      if (existing.isFile()) return false;
    } catch (err) {
      if (!isAbsenceError(err)) throw err;
    }
    let content: Buffer;
    try {
      content = await readFile(fromPath);
    } catch (err) {
      if (isAbsenceError(err)) return false;
      throw err;
    }
    await mkdir(path.dirname(toPath), { recursive: true });
    await writeFile(toPath, content);
    return true;
  };
  const writeIfMissing = async (relativePath: string, content: string): Promise<boolean> => {
    const target = path.join(dir, ...relativePath.split('/'));
    try {
      const existing = await stat(target);
      if (existing.isFile()) return false;
    } catch (err) {
      if (!isAbsenceError(err)) throw err;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    return true;
  };

  const migratedArtifacts = await Promise.all([
    copyIfMissing('preview/colors-ui-palette.html', 'preview/colors-primary.html'),
    copyIfMissing('preview/colors-node-types.html', 'preview/colors-theme-light.html'),
    copyIfMissing('preview/colors-node-types.html', 'preview/colors-theme-dark.html'),
    copyIfMissing('preview/typography-scale.html', 'preview/typography-specimens.html'),
    copyIfMissing('preview/spacing-system.html', 'preview/spacing-tokens.html'),
    copyIfMissing('preview/spacing-system.html', 'preview/spacing-radius.html'),
    copyIfMissing('preview/spacing-system.html', 'preview/spacing-shadows.html'),
    copyIfMissing('preview/logo-variants.html', 'preview/brand-assets.html'),
    copyIfMissing('ui_kits/generated_interface/index.html', 'ui_kits/app/index.html'),
  ]);

  const appKitExists = await fileExists(path.join(dir, 'ui_kits', 'app', 'index.html'));
  const hasLegacyArtifacts = await hasAnyLegacyDesignSystemArtifact(dir);
  if (!hasLegacyArtifacts && !migratedArtifacts.some(Boolean)) {
    await rewriteLegacyPackageDocumentationReferences(dir);
    if (appKitExists) await writeDefaultUiKitComponentsIfMissing(dir, title);
    return;
  }

  await Promise.all([
    writeIfMissing(
      'preview/components-buttons.html',
      renderComponentCatalogHtml('Buttons', title, summary, palette),
    ),
    writeIfMissing(
      'preview/components-inputs.html',
      renderComponentCatalogHtml('Inputs', title, summary, palette),
    ),
    appKitExists
      ? writeIfMissing(
          'ui_kits/app/README.md',
          `# ${title} UI Kit\n\nThis package was migrated from an earlier Open Design design-system workspace. Use \`index.html\` as the applied interface example and replace it with source-backed modular components when new repository evidence is available.\n`,
        )
      : Promise.resolve(false),
    appKitExists
      ? writeDefaultUiKitComponentsIfMissing(dir, title)
      : Promise.resolve(false),
  ]);
  await rewriteLegacyPackageDocumentationReferences(dir);
  await removeLegacyDesignSystemArtifacts(dir);
}

async function rewriteLegacyPackageDocumentationReferences(dir: string): Promise<void> {
  await Promise.all(['DESIGN.md', 'README.md', 'SKILL.md', 'ui_kits/app/README.md'].map(async (relativePath) => {
    const target = path.join(dir, ...relativePath.split('/'));
    const current = await readFileOptional(target);
    if (current === undefined) return;
    const next = rewriteLegacyPackageReferences(current);
    if (next !== current) await writeFile(target, next, 'utf8');
  }));
}

function rewriteLegacyPackageReferences(text: string): string {
  return text
    .replaceAll('preview/colors-ui-palette.html', 'preview/colors-primary.html')
    .replaceAll('preview/colors-node-types.html', 'preview/colors-theme-light.html and preview/colors-theme-dark.html')
    .replaceAll('preview/typography-scale.html', 'preview/typography-specimens.html')
    .replaceAll('preview/spacing-system.html', 'preview/spacing-tokens.html, preview/spacing-radius.html, and preview/spacing-shadows.html')
    .replaceAll('preview/logo-variants.html', 'preview/brand-assets.html')
    .replaceAll('ui_kits/generated_interface/index.html', 'ui_kits/app/index.html')
    .replaceAll('ui_kits/generated_interface/', 'ui_kits/app/')
    .replaceAll('ui_kits/generated_interface', 'ui_kits/app');
}

async function writeDefaultUiKitComponentsIfMissing(dir: string, title: string): Promise<boolean> {
  const componentDir = path.join(dir, 'ui_kits', 'app', 'components');
  let wroteAny = false;
  await mkdir(componentDir, { recursive: true });
  for (const { fileName, componentName, purpose } of defaultUiKitComponentSpecs()) {
    const target = path.join(componentDir, fileName);
    try {
      const existing = await stat(target);
      if (existing.isFile()) {
        const current = await readFileOptional(target) ?? '';
        if (!isReplaceableUiKitScaffold(current)) continue;
      }
    } catch (err) {
      if (!isAbsenceError(err)) throw err;
    }
    await writeFile(target, renderUiKitComponent(componentName, title, purpose), 'utf8');
    wroteAny = true;
  }
  return wroteAny;
}

async function hasAnyLegacyDesignSystemArtifact(dir: string): Promise<boolean> {
  for (const artifact of LEGACY_DESIGN_SYSTEM_ARTIFACTS) {
    try {
      await stat(path.join(dir, ...artifact.legacyPath.split('/')));
      return true;
    } catch (err) {
      if (!isAbsenceError(err)) throw err;
    }
  }
  return false;
}

async function removeLegacyDesignSystemArtifacts(dir: string): Promise<void> {
  await Promise.all(
    LEGACY_DESIGN_SYSTEM_ARTIFACTS.map(async (artifact) => {
      const replacementReady = await Promise.all(
        artifact.replacementPaths.map((replacementPath) =>
          fileExists(path.join(dir, ...replacementPath.split('/'))),
        ),
      );
      if (!replacementReady.every(Boolean)) return;
      await rm(path.join(dir, ...artifact.legacyPath.split('/')), {
        recursive: 'removeDirectory' in artifact && artifact.removeDirectory === true,
        force: true,
      });
    }),
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const existing = await stat(filePath);
    return existing.isFile();
  } catch (err) {
    if (isAbsenceError(err)) return false;
    throw err;
  }
}

async function collectDesignSystemFiles(
  base: string,
  relativeDir: string,
  files: DesignSystemFileSummary[],
): Promise<void> {
  const dir = path.join(base, relativeDir);
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    // Never list or archive symlinks: `readFile`/`stat` would follow them out of
    // the design-system root, letting a crafted package exfiltrate arbitrary
    // daemon-readable files through the ZIP download. Excluding them here keeps
    // both the file listing and `buildUserDesignSystemArchive` inside `base`.
    if (entry.isSymbolicLink()) continue;
    if (!relativeDir && (entry.name === 'metadata.json' || entry.name === 'revisions')) continue;
    const relativePath = relativeDir
      ? path.posix.join(relativeDir.replaceAll(path.sep, '/'), entry.name)
      : entry.name;
    const fullPath = path.join(base, relativePath);
    const stats = await stat(fullPath);
    files.push({
      path: relativePath,
      name: entry.name,
      kind: classifyDesignSystemFile(relativePath, entry.isDirectory()),
      ...(entry.isDirectory() ? {} : { size: stats.size }),
      updatedAt: stats.mtime.toISOString(),
    });
    if (entry.isDirectory()) {
      await collectDesignSystemFiles(base, relativePath, files);
    }
  }
}

function sanitizeRelativeFilePath(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\\/g, '/');
  if (!trimmed || trimmed.includes('\0') || path.posix.isAbsolute(trimmed))
    return null;
  const normalized = path.posix.normalize(trimmed);
  if (
    normalized === '.'
    || normalized === '..'
    || normalized.startsWith('../')
    || normalized.includes('/../')
  ) {
    return null;
  }
  return normalized;
}

function classifyDesignSystemFile(
  relativePath: string,
  isDirectory: boolean,
): DesignSystemFileKind {
  if (isDirectory) return 'folder';
  const ext = path.extname(relativePath).toLowerCase();
  if (ext === '.html') return 'page';
  if (ext === '.css') return 'stylesheet';
  if (ext === '.md') return 'document';
  if (ext === '.json') return 'data';
  if (['.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) return 'image';
  return 'asset';
}

async function writeGeneratedDesignSystemFiles(
  root: string,
  id: string,
  input: {
    title: string;
    category: string;
    surface: DesignSystemSurface;
    summary: string;
    sourceNotes?: string;
    provenance?: DesignSystemProvenance;
    body: string;
  },
): Promise<void> {
  const dir = path.join(root, id);
  await Promise.all([
    mkdir(path.join(dir, 'assets'), { recursive: true }),
    mkdir(path.join(dir, 'context'), { recursive: true }),
    mkdir(path.join(dir, 'preview'), { recursive: true }),
    mkdir(path.join(dir, 'src', 'assets'), { recursive: true }),
    mkdir(path.join(dir, 'src', 'components'), { recursive: true }),
    mkdir(path.join(dir, 'ui_kits', 'app'), { recursive: true }),
    mkdir(path.join(dir, 'ui_kits', 'app', 'components'), { recursive: true }),
  ]);

  await Promise.all(
    generatedDesignSystemFileWrites(dir, input).map((write) =>
      writeFile(write.targetPath, write.content, 'utf8')
    ),
  );
}

function generatedDesignSystemFileWrites(
  dir: string,
  input: {
    title: string;
    category: string;
    surface: DesignSystemSurface;
    summary: string;
    sourceNotes?: string;
    provenance?: DesignSystemProvenance;
    body: string;
  },
): AtomicTextFileWrite[] {
  const palette = normalizeSwatches(input.body);
  const summary = input.summary || 'A user-created Open Design design system.';
  const sections = extractMarkdownSections(input.body);
  const provenance = input.provenance ?? normalizeProvenance(undefined, {
    ...(input.sourceNotes ? { sourceNotes: input.sourceNotes } : {}),
  });
  return [
    {
      targetPath: path.join(dir, 'README.md'),
      content: renderReadme({ ...input, summary, palette, sections }),
    },
    {
      targetPath: path.join(dir, 'SKILL.md'),
      content: renderSkill({ ...input, summary, palette }),
    },
    {
      targetPath: path.join(dir, 'context', 'provenance.json'),
      content: `${JSON.stringify(provenance ?? {}, null, 2)}\n`,
    },
    {
      targetPath: path.join(dir, 'context', 'provenance.md'),
      content: renderProvenanceMarkdown(provenance, input.title),
    },
    {
      targetPath: path.join(dir, 'colors_and_type.css'),
      content: renderCssTokens({ title: input.title, palette }),
    },
    {
      targetPath: path.join(dir, 'package.json'),
      content: `${JSON.stringify(
        {
          name: slugify(input.title),
          private: true,
          type: 'module',
          scripts: {
            preview: 'open index.html',
          },
        },
        null,
        2,
      )}\n`,
    },
    { targetPath: path.join(dir, 'assets', 'logo.svg'), content: renderLogoSvg(input.title, palette) },
    {
      targetPath: path.join(dir, 'src', 'components', 'design-system-reference.tsx'),
      content: renderReferenceComponent(input.title),
    },
    {
      targetPath: path.join(dir, 'src', 'assets', 'README.md'),
      content: '# Assets\n\nPlace product screenshots, icons, logos, fonts, and brand references here.\n',
    },
    {
      targetPath: path.join(dir, 'index.html'),
      content: renderOverviewHtml(input.title, summary, palette, sections),
    },
    {
      targetPath: path.join(dir, 'preview', 'colors-primary.html'),
      content: renderColorPreviewHtml('Primary Colors', palette),
    },
    {
      targetPath: path.join(dir, 'preview', 'colors-theme-light.html'),
      content: renderColorPreviewHtml('Light Theme Palette', palette),
    },
    {
      targetPath: path.join(dir, 'preview', 'colors-theme-dark.html'),
      content: renderColorPreviewHtml('Dark Theme Palette', {
        ...palette,
        background: palette.foreground,
        foreground: '#ffffff',
        muted: '#d6d6d6',
        border: '#3f3f46',
      }),
    },
    {
      targetPath: path.join(dir, 'preview', 'typography-specimens.html'),
      content: renderTypographyPreviewHtml(input.title),
    },
    {
      targetPath: path.join(dir, 'preview', 'spacing-tokens.html'),
      content: renderSpacingPreviewHtml('Spacing Tokens'),
    },
    {
      targetPath: path.join(dir, 'preview', 'spacing-radius.html'),
      content: renderSpacingPreviewHtml('Border Radius'),
    },
    {
      targetPath: path.join(dir, 'preview', 'spacing-shadows.html'),
      content: renderSpacingPreviewHtml('Shadow Elevation'),
    },
    {
      targetPath: path.join(dir, 'preview', 'components-buttons.html'),
      content: renderComponentCatalogHtml('Buttons', input.title, summary, palette),
    },
    {
      targetPath: path.join(dir, 'preview', 'components-inputs.html'),
      content: renderComponentCatalogHtml('Inputs', input.title, summary, palette),
    },
    {
      targetPath: path.join(dir, 'preview', 'brand-assets.html'),
      content: renderLogoPreviewHtml(input.title, palette),
    },
    {
      targetPath: path.join(dir, 'ui_kits', 'app', 'index.html'),
      content: renderComponentPreviewHtml(input.title, summary, palette),
    },
    {
      targetPath: path.join(dir, 'ui_kits', 'app', 'README.md'),
      content: renderUiKitReadme(input.title),
    },
    ...defaultUiKitComponentSpecs().map(({ fileName, componentName, purpose }) => ({
      targetPath: path.join(dir, 'ui_kits', 'app', 'components', fileName),
      content: renderUiKitComponent(componentName, input.title, purpose),
    })),
  ];
}

function defaultUiKitComponentSpecs(): Array<{ fileName: string; componentName: string; purpose: string }> {
  return [
    { fileName: 'App.jsx', componentName: 'App', purpose: 'Composes the workspace shell, navigation rail, review content, and composer surface.' },
    { fileName: 'Sidebar.jsx', componentName: 'Sidebar', purpose: 'Defines the compact navigation rail and active-section rhythm.' },
    { fileName: 'AssistantsList.jsx', componentName: 'AssistantsList', purpose: 'Models the assistant, thread, or object list that anchors a product workspace.' },
    { fileName: 'ChatArea.jsx', componentName: 'ChatArea', purpose: 'Composes the main conversation or review workspace with a header, content stream, and empty state.' },
    { fileName: 'InputBar.jsx', componentName: 'InputBar', purpose: 'Models the primary composer with attachments, actions, and send affordances.' },
    { fileName: 'MessageBubble.jsx', componentName: 'MessageBubble', purpose: 'Captures reusable message, note, or review-comment surfaces with metadata and status.' },
  ];
}

function renderUiKitComponent(name: string, title: string, purpose: string): string {
  if (name === 'App') return renderAppUiKitComponent(title);
  if (name === 'Sidebar') return renderSidebarUiKitComponent(title);
  if (name === 'AssistantsList') return renderAssistantsListUiKitComponent(title);
  if (name === 'ChatArea') return renderChatAreaUiKitComponent(title);
  if (name === 'InputBar') return renderInputBarUiKitComponent(title);
  if (name === 'MessageBubble') return renderMessageBubbleUiKitComponent(title);
  if (name === 'PreviewCard') return renderPreviewCardUiKitComponent(title);
  if (name === 'Composer') return renderComposerUiKitComponent(title);
  return `function ${name}({ children, title = '${escapeJsString(title)}' }) {
  return (
    <section className="od-ui-kit-${name.toLowerCase()}">
      <small>${escapeTsxText(purpose)}</small>
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

window.${name} = ${name};
`;
}

function isReplaceableUiKitScaffold(text: string): boolean {
  return Buffer.byteLength(text, 'utf8') < 700 && /od-ui-kit-[a-z-]+/u.test(text);
}

function renderAppUiKitComponent(title: string): string {
  return `const reviewModules = [
  { id: 'colors', label: 'Color review', summary: 'Primary, theme, and semantic color cards' },
  { id: 'type', label: 'Typography review', summary: 'Specimens, scale, and dense metadata rhythm' },
  { id: 'components', label: 'Component review', summary: 'Buttons, inputs, cards, and feedback states' },
];

const appStyles = {
  shell: { display: 'grid', gridTemplateColumns: '280px minmax(240px, 300px) 1fr', minHeight: '720px', background: 'var(--color-background, #f7f8fa)', color: 'var(--color-text, #202124)' },
  workspace: { padding: '24px', display: 'grid', gap: '16px', alignContent: 'start' },
  card: { border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 12, background: 'var(--color-surface, #fff)', padding: '16px' },
  eyebrow: { color: 'var(--color-text-secondary, #73777f)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0 },
};

function App({ title = '${escapeJsString(title)}', modules = reviewModules, summary = 'Source-backed design-system workspace' }) {
  const Sidebar = window.Sidebar;
  const AssistantsList = window.AssistantsList;
  const ChatArea = window.ChatArea;
  return (
    <main style={appStyles.shell}>
      <Sidebar title={title} />
      <AssistantsList />
      <section style={appStyles.workspace}>
        <span style={appStyles.eyebrow}>Review surface</span>
        <h1>{title}</h1>
        <p>{summary}</p>
        <ChatArea title={title + ' workspace'} />
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {modules.map((module) => (
            <article key={module.id} style={appStyles.card}>
              <strong>{module.label}</strong>
              <p>{module.summary}</p>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}

window.App = App;
`;
}

function renderSidebarUiKitComponent(title: string): string {
  return `const sidebarItems = [
  { id: 'design-system', label: 'Design System', badge: 'ready' },
  { id: 'design-files', label: 'Design Files', badge: '2' },
  { id: 'preview', label: 'Preview', badge: 'html' },
];

const sidebarStyles = {
  wrap: { width: 280, minHeight: 640, borderRight: '1px solid var(--color-border, #dfe3e8)', background: 'var(--color-background-soft, #fff)', padding: 16 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  mark: { width: 34, height: 34, borderRadius: 10, background: 'var(--color-primary, #00b96b)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 },
  item: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '11px 12px', borderRadius: 10, marginBottom: 8, border: '1px solid transparent' },
  active: { borderColor: 'var(--color-primary, #00b96b)', background: 'var(--color-primary-soft, rgba(0,185,107,.1))' },
  badge: { fontSize: 11, color: 'var(--color-text-secondary, #73777f)' },
};

function Sidebar({ title = '${escapeJsString(title)}', activeId = 'design-system', items = sidebarItems }) {
  return (
    <nav style={sidebarStyles.wrap} aria-label={title}>
      <div style={sidebarStyles.header}>
        <div style={sidebarStyles.mark}>{title.slice(0, 1)}</div>
        <strong>{title}</strong>
      </div>
      {items.map((item) => (
        <button key={item.id} type="button" style={{ ...sidebarStyles.item, ...(item.id === activeId ? sidebarStyles.active : {}) }}>
          <span>{item.label}</span>
          <span style={sidebarStyles.badge}>{item.badge}</span>
        </button>
      ))}
    </nav>
  );
}

window.Sidebar = Sidebar;
`;
}

function renderAssistantsListUiKitComponent(title: string): string {
  return `const assistantItems = [
  { id: 'default', name: '${escapeJsString(title)} reviewer', meta: 'Design review workspace', active: true },
  { id: 'tokens', name: 'Token specialist', meta: 'Colors, type, spacing, and states', active: false },
  { id: 'components', name: 'Component reviewer', meta: 'Cards, inputs, messages, and navigation', active: false },
];

const assistantsListStyles = {
  panel: { width: 280, borderRight: '1px solid var(--color-border, #dfe3e8)', background: 'var(--color-surface, #fff)', padding: 14, display: 'grid', alignContent: 'start', gap: 10 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  row: { display: 'grid', gridTemplateColumns: '32px 1fr', gap: 10, alignItems: 'center', padding: 10, borderRadius: 10, border: '1px solid transparent' },
  active: { borderColor: 'var(--color-primary, #00b96b)', background: 'var(--color-primary-soft, rgba(0,185,107,.1))' },
  avatar: { width: 32, height: 32, borderRadius: 10, background: 'var(--color-background-soft, #f7f8fa)', display: 'grid', placeItems: 'center', fontWeight: 700 },
  meta: { color: 'var(--color-text-secondary, #73777f)', fontSize: 12 },
};

function AssistantsList({ items = assistantItems }) {
  return (
    <aside style={assistantsListStyles.panel} aria-label="Assistants">
      <header style={assistantsListStyles.header}>
        <strong>Assistants</strong>
        <button type="button">New</button>
      </header>
      {items.map((item) => (
        <button key={item.id} type="button" style={{ ...assistantsListStyles.row, ...(item.active ? assistantsListStyles.active : {}) }}>
          <span style={assistantsListStyles.avatar}>{item.name.slice(0, 1)}</span>
          <span>
            <strong>{item.name}</strong>
            <small style={assistantsListStyles.meta}>{item.meta}</small>
          </span>
        </button>
      ))}
    </aside>
  );
}

window.AssistantsList = AssistantsList;
`;
}

function renderChatAreaUiKitComponent(title: string): string {
  return `const chatMessages = [
  { id: 'user', role: 'You', text: 'Create a compact review surface from the captured source evidence.' },
  { id: 'assistant', role: '${escapeJsString(title)}', text: 'The system uses focused preview cards, source-backed tokens, and reusable app-kit components.' },
];

const chatAreaStyles = {
  wrap: { minHeight: 640, background: 'var(--color-background, #f7f8fa)', display: 'grid', gridTemplateRows: 'auto 1fr auto' },
  header: { minHeight: 54, borderBottom: '1px solid var(--color-border, #dfe3e8)', padding: '0 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface, #fff)' },
  stream: { padding: 22, display: 'grid', alignContent: 'start', gap: 14, overflow: 'auto' },
  note: { border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 12, background: 'var(--color-surface, #fff)', padding: 14 },
  composerSlot: { borderTop: '1px solid var(--color-border, #dfe3e8)', background: 'var(--color-surface, #fff)', padding: 16 },
};

function ChatArea({ title = '${escapeJsString(title)} review', messages = chatMessages }) {
  const InputBar = window.InputBar;
  const MessageBubble = window.MessageBubble;
  return (
    <section style={chatAreaStyles.wrap} aria-label={title}>
      <header style={chatAreaStyles.header}>
        <strong>{title}</strong>
        <button type="button">Open source context</button>
      </header>
      <div style={chatAreaStyles.stream}>
        {messages.map((message) => (
          <MessageBubble key={message.id} role={message.role} text={message.text} fromUser={message.id === 'user'} />
        ))}
      </div>
      <div style={chatAreaStyles.composerSlot}><InputBar title={title + ' prompt'} /></div>
    </section>
  );
}

window.ChatArea = ChatArea;
`;
}

function renderInputBarUiKitComponent(title: string): string {
  return `const inputActions = ['Attach', 'Source', 'Revise'];

const inputBarStyles = {
  wrap: { border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 14, background: 'var(--color-surface, #fff)', padding: 12, display: 'grid', gap: 10 },
  field: { minHeight: 82, border: 0, outline: 0, resize: 'vertical', font: 'inherit', color: 'var(--color-text, #202124)' },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 999, padding: '6px 10px', background: 'var(--color-background-soft, #f7f8fa)' },
  send: { border: 0, borderRadius: 10, padding: '9px 14px', background: 'var(--color-primary, #00b96b)', color: '#fff', fontWeight: 700 },
};

function InputBar({ title = '${escapeJsString(title)} prompt', actions = inputActions }) {
  return (
    <form style={inputBarStyles.wrap} aria-label={title}>
      <textarea style={inputBarStyles.field} placeholder="Describe the design revision, evidence to inspect, or preview card to improve." />
      <div style={inputBarStyles.toolbar}>
        <div style={inputBarStyles.actions}>
          {actions.map((action) => <button key={action} type="button" style={inputBarStyles.chip}>{action}</button>)}
        </div>
        <button type="submit" style={inputBarStyles.send}>Send</button>
      </div>
    </form>
  );
}

window.InputBar = InputBar;
`;
}

function renderMessageBubbleUiKitComponent(title: string): string {
  return `const messageBubbleStyles = {
  bubble: { maxWidth: 680, border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 14, background: 'var(--color-surface, #fff)', padding: 14, display: 'grid', gap: 8 },
  user: { marginLeft: 'auto', background: 'var(--color-primary-soft, rgba(0,185,107,.1))', borderColor: 'var(--color-primary, #00b96b)' },
  meta: { display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--color-text-secondary, #73777f)', fontSize: 12 },
  text: { margin: 0, lineHeight: 1.55 },
  status: { justifySelf: 'start', borderRadius: 999, padding: '4px 8px', background: 'var(--color-background-soft, #f7f8fa)', fontSize: 12 },
};

function MessageBubble({ role = '${escapeJsString(title)}', text = 'Source-backed design-system guidance belongs in compact, reviewable message surfaces.', status = 'grounded', fromUser = false }) {
  return (
    <article style={{ ...messageBubbleStyles.bubble, ...(fromUser ? messageBubbleStyles.user : {}) }}>
      <div style={messageBubbleStyles.meta}>
        <strong>{role}</strong>
        <span>{status}</span>
      </div>
      <p style={messageBubbleStyles.text}>{text}</p>
      <span style={messageBubbleStyles.status}>Uses captured evidence</span>
    </article>
  );
}

window.MessageBubble = MessageBubble;
`;
}

function renderPreviewCardUiKitComponent(title: string): string {
  return `const defaultChecks = [
  'Matches source evidence',
  'Shows real component states',
  'Reusable in future projects',
];

const previewCardStyles = {
  card: { border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 12, background: 'var(--color-surface, #fff)', overflow: 'hidden' },
  header: { padding: 16, display: 'flex', justifyContent: 'space-between', gap: 16, borderBottom: '1px solid var(--color-border, #dfe3e8)' },
  body: { padding: 18, display: 'grid', gap: 14 },
  swatches: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 },
  swatch: { minHeight: 52, borderRadius: 10, border: '1px solid var(--color-border, #dfe3e8)' },
  check: { display: 'flex', gap: 8, color: 'var(--color-text-secondary, #73777f)' },
};

function PreviewCard({ title = '${escapeJsString(title)} module', summary = 'Captures source-backed review states for one design-system module.', checks = defaultChecks }) {
  return (
    <article style={previewCardStyles.card}>
      <header style={previewCardStyles.header}>
        <div>
          <strong>{title}</strong>
          <p>{summary}</p>
        </div>
        <button type="button">Looks good</button>
      </header>
      <div style={previewCardStyles.body}>
        <div style={previewCardStyles.swatches}>
          {['var(--color-primary, #00b96b)', 'var(--color-surface, #fff)', 'var(--color-background-soft, #f7f8fa)', 'var(--color-text, #202124)'].map((color) => (
            <span key={color} style={{ ...previewCardStyles.swatch, background: color }} />
          ))}
        </div>
        {checks.map((check) => <span key={check} style={previewCardStyles.check}>- {check}</span>)}
      </div>
    </article>
  );
}

window.PreviewCard = PreviewCard;
`;
}

function renderComposerUiKitComponent(title: string): string {
  return `const composerActions = ['Attach evidence', 'Open source context', 'Request revision'];

const composerStyles = {
  wrap: { border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 14, background: 'var(--color-surface, #fff)', padding: 14, display: 'grid', gap: 12 },
  field: { minHeight: 92, border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 10, padding: 12, resize: 'vertical', font: 'inherit' },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  chip: { border: '1px solid var(--color-border, #dfe3e8)', borderRadius: 999, padding: '6px 10px', background: 'var(--color-background-soft, #f7f8fa)' },
  send: { border: 0, borderRadius: 10, padding: '10px 14px', background: 'var(--color-primary, #00b96b)', color: '#fff', fontWeight: 700 },
};

function Composer({ title = '${escapeJsString(title)} feedback', actions = composerActions }) {
  return (
    <form style={composerStyles.wrap} aria-label={title}>
      <textarea style={composerStyles.field} placeholder="Describe what needs revision while keeping the source evidence intact." />
      <div style={composerStyles.toolbar}>
        <div style={composerStyles.chips}>
          {actions.map((action) => <button key={action} type="button" style={composerStyles.chip}>{action}</button>)}
        </div>
        <button type="submit" style={composerStyles.send}>Send</button>
      </div>
    </form>
  );
}

window.Composer = Composer;
`;
}

function stripPrefixAndValidateId(id: string, prefix = ''): string | null {
  if (typeof id !== 'string') return null;
  if (prefix && !id.startsWith(prefix)) return null;
  const dirId = prefix ? id.slice(prefix.length) : id;
  if (!/^[a-zA-Z0-9._-]+$/.test(dirId)) return null;
  if (dirId === '.' || dirId === '..') return null;
  return dirId;
}

async function readUserMetadata(root: string, id: string): Promise<UserDesignSystemMetadata> {
  try {
    const raw = await readFile(path.join(root, id, 'metadata.json'), 'utf8');
    const parsed = JSON.parse(raw) as UserDesignSystemMetadata;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const provenance = parseProvenance((parsed as { provenance?: unknown }).provenance);
    const projectId = cleanProjectIdForMetadata(parsed.projectId);
    return {
      ...(typeof parsed.title === 'string' ? { title: parsed.title } : {}),
      ...(typeof parsed.category === 'string' ? { category: parsed.category } : {}),
      ...(isDesignSystemSurface(parsed.surface) ? { surface: parsed.surface } : {}),
      ...(isDesignSystemStatus(parsed.status) ? { status: parsed.status } : {}),
      ...(isDesignSystemArtifactMode(parsed.artifactMode) ? { artifactMode: parsed.artifactMode } : {}),
      ...(typeof parsed.createdAt === 'string' ? { createdAt: parsed.createdAt } : {}),
      ...(typeof parsed.updatedAt === 'string' ? { updatedAt: parsed.updatedAt } : {}),
      ...(provenance ? { provenance } : {}),
      ...(projectId ? { projectId } : {}),
    };
  } catch {
    return {};
  }
}

function cleanProjectIdForMetadata(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value === '.' || value === '..') return null;
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(value)) return null;
  return value;
}

function isDesignSystemArtifactMode(raw: unknown): raw is DesignSystemArtifactMode {
  return raw === 'generated' || raw === 'agent-managed';
}

function normalizeArtifactMode(raw: unknown): DesignSystemArtifactMode | undefined {
  return isDesignSystemArtifactMode(raw) ? raw : undefined;
}

async function writeUserMetadata(
  root: string,
  id: string,
  metadata: UserDesignSystemMetadata,
): Promise<void> {
  await writeFile(
    path.join(root, id, 'metadata.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );
}

async function writeUserDesignSystemRevision(
  root: string,
  id: string,
  revision: DesignSystemRevision,
): Promise<void> {
  await mkdir(path.join(root, id, 'revisions'), { recursive: true });
  await writeFile(
    path.join(root, id, 'revisions', `${revision.id}.json`),
    `${JSON.stringify(revision, null, 2)}\n`,
    'utf8',
  );
}

function parseDesignSystemRevision(
  raw: unknown,
  designSystemId: string,
): DesignSystemRevision | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<DesignSystemRevision>;
  const id = sanitizeRevisionId(value.id);
  const feedback = cleanMultiline(value.feedback);
  const baseBody = normalizeBody(value.baseBody);
  const proposedBody = normalizeBody(value.proposedBody);
  if (!id || !feedback || !baseBody || !proposedBody) return null;
  return {
    id,
    designSystemId,
    status: isDesignSystemRevisionStatus(value.status) ? value.status : 'pending',
    feedback,
    baseBody,
    proposedBody,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString(),
    ...(cleanText(value.sectionTitle) ? { sectionTitle: cleanText(value.sectionTitle) } : {}),
    ...(typeof value.jobId === 'string' ? { jobId: value.jobId } : {}),
    ...(normalizeRevisionFileChanges(value.fileChanges).length > 0
      ? { fileChanges: normalizeRevisionFileChanges(value.fileChanges) }
      : {}),
  };
}

function normalizeRevisionFileChanges(raw: unknown): DesignSystemRevisionFileChange[] {
  if (!Array.isArray(raw)) return [];
  const out: DesignSystemRevisionFileChange[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const cleanPath = typeof record.path === 'string' ? sanitizeRelativeFilePath(record.path) : null;
    if (!cleanPath || seen.has(cleanPath)) continue;
    const baseContent = typeof record.baseContent === 'string' ? record.baseContent : '';
    const proposedContent = typeof record.proposedContent === 'string' ? record.proposedContent : '';
    if (proposedContent.length > 200_000 || baseContent.length > 200_000) continue;
    seen.add(cleanPath);
    out.push({ path: cleanPath, baseContent, proposedContent });
  }
  return out;
}

async function writeAcceptedUserDesignSystemRevision(
  root: string,
  dirId: string,
  revision: DesignSystemRevision,
  acceptedRevision: DesignSystemRevision,
): Promise<boolean> {
  const base = path.join(root, dirId);
  const designPath = path.join(base, 'DESIGN.md');
  let existingBody: string;
  try {
    existingBody = await readFile(designPath, 'utf8');
  } catch {
    return false;
  }
  const existingMeta = await readUserMetadata(root, dirId);
  const updatedAt = acceptedRevision.updatedAt;
  const title = normalizeTitle(existingMeta.title ?? firstHeading(existingBody) ?? dirId);
  const category = existingMeta.category || extractCategory(existingBody) || 'Custom';
  const surface = existingMeta.surface ?? extractSurface(existingBody) ?? 'web';
  const artifactMode = existingMeta.artifactMode;
  const provenance = existingMeta.provenance;
  const metadata: UserDesignSystemMetadata = {
    ...existingMeta,
    title,
    category,
    surface,
    status: existingMeta.status ?? 'draft',
    ...(artifactMode ? { artifactMode } : {}),
    createdAt: existingMeta.createdAt ?? updatedAt,
    updatedAt,
    ...(provenance ? { provenance } : {}),
  };
  const writes: AtomicTextFileWrite[] = [
    { targetPath: designPath, content: revision.proposedBody },
    {
      targetPath: path.join(base, 'metadata.json'),
      content: `${JSON.stringify(metadata, null, 2)}\n`,
    },
  ];
  if (artifactMode !== 'agent-managed') {
    const sourceNotes = provenanceToNotes(provenance);
    writes.push(...generatedDesignSystemFileWrites(base, {
      title,
      category,
      surface,
      summary: summarize(revision.proposedBody),
      ...(provenance ? { provenance } : {}),
      ...(sourceNotes ? { sourceNotes } : {}),
      body: revision.proposedBody,
    }));
  }
  writes.push(...revisionFileChangeWrites(root, dirId, revision.fileChanges));
  writes.push({
    targetPath: path.join(base, 'revisions', `${acceptedRevision.id}.json`),
    content: `${JSON.stringify(acceptedRevision, null, 2)}\n`,
  });
  await writeTextFilesAtomically(base, writes);
  return true;
}

function revisionFileChangeWrites(
  root: string,
  dirId: string,
  fileChanges: DesignSystemRevisionFileChange[] | undefined,
): AtomicTextFileWrite[] {
  const changes = normalizeRevisionFileChanges(fileChanges);
  if (changes.length === 0) return [];
  const base = path.join(root, dirId);
  const resolvedBase = path.resolve(base);
  const writes: AtomicTextFileWrite[] = [];
  for (const change of changes) {
    if (
      change.path === 'DESIGN.md'
      || change.path === 'metadata.json'
      || change.path.startsWith('revisions/')
    ) {
      continue;
    }
    const target = path.resolve(base, change.path);
    if (target !== resolvedBase && !target.startsWith(`${resolvedBase}${path.sep}`)) continue;
    writes.push({ targetPath: target, content: change.proposedContent });
  }
  return writes;
}

async function writeTextFilesAtomically(base: string, writes: AtomicTextFileWrite[]): Promise<void> {
  if (writes.length === 0) return;
  const deduped = [...new Map(writes.map((write) => [write.targetPath, write])).values()];
  const snapshots = new Map<string, AtomicTextFileSnapshot>();
  for (const write of deduped) {
    try {
      snapshots.set(write.targetPath, {
        existed: true,
        content: await readFile(write.targetPath, 'utf8'),
      });
    } catch (err) {
      if (!isAbsenceError(err)) throw err;
      snapshots.set(write.targetPath, { existed: false });
    }
  }
  const tempDir = path.join(base, `.tmp-revision-accept-${randomUUID()}`);
  const stagedWrites: Array<AtomicTextFileWrite & { tempPath: string }> = [];
  await mkdir(tempDir, { recursive: true });
  try {
    for (const [index, write] of deduped.entries()) {
      const tempPath = path.join(tempDir, `${index}.tmp`);
      await writeFile(tempPath, write.content, 'utf8');
      stagedWrites.push({ ...write, tempPath });
    }
    for (const write of stagedWrites) {
      await mkdir(path.dirname(write.targetPath), { recursive: true });
    }
    const applied: string[] = [];
    try {
      for (const write of stagedWrites) {
        await rename(write.tempPath, write.targetPath);
        applied.push(write.targetPath);
      }
    } catch (err) {
      await rollbackAtomicTextFileWrites(applied, snapshots);
      throw err;
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function rollbackAtomicTextFileWrites(
  applied: string[],
  snapshots: Map<string, AtomicTextFileSnapshot>,
): Promise<void> {
  for (const targetPath of applied.reverse()) {
    const snapshot = snapshots.get(targetPath);
    try {
      if (snapshot?.existed) {
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, snapshot.content, 'utf8');
      } else {
        await rm(targetPath, { force: true });
      }
    } catch {
      // Keep the original write failure as the actionable error.
    }
  }
}

function sanitizeRevisionId(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return /^[a-zA-Z0-9-]+$/.test(value) ? value : null;
}

async function uniqueSlug(root: string, base: string): Promise<string> {
  let candidate = base || 'design-system';
  let index = 2;
  for (;;) {
    try {
      await stat(path.join(root, candidate));
      candidate = `${base}-${index++}`;
    } catch {
      return candidate;
    }
  }
}

async function reserveUniqueSlugDirectory(root: string, base: string): Promise<{ dirId: string; dir: string }> {
  await mkdir(root, { recursive: true });
  let candidate = base || 'design-system';
  let index = 2;
  for (;;) {
    const dir = path.join(root, candidate);
    try {
      await mkdir(dir);
      return { dirId: candidate, dir };
    } catch (err) {
      if (!isNodeErrorCode(err, 'EEXIST')) throw err;
      candidate = `${base || 'design-system'}-${index++}`;
    }
  }
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === code,
  );
}

function slugify(raw: string): string {
  const ascii = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return ascii || 'design-system';
}

function normalizeTitle(raw: string | undefined): string {
  const title = cleanText(raw);
  return title || 'Untitled Design System';
}

function cleanText(raw: string | undefined): string {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
}

function cleanMultiline(raw: string | undefined): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseProvenance(raw: unknown): DesignSystemProvenance | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const sourceUrls = parseStringList(value.sourceUrls);
  const githubUrls = parseStringList(value.githubUrls);
  const localCodeFiles = parseStringList(value.localCodeFiles);
  const figFiles = parseStringList(value.figFiles);
  const assetFiles = parseStringList(value.assetFiles);
  return normalizeProvenance({
    ...(typeof value.companyBlurb === 'string' ? { companyBlurb: value.companyBlurb } : {}),
    ...(sourceUrls ? { sourceUrls } : {}),
    ...(githubUrls ? { githubUrls } : {}),
    ...(localCodeFiles ? { localCodeFiles } : {}),
    ...(figFiles ? { figFiles } : {}),
    ...(assetFiles ? { assetFiles } : {}),
    ...(typeof value.notes === 'string' ? { notes: value.notes } : {}),
    ...(typeof value.sourceNotes === 'string' ? { sourceNotes: value.sourceNotes } : {}),
  });
}

function parseStringList(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const values = uniqueCleanList(raw.filter((value): value is string => typeof value === 'string'));
  return values.length > 0 ? values : undefined;
}

function normalizeProvenance(
  raw?: DesignSystemProvenance,
  fallback: { companyBlurb?: string; sourceNotes?: string } = {},
): DesignSystemProvenance | undefined {
  const companyBlurb = cleanMultiline(raw?.companyBlurb) || cleanMultiline(fallback.companyBlurb);
  const sourceUrls = uniqueCleanList(raw?.sourceUrls);
  const githubUrls = uniqueCleanList(raw?.githubUrls);
  const localCodeFiles = uniqueCleanList(raw?.localCodeFiles);
  const figFiles = uniqueCleanList(raw?.figFiles);
  const assetFiles = uniqueCleanList(raw?.assetFiles);
  const notes = cleanMultiline(raw?.notes);
  const sourceNotes = cleanMultiline(raw?.sourceNotes) || cleanMultiline(fallback.sourceNotes);
  const provenance: DesignSystemProvenance = {
    ...(companyBlurb ? { companyBlurb } : {}),
    ...(sourceUrls.length > 0 ? { sourceUrls } : {}),
    ...(githubUrls.length > 0 ? { githubUrls } : {}),
    ...(localCodeFiles.length > 0 ? { localCodeFiles } : {}),
    ...(figFiles.length > 0 ? { figFiles } : {}),
    ...(assetFiles.length > 0 ? { assetFiles } : {}),
    ...(notes ? { notes } : {}),
    ...(sourceNotes ? { sourceNotes } : {}),
  };
  return hasProvenance(provenance) ? provenance : undefined;
}

function uniqueCleanList(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values ?? []) {
    const clean = cleanText(value);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 100) break;
  }
  return out;
}

function hasProvenance(provenance: DesignSystemProvenance): boolean {
  return Boolean(
    provenance.companyBlurb
      || provenance.notes
      || provenance.sourceNotes
      || provenance.sourceUrls?.length
      || provenance.githubUrls?.length
      || provenance.localCodeFiles?.length
      || provenance.figFiles?.length
      || provenance.assetFiles?.length,
  );
}

function provenanceToNotes(provenance: DesignSystemProvenance | undefined): string {
  if (!provenance) return '';
  const lines: string[] = [];
  if (provenance.companyBlurb) lines.push(`Company/product context: ${provenance.companyBlurb}`);
  if (provenance.sourceUrls?.length) lines.push(`Source links: ${provenance.sourceUrls.join(', ')}`);
  if (provenance.githubUrls?.length) lines.push(`GitHub repositories: ${provenance.githubUrls.join(', ')}`);
  if (provenance.localCodeFiles?.length) lines.push(`Local code references: ${provenance.localCodeFiles.join(', ')}`);
  if (provenance.figFiles?.length) lines.push(`Figma files: ${provenance.figFiles.join(', ')}`);
  if (provenance.assetFiles?.length) lines.push(`Fonts, logos and assets: ${provenance.assetFiles.join(', ')}`);
  if (provenance.notes) lines.push(`Additional notes: ${provenance.notes}`);
  if (provenance.sourceNotes && !lines.includes(provenance.sourceNotes)) {
    lines.push(provenance.sourceNotes);
  }
  return lines.join('\n');
}

function normalizeBody(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const body = raw.trim();
  return body.length > 0 ? `${body}\n` : null;
}

function firstHeading(raw: string): string | null {
  return /^#\s+(.+?)\s*$/m.exec(raw)?.[1]?.trim() ?? null;
}

function withDesignSystemHeader(
  body: string,
  input: { title: string; category: string; surface: DesignSystemSurface },
): string {
  let next = body.replace(/^#\s+.*$/m, `# ${input.title}`);
  if (next === body && !/^#\s+/.test(next)) next = `# ${input.title}\n\n${next}`;
  next = upsertBlockquoteMeta(next, 'Category', input.category);
  next = upsertBlockquoteMeta(next, 'Surface', input.surface);
  return next.endsWith('\n') ? next : `${next}\n`;
}

function upsertBlockquoteMeta(body: string, key: string, value: string): string {
  const re = new RegExp(`^>\\s*${key}:\\s*.*$`, 'im');
  if (re.test(body)) return body.replace(re, `> ${key}: ${value}`);
  const h1 = /^#\s+.*$/m.exec(body);
  if (!h1) return `> ${key}: ${value}\n\n${body}`;
  const insertAt = h1.index + h1[0].length;
  return `${body.slice(0, insertAt)}\n> ${key}: ${value}${body.slice(insertAt)}`;
}

function buildDraftDesignSystemBody(input: UserDesignSystemInput & { title: string }): string {
  const category = cleanText(input.category) || 'Custom';
  const surface = input.surface ?? 'web';
  const summary = cleanText(input.summary) || 'A user-authored design system for future Open Design projects.';
  const sourceNotes = cleanText(input.sourceNotes);
  return `# ${input.title}

> Category: ${category}
> Surface: ${surface}

${summary}

## 1. Visual Theme & Atmosphere

Describe the visual mood, product context, and the feeling this system should create.
${sourceNotes ? `\nSource context: ${sourceNotes}\n` : ''}
## 2. Color

List brand colors, semantic roles, background surfaces, text colors, borders, and states.

## 3. Typography

Define display, heading, body, caption, and code typography. Include fallback stacks.

## 4. Spacing

Define the spacing scale, density, radius, and layout rhythm.

## 5. Layout & Composition

Describe grids, page structure, information density, navigation, and responsive behavior.

## 6. Components

Document buttons, cards, forms, tables, navigation, modals, and product-specific components.

## 7. Motion & Interaction

Define hover, focus, loading, transition, and reduced-motion behavior.

## 8. Voice & Brand

Describe copy style, terminology, capitalization, and tone.

## 9. Anti-patterns

List visual and interaction choices the agent must avoid when generating with this system.
`;
}

type MarkdownSection = {
  title: string;
  body: string;
};

type GeneratedPalette = {
  background: string;
  border: string;
  foreground: string;
  accent: string;
  muted: string;
  success: string;
};

function normalizeSwatches(body: string): GeneratedPalette {
  const [background, border, foreground, accent] = extractSwatches(body);
  return {
    background: background ?? '#fbfaf7',
    border: border ?? '#ddd8d0',
    foreground: foreground ?? '#1f1d1b',
    accent: accent ?? '#d66f4d',
    muted: '#706b65',
    success: '#5d8f5a',
  };
}

function extractMarkdownSections(body: string): MarkdownSection[] {
  const matches = [...body.matchAll(/^##\s+(.+?)\s*$/gm)];
  if (matches.length === 0) return [];
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    return {
      title: match[1]?.replace(/^\d+\.\s*/, '').trim() || 'Section',
      body: body.slice(start, end).trim(),
    };
  });
}

function renderReadme(input: {
  title: string;
  category: string;
  surface: DesignSystemSurface;
  summary: string;
  sourceNotes?: string;
  provenance?: DesignSystemProvenance;
  palette: GeneratedPalette;
  sections: MarkdownSection[];
}): string {
  const notes = provenanceToNotes(input.provenance) || cleanMultiline(input.sourceNotes);
  const sectionLines = input.sections
    .slice(0, 8)
    .map((section) => `- ${section.title}`)
    .join('\n');
  return `# ${input.title}

A reusable Open Design package for ${input.title}.

## Product Overview

${input.summary} This design-system package is designed for product, app, workspace, and platform surfaces that need a reusable visual direction rather than a one-off mockup. It provides a concrete token layer, focused preview cards, and an applied UI kit so future agents can build interfaces with the same hierarchy, density, component roles, and interaction rules captured in DESIGN.md.

## Package Overview

- Category: ${input.category}
- Surface: ${input.surface}
- Primary accent: ${input.palette.accent}
- Background: ${input.palette.background}
- Foreground: ${input.palette.foreground}

## Captured Foundations

${sectionLines || '- Visual foundations\n- Component guidance\n- Brand usage'}

## Generated Files

- DESIGN.md: canonical design system source.
- colors_and_type.css: reusable CSS variables for color and type.
- preview/: focused HTML review cards for color themes, typography, spacing, components, and brand assets.
- assets/: logo and brand asset references.
- context/: structured source context captured during setup.
- ui_kits/app/: applied interface preview and UI-kit notes.
- SKILL.md: agent-facing usage instructions.
${notes ? `\n## Source Context\n\n${notes}\n` : ''}
`;
}

function renderProvenanceMarkdown(
  provenance: DesignSystemProvenance | undefined,
  title: string,
): string {
  if (!provenance) {
    return `# ${title} Source Context\n\nNo structured source context was captured for this design system.\n`;
  }
  const sections = [
    provenance.companyBlurb ? `## Company / Product\n\n${provenance.companyBlurb}` : '',
    provenance.sourceUrls?.length
      ? `## Source Links\n\n${provenance.sourceUrls.map((value) => `- ${value}`).join('\n')}`
      : '',
    provenance.githubUrls?.length
      ? `## GitHub Repositories\n\n${provenance.githubUrls.map((value) => `- ${value}`).join('\n')}`
      : '',
    provenance.localCodeFiles?.length
      ? `## Local Code References\n\n${provenance.localCodeFiles.map((value) => `- ${value}`).join('\n')}`
      : '',
    provenance.figFiles?.length
      ? `## Figma Files\n\n${provenance.figFiles.map((value) => `- ${value}`).join('\n')}`
      : '',
    provenance.assetFiles?.length
      ? `## Fonts, Logos and Assets\n\n${provenance.assetFiles.map((value) => `- ${value}`).join('\n')}`
      : '',
    provenance.notes ? `## Notes\n\n${provenance.notes}` : '',
    provenance.sourceNotes ? `## Flattened Source Notes\n\n${provenance.sourceNotes}` : '',
  ].filter(Boolean);
  return `# ${title} Source Context\n\n${sections.join('\n\n')}\n`;
}

function renderSkill(input: {
  title: string;
  summary: string;
  palette: GeneratedPalette;
}): string {
  const skillName = slugify(input.title);
  return `---
name: ${skillName}
description: Use this skill when generating Open Design artifacts that should follow ${input.title}.
user-invocable: true
---

Read README.md, DESIGN.md, colors_and_type.css, preview/, preserved assets, context evidence, and ui_kits/app/ before generating any new interface.

**What's inside:**
- DESIGN.md as the canonical source-backed rules document.
- colors_and_type.css as the reusable token stylesheet.
- preview/ focused review cards for color, typography, spacing, components, and brand assets.
- ui_kits/app/ as a browser-reviewable applied interface kit with modular role components.
- context/ provenance and evidence notes for future refreshes.

**Source context:**
${input.summary}

**When to use this skill:**
- Creating product-like prototypes that should follow ${input.title}.
- Revising focused design-system preview cards or app UI kit components.
- Building interfaces that need this package's captured density, hierarchy, tokens, and anti-patterns.

**How to use:**
1. Read DESIGN.md for product context, foundations, components, motion, voice, and anti-patterns.
2. Load colors_and_type.css instead of hardcoding palette, typography, radius, or spacing values.
3. Inspect preview/ cards for focused modules before inventing new styling.
4. Reuse ui_kits/app/index.html and ui_kits/app/components/ as the applied component composition.
5. Preserve the product context, hierarchy, density, and anti-patterns documented in DESIGN.md.

**Design system highlights:**

- Background: ${input.palette.background}
- Foreground: ${input.palette.foreground}
- Accent: ${input.palette.accent}
- Border: ${input.palette.border}
`;
}

function renderUiKitReadme(title: string): string {
  return `# ${title} UI Kit

This UI kit is the applied interface reference for the design system. Open \`index.html\` to review the composed app surface, then reuse the modular role components under \`components/\` when building new product-like artifacts.

## Structure

- \`index.html\` - Browser-reviewable entry that loads \`../../colors_and_type.css\`, React, ReactDOM, Babel, and the component files.
- \`components/App.jsx\` - App shell that composes the role components.
- \`components/Sidebar.jsx\` - Navigation rail or sidebar pattern.
- \`components/AssistantsList.jsx\` - Object, assistant, or thread list pattern.
- \`components/ChatArea.jsx\` - Primary workspace with message/content stream.
- \`components/InputBar.jsx\` - Composer or command-entry surface.
- \`components/MessageBubble.jsx\` - Message, note, or review-comment unit.

## Usage

Copy component files into a React prototype or open \`index.html\` directly for visual review. Keep \`colors_and_type.css\` loaded before the components so color, type, spacing, radius, and state variables resolve through the extracted token contract.

## Design Notes

Prefer source-backed component roles over static duplicate HTML. When repository evidence is available, replace this scaffold with components modeled from captured app shell, navigation, composer, message, and content surfaces.

## Source

Use parent \`DESIGN.md\`, \`README.md\`, \`preview/\`, and \`context/\` as the evidence trail for any future refinement.
`;
}

function renderCssTokens(input: { title: string; palette: GeneratedPalette }): string {
  const slug = slugify(input.title);
  return `:root {
  --${slug}-background: ${input.palette.background};
  --${slug}-surface: #ffffff;
  --${slug}-surface-muted: #f4f1ec;
  --${slug}-foreground: ${input.palette.foreground};
  --${slug}-muted: ${input.palette.muted};
  --${slug}-border: ${input.palette.border};
  --${slug}-accent: ${input.palette.accent};
  --${slug}-success: ${input.palette.success};
  --${slug}-font-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --${slug}-font-serif: Georgia, "Times New Roman", serif;
  --${slug}-font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  --${slug}-radius-sm: 6px;
  --${slug}-radius-md: 10px;
  --${slug}-radius-lg: 16px;
  --${slug}-space-1: 4px;
  --${slug}-space-2: 8px;
  --${slug}-space-3: 12px;
  --${slug}-space-4: 16px;
  --${slug}-space-6: 24px;
  --${slug}-space-8: 32px;

  --color-background: var(--${slug}-background);
  --color-surface: var(--${slug}-surface);
  --color-background-soft: var(--${slug}-surface-muted);
  --color-text: var(--${slug}-foreground);
  --color-text-1: var(--${slug}-foreground);
  --color-text-secondary: var(--${slug}-muted);
  --color-border: var(--${slug}-border);
  --color-primary: var(--${slug}-accent);
  --color-primary-soft: color-mix(in srgb, var(--${slug}-accent) 14%, transparent);
  --font-family: var(--${slug}-font-sans);
  --code-font-family: var(--${slug}-font-mono);
  --radius-control: var(--${slug}-radius-sm);
  --radius-card: var(--${slug}-radius-md);
  --space-2: var(--${slug}-space-2);
  --space-3: var(--${slug}-space-3);
  --space-4: var(--${slug}-space-4);
}

.od-design-system-preview {
  color: var(--${slug}-foreground);
  background: var(--${slug}-background);
  font-family: var(--${slug}-font-sans);
}
`;
}

function renderLogoSvg(title: string, palette: GeneratedPalette): string {
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || 'OD';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160" role="img" aria-label="${escapeHtml(title)}">
  <rect width="320" height="160" rx="28" fill="${palette.background}"/>
  <circle cx="84" cy="80" r="38" fill="${palette.accent}"/>
  <text x="84" y="92" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff">${escapeHtml(initials)}</text>
  <text x="140" y="88" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="700" fill="${palette.foreground}">${escapeHtml(title)}</text>
</svg>
`;
}

function renderReferenceComponent(title: string): string {
  return `export function DesignSystemReference() {
  return (
    <section className="od-design-system-preview">
      <h1>${escapeTsxText(title)}</h1>
      <p>Use DESIGN.md and colors_and_type.css as the source of truth.</p>
    </section>
  );
}
`;
}

function renderOverviewHtml(
  title: string,
  summary: string,
  palette: GeneratedPalette,
  sections: MarkdownSection[],
): string {
  const items = sections
    .slice(0, 6)
    .map((section) => `<li><strong>${escapeHtml(section.title)}</strong><span>${escapeHtml(section.body.slice(0, 160) || 'Needs review.')}</span></li>`)
    .join('');
  return renderHtmlDocument(
    title,
    `<main class="overview">
      <p class="eyebrow">Open Design system</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="lead">${escapeHtml(summary)}</p>
      <div class="palette">
        ${renderSwatch('Background', palette.background)}
        ${renderSwatch('Border', palette.border)}
        ${renderSwatch('Foreground', palette.foreground)}
        ${renderSwatch('Accent', palette.accent)}
      </div>
      <ul class="section-list">${items}</ul>
    </main>`,
    palette,
  );
}

function renderColorPreviewHtml(title: string, palette: GeneratedPalette): string {
  const colors: Array<[string, string]> = [
    ['Background', palette.background],
    ['Surface', '#ffffff'],
    ['Foreground', palette.foreground],
    ['Muted', palette.muted],
    ['Border', palette.border],
    ['Accent', palette.accent],
    ['Success', palette.success],
    ['Subtle', '#f4f1ec'],
  ];
  return renderHtmlDocument(
    title,
    `<main>
      <p class="eyebrow">${escapeHtml(title)}</p>
      <h1>${escapeHtml(title)}</h1>
      <div class="swatch-grid">${colors.map(([name, value]) => renderSwatch(name, value)).join('')}</div>
    </main>`,
    palette,
  );
}

function renderTypographyPreviewHtml(title: string): string {
  return renderHtmlDocument(
    'Typography Scale',
    `<main>
      <p class="eyebrow">Typography Scale</p>
      <div class="type-sample"><small>h1 - 40px/Bold</small><h1>${escapeHtml(title)}</h1></div>
      <div class="type-sample"><small>h2 - 32px/Bold</small><h2>Product Workspace</h2></div>
      <div class="type-sample"><small>h3 - 24px/Semibold</small><h3>Component Review</h3></div>
      <div class="type-sample"><small>body - 16px/Regular</small><p>Clear hierarchy, balanced density, and durable system defaults.</p></div>
    </main>`,
    normalizeSwatches(''),
  );
}

function renderSpacingPreviewHtml(title = 'Spacing and Radius'): string {
  const spaces = [4, 8, 12, 16, 24, 32, 40, 48];
  return renderHtmlDocument(
    title,
    `<main>
      <p class="eyebrow">${escapeHtml(title)}</p>
      <h1>${escapeHtml(title)}</h1>
      <div class="spacing-list">
        ${spaces.map((space) => `<div><code>space-${space / 4}</code><span>${space}px</span><b style="width:${space * 2}px"></b></div>`).join('')}
      </div>
      <h2>Border Radius</h2>
      <div class="radius-list"><span style="border-radius:6px">6px</span><span style="border-radius:10px">10px</span><span style="border-radius:16px">16px</span></div>
    </main>`,
    normalizeSwatches(''),
  );
}

function renderComponentCatalogHtml(
  title: string,
  systemTitle: string,
  summary: string,
  palette: GeneratedPalette,
): string {
  const isInputs = title.toLowerCase().includes('input');
  return renderHtmlDocument(
    title,
    `<main>
      <p class="eyebrow">${escapeHtml(title)}</p>
      <h1>${escapeHtml(systemTitle)}</h1>
      <p class="lead">${escapeHtml(summary)}</p>
      <section class="component-grid">
        ${isInputs
          ? `<label><span>Label</span><input value="Source-backed field" /></label><label><span>Search</span><input placeholder="Search components" /></label><textarea>Helpful multiline content.</textarea>`
          : `<button class="primary">Primary action</button><button>Secondary action</button><button class="ghost">Icon action</button>`}
      </section>
    </main>`,
    palette,
  );
}

function renderLogoPreviewHtml(title: string, palette: GeneratedPalette): string {
  return renderHtmlDocument(
    'Logo Variants',
    `<main>
      <p class="eyebrow">Logo Variants</p>
      <h1>${escapeHtml(title)}</h1>
      <div class="logo-frame">${renderLogoSvg(title, palette)}</div>
      <div class="logo-frame dark">${renderLogoSvg(title, { ...palette, background: palette.foreground, foreground: '#ffffff' })}</div>
    </main>`,
    palette,
  );
}

function renderComponentPreviewHtml(
  title: string,
  summary: string,
  palette: GeneratedPalette,
): string {
  const componentScripts = [
    ...defaultUiKitComponentSpecs().filter((spec) => spec.componentName !== 'App'),
    ...defaultUiKitComponentSpecs().filter((spec) => spec.componentName === 'App'),
  ].map((spec) => `  <script type="text/babel" src="components/${spec.fileName}"></script>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} Interface</title>
  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
  <link rel="stylesheet" href="../../colors_and_type.css" />
  <style>
    :root {
      color-scheme: light;
      --ui-kit-bg: ${palette.background};
      --ui-kit-surface: #fff;
      --ui-kit-fg: ${palette.foreground};
      --ui-kit-muted: ${palette.muted};
      --ui-kit-border: ${palette.border};
      --ui-kit-accent: ${palette.accent};
    }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--color-background, var(--ui-kit-bg));
      color: var(--color-text-1, var(--ui-kit-fg));
      font: 14px/1.5 var(--font-family, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    }
    #root { min-height: 100vh; }
    .ui-kit-loading {
      display: grid;
      min-height: 100vh;
      place-items: center;
      color: var(--color-text-secondary, var(--ui-kit-muted));
    }
  </style>
</head>
<body>
  <div id="root"><div class="ui-kit-loading">Loading ${escapeHtml(title)} UI kit...</div></div>
${componentScripts}
  <script type="text/babel">
    const App = window.App;
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App title={${scriptJson(title)}} summary={${scriptJson(summary)}} />);
  </script>
</body>
</html>
`;
}

function renderHtmlDocument(title: string, body: string, palette: GeneratedPalette): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: ${palette.background};
      --surface: #fff;
      --fg: ${palette.foreground};
      --muted: ${palette.muted};
      --border: ${palette.border};
      --accent: ${palette.accent};
    }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--fg); font: 16px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(960px, calc(100vw - 48px)); margin: 48px auto; }
    h1 { margin: 0 0 14px; font-size: 42px; line-height: 1.04; letter-spacing: 0; }
    h2 { margin: 32px 0 14px; font-size: 26px; }
    h3 { margin: 0; font-size: 20px; }
    p { color: var(--muted); }
    .lead { max-width: 680px; font-size: 19px; }
    .eyebrow { margin: 0 0 10px; color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .palette, .swatch-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 32px 0; }
    .swatch { min-height: 126px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); }
    .swatch b { display: block; height: 76px; background: var(--color); border-bottom: 1px solid var(--border); }
    .swatch span { display: block; padding: 10px 12px 2px; font-weight: 700; }
    .swatch code { display: block; padding: 0 12px 12px; color: var(--muted); }
    .section-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 0; list-style: none; }
    .section-list li, article { display: grid; gap: 6px; padding: 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
    .section-list span, article span { color: var(--muted); }
    .type-sample { border-bottom: 1px solid var(--border); padding: 26px 0; }
    .type-sample small { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .spacing-list { display: grid; gap: 16px; margin: 28px 0; }
    .spacing-list div { display: grid; grid-template-columns: 100px 60px 1fr; gap: 16px; align-items: center; }
    .spacing-list b { display: block; height: 22px; border-radius: 4px; background: var(--accent); }
    .radius-list { display: flex; gap: 16px; }
    .radius-list span { width: 96px; height: 72px; display: grid; place-items: center; background: var(--surface); border: 1px solid var(--border); }
    .logo-frame { padding: 34px; margin: 20px 0; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
    .logo-frame.dark { background: var(--fg); }
    .component-preview { display: grid; grid-template-columns: 240px 1fr; min-height: calc(100vh - 96px); background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
    .component-preview aside { display: grid; align-content: start; gap: 10px; padding: 20px; background: #f3f1ec; border-right: 1px solid var(--border); }
    button { border: 1px solid var(--border); background: var(--surface); color: var(--fg); border-radius: 7px; padding: 10px 14px; font-weight: 700; }
    button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .component-preview section { padding: 48px; }
    .component-row { display: flex; gap: 10px; margin: 24px 0; }
    .component-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 28px 0; }
    .component-grid label { display: grid; gap: 8px; color: var(--muted); font-size: 13px; }
    input, textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--border); background: var(--surface); color: var(--fg); border-radius: 7px; padding: 10px 12px; font: inherit; }
    textarea { min-height: 92px; resize: vertical; }
    @media (max-width: 760px) { .palette, .swatch-grid, .section-list, .component-preview, .component-grid { grid-template-columns: 1fr; } main { width: min(100vw - 28px, 960px); margin: 24px auto; } }
  </style>
</head>
<body>${body}</body>
</html>
`;
}

function renderSwatch(name: string, value: string): string {
  return `<div class="swatch" style="--color:${escapeHtml(value)}"><b></b><span>${escapeHtml(name)}</span><code>${escapeHtml(value)}</code></div>`;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scriptJson(raw: string): string {
  return JSON.stringify(raw)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function escapeTsxText(raw: string): string {
  return raw.replace(/[{}<>]/g, '');
}

function escapeJsString(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function readFileOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if (isAbsenceError(err)) return undefined;
    throw err;
  }
}

async function readManifestFileOptional(
  brandRoot: string,
  relativePath: string,
): Promise<string | undefined> {
  if (!isSafeManifestPath(relativePath)) return undefined;
  return readFileOptional(path.join(brandRoot, relativePath));
}

function isSafeManifestPath(relativePath: string): boolean {
  if (relativePath.trim().length === 0) return false;
  if (path.isAbsolute(relativePath)) return false;
  const parts = relativePath.split(/[\\/]+/);
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function isAbsenceError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

async function readProjectManifest(
  brandRoot: string,
  expectedId: string,
): Promise<DesignSystemProjectManifest | null> {
  let raw: string | undefined;
  try {
    raw = await readFileOptional(path.join(brandRoot, 'manifest.json'));
  } catch {
    return null;
  }
  if (raw === undefined) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isProjectManifest(parsed, expectedId)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isProjectManifest(value: unknown, expectedId: string): value is DesignSystemProjectManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 'od-design-system-project/v1') return false;
  if (record.id !== expectedId) return false;
  if (typeof record.name !== 'string' || record.name.trim().length === 0) return false;
  if (typeof record.category !== 'string' || record.category.trim().length === 0) return false;
  if (record.description !== undefined && typeof record.description !== 'string') return false;

  const files = record.files;
  if (typeof files !== 'object' || files === null || Array.isArray(files)) return false;
  const fileRecord = files as Record<string, unknown>;
  return (
    fileRecord.design === 'DESIGN.md' &&
    fileRecord.tokens === 'tokens.css' &&
    (fileRecord.designTokens === undefined || fileRecord.designTokens === 'design-tokens.json') &&
    (fileRecord.tailwind === undefined || fileRecord.tailwind === 'tailwind-v4.css') &&
    (fileRecord.components === undefined || fileRecord.components === 'components.html')
  );
}

function summarize(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const firstH1 = lines.findIndex((l) => /^#\s+/.test(l));
  if (firstH1 === -1) return '';
  const afterH1 = lines.slice(firstH1 + 1);
  const nextHeading = afterH1.findIndex((l) => /^#{1,6}\s+/.test(l));
  const window = (nextHeading === -1 ? afterH1 : afterH1.slice(0, nextHeading))
    .join('\n')
    // Drop blockquote metadata lines — they are surfaced separately.
    .replace(/^>\s*Category:.*$/gim, '')
    .replace(/^>\s*Surface:.*$/gim, '')
    .replace(/^>\s*/gm, '')
    .trim();
  return window.split(/\n\n/)[0]?.slice(0, 240) ?? '';
}

function extractCategory(raw: string): string | undefined {
  const m = /^>\s*Category:\s*(.+?)\s*$/im.exec(raw);
  return m?.[1];
}

const KNOWN_SURFACES = new Set<DesignSystemSurface>(['web', 'image', 'video', 'audio']);
const KNOWN_STATUSES = new Set<DesignSystemStatus>(['draft', 'published']);
const KNOWN_REVISION_STATUSES = new Set<DesignSystemRevisionStatus>([
  'pending',
  'accepted',
  'rejected',
]);
function extractSurface(raw: string): DesignSystemSurface | undefined {
  const m = /^>\s*Surface:\s*(.+?)\s*$/im.exec(raw);
  if (!m) return undefined;
  const v = m[1]?.trim().toLowerCase();
  return isDesignSystemSurface(v) ? v : undefined;
}

function isDesignSystemSurface(value: string | undefined): value is DesignSystemSurface {
  return value !== undefined && KNOWN_SURFACES.has(value as DesignSystemSurface);
}

function isDesignSystemStatus(value: string | undefined): value is DesignSystemStatus {
  return value !== undefined && KNOWN_STATUSES.has(value as DesignSystemStatus);
}

function isDesignSystemRevisionStatus(
  value: string | undefined,
): value is DesignSystemRevisionStatus {
  return value !== undefined && KNOWN_REVISION_STATUSES.has(value as DesignSystemRevisionStatus);
}

// Strip boilerplate like "Design System Inspired by Cohere" → "Cohere" so
// the picker dropdown reads cleanly. Hand-authored titles that don't match
// the pattern (e.g. "Neutral Modern") pass through unchanged.
function cleanTitle(raw: string): string {
  return raw
    .replace(/^Design System (Inspired by|for)\s+/i, '')
    .trim();
}

/**
 * Pull 4 representative colors from a DESIGN.md so the picker can render
 * a tiny swatch row next to each system. Order: [bg, support, fg, accent].
 *
 * The shape is deliberately compact — one accent + one background + one
 * fg + one supporting tone — so the row reads like a brand mark even at
 * thumbnail scale. Picked greedily by token-name hints (matches the
 * heuristics in preview.js so the strip and the showcase
 * agree on which colors the system "is").
 *
 * @param {string} raw  Markdown body of DESIGN.md
 * @returns {string[]}  Up to 4 hex strings; [] if extraction fails.
 */
function extractSwatches(raw: string): string[] {
  const colors: ColorToken[] = [];
  const seen = new Set<string>();
  function push(name: string, value: string): void {
    const cleanName = name.replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const v = normalizeHex(value);
    if (!v || cleanName.length > 60) return;
    const key = `${cleanName}|${v}`;
    if (seen.has(key)) return;
    seen.add(key);
    colors.push({ name: cleanName, value: v });
  }
  // Form A: "- **Background:** `#FAFAFA`" — the colon may sit inside the
  // bold markers (`**Name:**`) or outside them (`**Name**:`). Both variants
  // are common in hand-authored DESIGN.md files, so we allow the colon in
  // either position around the closing `**`.
  const reA = /^[\s>*-]*\**\s*([A-Za-z][A-Za-z0-9 /&()+_-]{1,40}?)\s*[:：]?\s*\**\s*[:：]?\s*`?(#[0-9a-fA-F]{3,8})/gm;
  let m;
  while ((m = reA.exec(raw)) !== null) push(m[1] ?? '', m[2] ?? '');
  // Form B: "**Stripe Purple** (`#533afd`)"
  const reB = /\*\*([A-Za-z][A-Za-z0-9 /&()+_-]{1,40}?)\*\*\s*\(?\s*`?(#[0-9a-fA-F]{3,8})/g;
  while ((m = reB.exec(raw)) !== null) push(m[1] ?? '', m[2] ?? '');
  // Form C: markdown table rows, e.g.
  //   | Window canvas | `--window-background` | `#1a1a1d` | base |
  // Use the first cell that holds a hex as the value, and the first plain
  // text cell (not the hex, not a `---` separator) as the name. Header and
  // separator rows carry no hex, so they are skipped. Form A/B run first, so
  // inline definitions still win in pickSwatchRow when a file mixes both.
  const reC = /^[ \t]*\|(.+)\|[ \t]*$/gm;
  while ((m = reC.exec(raw)) !== null) {
    const cells = (m[1] ?? '').split('|').map((cell) => cell.trim());
    const hexCell = cells.find((cell) => /#[0-9a-fA-F]{3,8}\b/.test(cell));
    if (!hexCell) continue;
    const hex = hexCell.match(/#[0-9a-fA-F]{3,8}/)?.[0] ?? '';
    const nameCell = cells.find(
      (cell) => cell.length > 0 && !/#[0-9a-fA-F]{3,8}/.test(cell) && !/^[-:\s]+$/.test(cell),
    );
    push(nameCell ?? '', hex);
  }
  // Form D: SwiftUI Color(...) declarations (HSB / RGB / white), converted to
  // hex. Swift repos define palette tokens in source rather than CSS, so a
  // captured ColorSystem.swift or a DESIGN.md that quotes it would otherwise
  // yield no swatches. Inline hex forms above still win in pickSwatchRow.
  for (const token of extractSwiftColors(raw)) push(token.name, token.hex);
  if (colors.length === 0) return [];
  return pickSwatchRow(colors).values;
}

function pickSwatchRow(colors: ColorToken[]): SwatchRow {
  function pick(hints: string[]): string | null {
    for (const h of hints) {
      const found = colors.find((c) => c.name.includes(h));
      if (found) return found.value;
    }
    return null;
  }
  function isNeutral(hex: string): boolean {
    if (!/^#[0-9a-f]{6}$/.test(hex)) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return Math.max(r, g, b) - Math.min(r, g, b) < 10;
  }

  const bgHit = pick(['page background', 'background', 'canvas', 'paper', 'surface']);
  const fgHit = pick(['heading', 'foreground', 'ink', 'fg', 'text', 'navy', 'graphite']);
  const accentHit = pick(['primary brand', 'brand primary', 'accent', 'brand', 'primary']);
  const supportHit = pick(['border', 'divider', 'rule', 'muted', 'secondary', 'subtle']);

  const bg = bgHit ?? '#ffffff';
  const fg = fgHit ?? '#111111';
  const accent =
    accentHit
    ?? colors.find((c) => !isNeutral(c.value))?.value
    ?? colors[0]?.value
    ?? '#888888';
  const support =
    supportHit
    ?? colors.find(
      (c) => isNeutral(c.value) && c.value !== bg && c.value !== fg,
    )?.value
    ?? '#cccccc';

  const filledAllSlots =
    bgHit !== null && fgHit !== null && accentHit !== null && supportHit !== null;
  return { values: [bg, support, fg, accent], filledAllSlots };
}

function normalizeHex(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(raw.trim());
  if (!m) return null;
  let hex = m[1] ?? '';
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  if (hex.length === 4) hex = hex.split('').map((c) => c + c).join('').slice(0, 8);
  return '#' + hex.toLowerCase();
}

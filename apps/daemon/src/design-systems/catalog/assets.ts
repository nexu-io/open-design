/** @module assets
 * Resolves and caches runtime assets (tokens.css, design-tokens.json, components.html, pull index) from a design system package directory.
 * `digestDesignSystemContext` produces a stable hash of all asset content for cache invalidation; `resolveDesignSystemAssets` is the primary entrypoint for the catalog and generation layers.
 */
import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  type ComponentsManifest,
  extractComponentsManifest,
  summarizeComponentsManifestForPrompt,
} from '@open-design/contracts';

import {
  isAbsenceError,
  isSafeManifestPath,
  readFileOptional,
  readManifestFileOptional,
  readProjectManifest,
  sanitizeRelativeFilePath,
  stripPrefixAndValidateId,
} from '../core/file-utils.js';
import type {
  DesignSystemAssets,
  DesignSystemPackageInfo,
  DesignSystemProjectManifest,
} from '../core/types.js';

const DESIGN_SYSTEM_ASSETS_CACHE_LIMIT = 128;
const designSystemAssetsCache = new Map<string, Promise<DesignSystemAssets> | DesignSystemAssets>();

/**
 * Clears the in-process asset cache. Only for use in tests — production callers
 * should let the fingerprint-keyed cache expire naturally.
 */
export function clearDesignSystemAssetsCacheForTests(): void {
  designSystemAssetsCache.clear();
}

/**
 * Returns `true` when the design-token asset channel is enabled.
 * The channel is disabled by setting `OD_DESIGN_TOKEN_CHANNEL=0` in the process
 * environment.
 *
 * @param env - Process environment to read (defaults to `process.env`).
 */
export function isDesignTokenChannelEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.OD_DESIGN_TOKEN_CHANNEL !== '0';
}

/**
 * Computes a stable SHA-256 digest string from all non-null/non-empty context
 * fields. Returns `null` when every field is blank (nothing to digest).
 *
 * Used to detect when design-system context has changed between runs.
 *
 * @param input - All design-system context fields that affect prompt generation.
 */
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

/**
 * @internal
 * Merges a raw `componentsManifestJson` string into the public `DesignSystemAssets`
 * shape, summarising the manifest for prompt consumption.
 */
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

/**
 * @internal
 * Parses and summarises a raw `components.manifest.json` string.
 * Returns `undefined` when the string is empty or the JSON is invalid.
 */
function summarizeComponentsManifestCache(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim().length === 0) return undefined;
  try {
    return summarizeComponentsManifestForPrompt(JSON.parse(raw) as ComponentsManifest);
  } catch {
    return undefined;
  }
}

/**
 * @internal
 * Derives a `components.manifest.json` summary from `fixtureHtml` when no
 * pre-built manifest is present.
 */
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

/**
 * Builds the agent-facing pull-file index string from a `manifest.json`
 * declaration. Lists preview pages, asset directories, fonts, source files,
 * and derived token files.
 *
 * @param manifest - Parsed design-system manifest, or `null` to return `undefined`.
 * @returns A formatted bullet list, or `undefined` when there is nothing to list.
 */
export function buildDesignSystemPullIndex(
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

/**
 * Builds the set of relative file paths that are permitted by the manifest's
 * pull-file declaration. Expands the `assets/` directory recursively and
 * resolves any snippet index entries.
 *
 * @param brandRoot - Absolute path to the design-system directory.
 * @param manifest - Parsed manifest whose declarations define the allowlist.
 * @returns `Set<string>` of POSIX-normalised relative paths.
 */
export async function buildDesignSystemPullFileAllowlist(
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

/**
 * @internal
 * Recursively adds all files under a declared directory to the pull-file allowlist.
 * Hidden files and directories are skipped.
 */
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

/**
 * @internal
 * Parses a snippets index JSON file and adds individual snippet file paths to
 * the allowlist (only paths under `source/snippets/` are permitted).
 */
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

/**
 * @internal
 * Reads and JSON-parses a manifest-declared file. Returns `undefined` when the
 * path is absent, empty, or contains invalid JSON.
 */
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

/**
 * Returns `true` when `value` is a valid `tokenContract.grade` string.
 *
 * @param value - String to check.
 */
export function isTokenContractGrade(
  value: string,
): value is 'excellent' | 'usable' | 'needs-review' | 'needs-rebuild' {
  return value === 'excellent' || value === 'usable' || value === 'needs-review' || value === 'needs-rebuild';
}

/**
 * Extracts a typed `tokenContract` summary from a raw token-contract report
 * object. Returns `undefined` when the input does not match the expected shape.
 *
 * @param report - Parsed `source/report.json` content.
 */
export function summarizeTokenContractReport(
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

/**
 * Reads and aggregates source-evidence metadata for a design system (scanned
 * file count, token count, snippet count, quality grade, and evidence excerpt).
 *
 * @param brandRoot - Absolute path to the design-system directory.
 * @param manifest - Parsed manifest declaring source-file paths.
 * @returns A `sourceEvidence` object, or `undefined` when no evidence is found.
 */
export async function readDesignSystemSourceEvidence(
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

/**
 * Reads runtime assets for a single design system: USAGE.md, tokens CSS,
 * fixture HTML, and components manifest. Merges into a `DesignSystemAssets`
 * result with a derived pull index and craft directives.
 *
 * @param root - Absolute path to the design-systems root directory.
 * @param id - Design-system identifier (prefix stripped automatically).
 */
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

/**
 * @internal
 * Reads assets from both the built-in and user-installed roots, preferring the
 * built-in asset when both are present, and falling back to user-installed for
 * fields the built-in root omits.
 */
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

/**
 * @internal
 * Evicts the oldest cache entry when the cache exceeds `DESIGN_SYSTEM_ASSETS_CACHE_LIMIT`.
 */
function pruneDesignSystemAssetsCache(): void {
  while (designSystemAssetsCache.size > DESIGN_SYSTEM_ASSETS_CACHE_LIMIT) {
    const oldest = designSystemAssetsCache.keys().next().value;
    if (oldest === undefined) return;
    designSystemAssetsCache.delete(oldest);
  }
}

/**
 * @internal
 * Returns a lightweight fingerprint object for a single file, used to detect
 * whether the cache key for a design system's assets has become stale.
 */
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

/**
 * @internal
 * Computes a fingerprint for all manifest-declared asset files under one root.
 */
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

/**
 * @internal
 * Produces a SHA-256 cache key that captures the `OD_DESIGN_TOKEN_CHANNEL` flag
 * and all asset file fingerprints for both roots.
 */
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

/**
 * Resolves the runtime assets for a design system from `builtInRoot` and
 * `userInstalledRoot`, caching the result by a fingerprint of all asset files.
 * Returns an empty `DesignSystemAssets` when the design-token channel is disabled.
 *
 * @param designSystemId - Design-system identifier.
 * @param builtInRoot - Absolute path to the built-in design-systems directory.
 * @param userInstalledRoot - Absolute path to the user-installed directory.
 * @param env - Process environment (defaults to `process.env`).
 */
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

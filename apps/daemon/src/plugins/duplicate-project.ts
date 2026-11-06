import { copyFile, lstat, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  InstalledPluginRecord,
  ProjectMetadata,
} from '@open-design/contracts';
import { load } from 'cheerio';
import { ensureProject } from '../projects.js';

const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_COPY_BYTES = 160 * 1024 * 1024;
const MAX_COPY_FILES = 3000;

const EXCLUDED_DIR_NAMES = new Set([
  '.claude-plugin',
  '.git',
  'node_modules',
]);

const EXCLUDED_FILE_NAMES = new Set([
  '.DS_Store',
  'open-design.json',
  'SKILL.md',
]);

interface PluginExampleOutputLike {
  path?: unknown;
}

interface DuplicateEntry {
  sourceRel: string;
  contentPath: string;
  html: string;
}

interface CopyState {
  copiedFiles: number;
  copiedBytes: number;
  skippedFiles: number;
  warnings: string[];
}

interface CopyOptions {
  skipSourcePath?: string;
}

export interface DuplicatePluginExampleInput {
  plugin: InstalledPluginRecord;
  projectsRoot: string;
  projectId: string;
  metadata: ProjectMetadata;
  assembleExample: (templateHtml: string, slidesHtml: string, title: string) => string;
}

export interface DuplicatePluginExampleResult {
  relPath: 'index.html';
  sourceEntry: string;
  copiedFiles: number;
  skippedFiles: number;
  warnings: string[];
}

export class PluginDuplicateProjectError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'PluginDuplicateProjectError';
    this.status = status;
    this.code = code;
  }
}

export async function duplicatePluginExampleIntoProject(
  input: DuplicatePluginExampleInput,
): Promise<DuplicatePluginExampleResult> {
  const pluginRoot = path.resolve(input.plugin.fsPath);
  const entry = await resolveDuplicateEntry(input.plugin, input.assembleExample);
  if (!entry) {
    throw new PluginDuplicateProjectError(
      404,
      'NO_DUPLICABLE_PREVIEW',
      'This plugin does not expose an HTML preview or example that can be duplicated.',
    );
  }

  const copyRoot = copyRootForEntry(pluginRoot, entry.contentPath);
  validateDuplicateLocalAssetReferences({
    pluginRoot,
    copyRoot,
    contentPath: entry.contentPath,
    html: entry.html,
  });

  const projectRoot = await ensureProject(input.projectsRoot, input.projectId, input.metadata);
  const entryBytes = Buffer.byteLength(entry.html, 'utf8');
  const state: CopyState = {
    copiedFiles: 1,
    copiedBytes: entryBytes,
    skippedFiles: 0,
    warnings: [],
  };
  const skipSourcePath = path.basename(entry.contentPath).toLowerCase() === 'index.html'
    ? path.resolve(entry.contentPath)
    : null;

  await copyDirectoryContents(copyRoot, projectRoot, state, skipSourcePath ? { skipSourcePath } : {});
  await writeFile(path.join(projectRoot, 'index.html'), entry.html, 'utf8');

  return {
    relPath: 'index.html',
    sourceEntry: entry.sourceRel,
    copiedFiles: state.copiedFiles,
    skippedFiles: state.skippedFiles,
    warnings: state.warnings,
  };
}

async function resolveDuplicateEntry(
  plugin: InstalledPluginRecord,
  assembleExample: DuplicatePluginExampleInput['assembleExample'],
): Promise<DuplicateEntry | null> {
  const pluginRoot = path.resolve(plugin.fsPath);
  const candidates = collectPluginPreviewCandidates(plugin);
  const resolved = await resolveFirstDuplicateEntry(plugin, pluginRoot, candidates, assembleExample);
  if (resolved) return resolved;

  const discovered = await discoverPluginHtmlAssets(pluginRoot);
  const seen = new Set(candidates);
  const fallbackCandidates = discovered.filter((rel) => {
    if (seen.has(rel)) return false;
    seen.add(rel);
    return true;
  });
  return resolveFirstDuplicateEntry(plugin, pluginRoot, fallbackCandidates, assembleExample);
}

function collectPluginPreviewCandidates(plugin: InstalledPluginRecord): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (rel: unknown) => {
    if (typeof rel !== 'string') return;
    const normalized = normalizeRelativePath(rel);
    if (!normalized || !/\.html?$/i.test(normalized) || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };
  const od = plugin.manifest?.od ?? {};
  push(od.preview?.entry);
  const assets = Array.isArray(od.context?.assets) ? od.context.assets : [];
  for (const asset of assets) push(asset);
  const exampleOutputs = Array.isArray(od.useCase?.exampleOutputs)
    ? od.useCase.exampleOutputs as PluginExampleOutputLike[]
    : [];
  for (const example of exampleOutputs) push(example.path);
  for (const fallback of [
    'preview/index.html',
    'index.html',
    'examples/index.html',
    'assets/index.html',
    'assets/preview.html',
    'assets/example.html',
    'assets/example-slides.html',
    'assets/template.html',
    'public/index.html',
    'dist/index.html',
  ]) {
    push(fallback);
  }
  return candidates;
}

async function discoverPluginHtmlAssets(pluginRoot: string): Promise<string[]> {
  const dirs = ['', 'assets', 'public', 'dist', 'examples', 'preview', 'templates'];
  const found: string[] = [];
  for (const dir of dirs) {
    const abs = path.resolve(pluginRoot, dir);
    try {
      const entries = await readdir(abs, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !/\.html?$/i.test(entry.name)) continue;
        found.push(dir ? `${dir}/${entry.name}` : entry.name);
      }
    } catch {
      // Optional preview directories are absent for most plugins.
    }
  }
  return found;
}

async function resolveFirstDuplicateEntry(
  plugin: InstalledPluginRecord,
  pluginRoot: string,
  candidates: string[],
  assembleExample: DuplicatePluginExampleInput['assembleExample'],
): Promise<DuplicateEntry | null> {
  const resolvedFiles = new Map<string, { rel: string; full: string } | null>();
  const resolveFile = (rel: string) => resolvePluginFile(pluginRoot, rel, resolvedFiles);
  for (const candidate of candidates) {
    const resolved = await resolveFile(candidate);
    if (!resolved) continue;
    let sourceRel = resolved.rel;
    let contentPath = resolved.full;
    let html = await readFile(resolved.full, 'utf8');

    const shellTarget = iframeOnlyHtmlShellTarget(html);
    if (shellTarget) {
      const targetFull = path.resolve(path.dirname(resolved.full), shellTarget);
      const targetRel = normalizeRelativePath(path.relative(pluginRoot, targetFull));
      if (targetRel) {
        const target = await resolveFile(targetRel);
        if (target) {
          sourceRel = target.rel;
          contentPath = target.full;
          html = await readFile(target.full, 'utf8');
        }
      }
    }

    if (/(^|\/)example-slides\.html$/i.test(sourceRel)) {
      const templateRel = sourceRel.replace(/(^|\/)example-slides\.html$/i, '$1template.html');
      const template = await resolveFile(templateRel);
      if (template) {
        const title = plugin.title || plugin.manifest?.title || plugin.id;
        const templateHtml = await readFile(template.full, 'utf8');
        html = assembleExample(templateHtml, html, title);
        sourceRel = template.rel;
        contentPath = template.full;
      }
    }

    return { sourceRel, contentPath, html };
  }

  return null;
}

async function resolvePluginFile(
  pluginRoot: string,
  rel: string,
  cache?: Map<string, { rel: string; full: string } | null>,
): Promise<{ rel: string; full: string } | null> {
  const normalized = normalizeRelativePath(rel);
  if (!normalized) return null;
  if (cache?.has(normalized)) return cache.get(normalized) ?? null;
  const full = path.resolve(pluginRoot, ...normalized.split('/'));
  const cacheAndReturn = (value: { rel: string; full: string } | null) => {
    cache?.set(normalized, value);
    return value;
  };
  if (!isInsidePath(pluginRoot, full)) return cacheAndReturn(null);
  if (!(await pathHasNoSymlinks(pluginRoot, full))) return cacheAndReturn(null);
  try {
    const entryStat = await stat(full);
    if (!entryStat.isFile() || entryStat.size > MAX_ENTRY_BYTES) return cacheAndReturn(null);
    return cacheAndReturn({ rel: normalized, full });
  } catch {
    return cacheAndReturn(null);
  }
}

async function pathHasNoSymlinks(root: string, target: string): Promise<boolean> {
  const rel = path.relative(root, target);
  const segments = rel.split(path.sep).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function normalizeRelativePath(rel: string): string | null {
  if (!rel || rel.includes('\0')) return null;
  const withSlashes = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (withSlashes.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(withSlashes)) return null;
  const normalized = path.posix.normalize(withSlashes);
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    path.posix.isAbsolute(normalized)
  ) {
    return null;
  }
  return normalized;
}

function iframeOnlyHtmlShellTarget(html: string): string | null {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (!bodyMatch) return null;
  const body = (bodyMatch[1] ?? '').replace(/<!--[\s\S]*?-->/g, '').trim();
  const iframeMatch = /^<iframe\b[^>]*\bsrc\s*=\s*(['"])([^'"]+)\1[^>]*>\s*(?:<\/iframe>)?\s*$/i.exec(body);
  if (!iframeMatch) return null;
  const src = (iframeMatch[2] ?? '').trim();
  if (
    !src ||
    src.startsWith('/') ||
    src.startsWith('//') ||
    src.includes('\0') ||
    /^[a-z][a-z0-9+.-]*:/i.test(src)
  ) {
    return null;
  }
  const pathOnly = src.split(/[?#]/)[0] ?? '';
  return /\.html?$/i.test(pathOnly) ? pathOnly : null;
}

function copyRootForEntry(pluginRoot: string, contentPath: string): string {
  const entryDir = path.dirname(contentPath);
  return entryDir === pluginRoot ? pluginRoot : entryDir;
}

function validateDuplicateLocalAssetReferences({
  pluginRoot,
  copyRoot,
  contentPath,
  html,
}: {
  pluginRoot: string;
  copyRoot: string;
  contentPath: string;
  html: string;
}): void {
  const unsafe = new Set<string>();
  const sourceDir = path.dirname(contentPath);
  for (const ref of collectHtmlLocalAssetReferences(html)) {
    const pathOnly = localReferencePath(ref);
    if (!pathOnly) continue;
    const target = path.resolve(sourceDir, pathOnly);
    if (isInsidePath(copyRoot, target)) continue;
    const targetLabel = isInsidePath(pluginRoot, target)
      ? normalizeRelativePath(path.relative(pluginRoot, target)) ?? path.relative(pluginRoot, target)
      : ref;
    unsafe.add(targetLabel);
  }
  if (unsafe.size === 0) return;
  const examples = Array.from(unsafe).slice(0, 4).join(', ');
  throw new PluginDuplicateProjectError(
    422,
    'UNSUPPORTED_DUPLICATE_DEPENDENCIES',
    `This plugin example references local files outside the duplicated directory: ${examples}`,
  );
}

function collectHtmlLocalAssetReferences(html: string): string[] {
  const refs = new Set<string>();
  const $ = load(html);
  $('[src]').each((_, el) => pushRef(refs, $(el).attr('src')));
  $('[poster]').each((_, el) => pushRef(refs, $(el).attr('poster')));
  $('object[data]').each((_, el) => pushRef(refs, $(el).attr('data')));
  $('link[href]').each((_, el) => pushRef(refs, $(el).attr('href')));
  $('[srcset]').each((_, el) => {
    for (const entry of parseSrcset($(el).attr('srcset'))) pushRef(refs, entry);
  });
  $('[style]').each((_, el) => {
    for (const entry of extractCssUrls($(el).attr('style') ?? '')) pushRef(refs, entry);
  });
  $('style').each((_, el) => {
    for (const entry of extractCssUrls($(el).html() ?? '')) pushRef(refs, entry);
  });
  return Array.from(refs);
}

function pushRef(refs: Set<string>, value: string | undefined): void {
  const trimmed = value?.trim();
  if (trimmed) refs.add(trimmed);
}

function parseSrcset(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean);
}

function extractCssUrls(css: string): string[] {
  const refs: string[] = [];
  const pattern = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;
  for (const match of css.matchAll(pattern)) {
    const value = match[1] ?? match[2] ?? match[3] ?? '';
    if (value.trim()) refs.push(value.trim());
  }
  return refs;
}

function localReferencePath(value: string): string | null {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\0') ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
  ) {
    return null;
  }
  const pathOnly = trimmed.split(/[?#]/)[0]?.trim() ?? '';
  return pathOnly && pathOnly !== '.' ? pathOnly : null;
}

async function copyDirectoryContents(
  sourceDir: string,
  destDir: string,
  state: CopyState,
  options: CopyOptions,
): Promise<void> {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  await mkdir(destDir, { recursive: true });
  for (const entry of entries) {
    if (shouldSkipEntry(entry.name, entry.isDirectory())) {
      state.skippedFiles += 1;
      continue;
    }
    const source = path.join(sourceDir, entry.name);
    const destination = path.join(destDir, entry.name);
    if (options.skipSourcePath && path.resolve(source) === options.skipSourcePath) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      throwIncompleteDuplicate('symbolic links are not supported', path.relative(sourceDir, source) || entry.name);
    }
    if (entry.isDirectory()) {
      await copyDirectoryContents(source, destination, state, options);
      continue;
    }
    if (!entry.isFile()) {
      throwIncompleteDuplicate('special files are not supported', path.relative(sourceDir, source) || entry.name);
    }
    if (state.copiedFiles >= MAX_COPY_FILES) {
      throwIncompleteDuplicate('duplicate file limit would skip required files', path.relative(sourceDir, source) || entry.name);
    }
    const sourceInfo = await stat(source);
    if (state.copiedBytes + sourceInfo.size > MAX_COPY_BYTES) {
      throwIncompleteDuplicate('duplicate size limit would skip a required file', path.relative(sourceDir, source) || entry.name);
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    state.copiedFiles += 1;
    state.copiedBytes += sourceInfo.size;
  }
}

function throwIncompleteDuplicate(reason: string, relPath: string): never {
  throw new PluginDuplicateProjectError(
    422,
    'DUPLICATE_COPY_INCOMPLETE',
    `This plugin example cannot be duplicated completely: ${reason} (${relPath}).`,
  );
}

function shouldSkipEntry(name: string, isDirectory: boolean): boolean {
  return isDirectory ? EXCLUDED_DIR_NAMES.has(name) : EXCLUDED_FILE_NAMES.has(name);
}

function isInsidePath(root: string, candidate: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalizedCandidate = path.resolve(candidate);
  if (normalizedCandidate === normalizedRoot) return true;
  const rootWithSep = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : `${normalizedRoot}${path.sep}`;
  return normalizedCandidate.startsWith(rootWithSep);
}

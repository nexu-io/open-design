import { createHash } from 'node:crypto';
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { load } from 'cheerio';
import type { SiteOutputMode, SiteOutputPolicyResult } from '@open-design/contracts';

import { assertAndFetchExternalAsset } from '../connectionTest.js';

const INTERNAL_NAMES = new Set([
  '.git', '.od', '.od-skills', '.tmp', '.cache', '.next', '.turbo',
  'node_modules', 'dist', 'build',
]);
const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);
const REMOTE_PROTOCOL = /^(?:https?:)?\/\//i;
const DATA_URL = /^data:/i;
const EMPTY_IMAGE = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"><path fill="transparent" d="M0 0h1v1H0z"/></svg>',
).toString('base64');
const EMPTY_IMAGE_DATA_URL = `data:image/svg+xml;base64,${EMPTY_IMAGE}`;
const MAX_SITE_FILES = 1_000;
const MAX_SITE_FILE_BYTES = 20 * 1024 * 1024;
const MAX_SITE_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_REMOTE_RESOURCE_BYTES = 5 * 1024 * 1024;

type EnforceOptions = {
  dataRoot: string;
  mode: SiteOutputMode;
  projectRoot: string;
  runId: string;
  entryFile?: string | null;
};

type TransformContext = {
  repaired: boolean;
  warnings: string[];
};

type FileRecord = {
  absolutePath: string;
  relativePath: string;
  size: number;
};

function isVisibleName(name: string): boolean {
  return !name.startsWith('.') && !INTERNAL_NAMES.has(name);
}

function normalizeRelative(value: string): string {
  return value.split(path.sep).join('/').replace(/^\.\//, '');
}

function isRemoteReference(value: string): boolean {
  return REMOTE_PROTOCOL.test(value.trim());
}

function referenceForWarning(value: string): string {
  if (!isRemoteReference(value)) return value;
  try {
    const parsed = new URL(value.startsWith('//') ? `https:${value}` : value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '[invalid remote URL]';
  }
}

function stripReferenceSuffix(value: string): string {
  return value.split(/[?#]/, 1)[0] ?? value;
}

function resolveLocalReference(root: string, fromFile: string, reference: string): string | null {
  const raw = stripReferenceSuffix(reference.trim());
  if (!raw || raw.startsWith('#') || DATA_URL.test(raw) || isRemoteReference(raw)) return null;
  const absolute = raw.startsWith('/')
    ? path.resolve(root, `.${decodeURIComponent(raw)}`)
    : path.resolve(path.dirname(fromFile), decodeURIComponent(raw));
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return absolute;
}

function mimeForFile(filePath: string): string {
  switch (path.extname(stripReferenceSuffix(filePath)).toLowerCase()) {
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.avif': return 'image/avif';
    case '.ico': return 'image/x-icon';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    case '.ttf': return 'font/ttf';
    case '.otf': return 'font/otf';
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.mp4': return 'video/mp4';
    case '.webm': return 'video/webm';
    case '.json': return 'application/json';
    default: return 'application/octet-stream';
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function collectVisibleFiles(root: string, relativeDir = ''): Promise<FileRecord[]> {
  const current = path.join(root, relativeDir);
  if (!await pathExists(current)) return [];
  const result: FileRecord[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (!isVisibleName(entry.name)) continue;
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(root, relativePath);
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`site output contains unsupported symbolic link: ${normalizeRelative(relativePath)}`);
    }
    if (stats.isDirectory()) {
      result.push(...await collectVisibleFiles(root, relativePath));
    } else if (stats.isFile()) {
      result.push({ absolutePath, relativePath: normalizeRelative(relativePath), size: stats.size });
    }
  }
  return result;
}

async function copyVisibleTree(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  if (!await pathExists(source)) return;
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (!isVisibleName(entry.name)) continue;
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    const stats = await lstat(sourcePath);
    if (stats.isSymbolicLink()) throw new Error(`site output contains unsupported symbolic link: ${entry.name}`);
    if (stats.isDirectory()) {
      await copyVisibleTree(sourcePath, destinationPath);
    } else if (stats.isFile()) {
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await cp(sourcePath, destinationPath, { force: true });
    }
  }
}

async function removeVisibleEntries(root: string): Promise<void> {
  if (!await pathExists(root)) return;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!isVisibleName(entry.name)) continue;
    await rm(path.join(root, entry.name), { force: true, recursive: true });
  }
}

function assertBoundedFileSet(files: FileRecord[]): void {
  if (files.length > MAX_SITE_FILES) throw new Error(`site output exceeds ${MAX_SITE_FILES} visible files`);
  let total = 0;
  for (const file of files) {
    if (file.size > MAX_SITE_FILE_BYTES) throw new Error(`site output file is too large: ${file.relativePath}`);
    total += file.size;
    if (total > MAX_SITE_TOTAL_BYTES) throw new Error('site output exceeds the total size limit');
  }
}

function chooseEntry(files: FileRecord[], preferred?: string | null): FileRecord {
  const html = files.filter((file) => HTML_EXTENSIONS.has(path.extname(file.relativePath).toLowerCase()));
  const normalizedPreferred = preferred ? normalizeRelative(preferred).toLowerCase() : null;
  const entry = (normalizedPreferred
    ? html.find((file) => file.relativePath.toLowerCase() === normalizedPreferred)
    : undefined)
    ?? html.find((file) => file.relativePath.toLowerCase() === 'index.html')
    ?? html[0];
  if (!entry) throw new Error('site output policy requires at least one generated HTML file');
  return entry;
}

async function replaceAsync(
  input: string,
  expression: RegExp,
  replacement: (...matches: string[]) => Promise<string>,
): Promise<string> {
  const matches = [...input.matchAll(expression)];
  let output = input;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    if (!match) continue;
    if (match.index == null) continue;
    const next = await replacement(...match.map((part) => part ?? ''));
    output = output.slice(0, match.index) + next + output.slice(match.index + match[0].length);
  }
  return output;
}

async function inlineLocalFileAsDataUrl(
  root: string,
  fromFile: string,
  reference: string,
  context: TransformContext,
): Promise<string> {
  if (DATA_URL.test(reference)) return reference;
  if (isRemoteReference(reference)) {
    try {
      const localized = await fetchRemoteResource(reference);
      context.repaired = true;
      context.warnings.push(`localized remote resource: ${referenceForWarning(reference)}`);
      return `data:${localized.mime};base64,${localized.data.toString('base64')}`;
    } catch {
      context.repaired = true;
      context.warnings.push(`replaced remote resource with a local placeholder: ${referenceForWarning(reference)}`);
      return EMPTY_IMAGE_DATA_URL;
    }
  }
  const localPath = resolveLocalReference(root, fromFile, reference);
  if (localPath == null || !await pathExists(localPath)) {
    context.repaired = true;
    context.warnings.push(`replaced missing resource with a local placeholder: ${reference}`);
    return EMPTY_IMAGE_DATA_URL;
  }
  const data = await readFile(localPath);
  context.repaired = true;
  return `data:${mimeForFile(localPath)};base64,${data.toString('base64')}`;
}

async function fetchRemoteResource(reference: string): Promise<{ data: Buffer; mime: string }> {
  const response = await assertAndFetchExternalAsset(reference, {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_RESOURCE_BYTES) {
    throw new Error('resource exceeds size limit');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('resource body is unavailable');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_REMOTE_RESOURCE_BYTES) {
      await reader.cancel();
      throw new Error('resource exceeds size limit');
    }
    chunks.push(value);
  }
  const data = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  const mime = response.headers.get('content-type')?.split(';', 1)[0]?.trim()
    || mimeForFile(new URL(reference).pathname);
  if (!/^(?:image|font|audio|video)\//i.test(mime) && mime !== 'application/octet-stream') {
    throw new Error(`unsupported resource content type: ${mime}`);
  }
  return { data, mime };
}

async function inlineCss(
  root: string,
  cssPath: string,
  context: TransformContext,
  seen = new Set<string>(),
): Promise<string> {
  const canonical = path.resolve(cssPath);
  if (seen.has(canonical)) return '';
  seen.add(canonical);
  let css = await readFile(canonical, 'utf8');
  css = await replaceAsync(css, /@import\s+(?:url\()?\s*(["']?)([^"')\s;]+)\1\s*\)?\s*;/gi, async (_all, _quote, reference) => {
    if (isRemoteReference(reference)) {
      context.repaired = true;
      context.warnings.push(`removed remote CSS import: ${referenceForWarning(reference)}`);
      return '';
    }
    const localPath = resolveLocalReference(root, canonical, reference);
    if (localPath == null || !await pathExists(localPath)) {
      context.repaired = true;
      context.warnings.push(`removed missing CSS import: ${reference}`);
      return '';
    }
    context.repaired = true;
    return inlineCss(root, localPath, context, seen);
  });
  return replaceAsync(css, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async (all, _quote, reference) => {
    const trimmed = reference.trim();
    if (!trimmed || trimmed.startsWith('#') || DATA_URL.test(trimmed)) return all;
    return `url("${await inlineLocalFileAsDataUrl(root, canonical, trimmed, context)}")`;
  });
}

async function inlineJavaScriptModule(
  root: string,
  scriptPath: string,
  context: TransformContext,
  seen = new Set<string>(),
): Promise<string> {
  const canonical = path.resolve(scriptPath);
  if (seen.has(canonical)) return '';
  seen.add(canonical);
  const source = await readFile(canonical, 'utf8');
  return rewriteJavaScriptImports(root, source, canonical, context, seen);
}

async function rewriteJavaScriptImports(
  root: string,
  input: string,
  fromFile: string,
  context: TransformContext,
  seen = new Set<string>(),
): Promise<string> {
  let source = input;
  const expression = /((?:import|export)\s+(?:[^'";]*?\s+from\s*)?|import\s*\()(["'])([^"']+)\2/g;
  source = await replaceAsync(source, expression, async (all, prefix, quote, reference) => {
    if (isRemoteReference(reference)) {
      context.repaired = true;
      context.warnings.push(`removed remote JavaScript module dependency: ${referenceForWarning(reference)}`);
      return prefix.startsWith('import(') ? 'Promise.reject(new Error("remote module removed"))' : '';
    }
    if (!reference.startsWith('.') && !reference.startsWith('/')) {
      context.repaired = true;
      context.warnings.push(`removed unresolved package import from browser output: ${reference}`);
      return prefix.startsWith('import(') ? 'Promise.reject(new Error("package module removed"))' : '';
    }
    const localPath = resolveLocalReference(root, fromFile, reference);
    if (localPath == null || !await pathExists(localPath)) {
      context.repaired = true;
      context.warnings.push(`removed missing JavaScript module dependency: ${reference}`);
      return prefix.startsWith('import(') ? 'Promise.reject(new Error("module removed"))' : '';
    }
    const nested = await inlineJavaScriptModule(root, localPath, context, new Set(seen));
    const dataUrl = `data:text/javascript;base64,${Buffer.from(nested).toString('base64')}`;
    context.repaired = true;
    return `${prefix}${quote}${dataUrl}${quote}`;
  });
  return source;
}

async function transformSingleHtml(
  sourceRoot: string,
  outputRoot: string,
  context: TransformContext,
  preferredEntry?: string | null,
): Promise<void> {
  const files = await collectVisibleFiles(sourceRoot);
  const entry = chooseEntry(files, preferredEntry);
  const html = await readFile(entry.absolutePath, 'utf8');
  const $ = load(html);
  const originalInlineScripts = $('script:not([src])').toArray();

  for (const element of $('link[rel~="stylesheet"][href]').toArray()) {
    const reference = $(element).attr('href') ?? '';
    if (isRemoteReference(reference)) {
      context.repaired = true;
      context.warnings.push(`removed remote stylesheet: ${referenceForWarning(reference)}`);
      $(element).remove();
      continue;
    }
    const localPath = resolveLocalReference(sourceRoot, entry.absolutePath, reference);
    if (localPath == null || !await pathExists(localPath)) {
      context.repaired = true;
      context.warnings.push(`removed missing stylesheet: ${reference}`);
      $(element).remove();
      continue;
    }
    $(element).replaceWith(`<style>${await inlineCss(sourceRoot, localPath, context)}</style>`);
    context.repaired = true;
  }

  for (const element of $('script[src]').toArray()) {
    const reference = $(element).attr('src') ?? '';
    if (isRemoteReference(reference)) {
      context.repaired = true;
      context.warnings.push(`removed remote script: ${referenceForWarning(reference)}`);
      $(element).remove();
      continue;
    }
    const localPath = resolveLocalReference(sourceRoot, entry.absolutePath, reference);
    if (localPath == null || !await pathExists(localPath)) {
      context.repaired = true;
      context.warnings.push(`removed missing script: ${reference}`);
      $(element).remove();
      continue;
    }
    $(element).removeAttr('src').text(await inlineJavaScriptModule(sourceRoot, localPath, context));
    context.repaired = true;
  }
  for (const element of originalInlineScripts) {
    const source = $(element).html() ?? '';
    if (!source.trim()) continue;
    $(element).text(await rewriteJavaScriptImports(
      sourceRoot,
      source,
      entry.absolutePath,
      context,
      new Set([path.resolve(entry.absolutePath)]),
    ));
  }

  for (const element of $('[style]').toArray()) {
    const value = $(element).attr('style') ?? '';
    $(element).attr('style', await replaceAsync(value, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async (all, _q, ref) => {
      if (DATA_URL.test(ref) || ref.startsWith('#')) return all;
      return `url("${await inlineLocalFileAsDataUrl(sourceRoot, entry.absolutePath, ref, context)}")`;
    }));
  }
  for (const element of $('style').toArray()) {
    const css = $(element).html() ?? '';
    const virtualPath = path.join(path.dirname(entry.absolutePath), '__inline.css');
    const rewritten = await replaceAsync(css, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async (all, _q, ref) => {
      if (DATA_URL.test(ref) || ref.startsWith('#')) return all;
      return `url("${await inlineLocalFileAsDataUrl(sourceRoot, virtualPath, ref, context)}")`;
    });
    $(element).html(rewritten);
  }

  const resourceAttributes: Array<[string, string]> = [
    ['img[src]', 'src'], ['source[src]', 'src'], ['video[poster]', 'poster'],
    ['audio[src]', 'src'], ['video[src]', 'src'], ['input[type="image"][src]', 'src'],
    ['link[rel~="icon"][href]', 'href'], ['image[href]', 'href'], ['image[xlink\\:href]', 'xlink:href'],
  ];
  for (const [selector, attribute] of resourceAttributes) {
    for (const element of $(selector).toArray()) {
      const reference = $(element).attr(attribute);
      if (!reference || DATA_URL.test(reference)) continue;
      $(element).attr(attribute, await inlineLocalFileAsDataUrl(sourceRoot, entry.absolutePath, reference, context));
    }
  }
  for (const element of $('[srcset]').toArray()) {
    const candidates = ($(element).attr('srcset') ?? '').split(',').map((part) => part.trim()).filter(Boolean);
    const rewritten: string[] = [];
    for (const candidate of candidates) {
      const [reference, descriptor] = candidate.split(/\s+/, 2);
      if (!reference) continue;
      rewritten.push(`${await inlineLocalFileAsDataUrl(sourceRoot, entry.absolutePath, reference, context)}${descriptor ? ` ${descriptor}` : ''}`);
    }
    $(element).attr('srcset', rewritten.join(', '));
  }
  for (const element of $('iframe[src], object[data], embed[src]').toArray()) {
    context.repaired = true;
    context.warnings.push('removed embedded external document from single-file output');
    $(element).remove();
  }

  await mkdir(outputRoot, { recursive: true });
  await writeFile(path.join(outputRoot, 'index.html'), $.html(), 'utf8');
  if (entry.relativePath !== 'index.html' || files.length !== 1) context.repaired = true;
  const omittedPages = files.filter((file) => HTML_EXTENSIONS.has(path.extname(file.relativePath).toLowerCase()) && file.relativePath !== entry.relativePath);
  if (omittedPages.length > 0) context.warnings.push(`omitted additional pages in single-html mode: ${omittedPages.map((file) => file.relativePath).join(', ')}`);
}

function uniqueName(preferred: string, used: Set<string>): string {
  const parsed = path.parse(preferred);
  let candidate = preferred;
  let counter = 1;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${parsed.name}-${counter}${parsed.ext}`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function decodeDataUrl(value: string): { data: Buffer; extension: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(value);
  if (!match) return null;
  const mime = (match[1] ?? 'application/octet-stream').toLowerCase();
  const payload = match[3] ?? '';
  const data = match[2] ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload));
  const extension = mime.includes('svg') ? '.svg'
    : mime.includes('png') ? '.png'
      : mime.includes('jpeg') ? '.jpg'
        : mime.includes('gif') ? '.gif'
          : mime.includes('webp') ? '.webp'
            : mime.includes('woff2') ? '.woff2'
              : mime.includes('woff') ? '.woff'
                : '.bin';
  return { data, extension };
}

async function selectCanonicalSource(
  files: FileRecord[],
  canonicalName: 'styles.css' | 'script.js',
  referencedPaths: string[],
): Promise<{ primary: FileRecord | null; emptyAliases: Set<string> }> {
  const ordered = [...files].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const byPath = new Map(ordered.map((file) => [file.relativePath.toLowerCase(), file]));
  const content = new Map<string, boolean>();
  for (const file of ordered) {
    content.set(file.relativePath, (await readFile(file.absolutePath, 'utf8')).trim().length > 0);
  }
  const nonEmpty = (file: FileRecord | undefined): file is FileRecord => Boolean(file && content.get(file.relativePath));
  const canonical = byPath.get(canonicalName);
  const referenced = referencedPaths.flatMap((relativePath) => {
    const file = byPath.get(relativePath.toLowerCase());
    return file ? [file] : [];
  });
  const primary = (nonEmpty(canonical) ? canonical : undefined)
    ?? referenced.find(nonEmpty)
    ?? ordered.find(nonEmpty)
    ?? canonical
    ?? referenced[0]
    ?? ordered[0]
    ?? null;
  const emptyAliases = new Set(
    ordered
      .filter((file) => file.relativePath !== primary?.relativePath && !content.get(file.relativePath))
      .map((file) => file.relativePath),
  );
  return { primary, emptyAliases };
}

async function transformMultiFile(
  sourceRoot: string,
  outputRoot: string,
  context: TransformContext,
  preferredEntry?: string | null,
): Promise<void> {
  const files = await collectVisibleFiles(sourceRoot);
  const entry = chooseEntry(files, preferredEntry);
  const entryDocument = load(await readFile(entry.absolutePath, 'utf8'));
  const referencedRelativePath = (reference: string): string | null => {
    const localPath = resolveLocalReference(sourceRoot, entry.absolutePath, reference);
    return localPath ? normalizeRelative(path.relative(sourceRoot, localPath)) : null;
  };
  const referencedCss = entryDocument('link[rel~="stylesheet"][href]').toArray().flatMap((element) => {
    const relativePath = referencedRelativePath(entryDocument(element).attr('href') ?? '');
    return relativePath ? [relativePath] : [];
  });
  const referencedJs = entryDocument('script[src]').toArray().flatMap((element) => {
    const relativePath = referencedRelativePath(entryDocument(element).attr('src') ?? '');
    return relativePath ? [relativePath] : [];
  });
  const cssFiles = files.filter((file) => path.extname(file.relativePath).toLowerCase() === '.css');
  const jsFiles = files.filter((file) => SCRIPT_EXTENSIONS.has(path.extname(file.relativePath).toLowerCase()));
  const cssSelection = await selectCanonicalSource(cssFiles, 'styles.css', referencedCss);
  const jsSelection = await selectCanonicalSource(jsFiles, 'script.js', referencedJs);
  const omittedSources = new Set([...cssSelection.emptyAliases, ...jsSelection.emptyAliases]);
  const used = new Set<string>(['index.html', 'styles.css', 'script.js']);
  const mapping = new Map<string, string>();
  for (const file of files) {
    const extension = path.extname(file.relativePath).toLowerCase();
    let target: string;
    if (file.relativePath === entry.relativePath) target = 'index.html';
    else if (HTML_EXTENSIONS.has(extension)) target = uniqueName(path.basename(file.relativePath, extension) + '.html', used);
    else if (extension === '.css') {
      target = file.relativePath === cssSelection.primary?.relativePath || cssSelection.emptyAliases.has(file.relativePath)
        ? 'styles.css'
        : uniqueName(path.basename(file.relativePath), used);
    } else if (SCRIPT_EXTENSIONS.has(extension)) {
      target = file.relativePath === jsSelection.primary?.relativePath || jsSelection.emptyAliases.has(file.relativePath)
        ? 'script.js'
        : uniqueName(path.basename(file.relativePath, extension) + '.js', used);
    } else {
      const parsed = path.parse(file.relativePath);
      const digest = createHash('sha256').update(await readFile(file.absolutePath)).digest('hex').slice(0, 10);
      const preferred = path.basename(file.relativePath);
      const candidate = used.has(preferred.toLowerCase()) ? `${parsed.name}-${digest}${parsed.ext}` : preferred;
      target = `assets/${uniqueName(candidate, used)}`;
    }
    mapping.set(file.relativePath, target);
    if (target !== file.relativePath) context.repaired = true;
  }

  await mkdir(path.join(outputRoot, 'assets'), { recursive: true });
  let collectedCss = '';
  let collectedJs = '';
  let primaryCss = '';
  let primaryJs = '';
  let assetCounter = 0;

  const writeDataAsset = async (value: string): Promise<string> => {
    const decoded = decodeDataUrl(value);
    const data = decoded?.data ?? Buffer.from(EMPTY_IMAGE, 'base64');
    const extension = decoded?.extension ?? '.svg';
    const name = `embedded-${++assetCounter}-${createHash('sha1').update(data).digest('hex').slice(0, 8)}${extension}`;
    await writeFile(path.join(outputRoot, 'assets', name), data);
    context.repaired = true;
    return `assets/${name}`;
  };

  const mappedLocalReference = (from: FileRecord, reference: string): string | null => {
    const localPath = resolveLocalReference(sourceRoot, from.absolutePath, reference);
    if (localPath == null) return null;
    const oldRelative = normalizeRelative(path.relative(sourceRoot, localPath));
    return mapping.get(oldRelative) ?? null;
  };

  const localSourceRelativePath = (from: FileRecord, reference: string): string | null => {
    const localPath = resolveLocalReference(sourceRoot, from.absolutePath, reference);
    return localPath ? normalizeRelative(path.relative(sourceRoot, localPath)) : null;
  };

  const rewriteReference = async (from: FileRecord, reference: string, resource: boolean): Promise<string> => {
    if (!reference || reference.startsWith('#')) return reference;
    if (DATA_URL.test(reference)) return writeDataAsset(reference);
    if (isRemoteReference(reference)) {
      if (!resource) return reference;
      context.warnings.push(`replaced remote runtime resource with a local placeholder: ${referenceForWarning(reference)}`);
      return writeDataAsset(EMPTY_IMAGE_DATA_URL);
    }
    const mapped = mappedLocalReference(from, reference);
    if (mapped) return mapped;
    if (resource) {
      context.warnings.push(`replaced missing runtime resource with a local placeholder: ${reference}`);
      return writeDataAsset(EMPTY_IMAGE_DATA_URL);
    }
    return reference;
  };

  for (const file of files) {
    if (omittedSources.has(file.relativePath)) continue;
    const target = mapping.get(file.relativePath)!;
    const extension = path.extname(file.relativePath).toLowerCase();
    if (HTML_EXTENSIONS.has(extension)) {
      const $ = load(await readFile(file.absolutePath, 'utf8'));
      for (const element of $('style').toArray()) {
        const styleSource = $(element).html() ?? '';
        collectedCss += `\n${await replaceAsync(styleSource, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async (all, _q, reference) => {
          if (reference.startsWith('#')) return all;
          return `url("${await rewriteReference(file, reference, true)}")`;
        })}`;
        $(element).remove();
        context.repaired = true;
      }
      for (const element of $('[style]').toArray()) {
        const style = $(element).attr('style');
        if (!style) continue;
        const marker = `od-inline-${createHash('sha1').update(`${file.relativePath}:${style}:${collectedCss.length}`).digest('hex').slice(0, 10)}`;
        $(element).addClass(marker).removeAttr('style');
        const rewrittenStyle = await replaceAsync(style, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async (all, _q, reference) => {
          if (reference.startsWith('#')) return all;
          return `url("${await rewriteReference(file, reference, true)}")`;
        });
        collectedCss += `\n.${marker}{${rewrittenStyle}}`;
        context.repaired = true;
      }
      for (const element of $('link[rel~="stylesheet"][href]').toArray()) {
        const reference = $(element).attr('href') ?? '';
        if (isRemoteReference(reference)) {
          $(element).remove();
          context.warnings.push(`removed remote stylesheet: ${referenceForWarning(reference)}`);
          context.repaired = true;
        } else {
          const mapped = mappedLocalReference(file, reference);
          if (!mapped) {
            $(element).remove();
            context.warnings.push(`removed missing stylesheet: ${reference}`);
            context.repaired = true;
          } else {
            $(element).attr('href', mapped);
          }
        }
      }
      for (const element of $('script').toArray()) {
        const source = $(element).attr('src');
        if (source) {
          if (isRemoteReference(source)) {
            $(element).remove();
            context.warnings.push(`removed remote script: ${referenceForWarning(source)}`);
            context.repaired = true;
          } else {
            const mapped = mappedLocalReference(file, source);
            if (!mapped) {
              $(element).remove();
              context.warnings.push(`removed missing script: ${source}`);
              context.repaired = true;
            } else {
              $(element).attr('src', mapped);
            }
          }
        } else if (($(element).html() ?? '').trim()) {
          collectedJs += `\n${$(element).html() ?? ''}`;
          $(element).remove();
          context.repaired = true;
        }
      }
      const resources: Array<[string, string]> = [
        ['img[src]', 'src'], ['source[src]', 'src'], ['video[poster]', 'poster'],
        ['audio[src]', 'src'], ['video[src]', 'src'], ['link[rel~="icon"][href]', 'href'],
      ];
      for (const [selector, attribute] of resources) {
        for (const element of $(selector).toArray()) {
          $(element).attr(attribute, await rewriteReference(file, $(element).attr(attribute) ?? '', true));
        }
      }
      for (const element of $('a[href]').toArray()) {
        $(element).attr('href', await rewriteReference(file, $(element).attr('href') ?? '', false));
      }
      for (const element of $('[srcset]').toArray()) {
        const candidates = ($(element).attr('srcset') ?? '').split(',').map((part) => part.trim()).filter(Boolean);
        const rewritten: string[] = [];
        for (const candidate of candidates) {
          const [reference, descriptor] = candidate.split(/\s+/, 2);
          if (!reference) continue;
          rewritten.push(`${await rewriteReference(file, reference, true)}${descriptor ? ` ${descriptor}` : ''}`);
        }
        $(element).attr('srcset', rewritten.join(', '));
      }
      if ($('link[rel~="stylesheet"][href="styles.css"]').length === 0) $('head').append('<link rel="stylesheet" href="styles.css">');
      if ($('script[src="script.js"]').length === 0) $('body').append('<script src="script.js"></script>');
      const dedupeReferences = (selector: string, attribute: string) => {
        const seen = new Set<string>();
        for (const element of $(selector).toArray()) {
          const reference = $(element).attr(attribute) ?? '';
          if (!reference || !seen.has(reference)) {
            if (reference) seen.add(reference);
            continue;
          }
          $(element).remove();
          context.repaired = true;
        }
      };
      dedupeReferences('link[rel~="stylesheet"][href]', 'href');
      dedupeReferences('script[src]', 'src');
      await mkdir(path.dirname(path.join(outputRoot, target)), { recursive: true });
      await writeFile(path.join(outputRoot, target), $.html(), 'utf8');
    } else if (extension === '.css') {
      let css = await readFile(file.absolutePath, 'utf8');
      css = await replaceAsync(css, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async (all, _q, reference) => {
        if (reference.startsWith('#')) return all;
        return `url("${await rewriteReference(file, reference, true)}")`;
      });
      css = css.replace(/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\/[^;]+;/gi, (value) => {
        context.warnings.push(`removed remote CSS import: ${value}`);
        context.repaired = true;
        return '';
      });
      css = await replaceAsync(css, /@import\s+(?:url\()?\s*(["']?)([^"')\s;]+)\1\s*\)?\s*;/gi, async (all, _quote, reference) => {
        if (isRemoteReference(reference)) return all;
        const sourceRelativePath = localSourceRelativePath(file, reference);
        if (sourceRelativePath && omittedSources.has(sourceRelativePath)) {
          context.repaired = true;
          return '';
        }
        const rewritten = mappedLocalReference(file, reference);
        if (!rewritten) {
          context.warnings.push(`removed missing CSS import: ${reference}`);
          context.repaired = true;
          return '';
        }
        return `@import "${rewritten}";`;
      });
      if (file.relativePath === cssSelection.primary?.relativePath) primaryCss = css;
      else await writeFile(path.join(outputRoot, target), css, 'utf8');
    } else if (SCRIPT_EXTENSIONS.has(extension)) {
      let js = await readFile(file.absolutePath, 'utf8');
      js = await replaceAsync(js, /((?:import|export)\s+(?:[^'";]*?\s+from\s*)?|import\s*\()(["'])([^"']+)\2/g, async (all, prefix, quote, reference) => {
        if (isRemoteReference(reference) || (!reference.startsWith('.') && !reference.startsWith('/'))) {
          context.warnings.push(`removed unresolved JavaScript module dependency: ${reference}`);
          context.repaired = true;
          return prefix.startsWith('import(') ? 'Promise.reject(new Error("module removed"))' : '';
        }
        const sourceRelativePath = localSourceRelativePath(file, reference);
        if (sourceRelativePath && omittedSources.has(sourceRelativePath)) {
          context.repaired = true;
          return prefix.startsWith('import(') ? 'Promise.resolve({})' : '';
        }
        const rewritten = mappedLocalReference(file, reference);
        if (!rewritten) {
          context.warnings.push(`removed missing JavaScript module dependency: ${reference}`);
          context.repaired = true;
          return prefix.startsWith('import(') ? 'Promise.reject(new Error("module removed"))' : '';
        }
        return `${prefix}${quote}${rewritten}${quote}`;
      });
      if (file.relativePath === jsSelection.primary?.relativePath) primaryJs = js;
      else await writeFile(path.join(outputRoot, target), js, 'utf8');
    } else {
      await mkdir(path.dirname(path.join(outputRoot, target)), { recursive: true });
      await cp(file.absolutePath, path.join(outputRoot, target), { force: true });
    }
  }
  await writeFile(
    path.join(outputRoot, 'styles.css'),
    [primaryCss, collectedCss].filter((part) => part.trim()).join('\n'),
    'utf8',
  );
  await writeFile(
    path.join(outputRoot, 'script.js'),
    [primaryJs, collectedJs].filter((part) => part.trim()).join('\n'),
    'utf8',
  );
}

function collectRuntimeReferences($: ReturnType<typeof load>): string[] {
  const references: string[] = [];
  const selectors: Array<[string, string]> = [
    ['link[rel~="stylesheet"][href]', 'href'], ['script[src]', 'src'], ['img[src]', 'src'],
    ['source[src]', 'src'], ['video[poster]', 'poster'], ['audio[src]', 'src'], ['video[src]', 'src'],
    ['link[rel~="icon"][href]', 'href'], ['iframe[src]', 'src'], ['object[data]', 'data'], ['embed[src]', 'src'],
  ];
  for (const [selector, attribute] of selectors) {
    for (const element of $(selector).toArray()) references.push($(element).attr(attribute) ?? '');
  }
  for (const element of $('[srcset]').toArray()) {
    for (const candidate of ($(element).attr('srcset') ?? '').split(',')) {
      const reference = candidate.trim().split(/\s+/, 1)[0];
      if (reference) references.push(reference);
    }
  }
  return references;
}

function validateDataResource(reference: string): boolean {
  if (!/^data:[^;,]+(?:;[^,]*)?,/i.test(reference)) return false;
  try {
    const decoded = decodeDataUrl(reference);
    return decoded !== null && decoded.data.byteLength <= MAX_SITE_FILE_BYTES;
  } catch {
    return false;
  }
}

async function localReferenceExists(root: string, fromFile: string, reference: string): Promise<boolean> {
  if (!reference || reference.startsWith('#') || isRemoteReference(reference) || DATA_URL.test(reference)) return false;
  if (reference.startsWith('/')) return false;
  const target = path.resolve(path.dirname(fromFile), stripReferenceSuffix(reference));
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  return pathExists(target);
}

export async function validateSiteOutput(root: string, mode: SiteOutputMode): Promise<void> {
  const files = await collectVisibleFiles(root);
  assertBoundedFileSet(files);
  const fail = (message: string): never => { throw new Error(`site output validation failed (${mode}): ${message}`); };
  if (mode === 'single-html') {
    if (files.length !== 1 || files[0]?.relativePath !== 'index.html') fail('expected exactly one visible file named index.html');
    const $ = load(await readFile(path.join(root, 'index.html'), 'utf8'));
    if ($('link[rel~="stylesheet"][href], script[src], iframe[src], object[data], embed[src]').length > 0) {
      fail('external or file-based runtime elements remain in index.html');
    }
    for (const reference of collectRuntimeReferences($)) {
      if (reference && DATA_URL.test(reference) && !validateDataResource(reference)) fail('invalid embedded data resource remains');
      if (reference && !DATA_URL.test(reference) && !reference.startsWith('#')) fail(`non-embedded runtime reference remains: ${reference}`);
    }
    const source = $.html();
    if (/(?:import|export)\s+[^;]*?from\s*["'](?!data:)|import\s*\(\s*["'](?!data:)/.test(source)) {
      fail('non-embedded JavaScript module dependency remains');
    }
    for (const match of source.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) {
      const reference = (match[2] ?? '').trim();
      if (DATA_URL.test(reference) && !validateDataResource(reference)) fail('invalid embedded CSS data resource remains');
      if (reference && !DATA_URL.test(reference) && !reference.startsWith('#')) {
        fail('non-embedded CSS resource remains');
      }
    }
    return;
  }

  const rootEntries = await readdir(root, { withFileTypes: true });
  const visibleEntries = rootEntries.filter((entry) => isVisibleName(entry.name));
  for (const entry of visibleEntries) {
    if (entry.isDirectory() && entry.name !== 'assets') fail(`unexpected visible directory: ${entry.name}`);
    if (entry.isFile()) {
      const extension = path.extname(entry.name).toLowerCase();
      if (!HTML_EXTENSIONS.has(extension) && extension !== '.css' && !SCRIPT_EXTENSIONS.has(extension)) {
        fail(`unexpected visible root file: ${entry.name}`);
      }
    }
  }
  if (!await pathExists(path.join(root, 'index.html'))) fail('index.html is missing');
  const cssFiles = files.filter((file) => path.extname(file.relativePath).toLowerCase() === '.css');
  const jsFiles = files.filter((file) => SCRIPT_EXTENSIONS.has(path.extname(file.relativePath).toLowerCase()));
  if (!await pathExists(path.join(root, 'styles.css'))) fail('styles.css is missing');
  if (!await pathExists(path.join(root, 'script.js'))) fail('script.js is missing');
  if (!visibleEntries.some((entry) => entry.isDirectory() && entry.name === 'assets')) fail('assets directory is missing');
  for (const file of files.filter((item) => HTML_EXTENSIONS.has(path.extname(item.relativePath).toLowerCase()))) {
    const $ = load(await readFile(file.absolutePath, 'utf8'));
    if ($('style').length > 0 || $('[style]').length > 0 || $('script:not([src])').filter((_i, element) => Boolean($(element).html()?.trim())).length > 0) {
      fail(`inline CSS or JavaScript remains in ${file.relativePath}`);
    }
    for (const reference of collectRuntimeReferences($)) {
      if (isRemoteReference(reference) || DATA_URL.test(reference)) fail(`non-local runtime reference remains in ${file.relativePath}: ${reference}`);
      if (!reference || reference.startsWith('#')) continue;
      if (!await localReferenceExists(root, file.absolutePath, reference)) {
        fail(`missing, traversing, or root-absolute runtime file referenced by ${file.relativePath}: ${reference}`);
      }
    }
  }
  for (const file of cssFiles) {
    const source = await readFile(file.absolutePath, 'utf8');
    for (const match of source.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)) {
      const reference = (match[2] ?? '').trim();
      if (!reference || reference.startsWith('#')) continue;
      if (isRemoteReference(reference) || DATA_URL.test(reference) || !await localReferenceExists(root, file.absolutePath, reference)) {
        fail(`invalid CSS runtime dependency remains in ${file.relativePath}: ${reference}`);
      }
    }
    for (const match of source.matchAll(/@import\s+(?:url\()?\s*(["']?)([^"')\s;]+)\1/gi)) {
      const reference = (match[2] ?? '').trim();
      if (!await localReferenceExists(root, file.absolutePath, reference)) {
        fail(`invalid CSS import remains in ${file.relativePath}: ${reference}`);
      }
    }
  }
  for (const file of jsFiles) {
    const source = await readFile(file.absolutePath, 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s+(?:[^'";]*?\s+from\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']/g)) {
      const reference = (match[1] ?? match[2] ?? '').trim();
      if (!await localReferenceExists(root, file.absolutePath, reference)) {
        fail(`invalid JavaScript module dependency remains in ${file.relativePath}: ${reference}`);
      }
    }
  }
}

export async function enforceSiteOutputPolicy(options: EnforceOptions): Promise<SiteOutputPolicyResult> {
  const projectRoot = path.resolve(options.projectRoot);
  const dataRoot = path.resolve(options.dataRoot);
  const transactionRoot = path.join(dataRoot, 'site-output-transactions', options.runId);
  const relativeTransaction = path.relative(dataRoot, transactionRoot);
  if (relativeTransaction.startsWith('..') || path.isAbsolute(relativeTransaction)) {
    throw new Error('refusing to create site output transaction outside daemon data root');
  }
  const backupRoot = path.join(transactionRoot, 'backup');
  const sourceRoot = path.join(transactionRoot, 'source');
  const outputRoot = path.join(transactionRoot, 'output');
  await rm(transactionRoot, { force: true, recursive: true });
  await mkdir(transactionRoot, { recursive: true });
  const context: TransformContext = { repaired: false, warnings: [] };
  try {
    const initialFiles = await collectVisibleFiles(projectRoot);
    assertBoundedFileSet(initialFiles);
    await copyVisibleTree(projectRoot, backupRoot);
    await copyVisibleTree(projectRoot, sourceRoot);
    if (options.mode === 'single-html') await transformSingleHtml(sourceRoot, outputRoot, context, options.entryFile);
    else await transformMultiFile(sourceRoot, outputRoot, context, options.entryFile);
    await validateSiteOutput(outputRoot, options.mode);

    try {
      await removeVisibleEntries(projectRoot);
      await copyVisibleTree(outputRoot, projectRoot);
      await validateSiteOutput(projectRoot, options.mode);
    } catch (error) {
      try {
        await removeVisibleEntries(projectRoot);
        await copyVisibleTree(backupRoot, projectRoot);
      } catch (restoreError) {
        console.error('[site-output] failed to restore project after commit failure', restoreError);
        throw new AggregateError([error, restoreError], 'site output commit and rollback both failed');
      }
      throw error;
    }
    return {
      entryFile: 'index.html',
      mode: options.mode,
      repaired: context.repaired,
      validation: 'passed',
      warnings: [...new Set(context.warnings)],
    };
  } finally {
    await rm(transactionRoot, { force: true, recursive: true }).catch(() => undefined);
  }
}

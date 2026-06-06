import type { ProjectUiSurface } from '../types';

const EDITABLE_SNAPSHOT_DIR = 'design-snapshots';
const EDITABLE_SNAPSHOT_VIEWPORT_WIDTH_ATTR = 'data-od-snapshot-width';
const MIN_STYLED_SNAPSHOT_DESCENDANT_RATIO = 0.45;
const MIN_RICH_STYLED_SNAPSHOT_DESCENDANTS = 4;
const MIN_SNAPSHOT_VIEWPORT_WIDTH = 320;
const MIN_DESKTOP_SNAPSHOT_VIEWPORT_WIDTH = 768;
const MAX_SNAPSHOT_VIEWPORT_WIDTH = 10_000;
const PROJECT_PUBLIC_DIR = 'public';
const PROJECT_RESOURCE_FILE_EXTENSION_RE = /\.(?:avif|bmp|css|eot|gif|ico|jpe?g|m4a|m4v|mov|mp3|mp4|oga|ogg|ogv|otf|png|svg|ttf|wav|webm|webp|woff2?)$/iu;
const CSS_FONT_FACE_RULE_TYPE = 5;
const SNAPSHOT_STYLE_PROPERTIES = [
  'background',
  'background-color',
  'background-image',
  'background-position',
  'background-repeat',
  'background-size',
  'border',
  'border-color',
  'border-radius',
  'border-style',
  'border-width',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'box-shadow',
  'box-sizing',
  'color',
  'color-scheme',
  'column-gap',
  'display',
  'fill',
  'flex',
  'flex-basis',
  'flex-direction',
  'flex-grow',
  'flex-shrink',
  'flex-wrap',
  'font',
  'font-family',
  'font-size',
  'font-weight',
  'gap',
  'grid-auto-columns',
  'grid-auto-flow',
  'grid-auto-rows',
  'grid-template-columns',
  'grid-template-rows',
  'height',
  'inset',
  'justify-content',
  'align-content',
  'justify-items',
  'align-items',
  'letter-spacing',
  'line-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'max-height',
  'max-width',
  'min-height',
  'min-width',
  'object-fit',
  'object-position',
  'opacity',
  'outline',
  'outline-color',
  'outline-offset',
  'outline-style',
  'outline-width',
  'overflow',
  'overflow-x',
  'overflow-y',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'position',
  'right',
  'row-gap',
  'stroke',
  'stroke-width',
  'text-align',
  'text-decoration',
  'text-transform',
  'text-rendering',
  'top',
  'transform',
  'vertical-align',
  'visibility',
  'white-space',
  'width',
  'z-index',
  '-webkit-font-smoothing',
] as const;

export interface EditableSnapshotBuildOptions {
  baseUrl?: string | null;
  projectId?: string | null;
  projectFileNames?: readonly string[] | null;
}

type ResourceUrlRebaser = (value: string) => string | null;

interface ProjectFileLookup {
  exact: Map<string, string>;
  suffix: Map<string, string>;
}

type SnapshotStyledElement = HTMLElement | SVGElement;

export function editableSnapshotFileName(surface: ProjectUiSurface): string {
  const slug = slugifySnapshotName(surface.id)
    || slugifySnapshotName(surface.label)
    || slugifySnapshotName(surface.route ?? '')
    || slugifySnapshotName(surface.entryFile)
    || 'screen';
  return `${EDITABLE_SNAPSHOT_DIR}/${slug}.html`;
}

export function nextEditableSnapshotFileName(
  baseFileName: string,
  existingFileNames: Iterable<string>,
): string {
  const existing = new Set(existingFileNames);
  if (!existing.has(baseFileName)) return baseFileName;

  const lastSlashIndex = baseFileName.lastIndexOf('/');
  const lastDotIndex = baseFileName.lastIndexOf('.');
  const extensionIndex = lastDotIndex > lastSlashIndex ? lastDotIndex : baseFileName.length;
  const stem = baseFileName.slice(0, extensionIndex);
  const extension = baseFileName.slice(extensionIndex);
  let revision = 2;

  while (existing.has(`${stem}-${revision}${extension}`)) {
    revision += 1;
  }

  return `${stem}-${revision}${extension}`;
}

export function latestEditableSnapshotFileName(
  baseFileName: string,
  existingFileNames: Iterable<string>,
): string | null {
  let latestFileName: string | null = null;
  let latestRevision = 0;

  for (const existingFileName of existingFileNames) {
    const revision = editableSnapshotRevisionNumber(baseFileName, existingFileName);
    if (revision === null || revision <= latestRevision) continue;
    latestFileName = existingFileName;
    latestRevision = revision;
  }

  return latestFileName;
}

export function isEditableSnapshotRevisionFileName(
  baseFileName: string,
  candidateFileName: string,
): boolean {
  return editableSnapshotRevisionNumber(baseFileName, candidateFileName) !== null;
}

export function buildEditableSnapshotHtml(
  document: Document,
  surface: ProjectUiSurface,
  options: EditableSnapshotBuildOptions = {},
): string | null {
  if (!document.documentElement || !document.body) return null;
  const bodyText = document.body.textContent?.trim() ?? '';
  if (document.body.children.length === 0 && bodyText.length === 0) return null;
  if (hasOnlyEmptyAppMount(document.body)) return null;
  if (isRejectedEditableSnapshotDocument(document, bodyText)) return null;

  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  inlineComputedStyles(document, clone);
  syncResolvedResourceUrls(document, clone);
  rebaseSnapshotResourceUrls(document, clone, surface, options);
  syncFormState(document, clone);
  normalizeSnapshotMediaPlayback(clone);
  normalizeFrozenSnapshotState(document, clone);
  pruneRuntimeOnlyNodes(clone);
  prepareSnapshotHead(document, clone, surface);

  clone.setAttribute('data-od-editable-snapshot', 'true');
  clone.setAttribute('data-od-surface-id', surface.id || surface.entryFile);
  const documentViewportWidth = snapshotDocumentViewportWidth(document);
  const viewportWidth = documentViewportWidth
    ?? snapshotCapturedViewportWidthFromRoot(clone)
    ?? inferSnapshotViewportWidthFromRoot(clone);
  if (viewportWidth) clone.setAttribute(EDITABLE_SNAPSHOT_VIEWPORT_WIDTH_ATTR, String(viewportWidth));

  return `<!doctype html>\n${clone.outerHTML}`;
}

export function buildEditableSnapshotHtmlFromMarkup(
  html: string | null,
  surface: ProjectUiSurface,
  options: EditableSnapshotBuildOptions = {},
): string | null {
  if (!html || typeof DOMParser === 'undefined') return null;
  const document = new DOMParser().parseFromString(html, 'text/html');
  return buildEditableSnapshotHtml(document, surface, options);
}

export function editableSnapshotViewportWidth(html: string | null): number | null {
  if (!html || !html.includes('data-od-editable-snapshot="true"')) return null;
  const explicitWidth = parseSnapshotViewportWidth(
    html.match(new RegExp(`\\b${EDITABLE_SNAPSHOT_VIEWPORT_WIDTH_ATTR}=["']([^"']+)["']`, 'iu'))?.[1],
  );
  if (typeof DOMParser !== 'undefined') {
    const snapshotDocument = new DOMParser().parseFromString(html, 'text/html');
    const root = snapshotDocument.documentElement;
    if (root) {
      const inferredWidth = resolvedSnapshotViewportWidthFromRoot(root, explicitWidth);
      if (inferredWidth !== null) return inferredWidth;
    }
  }
  if (explicitWidth !== null) return explicitWidth;
  return inferSnapshotViewportWidthFromHtml(html);
}

export function normalizeEditableSnapshotPreviewHtml(html: string | null): string | null {
  if (!html || !html.includes('data-od-editable-snapshot="true"') || typeof DOMParser === 'undefined') return html;
  const snapshotDocument = new DOMParser().parseFromString(html, 'text/html');
  const root = snapshotDocument.documentElement;
  if (!root) return html;

  const explicitViewportWidth = explicitSnapshotViewportWidth(root);
  const viewportWidth = resolvedSnapshotViewportWidthFromRoot(root, explicitViewportWidth);
  let changed = false;
  if (viewportWidth && viewportWidth !== explicitViewportWidth) {
    root.setAttribute(EDITABLE_SNAPSHOT_VIEWPORT_WIDTH_ATTR, String(viewportWidth));
    changed = true;
  }
  changed = normalizeSnapshotMediaPlayback(root) || changed;
  return changed ? `<!doctype html>\n${root.outerHTML}` : html;
}

export function isRejectedEditableSnapshotHtml(html: string | null): boolean {
  if (!html) return false;
  if (!html.includes('data-od-editable-snapshot="true"')) return false;
  return (
    rejectedSnapshotText(html) ||
    !hasGeneratedInlineStyles(html) ||
    hasCopiedContentSecurityPolicy(html) ||
    hasEmptyAppMountSnapshot(html)
  );
}

export function isReusableEditableSnapshotHtml(html: string | null): boolean {
  if (!html) return false;
  if (!html.includes('data-od-editable-snapshot="true"')) return false;
  return !isRejectedEditableSnapshotHtml(html);
}

export function repairEditableSnapshotResourceUrls(
  html: string | null,
  surface: ProjectUiSurface,
  options: EditableSnapshotBuildOptions = {},
): string | null {
  if (!html || !isReusableEditableSnapshotHtml(html) || typeof DOMParser === 'undefined') return html;
  const snapshotDocument = new DOMParser().parseFromString(html, 'text/html');
  const root = snapshotDocument.documentElement;
  if (!root) return html;
  let didRepair = normalizeSnapshotMediaPlayback(root);
  const explicitViewportWidth = explicitSnapshotViewportWidth(root);
  const viewportWidth = resolvedSnapshotViewportWidthFromRoot(root, explicitViewportWidth);
  if (viewportWidth && viewportWidth !== explicitViewportWidth) {
    root.setAttribute(EDITABLE_SNAPSHOT_VIEWPORT_WIDTH_ATTR, String(viewportWidth));
    didRepair = true;
  }
  const rebaseUrl = createProjectResourceUrlRebaser(snapshotDocument, surface, options);
  if (!rebaseUrl) return didRepair ? `<!doctype html>\n${root.outerHTML}` : html;

  const trackRepair: ResourceUrlRebaser = (value) => {
    const repaired = rebaseUrl(value);
    if (repaired && repaired !== value) didRepair = true;
    return repaired;
  };
  rebaseSnapshotElementResourceUrls(root, trackRepair);
  return didRepair ? `<!doctype html>\n${root.outerHTML}` : html;
}

function slugifySnapshotName(value: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function editableSnapshotRevisionNumber(
  baseFileName: string,
  candidateFileName: string,
): number | null {
  if (candidateFileName === baseFileName) return 1;
  const lastSlashIndex = baseFileName.lastIndexOf('/');
  const lastDotIndex = baseFileName.lastIndexOf('.');
  const extensionIndex = lastDotIndex > lastSlashIndex ? lastDotIndex : baseFileName.length;
  const stem = baseFileName.slice(0, extensionIndex);
  const extension = baseFileName.slice(extensionIndex);
  if (!candidateFileName.startsWith(`${stem}-`) || !candidateFileName.endsWith(extension)) {
    return null;
  }
  const suffixStart = stem.length + 1;
  const suffixEnd = candidateFileName.length - extension.length;
  const suffix = candidateFileName.slice(suffixStart, suffixEnd);
  if (!/^[2-9]\d*$/u.test(suffix)) return null;
  const revision = Number(suffix);
  return Number.isSafeInteger(revision) ? revision : null;
}

function isRejectedEditableSnapshotDocument(document: Document, bodyText: string): boolean {
  const contentType = document.contentType;
  if (contentType && !/(?:^|\/)(?:html|xhtml|xml)\b/i.test(contentType)) return true;
  return rejectedSnapshotText(bodyText);
}

function rejectedSnapshotText(text: string): boolean {
  return /(?:preview proxy error|preview runtime not found|parse error:|content-length can't be present with transfer-encoding)/i.test(text);
}

function hasGeneratedInlineStyles(html: string): boolean {
  return hasDocumentShellInlineStyles(html) && hasBodyDescendantInlineStyleCoverage(html);
}

function hasDocumentShellInlineStyles(html: string): boolean {
  return /<html\b[^>]*\sstyle\s*=/i.test(html) || /<body\b[^>]*\sstyle\s*=/i.test(html);
}

function hasBodyDescendantInlineStyleCoverage(html: string): boolean {
  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '';
  const tags = Array.from(body.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/giu))
    .map((match) => ({
      tag: match[1] ?? '',
      attrs: match[2] ?? '',
    }))
    .filter(({ tag }) => !/^(?:script|style|link|meta|base|template|noscript)$/iu.test(tag));
  if (tags.length === 0) return false;
  const styledCount = tags.filter(({ attrs }) => /\sstyle\s*=/iu.test(attrs)).length;
  if (tags.length <= MIN_RICH_STYLED_SNAPSHOT_DESCENDANTS) return styledCount > 0;
  const requiredStyledCount = Math.max(
    MIN_RICH_STYLED_SNAPSHOT_DESCENDANTS,
    Math.ceil(tags.length * MIN_STYLED_SNAPSHOT_DESCENDANT_RATIO),
  );
  return styledCount >= requiredStyledCount;
}

function hasCopiedContentSecurityPolicy(html: string): boolean {
  return /<meta\b[^>]*\bhttp-equiv\s*=\s*["']?\s*content-security-policy(?:-report-only)?\b/i.test(html);
}

function hasEmptyAppMountSnapshot(html: string): boolean {
  return /<body\b[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*<div\b(?=[^>]*(?:\bid\s*=\s*["']?(?:root|app|__next|app-root|root-app)\b|\bdata-v-app\b))[^>]*>\s*<\/div>\s*(?:<!--[\s\S]*?-->\s*)*<\/body>/i.test(html);
}

function hasOnlyEmptyAppMount(body: HTMLElement): boolean {
  const win = body.ownerDocument.defaultView;
  if (!win) return false;
  const children = Array.from(body.children).filter((child) => !isRuntimeOnlyElement(child));
  if (children.length !== 1) return false;
  const mount = children[0];
  if (!(mount instanceof win.HTMLElement)) return false;
  if (mount.textContent?.trim()) return false;
  if (mount.children.length > 0) return false;
  return isAppMountElement(mount);
}

function isRuntimeOnlyElement(element: Element): boolean {
  return /^(?:SCRIPT|STYLE|LINK|META|BASE|TEMPLATE|NOSCRIPT)$/u.test(element.tagName);
}

function isAppMountElement(element: HTMLElement): boolean {
  const id = element.getAttribute('id')?.toLowerCase() ?? '';
  if (['root', 'app', '__next', 'app-root', 'root-app'].includes(id)) return true;
  return element.hasAttribute('data-v-app');
}

function inlineComputedStyles(document: Document, clone: HTMLElement): void {
  const win = document.defaultView;
  if (!win) return;
  const sourceElements = [
    document.documentElement,
    ...Array.from(document.documentElement.querySelectorAll('*')),
  ];
  const cloneElements = [
    clone,
    ...Array.from(clone.querySelectorAll('*')),
  ];
  for (let index = 0; index < sourceElements.length; index += 1) {
    const source = sourceElements[index];
    const target = cloneElements[index];
    if (!source || !target) continue;
    copySelectedComputedStyles(win, source, target);
  }
}

function copySelectedComputedStyles(
  win: Window & typeof globalThis,
  source: Element,
  target: Element,
): void {
  if (!(source instanceof win.Element) || !(target instanceof win.Element)) return;
  const styleTarget = target as Element & { style?: CSSStyleDeclaration };
  if (!styleTarget.style) return;
  const computed = win.getComputedStyle(source);
  for (const property of SNAPSHOT_STYLE_PROPERTIES) {
    const value = computed.getPropertyValue(property);
    if (!value) continue;
    styleTarget.style.setProperty(property, value, computed.getPropertyPriority(property));
  }
}

function syncResolvedResourceUrls(document: Document, clone: HTMLElement): void {
  const sourceElements = Array.from(document.documentElement.querySelectorAll('*'));
  const cloneElements = Array.from(clone.querySelectorAll('*'));
  const win = document.defaultView;
  if (!win) return;
  for (let index = 0; index < sourceElements.length; index += 1) {
    const source = sourceElements[index];
    const target = cloneElements[index];
    if (!source || !target) continue;
    if (!(target instanceof win.HTMLElement)) continue;
    syncResolvedUrl(source, target, 'src');
    syncResolvedUrl(source, target, 'href');
    syncResolvedUrl(source, target, 'poster');
    syncResolvedSrcset(source, target);
  }
}

function syncResolvedUrl(source: Element, target: HTMLElement, attr: 'src' | 'href' | 'poster'): void {
  if (!source.hasAttribute(attr)) return;
  const value = (source as Element & Record<typeof attr, unknown>)[attr];
  if (typeof value !== 'string' || value.length === 0) return;
  target.setAttribute(attr, value);
}

function syncResolvedSrcset(source: Element, target: HTMLElement): void {
  if (!source.hasAttribute('srcset')) return;
  const currentSrc = (source as HTMLImageElement).currentSrc;
  if (typeof currentSrc === 'string' && currentSrc.length > 0) {
    target.setAttribute('src', currentSrc);
    target.removeAttribute('srcset');
  }
}

function rebaseSnapshotResourceUrls(
  document: Document,
  clone: HTMLElement,
  surface: ProjectUiSurface,
  options: EditableSnapshotBuildOptions,
): void {
  const rebaseUrl = createProjectResourceUrlRebaser(document, surface, options);
  if (!rebaseUrl) return;

  rebaseSnapshotElementResourceUrls(clone, rebaseUrl);
  appendSnapshotFontFaceRules(document, clone, rebaseUrl);
}

function rebaseSnapshotElementResourceUrls(
  clone: HTMLElement,
  rebaseUrl: ResourceUrlRebaser,
): void {
  const elements = Array.from(clone.querySelectorAll('*'));
  for (const element of elements) {
    rebaseElementResourceAttributes(element, rebaseUrl);
    rebaseElementInlineStyleUrls(element, rebaseUrl);
  }
  rebaseElementInlineStyleUrls(clone, rebaseUrl);
  rebaseStyleElementUrls(clone, rebaseUrl);
}

function rebaseElementResourceAttributes(
  element: Element,
  rebaseUrl: ResourceUrlRebaser,
): void {
  const tagName = element.tagName.toUpperCase();
  if (['AUDIO', 'IMG', 'SOURCE', 'TRACK', 'VIDEO'].includes(tagName)) {
    rebaseAttributeUrl(element, 'src', rebaseUrl);
  }
  if (['IMG', 'SOURCE'].includes(tagName)) {
    rebaseSrcsetAttribute(element, rebaseUrl);
  }
  if (tagName === 'VIDEO') {
    rebaseAttributeUrl(element, 'poster', rebaseUrl);
  }
  if (tagName === 'LINK') {
    rebaseAttributeUrl(element, 'href', rebaseUrl);
    rebaseSrcsetAttribute(element, 'imagesrcset', rebaseUrl);
  }
}

function rebaseAttributeUrl(
  element: Element,
  attr: string,
  rebaseUrl: ResourceUrlRebaser,
): void {
  const value = element.getAttribute(attr);
  if (!value) return;
  const rebased = rebaseUrl(value);
  if (rebased) element.setAttribute(attr, rebased);
}

function rebaseSrcsetAttribute(
  element: Element,
  attrOrRebaseUrl: string | ResourceUrlRebaser,
  maybeRebaseUrl?: ResourceUrlRebaser,
): void {
  const attr = typeof attrOrRebaseUrl === 'string' ? attrOrRebaseUrl : 'srcset';
  const rebaseUrl = typeof attrOrRebaseUrl === 'string' ? maybeRebaseUrl : attrOrRebaseUrl;
  if (!rebaseUrl) return;
  const value = element.getAttribute(attr);
  if (!value) return;
  const rebased = rebaseSrcsetValue(value, rebaseUrl);
  if (rebased !== value) element.setAttribute(attr, rebased);
}

function rebaseSrcsetValue(
  value: string,
  rebaseUrl: ResourceUrlRebaser,
): string {
  return value
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return candidate;
      const [url, ...descriptors] = trimmed.split(/\s+/u);
      if (!url) return candidate;
      const rebased = rebaseUrl(url);
      return [rebased ?? url, ...descriptors].join(' ');
    })
    .join(', ');
}

function rebaseElementInlineStyleUrls(
  element: Element,
  rebaseUrl: ResourceUrlRebaser,
): void {
  const styleTarget = element as Element & { style?: CSSStyleDeclaration };
  if (!styleTarget.style) return;
  const style = styleTarget.style;
  const properties = Array.from({ length: style.length }, (_, index) => style.item(index)).filter(Boolean);
  for (const property of properties) {
    const value = style.getPropertyValue(property);
    if (!value || !value.includes('url(')) continue;
    const rewritten = rebaseCssUrlValue(value, rebaseUrl);
    if (rewritten !== value) {
      style.setProperty(property, rewritten, style.getPropertyPriority(property));
    }
  }
}

function rebaseCssUrlValue(
  value: string,
  rebaseUrl: ResourceUrlRebaser,
): string {
  return value.replace(
    /url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")]*?))\s*\)/giu,
    (match, doubleQuoted: string | undefined, singleQuoted: string | undefined, unquoted: string | undefined) => {
      const rawUrl = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
      const rebased = rebaseUrl(rawUrl.trim());
      return rebased ? `url("${escapeCssUrl(rebased)}")` : match;
    },
  );
}

function escapeCssUrl(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function rebaseStyleElementUrls(
  clone: HTMLElement,
  rebaseUrl: ResourceUrlRebaser,
): void {
  for (const style of Array.from(clone.querySelectorAll('style'))) {
    const cssText = style.textContent;
    if (!cssText || !cssText.includes('url(')) continue;
    const rewritten = rebaseCssUrlValue(cssText, rebaseUrl);
    if (rewritten !== cssText) style.textContent = rewritten;
  }
}

function appendSnapshotFontFaceRules(
  document: Document,
  clone: HTMLElement,
  rebaseUrl: ResourceUrlRebaser,
): void {
  const cssText = collectSnapshotFontFaceRules(document, rebaseUrl);
  if (cssText.length === 0) return;
  const head = clone.querySelector('head') ?? createHead(clone);
  const style = clone.ownerDocument.createElement('style');
  style.setAttribute('data-od-snapshot-fonts', 'true');
  style.textContent = cssText.join('\n');
  head.append(style);
}

function collectSnapshotFontFaceRules(
  document: Document,
  rebaseUrl: ResourceUrlRebaser,
): string[] {
  const rules: string[] = [];
  const seen = new Set<string>();
  for (const styleSheet of Array.from(document.styleSheets)) {
    let cssRules: CSSRuleList;
    try {
      cssRules = styleSheet.cssRules;
    } catch {
      continue;
    }
    collectFontFaceRulesFromList(cssRules, rebaseUrl, rules, seen);
  }
  return rules;
}

function collectFontFaceRulesFromList(
  ruleList: CSSRuleList,
  rebaseUrl: ResourceUrlRebaser,
  out: string[],
  seen: Set<string>,
): void {
  for (const rule of Array.from(ruleList)) {
    const nestedRules = (rule as CSSRule & { cssRules?: CSSRuleList }).cssRules;
    if (nestedRules) {
      collectFontFaceRulesFromList(nestedRules, rebaseUrl, out, seen);
    }
    if (rule.type !== CSS_FONT_FACE_RULE_TYPE && !rule.cssText.trimStart().startsWith('@font-face')) {
      continue;
    }
    const rewritten = rebaseCssUrlValue(rule.cssText, rebaseUrl);
    if (seen.has(rewritten)) continue;
    seen.add(rewritten);
    out.push(rewritten);
  }
}

function createProjectResourceUrlRebaser(
  document: Document,
  surface: ProjectUiSurface,
  options: EditableSnapshotBuildOptions,
): ResourceUrlRebaser | null {
  const projectId = options.projectId?.trim();
  const projectFileNames = options.projectFileNames ?? [];
  if (!projectId || projectFileNames.length === 0) return null;
  const lookup = buildProjectFileLookup(projectFileNames, surface.previewRuntimeRoot);
  if (lookup.exact.size === 0 && lookup.suffix.size === 0) return null;
  const baseUrl = resourceBaseUrl(document, options) ?? 'http://open-design.local/';
  const documentOrigin = safeUrl(baseUrl)?.origin ?? null;
  return (value) => {
    const trimmed = value.trim();
    if (!trimmed || shouldSkipResourceUrl(trimmed)) return null;
    const resolved = safeUrl(trimmed, baseUrl);
    if (!resolved) return null;
    if (!isLocalSnapshotResourceUrl(resolved, documentOrigin)) return null;
    for (const candidate of projectResourceCandidateKeys(resolved, projectId)) {
      const fileName = lookup.exact.get(candidate) ?? lookupProjectFileBySuffix(lookup.suffix, candidate);
      if (fileName) return projectRawUrl(projectId, fileName);
    }
    return null;
  };
}

function resourceBaseUrl(
  document: Document,
  options: EditableSnapshotBuildOptions,
): string | null {
  for (const candidate of [options.baseUrl, document.baseURI, document.location?.href]) {
    if (!candidate) continue;
    const url = safeUrl(candidate);
    if (url && /^https?:$/iu.test(url.protocol)) return url.href;
  }
  return null;
}

function shouldSkipResourceUrl(value: string): boolean {
  return /^(?:#|data:|blob:|mailto:|tel:|javascript:)/iu.test(value);
}

function safeUrl(value: string, base?: string): URL | null {
  try {
    return base ? new URL(value, base) : new URL(value);
  } catch {
    return null;
  }
}

function isLocalSnapshotResourceUrl(url: URL, documentOrigin: string | null): boolean {
  if (!/^https?:$/iu.test(url.protocol)) return false;
  if (documentOrigin && url.origin === documentOrigin) return true;
  return /^(?:127\.0\.0\.1|localhost|\[::1\])$/iu.test(url.hostname);
}

function projectResourceCandidateKeys(url: URL, projectId: string): string[] {
  const keys: string[] = [];
  const encodedProjectId = encodeURIComponent(projectId);
  const rawPrefix = `/api/projects/${encodedProjectId}/raw/`;
  const proxyPrefix = `/api/projects/${encodedProjectId}/ui-preview/proxy/`;
  if (url.pathname.startsWith(rawPrefix)) {
    addCandidateKey(keys, decodeUrlPath(url.pathname.slice(rawPrefix.length)));
  } else if (url.pathname.startsWith(proxyPrefix)) {
    const afterProxyPrefix = url.pathname.slice(proxyPrefix.length);
    const firstSlash = afterProxyPrefix.indexOf('/');
    if (firstSlash >= 0) {
      const proxyPath = decodeUrlPath(afterProxyPrefix.slice(firstSlash + 1));
      addCandidateKey(keys, proxyPath);
      addNextImageCandidateKey(keys, proxyPath, url);
    }
  } else {
    addCandidateKey(keys, decodeUrlPath(url.pathname));
    addNextImageCandidateKey(keys, decodeUrlPath(url.pathname), url);
  }
  return keys;
}

function addNextImageCandidateKey(keys: string[], pathName: string, url: URL): void {
  if (!/(?:^|\/)_next\/image$/u.test(normalizeProjectPath(pathName))) return;
  const sourceUrl = url.searchParams.get('url');
  if (sourceUrl) addCandidateKey(keys, sourceUrl);
}

function addCandidateKey(keys: string[], value: string): void {
  const normalized = normalizeProjectPath(value);
  if (normalized && !keys.includes(normalized)) keys.push(normalized);
}

function decodeUrlPath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function buildProjectFileLookup(
  projectFileNames: readonly string[],
  runtimeRoot: string | null,
): ProjectFileLookup {
  const lookup: ProjectFileLookup = {
    exact: new Map<string, string>(),
    suffix: new Map<string, string>(),
  };
  const ambiguousExact = new Set<string>();
  const ambiguousSuffix = new Set<string>();
  const normalizedRuntimeRoot = normalizeProjectPath(runtimeRoot ?? '');
  for (const rawName of projectFileNames) {
    const fileName = normalizeProjectPath(rawName);
    if (!fileName) continue;
    addProjectFileLookup(lookup.exact, ambiguousExact, fileName, fileName);
    addProjectFileSuffixLookups(lookup.suffix, ambiguousSuffix, fileName, fileName);
    addPublicProjectFileLookups(lookup.exact, ambiguousExact, fileName, fileName);
    addPublicProjectFileLookups(lookup.suffix, ambiguousSuffix, fileName, fileName);
    if (normalizedRuntimeRoot && fileName.startsWith(`${normalizedRuntimeRoot}/`)) {
      const runtimeRelative = fileName.slice(normalizedRuntimeRoot.length + 1);
      addProjectFileLookup(lookup.exact, ambiguousExact, runtimeRelative, fileName);
      addProjectFileSuffixLookups(lookup.suffix, ambiguousSuffix, runtimeRelative, fileName);
      addPublicProjectFileLookups(lookup.exact, ambiguousExact, runtimeRelative, fileName);
      addPublicProjectFileLookups(lookup.suffix, ambiguousSuffix, runtimeRelative, fileName);
    }
  }
  return lookup;
}

function addPublicProjectFileLookups(
  lookup: Map<string, string>,
  ambiguous: Set<string>,
  value: string,
  fileName: string,
): void {
  if (value === PROJECT_PUBLIC_DIR || !value.startsWith(`${PROJECT_PUBLIC_DIR}/`)) return;
  addProjectFileLookup(lookup, ambiguous, value.slice(PROJECT_PUBLIC_DIR.length + 1), fileName);
}

function addProjectFileLookup(
  lookup: Map<string, string>,
  ambiguous: Set<string>,
  value: string,
  fileName: string,
): void {
  const key = normalizeProjectPath(value);
  if (!key || ambiguous.has(key)) return;
  const existing = lookup.get(key);
  if (existing && existing !== fileName) {
    lookup.delete(key);
    ambiguous.add(key);
    return;
  }
  lookup.set(key, fileName);
}

function addProjectFileSuffixLookups(
  lookup: Map<string, string>,
  ambiguous: Set<string>,
  value: string,
  fileName: string,
): void {
  const key = normalizeProjectPath(value);
  if (!key || !PROJECT_RESOURCE_FILE_EXTENSION_RE.test(key)) return;
  const segments = key.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    const suffix = segments.slice(index).join('/');
    addProjectFileLookup(lookup, ambiguous, suffix, fileName);
  }
}

function lookupProjectFileBySuffix(
  lookup: Map<string, string>,
  value: string,
): string | null {
  const key = normalizeProjectPath(value);
  if (!key || !PROJECT_RESOURCE_FILE_EXTENSION_RE.test(key)) return null;
  const segments = key.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    const fileName = lookup.get(segments.slice(index).join('/'));
    if (fileName) return fileName;
  }
  return null;
}

function normalizeProjectPath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\/+/u, '')
    .replace(/\/+/g, '/')
    .replace(/^\.\//u, '')
    .split('#')[0]!
    .split('?')[0]!;
}

function projectRawUrl(projectId: string, filePath: string): string {
  const safePath = filePath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `/api/projects/${encodeURIComponent(projectId)}/raw/${safePath}`;
}

function snapshotDocumentViewportWidth(document: Document): number | null {
  const win = document.defaultView;
  return parseSnapshotViewportWidth(win?.innerWidth)
    ?? parseSnapshotViewportWidth(document.documentElement?.clientWidth)
    ?? parseSnapshotViewportWidth(document.body?.clientWidth);
}

function explicitSnapshotViewportWidth(root: HTMLElement): number | null {
  return parseSnapshotViewportWidth(root.getAttribute(EDITABLE_SNAPSHOT_VIEWPORT_WIDTH_ATTR));
}

function resolvedSnapshotViewportWidthFromRoot(root: HTMLElement, explicitWidth = explicitSnapshotViewportWidth(root)): number | null {
  if (explicitWidth !== null) {
    const capturedWidth = snapshotFullBleedViewportWidthFromRoot(root, explicitWidth);
    if (
      capturedWidth !== null
      && shouldPreferCapturedSnapshotViewportWidth(explicitWidth, capturedWidth)
    ) {
      return capturedWidth;
    }
    const layoutWidth = snapshotResponsiveLayoutViewportWidthFromRoot(root, explicitWidth, {
      includeMaxWidth: false,
    });
    if (
      layoutWidth !== null
      && layoutWidth > explicitWidth
      && shouldPreferCapturedSnapshotViewportWidth(explicitWidth, layoutWidth)
    ) {
      return layoutWidth;
    }
    return explicitWidth;
  }
  return snapshotCapturedViewportWidthFromRoot(root)
    ?? snapshotResponsiveLayoutViewportWidthFromRoot(root)
    ?? inferSnapshotViewportWidthFromRoot(root);
}

function shouldPreferCapturedSnapshotViewportWidth(explicitWidth: number, capturedWidth: number): boolean {
  if (capturedWidth === explicitWidth) return false;
  if (capturedWidth < MIN_DESKTOP_SNAPSHOT_VIEWPORT_WIDTH) return false;
  const ratio = capturedWidth / explicitWidth;
  return ratio >= 0.65 && ratio <= 1.35;
}

function snapshotCapturedViewportWidthFromRoot(root: HTMLElement, referenceWidth: number | null = null): number | null {
  const structuralWidths: number[] = [];
  const addElementWidth = (element: SnapshotStyledElement | null, bucket: number[]) => {
    if (!element) return;
    const width = parseSnapshotPixelValue(element.style.getPropertyValue('width').trim());
    if (width !== null) bucket.push(width);
  };

  addElementWidth(root, structuralWidths);
  addElementWidth(snapshotBodyElement(root), structuralWidths);
  for (const selector of [
    '#root, #app, #__next, #app-root, #root-app, [data-v-app]',
    'body > header, body > main, body > footer, body > section, body > div',
    '#root > *, #app > *, #__next > *, #app-root > *, #root-app > *',
    'main, header, footer',
    'main > section, main > div',
  ]) {
    for (const element of Array.from(root.querySelectorAll(selector))) {
      addElementWidth(snapshotHTMLElement(root, element), structuralWidths);
    }
  }

  return snapshotFullBleedViewportWidthFromRoot(root, referenceWidth)
    ?? snapshotResponsiveLayoutViewportWidthFromRoot(root, referenceWidth)
    ?? largestSnapshotViewportCandidate(structuralWidths, referenceWidth);
}

function snapshotFullBleedViewportWidthFromRoot(root: HTMLElement, referenceWidth: number | null = null): number | null {
  const fullBleedWidths: number[] = [];
  for (const element of Array.from(root.querySelectorAll('[style]'))) {
    const styledElement = snapshotStyledElement(root, element);
    if (!styledElement || !hasSnapshotViewportWidthCue(styledElement)) continue;
    const width = parseSnapshotPixelValue(styledElement.style.getPropertyValue('width').trim());
    if (width !== null) fullBleedWidths.push(width);
  }
  return largestSnapshotViewportCandidate(fullBleedWidths, referenceWidth);
}

function snapshotResponsiveLayoutViewportWidthFromRoot(
  root: HTMLElement,
  referenceWidth: number | null = null,
  options: { includeMaxWidth?: boolean } = {},
): number | null {
  const layoutWidths: number[] = [];
  for (const element of Array.from(root.querySelectorAll('[style]'))) {
    const htmlElement = snapshotHTMLElement(root, element);
    if (!htmlElement || !hasSnapshotResponsiveLayoutClassCue(htmlElement)) continue;
    const width = parseSnapshotPixelValue(htmlElement.style.getPropertyValue('width').trim());
    if (width !== null) layoutWidths.push(width);
    if (options.includeMaxWidth !== false) {
      const maxWidth = parseSnapshotPixelValue(htmlElement.style.getPropertyValue('max-width').trim());
      if (maxWidth !== null) layoutWidths.push(maxWidth);
    }
  }
  return largestSnapshotViewportCandidate(layoutWidths, referenceWidth);
}

function inferSnapshotViewportWidthFromRoot(root: HTMLElement): number | null {
  const explicitWidth = parseSnapshotViewportWidth(root.getAttribute(EDITABLE_SNAPSHOT_VIEWPORT_WIDTH_ATTR));
  if (explicitWidth !== null) return explicitWidth;

  const structuralWidths: number[] = [];
  const fallbackWidths: number[] = [];
  const addElementWidth = (element: HTMLElement | null, fallbackOnly = false) => {
    if (!element) return;
    const width = parseSnapshotPixelValue(element.style.getPropertyValue('width').trim());
    if (width !== null) (fallbackOnly ? fallbackWidths : structuralWidths).push(width);
    const maxWidth = parseSnapshotPixelValue(element.style.getPropertyValue('max-width').trim());
    if (maxWidth !== null && hasSnapshotContainerClassCue(element)) fallbackWidths.push(maxWidth);
  };

  addElementWidth(root);
  addElementWidth(snapshotBodyElement(root));
  for (const selector of [
    '#root, #app, #__next, #app-root, #root-app, [data-v-app]',
    'body > header, body > main, body > footer, body > section, body > div',
    '#root > *, #app > *, #__next > *, #app-root > *, #root-app > *',
    'main, header, footer',
    'main > section, main > div',
  ]) {
    for (const element of Array.from(root.querySelectorAll(selector))) {
      addElementWidth(snapshotHTMLElement(root, element));
    }
  }
  for (const element of Array.from(root.querySelectorAll('.container'))) {
    addElementWidth(snapshotHTMLElement(root, element), true);
  }

  return dominantSnapshotViewportWidth(structuralWidths)
    ?? dominantSnapshotViewportWidth(fallbackWidths);
}

function largestSnapshotViewportCandidate(widths: readonly number[], referenceWidth: number | null): number | null {
  const minWidth = referenceWidth && referenceWidth >= MIN_DESKTOP_SNAPSHOT_VIEWPORT_WIDTH
    ? Math.max(MIN_DESKTOP_SNAPSHOT_VIEWPORT_WIDTH, referenceWidth * 0.65)
    : MIN_DESKTOP_SNAPSHOT_VIEWPORT_WIDTH;
  const maxWidth = referenceWidth ? referenceWidth * 1.35 : MAX_SNAPSHOT_VIEWPORT_WIDTH;
  let bestWidth: number | null = null;
  for (const width of widths) {
    const normalized = parseSnapshotViewportWidth(width);
    if (normalized === null || normalized < minWidth || normalized > maxWidth) continue;
    if (bestWidth === null || normalized > bestWidth) bestWidth = normalized;
  }
  return bestWidth;
}

function hasSnapshotViewportWidthCue(element: SnapshotStyledElement): boolean {
  const className = String(element.getAttribute('class') ?? '');
  if (/\b(?:w-full|w-screen|min-w-full|min-w-screen|h-screen|min-h-screen)\b/iu.test(className)) return true;
  if (hasSnapshotFullBleedClassCue(element)) return true;
  const position = element.style.getPropertyValue('position').trim();
  if (position !== 'absolute' && position !== 'fixed') return false;
  const inset = element.style.getPropertyValue('inset').trim();
  const left = element.style.getPropertyValue('left').trim();
  const right = element.style.getPropertyValue('right').trim();
  return inset === '0px' || (left === '0px' && right === '0px');
}

function inferSnapshotViewportWidthFromHtml(html: string): number | null {
  const structuralWidths = Array.from(html.matchAll(/\b(?:width)\s*:\s*(\d+(?:\.\d+)?)px/giu))
    .map((match) => parseSnapshotViewportWidth(match[1]))
    .filter((value): value is number => value !== null);
  return dominantSnapshotViewportWidth(structuralWidths);
}

function dominantSnapshotViewportWidth(widths: readonly number[]): number | null {
  const counts = new Map<number, number>();
  for (const width of widths) {
    const normalized = parseSnapshotViewportWidth(width);
    if (normalized === null) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  let bestWidth: number | null = null;
  let bestCount = 0;
  for (const [width, count] of counts) {
    if (count > bestCount || (count === bestCount && bestWidth !== null && width > bestWidth)) {
      bestWidth = width;
      bestCount = count;
    }
  }
  return bestWidth;
}

function parseSnapshotPixelValue(value: string | null | undefined): number | null {
  const match = String(value ?? '').trim().match(/^(\d+(?:\.\d+)?)px$/iu);
  return parseSnapshotViewportWidth(match?.[1]);
}

function parseSnapshotViewportWidth(value: string | number | null | undefined): number | null {
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(numeric) || numeric < MIN_SNAPSHOT_VIEWPORT_WIDTH || numeric > MAX_SNAPSHOT_VIEWPORT_WIDTH) {
    return null;
  }
  return Math.round(numeric);
}

function normalizeFrozenSnapshotState(document: Document, clone: HTMLElement): void {
  const win = document.defaultView;
  if (!win) return;
  const sourceElements = [
    document.documentElement,
    ...Array.from(document.documentElement.querySelectorAll('*')),
  ];
  const cloneElements = [
    clone,
    ...Array.from(clone.querySelectorAll('*')),
  ];
  for (let index = 0; index < sourceElements.length; index += 1) {
    const source = sourceElements[index];
    const target = cloneElements[index];
    if (!(source instanceof win.HTMLElement) || !(target instanceof win.HTMLElement)) continue;
    if (source.classList.contains('reveal')) {
      target.classList.add('visible');
      target.style.setProperty('opacity', '1');
      target.style.setProperty('transform', 'none');
      target.style.setProperty('visibility', 'visible');
    }
    if (source.classList.contains('reveal-arrow')) {
      target.classList.add('visible');
    }
    if (hasSnapshotIntroAnimation(source)) {
      target.style.setProperty('opacity', '1');
      target.style.setProperty('animation', 'none');
      target.style.setProperty('transform', 'none');
      target.style.setProperty('visibility', 'visible');
    }
  }
}

function hasSnapshotIntroAnimation(element: Element): boolean {
  return ['animate-fade-up', 'animate-fade-in', 'animate-slide-left'].some((className) =>
    element.classList.contains(className),
  );
}

function syncFormState(document: Document, clone: HTMLElement): void {
  const win = document.defaultView;
  if (!win) return;
  const sourceElements = Array.from(document.documentElement.querySelectorAll('input, textarea, option'));
  const cloneElements = Array.from(clone.querySelectorAll('input, textarea, option'));
  for (let index = 0; index < sourceElements.length; index += 1) {
    const source = sourceElements[index];
    const target = cloneElements[index];
    if (source instanceof win.HTMLInputElement && target instanceof win.HTMLInputElement) {
      target.setAttribute('value', source.value);
      if (source.checked) target.setAttribute('checked', '');
      else target.removeAttribute('checked');
    } else if (source instanceof win.HTMLTextAreaElement && target instanceof win.HTMLTextAreaElement) {
      target.textContent = source.value;
    } else if (source instanceof win.HTMLOptionElement && target instanceof win.HTMLOptionElement) {
      if (source.selected) target.setAttribute('selected', '');
      else target.removeAttribute('selected');
    }
  }
}

function normalizeSnapshotMediaPlayback(root: HTMLElement): boolean {
  let changed = false;
  for (const element of Array.from(root.querySelectorAll('audio, video'))) {
    if (!element.hasAttribute('muted')) {
      element.setAttribute('muted', '');
      changed = true;
    }
    if (element.hasAttribute('autoplay')) {
      element.removeAttribute('autoplay');
      changed = true;
    }
    if (element.tagName.toUpperCase() === 'VIDEO' && !element.hasAttribute('playsinline')) {
      element.setAttribute('playsinline', '');
      changed = true;
    }
  }
  return changed;
}

function hasSnapshotFullBleedClassCue(element: Element): boolean {
  return /(?:^|\s)(?:inset-0|inset-x-0|left-0|right-0)(?:\s|$)/u.test(String(element.getAttribute('class') ?? ''));
}

function hasSnapshotResponsiveLayoutClassCue(element: HTMLElement): boolean {
  const className = String(element.getAttribute('class') ?? '');
  return hasSnapshotContainerClassCue(element)
    || (
      hasSnapshotAutoMarginClassCue(element)
      && /(?:^|\s)max-w-\S+(?:\s|$)/iu.test(className)
    );
}

function hasSnapshotAutoMarginClassCue(element: HTMLElement): boolean {
  return /(?:^|\s)(?:mx-auto|m-auto)(?:\s|$)/u.test(String(element.getAttribute('class') ?? ''));
}

function hasSnapshotContainerClassCue(element: HTMLElement): boolean {
  return /(?:^|\s)container(?:\s|$)/u.test(String(element.getAttribute('class') ?? ''));
}

function snapshotHTMLElement(root: HTMLElement, element: Element | null): HTMLElement | null {
  if (!element) return null;
  const win = root.ownerDocument.defaultView;
  if (win) return element instanceof win.HTMLElement ? element : null;
  if (!('style' in element) || typeof element.tagName !== 'string') return null;
  return element as HTMLElement;
}

function snapshotStyledElement(root: HTMLElement, element: Element | null): SnapshotStyledElement | null {
  if (!element) return null;
  const win = root.ownerDocument.defaultView;
  if (win) {
    return element instanceof win.HTMLElement || element instanceof win.SVGElement
      ? element
      : null;
  }
  if (!('style' in element) || typeof element.tagName !== 'string') return null;
  return element as SnapshotStyledElement;
}

function snapshotBodyElement(root: HTMLElement): HTMLElement | null {
  if (isBodyElement(root)) return root;
  for (const child of Array.from(root.children)) {
    const childElement = snapshotHTMLElement(root, child);
    if (childElement && isBodyElement(childElement)) return childElement;
  }
  const descendantBodyByTag = snapshotHTMLElement(root, root.getElementsByTagName('body')[0] ?? null);
  if (descendantBodyByTag) return descendantBodyByTag;
  const descendantBodyBySelector = snapshotHTMLElement(root, root.querySelector('body'));
  if (descendantBodyBySelector) return descendantBodyBySelector;
  const documentBody = snapshotHTMLElement(root, root.ownerDocument.body);
  if (!documentBody || documentBody.parentElement !== root) return null;
  return documentBody;
}

function isBodyElement(element: HTMLElement): boolean {
  return element.tagName.toUpperCase() === 'BODY';
}

function pruneRuntimeOnlyNodes(clone: HTMLElement): void {
  clone.querySelectorAll('script, base, link[rel="modulepreload"], link[rel="preload"][as="script"]').forEach((node) => {
    node.remove();
  });
  clone.querySelectorAll('meta[http-equiv]').forEach((node) => {
    const httpEquiv = node.getAttribute('http-equiv')?.toLowerCase() ?? '';
    if (httpEquiv === 'content-security-policy' || httpEquiv === 'content-security-policy-report-only') {
      node.remove();
    }
  });
}

function prepareSnapshotHead(
  document: Document,
  clone: HTMLElement,
  surface: ProjectUiSurface,
): void {
  const head = clone.querySelector('head') ?? createHead(clone);
  if (!head.querySelector('meta[charset]')) {
    const meta = clone.ownerDocument.createElement('meta');
    meta.setAttribute('charset', 'utf-8');
    head.prepend(meta);
  }
  if (!head.querySelector('meta[name="viewport"]')) {
    const meta = clone.ownerDocument.createElement('meta');
    meta.setAttribute('name', 'viewport');
    meta.setAttribute('content', 'width=device-width, initial-scale=1');
    head.append(meta);
  }
  const title = head.querySelector('title') ?? clone.ownerDocument.createElement('title');
  title.textContent = `${surface.label || document.title || 'Screen'} editable snapshot`;
  if (!title.parentElement) head.append(title);
  if (!head.querySelector('style[data-od-snapshot-normalize]')) {
    const style = clone.ownerDocument.createElement('style');
    style.setAttribute('data-od-snapshot-normalize', 'true');
    style.textContent = `
      [data-od-editable-snapshot] .reveal {
        opacity: 1 !important;
        transform: none !important;
        visibility: visible !important;
      }
      [data-od-editable-snapshot] .reveal-arrow.visible {
        opacity: 0.15 !important;
      }
      [data-od-editable-snapshot] .animate-fade-up,
      [data-od-editable-snapshot] .animate-fade-in,
      [data-od-editable-snapshot] .animate-slide-left {
        opacity: 1 !important;
        animation: none !important;
        transform: none !important;
        visibility: visible !important;
      }
    `;
    head.append(style);
  }
}

function createHead(clone: HTMLElement): HTMLHeadElement {
  const head = clone.ownerDocument.createElement('head');
  clone.insertBefore(head, clone.firstChild);
  return head;
}

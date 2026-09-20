/**
 * One preview plan for every HTML document the daemon serves.
 *
 * INVARIANT: preview behavior is independent of document size.
 *
 * A preview transform decides WHAT a document receives (which bridges, a
 * sanitized title, a containment `<base>`) and WHERE it goes (after `<head>`
 * opens, before `</body>`). Both decisions are made here, once, from the
 * document's structure — located with the same `html-injection-points`
 * helpers the srcDoc transport uses — and expressed as byte-offset edits.
 * Whether those edits are then spliced into a buffer or into a file stream is a
 * transport detail with no say in the result: a 2 KiB page and a 200 MiB page
 * go through exactly this code.
 *
 * The daemon used to keep two implementations split at a size ceiling — string
 * rewriting below it, a hand-maintained head-only injection above it — and they
 * disagreed about placement, titles, scopes, Vite builds and Workspace URLs. A
 * bridge added to one list silently never reached the other. Nothing in this
 * module may branch on a document's size.
 *
 * Analysis reads the document as a latin1 string so that string offsets are
 * byte offsets. Every structural boundary the helpers look for is ASCII, and
 * the only text this module interprets (the title) is decoded as UTF-8 before
 * use, so the view changes no answer — it only lets the edits land on bytes.
 */

import { constants as bufferConstants } from 'node:buffer';
import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { load } from 'cheerio';

import {
  endOfTag,
  findAfterDoctypeOffset,
  findRealElementRange,
  findRealTagOffset,
  HTML_TAG_PATTERNS,
} from '@open-design/contracts/runtime/html-injection-points';
import { previewHtmlHasLoadTimeLocationNavigation } from '@open-design/contracts/runtime/preview-guards';
import { ManualEditSourceAnnotator } from '@open-design/preview-runtime/manual-edit-source';

import type { PreviewRuntimeModuleSource } from './preview-runtime-bootstrap.js';
import { buildDeckRuntimeModule } from './preview-runtime-modules.js';

// ---------------------------------------------------------------------------
// Teams-safe title sanitization for the URL-load preview path (issue #3918).
//
// When a user prints an HTML preview via Cmd+P → "Save as PDF", Chromium uses
// the iframe's document <title> as the default filename. The URL-load iframe
// uses sandbox="allow-scripts allow-downloads" (no allow-same-origin), so the
// host page cannot access contentDocument to rewrite the title after load.
// Instead we rewrite it here, in the daemon response, before the browser
// parses the document. The web srcDoc path has its own sanitizeTitleInDoc in
// apps/web/src/runtime/srcdoc.ts — keep the two in sync when the logic changes.
// ---------------------------------------------------------------------------

/** Named non-ASCII entities common in business/design document titles. */
const DAEMON_NAMED_ENTITY_MAP: Record<string, string> = {
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å',
  aelig: 'æ', ccedil: 'ç',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
  igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  eth: 'ð', ntilde: 'ñ',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü',
  yacute: 'ý', thorn: 'þ', yuml: 'ÿ',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å',
  AElig: 'Æ', Ccedil: 'Ç',
  Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë',
  Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï',
  ETH: 'Ð', Ntilde: 'Ñ',
  Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü',
  Yacute: 'Ý', THORN: 'Þ',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', hellip: '…', trade: '™', reg: '®',
  copy: '©', deg: '°', euro: '€', pound: '£', yen: '¥',
};

function daemonSafeFromCodePoint(cp: number): string {
  if (cp < 0 || cp > 0x10ffff) return '�';
  return String.fromCodePoint(cp);
}

function daemonDecodeHtmlEntitiesForTitle(encoded: string): string {
  return encoded
    .replace(/&([A-Za-z]+);/g, (match: string, name: string) => DAEMON_NAMED_ENTITY_MAP[name] ?? match)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_: string, n: string) => daemonSafeFromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_: string, h: string) => daemonSafeFromCodePoint(parseInt(h, 16)));
}

function daemonSanitizePreviewTitle(text: string): string {
  // Trim first so that leading whitespace cannot hide a ~$ prefix from the
  // anchor-based check below (e.g. "  ~$Invoice" would otherwise survive).
  let result = text.trim();
  // Remove every leading ~$ prefix. A single replace(/^~\$/, '') is not
  // enough when the prefix is doubled ("~$~$Doc"). Loop until stable, then
  // re-trim in case a space followed the prefix ("~$ Invoice" → " Invoice").
  let prev: string;
  do {
    prev = result;
    result = result.replace(/^~\$/, '').trim();
  } while (result !== prev);
  // Replace each disallowed character (or run of them) with a single hyphen.
  // Character class: : # % & * { } \ < > ? / + | "
  // eslint-disable-next-line no-useless-escape
  result = result.replace(/[:#%&*{}\\<>?/+|"]+/g, '-');
  // Final trim to remove any spaces exposed by the substitution.
  return result.trim();
}

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const FOREIGN_CONTENT_SIGNAL = /<(svg|math)[\t\n\f\r />]/i;
const BASE_START_TAG = /<base[\t\n\f\r />]/i;

/**
 * Where the head's own `<title>` text sits. Only the head title names the
 * document: an `<svg><title>` in the body is an accessible label, so the search
 * stops at `</head>` (or at `<body>` when the head is implicit). Both
 * boundaries are located structurally, so a `</head>` written into a script
 * string cannot move the limit.
 */
function findHeadTitleText(
  html: string,
): { contentStart: number; contentEnd: number; raw: string } | null {
  const headClose = findRealTagOffset(html, HTML_TAG_PATTERNS.headClose);
  const bodyOpen = findRealTagOffset(html, HTML_TAG_PATTERNS.bodyOpen);
  const searchLimit = headClose >= 0 ? headClose : bodyOpen >= 0 ? bodyOpen : html.length;
  // Both ends of the element by the parser's rules: the open tag through
  // `endOfTag`, so a `>` inside a quoted attribute cannot cut it short, and the
  // close by the raw-text rule, so `</title >` closes it while `</title-page>`
  // does not.
  const range = findRealElementRange(html, HTML_TAG_PATTERNS.titleOpen, 'title');
  if (!range || range.start >= searchLimit) return null;
  return {
    contentStart: range.contentStart,
    contentEnd: range.contentEnd,
    raw: html.slice(range.contentStart, range.contentEnd),
  };
}

function sanitizeTitleText(text: string): string {
  return daemonSanitizePreviewTitle(daemonDecodeHtmlEntitiesForTitle(text));
}

/**
 * Rewrite the `<title>` in html so the resulting PDF filename is Teams-safe.
 * Only the real `<head>` title is changed; `<title>` inside comments or script
 * blocks is left untouched. Mirrors sanitizeTitleInDoc in srcdoc.ts.
 */
export function daemonSanitizeTitleInDoc(html: string): string {
  const title = findHeadTitleText(html);
  if (!title) return html;
  return html.slice(0, title.contentStart) + sanitizeTitleText(title.raw) + html.slice(title.contentEnd);
}

/**
 * Whether the document contains a `<base>` the browser would actually honour.
 *
 * Parsed rather than scanned, because the answer depends on namespace and on
 * template content: a `<base>` directly under `<svg>` is an SVG element and
 * inert, and one inside an HTML `<template>` belongs to an inert fragment.
 * Both look identical to a linear scan.
 *
 * The template test is by namespace as well as name. A foreign element may
 * also be called `template` — `<svg><template><foreignObject><base>` — and it
 * creates no inert fragment, so the base under it is live and a name-only
 * test would wrongly discard it.
 */
export function hasAuthoredHtmlBase(html: string): boolean {
  const $ = load(html);
  return $('base').toArray().some((element) => {
    if (element.namespace !== HTML_NAMESPACE) return false;
    for (let node: typeof element.parent = element.parent; node; node = node.parent) {
      const candidate = node as { name?: string; namespace?: string };
      if (candidate.name === 'template' && candidate.namespace === HTML_NAMESPACE) return false;
    }
    return true;
  });
}

/** A Vite development entry: a module script loaded from the app's `/src/`. */
export function isViteDevHtmlEntry(html: string): boolean {
  return /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*\bsrc\s*=\s*["']\/src\/[^"']+["'][^>]*>\s*<\/script>/i.test(html);
}

/** Thrown for a document too large to hold as one string for analysis. */
export class HtmlPreviewDocumentTooLargeError extends Error {
  readonly code = 'PREVIEW_DOCUMENT_TOO_LARGE';

  constructor(byteLength: number) {
    super(
      `HTML document is ${byteLength} bytes; preview analysis supports at most `
      + `${bufferConstants.MAX_STRING_LENGTH} bytes`,
    );
    this.name = 'HtmlPreviewDocumentTooLargeError';
  }
}

/** A fact that may differ between the document as authored and with its title sanitized. */
interface TitleSensitive<T> {
  readonly authored: T;
  readonly sanitizedTitle: T;
}

/**
 * Everything a preview plan needs to know about one exact document version.
 * Request-independent, so it is computed once per version and cached; every
 * offset is a byte offset into the document.
 */
export interface HtmlPreviewDocumentFacts {
  readonly byteLength: number;
  /** Just past the first real `<head …>`, or null when there is none or it never closes. */
  readonly headOpenEnd: number | null;
  /** Just past the first real `<html …>`, or null when there is none or it never closes. */
  readonly htmlOpenEnd: number | null;
  /** Where `prependAfterDoctype` would insert. */
  readonly afterDoctype: number;
  /** Start of the first real `</body`, or null. */
  readonly bodyCloseStart: number | null;
  /** The head title's text, as bytes, and its sanitized replacement. */
  readonly title: { contentStart: number; contentEnd: number; sanitized: Buffer } | null;
  readonly hasRealBase: boolean;
  /** An HTML-namespace `<base>` a parser finds, including ones a linear scan cannot reach. */
  readonly hasParsedHtmlBase: boolean;
  readonly foreignContentSignal: TitleSensitive<boolean>;
  readonly presentMarkers: TitleSensitive<ReadonlySet<string>>;
  readonly loadTimeLocationNavigation: TitleSensitive<boolean>;
  readonly viteDevEntry: boolean;
  /** The Deck runtime module this document needs, when analysis was asked for it. */
  readonly deckRuntimeModule: PreviewRuntimeModuleSource | null;
}

export interface HtmlPreviewAnalysisOptions {
  /** Marker attributes a plan may need to find already present. */
  readonly markers: readonly string[];
  /** Build the scoped runtime's Deck module from this document. */
  readonly deckRuntimeModule?: boolean;
}

/** Analyze one document. Pure; the caller owns caching. */
export function analyzeHtmlPreviewDocument(
  bytes: Buffer,
  options: HtmlPreviewAnalysisOptions,
): HtmlPreviewDocumentFacts {
  // The UTF-8 signature is not part of the markup. The helpers treat a leading
  // U+FEFF as "stay behind it"; in a byte view it is three characters, so it is
  // set aside and every offset shifted past it instead.
  const signature = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  if (bytes.length - signature > bufferConstants.MAX_STRING_LENGTH) {
    throw new HtmlPreviewDocumentTooLargeError(bytes.length);
  }
  const html = bytes.toString('latin1', signature);
  const at = (offset: number): number => offset + signature;

  const headStart = findRealTagOffset(html, HTML_TAG_PATTERNS.headOpen);
  const headEnd = headStart >= 0 ? endOfTag(html, headStart) : -1;
  const htmlStart = findRealTagOffset(html, HTML_TAG_PATTERNS.htmlOpen);
  const htmlEnd = htmlStart >= 0 ? endOfTag(html, htmlStart) : -1;
  const bodyClose = findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose);
  const hasRealBase = findRealTagOffset(html, HTML_TAG_PATTERNS.baseOpen) >= 0;

  const title = findHeadTitleText(html);
  // The title is the only text sanitizing changes, so a fact about the
  // sanitized document is the fact about the rest plus the new title. Title
  // text sits between a tag's `>` and the `<` of `</title`; nothing these checks
  // match can start inside a tag, but a match may end on the `<` that follows
  // the text (`location.href=` + `<`), so the text is checked with it.
  const outsideTitle = title
    ? [html.slice(0, title.contentStart), html.slice(title.contentEnd)]
    : [html];
  // The title is the one piece of text interpreted, so it is decoded as the
  // UTF-8 it is before sanitizing.
  const sanitizedTitle = title
    ? sanitizeTitleText(Buffer.from(title.raw, 'latin1').toString('utf8'))
    : null;
  const titleSensitive = <T>(
    test: (text: string) => T,
    combine: (parts: T[]) => T,
  ): TitleSensitive<T> => {
    const outside = outsideTitle.map(test);
    return {
      authored: combine(title ? [...outside, test(`${title.raw}<`)] : outside),
      sanitizedTitle: combine(sanitizedTitle !== null ? [...outside, test(`${sanitizedTitle}<`)] : outside),
    };
  };
  const any = (parts: boolean[]): boolean => parts.some(Boolean);
  const markerSet = (parts: ReadonlySet<string>[]): ReadonlySet<string> => (
    new Set(parts.flatMap((part) => [...part]))
  );

  return {
    byteLength: bytes.length,
    headOpenEnd: headEnd >= 0 ? at(headEnd + 1) : null,
    htmlOpenEnd: htmlEnd >= 0 ? at(htmlEnd + 1) : null,
    afterDoctype: at(findAfterDoctypeOffset(html)),
    bodyCloseStart: bodyClose >= 0 ? at(bodyClose) : null,
    title: title
      ? {
          contentStart: at(title.contentStart),
          contentEnd: at(title.contentEnd),
          sanitized: Buffer.from(sanitizedTitle!, 'utf8'),
        }
      : null,
    hasRealBase,
    // A parser can only find a base element where the bytes spell a `<base`
    // start tag, so documents without one skip the parse without changing the
    // answer.
    hasParsedHtmlBase: !hasRealBase && BASE_START_TAG.test(html) && hasAuthoredHtmlBase(html),
    foreignContentSignal: titleSensitive((text) => FOREIGN_CONTENT_SIGNAL.test(text), any),
    presentMarkers: titleSensitive(
      (text) => new Set(options.markers.filter((marker) => text.includes(marker))),
      markerSet,
    ),
    loadTimeLocationNavigation: titleSensitive(previewHtmlHasLoadTimeLocationNavigation, any),
    viteDevEntry: isViteDevHtmlEntry(html),
    deckRuntimeModule: options.deckRuntimeModule ? buildDeckRuntimeModule(html) : null,
  };
}

/** Context a registered injection may read while its content is built. */
export interface HtmlPreviewInjectionContext {
  /** Whether the document, as served so far, navigates itself while loading. */
  readonly loadTimeLocationNavigation: boolean;
}

/**
 * One piece of daemon-owned markup for a preview document.
 *
 * `head-open` content is installed where the parser meets it before any of the
 * author's own head content; `body-end` content where the author's body has
 * finished. A document with no real `</body>` gets its body-end content with
 * the head instead. Appending is not a safe fallback: the reason there is no
 * boundary is often that the document ends inside a construct that swallows
 * whatever follows — `<plaintext>` never leaves PLAINTEXT, an unterminated
 * comment or script runs to EOF — and appended markup would become text there.
 * Going in near the top costs the end-of-body placement but keeps it live.
 */
export interface HtmlPreviewInjection {
  readonly placement: 'head-open' | 'body-end';
  /** Skip the injection when the served document already carries this marker. */
  readonly marker: string | null;
  readonly build: (context: HtmlPreviewInjectionContext) => string;
}

export interface HtmlPreviewPlanRequest {
  /** Rewrite the head title so a printed PDF gets a Teams-safe filename. */
  readonly sanitizeTitle: boolean;
  /**
   * In installation order. Each head-open injection is installed ahead of the
   * ones before it, so list head content last-to-run first; body-end content
   * runs in list order.
   */
  readonly injections: readonly HtmlPreviewInjection[];
  /** A containment `<base>` (and its bridge), unless the author's base governs. */
  readonly containmentBase?: string | null;
}

export interface HtmlPreviewEdit {
  /** Byte offset in the source document. */
  readonly offset: number;
  /** Source bytes replaced from `offset`; zero for a pure insertion. */
  readonly deleteLength: number;
  readonly insert: Buffer;
}

/**
 * Turn a request into byte edits against one analyzed document.
 *
 * The placement rules reproduce, exactly, what applying each injection to the
 * document one after another would produce: a head injection lands right after
 * the real `<head>`; without one, the first injection synthesizes a `<head>`
 * after `<html>` and later ones join it; without either, content goes behind
 * the doctype. The containment base never synthesizes a head of its own.
 */
export function planHtmlPreviewEdits(
  facts: HtmlPreviewDocumentFacts,
  request: HtmlPreviewPlanRequest,
): HtmlPreviewEdit[] {
  const sanitized = request.sanitizeTitle;
  const pick = <T>(fact: TitleSensitive<T>): T => (sanitized ? fact.sanitizedTitle : fact.authored);
  const presentMarkers = pick(facts.presentMarkers);
  const installed: string[] = [];
  const headContent: string[] = [];
  const doctypeContent: string[] = [];
  const bodyEndContent: string[] = [];
  let synthesizedHead = false;

  const alreadyPresent = (marker: string | null): boolean => (
    marker !== null
    && (presentMarkers.has(marker) || installed.some((content) => content.includes(marker)))
  );
  const atHeadOpen = (content: string, mayCreateHead: boolean): void => {
    if (facts.headOpenEnd !== null || synthesizedHead) {
      headContent.unshift(content);
    } else if (mayCreateHead && facts.htmlOpenEnd !== null) {
      synthesizedHead = true;
      headContent.unshift(content);
    } else {
      doctypeContent.unshift(content);
    }
  };

  for (const injection of request.injections) {
    if (alreadyPresent(injection.marker)) continue;
    const content = injection.build({
      loadTimeLocationNavigation: pick(facts.loadTimeLocationNavigation)
        || installed.some((entry) => previewHtmlHasLoadTimeLocationNavigation(entry)),
    });
    if (injection.placement === 'body-end' && facts.bodyCloseStart !== null) {
      bodyEndContent.push(content);
    } else {
      atHeadOpen(content, true);
    }
    installed.push(content);
  }

  if (request.containmentBase) {
    const foreignContent = pick(facts.foreignContentSignal)
      || installed.some((content) => FOREIGN_CONTENT_SIGNAL.test(content));
    const authoredBaseGoverns = facts.hasRealBase || (foreignContent && facts.hasParsedHtmlBase);
    if (!authoredBaseGoverns) atHeadOpen(request.containmentBase, false);
  }

  const edits: Array<HtmlPreviewEdit & { rank: number }> = [];
  const insert = (offset: number, content: string, rank: number): void => {
    edits.push({ offset, deleteLength: 0, insert: Buffer.from(content, 'utf8'), rank });
  };
  if (sanitized && facts.title) {
    edits.push({
      offset: facts.title.contentStart,
      deleteLength: facts.title.contentEnd - facts.title.contentStart,
      insert: facts.title.sanitized,
      rank: 0,
    });
  }
  if (headContent.length > 0) {
    if (facts.headOpenEnd !== null) insert(facts.headOpenEnd, headContent.join(''), 0);
    else insert(facts.htmlOpenEnd!, `<head>${headContent.join('')}</head>`, 0);
  }
  if (doctypeContent.length > 0) insert(facts.afterDoctype, doctypeContent.join(''), 0);
  // Body-end content sits in front of `</body>`, so where it shares an offset
  // with head content, the head content comes first.
  if (bodyEndContent.length > 0) insert(facts.bodyCloseStart!, bodyEndContent.join(''), 1);

  return edits
    .sort((left, right) => left.offset - right.offset || left.rank - right.rank)
    .map(({ offset, deleteLength, insert: bytes }) => ({ offset, deleteLength, insert: bytes }));
}

/** A document the daemon serves: its bytes in memory, or a file it may stream. */
export type HtmlPreviewSource =
  | { readonly kind: 'buffer'; readonly bytes: Buffer }
  | { readonly kind: 'file'; readonly filePath: string; readonly size: number };

export function htmlPreviewSourceSize(source: HtmlPreviewSource): number {
  return source.kind === 'buffer' ? source.bytes.byteLength : source.size;
}

/** Size of the document once `edits` are applied. */
export function htmlPreviewEditedSize(sourceSize: number, edits: readonly HtmlPreviewEdit[]): number {
  return edits.reduce((size, edit) => size + edit.insert.byteLength - edit.deleteLength, sourceSize);
}

export async function readHtmlPreviewSource(source: HtmlPreviewSource): Promise<Buffer> {
  if (source.kind === 'buffer') return source.bytes;
  if (source.size > bufferConstants.MAX_STRING_LENGTH) {
    throw new HtmlPreviewDocumentTooLargeError(source.size);
  }
  return fs.promises.readFile(source.filePath);
}

export function applyHtmlPreviewEdits(bytes: Buffer, edits: readonly HtmlPreviewEdit[]): Buffer {
  if (edits.length === 0) return bytes;
  const parts: Buffer[] = [];
  let cursor = 0;
  for (const edit of edits) {
    parts.push(bytes.subarray(cursor, edit.offset), edit.insert);
    cursor = edit.offset + edit.deleteLength;
  }
  parts.push(bytes.subarray(cursor));
  return Buffer.concat(parts);
}

interface Segment {
  readonly start: number;
  readonly length: number;
  readonly content: Buffer | null;
  readonly sourceStart: number;
}

function editedSegments(sourceSize: number, edits: readonly HtmlPreviewEdit[]): Segment[] {
  const segments: Segment[] = [];
  let virtual = 0;
  let cursor = 0;
  const pushSource = (end: number): void => {
    const length = end - cursor;
    if (length > 0) segments.push({ start: virtual, length, content: null, sourceStart: cursor });
    virtual += Math.max(0, length);
  };
  for (const edit of edits) {
    pushSource(edit.offset);
    if (edit.insert.byteLength > 0) {
      segments.push({ start: virtual, length: edit.insert.byteLength, content: edit.insert, sourceStart: 0 });
      virtual += edit.insert.byteLength;
    }
    cursor = edit.offset + edit.deleteLength;
  }
  pushSource(sourceSize);
  return segments;
}

async function* readSourceRange(
  source: HtmlPreviewSource,
  start: number,
  end: number,
): AsyncGenerator<Buffer> {
  if (end < start) return;
  if (source.kind === 'buffer') {
    yield source.bytes.subarray(start, end + 1);
    return;
  }
  for await (const chunk of fs.createReadStream(source.filePath, { start, end })) {
    yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  }
}

/** Yield the inclusive byte `range` of the edited document. */
export async function* streamHtmlPreviewDocument(
  source: HtmlPreviewSource,
  edits: readonly HtmlPreviewEdit[],
  range: { start: number; end: number },
): AsyncGenerator<Buffer> {
  for (const segment of editedSegments(htmlPreviewSourceSize(source), edits)) {
    const segmentEnd = segment.start + segment.length - 1;
    const start = Math.max(range.start, segment.start);
    const end = Math.min(range.end, segmentEnd);
    if (start > end) continue;
    if (segment.content) {
      yield segment.content.subarray(start - segment.start, end - segment.start + 1);
      continue;
    }
    yield* readSourceRange(
      source,
      segment.sourceStart + (start - segment.start),
      segment.sourceStart + (end - segment.start),
    );
  }
}

/**
 * Yield the whole edited document with manual-edit source identities assigned
 * to its tags. Identities are counted over the edited document — injected
 * markup included — exactly as annotating the assembled string would.
 */
export async function* streamHtmlPreviewDocumentWithManualEditSource(
  source: HtmlPreviewSource,
  edits: readonly HtmlPreviewEdit[],
): AsyncGenerator<Buffer> {
  const decoder = new StringDecoder('utf8');
  const annotator = new ManualEditSourceAnnotator();
  const size = htmlPreviewEditedSize(htmlPreviewSourceSize(source), edits);
  for await (const chunk of streamHtmlPreviewDocument(source, edits, { start: 0, end: size - 1 })) {
    const transformed = annotator.push(decoder.write(chunk));
    if (transformed) yield Buffer.from(transformed);
  }
  const tail = annotator.push(decoder.end(), true);
  if (tail) yield Buffer.from(tail);
}

interface AnalysisEntry {
  readonly promise: Promise<HtmlPreviewDocumentFacts>;
  settled: boolean;
}

const DEFAULT_MAX_ENTRIES = 128;

/**
 * Facts per exact document version. A preview is refetched on every file
 * change and every viewer mount; analyzing the same bytes again each time would
 * make large documents pay for their size on every read. Facts depend on the
 * bytes alone, so the content digest is the whole key.
 */
export class HtmlPreviewDocumentIndex {
  readonly #entries = new Map<string, AnalysisEntry>();
  readonly #markers: readonly string[];
  readonly #maxEntries: number;

  constructor(options: { markers: readonly string[]; maxEntries?: number }) {
    this.#markers = options.markers;
    this.#maxEntries = Math.max(1, Math.floor(options.maxEntries ?? DEFAULT_MAX_ENTRIES));
  }

  get(request: {
    /** Content digest of `source`, e.g. `sha256:<hex>`. */
    documentVersion: string;
    source: HtmlPreviewSource;
    deckRuntimeModule?: boolean;
  }): Promise<HtmlPreviewDocumentFacts> {
    const wantsDeck = request.deckRuntimeModule === true;
    const key = `${request.documentVersion} ${wantsDeck ? 'deck' : 'plain'}`;
    const current = this.#entries.get(key);
    if (current) {
      this.#entries.delete(key);
      this.#entries.set(key, current);
      return current.promise;
    }
    const entry: AnalysisEntry = {
      settled: false,
      promise: readHtmlPreviewSource(request.source).then((bytes) => analyzeHtmlPreviewDocument(bytes, {
        markers: this.#markers,
        deckRuntimeModule: wantsDeck,
      })),
    };
    entry.promise.then(
      () => {
        entry.settled = true;
        this.#prune();
      },
      () => {
        if (this.#entries.get(key) === entry) this.#entries.delete(key);
      },
    );
    this.#entries.set(key, entry);
    this.#prune();
    return entry.promise;
  }

  #prune(): void {
    while (this.#entries.size > this.#maxEntries) {
      const oldestSettled = [...this.#entries].find(([, entry]) => entry.settled);
      if (!oldestSettled) return;
      this.#entries.delete(oldestSettled[0]);
    }
  }
}

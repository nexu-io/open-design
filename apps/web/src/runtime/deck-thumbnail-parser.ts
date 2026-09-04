// Static deck → per-slide thumbnail data.
//
// The thumbnail rail used to mount one full-deck `<iframe srcDoc={wholeDeck}>`
// per visible slide. Every thumbnail therefore parsed and *executed* the entire
// deck (fonts, scripts, the injected deck bridge's ~1.5s resize storm), so a
// deck open spun up ~16 live documents and saturated the main thread.
//
// This parser extracts, once per deck source, everything needed to render a
// single slide as inert DOM inside a shadow root (see DeckSlideThumbnail):
// the slide markup, the deck's stylesheets, the wrapper chain a slide's
// descendant selectors expect, and the design canvas size. No scripts run, no
// iframe is created.
//
// It is intentionally pure and synchronous (DOMParser only) so it memoizes on
// the source string and is unit-testable. Decks it cannot faithfully render
// statically (external layout CSS or script-built content) report
// `renderable: false` with a reason, and the caller keeps the old iframe
// thumbnail for that deck.

import DOMPurify from 'dompurify';

import {
  DECK_EXPLICIT_SLIDE_SELECTOR,
  DECK_SLIDE_SELECTOR,
  DECK_STRUCTURED_SLIDE_SELECTOR,
} from '@open-design/contracts/runtime/deck-stage-fallback';
import { collectLegacyDeckScreenSlides } from './deck-slide-structure';

export type DeckThumbnailFallbackReason =
  | 'no-dom-parser'
  | 'no-slides'
  | 'no-styles'
  | 'viewport-media-query'
  | 'external-stylesheet';

/** One reconstructed wrapper element between the shadow root and the slide. */
export interface DeckThumbnailAncestor {
  tag: string;
  attributes: Array<[string, string]>;
}

export interface ParsedDeckThumbnails {
  /** When false, the caller must fall back to the iframe thumbnail. */
  renderable: boolean;
  reason?: DeckThumbnailFallbackReason;
  /** `outerHTML` of each slide, in document order. */
  slides: string[];
  /** Concatenated deck stylesheets, root selectors rewritten for shadow DOM,
   *  `@font-face` stripped (see `fontFaces`), relative `url()` absolutized. */
  styleText: string;
  /** `@font-face` blocks lifted out of `styleText` — must live in the host
   *  document, since `@font-face` inside a shadow root is ignored. */
  fontFaces: string;
  /** External font-stylesheet hrefs (Google Fonts, Typekit, …) to load in the
   *  host `<head>` so the shadow content can use them. */
  fontLinks: string[];
  /** Wrapper chain from outermost→innermost (excludes `<html>`/`<body>` and the
   *  slide itself), e.g. `[.deck-shell, .deck-stage]` or `[deck-stage]`. */
  ancestors: DeckThumbnailAncestor[];
  designWidth: number;
  designHeight: number;
}

const DEFAULT_DESIGN_WIDTH = 1920;
const DEFAULT_DESIGN_HEIGHT = 1080;
const MAX_SLIDES = 200;

const FONT_HOSTS = new Set([
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'use.typekit.net',
  'fonts.bunny.net',
  'fonts.cdnfonts.com',
]);

// A font stylesheet link is re-loaded document-wide by DeckSlideThumbnail, so it
// must be an https URL whose HOST is exactly an approved font CDN — a substring
// match would accept `https://evil.example/fonts.googleapis.com.css` and inject
// arbitrary CSS into the app document.
export function isApprovedFontStylesheetHref(href: string): boolean {
  // Font-CDN links are always absolute https URLs; a relative href cannot be an
  // approved CDN and is correctly treated as an untrusted external stylesheet.
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && FONT_HOSTS.has(url.hostname.toLowerCase());
}

function unrenderable(reason: DeckThumbnailFallbackReason): ParsedDeckThumbnails {
  return {
    renderable: false,
    reason,
    slides: [],
    styleText: '',
    fontFaces: '',
    fontLinks: [],
    ancestors: [],
    designWidth: DEFAULT_DESIGN_WIDTH,
    designHeight: DEFAULT_DESIGN_HEIGHT,
  };
}

export function parseDeckThumbnails(html: string, baseHref?: string): ParsedDeckThumbnails {
  if (typeof DOMParser === 'undefined') return unrenderable('no-dom-parser');
  if (!html || !html.trim()) return unrenderable('no-slides');

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return unrenderable('no-dom-parser');
  }

  const slideEls = collectSlideElements(doc);
  if (slideEls.length === 0) return unrenderable('no-slides');

  // External layout CSS we cannot inline means the static clone would be
  // unstyled. Font stylesheets are the exception — we re-load those in the host
  // head instead.
  const fontLinks: string[] = [];
  const linkEls = Array.from(doc.querySelectorAll('link'));
  for (const link of linkEls) {
    const rel = (link.getAttribute('rel') || '').toLowerCase();
    if (!/\bstylesheet\b/.test(rel)) continue;
    const href = link.getAttribute('href') || '';
    if (!href) continue;
    if (isApprovedFontStylesheetHref(href)) {
      if (!fontLinks.includes(href)) fontLinks.push(href);
    } else {
      return unrenderable('external-stylesheet');
    }
  }

  // Strip CSS comments once, up-front. Every downstream rewrite here (viewport
  // units, url() absolutizing, @font-face lifting, and crucially the
  // `:root`/`html`/`body` → `:host` rewrite) is regex-based and treats a comment
  // as opaque selector text. A banner comment immediately before the custom
  // property block — `/* === VIEWPORT BASE === */\n:root { … }`, which real
  // decks routinely emit — would otherwise leave `:root` unrewritten; `:root`
  // matches nothing inside a shadow root, so every deck variable goes undefined
  // and each `var(--slide-bg)` resolves to transparent, painting nothing over
  // the near-black thumbnail host (black thumbnails). Comments are inert, so
  // removing them changes only which selectors the rewrites can see.
  const styleBlocks = Array.from(doc.querySelectorAll('style')).map((el) => el.textContent || '');
  const styleWithImports = styleBlocks.join('\n');
  if (!styleWithImports.trim()) return unrenderable('no-styles');

  // Constructable stylesheets ignore @import, so leaving an approved webfont
  // import in styleText silently changes typography and line wrapping in the
  // shadow thumbnail. Lift approved font imports into the host alongside
  // <link> fonts; any other import may contain layout CSS we cannot reproduce
  // safely, so use the isolated iframe fallback instead.
  const importedBlocks = styleBlocks.map(extractStylesheetImports);
  if (importedBlocks.some((imported) => imported.unsafe)) {
    return unrenderable('external-stylesheet');
  }
  for (const imported of importedBlocks) {
    for (const href of imported.fontLinks) {
      if (!fontLinks.includes(href)) fontLinks.push(href);
    }
  }
  const rawStyle = stripCssComments(importedBlocks.map((imported) => imported.css).join('\n'));
  if (!rawStyle.trim()) return unrenderable('no-styles');
  // A shadow-root thumbnail's @media rules evaluate against the Open Design
  // host window, not the preview iframe. A deck can therefore take its desktop
  // branch in the rail while the visible preview takes its mobile branch. Keep
  // these decks on the isolated iframe fallback, whose viewport is explicitly
  // matched to the live preview by DeckThumbnailRail.
  if (hasViewportMediaQuery(rawStyle)) return unrenderable('viewport-media-query');

  const designSize = resolveDesignSize(doc, rawStyle);

  // Rewrite viewport units to their px-equivalent against the design canvas so
  // `4vh` on a 1080-tall slide becomes `calc(4 * 10.8px)`. Inside a shadow root
  // `vw`/`vh` would otherwise resolve to the host window; rewriting makes them
  // resolve to the slide canvas — exactly the full-screen 16:9 viewport the
  // deck was authored against — so the miniature stays faithful. No-op for the
  // many px-only decks (they carry no viewport units).
  const withViewport = rewriteViewportUnits(rawStyle, designSize.width, designSize.height);
  const absolutized = baseHref ? absolutizeCssUrls(withViewport, baseHref) : withViewport;
  const { css: withoutFonts, fontFaces } = extractFontFaces(absolutized);
  const styleText = rewriteRootSelectors(withoutFonts);

  const ancestors = collectAncestors(slideEls[0]!);
  const slides = slideEls
    .slice(0, MAX_SLIDES)
    .map((el) => processSlideHtml(el, baseHref, designSize.width, designSize.height));

  return {
    renderable: true,
    slides,
    styleText,
    fontFaces,
    fontLinks,
    ancestors,
    designWidth: designSize.width,
    designHeight: designSize.height,
  };
}

const VIEWPORT_UNIT_TOKEN_RE = /(-?\d*\.?\d+)\s*(vw|vh|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh)\b/gi;
const MEDIA_QUERY_PRELUDE_RE = /@media\s+([^{}]*)\{/gi;
const VIEWPORT_MEDIA_FEATURE_PATTERNS = [
  /\b(?:min|max)-(?:width|height)\b/i,
  /\b(?:width|height|orientation|aspect-ratio)\b\s*:/i,
  /\b(?:width|height|aspect-ratio)\b\s*(?:[<>]=?|=)/i,
  /(?:[<>]=?|=)\s*\b(?:width|height|aspect-ratio)\b/i,
] as const;

function hasViewportMediaQuery(css: string): boolean {
  for (const match of css.matchAll(MEDIA_QUERY_PRELUDE_RE)) {
    const prelude = match[1] ?? '';
    if (VIEWPORT_MEDIA_FEATURE_PATTERNS.some((pattern) => pattern.test(prelude))) return true;
  }
  return false;
}

// Replace each `<n><viewport-unit>` with `calc(<n> * <k>px)` where `k` is the
// design canvas dimension / 100. Works inside `clamp()`/`min()`/`max()` and
// even media-feature values (calc is valid there). Length-relative units only.
function rewriteViewportUnits(css: string, width: number, height: number): string {
  const vmin = Math.min(width, height);
  const vmax = Math.max(width, height);
  return css.replace(VIEWPORT_UNIT_TOKEN_RE, (_whole, num: string, unit: string) => {
    const u = unit.toLowerCase();
    let reference: number;
    if (u.endsWith('vw')) reference = width;
    else if (u.endsWith('vh')) reference = height;
    else if (u === 'vmin') reference = vmin;
    else reference = vmax;
    return `calc(${num} * ${reference / 100}px)`;
  });
}

function collectSlideElements(doc: Document): Element[] {
  const deckStage = doc.querySelector('deck-stage');
  if (deckStage) {
    const nested = Array.from(deckStage.querySelectorAll(DECK_SLIDE_SELECTOR));
    const direct = nested.filter((slide) => slide.parentElement === deckStage);
    if (direct.length > 0) return direct;
    if (nested.length > 0) return nested;
  }
  const structured = Array.from(doc.querySelectorAll(DECK_STRUCTURED_SLIDE_SELECTOR));
  if (structured.length > 0) return structured;
  const explicit = Array.from(doc.querySelectorAll(DECK_EXPLICIT_SLIDE_SELECTOR));
  if (explicit.length > 0) return explicit;
  return collectLegacyDeckScreenSlides(doc);
}

// Walk from the slide's parent up to (but excluding) <body>/<html>, so
// descendant selectors like `.deck-stage .title` or `deck-stage > section.slide`
// still match once the slide is re-parented into the shadow root.
function collectAncestors(slide: Element): DeckThumbnailAncestor[] {
  const chain: DeckThumbnailAncestor[] = [];
  let node = slide.parentElement;
  while (node) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'body' || tag === 'html') break;
    // These wrappers are reconstructed as live elements in the app-origin shadow
    // DOM by DeckSlideThumbnail, so a wrapper is a second injection path for
    // untrusted deck markup and is sanitized the same way as the slide body.
    chain.push(sanitizeThumbnailAncestor(node));
    node = node.parentElement;
  }
  return chain.reverse();
}

interface DesignSize {
  width: number;
  height: number;
}

// Design canvas size (viewport-unit decks are already excluded upstream):
// explicit `<deck-stage width height>`, then an explicit px `width`+`height` on
// a stage/slide rule, else the 1920×1080 default.
const STAGE_SIZE_TARGET_RE =
  /(?:^|[^\w-])deck-stage(?![\w-])|(?:\.deck-stage|\.canvas|#deck|\.deck|\.slide|\.slide-frame|\.ppt-slide|\.deck-slide|\[data-screen-label(?:[\s~|^$*]?=[^\]]+)?\])(?![\w-])/i;

// A size declaration only describes the design canvas when the rule's TARGET
// is a stage/slide. Merely mentioning `.slide` in an ancestor is insufficient:
// real decks commonly contain rules such as `.slide .kicker-line { width:72px;
// height:6px }`. Treating that decoration as the canvas collapses the whole
// thumbnail into a 72x6 strip.
function selectorTargetsStageOrSlide(selectorList: string): boolean {
  return selectorList.split(',').some((selector) => {
    const trimmed = selector.trim();
    if (!trimmed || /::(?:before|after)\b/i.test(trimmed)) return false;
    const compounds = trimmed.split(/\s+|[>+~]/).filter(Boolean);
    const target = compounds.at(-1) ?? '';
    return STAGE_SIZE_TARGET_RE.test(target);
  });
}

function resolveDesignSize(doc: Document, css: string): DesignSize {
  const stage = doc.querySelector('deck-stage[width][height]');
  if (stage) {
    const w = Number(stage.getAttribute('width'));
    const h = Number(stage.getAttribute('height'));
    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
      return { width: w, height: h };
    }
  }

  for (const block of iterateRuleBlocks(css)) {
    if (!selectorTargetsStageOrSlide(block.selector)) continue;
    const width = matchPxLength(block.body, 'width');
    const height = matchPxLength(block.body, 'height');
    if (width && height) return { width, height };
  }

  return { width: DEFAULT_DESIGN_WIDTH, height: DEFAULT_DESIGN_HEIGHT };
}

interface RuleBlock {
  selector: string;
  body: string;
}

// Cheap top-level rule walker. Good enough for the well-formed, single-file
// decks the deck framework emits; nested at-rules (@media) are flattened so
// their inner rules are still visited.
function* iterateRuleBlocks(css: string): Generator<RuleBlock> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(withoutComments))) {
    yield { selector: (match[1] || '').trim(), body: match[2] || '' };
  }
}

function matchPxLength(body: string, prop: 'width' | 'height'): number | null {
  const re = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([\\d.]+)\\s*px`, 'i');
  const m = re.exec(body);
  if (!m || !m[1]) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

// Remove `/* … */` comments. Naive (a `/*` inside a string/url() literal would
// be mis-stripped) but matches how `iterateRuleBlocks` already treats comments,
// and deck CSS effectively never puts comment markers inside string values.
function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

interface StylesheetImportExtraction {
  css: string;
  fontLinks: string[];
  unsafe: boolean;
}

const CSS_IMPORT_HREF_RE =
  /^@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^'"\s][^)]*))\s*\)|"([^"]*)"|'([^']*)')/i;

function isCssIdentifierChar(char: string | undefined): boolean {
  return !!char && /[\w-]/.test(char);
}

function findCssImportEnd(css: string, start: number): number | null {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let inComment = false;
  let parenDepth = 0;

  for (let i = start + '@import'.length; i < css.length; i += 1) {
    const char = css[i]!;
    const next = css[i + 1];
    if (inComment) {
      if (char === '*' && next === '/') {
        inComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '*') {
      inComment = true;
      i += 1;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '(') {
      parenDepth += 1;
    } else if (char === ')') {
      if (parenDepth === 0) return null;
      parenDepth -= 1;
    } else if (char === ';' && parenDepth === 0) {
      return i + 1;
    } else if (char === '{' && parenDepth === 0) {
      return null;
    }
  }
  return null;
}

function extractStylesheetImports(css: string): StylesheetImportExtraction {
  const fontLinks: string[] = [];
  let unsafe = false;
  const chunks: string[] = [];
  let chunkStart = 0;
  let braceDepth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let inComment = false;
  let importPreludeOpen = true;

  for (let i = 0; i < css.length; i += 1) {
    const char = css[i]!;
    const next = css[i + 1];
    if (inComment) {
      if (char === '*' && next === '/') {
        inComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '*') {
      inComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      if (braceDepth === 0) importPreludeOpen = false;
      continue;
    }
    if (char === '{') {
      braceDepth += 1;
      continue;
    }
    if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (
      char !== '@' ||
      css.slice(i, i + '@import'.length).toLowerCase() !== '@import' ||
      isCssIdentifierChar(css[i + '@import'.length])
    ) {
      if (braceDepth === 0 && !/\s/.test(char)) importPreludeOpen = false;
      continue;
    }

    if (braceDepth !== 0 || !importPreludeOpen) {
      unsafe = true;
      continue;
    }
    const end = findCssImportEnd(css, i);
    if (end === null) {
      unsafe = true;
      continue;
    }
    const statement = css.slice(i, end);
    const match = CSS_IMPORT_HREF_RE.exec(statement);
    const href = match?.slice(1).find((value): value is string => typeof value === 'string')?.trim() ?? '';
    const condition = match ? statement.slice(match[0].length, -1).trim() : '';
    if (!href || condition || !isApprovedFontStylesheetHref(href)) unsafe = true;
    else if (!fontLinks.includes(href)) fontLinks.push(href);

    chunks.push(css.slice(chunkStart, i));
    chunkStart = end;
    i = end - 1;
  }

  chunks.push(css.slice(chunkStart));
  return { css: chunks.join(''), fontLinks, unsafe };
}

// Rewrite `:root`/`html` to `:host`, so document-level variables inherit into
// the reconstructed slide. Body rules belong on the design canvas itself: host
// page styles intentionally own the shadow host's dark thumbnail frame and win
// over ordinary `:host` declarations, which used to hide transparent slides on
// that dark frame. Applying body paint/layout to `.od-thumb-canvas` preserves
// the source deck's paper/background inside the frame. Compound selectors like
// `body.dark` are left untouched.
function rewriteRootSelectors(css: string): string {
  return css.replace(
    /(^|[{};,])(\s*)(:root|html|body)(\s*)(?=[,{])/g,
    (_whole, prefix: string, whitespace: string, selector: string, trailing: string) =>
      `${prefix}${whitespace}${selector.toLowerCase() === 'body' ? '.od-thumb-canvas' : ':host'}${trailing}`,
  );
}

// Lift `@font-face` blocks out; they're ignored inside a shadow root and must be
// registered in the host document instead.
function extractFontFaces(css: string): { css: string; fontFaces: string } {
  const faces: string[] = [];
  const stripped = css.replace(/@font-face\s*\{[^}]*\}/gi, (block) => {
    faces.push(block);
    return '';
  });
  return { css: stripped, fontFaces: faces.join('\n') };
}

function absolutizeCssUrls(css: string, baseHref: string): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (whole, quote, url) => {
    const abs = absolutizeUrl(url, baseHref);
    return abs === url ? whole : `url(${quote}${abs}${quote})`;
  });
}

// DOMPurify configuration for a deck THUMBNAIL. DOMPurify's default profile
// already removes <script>, inline event-handler attributes, javascript: /
// vbscript: URLs, and mutation/animation vectors (including SVG SMIL that could
// re-write an attribute after insertion). On top of that we forbid interactive,
// navigable, and embedding elements so the static thumbnail stays inert and
// cannot navigate, submit, embed, or animate itself back to life. Custom deck
// elements (e.g. <deck-stage>) are allowed through as inert unknown elements so
// descendant CSS selectors keep matching.
const THUMBNAIL_SANITIZE_CONFIG = {
  FORBID_TAGS: [
    'a', 'area', 'audio', 'base', 'button', 'details', 'embed', 'form', 'iframe',
    'input', 'link', 'marquee', 'meta', 'object', 'select', 'source', 'style',
    'summary', 'textarea', 'track', 'video',
    'animate', 'animatecolor', 'animatemotion', 'animatetransform', 'set',
  ],
  FORBID_ATTR: ['autofocus', 'tabindex', 'target', 'ping', 'formaction', 'action'],
  CUSTOM_ELEMENT_HANDLING: {
    // Only the deck runtime's own `deck-*` custom elements are allowed through.
    // A broader match would let an untrusted deck name an element the app has
    // registered, which would upgrade and run its lifecycle callbacks once
    // appended to the live DOM.
    tagNameCheck: /^deck-[a-z0-9-]*$/,
    attributeNameCheck: null,
    allowCustomizedBuiltInElements: false,
  },
};

// Sanitize untrusted deck markup and return its single sanitized root element,
// or null when the result is not exactly one element (e.g. a forbidden root
// that DOMPurify unwrapped into several top-level nodes). RETURN_DOM yields a
// <body> wrapper whose children are the sanitized top-level nodes; a forbidden
// root that unwraps to one safe child renders as that (already-sanitized) child.
function sanitizeThumbnailMarkup(html: string): Element | null {
  const body = DOMPurify.sanitize(html, {
    ...THUMBNAIL_SANITIZE_CONFIG,
    RETURN_DOM: true,
    WHOLE_DOCUMENT: false,
  }) as unknown as HTMLElement;
  if (body.children.length !== 1) return null;
  return body.firstElementChild;
}

// Sanitize a single reconstructed wrapper element (tag + attributes only). An
// unsafe wrapper that DOMPurify drops falls back to a plain <div> so the CSS
// chain depth the slide's descendant selectors expect is preserved.
function sanitizeThumbnailAncestor(node: Element): DeckThumbnailAncestor {
  const shell = node.cloneNode(false) as Element;
  const clean = sanitizeThumbnailMarkup(shell.outerHTML);
  if (!clean) return { tag: 'div', attributes: [] };
  return {
    tag: clean.tagName.toLowerCase(),
    attributes: Array.from(clean.attributes).map((a) => [a.name, a.value] as [string, string]),
  };
}

// Clone the slide and normalize it for shadow rendering: sanitize the untrusted
// markup with DOMPurify (it is mounted into the app-origin shadow DOM by
// DeckSlideThumbnail), rewrite inline-style viewport units to canvas px, and
// (when a base href is known) rewrite relative asset references to absolute — a
// shadow root carries no <base>, so relative URLs would otherwise resolve
// against the host app page. If sanitizing does not yield exactly one root
// element (e.g. a forbidden root unwraps to several nodes) the slide renders a
// neutral placeholder instead.
function processSlideHtml(el: Element, baseHref: string | undefined, width: number, height: number): string {
  const clone = sanitizeThumbnailMarkup(el.outerHTML);
  if (!clone) return '<div data-od-thumb-unsafe=""></div>';
  const nodes = [clone, ...Array.from(clone.querySelectorAll('[src], [srcset], [style], [href]'))];
  for (const node of nodes) {
    if (baseHref) {
      const src = node.getAttribute('src');
      if (src) node.setAttribute('src', absolutizeUrl(src, baseHref));
      const href = node.getAttribute('href');
      if (href && node.tagName.toLowerCase() !== 'a') node.setAttribute('href', absolutizeUrl(href, baseHref));
      const srcset = node.getAttribute('srcset');
      if (srcset) node.setAttribute('srcset', absolutizeSrcset(srcset, baseHref));
    }
    let style = node.getAttribute('style');
    if (style) {
      style = rewriteViewportUnits(style, width, height);
      if (baseHref && style.includes('url(')) style = absolutizeCssUrls(style, baseHref);
      node.setAttribute('style', style);
    }
  }
  return clone.outerHTML;
}

function absolutizeSrcset(srcset: string, baseHref: string): string {
  return srcset
    .split(',')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return trimmed;
      const segments = trimmed.split(/\s+/);
      const url = segments[0];
      if (!url) return trimmed;
      return [absolutizeUrl(url, baseHref), ...segments.slice(1)].join(' ');
    })
    .join(', ');
}

// Resolve a relative URL against the deck's directory base. Leaves already-
// absolute / root-relative / protocol / data / blob / hash URLs untouched.
function absolutizeUrl(rawUrl: string, baseHref: string): string {
  const url = rawUrl.trim();
  if (!url) return rawUrl;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(url)) return rawUrl;
  const baseIsHttp = /^https?:\/\//i.test(baseHref);
  const baseAbs = baseIsHttp
    ? baseHref
    : `http://_od_deck_base${baseHref.startsWith('/') ? '' : '/'}${baseHref}`;
  const baseDir = baseAbs.endsWith('/') ? baseAbs : `${baseAbs}/`;
  try {
    const resolved = new URL(url, baseDir);
    return baseIsHttp ? resolved.href : resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return rawUrl;
  }
}

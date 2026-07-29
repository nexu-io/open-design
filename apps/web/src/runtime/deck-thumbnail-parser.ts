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
// statically (external layout CSS, viewport-unit slides, script-built content)
// report `renderable: false` with a reason, and the caller keeps the old
// iframe thumbnail for that deck.

import DOMPurify from 'dompurify';

import { DECK_SLIDE_SELECTOR } from '@open-design/contracts/runtime/deck-stage-fallback';

export type DeckThumbnailFallbackReason =
  | 'no-dom-parser'
  | 'no-slides'
  | 'no-styles'
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
  /** Concatenated deck stylesheets, `:root`/`html`/`body` rewritten to `:host`,
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

// Structured-first slide detection, mirroring the deck bridge's `slides()` in
// srcdoc.ts: prefer slides that are direct children of a recognized stage so
// decorative `.slide` markup elsewhere isn't miscounted, then fall back to the
// shared selector.
const STRUCTURED_SLIDE_SELECTOR =
  'deck-stage > .slide, .deck > .slide, .deck-stage > .slide, .deck-shell > .slide, ' +
  '#deck > .slide, body > .slide, ' +
  'deck-stage > [data-screen-label], .deck-stage > [data-screen-label], ' +
  '#deck > [data-screen-label], body > [data-screen-label]';

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
function isApprovedFontHref(href: string): boolean {
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
    if (isApprovedFontHref(href)) {
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
  const rawStyle = stripCssComments(
    Array.from(doc.querySelectorAll('style'))
      .map((el) => el.textContent || '')
      .join('\n'),
  );
  if (!rawStyle.trim()) return unrenderable('no-styles');

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
  const structured = Array.from(doc.querySelectorAll(STRUCTURED_SLIDE_SELECTOR));
  if (structured.length > 0) return structured;
  return Array.from(doc.querySelectorAll(DECK_SLIDE_SELECTOR));
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
const STAGE_SIZE_SELECTOR_RE =
  /(?:\bdeck-stage\b|\.deck-stage\b|\.canvas\b|#deck\b|\.deck\b|\.slide\b|\.ppt-slide\b|\.deck-slide\b|\[data-screen-label\])/i;

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
    if (!STAGE_SIZE_SELECTOR_RE.test(block.selector)) continue;
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

// Rewrite `:root`, `html`, and `body` (as standalone selectors in a selector
// list) to `:host`, so the deck's custom properties, base font, and base color
// land on the shadow host and inherit into the re-parented slide. Compound
// selectors like `body.dark` are left untouched (they'd match nothing, but
// forcing them onto `:host` risks unwanted rules).
function rewriteRootSelectors(css: string): string {
  return css.replace(/(^|[{};,])(\s*)(:root|html|body)(\s*)(?=[,{])/g, '$1$2:host$4');
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

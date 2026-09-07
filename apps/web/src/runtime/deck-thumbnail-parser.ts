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
  | 'external-stylesheet'
  | 'unresolved-theme-variable';

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
  /** `<html>`+`<body>` attributes the thumbnail canvas must carry. The canvas
   *  is the shadow-tree stand-in for the document root chain, so a deck that
   *  selects its active theme with `body[data-theme="holm"]` only matches once
   *  the canvas actually wears `data-theme="holm"` (see `rewriteRootSelectors`). */
  canvasAttributes: Array<[string, string]>;
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
    canvasAttributes: [],
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
  const canvasAttributes = collectCanvasAttributes(doc);

  // Last line of defence for the whole rewrite pipeline: if the canvas still
  // cannot resolve the custom properties it paints itself with, this deck would
  // render as an unthemed (typically white-on-white) miniature. Render it in the
  // isolated iframe instead of shipping a thumbnail that does not look like the
  // slide.
  if (findUnresolvedThemeVariable(styleText, canvasAttributes)) {
    return unrenderable('unresolved-theme-variable');
  }

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
    canvasAttributes,
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

const CANVAS_CLASS = 'od-thumb-canvas';
const CANVAS_SELECTOR = `.${CANVAS_CLASS}`;
const HOST_SELECTOR = ':host';

// The shadow thumbnail has no `<html>` and no `<body>`. `.od-thumb-canvas` is
// their stand-in: it is the outermost element of the slide's shadow tree and it
// wears the merged `<html>`+`<body>` attributes (see `collectCanvasAttributes`),
// so root-scoped selectors can be re-pointed at it and still discriminate.
//
// Rewrite rules, per compound selector:
//   - `body`, and any `body[attr]` / `body.class` / `body#id` → `.od-thumb-canvas…`
//     keeping the qualifiers, so `body[data-theme="holm"]` matches the canvas
//     when (and only when) the source body actually carried that theme. A deck
//     that ships eight themes and activates one via the body attribute
//     therefore keeps exactly the active one — the other seven rewrite to
//     `.od-thumb-canvas[data-theme="helix"]` etc. and match nothing.
//   - bare `:root` / `html` → `:host`. Document-level custom properties belong
//     on the host so they inherit into the whole shadow tree, and host page
//     styles intentionally own the shadow host's dark thumbnail frame.
//   - `:root`/`html` carrying a STRUCTURAL qualifier (`html[data-theme]`,
//     `:root.dark`) → `.od-thumb-canvas…`, because the qualifier lives on an
//     element the shadow tree no longer has; the canvas is the element that
//     inherited it. Pseudo-only qualifiers (`html:hover`, `:root::before`) stay
//     on `:host`, where they still describe the same box.
// Adjacent canvas-derived compounds then collapse (`html[data-theme="x"] body`
// → `.od-thumb-canvas[data-theme="x"]`), since both halves now name one element.
function rewriteRootSelectors(css: string): string {
  return mapRulePreludes(css, rewriteSelectorList);
}

// Walk top-level CSS structure and hand every RULE prelude (the selector list
// before a `{`) to `rewrite`. At-rule preludes (`@media …`, `@supports …`) and
// keyframe stops (`from`, `0%`) are selector-shaped but are not element
// selectors, so they pass through untouched; the rules nested inside an
// `@media` block still get rewritten because they carry their own prelude.
// Comments are already stripped upstream by `stripCssComments`.
function mapRulePreludes(css: string, rewrite: (prelude: string) => string): string {
  let out = '';
  let segmentStart = 0;
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  // Depths at which an `@keyframes` block was opened; its children are stops.
  const keyframeDepths: number[] = [];

  for (let i = 0; i < css.length; i += 1) {
    const char = css[i]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') {
      const prelude = css.slice(segmentStart, i);
      const trimmed = prelude.trim();
      const insideKeyframes = keyframeDepths.length > 0;
      out += trimmed.startsWith('@') || insideKeyframes ? prelude : rewrite(prelude);
      if (/^@(?:-[\w-]+-)?keyframes\b/i.test(trimmed)) keyframeDepths.push(depth);
      out += '{';
      depth += 1;
      segmentStart = i + 1;
    } else if (char === '}') {
      out += css.slice(segmentStart, i + 1);
      depth = Math.max(0, depth - 1);
      if (keyframeDepths.at(-1) === depth) keyframeDepths.pop();
      segmentStart = i + 1;
    } else if (char === ';') {
      out += css.slice(segmentStart, i + 1);
      segmentStart = i + 1;
    }
  }
  return out + css.slice(segmentStart);
}

function rewriteSelectorList(prelude: string): string {
  return splitTopLevel(prelude, ',')
    .map((piece) => {
      const leading = /^\s*/.exec(piece)?.[0] ?? '';
      const trailing = /\s*$/.exec(piece)?.[0] ?? '';
      const core = piece.slice(leading.length, piece.length - trailing.length);
      if (!core) return piece;
      return `${leading}${rewriteSelector(core)}${trailing}`;
    })
    .join(',');
}

type CompoundKind = 'canvas' | 'host' | 'other';

interface RewrittenCompound {
  combinator: string;
  kind: CompoundKind;
  /** Everything after the stand-in selector, e.g. `[data-theme="holm"]`. */
  qualifiers: string;
  text: string;
}

const ROOT_KEYWORD_RE = /^(:root|html|body)(?![\w-])/i;
// `[`, `.` and `#` are the qualifiers that live ON the element; a compound that
// carries one cannot survive as `:host`, because the attribute/class/id moved
// to the canvas with `collectCanvasAttributes`.
const STRUCTURAL_QUALIFIER_RE = /[[.#]/;

function rewriteSelector(selector: string): string {
  const parts = splitCompounds(selector).map<RewrittenCompound>(({ combinator, compound }) => {
    const keyword = ROOT_KEYWORD_RE.exec(compound);
    if (!keyword) return { combinator, kind: 'other', qualifiers: '', text: compound };
    const qualifiers = compound.slice(keyword[0].length);
    const isBody = keyword[1]!.toLowerCase() === 'body';
    if (isBody || STRUCTURAL_QUALIFIER_RE.test(qualifiers)) {
      return { combinator, kind: 'canvas', qualifiers, text: `${CANVAS_SELECTOR}${qualifiers}` };
    }
    return { combinator, kind: 'host', qualifiers, text: `${HOST_SELECTOR}${qualifiers}` };
  });

  // `html[data-theme="x"] body` names one element twice now; keep one compound
  // carrying both sets of qualifiers instead of emitting a selector
  // (`.od-thumb-canvas[…] .od-thumb-canvas`) that can never match.
  const collapsed: RewrittenCompound[] = [];
  for (const part of parts) {
    const previous = collapsed.at(-1);
    const joinedByDescent = part.combinator === '' || part.combinator === '>';
    if (previous && previous.kind === 'canvas' && part.kind === 'canvas' && joinedByDescent) {
      const qualifiers = `${previous.qualifiers}${part.qualifiers}`;
      collapsed[collapsed.length - 1] = {
        combinator: previous.combinator,
        kind: 'canvas',
        qualifiers,
        text: `${CANVAS_SELECTOR}${qualifiers}`,
      };
      continue;
    }
    collapsed.push(part);
  }

  return collapsed
    .map((part, index) => {
      if (index === 0) return part.text;
      return part.combinator === '' ? ` ${part.text}` : ` ${part.combinator} ${part.text}`;
    })
    .join('');
}

/** Split on a top-level separator, ignoring ones inside `[]`, `()` or strings. */
function splitTopLevel(text: string, separator: string): string[] {
  const pieces: string[] = [];
  let current = '';
  let brackets = 0;
  let parens = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (const char of text) {
    if (quote) {
      current += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '[') brackets += 1;
    else if (char === ']') brackets = Math.max(0, brackets - 1);
    else if (char === '(') parens += 1;
    else if (char === ')') parens = Math.max(0, parens - 1);
    if (char === separator && brackets === 0 && parens === 0) {
      pieces.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  pieces.push(current);
  return pieces;
}

interface SelectorCompound {
  /** `''` for the descendant combinator (and for the first compound). */
  combinator: string;
  compound: string;
}

/** Split a complex selector into its compounds and the combinators between. */
function splitCompounds(selector: string): SelectorCompound[] {
  const parts: SelectorCompound[] = [];
  let current = '';
  let pending = '';
  let brackets = 0;
  let parens = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  const flush = () => {
    if (!current) return;
    parts.push({ combinator: parts.length === 0 ? '' : pending, compound: current });
    current = '';
    pending = '';
  };

  for (const char of selector) {
    if (quote) {
      current += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === '[') brackets += 1;
    else if (char === ']') brackets = Math.max(0, brackets - 1);
    else if (char === '(') parens += 1;
    else if (char === ')') parens = Math.max(0, parens - 1);
    if (brackets === 0 && parens === 0) {
      if (/\s/.test(char)) {
        flush();
        // Descendant, unless an explicit combinator is already pending
        // (`a > b` sees a space, then `>`, then a space).
        continue;
      }
      if (char === '>' || char === '+' || char === '~') {
        flush();
        pending = char;
        continue;
      }
    }
    current += char;
  }
  flush();
  return parts;
}

// The canvas is the only element that can carry what `<html>`/`<body>` carried,
// so it inherits both elements' attributes (body wins a name collision, classes
// are unioned). Attributes come from untrusted deck markup and are applied to a
// live element in the app-origin shadow DOM, so they go through the same
// DOMPurify profile as the reconstructed wrapper chain.
function collectCanvasAttributes(doc: Document): Array<[string, string]> {
  const merged = new Map<string, string>();
  const classes: string[] = [];
  for (const el of [doc.documentElement, doc.body]) {
    if (!el) continue;
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase() === 'class') {
        for (const token of attr.value.split(/\s+/)) {
          if (token && !classes.includes(token)) classes.push(token);
        }
        continue;
      }
      merged.set(attr.name, attr.value);
    }
  }
  if (classes.length > 0) merged.set('class', classes.join(' '));
  if (merged.size === 0) return [];

  const probe = doc.createElement('div');
  for (const [name, value] of merged) {
    try {
      probe.setAttribute(name, value);
    } catch {
      // Ignore attribute names the source made up that the DOM rejects.
    }
  }
  const clean = sanitizeThumbnailMarkup(probe.outerHTML);
  if (!clean) return [];
  return Array.from(clean.attributes).map((a) => [a.name, a.value] as [string, string]);
}

// Properties whose failure is visible as "this thumbnail does not look like the
// slide at all": an unresolved `background`/`color` paints the canvas
// transparent and the text in the inherited colour, which is how a deck ends up
// rendering white-on-white.
const CRITICAL_PAINT_PROPS = new Set(['background', 'background-color', 'color']);

interface CanvasIdentity {
  classes: Set<string>;
  attributes: Map<string, string>;
}

function canvasIdentity(canvasAttributes: Array<[string, string]>): CanvasIdentity {
  const attributes = new Map<string, string>();
  const classes = new Set<string>([CANVAS_CLASS]);
  for (const [name, value] of canvasAttributes) {
    const lower = name.toLowerCase();
    attributes.set(lower, value);
    if (lower === 'class') {
      for (const token of value.split(/\s+/)) if (token) classes.add(token);
    }
  }
  attributes.set('class', [...classes].join(' '));
  return { classes, attributes };
}

/**
 * Detect the one failure the selector rewrite can still produce silently: the
 * canvas paints itself with a custom property that no rule reaching the canvas
 * defines, WHILE the deck does define that property somewhere the canvas cannot
 * reach. That pairing is the signature of a root-scoped theme we failed to
 * re-point — the deck has the colour, the thumbnail just cannot see it — and it
 * renders as an unthemed miniature instead of the slide.
 *
 * The second half of the condition is what keeps this from being a door that is
 * always shut. A deck that simply never defines `--shell` anywhere is not
 * mis-rewritten; it renders identically in the iframe, so falling back would buy
 * nothing. Only a variable that exists but is out of reach is evidence that the
 * static clone lost the deck's theme.
 *
 * Returns the offending custom property, or null when nothing is out of reach.
 */
function findUnresolvedThemeVariable(
  css: string,
  canvasAttributes: Array<[string, string]>,
): string | null {
  const identity = canvasIdentity(canvasAttributes);
  const definedOnCanvas = new Map<string, string>();
  const definedOutOfReach = new Set<string>();
  const paint = new Map<string, string>();

  for (const block of iterateRuleBlocks(css)) {
    const reachesCanvas = selectorListReachesCanvas(block.selector, identity);
    for (const { property, value } of iterateDeclarations(block.body)) {
      if (property.startsWith('--')) {
        if (reachesCanvas) definedOnCanvas.set(property, value);
        else definedOutOfReach.add(property);
        continue;
      }
      if (reachesCanvas && CRITICAL_PAINT_PROPS.has(property)) paint.set(property, value);
    }
  }

  for (const value of paint.values()) {
    const missing = firstUnresolvedVar(value, definedOnCanvas, new Set());
    if (missing && definedOutOfReach.has(missing)) return missing;
  }
  return null;
}

interface CssDeclaration {
  property: string;
  value: string;
}

function* iterateDeclarations(body: string): Generator<CssDeclaration> {
  for (const raw of splitTopLevel(body, ';')) {
    const colon = raw.indexOf(':');
    if (colon < 0) continue;
    const property = raw.slice(0, colon).trim().toLowerCase();
    if (!property) continue;
    yield { property, value: raw.slice(colon + 1).trim() };
  }
}

/** `var(--x)` references with no fallback — the ones that can go unresolved. */
const REQUIRED_VAR_RE = /var\(\s*(--[\w-]+)\s*([,)])/g;

function firstUnresolvedVar(
  value: string,
  defined: Map<string, string>,
  seen: Set<string>,
): string | null {
  for (const match of value.matchAll(REQUIRED_VAR_RE)) {
    if (match[2] !== ')') continue;
    const name = match[1]!;
    if (seen.has(name)) continue;
    seen.add(name);
    const resolved = defined.get(name);
    if (resolved === undefined) return name;
    const nested = firstUnresolvedVar(resolved, defined, seen);
    if (nested) return nested;
  }
  return null;
}

// Does any selector in this list put its SUBJECT on (or above) the canvas, so
// that its declarations reach the canvas box? Deliberately biased towards "yes"
// for anything this parser cannot read confidently: a false "yes" only keeps the
// existing behaviour, while a false "no" would push a healthy deck onto the
// iframe fallback for no reason.
function selectorListReachesCanvas(selectorList: string, identity: CanvasIdentity): boolean {
  if (selectorList.trim().startsWith('@')) return false;
  for (const selector of splitTopLevel(selectorList, ',')) {
    const subject = splitCompounds(selector.trim()).at(-1);
    if (subject && compoundReachesCanvas(subject.compound, identity)) return true;
  }
  return false;
}

function compoundReachesCanvas(compound: string, identity: CanvasIdentity): boolean {
  // A pseudo-element is a generated box, not the canvas; custom properties set
  // on it do not inherit to the canvas's children.
  if (compound.includes('::')) return false;
  // `:host` is the canvas's ancestor, so its inherited values reach the canvas.
  if (/^:host\b/i.test(compound)) return true;

  let rest = compound;
  const type = /^(\*|[a-zA-Z][\w-]*)/.exec(rest);
  if (type) {
    const tag = type[1]!.toLowerCase();
    // `body`/`html`/`deck-stage`/… name elements the shadow tree does not have
    // at this position; only the canvas's own tag (or the universal selector)
    // can be the canvas.
    if (tag !== '*' && tag !== 'div') return false;
    rest = rest.slice(type[0].length);
  }

  while (rest.length > 0) {
    const char = rest[0]!;
    if (char === '.') {
      const match = /^\.([\w-]+)/.exec(rest);
      if (!match) return true;
      if (!identity.classes.has(match[1]!)) return false;
      rest = rest.slice(match[0].length);
      continue;
    }
    if (char === '#') {
      const match = /^#([\w-]+)/.exec(rest);
      if (!match) return true;
      if (identity.attributes.get('id') !== match[1]) return false;
      rest = rest.slice(match[0].length);
      continue;
    }
    if (char === '[') {
      const end = rest.indexOf(']');
      if (end < 0) return true;
      if (!attributeSelectorMatches(rest.slice(1, end), identity)) return false;
      rest = rest.slice(end + 1);
      continue;
    }
    if (char === ':') {
      // Pseudo-classes (`:not(…)`, `:hover`, `:nth-child(…)`) describe state or
      // structure this static parser does not model; skip rather than guess.
      const match = /^:[\w-]+(\([^)]*\))?/.exec(rest);
      if (!match) return true;
      rest = rest.slice(match[0].length);
      continue;
    }
    return true;
  }
  return true;
}

const ATTRIBUTE_SELECTOR_RE =
  /^\s*([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))\s*([iIsS])?)?\s*$/;

function attributeSelectorMatches(inner: string, identity: CanvasIdentity): boolean {
  const match = ATTRIBUTE_SELECTOR_RE.exec(inner);
  if (!match) return true;
  const actual = identity.attributes.get(match[1]!.toLowerCase());
  if (actual === undefined) return false;
  const operator = match[2];
  if (!operator) return true;
  const insensitive = (match[6] ?? '').toLowerCase() === 'i';
  const have = insensitive ? actual.toLowerCase() : actual;
  const want = (() => {
    const raw = match[3] ?? match[4] ?? match[5] ?? '';
    return insensitive ? raw.toLowerCase() : raw;
  })();
  switch (operator) {
    case '=':
      return have === want;
    case '~=':
      return want !== '' && have.split(/\s+/).includes(want);
    case '|=':
      return have === want || have.startsWith(`${want}-`);
    case '^=':
      return want !== '' && have.startsWith(want);
    case '$=':
      return want !== '' && have.endsWith(want);
    case '*=':
      return want !== '' && have.includes(want);
    default:
      return true;
  }
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

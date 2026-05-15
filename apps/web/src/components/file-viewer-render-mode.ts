/**
 * Decide between two HTML preview render strategies in FileViewer:
 *
 *   - URL-load: <iframe src="/api/projects/:id/raw/:file"> — the browser
 *     fetches each <script src> / <link href> as its own request. Source
 *     maps work, DevTools shows real filenames, per-asset HTTP caching
 *     applies, and a single broken file no longer takes down the whole
 *     iframe. This is the right default for multi-file artifacts (e.g.
 *     React prototypes that ship dozens of `.jsx` files).
 *
 *   - srcDoc inline: build a self-contained document (via buildSrcdoc),
 *     optionally with relative assets concatenated in by inlineRelative-
 *     Assets, and pass it via the iframe's srcDoc attribute. Required
 *     when we need to inject host-side bridges that cannot be served from
 *     the artifact itself (deck navigation, inspect/tweak controls), and
 *     useful as an explicit opt-in for self-contained exports.
 *
 * The two helpers below isolate the decision so it's directly unit-
 * testable without dragging the whole FileViewer React tree into a
 * jsdom harness.
 */

export interface UrlLoadDecision {
  /** Whether the viewer is showing the rendered preview vs. the raw source. */
  mode: 'preview' | 'source';
  /** Treat as a slide deck — needs the deck postMessage bridge. */
  isDeck: boolean;
  /** Comment mode is active. Needs either srcDoc injection or an artifact-owned URL-load bridge. */
  commentMode: boolean;
  /** Inspect mode is active — needs the srcdoc selection bridge for live tuning. */
  inspectMode?: boolean;
  /** Direct text edit is active. Needs either srcDoc injection or an artifact-owned URL-load bridge. */
  editMode?: boolean;
  /** The artifact has its own script that listens for host mode postMessages while URL-loaded. */
  urlModeBridge?: boolean;
  /** Tweaks palette popover open or palette committed — needs the palette bridge. */
  paletteActive?: boolean;
  /** Draw annotations need the srcDoc snapshot bridge for screenshot export. */
  drawMode?: boolean;
  /** User explicitly opted into the inline path via ?forceInline=1. */
  forceInline: boolean;
}

/**
 * Returns true when an HTML file's preview iframe should load directly
 * from its raw URL (via `<iframe src=...>`) rather than through the
 * srcDoc inline path. Pure function — caller is responsible for the
 * non-HTML / source-mode early returns.
 */
export function shouldUrlLoadHtmlPreview(d: UrlLoadDecision): boolean {
  if (d.mode !== 'preview') return false;
  if (d.isDeck) return false;
  if (d.commentMode && !d.urlModeBridge) return false;
  // Inspect needs the selection bridge injected via buildSrcdoc; a raw
  // URL-loaded iframe has no listener to apply per-element overrides.
  if (d.inspectMode) return false;
  if (d.editMode && !d.urlModeBridge) return false;
  // Palette tweaks need the srcDoc-side bridge — `<iframe src=URL>` has
  // no parent-injected listener to recolor against.
  if (d.paletteActive) return false;
  if (d.drawMode) return false;
  if (d.forceInline) return false;
  return true;
}

export function hasUrlModeBridge(source: string | null | undefined): boolean {
  if (!source) return false;
  return /<script\b[^>]*\bsrc\s*=\s*["'][^"']*\bod-direct-edit\.js\b[^"']*["'][^>]*>/i.test(source);
}

/**
 * Read the `forceInline` opt-out from a URL search string or an existing
 * URLSearchParams. Accepts `1`, `true`, `yes`, `on` (case-insensitive).
 * Anything else — including `0`, `false`, an unrelated value, or a
 * missing parameter — returns false.
 */
export function parseForceInline(search: string | URLSearchParams | null | undefined): boolean {
  if (!search) return false;
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const value = params.get('forceInline');
  if (value === null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/**
 * Return true when the HTML source contains patterns that fail under the
 * URL-load iframe's bare `sandbox="allow-scripts"` (no `allow-same-origin`).
 *
 * The srcDoc path runs `injectSandboxShim` (see
 * `apps/web/src/runtime/srcdoc.ts`) before any user script, which polyfills
 * `localStorage` / `sessionStorage` so artifacts that read them at mount
 * don't throw `SecurityError` and unmount the React tree. The URL-load path
 * serves raw HTML untouched, so artifacts that touch sandbox-blocked Web
 * Storage at startup go blank.
 *
 * Scope is narrow on purpose. This helper detects two reliable signals
 * visible in the *document* source and routes those artifacts back through
 * srcDoc by toggling `forceInline`:
 *
 *   - `<script type="text/babel">` (quoted or unquoted): Babel-standalone
 *     XHR-fetches and evals sibling `.jsx`/`.tsx` files at runtime.
 *     Agent-emitted React prototypes in this style routinely read Web
 *     Storage from `useState` initializers.
 *   - Direct `localStorage` / `sessionStorage` mentions in the document
 *     source (covers inline scripts and plain HTML that calls them).
 *
 * Known limitation: a `<script src="./app.js">` (or
 * `<script type="module" src="./main.js">`) whose **external** file reads
 * Web Storage at module eval is *not* covered — the helper only sees the
 * HTML, not the linked subresource, so URL-load is still chosen and the
 * SecurityError still throws. Catching that case would require fetching
 * and scanning every script reference before deciding the iframe load
 * strategy, which duplicates work the browser is about to do and adds
 * round trips on every preview load. Leaving that path uncovered until
 * there's a reported case that justifies the cost. Workaround for now:
 * users can opt the artifact into srcDoc with `?forceInline=1` or by
 * toggling Tweaks.
 *
 * Pure string scan — caller passes the same `source` already fetched for
 * preview rendering, so this adds no extra I/O. Heuristic by design: false
 * positives just take the (slightly slower but safer) srcDoc path; false
 * negatives are the same blank-preview the user already hits.
 */
export function htmlNeedsSandboxShim(source: string): boolean {
  // Quote-optional: HTML5 permits unquoted attribute values
  // (`<script type=text/babel src=app.jsx>`). The trailing `\b` rejects
  // same-prefix word continuations like `text/babelish`. Hyphenated variants
  // (`text/babel-other`) still match because `\b` treats `-` as a non-word
  // boundary, but that's a harmless false positive — srcDoc fallback is
  // the safe direction. Tightening to a `(?=[\s>"'])` lookahead would also
  // reject hyphenated variants if a real case ever surfaces.
  if (/<script\s[^>]*\btype\s*=\s*["']?text\/babel\b/i.test(source)) return true;
  if (/\b(?:local|session)Storage\b/.test(source)) return true;
  return false;
}

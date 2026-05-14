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
 *     when we need to inject host-side bridges that have to run before
 *     user scripts (deck navigation, comment-mode targeting), and useful
 *     as an explicit opt-in for self-contained exports.
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
  /** Comment mode is active — needs the comment bridge. */
  commentMode: boolean;
  /** Inspect mode is active — needs the selection bridge for live tuning. */
  inspectMode?: boolean;
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
  if (d.commentMode) return false;
  // Inspect needs the selection bridge injected via buildSrcdoc; a raw
  // URL-loaded iframe has no listener to apply per-element overrides.
  if (d.inspectMode) return false;
  // Palette tweaks need the srcDoc-side bridge — `<iframe src=URL>` has
  // no parent-injected listener to recolor against.
  if (d.paletteActive) return false;
  if (d.drawMode) return false;
  if (d.forceInline) return false;
  return true;
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

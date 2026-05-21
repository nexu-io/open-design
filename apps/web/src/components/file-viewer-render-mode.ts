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
  /**
   * Artifact ships the class based tweaks template (`.tw-panel` / `.tw-hidden`)
   * and therefore needs the srcDoc tweaks bridge so the toolbar toggle can
   * detect availability and drive panel visibility. The bridge is injected by
   * buildSrcdoc and has no equivalent on the URL load path.
   */
  tweaksBridge?: boolean;
  /** User explicitly opted into the inline path via ?forceInline=1. */
  forceInline: boolean;
  /**
   * The HTML source contains patterns that steal focus on load (e.g.
   * `window.focus()`, `element.focus()`). When true, forces the srcDoc path
   * so `injectPreviewFocusGuard` can suppress the focus grab.
   */
  needsFocusGuard?: boolean;
}

/**
 * Detect the class based tweaks template in an artifact source string.
 * Looks for the fixed `.tw-panel` / `.tw-hidden` selectors the skill ships in
 * `design-templates/tweaks/assets/wrap.html`. Returns false for null / empty
 * input so callers can pass `source` directly without a guard.
 */
export function hasTweaksTemplate(source: string | null | undefined): boolean {
  if (!source) return false;
  return /\btw-(?:panel|hidden)\b/.test(source);
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
  // Issue #2143 — when the URL-loaded HTML carries our injected selection
  // bridge (daemon-side, see project-routes.ts injectPreviewBridgesIntoHtml),
  // inspect mode can stay on URL-load too. Without the bridge the host has
  // no listener to apply per-element overrides, so we still fall back to
  // srcDoc the way upstream does.
  if (d.inspectMode && !d.urlModeBridge) return false;
  // Manual edit needs the edit-mode bridge which is srcDoc-only — the
  // daemon-injected URL-load bridge ships selection only, not manual edit.
  // Always fall back to srcDoc when editMode is on.
  if (d.editMode) return false;
  // Palette tweaks need the srcDoc-side bridge — `<iframe src=URL>` has
  // no parent-injected listener to recolor against.
  if (d.paletteActive) return false;
  if (d.drawMode) return false;
  // The class based tweaks template relies on the srcDoc tweaks bridge
  // emitting `od:tweaks-available` on mount; on the URL load path the bridge
  // is never injected, so the toolbar toggle would stay disabled even though
  // the artifact ships a `.tw-panel`.
  if (d.tweaksBridge) return false;
  if (d.forceInline) return false;
  if (d.needsFocusGuard) return false;
  return true;
}

// Recognizes either the artifact-owned `od-direct-edit.js` (legacy) or
// signals that the daemon will inject bridges at serve-time (Issue #2143).
// Both give the host a postMessage target for picker/inspect inside URL-load
// previews, so the render-mode decision can keep URL-load on for comment
// and inspect mode without flipping to srcDoc.
//
// The daemon injects ROUTE_PERSIST, SELECTION_BRIDGE, and
// SELECTION_BRIDGE_STYLE into every HTML response served through the
// preview iframe path (gated by Sec-Fetch-Dest: iframe).  The raw source
// fetched via fetchProjectFileText (with X-OD-Source-View: 1) will
// *never* contain these injected markers, so scanning for them is wrong.
// Instead we detect whether the source is HTML — if it is, the daemon's
// /raw/* endpoint will inject bridges when the browser loads it as an
// iframe, which is the only path we care about.
export function hasUrlModeBridge(source: string | null | undefined): boolean {
  if (!source) return false;
  // Legacy: artifact-owned od-direct-edit.js bridge — detectable in source.
  if (/<script\b[^>]*\bsrc\s*=\s*["'][^"']*\bod-direct-edit\.js\b[^"']*["'][^>]*>/i.test(source)) return true;
  // Issue #2143: daemon-injected bridges are a transport guarantee for HTML.
  // Detect HTML by looking for structural tags — any HTML file served through
  // the preview path gets bridge injection from the daemon.
  if (/<(?:!doctype|html|head|body|script|style|meta|link|div|span|p|h[1-6])\b/i.test(source)) return true;
  return false;
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
 * Scope is narrow on purpose. This helper detects three reliable signals
 * visible in the *document* source and routes those artifacts back through
 * srcDoc by toggling `forceInline`:
 *
 *   - `<script type="text/babel">` (quoted or unquoted): Babel-standalone
 *     XHR-fetches and evals sibling `.jsx`/`.tsx` files at runtime.
 *     Agent-emitted React prototypes in this style routinely read Web
 *     Storage from `useState` initializers.
 *   - Direct `localStorage` / `sessionStorage` mentions in the document
 *     source (covers inline scripts and plain HTML that calls them).
 *   - Any external `<script src="…">` (including `type="module"`): the
 *     parent string scan can't see the linked subresource's body, and
 *     agent-emitted artifacts commonly read Web Storage from an external
 *     `boot.js` / `app.js` at module eval (issue #2361). Conservatively
 *     route any external script through srcDoc so the shim is in place
 *     before that read happens. The alternative — fetching every script
 *     URL ahead of the iframe and scanning it — would duplicate work the
 *     browser is about to do and add round trips on every preview load,
 *     so the heuristic favors a few extra srcDoc-mode previews over those
 *     additional requests.
 *
 * Remaining known limitation: dynamically injected scripts
 * (`document.createElement('script'); s.src = '…'; head.appendChild(s)`)
 * are still invisible to this scan because the literal `<script src=…>`
 * tag never appears in the source. Such artifacts will still URL-load and
 * still throw on Web Storage access at startup. Workaround for now: users
 * can opt the artifact into srcDoc with `?forceInline=1` or by toggling
 * Tweaks.
 *
 * Pure string scan — caller passes the same `source` already fetched for
 * preview rendering, so this adds no extra I/O. Heuristic by design: false
 * positives just take the (slightly slower but safer) srcDoc path; false
 * negatives are the same blank-preview the user already hits.
 */
/**
 * Return true when the HTML source may call `.focus()` at load time, which
 * would steal focus from the host page in a URL-loaded iframe. The srcDoc
 * path injects `injectPreviewFocusGuard` to suppress this; URL-load has no
 * such guard, so we force the srcDoc path instead.
 *
 * Detection covers two cases:
 *
 *   1. Inline `.focus(` calls and `autofocus` attributes — directly visible
 *      in the document source.
 *   2. External `<script src=...>` references — we cannot inspect the linked
 *      file's content, so we conservatively assume it may call focus.
 *
 * False positives just route the artifact through the slightly slower srcDoc
 * path, which is the safe direction.
 */
export function htmlNeedsFocusGuard(source: string): boolean {
  if (/\.\s*focus\s*\(/i.test(source)) return true;
  if (/\bautofocus\b/i.test(source)) return true;
  if (/<script\b[^>]*\bsrc\s*=/i.test(source)) return true;
  return false;
}

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
  // External `<script ... src=...>` — see issue #2361. `\s[^>]*?` requires at
  // least one whitespace after `<script` (so we don't match `<scripts>`-like
  // text or self-closing-ish edge cases) and stays non-greedy to keep the
  // search bounded to the tag itself. Lazy match avoids spilling into
  // unrelated `src=` attributes on later tags in the same document.
  if (/<script\s[^>]*?\bsrc\s*=/i.test(source)) return true;
  return false;
}

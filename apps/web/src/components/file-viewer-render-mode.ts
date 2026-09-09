import {
  previewHtmlNeedsFocusGuard,
  previewHtmlNeedsPoweredPreview,
  previewHtmlNeedsRedirectGuard,
  previewHtmlNeedsSandboxShim,
} from '@open-design/contracts/runtime/preview-guards';

export function hasTweaksTemplate(source: string | null | undefined): boolean {
  if (!source) return false;
  return /\btw-(?:panel|hidden)\b/.test(source);
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
 * The preview needs `injectSandboxShim` before any user script, which
 * polyfills `localStorage` / `sessionStorage` so artifacts that read them at
 * mount don't throw `SecurityError` and unmount the React tree. Settled
 * on-disk HTML can receive this guard from the daemon URL response, including
 * large documents through streaming injection; only in-memory HTML remains on
 * srcDoc.
 *
 * Scope is narrow on purpose. This helper detects three reliable signals
 * visible in the *document* source and requests the corresponding guard:
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
 *     guard any external script response so the shim is in place
 *     before that read happens. The alternative — fetching every script
 *     URL ahead of the iframe and scanning it — would duplicate work the
 *     browser is about to do and add round trips on every preview load,
 *     so the heuristic favors a passive guard over those additional requests.
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
 * positives add a passive guard to that preview; false negatives are the same
 * blank-preview the user already hits.
 */
/**
 * Return true when the HTML source may call `.focus()` at load time, which
 * would steal focus from the host page in a URL-loaded iframe. The daemon URL
 * response or srcDoc path injects `injectPreviewFocusGuard` to suppress this.
 *
 * Detection covers two cases:
 *
 *   1. Inline `.focus(` calls and `autofocus` attributes — directly visible
 *      in the document source.
 *   2. External `<script src=...>` references — we cannot inspect the linked
 *      file's content, so we conservatively assume it may call focus.
 *
 * False positives add a passive focus guard, which is the safe direction.
 */
export function htmlNeedsFocusGuard(source: string): boolean {
  return previewHtmlNeedsFocusGuard(source);
}

/**
 * Return true when the HTML source shows hallmarks of a real GPU/compute app
 * that the default opaque-origin preview sandbox cannot run correctly: it
 * needs same-origin Web Workers, real Web Storage, WASM, or SharedArrayBuffer
 * (cross-origin isolation). These are the WebGL/Worker artifacts from issue
 * #724 — Gaussian-splat viewers, ffmpeg.wasm, threaded renderers.
 *
 * When true, FileViewer routes the artifact through the "powered preview"
 * path (a cross-origin-isolated iframe with allow-same-origin) instead of the
 * opaque sandbox. Plain single-canvas WebGL1 demos are intentionally NOT
 * matched — they already run fine under the default sandbox, and powered mode
 * carries a (documented, opt-in) larger trust surface, so we only escalate for
 * artifacts that genuinely need it.
 *
 * Pure string scan over the same `source` already fetched for preview. False
 * positives just take the powered path (still correct, slightly larger trust
 * surface); false negatives keep the current opaque-sandbox behavior.
 */
export function htmlNeedsPoweredPreview(source: string | null | undefined): boolean {
  return previewHtmlNeedsPoweredPreview(source);
}

export function htmlNeedsSandboxShim(source: string): boolean {
  return previewHtmlNeedsSandboxShim(source);
}

/**
 * Return true when the HTML source contains a self-redirecting directive that
 * can loop forever and freeze the preview iframe (nexu-io/open-design#710).
 * When true, FileViewer requires `injectPreviewRedirectGuard` on whichever
 * transport owns the document so the loop can be detected and broken.
 *
 * Detection covers the two families that produce the freeze:
 *
 *   1. `<meta http-equiv="refresh">` — the canonical HTML redirect; a
 *      self-target or a cycle reloads the frame endlessly.
 *   2. Inline load-time `location` navigation — `location.reload()`,
 *      `location.replace(...)`, `location.assign(...)`, or assigning
 *      `location`/`location.href`/`window.location`. Any of these run at parse
 *      time can re-navigate the frame in a loop. A redirect hidden exclusively
 *      in an external script is not statically visible to this source scan.
 *
 * Pure string scan over the same `source` already fetched for preview — no
 * extra I/O. Heuristic by design: a false positive adds a passive guard; a
 * false negative is the same unguarded preview as before.
 */
export function htmlNeedsRedirectGuard(source: string | null | undefined): boolean {
  return previewHtmlNeedsRedirectGuard(source);
}

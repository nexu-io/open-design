/**
 * Decide whether a markdown link href in chat output should resolve to an
 * in-project file (opened in the right-pane workspace) or fall through to
 * the default browser link behavior (Electron `setWindowOpenHandler` →
 * new window).
 *
 * Chat output from the assistant frequently contains references like
 * `[template.html](template.html)` or `[hero](subdir/hero.html)`. Those
 * are relative paths into the current project's file workspace; with
 * default `target="_blank"` they instead open a new Electron window with
 * no project context and land on the home screen. Routing them through
 * the existing `requestOpenFile` callback keeps the user in the same
 * project view and previews the file in the right pane.
 *
 * Returns the normalized file path to open when the href looks like an
 * in-project link, or `null` to let the default link behavior win.
 *
 * Pass-through (returns null):
 *   - http(s):// and any other URL scheme (mailto:, ftp:, …) — explicit
 *     external link, default browser behavior is correct.
 *   - `#anchor` — fragment within the current document.
 *   - Absolute paths starting with `/` — could mean filesystem root in
 *     Electron and is not what the assistant is referencing; better to
 *     not silently rewrite into an in-project open.
 *   - `..` traversal — refuses to leave the project root via relative
 *     navigation. (Anchors any normalization in the consumer to project-
 *     scoped files only.)
 *   - Empty / whitespace.
 *
 * Intercept (returns normalized path):
 *   - Bare filename:        `template.html`        → `template.html`
 *   - Explicit relative:    `./template.html`      → `template.html`
 *   - Nested in subdir:     `subdir/hero.html`     → `subdir/hero.html`
 *   - With query / hash:    `template.html?x=1#a`  → `template.html`
 *     (query and fragment are stripped — the workspace tab opener takes
 *     a file path, not a URL.)
 */
export function asInProjectFilePath(href: string | null | undefined): string | null {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('#')) return null;
  // RFC 3986 scheme: ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) followed
  // by ":". Catches http:, https:, mailto:, file:, od:, blob:, etc.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (trimmed.startsWith('/')) return null;
  // Reject any segment that climbs out of the project root. Cheaper +
  // safer than a full path normalization pass, and `..` segments are
  // not something real assistant chat output emits for file references.
  const segments = trimmed.split('/');
  if (segments.some((segment) => segment === '..')) return null;
  // Strip an explicit `./` prefix so the consumer sees the same shape
  // it would have gotten from a bare filename.
  const withoutDotSlash = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
  // Drop query and fragment — the workspace tab opener takes a file
  // path, not a URL. Doing it in this order so `?` or `#` inside a
  // filename (rare but legal) doesn't slip into the workspace key.
  const beforeHash = withoutDotSlash.split('#')[0] ?? '';
  const beforeQuery = beforeHash.split('?')[0] ?? '';
  const normalized = beforeQuery.trim();
  return normalized.length > 0 ? normalized : null;
}

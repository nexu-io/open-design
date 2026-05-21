/**
 * Decide whether a markdown link href in chat output should resolve to
 * an in-project file (opened in the right-pane workspace) or fall
 * through to the default browser link behavior (Electron
 * `setWindowOpenHandler` → new window).
 *
 * Chat output frequently contains references like
 * `[template.html](template.html)` or `[hero](subdir/hero.html)`. Those
 * are relative paths into the current project's file workspace; with
 * default `target="_blank"` they open a new Electron window with no
 * project context and land on the home screen. Routing them through
 * the existing `requestOpenFile` callback keeps the user in the same
 * project view and previews the file in the right pane.
 *
 * Returns the normalized file path when the href looks like an
 * in-project link, or `null` to let the default link behavior win.
 */
export function asInProjectFilePath(href: string | null | undefined): string | null {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('#')) return null;
  // RFC 3986 scheme: ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) followed by `:`.
  // Catches http:, https:, mailto:, file:, od:, blob:, javascript:, etc.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (trimmed.startsWith('/')) return null;
  const stripped = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
  // Refuse any `..` segment so a relative path can't climb out of the
  // project root. Cheaper and safer than full path normalization, and
  // assistant chat output never emits `..` for legitimate file refs.
  if (stripped.split('/').some((segment) => segment === '..')) return null;
  // Strip query and fragment — the workspace tab opener takes a file
  // path, not a URL.
  const withoutHash = stripped.split('#')[0] ?? stripped;
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash;
  if (!withoutQuery) return null;
  return withoutQuery;
}

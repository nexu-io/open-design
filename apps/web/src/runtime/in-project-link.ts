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
export function asInProjectFilePath(
  href: string | null | undefined,
  projectFileNames?: ReadonlySet<string>,
  projectId?: string | null,
): string | null {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('#')) return null;
  const normalizedHref = normalizeSameOriginHref(trimmed);
  const appRoute = extractAppProjectFileRoute(normalizedHref);
  if (appRoute) {
    if (projectId && appRoute.projectId !== projectId) return null;
    return normalizeProjectFilePath(appRoute.filePath);
  }
  const knownProjectFilePath = matchKnownProjectFilePath(normalizedHref, projectFileNames);
  if (knownProjectFilePath) return knownProjectFilePath;
  // RFC 3986 scheme: ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ) followed by `:`.
  // Catches http:, https:, mailto:, file:, od:, blob:, javascript:, etc.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (trimmed.startsWith('/')) return null;
  const stripped = trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
  // Refuse any `..` segment so a relative path can't climb out of the
  // project root. Cheaper and safer than full path normalization, and
  // assistant chat output never emits `..` for legitimate file refs.
  if (stripped.split('/').some((segment) => segment === '..')) return null;
  return normalizeProjectFilePath(stripped);
}

function normalizeSameOriginHref(href: string): string {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  if (typeof window === 'undefined' || !window.location?.origin) return href;
  try {
    const url = new URL(href);
    if (url.origin !== window.location.origin) return href;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

interface AppProjectFileRoute {
  projectId: string;
  filePath: string;
}

function extractAppProjectFileRoute(href: string): AppProjectFileRoute | null {
  const withoutHash = href.split('#')[0] ?? href;
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash;
  const patterns = [
    /^\/api\/projects\/([^/]+)\/raw\/(.+)$/i,
    /^\/api\/projects\/([^/]+)\/files\/(.+)$/i,
    /^\/projects\/([^/]+)\/files\/(.+)$/i,
    /^\/projects\/([^/]+)\/conversations\/[^/]+\/files\/(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(withoutQuery);
    if (!match?.[1] || !match[2]) continue;
    return {
      projectId: decodeRouteSegment(match[1]),
      filePath: match[2],
    };
  }
  return null;
}

function decodeRouteSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function matchKnownProjectFilePath(
  href: string,
  projectFileNames: ReadonlySet<string> | undefined,
): string | null {
  if (!projectFileNames || projectFileNames.size === 0) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  const normalized = normalizeProjectFilePath(href);
  if (!normalized) return null;
  if (projectFileNames.has(normalized)) return normalized;
  const matches = Array.from(projectFileNames)
    .filter((name) => normalized === name || normalized.endsWith(`/${name}`))
    .sort((a, b) => b.length - a.length);
  return matches[0] ?? null;
}

function normalizeProjectFilePath(path: string): string | null {
  // Strip query and fragment — the workspace tab opener takes a file
  // path, not a URL.
  const withoutHash = path.split('#')[0] ?? path;
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash;
  if (!withoutQuery) return null;
  // Chat markdown emits links as URL-encoded text (`Mock%20Page.html`
  // for a file named `Mock Page.html`, multi-byte sequences for
  // non-ASCII names). The workspace tab opener
  // (`requestOpenFile` → `FileWorkspace`) matches by literal on-disk
  // file name, so passing the encoded form silently misses the tab.
  // Decode after the literal `..` check so a `%2E%2E` smuggling
  // attempt cannot bypass the traversal guard, and re-check `..` on
  // the decoded form. Treat malformed encodings as "not a real
  // in-project link" rather than letting the URIError crash the
  // renderer.
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    return null;
  }
  if (decoded.split('/').some((segment) => segment === '..')) return null;
  return decoded;
}

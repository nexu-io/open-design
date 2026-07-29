import { parseRoute } from '../router';

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

/**
 * Where a chat file link should open.
 *
 * - `workspace-file`: a file of the CURRENT project — open it through the
 *   right-pane workspace tab opener (`requestOpenFile`).
 * - `project-file`: a file of ANOTHER Open Design project (typical when the
 *   conversation @-references other projects and the assistant links their
 *   files) — navigate to that project's file route in the same window.
 */
export type ChatFileLinkTarget =
  | { kind: 'workspace-file'; filePath: string }
  | { kind: 'project-file'; projectId: string; filePath: string };

/**
 * Resolve a chat markdown href to an in-app file target.
 *
 * Extends `asInProjectFilePath` (current-project resolution for relative
 * paths and known-file matches) with the disk-path shapes the daemon hands
 * the agent as absolute paths. Ownership of an absolute path is only ever
 * decided from POSITIVE proof against `projectResolvedDir` — the daemon-
 * computed on-disk working directory of the CURRENT project
 * (`GET /api/projects/:id` → `resolvedDir`):
 *
 * - A href under `projectResolvedDir` itself is a current-project file,
 *   even when it doesn't appear in `projectFileNames` yet (stale file list,
 *   or a file the agent just wrote) — imported-folder workspaces whose
 *   `baseDir` contains a `projects/` segment of its own included.
 * - For a daemon-managed current project, `resolvedDir` is
 *   `<projects-root>/<projectId>`, which reveals the managed projects root;
 *   a href under a SIBLING directory of that root provably belongs to that
 *   other managed project (the @-reference scenario of the 0.14.1
 *   acceptance bug) and navigates there — this outranks the basename
 *   fallback, because the proven owner also resolves basename collisions.
 * - A `/projects/<seg>/` boundary anywhere else proves NOTHING (legacy
 *   0.10.x preview dirs are keyed by project NAME; imported folders carry
 *   arbitrary structure), so unproven absolute paths only ever resolve
 *   through the current-project known-file fallback (maintained contract:
 *   e2e/ui/project-file-link-routing.test.ts) — never to `project-file`.
 *
 * Returns `null` when the href has no in-app file target (external URLs,
 * fragments, unresolvable paths).
 */
export function resolveChatFileLink(
  href: string | null | undefined,
  projectFileNames?: ReadonlySet<string>,
  projectId?: string | null,
  projectResolvedDir?: string | null,
): ChatFileLinkTarget | null {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const normalizedHref = normalizeSameOriginHref(trimmed);
  // App file routes name their owning project explicitly and are never
  // subject to the basename fallback, so classify them directly.
  const appRoute = extractAppProjectFileRoute(normalizedHref);
  if (appRoute) {
    const filePath = normalizeProjectFilePath(appRoute.filePath);
    if (!filePath) return null;
    if (projectId && appRoute.projectId !== projectId) {
      return { kind: 'project-file', projectId: appRoute.projectId, filePath };
    }
    return { kind: 'workspace-file', filePath };
  }
  const provenTarget = resolveAgainstResolvedDir(normalizedHref, projectId, projectResolvedDir);
  if (provenTarget) return provenTarget;
  const currentProjectPath = asInProjectFilePath(href, projectFileNames, projectId);
  if (currentProjectPath) return { kind: 'workspace-file', filePath: currentProjectPath };
  return null;
}

/**
 * Classify an absolute disk href against the current project's daemon-
 * resolved working directory. See `resolveChatFileLink` for the ownership
 * rules; this helper only ever answers from positive prefix proof and
 * returns `null` whenever the href is not provably owned. Comparison is
 * textual over `normalizeDiskPath` output, so POSIX and Windows
 * drive-letter shapes both work (a Windows daemon returns
 * `C:\…\projects\<id>` as `resolvedDir` and the agent links files the
 * same way).
 */
function resolveAgainstResolvedDir(
  href: string,
  projectId: string | null | undefined,
  projectResolvedDir: string | null | undefined,
): ChatFileLinkTarget | null {
  if (!projectResolvedDir) return null;
  // Protocol-relative URLs (`//host/…`) are external network URLs, never
  // local disk paths.
  if (href.startsWith('//')) return null;
  const withoutHash = href.split('#')[0] ?? href;
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash;
  let rawTarget: string;
  try {
    rawTarget = decodeURIComponent(withoutQuery);
  } catch {
    return null;
  }
  const decoded = normalizeDiskPath(rawTarget);
  if (!decoded) return null;
  if (decoded.split('/').some((segment) => segment === '..')) return null;
  const resolvedDir = normalizeDiskPath(projectResolvedDir.replace(/[\\/]+$/, ''));
  if (!resolvedDir) return null;
  // Prefix proofs compare over case-folded keys on Windows paths (the
  // filesystem is case-insensitive, so `C:\users\ME\…` and `C:\Users\me\…`
  // are the same location); returned projectId/filePath values are always
  // sliced from the ORIGINAL normalized strings so their casing survives.
  // POSIX paths keep exact comparison.
  const decodedKey = diskPathComparisonKey(decoded);
  const resolvedDirKey = diskPathComparisonKey(resolvedDir);
  if (decodedKey.startsWith(`${resolvedDirKey}/`)) {
    const filePath = decoded.slice(resolvedDir.length + 1);
    if (!filePath) return null;
    return { kind: 'workspace-file', filePath };
  }
  // Managed current project: `resolvedDir` is `<projects-root>/<projectId>`,
  // so a sibling `<projects-root>/<otherId>/<file>` provably belongs to that
  // other managed project. Imported-folder projects (`resolvedDir` is the
  // user's baseDir) reveal no managed root — no navigation is inferred.
  if (!projectId) return null;
  const projectIdKey = isWindowsDiskPath(resolvedDir)
    ? foldForComparison(projectId)
    : projectId;
  if (!resolvedDirKey.endsWith(`/${projectIdKey}`)) return null;
  const managedRoot = resolvedDir.slice(0, resolvedDir.length - projectId.length - 1);
  const managedRootKey = resolvedDirKey.slice(
    0,
    resolvedDirKey.length - projectIdKey.length - 1,
  );
  if (!managedRoot || !decodedKey.startsWith(`${managedRootKey}/`)) return null;
  const rest = decoded.slice(managedRoot.length + 1);
  const separator = rest.indexOf('/');
  if (separator <= 0 || separator === rest.length - 1) return null;
  const owningProjectId = rest.slice(0, separator);
  const filePath = rest.slice(separator + 1);
  return { kind: 'project-file', projectId: owningProjectId, filePath };
}

/**
 * Whether an unresolvable chat href is path-like with no useful default —
 * schemeless (after same-origin normalization), not a fragment, not a
 * protocol-relative network URL, and NOT a route the SPA router recognizes.
 * For these, the default `target="_blank"` fallback can never do anything
 * useful inside the app: Electron resolves the path against the app origin
 * and opens a detached window whose SPA router lands on HOME. Callers should
 * `preventDefault()` and treat the link as inert instead (0.14.1 acceptance
 * bug: chatpane file links opened a home-page window).
 *
 * Routability is decided by `parseRoute` itself, not a heuristic: its
 * catch-all home fallback IS the detached-home-window symptom, so exactly
 * the hrefs that would trigger it are swallowed. Recognized SPA routes
 * (`/automations`, `/projects/<id>`, `/design-systems/<id>`, …) keep their
 * default behavior, while filesystem-style paths — with or without a file
 * extension (`/Users/…/bar.ts`, `/tmp/README`, `../Makefile`) — are inert.
 * Windows drive-letter paths (`C:\…\README.md`) are filesystem paths too,
 * even though they match the URI scheme grammar. Relative hrefs can only
 * reach this check when they are unresolvable as project files (traversals,
 * malformed encodings), so they are always treated as file-like.
 */
export function isPathLikeChatHref(href: string | null | undefined): boolean {
  if (typeof href !== 'string') return false;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith('#')) return false;
  // Protocol-relative URLs (`//host/…`) are external network URLs.
  if (trimmed.startsWith('//')) return false;
  // Windows drive-letter paths (`C:\…`, `C:/…`) match the RFC scheme
  // grammar below (single-letter scheme), so classify them first: they are
  // filesystem paths the SPA router can never serve — an unresolved one is
  // always inert. UNC shares (`\\server\…`) are filesystem paths too.
  if (isWindowsDrivePath(trimmed) || isUncPath(trimmed)) return true;
  const normalizedHref = normalizeSameOriginHref(trimmed);
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalizedHref)) return false;
  // Daemon-served prefixes return real content (downloads, exports, baked
  // previews) rather than re-entering the SPA — keep their default link
  // behavior.
  if (isDaemonServedPath(normalizedHref)) return false;
  const withoutHash = normalizedHref.split('#')[0] ?? normalizedHref;
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash;
  if (!withoutQuery.startsWith('/')) return true;
  // The root path IS a recognized route (`/` and `/?q=…` render home on
  // purpose) even though parseRoute reports it with the same shape as its
  // unknown-route catch-all — special-case it before consulting the router.
  if (withoutQuery.replace(/\/+$/, '') === '') return false;
  try {
    const route = parseRoute(withoutQuery);
    return route.kind === 'home' && route.view === 'home';
  } catch {
    // parseRoute decodes route segments and throws on malformed
    // percent-encoding (`/projects/%E0`) — an href the router would crash
    // on is not a route; treat it as an inert path-like link.
    return true;
  }
}

// Same-origin prefixes the daemon serves directly (see `apps/web/next.config.ts`
// rewrites and the daemon's static mounts). Opening these in a new window
// shows actual content, so they are neither file links nor SPA routes.
function isDaemonServedPath(path: string): boolean {
  return (
    path.startsWith('/api/') || path.startsWith('/artifacts/') || path.startsWith('/frames/')
  );
}

// `C:\…` / `C:/…` — a Windows drive-letter absolute path. Matches the RFC
// 3986 single-letter-scheme grammar, so callers must classify it BEFORE any
// generic scheme check.
function isWindowsDrivePath(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path);
}

// `\\server\share\…` — a Windows UNC absolute path. Only the backslash form
// counts: a forward-slash `//host/…` is indistinguishable from a
// protocol-relative URL and stays excluded upstream.
function isUncPath(path: string): boolean {
  return /^\\\\[^\\]/.test(path);
}

// Unify a decoded disk path for textual prefix comparison: POSIX absolute
// paths pass through; Windows drive-letter and UNC paths normalize `\` to
// `/` (drive letters upper-cased — the filesystem treats them
// case-insensitively). A normalized UNC path keeps its `//server/…` shape.
// Anything else (relative paths, URLs) is not a disk path.
function normalizeDiskPath(path: string): string | null {
  if (path.startsWith('/')) return path;
  if (isWindowsDrivePath(path)) {
    const unified = path.replace(/\\/g, '/');
    return `${unified[0]!.toUpperCase()}${unified.slice(1)}`;
  }
  if (isUncPath(path)) return path.replace(/\\/g, '/');
  return null;
}

// Whether a `normalizeDiskPath` output is a Windows shape (drive-letter or
// UNC). Normalized UNC paths are the only ones starting with `//` — raw
// protocol-relative hrefs never reach normalization.
function isWindowsDiskPath(normalizedPath: string): boolean {
  return isWindowsDrivePath(normalizedPath) || normalizedPath.startsWith('//');
}

// Lower-case for case-insensitive comparison, but only when folding keeps
// the string length — slice offsets computed on the original strings must
// stay aligned with positions matched on the folded keys (rare locale
// characters like U+0130 grow when lower-cased).
function foldForComparison(value: string): string {
  const folded = value.toLowerCase();
  return folded.length === value.length ? folded : value;
}

// Comparison key for a `normalizeDiskPath` output: Windows paths fold case
// (NTFS resolves paths case-insensitively), POSIX paths compare exactly.
function diskPathComparisonKey(normalizedPath: string): string {
  return isWindowsDiskPath(normalizedPath)
    ? foldForComparison(normalizedPath)
    : normalizedPath;
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

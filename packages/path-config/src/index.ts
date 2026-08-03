export type BasePath = "" | `/${string}`;
export type AppPath = `/${string}`;

export interface PathConfig {
  readonly basePath: BasePath;
  /** Prefix a canonical app-internal path, even when it starts with the configured prefix. */
  withBasePath(path: string): string;
  /** Preserve a path already under the configured prefix; otherwise prefix it. */
  ensureBasePath(path: string): string;
  stripBasePath(pathname: string): AppPath | null;
  hasBasePath(pathname: string): boolean;
  api(path?: string): string;
  asset(path: string): string;
  publicPath(path: string): string;
}

const RESERVED_BROWSER_NAMESPACES = new Set(["_next", "api", "artifacts", "frames"]);

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new Error(`base path contains malformed percent-encoding: ${segment}`);
  }
}

function validateBasePathSegments(path: string): void {
  if (path.includes("\0")) throw new Error("base path must not contain NUL");
  if (path.includes("\\")) throw new Error("base path must not contain backslashes");
  if (path.includes("?") || path.includes("#")) throw new Error("base path must not contain a query or fragment");
  if (path.includes("://") || path.startsWith("//")) throw new Error("base path must be a path, not a URL");
  if (path.includes("//")) throw new Error("base path must not contain duplicate slashes");

  const decodedSegments: string[] = [];
  for (const segment of path.slice(1).split("/")) {
    const decoded = decodePathSegment(segment);
    decodedSegments.push(decoded);
    if (decoded === "." || decoded === "..") throw new Error("base path must not contain dot segments");
    if (decoded.includes("/") || decoded.includes("\\") || decoded.includes("\0")) {
      throw new Error("base path must not contain encoded separators or NUL");
    }
  }

  const firstSegment = decodedSegments[0]?.toLowerCase() ?? "";
  if (RESERVED_BROWSER_NAMESPACES.has(firstSegment)) {
    throw new Error(
      "base path must not start with a reserved browser namespace: /api, /_next, /artifacts, or /frames",
    );
  }
}

/** Normalize the one fixed browser-visible deployment prefix. */
export function normalizeBasePath(raw?: string): BasePath {
  if (raw == null || raw.trim() === "") return "";

  let value = raw.trim();
  if (value === "/") throw new Error("base path must be empty for the root deployment");
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.startsWith("//")) throw new Error("base path must be a path, not a URL");
  if (value.endsWith("/")) {
    if (value.length > 1 && value.at(-2) === "/") throw new Error("base path must not contain duplicate slashes");
    value = value.slice(0, -1);
  }
  if (value === "") return "";

  validateBasePathSegments(value);
  return value as BasePath;
}

function splitPathSuffix(path: string): { pathname: string; suffix: string } {
  const match = /[?#]/u.exec(path);
  if (match == null) return { pathname: path, suffix: "" };
  return { pathname: path.slice(0, match.index), suffix: path.slice(match.index) };
}

function requireInternalPath(path: string): { pathname: AppPath; suffix: string } {
  if (typeof path !== "string" || path.length === 0) throw new Error("internal URL path must be non-empty");
  if (/^[a-z][a-z\d+.-]*:/iu.test(path) || path.startsWith("//")) {
    throw new Error("internal URL path must not be an external URL");
  }
  const { pathname, suffix } = splitPathSuffix(path);
  if (!pathname.startsWith("/") || pathname.includes("\\") || pathname.includes("//")) {
    throw new Error(`internal URL path must be a canonical absolute path: ${path}`);
  }
  return { pathname: pathname as AppPath, suffix };
}

function isPathAtBoundary(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function createPathConfigInternal(basePath: BasePath): PathConfig {
  const hasBasePath = (pathname: string): boolean => {
    if (typeof pathname !== "string" || !pathname.startsWith("/")) return false;
    return basePath === "" || isPathAtBoundary(pathname, basePath);
  };

  const withBasePath = (path: string): string => {
    const { pathname, suffix } = requireInternalPath(path);
    if (basePath === "") return `${pathname}${suffix}`;
    return `${basePath}${pathname}${suffix}`;
  };

  const ensureBasePath = (path: string): string => {
    const { pathname, suffix } = requireInternalPath(path);
    if (basePath === "" || isPathAtBoundary(pathname, basePath)) return `${pathname}${suffix}`;
    return `${basePath}${pathname}${suffix}`;
  };

  const stripBasePath = (pathname: string): AppPath | null => {
    if (typeof pathname !== "string" || !pathname.startsWith("/")) return null;
    if (basePath === "") return pathname as AppPath;
    if (pathname === basePath) return "/";
    if (!pathname.startsWith(`${basePath}/`)) return null;
    const stripped = pathname.slice(basePath.length);
    return (stripped === "" ? "/" : stripped) as AppPath;
  };

  const api = (path = ""): string => {
    const normalized = path === ""
      ? "/api"
      : path === "/api" || path.startsWith("/api/")
        ? path
        : `/api${path.startsWith("/") ? path : `/${path}`}`;
    return withBasePath(normalized);
  };

  const asset = (path: string): string => withBasePath(path);

  return {
    api,
    asset,
    basePath,
    ensureBasePath,
    hasBasePath,
    publicPath: asset,
    stripBasePath,
    withBasePath,
  };
}

export function createPathConfig(basePath?: string): PathConfig {
  return createPathConfigInternal(normalizeBasePath(basePath));
}

const INTERNAL_BROWSER_PATH = /^\/(?:_next|api|artifacts|frames)(?=\/|[?#]|$)/i;

function rewriteKnownInternalBrowserUrl(raw: string, publicPath: (path: string) => string): string {
  if (!INTERNAL_BROWSER_PATH.test(raw)) return raw;
  return publicPath(raw);
}

/**
 * Prefix the known Open Design-owned URL namespaces in generated HTML.
 * Arbitrary root-relative document URLs and executable JavaScript are left
 * untouched so user content keeps its original meaning.
 */
export function rewriteKnownInternalBrowserPaths(html: string, basePath?: string): string {
  const paths = createPathConfig(basePath);
  const publicPath = paths.ensureBasePath;
  if (!html || paths.basePath === '') return html;

  const protectedScripts: string[] = [];
  let rewritten = html.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi,
    (_match, openTag: string, body: string, closeTag: string) => {
      const token = `__OD_PROTECTED_SCRIPT_${protectedScripts.length}__`;
      protectedScripts.push(body);
      return `${openTag}${token}${closeTag}`;
    },
  ).replace(
    /(\b(?:src|href|poster|data|action|xlink:href)\s*=\s*)(["'])([^"']*)(\2)/gi,
    (match, prefix: string, quote: string, raw: string, closeQuote: string) => {
      const next = rewriteKnownInternalBrowserUrl(raw, publicPath);
      return next === raw ? match : `${prefix}${quote}${next}${closeQuote}`;
    },
  );

  rewritten = rewritten.replace(
    /(\bsrcset\s*=\s*)(["'])([^"']*)(\2)/gi,
    (match, prefix: string, quote: string, raw: string, closeQuote: string) => {
      const next = raw
        .split(',')
        .map((candidate) => {
          const leading = candidate.match(/^\s*/)?.[0] ?? '';
          const trailing = candidate.match(/\s*$/)?.[0] ?? '';
          const body = candidate.slice(leading.length, candidate.length - trailing.length || undefined);
          const separator = body.search(/\s/);
          const url = separator < 0 ? body : body.slice(0, separator);
          const descriptor = separator < 0 ? '' : body.slice(separator);
          return `${leading}${rewriteKnownInternalBrowserUrl(url, publicPath)}${descriptor}${trailing}`;
        })
        .join(',');
      return next === raw ? match : `${prefix}${quote}${next}${closeQuote}`;
    },
  );

  rewritten = rewritten.replace(
    /url\(\s*(["']?)(\/[^)'"\s]+)\1\s*\)/gi,
    (match, quote: string, raw: string) => {
      const next = rewriteKnownInternalBrowserUrl(raw, publicPath);
      return next === raw ? match : `url(${quote}${next}${quote})`;
    },
  );

  return rewritten.replace(/__OD_PROTECTED_SCRIPT_(\d+)__/g, (_match, index: string) => protectedScripts[Number(index)] ?? '');
}

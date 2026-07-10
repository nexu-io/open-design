/**
 * Root-relative project asset handling for FileViewer's srcDoc HTML preview.
 *
 * Generated multi-file artifacts (e.g. Website Clone output) commonly link
 * their assets by site-root path — `/reference-assets/main.css`,
 * `/icon/font.otf` — because that is how the cloned site will be served from
 * its own static root. Neither preview strategy resolves those on its own:
 *
 *   - URL-load (`<iframe src="/api/projects/:id/raw/:file">`): the browser
 *     resolves `/reference-assets/...` against the app origin root, where no
 *     such route exists.
 *   - srcDoc: the injected `<base href>` only rebases *relative* refs;
 *     root-relative refs ignore the base path by spec.
 *
 * The helpers here close that gap for the srcDoc pipeline. The key safety
 * decision: a root-relative ref is only treated as a project asset when the
 * decoded path exists in the project's real file list (`/api/projects/:id/
 * files`), never via path-shape heuristics — so `/api/...`, external mounts,
 * and dead links are left untouched. Confirmed refs are normalized to
 * owner-relative paths, which the existing srcDoc machinery (`<base href>`
 * rebasing + `inlineRelativeAssets`) already knows how to serve.
 *
 * Pure string/path functions only — no fetch, no React — so the whole policy
 * is unit-testable without a jsdom FileViewer harness.
 */

// Attributes that carry a subresource URL (not navigation): plain `src`
// (script/img/iframe/source/audio/video), `poster`, and the lazy-load
// convention `data-src`. Anchor `href` is deliberately NOT scanned — a
// root-relative page link is navigation, not an asset, and must not force
// the srcDoc path. `<link href>` is handled by its own tag-scoped pass.
const ASSET_ATTR = /(\s)(src|poster|data-src)(\s*=\s*)(["'])([^"']*)\4/gi;
const LINK_TAG = /<link\b[^>]*>/gi;
const LINK_HREF = /(\shref\s*=\s*)(["'])([^"']*)\2/i;
const SRCSET_ATTR = /(\ssrcset\s*=\s*)(["'])([^"']*)\2/gi;
// css url(...) — covers inline <style> blocks and style="" attributes when
// run over an HTML document, and stylesheet bodies when run over CSS text.
const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

function splitRefSuffix(ref: string): { path: string; suffix: string } {
  const match = ref.match(/^([^?#]*)([?#][\s\S]*)?$/);
  return { path: match?.[1] ?? ref, suffix: match?.[2] ?? '' };
}

/**
 * Resolve a root-relative ref (`/dir/file.css?v=1`) to the project file path
 * it names (`dir/file.css`), or null when it is not a confirmable project
 * asset ref.
 *
 * `projectFilePaths === null` means the file list has not loaded yet; the
 * function then answers "is this a *candidate*" (shape-valid root-relative
 * path) so callers can stay conservative while the list is in flight.
 * With a real set, membership is required — no heuristics.
 */
export function rootRelativeProjectAssetPath(
  ref: string,
  projectFilePaths: ReadonlySet<string> | null,
): string | null {
  const trimmed = ref.trim();
  // `//host/...` is protocol-relative (external), not root-relative.
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  const { path } = splitRefSuffix(trimmed);
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Malformed escapes: keep the raw path; the file list stores raw names.
  }
  decoded = decoded.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!decoded || decoded.endsWith('/')) return null;
  if (decoded.split('/').some((part) => part.trim() === '..')) return null;
  if (projectFilePaths === null) return decoded;
  return projectFilePaths.has(decoded) ? decoded : null;
}

function eachAssetRef(html: string, visit: (ref: string) => void): void {
  for (const match of html.matchAll(ASSET_ATTR)) visit(match[5] ?? '');
  for (const tagMatch of html.matchAll(LINK_TAG)) {
    const href = tagMatch[0].match(LINK_HREF);
    if (href) visit(href[3] ?? '');
  }
  for (const match of html.matchAll(SRCSET_ATTR)) {
    for (const candidate of (match[3] ?? '').split(',')) {
      visit(candidate.trim().split(/\s+/)[0] ?? '');
    }
  }
  for (const match of html.matchAll(CSS_URL)) visit(match[2] ?? '');
}

/**
 * True when the document references at least one root-relative project asset
 * (subresource positions only). Drives the URL-load → srcDoc routing
 * decision: such documents can only render styled through the srcDoc rewrite
 * pipeline below.
 */
export function htmlHasRootRelativeProjectAssetRefs(
  html: string,
  projectFilePaths: ReadonlySet<string> | null,
): boolean {
  let found = false;
  eachAssetRef(html, (ref) => {
    if (!found && rootRelativeProjectAssetPath(ref, projectFilePaths) !== null) found = true;
  });
  return found;
}

/** `zh/index.html` → `zh/`; flat files → ``. */
export function assetBaseDirFor(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx >= 0 ? filePath.slice(0, idx + 1) : '';
}

/**
 * Express a project file path relative to the file that references it
 * (`ownerFilePath: 'zh/index.html'`, `targetPath: 'reference-assets/main.css'`
 * → `../reference-assets/main.css`), so the srcDoc `<base href>` — which
 * points at the owner's directory — resolves it back to the raw-file API.
 */
export function ownerRelativeAssetPath(ownerFilePath: string, targetPath: string): string {
  const squash = (value: string) => {
    const out: string[] = [];
    for (const part of value.replace(/^\/+/, '').split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        if (out.length > 0) out.pop();
        continue;
      }
      out.push(part);
    }
    return out;
  };
  const ownerParts = squash(assetBaseDirFor(ownerFilePath));
  const targetParts = squash(targetPath);
  let common = 0;
  while (
    common < ownerParts.length &&
    common < targetParts.length &&
    ownerParts[common] === targetParts[common]
  ) {
    common += 1;
  }
  const up = new Array<string>(ownerParts.length - common).fill('..');
  const rel = [...up, ...targetParts.slice(common)].join('/');
  return rel || '.';
}

/**
 * Resolve a relative ref against its owner file's directory into a project
 * file path, or null when the ref is not a plain relative path (schemes,
 * root-relative, fragment-only) or escapes the project root.
 */
export function resolveRelativeAssetPath(ownerFilePath: string, ref: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(trimmed)) return null;
  const { path } = splitRefSuffix(trimmed);
  if (!path) return null;
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Keep raw path — see rootRelativeProjectAssetPath.
  }
  const parts = `${assetBaseDirFor(ownerFilePath)}${decoded}`.replace(/\\/g, '/').split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (out.length === 0) return null; // escapes the project root
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.length > 0 ? out.join('/') : null;
}

function rewriteConfirmedRef(
  ref: string,
  projectFilePaths: ReadonlySet<string>,
  toRewritten: (projectPath: string) => string,
): string {
  const projectPath = rootRelativeProjectAssetPath(ref, projectFilePaths);
  if (!projectPath) return ref;
  const { suffix } = splitRefSuffix(ref.trim());
  return `${toRewritten(projectPath)}${suffix}`;
}

/**
 * Normalize every confirmed root-relative project asset ref in an HTML
 * document to an owner-relative path. Run BEFORE `inlineRelativeAssets`: the
 * normalized refs then take the existing srcDoc route — stylesheets/scripts
 * get inlined, everything else (images, fonts, media) resolves through the
 * injected `<base href>`. Unconfirmed refs pass through untouched.
 */
export function normalizeRootRelativeProjectAssetRefs(
  html: string,
  ownerFilePath: string,
  projectFilePaths: ReadonlySet<string>,
): string {
  const toOwnerRelative = (projectPath: string) =>
    ownerRelativeAssetPath(ownerFilePath, projectPath);
  let next = html.replace(
    ASSET_ATTR,
    (match, space: string, name: string, eq: string, quote: string, value: string) => {
      const rewritten = rewriteConfirmedRef(value, projectFilePaths, toOwnerRelative);
      return rewritten === value ? match : `${space}${name}${eq}${quote}${rewritten}${quote}`;
    },
  );
  next = next.replace(LINK_TAG, (tag) =>
    tag.replace(LINK_HREF, (hrefMatch, prefix: string, quote: string, value: string) => {
      const rewritten = rewriteConfirmedRef(value, projectFilePaths, toOwnerRelative);
      return rewritten === value ? hrefMatch : `${prefix}${quote}${rewritten}${quote}`;
    }),
  );
  next = next.replace(SRCSET_ATTR, (match, prefix: string, quote: string, value: string) => {
    const rewritten = value
      .split(',')
      .map((candidate) => {
        const body = candidate.trim();
        if (!body) return candidate;
        const [url = '', ...descriptors] = body.split(/\s+/);
        const rewrittenUrl = rewriteConfirmedRef(url, projectFilePaths, toOwnerRelative);
        if (rewrittenUrl === url) return candidate;
        const leading = candidate.match(/^\s*/)?.[0] ?? '';
        return `${leading}${[rewrittenUrl, ...descriptors].join(' ')}`;
      })
      .join(',');
    return rewritten === value ? match : `${prefix}${quote}${rewritten}${quote}`;
  });
  // Inline <style> blocks and style="" attributes: same-document CSS also
  // resolves through the <base href>, so owner-relative works here too.
  next = next.replace(CSS_URL, (match, quote: string, value: string) => {
    const rewritten = rewriteConfirmedRef(value, projectFilePaths, toOwnerRelative);
    return rewritten === value ? match : `url(${quote}${rewritten}${quote})`;
  });
  return next;
}

/**
 * Rewrite `url(...)` refs inside a stylesheet that is about to be inlined
 * into the owner HTML document. Inlining moves the CSS out of its own
 * directory, so refs must become absolute raw-file URLs:
 *
 *   - relative refs resolve against the stylesheet's directory (fixes e.g.
 *     `url(fonts/x.otf)` in `reference-assets/main.css` pointing at the
 *     owner's directory after inlining);
 *   - root-relative refs rewrite only when confirmed against the project
 *     file list (membership, not shape).
 */
export function rewriteInlinedCssAssetRefs(
  css: string,
  cssFilePath: string,
  projectFilePaths: ReadonlySet<string> | null,
  toRawUrl: (projectPath: string) => string,
): string {
  return css.replace(CSS_URL, (match, quote: string, value: string) => {
    const trimmed = value.trim();
    const { suffix } = splitRefSuffix(trimmed);
    const rootPath =
      projectFilePaths === null ? null : rootRelativeProjectAssetPath(trimmed, projectFilePaths);
    const projectPath = rootPath ?? resolveRelativeAssetPath(cssFilePath, trimmed);
    if (!projectPath) return match;
    return `url(${quote}${toRawUrl(projectPath)}${suffix}${quote})`;
  });
}

/**
 * Rewrite project asset refs inside a script that is about to be inlined
 * (`fetch('/reference-assets/data.json')`, `new Worker('./worker.js')`,
 * `import('./chunk.js')` and friends). Scripts are opaque, so this is
 * deliberately the narrowest pass of the three: only plain string literals,
 * only when the literal contains no interpolation or brace characters, and
 * only when the resolved path is confirmed against the project file list.
 *
 * Two ref shapes are handled, both membership-confirmed:
 *   - root-relative (`/reference-assets/x`): confirmed as-is;
 *   - relative (`./data.json`, `../lib/y.js`): inlining moves the script out of
 *     its own directory into the HTML entry, so a sibling lookup would resolve
 *     against the wrong base — rebase against the SOURCE script's directory
 *     (mirrors the CSS pass's `resolveRelativeAssetPath(cssFilePath, …)`), then
 *     confirm the resolved path is a real project file before rewriting.
 * Bare specifiers (`worker.js`, `data.json`) are left untouched — too ambiguous
 * to rewrite safely inside opaque JS.
 */
export function rewriteInlinedScriptAssetRefs(
  js: string,
  scriptFilePath: string,
  projectFilePaths: ReadonlySet<string>,
  toRawUrl: (projectPath: string) => string,
): string {
  return js.replace(
    /(['"`])((?:\.\.?\/|\/(?!\/))[^'"`\s]*)\1/g,
    (match, quote: string, value: string) => {
      if (/[{}$]/.test(value)) return match;
      const projectPath = value.startsWith('/')
        ? rootRelativeProjectAssetPath(value, projectFilePaths)
        : confirmedRelativeScriptRef(value, scriptFilePath, projectFilePaths);
      if (!projectPath) return match;
      const { suffix } = splitRefSuffix(value);
      return `${quote}${toRawUrl(projectPath)}${suffix}${quote}`;
    },
  );
}

// Resolve a relative ref against the inlined script's own directory and confirm
// membership — null (leave untouched) unless it names a real project file.
function confirmedRelativeScriptRef(
  ref: string,
  scriptFilePath: string,
  projectFilePaths: ReadonlySet<string>,
): string | null {
  const resolved = resolveRelativeAssetPath(scriptFilePath, ref);
  return resolved && projectFilePaths.has(resolved) ? resolved : null;
}

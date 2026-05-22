// Map a React module file back to the HTML entry files that load it.
//
// Multi-file React prototypes (the documented `Object.assign(window, {...})`
// pattern) split components across several `.jsx` / `.tsx` files that are
// loaded TOGETHER by one HTML entry via `<script type="text/babel" src=...>`
// tags sharing a single `window`. A module on its own has no standalone
// component to render, so previewing it in isolation dead-ends in the React
// runtime ("No React component export found"). These pure helpers let the UI
// recognise such a module and point the user at the HTML entry that actually
// renders it.
//
// Everything here is a pure string scan so it stays trivially unit-testable
// without a DOM or network.

function basenameOf(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * Normalise a `<script src>` reference for comparison: drop any query string
 * or hash, and strip a leading `./` so `./icons.jsx` and `icons.jsx` compare
 * equal. Leaves deeper relative paths (`parts/icons.jsx`) intact.
 */
function normalizeScriptRef(src: string): string {
  return (src.split(/[?#]/)[0] ?? '').replace(/^\.\//, '').trim();
}

/**
 * Extract the ordered list of script `src` values an HTML document loads as
 * Babel modules — i.e. `<script type="text/babel" src="...">`. Attribute
 * order is not assumed (`type` may precede or follow `src`); only `<script>`
 * tags that carry BOTH a `text/babel` type and a `src` are returned. Inline
 * `<script type="text/babel">…</script>` blocks (no `src`) are ignored
 * because they are not separate files. HTML comments are stripped first so a
 * commented-out `<!-- <script ... src="legacy.jsx"> -->` is NOT treated as a
 * live reference. Returns `[]` for empty input.
 */
export function extractBabelScriptSrcs(html: string | null | undefined): string[] {
  if (!html) return [];
  const scannable = html.replace(/<!--[\s\S]*?-->/g, '');
  const srcs: string[] = [];
  const scriptOpenTag = /<script\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptOpenTag.exec(scannable)) !== null) {
    const attrs = match[1] ?? '';
    if (!/\btype\s*=\s*["']?text\/babel\b/i.test(attrs)) continue;
    const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    const ref = srcMatch?.[1] ? normalizeScriptRef(srcMatch[1]) : '';
    if (ref) srcs.push(ref);
  }
  return srcs;
}

/**
 * True when a single HTML document loads `jsxName` as a Babel module.
 *
 * Matching mirrors `decideAutoOpenAfterWrite`'s philosophy: prefer an exact
 * relative-path match, and fall back to a basename match so a flat project
 * (`icons.jsx` referenced as `src="icons.jsx"`) is recognised without forcing
 * callers to resolve full relative paths. The basename fallback can in theory
 * over-match two same-named files in different folders, which is acceptable
 * here — the cost of a false positive is showing a pointer to the wrong
 * sibling, not data loss.
 */
export function htmlLoadsJsxModule(html: string | null | undefined, jsxName: string): boolean {
  if (!jsxName) return false;
  const target = normalizeScriptRef(jsxName);
  const targetBase = basenameOf(target);
  return extractBabelScriptSrcs(html).some((ref) => {
    if (ref === target) return true;
    return basenameOf(ref) === targetBase;
  });
}

/**
 * Given a module file name and a map of `htmlName -> htmlSource`, return the
 * names of every HTML entry that loads the module, in the map's iteration
 * order. An empty result means the file is NOT a known module (no HTML loads
 * it) — callers should then treat it as a normal standalone artifact.
 */
export function findHtmlEntriesReferencing(
  jsxName: string,
  htmlSources: ReadonlyMap<string, string>,
): string[] {
  if (!jsxName) return [];
  const entries: string[] = [];
  for (const [htmlName, html] of htmlSources) {
    if (htmlLoadsJsxModule(html, jsxName)) entries.push(htmlName);
  }
  return entries;
}

/**
 * Convenience predicate: is `jsxName` loaded by at least one HTML entry in
 * `htmlSources`? Thin wrapper over `findHtmlEntriesReferencing` for call sites
 * that only need a yes/no (e.g. the auto-open guard).
 */
export function isJsxModule(
  jsxName: string,
  htmlSources: ReadonlyMap<string, string>,
): boolean {
  return findHtmlEntriesReferencing(jsxName, htmlSources).length > 0;
}

function isHtmlName(name: string): boolean {
  return /\.html?$/i.test(name);
}

interface NamedFile {
  readonly name: string;
}

/**
 * Resolve the set of PROJECT FILE NAMES that are loaded as Babel modules by
 * some HTML entry in `files`. `readHtml` is injected so this stays pure and
 * testable (callers pass a cached `fetch`-backed reader; tests pass a fake).
 * A reader returning `null` (missing/failed read) contributes nothing.
 *
 * The returned names are real `files` entries — a `<script src>` that points
 * at a file the project does not actually have is ignored, so a stale or
 * typo'd reference can never suppress a genuine standalone artifact.
 */
export async function collectReferencedJsxNames(
  files: ReadonlyArray<NamedFile>,
  readHtml: (name: string) => Promise<string | null>,
): Promise<Set<string>> {
  const referencedSrcs = new Set<string>();
  await Promise.all(
    files
      .filter((file) => isHtmlName(file.name))
      .map(async (file) => {
        const html = await readHtml(file.name);
        for (const src of extractBabelScriptSrcs(html)) referencedSrcs.add(src);
      }),
  );
  if (referencedSrcs.size === 0) return new Set();

  const result = new Set<string>();
  for (const file of files) {
    const base = basenameOf(file.name);
    for (const src of referencedSrcs) {
      if (src === file.name || basenameOf(src) === base) {
        result.add(file.name);
        break;
      }
    }
  }
  return result;
}

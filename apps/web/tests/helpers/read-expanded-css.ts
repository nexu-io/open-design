import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const packageCssImports = new Map([
  ['@open-design/components/styles.css', join(process.cwd(), '../../packages/components/src/styles.css')],
]);

const CSS_IMPORT = /@import\s+(?:url\(([^)]+)\)|(['"])([^'"]+)\2);/g;

function resolveCssImport(fromFile: string, rawSpecifier: string): string | null {
  const specifier = rawSpecifier.trim().replace(/^['"]|['"]$/g, '');
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return packageCssImports.get(specifier) ?? null;
  }
  return join(dirname(fromFile), specifier);
}

/**
 * Walk the `@import` graph in source order and return the stylesheet as
 * consecutive text segments that split exactly at `@import` statements (so at
 * file boundaries). Each unresolvable import contributes nothing; a file that
 * was already visited contributes nothing the second time.
 */
function expandCssSegments(filePath: string, seen = new Set<string>()): string[] {
  if (seen.has(filePath)) {
    return [];
  }
  seen.add(filePath);

  const css = readFileSync(filePath, 'utf8');
  const segments: string[] = [];
  let cursor = 0;
  for (const match of css.matchAll(CSS_IMPORT)) {
    segments.push(css.slice(cursor, match.index));
    const imported = resolveCssImport(filePath, match[3] ?? match[1] ?? '');
    if (imported != null) {
      segments.push(...expandCssSegments(imported, seen));
    }
    cursor = match.index + match[0].length;
  }
  segments.push(css.slice(cursor));
  return segments;
}

/**
 * The global `index.css` cascade, still in real import order, split at file
 * boundaries: `readExpandedIndexCssSegments().join('') === readExpandedIndexCss()`.
 *
 * Use this — one `<style>` per segment, appended in order — when a jsdom test
 * needs the cascade *parsed* rather than grepped. Document-order sheets cascade
 * exactly like one concatenated sheet, and jsdom builds a rule-for-rule
 * identical CSSOM either way, but the parse cost is not the same: jsdom's CSS
 * parser (css-tree) keeps its token buffers sized to the largest text it has
 * ever parsed and zero-fills them on every later parse. jsdom re-parses every
 * selector and declaration as its own small fragment, so one 1.7 MB sheet makes
 * each of those fragments pay for 1.7 MB, and the parse alone eats seconds of a
 * test's timeout under CI load. Per-file sheets cap that at the largest file.
 */
export function readExpandedIndexCssSegments(): string[] {
  return expandCssSegments(join(process.cwd(), 'src/index.css'));
}

export function readExpandedIndexCss(): string {
  return readExpandedIndexCssSegments().join('');
}

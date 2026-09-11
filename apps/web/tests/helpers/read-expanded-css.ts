import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const packageCssImports = new Map([
  ['@open-design/components/styles.css', join(process.cwd(), '../../packages/components/src/styles.css')],
]);

function expandCssFile(filePath: string, seen = new Set<string>()): string {
  const key = filePath;
  if (seen.has(key)) {
    return '';
  }
  seen.add(key);

  const css = readFileSync(filePath, 'utf8');
  return css.replace(/@import\s+(?:url\(([^)]+)\)|(['"])([^'"]+)\2);/g, (_match, urlImport, _quote, quotedImport) => {
    const specifier = (quotedImport ?? urlImport ?? '').trim().replace(/^['"]|['"]$/g, '');
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
      const packageCssPath = packageCssImports.get(specifier);
      return packageCssPath == null ? '' : expandCssFile(packageCssPath, seen);
    }
    return expandCssFile(join(dirname(filePath), specifier), seen);
  });
}

// The expanded cascade is a pure function of the checked-in stylesheets, so
// one expansion serves every test in the worker. Re-reading dozens of files
// and re-running the import expansion per call site made each consuming test
// pay ~seconds of redundant I/O under a loaded CI runner — enough to push a
// render-heavy case past its timeout budget.
let cachedExpandedIndexCss: string | null = null;

export function readExpandedIndexCss(): string {
  cachedExpandedIndexCss ??= expandCssFile(join(process.cwd(), 'src/index.css'));
  return cachedExpandedIndexCss;
}

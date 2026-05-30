import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

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
      return '';
    }
    return expandCssFile(join(dirname(filePath), specifier), seen);
  });
}

export function readExpandedIndexCss(): string {
  return expandCssFile(join(process.cwd(), 'src/index.css'));
}

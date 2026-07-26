import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const FONT_PACKAGE = '@fontsource-variable/source-serif-4';
const FONT_VERSION = '5.3.0';
const require = createRequire(import.meta.url);

describe('Source Serif 4 web font', () => {
  it('pins the web dependency to the proven version', () => {
    // Given
    const manifest: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    const dependencies =
      typeof manifest === 'object' && manifest !== null && 'dependencies' in manifest
        ? manifest.dependencies
        : null;

    // When
    const version =
      typeof dependencies === 'object' && dependencies !== null
        ? Reflect.get(dependencies, FONT_PACKAGE)
        : undefined;

    // Then
    expect(version).toBe(FONT_VERSION);
  });

  it('loads variable WOFF2 faces with Cyrillic and Cyrillic-ext coverage from the global layout', () => {
    // Given
    const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');

    // When
    const fontImports = Array.from(
      layout.matchAll(/^import\s+['"](@fontsource-variable\/source-serif-4\/[^'"]+\.css)['"];?$/gm),
      (match) => match[1] ?? '',
    ).filter(Boolean);

    // Then
    expect(fontImports.length).toBeGreaterThan(0);

    const importedCss = fontImports
      .map((specifier) => readFileSync(require.resolve(specifier), 'utf8'))
      .join('\n');
    for (const subset of ['cyrillic', 'cyrillic-ext']) {
      const face = importedCss.match(
        new RegExp(
          String.raw`\/\*\s*source-serif-4-${subset}-wght-normal\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}`,
        ),
      )?.[1];
      expect(face, `${subset} variable font face`).toMatch(
        /font-family:\s*['"]Source Serif 4 Variable['"][\s\S]*font-weight:\s*200 900[\s\S]*src:\s*url\([^)]*\.woff2\)[\s\S]*unicode-range:\s*U\+/,
      );
    }
  });

  it('keeps the local Pro face before the bundled variable face and system fallbacks', () => {
    // Given
    const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

    // When
    const families = tokens
      .match(/--serif:\s*([^;]+);/)?.[1]
      ?.split(',')
      .map((family) => family.trim().replace(/^(['"])(.*)\1$/, '$2'));

    // Then
    expect(families).toEqual([
      'Source Serif Pro',
      'Source Serif 4 Variable',
      'Iowan Old Style',
      'Apple Garamond',
      'Georgia',
      'Times New Roman',
      'serif',
    ]);
  });
});

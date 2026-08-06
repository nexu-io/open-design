import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readExpandedIndexCss } from '../helpers/read-expanded-css';

const fontsDir = join(process.cwd(), 'public/fonts');
const indexCss = readExpandedIndexCss();

const CYRILLIC_WOFF2 = [
  'noto-sans-cyrillic-wght-normal.woff2',
  'noto-sans-cyrillic-wght-italic.woff2',
  'noto-sans-cyrillic-ext-wght-normal.woff2',
  'noto-sans-cyrillic-ext-wght-italic.woff2',
] as const;

/** Basic Russian alphabet including Ё/ё (66 code points) — #6478 acceptance. */
const RUSSIAN_LETTERS =
  'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ' + 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';

function parseUnicodeRange(range: string): Set<number> {
  const out = new Set<number>();
  for (const part of range.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = /^U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?$/.exec(part);
    if (!m) continue;
    const start = Number.parseInt(m[1]!, 16);
    const end = m[2] ? Number.parseInt(m[2], 16) : start;
    for (let cp = start; cp <= end; cp += 1) out.add(cp);
  }
  return out;
}

describe('Cyrillic sans fallback (#6478)', () => {
  it('vendors the four Noto Sans Cyrillic WOFF2 subsets with license/source metadata', () => {
    for (const name of CYRILLIC_WOFF2) {
      const path = join(fontsDir, name);
      expect(existsSync(path), path).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(1_000);
    }
    expect(existsSync(join(fontsDir, 'OFL-NotoSans.txt'))).toBe(true);
    expect(existsSync(join(fontsDir, 'SOURCE-NotoSansCyrillic.md'))).toBe(true);

    const total = CYRILLIC_WOFF2.reduce(
      (sum, name) => sum + statSync(join(fontsDir, name)).size,
      0,
    );
    // @fontsource-variable/noto-sans@5.3.0 four-file total is 197_672.
    expect(total).toBe(197_672);
  });

  it('declares Noto Sans with Cyrillic unicode-ranges and keeps Albert Sans first', () => {
    expect(indexCss).toContain('font-family: "Noto Sans"');
    expect(indexCss).toContain('/fonts/noto-sans-cyrillic-wght-normal.woff2');
    expect(indexCss).toContain('/fonts/noto-sans-cyrillic-ext-wght-normal.woff2');
    expect(indexCss).toContain('/fonts/noto-sans-cyrillic-wght-italic.woff2');
    expect(indexCss).toContain('/fonts/noto-sans-cyrillic-ext-wght-italic.woff2');
    expect(indexCss).toMatch(/unicode-range:\s*U\+0301,\s*U\+0400-045F/);
    expect(indexCss).toMatch(/unicode-range:\s*U\+0460-052F/);

    // No external font CDN for the product UI face stack.
    expect(indexCss).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);

    const sans = /--sans:\s*([^;]+);/.exec(indexCss)?.[1] ?? '';
    const serif = /--serif:\s*([^;]+);/.exec(indexCss)?.[1] ?? '';
    expect(sans.indexOf('"Albert Sans"')).toBeLessThan(sans.indexOf('"Noto Sans"'));
    expect(serif.indexOf('"Albert Sans"')).toBeLessThan(serif.indexOf('"Noto Sans"'));
  });

  it('covers the basic Russian alphabet via declared unicode-ranges', () => {
    const ranges = [...indexCss.matchAll(/unicode-range:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    const covered = new Set<number>();
    for (const range of ranges) {
      // Only count ranges attached to Noto faces: both Cyrillic ranges appear
      // in base.css after Noto was added; Albert/Jidu have none.
      if (!range.includes('U+0400') && !range.includes('U+0460')) continue;
      for (const cp of parseUnicodeRange(range)) covered.add(cp);
    }

    const missing: string[] = [];
    for (const ch of RUSSIAN_LETTERS) {
      const cp = ch.codePointAt(0)!;
      if (!covered.has(cp)) missing.push(`${ch} (U+${cp.toString(16).toUpperCase()})`);
    }
    expect(missing, `missing Russian letters: ${missing.join(', ')}`).toEqual([]);
    expect(RUSSIAN_LETTERS).toHaveLength(66);
  });

  it('does not install Fontsource as a runtime package dependency', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    expect(Object.keys(names).some((k) => k.includes('fontsource'))).toBe(false);
  });
});

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

describe('landing reveal progressive-enhancement parity', () => {
  it('[P1] keeps generator inputs and the canonical example fail-open', async () => {
    const [stylesSource, composerSource, exampleSource] = await Promise.all([
      readRepoFile('design-templates/open-design-landing/styles.css'),
      readRepoFile('design-templates/open-design-landing/scripts/compose.ts'),
      readRepoFile('design-templates/open-design-landing/example.html'),
    ]);

    for (const source of [stylesSource, exampleSource]) {
      expect(source).toMatch(
        /\[data-reveal\]\s*\{[\s\S]*?opacity:\s*1;[\s\S]*?translate:\s*0 0;[\s\S]*?\}/,
      );
      expect(source).toMatch(
        /\.reveal-ready \[data-reveal\]:not\(\[data-revealed='true'\]\)\s*\{[\s\S]*?opacity:\s*0;/,
      );
    }

    for (const source of [composerSource, exampleSource]) {
      const observeIndex = source.indexOf('observer.observe(elements[j])');
      const readyIndex = source.indexOf("classList.add('reveal-ready')");

      expect(observeIndex).not.toBe(-1);
      expect(readyIndex).toBeGreaterThan(observeIndex);
      expect(source).toMatch(/catch \(error\)[\s\S]*?classList\.remove\('reveal-ready'\)/);
    }
  });
});

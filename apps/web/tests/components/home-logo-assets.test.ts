import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homeHeroSource = readFileSync(
  new URL('../../src/components/HomeHero.tsx', import.meta.url),
  'utf8',
);
const entryNavRailSource = readFileSync(
  new URL('../../src/components/EntryNavRail.tsx', import.meta.url),
  'utf8',
);

describe('Home logo assets', () => {
  it('uses the current Open Design logo glyph on both Home entry surfaces', () => {
    expect(homeHeroSource).toContain('src="/logo.svg"');
    expect(homeHeroSource).not.toContain('src="/app-icon.svg"');

    expect(entryNavRailSource).toContain('src="/logo.svg"');
    expect(entryNavRailSource).not.toContain('src="/app-icon.svg"');
  });
});

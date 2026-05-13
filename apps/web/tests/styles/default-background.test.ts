import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexCss = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(indexCss);
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? '';
}

describe('default app background colors', () => {
  it('uses the release light background color by default', () => {
    const root = cssBlock(':root');

    expect(root).toContain('--bg: #faf9f7;');
    expect(root).toContain('--bg-app: #faf9f7;');
  });

  it('keeps the dark theme background unchanged', () => {
    const dark = cssBlock('[data-theme="dark"]');

    expect(dark).toContain('--bg: #1a1917;');
    expect(dark).toContain('--bg-app: #1a1917;');
  });
});

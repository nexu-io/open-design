// The tab strip's "+" launcher (TabLauncherMenu) is an opaque white panel,
// not frosted glass: the workspace preview behind it must not bleed through
// (product decision 2026-09-16, same recipe as the K1 action menus — `--bg`
// ground, soft edge, md shadow, no backdrop filter).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  resolve(__dirname, '../../src/components/workspace/TabLauncherMenu.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector: string): string {
  const pattern = new RegExp(`(?:^|\\})\\s*${selector.replace(/[.\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const match = css.match(pattern);
  if (!match) throw new Error(`rule ${selector} not found`);
  return match[1]!;
}

describe('TabLauncherMenu is an opaque panel', () => {
  const menu = block('.menu');

  it('paints an opaque ground and no blur', () => {
    expect(menu).toMatch(/background:\s*var\(--bg\)/);
    expect(menu).not.toMatch(/backdrop-filter/);
    expect(menu).not.toMatch(/--glass-/);
  });

  it('keeps a soft edge and a shadow so it still reads as floating chrome', () => {
    expect(menu).toMatch(/border:\s*1px solid var\(--border-soft\)/);
    expect(menu).toMatch(/box-shadow:\s*var\(--shadow-(md|lg)\)/);
  });
});

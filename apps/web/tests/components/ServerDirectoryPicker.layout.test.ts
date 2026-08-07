import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../src/components/ServerDirectoryPicker.module.css', import.meta.url),
  'utf8',
);

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`missing CSS rule: ${selector}`);
  return match[1] ?? '';
}

describe('ServerDirectoryPicker constrained viewport layout', () => {
  it('shrinks the scrolling browser region instead of clipping footer actions', () => {
    expect(rule('.browser')).toMatch(/flex:\s*1 1/);
    expect(rule('.browser')).toMatch(/min-height:\s*0/);
    expect(rule('.footer')).toMatch(/flex:\s*0 0 auto/);
    expect(css).not.toMatch(/\.browser,\s*\n\s*\.state\s*\{[^}]*min-height:\s*220px/);
  });
});

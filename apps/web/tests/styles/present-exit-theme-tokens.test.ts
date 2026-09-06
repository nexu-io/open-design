import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const composioCss = readFileSync(
  new URL('../../src/styles/viewer/composio.css', import.meta.url),
  'utf8',
);

const presentExitRule = /\.present-exit\s*\{[\s\S]*?\}/;

describe('full-screen present-exit button', () => {
  it('paints its surface from theme tokens so dark mode does not get a white block', () => {
    expect(composioCss).toMatch(
      /\.present-exit\s*\{[\s\S]*?background:\s*var\(--bg-elevated\);/,
    );
    expect(composioCss).toMatch(
      /\.present-exit:hover\s*\{\s*background:\s*var\(--bg-muted\);\s*\}/,
    );
  });

  it('keeps every colour in the base rule tokenized', () => {
    const rule = composioCss.match(presentExitRule)?.[0] ?? '';
    expect(rule).not.toBe('');
    expect(rule).not.toMatch(/rgba\(255,\s*255,\s*255/);
    expect(rule).not.toMatch(/background:\s*white/);
  });

  it('stays keyboard-discoverable over arbitrary presented content', () => {
    expect(composioCss).toMatch(
      /\.present-exit:focus-visible\s*\{[\s\S]*?outline:\s*2px solid var\(--accent\);/,
    );
  });
});

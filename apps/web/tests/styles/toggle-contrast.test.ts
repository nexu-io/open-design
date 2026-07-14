import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokensCss = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
const artifactsCss = readFileSync(
  new URL('../../src/styles/workspace/artifacts.css', import.meta.url),
  'utf8',
);

function declarationsFor(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*{([^}]*)}`));
  expect(match, `missing CSS block for ${selector}`).toBeTruthy();
  return match?.[1] ?? '';
}

describe('toggle off-state contrast', () => {
  it('uses a theme-aware track token for shared toggle variants', () => {
    expect(declarationsFor(tokensCss, ':root')).toContain(
      '--toggle-track-off: var(--border-strong);',
    );
    expect(declarationsFor(tokensCss, '[data-theme="dark"]')).toContain(
      '--toggle-track-off: var(--text-soft);',
    );
    expect(declarationsFor(tokensCss, 'html:not([data-theme])')).toContain(
      '--toggle-track-off: var(--text-soft);',
    );
    expect(declarationsFor(artifactsCss, '.toggle-row-switch')).toContain(
      'background: var(--toggle-track-off);',
    );
    expect(declarationsFor(artifactsCss, '.compact-toggle-switch')).toContain(
      'background: var(--toggle-track-off);',
    );
  });
});

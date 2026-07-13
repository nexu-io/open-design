import { describe, expect, it } from 'vitest';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

const indexCss = readExpandedIndexCss();

// The frosted-glass app ground (app-wash.css): a pre-blurred pastel wash
// painted at the body level plus "veil" tokens that let page containers go
// translucent. The degradation contract is the load-bearing part — under
// prefers-reduced-transparency or without backdrop-filter, every veil must
// return to the exact solid token it replaced and the wash must turn off.
describe('app wash ground', () => {
  it('defines the wash and every veil token', () => {
    expect(indexCss).toContain('--app-wash:');
    expect(indexCss).toContain('--wash-base:');
    expect(indexCss).toContain('--veil-shell: transparent;');
    expect(indexCss).toContain('--veil-page: transparent;');
    expect(indexCss).toContain('--veil-canvas: transparent;');
    expect(indexCss).toContain('--veil-panel: transparent;');
  });

  it('paints the wash on a fixed, non-interactive layer under all content', () => {
    const block = /body::before\s*\{([^}]*)\}/.exec(indexCss)?.[1] ?? '';
    expect(block).toContain('position: fixed;');
    expect(block).toContain('z-index: -1;');
    expect(block).toContain('pointer-events: none;');
    expect(block).toContain('background: var(--app-wash);');
  });

  it('restores the solid backgrounds in both degradation modes', () => {
    const resets = [
      '--app-wash: none;',
      '--veil-shell: var(--bg-app);',
      '--veil-page: var(--bg);',
      '--veil-canvas: var(--bg);',
      '--veil-panel: var(--bg-panel);',
    ];
    // One copy per fallback block: prefers-reduced-transparency and
    // @supports not backdrop-filter.
    for (const line of resets) {
      const count = indexCss.split(line).length - 1;
      expect(count, `expected two fallback resets for "${line}"`).toBeGreaterThanOrEqual(2);
    }
  });

  it('routes the page containers through the veil tokens', () => {
    const blockOf = (selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(indexCss);
      if (!match) throw new Error(`Missing CSS block for ${selector}`);
      return match[1] ?? '';
    };
    expect(blockOf('.app')).toContain('background: var(--veil-shell);');
    expect(blockOf('.workspace-shell')).toContain('background: var(--veil-shell);');
    expect(blockOf('.split')).toContain('background: var(--veil-page);');
    expect(blockOf('.pane')).toContain('background: var(--material-regular);');
    expect(blockOf('.workspace')).toContain('background: var(--veil-canvas);');
    expect(blockOf('.viewer')).toContain('background: var(--veil-canvas);');
    expect(blockOf('.entry-main--scroll')).toContain('background: var(--material-ultrathin);');
  });
});

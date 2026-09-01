import { describe, expect, it } from 'vitest';
import { readExpandedIndexCss } from '../helpers/read-expanded-css';

const indexCss = readExpandedIndexCss();

function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(indexCss);
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? '';
}

describe('default app background colors', () => {
  it('uses the orbit-morph light fallback background by default', () => {
    const root = cssBlock(':root');

    expect(root).toContain('--bg: #ECECEA;');
    expect(root).toContain('--bg-app: #ECECEA;');
  });

  it('keeps the orbit-morph dark theme background', () => {
    const dark = cssBlock('[data-theme="dark"]');

    expect(dark).toContain('--bg: #0B0E14;');
    expect(dark).toContain('--bg-app: #0B0E14;');
  });

  it('uses the orbit-morph UI font for --sans over the retired rebrand faces', () => {
    const root = cssBlock(':root');
    const sans = /--sans:\s*([^;]+);/.exec(root)?.[1];

    expect(sans).toBeDefined();
    expect(sans).toContain('"Inter"');
    expect(sans).not.toContain('"Space Grotesk"');
    expect(sans).toMatch(/"Inter", "PingFang SC", "Microsoft YaHei", sans-serif/);
  });
});

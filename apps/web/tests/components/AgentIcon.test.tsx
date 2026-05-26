import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AgentIcon } from '../../src/components/AgentIcon';

describe('AgentIcon', () => {
  it('renders a color-baked agent SVG as an <img> pointing at the bundled asset', () => {
    // qoder has explicit fill colors (#111113, #2adb5c) so it does NOT
    // need theme-aware rendering — `<img>` is fine.
    const markup = renderToStaticMarkup(<AgentIcon id="qoder" size={24} />);

    expect(markup).toContain('src="/agent-icons/qoder.svg"');
    expect(markup).toContain('class="agent-icon"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('renders the Kimi SVG with two-tone branding (blue + gray secondary mark)', () => {
    // kimi is a baked two-tone asset: blue accent (#1783ff) for brand identity,
    // and gray (#666666) secondary mark for contrast on both light and dark surfaces.
    // Validate the bundled asset is valid SVG with the expected fills.
    const kimiSvg = readFileSync(
      new URL('../../public/agent-icons/kimi.svg', import.meta.url),
      'utf8',
    );

    // Asset must be valid SVG (not corrupted with non-XML text).
    expect(kimiSvg).toMatch(/^<svg\b/);
    // Blue accent path must be present.
    expect(kimiSvg).toContain('fill="#1783ff"');
    // Gray secondary mark must be present (neither white nor dark-only).
    expect(kimiSvg).toContain('fill="#666666"');
    expect(kimiSvg).not.toContain('fill="#fff"');
    expect(kimiSvg).not.toContain('fill="#1c1b1a"');

    // AgentIcon renders it through <img>, not mask.
    const markup = renderToStaticMarkup(<AgentIcon id="kimi" size={24} />);
    expect(markup).toContain('src="/agent-icons/kimi.svg"');
    expect(markup).toContain('class="agent-icon"');
    expect(markup).not.toContain('agent-icon-mono');
  });

  it('renders Devin as a PNG (Cognition does not publish an SVG mark)', () => {
    const markup = renderToStaticMarkup(<AgentIcon id="devin" size={24} />);

    expect(markup).toContain('src="/agent-icons/devin.png"');
  });

  it('renders monochrome SVGs as a CSS-masked <span> so they pick up theme color', () => {
    // cursor-agent.svg ships with `fill="currentColor"` and would lose its
    // ink under a dark theme if loaded through `<img>` (which would make
    // it a separate document that can't inherit `--text`). Rendering it
    // as a mask + `background-color: currentColor` lets CSS theme the mark.
    const markup = renderToStaticMarkup(<AgentIcon id="cursor-agent" size={24} />);

    expect(markup).toContain('class="agent-icon agent-icon-mono"');
    expect(markup).toContain('mask-image:url(&quot;/agent-icons/cursor-agent.svg&quot;)');
    // Crucially NOT an <img> — that's exactly the regression we're fixing.
    expect(markup).not.toContain('<img src="/agent-icons/cursor-agent.svg"');
  });

  it('falls back to an initial-letter pill for unknown agents', () => {
    const markup = renderToStaticMarkup(<AgentIcon id="unknown-agent" size={24} />);

    expect(markup).toContain('agent-icon-fallback');
    // Initial = first alphabetic char of the id, uppercased.
    expect(markup).toContain('>U</span>');
    // The fallback uses CSS class styling, not inline gradients.
    expect(markup).not.toContain('linear-gradient');
  });
});

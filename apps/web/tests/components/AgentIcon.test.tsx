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

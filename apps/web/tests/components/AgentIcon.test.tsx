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

  it('renders the Kiro SVG with a background tile that actually paints', () => {
    // Regression guard. The tile was authored as `<rect fill="#9046ff" rx="260"/>`
    // — no width, no height. Per SVG 2 both default to `auto`, which resolves to
    // 0 and disables rendering of the element, so the purple tile silently
    // vanished and the mark degraded to a bare white ghost: invisible against a
    // light panel, and nothing failed.
    const kiroSvg = readFileSync(
      new URL('../../public/agent-icons/kiro.svg', import.meta.url),
      'utf8',
    );

    expect(kiroSvg).toMatch(/^<svg\b/);
    const rects = kiroSvg.match(/<rect\b[^>]*>/g) ?? [];
    expect(rects).toHaveLength(1);
    expect(rects[0]).toMatch(/\bwidth=/);
    expect(rects[0]).toMatch(/\bheight=/);
    // Kiro's product purple, matching the kiro.dev mark. This is the CLI agent's
    // brand tile — deliberately not the macOS app icon used by the editor tile,
    // which is a separate official asset (dark, ghost in shades).
    expect(rects[0]).toContain('#9046ff');

    // Colors are baked, so it renders through <img> rather than the
    // currentColor mask, which would flatten it to a solid square.
    const markup = renderToStaticMarkup(<AgentIcon id="kiro" size={24} />);
    expect(markup).toContain('src="/agent-icons/kiro.svg"');
    expect(markup).not.toContain('agent-icon-mono');
  });

  it('renders Devin as a PNG (Cognition does not publish an SVG mark)', () => {
    const markup = renderToStaticMarkup(<AgentIcon id="devin" size={24} />);

    expect(markup).toContain('src="/agent-icons/devin.png"');
  });

  it('renders Aider as a PNG (Aider only ships a rasterised avatar)', () => {
    const markup = renderToStaticMarkup(<AgentIcon id="aider" size={24} />);

    expect(markup).toContain('src="/agent-icons/aider.png"');
    expect(markup).not.toContain('agent-icon-fallback');
  });

  it('renders Trae CLI as a PNG keyed on the trae-cli runtime id', () => {
    // The daemon runtime def id is `trae-cli`, so the icon file and the
    // ICON_EXT key must match that id exactly (not a bare `trae`).
    const markup = renderToStaticMarkup(<AgentIcon id="trae-cli" size={24} />);

    expect(markup).toContain('src="/agent-icons/trae-cli.png"');
    expect(markup).not.toContain('agent-icon-fallback');
  });

  it('renders Pi as a color-baked <img>, not a CSS mask', () => {
    // pi.svg is a dark tile (#09090b) with a white glyph — baked colors, so
    // masking it with `currentColor` would flatten it to a solid square.
    const markup = renderToStaticMarkup(<AgentIcon id="pi" size={24} />);

    expect(markup).toContain('src="/agent-icons/pi.svg"');
    expect(markup).not.toContain('agent-icon-mono');
  });

  it('renders AMR as the bundled color SVG instead of the fallback initial', () => {
    const amrSvg = readFileSync(
      new URL('../../public/agent-icons/amr.svg', import.meta.url),
      'utf8',
    );
    const markup = renderToStaticMarkup(<AgentIcon id="amr" size={24} />);

    expect(amrSvg).toMatch(/^<svg\b/);
    expect(amrSvg).toContain('fill="#202020"');
    expect(markup).toContain('src="/agent-icons/amr.svg"');
    expect(markup).not.toContain('agent-icon-fallback');
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

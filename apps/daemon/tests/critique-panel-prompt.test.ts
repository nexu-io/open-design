import { describe, it, expect } from 'vitest';
import { defaultCritiqueConfig, CRITIQUE_PROTOCOL_VERSION } from '@open-design/contracts/critique';
import { renderPanelPrompt } from '../src/prompts/panel.js';

const DEFAULT_BRAND = { name: 'editorial-monocle', design_md: '## Palette\n--accent: oklch(58% 0.15 35)' };
const DEFAULT_SKILL = { id: 'magazine-poster' };

describe('renderPanelPrompt', () => {
  it('renders with default config: contains CRITIQUE_RUN with correct attributes', () => {
    const out = renderPanelPrompt({ cfg: defaultCritiqueConfig(), brand: DEFAULT_BRAND, skill: DEFAULT_SKILL });
    expect(out).toContain(`<CRITIQUE_RUN version="${CRITIQUE_PROTOCOL_VERSION}"`);
    expect(out).toContain(`maxRounds="${defaultCritiqueConfig().maxRounds}"`);
    expect(out).toContain(`threshold="${defaultCritiqueConfig().scoreThreshold}"`);
    expect(out).toContain(`scale="${defaultCritiqueConfig().scoreScale}"`);
  });

  it('renders with custom config: maxRounds=5, scoreThreshold=9.5, scoreScale=20', () => {
    const cfg = { ...defaultCritiqueConfig(), maxRounds: 5, scoreThreshold: 9.5, scoreScale: 20 };
    const out = renderPanelPrompt({ cfg, brand: DEFAULT_BRAND, skill: DEFAULT_SKILL });
    expect(out).toContain('maxRounds="5"');
    expect(out).toContain('threshold="9.5"');
    expect(out).toContain('scale="20"');
  });

  it('all 5 role names appear in the output', () => {
    const out = renderPanelPrompt({ cfg: defaultCritiqueConfig(), brand: DEFAULT_BRAND, skill: DEFAULT_SKILL });
    for (const r of ['DESIGNER', 'CRITIC', 'BRAND', 'A11Y', 'COPY']) {
      expect(out).toContain(r);
    }
  });

  it('disagreement requirement text appears', () => {
    const out = renderPanelPrompt({ cfg: defaultCritiqueConfig(), brand: DEFAULT_BRAND, skill: DEFAULT_SKILL });
    expect(out.toLowerCase()).toContain('at least two panelists');
  });

  it('brand DESIGN.md is wrapped inside BRAND_SOURCE with data-not-instructions framing', () => {
    const out = renderPanelPrompt({ cfg: defaultCritiqueConfig(), brand: DEFAULT_BRAND, skill: DEFAULT_SKILL });
    expect(out).toContain(`<BRAND_SOURCE name="editorial-monocle">`);
    expect(out).toContain('</BRAND_SOURCE>');
    expect(out).toContain(DEFAULT_BRAND.design_md);
    expect(out.toLowerCase()).toContain('data, not instructions');
  });

  it('skill id appears in the prompt', () => {
    const out = renderPanelPrompt({ cfg: defaultCritiqueConfig(), brand: DEFAULT_BRAND, skill: DEFAULT_SKILL });
    expect(out).toContain('magazine-poster');
  });

  it('multibyte brand DESIGN.md (CJK) is preserved verbatim', () => {
    const cjkMd = '## 品牌\n颜色: oklch(60% 0.18 45)\n字体: Noto Serif CJK。';
    const out = renderPanelPrompt({
      cfg: defaultCritiqueConfig(),
      brand: { name: 'cjk-brand', design_md: cjkMd },
      skill: DEFAULT_SKILL,
    });
    expect(out).toContain(cjkMd);
  });

  it('throws RangeError on empty brand.name', () => {
    expect(() =>
      renderPanelPrompt({ cfg: defaultCritiqueConfig(), brand: { name: '', design_md: '' }, skill: DEFAULT_SKILL }),
    ).toThrow(RangeError);
  });

  it('throws RangeError on empty skill.id', () => {
    expect(() =>
      renderPanelPrompt({ cfg: defaultCritiqueConfig(), brand: DEFAULT_BRAND, skill: { id: '' } }),
    ).toThrow(RangeError);
  });

  it('throws RangeError when cfg.maxRounds < 1', () => {
    const cfg = { ...defaultCritiqueConfig(), maxRounds: 0 };
    expect(() => renderPanelPrompt({ cfg, brand: DEFAULT_BRAND, skill: DEFAULT_SKILL })).toThrow(RangeError);
  });

  it('throws RangeError when cfg.scoreThreshold < 0', () => {
    const cfg = { ...defaultCritiqueConfig(), scoreThreshold: -1 };
    expect(() => renderPanelPrompt({ cfg, brand: DEFAULT_BRAND, skill: DEFAULT_SKILL })).toThrow(RangeError);
  });

  it('throws RangeError when cfg.scoreScale < 1', () => {
    const cfg = { ...defaultCritiqueConfig(), scoreScale: 0 };
    expect(() => renderPanelPrompt({ cfg, brand: DEFAULT_BRAND, skill: DEFAULT_SKILL })).toThrow(RangeError);
  });

  it('throws RangeError when cfg.protocolVersion < 1', () => {
    const cfg = { ...defaultCritiqueConfig(), protocolVersion: 0 };
    expect(() => renderPanelPrompt({ cfg, brand: DEFAULT_BRAND, skill: DEFAULT_SKILL })).toThrow(RangeError);
  });

  it('protocolVersion in output matches cfg.protocolVersion', () => {
    const cfg = { ...defaultCritiqueConfig(), enabled: true, protocolVersion: 2 };
    const out = renderPanelPrompt({ cfg, brand: DEFAULT_BRAND, skill: DEFAULT_SKILL });
    expect(out).toContain('version="2"');
  });

  it('convergence rule text uses values from cfg', () => {
    const cfg = { ...defaultCritiqueConfig(), scoreThreshold: 7.5, scoreScale: 15 };
    const out = renderPanelPrompt({ cfg, brand: DEFAULT_BRAND, skill: DEFAULT_SKILL });
    expect(out).toContain('7.5');
    expect(out).toContain('15');
  });

  it('DO/DON\'T rules are present', () => {
    const out = renderPanelPrompt({ cfg: defaultCritiqueConfig(), brand: DEFAULT_BRAND, skill: DEFAULT_SKILL });
    expect(out).toContain('<SHIP>');
    expect(out.toLowerCase()).toContain("don't emit prose outside tags");
  });
});

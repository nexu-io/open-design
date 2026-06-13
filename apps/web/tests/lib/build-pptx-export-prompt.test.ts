import { describe, expect, it } from 'vitest';

import { buildPptxExportPrompt } from '../../src/lib/build-pptx-export-prompt';

describe('buildPptxExportPrompt', () => {
  it('builds an availability-safe prompt for deck HTML exports', () => {
    const prompt = buildPptxExportPrompt('Quarterly Plan.html');

    expect(prompt).toContain('Export @Quarterly Plan.html as an editable PPTX file titled "Quarterly Plan".');
    expect(prompt).toContain('`Quarterly Plan.pptx`');
    expect(prompt).toContain('Prefer the checked-in `skills/pptx-html-fidelity-audit` flow when that repo path is accessible here and the environment can run it.');
    expect(prompt).toContain('python skills/pptx-html-fidelity-audit/scripts/verify_layout.py "Quarterly Plan.pptx"');
    expect(prompt).toContain('Editable fidelity requirements: reproduce the browser deck as editable PowerPoint objects');
    expect(prompt).toContain('Do not refuse solely because a specific library, skill, or verifier is unavailable.');
    expect(prompt).toContain('Only report that editable export is impossible if no available toolchain here can produce materially editable slides.');
    expect(prompt).toContain('Do not claim the fidelity is verified if you could not run a real validation step.');
  });

  it('requires native editable shapes and only localized raster fallbacks', () => {
    const prompt = buildPptxExportPrompt('deck.html');

    expect(prompt).toContain('not as full-slide screenshots');
    expect(prompt).toContain('Create text as editable text boxes');
    expect(prompt).toContain('cards, bullets, progress rails, chart bars, borders, rounded rectangles, and simple background layers as native PPTX shapes');
    expect(prompt).toContain('Resolve CSS `color-mix()`, gradients, rgba/opacity, shadows, and borders into explicit Office-compatible fills/effects');
    expect(prompt).toContain('Use localized raster images only for isolated effects that PowerPoint cannot represent natively');
  });

  it('requires stable font slots, browser-measured layout, and asset validation', () => {
    const prompt = buildPptxExportPrompt('deck.html');

    expect(prompt).toContain('Chinese text using `PingFang SC`, `Microsoft YaHei`, or `Noto Sans CJK SC` in the `<a:ea>` slot');
    expect(prompt).toContain('Latin text using the requested Latin face in `<a:latin>`');
    expect(prompt).toContain('Measure text boxes from the browser-rendered layout when possible');
    expect(prompt).toContain('disable any PPTX autofit behavior that enlarges text or changes the layout');
    expect(prompt).toContain('resolve every local and relative artifact image before export');
    expect(prompt).toContain('verify all PPTX relationship targets exist');
  });

  it('falls back only when the audited repo flow is genuinely unavailable', () => {
    const prompt = buildPptxExportPrompt('deck.html');

    expect(prompt).toContain('If that audited repo flow is genuinely unavailable, use any other PPTX-capable toolchain that is actually available in this environment.');
    expect(prompt).toContain('If `python-pptx`, PptxGenJS, or a PPTX verification helper is missing, try another available approach instead.');
  });

  it('does not treat a mostly image-based deck as a successful editable export', () => {
    const prompt = buildPptxExportPrompt('deck.html');

    expect(prompt).toContain('If the only possible output would be a mostly rasterized or image-heavy deck, do not present that as a successful editable export');
    expect(prompt).toContain('explicitly report that materially editable export was not possible in the current environment.');
  });
});

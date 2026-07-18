import { describe, expect, test } from 'vitest';

import { cjkPromotedFontFamily, runDomToPptx } from '../../src/main/deck-capture.js';

// Reproduction for the "editable PPTX renders the wrong font in PowerPoint / WPS /
// Keynote" bug. The html-ppt templates lead every font stack with a Latin-only
// webfont (e.g. `'Inter','Noto Sans SC',…`). dom-to-pptx names a single typeface
// per text run — the FIRST family in the stack — and writes it to the PowerPoint
// `<a:latin>`, `<a:ea>` and `<a:cs>` slots alike, so CJK runs get labelled with a
// font that has no CJK glyphs. Each office suite then substitutes a *different*
// fallback and the Chinese/Japanese/Korean text renders wrong and inconsistently.
//
// The fix resolves the typeface a CJK run should actually name — the first
// CJK-capable family already in the authored stack — so all three suites land on
// the same real font. The stack is only reordered (never trimmed) so the browser
// keeps its own per-glyph fallback while dom-to-pptx reads the promoted leader.

// The real token stacks the html-ppt base + theme CSS ship.
const SANS = "\"Inter\", \"Noto Sans SC\", -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif";
const SERIF = "\"Playfair Display\", \"Noto Serif SC\", Georgia, serif";
const NEO_BRUTALISM_SANS = "\"Space Grotesk\", \"Inter\", \"Noto Sans SC\", sans-serif";

describe('cjkPromotedFontFamily', () => {
  test('promotes the CJK family ahead of a Latin-only leader for Chinese text', () => {
    const promoted = cjkPromotedFontFamily(SANS, '设计稿导出');
    expect(promoted).not.toBeNull();
    // The run now names Noto Sans SC first, so PowerPoint/WPS/Keynote resolve the
    // same CJK font instead of substituting an arbitrary one for "Inter".
    expect(promoted!.split(',')[0].trim()).toBe('"Noto Sans SC"');
  });

  test('keeps the full stack (only reordered) so browser fallback still works', () => {
    const promoted = cjkPromotedFontFamily(SANS, '设计');
    expect(promoted).toBe(
      '"Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif',
    );
  });

  test('mixed Latin + CJK text still promotes (the CJK run must be correct)', () => {
    const promoted = cjkPromotedFontFamily(SANS, 'Open Design 设计工具');
    expect(promoted!.split(',')[0].trim()).toBe('"Noto Sans SC"');
  });

  test('a Latin prefix followed by a CJK suffix still promotes (combined-text contract)', () => {
    // promoteCjkTypefaces feeds the resolver an element's COMBINED direct text, so
    // bilingual markup split across text nodes (`Product Launch<br>产品发布`) whose
    // Latin chunk comes first must still resolve to the CJK typeface.
    expect(cjkPromotedFontFamily(SANS, 'Product Launch产品发布')!.split(',')[0].trim()).toBe(
      '"Noto Sans SC"',
    );
    expect(cjkPromotedFontFamily(SANS, 'Welcome to Open Design 欢迎')!.split(',')[0].trim()).toBe(
      '"Noto Sans SC"',
    );
  });

  test('promotes the serif CJK family for serif stacks', () => {
    const promoted = cjkPromotedFontFamily(SERIF, '演示文稿');
    expect(promoted!.split(',')[0].trim()).toBe('"Noto Serif SC"');
  });

  test('promotes a CJK family buried two entries deep', () => {
    const promoted = cjkPromotedFontFamily(NEO_BRUTALISM_SANS, '交付客户');
    expect(promoted!.split(',')[0].trim()).toBe('"Noto Sans SC"');
  });

  test('promotes for Japanese kana and Korean hangul, not just Han', () => {
    expect(cjkPromotedFontFamily(SANS, 'ひらがな')!.split(',')[0].trim()).toBe('"Noto Sans SC"');
    expect(cjkPromotedFontFamily(SANS, 'カタカナ')!.split(',')[0].trim()).toBe('"Noto Sans SC"');
    expect(cjkPromotedFontFamily(SANS, '한국어')!.split(',')[0].trim()).toBe('"Noto Sans SC"');
  });

  test('leaves Latin-only text untouched (no regression for English decks)', () => {
    expect(cjkPromotedFontFamily(SANS, 'Deliver to the client')).toBeNull();
    expect(cjkPromotedFontFamily(SANS, '123 — 456')).toBeNull();
  });

  test('no-ops when a CJK family already leads the stack', () => {
    expect(cjkPromotedFontFamily('"Noto Sans SC", "Inter", sans-serif', '设计')).toBeNull();
  });

  test('no-ops when the stack carries no CJK-capable family to promote', () => {
    // Nothing in the stack can render CJK — promotion cannot invent a font, so the
    // run is left as authored (PowerPoint applies its own East-Asian fallback).
    expect(cjkPromotedFontFamily('"Inter", Arial, sans-serif', '设计')).toBeNull();
  });

  test('no-ops on a single-family stack', () => {
    expect(cjkPromotedFontFamily('"Inter"', '设计')).toBeNull();
  });

  test('tolerates missing/empty inputs', () => {
    expect(cjkPromotedFontFamily('', '设计')).toBeNull();
    expect(cjkPromotedFontFamily(SANS, '')).toBeNull();
  });

  test('matches CJK families case-insensitively and with system names', () => {
    expect(
      cjkPromotedFontFamily("Inter, 'microsoft yahei', sans-serif", '设计')!.split(',')[0].trim(),
    ).toBe("'microsoft yahei'");
    expect(
      cjkPromotedFontFamily('Inter, PingFang SC, sans-serif', '设计')!.split(',')[0].trim(),
    ).toBe('PingFang SC');
  });
});

describe('runDomToPptx CJK typeface wiring', () => {
  test('the editable-PPTX DOM prep promotes CJK typefaces before export', () => {
    const source = runDomToPptx.toString();
    // The preprocessing step runs and delegates to the shared resolver, so the
    // pure helper above genuinely governs the exported deck. (Type annotations are
    // erased by the transpiler, so match the runtime call shape.)
    expect(source).toContain('promoteCjkTypefaces(slides');
    // The walk aggregates an element's combined direct text before resolving, so a
    // CJK chunk after a Latin one is never skipped (multi-text-node regression).
    expect(source).toContain('child.nodeType === Node.TEXT_NODE');
    expect(source).toContain('cjkPromotedFontFamily(getComputedStyle(el).fontFamily, combined)');
  });

  test('the injected export wrapper is syntactically valid JS', () => {
    // renderEditablePptx serializes cjkPromotedFontFamily into the same scope as
    // runDomToPptx so the free reference resolves in the render window. A
    // serialization/scoping slip would ship a SyntaxError that silently produces
    // no PPTX, so parse (never invoke) the exact wrapper the export runs.
    const wrapped = `(() => { const cjkPromotedFontFamily = ${cjkPromotedFontFamily.toString()}; return (${runDomToPptx.toString()})(".slide"); })()`;
    expect(() => new Function(`return function(){ return ${wrapped}; };`)).not.toThrow();
  });
});

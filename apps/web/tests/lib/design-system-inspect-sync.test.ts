/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  annotateShowcaseSwatches,
  collectSwatchColorsFromShowcase,
  materializeInspectOverridesToShowcaseHtml,
  syncDesignMdFromShowcaseHtml,
} from '../../src/lib/design-system-inspect-sync';

describe('design-system-inspect-sync', () => {
  it('annotates swatches with stable data-od-id values', () => {
    const annotated = annotateShowcaseSwatches(`<!doctype html><html><head></head><body>
<section><div class="swatches">
  <div class="swatch swatch-color" style="background:#111111"></div>
  <div class="swatch swatch-color" style="background:#222222"></div>
</div></section></body></html>`);
    expect(annotated).toContain('data-od-id="ds-color-0"');
    expect(annotated).toContain('data-od-id="ds-color-1"');
  });

  it('materializes inspect overrides into inline background styles', () => {
    const annotated = annotateShowcaseSwatches(`<!doctype html><html><head>
<style data-od-inspect-overrides>[data-od-id="ds-color-0"] { background-color: #abcdef !important }</style>
</head><body><div class="swatch" data-od-id="ds-color-0" style="background:#111111"></div></body></html>`);
    const next = materializeInspectOverridesToShowcaseHtml(annotated, {
      'ds-color-0': {
        selector: '[data-od-id="ds-color-0"]',
        props: { 'background-color': '#abcdef' },
      },
    });
    expect(next).not.toContain('data-od-inspect-overrides');
    expect(next).toContain('background: #abcdef');
    expect(next).toContain('data-ds-color-hex="#abcdef"');
  });

  it('syncs DESIGN.md hex lines from showcase swatch order', () => {
    const showcase = `<!doctype html><html><body><div class="swatches">
      <div class="swatch" data-od-id="ds-color-0" data-ds-color-hex="#aabbcc" style="background:#aabbcc"></div>
      <div class="swatch" data-od-id="ds-color-1" data-ds-color-hex="#ddeeff" style="background:#ddeeff"></div>
    </div></body></html>`;
    const designMd = [
      '# Brand',
      '',
      '## Color',
      '',
      '**Primary** `#111111`: main brand',
      '**Secondary** `#222222`: support',
    ].join('\n');
    const synced = syncDesignMdFromShowcaseHtml(designMd, showcase);
    expect(synced).toContain('`#aabbcc`');
    expect(synced).toContain('`#ddeeff`');
    expect(synced).not.toContain('`#111111`');
  });

  it('collectSwatchColorsFromShowcase reads inline fills', () => {
    const colors = collectSwatchColorsFromShowcase(`<!doctype html><html><body>
      <div class="swatches"><div class="swatch" style="background:#123456"></div></div>
    </body></html>`);
    expect(colors).toHaveLength(1);
    expect(colors[0]?.hex).toBe('#123456');
  });
});

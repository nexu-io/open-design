import { describe, expect, it } from 'vitest';
import { buildSrcdoc } from './srcdoc';

const deckHtml = `<!doctype html>
<html>
  <head><title>Deck</title></head>
  <body>
    <section class="slide active">One</section>
    <section class="slide">Two</section>
    <section class="slide">Three</section>
  </body>
</html>`;

describe('buildSrcdoc', () => {
  it('injects an initial slide index for deck previews', () => {
    const doc = buildSrcdoc(deckHtml, { deck: true, initialSlideIndex: 2 });

    expect(doc).toContain('var initialSlideIndex = 2;');
    expect(doc).toContain('setTimeout(restoreInitialSlide, 200)');
    expect(doc).toContain('setTimeout(restoreInitialSlide, 100)');
  });

  it('clamps invalid initial slide indices before injecting deck bridge script', () => {
    const doc = buildSrcdoc(deckHtml, { deck: true, initialSlideIndex: -4 });

    expect(doc).toContain('var initialSlideIndex = 0;');
  });

  it('only uses directly mutable slide conventions for setActive support', () => {
    const srcdoc = buildSrcdoc(
      '<section class="slide">One</section><section class="slide">Two</section>',
      { deck: true }
    );

    const canSetActive = srcdoc.match(/function canSetActive\(list\)\{([\s\S]*?)\n  \}/)?.[1] ?? '';

    expect(canSetActive).toContain('findActiveByClass(list) >= 0');
    expect(canSetActive).toContain("list[i].style.display === 'none'");
    expect(canSetActive).toContain("list[i].style.visibility === 'hidden'");
    expect(canSetActive).toContain("list[i].hasAttribute('hidden')");
    expect(canSetActive).not.toContain('findActiveByVisibility');
  });

  it('enables the comment bridge immediately when injected', () => {
    const srcdoc = buildSrcdoc('<main data-od-id="hero">Hero</main>', {
      commentBridge: true,
    });

    expect(srcdoc).toContain('data-od-comment-bridge');
    expect(srcdoc).toContain('var enabled = true;');
    expect(srcdoc).toContain("type: 'od:comment-target'");
    expect(srcdoc).toContain("type: 'od:comment-hover'");
    expect(srcdoc).toContain("type: 'od:comment-leave'");
    expect(srcdoc).toContain("type: 'od:comment-targets'");
    expect(srcdoc).toContain("document.addEventListener('scroll', schedulePostTargets, true);");
    expect(srcdoc).toContain('data-od-comment-bridge-style');
  });
});

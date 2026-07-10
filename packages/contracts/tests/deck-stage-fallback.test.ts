import { describe, expect, it } from 'vitest';

import {
  htmlUsesDeckStageElement,
  injectDeckStageFallback,
} from '../src/runtime/deck-stage-fallback.js';

describe('deck-stage fallback runtime injection', () => {
  it('does nothing for ordinary HTML without a deck-stage element', () => {
    const html = '<!doctype html><html><body><main>Hero</main></body></html>';

    expect(htmlUsesDeckStageElement(html)).toBe(false);
    expect(injectDeckStageFallback(html)).toBe(html);
  });

  it('injects a fallback custom element runtime before body close', () => {
    const html =
      '<!doctype html><html><body><deck-stage width="1920" height="1080"><section class="slide">One</section></deck-stage></body></html>';
    const out = injectDeckStageFallback(html);

    expect(htmlUsesDeckStageElement(html)).toBe(true);
    expect(out).toContain('data-od-deck-stage-fallback');
    expect(out).toContain("window.customElements.define('deck-stage'");
    expect(out).toContain("type: 'od:slide-state'");
    expect(out.indexOf('data-od-deck-stage-fallback')).toBeLessThan(out.indexOf('</body>'));
  });

  it('is idempotent', () => {
    const html =
      '<!doctype html><html><body><deck-stage><section class="slide">One</section></deck-stage></body></html>';
    const once = injectDeckStageFallback(html);

    expect(injectDeckStageFallback(once)).toBe(once);
  });

  it('ignores modified reset keys inside the fallback keyboard handler', () => {
    const html = '<deck-stage><section class="slide">One</section></deck-stage>';
    const out = injectDeckStageFallback(html);
    const modifierGuard = 'if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey) return;';

    expect(out).toContain(modifierGuard);
    expect(out.indexOf(modifierGuard)).toBeLessThan(
      out.indexOf("String(key).toLowerCase() === 'r'"),
    );
  });

  it('keeps the injected script body free of a literal script close tag', () => {
    const html = '<deck-stage><section class="slide">One</section></deck-stage>';
    const out = injectDeckStageFallback(html);
    const marker = out.indexOf('data-od-deck-stage-fallback');
    const scriptOpenEnd = out.indexOf('>', marker);
    const scriptClose = out.indexOf('</script>', scriptOpenEnd);
    const scriptBody = out.slice(scriptOpenEnd + 1, scriptClose);

    expect(marker).toBeGreaterThan(-1);
    expect(scriptClose).toBeGreaterThan(scriptOpenEnd);
    expect(scriptBody).not.toContain('</script>');
  });
});

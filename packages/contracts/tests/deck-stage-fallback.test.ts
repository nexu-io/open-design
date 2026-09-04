import { describe, expect, it, vi } from 'vitest';

import {
  DECK_EXPLICIT_SLIDE_SELECTOR,
  DECK_LEGACY_SCREEN_LABEL_RE_SOURCE,
  DECK_LEGACY_SCREEN_SLIDE_SELECTOR,
  DECK_SCREEN_SLIDE_SELECTOR,
  DECK_SLIDE_SELECTOR,
  DECK_STRUCTURED_SLIDE_SELECTOR,
  htmlUsesDeckStageElement,
  injectDeckStageFallback,
  legacyDeckScreenNumber,
} from '../src/runtime/deck-stage-fallback.js';
import { DECK_PROTOCOL_VERSION } from '../src/runtime/deck-protocol.js';

describe('deck-stage fallback runtime injection', () => {
  it('publishes one selector contract for legacy, modern, and imported slide markers', () => {
    expect(DECK_SLIDE_SELECTOR).toBe('.slide, [data-screen-label], .deck-slide, .ppt-slide, .slide-frame');
    expect(DECK_EXPLICIT_SLIDE_SELECTOR).toBe('.slide, .deck-slide, .ppt-slide, .slide-frame');
    expect(DECK_SCREEN_SLIDE_SELECTOR).toBe('[data-screen-label]');
    expect(DECK_LEGACY_SCREEN_SLIDE_SELECTOR).toBe('section[data-screen-label]');
    expect(new RegExp(DECK_LEGACY_SCREEN_LABEL_RE_SOURCE).test('01 Cover')).toBe(true);
    for (const container of ['deck-stage', '.deck', '.deck-stage', '.deck-shell', '#deck']) {
      for (const marker of ['.slide', '[data-screen-label]', '.deck-slide', '.ppt-slide', '.slide-frame']) {
        expect(DECK_STRUCTURED_SLIDE_SELECTOR).toContain(`${container} > ${marker}`);
      }
    }
    expect(DECK_STRUCTURED_SLIDE_SELECTOR).not.toContain('body >');
  });

  it('recognizes numbered legacy slide labels without accepting prototype labels', () => {
    expect(legacyDeckScreenNumber('01 Cover')).toBe(1);
    expect(legacyDeckScreenNumber('2. Agenda')).toBe(2);
    expect(legacyDeckScreenNumber('00 Draft')).toBeNull();
    expect(legacyDeckScreenNumber('Hero title')).toBeNull();
    expect(legacyDeckScreenNumber('CTA')).toBeNull();
  });

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
    expect(out).toContain('type: "od:deck-ready"');
    expect(out).toContain('type: "od:slide-state"');
    expect(out).toContain('protocolVersion: 1');
    expect(out).toContain('get index()');
    expect(out).toContain('goTo(index)');
    expect(out).toContain("this.go('next')");
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

  it('accepts legacy and v1 navigation while rejecting other protocol versions', () => {
    const html = '<deck-stage><section class="slide">One</section></deck-stage>';
    const out = injectDeckStageFallback(html);
    const handlerBody = /_onMessage\(ev\) \{([\s\S]*?)\n    \}\n\n    _onKeydown/.exec(out)?.[1];
    expect(handlerBody).toBeTruthy();

    const onMessage = new Function('ev', handlerBody ?? '') as (
      this: { go: (action: unknown, index: unknown) => void },
      ev: { data: Record<string, unknown> },
    ) => void;
    const go = vi.fn();
    const receiver = { go };

    onMessage.call(receiver, { data: { type: 'od:slide', action: 'next' } });
    onMessage.call(receiver, {
      data: { type: 'od:slide', action: 'go', index: 1, protocolVersion: DECK_PROTOCOL_VERSION },
    });
    onMessage.call(receiver, {
      data: { type: 'od:slide', action: 'prev', protocolVersion: DECK_PROTOCOL_VERSION + 1 },
    });

    expect(go).toHaveBeenCalledTimes(2);
    expect(go).toHaveBeenNthCalledWith(1, 'next', undefined);
    expect(go).toHaveBeenNthCalledWith(2, 'go', 1);
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

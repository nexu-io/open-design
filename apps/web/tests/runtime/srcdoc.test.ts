import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

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

  it('injects the snapshot bridge used by draw annotations', () => {
    const srcdoc = buildSrcdoc('<main style="color:red">Hero</main>');

    expect(srcdoc).toContain('data-od-snapshot-bridge');
    expect(srcdoc).toContain("data.type !== 'od:snapshot'");
    expect(srcdoc).toContain("type: 'od:snapshot:result'");
    expect(srcdoc).toContain('copyComputedStyle');
    expect(srcdoc).toContain('foreignObject');
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

  it('injects the selection bridge for comment mode', () => {
    const srcdoc = buildSrcdoc('<main data-od-id="hero">Hero</main>', {
      commentBridge: true,
    });

    expect(srcdoc).toContain('data-od-selection-bridge');
    // The bridge boots with the requested mode already on so a click
    // immediately after srcdoc rebuild is not lost to the listener-install
    // race against the host's `od:*-mode` postMessage.
    expect(srcdoc).toContain('var commentEnabled = true;');
    expect(srcdoc).toContain('var inspectEnabled = false;');
    expect(srcdoc).toContain("type: 'od:comment-target'");
    expect(srcdoc).toContain("type: 'od:comment-hover'");
    expect(srcdoc).toContain("type: 'od:comment-leave'");
    expect(srcdoc).toContain("type: 'od:comment-targets'");
    expect(srcdoc).toContain("postStroke('od:pod-stroke')");
    expect(srcdoc).toContain("postStroke('od:pod-select')");
    expect(srcdoc).toContain('data-od-comment-mode-kind');
    expect(srcdoc).toContain("body * { cursor: crosshair !important; }");
    expect(srcdoc).toContain('MutationObserver(schedulePostTargets)');
    expect(srcdoc).toContain('schedulePostPreviewScroll');
    expect(srcdoc).toContain("type: 'od:preview-scroll'");
    expect(srcdoc).toContain("type: 'od:preview-scroll-request'");
    expect(srcdoc).toContain('data-od-selection-bridge-style');
  });

  it('emits free-pin fallback coordinates in viewport space', () => {
    const srcdoc = buildSrcdoc('<main>Hero</main>', { commentBridge: true });
    const freePinStart = srcdoc.indexOf('var pinX = Math.round(ev.clientX);');
    const freePinEnd = srcdoc.indexOf('// Pod drawing', freePinStart);
    const freePinBlock = srcdoc.slice(freePinStart, freePinEnd);

    expect(freePinBlock).toContain('var pinX = Math.round(ev.clientX);');
    expect(freePinBlock).toContain('var pinY = Math.round(ev.clientY);');
    expect(freePinBlock).toContain('position: { x: pinX - 12, y: pinY - 12, width: 24, height: 24 }');
    expect(freePinBlock).not.toContain('scrollX');
    expect(freePinBlock).not.toContain('scrollY');
    expect(freePinBlock).not.toContain('pageXOffset');
    expect(freePinBlock).not.toContain('pageYOffset');
  });

  it('injects the selection bridge for inspect mode and exposes override hooks', () => {
    const srcdoc = buildSrcdoc('<main data-od-id="hero">Hero</main>', {
      inspectBridge: true,
    });

    expect(srcdoc).toContain('data-od-selection-bridge');
    expect(srcdoc).toContain('var commentEnabled = false;');
    expect(srcdoc).toContain('var inspectEnabled = true;');
    expect(srcdoc).toContain("type: 'od:inspect-overrides'");
    expect(srcdoc).toContain("data.type === 'od:inspect-mode'");
    expect(srcdoc).toContain("data.type === 'od:inspect-set'");
    expect(srcdoc).toContain("data.type === 'od:inspect-reset'");
    expect(srcdoc).toContain("data.type === 'od:inspect-extract'");
    expect(srcdoc).toContain("data-od-inspect-overrides");
    expect(srcdoc).toContain('html[data-od-inspect-mode]');
  });

  it('hydrates inspect overrides from a persisted style block on bridge boot', () => {
    // Without hydration, the first od:inspect-set rebuilds the override
    // sheet from an empty in-memory map and silently drops every previously
    // saved rule for other elements — Save-to-source would then erase them
    // from the artifact too.
    const srcdoc = buildSrcdoc('<main data-od-id="hero">Hero</main>', {
      inspectBridge: true,
    });
    expect(srcdoc).toContain('function hydrateOverridesFromDom()');
    expect(srcdoc).toContain('hydrateOverridesFromDom();');
    expect(srcdoc).toContain("document.querySelector('style[data-od-inspect-overrides]')");
    // After hydration, the bridge must seed the host's overrides state so a
    // Save-to-source before the user has touched any control does not splice
    // an empty CSS body that erases the persisted style block.
    expect(srcdoc).toContain('if (Object.keys(overrides).length) setTimeout(postOverrides, 0);');
  });

  it('reflects the requested initial bridge modes on the documentElement attributes', () => {
    const commentDoc = buildSrcdoc('<main data-od-id="hero">Hero</main>', {
      commentBridge: true,
    });
    expect(commentDoc).toContain("document.documentElement.toggleAttribute('data-od-comment-mode', true)");

    const inspectDoc = buildSrcdoc('<main data-od-id="hero">Hero</main>', {
      inspectBridge: true,
    });
    expect(inspectDoc).toContain("document.documentElement.toggleAttribute('data-od-inspect-mode', true)");
  });

  it('omits the selection bridge entirely when neither comment nor inspect mode is on', () => {
    const srcdoc = buildSrcdoc('<main data-od-id="hero">Hero</main>', {});
    expect(srcdoc).not.toContain('data-od-selection-bridge');
  });

  // Regression for nexu-io/open-design#362: the bridge must accept an
  // od:inspect-replay message that replaces its in-memory override map
  // with the host's authoritative set. Without this, toggling Inspect
  // off/on or switching to Comment mode reloads the iframe from
  // previewSource without the host's unsaved style block, leaving
  // preview and persisted state out of sync — saveInspectToSource()
  // could then commit CSS the user is no longer seeing.
  it('accepts od:inspect-replay to rehydrate from the host map after a srcdoc rebuild', () => {
    const srcdoc = buildSrcdoc('<main data-od-id="hero">Hero</main>', {
      inspectBridge: true,
    });
    expect(srcdoc).toContain("data.type === 'od:inspect-replay'");
    // Re-validates the inbound payload under the same allow-list and
    // value sanitizer used for od:inspect-set. A parent able to post to
    // this bridge is otherwise trusted, but applying its payload through
    // the bridge's own contract keeps the override sheet under known
    // rules instead of whatever the parent sent.
    expect(srcdoc).toContain('Object.prototype.hasOwnProperty.call(ALLOWED_PROPS, name)');
    // The replay handler installs the host map atomically — clears the
    // previous in-memory map first, then re-applies validated entries
    // and rebuilds the sheet in a single pass so the user does not see
    // a flash of unstyled preview between the two postMessages a
    // per-prop replay would require.
    expect(srcdoc).toContain('overrides = Object.create(null);');
  });

  it('hardens inspect overrides with a prop allow-list, value sanitizer, and trusted selector', () => {
    const srcdoc = buildSrcdoc('<main data-od-id="hero">Hero</main>', {
      inspectBridge: true,
    });

    // Allow-list rejects anything off the InspectPanel surface — without
    // this a malicious parent could smuggle CSS via od:inspect-set.
    expect(srcdoc).toContain('var ALLOWED_PROPS');
    expect(srcdoc).toContain("'color': true");
    expect(srcdoc).toContain("'background-color': true");
    expect(srcdoc).toContain("'border-radius': true");
    expect(srcdoc).toContain("Object.prototype.hasOwnProperty.call(ALLOWED_PROPS, prop)");

    // Value sanitizer drops any character that could close the declaration,
    // the rule, or the <style> element.
    expect(srcdoc).toContain('var UNSAFE_VALUE = /[;{}<>\\n\\r]/;');
    expect(srcdoc).toContain('UNSAFE_VALUE.test(v)');

    // Selector is recomputed from elementId, not echoed back from the
    // inbound message — defends against a forged selector breaking out
    // of the override <style> block. The inbound selector is still
    // inspected to pick the attribute kind (data-od-id vs
    // data-screen-label) the user clicked, so an artifact that carries
    // both attributes on different nodes with the same id tunes the
    // node the host serializer keys off, not whichever attribute
    // happens to come first in safeSelectorFor's fallback order.
    expect(srcdoc).toContain('function safeSelectorFor(elementId, hint)');
    expect(srcdoc).toContain('var safeSelector = safeSelectorFor(elementId, selector)');
    expect(srcdoc).toContain("hint.indexOf('[data-od-id=') === 0");
    expect(srcdoc).toContain("hint.indexOf('[data-screen-label=') === 0");
  });

  it('marks source-authored edit targets before runtime scripts can add nodes', () => {
    const dom = new JSDOM('');
    globalThis.DOMParser = dom.window.DOMParser;
    const srcdoc = buildSrcdoc(
      '<main><h1>Source title</h1><script>document.body.prepend(document.createElement("h1"));</script></main>',
      { editBridge: true },
    );
    Reflect.deleteProperty(globalThis, 'DOMParser');

    expect(srcdoc).toContain('data-od-source-path="path-0"');
    expect(srcdoc).toContain('data-od-source-path="path-0-0"');
    expect(srcdoc).not.toContain('<script data-od-source-path=');
    expect(srcdoc.indexOf('data-od-source-path="path-0"')).toBeLessThan(srcdoc.indexOf('document.body.prepend'));
  });

  it('injects only the manual edit bridge when edit mode is enabled without picker bridges', () => {
    const dom = new JSDOM('');
    globalThis.DOMParser = dom.window.DOMParser;
    const srcdoc = buildSrcdoc('<main data-od-id="hero">Hero</main>', {
      editBridge: true,
    });
    Reflect.deleteProperty(globalThis, 'DOMParser');

    expect(srcdoc).toContain('data-od-source-path=');
    expect(srcdoc).toContain('data-od-edit-bridge');
    expect(srcdoc).not.toContain('data-od-selection-bridge');
    expect(srcdoc).not.toContain("type: 'od:comment-target'");
    expect(srcdoc).not.toContain("type: 'od:inspect-overrides'");
  });
});

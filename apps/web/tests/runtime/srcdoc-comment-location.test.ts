// @vitest-environment node
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

describe('Owner saved-comment DOM location (OPEND-3516)', () => {
  it.each([false, true])('locates a retained H2 by selector before a reused root id and preserves that selector (annotated=%s)', (annotated) => {
    const dom = new JSDOM('<body><main data-od-id="old-id"><section><h2>Location target</h2></section></main></body>',
      { runScripts: 'outside-only', pretendToBeVisual: true });
    try {
      const win = dom.window;
      const postMessage = vi.fn();
      Object.defineProperty(win, 'parent', { value: { postMessage }, configurable: true });
      let y = 1100;
      const target = win.document.querySelector('h2')!;
      if (annotated) target.setAttribute('data-od-id', 'new-h2-id');
      const scroll = vi.fn(() => { y = 80; });
      Object.defineProperty(target, 'scrollIntoView', { value: scroll });
      Object.defineProperty(target, 'getBoundingClientRect', { value: () =>
        ({ x: 20, y, top: y, left: 20, right: 220, bottom: y + 40, width: 200, height: 40 }) });
      const full = buildSrcdoc('<body></body>', { commentBridge: true, inspectBridge: true });
      const script = full.match(/<script data-od-selection-bridge>([\s\S]*?)<\/script>/)?.[1];
      if (!script) throw new Error('Missing selection bridge');
      new win.Function(script).call(win);
      win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-mode', enabled: true } }));
      win.dispatchEvent(new win.MessageEvent('message', { data: {
        type: 'od:comment-active-target', elementId: 'old-id',
        selector: 'body > main > section > h2', locate: true, requestId: 'old-comment-v1',
      } }));
      expect(scroll).toHaveBeenCalledOnce();
      expect(postMessage.mock.calls.map(call => call[0])).toContainEqual(expect.objectContaining({
        type: 'od:comment-active-target-update', requestId: 'old-comment-v1',
        selector: 'body > main > section > h2',
        position: { x: 20, y: 80, width: 200, height: 40 },
      }));
      postMessage.mockClear();
      win.document.querySelector('main')!.remove();
      win.dispatchEvent(new win.MessageEvent('message', { data: {
        type: 'od:comment-active-target', elementId: 'old-id', selector: 'body > main > section > h2',
        locate: true, requestId: 'missing-target',
      } }));
      expect(postMessage.mock.calls.map(call => call[0])).toContainEqual(expect.objectContaining({
        type: 'od:comment-location-missing', requestId: 'missing-target',
      }));
    } finally { dom.window.close(); }
  });
});

import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { injectCommentBridge } from '../../src/runtime/comment-bridge';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

const inspectMessages = [
  'od:inspect-set', 'od:inspect-reset', 'od:inspect-extract', 'od:inspect-replay', 'od:inspect-overrides',
];
const commentMessages = [
  'od:comment-mode', 'od:comment-target', 'od:comment-targets', 'od:comment-active-target-update', 'od:preview-scroll', 'od:pod-stroke',
];

describe('share-safe comment bridge', () => {
  it('contains the frozen comment protocol but none of the five inspect capabilities', () => {
    const bridge = injectCommentBridge('<main data-od-id="hero">Hero</main>', true);
    for (const type of commentMessages) expect(bridge).toContain(type);
    for (const type of inspectMessages) expect(bridge).not.toContain(type);
  });

  it('keeps the production srcdoc on its original full comment+inspect composition', () => {
    const full = buildSrcdoc('<main data-od-id="hero">Hero</main>', { commentBridge: true, inspectBridge: true });
    expect(full).toContain('data-od-selection-bridge');
    for (const type of inspectMessages) expect(full).toContain(type);
  });

  it('keeps portable bridge annotated target identities round-trippable through their selector', () => {
    const cases = [
      { attrs: 'data-od-id="hero" data-screen-label="Home"', elementId: 'hero', selector: '[data-od-id="hero"]' },
      { attrs: 'data-screen-label="Home"', elementId: 'Home', selector: '[data-screen-label="Home"]' },
      { attrs: 'data-od-id="" data-screen-label="Home"', elementId: 'Home', selector: '[data-screen-label="Home"]' },
      { attrs: 'data-od-id="say &quot;hi&quot;"', elementId: 'say "hi"', selector: '[data-od-id="say \\"hi\\""]' },
    ];

    for (const testCase of cases) {
      const dom = new JSDOM(`<!doctype html><div id="target" ${testCase.attrs}>Target</div>`, { runScripts: 'outside-only' });
      const win = dom.window;
      const postMessage = vi.fn();
      Object.defineProperty(win, 'parent', { configurable: true, value: { postMessage } });
      const target = win.document.getElementById('target')!;
      Object.defineProperty(target, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ x: 0, y: 0, width: 10, height: 10 }),
      });
      const script = injectCommentBridge('<body></body>', true).match(/<script data-od-comment-bridge>([\s\S]*?)<\/script>/)?.[1];
      if (!script) throw new Error('portable comment bridge script not found');
      new win.Function(script).call(win);
      postMessage.mockClear();
      target.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
      const payload = postMessage.mock.calls.map((call) => call[0]).find((message) => message?.type === 'od:comment-target');
      expect(payload).toMatchObject({ elementId: testCase.elementId, selector: testCase.selector });
      expect(win.document.querySelector(String(payload?.selector))).toBe(target);
      dom.window.close();
    }

    const dom = new JSDOM('<!doctype html><div id="target" data-od-id="" data-screen-label="">Target</div>', { runScripts: 'outside-only' });
    const win = dom.window;
    const postMessage = vi.fn();
    Object.defineProperty(win, 'parent', { configurable: true, value: { postMessage } });
    const target = win.document.getElementById('target')!;
    Object.defineProperty(target, 'getBoundingClientRect', { configurable: true, value: () => ({ x: 0, y: 0, width: 10, height: 10 }) });
    const script = injectCommentBridge('<body></body>', true).match(/<script data-od-comment-bridge>([\s\S]*?)<\/script>/)?.[1];
    if (!script) throw new Error('portable comment bridge script not found');
    new win.Function(script).call(win);
    postMessage.mockClear();
    target.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(postMessage.mock.calls.map((call) => call[0]).filter((message) => message?.type === 'od:comment-target')).toEqual([]);
    dom.window.close();
  });
});

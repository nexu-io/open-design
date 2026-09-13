// @vitest-environment jsdom
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { buildPreviewBuildFocusBridge, previewBuildFocusRequest } from '@open-design/contracts/runtime/preview-build-focus';

function fixture() {
  const dom = new JSDOM('<body><section><h1>Hero module</h1><p>Actual written content</p></section><section><h2>Footer module</h2></section></body>', { runScripts: 'outside-only' });
  const win = dom.window;
  const messages: Record<string, unknown>[] = [];
  let scrolls = 0;
  win.postMessage = (message: Record<string, unknown>) => { messages.push(message); };
  win.requestAnimationFrame = (callback: FrameRequestCallback) => { callback(0); return 1; };
  win.Element.prototype.getBoundingClientRect = () => ({ x: 10, y: 20, left: 10, top: 20, right: 410, bottom: 220, width: 400, height: 200, toJSON() {} });
  win.Element.prototype.scrollIntoView = () => { scrolls++; };
  win.eval(buildPreviewBuildFocusBridge().replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
  const request = (anchor: string | null, title?: string) => win.dispatchEvent(new win.MessageEvent('message', {
    data: previewBuildFocusRequest('r', anchor, null, title), source: win as unknown as Window,
  }));
  return { win, messages, request, scrolls: () => scrolls, close: () => win.close() };
}

describe('live preview bridge behavior', () => {
  it('locates the containing module, prioritizes written text, and does not scroll repeatedly', () => {
    const f = fixture();
    try {
      f.request('Actual written content', 'Build Footer module');
      expect(f.messages.at(-1)).toMatchObject({ found: true, label: 'Hero module', width: 400 });
      f.request('Actual written content', 'Build Footer module');
      expect(f.scrolls()).toBe(1);
      f.win.dispatchEvent(new f.win.Event('scroll'));
      f.win.dispatchEvent(new f.win.Event('resize'));
      expect(f.scrolls()).toBe(1);
    } finally { f.close(); }
  });
  it('falls back to a unique title and never scrolls for an unmatched activity', () => {
    const f = fixture();
    try {
      f.request('missing text', 'Build Footer module');
      expect(f.messages.at(-1)).toMatchObject({ found: true, label: 'Footer module' });
      f.request(null, 'Unrelated task');
      expect(f.messages.at(-1)).toMatchObject({ found: false });
      expect(f.scrolls()).toBe(1);
    } finally { f.close(); }
  });
});

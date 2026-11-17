import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { injectCommentBridge } from '../../src/runtime/comment-bridge';
import { buildSrcdoc } from '../../src/runtime/srcdoc';
const uuid = '12345678-1234-4234-8234-123456789abc';
const selector = `[data-od-comment-id="${uuid}"]`;
for (const full of [false, true]) describe(`complete injected comment runtime (srcdoc=${full})`, () => {
  function setup(html: string) {
    const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
    const win = dom.window;
    const postMessage = vi.fn();
    // Complete frame work here, so RAF cannot outlive the disposed document.
    win.requestAnimationFrame = callback => { callback(0); return 1; };
    Object.defineProperty(win, 'parent', { value: { postMessage }, configurable: true });
    for (const el of win.document.querySelectorAll('*')) {
      Object.defineProperty(el, 'getBoundingClientRect', { value: () => ({ x: 20, y: 40, width: 200, height: 40 }) });
      Object.defineProperty(el, 'scrollIntoView', { value: vi.fn() });
    }
    const injected = full ? buildSrcdoc('<body></body>', { commentBridge: true, inspectBridge: true }) : injectCommentBridge('<body></body>', true);
    const script = injected.match(full ? /<script data-od-selection-bridge>([\s\S]*?)<\/script>/ : /<script data-od-comment-bridge>([\s\S]*?)<\/script>/)?.[1];
    if (!script) throw new Error('missing complete injection');
    new win.Function(script).call(win);
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:inspect-mode', enabled: false } }));
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-mode', enabled: true, mode: 'picker' } }));
    return { dom, win, postMessage };
  }
  it('own persisted identity wins over tool id, including unannotated authored targets', () => {
    const { dom, win, postMessage } = setup(`<body><h2 data-od-id="tool" data-od-comment-id="${uuid}">Target</h2></body>`);
    try {
      win.document.querySelector('h2')!.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      expect(postMessage.mock.calls.map(c => c[0])).toContainEqual(expect.objectContaining({ type: 'od:comment-target', elementId: `cmt:${uuid}`, selector }));
    } finally { dom.window.close(); }
  });
  it.each(['missing', 'duplicate-hidden', 'malformed', 'mismatch'])('strict locate fails without scrolling or fallback: %s', kind => {
    const attrs = kind === 'missing' ? '' : `data-od-comment-id="${uuid}"`;
    const { dom, win, postMessage } = setup(`<body><h2 data-od-id="tool" ${attrs}>Target</h2>${kind === 'duplicate-hidden' ? `<h2 hidden data-od-comment-id="${uuid}">Duplicate</h2>` : ''}</body>`);
    try {
      const target = win.document.querySelector('h2')!;
      postMessage.mockClear();
      win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-active-target', elementId: kind === 'malformed' ? 'cmt:bad' : `cmt:${uuid}`, selector: kind === 'mismatch' ? '[data-od-id="tool"]' : selector, locate: true, requestId: 'request-1' } }));
      expect(target.scrollIntoView).not.toHaveBeenCalled();
      expect(postMessage.mock.calls.map(c => c[0])).toContainEqual(expect.objectContaining({ type: 'od:comment-location-missing', requestId: 'request-1' }));
    } finally { dom.window.close(); }
  });
  it('healthy retained identity locates repeatedly after text changes/movement, then actual loss fails', () => {
    const { dom, win, postMessage } = setup(`<body><h2 data-od-comment-id="${uuid}">Target</h2><p>Neighbor</p></body>`);
    try {
      const target = win.document.querySelector('h2')!;
      target.textContent = 'Changed target';
      win.document.body.appendChild(target);
      for (const requestId of ['first', 'second']) {
        win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-active-target', elementId: `cmt:${uuid}`, selector, locate: true, requestId } }));
        expect(postMessage.mock.calls.map(c => c[0])).toContainEqual(expect.objectContaining({ type: 'od:comment-active-target-update', elementId: `cmt:${uuid}`, requestId, text: 'Changed target', position: { x: 20, y: 40, width: 200, height: 40 } }));
      }
      expect(target.scrollIntoView).toHaveBeenCalledTimes(2);
      target.removeAttribute('data-od-comment-id');
      win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-active-target', elementId: `cmt:${uuid}`, selector, locate: true, requestId: 'lost' } }));
      expect(target.scrollIntoView).toHaveBeenCalledTimes(2);
      expect(postMessage.mock.calls.map(c => c[0])).toContainEqual(expect.objectContaining({ type: 'od:comment-location-missing', requestId: 'lost' }));
    } finally { dom.window.close(); }
  });
  it.each(['data-od-id', 'data-screen-label'])('quoted legacy %s value is not an attribute-namespace claim', attribute => {
    const { dom, win, postMessage } = setup(`<body><h2 ${attribute}="data-od-comment-id">Target</h2></body>`);
    try {
      win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-active-target', elementId: 'data-od-comment-id', selector: `[${attribute}="data-od-comment-id"]`, locate: true, requestId: 'legacy-word' } }));
      expect(postMessage.mock.calls.map(c => c[0])).toContainEqual(expect.objectContaining({ type: 'od:comment-active-target-update', elementId: 'data-od-comment-id' }));
    } finally { dom.window.close(); }
  });
  it('wrong-prefix UUID pairs fail after a healthy exact-prefix locate', () => {
    const { dom, win, postMessage } = setup(`<body><h2 data-od-comment-id="${uuid}">Target</h2></body>`);
    try {
      const target = win.document.querySelector('h2')!;
      win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-active-target', elementId: `cmt:${uuid}`, selector, locate: true, requestId: 'healthy' } }));
      expect(target.scrollIntoView).toHaveBeenCalledOnce();
      expect(postMessage.mock.calls.map(c => c[0])).toContainEqual(expect.objectContaining({ type: 'od:comment-active-target-update', requestId: 'healthy' }));
      postMessage.mockClear();
      win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-active-target', elementId: `bad:${uuid}`, selector, locate: true, requestId: 'wrong-prefix' } }));
      expect(target.scrollIntoView).toHaveBeenCalledOnce();
      expect(postMessage.mock.calls.map(c => c[0])).toContainEqual(expect.objectContaining({ type: 'od:comment-location-missing', requestId: 'wrong-prefix' }));
    } finally { dom.window.close(); }
  });
  it('dynamic selected descendant never borrows an ancestor persisted identity', () => {
    const { dom, win, postMessage } = setup(`<body><h2 data-od-id="tool" data-od-comment-id="${uuid}"><span>Dynamic child</span></h2></body>`);
    try {
      win.document.querySelector('span')!.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      const selected = postMessage.mock.calls.map(c => c[0]).find(m => m.type === 'od:comment-target');
      expect(selected).toBeTruthy();
      expect(selected.elementId.startsWith('cmt:')).toBe(false);
    } finally { dom.window.close(); }
  });
  it('hidden duplicates are rejected before target indexing', () => {
    const { dom, win, postMessage } = setup(`<body><h2 data-od-id="tool" data-od-comment-id="${uuid}">Target</h2><h2 hidden data-od-comment-id="${uuid}">Duplicate</h2></body>`);
    try {
      win.document.querySelector('h2')!.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      expect(postMessage.mock.calls.map(c => c[0]).filter(m => m.type === 'od:comment-target' && m.elementId === `cmt:${uuid}`)).toEqual([]);
    } finally { dom.window.close(); }
  });
});

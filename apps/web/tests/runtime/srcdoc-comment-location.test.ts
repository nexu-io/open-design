// @vitest-environment node
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

function controlAnimationFrames(win: JSDOM['window']) {
  let nextId = 0;
  const queued = new Map<number, FrameRequestCallback>();
  win.requestAnimationFrame = callback => { const id = ++nextId; queued.set(id, callback); return id; };
  win.cancelAnimationFrame = id => { queued.delete(id); };
  return {
    flush() {
      const frame = [...queued.values()];
      queued.clear();
      frame.forEach(callback => callback(0));
    },
    clear() { queued.clear(); },
  };
}

describe('Owner saved-comment DOM location (OPEND-3516)', () => {
  it.each([false, true])('locates a retained H2 by selector before a reused root id and preserves that selector (annotated=%s)', (annotated) => {
    const dom = new JSDOM('<body><main data-od-id="old-id"><section><h2>Location target</h2></section></main></body>',
      { runScripts: 'outside-only', pretendToBeVisual: true });
    try {
      const win = dom.window;
      controlAnimationFrames(win);
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
      target.remove();
      const unrelatedRoot = win.document.querySelector('main')!;
      const rootScroll = vi.fn();
      Object.defineProperty(unrelatedRoot, 'scrollIntoView', { value: rootScroll });
      Object.defineProperty(unrelatedRoot, 'getBoundingClientRect', { value: () =>
        ({ x: 0, y: 0, top: 0, left: 0, right: 752, bottom: 38, width: 752, height: 38 }) });
      win.dispatchEvent(new win.MessageEvent('message', { data: {
        type: 'od:comment-active-target', elementId: 'old-id', selector: 'body > main > section > h2',
        locate: true, requestId: 'missing-target',
      } }));
      expect(rootScroll).not.toHaveBeenCalled();
      expect(postMessage.mock.calls.map(call => call[0])).toContainEqual(expect.objectContaining({
        type: 'od:comment-location-missing', requestId: 'missing-target',
      }));
      const replacement = win.document.createElement('h2');
      replacement.textContent = 'Replacement';
      win.document.querySelector('section')!.append(replacement);
      const replacementScroll = vi.fn();
      Object.defineProperty(replacement, 'scrollIntoView', { value: replacementScroll });
      Object.defineProperty(replacement, 'getBoundingClientRect', { value: () =>
        ({ x: 20, y: 80, top: 80, left: 20, right: 220, bottom: 120, width: 200, height: 40 }) });
      win.dispatchEvent(new win.MessageEvent('message', { data: {
        type: 'od:comment-active-target', elementId: 'old-id', selector: 'body > main > section > h2',
        locate: true, requestId: 'replacement-target',
      } }));
      expect(replacementScroll).toHaveBeenCalledOnce();
      expect(postMessage.mock.calls.map(call => call[0])).toContainEqual(expect.objectContaining({
        type: 'od:comment-active-target-update', requestId: 'replacement-target', text: 'Replacement',
      }));
    } finally { dom.window.close(); }
  });
});

describe('OPEND-3887 published-source comment identities', () => {
  it.each([undefined, 'authored-title', 'path-0-0'])('does not persist preview-generated IDs (authored=%s)', authored => {
    const parser = new JSDOM('');
    vi.stubGlobal('DOMParser', parser.window.DOMParser);
    const source = `<html><body><header><h1${authored ? ` data-od-id="${authored}"` : ''}>Published title</h1></header></body></html>`;
    const srcdoc = buildSrcdoc(source, { commentBridge: true });
    vi.unstubAllGlobals();
    const dom = new JSDOM(srcdoc, { runScripts: 'outside-only', pretendToBeVisual: true });
    try {
      const win = dom.window;
      controlAnimationFrames(win);
      const postMessage = vi.fn();
      Object.defineProperty(win, 'parent', { value: { postMessage }, configurable: true });
      const target = win.document.querySelector('h1')!;
      Object.defineProperty(target, 'getBoundingClientRect', { value: () =>
        ({ x: 20, y: 80, top: 80, left: 20, right: 220, bottom: 120, width: 200, height: 40 }) });
      const script = srcdoc.match(/<script data-od-selection-bridge>([\s\S]*?)<\/script>/)?.[1];
      if (!script) throw new Error('Missing selection bridge');
      new win.Function(script).call(win);
      win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-mode', enabled: true } }));
      target.dispatchEvent(new win.MouseEvent('click', { bubbles: true, clientX: 30, clientY: 90 }));
      const picked = postMessage.mock.calls.map(call => call[0]).filter(message => message.type === 'od:comment-target').at(-1);
      expect(picked).toBeDefined();
      expect(picked.elementId).toBe(authored ?? `dom:${picked.selector}`);
      const published = new JSDOM(source);
      expect(published.window.document.querySelector(picked.selector)?.textContent).toBe('Published title');
      published.window.close();
      win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-active-target',
        elementId: picked.elementId, selector: picked.selector, validateForSave: true, requestId: 'save' } }));
      expect(postMessage.mock.calls.map(call => call[0])).toContainEqual(expect.objectContaining({
        type: 'od:comment-active-target-update', requestId: 'save', elementId: picked.elementId, selector: picked.selector,
      }));
    } finally { dom.window.close(); parser.window.close(); vi.unstubAllGlobals(); }
  });
});

it.each([true, false])('tracks an explicitly opened saved comment in browse mode without intercepting page clicks (annotated=%s)', async annotated => {
  const dom = new JSDOM(`<body><button${annotated ? ' data-od-id="target"' : ''}>Action</button></body>`, { runScripts: 'outside-only', pretendToBeVisual: true });
  try {
    const win = dom.window;
    const frames = controlAnimationFrames(win);
    const postMessage = vi.fn();
    Object.defineProperty(win, 'parent', { value: { postMessage }, configurable: true });
    const target = win.document.querySelector('button')!;
    Object.defineProperty(target, 'getBoundingClientRect', { value: () => ({ x: 10.25, y: 20.5, top: 20.5, left: 10.25, right: 110.25, bottom: 60.5, width: 100, height: 40 }) });
    const script = buildSrcdoc('<body></body>', { commentBridge: true }).match(/<script data-od-selection-bridge>([\s\S]*?)<\/script>/)?.[1];
    if (!script) throw new Error('Missing selection bridge');
    new win.Function(script).call(win);
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-mode', enabled: false, observe: true } }));
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-active-target',
      elementId: annotated ? 'target' : 'dom:body > button:nth-of-type(1)', selector: 'body > button:nth-of-type(1)' } }));
    await new Promise(resolve => win.setTimeout(resolve, 25));
    frames.flush();
    expect(postMessage.mock.calls.map(call => call[0])).toContainEqual(expect.objectContaining({ type: 'od:comment-targets', targets: expect.arrayContaining([expect.objectContaining({ position: { x: 10.25, y: 20.5, width: 100, height: 40 } })]) }));
    const clicked = vi.fn(); target.addEventListener('click', clicked);
    const event = new win.MouseEvent('click', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(clicked).toHaveBeenCalledOnce();
    expect(win.document.documentElement.hasAttribute('data-od-comment-mode')).toBe(false);
  } finally { dom.window.close(); }
});

it.each(['missing', 'duplicate'] as const)('does not fall back to an annotation when an authored id is %s', state => {
  const dom = new JSDOM('<body><button id="stable" data-od-id="legacy">Original</button></body>', { runScripts: 'outside-only' });
  try {
    const win = dom.window;
    const frames = controlAnimationFrames(win);
    const postMessage = vi.fn();
    Object.defineProperty(win, 'parent', { value: { postMessage }, configurable: true });
    const target = win.document.querySelector('button')!;
    const scroll = vi.fn();
    Object.defineProperty(target, 'scrollIntoView', { value: scroll });
    Object.defineProperty(target, 'getBoundingClientRect', { value: () => ({ x: 10, y: 20, left: 10, top: 20, width: 100, height: 40 }) });
    const script = buildSrcdoc('<body></body>', { commentBridge: true }).match(/<script data-od-selection-bridge>([\s\S]*?)<\/script>/)?.[1];
    if (!script) throw new Error('Missing selection bridge');
    new win.Function(script).call(win);
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-mode', enabled: true } }));
    if (state === 'missing') target.removeAttribute('id');
    else win.document.body.insertAdjacentHTML('beforeend', '<button id="stable" style="display:none">Hidden duplicate</button>');
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-active-target', elementId: 'legacy', selector: '[id="stable"]', locate: true, requestId: state } }));
    expect(scroll).not.toHaveBeenCalled();
    expect(postMessage.mock.calls.map(call => call[0])).toContainEqual(expect.objectContaining({ type: 'od:comment-location-missing', requestId: state }));
    if (state === 'duplicate') {
      // The target table must not infer uniqueness from its visible entries.
      win.document.dispatchEvent(new win.Event('scroll'));
      frames.flush();
      expect(postMessage.mock.calls.map(call => call[0])).toContainEqual(expect.objectContaining({
        type: 'od:comment-targets', targets: expect.arrayContaining([expect.objectContaining({ domIdUnique: false })]),
      }));
    }

  } finally { dom.window.close(); }
});

it('reports the full target table and selected target in the same scroll animation frame', () => {
  const dom = new JSDOM('<body><button data-od-id="target">Action</button></body>', { runScripts: 'outside-only' });
  try {
    const win = dom.window;
    const frames = controlAnimationFrames(win);
    const postMessage = vi.fn();
    Object.defineProperty(win, 'parent', { value: { postMessage }, configurable: true });
    const target = win.document.querySelector('button')!;
    let y = 200;
    Object.defineProperty(target, 'getBoundingClientRect', { value: () => ({ x: 10, y, left: 10, top: y, width: 100, height: 40 }) });
    const script = buildSrcdoc('<body></body>', { commentBridge: true }).match(/<script data-od-selection-bridge>([\s\S]*?)<\/script>/)?.[1];
    if (!script) throw new Error('Missing selection bridge');
    new win.Function(script).call(win);
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-mode', enabled: false, observe: true } }));
    win.dispatchEvent(new win.MessageEvent('message', { data: { type: 'od:comment-active-target', elementId: 'target', selector: '[data-od-id="target"]' } }));
    frames.flush();
    postMessage.mockClear();
    y = 40;
    win.document.dispatchEvent(new win.Event('scroll'));
    expect(postMessage.mock.calls.map(call => call[0]).filter(message => message.type === 'od:comment-targets' || message.type === 'od:comment-active-target-update')).toEqual([]);
    frames.flush();
    const messages = postMessage.mock.calls.map(call => call[0]);
    expect(messages).toContainEqual(expect.objectContaining({ type: 'od:comment-targets', targets: expect.arrayContaining([expect.objectContaining({ elementId: 'target', position: { x: 10, y: 40, width: 100, height: 40 } })]) }));
    expect(messages).toContainEqual(expect.objectContaining({ type: 'od:comment-active-target-update', elementId: 'target', position: { x: 10, y: 40, width: 100, height: 40 } }));
    frames.clear();
  } finally { dom.window.close(); }
});

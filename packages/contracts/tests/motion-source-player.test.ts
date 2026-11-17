import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { injectMotionSourcePlayer, markMotionFrameRender } from '../src/runtime/motion-source-player';

describe('motion source player boundaries', () => {
  it('recovers when the timeline arrives after the readiness notice and stops polling after unmount', () => {
    let now = 0;
    const pending: Array<() => void> = [];
    const elements: Array<{ isConnected: boolean; textContent: string; style: { cssText: string; display: string }; setAttribute(): void; appendChild(): void }> = [];
    const root = {
      dataset: { width: '1080', height: '1080', compositionId: 'main' },
      style: { setProperty() {} }, parentNode: { insertBefore() {} },
      getAttribute: () => '4', addEventListener() {},
    };
    const sandbox = {
      URL, location: { href: 'http://localhost/preview' }, innerWidth: 1600, innerHeight: 900,
      Date: { now: () => now }, __odMotionPreview: true,
      __timelines: {} as Record<string, unknown>,
      parent: { postMessage() {} }, addEventListener() {}, clearTimeout() {},
      setTimeout: (callback: () => void) => { pending.push(callback); },
      document: {
        readyState: 'complete',
        querySelector: (selector: string) => selector.startsWith('meta') ? { content: 'video' } : root,
        querySelectorAll: () => [], head: { appendChild() {} }, body: { appendChild() {} },
        createElement: () => {
          const element = { isConnected: true, textContent: '', style: { cssText: '', display: '' }, setAttribute() {}, appendChild() {} };
          elements.push(element); return element;
        },
      },
    };
    const html = injectMotionSourcePlayer('<meta name="od-motion-output" content="video"><main data-composition-id="main"></main>');
    const code = /<script data-od-motion-source-player="11">([\s\S]*?)<\/script>/.exec(html)![1]!;
    runInNewContext(code, Object.assign(sandbox, { window: sandbox }));
    now = 16_000;
    pending.shift()!();
    expect(elements[0]!.textContent).toContain('动效未就绪');
    expect(pending).toHaveLength(1);
    const timeline = { duration: () => 4, timeScale: () => 1, seek() {}, play() {}, pause() {}, time: () => 0 };
    sandbox.__timelines.main = timeline;
    const retry = pending.shift()!;
    retry();
    expect(elements[0]!.textContent).toBe('');
    expect(sandbox).toHaveProperty('__odMotionPlayer');
    expect(pending).toHaveLength(0);
    // A removed preview cannot keep a retry chain alive.
    sandbox.__timelines = {};
    elements[2]!.isConnected = false;
    retry();
    expect(pending).toHaveLength(0);
  });
  it.each([true, false])('preserves the root layout contract (stage opt-in: %s)', (stageLayout) => {
    const properties: Record<string, string> = {};
    const root = {
      dataset: { width: '1080', height: '1080', compositionId: 'main', ...(stageLayout ? { odMotionLayout: 'stage' } : {}) },
      style: { setProperty: (key: string, value: string) => { properties[key] = value; } },
      parentNode: { insertBefore() {} },
    };
    const elements: Array<{ style: { cssText: string }; setAttribute(): void; appendChild(): void }> = [];
    const listeners: Record<string, () => void> = {};
    const sandbox = {
      URL, location: { href: 'http://localhost/preview' }, innerWidth: 1600, innerHeight: 900,
      setTimeout() {},
      addEventListener: (type: string, callback: () => void) => { listeners[type] = callback; },
      document: {
        readyState: 'complete',
        querySelector: (selector: string) => selector.startsWith('meta') ? { content: 'video' } : root,
        querySelectorAll: () => [],
        head: { appendChild() {} }, body: { appendChild() {} },
        createElement: () => {
          const element = { isConnected: true, style: { cssText: '' }, setAttribute() {}, appendChild() {} };
          elements.push(element); return element;
        },
      },
    };
    const html = injectMotionSourcePlayer('<meta name="od-motion-output" content="video"><main data-composition-id="main"></main>');
    const code = /<script data-od-motion-source-player="11">([\s\S]*?)<\/script>/.exec(html)![1]!;
    runInNewContext(code, Object.assign(sandbox, { window: sandbox }));
    if (stageLayout) expect(properties).toMatchObject({ width: '1080px', height: '1080px', left: '0', top: '0', transform: 'none' });
    else expect(properties).toEqual({});
    expect(elements[2]!.style.cssText).toContain('left:350px;top:0px;');
    // Legacy authors run a deferred fit() after host boot. Its centering must
    // remain paired with the author's 50% CSS offsets, untouched by the host.
    if (!stageLayout) {
      properties.transform = 'translate(-50%,-50%)';
      expect(properties.left).toBeUndefined();
      expect(properties.top).toBeUndefined();
    }
    // An author fit() callback ran before the host's resize callback.
    properties.transform = 'translate(-50%,-50%) scale(.5)';
    sandbox.innerWidth = 900; sandbox.innerHeight = 1600;
    listeners.resize!();
    expect(properties.transform).toBe(stageLayout ? 'none' : 'translate(-50%,-50%) scale(.5)');
    expect(elements[2]!.style.cssText).toContain('left:0px;top:350px;');
  });
  it('leaves ordinary documents and code samples unchanged', () => {
    for (const html of ['<html><body>Prototype</body></html>', '<html><body><script>const sample = \'<div data-composition-id="main">\';</script></body></html>']) {
      expect(injectMotionSourcePlayer(html)).toBe(html);
    }
  });
  it('installs once after author code, with render mode set before all scripts', () => {
    const source = '<!doctype html><html><head><meta name="od-motion-output" content="video"></head><body><div data-composition-id="main"></div><script>window.__timelines={};</script></body></html>';
    const result = injectMotionSourcePlayer(source);
    expect(result).toContain('data-od-motion-source-player');
    expect(injectMotionSourcePlayer(result)).toBe(result);
    const render = markMotionFrameRender(result);
    expect(render.indexOf('window.__odMotionRender=true')).toBeLessThan(render.indexOf('window.__timelines={}'));
  });
});

describe('autoplay mode boundary', () => {
  it('leaves unmarked HyperFrames and interactive compositions untouched', () => {
    const root = '<div data-composition-id="main"></div>';
    const legacy = injectMotionSourcePlayer(root);
    expect(legacy).toBe(root);
    const interactive = '<meta name="od-motion-output" content="interactive">' + root;
    expect(injectMotionSourcePlayer(interactive)).toBe(interactive);
    const video = injectMotionSourcePlayer('<meta content="video" name="od-motion-output">' + root);
    expect(video).toContain('window.__odMotionPlayer =');
    expect(video).not.toContain('id="play"');
  });
  it('does not replace an existing player in an unmarked legacy composition', () => {
    const source = '<main data-composition-id="main"></main><script data-od-motion-source-player>authorPlayer();</script>';
    expect(injectMotionSourcePlayer(source)).toBe(source);
  });
});

describe('motion audio contract isolation', () => {
  it('upgrades an existing host player without duplicating it', () => {
    const source = '<meta name="od-motion-output" content="video"><div data-composition-id="main"></div><script data-od-motion-source-player="6">oldPlayer();</script>';
    const result = injectMotionSourcePlayer(source);
    expect(result).not.toContain('oldPlayer');
    expect(result).toContain('data-od-motion-source-player="11"');
    expect(injectMotionSourcePlayer(result)).toBe(result);
  });
});

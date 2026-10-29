import { describe, expect, it } from 'vitest';
import { injectMotionSourcePlayer, markMotionFrameRender } from '../src/runtime/motion-source-player';

describe('motion source player boundaries', () => {
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
    expect(result).toContain('data-od-motion-source-player="8"');
    expect(injectMotionSourcePlayer(result)).toBe(result);
  });
});

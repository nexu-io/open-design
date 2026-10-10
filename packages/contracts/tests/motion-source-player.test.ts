import { describe, expect, it } from 'vitest';
import { injectMotionSourcePlayer, markMotionFrameRender } from '../src/runtime/motion-source-player';
import { MotionDeliveryContractSchema } from '../src/motion-delivery';

describe('motion source player boundaries', () => {
  it('leaves ordinary documents and code samples unchanged', () => {
    for (const html of ['<html><body>Prototype</body></html>', '<html><body><script>const sample = \'<div data-composition-id="main">\';</script></body></html>']) {
      expect(injectMotionSourcePlayer(html)).toBe(html);
    }
  });
  it('installs once after author code, with render mode set before all scripts', () => {
    const source = '<!doctype html><html><head></head><body><div data-composition-id="main"></div><script>window.__timelines={};</script></body></html>';
    const result = injectMotionSourcePlayer(source);
    expect(result).toContain('data-od-motion-source-player');
    expect(injectMotionSourcePlayer(result)).toBe(result);
    const render = markMotionFrameRender(result);
    expect(render.indexOf('window.__odMotionRender=true')).toBeLessThan(render.indexOf('window.__timelines={}'));
  });
});

describe('frozen motion output paths', () => {
  it.each(['../escape.mp4', '/absolute.mp4', 'https://host/video.mp4', 'clip.mp4?x=1', 'dir/../clip.mp4'])('rejects unsafe video path %s', (videoPath) => {
    expect(MotionDeliveryContractSchema.safeParse({ mode:'video', sourcePath:'source/index.html', videoPath }).success).toBe(false);
  });
  it('requires an MP4 path only for video', () => {
    expect(MotionDeliveryContractSchema.safeParse({ mode:'video', sourcePath:'index.html' }).success).toBe(false);
    expect(MotionDeliveryContractSchema.safeParse({ mode:'interactive', sourcePath:'index.html' }).success).toBe(true);
  });
});

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { injectMotionSourcePlayer } from '@open-design/contracts/runtime/motion-source-player';
import { injectHyperFramesFrameBridge } from '../../src/media/index.js';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const gsap = readFileSync(require.resolve('gsap/dist/gsap.min.js'), 'utf8');
function source(body: string, mode = 'video') {
  return `<!doctype html><html><head><meta name="od-motion-output" content="${mode}"></head><body>
  <main data-composition-id="main" data-duration="20" data-width="1080" data-height="1920"></main>
  <script>${gsap}</script><script>const tl=gsap.timeline({paused:true});${body};window.__timelines={main:tl};</script></body></html>`;
}
// Models the runtime's clock padding. Preflight must inspect the authored clock first.
const runtime = `window.__runtimeLoaded=true; window.__timelines.main.timeScale(1).to({}, {duration:20},0);
window.__renderReady=true;window.__player={getDuration:()=>20,renderSeek:(t,o)=>window.__timelines.main.seek(t,o.suppressEvents)};`;

describe('motion video authored clock', () => {
  it('rejects the real 18.9s duration-setter defect before renderer normalization', async () => {
    const dom = new JSDOM(injectHyperFramesFrameBridge(source('tl.to({x:0},{x:1,duration:18.9});tl.duration(20)'), runtime), {runScripts:'dangerously',pretendToBeVisual:true});
    try {
      expect(dom.window.__timelines.main.duration()).toBe(18.9);
      expect(dom.window.__timelines.main.timeScale()).toBeCloseTo(.945);
      await expect(dom.window.__odFrameRenderer.ready()).rejects.toThrow('timeScale must be 1');
      expect(dom.window.__runtimeLoaded).toBeUndefined();
    } finally { dom.window.close(); }
  });
  it.each(['interactive', ''])('leaves %s rendering unchanged', async (mode) => {
    const dom = new JSDOM(injectHyperFramesFrameBridge(source('tl.to({}, {duration:18.9});tl.duration(20)', mode), runtime), {runScripts:'dangerously',pretendToBeVisual:true});
    try { expect(await dom.window.__odFrameRenderer.ready()).toEqual({duration:20,fps:30}); }
    finally { dom.window.close(); }
  });
  it('uses identical real seconds for source seek and exported seek', async () => {
    const html = source('window.clock={t:0};tl.to(window.clock,{t:20,duration:20,ease:"none"},0)');
    const preview = new JSDOM(injectMotionSourcePlayer(html), {runScripts:'dangerously',pretendToBeVisual:true});
    const render = new JSDOM(injectHyperFramesFrameBridge(html, runtime), {runScripts:'dangerously',pretendToBeVisual:true});
    try {
      await new Promise<void>(resolve => preview.window.addEventListener('load', () => resolve()));
      const player = preview.window.__odMotionPlayer;
      expect(player.state().duration).toBe(20);
      expect(preview.window.document.querySelector('[data-od-motion-controls]')).toBeNull();
      expect(await render.window.__odFrameRenderer.ready()).toEqual({duration:20,fps:30});
      for (const time of [0,5,10,18.9,20,8]) {
        player.seek(time);
        await render.window.__odFrameRenderer.seek(time);
        expect(preview.window.clock.t).toBeCloseTo(time);
        expect(render.window.clock.t).toBeCloseTo(preview.window.clock.t);
      }
    } finally { render.window.close(); preview.window.close(); }
  });
  it('shows a clock error instead of enabling a mismatched source player', async () => {
    const dom = new JSDOM(injectMotionSourcePlayer(source('tl.to({}, {duration:18.9})')), {runScripts:'dangerously',pretendToBeVisual:true});
    try {
      await new Promise<void>(resolve => dom.window.addEventListener('load', () => resolve()));
      expect(dom.window.document.querySelector('[data-od-motion-status]').textContent).toContain('timeline duration must equal');
      expect(dom.window.__odMotionPlayer).toBeUndefined();
      expect(dom.window.__timelines.main.paused()).toBe(true);
    } finally { dom.window.close(); }
  });
});

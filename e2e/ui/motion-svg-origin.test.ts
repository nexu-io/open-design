import { readFileSync } from 'node:fs';
import { expect, test } from '@/playwright/suite';

// Exercise the actual authored helper shipped in the motion profile, rather
// than keeping a separate, perpetually-correct test implementation.
const profile = readFileSync(new URL('../../plugins/_official/scenarios/od-next-strategy/assets/task-profiles/motion-design.md', import.meta.url), 'utf8');
const helper = profile.match(/```js\n(function popShape[\s\S]*?)\n```/)![1];
const gsap = readFileSync(new URL('../../plugins/_official/examples/motion-showreel/assets/gsap.min.js', import.meta.url), 'utf8');

test('[P1] SVG disk and half disk retain their shared center after pop and backward seek', async ({ page }) => {
  await page.goto('about:blank');
  await page.setContent('<svg width="1080" height="1920"><circle id="disk" cx="550" cy="1290" r="42"/><path id="half" d="M550 1248 A42 42 0 0 1 550 1332 Z"/></svg>');
  await page.addScriptTag({ content: gsap });
  await page.addScriptTag({ content: `${helper};window.tl=gsap.timeline({paused:true});for(const id of ['disk','half'])popShape(window.tl,document.getElementById(id),550,1290,0);` });
  const values = await page.evaluate(() => {
    const tl = (window as unknown as { tl: { seek(t:number):void } }).tl;
    return [0.45,0.2,0.45].map(time => {
      tl.seek(time);
      return ['disk','half'].map(id => {
        const node = document.getElementById(id) as unknown as SVGGraphicsElement;
        const m = node.getCTM()!;
        return {x:550*m.a+1290*m.c+m.e,y:550*m.b+1290*m.d+m.f};
      });
    });
  });
  for (const [disk,half] of values) {
    expect(disk!.x).toBeCloseTo(half!.x,2);
    expect(disk!.y).toBeCloseTo(half!.y,2);
  }
  expect(values[0]![0]).toEqual({x:550,y:1290});
  expect(values[2]).toEqual(values[0]);
});

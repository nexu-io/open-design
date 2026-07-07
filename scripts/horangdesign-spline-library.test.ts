import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildMotionLibrary,
  extractMotionSignals,
  normalizeSplineSourceUrl,
} from './horangdesign-spline-library.ts';

test('normalizeSplineSourceUrl accepts public spline.design URLs and rejects app.spline.design', () => {
  assert.equal(normalizeSplineSourceUrl('https://spline.design/examples/'), 'https://spline.design/examples/');
  assert.equal(normalizeSplineSourceUrl('https://app.spline.design/file/abc'), null);
});

test('extractMotionSignals captures animation vocabulary without copying private scene data', () => {
  const signals = extractMotionSignals(`
    <script src="/gsap.min.js"></script>
    <canvas id="scene"></canvas>
    <div data-spline-viewer data-scrolltrigger="true">orbit parallax cursor hover reveal</div>
  `);
  assert.deepEqual(signals.libraries.sort(), ['canvas', 'gsap', 'scrolltrigger', 'spline'].sort());
  assert.ok(signals.motionVocabulary.includes('orbit'));
  assert.ok(signals.motionVocabulary.includes('parallax'));
  assert.ok(signals.motionVocabulary.includes('cursor-responsive'));
});

test('buildMotionLibrary creates reusable Horangdesign entries from public references', () => {
  const library = buildMotionLibrary([
    {
      url: 'https://www.rideradian.com/',
      title: 'Radian',
      html: '<script>gsap ScrollTrigger</script><canvas></canvas><section>scroll parallax cinematic product orbit</section>',
      notes: '몰입감 좋음. 모션은 많이 따라해도 됨.',
    },
  ]);
  assert.equal(library.schemaVersion, 'horangdesign-motion-library/v1');
  assert.equal(library.entries.length, 1);
  assert.equal(library.entries[0]?.source.url, 'https://www.rideradian.com/');
  assert.ok(library.entries[0]?.motionVocabulary.includes('cinematic-scroll'));
  assert.ok(library.entries[0]?.applicationPrompts.some((line) => line.includes('HTML/CSS/Three.js')));
});

test('buildMotionLibrary skips app.spline.design scene URLs because robots disallows crawling', () => {
  const library = buildMotionLibrary([
    { url: 'https://app.spline.design/file/private-scene', html: '<canvas></canvas>' },
    { url: 'https://spline.design/examples', html: '<canvas>scroll parallax</canvas>' },
  ]);
  assert.equal(library.entries.length, 1);
  assert.equal(library.entries[0]?.source.url, 'https://spline.design/examples');
});

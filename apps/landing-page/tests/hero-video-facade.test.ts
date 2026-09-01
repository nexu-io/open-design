import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const pageSource = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../app/pages/index.astro', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('hero video facade exposes exactly one labelled, focusable control', () => {
  const frame = pageSource.match(/<div\s+className='hero-video-frame'[\s\S]*?>/)?.[0];
  assert.ok(frame, 'hero video frame is missing');
  // The wrapper is a plain presentational container: not focusable, no role.
  assert.doesNotMatch(frame, /tabIndex/);
  assert.doesNotMatch(frame, /role=/);

  const button = pageSource.match(/<button[^>]*className='hero-video-play'[\s\S]*?>/)?.[0];
  assert.ok(button, 'play button is missing');
  assert.match(button, /type='button'/);
  assert.match(button, /aria-label='Play the OpenDesign walkthrough video'/);
  // The button stays in the tab order — it is the focus target.
  assert.doesNotMatch(button, /tabIndex=\{-1\}/);

  // Activation is the native button click (bubbling to the frame); no custom
  // key handler on a generic element.
  assert.match(indexSource, /frame\.addEventListener\('click', play\)/);
  assert.doesNotMatch(indexSource, /frame\.addEventListener\('keydown'/);
  assert.match(stylesSource, /\.hero-video-play:focus-visible/);
});

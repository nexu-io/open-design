// Unit coverage for the plugin-preview GC protected-set + orphan selection.
//   node --test scripts/plugin-previews-gc.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keysFromManifest, protectedKeys, selectOrphans } from './plugin-previews-gc.mjs';

const DAY = 24 * 60 * 60 * 1000;

test('keysFromManifest collects video + poster of every entry', () => {
  const m = {
    previews: {
      a: { video: 'a/h1/preview.mp4', poster: 'a/h1/poster.jpg' },
      b: { video: 'b/h2/preview.mp4', poster: 'b/h2/poster.jpg' },
    },
  };
  assert.deepEqual(keysFromManifest(m).sort(), [
    'a/h1/poster.jpg',
    'a/h1/preview.mp4',
    'b/h2/poster.jpg',
    'b/h2/preview.mp4',
  ]);
});

test('keysFromManifest tolerates empty / partial manifests', () => {
  assert.deepEqual(keysFromManifest(null), []);
  assert.deepEqual(keysFromManifest({}), []);
  assert.deepEqual(keysFromManifest({ previews: { a: { video: 'a/h/preview.mp4' } } }), [
    'a/h/preview.mp4',
  ]);
});

test('protectedKeys unions across manifests (tag + release branch + main)', () => {
  const tag = { previews: { a: { video: 'a/old/preview.mp4', poster: 'a/old/poster.jpg' } } };
  const main = { previews: { a: { video: 'a/new/preview.mp4', poster: 'a/new/poster.jpg' } } };
  const set = protectedKeys([tag, main]);
  // The old clip is still protected because a shipped tag references it.
  assert.ok(set.has('a/old/preview.mp4'));
  assert.ok(set.has('a/new/preview.mp4'));
  assert.equal(set.size, 4);
});

test('selectOrphans keeps protected keys and keys inside the grace window', () => {
  const now = 1_000 * DAY;
  const objects = [
    { key: 'a/old/preview.mp4', lastModifiedMs: now - 200 * DAY }, // protected → keep
    { key: 'a/stale/preview.mp4', lastModifiedMs: now - 200 * DAY }, // orphan + old → delete
    { key: 'a/recent/preview.mp4', lastModifiedMs: now - 10 * DAY }, // orphan but young → keep
  ];
  const protectedSet = new Set(['a/old/preview.mp4']);
  const orphans = selectOrphans(objects, protectedSet, { nowMs: now, graceDays: 90 });
  assert.deepEqual(orphans, ['a/stale/preview.mp4']);
});

test('a clip referenced only by a live release branch is never an orphan', () => {
  const releaseBranch = { previews: { z: { video: 'z/r/preview.mp4', poster: 'z/r/poster.jpg' } } };
  const set = protectedKeys([releaseBranch]);
  const now = 1_000 * DAY;
  const objects = [{ key: 'z/r/preview.mp4', lastModifiedMs: now - 500 * DAY }];
  assert.deepEqual(selectOrphans(objects, set, { nowMs: now, graceDays: 90 }), []);
});

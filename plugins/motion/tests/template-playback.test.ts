import test from 'node:test';
import assert from 'node:assert/strict';
import { TemplatePlayback } from '../web/template-playback.ts';

test('gallery playback caps visible videos, prioritizes focus and releases hidden or unmounted previews', () => {
  const playback = new TemplatePlayback(), playing = new Set<string>();
  const removers = ['a', 'b', 'c', 'offscreen'].map(id => playback.register(id, { play: () => playing.add(id), pause: () => playing.delete(id) }));
  for (const id of ['a', 'b', 'c']) playback.update(id, { ready: true, visible: true });
  playback.update('offscreen', { ready: true });
  assert.equal(playing.size, 0);
  playback.configure(true, 2); assert.deepEqual([...playing], ['a', 'b']);
  playback.advance(); assert.deepEqual(new Set(playing), new Set(['a', 'c']));
  playback.update('b', { priority: true }); assert.deepEqual([...playing], ['b']);
  playback.update('b', { ready: false }); assert.equal(playing.size, 0);
  playback.update('b', { priority: false }); assert.equal(playing.size, 2);
  playback.update('c', { visible: false }); assert.deepEqual([...playing], ['a']);
  playback.configure(false); assert.equal(playing.size, 0);
  playback.configure(true, 1); assert.equal(playing.size, 1);
  removers.forEach(remove => remove()); assert.equal(playing.size, 0);
});

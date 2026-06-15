import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createAgentTitleMarkerStripper } from '../src/title-marker.js';

function createStripper() {
  const titles: string[] = [];
  const stripper = createAgentTitleMarkerStripper({
    enabled: true,
    emitTitle: (title) => titles.push(title),
  });
  return { stripper, titles };
}

test('title marker stripper parses prefix marker and answer from one delta', () => {
  const { stripper, titles } = createStripper();

  const visible = stripper.strip('\n<od-title>Foo</od-title>\nAnswer');

  assert.equal(visible, '\n\nAnswer');
  assert.deepEqual(titles, ['Foo']);
  assert.equal(stripper.flush(), '');
});

test('title marker stripper parses markers split across deltas', () => {
  const { stripper, titles } = createStripper();

  assert.equal(stripper.strip('Before <od-'), 'Before ');
  assert.equal(stripper.strip('title>Split Title</od-title> After'), ' After');

  assert.deepEqual(titles, ['Split Title']);
  assert.equal(stripper.flush(), '');
});

test('title marker stripper passes text through when disabled', () => {
  const titles: string[] = [];
  const stripper = createAgentTitleMarkerStripper({
    enabled: false,
    emitTitle: (title) => titles.push(title),
  });

  assert.equal(stripper.strip('<od-title>Foo</od-title>Answer'), '<od-title>Foo</od-title>Answer');
  assert.equal(stripper.flush(), '');
  assert.deepEqual(titles, []);
});

test('title marker stripper drops malformed marker content without throwing', () => {
  const { stripper, titles } = createStripper();

  assert.equal(stripper.strip('Lead <od-title>unfinished'), 'Lead ');
  assert.equal(stripper.flush(), '');
  assert.deepEqual(titles, []);
});

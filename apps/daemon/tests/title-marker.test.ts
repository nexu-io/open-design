import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createAgentTitleMarkerStripper } from '../src/title-marker.js';

function createStripper(shouldEmitTitle = true) {
  const titles: string[] = [];
  const stripper = createAgentTitleMarkerStripper({
    shouldEmitTitle,
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

test('title marker stripper still strips when shouldEmitTitle is false but does not fire a title event', () => {
  const { stripper, titles } = createStripper(false);

  // Subsequent-turn mode (no title-generation prompt sent this run):
  // the marker is still stripped from the visible stream so the user
  // never sees raw `<od-title>...</od-title>`, but no title event
  // is fired because the daemon did not request one for this turn.
  assert.equal(
    stripper.strip('<od-title>Foo</od-title>Answer'),
    'Answer',
  );
  assert.equal(stripper.flush(), '');
  assert.deepEqual(titles, []);
});

test('title marker stripper drops malformed marker content without throwing', () => {
  const { stripper, titles } = createStripper();

  assert.equal(stripper.strip('Lead <od-title>unfinished'), 'Lead ');
  assert.equal(stripper.flush(), '');
  assert.deepEqual(titles, []);
});

test('title marker stripper can strip markers in subsequent turns of the same run', () => {
  const { stripper, titles } = createStripper();

  // First match: strip and emit the title.
  assert.equal(
    stripper.strip('\n<od-title>First Turn</od-title>\nContent'),
    '\n\nContent',
  );
  assert.deepEqual(titles, ['First Turn']);
  assert.equal(stripper.flush(), '');

  // Second match in the same run: strip but no duplicate title event.
  assert.equal(
    stripper.strip('\n<od-title>Second Turn</od-title>\nMore'),
    '\n\nMore',
  );
  assert.deepEqual(titles, ['First Turn']);
  assert.equal(stripper.flush(), '');
});

test('title marker stripper strips across per-run instances when shouldEmitTitle is false (subsequent-turn lifecycle)', () => {
  // Production: the daemon creates one new stripper per run with
  // `shouldEmitTitle = titleGenerationRequested`, and ProjectView only sets
  // `titleGeneration.enabled` on `isFirstTurn`. So the second turn constructs
  // a disabled stripper. The bug reported in #6326 was that this disabled
  // instance let `<od-title>...</od-title>` leak verbatim to the chat pane.
  // After the fix, the disabled instance still strips the marker, but does
  // not fire a title event — which is fine, because the client's
  // `applyAgentGeneratedTitle` bails on `!isFirstTurn` anyway.
  const turn1 = createStripper(true);
  const turn2 = createStripper(false);

  assert.equal(turn1.stripper.strip('\n<od-title>Foo</od-title>\nAnswer'), '\n\nAnswer');
  assert.deepEqual(turn1.titles, ['Foo']);

  assert.equal(turn2.stripper.strip('\n<od-title>Should Be Stripped</od-title>\nMore'),
    '\n\nMore');
  assert.deepEqual(turn2.titles, []);
});

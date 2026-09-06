import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  createDsmlArtifactTextSuppressor,
  createToolCallTextSuppressor,
  scrubDsmlToolProtocolTail,
} from '../../src/artifacts/text-suppression.js';

test('DSML artifact suppressor preserves non-DSML tags at the start of a chunk', () => {
  const suppressor = createDsmlArtifactTextSuppressor();

  assert.equal(
    suppressor.strip('<question-form id="task-type">'),
    '<question-form id="task-type">',
  );
  assert.equal(suppressor.flush(), '');
});

test('DSML artifact suppressor preserves partial non-DSML tags at the start of a chunk', () => {
  const suppressor = createDsmlArtifactTextSuppressor();

  assert.equal(suppressor.strip('<question'), '<question');
  assert.equal(suppressor.flush(), '');
});

test('DSML artifact suppressor strips DSML artifact blocks', () => {
  const suppressor = createDsmlArtifactTextSuppressor();

  assert.equal(
    suppressor.strip('Done\n\n< | DSML artifact identifier="page" type="text/html">'),
    'Done\n\n',
  );
  assert.equal(
    suppressor.strip('\n<!doctype html><html></html>\n</artifact>Tail'),
    'Tail',
  );
  assert.deepEqual(suppressor.stats(), {
    suppressedChars: '< | DSML artifact identifier="page" type="text/html">'.length +
      '\n<!doctype html><html></html>\n</artifact>'.length,
    suppressedChunks: 2,
    openedBlocks: 1,
    closedBlocks: 1,
    pendingCandidateChars: 0,
    suppressing: false,
  });
});

test('DSML artifact suppressor strips legacy artifact blocks', () => {
  const suppressor = createDsmlArtifactTextSuppressor();

  assert.equal(
    suppressor.strip('Done\n\n<artifact identifier="page" type="text/html" title="Page">'),
    'Done\n\n',
  );
  assert.equal(
    suppressor.strip('\n<!doctype html><html></html>\n</artifact>Tail'),
    'Tail',
  );
});

test('DSML artifact suppressor strips split legacy artifact close tags', () => {
  const suppressor = createDsmlArtifactTextSuppressor();

  assert.equal(
    suppressor.strip('Done\n\n<artifact identifier="page" type="text/html" title="Page">raw'),
    'Done\n\n',
  );
  assert.equal(suppressor.strip('</art'), '');
  assert.equal(suppressor.strip('ifact>Tail'), 'Tail');
});

test('DSML artifact suppressor strips split legacy artifact open tags', () => {
  const suppressor = createDsmlArtifactTextSuppressor();

  assert.equal(suppressor.strip('Done\n\n<art'), 'Done\n\n');
  assert.equal(
    suppressor.strip('ifact identifier="page" type="text/html">\n<html></html>'),
    '',
  );
  assert.equal(suppressor.strip('</artifact>Tail'), 'Tail');
});

test('tool call suppressor strips edit XML blocks', () => {
  const suppressor = createToolCallTextSuppressor();

  assert.equal(suppressor.strip('Before\n<edit>'), 'Before\n');
  assert.equal(suppressor.strip('<parameter=filePath>/tmp/index.html</parameter>'), '');
  assert.equal(suppressor.strip('<parameter=newString><section>...</section></parameter>'), '');
  assert.equal(suppressor.strip('</function>\n</tool_call>After'), 'After');
  assert.deepEqual(suppressor.stats(), {
    suppressedChars:
      '<edit>'.length +
      '<parameter=filePath>/tmp/index.html</parameter>'.length +
      '<parameter=newString><section>...</section></parameter>'.length +
      '</function>\n</tool_call>'.length,
    suppressedChunks: 4,
    openedBlocks: 1,
    closedBlocks: 1,
    pendingCandidateChars: 0,
    suppressing: false,
  });
});

test('tool call suppressor preserves OD UI markup', () => {
  const suppressor = createToolCallTextSuppressor();

  assert.equal(
    suppressor.strip('<od-card type="task-brief">{"summary":"x"}</od-card>'),
    '<od-card type="task-brief">{"summary":"x"}</od-card>',
  );
});

test('tool call suppressor strips a split fullwidth DSML protocol tail', () => {
  const suppressor = createToolCallTextSuppressor();

  assert.equal(suppressor.strip('保留这段建议</｜｜DS'), '保留这段建议');
  assert.equal(suppressor.strip('ML｜｜parameter>\n</｜｜DSML｜｜inv'), '');
  assert.equal(
    suppressor.strip('oke>\n</｜｜DSML｜｜tool_calls>\n'),
    '',
  );
  assert.equal(suppressor.flush(), '');
});

test('tool call suppressor strips the ASCII-pipe DSML protocol tail', () => {
  const suppressor = createToolCallTextSuppressor();

  assert.equal(
    suppressor.strip(
      'Keep this</||DSML||parameter>\n</||DSML||invoke>\n</||DSML||tool_calls>',
    ),
    'Keep this',
  );
  assert.equal(suppressor.flush(), '');
});

test('tool call suppressor strips a split spaced ASCII-pipe DSML protocol tail', () => {
  const suppressor = createToolCallTextSuppressor();

  assert.equal(
    suppressor.strip('保留这段建议</| | DS'),
    '保留这段建议',
  );
  assert.equal(
    suppressor.strip('ML | | parameter>\n</| | DSML | | inv'),
    '',
  );
  assert.equal(
    suppressor.strip('oke>\n</| | DSML | | tool_calls>'),
    '',
  );
  assert.equal(suppressor.flush(), '');
});

test('historical scrub strips the spaced ASCII-pipe DSML protocol tail', () => {
  assert.equal(
    scrubDsmlToolProtocolTail([
      '保留这段建议',
      '</| | DSML | | parameter>',
      '</| | DSML | | invoke>',
      '</| | DSML | | tool_calls>',
    ].join('\n')),
    '保留这段建议\n',
  );
});

test('tool call suppressor preserves DSML-looking Markdown and code', () => {
  const suppressor = createToolCallTextSuppressor();
  const markdown = [
    'Literal `</｜｜DSML｜｜parameter>` stays.',
    '```xml',
    '</｜｜DSML｜｜parameter>',
    '</｜｜DSML｜｜invoke>',
    '</｜｜DSML｜｜tool_calls>',
    '```',
  ].join('\n');

  assert.equal(suppressor.strip(markdown), markdown);
  assert.equal(suppressor.flush(), '');
});

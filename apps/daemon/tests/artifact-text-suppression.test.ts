import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createDsmlArtifactTextSuppressor } from '../src/artifact-text-suppression.js';

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

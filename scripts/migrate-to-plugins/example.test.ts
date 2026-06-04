import assert from 'node:assert/strict';
import test from 'node:test';

import { derivePrompt } from './example.ts';

test('example plugin manifests prefer top-level skill example_prompt', () => {
  const prompt = derivePrompt({
    description: 'A long description that should not become the plugin use-case query.',
    example_prompt: 'Build a polished deck from the authored example prompt.',
  });

  assert.equal(prompt, 'Build a polished deck from the authored example prompt.');
});

test('example plugin manifests fall back to od.example_prompt before description snippets', () => {
  const prompt = derivePrompt({
    description: 'A long description that should not become the plugin use-case query.',
    od: {
      example_prompt: 'Create a focused artifact from od metadata.',
    },
  });

  assert.equal(prompt, 'Create a focused artifact from od metadata.');
});

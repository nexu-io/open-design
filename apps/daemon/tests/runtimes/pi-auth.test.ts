import { strict as assert } from 'node:assert';
import { test } from 'vitest';
import * as auth from '../../src/runtimes/auth.js';

const missingProviderKey = 'prompt rejected: No API key found for the selected model. Use /login to log into a provider via OAuth or API key.';

test('Pi missing provider key has actionable terminal login guidance', () => {
  const classified = auth.classifyAgentAuthFailure('pi', missingProviderKey);
  assert.ok(classified);
  assert.equal(classified.status, 'missing');
  assert.equal(classified.message, auth.piAuthGuidance());
  assert.match(classified.message, /run `pi`.*`\/login`/);
});

test('Pi matches its missing-key error and provider login instruction independently', () => {
  assert.equal(auth.isPiAuthFailureText('No API key found for the selected model.'), true);
  assert.equal(auth.isPiAuthFailureText('Use /login to log into a provider via OAuth or API key.'), true);
  assert.equal(auth.isPiAuthFailureText(missingProviderKey.toUpperCase()), true);
});

test('Pi does not turn unrelated failures or empty text into missing authentication', () => {
  for (const text of ['', ' ', 'network timeout', 'rate limit exceeded', 'Pi completed successfully']) {
    assert.equal(auth.isPiAuthFailureText(text), false);
    assert.equal(auth.classifyAgentAuthFailure('pi', text), null);
  }
  assert.equal(auth.classifyAgentAuthFailure('codex', missingProviderKey), null);
});

test('Pi guidance never repeats raw provider error content', () => {
  const classified = auth.classifyAgentAuthFailure('pi', `${missingProviderKey} synthetic-sensitive-detail`);
  assert.ok(classified);
  assert.doesNotMatch(classified.message ?? '', /synthetic-sensitive-detail/);
});

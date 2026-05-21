import { test } from 'vitest';
import { antigravity, assert, AGENT_DEFS } from './helpers/test-helpers.js';

test('antigravity is registered in AGENT_DEFS with the expected id and bin', () => {
  assert.equal(antigravity.id, 'antigravity');
  assert.equal(antigravity.bin, 'agy');
  assert.equal(antigravity.name, 'Antigravity CLI');
});

test('antigravity buildArgs invokes print mode with skip-permissions and ignores prompt + model', () => {
  const prompt = 'design a dashboard';
  const baseArgs = antigravity.buildArgs(prompt, [], [], {});
  // Prompt must arrive via stdin (gated by promptViaStdin) so the
  // composed prompt never lands on argv — same Windows ENAMETOOLONG
  // mitigation gemini.ts / qwen.ts use.
  assert.equal(antigravity.promptViaStdin, true);
  assert.equal(baseArgs.includes(prompt), false);
  assert.equal(baseArgs.includes('-'), false);
  assert.deepEqual(baseArgs, ['--print', '--dangerously-skip-permissions']);

  // 1.0.0 has no --model flag; selecting one in the picker is a no-op
  // at the CLI surface and must not leak a stray argv entry.
  const withModel = antigravity.buildArgs(prompt, [], [], { model: 'gemini-3-pro-preview' });
  assert.deepEqual(withModel, ['--print', '--dangerously-skip-permissions']);
});

test('antigravity uses the plain stream parser', () => {
  assert.equal(antigravity.streamFormat, 'plain');
});

test('antigravity fallback model list leads with the synthetic default option', () => {
  const ids = antigravity.fallbackModels.map((m) => m.id);
  assert.equal(ids[0], 'default');
  assert.ok(ids.includes('gemini-2.5-pro'));
});

test('id is unique within AGENT_DEFS (registry duplicate-id guard)', () => {
  const matches = AGENT_DEFS.filter((def) => def.id === 'antigravity');
  assert.equal(matches.length, 1);
});

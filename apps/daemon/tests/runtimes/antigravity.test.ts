import { test } from 'vitest';
import { antigravity, assert, AGENT_DEFS, chmodSync, mkdtempSync, resolveAgentExecutable, rmSync, tmpdir, writeFileSync, withEnvSnapshot, join } from './helpers/test-helpers.js';

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

test('antigravity exposes installUrl + docsUrl so SettingsDialog can render install affordances', () => {
  // Per mrcfps's review on #2607: SettingsDialog at lines 2703-2747
  // only renders the install/docs links when the def carries these
  // fields. Without them, an unavailable Antigravity row is a dead
  // "Not detected" with no recovery path. Just check they're https
  // strings — the UI normalizes through sanitizeHttpsUrl anyway.
  assert.ok(typeof antigravity.installUrl === 'string' && antigravity.installUrl.startsWith('https://'));
  assert.ok(typeof antigravity.docsUrl === 'string' && antigravity.docsUrl.startsWith('https://'));
});

test('AGY_BIN env override is honored by resolveAgentExecutable (not just by app-config parsing)', () => {
  // Per mrcfps's review on #2607: AGENT_CLI_ENV_KEYS in app-config.ts
  // (validation-only allowlist) is NOT the same as AGENT_BIN_ENV_KEYS
  // in runtimes/executables.ts (the actual resolver). Setting AGY_BIN
  // without registering it in the resolver map made the override a
  // no-op. This test guards the resolver wiring.
  const dir = mkdtempSync(join(tmpdir(), 'od-agy-bin-'));
  try {
    return withEnvSnapshot(['PATH', 'OD_AGENT_HOME'], () => {
      const configured = join(dir, 'agy-custom');
      writeFileSync(configured, '#!/bin/sh\nexit 0\n');
      chmodSync(configured, 0o755);
      process.env.PATH = '';
      process.env.OD_AGENT_HOME = dir;

      const resolved = resolveAgentExecutable(antigravity, { AGY_BIN: configured });
      assert.equal(resolved, configured);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

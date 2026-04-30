// @ts-nocheck
import { afterEach, test } from 'vitest';
import assert from 'node:assert/strict';
import { AGENT_DEFS } from '../src/agents.js';

const codex = AGENT_DEFS.find((agent) => agent.id === 'codex');
const cursorAgent = AGENT_DEFS.find((agent) => agent.id === 'cursor-agent');
const originalDisablePlugins = process.env.OD_CODEX_DISABLE_PLUGINS;

afterEach(() => {
  if (originalDisablePlugins == null) {
    delete process.env.OD_CODEX_DISABLE_PLUGINS;
  } else {
    process.env.OD_CODEX_DISABLE_PLUGINS = originalDisablePlugins;
  }
});

test('codex args disable plugins when OD_CODEX_DISABLE_PLUGINS is 1', () => {
  process.env.OD_CODEX_DISABLE_PLUGINS = '1';

  const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.deepEqual(args.slice(0, 6), [
    'exec',
    '--json',
    '--skip-git-repo-check',
    '--full-auto',
    '--disable',
    'plugins',
  ]);
  assert.equal(args.at(-1), '-');
});

test('codex args keep plugins enabled when OD_CODEX_DISABLE_PLUGINS is unset', () => {
  delete process.env.OD_CODEX_DISABLE_PLUGINS;

  const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.equal(args.includes('--disable'), false);
  assert.equal(args.includes('plugins'), false);
  assert.equal(args.at(-1), '-');
});

test('codex args keep plugins enabled when OD_CODEX_DISABLE_PLUGINS is not 1', () => {
  process.env.OD_CODEX_DISABLE_PLUGINS = 'true';

  const args = codex.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.equal(args.includes('--disable'), false);
  assert.equal(args.includes('plugins'), false);
  assert.equal(args.at(-1), '-');
});

test('cursor-agent args deliver prompts via stdin without passing a literal dash prompt', () => {
  const args = cursorAgent.buildArgs('', [], [], {}, { cwd: '/tmp/od-project' });

  assert.deepEqual(args, [
    '--print',
    '--output-format',
    'stream-json',
    '--stream-partial-output',
    '--force',
    '--trust',
    '--workspace',
    '/tmp/od-project',
  ]);
});

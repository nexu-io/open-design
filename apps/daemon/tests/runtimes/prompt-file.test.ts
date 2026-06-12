import { test } from 'vitest';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { assert, minimalAgentDef } from './helpers/test-helpers.js';
import { preparePromptFileForAgent } from '../../src/runtimes/prompt-file.js';

test('preparePromptFileForAgent writes prompt content and cleans up for prompt-file adapters', async () => {
  const prompt = 'large composed prompt\nwith unicode: 汉字';
  const agent = minimalAgentDef({
    id: 'prompt-file-agent',
    name: 'Prompt File Agent',
    bin: 'prompt-file-agent',
    promptViaFile: true,
  });

  const prepared = await preparePromptFileForAgent(agent, prompt, 'label with spaces');
  assert.ok(prepared, 'prompt-file agents should receive a prepared file');
  assert.equal(await fs.readFile(prepared.path, 'utf8'), prompt);

  const stat = await fs.stat(prepared.path);
  assert.equal(stat.isFile(), true);

  const dir = dirname(prepared.path);
  await prepared.cleanup();
  await assert.rejects(() => fs.stat(dir), /ENOENT/);
});

test('preparePromptFileForAgent is a no-op unless promptViaFile is enabled', async () => {
  const agent = minimalAgentDef({
    id: 'stdin-agent',
    name: 'Stdin Agent',
    bin: 'stdin-agent',
    promptViaStdin: true,
  });

  assert.equal(await preparePromptFileForAgent(agent, 'prompt', 'label'), null);
});

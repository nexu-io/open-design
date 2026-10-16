import { beforeEach, describe, expect, it, vi } from 'vitest';

import { opencodeAgentDef } from '../../src/runtimes/defs/opencode.js';

const execAgentFileMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/runtimes/invocation.js', () => ({
  execAgentFile: execAgentFileMock,
}));

function unrecognizedFlag(flag: string): Error & { stderr: string; code: number } {
  return Object.assign(new Error(`Command failed: opencode models ${flag}`), {
    stderr: `ERROR\n  Unrecognized flag: ${flag} in command opencode models\n`,
    code: 1,
  });
}

describe('opencode model discovery', () => {
  beforeEach(() => {
    execAgentFileMock.mockReset();
  });

  it('reads variant metadata from `models --verbose` on OpenCode 1.x', async () => {
    execAgentFileMock.mockResolvedValue({
      stdout: ['openai/gpt-5.6-sol', '{ "variants": { "high": {} } }', 'openai/gpt-5'].join('\n'),
      stderr: '',
    });

    const models = await opencodeAgentDef.fetchModels!('/opt/opencode', { PATH: '/usr/bin' });

    expect(execAgentFileMock).toHaveBeenCalledTimes(1);
    expect(execAgentFileMock).toHaveBeenCalledWith(
      '/opt/opencode',
      ['models', '--verbose'],
      expect.objectContaining({ env: { PATH: '/usr/bin' } }),
    );
    expect(models?.find((model) => model.id === 'openai/gpt-5.6-sol')?.reasoningOptions).toEqual([
      { id: 'default', label: 'Default' },
      { id: 'high', label: 'high' },
    ]);
  });

  it('falls back to the plain listing when OpenCode 2.x rejects --verbose', async () => {
    execAgentFileMock
      .mockRejectedValueOnce(unrecognizedFlag('--verbose'))
      .mockResolvedValueOnce({ stdout: 'openai/gpt-5\nanthropic/claude-sonnet-4-5\n', stderr: '' });

    const models = await opencodeAgentDef.fetchModels!('/opt/opencode', {});

    expect(execAgentFileMock.mock.calls.map((call) => call[1])).toEqual([
      ['models', '--verbose'],
      ['models'],
    ]);
    expect(models?.map((model) => model.id)).toEqual([
      'default',
      'openai/gpt-5',
      'anthropic/claude-sonnet-4-5',
    ]);
  });

  it('returns null when neither listing is usable', async () => {
    execAgentFileMock.mockRejectedValue(new Error('spawn ENOENT'));

    await expect(opencodeAgentDef.fetchModels!('/opt/opencode', {})).resolves.toBeNull();
  });

  it('does not retry the plain listing after a timeout or crash of the verbose one', async () => {
    // Only "this build does not know --verbose" justifies a second spawn;
    // a slow registry must not double the detection budget.
    execAgentFileMock.mockRejectedValue(Object.assign(new Error('timed out'), { killed: true, signal: 'SIGKILL' }));

    await expect(opencodeAgentDef.fetchModels!('/opt/opencode', {})).resolves.toBeNull();
    expect(execAgentFileMock).toHaveBeenCalledTimes(1);
  });
});

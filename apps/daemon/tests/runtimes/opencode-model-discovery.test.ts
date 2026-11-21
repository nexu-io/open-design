import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { opencodeAgentDef, parseOpenCodeApiModels } from '../../src/runtimes/defs/opencode.js';

const execAgentFileMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/runtimes/invocation.js', () => ({
  execAgentFile: execAgentFileMock,
}));

function rejectsVerbose(): Error & { stderr: string; code: number } {
  return Object.assign(new Error('Command failed: opencode models --verbose'), {
    stderr: 'Unrecognized flag: --verbose in command opencode models',
    code: 1,
  });
}

function apiResult(data: unknown[]) {
  return { stdout: JSON.stringify({ location: {}, data }), stderr: '' };
}

describe('OpenCode model discovery across CLI generations', () => {
  beforeEach(() => {
    execAgentFileMock.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves the single verbose probe and exact variant IDs on OpenCode 1.x', async () => {
    execAgentFileMock.mockResolvedValue({
      stdout: 'custom/reasoner\n{"variants":{"high":{},"ultra":{}}}\n',
      stderr: '',
    });
    const env = { PATH: '/fixture/bin' };
    const models = await opencodeAgentDef.fetchModels('/fixture/opencode', env);

    expect(execAgentFileMock).toHaveBeenCalledTimes(1);
    expect(execAgentFileMock).toHaveBeenCalledWith(
      '/fixture/opencode', ['models', '--verbose'], {
        env, timeout: 15_000, maxBuffer: 8 * 1024 * 1024,
      },
    );
    expect(models?.find((model) => model.id === 'custom/reasoner')?.reasoningOptions).toEqual([
      { id: 'default', label: 'Default' },
      { id: 'high', label: 'high' },
      { id: 'ultra', label: 'ultra' },
    ]);
  });

  it('reads OpenCode 2 metadata in a private server after --verbose is rejected', async () => {
    execAgentFileMock.mockRejectedValueOnce(rejectsVerbose()).mockResolvedValueOnce(apiResult([
      {
        providerID: 'custom', id: 'vendor/reasoner', modelID: 'upstream-route', enabled: true,
        variants: [{ id: 'low' }, { id: 'high-fast' }],
        settings: { apiKey: 'fixture-secret', baseURL: 'https://fixture.invalid/v1' },
      },
      { providerID: 'custom', id: 'plain', enabled: true, variants: [] },
      { providerID: 'custom', id: 'disabled', enabled: false, variants: [{ id: 'high' }] },
    ]));
    const models = await opencodeAgentDef.fetchModels('/fixture/opencode', {});

    expect(execAgentFileMock.mock.calls.map((call) => call[1])).toEqual([
      ['models', '--verbose'], ['api', 'model.list', '--standalone'],
    ]);
    expect(models?.map((model) => model.id)).toEqual(['default', 'custom/vendor/reasoner', 'custom/plain']);
    expect(models?.[1]?.reasoningOptions).toEqual([
      { id: 'default', label: 'Default' },
      { id: 'low', label: 'low' },
      { id: 'high-fast', label: 'high-fast' },
    ]);
    expect(models?.[2]?.reasoningOptions).toBeUndefined();
    expect(JSON.stringify(models)).not.toContain('fixture-secret');
    expect(JSON.stringify(models)).not.toContain('upstream-route');
  });

  it.each([
    { stdout: '{malformed', stderr: '' },
    { stdout: '{"data":[]}', stderr: '' },
    { stdout: '{"data":"not-an-array"}', stderr: '' },
  ])('falls back to a plain private-server catalog when API metadata is unusable: %j', async (result) => {
    execAgentFileMock.mockRejectedValueOnce(rejectsVerbose())
      .mockResolvedValueOnce(result)
      .mockResolvedValueOnce({ stdout: 'custom/reasoner\ncustom/plain\n', stderr: '' });
    const models = await opencodeAgentDef.fetchModels('/fixture/opencode', {});

    expect(execAgentFileMock.mock.calls.map((call) => call[1])).toEqual([
      ['models', '--verbose'], ['api', 'model.list', '--standalone'], ['models', '--standalone'],
    ]);
    expect(models?.map((model) => model.id)).toEqual(['default', 'custom/reasoner', 'custom/plain']);
    expect(models?.[1]?.reasoningOptions).toBeUndefined();
  });

  it('keeps the plain catalog available when the experimental API command fails', async () => {
    execAgentFileMock.mockRejectedValueOnce(rejectsVerbose())
      .mockRejectedValueOnce(new Error('Unknown operation: model.list'))
      .mockResolvedValueOnce({ stdout: 'custom/reasoner\n', stderr: '' });

    await expect(opencodeAgentDef.fetchModels('/fixture/opencode', {})).resolves.toEqual([
      expect.objectContaining({ id: 'default' }), { id: 'custom/reasoner', label: 'custom/reasoner' },
    ]);
  });

  it.each([
    new Error('spawn ENOENT'),
    Object.assign(new Error('timed out'), { killed: true, signal: 'SIGKILL' }),
    new Error('Provider registry unavailable'),
  ])('does not start extra probes after a verbose probe failure unrelated to --verbose: %s', async (error) => {
    execAgentFileMock.mockRejectedValueOnce(error);

    await expect(opencodeAgentDef.fetchModels('/fixture/opencode', {})).resolves.toBeNull();
    expect(execAgentFileMock).toHaveBeenCalledTimes(1);
  });

  it('shares one time budget across verbose, API and plain probes', async () => {
    execAgentFileMock.mockImplementationOnce(async () => {
      vi.setSystemTime(100);
      throw rejectsVerbose();
    }).mockImplementationOnce(async () => {
      vi.setSystemTime(3_100);
      throw new Error('API unavailable');
    }).mockResolvedValueOnce({ stdout: 'custom/plain\n', stderr: '' });

    await opencodeAgentDef.fetchModels('/fixture/opencode', {});

    expect(execAgentFileMock.mock.calls.map((call) => call[2].timeout)).toEqual([15_000, 14_900, 11_900]);
  });

  it('does not pass timeout zero or start a new process after the budget is exhausted', async () => {
    execAgentFileMock.mockRejectedValueOnce(rejectsVerbose()).mockImplementationOnce(async () => {
      vi.setSystemTime(15_000);
      throw new Error('API timed out');
    });

    await expect(opencodeAgentDef.fetchModels('/fixture/opencode', {})).resolves.toBeNull();
    expect(execAgentFileMock).toHaveBeenCalledTimes(2);
  });

  it('returns no catalog when both the API and plain fallback fail', async () => {
    execAgentFileMock.mockRejectedValueOnce(rejectsVerbose())
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockRejectedValueOnce(new Error('Plain catalog unavailable'));

    await expect(opencodeAgentDef.fetchModels('/fixture/opencode', {})).resolves.toBeNull();
    expect(execAgentFileMock).toHaveBeenCalledTimes(3);
  });

  it('does not start the API when the initial probe exhausts the total budget', async () => {
    execAgentFileMock.mockImplementationOnce(async () => {
      vi.setSystemTime(15_000);
      throw rejectsVerbose();
    });

    await expect(opencodeAgentDef.fetchModels('/fixture/opencode', {})).resolves.toBeNull();
    expect(execAgentFileMock).toHaveBeenCalledTimes(1);
  });
});

describe('OpenCode 2 model metadata parsing', () => {
  it('validates entries and variants, deduplicates IDs and omits the reserved default variant', () => {
    const stdout = JSON.stringify({ data: [
      null, [], 4, 'invalid', { providerID: false, id: 'invalid' },
      { providerID: 'custom', id: '--invalid' },
      { providerID: 'custom', id: 'reasoner', variants: [
        null, 'high', { id: 'default' }, { id: 'high' }, { id: 'high' },
        { id: '--invalid' }, { id: 'two words' }, { id: 'ultra-fast' },
      ] },
      { providerID: 'custom', id: 'reasoner', variants: [{ id: 'unexpected-duplicate' }] },
    ] });

    expect(parseOpenCodeApiModels(stdout)).toEqual([
      expect.objectContaining({ id: 'default' }),
      { id: 'custom/reasoner', label: 'custom/reasoner', reasoningOptions: [
        { id: 'default', label: 'Default' }, { id: 'high', label: 'high' },
        { id: 'ultra-fast', label: 'ultra-fast' },
      ] },
    ]);
  });

  it.each(['null', '[]', '{}', 'not JSON', '{"data":[null,{}]}'])('returns no catalog for unusable responses: %s', (stdout) => {
    expect(parseOpenCodeApiModels(stdout)).toBeNull();
  });
});

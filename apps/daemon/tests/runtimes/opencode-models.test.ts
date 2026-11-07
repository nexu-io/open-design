import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mapOpenCodeSdkModels, opencodeAgentDef } from '../../src/runtimes/defs/opencode.js';

const acquireSharedSdkHostMock = vi.hoisted(() => vi.fn());
const releaseSharedSdkHostMock = vi.hoisted(() => vi.fn());
vi.mock('../../src/runtimes/opencode-sdk-host.js', () => ({
  acquireSharedSdkHost: acquireSharedSdkHostMock,
  releaseSharedSdkHost: releaseSharedSdkHostMock,
}));

function sdkHostWithModels(data: unknown) {
  return {
    model: {
      list: vi.fn().mockResolvedValue({ data }),
    },
  };
}

describe('opencode model discovery', () => {
  beforeEach(() => {
    acquireSharedSdkHostMock.mockReset();
    releaseSharedSdkHostMock.mockReset().mockResolvedValue(undefined);
  });

  it('maps SDK catalog entries to provider/model ids with variant reasoning options', async () => {
    acquireSharedSdkHostMock.mockResolvedValue(
      sdkHostWithModels([
        {
          id: 'gpt-5.6-sol',
          providerID: 'openai',
          modelID: 'gpt-5.6-sol',
          variants: [{ id: 'high' }, { id: 'low' }],
        },
        {
          id: 'anthropic/claude-sonnet-4-5',
          providerID: 'anthropic',
          modelID: 'claude-sonnet-4-5',
          variants: [],
        },
      ]),
    );

    const models = await opencodeAgentDef.fetchModels!('/ignored-bin', { PATH: '/usr/bin' });

    expect(acquireSharedSdkHostMock).toHaveBeenCalledTimes(1);
    expect(releaseSharedSdkHostMock).toHaveBeenCalledTimes(1);
    expect(models?.map((model) => model.id)).toEqual([
      'default',
      'openai/gpt-5.6-sol',
      'anthropic/claude-sonnet-4-5',
    ]);
    expect(
      models?.find((model) => model.id === 'openai/gpt-5.6-sol')?.reasoningOptions,
    ).toEqual([
      { id: 'default', label: 'Default' },
      { id: 'high', label: 'high' },
      { id: 'low', label: 'low' },
    ]);
  });

  it('returns null when the SDK host fails to boot or list', async () => {
    acquireSharedSdkHostMock.mockRejectedValueOnce(new Error('no runtime'));
    await expect(opencodeAgentDef.fetchModels!('/ignored-bin', {})).resolves.toBeNull();

    acquireSharedSdkHostMock.mockResolvedValueOnce({
      model: { list: vi.fn().mockRejectedValue(new Error('offline')) },
    });
    await expect(opencodeAgentDef.fetchModels!('/ignored-bin', {})).resolves.toBeNull();
    expect(releaseSharedSdkHostMock).toHaveBeenCalled();
  });

  it('returns null when the catalog carries no usable model', async () => {
    acquireSharedSdkHostMock.mockResolvedValueOnce(sdkHostWithModels([]));
    await expect(opencodeAgentDef.fetchModels!('/ignored-bin', {})).resolves.toBeNull();

    acquireSharedSdkHostMock.mockResolvedValueOnce(sdkHostWithModels([{ id: 'bare' }]));
    await expect(opencodeAgentDef.fetchModels!('/ignored-bin', {})).resolves.toBeNull();
  });

  it('mapOpenCodeSdkModels filters invalid ids and dedupes', () => {
    expect(
      mapOpenCodeSdkModels([
        { id: 'openai/gpt-5', providerID: 'openai', modelID: 'gpt-5' },
        { id: 'openai/gpt-5', providerID: 'openai', modelID: 'gpt-5' },
        { id: 'not-a-model-id' },
        null,
      ])?.map((model) => model.id),
    ).toEqual(['default', 'openai/gpt-5']);
    expect(mapOpenCodeSdkModels(null)).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  __forTestByokRunInputError,
  __forTestWithoutSensitiveRunInput,
} from '../../src/routes/runs.js';

describe('BYOK run input boundary', () => {
  it('rejects raw credentials before consulting profile metadata', async () => {
    const has = vi.fn(async () => true);
    const error = await __forTestByokRunInputError({
      agentId: 'byok-opencode',
      byokProfileId: 'byok-openrouter',
      byokProvider: {
        protocol: 'openai',
        apiKey: 'raw-secret',
      },
    }, { has });

    expect(error).toMatch(/raw BYOK credentials are not accepted/iu);
    expect(has).not.toHaveBeenCalled();
  });

  it('accepts only an existing non-secret profile reference', async () => {
    const has = vi.fn(async (profileId: string) => profileId === 'byok-openrouter');

    await expect(__forTestByokRunInputError({
      agentId: 'byok-opencode',
      byokProfileId: 'byok-openrouter',
    }, { has })).resolves.toBeNull();
    await expect(__forTestByokRunInputError({
      agentId: 'byok-opencode',
      byokProfileId: 'byok-missing',
    }, { has })).resolves.toMatch(/secure credential profile/iu);
  });

  it('rejects credential-shaped fields nested in BYOK plugin inputs', async () => {
    const has = vi.fn(async () => true);
    const error = await __forTestByokRunInputError({
      agentId: 'byok-opencode',
      byokProfileId: 'byok-openrouter',
      pluginInputs: {
        nested: [{ apiKey: 'raw-secret' }],
      },
    }, { has });

    expect(error).toMatch(/raw BYOK credentials are not accepted/iu);
    expect(has).not.toHaveBeenCalled();
  });

  it('fails closed when BYOK structured input exceeds the scan depth', async () => {
    const has = vi.fn(async () => true);
    let nested: Record<string, unknown> = { apiKey: 'raw-secret' };
    for (let depth = 0; depth < 24; depth += 1) nested = { nested };

    const error = await __forTestByokRunInputError({
      agentId: 'byok-opencode',
      byokProfileId: 'byok-openrouter',
      pluginInputs: nested,
    }, { has });

    expect(error).toMatch(/raw BYOK credentials are not accepted/iu);
    expect(has).not.toHaveBeenCalled();
  });

  it('removes every credential-bearing compatibility field before persistence', () => {
    const sanitized = __forTestWithoutSensitiveRunInput({
      agentId: 'byok-opencode',
      byokProfileId: 'byok-openrouter',
      byokProvider: { apiKey: 'nested-secret' },
      apiKey: 'top-level-secret',
      rechargeResumeCapability: 'capability-secret',
      message: 'Create a site',
    });

    expect(sanitized).toEqual({
      agentId: 'byok-opencode',
      byokProfileId: 'byok-openrouter',
      message: 'Create a site',
    });
    expect(JSON.stringify(sanitized)).not.toContain('secret');
  });
});

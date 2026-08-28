import { afterEach, describe, expect, it, vi } from 'vitest';

import { installAgentCompanion } from '../../src/providers/agent-companion';

describe('installAgentCompanion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('targets the selected local DSH profile', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ action: 'installed', ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await installAgentCompanion('local-dsh');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agents/local-dsh/companion/install',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      },
    );
  });
});

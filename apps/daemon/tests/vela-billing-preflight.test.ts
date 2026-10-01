import { describe, expect, it, vi } from 'vitest';

const { runVelaCommandMock } = vi.hoisted(() => ({
  runVelaCommandMock: vi.fn(),
}));

vi.mock('../src/integrations/vela-command.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/integrations/vela-command.js')>()),
  runVelaCommand: runVelaCommandMock,
}));

import {
  BILLING_PREFLIGHT_TIMEOUT_MS,
  fetchVelaBillingPreflight,
  parseBillingPreflight,
} from '../src/integrations/vela-billing.js';

const preview = {
  schemaVersion: 1,
  workspaceId: 'ws',
  workspaceMemberId: 'member',
  modelId: 'model',
  generatedAt: new Date().toISOString(),
  balanceUsd: '0',
  modelCovered: true,
  funding: 'coding_plan',
  codingPlan: {
    workspaceId: 'ws',
    generatedAt: new Date().toISOString(),
    eligible: true,
    tier: 'pro',
    windows: [
      {
        policyId: '5h',
        durationSeconds: 18000,
        resetMode: 'activity_triggered',
        usedCredits: '0',
        limitCredits: '100',
        remainingCredits: '100',
        windowStart: null,
        resetsAt: null,
      },
    ],
  },
};

describe('Vela billing preflight adapter', () => {
  it('preserves the member pool and passes the model as one CLI argument', async () => {
    const run = vi.fn(async () => JSON.stringify(preview));
    expect(await fetchVelaBillingPreflight('ws', 'model', { run })).toEqual(preview);
    expect(run).toHaveBeenCalledWith([
      'preflight',
      '--workspace-id',
      'ws',
      '--format',
      'json',
      '--model',
      'model',
    ]);
  });
  it('rejects mismatched identity, model and malformed quota evidence', () => {
    for (const change of [
      { workspaceId: 'other' },
      { modelId: 'other' },
      { generatedAt: 'bad' },
      {
        codingPlan: {
          ...preview.codingPlan,
          windows: [{ ...preview.codingPlan.windows[0], limitCredits: '0' }],
        },
      },
    ])
      expect(
        parseBillingPreflight(JSON.stringify({ ...preview, ...change }), 'ws', 'model'),
      ).toBeNull();
  });
  it('does not synthesize exhausted quota on an old CLI or temporary failure', async () => {
    for (const message of ['unknown command preflight', 'upstream unavailable']) {
      expect(
        await fetchVelaBillingPreflight('ws', null, {
          run: async () => {
            throw new Error(message);
          },
        }),
      ).toBeNull();
    }
  });
  it('rejects coding-plan funding without any quota windows', () => {
    const emptyPlan = { ...preview, codingPlan: { ...preview.codingPlan, windows: [] } };
    expect(parseBillingPreflight(JSON.stringify(emptyPlan), 'ws', 'model')).toBeNull();
  });
  it.each(['wallet', 'gateway'])('preserves an empty pool with %s funding', (funding) => {
    const emptyPlan = {
      ...preview,
      funding,
      codingPlan: { ...preview.codingPlan, eligible: false, tier: null, windows: [] },
    };
    expect(parseBillingPreflight(JSON.stringify(emptyPlan), 'ws', 'model')).toEqual(emptyPlan);
  });
  it('preserves authorization failures', async () => {
    await expect(
      fetchVelaBillingPreflight('ws', null, {
        run: async () => {
          throw new Error('api request failed with status 403');
        },
      }),
    ).rejects.toThrow('403');
  });
  it('bounds the default preflight spawn so a hung CLI cannot pin recovery', async () => {
    runVelaCommandMock.mockReset();
    runVelaCommandMock.mockResolvedValue(JSON.stringify(preview));

    expect(await fetchVelaBillingPreflight('ws', 'model')).toEqual(preview);

    expect(runVelaCommandMock).toHaveBeenCalledWith(
      ['billing', 'preflight', '--workspace-id', 'ws', '--format', 'json', '--model', 'model'],
      expect.objectContaining({ timeoutMs: BILLING_PREFLIGHT_TIMEOUT_MS }),
    );
  });
});

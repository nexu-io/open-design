import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { runVelaCommandMock, readVelaControlApiContextMock, readVelaRuntimeLinkContextMock } = vi.hoisted(() => ({
  runVelaCommandMock: vi.fn(),
  readVelaRuntimeLinkContextMock: vi.fn(),
  readVelaControlApiContextMock: vi.fn<typeof import('../src/integrations/vela.js').readVelaControlApiContext>(),
}));

vi.mock('../src/integrations/vela-command.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/integrations/vela-command.js')>()),
  runVelaCommand: runVelaCommandMock,
}));

vi.mock('../src/integrations/vela.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/integrations/vela.js')>()),
  readVelaControlApiContext: readVelaControlApiContextMock,
  readVelaRuntimeLinkContext: readVelaRuntimeLinkContextMock,
}));

afterEach(() => {
  readVelaControlApiContextMock.mockReset();
  readVelaRuntimeLinkContextMock.mockReset();
  vi.unstubAllGlobals();
});

import {
  BILLING_PREFLIGHT_TIMEOUT_MS,
  fetchVelaBillingPreflight,
  fetchVelaRequestConcurrency,
  fetchVelaBillingFundingCheck,
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
      { fundingCheck: 'reject_everything' },
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


describe('isolated Vela funding-check adapter', () => {
  it('calls the new command with the same bounded process runner', async () => {
    runVelaCommandMock.mockReset();
    runVelaCommandMock.mockResolvedValue(JSON.stringify({ ...preview, fundingCheck: 'available' }));
    expect(await fetchVelaBillingFundingCheck('ws', 'model')).toMatchObject({ fundingCheck: 'available' });
    expect(runVelaCommandMock).toHaveBeenCalledExactlyOnceWith(
      ['billing', 'funding-check', '--workspace-id', 'ws', '--format', 'json', '--model', 'model'],
      expect.objectContaining({ timeoutMs: BILLING_PREFLIGHT_TIMEOUT_MS }),
    );
  });
  it.each(['unknown command funding-check', 'API request failed with status 404', 'API request failed with status 503', 'timeout'])(
    'does not retry or fall back to legacy preflight on %s', async (message) => {
      const run = vi.fn(async (_args: string[]) => { throw new Error(message); });
      expect(await fetchVelaBillingFundingCheck('ws', 'model', { run })).toBeNull();
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0]?.[0]).toEqual(['funding-check', '--workspace-id', 'ws', '--format', 'json', '--model', 'model']);
    },
  );
  it('preserves authorization failure', async () => {
    await expect(fetchVelaBillingFundingCheck('ws', 'model', {
      run: async () => { throw new Error('API request failed with status 403'); },
    })).rejects.toThrow('403');
  });
});


describe('read-only Link request concurrency adapter', () => {
  const hint = { workspaceId: 'ws', workspaceMemberId: 'member', observedAt: new Date().toISOString(), status: 'available', running: 0, limit: 10 };
  it('preserves a real empty Redis count and uses only the dedicated command', async () => {
    const run = vi.fn(async () => JSON.stringify(hint));
    expect(await fetchVelaRequestConcurrency('ws', { run })).toEqual(hint);
    expect(run).toHaveBeenCalledExactlyOnceWith(['request-concurrency', '--workspace-id', 'ws', '--format', 'json']);
  });
  it('never converts missing capability or malformed evidence into available', async () => {
    for (const change of [{ workspaceId: 'other' }, { running: undefined }, { limit: 0 }, { status: 'full' }, { status: 'unknown' }, { observedAt: 'bad' }]) {
      expect(await fetchVelaRequestConcurrency('ws', { run: async () => JSON.stringify({ ...hint, ...change }) })).toBeNull();
    }
    const run = vi.fn(async () => { throw new Error('unknown command request-concurrency'); });
    expect(await fetchVelaRequestConcurrency('ws', { run })).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('preserves authorization rejection instead of offering another workspace', async () => {
    await expect(fetchVelaRequestConcurrency('ws', { run: async () => { throw new Error('API request failed with status 403: forbidden'); } })).rejects.toThrow('403');
  });
});


describe('default CLI request-concurrency capability compatibility', () => {
  const full = { workspaceId: 'ws', workspaceMemberId: 'member', observedAt: new Date().toISOString(), status: 'full', running: 10, limit: 10 };
  const parentHelp = 'Usage:\n  vela billing [command]\n\nAvailable Commands:\n  preflight Advisory preview\n';
  const configuredEnv = { VELA_PROFILE: 'local', AMR_HOME: '/isolated/amr' };

  it('reads a current full Link counter within the send budget without launching the CLI', async () => {
    runVelaCommandMock.mockClear();
    readVelaRuntimeLinkContextMock.mockReturnValue({ profile: 'local', linkUrl: 'http://127.0.0.1:27481', runtimeKey: 'own-runtime' });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(full)));
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchVelaRequestConcurrency('ws', { configuredEnv })).toEqual(full);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(runVelaCommandMock).not.toHaveBeenCalled();
  });

  it('falls back to the CLI when the selected runtime profile cannot be read', async () => {
    readVelaRuntimeLinkContextMock.mockImplementationOnce(() => { throw new Error('profile changed during read'); });
    runVelaCommandMock.mockResolvedValueOnce(JSON.stringify(full));

    expect(await fetchVelaRequestConcurrency('ws', { configuredEnv })).toEqual(full);
    expect(runVelaCommandMock).toHaveBeenCalledWith(
      ['billing', 'request-concurrency', '--workspace-id', 'ws', '--format', 'json'],
      expect.objectContaining({ timeoutMs: 450 }),
    );
  });

  function linkCapability(body: unknown = full, status = 200) {
    readVelaRuntimeLinkContextMock.mockReturnValue({ profile: 'local', linkUrl: 'http://127.0.0.1:27481', runtimeKey: 'own-runtime' });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    const run = vi.fn(async (_args: string[]) => { throw new Error('unknown command "request-concurrency" for "vela billing"'); });
    return { run, fetchMock };
  }

  it('reads the same-profile scoped full Link counter when the stock Cobra command is absent', async () => {
    const { fetchMock } = linkCapability();
    const run = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('command exited 1'), { stderr: 'Error: unknown flag: --workspace-id\n' }))
      .mockResolvedValueOnce(parentHelp);
    expect(await fetchVelaRequestConcurrency('ws', { run, configuredEnv })).toEqual(full);
    expect(run.mock.calls.map(([args]) => args)).toEqual([
      ['request-concurrency', '--workspace-id', 'ws', '--format', 'json'],
      ['request-concurrency', '--help'],
    ]);
    expect(readVelaRuntimeLinkContextMock).toHaveBeenCalledExactlyOnceWith(process.env, configuredEnv);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(new URL('http://127.0.0.1:27481/billing/request-concurrency'), expect.objectContaining({
      headers: { authorization: 'Bearer own-runtime', 'x-vela-workspace-id': 'ws' }, signal: expect.any(AbortSignal),
    }));
    expect(readVelaControlApiContextMock).not.toHaveBeenCalled();
  });

  it('recognizes exit-zero parent help while preserving a native CLI result without HTTP', async () => {
    const { fetchMock } = linkCapability();
    expect(await fetchVelaRequestConcurrency('ws', { run: async () => parentHelp })).toEqual(full);
    fetchMock.mockClear();
    expect(await fetchVelaRequestConcurrency('ws', { run: async () => JSON.stringify(full) })).toEqual(full);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown flag: --format', ''],
    ['unknown flag: --workspace-id', 'Usage:\n  vela billing request-concurrency [flags]\n'],
    ['unknown flag: --workspace-id', parentHelp + '  request-concurrency Read counter\n'],
    ['API request failed with status 503', ''], ['command timed out', ''],
  ])('does not reinterpret other CLI failures as unsupported: %s', async (message, help) => {
    const { fetchMock } = linkCapability();
    const run = vi.fn().mockRejectedValueOnce(new Error(message)).mockResolvedValueOnce(help);
    expect(await fetchVelaRequestConcurrency('ws', { run })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readVelaRuntimeLinkContextMock).not.toHaveBeenCalled();
  });

  it.each([401, 403])('preserves CLI authorization %s without changing transports', async (status) => {
    const { fetchMock } = linkCapability();
    await expect(fetchVelaRequestConcurrency('ws', { run: async () => { throw new Error(`API request failed with status ${status}`); } })).rejects.toThrow(String(status));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 403])('preserves Link authorization %s without another scope or control key', async (status) => {
    const { run, fetchMock } = linkCapability({ error: 'workspace_not_authorized' }, status);
    await expect(fetchVelaRequestConcurrency('ws', { run })).rejects.toThrow(String(status));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readVelaControlApiContextMock).not.toHaveBeenCalled();
  });

  it.each([404, 503])('keeps Link failure %s unavailable', async (status) => {
    const { run } = linkCapability({}, status);
    expect(await fetchVelaRequestConcurrency('ws', { run })).toBeNull();
  });

  it.each([new TypeError('fetch failed'), new DOMException('deadline', 'TimeoutError')])('keeps Link transport failure unavailable: %s', async (error) => {
    const { run, fetchMock } = linkCapability();
    fetchMock.mockRejectedValueOnce(error);
    expect(await fetchVelaRequestConcurrency('ws', { run })).toBeNull();
  });

  it.each([
    { workspaceId: 'other' }, { workspaceMemberId: '' }, { observedAt: 'invalid' },
    { running: -1 }, { running: 1.5 }, { limit: 0 }, { status: 'available' }, { status: 'unknown' },
  ])('rejects foreign or invalid Link count: %j', async (change) => {
    const { run } = linkCapability({ ...full, ...change });
    expect(await fetchVelaRequestConcurrency('ws', { run })).toBeNull();
  });

  it('preserves authoritative unknown without inventing a numeric count', async () => {
    const unknown = { workspaceId: 'ws', workspaceMemberId: 'member', observedAt: full.observedAt, status: 'unknown' };
    const { run } = linkCapability(unknown);
    expect(await fetchVelaRequestConcurrency('ws', { run })).toEqual(unknown);
  });

  it('keeps malformed Link evidence and absent selected credentials unavailable', async () => {
    const { run, fetchMock } = linkCapability();
    fetchMock.mockResolvedValueOnce(new Response('{invalid json'));
    expect(await fetchVelaRequestConcurrency('ws', { run })).toBeNull();
    fetchMock.mockClear();
    readVelaRuntimeLinkContextMock.mockReturnValueOnce(null);
    expect(await fetchVelaRequestConcurrency('ws', { run, configuredEnv })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bounds the Link hint to the original CLI 400ms request budget', async () => {
    const { run } = linkCapability();
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      expect(await fetchVelaRequestConcurrency('ws', { run })).toEqual(full);
      expect(timeout).toHaveBeenCalledWith(400);
    } finally { timeout.mockRestore(); }
  });
});

describe('default CLI funding-check capability compatibility', () => {
  it('reads the authenticated scoped funding hint when Cobra confirms the stock command is absent', async () => {
    const configuredEnv = { VELA_PROFILE: 'local', AMR_HOME: '/isolated/amr' };
    const context = { profile: 'local', apiUrl: 'http://127.0.0.1:27480', controlKey: 'own-test-control', user: null, configMtimeMs: null };
    readVelaControlApiContextMock.mockReturnValue(context);
    const insufficient = {
      ...preview, funding: 'gateway', fundingCheck: 'insufficient', modelCovered: null,
      codingPlan: { ...preview.codingPlan, eligible: false, tier: null, windows: [] },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(insufficient)));
    vi.stubGlobal('fetch', fetchMock);
    const run = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('command exited 1'), { stderr: 'Error: unknown flag: --workspace-id\n' }))
      .mockResolvedValueOnce('Show Vela billing information\n\nUsage:\n  vela billing [command]\n\nAvailable Commands:\n  preflight Preview member Coding Plan and wallet funding (advisory)\n  summary Show subscription and credit balance summary\n');

    expect(await fetchVelaBillingFundingCheck('ws', 'model', { run, configuredEnv })).toEqual(insufficient);
    expect(run.mock.calls.map(([args]) => args)).toEqual([
      ['funding-check', '--workspace-id', 'ws', '--format', 'json', '--model', 'model'],
      ['funding-check', '--help'],
    ]);
    expect(readVelaControlApiContextMock).toHaveBeenCalledExactlyOnceWith(process.env, configuredEnv);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      new URL('http://127.0.0.1:27480/api/v1/workspaces/ws/billing/funding-check?modelId=model'),
      expect.objectContaining({ headers: { authorization: 'Bearer own-test-control' }, signal: expect.any(AbortSignal) }),
    );
  });

  const funding = { ...preview, fundingCheck: 'available' };
  const session = { profile: 'local', apiUrl: 'http://127.0.0.1:27480', controlKey: 'own-control', user: null, configMtimeMs: null };
  const parentHelp = 'Usage:\n  vela billing [command]\n\nAvailable Commands:\n  preflight Advisory preview\n';

  function apiCapability(body: unknown = funding, status = 200) {
    readVelaControlApiContextMock.mockReturnValue(session);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    const run = vi.fn(async (_args: string[]) => { throw new Error('unknown command "funding-check" for "vela billing"'); });
    return { run, fetchMock };
  }

  it('recognizes an exit-zero parent help response as an absent capability', async () => {
    const { fetchMock } = apiCapability();
    const run = vi.fn(async () => parentHelp);
    expect(await fetchVelaBillingFundingCheck('ws', 'model', { run })).toEqual(funding);
    expect(run).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unknown flag: --model', ''],
    ['unknown flag: --workspace-id', 'Usage:\n  vela billing funding-check [flags]\n'],
    ['unknown flag: --workspace-id', 'malformed help'],
  ])('does not mistake a bad flag or known command for an absent capability: %s / %s', async (message, help) => {
    const { fetchMock } = apiCapability();
    const run = vi.fn().mockRejectedValueOnce(new Error(message)).mockResolvedValueOnce(help);
    expect(await fetchVelaBillingFundingCheck('ws', 'model', { run })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readVelaControlApiContextMock).not.toHaveBeenCalled();
  });

  it.each([401, 403])('preserves CLI authorization %s without trying another transport', async (status) => {
    const { fetchMock } = apiCapability();
    const run = vi.fn(async () => { throw new Error(`API request failed with status ${status}: forbidden`); });
    await expect(fetchVelaBillingFundingCheck('ws', 'model', { run })).rejects.toThrow(String(status));
    expect(run).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readVelaControlApiContextMock).not.toHaveBeenCalled();
  });

  it.each(['API request failed with status 404', 'API request failed with status 503', 'command timed out'])(
    'does not reinterpret CLI transport/server failure as missing capability: %s', async (message) => {
      const { fetchMock } = apiCapability();
      const run = vi.fn(async () => { throw new Error(message); });
      expect(await fetchVelaBillingFundingCheck('ws', 'model', { run })).toBeNull();
      expect(run).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403])('preserves authenticated API rejection %s with no other scope or legacy preview', async (status) => {
    const { run, fetchMock } = apiCapability({ error: 'workspace_forbidden' }, status);
    await expect(fetchVelaBillingFundingCheck('ws', 'model', { run })).rejects.toThrow(String(status));
    expect(run).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(readVelaControlApiContextMock).toHaveBeenCalledTimes(1);
  });

  it.each([404, 503])('keeps unsupported/unavailable API %s unknown without using advisory funds', async (status) => {
    const { run, fetchMock } = apiCapability({ error: 'unavailable' }, status);
    expect(await fetchVelaBillingFundingCheck('ws', 'model', { run })).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([new TypeError('fetch failed'), new DOMException('deadline', 'TimeoutError')])(
    'keeps API transport failure unavailable: %s', async (error) => {
      const { run, fetchMock } = apiCapability();
      fetchMock.mockRejectedValueOnce(error);
      expect(await fetchVelaBillingFundingCheck('ws', 'model', { run })).toBeNull();
      expect(run).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { workspaceId: 'other' },
    { modelId: 'other' },
    { workspaceMemberId: '' },
    { fundingCheck: undefined },
    { fundingCheck: 'guess_from_zero_balance' },
    { codingPlan: { ...preview.codingPlan, workspaceId: 'other' } },
  ])('rejects missing or foreign authoritative API evidence: %j', async (change) => {
    const { run } = apiCapability({ ...funding, ...change });
    expect(await fetchVelaBillingFundingCheck('ws', 'model', { run })).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps a malformed API response unavailable instead of deriving a wallet or DP result', async () => {
    const { run, fetchMock } = apiCapability();
    fetchMock.mockResolvedValueOnce(new Response('{invalid json'));
    expect(await fetchVelaBillingFundingCheck('ws', 'model', { run })).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not borrow another login when the selected profile has no control session', async () => {
    const { run, fetchMock } = apiCapability();
    readVelaControlApiContextMock.mockReturnValueOnce(null);
    expect(await fetchVelaBillingFundingCheck('ws', 'model', { run, configuredEnv: { VELA_PROFILE: 'test' } })).toBeNull();
    expect(readVelaControlApiContextMock).toHaveBeenCalledExactlyOnceWith(process.env, { VELA_PROFILE: 'test' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

});


describe('direct authenticated send-time funding check', () => {
  const configuredEnv = { VELA_PROFILE: 'local', AMR_HOME: '/isolated/amr' };
  const session = { profile: 'local', apiUrl: 'http://127.0.0.1:27480', controlKey: 'own-control', user: null, configMtimeMs: null };
  const funding = { ...preview, fundingCheck: 'available' };

  it('starts the exact authenticated HTTP read without CLI startup or capability probes', async () => {
    readVelaControlApiContextMock.mockReturnValue(session);
    runVelaCommandMock.mockReset().mockResolvedValue(JSON.stringify(funding));
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const result = fetchVelaBillingFundingCheck('ws', 'model', { configuredEnv });
    try {
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        new URL('http://127.0.0.1:27480/api/v1/workspaces/ws/billing/funding-check?modelId=model'),
        expect.objectContaining({ headers: { authorization: 'Bearer own-control' }, signal: expect.any(AbortSignal) }),
      );
      expect(runVelaCommandMock).not.toHaveBeenCalled();
      expect(readVelaControlApiContextMock).toHaveBeenCalledExactlyOnceWith(process.env, configuredEnv);
    } finally {
      finish?.(new Response(JSON.stringify(funding)));
    }
    expect(await result).toEqual(funding);
  });

  function directApi(body: unknown = funding, status = 200) {
    readVelaControlApiContextMock.mockReturnValue(session);
    runVelaCommandMock.mockReset();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('returns the same authoritative funding result as the CLI and keeps null-model scope exact', async () => {
    const fetchMock = directApi({ ...funding, modelId: null });
    const direct = await fetchVelaBillingFundingCheck('ws', null, { configuredEnv });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      new URL('http://127.0.0.1:27480/api/v1/workspaces/ws/billing/funding-check'),
      expect.objectContaining({ headers: { authorization: 'Bearer own-control' } }),
    );
    const run = vi.fn(async () => JSON.stringify({ ...funding, modelId: null }));
    expect(await fetchVelaBillingFundingCheck('ws', null, { run, configuredEnv })).toEqual(direct);
    expect(runVelaCommandMock).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledExactlyOnceWith(['funding-check', '--workspace-id', 'ws', '--format', 'json']);
  });

  it.each([401, 403])('preserves direct authorization rejection %s without changing transport or scope', async (status) => {
    const fetchMock = directApi({ error: 'forbidden' }, status);
    await expect(fetchVelaBillingFundingCheck('ws', 'model', { configuredEnv })).rejects.toThrow(String(status));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(runVelaCommandMock).not.toHaveBeenCalled();
  });

  it.each([404, 503])('keeps unavailable direct capability %s unknown without a second funding path', async (status) => {
    const fetchMock = directApi({ error: 'unavailable' }, status);
    expect(await fetchVelaBillingFundingCheck('ws', 'model', { configuredEnv })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(runVelaCommandMock).not.toHaveBeenCalled();
  });

  it.each([
    { workspaceId: 'another' }, { modelId: 'another' }, { workspaceMemberId: '' },
    { fundingCheck: undefined }, { codingPlan: { ...preview.codingPlan, workspaceId: 'another' } },
  ])('rejects malformed or foreign direct funding evidence: %j', async (change) => {
    directApi({ ...funding, ...change });
    expect(await fetchVelaBillingFundingCheck('ws', 'model', { configuredEnv })).toBeNull();
    expect(runVelaCommandMock).not.toHaveBeenCalled();
  });

  it.each([new TypeError('network'), new DOMException('deadline', 'TimeoutError')])('keeps direct transport failure unknown: %s', async (error) => {
    const fetchMock = directApi();
    fetchMock.mockRejectedValueOnce(error);
    expect(await fetchVelaBillingFundingCheck('ws', 'model', { configuredEnv })).toBeNull();
    expect(runVelaCommandMock).not.toHaveBeenCalled();
  });

  it.each(['missing', 'profile-edit'] as const)('retains the selected CLI when its control context is %s', async (reason) => {
    if (reason === 'missing') readVelaControlApiContextMock.mockReturnValue(null);
    else readVelaControlApiContextMock.mockImplementationOnce(() => { throw new Error('profile changed'); });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    runVelaCommandMock.mockReset().mockResolvedValue(JSON.stringify(funding));
    expect(await fetchVelaBillingFundingCheck('ws', 'model', { configuredEnv })).toEqual(funding);
    expect(runVelaCommandMock).toHaveBeenCalledExactlyOnceWith(
      ['billing', 'funding-check', '--workspace-id', 'ws', '--format', 'json', '--model', 'model'],
      expect.objectContaining({ configuredEnv: expect.objectContaining(configuredEnv), timeoutMs: BILLING_PREFLIGHT_TIMEOUT_MS }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });


  it('uses the same real loopback HTTP authority as the unsupported-CLI fallback without its probes', async () => {
    const requests: Array<{ url: string | undefined; authorization: string | undefined }> = [];
    const server = createServer((req, res) => {
      requests.push({ url: req.url, authorization: req.headers.authorization });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(funding));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('fixture listener missing');
      readVelaControlApiContextMock.mockReturnValue({ ...session, apiUrl: `http://127.0.0.1:${address.port}` });
      runVelaCommandMock.mockReset();
      const direct = await fetchVelaBillingFundingCheck('ws', 'model', { configuredEnv });
      expect(runVelaCommandMock).not.toHaveBeenCalled();
      const run = vi.fn()
        .mockRejectedValueOnce(new Error('unknown flag: --workspace-id'))
        .mockResolvedValueOnce('Usage:\n  vela billing [command]\n\nAvailable Commands:\n  preflight Advisory preview\n');
      expect(await fetchVelaBillingFundingCheck('ws', 'model', { run, configuredEnv })).toEqual(direct);
      expect(direct).toEqual(funding);
      expect(run.mock.calls.map(([args]) => args)).toEqual([
        ['funding-check', '--workspace-id', 'ws', '--format', 'json', '--model', 'model'],
        ['funding-check', '--help'],
      ]);
      expect(requests).toEqual(Array(2).fill({
        url: '/api/v1/workspaces/ws/billing/funding-check?modelId=model', authorization: 'Bearer own-control',
      }));
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

});

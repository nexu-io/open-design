import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceBillingPreflight } from '@open-design/contracts';
import { cachedHomeAmrFundingBlock, invalidateAmrFundingFeedback, checkAmrFundingFeedback, checkAmrFundingEvidence, noteHomeAmrFundingBlockPresented, readFreshAmrFundingEvidence, readSendTimeAmrFundingEvidence, recentHomeAmrFundingInsufficiency, retireHomeAmrFundingBlock, takeHomeAmrFundingFastBlock } from '../../src/runtime/amr-funding-feedback';
import { advanceWorkspaceAccountGeneration, resetWorkspaceAccountGeneration } from '../../src/collab/workspace-identity';

let sequence = 0;
function fixture(result: 'available' | 'insufficient' | 'unknown' | undefined) {
  const scope = { workspaceType: 'personal' as const, workspaceId: `ws-${++sequence}`, workspaceMemberId: 'member' };
  const preflight = { schemaVersion: 1, ...scope, modelId: 'model', generatedAt: new Date().toISOString(), fundingCheck: result, balanceUsd: '0' };
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ preflight })));
  vi.stubGlobal('fetch', fetchMock);
  return { scope, preflight, fetchMock };
}

afterEach(() => { invalidateAmrFundingFeedback(); vi.unstubAllGlobals(); vi.useRealTimers(); resetWorkspaceAccountGeneration(); });
describe('independent AMR funding feedback', () => {
  it('uses the dedicated read without fetching display billing or creating a run', async () => {
    const { scope, fetchMock } = fixture('insufficient');
    expect(await checkAmrFundingFeedback(scope, 'model')).toBe('insufficient');
    expect(fetchMock).toHaveBeenCalledWith(`/api/workspace/billing/preflight?workspaceId=${scope.workspaceId}&modelId=model`, expect.objectContaining({ cache: 'no-store' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, 'unknown'] as const)('does not turn an old or uncertain server result (%s) into a rejection', async (result) => {
    const { scope } = fixture(result);
    expect(await checkAmrFundingFeedback(scope, 'model')).toBe('unknown');
  });
  it.each(['member', 'workspace', 'model', 'stale', 'future'] as const)('rejects %s evidence', async (change) => {
    const { scope, preflight } = fixture('insufficient');
    if (change === 'member') preflight.workspaceMemberId = 'other';
    if (change === 'workspace') preflight.workspaceId = 'other';
    if (change === 'model') preflight.modelId = 'other';
    if (change === 'stale') preflight.generatedAt = new Date(Date.now() - 60_000).toISOString();
    if (change === 'future') preflight.generatedAt = new Date(Date.now() + 60_000).toISOString();
    expect(await checkAmrFundingFeedback(scope, 'model')).toBe('unknown');
  });
  it('deduplicates concurrent reads but never reuses a negative result for a new send', async () => {
    const { scope, fetchMock } = fixture('insufficient');
    expect(await Promise.all([checkAmrFundingFeedback(scope, 'model'), checkAmrFundingFeedback(scope, 'model')])).toEqual(['insufficient', 'insufficient']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await checkAmrFundingFeedback(scope, 'model');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('briefly reuses positive evidence only for the same account, member and model', async () => {
    const { scope, fetchMock } = fixture('available');
    await checkAmrFundingFeedback(scope, 'model');
    await checkAmrFundingFeedback(scope, 'model');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    advanceWorkspaceAccountGeneration('another-account');
    await checkAmrFundingFeedback(scope, 'model');
    await checkAmrFundingFeedback({ ...scope, workspaceMemberId: 'another-member' }, 'model');
    await checkAmrFundingFeedback(scope, 'other-model');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('expires positive hints after five seconds and reads the server again', async () => {
    vi.useFakeTimers();
    const { scope, preflight, fetchMock } = fixture('available');
    await checkAmrFundingFeedback(scope, 'model');
    vi.advanceTimersByTime(5_001);
    preflight.fundingCheck = 'insufficient';
    expect(await checkAmrFundingFeedback(scope, 'model')).toBe('insufficient');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('discards an in-flight result after the account changes', async () => {
    const { scope, preflight, fetchMock } = fixture('insufficient');
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const result = checkAmrFundingFeedback(scope, 'model');
    advanceWorkspaceAccountGeneration('new-account');
    finish(new Response(JSON.stringify({ preflight })));
    expect(await result).toBe('unknown');
  });
  it('serializes invalidated reads and coalesces a burst into one latest follow-up', async () => {
    const { scope, preflight, fetchMock } = fixture('insufficient');
    await checkAmrFundingFeedback(scope, 'model');
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const old = checkAmrFundingFeedback(scope, 'model');
    const followups = Array.from({ length: 8 }, () => {
      invalidateAmrFundingFeedback();
      return checkAmrFundingFeedback(scope, 'model');
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    finish(new Response(JSON.stringify({ preflight: { ...preflight, fundingCheck: 'available' } })));
    expect(await old).toBe('unknown');
    expect(await Promise.all(followups)).toEqual(Array(8).fill('insufficient'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(cachedHomeAmrFundingBlock(scope, 'model')).not.toBeNull();
  });
  it.each(['leave-home', 'account-change'] as const)('cancels a queued background read on %s', async (change) => {
    const { scope, preflight, fetchMock } = fixture('insufficient');
    await checkAmrFundingFeedback(scope, 'model');
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const old = checkAmrFundingFeedback(scope, 'model');
    invalidateAmrFundingFeedback();
    let active = true;
    const queued = checkAmrFundingFeedback(scope, 'model', () => active);
    if (change === 'leave-home') active = false;
    else advanceWorkspaceAccountGeneration('queued-new-account');
    finish(new Response(JSON.stringify({ preflight })));
    expect(await old).toBe('unknown');
    expect(await queued).toBe('unknown');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('leaves network failure unknown', async () => {
    const { scope, fetchMock } = fixture('insufficient');
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await checkAmrFundingFeedback(scope, 'model')).toBe('unknown');
  });
});


describe('Home cached funding gate', () => {
  it('uses an exact negative fast block once per insufficiency episode, then waits for fresh recovery', async () => {
    const { scope, preflight, fetchMock } = fixture('insufficient');
    await checkAmrFundingFeedback(scope, 'model');
    expect(takeHomeAmrFundingFastBlock(scope, 'model')?.preflight).toEqual(preflight);
    expect(takeHomeAmrFundingFastBlock(scope, 'model')).toBeNull();
    // A repeated negative publication and a billing invalidation do not grant
    // another shortcut after the user has already seen this refusal.
    await checkAmrFundingFeedback(scope, 'model');
    expect(takeHomeAmrFundingFastBlock(scope, 'model')).toBeNull();
    invalidateAmrFundingFeedback();
    await checkAmrFundingFeedback(scope, 'model');
    expect(takeHomeAmrFundingFastBlock(scope, 'model')).toBeNull();
    const recovered: WorkspaceBillingPreflight = {
      ...preflight, schemaVersion: 1, fundingCheck: 'available', balanceUsd: '10',
      funding: 'wallet', modelCovered: false,
      codingPlan: { workspaceId: scope.workspaceId, generatedAt: preflight.generatedAt,
        eligible: false, tier: null, windows: [] },
    };
    expect(retireHomeAmrFundingBlock(scope, 'model', {
      ...recovered, workspaceMemberId: 'other',
    })).toBe(false);
    expect(retireHomeAmrFundingBlock(scope, 'model', {
      ...recovered, generatedAt: new Date(Date.now() - 60_000).toISOString(),
    })).toBe(false);
    expect(retireHomeAmrFundingBlock(scope, 'model', recovered)).toBe(true);
    expect(takeHomeAmrFundingFastBlock(scope, 'model')).toBeNull();
    // The next confirmed exhaustion is a new episode, even within five
    // seconds. Retiring Home state must not grant Project a positive cache.
    await checkAmrFundingFeedback(scope, 'model');
    expect(takeHomeAmrFundingFastBlock(scope, 'model')).not.toBeNull();
    noteHomeAmrFundingBlockPresented(scope, 'model');
    expect(takeHomeAmrFundingFastBlock(scope, 'model')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('uses only a recent exact-member insufficient preflight for early paint', async () => {
    vi.useFakeTimers();
    const { scope } = fixture('insufficient');
    await checkAmrFundingFeedback(scope, 'model');
    expect(recentHomeAmrFundingInsufficiency(scope, 'model')?.fundingCheck).toBe('insufficient');
    expect(recentHomeAmrFundingInsufficiency({ ...scope, workspaceMemberId: 'other' }, 'model')).toBeNull();
    vi.advanceTimersByTime(5_001);
    expect(recentHomeAmrFundingInsufficiency(scope, 'model')).toBeNull();
    expect(cachedHomeAmrFundingBlock(scope, 'model')).not.toBeNull();
  });
  it('does not resurrect a late insufficiency after billing invalidation', async () => {
    const { scope, preflight, fetchMock } = fixture('insufficient');
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const old = readFreshAmrFundingEvidence(scope, 'model');
    invalidateAmrFundingFeedback();
    finish(new Response(JSON.stringify({ preflight })));
    expect(await old).toEqual({ kind: 'unknown', preflight: null });
    expect(recentHomeAmrFundingInsufficiency(scope, 'model')).toBeNull();
  });
  it('peeks synchronously without network, scoped to account, member, workspace, type and model', async () => {
    const { scope, fetchMock } = fixture('insufficient');
    await checkAmrFundingFeedback(scope, 'model');
    expect(cachedHomeAmrFundingBlock(scope, 'model')).toMatchObject({ balanceUsd: '0', stale: false });
    expect(cachedHomeAmrFundingBlock(undefined, 'model')).toBeNull();
    expect(cachedHomeAmrFundingBlock({ ...scope, workspaceId: 'other' }, 'model')).toBeNull();
    expect(cachedHomeAmrFundingBlock({ ...scope, workspaceMemberId: 'other' }, 'model')).toBeNull();
    expect(cachedHomeAmrFundingBlock({ ...scope, workspaceType: 'team' }, 'model')).toBeNull();
    expect(cachedHomeAmrFundingBlock(scope, 'other')).toBeNull();
    advanceWorkspaceAccountGeneration('different-login');
    expect(cachedHomeAmrFundingBlock(scope, 'model')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('lets a recent available verdict override an older display-wallet block', async () => {
    const { scope } = fixture('available');
    const snapshot = { status: 'available' as const, profile: 'test', user: null, balanceUsd: '0',
      updatedAt: null, fetchedAt: new Date().toISOString(), stale: true, source: 'daemon_cache' as const };
    expect(cachedHomeAmrFundingBlock(scope, 'model', snapshot)).toBe(snapshot);
    await checkAmrFundingFeedback(scope, 'model');
    expect(cachedHomeAmrFundingBlock(scope, 'model', snapshot)).toBeNull();
  });
  it('retains confirmed insufficiency after its server timestamp ages out', async () => {
    vi.useFakeTimers();
    const { scope, preflight } = fixture('insufficient');
    preflight.generatedAt = new Date(Date.now() - 10_000).toISOString();
    await checkAmrFundingFeedback(scope, 'model');
    vi.advanceTimersByTime(30_000 - 10_001);
    expect(cachedHomeAmrFundingBlock(scope, 'model')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(cachedHomeAmrFundingBlock(scope, 'model')).not.toBeNull();
  });
  it.each(['available', 'unknown', undefined] as const)('does not block zero-wallet users on %s', async (result) => {
    const { scope } = fixture(result);
    await checkAmrFundingFeedback(scope, 'model');
    expect(cachedHomeAmrFundingBlock(scope, 'model')).toBeNull();
  });
  it('retains confirmed insufficiency after failed confirmation and expiry', async () => {
    vi.useFakeTimers();
    const { scope, fetchMock } = fixture('insufficient');
    await checkAmrFundingFeedback(scope, 'model');
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await checkAmrFundingFeedback(scope, 'model')).toBe('unknown');
    expect(cachedHomeAmrFundingBlock(scope, 'model')).not.toBeNull();
    vi.advanceTimersByTime(30_000);
    invalidateAmrFundingFeedback();
    expect(cachedHomeAmrFundingBlock(scope, 'model')).not.toBeNull();
  });
  it('clears a previous negative when fresh funding is available, even after the positive expires', async () => {
    vi.useFakeTimers();
    const { scope, preflight } = fixture('insufficient');
    await checkAmrFundingFeedback(scope, 'model');
    preflight.fundingCheck = 'available';
    expect(await checkAmrFundingFeedback(scope, 'model')).toBe('available');
    vi.advanceTimersByTime(5_001);
    expect(cachedHomeAmrFundingBlock(scope, 'model')).toBeNull();
  });
  it.each(['unknown', 'stale-available', 'wrong-model', 'unavailable', 'timeout'] as const)(
    'retains a confirmed block after invalidation and %s, then recovers on fresh available', async (result) => {
      const { scope, preflight, fetchMock } = fixture('insufficient');
      await checkAmrFundingFeedback(scope, 'model');
      invalidateAmrFundingFeedback();
      const confirmation = { ...preflight, fundingCheck: 'available' };
      if (result === 'unknown') confirmation.fundingCheck = 'unknown';
      if (result === 'stale-available') confirmation.generatedAt = new Date(Date.now() - 31_000).toISOString();
      if (result === 'wrong-model') confirmation.modelId = 'other';
      if (result === 'timeout') fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
      else fetchMock.mockResolvedValueOnce(result === 'unavailable'
        ? new Response(null, { status: 503 }) : new Response(JSON.stringify({ preflight: confirmation })));
      expect(await checkAmrFundingFeedback(scope, 'model')).toBe('unknown');
      expect(cachedHomeAmrFundingBlock(scope, 'model')).not.toBeNull();
      preflight.fundingCheck = 'available';
      expect(await checkAmrFundingFeedback(scope, 'model')).toBe('available');
      expect(cachedHomeAmrFundingBlock(scope, 'model')).toBeNull();
    },
  );
  it('retains separate blocks when switching models or workspaces and clears only the confirmed scope', async () => {
    const { scope, preflight } = fixture('insufficient');
    await checkAmrFundingFeedback(scope, 'model');
    const other = { ...scope, workspaceId: 'second-workspace' };
    preflight.workspaceId = other.workspaceId;
    await checkAmrFundingFeedback(other, 'model');
    preflight.modelId = 'other-model';
    await checkAmrFundingFeedback(other, 'other-model');
    expect(cachedHomeAmrFundingBlock(scope, 'model')).not.toBeNull();
    preflight.fundingCheck = 'available';
    await checkAmrFundingFeedback(other, 'other-model');
    expect(cachedHomeAmrFundingBlock(other, 'other-model')).toBeNull();
    expect(cachedHomeAmrFundingBlock(other, 'model')).not.toBeNull();
    expect(cachedHomeAmrFundingBlock(scope, 'model')).not.toBeNull();
  });
  it('does not let an invalidated late positive erase confirmed insufficiency', async () => {
    const { scope, preflight, fetchMock } = fixture('insufficient');
    await checkAmrFundingFeedback(scope, 'model');
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const old = checkAmrFundingFeedback(scope, 'model');
    invalidateAmrFundingFeedback();
    const current = checkAmrFundingFeedback(scope, 'model');
    finish(new Response(JSON.stringify({ preflight: { ...preflight, fundingCheck: 'available' } })));
    expect(await old).toBe('unknown');
    expect(await current).toBe('insufficient');
    expect(cachedHomeAmrFundingBlock(scope, 'model')).not.toBeNull();
  });
  it('billing invalidation prevents an older in-flight read from restoring the block', async () => {
    const { scope, preflight, fetchMock } = fixture('insufficient');
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const request = checkAmrFundingFeedback(scope, 'model');
    invalidateAmrFundingFeedback();
    finish(new Response(JSON.stringify({ preflight })));
    expect(await request).toBe('unknown');
    expect(cachedHomeAmrFundingBlock(scope, 'model')).toBeNull();
  });
});


describe('Home uncached funding evidence before handoff', () => {
  it('does not reuse a warm available result when a new send is insufficient', async () => {
    const { scope, preflight, fetchMock } = fixture('available');
    expect(await checkAmrFundingFeedback(scope, 'model')).toBe('available');
    preflight.fundingCheck = 'insufficient';
    expect(await readFreshAmrFundingEvidence(scope, 'model')).toEqual({ kind: 'insufficient', preflight });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['workspace', 'member', 'model', 'stale', 'missing', 'offline'] as const)('cannot authorize Home using %s evidence', async (change) => {
    const { scope, preflight, fetchMock } = fixture('available');
    if (change === 'workspace') preflight.workspaceId = 'previous-space';
    if (change === 'member') preflight.workspaceMemberId = 'previous-member';
    if (change === 'model') preflight.modelId = 'previous-model';
    if (change === 'stale') preflight.generatedAt = new Date(Date.now() - 31_000).toISOString();
    if (change === 'missing') fetchMock.mockResolvedValue(new Response('{}'));
    if (change === 'offline') fetchMock.mockRejectedValue(new Error('offline'));
    expect(await readFreshAmrFundingEvidence(scope, 'model')).toEqual({ kind: 'unknown', preflight: null });
  });
  it('cancels a response if the route/model/draft owner is no longer current', async () => {
    const { scope, preflight, fetchMock } = fixture('available');
    let finish!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    let current = true;
    const result = readFreshAmrFundingEvidence(scope, 'model', () => current);
    current = false;
    finish(new Response(JSON.stringify({ preflight })));
    expect(await result).toEqual({ kind: 'unknown', preflight: null });
  });
});


describe('same funding observation also explains the plan', () => {
  it('shares one in-flight read with legacy verdict callers and retains the exact parsed preflight', async () => {
    const { scope, preflight, fetchMock } = fixture('insufficient');
    const [legacy, evidence] = await Promise.all([
      checkAmrFundingFeedback(scope, 'model'), checkAmrFundingEvidence(scope, 'model'),
    ]);
    expect(legacy).toBe('insufficient');
    expect(evidence).toEqual({ kind: 'insufficient', preflight });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await checkAmrFundingEvidence(scope, 'model');
    expect(fetchMock).toHaveBeenCalledTimes(2); // Negative evidence never authorizes another send.
  });
  it('uses the same positive observation only until the original five-second boundary', async () => {
    vi.useFakeTimers();
    const { scope, preflight, fetchMock } = fixture('available');
    const first = await checkAmrFundingEvidence(scope, 'model');
    vi.advanceTimersByTime(4_999);
    expect(await checkAmrFundingEvidence(scope, 'model')).toEqual(first);
    expect(await checkAmrFundingFeedback(scope, 'model')).toBe('available');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    preflight.fundingCheck = 'insufficient';
    expect(await checkAmrFundingEvidence(scope, 'model')).toEqual({ kind: 'insufficient', preflight });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['workspace', 'member', 'model', 'stale', 'future'] as const)('does not expose untrusted %s tier evidence', async (change) => {
    const { scope, preflight } = fixture('insufficient');
    if (change === 'workspace') preflight.workspaceId = 'other-workspace';
    if (change === 'member') preflight.workspaceMemberId = 'other-member';
    if (change === 'model') preflight.modelId = 'other-model';
    if (change === 'stale') preflight.generatedAt = new Date(Date.now() - 31_000).toISOString();
    if (change === 'future') preflight.generatedAt = new Date(Date.now() + 6_000).toISOString();
    expect(await checkAmrFundingEvidence(scope, 'model')).toEqual({ kind: 'unknown', preflight: null });
  });
  it('does not expose a late old-account preflight or reuse its positive tier', async () => {
    const { scope, preflight, fetchMock } = fixture('available');
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const old = checkAmrFundingEvidence(scope, 'model');
    advanceWorkspaceAccountGeneration('tier-new-account');
    finish(new Response(JSON.stringify({ preflight })));
    expect(await old).toEqual({ kind: 'unknown', preflight: null });
    expect(await checkAmrFundingEvidence(scope, 'model')).toEqual({ kind: 'available', preflight });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});


describe('explicit Send funding observations', () => {
  it.each([1, 8, 99])('accepts its own fresh server proof after %s display invalidations', async (invalidations) => {
    const { scope, preflight, fetchMock } = fixture('available');
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const result = readSendTimeAmrFundingEvidence(scope, 'model');
    for (let i = 0; i < invalidations; i++) invalidateAmrFundingFeedback();
    finish(new Response(JSON.stringify({ preflight })));
    expect(await result).toEqual({ kind: 'available', preflight });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('uses a new server read for every Send even when a warm positive is cached', async () => {
    const { scope, preflight, fetchMock } = fixture('available');
    await checkAmrFundingEvidence(scope, 'model');
    await readSendTimeAmrFundingEvidence(scope, 'model');
    preflight.fundingCheck = 'insufficient';
    expect(await readSendTimeAmrFundingEvidence(scope, 'model')).toEqual({ kind: 'insufficient', preflight });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it.each(['workspace', 'member', 'model', 'stale', 'future', 'missing', 'forbidden', 'timeout', 'offline', 'unknown'] as const)(
    'cannot authorize Send using %s evidence despite display invalidation', async (change) => {
      const { scope, preflight, fetchMock } = fixture('available');
      if (change === 'workspace') preflight.workspaceId = 'other-space';
      if (change === 'member') preflight.workspaceMemberId = 'other-member';
      if (change === 'model') preflight.modelId = 'other-model';
      if (change === 'stale') preflight.generatedAt = new Date(Date.now() - 31_000).toISOString();
      if (change === 'future') preflight.generatedAt = new Date(Date.now() + 6_000).toISOString();
      if (change === 'missing') fetchMock.mockResolvedValue(new Response('{}'));
      if (change === 'forbidden') fetchMock.mockResolvedValue(new Response(null, { status: 403 }));
      if (change === 'timeout') fetchMock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
      if (change === 'offline') fetchMock.mockRejectedValue(new Error('offline'));
      if (change === 'unknown') preflight.fundingCheck = 'unknown';
      const result = readSendTimeAmrFundingEvidence(scope, 'model');
      invalidateAmrFundingFeedback();
      expect(await result).toEqual({ kind: 'unknown', preflight: null });
    },
  );
  it.each(['account', 'route-or-model'] as const)('discards Send after its %s identity changes', async (change) => {
    const { scope, preflight, fetchMock } = fixture('available');
    let finish!: (response: Response) => void;
    let current = true;
    fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const result = readSendTimeAmrFundingEvidence(scope, 'model', () => current);
    if (change === 'account') advanceWorkspaceAccountGeneration('new-send-account');
    else current = false;
    finish(new Response(JSON.stringify({ preflight })));
    expect(await result).toEqual({ kind: 'unknown', preflight: null });
  });
});

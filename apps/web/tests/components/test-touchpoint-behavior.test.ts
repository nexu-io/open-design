import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestTouchpointBehaviorQueue, TEST_BEHAVIOR_LIMITS, testTouchpointBehaviorEvent, testTouchpointCtaEvent } from '../../src/components/test-touchpoint-behavior';
import { TouchpointLoadOwner } from '../../src/components/touchpoint-load-observability';
import type { TestRuntimeContext, TouchpointTestBehaviorEvent } from '@open-design/contracts/api/touchpointTestRuntime';

const context: TestRuntimeContext = { deploymentId: 'cmopaque', scenario: 'realtime', updatedAt: '2030-01-01T00:00:00Z', testerMemberId: 'tester',
  contextId: `ctx-v1:${'a'.repeat(64)}`, generation: '1', contextToken: `ctx-token-v1:${'b'.repeat(64)}` };
function owned(placementKey = 'opend.home.campaign-modal') {
  const owner = new TouchpointLoadOwner('test', 'zh-CN', () => undefined);
  const attempt = owner.decision(placementKey, owner.begin(placementKey), { activityId: 'activity', deploymentId: context.deploymentId, content: { id: 'version' } });
  return { owner, attempt, visible: () => attempt.visible() };
}
function event(): TouchpointTestBehaviorEvent {
  const { attempt, visible } = owned();
  return testTouchpointBehaviorEvent(context, attempt, visible(), 'exposure')!;
}
describe('bounded Test transport (local fixtures, no signed-client claim)', () => {
  let queue: TestTouchpointBehaviorQueue;
  beforeEach(() => { vi.useFakeTimers(); queue = new TestTouchpointBehaviorQueue(); });
  afterEach(async () => { queue.clear(); await vi.advanceTimersByTimeAsync(0); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('retries the exact immutable UUID/body and stops after three attempts', async () => {
    const fetchMock = vi.fn(async () => Response.json({}, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(queue.enqueue(event(), () => true)).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new Set(fetchMock.mock.calls.map(call => String((call as unknown as [string, RequestInit])[1].body))).size).toBe(1);
    expect(queue.size).toBe(0);
  });
  it.each([202, 400, 401, 403, 409, 410])('does not retry terminal %s', async status => {
    const fetchMock = vi.fn(async () => Response.json({}, { status })); vi.stubGlobal('fetch', fetchMock);
    queue.enqueue(event(), () => true); await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(queue.size).toBe(0);
  });
  it.each([
    ['5xx exhausted', () => Response.json({ error: 'injected_fault' }, { status: 500 }), 3, { result: 'failed', httpStatus: 500 }],
    ['429 exhausted', () => Response.json({}, { status: 429 }), 3, { result: 'failed', httpStatus: 429 }],
    ['network error', () => { throw new TypeError('fetch failed'); }, 3, { result: 'failed', httpStatus: null }],
    ['refused 400', () => Response.json({ error: 'invalid_test_behavior' }, { status: 400 }), 1, { result: 'failed', httpStatus: 400 }],
    ['accepted 202', () => Response.json({ accepted: true }, { status: 202 }), 1, { result: 'success', httpStatus: null }],
  ] as const)('OBS-006 settles the receipt outcome exactly once: %s', async (_name, answer, calls, outcome) => {
    const fetchMock = vi.fn(async () => answer()); vi.stubGlobal('fetch', fetchMock);
    const settle = vi.fn();
    expect(queue.enqueue(event(), () => true, settle)).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect(settle.mock.calls).toEqual([[outcome]]);
  });
  it('OBS-006 times out every attempt into a failed receipt without an HTTP status', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(() => undefined)); vi.stubGlobal('fetch', fetchMock);
    const settle = vi.fn();
    queue.enqueue(event(), () => true, settle); await vi.advanceTimersByTimeAsync(20_000);
    expect(settle.mock.calls).toEqual([[{ result: 'failed', httpStatus: null }]]);
  });
  it('OBS-006 leaves a cancelled receipt unknown rather than failed or successful', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(() => undefined)); vi.stubGlobal('fetch', fetchMock);
    const active = vi.fn(), active2 = vi.fn(), waiting = vi.fn();
    queue.enqueue(event(), () => true, active); queue.enqueue(event(), () => true, active2); queue.enqueue(event(), () => true, waiting);
    await vi.advanceTimersByTimeAsync(0);
    queue.clear(); await vi.advanceTimersByTimeAsync(10_000);
    for (const settle of [active, active2, waiting]) expect(settle.mock.calls).toEqual([[{ result: 'unknown', httpStatus: null }]]);
  });
  it('caps memory/concurrency and expires hanging requests that ignore abort', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(() => undefined)); vi.stubGlobal('fetch', fetchMock);
    for (let i = 0; i < TEST_BEHAVIOR_LIMITS.pending; i++) expect(queue.enqueue(event(), () => true)).toBe(true);
    expect(queue.enqueue(event(), () => true)).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(queue.size).toBe(0);
    expect(fetchMock.mock.calls.every(([, init]) => init.signal?.aborted)).toBe(true);
  });
  it('aborts active and queued work on context/selection exit and fences late answers', async () => {
    let resolve!: (response: Response) => void;
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(answer => { resolve = answer; })); vi.stubGlobal('fetch', fetchMock);
    queue.enqueue(event(), () => true); await vi.advanceTimersByTimeAsync(0);
    queue.clear(); await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock.mock.calls[0]![1].signal?.aborted).toBe(true);
    resolve(Response.json({}, { status: 503 })); await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1); expect(queue.size).toBe(0);
  });
  it('cancels stale placement grants without retrying or changing binding', async () => {
    let current = true;
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(() => undefined)); vi.stubGlobal('fetch', fetchMock);
    queue.enqueue(event(), () => current); await vi.advanceTimersByTimeAsync(0);
    current = false; queue.cancelStale(); await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock.mock.calls[0]![1].signal?.aborted).toBe(true); expect(queue.size).toBe(0);
  });
  it('never reports old-server, partial, unobserved or noncatalog actions', () => {
    const { attempt, visible } = owned(); const id = visible();
    const legacy = { deploymentId: context.deploymentId, scenario: 'realtime', updatedAt: context.updatedAt } as TestRuntimeContext;
    expect(testTouchpointBehaviorEvent(legacy, attempt, id, 'exposure')).toBeNull();
    expect(testTouchpointBehaviorEvent({ ...legacy, contextId: context.contextId } as TestRuntimeContext, attempt, id, 'exposure')).toBeNull();
    expect(testTouchpointBehaviorEvent(context, owned().attempt, crypto.randomUUID(), 'click', 'primary_cta')).toBeNull();
    for (const placement of ['opend.home.account-badge', 'opend.home.hover-entry']) {
      const h = owned(placement); h.visible();
      expect(testTouchpointBehaviorEvent(context, h.attempt, crypto.randomUUID(), 'click', 'close')).toBeNull();
    }
    expect(testTouchpointBehaviorEvent(context, attempt, crypto.randomUUID(), 'exposure')).toBeNull();
  });
});


it('maps observed hover X to layer C and retains strict secondary/retired gates', () => {
  const h=owned('opend.home.hover-layer'); h.visible(); const id=crypto.randomUUID();
  expect(testTouchpointBehaviorEvent(context,h.attempt,id,'click','close')).toMatchObject({eventId:id,kind:'click',element:'close',surface:'layer',placementKey:'opend.home.hover-layer'});
  expect(testTouchpointBehaviorEvent(context,h.attempt,crypto.randomUUID(),'click','secondary_close')).toBeNull();
});

describe('OBS-011 content-button clicks', () => {
  const button = (role: 'primary' | 'secondary' | null, id = role === 'secondary' ? 'plans' : 'docs') => ({ id, role, targetKind: 'https' as const,
    targetUrl: `https://example.com/p7k-${id}`, templateId: 'compact', templateVersion: 8, materialVersionId: '12345678-1234-4234-8234-123456789012' });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('records the secondary button as secondary_cta with its own ID, URL and versions', () => {
    const h = owned(); h.visible(); const id = crypto.randomUUID();
    expect(testTouchpointCtaEvent(context, h.attempt, id, button('secondary'))).toMatchObject({ contractVersion: 2, eventId: id, kind: 'click',
      element: 'secondary_cta', surface: 'placement', button: button('secondary') });
    expect(testTouchpointCtaEvent(context, h.attempt, crypto.randomUUID(), button('primary'))).toMatchObject({ element: 'primary_cta', button: { id: 'docs', role: 'primary' } });
    expect(testTouchpointCtaEvent(context, h.attempt, crypto.randomUUID(), button(null))).toMatchObject({ element: 'unclassified_cta', button: { role: null } });
    const layer = owned('opend.home.hover-layer'); layer.visible();
    expect(testTouchpointCtaEvent(context, layer.attempt, crypto.randomUUID(), button('secondary'))).toMatchObject({ surface: 'layer', element: 'secondary_cta' });
  });
  it('emits nothing without verified button facts or for surface-only placements', () => {
    const h = owned(); h.visible();
    expect(testTouchpointCtaEvent(context, h.attempt, crypto.randomUUID(), undefined)).toBeNull();
    expect(testTouchpointCtaEvent(context, owned().attempt, crypto.randomUUID(), button('primary'))).toBeNull();
    for (const placement of ['opend.home.account-badge', 'opend.home.hover-entry']) {
      const s = owned(placement); s.visible();
      expect(testTouchpointCtaEvent(context, s.attempt, crypto.randomUUID(), button('primary'))).toBeNull();
    }
  });
  it.each([['primary', 2], ['secondary', 1], [null, 1]] as const)('a strict-v1 server (400) receives the same-ID v1 primary only: role=%s', async (role, calls) => {
    vi.useFakeTimers();
    const queue = new TestTouchpointBehaviorQueue();
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); bodies.push(body);
      return Response.json({}, { status: body.contractVersion === 2 ? 400 : 202 });
    }));
    const h = owned(); h.visible(); const id = crypto.randomUUID();
    expect(queue.enqueue(testTouchpointCtaEvent(context, h.attempt, id, button(role))!, () => true)).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(bodies).toHaveLength(calls);
    expect(bodies.every(body => body.eventId === id)).toBe(true);
    if (calls === 2) expect(bodies[1]).toMatchObject({ contractVersion: 1, element: 'primary_cta' });
    if (calls === 2) expect(bodies[1]).not.toHaveProperty('button');
    expect(queue.size).toBe(0);
  });
  // OBS-011 v2 × OBS-006 merge: the legacy downgrade is part of ONE delivery, so it settles once with its final answer.
  async function downgradeRun(answers: number[], role: 'primary' | 'secondary' = 'primary') {
    vi.useFakeTimers();
    const queue = new TestTouchpointBehaviorQueue();
    const bodies: Record<string, unknown>[] = [];
    const settle = vi.fn();
    const settledAt: number[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body))); settledAt.push(settle.mock.calls.length);
      return Response.json({}, { status: answers[Math.min(bodies.length, answers.length) - 1] });
    }));
    const h = owned(); h.visible(); const id = crypto.randomUUID();
    expect(queue.enqueue(testTouchpointCtaEvent(context, h.attempt, id, button(role))!, () => true, settle)).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(bodies.every(body => body.eventId === id)).toBe(true);
    expect(queue.size).toBe(0);
    return { bodies, settle, settledAt };
  }
  it('merge: 400 → same-ID legacy resend that succeeds settles success exactly once', async () => {
    const { bodies, settle, settledAt } = await downgradeRun([400, 202]);
    expect(bodies.map(body => body.contractVersion)).toEqual([2, 1]);
    // Nothing was reported for the refused v2 attempt before the resend went out.
    expect(settledAt).toEqual([0, 0]);
    expect(settle.mock.calls).toEqual([[{ result: 'success', httpStatus: null }]]);
  });
  it('merge: 400 → legacy 5xx until the attempt budget is spent settles a single failed', async () => {
    const { bodies, settle, settledAt } = await downgradeRun([400, 500, 500, 500]);
    expect(bodies.map(body => body.contractVersion)).toEqual([2, 1, 1]);
    expect(settledAt).toEqual([0, 0, 0]);
    expect(settle.mock.calls).toEqual([[{ result: 'failed', httpStatus: 500 }]]);
  });
  it('merge: a 400 on the last attempt (no budget left to resend) settles failed/400 once', async () => {
    const { bodies, settle } = await downgradeRun([503, 503, 400]);
    expect(bodies.map(body => body.contractVersion)).toEqual([2, 2, 2]);
    expect(settle.mock.calls).toEqual([[{ result: 'failed', httpStatus: 400 }]]);
  });
  it('merge: a v2 click with no legacy form (secondary) is refused once, never downgraded', async () => {
    const { bodies, settle } = await downgradeRun([400], 'secondary');
    expect(bodies).toHaveLength(1);
    expect(settle.mock.calls).toEqual([[{ result: 'failed', httpStatus: 400 }]]);
  });
});

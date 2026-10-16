import { afterEach, describe, expect, it, vi } from 'vitest';
import { TouchpointLoadOwner, TouchpointLoadQueue, resetTouchpointLoadObservability, touchpointClientResourceSizes } from '../../src/components/touchpoint-load-observability';
import { touchpointLoadBatchSchema, touchpointUtf8Bytes, type TouchpointLoadRecord } from '@open-design/contracts/api/touchpointLoadResults';
const placement = 'opend.home.campaign-modal';
const decision = { activityId: 'activity', deploymentId: 'deployment', touchpointDecisionId: 'decision', content: { id: 'content' }, placementKey: placement };
const setup = () => { const records: TouchpointLoadRecord[] = []; const owner = new TouchpointLoadOwner('production', 'en-US', record => records.push(record)); return { records, owner }; };
afterEach(() => { resetTouchpointLoadObservability(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('owned loading facts', () => {
  it('enqueues immutable unknown start synchronously, enriches new events, settles once and renews only', () => {
    const { records, owner } = setup(); const request = owner.begin(placement);
    expect(records[0]!.kind).toBe('start'); expect(records[0]!.decision_id).toBeNull(); expect(records[0]!.decision_outcome).toBeNull();
    const attempt = owner.decision(placement, request, decision); attempt.ready(); const behavior = attempt.visible(); attempt.visible(); attempt.fail(new Error('mount')); attempt.report('failed');
    for (let index = 0; index < 6; index++) owner.decision(placement, owner.begin(placement), { ...decision, touchpointDecisionId: `renewed-${index}` });
    expect(records.filter(r => r.kind === 'start')).toHaveLength(1); expect(records.filter(r => r.kind === 'terminal')).toHaveLength(1); expect(records.filter(r => r.kind === 'renewal')).toHaveLength(6);
    expect(records[0]!.decision_id).toBeNull(); expect(records.find(r => r.kind === 'terminal')?.event_id).toBe(behavior); expect(records.find(r => r.kind === 'report')?.report_result).toBe('failed');
    expect(touchpointLoadBatchSchema.safeParse({ contractVersion: 1, records }).success).toBe(true);
    attempt.cancel('revoked'); expect(attempt.visible()).toBeNull();
    expect(owner.begin(placement).attempt).not.toBe(attempt);
    expect(records.filter(r => r.kind === 'terminal')).toHaveLength(1);
  });
  it.each(['failed', 'cancelled'] as const)('starts the next real request afresh after %s, retaining immutable facts', result => {
    const { owner, records } = setup(); const request = owner.begin(placement);
    if (result === 'failed') owner.failure(request, new Error('network'));
    else if (result === 'cancelled') request.attempt.cancel('page_left');
    else owner.empty(request, result);
    const snapshot = JSON.stringify(records);
    const next = owner.begin(placement);
    expect(next.renewal).toBe(false); expect(next.attempt).not.toBe(request.attempt);
    expect(JSON.stringify(records.slice(0, -1))).toBe(snapshot);
    expect(records.at(-1)).toMatchObject({ kind: 'start', decision_outcome: null, decision_id: null });
    owner.decision(placement, next, decision).visible();
    expect(records.filter(r => r.kind === 'terminal')).toHaveLength(2);
    expect(new Set(records.filter(r => r.kind === 'terminal').map(r => r.load_attempt_id)).size).toBe(2);
  });
  it('changes deployment from the identifying request start, cancels old pending once, never exposes after cancellation', () => {
    const { owner, records } = setup(); const old = owner.decision(placement, owner.begin(placement), decision);
    const request = owner.begin(placement); const next = owner.decision(placement, request, { ...decision, deploymentId: 'next' });
    expect(next.started).toBe(request.started); expect(records.filter(r => r.kind === 'start')).toHaveLength(2);
    expect(records.find(r => r.kind === 'terminal')?.cancel_reason).toBe('decision_changed'); expect(old.visible()).toBeNull();
    next.cancel('identity_changed'); next.visible(); expect(records.filter(r => r.kind === 'terminal')).toHaveLength(2);
  });
  it('T3 ready is not visible; never-triggered layer cancels separately and trigger wait excludes user idle', () => {
    vi.useFakeTimers(); const { owner, records } = setup();
    const entry = owner.decision('opend.home.hover-entry', owner.begin('opend.home.hover-entry'), decision); const layer = owner.decision('opend.home.hover-layer', owner.begin('opend.home.hover-layer'), decision);
    entry.ready(); layer.ready(); entry.visible(); vi.advanceTimersByTime(20_000); layer.cancel('page_left');
    expect(records.filter(r => r.result === 'visible')).toHaveLength(1); expect(records.find(r => r.cancel_reason)?.cancel_reason).toBe('not_triggered');
    const second = new TouchpointLoadOwner('test', 'en-US', r => records.push(r)); const triggered = second.decision('opend.home.hover-layer', second.begin('opend.home.hover-layer'), decision); triggered.ready(); vi.advanceTimersByTime(20_000); triggered.trigger('click'); vi.advanceTimersByTime(20); triggered.visible();
    expect(records.at(-1)?.visibility_wait_ms).toBe(20); expect(records.at(-1)?.decision_id).toBeNull();
  });
  it('shares one B with the existing runtime exposure and records its failed receipt separately', async () => {
    const transport = vi.fn<typeof fetch>(async () => new Response('{}', { status: 503 })); vi.stubGlobal('fetch', transport);
    const { owner, records } = setup(); const attempt = owner.decision(placement, owner.begin(placement), decision); attempt.ready(); attempt.exposure(decision); attempt.exposure(decision);
    await vi.waitFor(() => expect(records.some(r => r.kind === 'report')).toBe(true));
    expect(transport).toHaveBeenCalledTimes(1); expect(JSON.parse(transport.mock.calls[0]![1]!.body as string).eventId).toBe(records.find(r => r.result === 'visible')!.event_id);
    expect(records.find(r => r.kind === 'report')!.report_result).toBe('failed'); expect(records.filter(r => r.kind === 'terminal')).toHaveLength(1);
  });
  it('pre-decision failure stays unknown and empty renewal describes this request without downgrading the visible lease', () => {
    const { owner, records } = setup(); owner.failure(owner.begin(placement), new Error('http_403'));
    expect(records.at(-1)).toMatchObject({ result: 'failed', failure_stage: 'decision', decision_outcome: null, http_status: 403 });
    const other = new TouchpointLoadOwner('production', 'en-US', r => records.push(r)); other.decision(placement, other.begin(placement), decision).visible(); other.empty(other.begin(placement), 'no_activity');
    expect(records.at(-1)).toMatchObject({ kind: 'renewal', decision_outcome: 'no_activity', activity_id: null, decision_id: null });
  });
});
it('counts one initial empty attempt across polls, then a new load when a decision appears', () => {
  const { owner, records } = setup();
  for (let index = 0; index < 3; index++) owner.empty(owner.begin(placement), 'no_activity');
  expect(records.filter(r => r.kind === 'start')).toHaveLength(1);
  expect(records.filter(r => r.kind === 'terminal')).toHaveLength(1);
  expect(records.filter(r => r.kind === 'renewal')).toHaveLength(2);
  const attempt = owner.decision(placement, owner.begin(placement), decision); attempt.ready(); attempt.visible();
  expect(records.filter(r => r.kind === 'start')).toHaveLength(2);
  expect(records.filter(r => r.result === 'visible')).toHaveLength(1);
});
it('classifies controlled HTTP status and malformed JSON at their actual stages', () => {
  const { owner, records } = setup(); owner.failure(owner.begin(placement), Object.assign(new Error('touchpoint_test_load_failed'), { status: 503 }));
  expect(records.at(-1)).toMatchObject({ http_status: 503, error_code: 'http_error', failure_stage: 'decision' });
  owner.failure(owner.begin(placement), new SyntaxError('Unexpected token'));
  expect(records.at(-1)).toMatchObject({ error_code: 'decode_error', failure_stage: 'decode_validate' });
});
describe('bounded transport', () => {
  it('disposal rejects late records and aborts retries of an old identity', async () => {
    vi.useFakeTimers(); let release!: (value: Response) => void;
    const transport = vi.fn<typeof fetch>(() => new Promise(resolve => { release = resolve; }));
    const queue = new TouchpointLoadQueue('production', transport);
    const owner = new TouchpointLoadOwner('production', 'en-US', r => queue.enqueue(r)); const observed = owner.begin(placement);
    const pending = queue.flush(); expect(transport).toHaveBeenCalledTimes(1);
    queue.dispose(); owner.cancel('identity_changed'); owner.decision(placement, observed, decision).report('failed');
    release(new Response('{}', { status: 503 })); await vi.runAllTimersAsync(); await pending;
    expect(queue.size).toBe(0); expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]![1]!.signal?.aborted).toBe(true);
  });

  it('keeps 200 records maximum and flushes <=100 / 256KiB without blocking enqueue', async () => {
    vi.useFakeTimers(); const transport = vi.fn<typeof fetch>(async () => new Response('{}', { status: 202 })); const queue = new TouchpointLoadQueue('production', transport);
    for (let index = 0; index < 220; index++) new TouchpointLoadOwner('production', 'en-US', r => queue.enqueue(r)).begin(placement);
    expect(queue.size).toBe(200); expect(queue.dropped).toBe(20); expect(transport).not.toHaveBeenCalled(); await queue.flush();
    const body = transport.mock.calls[0]![1]!.body as string; expect(JSON.parse(body).records).toHaveLength(100); expect(touchpointUtf8Bytes(body)).toBeLessThanOrEqual(256 * 1024); queue.dispose();
  });
  it('retries immutable bytes at most twice and drops after terminal HTTP errors', async () => {
    vi.useFakeTimers(); const bodies: string[] = []; const transport = vi.fn(async (_url, options) => { bodies.push(options!.body as string); return new Response('{}', { status: bodies.length < 3 ? 503 : 403 }); }); const queue = new TouchpointLoadQueue('test', transport);
    new TouchpointLoadOwner('test', 'en-US', r => queue.enqueue(r)).begin(placement); const flushing = queue.flush(); await vi.runAllTimersAsync(); await flushing;
    expect(bodies).toHaveLength(3); expect(new Set(bodies).size).toBe(1); expect(queue.size).toBe(0); queue.dispose();
  });
  it('splits 413 and pagehide keepalive stays <=48KiB', async () => {
    vi.useFakeTimers(); let calls = 0; const transport = vi.fn<typeof fetch>(async () => new Response('{}', { status: ++calls === 1 ? 413 : 202 })); const queue = new TouchpointLoadQueue('production', transport);
    for (let index = 0; index < 4; index++) new TouchpointLoadOwner('production', 'en-US', r => queue.enqueue(r)).begin(placement);
    await queue.flush(); expect(transport).toHaveBeenCalledTimes(3); expect(queue.size).toBe(0);
    for (let index = 0; index < 100; index++) new TouchpointLoadOwner('production', 'en-US', r => queue.enqueue(r)).begin(placement);
    await queue.flush(true); const options = transport.mock.calls.at(-1)![1]!; expect(options.keepalive).toBe(true); expect(touchpointUtf8Bytes(options.body as string)).toBeLessThanOrEqual(48 * 1024); queue.dispose();
  });
});

it('measures actual base64 payloads and keeps client version unknown until supplied by runtime', () => {
  expect(touchpointClientResourceSizes({ content: { resources: [{ bytes: btoa('hello') }] } })).toEqual({ local_base64_bytes: 8, decoded_resource_bytes: 5 });
  expect(touchpointClientResourceSizes({ content: { resources: [{ bytes: 'invalid!' }] } })).toEqual({});
  const { records, owner } = setup(); owner.begin(placement);
  expect(records[0]?.client_version).toBeNull();
  owner.setClientVersion('signed:2026.10.10'); owner.decision(placement, owner.begin(placement), decision).visible();
  expect(records[0]?.client_version).toBeNull();
  expect(records.at(-1)?.client_version).toBe('signed:2026.10.10');
});

it('keeps failed renewal facts schema-valid without creating another terminal or overwriting eligible', () => {
 const { owner, records } = setup(); const attempt = owner.decision(placement, owner.begin(placement), decision); attempt.ready(); attempt.visible();
 owner.failure(owner.begin(placement), Object.assign(new Error('resource_unavailable'), { status: 503, failure_stage: 'resource_read', error_code: 'network_error' }));
 expect(records.at(-1)).toMatchObject({ kind: 'renewal', decision_outcome: null, http_status: 503, failure_stage: null, error_code: null });
 expect(records.filter(r => r.kind === 'terminal')).toHaveLength(1);
 expect(records.find(r => r.kind === 'terminal')?.decision_outcome).toBe('eligible');
});

it('F15 failed and empty renewal do not inherit the prior successful response metrics', () => {
  for (const outcome of ['failed', 'empty'] as const) {
    const { owner, records } = setup();
    owner.decision(placement, owner.begin(placement), decision, null, { public_response_bytes: 777, local_response_bytes: 888, public_base64_bytes: 400, local_base64_bytes: 500, decoded_resource_bytes: 300, resource_read_ms: 12, local_transfer_ms: 13, decode_validate_ms: 14, cache_hit: true, cache_source: 'daemon', server_version: 'previous-release' });
    const terminalBefore = records.filter(r => r.kind === 'terminal').length;
    if (outcome === 'failed') owner.failure(owner.begin(placement), new TypeError('network'));
    else owner.empty(owner.begin(placement), 'no_activity');
    const renewal = records.at(-1)!;
    expect(renewal.kind).toBe('renewal');
    for (const key of ['public_response_bytes', 'local_response_bytes', 'public_base64_bytes', 'local_base64_bytes', 'decoded_resource_bytes', 'resource_read_ms', 'local_transfer_ms', 'decode_validate_ms', 'cache_hit', 'cache_source', 'server_version'] as const) expect(renewal[key], key).toBeNull();
    expect(renewal.decision_outcome).toBe(outcome === 'failed' ? null : 'no_activity');
    expect(renewal.http_status).toBeNull();
    expect(records.filter(r => r.kind === 'terminal')).toHaveLength(terminalBefore);
    expect(touchpointLoadBatchSchema.safeParse({ contractVersion: 1, records }).success).toBe(true);
  }
});

describe('OBS-002 decision_id follows the environment decision credential', () => {
  const eligible = (records: TouchpointLoadRecord[]) => records.filter(record => record.decision_outcome === 'eligible');
  it('Production eligible terminal/report/renewal records carry touchpointDecisionId', () => {
    const { records, owner } = setup();
    const attempt = owner.decision(placement, owner.begin(placement), decision);
    attempt.ready(); attempt.visible(); attempt.report('success');
    owner.decision(placement, owner.begin(placement), decision);
    expect(eligible(records).map(record => record.kind)).toEqual(['terminal', 'report', 'renewal']);
    expect(eligible(records).every(record => record.decision_id === 'decision')).toBe(true);
    expect(touchpointLoadBatchSchema.safeParse({ contractVersion: 1, records }).success).toBe(true);
  });
  it('Test eligible records stay unbound by decision credential (ingest 403s any Test decision_id) and keep deployment_id', () => {
    const records: TouchpointLoadRecord[] = []; const owner = new TouchpointLoadOwner('test', 'zh-CN', record => records.push(record));
    // Even a payload that smuggles a credential must not forge one in Test.
    const attempt = owner.decision(placement, owner.begin(placement), decision);
    attempt.ready(); attempt.visible(); attempt.report('failed');
    expect(eligible(records)).toHaveLength(2);
    expect(eligible(records).every(record => record.decision_id === null && record.deployment_id === 'deployment')).toBe(true);
  });
});

describe('OBS-008 late results', () => {
  const pendingFetch = () => {
    let resolve!: (response: Response) => void;
    const transport = vi.fn<typeof fetch>(() => new Promise<Response>(done => { resolve = done; }));
    vi.stubGlobal('fetch', transport);
    return { transport, answer: (status: number) => resolve(new Response('{}', { status })) };
  };
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  it('a receipt answered after the attempt ended (page_left) records nothing and adds no second terminal', async () => {
    const { transport, answer } = pendingFetch();
    const { owner, records } = setup();
    const attempt = owner.decision(placement, owner.begin(placement), decision); attempt.ready();
    const eventId = attempt.exposure(decision);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    owner.cancel('page_left');
    attempt.fail(new Error('mount')); expect(attempt.visible()).toBeNull();
    answer(202); await flush(); attempt.report('success');
    expect(records.filter(r => r.kind === 'terminal')).toEqual([expect.objectContaining({ result: 'visible', event_id: eventId })]);
    expect(records.filter(r => r.kind === 'report')).toHaveLength(0);
    expect(attempt.renewable).toBe(false);
  });

  it('a receipt answered after a content-version switch never rebinds to the new attempt', async () => {
    const { transport, answer } = pendingFetch();
    const { owner, records } = setup();
    const old = owner.decision(placement, owner.begin(placement), decision); old.ready();
    old.exposure(decision);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    const oldId = old.analyticsFacts.load_attempt_id;
    const next = owner.decision(placement, owner.begin(placement), { ...decision, content: { id: 'content-v2' } });
    const nextId = next.analyticsFacts.load_attempt_id;
    expect(nextId).not.toBe(oldId); expect(owner.get(placement)).toBe(next);
    answer(500); await flush(); old.report('failed', { http_status: 500 });
    expect(records.filter(r => r.kind === 'report')).toHaveLength(0);
    expect(records.filter(r => r.load_attempt_id === nextId).map(r => r.kind)).toEqual(['start']);
    // The old attempt was already visible: the switch retires it without a second terminal.
    expect(records.filter(r => r.load_attempt_id === oldId && r.kind === 'terminal').map(r => r.result)).toEqual(['visible']);
    next.ready(); next.visible(); next.report('success');
    expect(records.filter(r => r.kind === 'report')).toEqual([expect.objectContaining({ load_attempt_id: nextId, content_version_id: 'content-v2', report_result: 'success' })]);
  });

  it('a pending old attempt switched by version is cancelled once; its late visibility and results are ignored', () => {
    const { owner, records } = setup();
    const old = owner.decision(placement, owner.begin(placement), decision);
    const next = owner.decision(placement, owner.begin(placement), { ...decision, deploymentId: 'deployment-v2' });
    expect(old.visible()).toBeNull(); old.fail(new Error('mount')); old.report('success'); old.renewal();
    const oldId = old.analyticsFacts.load_attempt_id;
    expect(records.filter(r => r.load_attempt_id === oldId).map(r => [r.kind, r.result, r.cancel_reason])).toEqual([['start', null, null], ['terminal', 'cancelled', 'decision_changed']]);
    expect(records.filter(r => r.load_attempt_id === next.analyticsFacts.load_attempt_id).map(r => r.kind)).toEqual(['start']);
  });

  it('a result after the terminal on a still-owned attempt is recorded on that attempt, including after a same-binding renewal', () => {
    const { owner, records } = setup();
    const attempt = owner.decision(placement, owner.begin(placement), decision); attempt.ready(); attempt.visible();
    const renewed = owner.decision(placement, owner.begin(placement), decision);
    expect(renewed).toBe(attempt);
    attempt.report('success', { http_status: null });
    expect(records.filter(r => r.kind === 'report')).toEqual([expect.objectContaining({ load_attempt_id: attempt.analyticsFacts.load_attempt_id, report_result: 'success' })]);
    expect(records.filter(r => r.kind === 'terminal')).toHaveLength(1);
  });

  it('a Test receipt settled after a version switch is dropped from the old attempt (Test mode)', () => {
    const records: TouchpointLoadRecord[] = []; const owner = new TouchpointLoadOwner('test', 'en-US', r => records.push(r));
    const old = owner.decision(placement, owner.begin(placement), decision); old.ready(); old.visible();
    owner.decision(placement, owner.begin(placement), { ...decision, content: { id: 'content-v2' } });
    old.report('unknown', { http_status: null }); old.report('success');
    expect(records.filter(r => r.kind === 'report')).toHaveLength(0);
  });
});

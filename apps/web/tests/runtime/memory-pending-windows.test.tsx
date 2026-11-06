// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useMemoryWrittenCard } from '../../src/runtime/useMemoryWrittenCard';

type Origin = { projectId: string; conversationId: string; runId?: string; assistantMessageId?: string };
type RecordFixture = { id: string; startedAt: number; finishedAt: number; phase: 'success' | 'running'; writtenCount: number; writtenIds: string[]; extractionOrigin?: Origin };
const a = { projectId: 'project', conversationId: 'same-conversation', runId: 'run-a' };
const b = { ...a, runId: 'run-b' };
const originalFetch = globalThis.fetch;
let records: RecordFixture[] = [];
let polls = 0;

beforeEach(() => {
  vi.useFakeTimers();
  records = [];
  polls = 0;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === '/api/memory/extractions') {
      polls += 1;
      return Response.json({ extractions: records });
    }
    return Response.json({ entries: [{ id: 'rule-a', name: 'A', type: 'rule' }, { id: 'rule-b', name: 'B', type: 'rule' }] });
  }) as typeof fetch;
});
afterEach(() => { cleanup(); vi.useRealTimers(); globalThis.fetch = originalFetch; });

function record(id: string, extractionOrigin?: Origin): RecordFixture {
  return { id, startedAt: Date.now(), finishedAt: Date.now(), phase: 'success', writtenCount: 1, writtenIds: [id],
    ...(extractionOrigin ? { extractionOrigin } : {}) };
}
async function tick(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
function mount() {
  return renderHook(({ active, owner, origin }: { active: boolean; owner: string; origin: Origin }) =>
    useMemoryWrittenCard(active, { owner }, origin),
  { initialProps: { active: false, owner: 'A', origin: { ...a, runId: undefined } as Origin } });
}

it('keeps two turns in one conversation distinct when run identities arrive after the active edges', async () => {
  const { result, rerender } = mount();
  await act(async () => { rerender({ active: true, owner: 'A', origin: { ...a, runId: undefined } }); });
  // Models the context update caused by onRunCreated after Send made the
  // assistant active. The ProjectView suite separately covers actual Send.
  await act(async () => { rerender({ active: true, owner: 'A', origin: a }); });
  await act(async () => { rerender({ active: false, owner: 'A', origin: a }); });
  await tick();
  expect(polls).toBe(1);
  await tick(1);
  await act(async () => { rerender({ active: true, owner: 'B', origin: { ...b, runId: undefined } }); });
  records = [record('rule-b', b)];
  await tick(3_000);
  expect(result.current.batch, 'A must not claim B while B has no supplied run id').toBeNull();
  await act(async () => { rerender({ active: true, owner: 'B', origin: b }); });
  await act(async () => { rerender({ active: false, owner: 'B', origin: b }); });
  await tick();
  expect(result.current.batch).toMatchObject({ key: 'rule-b', context: { owner: 'B' } });
  await act(async () => { result.current.dismiss(); });
  records.push(record('rule-a', a));
  await tick(3_000);
  expect(result.current.batch).toMatchObject({ key: 'rule-a', context: { owner: 'A' } });
  await act(async () => { result.current.dismiss(); });
  await tick(3_000);
  expect(result.current.batch).toBeNull();
});

it('does not adopt ambiguous old records after A expires and keeps B own budget and unmount cancellation', async () => {
  const { result, rerender, unmount } = mount();
  await act(async () => { rerender({ active: true, owner: 'A', origin: a }); });
  await act(async () => { rerender({ active: false, owner: 'A', origin: a }); });
  await tick();
  for (let i = 0; i < 8; i += 1) await tick(3_000);
  expect(polls).toBe(9);
  await tick(1);
  await act(async () => { rerender({ active: true, owner: 'B', origin: b }); });
  await act(async () => { rerender({ active: false, owner: 'B', origin: b }); });
  await tick();
  for (let i = 0; i < 3; i += 1) await tick(3_000);
  // A has exhausted 12 attempts; B has used only 4 of its own attempts.
  records = [record('rule-a')];
  await tick(3_000);
  expect(result.current.batch, 'legacy ownership must not become unambiguous merely because A expired').toBeNull();
  records.push(record('rule-b', b));
  await tick(3_000);
  expect(result.current.batch).toMatchObject({ key: 'rule-b', context: { owner: 'B' } });
  await act(async () => { result.current.dismiss(); });
  unmount();
  const before = polls;
  await tick(30_000);
  expect(polls).toBe(before);
});

it('does not repeat an old conversation-scoped HTTP record in a newer turn', async () => {
  const { result, rerender } = mount();
  const old = record('rule-a', { projectId: a.projectId, conversationId: a.conversationId });
  old.startedAt -= 1_000;
  old.finishedAt -= 1_000;
  records = [old];
  await act(async () => { rerender({ active: true, owner: 'A', origin: a }); });
  await act(async () => { rerender({ active: false, owner: 'A', origin: a }); });
  await tick();
  expect(polls).toBe(1);
  expect(result.current.batch).toBeNull();
});

it('retains a BYOK pre-run HTTP notification for its explicit sending draft while B is still active', async () => {
  const { result, rerender } = mount();
  // Proposed additive field, supplied from Send's assistantId before there is
  // a daemon run. A companion HTTP/ProjectView spec must prove the transport;
  // this hook spec does not claim an old unmarked record gains an identity.
  const turnA = { projectId: a.projectId, conversationId: a.conversationId, assistantMessageId: 'assistant-a' };
  const turnB = { projectId: b.projectId, conversationId: b.conversationId, assistantMessageId: 'assistant-b' };
  await act(async () => { rerender({ active: true, owner: 'A', origin: turnA }); });
  await act(async () => { rerender({ active: false, owner: 'A', origin: turnA }); });
  await tick();
  expect(polls).toBe(1);
  await tick(1);
  await act(async () => { rerender({ active: true, owner: 'B', origin: turnB }); });
  records = [record('rule-b', turnB)];
  await tick(3_000);
  expect(result.current.batch, 'B preflight must not be announced by pending A').toBeNull();
  await act(async () => { rerender({ active: false, owner: 'B', origin: turnB }); });
  await tick();
  expect(result.current.batch).toMatchObject({ key: 'rule-b', context: { owner: 'B' } });
  await act(async () => { result.current.dismiss(); });
  records.push(record('rule-a', turnA));
  await tick(3_000);
  expect(result.current.batch).toMatchObject({ key: 'rule-a', context: { owner: 'A' } });
  await act(async () => { result.current.dismiss(); });
  await tick(3_000);
  expect(result.current.batch).toBeNull();
});

it('retains B ambiguity when A exhausts its budget before B completes', async () => {
  const { result, rerender } = mount();
  await act(async () => { rerender({ active: true, owner: 'A', origin: a }); });
  await act(async () => { rerender({ active: false, owner: 'A', origin: a }); });
  await tick();
  for (let i = 0; i < 10; i += 1) await tick(3_000);
  expect(polls).toBe(11);
  await tick(1);
  const bStartedAt = Date.now();
  await act(async () => { rerender({ active: true, owner: 'B', origin: b }); });
  await tick(1_000);
  // A's provider selection can finish after B has already started. Its old
  // HTTP record has conversation scope but no stable turn identity.
  const lateA = record('rule-a', { projectId: a.projectId, conversationId: a.conversationId });
  expect(lateA.startedAt).toBeGreaterThan(bStartedAt);
  lateA.phase = 'running';
  lateA.writtenCount = 0;
  records = [lateA];
  await tick(1_999);
  expect(polls).toBe(12); // A exhausted; B is still running, not a window yet.
  expect(result.current.batch).toBeNull();
  await tick(1_000);
  await act(async () => { rerender({ active: false, owner: 'B', origin: b }); });
  await tick();
  expect(polls).toBe(13); // B's first independent attempt sees only running A.
  expect(result.current.batch).toBeNull();
  await tick(1_000);
  lateA.phase = 'success';
  lateA.writtenCount = 1;
  lateA.finishedAt = Date.now();
  await tick(2_000);
  expect(result.current.batch, 'A expiry must not erase B prior overlap').toBeNull();
  records.push(record('rule-b', b));
  await tick(3_000);
  expect(result.current.batch).toMatchObject({ key: 'rule-b', context: { owner: 'B' } });
  await act(async () => { result.current.dismiss(); });
  await tick(3_000);
  expect(result.current.batch).toBeNull();
});

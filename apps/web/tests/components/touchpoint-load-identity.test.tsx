// @vitest-environment jsdom
import { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { resetTouchpointLoadObservability, touchpointLoadQueue, useTouchpointLoadOwner, type TouchpointLoadOwner } from '../../src/components/touchpoint-load-observability';
vi.mock('../../src/analytics/provider', () => ({ useAppVersion: () => 'signed:2026.10.10' }));
const placement = 'opend.home.campaign-modal';
afterEach(() => { cleanup(); resetTouchpointLoadObservability(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('switches the real hook queue before a new identity posts and fences old in-flight callbacks', async () => {
  vi.useFakeTimers(); let release!: (response: Response) => void;
  const fetchMock = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue(Response.json({}, { status: 202 }));
  vi.stubGlobal('fetch', fetchMock);
  let current!: TouchpointLoadOwner;
  function Host({ identity }: { identity: string }) {
    const owner = useTouchpointLoadOwner('production', identity, 'en-US'); current = owner;
    useEffect(() => { owner.empty(owner.begin(placement), 'no_activity'); }, [owner]);
    return null;
  }
  const view = render(<Host identity="account-A" />);
  const old = current; const oldRequest = old.begin(placement); const oldQueue = touchpointLoadQueue('production');
  const pending = oldQueue.flush();
  view.rerender(<Host identity="account-B" />);
  expect(fetchMock.mock.calls[0]![1]!.signal?.aborted).toBe(true);
  expect(oldQueue.size).toBe(0);
  old.decision(placement, oldRequest, { activityId: 'old', deploymentId: 'old', content: { id: 'old' } }).report('failed');
  release(Response.json({}, { status: 503 }));
  await act(async () => { await pending; await touchpointLoadQueue('production').flush(); });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const newRecords = JSON.parse(String(fetchMock.mock.calls[1]![1]!.body)).records;
  expect(newRecords).toHaveLength(2);
  expect(newRecords.every((record: { client_version: string }) => record.client_version === 'signed:2026.10.10')).toBe(true);
  expect(newRecords.every((record: { session_id: string }) => record.session_id === current.sessionId)).toBe(true);
  expect(newRecords.some((record: { session_id: string }) => record.session_id === old.sessionId)).toBe(false);
});

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchVelaLoginStatus } from '../../src/providers/daemon';
import { statusObservationOrder } from '../../src/providers/status-observation';

describe('AMR status issue order', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('orders answers by when their request went out, not by when it came back', async () => {
    // The whole point of ordering the authority is that answers arrive out of
    // order. If the stamp were taken on the way back it would agree with
    // arrival order and rank the stale answer highest, which is exactly the
    // ranking that lets an old signed-in read override a newer sign-out.
    let releaseFirst!: () => void;
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call += 1;
      if (call === 1) await new Promise<void>((resolve) => { releaseFirst = resolve; });
      return {
        ok: true,
        json: async () => ({ loggedIn: call === 1, loginInFlight: false, profile: 'local' }),
      };
    }));

    const first = fetchVelaLoginStatus();
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf('function'));
    const second = await fetchVelaLoginStatus();
    releaseFirst();
    const settledFirst = await first;

    expect(statusObservationOrder(settledFirst!)).toBeLessThan(
      statusObservationOrder(second!)!,
    );
  });
});

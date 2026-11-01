import { describe, expect, it, vi } from 'vitest';

import { createIdentityGatedQueue, type TelemetryIdentityState } from '../src/services/identity-gated-queue.js';

describe('identity-gated launch event queue (OPEND-4220)', () => {
  it('retains events while identity is pending and replays them in order once it exists', async () => {
    let state: TelemetryIdentityState = 'pending';
    const deliver = vi.fn(async (_item: string) => {});
    const queue = createIdentityGatedQueue<string>({ limit: 8, resolveIdentity: async () => state, deliver });

    await queue.submit('client_launch_attempt');
    expect(deliver).not.toHaveBeenCalled();
    expect(queue.size()).toBe(1);

    state = 'ready';
    await queue.submit('client_business_ready');
    await queue.submit('client_launch_result');
    expect(deliver.mock.calls.map(([item]) => item)).toEqual([
      'client_launch_attempt', 'client_business_ready', 'client_launch_result',
    ]);
    expect(queue.size()).toBe(0);
  });

  it('replays retained events on flush without a new submission', async () => {
    let state: TelemetryIdentityState = 'pending';
    const deliver = vi.fn(async (_item: string) => {});
    const queue = createIdentityGatedQueue<string>({ limit: 8, resolveIdentity: async () => state, deliver });
    await queue.submit('client_launch_attempt');
    state = 'ready';
    await queue.flush();
    expect(deliver).toHaveBeenCalledExactlyOnceWith('client_launch_attempt');
  });

  it('delivers immediately after an explicit opt-out instead of waiting forever', async () => {
    const deliver = vi.fn(async (_item: string) => {});
    const queue = createIdentityGatedQueue<string>({ limit: 8, resolveIdentity: async () => 'none', deliver });
    await queue.submit('client_launch_attempt');
    expect(deliver).toHaveBeenCalledExactlyOnceWith('client_launch_attempt');
  });

  it('bounds retention and survives identity-read and delivery failures', async () => {
    let state: TelemetryIdentityState | 'throw' = 'throw';
    const deliver = vi.fn(async (item: string) => { if (item === 'a') throw new Error('network'); });
    const queue = createIdentityGatedQueue<string>({
      limit: 2,
      resolveIdentity: async () => { if (state === 'throw') throw new Error('io'); return state; },
      deliver,
    });
    await queue.submit('a');
    await queue.submit('b');
    await queue.submit('c');
    expect(queue.size()).toBe(2);
    state = 'ready';
    await queue.flush();
    expect(deliver.mock.calls.map(([item]) => item)).toEqual(['a', 'b']);
    expect(queue.size()).toBe(0);
  });
});

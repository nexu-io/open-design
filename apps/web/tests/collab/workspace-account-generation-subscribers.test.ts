// The account generation is what every account-scoped cache keys on, so a host
// that misses a boundary keeps rendering the previous account's data. That makes
// subscriber notification worth isolating — one broken listener must not stop
// the others from hearing it — but isolation must not become silence: a host
// that never learned the boundary moved needs to leave a signal behind.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  advanceWorkspaceAccountGeneration,
  currentWorkspaceAccountGeneration,
  resetWorkspaceAccountGeneration,
  subscribeWorkspaceAccountGeneration,
} from '../../src/collab/workspace-identity';

beforeEach(() => {
  resetWorkspaceAccountGeneration();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('account-boundary subscribers', () => {
  it('notifies every subscriber even when one throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: string[] = [];
    const unsubs = [
      subscribeWorkspaceAccountGeneration(() => { seen.push('first'); }),
      subscribeWorkspaceAccountGeneration(() => { throw new Error('subscriber blew up'); }),
      subscribeWorkspaceAccountGeneration(() => { seen.push('third'); }),
    ];

    advanceWorkspaceAccountGeneration('boundary-1');

    expect(seen).toEqual(['first', 'third']);
    expect(currentWorkspaceAccountGeneration()).toBe(1);
    unsubs.forEach((u) => u());
  });

  it('reports the failure instead of swallowing it', () => {
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const boom = new Error('subscriber blew up');
    const unsub = subscribeWorkspaceAccountGeneration(() => { throw boom; });

    advanceWorkspaceAccountGeneration('boundary-1');

    expect(reported).toHaveBeenCalledWith(expect.stringContaining('subscriber failed'), boom);
    unsub();
  });

  it('does not re-notify for a repeated stamp', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let calls = 0;
    const unsub = subscribeWorkspaceAccountGeneration(() => { calls += 1; });

    advanceWorkspaceAccountGeneration('same');
    advanceWorkspaceAccountGeneration('same');

    expect(calls).toBe(1);
    unsub();
  });
});

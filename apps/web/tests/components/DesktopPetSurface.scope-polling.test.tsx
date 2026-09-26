// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listProjectRunsWithScope = vi.fn();

vi.mock('@open-design/host', () => ({ setHostPetVisible: vi.fn() }));
vi.mock('../../src/providers/daemon', () => ({
  RUNS_CHANGED_EVENT: 'od:runs-changed',
  listProjectRunsWithScope: (...args: unknown[]) => listProjectRunsWithScope(...args),
}));
vi.mock('../../src/state/projects', () => ({ listProjects: vi.fn(async () => []) }));
vi.mock('../../src/state/config', () => ({
  // A fresh object on every call, like the real localStorage-backed loader.
  loadConfig: () => ({ pet: { adopted: true, enabled: true, petId: 'mochi', custom: {} } }),
}));
vi.mock('../../src/components/pet/PetOverlay', () => ({ PetOverlay: () => null }));

import { DesktopPetSurface } from '../../src/components/pet/DesktopPetSurface';

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('DesktopPetSurface task polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listProjectRunsWithScope.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('stops polling once the daemon requires a project scope', async () => {
    listProjectRunsWithScope.mockResolvedValue({ runs: [], scopeRequired: true });
    render(<DesktopPetSurface />);
    await flush();
    expect(listProjectRunsWithScope).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 10; i++) {
      await act(async () => { vi.advanceTimersByTime(1000); });
      await flush();
    }
    expect(listProjectRunsWithScope).toHaveBeenCalledTimes(1);
  });

  it('keeps polling on the task interval, not on every config reload', async () => {
    listProjectRunsWithScope.mockResolvedValue({ runs: [], scopeRequired: false });
    render(<DesktopPetSurface />);
    await flush();

    for (let i = 0; i < 6; i++) {
      await act(async () => { vi.advanceTimersByTime(1000); });
      await flush();
    }
    // Initial read plus three 2s ticks; config reloads every 1.5s add nothing.
    expect(listProjectRunsWithScope).toHaveBeenCalledTimes(4);
  });
});

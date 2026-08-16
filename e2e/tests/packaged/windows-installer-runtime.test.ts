import { describe, expect, it, vi } from 'vitest';

import { ensureWindowsRuntimeAfterInstaller } from '../../specs/win/lib/installer-runtime.js';

describe('Windows installer runtime continuity', () => {
  it('preserves a healthy desktop instead of opening a conflicting launch transaction', async () => {
    const start = vi.fn(async () => ({ source: 'installed' as const }));
    const result = await ensureWindowsRuntimeAfterInstaller({
      inspect: async () => ({
        managedProcessPids: [4200],
        status: { pid: 4200, state: 'running' },
      }),
      start,
    });

    expect(result.start).toBeNull();
    expect(result.probe.status?.pid).toBe(4200);
    expect(start).not.toHaveBeenCalled();
  });

  it('preserves a stamped desktop while its IPC status is temporarily unavailable', async () => {
    const start = vi.fn(async () => ({ source: 'installed' as const }));
    const result = await ensureWindowsRuntimeAfterInstaller({
      inspect: async () => ({ managedProcessPids: [4200], status: null }),
      start,
    });

    expect(result.start).toBeNull();
    expect(start).not.toHaveBeenCalled();
  });

  it('starts the installed outer only when no managed desktop survived', async () => {
    const start = vi.fn(async () => ({ source: 'installed' as const }));
    const result = await ensureWindowsRuntimeAfterInstaller({
      inspect: async () => ({ managedProcessPids: [], status: null }),
      start,
    });

    expect(result.start).toEqual({ source: 'installed' });
    expect(start).toHaveBeenCalledOnce();
  });
});

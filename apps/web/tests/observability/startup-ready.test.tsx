// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getOpenDesignHost } from '@open-design/host';
import { useStartupReady } from '../../src/observability/startup-ready';
vi.mock('@open-design/host', () => ({ getOpenDesignHost: vi.fn() }));
const context = { launch_attempt_id: 'launch', app_session_id: 'session' };
const signal = vi.fn(async () => true);
let frames: Map<number, FrameRequestCallback>;
let sequence = 0;
beforeEach(() => {
  frames = new Map();
  vi.mocked(getOpenDesignHost).mockReturnValue({ startup: { context: async () => context, signal } } as never);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); signal.mockClear(); });
async function frame() {
  await act(async () => {
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(callback => callback(0));
  });
}
it('sends separate content/interactive signals with native attempt identity after data becomes usable', async () => {
  const { rerender } = renderHook(({ interactive }) => useStartupReady({ visible: true, interactive }),
    { initialProps: { interactive: false } });
  await frame();
  expect(signal).toHaveBeenCalledExactlyOnceWith({ ...context, readiness_point: 'first_visible' });
  rerender({ interactive: true });
  await frame();
  expect(signal).toHaveBeenLastCalledWith({ ...context, readiness_point: 'interactive_ready', required_data_ready: true, actions_ready: true });
});
it('waits for foreground reveal and drops an unmounted surface', async () => {
  let visibility: DocumentVisibilityState = 'hidden';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  const { unmount } = renderHook(() => useStartupReady({ visible: true, interactive: true }));
  await frame(); expect(signal).not.toHaveBeenCalled();
  visibility = 'visible';
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  unmount(); await frame();
  expect(signal).not.toHaveBeenCalled();
});
it('does nothing for old/web hosts and isolates IPC rejection', async () => {
  vi.mocked(getOpenDesignHost).mockReturnValue(null);
  const { unmount } = renderHook(() => useStartupReady({ visible: true, interactive: true }));
  await frame(); unmount();
  vi.mocked(getOpenDesignHost).mockReturnValue({ startup: { context: async () => { throw new Error('quit'); }, signal } } as never);
  renderHook(() => useStartupReady({ visible: true, interactive: true }));
  await frame(); expect(signal).not.toHaveBeenCalled();
});

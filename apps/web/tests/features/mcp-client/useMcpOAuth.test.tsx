// @vitest-environment jsdom
//
// The per-server OAuth hook against a fake `McpOAuthPort`. The fake captures the
// injected callback/poll handlers so the test can drive them directly — no
// window, no timers. Pins the initial refresh, connect (success + failure), the
// callback settle path, the poll auto-stop on connected, refresh-status, cancel
// and disconnect.
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { McpOAuthStatusResponse } from '@open-design/contracts';

import { useMcpOAuth } from '../../../src/features/mcp-client/hooks/useMcpOAuth.hooks';
import type { McpOAuthPort } from '../../../src/features/mcp-client/ports';
import type { McpOAuthCallbackResult } from '../../../src/features/mcp-client/types';

interface Harness {
  port: McpOAuthPort;
  fire: (result: McpOAuthCallbackResult) => void;
  tick: () => void;
  unsubscribeCallback: ReturnType<typeof vi.fn>;
  unsubscribePolling: ReturnType<typeof vi.fn>;
}

function makeHarness(over: Partial<McpOAuthPort> = {}, status: McpOAuthStatusResponse | null = { connected: false }): Harness {
  let onResult: (r: McpOAuthCallbackResult) => void = () => {};
  let onTick: () => void = () => {};
  const unsubscribeCallback = vi.fn();
  const unsubscribePolling = vi.fn();
  const port: McpOAuthPort = {
    fetchStatus: vi.fn(async () => status),
    start: vi.fn(async () => ({ ok: true as const, response: { authorizeUrl: 'https://auth', state: 's', redirectUri: 'r' } })),
    disconnect: vi.fn(async () => true),
    subscribeCallback: vi.fn((_sid, cb) => {
      onResult = cb;
      return unsubscribeCallback;
    }),
    subscribeStatusPolling: vi.fn((cb) => {
      onTick = cb;
      return unsubscribePolling;
    }),
    openAuthorizeUrl: vi.fn(),
    ...over,
  };
  return { port, fire: (r) => onResult(r), tick: () => onTick(), unsubscribeCallback, unsubscribePolling };
}

describe('useMcpOAuth', () => {
  it('refreshes status on mount', async () => {
    const h = makeHarness({}, { connected: true, expiresAt: 1000 });
    const { result } = renderHook(() => useMcpOAuth('srv', h.port));
    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(result.current.expiresLabel).toBe(new Date(1000).toLocaleString());
  });

  it('connect success moves to awaiting, opens the tab and starts polling', async () => {
    const h = makeHarness();
    const { result } = renderHook(() => useMcpOAuth('srv', h.port));
    await act(async () => {
      await result.current.onConnect();
    });
    expect(result.current.busy).toBe('awaiting');
    expect(result.current.pendingAuthUrl).toBe('https://auth');
    expect(result.current.isAwaiting).toBe(true);
    expect(h.port.openAuthorizeUrl).toHaveBeenCalledWith('https://auth');
    expect(h.port.subscribeStatusPolling).toHaveBeenCalled();
  });

  it('connect failure surfaces the error and stays idle', async () => {
    const h = makeHarness({ start: vi.fn(async () => ({ ok: false as const, status: 500, message: 'nope' })) });
    const { result } = renderHook(() => useMcpOAuth('srv', h.port));
    await act(async () => {
      await result.current.onConnect();
    });
    expect(result.current.busy).toBe('idle');
    expect(result.current.error).toBe('nope');
  });

  it('a success callback clears pending and settles the flow', async () => {
    const h = makeHarness();
    const { result } = renderHook(() => useMcpOAuth('srv', h.port));
    await act(async () => {
      await result.current.onConnect();
    });
    (h.port.fetchStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: true });
    await act(async () => {
      h.fire({ ok: true });
    });
    await waitFor(() => expect(result.current.busy).toBe('idle'));
    expect(result.current.pendingAuthUrl).toBeNull();
    expect(h.unsubscribePolling).toHaveBeenCalled();
  });

  it('an error callback records the message', async () => {
    const h = makeHarness();
    const { result } = renderHook(() => useMcpOAuth('srv', h.port));
    await act(async () => {
      h.fire({ ok: false, message: 'denied' });
    });
    expect(result.current.error).toBe('denied');
    expect(result.current.busy).toBe('idle');
  });

  it('a poll tick that reports connected auto-stops the flow', async () => {
    const h = makeHarness();
    const { result } = renderHook(() => useMcpOAuth('srv', h.port));
    await act(async () => {
      await result.current.onConnect();
    });
    (h.port.fetchStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: true });
    await act(async () => {
      h.tick();
    });
    await waitFor(() => expect(result.current.connected).toBe(true));
    expect(result.current.busy).toBe('idle');
  });

  it('refresh-status keeps awaiting when still not connected', async () => {
    const h = makeHarness();
    const { result } = renderHook(() => useMcpOAuth('srv', h.port));
    await act(async () => {
      await result.current.onConnect();
    });
    await act(async () => {
      await result.current.onRefreshStatus();
    });
    expect(result.current.busy).toBe('awaiting');
  });

  it('cancel clears the pending state', async () => {
    const h = makeHarness();
    const { result } = renderHook(() => useMcpOAuth('srv', h.port));
    await act(async () => {
      await result.current.onConnect();
    });
    act(() => result.current.onCancelPending());
    expect(result.current.busy).toBe('idle');
    expect(result.current.pendingAuthUrl).toBeNull();
  });

  it('disconnect success flips to not-connected; failure surfaces an error', async () => {
    const okHarness = makeHarness({}, { connected: true });
    const { result } = renderHook(() => useMcpOAuth('srv', okHarness.port));
    await waitFor(() => expect(result.current.connected).toBe(true));
    await act(async () => {
      await result.current.onDisconnect();
    });
    expect(result.current.connected).toBe(false);

    const failHarness = makeHarness({ disconnect: vi.fn(async () => false) }, { connected: true });
    const { result: r2 } = renderHook(() => useMcpOAuth('srv', failHarness.port));
    await waitFor(() => expect(r2.current.connected).toBe(true));
    await act(async () => {
      await r2.current.onDisconnect();
    });
    expect(r2.current.error).toMatch(/Disconnect failed/);
  });
});

// @vitest-environment jsdom
//
// Browser-side OAuth bridge: the popup-callback subscription (window `message`
// filtering by type + serverId), the status-poll timer (fixed interval, 5-min
// self-stop, unsubscribe), and the best-effort authorize-tab opener. These are
// the DOM-touching pieces the slice reaches only through the injected port.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  openMcpAuthorizeUrl,
  subscribeMcpOAuthCallback,
  subscribeMcpOAuthStatusPolling,
} from '../../../src/providers/mcp/oauth-bridge';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function postMessage(data: unknown): void {
  window.dispatchEvent(new MessageEvent('message', { data }));
}

describe('subscribeMcpOAuthCallback', () => {
  it('invokes onResult for a matching success message and stops after unsubscribe', () => {
    const onResult = vi.fn();
    const unsubscribe = subscribeMcpOAuthCallback('srv', onResult);
    postMessage({ type: 'mcp-oauth', ok: true, serverId: 'srv' });
    expect(onResult).toHaveBeenCalledWith({ ok: true, message: undefined });
    unsubscribe();
    postMessage({ type: 'mcp-oauth', ok: true, serverId: 'srv' });
    expect(onResult).toHaveBeenCalledTimes(1);
  });
  it('passes an error message through and treats an absent serverId as a match', () => {
    const onResult = vi.fn();
    subscribeMcpOAuthCallback('srv', onResult);
    postMessage({ type: 'mcp-oauth', ok: false, message: 'denied' });
    expect(onResult).toHaveBeenCalledWith({ ok: false, message: 'denied' });
  });
  it('ignores other server ids, other message types and non-objects', () => {
    const onResult = vi.fn();
    subscribeMcpOAuthCallback('srv', onResult);
    postMessage({ type: 'mcp-oauth', ok: true, serverId: 'other' });
    postMessage({ type: 'something-else', ok: true });
    postMessage(null);
    postMessage('a string');
    expect(onResult).not.toHaveBeenCalled();
  });
});

describe('subscribeMcpOAuthStatusPolling', () => {
  it('ticks on the interval and self-stops at the 5-minute cap', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    subscribeMcpOAuthStatusPolling(onTick);
    vi.advanceTimersByTime(2_000);
    expect(onTick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5 * 60 * 1_000);
    const atCap = onTick.mock.calls.length;
    vi.advanceTimersByTime(60_000);
    expect(onTick.mock.calls.length).toBe(atCap); // stopped, no further ticks
  });
  it('unsubscribe stops future ticks', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const stop = subscribeMcpOAuthStatusPolling(onTick);
    stop();
    vi.advanceTimersByTime(10_000);
    expect(onTick).not.toHaveBeenCalled();
  });
});

describe('openMcpAuthorizeUrl', () => {
  it('delegates to window.open and swallows a throwing opener', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    openMcpAuthorizeUrl('https://auth');
    expect(open).toHaveBeenCalledWith('https://auth', '_blank', 'noopener=no,noreferrer=no');
    open.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => openMcpAuthorizeUrl('https://auth')).not.toThrow();
  });
});

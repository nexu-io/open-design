// @vitest-environment jsdom
//
// The connector-auth bridge owns the OAuth flow's browser touch points: the
// trusted-origin check, the pending-auth sessionStorage round-trip, and the two
// window subscriptions (popup callback + status poll). These pin every branch
// including the malformed-JSON / bad-URL catch paths and the untrusted-origin
// rejection.
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isTrustedConnectorCallbackOrigin,
  readPendingConnectorAuthIds,
  writePendingConnectorAuthIds,
  subscribeConnectorCallback,
  subscribeConnectorStatusPolling,
} from '../../../src/providers/memory/connector-auth';
import { CONNECTOR_CALLBACK_MESSAGE_TYPE } from '../../../src/components/connectors-events';

const KEY = 'od:memory:pending-connector-auth';

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('isTrustedConnectorCallbackOrigin', () => {
  it('trusts the current window origin', () => {
    expect(isTrustedConnectorCallbackOrigin(window.location.origin)).toBe(true);
  });

  it('trusts loopback hosts on http(s)', () => {
    expect(isTrustedConnectorCallbackOrigin('http://localhost:9999')).toBe(true);
    expect(isTrustedConnectorCallbackOrigin('http://127.0.0.1:8080')).toBe(true);
    expect(isTrustedConnectorCallbackOrigin('http://[::1]:8080')).toBe(true);
  });

  it('rejects non-loopback https origins', () => {
    expect(isTrustedConnectorCallbackOrigin('https://evil.example.com')).toBe(false);
  });

  it('rejects non-http(s) protocols', () => {
    expect(isTrustedConnectorCallbackOrigin('ftp://localhost')).toBe(false);
  });

  it('rejects an unparseable origin (catch path)', () => {
    expect(isTrustedConnectorCallbackOrigin('not a url')).toBe(false);
  });
});

describe('pending-auth sessionStorage round-trip', () => {
  it('reads back a written set and clears it when empty', () => {
    writePendingConnectorAuthIds(new Set(['notion', 'figma']));
    expect(readPendingConnectorAuthIds()).toEqual(new Set(['notion', 'figma']));
    writePendingConnectorAuthIds(new Set());
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(readPendingConnectorAuthIds()).toEqual(new Set());
  });

  it('drops non-string / blank entries and returns empty on malformed JSON', () => {
    window.sessionStorage.setItem(KEY, JSON.stringify(['ok', '', 3, null]));
    expect(readPendingConnectorAuthIds()).toEqual(new Set(['ok']));
    window.sessionStorage.setItem(KEY, JSON.stringify({ not: 'an array' }));
    expect(readPendingConnectorAuthIds()).toEqual(new Set());
    window.sessionStorage.setItem(KEY, '{not json');
    expect(readPendingConnectorAuthIds()).toEqual(new Set());
  });
});

describe('subscribeConnectorCallback', () => {
  function post(data: unknown, origin = window.location.origin) {
    window.dispatchEvent(new MessageEvent('message', { data, origin }));
  }

  it('invokes the callback for a trusted, well-typed message and unsubscribes cleanly', () => {
    const onCallback = vi.fn();
    const unsubscribe = subscribeConnectorCallback(onCallback);

    post({ type: CONNECTOR_CALLBACK_MESSAGE_TYPE });
    expect(onCallback).toHaveBeenCalledTimes(1);

    // Wrong message type, non-object payload, and untrusted origin are ignored.
    post({ type: 'something-else' });
    post('a string');
    post({ type: CONNECTOR_CALLBACK_MESSAGE_TYPE }, 'https://evil.example.com');
    expect(onCallback).toHaveBeenCalledTimes(1);

    unsubscribe();
    post({ type: CONNECTOR_CALLBACK_MESSAGE_TYPE });
    expect(onCallback).toHaveBeenCalledTimes(1);
  });
});

describe('subscribeConnectorStatusPolling', () => {
  it('ticks on the interval and on window focus, then tears both down', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const unsubscribe = subscribeConnectorStatusPolling(onTick);

    vi.advanceTimersByTime(2_000);
    expect(onTick).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('focus'));
    expect(onTick).toHaveBeenCalledTimes(2);

    unsubscribe();
    vi.advanceTimersByTime(4_000);
    window.dispatchEvent(new Event('focus'));
    expect(onTick).toHaveBeenCalledTimes(2);
  });
});

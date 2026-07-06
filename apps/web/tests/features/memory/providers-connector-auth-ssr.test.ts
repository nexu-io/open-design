// @vitest-environment node
//
// The connector-auth bridge guards every browser touch point with
// `typeof window === 'undefined'` so it degrades safely under SSR / non-DOM
// runtimes. Those guards are unreachable under jsdom, so this companion suite
// runs in the `node` environment (no `window`) to exercise the SSR fallbacks for
// real — the sessionStorage/subscription round-trips live in the jsdom suite.
import { describe, expect, it, vi } from 'vitest';

import {
  isTrustedConnectorCallbackOrigin,
  readPendingConnectorAuthIds,
  writePendingConnectorAuthIds,
  subscribeConnectorCallback,
  subscribeConnectorStatusPolling,
} from '../../../src/providers/memory/connector-auth';

describe('connector-auth SSR fallbacks (no window)', () => {
  it('has no window in this environment', () => {
    expect(typeof window).toBe('undefined');
  });

  it('treats loopback origins as trusted with an empty expected origin', () => {
    // window is absent → expectedOrigin resolves to '' and the URL check runs.
    expect(isTrustedConnectorCallbackOrigin('http://localhost:3000')).toBe(true);
    expect(isTrustedConnectorCallbackOrigin('https://evil.example.com')).toBe(false);
  });

  it('reads an empty pending set and no-ops on write', () => {
    expect(readPendingConnectorAuthIds()).toEqual(new Set());
    // No sessionStorage to touch — this must simply return without throwing.
    expect(() => writePendingConnectorAuthIds(new Set(['notion']))).not.toThrow();
  });

  it('returns inert unsubscribers for both subscriptions', () => {
    const onCallback = vi.fn();
    const onTick = vi.fn();
    const unCb = subscribeConnectorCallback(onCallback);
    const unPoll = subscribeConnectorStatusPolling(onTick);
    // Nothing subscribed (no window), so tearing down is a safe no-op.
    expect(() => {
      unCb();
      unPoll();
    }).not.toThrow();
    expect(onCallback).not.toHaveBeenCalled();
    expect(onTick).not.toHaveBeenCalled();
  });
});

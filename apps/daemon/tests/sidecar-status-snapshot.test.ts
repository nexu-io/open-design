import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DaemonStatusSnapshot } from '@open-design/sidecar-proto';

import { resetDesktopAuthForTests, setDesktopAuthSecret } from '../src/server.js';
import { withCurrentDesktopAuthGate } from '../src/sidecar/server.js';

/**
 * PR #974 round 6 (mrcfps): tools-dev's split-start hardening reads
 * `desktopAuthGateActive` from the daemon's STATUS IPC. The wiring
 * is `withCurrentDesktopAuthGate(state)` which overlays the live
 * `isDesktopAuthGateActive()` flag on the cached startup snapshot.
 *
 * These tests pin the contract: the field MUST reflect the current
 * gate state at every snapshot read (not the value cached when the
 * sidecar booted), because the flag flips after the first
 * `REGISTER_DESKTOP_AUTH` IPC and stays sticky for the daemon's
 * lifetime. A regression that caches the flag in `state` would
 * silently break tools-dev's restart-on-ungated-daemon detection.
 *
 * @see apps/daemon/src/sidecar/server.ts
 * @see tools/dev/src/desktop-auth-gate.ts
 */
describe('withCurrentDesktopAuthGate', () => {
  // The startup snapshot mirrors what `startDaemonSidecar` builds at
  // boot — see apps/daemon/src/sidecar/server.ts. Field values other
  // than `desktopAuthGateActive` are arbitrary; the helper passes
  // them through verbatim, so we use stable fixtures.
  const baseSnapshot: DaemonStatusSnapshot = {
    desktopAuthGateActive: false,
    pid: 12345,
    state: 'running',
    updatedAt: '2026-05-09T03:00:00.000Z',
    url: 'http://127.0.0.1:7456',
  };

  beforeEach(() => {
    resetDesktopAuthForTests();
  });

  afterEach(() => {
    // Belt-and-braces: the gate flag is process-global; clear before any
    // other suite reads it (see desktop-import-token-gate.test.ts:53-60).
    resetDesktopAuthForTests();
  });

  it('reports gate inactive when no secret has ever been registered (web-only mode)', () => {
    const result = withCurrentDesktopAuthGate(baseSnapshot);
    expect(result.desktopAuthGateActive).toBe(false);
    // Other fields pass through verbatim.
    expect(result.url).toBe('http://127.0.0.1:7456');
    expect(result.pid).toBe(12345);
    expect(result.state).toBe('running');
  });

  it('reports gate active immediately after the desktop registers a secret', () => {
    setDesktopAuthSecret(randomBytes(32));
    const result = withCurrentDesktopAuthGate(baseSnapshot);
    expect(result.desktopAuthGateActive).toBe(true);
  });

  it('keeps reporting gate active after the secret is cleared (sticky once-set)', () => {
    // The daemon uses a sticky flag so production code can never
    // silently relax the gate — see server.ts setDesktopAuthSecret.
    // The STATUS snapshot must reflect that stickiness so tools-dev
    // does NOT trigger an unnecessary restart after a transient
    // null-clear (e.g., between test runs in the same process).
    setDesktopAuthSecret(randomBytes(32));
    setDesktopAuthSecret(null);
    const result = withCurrentDesktopAuthGate(baseSnapshot);
    expect(result.desktopAuthGateActive).toBe(true);
  });

  it('overlays the LIVE flag value, ignoring whatever the input snapshot carries', () => {
    // If a caller hands in a stale snapshot whose
    // `desktopAuthGateActive: true` was captured before a daemon
    // restart, the helper must override with the current value.
    // (In the production wiring `state` is captured once at boot and
    // never mutated, so this branch protects against future refactors
    // that try to re-cache the flag in `state`.)
    const stale: DaemonStatusSnapshot = { ...baseSnapshot, desktopAuthGateActive: true };
    const result = withCurrentDesktopAuthGate(stale);
    expect(result.desktopAuthGateActive).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  amrAuthErrorDetail,
  beginAmrAuthTracking,
  resolveAmrAuthTracking,
} from '../../src/analytics/amr-auth';

/**
 * `amr_auth_result` reports 615 failures across 395 devices in 24h (+65%),
 * heavily concentrated in 0.15.1 — and carries only three fixed error_code
 * tokens. `spawn_failed` in particular covers every way the login start can be
 * refused: a missing vela binary, an unregistered runtime def, and the
 * upstream's own `502: Invalid IP address: undefined` all report the same
 * token, even though the daemon's HTTP status and the CLI's stderr are live
 * variables at the call site.
 *
 * These pin that the detail survives, and that it is scrubbed on the way out —
 * the text is process stderr, which can carry a home directory.
 */
describe('amrAuthErrorDetail', () => {
  it('drops empty detail rather than sending a blank field', () => {
    expect(amrAuthErrorDetail(undefined)).toBeUndefined();
    expect(amrAuthErrorDetail(null)).toBeUndefined();
    expect(amrAuthErrorDetail('   ')).toBeUndefined();
  });

  it('keeps the upstream failure text that distinguishes the causes', () => {
    expect(amrAuthErrorDetail('502: Invalid IP address: undefined')).toBe(
      '502: Invalid IP address: undefined',
    );
    expect(amrAuthErrorDetail('vela binary not found; install vela or configure VELA_BIN')).toBe(
      'vela binary not found; install vela or configure VELA_BIN',
    );
  });

  it('scrubs the user home directory out of CLI stderr', () => {
    expect(amrAuthErrorDetail('EACCES: permission denied, open /Users/lefarcen/.amr/config.json'))
      .toBe('EACCES: permission denied, open /Users/<redacted>/.amr/config.json');
    expect(amrAuthErrorDetail('cannot write C:\\Users\\John Doe\\AppData\\vela.log')).toBe(
      'cannot write C:\\Users\\<redacted>\\AppData\\vela.log',
    );
  });

  it('caps a runaway stderr dump', () => {
    const detail = amrAuthErrorDetail('x'.repeat(5000));
    expect(detail!.length).toBeLessThanOrEqual(301);
  });
});

describe('resolveAmrAuthTracking failure detail', () => {
  it('attaches the daemon status and stderr to a refused login start', () => {
    const track = vi.fn();
    beginAmrAuthTracking(null);
    resolveAmrAuthTracking(track, 'failed', 'spawn_failed', {
      errorStatus: 500,
      errorDetail: 'vela login exited before authentication completed (code 1, signal null)',
    });

    expect(track).toHaveBeenCalledTimes(1);
    const props = track.mock.calls[0]![1] as Record<string, unknown>;
    expect(props.error_code).toBe('spawn_failed');
    expect(props.error_status).toBe(500);
    expect(props.error_detail).toContain('exited before authentication completed');
  });

  it('records a status of 0 — a request that never got a response is not the same as 500', () => {
    const track = vi.fn();
    beginAmrAuthTracking(null);
    resolveAmrAuthTracking(track, 'failed', 'spawn_failed', {
      errorStatus: 0,
      errorDetail: 'Failed to fetch',
    });

    const props = track.mock.calls[0]![1] as Record<string, unknown>;
    expect(props.error_status).toBe(0);
  });

  it('omits the fields entirely when there is nothing to report', () => {
    const track = vi.fn();
    beginAmrAuthTracking(null);
    resolveAmrAuthTracking(track, 'cancelled');

    const props = track.mock.calls[0]![1] as Record<string, unknown>;
    expect('error_status' in props).toBe(false);
    expect('error_detail' in props).toBe(false);
  });
});

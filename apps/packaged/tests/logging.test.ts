/**
 * Regression coverage for the harmless-socket-option filter the
 * packaged Electron entry uses to swallow `setTypeOfService EINVAL`
 * undici crashes (issue #895). Without the filter, those errors
 * surface as native "JavaScript error in main process" dialogs the
 * moment a renderer fetch hits the affected socket option setter on
 * macOS / VPN configurations that don't allow IP_TOS marking.
 *
 * Match strategy is intentionally narrow — name the syscall AND
 * verify the EINVAL code — so a future regression that broadens the
 * filter to "every EINVAL" (which would silently swallow real bugs)
 * trips a test.
 *
 * @see https://github.com/nexu-io/open-design/issues/895
 */

import { describe, expect, it } from 'vitest';

import { isHarmlessSocketOptionError } from '../src/logging.js';

describe('isHarmlessSocketOptionError (issue #895)', () => {
  it('matches the canonical undici setTypeOfService EINVAL shape', () => {
    const error = new Error('setTypeOfService EINVAL') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    error.syscall = 'setTypeOfService';
    expect(isHarmlessSocketOptionError(error)).toBe(true);
  });

  it('matches when only the message has both tokens (no code property set)', () => {
    // Some libuv builds surface the error without populating the
    // `code` property — the message string itself is the sole signal.
    const error = new Error('setTypeOfService EINVAL');
    expect(isHarmlessSocketOptionError(error)).toBe(true);
  });

  it('matches when code is EINVAL and message references setTypeOfService', () => {
    const error = new Error('Error: setTypeOfService failed') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    expect(isHarmlessSocketOptionError(error)).toBe(true);
  });

  it('does NOT match a generic EINVAL — that code is also raised by real bugs', () => {
    // Guard against a future refactor that broadens the filter to
    // "every EINVAL" and silently swallows configuration errors.
    const error = new Error('write EINVAL') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    expect(isHarmlessSocketOptionError(error)).toBe(false);
  });

  it('does NOT match a setTypeOfService error with a different errno (e.g. EACCES)', () => {
    const error = new Error('setTypeOfService EACCES') as NodeJS.ErrnoException;
    error.code = 'EACCES';
    expect(isHarmlessSocketOptionError(error)).toBe(false);
  });

  it('does NOT match unrelated errors with similar shape', () => {
    const error = new Error('something happened');
    expect(isHarmlessSocketOptionError(error)).toBe(false);
  });

  it('does NOT match non-Error rejection values (preserves fail-fast for primitives)', () => {
    expect(isHarmlessSocketOptionError('setTypeOfService EINVAL')).toBe(false);
    expect(isHarmlessSocketOptionError(null)).toBe(false);
    expect(isHarmlessSocketOptionError(undefined)).toBe(false);
    expect(isHarmlessSocketOptionError({ message: 'setTypeOfService EINVAL' })).toBe(false);
  });

  it('does NOT match Error with empty message even if code is EINVAL', () => {
    const error = new Error('') as NodeJS.ErrnoException;
    error.code = 'EINVAL';
    expect(isHarmlessSocketOptionError(error)).toBe(false);
  });
});

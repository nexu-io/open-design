import { describe, expect, it } from 'vitest';

import { isAuthorizationShapedVelaError } from '../src/routes/vela.js';

function execLikeError(overrides: Record<string, unknown>): Error {
  return Object.assign(
    new Error(`Command failed: /home/user/vela-403/bin/vela billing summary --format json`),
    overrides,
  );
}

describe('isAuthorizationShapedVelaError', () => {
  it('does not classify a non-auth failure as authorization just because the binary path contains 403', () => {
    const err = execLikeError({ code: 2, stderr: 'usage error: unknown flag --format' });
    expect(isAuthorizationShapedVelaError(err)).toBe(false);
  });

  it('matches an authorization denial reported on stderr', () => {
    const err = execLikeError({ code: 1, stderr: 'error: 403 Forbidden — billing not available for trial accounts' });
    expect(isAuthorizationShapedVelaError(err)).toBe(true);
  });

  it('matches output appended after the Command failed line when no stderr/stdout fields exist', () => {
    const err = new Error('Command failed: /opt/vela billing summary\n401 Unauthorized');
    expect(isAuthorizationShapedVelaError(err)).toBe(true);
  });

  it('ignores the bare command line when there is no failure output', () => {
    const err = new Error('Command failed: /home/user/vela-403/bin/vela billing summary');
    expect(isAuthorizationShapedVelaError(err)).toBe(false);
  });
});

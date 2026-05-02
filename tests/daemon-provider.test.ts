import { describe, expect, it } from 'vitest';

import { formatAgentExitError } from '../src/providers/daemon';

describe('formatAgentExitError', () => {
  it('replaces HTML challenge stderr with an actionable agent message', () => {
    const error = formatAgentExitError(
      1,
      '<html><head><title>Just a moment...</title></head><script>window._cf_chl_opt={}</script></html>',
    );

    expect(error).toContain('agent exited with code 1');
    expect(error).toContain('HTML security/challenge page');
    expect(error).toContain('refresh authentication');
    expect(error).not.toContain('_cf_chl');
    expect(error).not.toContain('<script>');
  });

  it('keeps normal stderr tails for local CLI failures', () => {
    const error = formatAgentExitError(2, 'fatal: model is not available');

    expect(error).toBe('agent exited with code 2\nfatal: model is not available');
  });
});

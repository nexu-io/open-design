import { describe, expect, it } from 'vitest';

import { buildContinueInCliToast } from '../../src/lib/build-continue-in-cli-toast';

describe('buildContinueInCliToast', () => {
  it('prefixes every success path with clipboard confirmation', () => {
    expect(
      buildContinueInCliToast('/work/acme', { kind: 'electron', ok: true }),
    ).toEqual({
      message:
        'Copied to clipboard. Folder opened. Run `claude` in your terminal here and paste the prompt.',
      details: null,
    });

    expect(
      buildContinueInCliToast('/work/acme', { kind: 'electron', ok: false }),
    ).toEqual({
      message:
        "Copied to clipboard. Couldn't open the folder. Open your terminal at /work/acme, run `claude`, and paste the prompt.",
      details: null,
    });

    expect(
      buildContinueInCliToast('/work/acme', { kind: 'web-fallback', ok: true }),
    ).toEqual({
      message:
        'Copied to clipboard. Open your terminal at /work/acme, run `claude`, and paste the prompt.',
      details: null,
    });
  });
});

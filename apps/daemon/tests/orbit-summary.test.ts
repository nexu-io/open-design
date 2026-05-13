import { describe, expect, it } from 'vitest';

import { formatOrbitCompletionSummary } from '../src/orbit-summary.js';

describe('formatOrbitCompletionSummary', () => {
  it('prefers the artifact title when a live artifact was registered', () => {
    expect(
      formatOrbitCompletionSummary({
        status: 'succeeded',
        artifactTitle: 'Daily digest',
        assistantMessage: 'ignored',
      }),
    ).toBe('Agent succeeded and registered live artifact Daily digest.');
  });

  it('appends a compact assistant-message excerpt when no artifact was registered', () => {
    expect(
      formatOrbitCompletionSummary({
        status: 'failed',
        assistantMessage: 'Data loading failed, so I did not create a daily digest artifact.\n\nGitHub auth expired.',
      }),
    ).toBe(
      'Agent failed but did not register a live artifact for this Orbit run: Data loading failed, so I did not create a daily digest artifact.',
    );
  });

  it('falls back to the generic no-artifact summary when there is no assistant message', () => {
    expect(
      formatOrbitCompletionSummary({
        status: 'failed',
      }),
    ).toBe('Agent failed but did not register a live artifact for this Orbit run.');
  });
});

import { describe, expect, it } from 'vitest';

import { isAbortedOperationError } from '../src/integrations/aborted-error.js';

// A cancelled `vela` child is NOT a failure. The proactive team-pull scheduler
// aborts in-flight pulls on purpose in two places
// (`collab/proactive-content-pull.ts`):
//
//   - `mergeIntentUpdate` aborts the current pull the moment a HIGHER version
//     arrives, so the newer content is fetched instead of the stale one;
//   - `clearIntent` aborts when the intent is superseded or already satisfied.
//
// `runVelaCommand` marks exactly this case with `name: 'AbortError'` and
// `code: 'ABORT_ERR'` (and keeps a separate `reason: 'timeout'` path for real
// deadline breaches). Nothing downstream ever read those markers, so every
// deliberate cancellation surfaced as `[od] authorized proactive team pull
// failed closed:` — observed live while investigating a first-open trace, where
// it sent the investigation after a phantom failure.
//
// This predicate is the seam the pull path uses to tell the two apart. It must
// never classify a real timeout or transport failure as a cancellation, or a
// genuine fault would be silently swallowed.
describe('isAbortedOperationError', () => {
  it('recognizes a deliberately aborted vela command', () => {
    const error = new Error('vela command aborted', {
      cause: 'This operation was aborted',
    });
    error.name = 'AbortError';
    Object.assign(error, { code: 'ABORT_ERR' });

    expect(isAbortedOperationError(error)).toBe(true);
  });

  it('recognizes an abort identified only by its code', () => {
    // DOMException-shaped aborts from other layers carry the code but may not
    // preserve the name across a structured clone.
    const error = Object.assign(new Error('aborted'), { code: 'ABORT_ERR' });
    expect(isAbortedOperationError(error)).toBe(true);
  });

  it('does NOT treat a timeout as a cancellation', () => {
    // `runVelaCommand`'s other termination reason. This is a real failure and
    // must keep reaching the failure logging + retry accounting.
    const error = new Error('vela command timed out after 30000ms');
    error.name = 'TimeoutError';
    expect(isAbortedOperationError(error)).toBe(false);
  });

  it('does NOT treat a transport failure as a cancellation', () => {
    // The shape seen from the vela CLI itself when the API is unreachable.
    const error = new Error(
      'list team projects: context deadline exceeded (Client.Timeout exceeded while awaiting headers)',
    );
    expect(isAbortedOperationError(error)).toBe(false);
  });

  it('does NOT treat an arbitrary rejection as a cancellation', () => {
    expect(isAbortedOperationError(new Error('boom'))).toBe(false);
    expect(isAbortedOperationError('aborted')).toBe(false);
    expect(isAbortedOperationError(null)).toBe(false);
    expect(isAbortedOperationError(undefined)).toBe(false);
  });
});

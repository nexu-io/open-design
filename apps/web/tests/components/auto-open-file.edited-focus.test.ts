import { describe, expect, it } from 'vitest';
import { decideAgentFocusOpen } from '../../src/components/auto-open-file';

// OPEND-2950 actual two-turn case: same index is successfully edited this turn;
// reference/light-paper.html is the newly-created backup, not the primary output.
// The new proof input is deliberately passed as a structural object. The existing
// helper can accept it before implementation, so baseline failure is behavioral.
function focusInput(touched: readonly string[], userTookOverPreview = false) {
  return {
    declaredPath: 'index.html',
    projectFiles: [
      { name: 'index.html', path: 'index.html', type: 'file' as const, size: 512, mtime: 2000, kind: 'html', mime: 'text/html' },
      { name: 'reference/light-paper.html', path: 'reference/light-paper.html', type: 'file' as const, size: 512, mtime: 2001, kind: 'html', mime: 'text/html' },
    ],
    preTurnFileNames: new Set(['index.html']),
    agentTouchedFileNames: new Set(touched),
    userTookOverPreview,
  };
}

describe('explicit focus for a proven current-turn edit', () => {
  it('opens the explicitly declared existing HTML after a proven successful edit', () => {
    expect(decideAgentFocusOpen(focusInput(['index.html', 'reference/light-paper.html'])))
      .toEqual({ shouldOpen: true, fileName: 'index.html' });
  });

  it('does not grant permission to an untouched existing file merely because it is declared', () => {
    expect(decideAgentFocusOpen(focusInput(['reference/light-paper.html'])))
      .toEqual({ shouldOpen: false, fileName: null });
  });

  it('still preserves a user takeover even when the declared existing file was edited', () => {
    expect(decideAgentFocusOpen(focusInput(['index.html'], true)))
      .toEqual({ shouldOpen: false, fileName: null });
  });
});

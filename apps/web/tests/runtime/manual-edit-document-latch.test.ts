import { describe, expect, it } from 'vitest';

import { shouldAdoptPersistedManualEditDocument } from '../../src/runtime/manual-edit-document-latch';

const base = {
  manualEditMode: false,
  manualEditSrcDocActive: false,
  latch: { sourceFingerprint: 'fp-1', reloadKey: 7 },
  reloadKey: 7,
  sourceFingerprint: 'fp-1',
};

describe('keeping the live document after Manual Edit closes', () => {
  // The case the defect broke: edit closed, bridge already applied the saved
  // bytes, so the watcher echo must not replace the document.
  it('adopts the live document when the bridge already applied the saved source', () => {
    expect(shouldAdoptPersistedManualEditDocument(base)).toBe(true);
  });

  // Without a latch there is nothing proving the DOM matches, so the ordinary
  // replacement path is correct. This is exactly the state the exit path used
  // to force by clearing the latch a step too early.
  it('replaces the document when no proof survives the exit', () => {
    expect(shouldAdoptPersistedManualEditDocument({ ...base, latch: null })).toBe(false);
  });

  it('never adopts while edit is still open', () => {
    expect(shouldAdoptPersistedManualEditDocument({ ...base, manualEditMode: true })).toBe(false);
    expect(shouldAdoptPersistedManualEditDocument({ ...base, manualEditSrcDocActive: true })).toBe(false);
  });

  // The self-release. A source the bridge did not put there must take the
  // ordinary path, or the latch could pin a stale document indefinitely.
  it('releases itself when the source is genuinely different', () => {
    expect(shouldAdoptPersistedManualEditDocument({ ...base, sourceFingerprint: 'fp-2' })).toBe(false);
  });

  it('does not survive a reload the user asked for', () => {
    expect(shouldAdoptPersistedManualEditDocument({ ...base, reloadKey: 8 })).toBe(false);
  });

  it('needs a source to compare against', () => {
    expect(shouldAdoptPersistedManualEditDocument({ ...base, sourceFingerprint: null })).toBe(false);
  });
});

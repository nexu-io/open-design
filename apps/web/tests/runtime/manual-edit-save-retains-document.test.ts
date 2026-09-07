import { describe, expect, it } from 'vitest';

import {
  manualEditPatchStreamsIntoLiveDocument,
  manualEditSaveRetainsPreviewDocument,
} from '../../src/runtime/manual-edit-document-latch';

/**
 * These two decide whether the pre-write scroll snapshot is taken, and the
 * point of splitting them out is that the decision stopped being a property of
 * the patch kind. The table below is the whole claim: `set-style` — the one
 * kind the old code skipped unconditionally — answers differently depending on
 * whether the session still has a freeze to offer.
 *
 * The asymmetry is deliberate and worth stating. A snapshot taken when it was
 * not needed costs one round trip of up to 120ms in front of the write. A
 * snapshot skipped when it was needed loses the user's scroll position with
 * nothing to recover it from. Retention is therefore claimed only where it is
 * certain.
 */
describe('manualEditPatchStreamsIntoLiveDocument', () => {
  it('is true only for the kind applied to the live DOM without a rebuild', () => {
    expect(manualEditPatchStreamsIntoLiveDocument('set-style')).toBe(true);
    for (const kind of [
      'set-text',
      'set-link',
      'set-image',
      'remove-element',
      'set-outer-html',
      'set-token',
      'set-attributes',
      'set-full-source',
    ]) {
      expect(manualEditPatchStreamsIntoLiveDocument(kind)).toBe(false);
    }
  });
});

describe('manualEditSaveRetainsPreviewDocument', () => {
  it('retains a streaming patch while the session freeze still holds', () => {
    expect(manualEditSaveRetainsPreviewDocument({
      liveDocumentDiverged: false,
      manualEditSessionActive: true,
      patchStreamsIntoLiveDocument: true,
    })).toBe(true);
  });

  it('does not retain the same patch once the session has diverged', () => {
    // The regression this whole change is about: the freeze is gone, so the
    // style save replaces the document like any other and the scroll must be
    // captured first.
    expect(manualEditSaveRetainsPreviewDocument({
      liveDocumentDiverged: true,
      manualEditSessionActive: true,
      patchStreamsIntoLiveDocument: true,
    })).toBe(false);
  });

  it('does not retain a patch that depends on the document coming back', () => {
    expect(manualEditSaveRetainsPreviewDocument({
      liveDocumentDiverged: false,
      manualEditSessionActive: true,
      patchStreamsIntoLiveDocument: false,
    })).toBe(false);
  });

  it('retains nothing outside a Manual Edit session', () => {
    // Nothing pins the document there at all; the write's watcher echo mints a
    // new revision and replaces it.
    expect(manualEditSaveRetainsPreviewDocument({
      liveDocumentDiverged: false,
      manualEditSessionActive: false,
      patchStreamsIntoLiveDocument: true,
    })).toBe(false);
  });
});

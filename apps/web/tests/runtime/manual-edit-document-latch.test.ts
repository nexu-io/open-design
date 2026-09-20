import { describe, expect, it } from 'vitest';

import {
  canArmPersistedManualEditDocument,
  shouldAdoptPersistedManualEditDocument,
  shouldFreezeManualEditDocumentIdentity,
} from '../../src/runtime/manual-edit-document-latch';

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

describe('arming the latch after a save', () => {
  it('arms when the bridge carried the persisted bytes into the document', () => {
    expect(canArmPersistedManualEditDocument({
      patchMirroredToLiveDocument: true,
      liveDocumentDiverged: false,
    })).toBe(true);
  });

  it('does not arm on a patch that never reached the document', () => {
    expect(canArmPersistedManualEditDocument({
      patchMirroredToLiveDocument: false,
      liveDocumentDiverged: false,
    })).toBe(false);
  });

  // The defect: the latch is decided from ONE patch and fingerprints the WHOLE
  // file, so a mirrored save would otherwise vouch for a document an earlier
  // unmirrored save in the same session never reached. Divergence is sticky
  // precisely so this cannot happen.
  it('never re-arms after an earlier save in the session was not mirrored', () => {
    expect(canArmPersistedManualEditDocument({
      patchMirroredToLiveDocument: true,
      liveDocumentDiverged: true,
    })).toBe(false);
  });
});

describe('freezing the preview document identity during Manual Edit', () => {
  const frozen = {
    manualEditMode: true,
    manualEditSrcDocActive: false,
    canAdoptPersistedDocument: false,
    liveDocumentDiverged: false,
  };

  it('freezes while Edit is open so a save echo cannot replace the document', () => {
    expect(shouldFreezeManualEditDocumentIdentity(frozen)).toBe(true);
    expect(shouldFreezeManualEditDocumentIdentity({
      ...frozen,
      manualEditMode: false,
      manualEditSrcDocActive: true,
    })).toBe(true);
    expect(shouldFreezeManualEditDocumentIdentity({
      ...frozen,
      manualEditMode: false,
      canAdoptPersistedDocument: true,
    })).toBe(true);
  });

  it('does not freeze an ordinary document', () => {
    expect(shouldFreezeManualEditDocumentIdentity({
      ...frozen,
      manualEditMode: false,
    })).toBe(false);
  });

  // The defect: the freeze is only justified while the bridge stands in for
  // the reload. A save it could not carry leaves nothing keeping the document
  // current, so freezing it pins a stale document and the save looks like a
  // no-op.
  it('lifts once a save could not be mirrored, even with Edit still open', () => {
    expect(shouldFreezeManualEditDocumentIdentity({
      ...frozen,
      liveDocumentDiverged: true,
    })).toBe(false);
    expect(shouldFreezeManualEditDocumentIdentity({
      ...frozen,
      manualEditMode: false,
      canAdoptPersistedDocument: true,
      liveDocumentDiverged: true,
    })).toBe(false);
  });
});

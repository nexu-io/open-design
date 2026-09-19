/**
 * Whether the document already on screen can be kept after Manual Edit closes.
 *
 * Saving from Manual Edit writes the file, and the watcher echo that follows
 * looks exactly like any other content change — new size, new mtime, a new
 * content-refresh key — which mints a new preview scope and replaces the
 * browsing context. That is the right answer for an edit made anywhere else,
 * and the wrong one here: the Manual Edit bridge has already applied the exact
 * persisted bytes to the live document, so the replacement re-renders what is
 * already on screen and throws away everything the page was holding — canvas
 * pixels, timers, scroll, form state.
 *
 * The latch is the proof that the live DOM equals the saved source. It is set
 * only after the bridge confirms the apply, and it releases itself as soon as
 * the source genuinely differs, so it can never pin a stale document.
 *
 * Its fingerprint is taken from the bytes written to disk, so every consumer
 * must compare it against the persisted source and never against a source
 * derived for rendering. Deck visual normalization, speaker-note removal and
 * asset inlining each produce a different string for the same revision, so a
 * latch compared against one of those can never match: it retires on the first
 * render after Edit closes and the document is replaced anyway.
 *
 * Measured before this existed as a named rule: the "no reload needed" check
 * passed (`matched: true`) and the document was replaced 2.7s later anyway,
 * because the exit path cleared the latch in the same synchronous block that
 * closed edit mode — one step before the render that would have consumed it.
 */
export interface PersistedManualEditDocument {
  sourceFingerprint: string;
  reloadKey: number;
}

export function shouldAdoptPersistedManualEditDocument(input: {
  manualEditMode: boolean;
  manualEditSrcDocActive: boolean;
  latch: PersistedManualEditDocument | null;
  reloadKey: number;
  sourceFingerprint: string | null;
}): boolean {
  // While Edit is open the identity is frozen by its own rule; the latch is
  // only for the moment after it closes.
  if (input.manualEditMode || input.manualEditSrcDocActive) return false;
  if (!input.latch) return false;
  if (input.sourceFingerprint === null) return false;
  // A reload the user asked for is not an edit echo.
  if (input.latch.reloadKey !== input.reloadKey) return false;
  // The self-release: any source the bridge did not put there takes the
  // ordinary replacement path.
  return input.latch.sourceFingerprint === input.sourceFingerprint;
}

/**
 * Whether a just-persisted patch may arm the retention latch.
 *
 * The latch is armed from ONE patch but fingerprints the WHOLE file, so it can
 * only ever mean "the live DOM equals these persisted bytes" while every patch
 * of the session reached the document. Six of the nine patch kinds have no
 * bridge message at all, and even a bridged one can be refused silently by the
 * preview document, so a session can carry an edit the DOM never received.
 *
 * Once that has happened, a later patch matching proves only that ONE element
 * is current — the rest of the document is still whatever the unmirrored edit
 * left behind. `liveDocumentDiverged` is therefore sticky for the session: a
 * document that fell out of sync cannot talk its way back in, it can only be
 * replaced.
 *
 * Measured before this rule existed: saving a link (`set-link`, no bridge) and
 * then a style in one session re-armed the latch on the style's match, Manual
 * Edit exited onto the adopted document, and the preview showed the link's old
 * text while the file on disk had the new one.
 */
export function canArmPersistedManualEditDocument(input: {
  patchMirroredToLiveDocument: boolean;
  liveDocumentDiverged: boolean;
}): boolean {
  return input.patchMirroredToLiveDocument && !input.liveDocumentDiverged;
}

/**
 * Whether the preview may keep suppressing new revisions of this document.
 *
 * Manual Edit freezes the preview's document identity so a save's own watcher
 * echo cannot replace the document the user is editing. That freeze is only
 * ever justified by the live bridge standing in for the reload: it applies the
 * persisted bytes to the document already on screen, which is strictly better
 * than re-rendering them into a fresh browsing context that has lost the page's
 * canvas, timers, scroll and form state.
 *
 * A save the bridge could not mirror removes that justification. Nothing is
 * keeping the document current any more, so continuing to freeze it does not
 * preserve a good document — it pins a stale one, and the user's save looks
 * like it did nothing at all. The freeze lifts for the rest of the session and
 * the save becomes visible the ordinary way. That costs the page's JS state on
 * those saves, which is the price of showing the user what they actually saved.
 */
export function shouldFreezeManualEditDocumentIdentity(input: {
  manualEditMode: boolean;
  manualEditSrcDocActive: boolean;
  canAdoptPersistedDocument: boolean;
  liveDocumentDiverged: boolean;
}): boolean {
  if (input.liveDocumentDiverged) return false;
  return input.manualEditMode
    || input.manualEditSrcDocActive
    || input.canAdoptPersistedDocument;
}

/**
 * Whether a patch reaches the document already on screen without a rebuild.
 *
 * Only `set-style` does. Styles stream in through `od-edit-preview-style` as
 * the user drags a slider, so by the time the save is written the document is
 * already showing the result and the write's watcher echo has nothing to add.
 * Every other kind changes the source and depends on the document coming back
 * — mirrored if the bridge can carry it, re-rendered if it cannot.
 *
 * This is deliberately NOT "does the patch have a mirror message". Several
 * kinds have one and still take the rebuild path, and the mirror can be refused
 * at any time. What is being named here is the narrower property the scroll
 * decision below actually rests on.
 */
export function manualEditPatchStreamsIntoLiveDocument(kind: string): boolean {
  return kind === 'set-style';
}

/**
 * Whether the preview document on screen will survive this save.
 *
 * This is the question the pre-write scroll snapshot depends on, and for a long
 * time the code asked a different one. It skipped the snapshot for `set-style`,
 * reasoning that "style patches stream live through postMessage and never
 * reload" — which was true while Manual Edit pinned one document for the length
 * of a session.
 *
 * It is no longer true. The identity freeze lifts for the rest of the session
 * as soon as one save cannot be mirrored into the live document, and from then
 * on every revision replaces the document, style saves included. A premise that
 * used to hold was retired by a different change, and the code resting on it
 * kept the old answer: the user scrolls down, nudges a style, and the preview
 * comes back at the top with nothing to restore from.
 *
 * So the condition is stated as what it always was about — replacement — and
 * the patch kind enters only through the one property that bears on it. Outside
 * a Manual Edit session nothing pins the document at all; inside one, the
 * freeze is what retains it, and a session that has already diverged no longer
 * has a freeze to offer.
 *
 * Retention is claimed only where it is certain, because the two errors are not
 * symmetric: a capture that was not needed costs one round trip of up to 120ms
 * in front of the write, while a capture that was needed and skipped loses the
 * user's place with no way to recover it afterwards.
 */
export function manualEditSaveRetainsPreviewDocument(input: {
  liveDocumentDiverged: boolean;
  manualEditSessionActive: boolean;
  patchStreamsIntoLiveDocument: boolean;
}): boolean {
  if (!input.manualEditSessionActive) return false;
  if (input.liveDocumentDiverged) return false;
  return input.patchStreamsIntoLiveDocument;
}

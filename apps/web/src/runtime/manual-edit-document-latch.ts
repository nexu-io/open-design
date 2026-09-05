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

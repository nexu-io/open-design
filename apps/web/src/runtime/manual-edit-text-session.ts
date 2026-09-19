/**
 * Whether the host's inline-text-edit belief still has a document behind it.
 *
 * An inline text edit is state of ONE preview document. The injected bridge
 * opens it (`od-edit-text-session {active:true}`), holds it in that document's
 * `activeTextEdit`, and closes it from inside that same document. The host
 * mirrors it in `manualEditTextSessionIdRef` so every teardown — Save, closing
 * the panel, clearing the selection, leaving edit mode — can flush the pending
 * edit before tearing anything down. That mirror is fail-closed on purpose: a
 * settle that cannot confirm the commit refuses the teardown, so a failed save
 * can never look like a successful one.
 *
 * The mirror is a belief about a document, and it does not expire with the
 * document. When the preview document is replaced, the bridge in the
 * replacement has no inline edit open and answers `od-edit-text-finish` with
 * nothing at all — `finishActiveTextEdit` returns before it posts. The host is
 * then holding a session belief that no document will ever close, and every
 * fail-closed teardown blocks on it: the settle's 1500ms backstop resolves
 * `false` and the caller takes its early return. For Save that early return is
 * silent data loss. It happens before `applyManualEdit`, so the button never
 * goes busy, no error is set, and no write is issued — the user clicks Save on
 * a live-looking panel and the file does not change.
 *
 * Manual Edit used to pin one document for the length of a session, which is
 * why this could not previously happen. It no longer does: the identity freeze
 * lifts for the rest of the session as soon as a save cannot be mirrored into
 * the live document, so every later revision replaces the document underneath
 * an open Manual Edit.
 *
 * So the belief is scoped to the document that minted it — but only on POSITIVE
 * evidence that the document is gone, never on a mismatch. The host's frame
 * refs are legitimately unaligned at moments that have nothing to do with a
 * replacement: a retained viewer keeps its document mounted while deactivated,
 * and the current/standby pair swaps under promotion and navigation retries.
 * Reading any of those as a dead document would drop a live session and let a
 * fail-closed teardown proceed through a genuinely pending edit — the opposite
 * bug, and a worse one. Evidence therefore means: this viewer has preview
 * documents mounted, and the session's document is not among them. With no
 * mounted document to compare against there is no evidence either way, and the
 * original fail-closed behavior stands.
 *
 * A session whose document is gone is not a failure. There is nothing left to
 * commit and nothing to fail, so it must not be reported as one. Any commit
 * that document already posted is in flight as an ordinary HTTP write and is
 * settled on its own, independently of this.
 */
export function manualEditTextSessionHasLiveDocument(input: {
  liveWindows: readonly (Window | null | undefined)[];
  sessionWindow: Window | null | undefined;
}): boolean {
  // A session recorded before this scoping existed carries no window. Treat it
  // as live so the fail-closed teardown keeps its original behavior rather than
  // being weakened by a missing witness.
  if (!input.sessionWindow) return true;
  const mounted = input.liveWindows.filter((value): value is Window => Boolean(value));
  // No mounted preview document is no evidence, not counter-evidence.
  if (mounted.length === 0) return true;
  return mounted.includes(input.sessionWindow);
}

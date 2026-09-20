/**
 * The outcome of flushing Manual Edit's pending work before something tears
 * state down.
 *
 * Save, dismissing the panel, clearing the selection, leaving edit mode and
 * reloading all begin the same way: settle the inline text edit, then flush the
 * pending style save. Both steps used to answer with a bare `boolean` and every
 * caller wrote `if (!ok) return;`. That single `false` stood for three
 * different situations, and only one of them had told the user anything:
 *
 *   - nothing was pending, or everything pending committed;
 *   - the flush could not run at all — another write already owned the editor,
 *     or no document could be reached to answer for the inline edit. Nothing
 *     was written and nothing was lost, but nothing was shown either;
 *   - a pending save genuinely failed, and its error is already on screen.
 *
 * Collapsing the middle case into the third is what makes a click disappear.
 * `saveManualEditPanelDraft` takes its early return before `applyManualEdit`
 * ever runs, so the button never goes busy, no banner appears and no request is
 * issued — the user clicks Save and the file does not change. The same
 * collapse recorded a transient refusal as a permanent failure witness, which
 * held the user inside Manual Edit with nothing to read.
 *
 * Naming the three states is the fix. The invariant every caller must preserve
 * is deliberately weaker than "the save must succeed", because some of these
 * states genuinely cannot complete a save:
 *
 *   **A teardown that refuses must leave the user something to read.**
 *
 * `settled` may proceed. `reported` must not, and has already explained itself.
 * `blocked` must not either, and still owes the user an explanation — that debt
 * is the whole reason this type exists.
 */
export type ManualEditFlushOutcome = 'settled' | 'blocked' | 'reported';

/**
 * Whether the caller may go on to tear down or replace Manual Edit state.
 * Only a fully settled flush may: both other outcomes leave pending work
 * behind, and tearing down through it is how an unsaved edit disappears.
 */
export function manualEditFlushAllowsTeardown(outcome: ManualEditFlushOutcome): boolean {
  return outcome === 'settled';
}

/**
 * Whether this outcome would leave the user with no explanation.
 *
 * `blocked` is the only outcome that stops a teardown without having said
 * anything, so it is the only one that still owes a notice. Every site that
 * refuses to proceed must consult this; a bare `return` on a blocked flush is
 * the defect this type was introduced to remove.
 */
export function manualEditFlushOwesUserNotice(outcome: ManualEditFlushOutcome): boolean {
  return outcome === 'blocked';
}

/**
 * Whether this outcome is a durable failure witness for the edit that produced
 * it.
 *
 * Only a real failure is. A `blocked` flush did not fail — it never ran,
 * because something else held the editor for that moment — so recording it
 * alongside genuine failures makes a transient refusal permanent. That is what
 * left Manual Edit refusing to close: one inline commit arriving while another
 * was still on the wire marked its session failed forever, and the exit path
 * consults that mark on every attempt.
 */
export function manualEditFlushIsDurableFailure(outcome: ManualEditFlushOutcome): boolean {
  return outcome === 'reported';
}

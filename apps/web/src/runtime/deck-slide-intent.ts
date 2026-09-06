/**
 * Decide whether a deck's own slide report should be adopted as host state.
 *
 * A presented deck has more than one voice. The authored document reports its
 * slide, and so does the injected deck runtime module — measured live, one
 * `go` produces reports from both, and they disagree while the move is still
 * in flight. The host adopted whichever arrived last, which re-entered its own
 * replay and produced an unbounded oscillation: asking for slide 1 was
 * answered with a stale 2, which was replayed as a fresh intent, which was
 * answered with 1, and so on. Measured trace, one backward click:
 *
 *   goToSlide:1 -> replay:1 -> replay:2 -> replay:1 -> replay:2 -> ...
 *
 * So a report is only authoritative once it agrees with what the host last
 * asked for. Until then the host is mid-move and a disagreeing report is a
 * stale voice, not news.
 *
 * The intent expires. A document that never confirms — it clamped the index,
 * it was replaced, it has no deck runtime at all — must not be able to freeze
 * host state forever, so after the window the next report is adopted whatever
 * it says. That keeps this a tie-breaker, never a lock.
 */
export const DECK_SLIDE_INTENT_TIMEOUT_MS = 1_500;

export interface DeckSlideIntent {
  index: number;
  atMs: number;
}

export type DeckSlideReportDecision =
  /** Adopt the report and keep waiting for the pending intent. */
  | 'adopt'
  /** Adopt the report; it confirms the pending intent, which is now settled. */
  | 'adopt-and-settle'
  /** A stale voice while the host is mid-move. */
  | 'ignore';

export function decideDeckSlideReport(
  pending: DeckSlideIntent | null,
  reportedIndex: number,
  nowMs: number,
  timeoutMs: number = DECK_SLIDE_INTENT_TIMEOUT_MS,
): DeckSlideReportDecision {
  if (!pending) return 'adopt';
  if (reportedIndex === pending.index) return 'adopt-and-settle';
  // An intent that was never confirmed must not outlive its window, or a deck
  // that clamps or refuses the index would strand host state.
  if (nowMs - pending.atMs >= timeoutMs) return 'adopt-and-settle';
  return 'ignore';
}

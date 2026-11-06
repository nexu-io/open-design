import type { ChatRunStatus, StrategyTaskProjectionV2 } from '@open-design/contracts';

/**
 * Whether a physical Run keeps its success on screen although the strategy
 * task it ran for ended `blocked`.
 *
 * It does whenever the Run itself succeeded. The Run records how the process
 * ended; the task records its own verdict, and that verdict still reaches the
 * message through the task projection — outcome, reason codes, the agent's
 * visible text — for the settled-verdict fields and the diagnostics. What it
 * no longer does is turn a clean exit into a failed turn: a turn that wrote
 * the page, a turn that only edited a secondary page, a turn that answered in
 * prose, and a turn that produced nothing all end with the agent's own words
 * and "Done", and the next message starts a new task. A failure card is drawn
 * only for a Run that did not succeed — a crash, a non-zero exit, a signal, a
 * timeout, an unavailable upstream.
 *
 * The remaining parameters are the facts the three call sites already resolve
 * (the task projection, the daemon's two delivery answers, this Run's reply).
 * They stay in the signature so those sites keep handing them over; none of
 * them takes part in the decision.
 */
export function canRetainSuccessfulRunForBlockedStrategy(
  status: ChatRunStatus,
  strategyTask: StrategyTaskProjectionV2 | undefined,
  deliverableValid: boolean | undefined,
  projectDeliverableValid: boolean | undefined,
  responseText: string,
): boolean {
  return status === 'succeeded';
}

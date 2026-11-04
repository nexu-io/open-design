/**
 * A turn the browser lost contact with is still in progress (P0-24 N15).
 *
 * When the browser runs out of reconnects to the local daemon it stamps the
 * turn `failed` and records one `DAEMON_STREAM_DISCONNECTED` error. That pair is
 * the recovery machinery's marker — `ProjectView` keys every later reattach and
 * status probe on it — so it stays in state. But it is not the run's outcome:
 * the daemon may still be running the turn, or have finished it, and only the
 * run record says which.
 *
 * Product rule (N15, PRD scenario E6): while the record has not spoken, the
 * turn reads as in progress — header 「进行中」, no failure card, no failure
 * status line, no notification — with the reconnect row as the only signal.
 * Once the daemon answers, recovery replaces the status (and drops the
 * disconnect error), or a later replay appends the run's real error, and the
 * turn shows its real result.
 *
 * So the invariant is read off the LATEST error on the turn: a `failed` turn
 * whose last error is the reconnect-owned disconnect has no outcome yet.
 */
import type { AgentEvent, ChatMessage } from '../../types';
import { isReconnectOwnedFailure } from '../amr-guidance';

type StatusEvent = Extract<AgentEvent, { kind: 'status' }>;

function isErrorStatus(event: AgentEvent): event is StatusEvent {
  return event.kind === 'status' && event.label === 'error';
}

function isReconnectOwnedError(event: StatusEvent): boolean {
  return isReconnectOwnedFailure(event.code, event.detail);
}

/** Whether this turn's `failed` is only the browser giving up on the stream. */
export function runOutcomeAwaitsRunRecord(message: ChatMessage): boolean {
  if (message.role !== 'assistant' || message.runStatus !== 'failed') return false;
  const events = message.events ?? [];
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (isErrorStatus(event)) return isReconnectOwnedError(event);
  }
  return false;
}

/**
 * The message as the conversation should DRAW it: a turn awaiting its run
 * record is drawn exactly like a running turn waiting to be reattached, and
 * the disconnect error the reconnect row already speaks for is not repeated
 * inline. Every other message is returned unchanged (same reference).
 */
export function projectTurnAwaitingRunRecord<T extends ChatMessage>(message: T): T {
  if (!runOutcomeAwaitsRunRecord(message)) return message;
  return {
    ...message,
    runStatus: 'running',
    endedAt: undefined,
    events: (message.events ?? []).filter(
      (event) => !(isErrorStatus(event) && isReconnectOwnedError(event)),
    ),
  };
}

/**
 * The run record has spoken: drop the disconnect marker from the message.
 *
 * Call wherever recovery adopts a terminal status from the daemon. The marker
 * only ever meant "outcome unknown"; left behind on a turn the record says
 * failed, it would keep {@link runOutcomeAwaitsRunRecord} drawing that turn as
 * in progress forever (P0-24 N15 / Q7).
 */
export function settleTurnFromRunRecord<T extends ChatMessage>(message: T): T {
  const events = message.events ?? [];
  if (!events.some((event) => isErrorStatus(event) && isReconnectOwnedError(event))) return message;
  return {
    ...message,
    events: events.filter((event) => !(isErrorStatus(event) && isReconnectOwnedError(event))),
  };
}


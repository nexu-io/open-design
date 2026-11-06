import type { ChatMessage } from '../types';
import type {
  RunFailureAction,
  RunFailureCategory,
  RunFailureDetail,
} from '@open-design/contracts';

export interface RunFailureClassificationFields {
  failureCategory?: RunFailureCategory | null;
  failureDetail?: RunFailureDetail | null;
  /** The daemon's verdict on the same failure: the action it recommends, and
   *  whether re-running can help at all. Carried alongside the classification
   *  because the error card leads with the verdict, not with the detail name.
   *  Absent when the daemon said nothing — which the card must keep telling
   *  apart from a verdict of `retryable: false`. */
  failureAction?: RunFailureAction | null;
  retryable?: boolean | null;
}

/** Read the daemon failure classification and verdict the streaming layer
 *  stamped onto a surfaced run error (see markErrorRunFailure in
 *  providers/daemon.ts). Returns undefined when the error carries none of them
 *  so callers pass nothing through.
 *
 *  `retryable` is read on a boolean type check, not on truthiness: `false` is
 *  the verdict that changes the card, and a truthiness guard would drop it. */
export function runFailureFieldsFromError(
  err: unknown,
): RunFailureClassificationFields | undefined {
  const e = err as {
    failureCategory?: RunFailureCategory | null;
    failureDetail?: RunFailureDetail | null;
    failureAction?: RunFailureAction | null;
    retryable?: boolean | null;
  } | null;
  if (!e) return undefined;
  const retryable = typeof e.retryable === 'boolean' ? e.retryable : undefined;
  if (!e.failureCategory && !e.failureDetail && !e.failureAction && retryable === undefined) {
    return undefined;
  }
  return {
    ...(e.failureCategory ? { failureCategory: e.failureCategory } : {}),
    ...(e.failureDetail ? { failureDetail: e.failureDetail } : {}),
    ...(e.failureAction ? { failureAction: e.failureAction } : {}),
    ...(retryable === undefined ? {} : { retryable }),
  };
}

/** Read the bounded, secret-redacted stderr tail the streaming layer stamped
 *  onto a surfaced run error (see daemonSseError in providers/daemon.ts).
 *  Returns undefined for an absent or blank tail so callers stamp nothing —
 *  a failure with no stderr must not grow an empty diagnostics section. */
export function stderrTailFromError(err: unknown): string | undefined {
  const tail = (err as { stderrTail?: unknown } | null)?.stderrTail;
  if (typeof tail !== 'string' || !tail.trim()) return undefined;
  return tail;
}

export function appendErrorStatusEvent(
  message: ChatMessage,
  detail: string,
  code?: string,
  failure?: RunFailureClassificationFields,
  stderrTail?: string | null,
): ChatMessage {
  if (!detail.trim()) return message;
  const tail = typeof stderrTail === 'string' && stderrTail.trim() ? stderrTail : undefined;
  const events = message.events ?? [];
  const lastIndex = events.length - 1;
  const last = events[lastIndex];
  if (last?.kind === 'status' && last.label === 'error' && last.detail === detail) {
    // The same terminal error is already recorded, but a later pass can bring
    // the finalize-time classification the first pass lacked — e.g. a reload
    // reads the daemon-persisted `error` frame, then the run finishes and
    // `onError` fires with `code` / `failureCategory` / `failureDetail`
    // attached. Merge those into the existing event instead of dropping them,
    // so the specific quota / CLI / long-tail card survives; no-op only when
    // the new pass adds nothing.
    const merged = {
      ...last,
      ...(code ? { code } : {}),
      ...(failure?.failureCategory ? { failureCategory: failure.failureCategory } : {}),
      ...(failure?.failureDetail ? { failureDetail: failure.failureDetail } : {}),
      ...(failure?.failureAction ? { failureAction: failure.failureAction } : {}),
      ...(typeof failure?.retryable === 'boolean' ? { retryable: failure.retryable } : {}),
      ...(tail ? { stderrTail: tail } : {}),
    };
    if (JSON.stringify(merged) === JSON.stringify(last)) return message;
    const nextEvents = events.slice();
    nextEvents[lastIndex] = merged;
    return { ...message, events: nextEvents };
  }
  return {
    ...message,
    events: [
      ...events,
      {
        kind: 'status',
        label: 'error',
        detail,
        ...(code ? { code } : {}),
        ...(failure?.failureCategory ? { failureCategory: failure.failureCategory } : {}),
        ...(failure?.failureDetail ? { failureDetail: failure.failureDetail } : {}),
        ...(failure?.failureAction ? { failureAction: failure.failureAction } : {}),
        ...(typeof failure?.retryable === 'boolean' ? { retryable: failure.retryable } : {}),
        ...(tail ? { stderrTail: tail } : {}),
      },
    ],
  };
}

export function removeErrorStatusEvent(
  message: ChatMessage,
  detail: string,
  code?: string,
): ChatMessage {
  if (!detail) return message;
  const events = message.events ?? [];
  const nextEvents = events.filter((event) => {
    if (event.kind !== 'status' || event.label !== 'error') return true;
    if (event.detail !== detail) return true;
    if (code !== undefined && event.code !== code) return true;
    return false;
  });
  if (nextEvents.length === events.length) return message;
  return {
    ...message,
    events: nextEvents,
  };
}

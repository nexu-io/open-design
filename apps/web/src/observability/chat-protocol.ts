// Chat protocol + recovery health.
//
// Two questions that no timing metric can answer:
//
//   client_chat_protocol_anomaly  "The agent produced output. Did the UI it
//                                  was supposed to become actually appear?"
//   client_chat_recovery          "When the connection broke, did we heal?"
//
// Both describe SILENT failures. A question form that fails to parse does
// not throw — it renders as nothing, the user sees a turn that asked them
// nothing, and no exception is captured. A run that finishes without a
// next-step marker looks like a normal turn with a slightly emptier
// footer. These are the defects that reach us as "sometimes it just
// doesn't show the buttons" and cannot be reproduced.
//
// Deduplication matters more here than anywhere else in the chat
// observability surface. Anomalies are detected during RENDER, and a
// React tree re-renders freely: an un-deduped `parse failed` in a message
// that stays on screen would emit on every keystroke in the composer. The
// unit of truth is "this run produced this anomaly once", so that is the
// dedupe key.

import type {
  ChatProtocolAnomaly,
  ChatProtocolAnomalyProps,
  ChatRecoveryOutcome,
  ChatRecoveryPath,
  ChatRecoveryProps,
} from '@open-design/contracts/analytics';

import { reportSafetyEvent } from '../analytics/error-tracking';
import { chatCorrelation, pushChatBreadcrumb } from './chat-context';

/**
 * Distinct (anomaly, scope) pairs already reported this page session.
 * Bounded so a pathological session cannot grow it without limit; once
 * full we stop reporting new anomalies rather than evicting, because an
 * evicted key would let the same anomaly re-fire and undo the dedupe.
 */
const reported = new Set<string>();
const MAX_DISTINCT_ANOMALIES = 200;

/**
 * Report that a chat render contract did not hold.
 *
 * `scope` defaults to the current `run_id`, which is almost always the
 * right unit: one run, one verdict. Pass an explicit scope (e.g. an
 * assistant message id) when a single run can legitimately produce the
 * same anomaly for several independent artifacts.
 */
export function reportChatProtocolAnomaly(input: {
  anomaly: ChatProtocolAnomaly;
  /** Character length of the payload that failed. NEVER the payload. */
  sourceLength?: number;
  messageCount?: number;
  scope?: string;
}): void {
  const correlation = chatCorrelation();
  const scope = input.scope ?? correlation.run_id ?? 'session';
  const key = `${input.anomaly}:${scope}`;
  if (reported.has(key)) return;
  if (reported.size >= MAX_DISTINCT_ANOMALIES) return;
  reported.add(key);

  const props: ChatProtocolAnomalyProps = {
    ...correlation,
    anomaly: input.anomaly,
    ...(input.sourceLength != null ? { source_length: input.sourceLength } : {}),
    ...(input.messageCount != null ? { message_count: input.messageCount } : {}),
  };
  reportSafetyEvent('client_chat_protocol_anomaly', { ...props });
}

/**
 * Report the outcome of a recovery attempt.
 *
 * Not deduped: every attempt is its own fact, and the attempt count IS the
 * signal — three failed reconnects followed by a success is a different
 * story from one clean reconnect, and both must survive into the data.
 * Volume is bounded by the daemon's own reconnect limit rather than by a
 * cap here, so a reconnect storm stays visible instead of being silently
 * truncated at exactly the moment it matters.
 */
export function reportChatRecovery(input: {
  path: ChatRecoveryPath;
  outcome: ChatRecoveryOutcome;
  /** 1-based attempt number within one recovery episode. */
  attempt: number;
  durationMs: number;
  /** Daemon error code. Already an enum — safe, and the whole point. */
  errorCode?: string;
  messageCount?: number;
}): void {
  pushChatBreadcrumb(input.path === 'run_resume' ? 'resume' : 'reconnect');
  const props: ChatRecoveryProps = {
    ...chatCorrelation(),
    path: input.path,
    outcome: input.outcome,
    attempt: input.attempt,
    duration_ms: Math.round(input.durationMs),
    ...(input.errorCode ? { error_code: input.errorCode } : {}),
    ...(input.messageCount != null ? { message_count: input.messageCount } : {}),
  };
  reportSafetyEvent('client_chat_recovery', { ...props });
}

/** Test-only — flush the dedupe set between cases. */
export function __resetChatProtocolForTest(): void {
  reported.clear();
}

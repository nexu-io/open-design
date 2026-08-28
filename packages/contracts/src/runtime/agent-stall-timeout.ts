/**
 * Reading how long a run waited before the daemon's no-output watchdog stopped
 * it.
 *
 * 《Open Design 报错体验设计方案》 §5 spells the timeout card out as
 * 「等了 10 分钟没有新的输出，先停下来了 —— 已做的部分都保留着。」 — the wait is
 * part of the sentence. It is also not a constant: the design gives 10 minutes
 * as the default budget and 30 for Cloud (AMR), and `OD_CHAT_RUN_*_TIMEOUT_MS`
 * lets an operator pick anything else. So the card reads the length back out of
 * the daemon's own timeout sentence, which already names it.
 *
 * The daemon writes both watchdogs' sentences from one template
 * (`failForInactivity` in apps/daemon/src/server.ts):
 *
 *   Agent stalled without emitting a first output for 1800s. Phase details: …
 *   Agent stalled without emitting any new output for 600s. Phase details: …
 *
 * Kept here, beside `model-window-limit`, for the same reason that one is: the
 * daemon writes the sentence and the web runtime reads it, so neither side may
 * own the shape alone.
 */

/**
 * Whole minutes the run waited, or null when the text carries no readable
 * duration.
 *
 * Returns null below one whole minute as well. Sub-minute budgets are an
 * operator escape hatch, never a shipped default, and rounding one to "0
 * minutes" or "1 minutes" would make the copy read false — callers are
 * expected to fall back to wording that does not name a length, exactly as
 * they do for an unreadable one.
 */
export type AgentStallTimeoutKind = 'first_output' | 'inactivity';

/**
 * Format the bounded observation shared by the daemon producer and web parser.
 * Keeping the English diagnostic prefix here prevents harmless daemon copy
 * edits from silently breaking the localized timeout card's duration readback.
 */
export function formatAgentStallTimeoutObservation(
  kind: AgentStallTimeoutKind,
  timeoutMs: number,
): string {
  const description =
    kind === 'first_output'
      ? 'without emitting a first output'
      : 'without emitting any new output';
  return `Agent stalled ${description} for ${Math.floor(timeoutMs / 1000)}s.`;
}

export function readAgentStallWaitedMinutes(
  text: string | null | undefined,
): number | null {
  if (!text) return null;
  const match = /\bwithout emitting (?:a first|any new) output for (\d+)s\b/i.exec(text);
  const seconds = match?.[1] ? Number(match[1]) : NaN;
  if (!Number.isFinite(seconds) || seconds < 60) return null;
  return Math.floor(seconds / 60);
}

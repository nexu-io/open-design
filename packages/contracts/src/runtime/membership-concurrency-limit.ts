/** Whether vela rejected the request because the membership's concurrency policy is full. */
export function isMembershipConcurrencyLimitFailure(
  text: string | null | undefined,
): boolean {
  if (!text) return false;
  return /\btier_limit_exceeded\b/i.test(text)
    && /\bmembership concurrency limit exceeded\b/i.test(text);
}

/** The instant vela says a membership concurrency slot becomes available again. */
export function readMembershipConcurrencyResetAt(
  text: string | null | undefined,
): string | null {
  if (!text) return null;
  const match = /\bresets?(?:\s+at)?\s+(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2}))/i
    .exec(text);
  return match?.[1] ?? null;
}

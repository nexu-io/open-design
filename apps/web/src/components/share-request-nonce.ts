/** Every explicit card Share click must be observable even when Date.now() is unchanged. */
export function nextShareRequestNonce(previous: number | undefined, now: number): number {
  return Math.max(now, (previous ?? 0) + 1);
}

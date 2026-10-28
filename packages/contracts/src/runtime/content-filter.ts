/**
 * Positive evidence of a provider content refusal in an error diagnostic.
 * Shared by terminal classification and older persisted chat errors. A bare
 * mention of safety, filtering, or a blocked connection is not a refusal.
 */
export function isContentFilterError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /\b(?:ContentFilterError|content_policy_violation|safety_rejection)\b|\b(?:response|request|prompt|output) (?:was |has been |is )?(?:blocked|rejected) by (?:the )?(?:provider(?:'s)? )?content (?:filter|safety policy)\b/i
    .test(message);
}

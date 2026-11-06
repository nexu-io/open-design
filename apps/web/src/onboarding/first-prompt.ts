// Whether the first message a recommendation-started project sent was the
// prefilled suggestion, unmodified.
//
// The Home recommendation seeds the Studio composer with a suggested first
// request, but the user stays in control: they can edit it, clear it and send
// only attachments, replace it, or swap in a path-scoped starter card before
// sending (spec §7.4 / §8.2). The onboarding funnel's `has_prefilled_prompt`
// dimension must therefore reflect that real choice — comparing the actually
// submitted prompt against the seed captured at prefill time — rather than
// hard-coding `true` for every recommendation-started project (which would make
// the send-through split unreliable).
//
// Both sides are compared trimmed; an empty seed or an empty/attachments-only
// submission is never a match.
export function sentPrefilledPrompt(seedPrompt: string, submittedPrompt: string): boolean {
  const seed = seedPrompt.trim();
  return seed.length > 0 && submittedPrompt.trim() === seed;
}

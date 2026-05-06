// Build the canonical "Edit in Google Slides" URL from a deck id.
//
// The deck id arrives via result.json, which is written by the agent —
// trusting an arbitrary `deckUrl` field verbatim would let a malicious
// or buggy artifact writer slip a `javascript:` URL or phishing link
// into the toolbar's "Edit in Google Slides" anchor. By rebuilding the
// URL here from a deck-id-shaped string we lock the link to the
// docs.google.com origin even if the manifest tries to override it.
//
// Drive object IDs use base64url-style characters (`A-Z a-z 0-9 _ -`),
// and real ids are >= 25 chars in practice; we accept >= 10 to leave
// room for shorter ids in tests/fixtures while still rejecting empty,
// scheme-prefixed, or otherwise structured strings.
const DECK_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/;

export function isValidDeckId(value: unknown): value is string {
  return typeof value === 'string' && DECK_ID_PATTERN.test(value);
}

export function buildDeckEditUrl(deckId: unknown): string | null {
  if (!isValidDeckId(deckId)) return null;
  return `https://docs.google.com/presentation/d/${deckId}/edit`;
}

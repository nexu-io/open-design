// Lexical secret / PII scrubber for telemetry payloads.
//
// Runs before any prompt or assistant text is sent to Langfuse. The
// patterns here are intentionally conservative: each one matches a
// well-defined token shape with extremely low false-positive rate (API
// keys have a fixed prefix, JWTs have the "header.payload.signature"
// triple, credit-card matches go through a Luhn check). What this file
// does NOT do — and the user-facing copy must reflect that — is detect
// names, addresses, business secrets, or anything that requires
// understanding the meaning of the surrounding text. That's an ML / LLM
// problem the daemon can't take on.
//
// Output format: every match is replaced by `[REDACTED:<kind>]` so a
// reviewer reading a Langfuse trace can see exactly which category
// fired without recovering the original value.
//
// References:
// - Langfuse client-side masking guidance:
//   https://langfuse.com/docs/observability/features/masking
// - GitHub token format:
//   https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github
// - AWS access key shape: 'AKIA' + 16 uppercase alphanumerics.
// - Luhn algorithm (credit cards): https://en.wikipedia.org/wiki/Luhn_algorithm

interface Pattern {
  name: string;
  regex: RegExp;
}

// Order matters: list specific rules before more general ones. Langfuse
// keys (`sk-lf-...`) would otherwise be eaten by the generic `sk-...`
// rule and labeled as a generic OpenAI-style key.
const PATTERNS: readonly Pattern[] = [
  // Langfuse public/secret keys (pk-lf- / sk-lf-). Must run before the
  // generic sk- rule so the more specific label wins.
  { name: 'langfuse_key', regex: /\b(?:pk|sk)-lf-[A-Za-z0-9-]{16,}\b/g },

  // Anthropic / OpenAI-style keys: 'sk-' + optional sub-prefix + base64-ish.
  // Both vendors plus a long tail of OpenAI-compatible providers (DeepSeek,
  // MiniMax, Together, etc.) ship keys in this shape, so a single rule
  // covers most "sk-..." secrets a user might paste into a prompt.
  { name: 'sk_key', regex: /\bsk-(?:proj-|live-|test-|ant-)?[A-Za-z0-9_-]{20,}\b/g },

  // GitHub personal / OAuth / server / user-server / refresh tokens.
  { name: 'github_token', regex: /\bgh[opsur]_[A-Za-z0-9]{36,251}\b/g },

  // GitHub legacy 40-hex personal access tokens that ship with no prefix
  // are indistinguishable from a sha1 hash, so we don't try to match them
  // here — false positives would be brutal in commit logs / artifact slugs.

  // AWS access key id. The matching secret access key is just 40 base64
  // chars with no fixed shape, so we cannot reliably redact it without
  // huge collateral damage; flagging the access key id at least
  // signals a paste happened.
  { name: 'aws_access_key', regex: /\bAKIA[0-9A-Z]{16}\b/g },

  // Google API keys (Firebase / Maps / etc.).
  { name: 'google_api_key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g },

  // Slack tokens.
  { name: 'slack_token', regex: /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/g },

  // Stripe keys.
  { name: 'stripe_key', regex: /\b(?:sk|pk|rk)_(?:live|test)_[0-9a-zA-Z]{16,}\b/g },

  // JSON Web Tokens. The "header.payload.signature" triple is distinctive
  // enough that false positives are rare (the literal "eyJ" prefix is the
  // base64 encoding of '{"' which is how every JOSE header starts).
  { name: 'jwt', regex: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },

  // Bearer tokens in HTTP Authorization header copy/paste. We only match
  // the value, not the literal 'Bearer ', so the marker stays readable in
  // the redacted output ("Authorization: Bearer [REDACTED:bearer_token]").
  { name: 'bearer_token', regex: /(?<=\bBearer\s+)[A-Za-z0-9._~+/-]{16,}={0,2}/g },

  // Email addresses. Conservative enough to require a TLD-like trailer.
  { name: 'email', regex: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },

  // IPv4. Reject all-zero / 255.255.255.255-ish junk shapes by gating on
  // each octet being 0-255.
  {
    name: 'ipv4',
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g,
  },

  // Phone numbers. Tight US-leaning shape; a global PII detector would
  // need a real lib. We keep this so US-based test prompts ('call me at
  // (415) 555-...') don't ship. Note: no leading \b — '(' isn't a word
  // char, so a starting boundary would refuse to match `(415)`. We
  // require a non-digit (or start of string) before the run instead.
  {
    name: 'phone',
    regex: /(?<!\d)(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g,
  },
];

// Credit card sweep is special: a naive 13-19 digit run matches a lot of
// non-card numbers (timestamps, IDs, hashes). We isolate the candidate
// then run a Luhn check before redacting.
const CARD_CANDIDATE = /\b(?:\d[ -]?){12,18}\d\b/g;

function isLuhnValid(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Returns `input` with every recognised secret / PII pattern replaced by
 * a `[REDACTED:<kind>]` marker. Idempotent — re-running on already
 * redacted text only matches new tokens.
 *
 * Empty / non-string input passes through unchanged so the caller can
 * use this as a no-op on optional fields.
 */
export function redactSecrets(input: string): string {
  if (!input) return input;
  let out = input;
  for (const { name, regex } of PATTERNS) {
    out = out.replace(regex, `[REDACTED:${name}]`);
  }
  out = out.replace(CARD_CANDIDATE, (match) => {
    const digits = match.replace(/\D/g, '');
    return isLuhnValid(digits) ? '[REDACTED:credit_card]' : match;
  });
  return out;
}

/**
 * Same as `redactSecrets` but also returns per-category counts so the
 * caller can attach an audit summary to the trace metadata
 * ('we stripped 2 keys + 1 email before send').
 */
export function redactSecretsWithCounts(input: string): {
  redacted: string;
  counts: Record<string, number>;
} {
  const counts: Record<string, number> = {};
  if (!input) return { redacted: input, counts };
  let out = input;
  for (const { name, regex } of PATTERNS) {
    let matched = 0;
    out = out.replace(regex, () => {
      matched += 1;
      return `[REDACTED:${name}]`;
    });
    if (matched > 0) counts[name] = matched;
  }
  let cardCount = 0;
  out = out.replace(CARD_CANDIDATE, (match) => {
    const digits = match.replace(/\D/g, '');
    if (isLuhnValid(digits)) {
      cardCount += 1;
      return '[REDACTED:credit_card]';
    }
    return match;
  });
  if (cardCount > 0) counts.credit_card = cardCount;
  return { redacted: out, counts };
}

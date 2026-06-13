// Tiered v4-UUID generator that survives non-secure contexts.
//
// `crypto.randomUUID()` is restricted to secure contexts — HTTPS or
// `localhost`. When Open Design is served over plain HTTP on a LAN
// IP (the standard Docker / unRAID / NAS self-hosted setup, e.g.
// `http://192.168.1.10:17573`), Chromium silently makes
// `crypto.randomUUID` undefined. Calls then throw
// `TypeError: crypto.randomUUID is not a function`, which the surrounding
// try/catch in `state/projects.ts` swallows — the Create button
// effectively becomes a no-op for every LAN-IP user (issue #849, also
// reported as #394).
//
// Three-tier fallback, preferred in order:
//
//   1. `crypto.randomUUID()` — secure-context happy path. Native, fast,
//      cryptographically random.
//   2. `crypto.getRandomValues()` — available in non-secure contexts
//      too (it's a separate API not gated by isSecureContext). Gives
//      us a real RFC 4122 v4 UUID with crypto-quality entropy.
//   3. `Math.random()` — last resort, only for environments without
//      either Web Crypto API. The IDs we generate (project ids, message
//      ids, client request ids) are scoped to a single user's local
//      browser session, so cryptographic uniqueness isn't required —
//      we just need enough entropy to avoid collisions in normal use.
export function randomUUID(): string {
  // Tier 1: native randomUUID where the spec lets us.
  if (
    typeof crypto !== 'undefined'
    && typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  // Tier 2: build a v4 UUID from `crypto.getRandomValues`. The byte
  // layout follows RFC 4122 §4.4 — set the version (high nibble of
  // byte 6) to 4 and the variant (high two bits of byte 8) to `10`.
  if (
    typeof crypto !== 'undefined'
    && typeof crypto.getRandomValues === 'function'
  ) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Tier 3: Math.random fallback. Same template as the de-facto
  // browser polyfill — replace `x` with a random hex nibble and `y`
  // with one of `8`/`9`/`a`/`b` to satisfy the variant bits.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

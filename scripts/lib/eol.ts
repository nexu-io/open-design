/* ─────────────────────────────────────────────────────────────────────────
 * scripts/lib/eol.ts
 *
 * Shared helpers for byte-exact text comparisons that must ignore CRLF/LF
 * drift. Windows `core.autocrlf=true` checks LF files out with CRLF endings,
 * so any `String.prototype.includes` / strict-equality against a generated
 * or template-literal block fails for line-ending reasons, not content
 * reasons. Apply `normalizeEol` to BOTH sides before comparing.
 *
 * See: #5175 / #5176 (design-system manifests), #6192 (packaged-leaf
 * boundary) for prior art using the same helper.
 * ─────────────────────────────────────────────────────────────────── */

export function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

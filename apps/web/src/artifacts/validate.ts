/**
 * Pre-write structural sniff for AI-emitted HTML artifacts.
 *
 * Defends the project-file persistence path (`persistArtifact` →
 * `writeProjectTextFile`) against the failure mode in #50 / #1143 where the
 * model emits an `<artifact type="text/html">…</artifact>` block whose body is
 * a prose summary instead of a complete document. Without this gate, such
 * content lands on disk as a real `.html` file with `kind: html` manifest and
 * pollutes the project file panel as a phantom artifact tab.
 *
 * Policy (intentionally narrow — false positives here block real saves):
 * - non-empty after trimming BOM and leading whitespace
 * - meets a minimum length threshold
 * - the *first* non-whitespace token is `<!doctype html>` or `<html`
 *   (anchored at the start; mid-string mentions of these tags do NOT count —
 *   AI prose like "Updated the <html lang> attribute…" must be rejected)
 *
 * What this gate is NOT:
 * - It is **not** an HTML linter or validator. Malformed but recognizably
 *   document-shaped HTML passes; only content that obviously isn't a document
 *   fails. The guarantee is "blocks obvious prose-as-HTML", not "validates
 *   well-formed HTML."
 * - It does **not** cover `.jsx` / `.tsx` artifacts or any other type — the
 *   `persistArtifact` caller only invokes this for `ext === '.html'`. This is
 *   not a generalized artifact-validation framework.
 * - It does **not** apply to user-driven saves via `FileViewer` /
 *   `FileWorkspace`; those go through a different code path and may
 *   legitimately save partial drafts.
 *
 * Threshold note: 64 chars rejects minimal empty-body documents like
 * `<!doctype html><html><body></body></html>` (49 chars). That is intentional
 * — AI-emitted artifacts in this product are expected to be non-trivial
 * deliverables, not test fixtures, so the lower bound favors fewer phantom
 * files over preserving fixture-grade empties.
 */

const MIN_HTML_LENGTH = 64;
const STARTS_WITH_DOCUMENT_RE = /^(?:<!doctype\s+html\b|<html\b)/i;

export type HtmlArtifactValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validateHtmlArtifact(content: string): HtmlArtifactValidationResult {
  const trimmed = content.replace(/^﻿/, '').trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'empty content' };
  }
  if (trimmed.length < MIN_HTML_LENGTH) {
    return { ok: false, reason: `content too short to be HTML (got ${trimmed.length} chars, need ≥${MIN_HTML_LENGTH})` };
  }
  if (!STARTS_WITH_DOCUMENT_RE.test(trimmed)) {
    return { ok: false, reason: 'content does not start with <!doctype html> or <html — looks like prose, not a complete HTML document' };
  }
  return { ok: true };
}

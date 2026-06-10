// Renderable `<question-form>` detection, shared across daemon consumers.
//
// Canonical open tag is `<question-form>`; `<ask-question>` is an accepted
// alias models drift to. This mirrors the open-tag set + body contract in the
// web parser (`apps/web/src/artifacts/question-form.ts`). The app boundary
// forbids `apps/daemon` importing `apps/web/src`, so the mirror is deliberate —
// keep it in sync, or promote a shared parser into `packages/contracts` if the
// two drift. Kept as a daemon-internal module so every daemon consumer (the
// missing-artifacts guard, awaiting-input status, and run analytics) shares ONE
// renderable-form check instead of each re-deriving a naive open-tag regex.

// Canonical open tag plus the `<ask-question>` alias. Matching only the open
// tag is intentionally NOT enough on its own (see `emittedRenderableQuestionForm`).
export const QUESTION_FORM_OPEN_RE = /<(question-form|ask-question)\b[^>]*>/i;

// True when `body` is a renderable question-form body: JSON (optionally fenced)
// parsing to an object with a non-empty `questions` array. This is the minimal
// contract `tryParseForm` enforces in the web parser; a body that fails it is
// kept as raw prose by the UI (no form card renders).
export function questionFormBodyIsRenderable(body: string): boolean {
  const trimmed = typeof body === 'string' ? body.trim() : '';
  if (!trimmed) return false;
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch {
    return false;
  }
  if (!data || typeof data !== 'object') return false;
  const questions = (data as { questions?: unknown }).questions;
  return Array.isArray(questions) && questions.some((q) => q && typeof q === 'object');
}

// Locate `closeTag` (case-insensitively) at or after `from`, returning an index
// in the ORIGINAL `text` coordinate space. Mirrors the web parser's
// `findCloseTag`: scanning char-by-char and lowercasing each fixed-length
// candidate slice keeps the result aligned with `openEnd`. Lowercasing the
// whole string up front instead would desync the index, because some code
// points expand under `toLowerCase()` (e.g. `"İ" -> "i̇"`) and shift every
// offset after them — corrupting the body slice and failing a valid form.
export function findQuestionFormCloseTag(text: string, from: number, closeTag: string): number {
  const closeLower = closeTag.toLowerCase();
  const tagLen = closeTag.length;
  const maxStart = text.length - tagLen;
  for (let i = from; i <= maxStart; i++) {
    if (text.slice(i, i + tagLen).toLowerCase() === closeLower) return i;
  }
  return -1;
}

// Whether the agent's visible text contains a *renderable* clarifying form — a
// closed `<question-form>`/`<ask-question>` block whose body satisfies the
// parser contract above. Matching only the open tag would let a malformed,
// non-renderable body (or the literal tag shown inside a code sample / generated
// doc) count as a clarification turn, so artifact-generating runs that merely
// mention the markup are not misclassified.
export function emittedRenderableQuestionForm(text: unknown): boolean {
  if (typeof text !== 'string' || !text) return false;
  let cursor = 0;
  while (cursor < text.length) {
    const m = QUESTION_FORM_OPEN_RE.exec(text.slice(cursor));
    if (!m) return false;
    const tagName = (m[1] ?? 'question-form').toLowerCase();
    const closeTag = `</${tagName}>`;
    const openEnd = cursor + m.index + m[0].length;
    const closeIdx = findQuestionFormCloseTag(text, openEnd, closeTag);
    if (closeIdx === -1) return false;
    if (questionFormBodyIsRenderable(text.slice(openEnd, closeIdx))) return true;
    cursor = closeIdx + closeTag.length;
  }
  return false;
}

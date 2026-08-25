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
  return countRenderableQuestionForms(text) > 0;
}

/**
 * What a text actually did with the `<question-form>` markup.
 *
 * "No form" and "a form that cannot render" are different facts with different
 * remedies, and collapsing them to a single renderable count is what let a
 * production turn emit `<question-form> 无需提出——…` — an open marker with prose
 * for a body and no close tag — while every consumer scored it as silence.
 */
export interface QuestionFormScan {
  /** Closed blocks whose body satisfies the parser contract. These render. */
  renderable: number;
  /** Closed blocks whose body fails the contract. The UI keeps them as prose. */
  unrenderable: number;
  /** An open marker with no matching close tag anywhere after it. */
  unterminated: boolean;
}

/**
 * Classify every `<question-form>`/`<ask-question>` marker in `text`.
 *
 * Scanning stops at the first unterminated marker, exactly as the renderable
 * count always has: without a close tag there is no way to know where the body
 * ends, so nothing after it can be attributed. That stop is now *reported*
 * (`unterminated`) instead of silently returning a count of zero.
 */
export function scanQuestionForms(text: unknown): QuestionFormScan {
  const scan: QuestionFormScan = { renderable: 0, unrenderable: 0, unterminated: false };
  if (typeof text !== 'string' || !text) return scan;
  let cursor = 0;
  while (cursor < text.length) {
    const m = QUESTION_FORM_OPEN_RE.exec(text.slice(cursor));
    if (!m) return scan;
    const tagName = (m[1] ?? 'question-form').toLowerCase();
    const closeTag = `</${tagName}>`;
    const openEnd = cursor + m.index + m[0].length;
    const closeIdx = findQuestionFormCloseTag(text, openEnd, closeTag);
    if (closeIdx === -1) {
      scan.unterminated = true;
      return scan;
    }
    if (questionFormBodyIsRenderable(text.slice(openEnd, closeIdx))) scan.renderable += 1;
    else scan.unrenderable += 1;
    cursor = closeIdx + closeTag.length;
  }
  return scan;
}

/** Count complete renderable forms so one-round protocols can reject ambiguity. */
export function countRenderableQuestionForms(text: unknown): number {
  return scanQuestionForms(text).renderable;
}

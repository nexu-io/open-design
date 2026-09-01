// Renderable `<question-form>` detection, shared across daemon consumers.
//
// Canonical open tag is `<question-form>`; `<ask-question>` is an accepted
// alias models drift to. This mirrors the open-tag set, body contract AND
// nested-open recovery of the web parser (`apps/web/src/artifacts/question-form.ts`,
// `splitOnQuestionForms`). The app boundary forbids `apps/daemon` importing
// `apps/web/src`, so the mirror is deliberate — keep it in sync, or promote a
// shared parser into `packages/contracts` if the two drift. Kept as a
// daemon-internal module so every daemon consumer (the missing-artifacts guard,
// awaiting-input status, and run analytics) shares ONE renderable-form check
// instead of each re-deriving a naive open-tag regex.
//
// The two sides answer ONE question — "does the user see a form card?" — and
// every consumer here treats its answer as a fact about the rendered UI: the
// OD Next coordinator blocks a `clarification_required` turn that rendered no
// form, `GET /api/projects` reports a partition as awaiting input, and run
// analytics record whether the turn asked anything. A daemon that scores a form
// the UI is displaying as absent therefore does not merely mis-count; it
// settles the strategy task terminal + blocked underneath a form the user can
// still fill in, and their answer comes back as 409
// STRATEGY_TASK_STATE_MISMATCH (OPEND-2364). Agreement is the contract; the
// shared corpus that pins it lives in `e2e/tests/question-form-parity.test.ts`,
// which is the only layer allowed to import both parsers.

// Canonical open tag plus the `<ask-question>` alias. Matching only the open
// tag is intentionally NOT enough on its own (see `emittedRenderableQuestionForm`).
export const QUESTION_FORM_OPEN_RE = /<(question-form|ask-question)\b[^>]*>/i;

/**
 * True when `body` is a renderable question-form body.
 *
 * The grammar is exactly the one the web parser's `parseForm` accepts: JSON,
 * optionally wrapped in a ```` ```json ```` fence, parsing either to an object
 * carrying a `questions` array or to a bare array of questions, with at least
 * one entry that survives `mapRawQuestion` — which rejects only non-objects.
 * A body that fails it is kept as raw prose by the UI (no form card renders).
 *
 * The bare top-level array is not a tolerance this module invents: the UI has
 * always rendered `[{…}]`, so requiring the `questions` key here scored a
 * displayed form as absent (OPEND-2364).
 */
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
  const questions = Array.isArray(data)
    ? data
    : (data as { questions?: unknown }).questions;
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

/**
 * Where the next open marker starts inside `[from, until)`, or -1.
 *
 * The web renderer never gives up on an open tag that failed to yield a form
 * while another open tag is still available to retry from: an outer tag whose
 * body holds a second one is a false positive — a duplicated wrapper, an alias
 * the model switched mid-emission, or the tag name quoted in prose — and the
 * inner tag is the real form. Matching on the slice (rather than searching the
 * whole text and range-checking) reproduces the web parser's boundary exactly,
 * including its refusal to match a tag that straddles `until`.
 */
function findNestedQuestionFormOpen(text: string, from: number, until: number): number {
  if (until <= from) return -1;
  const nested = QUESTION_FORM_OPEN_RE.exec(text.slice(from, until));
  return nested ? from + nested.index : -1;
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
  /** An open marker with no matching close tag and no inner marker to retry from. */
  unterminated: boolean;
}

/**
 * Classify every `<question-form>`/`<ask-question>` marker in `text`.
 *
 * A marker is only charged as `unrenderable` or `unterminated` once the web
 * renderer would also have given up on it. Both of its recovery paths are
 * mirrored here, because a marker it recovers from is a form the user is
 * looking at:
 *
 *   - a closed block whose body fails to parse but itself contains another open
 *     marker — the outer match was a false positive, so the scan resumes at the
 *     inner marker instead of charging the outer one;
 *   - an open marker with no close tag but another open marker after it — same
 *     unwind, over the rest of the text.
 *
 * Scanning stops only at a marker with neither a close tag nor an inner marker
 * to resume from: without a close tag there is genuinely no way to know where
 * the body ends, so nothing after it can be attributed. That stop is *reported*
 * (`unterminated`) instead of silently returning a count of zero.
 *
 * Every resume point lies at or past the current open tag's end, so the cursor
 * strictly advances on each iteration and the scan always terminates.
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
      const resumeAt = findNestedQuestionFormOpen(text, openEnd, text.length);
      if (resumeAt === -1) {
        scan.unterminated = true;
        return scan;
      }
      cursor = resumeAt;
      continue;
    }
    if (questionFormBodyIsRenderable(text.slice(openEnd, closeIdx))) {
      scan.renderable += 1;
      cursor = closeIdx + closeTag.length;
      continue;
    }
    const resumeAt = findNestedQuestionFormOpen(text, openEnd, closeIdx);
    if (resumeAt === -1) {
      scan.unrenderable += 1;
      cursor = closeIdx + closeTag.length;
      continue;
    }
    cursor = resumeAt;
  }
  return scan;
}

/** Count complete renderable forms so one-round protocols can reject ambiguity. */
export function countRenderableQuestionForms(text: unknown): number {
  return scanQuestionForms(text).renderable;
}

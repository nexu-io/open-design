/**
 * Parsing for Claude's `AskUserQuestion` tool input, in two modes:
 *
 *   - parseAskUserQuestionInput — strict. For a *finished* tool_use whose
 *     input is already a complete object. Drops anything malformed so the
 *     locked, interactive card never shows half-built options.
 *
 *   - parsePartialAskUserQuestion — lenient + truncation-tolerant. For the
 *     live streaming pass, where the input is the raw JSON *prefix* that grows
 *     one token at a time (fed from the daemon's `tool_input_delta`). It
 *     repairs the truncated prefix, then keeps every question that already has
 *     its prompt text (even with zero options yet) so a question doesn't
 *     flicker in → out → back in as its options arrive.
 *
 * Input shape (per the SDK):
 *   { questions: [{ question, header, options: [{ label, description }],
 *     multiSelect }, ...] }
 * Both parsers accept `options` as an array of objects or of plain strings
 * to stay tolerant of small protocol drift.
 */
import { parsePartialJson } from './partial-json';

// Re-exported so importers/tests of these generic helpers can reach them
// through this module too.
export { repairJsonPrefix, parsePartialJson } from './partial-json';

export type AuqOption = { label: string; description?: string };
export type AuqQuestion = {
  question: string;
  header?: string;
  options: AuqOption[];
  multiSelect: boolean;
};

function coerceOptions(raw: unknown): AuqOption[] {
  if (!Array.isArray(raw)) return [];
  const options: AuqOption[] = [];
  for (const opt of raw) {
    if (typeof opt === 'string') {
      if (opt) options.push({ label: opt });
      continue;
    }
    if (!opt || typeof opt !== 'object') continue;
    const o = opt as Record<string, unknown>;
    const label = typeof o.label === 'string' ? o.label : '';
    // While streaming, an option object can exist before its label has
    // finished typing; skip it for now (it reappears once a char lands).
    if (!label) continue;
    const description = typeof o.description === 'string' ? o.description : undefined;
    options.push(description ? { label, description } : { label });
  }
  return options;
}

/**
 * Strict parser for a finished AskUserQuestion input. Drops questions with no
 * prompt or no options so the interactive card is always well-formed.
 */
export function parseAskUserQuestionInput(input: unknown): AuqQuestion[] {
  const obj = (input ?? {}) as { questions?: unknown };
  if (!Array.isArray(obj.questions)) return [];
  const result: AuqQuestion[] = [];
  for (const raw of obj.questions) {
    if (!raw || typeof raw !== 'object') continue;
    const q = raw as Record<string, unknown>;
    const question = typeof q.question === 'string' ? q.question : '';
    if (!question) continue;
    const header = typeof q.header === 'string' ? q.header : undefined;
    const multiSelect = q.multiSelect === true;
    const options = coerceOptions(q.options);
    if (options.length === 0) continue;
    result.push({ question, header, options, multiSelect });
  }
  return result;
}

/**
 * Lenient parser for the streaming pass. Takes the *accumulated raw JSON
 * buffer* (concatenated `tool_input_delta` fragments), repairs the truncation,
 * and shapes it — keeping any question that already has prompt text even if
 * its options have not arrived. The card renders these read-only until the
 * final tool_use supersedes them.
 */
export function parsePartialAskUserQuestion(buf: string): AuqQuestion[] {
  return shapePartialQuestions(parsePartialJson(buf));
}

/** Shape an already-parsed (lenient) object into questions. */
export function shapePartialQuestions(input: unknown): AuqQuestion[] {
  const obj = (input ?? {}) as { questions?: unknown };
  if (!Array.isArray(obj.questions)) return [];
  const result: AuqQuestion[] = [];
  for (const raw of obj.questions) {
    if (!raw || typeof raw !== 'object') continue;
    const q = raw as Record<string, unknown>;
    const question = typeof q.question === 'string' ? q.question : '';
    if (!question) continue; // need at least the prompt to show anything
    const header = typeof q.header === 'string' ? q.header : undefined;
    const multiSelect = q.multiSelect === true;
    const options = coerceOptions(q.options);
    result.push({ question, header, options, multiSelect });
  }
  return result;
}

/**
 * Parser for inline <question-form>...</question-form> blocks the agent
 * emits to ask the user a structured set of clarifying questions before
 * starting design work.
 *
 * Body must be JSON. Example:
 *
 *   <question-form id="discovery" title="Quick brief">
 *   {
 *     "questions": [
 *       { "id": "platform", "label": "Platform", "type": "radio",
 *         "options": ["Mobile (iOS/Android)", "Desktop web", "Responsive"],
 *         "required": true },
 *       { "id": "audience", "label": "Primary audience", "type": "text",
 *         "placeholder": "e.g. SaaS buyers" }
 *     ]
 *   }
 *   </question-form>
 *
 * `<ask-question>...</ask-question>` is accepted as an alias for
 * `<question-form>`, so a model that drifts to the colloquial tag
 * name still renders correctly instead of leaking raw markup into
 * prose (see issue #1194).
 *
 * Splits a final assistant text payload into ordered segments — prose +
 * forms — so AssistantMessage can render the form inline.
 */
export type QuestionType =
  | 'radio'
  | 'checkbox'
  | 'select'
  | 'text'
  | 'textarea'
  | 'direction-cards';

/**
 * Rich card metadata for a single `direction-cards` option. The picker
 * renders a swatch row, a serif/sans type sample, a mood blurb, and a
 * "refs" line so users can scan visually instead of squinting at radio
 * labels. The agent emits this metadata inline in the form JSON so the
 * UI can render without additional fetches.
 */
export interface DirectionCard {
  /** The radio value — what comes back in the user's answer. Match a label in `options`. */
  id: string;
  /** Short headline on the card (e.g. "Editorial — Monocle / FT magazine"). */
  label: string;
  /** One- or two-sentence mood blurb. */
  mood: string;
  /** Real-world exemplars (≤ 4). */
  references: string[];
  /** 4–6 swatch hex / OKLch strings for the palette row. */
  palette: string[];
  /** Display (headline) font stack, used to render the live "Aa" sample. */
  displayFont: string;
  /** Body font stack, used to render the secondary sample. */
  bodyFont: string;
}

export interface FormOption {
  label: string;
  value: string;
  description?: string;
}

export interface FormQuestion {
  id: string;
  label: string;
  type: QuestionType;
  options?: FormOption[];
  placeholder?: string;
  required?: boolean;
  help?: string;
  defaultValue?: string | string[];
  /** Only applies when `type === 'checkbox'`. Caps the number of selected options. */
  maxSelections?: number;
  /** Only present when `type === 'direction-cards'`. Mapped to options by `id`. */
  cards?: DirectionCard[];
}

export interface QuestionForm {
  id: string;
  title: string;
  description?: string;
  questions: FormQuestion[];
  submitLabel?: string;
}

export type FormSegment =
  | { kind: 'text'; text: string }
  | { kind: 'form'; form: QuestionForm; raw: string };

// `question-form` is the canonical tag; `ask-question` is an alias the
// model occasionally drifts to (issue #1194). The close tag must match
// the open tag name, so each match captures the name and computes its
// own close-tag string. Treat the lookup case-insensitively at scan
// time so `<Question-Form>` and `<ASK-QUESTION>` still parse.
const OPEN_RE = /<(question-form|ask-question)\b([^>]*)>/i;

export function splitOnQuestionForms(input: string): FormSegment[] {
  const out: FormSegment[] = [];
  let cursor = 0;
  // Scan repeatedly for question-form / ask-question opens; for each,
  // locate the matching close tag and try to parse the JSON body.
  // Anything that doesn't parse cleanly stays in the prose stream.
  while (cursor < input.length) {
    const slice = input.slice(cursor);
    const m = OPEN_RE.exec(slice);
    if (!m) {
      out.push({ kind: 'text', text: slice });
      break;
    }
    const tagName = (m[1] ?? 'question-form').toLowerCase();
    const closeTag = `</${tagName}>`;
    const openStart = cursor + m.index;
    const openEnd = openStart + m[0].length;
    const closeIdx = findCloseTag(input, openEnd, closeTag);
    if (closeIdx === -1) {
      // Unterminated — leave the rest as prose so we don't swallow it.
      out.push({ kind: 'text', text: slice });
      break;
    }
    if (openStart > cursor) {
      out.push({ kind: 'text', text: input.slice(cursor, openStart) });
    }
    const body = input.slice(openEnd, closeIdx);
    const attrs = parseAttrs(m[2] ?? '');
    const form = tryParseForm(body, attrs);
    const blockEnd = closeIdx + closeTag.length;
    if (form) {
      out.push({ kind: 'form', form, raw: input.slice(openStart, blockEnd) });
    } else {
      // Malformed — keep raw text so the user can still see it.
      out.push({ kind: 'text', text: input.slice(openStart, blockEnd) });
    }
    cursor = blockEnd;
  }
  return out;
}

// First parseable form in a message, used to surface the active discovery
// form in the right-hand Questions tab instead of inline in the chat.
export function findFirstQuestionForm(
  input: string,
): { form: QuestionForm; raw: string } | null {
  for (const seg of splitOnQuestionForms(input)) {
    if (seg.kind === 'form') return { form: seg.form, raw: seg.raw };
  }
  return null;
}

// Drop a trailing, not-yet-closed question-form block from streaming text so
// the chat doesn't flash raw `<question-form>{…` markup before the JSON
// finishes. Returns the visible text plus whether such an open block existed
// (which means a form is mid-generation).
export function stripTrailingOpenQuestionForm(
  input: string,
): { text: string; hadOpenForm: boolean } {
  let cursor = 0;
  while (cursor < input.length) {
    const slice = input.slice(cursor);
    const m = OPEN_RE.exec(slice);
    if (!m) break;
    const tagName = (m[1] ?? 'question-form').toLowerCase();
    const closeTag = `</${tagName}>`;
    const openStart = cursor + m.index;
    const openEnd = openStart + m[0].length;
    const closeIdx = findCloseTag(input, openEnd, closeTag);
    if (closeIdx === -1) {
      return { text: input.slice(0, openStart), hadOpenForm: true };
    }
    cursor = closeIdx + closeTag.length;
  }
  return { text: input, hadOpenForm: false };
}

// True when a question-form open tag is present but its close tag hasn't
// streamed in yet — i.e. the model is still generating the form.
export function hasUnterminatedQuestionForm(input: string): boolean {
  return stripTrailingOpenQuestionForm(input).hadOpenForm;
}

function findCloseTag(input: string, from: number, closeTag: string): number {
  const closeLower = closeTag.toLowerCase();
  const tagLen = closeTag.length;
  const maxStart = input.length - tagLen;
  for (let i = from; i <= maxStart; i++) {
    if (input.slice(i, i + tagLen).toLowerCase() === closeLower) {
      return i;
    }
  }
  return -1;
}

function parseAttrs(raw: string): Record<string, string> {
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out[m[1] as string] = (m[2] ?? m[3] ?? '') as string;
  }
  return out;
}

function tryParseForm(body: string, attrs: Record<string, string>): QuestionForm | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  // Allow the JSON to be wrapped in a fenced ```json block — common when
  // the model echoes its own indented body.
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;
  const rawQuestions = Array.isArray(obj.questions) ? obj.questions : null;
  if (!rawQuestions) return null;
  const questions: FormQuestion[] = [];
  rawQuestions.forEach((q, i) => {
    const mapped = mapRawQuestion(q, i);
    if (mapped) questions.push(mapped);
  });
  if (questions.length === 0) return null;
  const id = attrs.id ?? (typeof obj.id === 'string' ? obj.id : 'discovery');
  const title =
    attrs.title ?? (typeof obj.title === 'string' ? obj.title : 'A few quick questions');
  const description = typeof obj.description === 'string' ? obj.description : undefined;
  const submitLabel = typeof obj.submitLabel === 'string' ? obj.submitLabel : undefined;
  return {
    id,
    title,
    questions,
    ...(description ? { description } : {}),
    ...(submitLabel ? { submitLabel } : {}),
  };
}

function mapRawQuestion(q: unknown, index: number): FormQuestion | null {
  if (!q || typeof q !== 'object') return null;
  const qo = q as Record<string, unknown>;
  const id =
    typeof qo.id === 'string' && qo.id.trim().length > 0 ? qo.id.trim() : `q${index + 1}`;
  const label = typeof qo.label === 'string' ? qo.label : id;
  const type = normalizeType(qo.type);
  const options = parseOptions(qo.options);
  const placeholder = typeof qo.placeholder === 'string' ? qo.placeholder : undefined;
  const help = typeof qo.help === 'string' ? qo.help : undefined;
  const required = qo.required === true;
  const maxSelections =
    typeof qo.maxSelections === 'number' &&
    Number.isInteger(qo.maxSelections) &&
    qo.maxSelections > 0
      ? qo.maxSelections
      : undefined;
  const cards = parseDirectionCards(qo.cards);
  const defaultValue = parseDefaultValue(qo, options);
  return {
    id,
    label,
    type,
    ...(options ? { options } : {}),
    ...(placeholder ? { placeholder } : {}),
    ...(help ? { help } : {}),
    ...(required ? { required } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(maxSelections !== undefined && type === 'checkbox' ? { maxSelections } : {}),
    ...(cards ? { cards } : {}),
  };
}

/**
 * Tolerant parser for a still-streaming `<question-form>` block. Unlike
 * {@link tryParseForm} it does not require valid, complete JSON: it reads the
 * title/id from the open tag's attrs (available the instant the tag streams in)
 * and extracts however many *complete* question objects have arrived so far.
 * This lets the Questions tab render a frame immediately and fill questions in
 * progressively as the model streams them, instead of flashing a skeleton and
 * then a finished table. Returns null only when no open tag is present.
 */
export function parsePartialQuestionForm(input: string): QuestionForm | null {
  const m = OPEN_RE.exec(input);
  if (!m) return null;
  const tagName = (m[1] ?? 'question-form').toLowerCase();
  const closeTag = `</${tagName}>`;
  const openEnd = m.index + m[0].length;
  const attrs = parseAttrs(m[2] ?? '');
  const closeIdx = findCloseTag(input, openEnd, closeTag);
  const rawBody = closeIdx === -1 ? input.slice(openEnd) : input.slice(openEnd, closeIdx);
  // Strip a leading fenced ```json wrapper; the closing fence may not have
  // streamed in yet, so only the opening fence is removed.
  const body = rawBody.replace(/^\s*```(?:json)?\s*/i, '');
  const id = attrs.id ?? extractJsonStringField(body, 'id') ?? 'discovery';
  const title =
    attrs.title ?? extractJsonStringField(body, 'title') ?? 'A few quick questions';
  const description = extractJsonStringField(body, 'description');
  const questions = extractCompleteQuestions(body);
  return {
    id,
    title,
    questions,
    ...(description ? { description } : {}),
  };
}

// Pull complete `{...}` question objects out of a partial `"questions": [ … ]`
// array, stopping at the first object whose closing brace hasn't streamed in.
function extractCompleteQuestions(body: string): FormQuestion[] {
  const keyMatch = /"questions"\s*:\s*\[/.exec(body);
  if (!keyMatch) return [];
  const out: FormQuestion[] = [];
  let i = keyMatch.index + keyMatch[0].length;
  let index = 0;
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i] as string)) i++;
    if (i >= body.length || body[i] === ']') break;
    if (body[i] !== '{') break;
    const objStr = extractBalancedObject(body, i);
    if (!objStr) break;
    try {
      const mapped = mapRawQuestion(JSON.parse(objStr), index);
      if (mapped) out.push(mapped);
    } catch {
      break;
    }
    i += objStr.length;
    index++;
  }
  return out;
}

// Return the substring for the balanced `{...}` object starting at `start`,
// or null if it never closes (string-aware so braces inside strings don't count).
function extractBalancedObject(s: string, start: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i] as string;
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

// Best-effort extraction of a top-level "field": "value" string from a partial
// JSON body — used for title/id/description before the full body parses.
function extractJsonStringField(body: string, field: string): string | undefined {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  const m = re.exec(body);
  if (!m) return undefined;
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return m[1];
  }
}

function normalizeType(raw: unknown): QuestionType {
  if (typeof raw !== 'string') return 'text';
  const lower = raw.toLowerCase().trim();
  if (lower === 'radio' || lower === 'single' || lower === 'choice') return 'radio';
  if (lower === 'checkbox' || lower === 'multi' || lower === 'multiple') return 'checkbox';
  if (lower === 'select' || lower === 'dropdown') return 'select';
  if (lower === 'textarea' || lower === 'long' || lower === 'paragraph') return 'textarea';
  if (
    lower === 'direction-cards' ||
    lower === 'directions' ||
    lower === 'cards' ||
    lower === 'direction'
  )
    return 'direction-cards';
  return 'text';
}

function parseOptions(raw: unknown): FormOption[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const options = raw
    .map(parseOption)
    .filter((option): option is FormOption => option !== null);
  return options.length > 0 ? options : undefined;
}

function parseOption(raw: unknown): FormOption | null {
  if (typeof raw === 'string') {
    const label = raw.trim();
    return label.length > 0 ? { label, value: label } : null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const label = typeof obj.label === 'string' ? obj.label.trim() : '';
  if (label.length === 0) return null;
  const value =
    typeof obj.value === 'string' && obj.value.trim().length > 0
      ? obj.value.trim()
      : label;
  const description =
    typeof obj.description === 'string' && obj.description.trim().length > 0
      ? obj.description.trim()
      : undefined;
  return {
    label,
    value,
    ...(description ? { description } : {}),
  };
}

function parseDefaultValue(
  question: Record<string, unknown>,
  options: FormOption[] | undefined,
): string | string[] | undefined {
  const raw =
    typeof question.defaultValue === 'string' || Array.isArray(question.defaultValue)
      ? question.defaultValue
      : typeof question.default === 'string'
        ? question.default
        : undefined;
  if (typeof raw === 'string') return formOptionValueForLabel({ options }, raw);
  if (Array.isArray(raw)) {
    return raw
      .filter((value): value is string => typeof value === 'string')
      .map((value) => formOptionValueForLabel({ options }, value));
  }
  return undefined;
}

function parseDirectionCards(raw: unknown): DirectionCard[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DirectionCard[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const id = typeof e.id === 'string' && e.id.trim().length > 0 ? e.id.trim() : null;
    const label = typeof e.label === 'string' ? e.label : null;
    if (id === null || label === null) continue;
    const mood = typeof e.mood === 'string' ? e.mood : '';
    const references = Array.isArray(e.references)
      ? e.references.filter((r): r is string => typeof r === 'string').slice(0, 6)
      : [];
    const palette = Array.isArray(e.palette)
      ? e.palette.filter((p): p is string => typeof p === 'string').slice(0, 8)
      : [];
    const displayFont = typeof e.displayFont === 'string' ? e.displayFont : 'Georgia, serif';
    const bodyFont =
      typeof e.bodyFont === 'string'
        ? e.bodyFont
        : '-apple-system, system-ui, sans-serif';
    out.push({ id, label, mood, references, palette, displayFont, bodyFont });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Format a finished set of answers into a prose user message that the
 * agent can read on its next turn. The shape is stable enough that the
 * agent can recognise "the form was answered" without us emitting any
 * structured wrapper.
 */
export function formatFormAnswers(
  form: QuestionForm,
  answers: Record<string, string | string[]>,
): string {
  const lines: string[] = [];
  lines.push(`[form answers — ${form.id}]`);
  for (const q of form.questions) {
    const v = answers[q.id];
    let display: string;
    if (Array.isArray(v)) {
      display = v.length > 0 ? v.map((value) => formOptionDisplayForValue(q, value)).join(', ') : '(skipped)';
    } else if (typeof v === 'string') {
      display = v.trim().length > 0 ? formOptionDisplayForValue(q, v.trim()) : '(skipped)';
    }
    else display = '(skipped)';
    lines.push(`- ${q.label}: ${display}`);
  }
  return lines.join('\n');
}

function formOptionDisplayForValue(
  question: Pick<FormQuestion, 'options'>,
  value: string,
): string {
  const match = question.options?.find((option) => option.value === value || option.label === value);
  if (!match) return value;
  if (match.value === match.label) return match.label;
  return `${match.label} [value: ${match.value}]`;
}

export function formOptionLabelForValue(
  question: Pick<FormQuestion, 'options'>,
  value: string,
): string {
  const match = question.options?.find((option) => option.value === value || option.label === value);
  return match?.label ?? value;
}

export function formOptionValueForLabel(
  question: Pick<FormQuestion, 'options'>,
  labelOrValue: string,
): string {
  const match = question.options?.find(
    (option) => option.value === labelOrValue || option.label === labelOrValue,
  );
  return match?.value ?? labelOrValue;
}

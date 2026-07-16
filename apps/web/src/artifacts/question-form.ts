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
import { parsePartialJson } from '../runtime/partial-json';

export type QuestionType =
  | 'radio'
  | 'checkbox'
  | 'select'
  | 'text'
  | 'textarea'
  | 'number'
  | 'range'
  | 'date'
  | 'time'
  | 'datetime-local'
  | 'color'
  | 'url'
  | 'email'
  | 'tel'
  | 'file'
  | 'switch'
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
  /**
   * For finite-choice controls, show a free-form override beside the generated
   * options so the user can take over a choice instead of being trapped by the
   * model's presets.
   */
  allowCustom?: boolean;
  customLabel?: string;
  customPlaceholder?: string;
  /** Numeric/range inputs only. */
  min?: number;
  max?: number;
  step?: number;
  /** File inputs only. The answer serializes selected file names, not bytes. */
  multiple?: boolean;
  /** File inputs only. Mirrors the native file input accept attribute. */
  accept?: string;
  /** Only present when `type === 'direction-cards'`. Mapped to options by `id`. */
  cards?: DirectionCard[];
}

export interface QuestionForm {
  id: string;
  title: string;
  description?: string;
  questions: FormQuestion[];
  submitLabel?: string;
  /**
   * BCP-47 tag of the language the model localized the form into (e.g.
   * "zh-CN"). Host-rendered strings inside the form card (the "Other" chip,
   * custom input copy) follow this language so a Chinese form in an English
   * UI doesn't mix scripts; absent → the app UI locale.
   */
  lang?: string;
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
      // No matching close tag found for this open tag name. The body may
      // contain an open tag of the other name (e.g. prose mentioned
      // <ask-question> but the real form uses <question-form>). Try to
      // unwind to an inner open before giving up.
      const remainder = input.slice(openEnd);
      const nestedOpen = OPEN_RE.exec(remainder);
      if (nestedOpen) {
        const resumeAt = openEnd + nestedOpen.index;
        if (openStart > cursor) {
          out.push({ kind: 'text', text: input.slice(cursor, openStart) });
        }
        out.push({ kind: 'text', text: input.slice(openStart, resumeAt) });
        cursor = resumeAt;
        continue;
      }
      // Genuinely unterminated — leave the rest as prose.
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
      cursor = blockEnd;
    } else {
      // The body between this open tag and the matched close tag isn't valid
      // JSON. If the body itself contains another question-form / ask-question
      // open tag, the outer match was a false positive (e.g. the model
      // mentioned the tag name inside backtick-quoted prose). Unwind to the
      // nested open so it gets a clean parse on the next iteration.
      const nestedOpen = OPEN_RE.exec(body);
      if (nestedOpen) {
        const resumeAt = openEnd + nestedOpen.index;
        // Text before the false-positive tag was already emitted above.
        // Slice from openStart so only the tag and the gap up to the
        // nested open are emitted — no duplication.
        out.push({ kind: 'text', text: input.slice(openStart, resumeAt) });
        cursor = resumeAt;
      } else {
        out.push({ kind: 'text', text: input.slice(openStart, blockEnd) });
        cursor = blockEnd;
      }
    }
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
  const lang = typeof obj.lang === 'string' && obj.lang.trim().length > 0 ? obj.lang.trim() : undefined;
  return {
    id,
    title,
    questions,
    ...(description ? { description } : {}),
    ...(submitLabel ? { submitLabel } : {}),
    ...(lang ? { lang } : {}),
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
  const allowCustom =
    qo.allowCustom === false
      ? false
      : qo.allowCustom === true || qo.custom === true
        ? true
        : undefined;
  const customLabel = typeof qo.customLabel === 'string' ? qo.customLabel : undefined;
  const customPlaceholder =
    typeof qo.customPlaceholder === 'string' ? qo.customPlaceholder : undefined;
  const min = parseNumberAttr(qo.min);
  const max = parseNumberAttr(qo.max);
  const step = parseNumberAttr(qo.step);
  const multiple = qo.multiple === true;
  const accept = typeof qo.accept === 'string' ? qo.accept : undefined;
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
    ...(allowCustom !== undefined ? { allowCustom } : {}),
    ...(customLabel ? { customLabel } : {}),
    ...(customPlaceholder ? { customPlaceholder } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
    ...(step !== undefined ? { step } : {}),
    ...(multiple && type === 'file' ? { multiple } : {}),
    ...(accept && type === 'file' ? { accept } : {}),
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
  // Strip the fenced ```json wrapper some models emit. The opening fence is
  // removed always; the trailing fence is removed too once it streams in
  // (possibly only a partial ``` so far) — otherwise the leftover backticks
  // make the JSON unparseable in the gap between "fence closed" and
  // "</question-form> arrived", dropping the live preview back to empty.
  const body = stripTrailingFence(rawBody.replace(/^\s*```(?:json)?\s*/i, ''));
  // Derive form-level metadata from the *parsed top-level object*, not a
  // whole-body regex scan: a nested question/option `id`/`title`/`description`
  // must not masquerade as the form's own. `id` keys the live Questions panel
  // (see ProjectView), so a mid-stream identity change would remount it.
  const parsed = parsePartialJson(body);
  const top =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  // `id` keys the live (still-editable) Questions panel, so it must be stable
  // for the whole stream. Don't adopt the *streaming* body `id`: it arrives
  // char-by-char and `parsePartialJson` repairs the open string, so it would
  // churn (`"d"` → `"di"` → …) and remount the panel. Adopt the body id only
  // once its string literal is fully terminated — then it equals the id the
  // final parse (`tryParseForm`) assigns, so there's also no preview→final
  // remount. The open-tag attr (complete the instant the tag streams) wins,
  // and a stable default covers the gap before any id is known.
  const topTitle = typeof top.title === 'string' && top.title.trim().length > 0 ? top.title : undefined;
  const id = attrs.id ?? completeTopLevelString(body, 'id') ?? 'discovery';
  const title = attrs.title ?? topTitle ?? 'A few quick questions';
  const description = typeof top.description === 'string' ? top.description : undefined;
  // Carry submitLabel through the preview too — `tryParseForm` reads it for the
  // final form and `QuestionForm` renders `form.submitLabel ?? default`, so
  // omitting it here makes a custom CTA flicker in only once the close tag
  // arrives.
  const submitLabel = typeof top.submitLabel === 'string' ? top.submitLabel : undefined;
  // Adopt `lang` only once its string literal is fully terminated (same
  // churn-avoidance as `id`): a partially streamed "zh-C" would briefly
  // resolve to the wrong dictionary.
  const lang = completeTopLevelString(body, 'lang');
  const questions = shapeStreamingQuestions(top.questions, countClosedQuestionObjects(body));
  return {
    id,
    title,
    questions,
    ...(description ? { description } : {}),
    ...(submitLabel ? { submitLabel } : {}),
    ...(lang ? { lang } : {}),
  };
}

// Strip a trailing ```` ``` ```` fence (possibly only partially streamed) from
// a form body — but only when those backticks are the closing wrapper, not
// content of a JSON string value still being typed. Stripping unconditionally
// would eat real backticks from a label like `"Use ``` ..."` mid-stream.
function stripTrailingFence(body: string): string {
  const m = /\s*`{1,3}\s*$/.exec(body);
  if (!m) return body;
  const before = body.slice(0, m.index);
  // If the text before the trailing backticks ends inside an open JSON string,
  // the backticks belong to that value — leave them for the repair pass.
  if (endsInsideJsonString(before)) return body;
  return before;
}

function endsInsideJsonString(s: string): boolean {
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
    }
  }
  return inStr;
}

// Shape questions from a still-streaming, already-parsed `questions` array.
// Unlike a complete-objects-only pass, the repaired prefix (see
// `parsePartialJson`) means a question shows the moment its `label` (prompt)
// text exists and its options grow in one at a time — true token-by-token
// streaming, matching the question-form card. The trailing in-flight object
// with no label yet is held back (no "q1" placeholder flicker); it appears
// once its label lands.
// Return a top-level (depth-1) string field's value ONLY if its string literal
// is fully terminated in the (possibly partial) body. Used to adopt the form
// `id` from a streaming body without churn: while the value is still arriving
// it returns undefined (caller keeps the stable default); once the closing
// quote lands it returns the final value. Depth-aware so a nested question
// `id` can't be mistaken for the form's own.
function completeTopLevelString(body: string, field: string): string | undefined {
  const marker = `"${field}"`;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '{' || c === '[') {
      depth++;
      continue;
    }
    if (c === '}' || c === ']') {
      depth--;
      continue;
    }
    if (c === '"') {
      if (depth === 1 && body.startsWith(marker, i)) {
        let j = i + marker.length;
        while (j < body.length && /\s/.test(body[j] as string)) j++;
        if (body[j] !== ':') {
          inStr = true; // it's a value string, not our key — skip it
          continue;
        }
        j++;
        while (j < body.length && /\s/.test(body[j] as string)) j++;
        if (body[j] !== '"') return undefined; // value not a (started) string
        let value = '';
        let vesc = false;
        for (let k = j + 1; k < body.length; k++) {
          const vc = body[k] as string;
          if (vesc) {
            value += vc;
            vesc = false;
          } else if (vc === '\\') {
            value += vc;
            vesc = true;
          } else if (vc === '"') {
            try {
              return JSON.parse(`"${value}"`) as string;
            } catch {
              return value;
            }
          } else {
            value += vc;
          }
        }
        return undefined; // closing quote hasn't streamed yet
      }
      inStr = true;
    }
  }
  return undefined;
}

function shapeStreamingQuestions(rawQuestions: unknown, closedCount: number): FormQuestion[] {
  if (!Array.isArray(rawQuestions)) return [];
  const out: FormQuestion[] = [];
  rawQuestions.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;
    const q = raw as Record<string, unknown>;
    const label = q.label;
    if (typeof label !== 'string' || label.trim().length === 0) return;
    // Surface a question only once its canonical id is determinable, so the
    // preview id is identical to the id the final parse assigns — `id` keys
    // both the rendered field and the user's answer in the still-editable
    // panel, so a mismatch would orphan an in-progress answer (mid-stream when
    // a late id replaces the fallback, and again at the preview→final swap).
    //   - object's braces have streamed (closed) → its id is final, whether a
    //     real `id` or `mapRawQuestion`'s `q${index+1}` fallback → show it.
    //   - in-flight (last, not yet closed) object WITH an `id` → id is stable
    //     even as more fields stream → show it (options keep growing).
    //   - in-flight object with no id yet → it may still gain one; hold back.
    const isClosed = index < closedCount;
    const hasId = typeof q.id === 'string' && q.id.trim().length > 0;
    if (!isClosed && !hasId) return;
    const mapped = mapRawQuestion(raw, index);
    if (mapped) {
      // The trailing in-flight object may hold a MID-STREAM `default`: the
      // partial-JSON repair terminates it early ("单位教育" → "单位教",
      // ["历史背景与经过", "抗战精神…"] → ["历史背景与经过", "抗战精"]).
      // The card adopts a streamed default only while the answer is still
      // empty, so surfacing a truncated one would freeze garbage the
      // completed value can never overwrite. A closed object's braces are
      // balanced, so its default is complete — only then expose it.
      if (!isClosed && mapped.defaultValue !== undefined) delete mapped.defaultValue;
      out.push(mapped);
    }
  });
  return out;
}

// Count how many question objects in a partial `"questions": [ … ]` body have
// their closing brace already streamed (string-aware). A closed object's id is
// final (real `id` or the `q${index+1}` fallback), so it's safe to surface;
// only the trailing still-open object might still gain an `id`.
function countClosedQuestionObjects(body: string): number {
  const keyMatch = /"questions"\s*:\s*\[/.exec(body);
  if (!keyMatch) return 0;
  let i = keyMatch.index + keyMatch[0].length;
  let count = 0;
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i] as string)) i++;
    if (i >= body.length || body[i] === ']') break;
    if (body[i] !== '{') break;
    const obj = extractBalancedObject(body, i);
    if (!obj) break; // trailing object hasn't closed yet
    count++;
    i += obj.length;
  }
  return count;
}

// Return the substring for the balanced `{...}` object starting at `start`, or
// null if it never closes (string-aware so braces inside strings don't count).
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

function normalizeType(raw: unknown): QuestionType {
  if (typeof raw !== 'string') return 'text';
  const lower = raw.toLowerCase().trim();
  if (lower === 'radio' || lower === 'single' || lower === 'choice') return 'radio';
  if (lower === 'checkbox' || lower === 'multi' || lower === 'multiple') return 'checkbox';
  if (lower === 'select' || lower === 'dropdown') return 'select';
  if (lower === 'textarea' || lower === 'long' || lower === 'paragraph') return 'textarea';
  if (lower === 'number' || lower === 'numeric') return 'number';
  if (lower === 'range' || lower === 'slider') return 'range';
  if (lower === 'date') return 'date';
  if (lower === 'time') return 'time';
  if (
    lower === 'datetime-local' ||
    lower === 'datetime' ||
    lower === 'date-time' ||
    lower === 'datetime_local'
  )
    return 'datetime-local';
  if (lower === 'color' || lower === 'colour' || lower === 'color-picker') return 'color';
  if (lower === 'url' || lower === 'link') return 'url';
  if (lower === 'email') return 'email';
  if (lower === 'tel' || lower === 'phone') return 'tel';
  if (lower === 'file' || lower === 'upload' || lower === 'attachment') return 'file';
  if (lower === 'switch' || lower === 'toggle' || lower === 'boolean') return 'switch';
  if (
    lower === 'direction-cards' ||
    lower === 'directions' ||
    lower === 'cards' ||
    lower === 'direction'
  )
    return 'direction-cards';
  return 'text';
}

function parseNumberAttr(raw: unknown): number | undefined {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
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
      : typeof question.defaultValue === 'number' || typeof question.defaultValue === 'boolean'
        ? String(question.defaultValue)
      : typeof question.default === 'string' || Array.isArray(question.default)
        ? question.default
        : typeof question.default === 'number' || typeof question.default === 'boolean'
          ? String(question.default)
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

/**
 * Compute the styled-token overlay parts for the homepage prompt composer.
 *
 * The composer is a plain `<textarea>` whose value is the raw prompt. A
 * positioned overlay above it renders template slots (e.g.
 * `{{page-count}}`) as `<InlinePromptInput>` chips and inline mentions as
 * `<InlineMentionToken>` chips. Both are visually styled and need to
 * survive the user editing the surrounding literal text in the textarea.
 *
 * Pre-#2090, the highlight builder required the rendered template to
 * equal the textarea prompt byte-for-byte. The first keystroke broke
 * that invariant and the overlay disappeared — the chips dropped out
 * even though every slot's text was still right there in the prompt.
 *
 * The lenient algorithm in `buildPromptHighlightParts` walks the
 * template slot-by-slot and searches for each slot's rendered text in
 * the (possibly edited) prompt, in order, without overlap. Edits to
 * literal text between slots are folded into the surrounding `text`
 * parts; the slot chips themselves are preserved. We only drop back to
 * plain-text overlay when a slot's text has actually been removed.
 */

export interface PromptHighlightPart {
  kind: 'text' | 'slot';
  text: string;
  key?: string;
  filled?: boolean;
}

export const INPUT_PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z_][\w-]*)\s*\}\}/g;

export function stringifyTemplateValue(
  value: unknown,
  placeholder: string,
): { text: string; filled: boolean } {
  if (value === undefined || value === null || value === '') {
    return { text: placeholder, filled: false };
  }
  return { text: String(value), filled: true };
}

interface TemplateSlot {
  key: string;
  text: string;
  filled: boolean;
}

interface TemplateScan {
  literalBefore: string[]; // length = slots.length + 1 (one trailing)
  slots: TemplateSlot[];
}

function scanTemplate(
  template: string,
  values: Record<string, unknown>,
): TemplateScan {
  INPUT_PLACEHOLDER_PATTERN.lastIndex = 0;
  const literalBefore: string[] = [];
  const slots: TemplateSlot[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INPUT_PLACEHOLDER_PATTERN.exec(template)) !== null) {
    const placeholder = match[0];
    const key = match[1];
    if (!key) continue;
    literalBefore.push(template.slice(lastIndex, match.index));
    const replacement = stringifyTemplateValue(values[key], placeholder);
    slots.push({ key, text: replacement.text, filled: replacement.filled });
    lastIndex = match.index + placeholder.length;
  }
  literalBefore.push(template.slice(lastIndex));
  return { literalBefore, slots };
}

export function buildPromptHighlightParts(
  template: string | null,
  values: Record<string, unknown>,
  prompt: string,
): PromptHighlightPart[] | null {
  if (!template) return null;
  const { slots } = scanTemplate(template, values);
  if (slots.length === 0) return null;

  // Walk the prompt, claiming each slot's text in order. The cursor only
  // moves forward, so a slot's text in the prompt cannot be re-used by a
  // later slot — duplicate slot values map to their distinct positions.
  const parts: PromptHighlightPart[] = [];
  let cursor = 0;
  for (const slot of slots) {
    if (!slot.text) return null;
    const found = prompt.indexOf(slot.text, cursor);
    if (found < 0) return null;
    if (found > cursor) {
      parts.push({ kind: 'text', text: prompt.slice(cursor, found) });
    }
    parts.push({ kind: 'slot', key: slot.key, text: slot.text, filled: slot.filled });
    cursor = found + slot.text.length;
  }
  if (cursor < prompt.length) {
    parts.push({ kind: 'text', text: prompt.slice(cursor) });
  }
  return parts;
}

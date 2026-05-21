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

/**
 * Score a slot-text occurrence against the template's adjacent literals.
 * Each character that matches the trailing portion of the preceding
 * literal (or the leading portion of the following literal) earns one
 * point. The highest-scoring occurrence wins; this is what stops a
 * user-typed `birds` between `5 ` and `page deck` from stealing the
 * topic slot away from the real `about birds.` later in the prompt.
 * Reviewer @nettee on #2329.
 */
function scoreSlotMatch(
  prompt: string,
  idx: number,
  slotText: string,
  literalBefore: string,
  literalAfter: string,
): number {
  let score = 0;
  const maxBackward = Math.min(literalBefore.length, idx);
  for (let k = 0; k < maxBackward; k += 1) {
    if (prompt[idx - 1 - k] !== literalBefore[literalBefore.length - 1 - k]) break;
    score += 1;
  }
  const afterIdx = idx + slotText.length;
  const maxForward = Math.min(literalAfter.length, prompt.length - afterIdx);
  for (let k = 0; k < maxForward; k += 1) {
    if (prompt[afterIdx + k] !== literalAfter[k]) break;
    score += 1;
  }
  return score;
}

export function buildPromptHighlightParts(
  template: string | null,
  values: Record<string, unknown>,
  prompt: string,
): PromptHighlightPart[] | null {
  if (!template) return null;
  const { literalBefore, slots } = scanTemplate(template, values);
  if (slots.length === 0) return null;

  // Walk the prompt, claiming each slot's text in order. The cursor only
  // moves forward, so a slot's text in the prompt cannot be re-used by a
  // later slot — duplicate slot values map to their distinct positions.
  //
  // When the same slot value appears in multiple places (because the
  // user typed prose that happens to include it), pick the occurrence
  // whose surrounding context best matches the template literals on
  // either side. Highest score wins; ties keep the earliest match.
  const parts: PromptHighlightPart[] = [];
  let cursor = 0;
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i]!;
    if (!slot.text) return null;
    const before = literalBefore[i] ?? '';
    const after = literalBefore[i + 1] ?? '';
    let bestIndex = -1;
    let bestScore = -1;
    let from = cursor;
    while (true) {
      const candidate = prompt.indexOf(slot.text, from);
      if (candidate < 0) break;
      const score = scoreSlotMatch(prompt, candidate, slot.text, before, after);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = candidate;
      }
      from = candidate + 1;
    }
    if (bestIndex < 0) return null;
    if (bestIndex > cursor) {
      parts.push({ kind: 'text', text: prompt.slice(cursor, bestIndex) });
    }
    parts.push({ kind: 'slot', key: slot.key, text: slot.text, filled: slot.filled });
    cursor = bestIndex + slot.text.length;
  }
  if (cursor < prompt.length) {
    parts.push({ kind: 'text', text: prompt.slice(cursor) });
  }
  return parts;
}

/**
 * Multi-select next-step suggestions live in the composer draft as whole lines.
 *
 * A suggestion counts as *selected* exactly when the draft contains its lines as
 * a contiguous block of whole lines. Selection is therefore derived from the
 * draft instead of being tracked separately: clearing or editing the draft by
 * hand un-selects the row, and a suggestion's words inside a longer sentence the
 * user typed are never mistaken for the suggestion.
 *
 * Text is compared the way the editor stores it: one paragraph per line, blank
 * lines collapsed (see `LexicalComposerInput.getText`), so a payload such as an
 * image suggestion ("label\n\n<path>") still matches what the editor returns.
 */

/** Read-only view of the composer draft that the suggestion rows subscribe to. */
export interface SuggestionDraftStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => string;
}

/** Normalize like the editor does: LF newlines, no empty lines in a row. */
export function normalizeDraftText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/\n{2,}/g, '\n');
}

function blockLines(suggestion: string): string[] {
  return normalizeDraftText(suggestion)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, index, all) => !(line === '' && (index === 0 || index === all.length - 1)));
}

function findBlock(draftLines: string[], block: string[]): number {
  if (block.length === 0) return -1;
  for (let start = 0; start + block.length <= draftLines.length; start += 1) {
    if (block.every((line, offset) => draftLines[start + offset]!.trimEnd() === line)) return start;
  }
  return -1;
}

/** True when the draft contains the suggestion as a block of whole lines. */
export function isSuggestionInDraft(draft: string, suggestion: string): boolean {
  return findBlock(normalizeDraftText(draft).split('\n'), blockLines(suggestion)) !== -1;
}

/** Append the suggestion as its own line(s); a no-op if it is already there. */
export function addSuggestionToDraft(draft: string, suggestion: string): string {
  const block = blockLines(suggestion);
  if (block.length === 0) return draft;
  if (isSuggestionInDraft(draft, suggestion)) return draft;
  const added = block.join('\n');
  return draft.trim().length === 0 ? added : `${draft.replace(/\s+$/, '')}\n${added}`;
}

/**
 * Remove exactly one occurrence of the suggestion's whole lines. Text that merely
 * contains the suggestion's words, or lines of other suggestions, stay untouched.
 */
export function removeSuggestionFromDraft(draft: string, suggestion: string): string {
  const lines = normalizeDraftText(draft).split('\n');
  const block = blockLines(suggestion);
  const start = findBlock(lines, block);
  if (start === -1) return draft;
  lines.splice(start, block.length);
  return lines.join('\n');
}

export function toggleSuggestionInDraft(draft: string, suggestion: string, selected: boolean): string {
  return selected ? addSuggestionToDraft(draft, suggestion) : removeSuggestionFromDraft(draft, suggestion);
}

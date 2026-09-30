export interface ComposerUnsentWorkInput {
  draft: string;
  queuedNoteCount: number;
  freshImageCount: number;
  /** Note of the saved comment the composer has open; null for a new comment. */
  savedNote: string | null;
}

/**
 * Whether the comment composer holds work that retargeting it would throw
 * away: queued notes, freshly attached images, or draft text. For an opened
 * saved comment the draft only counts once it differs from the saved note,
 * the same rule the composer uses to enable Save.
 */
export function composerHasUnsentWork(input: ComposerUnsentWorkInput): boolean {
  if (input.queuedNoteCount > 0 || input.freshImageCount > 0) return true;
  const draft = input.draft.trim();
  if (input.savedNote !== null) return draft !== input.savedNote.trim();
  return draft.length > 0;
}

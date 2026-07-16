import type { WhatsNewContent, WhatsNewResponse } from '../types';

// Decides when the post-update "what's new" card shows on the home surface.
// The card is driven by content identity, not the app version: the hosted
// highlights document carries an `id`, the client remembers the last id it
// showed, and the card opens whenever the current id differs from it. Showing
// on the very first sight (no stored id yet) is intentional — the document is
// hand-curated by operators, so a fresh profile that has never seen the current
// highlight should still see it once, then never again until the id changes.

export const WHATS_NEW_LAST_SEEN_STORAGE_KEY = 'od-whats-new-last-seen-id';

export type WhatsNewPromptDecision = 'show' | 'none';

export function resolveWhatsNewPrompt(
  info: Pick<WhatsNewResponse, 'id' | 'content'>,
  lastSeenId: string | null,
): WhatsNewPromptDecision {
  // No valid highlight to show (empty, unreachable, or malformed document).
  if (info.id == null || info.content == null) return 'none';
  // Already shown for this highlight.
  if (info.id === lastSeenId) return 'none';
  return 'show';
}

export function readLastSeenWhatsNewId(storage: Pick<Storage, 'getItem'> = window.localStorage): string | null {
  try {
    const value = storage.getItem(WHATS_NEW_LAST_SEEN_STORAGE_KEY);
    return value != null && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function markWhatsNewSeen(
  id: string,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): void {
  try {
    storage.setItem(WHATS_NEW_LAST_SEEN_STORAGE_KEY, id);
  } catch {
    // Private-mode storage failures just mean the card may show again.
  }
}

/** Resolves the card copy for a locale, overlaying locale overrides on the base fields. */
export function localizedWhatsNewContent(
  content: WhatsNewContent,
  locale: string,
): { title: string; body: string; linkUrl: string | null } {
  const override = content.locales?.[locale] ?? content.locales?.[locale.split('-')[0] ?? ''] ?? null;
  return {
    title: override?.title ?? content.title,
    body: override?.body ?? content.body,
    linkUrl: override?.linkUrl ?? content.linkUrl ?? null,
  };
}

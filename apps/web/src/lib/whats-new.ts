import type { WhatsNewContent, WhatsNewResponse } from '../types';

// Decides when the post-update "what's new" dialog shows on the home surface.
// It is driven by content identity, not the app version: the hosted highlights
// document carries an `id`, the client remembers the last id it showed, and the
// dialog opens whenever the current id differs from it. Showing on the very
// first sight (no stored id yet) is intentional — the document is hand-curated
// by operators, so a fresh profile that has never seen the current highlight
// should still see it once, then never again until the id changes.
//
// The surface is a modal dialog, so EVERY close path spends the highlight:
// `markWhatsNewSeen` runs from the Close button, the CTA, the backdrop and
// Escape alike. The earlier non-modal toast deliberately exempted Escape — that
// exemption is retired, because a focus-trapping dialog cannot receive an
// Escape aimed at other UI.

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

/**
 * Splits a highlights document body into the dialog's bullet rows.
 *
 * The hosted document carries the highlights as one `body` string, one per
 * line. Blank lines and leading list markers ("-", "*", "•") are operator
 * formatting, not content, so they never reach the rendered row. A body with no
 * line breaks yields exactly one bullet.
 */
export function whatsNewNotesFromBody(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .filter((line) => line.length > 0);
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

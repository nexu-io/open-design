import type { WhatsNewContent, WhatsNewResponse } from '../types';

// Decides when the post-update "what's new" card shows on the home surface.
// The card shows at most once per version: the last version the user saw is
// persisted locally, and only a version change after that baseline opens the
// card. A fresh profile records a baseline silently so new installs are not
// greeted with an update card for a version they just installed.

export const WHATS_NEW_LAST_SEEN_STORAGE_KEY = 'od-whats-new-last-seen-version';

const RELEASE_CHANNELS = new Set(['beta', 'prerelease', 'preview', 'stable']);
const VERSION_FALLBACK = '0.0.0';

export type WhatsNewPromptDecision = 'show' | 'baseline' | 'none';

export function resolveWhatsNewPrompt(
  info: Pick<WhatsNewResponse, 'version' | 'channel' | 'content'>,
  lastSeenVersion: string | null,
): WhatsNewPromptDecision {
  // A daemon that could not resolve its own version must not spend the
  // one-shot prompt (and must not move the baseline) on '0.0.0'.
  if (info.version === VERSION_FALLBACK) return 'none';
  if (lastSeenVersion == null) return 'baseline';
  if (lastSeenVersion === info.version) return 'none';
  // Development builds bump versions constantly; only prompt there when the
  // feed actually carries highlights (e.g. pointing OD_UPDATE_METADATA_URL at
  // a fixture), so contributors are not nagged on every package.json bump.
  if (!RELEASE_CHANNELS.has(info.channel) && info.content == null) return 'baseline';
  return 'show';
}

export function readLastSeenWhatsNewVersion(storage: Pick<Storage, 'getItem'> = window.localStorage): string | null {
  try {
    const value = storage.getItem(WHATS_NEW_LAST_SEEN_STORAGE_KEY);
    return value != null && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function markWhatsNewSeen(
  version: string,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): void {
  try {
    storage.setItem(WHATS_NEW_LAST_SEEN_STORAGE_KEY, version);
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

// Release "what's new" card contract. The daemon reads the release feed
// metadata.json for its channel and forwards the optional `whatsNew` block
// when (and only when) the feed describes the currently running version, so
// the web home surface can show a one-time post-update highlight card.

/** Per-locale overrides; keys match apps/web i18n locale ids (e.g. 'zh-CN'). */
export interface WhatsNewLocaleContent {
  title?: string;
  body?: string;
  linkUrl?: string;
}

export interface WhatsNewContent {
  title: string;
  body: string;
  /** HTTPS image shown beside the copy; omitted renders a text-only card. */
  imageUrl?: string;
  /** HTTPS link for the "See what's new" action; falls back to `releaseUrl`. */
  linkUrl?: string;
  locales?: Record<string, WhatsNewLocaleContent>;
}

export interface WhatsNewResponse {
  version: string;
  channel: string;
  /** Null when the feed has no highlights for the running version. */
  content: WhatsNewContent | null;
  /** GitHub release (stable) or releases index fallback link. */
  releaseUrl: string;
}

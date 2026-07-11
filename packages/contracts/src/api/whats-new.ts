// Release "what's new" card contract. The daemon reads a single hosted
// highlights document (a dedicated R2 object; see the daemon whats-new
// service) and forwards its content to the web home surface so it can show a
// one-time post-update highlight card. Content identity — not the app version
// — drives the once-only behavior: the card shows once per `id`, so operators
// change the `id` in the hosted file whenever they want the card to re-appear.

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
  /** HTTPS link for the "See what's new" action. */
  linkUrl?: string;
  locales?: Record<string, WhatsNewLocaleContent>;
}

export interface WhatsNewResponse {
  /** Running app version — for display and analytics only, NOT the show key. */
  version: string;
  /**
   * Stable identity of the current highlight. The home card shows at most once
   * per id: the client records the last id it showed and only re-opens when the
   * id changes. Null when the hosted document has no valid highlight to show.
   */
  id: string | null;
  /** Null when the hosted document is empty, unreachable, or malformed. */
  content: WhatsNewContent | null;
}

// Release "what's new" contract. The daemon reads a single hosted highlights
// document (a dedicated R2 object; see the daemon whats-new service) and
// forwards its content to the web home surface so it can show a one-time
// post-update highlight dialog. Content identity — not the app version —
// drives the once-only behavior: it shows once per `id`, so operators change
// the `id` in the hosted file whenever they want it to re-appear.

/** Per-locale overrides; keys match apps/web i18n locale ids (e.g. 'zh-CN'). */
export interface WhatsNewLocaleContent {
  title?: string;
  body?: string;
  linkUrl?: string;
}

export interface WhatsNewContent {
  /** Release headline; labels the highlight bullets under the dialog title. */
  title: string;
  /** Highlights, one per line — the client renders each line as one bullet. */
  body: string;
  /** HTTPS cover art, inset at the top of the dialog; omitted renders no cover. */
  imageUrl?: string;
  /** HTTPS link the "view the release notes" action opens. */
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

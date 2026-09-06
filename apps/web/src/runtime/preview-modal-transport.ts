import { buildSrcdoc } from './srcdoc';

/**
 * Choose how one preview-modal stage frame receives its document.
 *
 * The invariant this module exists to hold: the document a user is looking at
 * lives at the one real URL the daemon already serves for it. `buildSrcdoc`
 * manufactures a *second* document out of the source text, and that copy has
 * neither the original's directory semantics (relative script / style / image
 * / font / dynamic-import URLs resolve against the host page instead of the
 * document's own folder — a leading cause of blank previews) nor any of its
 * live state. srcdoc remains correct for off-screen rendering and thumbnails,
 * and it stays here only as the compatibility fallback for callers that own no
 * URL for the HTML they hold.
 */

/**
 * Bridges the URL transport must ask the daemon to inject so a real-URL
 * document behaves exactly like the srcdoc this modal used to build.
 *
 * `buildSrcdoc` unconditionally installs the opaque-origin storage shim, the
 * redirect guard, and the snapshot bridge; the modal's "Export as image"
 * fallback (`requestPreviewSnapshot`) talks to that last one. Keeping the list
 * pinned to exact parity is deliberate: a transport change must not smuggle in
 * new runtime behavior, and must not silently drop existing behavior either.
 */
export const PREVIEW_MODAL_BRIDGE_TOKENS = [
  'sandbox',
  'redirect',
  'snapshot',
] as const;

const PREVIEW_MODAL_BRIDGE_QUERY = PREVIEW_MODAL_BRIDGE_TOKENS
  .map((token) => `odPreviewBridge=${token}`)
  .join('&');

export type PreviewModalSrcdocReason =
  /** The caller holds HTML but no URL that serves it. */
  | 'no-document-url'
  /**
   * Deck paging is a Preview Runtime capability negotiated *after* navigation,
   * and the catalogue preview routes (skills / plugins / design systems) do not
   * serve a Preview Runtime yet. Rebuilding the deck bridge into a srcdoc copy
   * is the only way to keep slide handling working, so deck views stay on the
   * fallback until those routes mint preview sessions.
   */
  | 'deck-runtime-unavailable';

export type PreviewModalTransport =
  | { mode: 'url-load'; src: string }
  | { mode: 'srcdoc'; srcDoc: string; reason: PreviewModalSrcdocReason };

/**
 * Attach the bridge query to a document URL without disturbing the rest of it.
 *
 * The URL arrives already carrying its workspace navigation scope (an iframe
 * navigation cannot send the `x-od-workspace-*` headers the fetch path uses),
 * and may carry a fragment. Appending after a fragment would put the query
 * inside the hash, so the fragment is split off and restored.
 */
export function previewModalDocumentUrl(url: string): string {
  const [beforeHash = '', ...hashParts] = url.split('#');
  const hash = hashParts.length > 0 ? `#${hashParts.join('#')}` : '';
  // An URL that already declares bridges is authoritative; a second copy of
  // the query would make the daemon inject nothing new and only confuse the
  // request signature used for caching.
  if (beforeHash.includes('odPreviewBridge=')) return url;
  const separator = beforeHash.includes('?') ? '&' : '?';
  return `${beforeHash}${separator}${PREVIEW_MODAL_BRIDGE_QUERY}${hash}`;
}

export interface PreviewModalTransportInput {
  /** Source text for the document. Still needed for exports and PDF. */
  html: string | null | undefined;
  /** The one real URL that serves this document, when the caller owns one. */
  url?: string | null;
  deck?: boolean;
}

/** Resolve the transport for one stage frame. */
export function resolvePreviewModalTransport({
  html,
  url,
  deck = false,
}: PreviewModalTransportInput): PreviewModalTransport {
  const documentUrl = typeof url === 'string' && url.length > 0 ? url : null;
  if (documentUrl && !deck) {
    return { mode: 'url-load', src: previewModalDocumentUrl(documentUrl) };
  }
  return {
    mode: 'srcdoc',
    srcDoc: html ? buildSrcdoc(html, { deck }) : '',
    reason: documentUrl ? 'deck-runtime-unavailable' : 'no-document-url',
  };
}

export interface CommentTargetTitleInput {
  elementId: string;
  label: string;
  text: string;
  htmlHint: string;
}
export type CommentTargetKind = 'pin' | 'image' | 'control' | 'link' | 'text' | 'section' | 'page' | 'area';
export interface CommentTargetTitle { kind: CommentTargetKind; name?: string }

/** Decode only serialized attribute entities, never interpret the result as HTML. */
function decodeAttribute(value: string): string {
  const named = new Map([['amp', '&'], ['quot', '"'], ['apos', "'"], ['lt', '<'], ['gt', '>'], ['nbsp', ' ']]);
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (original, entity: string) => {
    if (entity[0] !== '#') return named.get(entity.toLowerCase()) ?? original;
    const code = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code) : '\uFFFD';
  });
}

function screenLabel(htmlHint: string): string {
  // Match only a complete root opening tag. Tokenizing attributes avoids treating
  // data-screen-label text inside a title/style value as an actual attribute.
  const opening = /^\s*<[a-z][\w:-]*\b((?:"[^"]*"|'[^']*'|[^'">])*)>/i.exec(htmlHint);
  if (!opening) return '';
  const attributes = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of (opening[1] ?? '').matchAll(attributes)) {
    if (match[1]?.toLowerCase() === 'data-screen-label') {
      return decodeAttribute(match[2] ?? match[3] ?? match[4] ?? '');
    }
  }
  return '';
}

/**
 * Shared presentation rule for OD and public-share consumers (no DOM/React/I/O).
 * Pin/page semantics first; otherwise explicit data-screen-label, then the
 * persisted element-text snapshot, then a localized type supplied by the UI.
 * label/elementId are classification hints, NEVER names. text is element text,
 * not the comment body (PreviewComment.note). htmlHint may be opening-tag-only;
 * do not pretend it contains recoverable visible text or evaluate its markup.
 * Normalize names to one line; UI owns width-dependent ellipsis, not locale-
 * dependent arbitrary character clipping. Render name as text, never HTML.
 */
export function resolveCommentTargetTitle(comment: CommentTargetTitleInput): CommentTargetTitle {
  if (comment.elementId.startsWith('pin-')) return { kind: 'pin' };
  if (comment.elementId.startsWith('file-comment-') || comment.label.trim().toLowerCase().endsWith('.html')) return { kind: 'page' };
  for (const [index, candidate] of [screenLabel(comment.htmlHint), comment.text].entries()) {
    const name = candidate.replace(/\s+/gu, ' ').trim();
    // Screen-only anchors use their human label as elementId. Preserve those,
    // but reject machine-shaped identical ids and reserved synthetic anchors.
    const internalId = name === comment.elementId.trim()
      && (index !== 0 || /^[\w]+(?:[-_.:/][\w]+)+$/u.test(name));
    if (name && !internalId && !/^(?:pin-|file-comment-)/i.test(name)) {
      return { kind: 'text', name };
    }
  }
  const label = comment.label.trim().toLowerCase();
  const htmlHint = comment.htmlHint.trim().toLowerCase();
  const source = `${label} ${htmlHint} ${comment.elementId.toLowerCase()}`;
  if (/\b(?:img|picture|video|canvas|svg)\b/.test(source)) return { kind: 'image' };
  if (/\b(?:button|input|textarea|select|label)\b/.test(source)) return { kind: 'control' };
  if (/^<a\b/.test(htmlHint)) return { kind: 'link' };
  if (/\b(?:h1|h2|h3|h4|h5|h6|p|span|strong|em|small|li|dt|dd)\b/.test(source)) return { kind: 'text' };
  if (/\b(?:section|main|header|footer|nav|article|aside)\b/.test(source)) return { kind: 'section' };
  return { kind: comment.text.trim() ? 'text' : 'area' };
}

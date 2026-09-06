/**
 * Streaming half of the `<od-next key="…">` marker (shape lives in
 * `@open-design/contracts`, `api/next-step-marker`).
 *
 * Two hard requirements, both of them scars:
 *
 *  1. **Never flash half a tag.** SSE cuts the stream wherever it likes, so a
 *     delta can end mid-marker — `<od-ne`, or `<od-next key="a7f`. Anything we
 *     cannot yet prove is prose gets held back until the next delta resolves
 *     it. `<od-title>` shipped without a wide enough look-back once and users
 *     watched a half tag paint and then vanish.
 *
 *  2. **Never swallow the user's words.** Holding back is a bet that more
 *     characters are coming. When the stream ends and the bet was wrong — the
 *     held tail was just prose that happened to start with `<` — `flush()`
 *     returns it verbatim. Silently eating a sentence is worse than briefly
 *     delaying one.
 *
 * Stripping is unconditional; only *acceptance* is keyed. A marker with the
 * wrong key, no key, or a malformed one is still removed from the visible
 * text and simply produces no suggestions.
 *
 * ---
 *
 * **Known duplication — read before "fixing" this in isolation.**
 *
 * Five hand-written streaming tag scanners live in this daemon, all the same
 * shape (hold an ambiguous tail, release or drop it when the next delta
 * decides) and all with *different* rules:
 *
 *   · `next-step-marker.ts`      — this file. Quote-aware tag-end scan, holds
 *                                  256 chars, drops a half tag.
 *   · `artifact-focus-marker.ts` — plain `indexOf('>')` plus a tag-name
 *                                  boundary check, holds 4096, drops a half tag.
 *   · `title-marker.ts`          — open/close pair, no attributes at all,
 *                                  holds 512, and on overflow *swallows* the
 *                                  content instead of releasing it.
 *   · `panel-grammar-strip.ts`   — matches on the tag NAME only, holds 96.
 *   · `role-marker-guard.ts`     — its own `pending`/`tail` withhold buffer.
 *
 * Four caps (96/256/512/4096) and two mutually contradictory overflow policies
 * (release-as-prose vs swallow) is one bug surface, not five. It has already
 * paid out twice: `<PANELIST role=…>` reached the chat because the name-only
 * matcher could not see attributes, and `<od-next … value="…` reached the chat
 * (and the database) because the quote-aware scan below could be poisoned by an
 * unterminated quote.
 *
 * Consolidating them is the right end state and is deliberately NOT done here:
 * `panel-grammar-strip.ts` was being fixed in parallel, and collapsing five
 * scanners into one needs its own change with a behavioural diff against real
 * transcripts, not a drive-by merge inside a bug fix. If you are the next
 * person here, that is the ticket to write — do not rediscover this list.
 */

import {
  MAX_NEXT_STEP_SUGGESTIONS,
  OD_NEXT_KEY_ATTR_RE,
  OD_NEXT_OPEN_TAG,
  parseNextStepMarkerValue,
  parseNextStepSuggestions,
} from '@open-design/contracts';

/** Tolerates `</od-next >`, which models write often enough to matter. */
const CLOSE_TAG_RE = /<\/od-next\s*>/i;

export interface NextStepMarkerStripper {
  strip(delta: string): string;
  /**
   * Stream ended: give back what is still held. Held *prose* comes back
   * verbatim; a half-written opening tag is protocol and is dropped.
   */
  flush(): string;
}

export interface NextStepMarkerStripperOptions {
  /**
   * This turn's nonce. A marker is only *accepted* when its `key` matches.
   * `null` means the turn has no key (the marker was never taught this turn),
   * so every marker is stripped and none is accepted.
   */
  key: string | null;
  /** Called at most once per turn, with 1..3 suggestions. Never with `[]`. */
  emit: (suggestions: string[]) => void;
  /**
   * How far past an opening tag we keep waiting for `</od-next>` before giving
   * up and releasing the buffer as prose. Three short sentences plus the tag
   * fit comfortably; a model that writes an essay in here loses the marker,
   * which is the right outcome.
   */
  maxScanLength?: number;
}

const DEFAULT_SCAN_LIMIT = 1024;

/**
 * How many characters at the end of `text` could still grow into an opening
 * tag. Two cases, mirroring the done-marker's client-side hold-back:
 *
 *   · the tail is a prefix of `<od-next` — the tag name is not finished;
 *   · the tail already IS `<od-next` but no `>` has arrived — the key
 *     attribute is still in flight.
 *
 * Bounded by `MAX_OPEN_TAG_HOLD` so a lone `<` in prose that never closes
 * cannot hold the rest of the answer hostage.
 */
const MAX_OPEN_TAG_HOLD = 256;

function pendingOpenTagTail(text: string): number {
  const open = text.lastIndexOf('<');
  if (open < 0) return 0;
  const held = text.length - open;
  if (held > MAX_OPEN_TAG_HOLD) return 0;
  const tail = text.slice(open).toLowerCase();
  if (OD_NEXT_OPEN_TAG.startsWith(tail)) return held;
  if (tail.startsWith(OD_NEXT_OPEN_TAG) && !tail.includes('>')) return held;
  return 0;
}

/**
 * Where an opening tag ends — or the proof that it is not a tag at all.
 *
 *   · `{ kind: 'end' }`       — the `>` that closes the opening tag.
 *   · `{ kind: 'undecided' }` — nothing yet disproves it; wait for more text.
 *   · `{ kind: 'malformed' }` — this cannot be a tag, and `headLength` is the
 *                               length of the tag-shaped prefix to discard.
 */
type OpenTagScan =
  | { kind: 'end'; index: number }
  | { kind: 'undecided' }
  | { kind: 'malformed'; headLength: number };

/**
 * Scan `<od-next …` for the `>` that closes its opening tag.
 *
 * The scan is quote-aware because an attribute value may legally contain `>`
 * (`value="a > b"`). That awareness is also how this function shipped a bug: a
 * value whose closing quote never arrives pairs with the *next* tag's opening
 * quote, and from there the scanner is permanently "inside a string" and skips
 * every `>` that follows — including the `/>` of the marker after it. In the
 * recorded failure a codex reconnect cut the stream mid-attribute, the buffer
 * grew past the hold cap while poisoned this way, and the overflow path
 * released the whole half tag onto the screen and into the database.
 *
 * The fix is an invariant the poisoned state violates immediately: **inside an
 * attribute value there is no newline and no `<`** — the value is a quoted
 * scalar and the `<` would have to be `&lt;`. Seeing either proves the quote
 * was never closed, so the tag dies at that character instead of eating the
 * rest of the answer. A `<` outside the quotes is the same proof: a tag cannot
 * contain the start of another one.
 *
 * `headLength` stops at the offending character rather than consuming it, so
 * the caller drops exactly the tag-shaped prefix and releases the real prose
 * that follows it verbatim.
 */
function scanOpenTag(text: string): OpenTagScan {
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
      else if (char === '\n' || char === '\r' || char === '<') {
        return { kind: 'malformed', headLength: index };
      }
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return { kind: 'end', index };
    } else if (char === '<' && index > 0) {
      return { kind: 'malformed', headLength: index };
    }
  }
  return { kind: 'undecided' };
}

export function createNextStepMarkerStripper(
  options: NextStepMarkerStripperOptions,
): NextStepMarkerStripper {
  const maxScanLength = options.maxScanLength ?? DEFAULT_SCAN_LIMIT;
  const runKey = typeof options.key === 'string' && options.key ? options.key : null;
  /** Text held back because it might still turn into a marker. */
  let held = '';
  /** True once we have seen an opening tag and are waiting for its close. */
  let inMarker = false;
  /** Opening tag of the marker we are inside, kept so we can spit it back out. */
  let markerHead = '';
  let emitted = false;
  let suppressWhitespaceAfterSelfClosingMarker = false;
  const selfClosingSuggestions: string[] = [];

  const emitOnce = (suggestions: string[]) => {
    if (emitted || suggestions.length === 0) return;
    emitted = true;
    options.emit(suggestions.slice(0, MAX_NEXT_STEP_SUGGESTIONS));
  };

  const acceptBlock = (inner: string, openTag: string) => {
    if (emitted) return;
    const attrKey = OD_NEXT_KEY_ATTR_RE.exec(openTag)?.[1] ?? '';
    // Unforgeable-by-content: a model can only produce this turn's nonce if the
    // daemon showed it to the model this turn.
    if (!runKey || attrKey !== runKey) return;
    const suggestions = parseNextStepSuggestions(inner).slice(0, MAX_NEXT_STEP_SUGGESTIONS);
    if (suggestions.length === 0) return;
    emitOnce(suggestions);
  };

  const acceptSelfClosing = (tag: string) => {
    if (emitted) return;
    const attrKey = OD_NEXT_KEY_ATTR_RE.exec(tag)?.[1] ?? '';
    if (!runKey || attrKey !== runKey) return;
    const suggestion = parseNextStepMarkerValue(tag);
    if (!suggestion) return;
    if (!selfClosingSuggestions.some((entry) => entry.toLowerCase() === suggestion.toLowerCase())) {
      selfClosingSuggestions.push(suggestion);
    }
    if (selfClosingSuggestions.length >= MAX_NEXT_STEP_SUGGESTIONS) {
      emitOnce(selfClosingSuggestions);
    }
  };

  const strip = (delta: string): string => {
    let buffer = held + String(delta ?? '');
    held = '';
    let visible = '';

    for (;;) {
      if (suppressWhitespaceAfterSelfClosingMarker) {
        buffer = buffer.replace(/^\s+/, '');
        if (!buffer) break;
        suppressWhitespaceAfterSelfClosingMarker = false;
      }

      if (inMarker) {
        const close = CLOSE_TAG_RE.exec(buffer);
        if (!close) {
          if (buffer.length > maxScanLength) {
            /*
             * Bet lost: no `</od-next>` within a sane distance, so this was
             * either prose that opened with the tag or a model that never
             * closed it. Release the CONTENT (requirement 2 — never swallow
             * words) but keep the opening tag suppressed (requirement 1 — a
             * protocol tag never paints). Dropping both would eat up to a
             * kilobyte of a real answer; releasing both would put
             * `<od-next key="…">` on screen. Neither is acceptable, so the
             * tag is the only thing that dies.
             */
            visible += buffer;
            inMarker = false;
            markerHead = '';
            buffer = '';
            break;
          }
          held = buffer;
          break;
        }
        acceptBlock(buffer.slice(0, close.index), markerHead);
        buffer = buffer.slice(close.index + close[0].length);
        inMarker = false;
        markerHead = '';
        continue;
      }

      const openIndex = buffer.toLowerCase().indexOf(OD_NEXT_OPEN_TAG);
      if (openIndex === -1) {
        const keep = pendingOpenTagTail(buffer);
        visible += keep > 0 ? buffer.slice(0, buffer.length - keep) : buffer;
        held = keep > 0 ? buffer.slice(buffer.length - keep) : '';
        break;
      }

      visible += buffer.slice(0, openIndex);
      buffer = buffer.slice(openIndex);
      const scan = scanOpenTag(buffer);
      if (scan.kind !== 'end') {
        /*
         * The opening tag never closed. Two ways to get here, one exit:
         *
         *  · `malformed` — proven not a tag (see `scanOpenTag`). Drop the
         *    tag-shaped prefix, keep everything from the offending character
         *    on, and re-enter the loop so a genuine marker later in the same
         *    buffer is still seen.
         *  · `undecided` past the hold cap — `<od-next` followed by 256
         *    characters with no `>`, no `<` and no newline. That is not prose;
         *    prose would have tripped one of those long ago. It is either a
         *    marker whose author wrote an essay into an attribute (the
         *    docstring's "loses the marker, which is the right outcome") or a
         *    tag that never ends. Either way the whole buffer is tag, so the
         *    whole buffer is what dies.
         *
         * Both obey requirement 1: a protocol tag never paints. Neither
         * releases the tag as prose, which is what the old overflow branch did
         * and how the raw marker reached the database.
         */
        if (scan.kind === 'malformed') {
          buffer = buffer.slice(scan.headLength);
          continue;
        }
        if (buffer.length > MAX_OPEN_TAG_HOLD) {
          buffer = '';
          break;
        }
        held = buffer;
        break;
      }
      markerHead = buffer.slice(0, scan.index + 1);
      buffer = buffer.slice(scan.index + 1);
      if (/\/\s*>$/.test(markerHead)) {
        acceptSelfClosing(markerHead);
        markerHead = '';
        suppressWhitespaceAfterSelfClosingMarker = true;
        continue;
      }
      inMarker = true;
    }

    return visible;
  };

  return {
    strip,
    /*
     * Stream over. What is still held falls into three cases:
     *
     *  · We never saw a complete opening tag, so the tail is an ambiguous
     *    `<`-prefix that turned out to be prose — return it verbatim. This is
     *    the "don't swallow the user's words" half.
     *  · We are inside a marker whose close never arrived. Everything after
     *    the opening tag is protocol payload, so the tag itself is dropped
     *    (it must never paint) and only its content is returned, for the same
     *    reason the overflow path above returns it.
     *  · The opening tag itself was still being typed. See the comment on the
     *    return below: that one is protocol, and it dies.
     */
    flush() {
      const rest = held;
      if (!emitted && selfClosingSuggestions.length > 0) {
        emitOnce(selfClosingSuggestions);
      }
      held = '';
      inMarker = false;
      markerHead = '';
      suppressWhitespaceAfterSelfClosingMarker = false;
      /*
       * The third case the comment above missed, and the second way a raw
       * marker reached the screen: `held` can also be an opening tag that was
       * still being typed when the stream ended (`<od-next key="…" value="…`).
       * That is protocol, not prose, so it dies here — the same rule
       * `artifact-focus-marker.ts` already applies to its own `flush()`.
       *
       * The test is `startsWith`, not `includes`, so it stays narrow: a tail
       * that is merely a PREFIX of the tag name (`<`, `<od`) is still the
       * ambiguous-prose case and is still returned verbatim.
       */
      return rest.toLowerCase().startsWith(OD_NEXT_OPEN_TAG) ? '' : rest;
    },
  };
}

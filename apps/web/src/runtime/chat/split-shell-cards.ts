import { splitOnOdCards, type OdCardSegment } from '@open-design/contracts';
import { computeSkipRanges, rangeContains, type Range } from '../../artifacts/markdown-context';

function markdownCodeRanges(text: string): Range[] {
  const { ranges, unclosedFenceStart } = computeSkipRanges(text);
  return unclosedFenceStart === null
    ? ranges : [...ranges, [unclosedFenceStart, text.length]];
}

/**
 * Preserve Markdown code examples; decode real cards with the shared protocol parser.
 *
 * A closed `<od-card>…</od-card>` block whose payload does not parse is DROPPED —
 * never painted as prose. Product ruling (user, 2026-09-18): "od-card 如果 json
 * 不对, 就不显示, 不然用户会觉得是乱码...还不如不显示". A tail comma, a missing
 * `summary`, a misspelled `type` — the model writes all three — used to put the
 * whole `<od-card …>{…}</od-card>` block on screen as user-visible text, Markdown
 * and all (`user_profile` even came out italic). That reads as garbage, so the
 * card is simply absent instead.
 *
 * "Malformed" and "still streaming" are different states and only the first one
 * is dropped here. A card that has an opener but no `</od-card>` yet is a card
 * mid-flight: the `live` branches below withhold it (showing the prose written
 * before it) so a later delta can still complete it into a real card. Dropping a
 * block requires a matched close tag, i.e. a payload that is final and wrong.
 *
 * The decision stays in this render-layer helper rather than in the shared
 * `splitOnOdCards` parser: that parser is a lossless index-preserving split whose
 * other callers (`chat-protocol-context` Markdown skip-ranges, daemon
 * `memory-verify`) read spans of the ORIGINAL text, and it must keep returning
 * every character it was given.
 *
 * Because a dropped block contributes no characters to the render, Markdown
 * context is classified over `renderedView()` — the prose kept so far in the
 * current Markdown render plus the not-yet-consumed suffix — rather than over
 * the raw input. Dropping without that recomputation is a leak: a payload
 * carrying an unclosed fence would mark everything after it as code, so the next
 * perfectly valid card is never decoded and falls out of the tail `appendText`
 * as raw markup. The suffix alone is equally wrong in the other direction — a
 * dropped block does not split the render, both halves are handed to Markdown as
 * one string, so prose before the drop must keep its say over what follows.
 */
export function splitShellCards(text: string, live: boolean): OdCardSegment[] {
  // Prose retained since the current Markdown render began, up to `cursor`.
  // A parsed card ends a render and clears it; a dropped block does not.
  let renderedPrefix = '';
  let codeRanges = markdownCodeRanges(text);
  const result: OdCardSegment[] = [];
  const open = /<od-card(?=\s|>)[^>]*>/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  function appendText(value: string): void {
    if (!value) return;
    const last = result.at(-1);
    if (last?.kind === 'text') last.text += value;
    else result.push({ kind: 'text', text: value });
  }

  /** The Markdown string positions in `codeRanges` are measured against. */
  function renderedView(): string {
    return renderedPrefix + text.slice(cursor);
  }

  /** Map an index into `text` at or after `cursor` onto `renderedView()`. */
  function viewIndex(position: number): number {
    return renderedPrefix.length + position - cursor;
  }

  while ((match = open.exec(text))) {
    if (rangeContains(codeRanges, viewIndex(match.index))) continue;
    const close = /<\/od-card>/gi;
    close.lastIndex = open.lastIndex;
    const end = close.exec(text);
    if (!end) {
      if (live) {
        appendText(text.slice(cursor, match.index));
        return result;
      }
      break;
    }
    const retained = text.slice(cursor, match.index);
    appendText(retained);
    const raw = text.slice(match.index, close.lastIndex);
    // Only the opening marker is classified by Markdown context. A real card's
    // JSON can itself quote markup/backticks; its payload must remain opaque.
    const decoded = splitOnOdCards(raw);
    const parsed = decoded.some((segment) => segment.kind === 'card');
    // A closed block that did not parse is dropped, not appended: the user sees
    // nothing rather than raw protocol markup (see the ruling in the docblock).
    if (parsed) {
      for (const segment of decoded) {
        if (segment.kind === 'text') appendText(segment.text);
        else result.push(segment);
      }
    }
    cursor = close.lastIndex;
    open.lastIndex = cursor;
    if (parsed) {
      // A rendered card ends the Markdown render, so nothing before it can open
      // a code span in the prose that follows.
      renderedPrefix = '';
    } else {
      // A dropped block is a hole in one continuous render: the prose on both
      // sides still renders together, and the payload gets no vote at all.
      renderedPrefix += retained;
    }
    codeRanges = markdownCodeRanges(renderedView());
  }
  if (live) {
    const candidateStart = text.lastIndexOf('<');
    if (candidateStart >= cursor && !rangeContains(codeRanges, viewIndex(candidateStart))) {
      const candidate = text.slice(candidateStart).toLowerCase();
      const opener = '<od-card';
      const partialName = candidate.startsWith('<od-') && opener.startsWith(candidate);
      const partialAttributes = candidate.startsWith(opener)
        && /^\s[^<>]*$/.test(candidate.slice(opener.length));
      if (partialName || partialAttributes) {
        // A future delta can complete this card opener. Keep earlier prose
        // visible now; terminal rendering restores candidates that never close.
        appendText(text.slice(cursor, candidateStart));
        return result;
      }
    }
  }
  appendText(text.slice(cursor));
  return result;
}

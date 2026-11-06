import {
  getTimelineElementIdentity,
  getTimelineElementSelector,
  getTimelineElementSelectorIndex,
  getTimelineElementSourceFile,
} from "../player/lib/timelineElementHelpers";
import { readTimelineText } from "../player/lib/timelineText";
import { usePlayerStore } from "../player/store/playerStore";

/** A text commit skips the preview reload, so the edited layer's row re-reads its words here. */
export function refreshTimelineRowText(el: HTMLElement): void {
  const sourceFile = getTimelineElementSourceFile(el);
  const hfId = el.getAttribute("data-hf-id");
  const selector = getTimelineElementSelector(el);
  const selectorIndex = selector
    ? (getTimelineElementSelectorIndex(el.ownerDocument, el, selector) ?? 0)
    : 0;
  const { elements, updateElement } = usePlayerStore.getState();
  const row = elements.find(
    (candidate) =>
      candidate.sourceFile === sourceFile &&
      (hfId
        ? candidate.hfId === hfId
        : !!selector &&
          candidate.selector === selector &&
          (candidate.selectorIndex ?? 0) === selectorIndex),
  );
  if (row) updateElement(getTimelineElementIdentity(row), { text: readTimelineText(el) });
}

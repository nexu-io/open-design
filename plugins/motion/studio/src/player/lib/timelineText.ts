import { isHtmlElement } from "@hyperframes/core/runtime/dom-realm";
import { parseCssColor } from "../../components/editor/colorValue";
import type { TimelineText } from "../store/timelineElement";
import {
  getCuratedComputedStyles,
  isEditableTextLeaf,
  isTextBearingTag,
} from "../../components/editor/domEditingDom";

/** A layer that paints only text and a flat colour (a text tag whose children are all text leaves,
 *  no background image): its words and look. Anything painted beyond that keeps its picture. */
export function readTimelineText(el: Element): TimelineText | undefined {
  if (!isHtmlElement(el) || !isTextBearingTag(el.localName)) return undefined;
  const children = Array.from(el.children);
  if (!children.every((child) => isHtmlElement(child) && isEditableTextLeaf(child)))
    return undefined;
  const value = el.textContent?.replace(/\s+/g, " ").trim();
  if (!value) return undefined;
  const style = getCuratedComputedStyles(el);
  if ((style["background-image"] ?? "none") !== "none") return undefined;
  const background = style["background-color"];
  return {
    value,
    fontFamily: style["font-family"],
    fontWeight: style["font-weight"],
    color: style.color,
    background: background && parseCssColor(background)?.alpha === 1 ? background : undefined,
  };
}

export function sameTimelineText(a?: TimelineText, b?: TimelineText): boolean {
  if (!a || !b) return a === b;
  return (
    a.value === b.value &&
    a.fontFamily === b.fontFamily &&
    a.fontWeight === b.fontWeight &&
    a.color === b.color &&
    a.background === b.background
  );
}

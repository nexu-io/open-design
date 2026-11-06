import { isRichTextFormattingTag } from "@hyperframes/core/rich-text-sanitize";
import type { DomEditSelection } from "./domEditingTypes";
import { isTextEditableSelection } from "./domEditingLayers";

/**
 * Whether this element's text can be edited where it sits.
 *
 * Its own function rather than a condition inside a handler, because this is
 * the rule most likely to change: it is the whole answer to "why did nothing
 * happen when I double-clicked that".
 *
 * The bar is deliberately the same as the design panel's, plus one thing the
 * panel can do that editing in place cannot. An element with several text
 * fields is edited a field at a time there, and making the whole element
 * editable would flatten its children into one string, so those keep the panel.
 */
export function canEditTextInline(selection: DomEditSelection | null): boolean {
  if (!selection) return false;
  if (!isTextEditableSelection(selection)) return false;
  // The composition host is the document, not a piece of copy in it.
  if (selection.isCompositionHost) return false;
  if (selection.isInsideLockedComposition) return false;
  if (selection.textFields.length <= 1) return true;
  // A styled element reports one field per run of characters, but it is still
  // one piece of copy and the caret edits all of it at once.
  return canEditElementTextInline(selection.element);
}

/**
 * Whether this element's text can be edited in place, judged from the element
 * alone.
 *
 * The press path cannot use the selection-shaped gate above: building a
 * selection is asynchronous, and a press has to decide now whether it is a
 * text edit or the start of a drag. This asks the same question of the DOM.
 *
 * A structural child keeps an element out: those are separate text fields, the
 * panel edits them one at a time, and making the whole element editable would
 * flatten them into a single string.
 *
 * A formatting child does not. Styling a run of characters puts a span inside
 * the element, so a rule of "no element children" would have let the editor
 * lock every element it had ever styled out of itself, permanently, on the
 * first colour change. What counts as formatting is the sanitiser's allowlist,
 * so the editor and the thing that writes the file agree on it.
 */
export function canEditElementTextInline(element: HTMLElement | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  if (tag === "BODY" || tag === "HTML") return false;
  if (!hasOnlyFormattingChildren(element)) return false;
  if (element.isContentEditable) return false;
  return (element.textContent ?? "").trim().length > 0;
}

export function hasOnlyFormattingChildren(element: HTMLElement): boolean {
  for (const child of Array.from(element.children)) {
    if (!isRichTextFormattingTag(child.tagName)) return false;
    if (!isHtmlFromAnyWindow(child)) return false;
    // Formatting nests, and a structural child hidden inside a span is still
    // structural.
    if (!hasOnlyFormattingChildren(child as HTMLElement)) return false;
  }
  return true;
}

function isHtmlFromAnyWindow(node: Element): boolean {
  return node.namespaceURI === "http://www.w3.org/1999/xhtml";
}

/** Where and when a press landed, for recognising the next one as a pair. */
export interface PressMark {
  x: number;
  y: number;
  at: number;
  element: HTMLElement | null;
}

/** Long enough to be deliberate, short enough not to catch two separate clicks. */
const DOUBLE_PRESS_MS = 450;
/** A double press is two presses in the same place, not a tiny drag. */
const DOUBLE_PRESS_SLOP_PX = 6;

/**
 * Whether this press pairs with the last one into a double press.
 *
 * Studio cannot use `dblclick` or a click count for this. The selection box
 * takes pointer capture on the first press and prevents its default, which
 * suppresses the compatibility mouse events and stops the browser pairing the
 * two presses at all: no `dblclick` is dispatched, and `detail` stays 1.
 */
export function isDoublePress(previous: PressMark | null, next: PressMark): boolean {
  if (!previous) return false;
  return (
    next.element !== null &&
    previous.element === next.element &&
    next.at - previous.at <= DOUBLE_PRESS_MS &&
    Math.abs(next.x - previous.x) <= DOUBLE_PRESS_SLOP_PX &&
    Math.abs(next.y - previous.y) <= DOUBLE_PRESS_SLOP_PX
  );
}

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { InlineTextEditSession } from "../../hooks/useInlineTextEdit";

/** The drawn caret's width on screen, whatever the preview's scale. */
export const CARET_PX = 2;

interface CaretPlacement {
  left: number;
  top: number;
  height: number;
  color: string;
}

/**
 * The caret of a text edited in place, drawn at screen size: the preview is scaled, so the browser's 1 px caret
 * shrinks below a pixel. This one follows the real selection; the browser's own is transparent meanwhile.
 */
export function InlineTextCaret({
  session,
  iframe,
}: {
  session: InlineTextEditSession | null;
  iframe: HTMLIFrameElement | null;
}) {
  const [placement, setPlacement] = useState<CaretPlacement | null>(null);
  const element = session?.element ?? null;

  useEffect(() => {
    if (!element || !iframe) {
      setPlacement(null);
      return;
    }
    const doc = element.ownerDocument;
    const view = doc.defaultView;
    const studio = iframe.ownerDocument.defaultView;
    const color = caretColorOf(element);
    const ownCaret = element.style.caretColor;
    element.style.caretColor = "transparent";
    let composing = false;
    let side: CaretSide = "after";
    const update = () =>
      setPlacement(composing ? null : placeAtCaret(element, iframe, color, side));
    // The DOM has no side for a soft-wrap point (one line's end is the next one's start): the key that moved there
    // says which, as CodeMirror and ProseMirror keep it.
    const onKey = ({ key }: KeyboardEvent) => {
      if (!MODIFIERS.has(key)) side = SIDE_OF_KEY[key] ?? "after";
    };
    const onPress = () => void (side = "after");
    const composition = (on: boolean) => () => {
      composing = on;
      update();
    };
    const start = composition(true);
    const end = composition(false);
    // The preview moves by transforms (the player's scale, a pan or zoom of the stage) that fire no event: the iframe's
    // box is checked each frame and a move re-places the caret.
    let box = "";
    let frame = 0;
    const follow = () => {
      const { left, top, width, height } = iframe.getBoundingClientRect();
      const now = `${left},${top},${width},${height}`;
      if (now !== box) {
        box = now;
        update();
      }
      frame = studio?.requestAnimationFrame(follow) ?? 0;
    };
    doc.addEventListener("selectionchange", update);
    element.addEventListener("keydown", onKey);
    element.addEventListener("pointerdown", onPress);
    element.addEventListener("input", update);
    element.addEventListener("focus", update);
    element.addEventListener("blur", update);
    element.addEventListener("compositionstart", start);
    element.addEventListener("compositionend", end);
    view?.addEventListener("resize", update);
    view?.addEventListener("scroll", update, true);
    follow();
    return () => {
      studio?.cancelAnimationFrame(frame);
      doc.removeEventListener("selectionchange", update);
      element.removeEventListener("keydown", onKey);
      element.removeEventListener("pointerdown", onPress);
      element.removeEventListener("input", update);
      element.removeEventListener("focus", update);
      element.removeEventListener("blur", update);
      element.removeEventListener("compositionstart", start);
      element.removeEventListener("compositionend", end);
      view?.removeEventListener("resize", update);
      view?.removeEventListener("scroll", update, true);
      element.style.caretColor = ownCaret;
    };
  }, [element, iframe]);

  if (!placement || !iframe) return null;
  // On Studio's body: a transformed ancestor in the canvas would make `fixed` relative to itself, not the viewport.
  return createPortal(
    <div
      // Keyed on where it stands, so each move starts the blink lit, as the system caret does.
      key={`${placement.left},${placement.top}`}
      data-inline-text-caret="true"
      aria-hidden="true"
      className="hf-inline-text-caret pointer-events-none fixed z-200"
      style={{
        left: placement.left,
        top: placement.top,
        width: CARET_PX,
        height: placement.height,
        background: placement.color,
      }}
    />,
    iframe.ownerDocument.body,
  );
}

/** The colour the browser would draw its caret in: `caret-color`, or the text's colour when that is `auto`. */
function caretColorOf(element: HTMLElement): string {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (!style) return "currentColor";
  return style.caretColor && style.caretColor !== "auto" ? style.caretColor : style.color;
}

type CaretSide = "before" | "after";
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta"]);
// Only End leaves Chrome's own caret at the earlier line's end; an arrow onto a wrap point lands on the next line.
const SIDE_OF_KEY: Record<string, CaretSide> = { End: "before" };

/** Where the caret stands on Studio's screen, or null when there is none to draw: a range selected, the text not
 * focused, or the selection outside it. */

function placeAtCaret(
  element: HTMLElement,
  iframe: HTMLIFrameElement,
  color: string,
  side: CaretSide,
): CaretPlacement | null {
  const view = element.ownerDocument.defaultView;
  const range = view ? caretRange(element, view) : null;
  if (!view || !range) return null;
  const rect = (side === "before" && endOfCharBefore(range)) || caretRect(range, element, view);
  const box = iframe.getBoundingClientRect();
  const scale = view.innerWidth ? box.width / view.innerWidth : 1;
  return {
    left: box.left + rect.left * scale - CARET_PX / 2,
    top: box.top + rect.top * scale,
    height: rect.height * scale,
    color,
  };
}

/** The collapsed range's box on its line. A caret between two nodes has none, so it stands beside them; an empty
 * text has neither, so it stands at the text's start, one line tall. */
function caretRect(range: Range, element: HTMLElement, view: Window) {
  const last = [...range.getClientRects()].reverse().find((rect) => rect.height > 0);
  if (last) return { left: last.left, top: last.top, height: last.height };
  const beside = besideNode(range);
  if (beside) return beside;
  const style = view.getComputedStyle(element);
  const box = element.getBoundingClientRect();
  const fontSize = Number.parseFloat(style.fontSize) || 16;
  const line = Number.parseFloat(style.lineHeight) || fontSize * 1.2;
  return {
    left: box.left + (Number.parseFloat(style.paddingLeft) || 0),
    top: box.top + (Number.parseFloat(style.paddingTop) || 0),
    height: line,
  };
}

function caretRange(element: HTMLElement, view: Window): Range | null {
  const doc = element.ownerDocument;
  const selection = view.getSelection();
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null;
  if (!doc.hasFocus() || !element.contains(doc.activeElement)) return null;
  const range = selection.getRangeAt(0);
  return element.contains(range.startContainer) ? range : null;
}

/** The right edge of the character just before a collapsed range in a text node: where a caret that came from
 * before a soft-wrap point stands, at the end of the earlier line. */
function endOfCharBefore({ startContainer: at, startOffset: offset }: Range) {
  if (at.nodeType !== Node.TEXT_NODE || offset === 0) return null;
  const char = at.ownerDocument!.createRange();
  // An emoji's second half alone has no box: take the whole pair.
  const low = /[\uDC00-\uDFFF]/.test((at as Text).data[offset - 1] ?? "");
  char.setStart(at, offset - (low && offset > 1 ? 2 : 1));
  char.setEnd(at, offset);
  // A trailing space at a wrap has a box on each line; the earlier line's comes first.
  const rect = [...char.getClientRects()].find((each) => each.height > 0);
  return rect ? { left: rect.right, top: rect.top, height: rect.height } : null;
}

/** At an element boundary: the end of the node before, or the start of the node after (a line break's own line). */
function besideNode(range: Range) {
  const [before, after] = neighbours(range);
  const node = before && before.nodeName !== "BR" ? before : (after ?? before);
  if (!node) return null;
  const around = range.cloneRange();
  around.selectNode(node);
  const rects = [...around.getClientRects()].filter((rect) => rect.height > 0);
  const end = node === before;
  const rect = end ? rects.at(-1) : rects[0];
  return rect ? { left: end ? rect.right : rect.left, top: rect.top, height: rect.height } : null;
}

/** The nodes either side of a collapsed range; an empty text node is a boundary too, between its siblings. */
function neighbours({ startContainer: at, startOffset: offset }: Range) {
  return at.nodeType === Node.TEXT_NODE
    ? [at.previousSibling, at.nextSibling]
    : [at.childNodes[offset - 1] ?? null, at.childNodes[offset] ?? null];
}

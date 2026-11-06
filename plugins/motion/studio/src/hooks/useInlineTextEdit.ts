import { useCallback, useEffect, useRef, useState } from "react";
import { sanitizeRichTextChildren } from "@hyperframes/core/rich-text-sanitize";
import { usePreviewReadOnly } from "../components/editor/previewReadOnlyContext";
import { trackStudioPendingEdit } from "../utils/studioPendingEdits";
import {
  beginStudioManualEditGesture,
  endStudioManualEditGesture,
  countStudioManualEditSave,
} from "../components/editor/manualEditsDom";

/**
 * Editing an element's text where it sits, in the composition itself.
 *
 * The alternative is an input positioned over the element, which has to
 * reproduce its font, size, weight, spacing, colour, alignment and wrapping to
 * look right, and is subtly wrong the moment any of those is missed. The
 * preview is a same-origin document holding the real element, and the commit
 * path already mutates that exact node, so the element is both the most
 * accurate surface to type into and the one the rest of the code understands.
 *
 * The session owns the element's editable state for its whole life, and tears
 * down the same way whichever way it ends. A session that failed to close
 * would leave the canvas unable to select anything.
 */

/**
 * `true`, not `plaintext-only`.
 *
 * `plaintext-only` was what kept a text edit from becoming a structural one,
 * and it also made it impossible to give three characters a colour, which is
 * the point of editing in the composition rather than in a field. The guard it
 * was providing is rebuilt as two narrower ones that do not cost the feature:
 * paste arrives as plain text, and what leaves the element goes through the
 * sanitiser before anyone writes it to a file.
 */
const EDITABLE = "true";
/** Studio's accent, so the mark belongs to Studio rather than to the design. */
const EDITING_OUTLINE = "2px solid #3CE6AC";

export interface InlineTextEditSession {
  element: HTMLElement;
  /**
   * The element's markup when editing started, for putting back on cancel.
   * Markup rather than text: cancelling an edit that recoloured a word has to
   * restore the colours it replaced, not just the letters.
   */
  original: string;
  /** The element's own outline, to put back when the session ends. */
  outline: string;
  /** The element's own outline offset, restored with the outline. */
  outlineOffset: string;
  /** Holds the preview on screen while the edit is open. */
  gesture?: string;
}

/** The live markup to persist and the session snapshot to restore on failure. */
export interface InlineTextEditCommit {
  /** The exact preview node that owned the edit; a reload must not retarget it. */
  element: HTMLElement;
  html: string;
  previousHtml: string;
}

export interface InlineTextEditControls {
  session: InlineTextEditSession | null;
  /**
   * Begin editing this element. `caretAt` is a point in the element's own
   * document, so the caret can open where the user pointed rather than at a
   * fixed end. Returns false when a session is already open.
   */
  start: (element: HTMLElement, caretAt?: { x: number; y: number }) => boolean;
  /** Hand the current text to the commit function and close. */
  commit: () => void;
  /** Put the original text back and close, persisting nothing. */
  cancel: () => void;
}

/**
 * Drop the text selection, but only when it lives inside this element.
 *
 * A selection somewhere else in the preview belongs to whatever put it there
 * and is not this session's to clear.
 */
function clearSelectionWithin(element: HTMLElement): void {
  const selection = element.ownerDocument.defaultView?.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer) && !element.contains(range.endContainer)) return;
  selection.removeAllRanges();
}

export function useInlineTextEdit({
  onCommit,
  onPause,
}: {
  /** Where the edited text goes. The caller owns persistence. */
  onCommit: (commit: InlineTextEditCommit) => unknown;
  /** Stop playback, so the element is not animating under the caret. */
  onPause?: () => void;
}): InlineTextEditControls {
  const readOnly = usePreviewReadOnly();
  const [session, setSession] = useState<InlineTextEditSession | null>(null);
  // The teardown reads this rather than the state, so an exit path that runs
  // before React re-renders still sees the element it has to clean up.
  const openRef = useRef<InlineTextEditSession | null>(null);
  /** The pending caret placement, so a session that closes first can drop it. */
  const framesRef = useRef<number | null>(null);

  const teardown = useCallback((): InlineTextEditSession | null => {
    const open = openRef.current;
    if (!open) return null;
    if (framesRef.current !== null) {
      open.element.ownerDocument.defaultView?.cancelAnimationFrame(framesRef.current);
      framesRef.current = null;
    }
    openRef.current = null;
    endStudioManualEditGesture(open.element, open.gesture);
    setSession(null);
    // An element removed from the document mid-session is not an error, it is
    // just nothing left to clean up.
    if (open.element.isConnected) {
      open.element.removeAttribute("contenteditable");
      // Restored rather than cleared: the composition may have authored one.
      open.element.style.outline = open.outline;
      open.element.style.outlineOffset = open.outlineOffset;
      // Drop the highlight too. Removing contenteditable and blurring leaves a
      // selection made inside the element painted on screen, so a word picked
      // with a double press stayed grey after the click that closed the edit.
      clearSelectionWithin(open.element);
      open.element.blur();
    }
    return open;
  }, []);

  const start = useCallback(
    (element: HTMLElement, caretAt?: { x: number; y: number }): boolean => {
      if (openRef.current || readOnly) return false;

      const open = {
        element,
        original: element.innerHTML,
        outline: element.style.outline,
        outlineOffset: element.style.outlineOffset,
        gesture: beginStudioManualEditGesture(element, "edit"),
      };
      // Drawn on the element itself, not in Studio's overlay above it. This is
      // the only mark that says the caret is in the TEXT rather than the
      // element being selected, and it has to sit in the same document as the
      // caret to read that way.
      element.style.outline = EDITING_OUTLINE;
      element.style.outlineOffset = "2px";
      openRef.current = open;
      setSession(open);
      onPause?.();

      element.setAttribute("contenteditable", EDITABLE);
      // Focused and selected on the next frame, not now. The press that opened
      // this is still in flight: the canvas overlay takes focus on its own
      // pointer-down, and the click that follows puts a caret in the element
      // and collapses any selection. Doing it after all of that is what lands.
      const view = element.ownerDocument.defaultView;
      const raf = view?.requestAnimationFrame(() => {
        framesRef.current = null;
        if (openRef.current?.element !== element) return;
        element.focus({ preventScroll: true });
        placeCaret(element, caretAt);
      });
      framesRef.current = raf ?? null;
      return true;
    },
    [onPause, readOnly],
  );

  const commit = useCallback(() => {
    const open = openRef.current;
    if (!open) return;
    // Sanitised here, in the element, so the preview shows exactly what will be
    // saved rather than something the server will quietly cut down.
    sanitizeRichTextChildren(open.element);
    const html = open.element.innerHTML;
    // Counted and pending before the edit closes, so a reload waits for the save, not the mark.
    let save: (saving: unknown) => void = () => {};
    trackStudioPendingEdit(new Promise((resolve) => (save = resolve)));
    const commitText = () => {
      teardown();
      // After teardown, so the commit path's own resync does not fight an
      // element that is still editable.
      return onCommit({ element: open.element, html, previousHtml: open.original });
    };
    save(countStudioManualEditSave(open.element, commitText));
  }, [onCommit, teardown]);

  const cancel = useCallback(() => {
    const open = openRef.current;
    if (!open) return;
    if (open.element.isConnected) open.element.innerHTML = open.original;
    teardown();
  }, [teardown]);

  // Read-only can be enabled while an edit is already open. Close that
  // session as a cancellation so the preview cannot keep committing through
  // the now-disabled editing surface.
  useEffect(() => {
    if (readOnly && openRef.current) cancel();
  }, [cancel, readOnly]);

  // The keys belong to the element, not to the document: the element lives in
  // the preview's own document, so a listener on Studio's would never see them.
  useEffect(() => {
    const element = session?.element;
    if (!element) return;

    const onKeyDown = (event: KeyboardEvent) => {
      // Shift+Enter is a line break in a multi-line element, and is left alone.
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        commit();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        commit();
      }
    };
    // Clicking away keeps the work, which is what every other field in Studio
    // does and what a user who has just typed something expects.
    const onBlur = () => commit();
    // Nothing here for double or triple click: the browser already takes the
    // word on two and the whole text on three, which is what a text field does
    // everywhere else. Overriding the double click to take everything cost the
    // word selection and gained nothing the triple click did not already do.
    // Dropping `plaintext-only` means the browser would otherwise paste a whole
    // web page's markup straight in. What arrives is the words.
    const insertPlainText = (text: string) => {
      if (text) element.ownerDocument.execCommand("insertText", false, text);
    };
    const onPaste = (event: ClipboardEvent) => {
      event.preventDefault();
      insertPlainText(event.clipboardData?.getData("text/plain") ?? "");
    };
    // `contenteditable="true"` accepts dragged HTML as eagerly as pasted HTML.
    // Keep the drop path on the same plain-text rail as paste so markup cannot
    // execute in the same-origin preview before commit-time sanitisation.
    const onDragOver = (event: DragEvent) => event.preventDefault();
    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      insertPlainText(event.dataTransfer?.getData("text/plain") ?? "");
    };

    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("blur", onBlur);
    element.addEventListener("paste", onPaste);
    element.addEventListener("dragover", onDragOver);
    element.addEventListener("drop", onDrop);
    return () => {
      element.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("blur", onBlur);
      element.removeEventListener("paste", onPaste);
      element.removeEventListener("dragover", onDragOver);
      element.removeEventListener("drop", onDrop);
    };
  }, [session, commit]);

  // Unmount keeps the typed words, as blur does. Read through a ref so a new
  // onCommit never closes the session mid-edit.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => commitRef.current(), []);

  return { session, start, commit, cancel };
}

/**
 * Put the caret where the user pointed, or after the last character.
 *
 * Opening on a point is what makes this feel like text rather than a dialog:
 * the caret lands between the two letters that were clicked, exactly as it
 * would in any other editor.
 */
function placeCaret(element: HTMLElement, at?: { x: number; y: number }): void {
  const doc = element.ownerDocument;
  const selection = doc.defaultView?.getSelection();
  if (!selection) return;

  const range = at ? caretRangeAt(doc, at) : null;
  if (range && element.contains(range.startContainer)) {
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }
  placeCaretAtEnd(element);
}

/** The caret position under a point, across the two APIs browsers expose. */
function caretRangeAt(doc: Document, at: { x: number; y: number }): Range | null {
  const legacy = doc as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof legacy.caretRangeFromPoint === "function") {
    return legacy.caretRangeFromPoint(at.x, at.y);
  }
  const standard = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const position = standard.caretPositionFromPoint?.(at.x, at.y);
  if (!position) return null;
  const range = doc.createRange();
  range.setStart(position.offsetNode, position.offset);
  range.collapse(true);
  return range;
}

/**
 * Put the caret after the last character, with nothing selected.
 *
 * Selecting the whole text would mean the next keystroke silently destroys it,
 * which is a bad thing to do to someone who double-clicked to fix a typo. A
 * caret at the end is where a person who wants to keep typing expects to be,
 * and everything else stays available: click anywhere to move it, drag to
 * select, Cmd+A to take the lot.
 */
function placeCaretAtEnd(element: HTMLElement): void {
  const doc = element.ownerDocument;
  const selection = doc.defaultView?.getSelection();
  if (!selection) return;
  const range = doc.createRange();
  // Into the text node, not just past the last child: collapsing the element's
  // contents leaves the caret at a node boundary, which types in the right
  // place but reports itself as "after child 0" and is a different position
  // from the one the user sees at the end of the word.
  const last = element.lastChild;
  if (last && last.nodeType === 3) {
    range.setStart(last, last.textContent?.length ?? 0);
    range.collapse(true);
  } else {
    range.selectNodeContents(element);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

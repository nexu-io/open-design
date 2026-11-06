import { useI18n } from "../../i18n/I18n";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { applyInlineStyle } from "./inlineTextStyleRange";
import {
  readFirstPaintedElement,
  readInlineStyle,
  readInlineStyleSpread,
} from "./inlineTextStyleRead";
import { resolvePickerColor } from "./colorValue";
import type { InlineTextEditSession } from "../../hooks/useInlineTextEdit";

/**
 * The controls for styling the characters selected inside an open text edit.
 *
 * It lives in Studio's document rather than the composition's, positioned over
 * the selection: putting it in the preview would mean injecting Studio's chrome
 * into the user's composition, where it would be captured by a render and
 * inherit the composition's own styling.
 *
 * `position: fixed` and viewport coordinates, so it does not have to know which
 * of the canvas' several nested coordinate systems it was mounted into.
 */

const READ_PROPERTIES = ["color", "font-weight", "font-style", "text-decoration-line"];

/** Enough above the text to clear it, without leaving the element behind. */
const GAP_PX = 10;
/** h-6 controls + p-1 + the border. Used only to keep an above-toolbar onscreen. */
const TOOLBAR_HEIGHT_PX = 34;
const DEFAULT_COLOR = "#ffffff";

interface ToolbarPlacement {
  left: number;
  top: number;
  placeBelow: boolean;
  styles: Record<string, string>;
  colours: string[];
  pickerColour: string;
}

export function InlineTextToolbar({
  session,
  iframe,
}: {
  session: InlineTextEditSession | null;
  iframe: HTMLIFrameElement | null;
}) {
  const { t } = useI18n();
  const [placement, setPlacement] = useState<ToolbarPlacement | null>(null);

  const refresh = useCallback(() => {
    setPlacement(session && iframe ? placeOverSelection(session.element, iframe) : null);
  }, [session, iframe]);

  // The selection lives in the preview's document, so the event does too.
  useEffect(() => {
    const doc = session?.element.ownerDocument;
    if (!doc) {
      setPlacement(null);
      return;
    }
    doc.addEventListener("selectionchange", refresh);
    return () => doc.removeEventListener("selectionchange", refresh);
  }, [session, refresh]);

  const apply = useCallback(
    (delta: Record<string, string | null>) => {
      const doc = session?.element.ownerDocument;
      const selection = doc?.defaultView?.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      applyInlineStyle(range, delta);
      refresh();
    },
    [session, refresh],
  );

  if (!placement || !iframe) return null;
  const styles = placement.styles;

  return createPortal(
    <div
      data-inline-text-toolbar="true"
      role="toolbar"
      aria-label={t("Text formatting")}
      className="pointer-events-auto fixed z-200 flex items-center gap-1 rounded-lg border border-border bg-raised p-1 shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
      style={{
        left: placement.left,
        top: placement.top,
        transform: `translate(-50%, ${placement.placeBelow ? "0" : "-100%"})`,
      }}
      // Two different things have to be stopped here, and missing either one
      // loses the edit the toolbar exists to act on.
      //
      // The default, because a press anywhere in Studio moves the focus, and
      // moving it out of the text collapses the selection being styled.
      //
      // The propagation, because React bubbles it through the canvas overlay
      // that renders this bar: a press that reaches the canvas is read as a click on the composition,
      // which deselects the element and commits the edit out from under the
      // button that was just pressed.
      onPointerDown={swallow}
      onMouseDown={swallow}
      onClick={(event) => event.stopPropagation()}
    >
      <label
        className="group relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-md hover:bg-hover"
        title={t("Text colour")}
      >
        <span
          aria-hidden="true"
          className="h-4 w-4 rounded-full border-2 border-border-strong transition-transform duration-150 group-hover:scale-110 group-active:scale-95"
          // `background` maps a gradient to the PADDING box and then repeats it
          // to fill the border box, so the 1px border shows the strip either
          // side of the tile: the end colour on the left, the start colour on
          // the right. A red-to-green swatch grew a green edge and a red one.
          // Set after the shorthand, which resets it.
          style={{
            background: swatchBackground(placement.colours, styles.color),
            backgroundOrigin: "border-box",
          }}
        />
        {/* `inset-0` is not enough on its own: a colour input carries a
            user-agent minimum width, which wins over the right edge and lets
            the invisible input spill across the buttons beside it. Hovering
            bold then opened the colour picker. The size is pinned instead. */}
        <input
          type="color"
          aria-label={t("Text colour")}
          className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0"
          value={placement.pickerColour}
          onChange={(event) => apply({ color: event.target.value })}
        />
      </label>
      <ToolbarToggle
        label={t("Bold")}
        glyph="B"
        bold
        on={isBold(styles["font-weight"])}
        onToggle={(on) => apply({ "font-weight": on ? "700" : null })}
      />
      <ToolbarToggle
        label={t("Italic")}
        glyph="I"
        italic
        on={styles["font-style"] === "italic"}
        onToggle={(on) => apply({ "font-style": on ? "italic" : null })}
      />
      <ToolbarToggle
        label={t("Underline")}
        glyph="U"
        underline
        on={styles["text-decoration-line"] === "underline"}
        onToggle={(on) => apply({ "text-decoration-line": on ? "underline" : null })}
      />
    </div>,
    iframe.ownerDocument.body,
  );
}

/**
 * The selection's colours as one swatch: a diagonal sweep through each distinct
 * colour, evenly spaced. A selection with one colour is a plain swatch.
 *
 * Distinct rather than weighted, and evenly spaced rather than proportional,
 * matching the mixed-colour swatch in the design tool this sits alongside. The
 * swatch answers "which colours are in here", and at 16px a colour used by one
 * character has to be as visible as one used by thirty or it may as well not be
 * drawn.
 */
export function swatchBackground(
  distinctColours: readonly string[],
  agreed: string | undefined,
): string {
  if (distinctColours.length === 0) return agreed || DEFAULT_COLOR;
  if (distinctColours.length === 1) return distinctColours[0]!;
  const stops = distinctColours.map(
    (colour, index) => `${colour} ${((index / (distinctColours.length - 1)) * 100).toFixed(2)}%`,
  );
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

function swallow(event: { preventDefault: () => void; stopPropagation: () => void }): void {
  event.preventDefault();
  event.stopPropagation();
}

function ToolbarToggle({
  label,
  glyph,
  on,
  onToggle,
  bold,
  italic,
  underline,
}: {
  label: string;
  glyph: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={`flex h-6 w-6 items-center justify-center rounded-md text-xs ${
        on ? "bg-studio-accent/20 text-accent-ink" : "text-text-2 hover:bg-hover"
      }`}
      style={{
        fontWeight: bold ? 700 : 400,
        fontStyle: italic ? "italic" : "normal",
        textDecoration: underline ? "underline" : "none",
      }}
      onClick={() => onToggle(!on)}
    >
      {glyph}
    </button>
  );
}

/** Where the selection is on screen, or null when there is nothing selected. */
function placeOverSelection(
  element: HTMLElement,
  iframe: HTMLIFrameElement,
): ToolbarPlacement | null {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const selection = view?.getSelection();
  if (!view || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) return null;
  const rect = range.getBoundingClientRect();

  // The composition is drawn scaled into the iframe's box, so a point inside it
  // is that scale away from a point on Studio's screen. This is the inverse of
  // the mapping the canvas uses to turn a press into a caret position.
  const box = iframe.getBoundingClientRect();
  const scale = view.innerWidth ? box.width / view.innerWidth : 1;
  const above = box.top + rect.top * scale - GAP_PX;
  const placeBelow = above < TOOLBAR_HEIGHT_PX;

  const styles = readInlineStyle(range, READ_PROPERTIES);
  const colours = readInlineStyleSpread(range, "color");
  return {
    left: box.left + (rect.left + rect.width / 2) * scale,
    top: placeBelow ? box.top + (rect.top + rect.height) * scale + GAP_PX : above,
    placeBelow,
    styles,
    colours,
    pickerColour: resolvePickerColor(
      styles.color ?? colours[0],
      readFirstPaintedElement(range, "color"),
      DEFAULT_COLOR,
    ),
  };
}

function isBold(weight: string | undefined): boolean {
  if (!weight) return false;
  if (weight === "bold" || weight === "bolder") return true;
  return Number.parseInt(weight, 10) >= 600;
}

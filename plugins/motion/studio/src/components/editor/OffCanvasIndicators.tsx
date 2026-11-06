import { useI18n } from "../../i18n/I18n";
import React from "react";
import { type DomEditSelection } from "./domEditing";

export interface OffCanvasRect {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  angle?: number;
}

interface OffCanvasIndicatorsProps {
  rects: OffCanvasRect[];
  elements: React.MutableRefObject<Map<string, HTMLElement>>;
  compRect: { left: number; top: number; width: number; height: number };
  selection: DomEditSelection | null;
  groupSelections: DomEditSelection[];
  activeCompositionPathRef: React.MutableRefObject<string | null>;
  onSelectionChangeRef: React.MutableRefObject<
    (selection: DomEditSelection, options?: { revealPanel?: boolean; additive?: boolean }) => void
  >;
}

function clipOutsideCanvas(
  rect: OffCanvasRect,
  compRect: { left: number; top: number; width: number; height: number },
): string | undefined {
  const angle = rect.angle ?? 0;
  if (!angle) {
    const left = Math.max(0, compRect.left - rect.left);
    const top = Math.max(0, compRect.top - rect.top);
    const right = Math.min(rect.width, compRect.left + compRect.width - rect.left);
    const bottom = Math.min(rect.height, compRect.top + compRect.height - rect.top);
    if (left >= right || top >= bottom) return undefined;
    return `polygon(evenodd, 0 0, ${rect.width}px 0, ${rect.width}px ${rect.height}px, 0 ${rect.height}px, 0 0, ${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px, ${left}px ${top}px)`;
  }

  const radians = (-angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const toLocal = (x: number, y: number) => {
    const dx = x - centerX;
    const dy = y - centerY;
    return `${rect.width / 2 + dx * cos - dy * sin}px ${rect.height / 2 + dx * sin + dy * cos}px`;
  };
  const left = compRect.left;
  const top = compRect.top;
  const right = left + compRect.width;
  const bottom = top + compRect.height;
  const canvas = [
    toLocal(left, top),
    toLocal(right, top),
    toLocal(right, bottom),
    toLocal(left, bottom),
    toLocal(left, top),
  ].join(", ");
  return `polygon(evenodd, 0 0, ${rect.width}px 0, ${rect.width}px ${rect.height}px, 0 ${rect.height}px, 0 0, ${canvas})`;
}

/**
 * Dashed teal indicators for elements whose bounds extend past the composition
 * (the "gray zone"). The in-canvas portion is clipped away so only the
 * protruding sliver is dashed — the on-canvas part gets no outline, since a
 * solid selection-style border on an unselected element reads as "selected".
 * Extracted from DomEditOverlay to keep that file under the 600-LOC cap.
 */
export function OffCanvasIndicators({
  rects,
  elements,
  compRect,
  selection,
  groupSelections,
  activeCompositionPathRef,
  onSelectionChangeRef,
}: OffCanvasIndicatorsProps): React.ReactElement {
  const { t } = useI18n();
  return (
    <>
      {rects
        .filter((r) => {
          // Suppress the indicator for any currently-selected element (primary
          // OR a marquee group member) — those already render a selection box.
          const el = elements.current.get(r.key);
          if (!el) return true;
          if (selection?.element === el) return false;
          return !groupSelections.some((g) => g.element === el);
        })
        .map((r) => {
          const pos = {
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            transform: r.angle ? `rotate(${r.angle}deg)` : undefined,
            transformOrigin: "center",
          };
          const clipOutside = clipOutsideCanvas(r, compRect);
          const selectOffCanvas = async () => {
            const el = elements.current.get(r.key);
            if (!el) return;
            const { resolveDomEditSelection } = await import("./domEditingLayers");
            const acp = activeCompositionPathRef.current ?? "index.html";
            const sel = await resolveDomEditSelection(el, {
              activeCompositionPath: acp,
              isMasterView: !acp || acp === "index.html",
              skipSourceProbe: true,
            });
            if (sel) onSelectionChangeRef.current(sel, { revealPanel: true });
          };
          const handleClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            void selectOffCanvas();
          };
          return (
            <div key={`offcanvas-${r.key}`} className="pointer-events-none absolute" style={pos}>
              {/* Dashed layer — clipped to exclude canvas area.
                  Note: clip-path is visual only — hit-testing still covers the
                  full bounding rect, so clicking the in-canvas portion selects
                  via this handler. That's acceptable: it resolves the same
                  element the normal canvas path would, just with
                  skipSourceProbe (the element is already known here). */}
              <div
                role="button"
                tabIndex={0}
                aria-label={t("Select off-canvas element {value0}", { value0: r.key })}
                className="pointer-events-auto absolute inset-0 border-2 border-dashed border-studio-accent/10 rounded-md cursor-pointer hover:border-studio-accent hover:bg-studio-accent/10 transition-colors"
                style={clipOutside ? { clipPath: clipOutside } : undefined}
                title={t("Off-canvas: {value0}. Click to select", { value0: r.key })}
                onClick={handleClick}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    void selectOffCanvas();
                  }
                }}
              />
            </div>
          );
        })}
    </>
  );
}

/**
 * The dashed outlines around a selected element's children.
 *
 * Extracted from the canvas overlay, which is at its 600-line limit, and it
 * sits here rather than in its own file because it is the same kind of thing:
 * a passive, non-interactive mark the overlay draws over the composition.
 */
export function ChildRectOutlines({
  rects,
}: {
  rects: ReadonlyArray<{
    left: number;
    top: number;
    width: number;
    height: number;
    angle?: number;
  }>;
}) {
  return (
    <>
      {rects.map((rect, index) => (
        <div
          key={index}
          className="pointer-events-none absolute border border-dashed border-white/20 rounded-xs"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            // A child outline is drawn ON the child, so it rotates with it.
            transform: rect.angle ? `rotate(${rect.angle}deg)` : undefined,
          }}
        />
      ))}
    </>
  );
}

import { memo, useRef, type RefObject } from "react";
import { useMountEffect } from "../../hooks/useMountEffect";
import { resolveGuideLineRect, type SnapGuide, type SpacingGuide } from "./snapEngine";
import { subscribeOverlayFrame } from "./overlayFrameLoop";

export interface SnapGuidesState {
  guides: SnapGuide[];
  spacingGuides: SpacingGuide[];
}

const MAX_GUIDES = 6;
const MAX_SPACING_GUIDES = 4;

const GUIDE_COLOR = "rgba(255, 68, 204, 0.85)";
const SPACING_COLOR = "rgba(255, 68, 204, 0.6)";
const SPACING_BG = "rgba(255, 68, 204, 0.15)";

export interface SnapGuideOverlayProps {
  snapGuidesRef: RefObject<SnapGuidesState | null>;
  /** Composition rect in overlay space — guide lines span exactly this rect. */
  compositionLeft: number;
  compositionTop: number;
  compositionWidth: number;
  compositionHeight: number;
}

export const SnapGuideOverlay = memo(function SnapGuideOverlay({
  snapGuidesRef,
  compositionLeft,
  compositionTop,
  compositionWidth,
  compositionHeight,
}: SnapGuideOverlayProps) {
  const guideElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const spacingElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const spacingLabelElsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const compositionRectRef = useRef({
    left: compositionLeft,
    top: compositionTop,
    width: compositionWidth,
    height: compositionHeight,
  });
  compositionRectRef.current = {
    left: compositionLeft,
    top: compositionTop,
    width: compositionWidth,
    height: compositionHeight,
  };

  useMountEffect(() => {
    // fallow-ignore-next-line complexity
    const update = () => {
      const state = snapGuidesRef.current;
      const guides = state?.guides ?? [];
      const spacingGuides = state?.spacingGuides ?? [];
      const composition = compositionRectRef.current;

      for (let i = 0; i < MAX_GUIDES; i++) {
        const el = guideElsRef.current[i];
        if (!el) continue;

        const guide = guides[i];
        if (!guide) {
          el.style.display = "none";
          continue;
        }

        el.style.display = "";
        const line = resolveGuideLineRect(guide, composition);
        el.style.left = `${line.left}px`;
        el.style.top = `${line.top}px`;
        el.style.width = `${line.width}px`;
        el.style.height = `${line.height}px`;
      }

      for (let i = 0; i < MAX_SPACING_GUIDES; i++) {
        const el = spacingElsRef.current[i];
        const label = spacingLabelElsRef.current[i];
        if (!el) continue;

        const sg = spacingGuides[i];
        if (!sg) {
          el.style.display = "none";
          continue;
        }

        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        if (sg.axis === "x") {
          el.style.left = `${sg.position}px`;
          el.style.top = `${sg.from}px`;
          el.style.width = `${sg.size}px`;
          el.style.height = `${sg.to - sg.from}px`;
          el.style.borderLeft = `1px dashed ${SPACING_COLOR}`;
          el.style.borderRight = `1px dashed ${SPACING_COLOR}`;
          el.style.borderTop = "none";
          el.style.borderBottom = "none";
        } else {
          el.style.left = `${sg.from}px`;
          el.style.top = `${sg.position}px`;
          el.style.width = `${sg.to - sg.from}px`;
          el.style.height = `${sg.size}px`;
          el.style.borderTop = `1px dashed ${SPACING_COLOR}`;
          el.style.borderBottom = `1px dashed ${SPACING_COLOR}`;
          el.style.borderLeft = "none";
          el.style.borderRight = "none";
        }

        if (label) {
          label.textContent = `${Math.round(sg.size)}`;
        }
      }
    };

    return subscribeOverlayFrame(update);
  });

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {Array.from({ length: MAX_GUIDES }, (_, i) => (
        <div
          key={`guide-${i}`}
          ref={(el) => {
            guideElsRef.current[i] = el;
          }}
          style={{
            display: "none",
            position: "absolute",
            backgroundColor: GUIDE_COLOR,
            zIndex: 50,
          }}
        />
      ))}

      {Array.from({ length: MAX_SPACING_GUIDES }, (_, i) => (
        <div
          key={`spacing-${i}`}
          ref={(el) => {
            spacingElsRef.current[i] = el;
          }}
          style={{
            display: "none",
            position: "absolute",
            zIndex: 50,
          }}
        >
          <span
            ref={(el) => {
              spacingLabelElsRef.current[i] = el;
            }}
            style={{
              fontSize: "10px",
              fontFamily: "monospace",
              color: GUIDE_COLOR,
              backgroundColor: SPACING_BG,
              padding: "0 3px",
              borderRadius: "2px",
              lineHeight: "14px",
              whiteSpace: "nowrap",
            }}
          />
        </div>
      ))}
    </div>
  );
});

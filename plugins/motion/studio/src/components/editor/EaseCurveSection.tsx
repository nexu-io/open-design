import { useI18n } from "../../i18n/I18n";
import { useEffect, useId, useRef, useState } from "react";
import { evaluateSpringEase, parseSpringBounce } from "@hyperframes/core/spring-ease";
import {
  evaluateWiggleEase,
  parseWiggleEase,
  type WiggleEaseConfig,
} from "@hyperframes/core/wiggle-ease";
import { easePresetLabel } from "./easePresetLibrary";
import {
  DEFAULT_CURVE,
  MODE_LABELS,
  EaseModeToggle,
  EasePresetGrid,
  type EaseMode,
  type Pts,
} from "./EaseModeControls";
import { holdCurvePath, MiniCurveSvg, sampledPath } from "./easeCurveSvg";
import { EaseBezierField, SpringBounceField, WiggleField } from "./EaseParamFields";
import { EASE_CURVES, EASE_LABELS, resolveEaseCurveTuple } from "./gsapAnimationConstants";
import { roundToCenti } from "../../utils/rounding";
import type { AnimationKeyframeTarget } from "../../hooks/gsapTweenSynth";

export { MiniCurveSvg } from "./easeCurveSvg";

const round2 = roundToCenti;

// ── Graph geometry (Figma-style easing box) ─────────────────────────────────
// A geometrically-square unit plot ([0,1]×[0,1], equal X/Y scale so the curve
// isn't distorted), with fixed overshoot headroom above 1 and below 0 for
// back/elastic eases. The view is fixed (no per-curve zoom); handles are clamped
// to the visible range so they never drift off-screen.
const S = 184; // side of the unit (0..1) square, in viewBox units
const HR = 52; // overshoot headroom (top & bottom)
const PADH = 16; // horizontal breathing room
const SVGW = S + PADH * 2;
const SVGH = S + HR * 2;
const VMAX = 1 + HR / S; // top of visible view (progress overshoot headroom)
const VMIN = -HR / S; // bottom of visible view (undershoot headroom)
// Committed control points may extend PAST the visible view — heavy back/elastic
// presets reach ~1.55 / -0.55. Dragging clamps to this wider bound (cursor can
// leave the box via pointer capture) so those curves keep their fidelity instead
// of snapping to the view edge; the handle DOT is still clampView'd into view.
const DRAG_VMAX = 2;
const DRAG_VMIN = -1;

// Figma-style ease-type dropdown: the current ease (glyph + name) as a button
// that opens the preset grid in a popover. This is where a preset is selected —
// the grid is no longer shown inline.
function EaseTypeDropdown({
  kind,
  ease,
  label,
  onSelect,
}: {
  kind: EaseMode;
  ease: string;
  label: string;
  onSelect: (ease: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    const selected =
      menu?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]') ??
      menu?.querySelector<HTMLButtonElement>('[role="menuitemradio"]');
    selected?.focus();

    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -4,
      ArrowDown: 4,
    };
    const offset = offsets[event.key];
    if (offset === undefined && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    );
    if (items.length === 0) return;
    const current = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (current + (offset ?? 0) + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className="relative mb-2">
      <button
        ref={triggerRef}
        type="button"
        data-ease-type-dropdown=""
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2 rounded-md border border-border bg-input px-2 py-1.5 text-left transition-colors hover:border-border-strong"
      >
        <MiniCurveSvg ease={ease} active size={16} />
        <span className="text-[11px] text-neutral-200">{label}</span>
        <svg
          width="8"
          height="8"
          viewBox="0 0 10 10"
          fill="currentColor"
          className={`ml-auto text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M2 3l3 4 3-4z" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t("{value0} ease presets", { value0: MODE_LABELS[kind] })}
          onKeyDown={handleMenuKeyDown}
          className="absolute inset-x-0 top-full z-20 mt-1 rounded-md border border-border bg-raised p-2 shadow-xl"
        >
          <EasePresetGrid
            kind={kind}
            currentEase={ease}
            onSelect={(next) => {
              onSelect(next);
              setOpen(false);
              triggerRef.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}

function resolveEditableCurve(ease: string, springBounce: number | null): Pts | null {
  if (springBounce !== null) return DEFAULT_CURVE;
  if (ease === "hold") return null;
  if (ease.startsWith("custom(") || ease in EASE_CURVES) return resolveEaseCurveTuple(ease);
  return null;
}

function resolveEditorLabel(ease: string, springBounce: number | null, isWiggle: boolean): string {
  const presetLabel = easePresetLabel(ease);
  if (presetLabel !== null) return presetLabel;
  if (springBounce !== null) return "Custom spring";
  if (isWiggle) return "Custom wiggle";
  if (ease.startsWith("custom(")) return "Custom bezier";
  return EASE_LABELS[ease] ?? ease;
}

const xToSvg = (px: number) => PADH + S * px;
const yToSvg = (py: number) => HR + S * (1 - py);
const clampView = (py: number) => Math.max(VMIN, Math.min(VMAX, py));
const clampDragY = (py: number) => Math.max(DRAG_VMIN, Math.min(DRAG_VMAX, py));

function nudgeCurve(tuple: Pts, handle: "p1" | "p2", key: string, step: number): Pts | null {
  const deltaX = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
  const deltaY = key === "ArrowDown" ? -step : key === "ArrowUp" ? step : 0;
  if (deltaX === 0 && deltaY === 0) return null;
  const next: Pts = [...tuple];
  const xIndex = handle === "p1" ? 0 : 2;
  const yIndex = handle === "p1" ? 1 : 3;
  next[xIndex] = round2(Math.max(0, Math.min(1, next[xIndex] + deltaX)));
  next[yIndex] = round2(clampDragY(next[yIndex] + deltaY));
  return next;
}

function curvePathFor(
  ease: string,
  springBounce: number | null,
  wiggleConfig: WiggleEaseConfig | null,
  tuple: Pts,
): string {
  if (ease === "hold") return holdCurvePath(xToSvg(0), yToSvg(0), xToSvg(1), yToSvg(1));
  if (wiggleConfig !== null) {
    return sampledPath(64, xToSvg, yToSvg, (progress) =>
      evaluateWiggleEase(progress, wiggleConfig.wiggles, wiggleConfig.type, wiggleConfig.amplitude),
    );
  }
  if (springBounce !== null) {
    return sampledPath(64, xToSvg, yToSvg, (progress) =>
      evaluateSpringEase(progress, springBounce),
    );
  }
  const [x1, y1, x2, y2] = tuple;
  return `M${xToSvg(0)},${yToSvg(0)} C${xToSvg(x1)},${yToSvg(y1)} ${xToSvg(x2)},${yToSvg(y2)} ${xToSvg(1)},${yToSvg(1)}`;
}

function EaseParameterField({
  springBounce,
  wiggleConfig,
  tuple,
  onCommit,
}: {
  springBounce: number | null;
  wiggleConfig: WiggleEaseConfig | null;
  tuple: Pts;
  onCommit: (ease: string) => void;
}) {
  if (springBounce !== null) {
    return <SpringBounceField springBounce={springBounce} onCommit={onCommit} />;
  }
  if (wiggleConfig !== null) return <WiggleField config={wiggleConfig} onCommit={onCommit} />;
  return <EaseBezierField tuple={tuple} onCommit={onCommit} />;
}

/**
 * How long an optimistically painted ease may outlive its commit. Long enough
 * for a normal write-reparse-rerender round trip, short enough that a dropped
 * write self-corrects while the author is still looking at the panel.
 */
const PENDING_EASE_TIMEOUT_MS = 2000;

export function EaseCurveSection({
  ease,
  onCustomEaseCommit,
  collidingAnimationTargets,
}: {
  ease: string;
  onCustomEaseCommit: (ease: string) => void;
  collidingAnimationTargets?: AnimationKeyframeTarget[];
}) {
  const { t } = useI18n();
  // The ease this section painted optimistically, still waiting for its commit
  // to round-trip back through the `ease` prop.
  const [pendingEase, setPendingEase] = useState<string | null>(null);
  // Every value committed and not yet seen coming back, oldest first. It takes
  // the whole queue, not just the latest, to tell an older commit echoing back
  // apart from an edit made somewhere else.
  const inFlightEasesRef = useRef<string[]>([]);
  const displayedEase = pendingEase ?? ease;
  const springBounce = parseSpringBounce(displayedEase);
  const isSpring = springBounce !== null;
  const wiggleConfig = parseWiggleEase(displayedEase);
  const isWiggle = wiggleConfig !== null;
  const mode: EaseMode = isSpring ? "spring" : isWiggle ? "wiggle" : "curve";
  const curve = resolveEditableCurve(displayedEase, springBounce);

  const [draft, setDraft] = useState<Pts | null>(null);
  const [hover, setHover] = useState<"p1" | "p2" | null>(null);
  const draggingRef = useRef<"p1" | "p2" | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Keep the local draft displayed until the committed `ease` prop round-trips
  // back (write → reparse → re-render), then drop it. Clearing on pointer-up
  // instead would fall back to the STALE prop for a frame — the curve snaps to
  // the old value and jumps to the new one (the commit flicker). By the time
  // `ease` changes, `curve` already equals the draft, so the handoff is seamless.
  useEffect(() => {
    setDraft(null);
    const inFlight = inFlightEasesRef.current;
    const landed = inFlight.indexOf(ease);
    if (landed < 0) {
      // A value this section never sent: someone else edited the ease, so the
      // real value wins over anything optimistic still on screen.
      inFlight.length = 0;
      setPendingEase(null);
      return;
    }
    // One of this section's own commits came back. Everything sent before it
    // is settled with it, but a NEWER commit may still be in flight, and
    // repainting this older value while waiting for that one is the
    // wiggle-then-spring-then-wiggle flicker of a fast double switch.
    inFlight.splice(0, landed + 1);
    if (inFlight.length === 0) setPendingEase(null);
  }, [ease]);

  // A commit is fire-and-forget, so a write that is rejected or lands as a
  // no-op never changes `ease`, and the optimistic value would sit on screen
  // claiming a curve the composition does not have. Nothing downstream reports
  // that failure, so the display is time-bounded instead: fall back to the
  // committed truth when the round trip does not arrive.
  useEffect(() => {
    if (pendingEase === null) return;
    const timer = setTimeout(() => {
      inFlightEasesRef.current.length = 0;
      setPendingEase(null);
    }, PENDING_EASE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingEase]);

  const commitEase = (nextEase: string) => {
    inFlightEasesRef.current.push(nextEase);
    setPendingEase(nextEase);
    onCustomEaseCommit(nextEase);
  };

  const activeTuple = draft ?? curve;
  const displayTuple = activeTuple ?? DEFAULT_CURVE;
  const [x1, y1, x2, y2] = displayTuple;

  // Anchors + control handles. Handle *display* is clamped to the view so an
  // extreme loaded overshoot rides the edge instead of disappearing.
  const a0 = { x: xToSvg(0), y: yToSvg(0) };
  const a1 = { x: xToSvg(1), y: yToSvg(1) };
  const p1 = { x: xToSvg(x1), y: yToSvg(clampView(y1)) };
  const p2 = { x: xToSvg(x2), y: yToSvg(clampView(y2)) };
  // Read the OPTIMISTIC ease everywhere the graph is derived, so a mode switch
  // paints immediately instead of waiting for the committed prop to come back.
  const curvePath = curvePathFor(displayedEase, springBounce, wiggleConfig, displayTuple);
  const showGraph = activeTuple !== null || isWiggle || displayedEase === "hold";
  // `curve !== null` is what keeps Hold handle-free: it draws a graph (a flat
  // step) but has no editable control points to drag.
  const showHandles = curve !== null && !isSpring && !isWiggle;

  const handlePointerDown = (handle: "p1" | "p2", e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = handle;
    (e.target as SVGElement).setPointerCapture(e.pointerId);
    if (!draft) setDraft([x1, y1, x2, y2]);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingRef.current || !svgRef.current) return;
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * SVGW;
    const sy = ((e.clientY - rect.top) / rect.height) * SVGH;
    // px is clamped to [0,1] on purpose: a cubic-bezier ease must be monotonic in
    // time (handle1.x ≤ handle2.x), so handles can't pass each other or invert.
    const px = Math.max(0, Math.min(1, (sx - PADH) / S));
    // py uses the WIDER drag bound (not clampView), so dragging keeps overshoot
    // fidelity instead of pinning the committed value to the visible view edge.
    const py = clampDragY(1 - (sy - HR) / S);
    const prev = draft ?? [x1, y1, x2, y2];
    const next: Pts =
      draggingRef.current === "p1"
        ? [round2(px), round2(py), prev[2], prev[3]]
        : [prev[0], prev[1], round2(px), round2(py)];
    setDraft(next);
  };

  const handlePointerUp = () => {
    if (!draggingRef.current || !draft) return;
    draggingRef.current = null;
    const path = `M0,0 C${draft[0]},${draft[1]} ${draft[2]},${draft[3]} 1,1`;
    // Commit only — the draft stays on screen and is cleared by the effect above
    // once the committed `ease` prop comes back, so the curve never flickers.
    commitEase(`custom(${path})`);
  };

  const handleKeyDown = (handle: "p1" | "p2", event: React.KeyboardEvent<SVGCircleElement>) => {
    const next = nudgeCurve(displayTuple, handle, event.key, event.shiftKey ? 0.1 : 0.01);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    setDraft(next);
    // Same no-flicker contract as the pointer path: commit and let the effect
    // clear the draft, rather than dropping it on the next microtask.
    commitEase(`custom(M0,0 C${next[0]},${next[1]} ${next[2]},${next[3]} 1,1)`);
  };

  const top = yToSvg(1);
  const bottom = yToSvg(0);
  const left = xToSvg(0);
  const right = xToSvg(1);
  const label = resolveEditorLabel(displayedEase, springBounce, isWiggle);

  return (
    <div className="rounded-lg bg-neutral-900/50 p-2">
      <EaseTypeDropdown kind={mode} ease={displayedEase} label={label} onSelect={commitEase} />
      {collidingAnimationTargets && collidingAnimationTargets.length > 1 && (
        <p className="mb-1 text-[9px] text-neutral-500">
          {t("Applies to")}{" "}{collidingAnimationTargets.length} {t("animations")}</p>
      )}
      <EaseModeToggle mode={mode} onCommit={commitEase} />
      <span className="sr-only" aria-live="polite">
        {MODE_LABELS[mode]} {t("ease editor selected")}</span>
      {showGraph ? (
        <>
          <div
            className="mx-auto overflow-hidden rounded-md border border-border bg-input"
            style={{ aspectRatio: `${SVGW} / ${SVGH}`, width: "100%", maxWidth: 230 }}
          >
            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              viewBox={`0 0 ${SVGW} ${SVGH}`}
              preserveAspectRatio="none"
              className="touch-none select-none"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {/* Grid — quarter lines inside the unit square */}
              {[0.25, 0.5, 0.75].map((q) => (
                <line
                  key={`v${q}`}
                  x1={xToSvg(q)}
                  y1={top}
                  x2={xToSvg(q)}
                  y2={bottom}
                  className="stroke-text-0"
                  strokeOpacity="0.05"
                  strokeWidth="1"
                />
              ))}
              {[0.25, 0.5, 0.75].map((q) => (
                <line
                  key={`h${q}`}
                  x1={left}
                  y1={yToSvg(q)}
                  x2={right}
                  y2={yToSvg(q)}
                  className="stroke-text-0"
                  strokeOpacity="0.05"
                  strokeWidth="1"
                />
              ))}
              {/* Unit-square frame (progress 0 → 1) */}
              <rect
                x={left}
                y={top}
                width={S}
                height={bottom - top}
                fill="none"
                className="stroke-text-0"
                strokeOpacity="0.1"
                strokeWidth="1"
              />
              {/* Linear reference diagonal */}
              <line
                x1={a0.x}
                y1={a0.y}
                x2={a1.x}
                y2={a1.y}
                className="stroke-text-0"
                strokeOpacity="0.08"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
              {/* Tangent handle lines */}
              {showHandles && (
                <>
                  <line
                    x1={a0.x}
                    y1={a0.y}
                    x2={p1.x}
                    y2={p1.y}
                    className="stroke-accent-ink"
                    strokeWidth="1.5"
                  />
                  <line
                    x1={a1.x}
                    y1={a1.y}
                    x2={p2.x}
                    y2={p2.y}
                    className="stroke-accent-ink"
                    strokeWidth="1.5"
                  />
                </>
              )}
              {/* The curve */}
              <path
                d={curvePath}
                fill="none"
                className="stroke-accent-ink"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Anchors at (0,0) and (1,1) */}
              <circle cx={a0.x} cy={a0.y} r="3" className="fill-accent-ink" />
              <circle cx={a1.x} cy={a1.y} r="3" className="fill-accent-ink" />
              {/* Draggable control handles (large transparent hit area + visible dot) */}
              {showHandles &&
                [["p1", p1] as const, ["p2", p2] as const].map(([key, pt]) => (
                  <g key={key}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="14"
                      fill="transparent"
                      role="slider"
                      tabIndex={0}
                      aria-label={t("{value0} bezier control point", { value0: key === "p1" ? "First" : "Second" })}
                      aria-valuemin={0}
                      aria-valuemax={1}
                      aria-valuenow={key === "p1" ? x1 : x2}
                      aria-valuetext={`x ${key === "p1" ? x1 : x2}, y ${key === "p1" ? y1 : y2}`}
                      className="cursor-grab stroke-transparent outline-hidden active:cursor-grabbing focus-visible:stroke-text-0 focus-visible:stroke-[2px]"
                      onPointerDown={(e) => handlePointerDown(key, e)}
                      onKeyDown={(event) => handleKeyDown(key, event)}
                      onPointerEnter={() => setHover(key)}
                      onPointerLeave={() => setHover((h) => (h === key ? null : h))}
                    />
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={hover === key || draggingRef.current === key ? 7 : 5.5}
                      strokeWidth="2.5"
                      className="pointer-events-none fill-input stroke-accent-ink transition-[r]"
                    />
                  </g>
                ))}
            </svg>
          </div>
          <EaseParameterField
            springBounce={springBounce}
            wiggleConfig={wiggleConfig}
            tuple={displayTuple}
            onCommit={commitEase}
          />
        </>
      ) : (
        <p className="px-0.5 py-1.5 text-[10px] leading-relaxed text-neutral-500">
          {label} {t("preset: switch to Curve, Spring, or Wiggle above to shape it by hand.")}</p>
      )}
    </div>
  );
}

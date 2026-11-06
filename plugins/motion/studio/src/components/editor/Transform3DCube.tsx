import { useI18n } from "../../i18n/I18n";
import { useEffect, useRef, useState } from "react";
import { projectAxes, projectCubeFaces, wrapDeg } from "./transform3dProjection";

export interface CubePose {
  rotationX: number;
  rotationY: number;
  rotationZ: number;
}

const VIEW_W = 132;
const VIEW_H = 112;
const CX = VIEW_W / 2;
const CY = 54;
const RADIUS = 26;
// The cube mirrors the element's orientation 1:1 — no decorative viewing camera,
// so at rotation 0/0/0 it faces front (flat) exactly like the un-rotated element.
// The X/Y/Z axis gizmo keeps the flat-at-rest state readable.
const SENSITIVITY = 0.6; // degrees per pixel of drag

/**
 * Draggable 3D-orientation cube. Drag to tilt (X/Y); Shift-drag to roll (Z).
 * Presentational only: emits a live draft pose while dragging and a final pose
 * on release — the parent owns live-previewing and committing to GSAP props.
 */
// transformPerspective (px) drives the cube's weak-perspective projection;
// 0 = off → flattest (largest projection distance).
const pxToProjPersp = (px: number) => (px > 0 ? Math.max(2.2, Math.min(14, px / 130)) : 14);

export function Transform3DCube({
  pose,
  perspective = 0,
  defaultPerspective = 0,
  z = 0,
  onPoseDraft,
  onPoseCommit,
  onDepthDraft,
  onDepthCommit,
  onRecenter,
  onKeyframe,
  keyframed,
}: {
  pose: CubePose;
  /** Element's transformPerspective (px); drives the cube's foreshortening. */
  perspective?: number;
  /** Comp-derived lens used for depth feedback before a perspective is committed. */
  defaultPerspective?: number;
  /** Element's translateZ (px) — "depth", adjusted by scrolling over the cube. */
  z?: number;
  /** Fires on every drag move with the in-progress pose (parent live-previews). */
  onPoseDraft?: (pose: CubePose) => void;
  /** Fires once on pointer release with the final pose (commit). */
  onPoseCommit: (pose: CubePose) => void;
  /** Live depth (translateZ px) during a scroll; parent live-previews it. */
  onDepthDraft?: (z: number) => void;
  /** Committed depth (translateZ px) once a scroll burst settles. */
  onDepthCommit?: (z: number) => void;
  /** Reset to identity orientation. */
  onRecenter?: () => void;
  /** Toggle keyframing the 3D transform (convert the static set → keyframes). */
  onKeyframe?: () => void;
  /** Whether the 3D transform is already keyframed (drives the toggle's state). */
  keyframed?: boolean;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<CubePose | null>(null);
  const [depthDraft, setDepthDraft] = useState<number | null>(null);
  const dragRef = useRef<{ x: number; y: number; pose: CubePose } | null>(null);
  const shown = draft ?? pose;
  const shownZ = depthDraft ?? z;

  // Scroll over the cube to push the element along Z (depth) — matches the
  // studio's "scroll = z depth" gesture-recording convention. A non-passive
  // listener is required so preventDefault can stop the panel from scrolling.
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Perspective lens (committed, else the comp-derived default the panel will
  // apply). Drives the cube's depth-scale feedback AND clamps the scroll so depth
  // can't cross the lens. Defined here so the wheel handler can read it via the ref.
  const lens = perspective > 0 ? perspective : defaultPerspective;
  const depthRef = useRef({ z, onDepthDraft, onDepthCommit, lens });
  depthRef.current = { z, onDepthDraft, onDepthCommit, lens };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    let pending: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (e: WheelEvent) => {
      const { onDepthCommit: commit, onDepthDraft: draft } = depthRef.current;
      if (!commit) return;
      e.preventDefault();
      // ponytail: 0.25 px of Z per wheel-delta unit (~25px per notch); tune if
      // it feels too fast/slow. Scroll up (deltaY < 0) pushes toward the viewer.
      let next = Math.round((pending ?? depthRef.current.z) - e.deltaY * 0.25);
      // Clamp depth in front of the perspective lens. At z ≥ lens the element sits
      // at/behind the virtual camera and the projection lens/(lens−z) blows up or
      // inverts — that's the runaway "Z = 3195px past a 1080 lens". Cap just short
      // of the lens; allow pushing well back (smaller) but not absurdly far.
      const L = depthRef.current.lens;
      if (L > 0) next = Math.max(Math.min(next, Math.round(L * 0.85)), Math.round(-L * 4));
      pending = next;
      draft?.(pending);
      setDepthDraft(pending); // live-scale the cube while scrolling
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (pending != null) commit(pending);
        pending = null;
        setDepthDraft(null); // fall back to the committed z prop
      }, 160);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Depth feedback: the cube scales like the element would — translateZ(z) under
  // a perspective lens P appears scaled by P/(P-z). Closer (z>0) reads bigger,
  // farther (z<0) smaller. Use the committed perspective, else the comp-derived
  // lens the panel is about to apply — same value in both, so the cube doesn't
  // jump when the commit lands. If neither is known, skip the scale (no lens).
  const depthScale = lens > 0 ? Math.max(0.4, Math.min(2.2, lens / (lens - shownZ))) : 1;
  const projOpts = {
    cx: CX,
    cy: CY,
    r: RADIUS * depthScale,
    persp: pxToProjPersp(lens),
  };
  // The element lives in CSS's screen-Y-down space; the cube projects Y-up. RotateX
  // and RotateZ act in planes that contain Y, so they read inverted in the gizmo
  // unless their sign is flipped — RotateY (X-Z plane) matches as-is. This keeps the
  // cube's orientation a true mirror of the element.
  const faces = projectCubeFaces(-shown.rotationX, shown.rotationY, -shown.rotationZ, projOpts);
  const axes = projectAxes(-shown.rotationX, shown.rotationY, -shown.rotationZ, projOpts);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, pose: shown };
    setDraft(shown);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    // dy→rotationX and shift dx→rotationZ are negated to match the projection's
    // sign flip (above), so the cube's response to a drag is unchanged while the
    // element now rotates in lock-step with it.
    const next: CubePose = e.shiftKey
      ? { ...d.pose, rotationZ: wrapDeg(d.pose.rotationZ - dx * SENSITIVITY) }
      : {
          rotationX: wrapDeg(d.pose.rotationX + dy * SENSITIVITY),
          rotationY: wrapDeg(d.pose.rotationY + dx * SENSITIVITY),
          rotationZ: d.pose.rotationZ,
        };
    setDraft(next);
    onPoseDraft?.(next);
  };

  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (draft) onPoseCommit(draft);
    setDraft(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    const STEP = e.altKey ? 1 : 5;
    let next: CubePose | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const dir = e.key === "ArrowUp" ? -1 : 1;
      next = e.shiftKey
        ? { ...shown, rotationZ: wrapDeg(shown.rotationZ + dir * STEP) }
        : { ...shown, rotationX: wrapDeg(shown.rotationX + dir * STEP) };
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const dir = e.key === "ArrowRight" ? 1 : -1;
      next = e.shiftKey
        ? { ...shown, rotationZ: wrapDeg(shown.rotationZ + dir * STEP) }
        : { ...shown, rotationY: wrapDeg(shown.rotationY + dir * STEP) };
    }
    if (!next) return;
    e.preventDefault();
    onPoseCommit(next);
  };

  return (
    <div className="relative overflow-hidden rounded-lg border border-neutral-800 bg-linear-to-b from-neutral-900 to-neutral-950">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="block w-full cursor-grab touch-none select-none active:cursor-grabbing"
        style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        tabIndex={0}
        role="slider"
        aria-label={t("3D rotation. Arrow keys rotate X/Y, Shift+arrows roll Z, Alt for fine steps; drag to rotate, scroll to change depth")}
        aria-valuetext={`X ${Math.round(shown.rotationX)}°, Y ${Math.round(
          shown.rotationY,
        )}°, Z ${Math.round(shown.rotationZ)}°`}
      >
        <defs>
          <radialGradient id="cube3d-bg" cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#172220" />
            <stop offset="100%" stopColor="#070a09" />
          </radialGradient>
          {/* Soft halo so the cube floats; SourceGraphic stays crisp on top. */}
          <filter id="cube3d-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#cube3d-bg)" />
        {/* Grounding shadow under the cube. */}
        <ellipse
          cx={CX}
          cy={CY + RADIUS + 22}
          rx={RADIUS * 1.2}
          ry={6.5}
          fill="#000"
          opacity={0.4}
        />
        {/* Away-facing axes are drawn behind the cube, dimmed. */}
        {axes
          .filter((a) => !a.front)
          .map((a) => (
            <line
              key={a.id}
              x1={CX}
              y1={CY}
              x2={a.x2}
              y2={a.y2}
              stroke={a.color}
              strokeWidth={1.4}
              strokeLinecap="round"
              opacity={0.3}
            />
          ))}
        <g filter="url(#cube3d-glow)">
          {faces.map((f) => (
            <polygon
              key={f.id}
              points={f.points}
              // Muted teal face, lit by direction; edges are a soft mint that
              // brightens with how front-facing the face is, so corners read as
              // crisp bevels instead of flat neon outlines.
              fill={`hsl(166 44% ${Math.round(17 + f.shade * 37)}%)`}
              stroke={`hsl(164 72% ${Math.round(56 + f.shade * 22)}%)`}
              strokeWidth={1.1}
              strokeOpacity={0.82}
              strokeLinejoin="round"
              strokeLinecap="round"
              paintOrder="stroke"
            />
          ))}
        </g>
        {/* Toward-facing axes on top, with a tip dot + X/Y/Z label. */}
        {axes
          .filter((a) => a.front)
          .map((a) => (
            <g key={a.id}>
              <line
                x1={CX}
                y1={CY}
                x2={a.x2}
                y2={a.y2}
                stroke={a.color}
                strokeWidth={1.6}
                strokeLinecap="round"
                opacity={0.95}
              />
              <circle cx={a.x2} cy={a.y2} r={2.4} fill={a.color} />
              <text
                x={a.x2 + (a.x2 - CX) * 0.12}
                y={a.y2 + (a.y2 - CY) * 0.12 + 2}
                fill={a.color}
                fontSize={7}
                fontWeight={700}
                textAnchor="middle"
              >
                {a.id.toUpperCase()}
              </text>
            </g>
          ))}
      </svg>
      {onRecenter && (
        <button
          type="button"
          onClick={onRecenter}
          title={t("Reset 3D orientation")}
          aria-label={t("Reset 3D orientation")}
          className="absolute right-1.5 top-1.5 rounded-sm p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="9" strokeWidth="2" />
            <path d="M12 3v18M3 12h18" strokeWidth="1.5" />
          </svg>
        </button>
      )}
      {onKeyframe && (
        <button
          type="button"
          onClick={onKeyframe}
          title={
            keyframed
              ? t("3D transform is keyframed. Click a field diamond to add keyframes")
              : t("Keyframe the 3D transform (animate it over time)")
          }
          aria-label={t("Keyframe 3D transform")}
          aria-pressed={keyframed}
          className={`absolute left-1.5 top-1.5 rounded p-0.5 hover:bg-neutral-800 ${
            keyframed ? "text-accent-ink" : "text-neutral-500 hover:text-neutral-200"
          }`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill={keyframed ? "currentColor" : "none"}
            stroke="currentColor"
          >
            <path d="M6 1.5L10.5 6 6 10.5 1.5 6z" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

import { useI18n } from "../../i18n/I18n";
import { useState } from "react";
import type { DomEditSelection } from "./domEditingTypes";
import { MetricField } from "./propertyPanelPrimitives";
import { KeyframeNavigation } from "./KeyframeNavigation";
import { formatPxMetricValue, parsePxMetricValue, RESPONSIVE_GRID } from "./propertyPanelHelpers";
import { Transform3DCube, type CubePose } from "./Transform3DCube";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";

// translateZ only foreshortens under a perspective lens. Rather than hardcode one
// (an arbitrary px value reads wrong at different canvas sizes), derive it from the
// element's composition: perspective = composition height puts the virtual camera
// one comp-height back, a natural ~53° vertical FOV that looks the same whether the
// canvas is 720p or 4K. Falls back to the element's own height only if the comp size
// can't be read (detached/unmeasured), never to a fixed magic number.
function naturalDepthPerspective(el: HTMLElement | null | undefined): number {
  if (!el) return 0;
  const root = el.closest("[data-hf-inner-root],[data-composition-id]") as HTMLElement | null;
  const compHeight = root?.offsetHeight || el.ownerDocument?.documentElement?.clientHeight || 0;
  if (compHeight > 0) return Math.round(compHeight);
  return Math.round((el.offsetHeight || 0) * 4) || 0;
}

type KeyframeEntry = Array<{
  percentage: number;
  properties: Record<string, number | string>;
  ease?: string;
}> | null;

interface PropertyPanel3dTransformProps {
  gsapRuntimeValues: Record<string, number>;
  gsapAnimId: string | null;
  resolveAnimIdForProp?: (prop: string) => string | null;
  gsapKeyframes: KeyframeEntry;
  currentPct: number;
  elStart: number;
  elDuration: number;
  element: DomEditSelection;
  onCommitAnimatedProperty?: (
    element: DomEditSelection,
    property: string,
    value: number,
  ) => Promise<void>;
  /** Batched commit — several props into one keyframe (the cube's rotationX/Y/Z). */
  onCommitAnimatedProperties?: (
    element: DomEditSelection,
    props: Record<string, number | string>,
  ) => Promise<void>;
  onSeekToTime?: (time: number) => void;
  onRemoveKeyframe?: (animId: string, pct: number) => void;
  onConvertToKeyframes?: (animId: string, duration?: number) => void;
  /** Live-set props on the preview element during a cube drag (no source write). */
  onLivePreviewProps?: (element: DomEditSelection, props: Record<string, number>) => void;
}

/** The draggable cube + its commit/recenter/live-preview wiring. */
function Cube3dControl({
  element,
  gsapRuntimeValues,
  onCommitAnimatedProperties,
  onLivePreviewProps,
  onKeyframe,
  keyframed,
}: {
  element: DomEditSelection;
  gsapRuntimeValues: Record<string, number>;
  onCommitAnimatedProperties: (
    element: DomEditSelection,
    props: Record<string, number | string>,
  ) => Promise<void>;
  onLivePreviewProps?: (element: DomEditSelection, props: Record<string, number>) => void;
  onKeyframe?: () => void;
  keyframed?: boolean;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const pose: CubePose = {
    rotationX: gsapRuntimeValues.rotationX ?? 0,
    rotationY: gsapRuntimeValues.rotationY ?? 0,
    rotationZ: gsapRuntimeValues.rotationZ ?? 0,
  };
  // Comp-derived lens (see naturalDepthPerspective) applied the first time depth is
  // set, so the scene's foreshortening scales with the canvas instead of a magic 800.
  const depthPerspective = naturalDepthPerspective(element.element);
  // A gentle, fixed "depth pose" tilt (degrees) dropped on a flat element the first
  // time it gets depth, so translateZ reads as 3D foreshortening instead of a plain
  // resize — small enough to look like a premium card, not a flip.
  const DEPTH_POSE_X = 10;
  const DEPTH_POSE_Y = -15;
  const isFlat = Math.round(pose.rotationX) === 0 && Math.round(pose.rotationY) === 0;
  // Commit only the rotation axes the drag actually changed (each rounded to a
  // whole degree). Reuses the keyframe-aware animated-property commit, so a drag
  // at the playhead writes/updates a keyframe just like the numeric fields.
  const commitPose = (next: CubePose) => {
    const changedProps: Record<string, number> = {};
    for (const axis of ["rotationX", "rotationY", "rotationZ"] as const) {
      const rounded = Math.round(next[axis]);
      if (rounded !== Math.round(pose[axis])) changedProps[axis] = rounded;
    }
    const axes = Object.keys(changedProps);
    if (axes.length === 0) return;
    track("slider", "3D rotation pose");
    // ONE keyframe for the whole pose change — avoids per-axis commits racing into
    // adjacent duplicate keyframes.
    void onCommitAnimatedProperties(element, changedProps);
  };
  const recenter = () => {
    // ONE commit for the whole reset — six per-axis commits meant six soft-reloads
    // (six flashes) for a single click. Batch like commitPose does.
    const identity = {
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      z: 0,
      scale: 1,
      transformPerspective: 0,
    };
    track("button", "Reset 3D transform");
    void onCommitAnimatedProperties(element, identity);
  };
  // Immediate element feedback while dragging — set the live transform without a
  // source write; the release commits via commitPose.
  const livePreview = (next: CubePose) =>
    onLivePreviewProps?.(element, {
      rotationX: next.rotationX,
      rotationY: next.rotationY,
      rotationZ: next.rotationZ,
    });

  return (
    <div className="mb-2 px-2">
      <div className="mx-auto max-w-[184px]">
        <Transform3DCube
          pose={pose}
          perspective={gsapRuntimeValues.transformPerspective ?? 0}
          defaultPerspective={depthPerspective}
          z={gsapRuntimeValues.z ?? 0}
          onPoseDraft={livePreview}
          onPoseCommit={commitPose}
          onDepthDraft={(z) => {
            // Preview WITH a lens so depth is visible while scrolling — the same
            // default the commit applies, so the element doesn't snap on release.
            const preview: Record<string, number> = gsapRuntimeValues.transformPerspective
              ? { z }
              : { z, transformPerspective: depthPerspective };
            // Depth-pose preview: a flat element only scales under Z, so mirror the
            // commit and preview the gentle tilt that makes the depth read as 3D.
            if (isFlat) {
              preview.rotationX = DEPTH_POSE_X;
              preview.rotationY = DEPTH_POSE_Y;
            }
            onLivePreviewProps?.(element, preview);
          }}
          onDepthCommit={(z) => {
            // Best-UX depth: scroll moves Z, and a 3D transform always has a lens —
            // like an After Effects camera. translateZ is invisible without a
            // perspective, so the FIRST time depth is added (Perspective still 0) we
            // set a sensible comp-derived lens ONCE. Every later scroll touches Z
            // only, and Perspective stays an independent, editable field. The cube's
            // scroll is clamped in front of the lens, so Z can't run away past it.
            const props: Record<string, number> = { z };
            if (!gsapRuntimeValues.transformPerspective && depthPerspective > 0) {
              props.transformPerspective = depthPerspective;
            }
            // Depth-pose: a flat element (no tilt) only scales under Z — it can't read
            // as depth. So the first time depth lands on a flat element, also drop a
            // gentle fixed tilt; the foreshortening makes depth read as 3D IN PLACE
            // (no screen travel, per-element lens unchanged). Once the element has any
            // tilt, depth scrolls touch Z only. Reset tilt to 0 to go flat again.
            if (isFlat) {
              props.rotationX = DEPTH_POSE_X;
              props.rotationY = DEPTH_POSE_Y;
            }
            // One commit for all props so the writes can't race read-modify-write on
            // the same script (which dropped a prop and reverted after a seek).
            track("slider", "3D depth");
            void onCommitAnimatedProperties(element, props);
          }}
          onRecenter={recenter}
          onKeyframe={onKeyframe}
          keyframed={keyframed}
        />
        <p className="mt-1 text-center text-[9px] leading-snug text-neutral-600">
          {t("Drag to tilt · Shift-drag to roll · Scroll for depth")}</p>
      </div>
    </div>
  );
}

interface FieldCtx {
  element: DomEditSelection;
  gsapRuntimeValues: Record<string, number>;
  gsapKeyframes: KeyframeEntry;
  gsapAnimId: string | null;
  currentPct: number;
  elStart: number;
  elDuration: number;
  resolveAnimIdForProp?: (prop: string) => string | null;
  onCommitAnimatedProperty?: (
    element: DomEditSelection,
    property: string,
    value: number,
  ) => Promise<void>;
  onSeekToTime?: (time: number) => void;
  onRemoveKeyframe?: (animId: string, pct: number) => void;
  onConvertToKeyframes?: (animId: string, duration?: number) => void;
}

const parseDeg = (s: string): number | null => {
  const n = Number.parseFloat(s.replace("°", ""));
  return Number.isFinite(n) ? n : null;
};
const parseScale = (s: string): number | null => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
};
const parsePxNonNeg = (s: string): number | null => {
  const v = parsePxMetricValue(s);
  return v != null && v >= 0 ? v : null;
};

/**
 * One 3D-transform field: a number/scrub input plus its keyframe diamond, so
 * rotation / perspective / Z / scale can each be keyframed just like Layout's
 * X / Y — the diamond was previously missing on the rotation + perspective rows.
 */
function Transform3dField({
  label,
  prop,
  scrub,
  format,
  parse,
  defaultValue,
  ctx,
}: {
  label: string;
  prop: string;
  scrub?: boolean;
  format: (v: number) => string;
  parse: (s: string) => number | null;
  defaultValue: number;
  ctx: FieldCtx;
}) {
  const { gsapAnimId, onCommitAnimatedProperty } = ctx;
  const idFor = (p: string) => ctx.resolveAnimIdForProp?.(p) ?? gsapAnimId;
  const current = ctx.gsapRuntimeValues[prop] ?? defaultValue;
  return (
    <div className="flex items-center gap-1">
      <div className="flex-1">
        <MetricField
          label={label}
          value={format(current)}
          scrub={scrub}
          onCommit={(next) => {
            const v = parse(next);
            if (v != null && onCommitAnimatedProperty) {
              return onCommitAnimatedProperty(ctx.element, prop, v);
            }
          }}
        />
      </div>
      {(gsapAnimId || onCommitAnimatedProperty) && (
        <KeyframeNavigation
          property={prop}
          keyframes={ctx.gsapKeyframes}
          currentPercentage={ctx.currentPct}
          onSeek={(pct) => ctx.onSeekToTime?.(ctx.elStart + (pct / 100) * ctx.elDuration)}
          onAddKeyframe={() => {
            if (onCommitAnimatedProperty) void onCommitAnimatedProperty(ctx.element, prop, current);
          }}
          onRemoveKeyframe={(pct) => {
            const id = idFor(prop);
            if (id) ctx.onRemoveKeyframe?.(id, pct);
          }}
          onConvertToKeyframes={() => {
            const id = idFor(prop);
            // Pass the element's clip duration so a converted static 3D `set`
            // spans the whole clip (keyframes land in range at any playhead).
            if (id) ctx.onConvertToKeyframes?.(id, ctx.elDuration);
          }}
        />
      )}
    </div>
  );
}

export function PropertyPanel3dTransform({
  gsapRuntimeValues,
  gsapAnimId,
  resolveAnimIdForProp,
  gsapKeyframes,
  currentPct,
  elStart,
  elDuration,
  element,
  onCommitAnimatedProperty,
  onCommitAnimatedProperties,
  onSeekToTime,
  onRemoveKeyframe,
  onConvertToKeyframes,
  onLivePreviewProps,
}: PropertyPanel3dTransformProps) {
  const { t } = useI18n();
  // Expanded by default — the cube gizmo is the headline of this panel, so show
  // it up front rather than hiding it behind a collapsed header.
  const [collapsed, setCollapsed] = useState(false);
  const ctx: FieldCtx = {
    element,
    gsapRuntimeValues,
    gsapKeyframes,
    gsapAnimId,
    currentPct,
    elStart,
    elDuration,
    resolveAnimIdForProp,
    onCommitAnimatedProperty,
    onSeekToTime,
    onRemoveKeyframe,
    onConvertToKeyframes,
  };

  return (
    <div className="mt-3 border-t border-neutral-800/40 pt-3">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className="mb-2 flex w-full items-center justify-between text-[10px] font-medium uppercase tracking-wider text-neutral-600 hover:text-neutral-400 active:scale-[0.99]"
      >
        <span>{t("3D Transform")}</span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 10 10"
          fill="currentColor"
          aria-hidden
          className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`}
        >
          <path d="M2 3l3 4 3-4z" />
        </svg>
      </button>
      {collapsed ? null : (
        <>
          {onCommitAnimatedProperties && (
            <Cube3dControl
              element={element}
              gsapRuntimeValues={gsapRuntimeValues}
              onCommitAnimatedProperties={onCommitAnimatedProperties}
              onLivePreviewProps={onLivePreviewProps}
              keyframed={(gsapKeyframes ?? []).some(
                (kf) =>
                  "rotationX" in kf.properties ||
                  "rotationY" in kf.properties ||
                  "rotationZ" in kf.properties,
              )}
              onKeyframe={() => {
                // Convert the 3D ("other"-group) static set to keyframes so the
                // cube can animate; spans the element's clip via elDuration.
                const id = resolveAnimIdForProp?.("rotationX") ?? gsapAnimId;
                if (id) onConvertToKeyframes?.(id, elDuration);
              }}
            />
          )}
          <div className={RESPONSIVE_GRID}>
            <Transform3dField
              ctx={ctx}
              label="Z"
              prop="z"
              scrub
              format={formatPxMetricValue}
              parse={parsePxMetricValue}
              defaultValue={0}
            />
            <Transform3dField
              ctx={ctx}
              label={t("Scale")}
              prop="scale"
              scrub
              format={(v) => String(v)}
              parse={parseScale}
              defaultValue={1}
            />
            <Transform3dField
              ctx={ctx}
              label="RotX"
              prop="rotationX"
              format={(v) => `${v}°`}
              parse={parseDeg}
              defaultValue={0}
            />
            <Transform3dField
              ctx={ctx}
              label="RotY"
              prop="rotationY"
              format={(v) => `${v}°`}
              parse={parseDeg}
              defaultValue={0}
            />
            <Transform3dField
              ctx={ctx}
              label="RotZ"
              prop="rotationZ"
              format={(v) => `${v}°`}
              parse={parseDeg}
              defaultValue={0}
            />
            <Transform3dField
              ctx={ctx}
              label={t("Perspective")}
              prop="transformPerspective"
              scrub
              format={formatPxMetricValue}
              parse={parsePxNonNeg}
              defaultValue={0}
            />
          </div>
        </>
      )}
    </div>
  );
}

import { buildArcPath, type ArcPathConfig } from "@hyperframes/core/gsap-parser-acorn";
import { MOTION_PATH_RUN_EASE } from "../utils/gsapKeyframeEases";
import type { ReadTween } from "./gsapRuntimeKeyframes";

function isXY(p: unknown): p is { x: number; y: number } {
  return !!p && typeof (p as any).x === "number" && typeof (p as any).y === "number";
}

/** Coordinates + curviness from a live `vars.motionPath` value (object or array form), or null. */
function coordsFromMotionPath(mp: unknown): {
  coords: Array<{ x: number; y: number }>;
  curviness: number;
  autoRotate: boolean | number;
  isCubic: boolean;
} | null {
  if (!mp || typeof mp !== "object") return null;
  const obj = mp as Record<string, unknown>;
  const pathVal = Array.isArray(mp) ? mp : obj.path;
  if (!Array.isArray(pathVal)) return null;
  const coords = pathVal.filter(isXY).map((p) => ({ x: p.x, y: p.y }));
  if (coords.length < 2) return null;
  const curviness = typeof obj.curviness === "number" ? obj.curviness : 1;
  const autoRotate = typeof obj.autoRotate === "number" ? obj.autoRotate : obj.autoRotate === true;
  return { coords, curviness, autoRotate, isCubic: obj.type === "cubic" };
}

/** Build an arcPath config from a live `vars.motionPath` value. */
export function arcPathFromMotionPathValue(mp: unknown): ArcPathConfig | undefined {
  const parsed = coordsFromMotionPath(mp);
  if (!parsed) return undefined;
  return buildArcPath(parsed.coords, parsed.curviness, parsed.autoRotate, parsed.isCubic)?.arcPath;
}

export function readMotionPathTween(
  vars: Record<string, unknown>,
  runEase?: string,
): ReadTween | null {
  const mp = coordsFromMotionPath(vars.motionPath);
  const shape = mp && buildArcPath(mp.coords, mp.curviness, mp.autoRotate, mp.isCubic);
  if (!shape) return null;
  const n = shape.waypoints.length;
  const keyframes = shape.waypoints.map((wp, i) => ({
    percentage: n > 1 ? Math.round((i / (n - 1)) * 100) : 0,
    properties: { x: wp.x, y: wp.y },
  }));
  return { keyframes, arcPath: shape.arcPath, runEase: runEase ?? MOTION_PATH_RUN_EASE };
}

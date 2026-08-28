/**
 * The aimed shot — sugar over `shot.ts`.
 *
 * "Show me THAT part from THERE" is the question an agent asks most, and it
 * reads better as `{ at, from }` than as its expansion (`{ gaze: { at },
 * station: { orbit: { azimuthDeg } } }`). It is also the shape the HTTP route,
 * the `--look` CLI form and the report all speak.
 *
 * It is a spelling, not an implementation: `lookToShot` desugars, `resolveShot`
 * derives every quantity, and the whole translation runs one direction. That is
 * what keeps the aimed case and the turn-in-place case on one arithmetic path
 * instead of two that can drift.
 */
import type { Census } from "../types.js";
import {
  DEFAULT_FOV_DEG,
  DEFAULT_MARGIN,
  DIRECTION_AZIMUTH,
  ELEVATION_WORD,
  meshBoxes,
  nudgePose,
  poseLabel,
  resolveShot,
  ShotResolveError,
  type ResolvedPose,
  type ShotSpec,
} from "./shot.js";
import type { Vec3 } from "./views.js";

/** The framing margin a look leaves around its subject. */
export const DEFAULT_LOOK_MARGIN = DEFAULT_MARGIN;
/** The horizontal field of view a look uses when none is given. */
export const DEFAULT_LOOK_FOV_DEG = DEFAULT_FOV_DEG;

/**
 * The failure a look resolution raises — one class shared with `shot.ts`
 * rather than a wrapper, since a rejection translated between layers is a
 * rejection that can be mistranslated.
 */
export { ShotResolveError as LookResolveError };

export interface LookSpec {
  /**
   * The part to aim at, by census object name. Absent aims at the whole
   * scene's bounds — the same subject the turntable photographs.
   */
  at?: string;
  /**
   * Where the camera stands. Either a compass word (`"front"`, `"front-left"`),
   * an explicit angle pair, or `{ part }` to stand AT another part — the
   * "from the entrance", "from the patron's seat" shot, which is a viewpoint a
   * scene can express and a coordinate cannot.
   */
  from?: string | { azimuthDeg: number; elevationDeg?: number } | { part: string };
  /** Elevation word (`"eye"`, `"high"`, `"top"`…) when `from` is a compass
   *  word. Ignored for an explicit angle pair or a part viewpoint, both of
   *  which already determine elevation. */
  elevation?: string;
  /** Extra room around the target's bounding sphere. Default
   *  {@link DEFAULT_LOOK_MARGIN}; larger pulls back, smaller crops in. */
  margin?: number;
  /** Horizontal field of view, degrees. Default {@link DEFAULT_LOOK_FOV_DEG}. */
  fovDeg?: number;
  /** Camera height above the standing part's box top, metres. Only meaningful
   *  with a `{ part }` viewpoint; default 0 (stand on top of it). */
  eyeHeight?: number;
  /** An explicit distance in metres, overriding the fitted one. The escape
   *  hatch for a deliberately tight or distant shot. */
  distance?: number;
  /** A label carried through to the rendered frame, so a batch of looks comes
   *  back identifiable. Defaults to a description of the resolved pose. */
  label?: string;
}

/**
 * A resolved aimed shot.
 *
 * A {@link ResolvedPose} whose subject-derived fields are all present — which
 * is exactly what "aimed" means. Stating it as a refinement rather than a
 * separate record is what lets one resolver serve both: a look is a pose that
 * happens to have a target, and every consumer of a pose can read a look.
 */
export type ResolvedLook = ResolvedPose &
  Required<
    Pick<
      ResolvedPose,
      "targetName" | "target" | "distance" | "targetSize" | "targetRadius" | "azimuthDeg" | "elevationDeg" | "name"
    >
  >;

/** Turn a look into the shot it means. The whole of the translation lives
 *  here, in one direction, so there is nothing to keep in step. */
export function lookToShot(spec: LookSpec, available: string[]): ShotSpec {
  const shot: ShotSpec = {
    gaze: spec.at !== undefined ? { at: spec.at } : {},
    lens: spec.fovDeg !== undefined ? { fovDeg: spec.fovDeg } : {},
    ...(spec.label !== undefined ? { label: spec.label } : {}),
  };

  // `from: { part }` is a station standing at that part; `eyeHeight` is the
  // vertical component of its offset. Everything else is an orbit.
  if (spec.from && typeof spec.from === "object" && "part" in spec.from) {
    shot.station = {
      at: spec.from.part,
      ...(spec.eyeHeight !== undefined ? { offset: [0, 0, spec.eyeHeight] as Vec3 } : {}),
    };
    return shot;
  }

  let azimuthDeg: number;
  let elevationDeg: number | undefined;
  if (spec.from === undefined) {
    azimuthDeg = 0;
  } else if (typeof spec.from === "string") {
    const key = spec.from.trim().toLowerCase();
    const found = DIRECTION_AZIMUTH[key];
    if (found === undefined) {
      throw new ShotResolveError(
        `'${spec.from}' is not a direction — use one of ${Object.keys(DIRECTION_AZIMUTH).join(", ")}, an {azimuthDeg} pair, or {part}`,
        available,
      );
    }
    azimuthDeg = found;
  } else {
    azimuthDeg = spec.from.azimuthDeg;
    elevationDeg = spec.from.elevationDeg;
  }

  if (elevationDeg === undefined && spec.elevation !== undefined) {
    const key = spec.elevation.trim().toLowerCase();
    const found = ELEVATION_WORD[key];
    if (found === undefined) {
      throw new ShotResolveError(
        `'${spec.elevation}' is not an elevation — use one of ${Object.keys(ELEVATION_WORD).join(", ")} or an {elevationDeg}`,
        available,
      );
    }
    elevationDeg = found;
  }

  shot.station = {
    orbit: {
      azimuthDeg,
      ...(elevationDeg !== undefined ? { elevationDeg } : {}),
      ...(spec.distance !== undefined ? { distance: spec.distance } : {}),
      ...(spec.margin !== undefined ? { margin: spec.margin } : {}),
    },
  };
  return shot;
}

/**
 * Resolve one aimed shot against a measured census.
 *
 * Four lines over {@link resolveShot}, which is the point: the semantics live
 * in one place; this signature is the ergonomic form of reaching them.
 */
export function resolveLook(spec: LookSpec, census: Census): ResolvedLook {
  const available = [...meshBoxes(census).keys()].sort();
  const pose = resolveShot(lookToShot(spec, available), census);
  // `lookToShot` never produces a heading gaze, so the refinement holds by
  // construction. Asserting it keeps a desugaring change from silently handing
  // callers a pose with no target.
  if (
    pose.targetName === undefined ||
    pose.target === undefined ||
    pose.distance === undefined ||
    pose.azimuthDeg === undefined
  ) {
    throw new ShotResolveError("a look must resolve a subject, and this one did not", available);
  }
  // The sugar reports its own substitutions: `from` is a look-level field with
  // a look-level default, and `resolveShot` only ever sees the explicit azimuth
  // it desugars to. Every default is named by whichever layer applied it.
  if (spec.from === undefined) pose.notes.unshift("from defaulted to front (az 0°)");
  return pose as ResolvedLook;
}

/**
 * Nudge a resolved look. See {@link nudgePose} — this is that function with the
 * look's own verb names, kept because they are the ones the report prints and
 * the CLI documents.
 */
export function nudgeLook(
  pose: ResolvedLook,
  delta: {
    /** Degrees to swing around the subject; positive toward +X. */
    orbitDeg?: number;
    /** Degrees to raise the camera; clamped into ±89.9 (a pole has no basis). */
    riseDeg?: number;
    /** Multiply the distance — <1 moves in, >1 pulls back. */
    dolly?: number;
    /** Replace the field of view. */
    fovDeg?: number;
  },
): ResolvedLook {
  // An aimed pose stays aimed under every one of these verbs, so the
  // refinement survives the nudge.
  return nudgePose(pose, {
    orbitDeg: delta.orbitDeg ?? 0,
    ...(delta.riseDeg !== undefined ? { riseDeg: delta.riseDeg } : {}),
    ...(delta.dolly !== undefined ? { dolly: delta.dolly } : {}),
    ...(delta.fovDeg !== undefined ? { fovDeg: delta.fovDeg } : {}),
  }) as ResolvedLook;
}

/** One resolved look as a compact line. See {@link poseLabel}. */
export const lookLabel = poseLabel;

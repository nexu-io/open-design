/**
 * The viewport camera: a semantic shot request resolved to an exact pose.
 *
 * An agent authoring a scene can measure everything about it and see it from
 * eight fixed orbit positions — but it cannot AIM. "Show me the bar counter
 * from the left" was not a move it could make, so every question about a
 * specific part from a specific side cost a full recompile of the turntable and
 * a guess at which frame might contain the answer. The gap is not knowledge; it
 * is that the only camera the compiler owned was a fixed orbit around the whole
 * scene.
 *
 * This module closes it WITHOUT introducing a coordinate-guessing game. A
 * request names parts and directions — `{ at: "prp_bar_counter", from: "left" }`
 * — and resolution is pure arithmetic over the census the compiler already
 * measured: the target's world box gives the aim point and the framing radius,
 * the direction gives the orbit vector, and the distance falls out of the field
 * of view. The author never types a coordinate, and the compiler never guesses
 * one.
 *
 * Three properties this module holds to:
 *
 *  - **Stateless.** A resolved look carries its FULL absolute pose (target,
 *    azimuth, elevation, distance, fov), and the relative ops below are pure
 *    rewrites of that record — `orbit` takes a resolved pose and returns
 *    another. There is no stored camera and no session: the caller holds the
 *    pose it was handed. A hidden camera that drifts across calls is exactly
 *    the "told where it is standing by accident" failure the fork's rules
 *    exist to prevent.
 *  - **One pose convention.** Azimuth, elevation, compass naming and the eye
 *    vector all come from `views.ts`, which restates the runner's own orbit.
 *    Re-deriving any of it here is how the picture and the prose start
 *    disagreeing about which way is front.
 *  - **Facts, not judgement.** A resolved look reports what it measured and
 *    what it had to substitute (`notes`); it holds no opinion about whether the
 *    shot is a good one.
 */
import type { Census } from "../types.js";
import { compassName, orbitEye, PROOF_ELEVATION_DEG, type Vec3 } from "./views.js";

/**
 * The default framing margin — the fraction of extra room left around the
 * target's bounding sphere. 1.25 is the proof render's own value
 * (`_proof_frames`), repeated so a `look` at the whole scene frames it exactly
 * as the turntable does and the two are comparable.
 */
export const DEFAULT_LOOK_MARGIN = 1.25;

/** The default horizontal field of view, in degrees — Blender's own 50mm-ish
 *  default lens on a 36mm sensor. Stated rather than inherited so a resolved
 *  pose is reproducible from the record alone. */
export const DEFAULT_LOOK_FOV_DEG = 39.6;

/** The eight compass directions a `from` may name, mapped to azimuth degrees.
 *  Names the SUBJECT's side, matching `views.ts`: `front` puts the camera on
 *  −Y, and azimuth increases toward +X. */
const DIRECTION_AZIMUTH: Readonly<Record<string, number>> = {
  front: 0,
  "front-right": 45,
  right: 90,
  "back-right": 135,
  back: 180,
  "back-left": 225,
  left: 270,
  "front-left": 315,
};

/**
 * Elevations a `from` may name, in degrees above the horizon. `eye` is the
 * default because a shot from human standing height is the one a reader can
 * judge scale in; `top` and `bottom` are the orthographic-ish extremes.
 */
const ELEVATION_WORD: Readonly<Record<string, number>> = {
  level: 0,
  eye: PROOF_ELEVATION_DEG,
  high: 55,
  top: 89.9, // not 90: a pole has no defined screen-right, and the basis degenerates
  low: -20,
  bottom: -89.9,
};

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
 * A fully-resolved shot: every quantity the renderer needs and every quantity
 * the caller needs to re-issue or nudge it. Absolute by construction — nothing
 * here refers back to the request.
 */
export interface ResolvedLook {
  label: string;
  /** The census object aimed at, or `"scene"` for the whole bounds. */
  targetName: string;
  /** World-space aim point (the target box's centre). */
  target: Vec3;
  /** World-space camera position. */
  eye: Vec3;
  azimuthDeg: number;
  elevationDeg: number;
  /** Metres from `eye` to `target`. */
  distance: number;
  fovDeg: number;
  /** The compass name for `azimuthDeg` — `~`-prefixed when between octants. */
  name: string;
  /** The target's measured world extent, the framing came from. */
  targetSize: Vec3;
  /** The radius the framing fitted: half the target box's diagonal. */
  targetRadius: number;
  /**
   * What had to be substituted or was worth stating: a defaulted fov, a
   * degenerate (zero-extent) target that has no distance to derive, a
   * viewpoint part that coincides with its aim point. Never silent.
   */
  notes: string[];
}

/** Thrown when a spec names something the census does not contain. Carries the
 *  available names so the caller can correct it in one step rather than
 *  guessing — a rejection that does not say what WAS available just moves the
 *  guessing game. */
export class LookResolveError extends Error {
  constructor(
    readonly reason: string,
    readonly available: string[],
  ) {
    const shown = available.slice(0, 24);
    const more = available.length > shown.length ? `, …${available.length - shown.length} more` : "";
    super(
      available.length > 0
        ? `${reason} — known parts: ${shown.join(", ")}${more}`
        : `${reason} — this census names no meshes`,
    );
    this.name = "LookResolveError";
  }
}

interface Box {
  min: Vec3;
  max: Vec3;
}

/** Every mesh's world box, by object name. Prefers the mesh census's `spatial`
 *  (measured after the world transform) and falls back to the object row. */
function meshBoxes(census: Census): Map<string, Box> {
  const out = new Map<string, Box>();
  const spatial = new Map(census.meshes.map((m) => [m.object, m.spatial]));
  for (const obj of census.objects) {
    if (obj.type !== "MESH") continue;
    const s = spatial.get(obj.name);
    const min = (s?.worldMin ?? obj.worldMin) as Vec3 | null | undefined;
    const max = (s?.worldMax ?? obj.worldMax) as Vec3 | null | undefined;
    if (!min || !max) continue;
    out.set(obj.name, { min: [...min] as Vec3, max: [...max] as Vec3 });
  }
  return out;
}

/** The union of every mesh box — the subject the turntable frames. */
function sceneBox(boxes: Map<string, Box>): Box | null {
  let lo: [number, number, number] | null = null;
  let hi: [number, number, number] | null = null;
  for (const b of boxes.values()) {
    if (!lo || !hi) {
      lo = [b.min[0], b.min[1], b.min[2]];
      hi = [b.max[0], b.max[1], b.max[2]];
      continue;
    }
    for (let a = 0; a < 3; a++) {
      if (b.min[a] < lo[a]!) lo[a] = b.min[a];
      if (b.max[a] > hi[a]!) hi[a] = b.max[a];
    }
  }
  return lo && hi ? { min: lo as Vec3, max: hi as Vec3 } : null;
}

const centreOf = (b: Box): Vec3 => [
  (b.min[0] + b.max[0]) / 2,
  (b.min[1] + b.max[1]) / 2,
  (b.min[2] + b.max[2]) / 2,
];
const sizeOf = (b: Box): Vec3 => [
  b.max[0] - b.min[0],
  b.max[1] - b.min[1],
  b.max[2] - b.min[2],
];

/**
 * Resolve one semantic shot against a measured census.
 *
 * Pure and total: it either returns a fully-determined pose or throws a
 * {@link LookResolveError} naming what it could not find. Given the same census
 * and spec it returns the same numbers on every machine — no clock, no
 * randomness, no float transcendental beyond the trigonometry the pose
 * convention itself is defined in.
 */
export function resolveLook(spec: LookSpec, census: Census): ResolvedLook {
  const boxes = meshBoxes(census);
  const names = [...boxes.keys()].sort();
  const notes: string[] = [];

  // --- the subject: what the camera aims at -------------------------------
  let targetName = "scene";
  let targetBox: Box | null;
  if (spec.at !== undefined) {
    const found = boxes.get(spec.at);
    if (!found) throw new LookResolveError(`no mesh named '${spec.at}' to look at`, names);
    targetName = spec.at;
    targetBox = found;
  } else {
    targetBox = sceneBox(boxes);
    if (!targetBox) throw new LookResolveError("nothing to look at", names);
  }
  const target = centreOf(targetBox);
  const targetSize = sizeOf(targetBox);
  // Half the box diagonal: the radius of the sphere that certainly contains the
  // target, so fitting it fits the part from EVERY direction. A tighter
  // per-direction fit would frame differently from each side, which makes two
  // looks at one part incomparable.
  const targetRadius =
    Math.sqrt(targetSize[0] ** 2 + targetSize[1] ** 2 + targetSize[2] ** 2) / 2;

  // --- the station: where the camera stands ------------------------------
  const fovDeg = spec.fovDeg ?? DEFAULT_LOOK_FOV_DEG;
  if (spec.fovDeg === undefined) notes.push(`fov defaulted to ${DEFAULT_LOOK_FOV_DEG}°`);
  if (!(fovDeg > 0 && fovDeg < 180)) {
    throw new LookResolveError(`fov ${fovDeg}° is not a lens (0 < fov < 180)`, names);
  }

  let azimuthDeg: number;
  let elevationDeg: number;
  let distance: number;
  let eye: Vec3;

  // The three shapes `from` may take, narrowed once here rather than re-tested
  // at each use — the narrowing does not survive across the branch otherwise.
  const viewpointPart =
    spec.from && typeof spec.from === "object" && "part" in spec.from ? spec.from.part : null;
  const fromAngles =
    spec.from && typeof spec.from === "object" && "azimuthDeg" in spec.from ? spec.from : null;

  if (viewpointPart !== null) {
    // Stand AT a part and look at the subject. Azimuth/elevation/distance are
    // all MEASURED from the two boxes — the shot is a fact about the scene's
    // layout, not a number the author supplied.
    const stand = boxes.get(viewpointPart);
    if (!stand) {
      throw new LookResolveError(`no mesh named '${viewpointPart}' to look from`, names);
    }
    const standCentre = centreOf(stand);
    const height = spec.eyeHeight ?? 0;
    eye = [standCentre[0], standCentre[1], stand.max[2] + height];
    const d: Vec3 = [eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]];
    distance = Math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2);
    if (distance < 1e-9) {
      // The viewpoint coincides with the aim point: there is no direction to
      // look along. Say so rather than emitting a NaN pose.
      throw new LookResolveError(
        `'${viewpointPart}' stands exactly at the centre of '${targetName}' — no direction to look along`,
        names,
      );
    }
    // Invert the pose convention: azimuth 0 is −Y and increases toward +X.
    azimuthDeg = (Math.atan2(d[0], -d[1]) * 180) / Math.PI;
    azimuthDeg = ((azimuthDeg % 360) + 360) % 360;
    elevationDeg = (Math.asin(Math.max(-1, Math.min(1, d[2] / distance))) * 180) / Math.PI;
    notes.push(`stood at '${viewpointPart}' (measured pose, ${spec.eyeHeight !== undefined ? `eye ${height}m above its top` : "on its top"})`);
    if (spec.distance !== undefined) {
      notes.push("distance ignored — a part viewpoint already fixes where the camera stands");
    }
  } else {
    // A direction word or an explicit angle pair, framed to fit.
    if (spec.from === undefined) {
      azimuthDeg = 0;
      notes.push("from defaulted to front (az 0°)");
    } else if (typeof spec.from === "string") {
      const key = spec.from.trim().toLowerCase();
      const found = DIRECTION_AZIMUTH[key];
      if (found === undefined) {
        throw new LookResolveError(
          `'${spec.from}' is not a direction — use one of ${Object.keys(DIRECTION_AZIMUTH).join(", ")}, an {azimuthDeg} pair, or {part}`,
          names,
        );
      }
      azimuthDeg = found;
    } else {
      const az = fromAngles!.azimuthDeg;
      if (!Number.isFinite(az)) throw new LookResolveError(`azimuth ${az} is not a number`, names);
      azimuthDeg = ((az % 360) + 360) % 360;
    }

    if (fromAngles && fromAngles.elevationDeg !== undefined) {
      elevationDeg = fromAngles.elevationDeg;
    } else if (spec.elevation !== undefined) {
      const key = spec.elevation.trim().toLowerCase();
      const found = ELEVATION_WORD[key];
      if (found === undefined) {
        throw new LookResolveError(
          `'${spec.elevation}' is not an elevation — use one of ${Object.keys(ELEVATION_WORD).join(", ")} or an {elevationDeg}`,
          names,
        );
      }
      elevationDeg = found;
    } else {
      elevationDeg = PROOF_ELEVATION_DEG;
      notes.push(`elevation defaulted to ${PROOF_ELEVATION_DEG}° (eye)`);
    }
    if (!Number.isFinite(elevationDeg) || Math.abs(elevationDeg) > 90) {
      throw new LookResolveError(`elevation ${elevationDeg}° is outside ±90°`, names);
    }

    const margin = spec.margin ?? DEFAULT_LOOK_MARGIN;
    if (!(margin > 0) || !Number.isFinite(margin)) {
      throw new LookResolveError(`margin ${margin} must be a positive number`, names);
    }
    if (spec.distance !== undefined) {
      if (!(spec.distance > 0) || !Number.isFinite(spec.distance)) {
        throw new LookResolveError(`distance ${spec.distance} must be a positive number`, names);
      }
      distance = spec.distance;
    } else {
      // Fit the bounding sphere in the lens: half-angle t, radius r ⇒ the
      // sphere subtends the frame at r/sin(t); the margin backs off from there.
      const halfFov = (fovDeg * Math.PI) / 360;
      const fitted = (targetRadius / Math.sin(halfFov)) * margin;
      if (fitted > 0) {
        distance = fitted;
      } else {
        // A zero-extent target (a single point, an empty) has no scale to
        // derive a distance from. One metre is a stated substitution, not a
        // measurement — the note says so.
        distance = 1;
        notes.push(`'${targetName}' has zero extent — distance substituted at 1m (nothing to fit)`);
      }
    }
    const dir = orbitEye(azimuthDeg, elevationDeg);
    eye = [
      target[0] + dir[0] * distance,
      target[1] + dir[1] * distance,
      target[2] + dir[2] * distance,
    ];
  }

  const name = compassName(azimuthDeg);
  return {
    label: spec.label ?? `${targetName} from ${name}`,
    targetName,
    target,
    eye,
    azimuthDeg,
    elevationDeg,
    distance,
    fovDeg,
    name,
    targetSize,
    targetRadius,
    notes,
  };
}

/* ------------------------------------------------------------------ */
/* Relative ops — pure rewrites of a resolved pose                     */
/* ------------------------------------------------------------------ */

/**
 * Nudge a resolved pose and get another resolved pose.
 *
 * These are the "move the camera a bit" verbs, and they are deliberately pure
 * functions of the record rather than mutations of a stored camera: the caller
 * always holds a complete, absolute pose, so it can re-issue, diff, or discard
 * one without the compiler remembering anything. Every op re-derives `eye` from
 * the (possibly changed) angles and distance, so the record stays internally
 * consistent — a pose whose `eye` disagrees with its `azimuthDeg` is a lie the
 * next reader inherits.
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
  const notes: string[] = [];
  const azimuthDeg = (((pose.azimuthDeg + (delta.orbitDeg ?? 0)) % 360) + 360) % 360;
  const rawElevation = pose.elevationDeg + (delta.riseDeg ?? 0);
  const elevationDeg = Math.max(-89.9, Math.min(89.9, rawElevation));
  if (elevationDeg !== rawElevation) {
    notes.push(`elevation clamped to ${elevationDeg}° (${rawElevation.toFixed(1)}° is past the pole)`);
  }
  const dolly = delta.dolly ?? 1;
  if (!(dolly > 0) || !Number.isFinite(dolly)) {
    throw new LookResolveError(`dolly ${dolly} must be a positive multiplier`, []);
  }
  const distance = pose.distance * dolly;
  const fovDeg = delta.fovDeg ?? pose.fovDeg;
  if (!(fovDeg > 0 && fovDeg < 180)) {
    throw new LookResolveError(`fov ${fovDeg}° is not a lens (0 < fov < 180)`, []);
  }
  const dir = orbitEye(azimuthDeg, elevationDeg);
  const name = compassName(azimuthDeg);
  return {
    ...pose,
    label: `${pose.targetName} from ${name}`,
    eye: [
      pose.target[0] + dir[0] * distance,
      pose.target[1] + dir[1] * distance,
      pose.target[2] + dir[2] * distance,
    ],
    azimuthDeg,
    elevationDeg,
    distance,
    fovDeg,
    name,
    notes,
  };
}

/** One resolved pose as a compact line — the echo a caller reads to know
 *  exactly where it is standing, and enough to re-issue the shot verbatim. */
export function lookLabel(pose: ResolvedLook): string {
  const m = (n: number): string => `${Math.round(n * 1000) / 1000}`;
  return (
    `${pose.label}: at ${pose.targetName} (${m(pose.target[0])}, ${m(pose.target[1])}, ${m(pose.target[2])}) ` +
    `· ${pose.name} az ${Math.round(pose.azimuthDeg)}° el ${Math.round(pose.elevationDeg)}° ` +
    `· ${m(pose.distance)}m · fov ${Math.round(pose.fovDeg)}°`
  );
}

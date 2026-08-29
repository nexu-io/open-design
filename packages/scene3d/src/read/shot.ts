/**
 * The camera: where it stands, where it points, how much it sees, and how many
 * times it does so.
 *
 * Those four are independent, and keeping them independent is what makes the
 * whole surface small. Welding position to aim looks harmless — a shot aimed AT
 * something derives its position from its target, so one spec appears to
 * determine both — but it fails on the plainest question an agent can ask about
 * a space: stand here and turn around. That shot has no subject at all, nothing
 * to orbit, nothing to frame, no distance to fit. Aiming is the special case;
 * the general one is a station and a gaze that need not know about each other.
 *
 * So a shot is four primitives, and every camera question this compiler can
 * answer is a composition of them:
 *
 *   station  — where the eye is        (orbit a subject / stand at a part / a point)
 *   gaze     — where it points         (a subject / a heading / a point)
 *   lens     — how much it sees        (field of view, projection)
 *   sweep    — the same shot, n times  (advancing time and/or any pose scalar)
 *
 * A panorama is `station.at + gaze.heading + sweep over heading`. Watching a
 * clip play from one eye is `sweep over time`. Stepping two metres right without
 * turning is a changed station offset. None of those is
 * a code path; they are all this resolver called with different arguments. The
 * proof turntable is `orbit + sweep over azimuth with time on` — the factoring
 * reproduces `turntableViews` to the last bit, which is the standard any change
 * here has to keep meeting.
 *
 * The properties this module holds to:
 *
 *  - **One pose convention.** Azimuth, elevation, compass naming and the eye
 *    vector come from `views.ts`, which restates the runner's own orbit.
 *    Re-deriving any of it here is how the picture and the prose start
 *    disagreeing about which way is front.
 *  - **Stateless.** A resolved pose is absolute and complete, and the relative
 *    ops are pure rewrites of that record. There is no stored camera: the
 *    caller holds the pose it was handed.
 *  - **Facts, not judgement.** A pose reports what was measured and what was
 *    substituted (`notes`); it holds no opinion about whether the shot is good.
 *  - **Refusals name what was available.** A spec that cannot resolve says so
 *    with the parts that exist, so the correction is one step.
 *
 * `LookSpec` (`look.ts`) is sugar over this for the aimed shot, which is the
 * one asked for most.
 */
import type { Census } from "../types.js";
import { compassName, orbitEye, PROOF_ELEVATION_DEG, type Vec3 } from "./views.js";

/** The default framing margin — the proof render's own value, so a fitted shot
 *  of the whole scene frames it exactly as the turntable does. */
export const DEFAULT_MARGIN = 1.25;

/** The default horizontal field of view, in degrees. Stated rather than
 *  inherited so a resolved pose is reproducible from the record alone. */
export const DEFAULT_FOV_DEG = 39.6;

/**
 * The eight compass directions, as azimuth degrees. Names the SUBJECT's side,
 * matching `views.ts`: `front` is the view from −Y, and azimuth increases
 * toward +X.
 */
export const DIRECTION_AZIMUTH: Readonly<Record<string, number>> = {
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
 * Elevations a spec may name, in degrees above the horizon. `eye` is the
 * default because a shot from standing height is the one a reader can judge
 * scale in. `top`/`bottom` stop just short of the pole: straight down has no
 * defined screen-right, and the basis degenerates there.
 */
export const ELEVATION_WORD: Readonly<Record<string, number>> = {
  level: 0,
  eye: PROOF_ELEVATION_DEG,
  high: 55,
  top: 89.9,
  low: -20,
  bottom: -89.9,
};

/** Where the eye is. Exactly one form — a station cannot be two places. */
export type StationSpec =
  /**
   * Stand off a subject, on the orbit convention `views.ts` owns. The only
   * station with a free distance, so framing (`margin`, `distance`) lives here
   * and nowhere else. `of` defaults to whatever the gaze looks at, which is why
   * the ordinary aimed shot needs to name its subject exactly once.
   */
  | { orbit: { of?: string; azimuthDeg: number; elevationDeg?: number; distance?: number; margin?: number } }
  /**
   * Stand AT a part: the top-centre of its measured world box, plus a
   * world-metre offset, which is the whole of "nudge off the parent". Derived
   * per request from the census, never a stored relationship — so a part that
   * moves between compiles takes its station with it. Within one compile the
   * census holds one timeline state, so a time sweep moves the scene under a
   * fixed eye rather than riding the part.
   */
  | { at: string; offset?: Vec3 }
  /** The coordinate escape hatch. Present so it is never MISSING; not the path
   *  an agent is meant to take, and nothing in the report suggests it. */
  | { point: Vec3 };

/** Where it points. Exactly one form. */
export type GazeSpec =
  /** A part, by census name; absent aims at the whole scene's bounds. */
  | { at?: string }
  /** Turn in place — a heading, with no subject, no distance and no framing.
   *  The direction the camera LOOKS, in the one azimuth convention. */
  | { heading: string | number; pitchDeg?: number }
  /** The coordinate escape hatch, as for the station. */
  | { toward: Vec3 };

/** How much it sees. `fovDeg` is horizontal, and the projection is
 *  rectilinear — see ARCHITECTURE.md's known gaps for the panoramic lenses. */
export interface LensSpec {
  fovDeg?: number;
}

/**
 * Every scalar of a resolved pose that a sweep may advance, by name. The
 * sweep's vocabulary is exactly this list, so there is nothing to learn twice.
 */
export type PoseScalar =
  | "azimuthDeg"
  | "elevationDeg"
  | "headingDeg"
  | "pitchDeg"
  | "distance"
  | "fovDeg";

const POSE_SCALARS: readonly PoseScalar[] = [
  "azimuthDeg",
  "elevationDeg",
  "headingDeg",
  "pitchDeg",
  "distance",
  "fovDeg",
];

/**
 * The same shot resolved `frames` times.
 *
 * Ranged RE-RESOLUTION, not an interpolation between two endpoint poses: each
 * sample substitutes `t = i/frames` into the ranged scalars and runs the whole
 * resolver again, so a swept distance re-derives the eye and a swept azimuth
 * re-orbits whatever the subject's box measures. An interpolation between two
 * endpoints would slide the camera along the chord between them instead.
 *
 * `frames` is uncapped by design. The cost is one render per frame, exactly
 * what a turntable step costs, and the turntable's own step count is already a
 * raisable input; a magic number here would cap the capability while the
 * identical cost sits uncapped next door.
 */
export interface SweepSpec {
  frames: number;
  /**
   * Sample the scene timeline across the sweep. `true` uses the scene's own
   * range; a pair states one. Sampled with the runner's existing expression —
   * `frame_i = start + round(span · i / frames)` — so a swept shot and a
   * turntable of the same length land on the same instants.
   */
  time?: true | [number, number];
  /** Any pose scalar as a `[start, end]` range, sampled at `t_i = i/frames`. */
  over?: Partial<Record<PoseScalar, [number, number]>>;
}

export interface ShotSpec {
  /** Default: orbit whatever the gaze looks at, fitted from the front. */
  station?: StationSpec;
  /** Default: the whole scene. */
  gaze?: GazeSpec;
  lens?: LensSpec;
  sweep?: SweepSpec;
  label?: string;
}

/**
 * A fully-resolved shot: every quantity the renderer needs and every quantity
 * the caller needs to re-issue or nudge it.
 *
 * Absolute by construction — nothing here refers back to the request. The
 * subject-derived fields are OPTIONAL because a turn-in-place shot genuinely
 * has none: it says so by their absence rather than by a zero that would read
 * as a measurement.
 */
export interface ResolvedPose {
  label: string;
  /** Where the eye is, world space. */
  eye: Vec3;
  /** Unit vector the camera looks along — the only thing the renderer
   *  strictly needs, and the one field that is always defined. */
  forward: Vec3;
  /** The gaze direction in the ONE angular convention `views.ts` owns:
   *  `forward === orbitEye(headingDeg, pitchDeg)`. */
  headingDeg: number;
  pitchDeg: number;
  /** Compass name for what the camera POINTS AT (`~`-prefixed off-octant). */
  facing: string;

  /* --- present only when the gaze was derived FROM a subject --- */
  targetName?: string;
  target?: Vec3;
  distance?: number;
  targetSize?: Vec3;
  targetRadius?: number;
  /** The STATION's side of the subject — `heading ± 180`, `pitch` negated.
   *  This is the "from" an author names, and it is why `name` below is the
   *  compass of the station rather than of the gaze. */
  azimuthDeg?: number;
  elevationDeg?: number;
  /** Compass name for where the camera STANDS relative to its subject. */
  name?: string;

  fovDeg: number;
  /**
   * Metres the frame spans at the aim depth: `2·distance·tan(fov/2)`. The
   * scale bar's number — and the one fact a pixel cannot carry, since an image
   * of a 2mm screw and an image of a 2m door are the same picture.
   */
  frameSpanM?: number;

  /* --- present only on a sweep sample --- */
  sampleIndex?: number;
  /** The timeline frame this sample was taken at, when time was swept. */
  timeFrame?: number;

  /**
   * What the frame actually caught, measured on the rendered pixels.
   *
   * A pose can be perfectly well resolved and still photograph nothing — aim a
   * camera out of a small scene and it sees the void, correctly. Handing an
   * agent a white square with no explanation makes it debug its geometry when
   * the only fact it needed was "you were pointed at empty space". `coverage`
   * is the alpha-mask fraction the subject occupies; both come from the same
   * measurement the orbit frames report, so a look and a proof frame are
   * comparable. Absent when the render did not happen or could not be read.
   */
  coverage?: number;
  meanLuminance?: number;

  /** Every substitution, and everything else worth stating. Never silent. */
  notes: string[];
}

/** Thrown when a spec names something the census does not contain, or asks for
 *  something arithmetic cannot produce. Carries the available names so the
 *  caller can correct it in one step — a rejection that does not say what WAS
 *  available just moves the guessing game. */
export class ShotResolveError extends Error {
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
    this.name = "ShotResolveError";
  }
}

interface Box {
  min: Vec3;
  max: Vec3;
}

/** Every mesh's world box, by object name. Prefers the mesh census's `spatial`
 *  (measured after the world transform) and falls back to the object row. */
export function meshBoxes(census: Census): Map<string, Box> {
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
const sizeOf = (b: Box): Vec3 => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
const wrap360 = (deg: number): number => ((deg % 360) + 360) % 360;
const len = (v: Vec3): number => Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);

/**
 * The heading/pitch a direction vector represents, inverting the one pose
 * convention: `orbitEye(az, el) = (cos·sin az, −cos·cos az, sin el)`.
 */
function anglesOf(dir: Vec3): { headingDeg: number; pitchDeg: number } {
  const d = len(dir);
  if (d < 1e-12) return { headingDeg: 0, pitchDeg: 0 };
  return {
    headingDeg: wrap360((Math.atan2(dir[0], -dir[1]) * 180) / Math.PI),
    pitchDeg: (Math.asin(Math.max(-1, Math.min(1, dir[2] / d))) * 180) / Math.PI,
  };
}

/** A heading word or number as degrees. */
function headingDegrees(heading: string | number, available: string[]): number {
  if (typeof heading === "number") {
    if (!Number.isFinite(heading)) {
      throw new ShotResolveError(`heading ${heading} is not a number`, available);
    }
    return wrap360(heading);
  }
  const key = heading.trim().toLowerCase();
  const found = DIRECTION_AZIMUTH[key];
  if (found === undefined) {
    throw new ShotResolveError(
      `'${heading}' is not a direction — use one of ${Object.keys(DIRECTION_AZIMUTH).join(", ")} or a number of degrees`,
      available,
    );
  }
  return found;
}

/**
 * Resolve one shot against a measured census.
 *
 * Pure and total: it either returns a fully-determined pose or throws a
 * {@link ShotResolveError} naming what it could not find. Given the same census
 * and spec it returns the same numbers on every machine — no clock, no
 * randomness, no transcendental beyond the trigonometry the pose convention is
 * itself defined in.
 */
export function resolveShot(spec: ShotSpec, census: Census): ResolvedPose {
  const boxes = meshBoxes(census);
  const names = [...boxes.keys()].sort();
  const notes: string[] = [];

  const lens = spec.lens ?? {};
  const fovDeg = lens.fovDeg ?? DEFAULT_FOV_DEG;
  if (lens.fovDeg === undefined) notes.push(`fov defaulted to ${DEFAULT_FOV_DEG}°`);
  if (!(fovDeg > 0 && fovDeg < 180)) {
    throw new ShotResolveError(`fov ${fovDeg}° is not a lens (0 < fov < 180)`, names);
  }

  const gaze: GazeSpec = spec.gaze ?? {};
  const turning = "heading" in gaze;
  const towardPoint = "toward" in gaze ? gaze.toward : null;

  /* --- the subject, when there is one --------------------------------- */
  let targetName: string | undefined;
  let target: Vec3 | undefined;
  let targetSize: Vec3 | undefined;
  let targetRadius: number | undefined;
  if (!turning && !towardPoint) {
    const at = (gaze as { at?: string }).at;
    let box: Box | null;
    if (at !== undefined) {
      const found = boxes.get(at);
      if (!found) throw new ShotResolveError(`no mesh named '${at}' to look at`, names);
      targetName = at;
      box = found;
    } else {
      box = sceneBox(boxes);
      if (!box) throw new ShotResolveError("nothing to look at", names);
      targetName = "scene";
    }
    target = centreOf(box);
    targetSize = sizeOf(box);
    // Half the box diagonal: the radius of the sphere that certainly contains
    // the target, so fitting it fits the part from EVERY direction. A tighter
    // per-direction fit would frame differently from each side, which makes two
    // shots of one part incomparable.
    targetRadius = len(targetSize) / 2;
  }

  /* --- the station ----------------------------------------------------- */
  const station: StationSpec = spec.station ?? { orbit: { azimuthDeg: 0 } };
  let eye: Vec3;
  let azimuthDeg: number | undefined;
  let elevationDeg: number | undefined;
  let distance: number | undefined;

  if ("orbit" in station) {
    const o = station.orbit;
    // The subject to stand off. `of` names one explicitly; otherwise the gaze's
    // subject serves, which is why an ordinary aimed shot names its part once.
    let orbitTarget = target;
    let orbitRadius = targetRadius;
    if (o.of !== undefined) {
      const found = boxes.get(o.of);
      if (!found) throw new ShotResolveError(`no mesh named '${o.of}' to orbit`, names);
      orbitTarget = centreOf(found);
      orbitRadius = len(sizeOf(found)) / 2;
    }
    if (!orbitTarget || orbitRadius === undefined) {
      throw new ShotResolveError(
        "an orbit station needs something to stand off — give it `of`, or aim the gaze at a part",
        names,
      );
    }
    if (!Number.isFinite(o.azimuthDeg)) {
      throw new ShotResolveError(`azimuth ${o.azimuthDeg} is not a number`, names);
    }
    azimuthDeg = wrap360(o.azimuthDeg);
    elevationDeg = o.elevationDeg ?? PROOF_ELEVATION_DEG;
    if (o.elevationDeg === undefined) {
      notes.push(`elevation defaulted to ${PROOF_ELEVATION_DEG}° (eye)`);
    }
    if (!Number.isFinite(elevationDeg) || Math.abs(elevationDeg) > 90) {
      throw new ShotResolveError(`elevation ${elevationDeg}° is outside ±90°`, names);
    }
    const margin = o.margin ?? DEFAULT_MARGIN;
    if (!(margin > 0) || !Number.isFinite(margin)) {
      throw new ShotResolveError(`margin ${margin} must be a positive number`, names);
    }
    if (o.distance !== undefined) {
      if (!(o.distance > 0) || !Number.isFinite(o.distance)) {
        throw new ShotResolveError(`distance ${o.distance} must be a positive number`, names);
      }
      distance = o.distance;
    } else {
      // Fit the bounding sphere in the lens: half-angle t, radius r ⇒ the
      // sphere subtends the frame at r/sin(t); the margin backs off from there.
      const fitted = (orbitRadius / Math.sin((fovDeg * Math.PI) / 360)) * margin;
      if (fitted > 0) {
        distance = fitted;
      } else {
        // A zero-extent subject has no scale to derive a distance from. One
        // metre is a stated substitution, not a measurement — the note says so.
        distance = 1;
        notes.push(
          `'${o.of ?? targetName}' has zero extent — distance substituted at 1m (nothing to fit)`,
        );
      }
    }
    const dir = orbitEye(azimuthDeg, elevationDeg);
    eye = [
      orbitTarget[0] + dir[0] * distance,
      orbitTarget[1] + dir[1] * distance,
      orbitTarget[2] + dir[2] * distance,
    ];
  } else if ("at" in station) {
    const stand = boxes.get(station.at);
    if (!stand) throw new ShotResolveError(`no mesh named '${station.at}' to stand at`, names);
    const centre = centreOf(stand);
    const off = station.offset ?? [0, 0, 0];
    if (!off.every((n) => Number.isFinite(n))) {
      throw new ShotResolveError(`station offset ${JSON.stringify(off)} must be three numbers`, names);
    }
    // Top-centre, not centre: standing ON a thing is what "from the stool"
    // means, and a station buried inside its own parent renders its interior.
    eye = [centre[0] + off[0], centre[1] + off[1], stand.max[2] + off[2]];
    // A purely vertical offset is the common case (an eye height), so it reads
    // as one; anything else states all three components. Either way the note
    // names where the station actually is, since "stood at X" alone would not
    // say whether the camera is on the thing or a metre above it.
    const purelyVertical = off[0] === 0 && off[1] === 0 && off[2] !== 0;
    notes.push(
      `stood at '${station.at}' ` +
        (purelyVertical
          ? `(eye ${Math.round(off[2] * 1000) / 1000}m above its top)`
          : station.offset
            ? `(offset ${off.map((n) => Math.round(n * 1000) / 1000).join(", ")}m from its top)`
            : "(on its top)"),
    );
  } else {
    const p = station.point;
    if (!Array.isArray(p) || p.length !== 3 || !p.every((n) => Number.isFinite(n))) {
      throw new ShotResolveError(`station point ${JSON.stringify(p)} must be three numbers`, names);
    }
    eye = [p[0]!, p[1]!, p[2]!];
  }

  /* --- the gaze direction ---------------------------------------------- */
  let forward: Vec3;
  let headingDeg: number;
  let pitchDeg: number;
  if (turning) {
    const g = gaze as { heading: string | number; pitchDeg?: number };
    headingDeg = headingDegrees(g.heading, names);
    pitchDeg = g.pitchDeg ?? 0;
    if (!Number.isFinite(pitchDeg) || Math.abs(pitchDeg) > 90) {
      throw new ShotResolveError(`pitch ${pitchDeg}° is outside ±90°`, names);
    }
    forward = orbitEye(headingDeg, pitchDeg);
  } else {
    const aim = towardPoint ?? target!;
    if (towardPoint) {
      if (!Array.isArray(aim) || aim.length !== 3 || !aim.every((n) => Number.isFinite(n))) {
        throw new ShotResolveError(`gaze toward ${JSON.stringify(aim)} must be three numbers`, names);
      }
      target = [aim[0]!, aim[1]!, aim[2]!];
      targetName = undefined;
    }
    const d: Vec3 = [aim[0] - eye[0], aim[1] - eye[1], aim[2] - eye[2]];
    const dist = len(d);
    if (dist < 1e-9) {
      // The station coincides with what it aims at: there is no direction to
      // look along. Say so rather than emitting a NaN pose that renders black.
      throw new ShotResolveError(
        `the camera stands exactly at ${targetName ? `the centre of '${targetName}'` : "its aim point"} — no direction to look along`,
        names,
      );
    }
    forward = [d[0] / dist, d[1] / dist, d[2] / dist];
    const a = anglesOf(forward);
    headingDeg = a.headingDeg;
    pitchDeg = a.pitchDeg;
    // The STATION side follows from the gaze, always — including for a station
    // that was NOT an orbit. That is what lets a `stand at a part` shot report
    // an honest "from the front-left" without a second derivation.
    if (azimuthDeg === undefined) {
      const s = anglesOf([-forward[0], -forward[1], -forward[2]]);
      azimuthDeg = s.headingDeg;
      elevationDeg = s.pitchDeg;
    }
    // The reported distance is the AIM DEPTH — eye to what the camera looks at —
    // always, even when an orbit branch set a placement distance first. That
    // placement distance frames the ORBITED part; when the gaze aims at a
    // DIFFERENT part, the two differ, and `frameSpanM = 2·distance·tan(fov/2)`
    // must be the span at what is actually in frame, not at the part being
    // circled. The orbit-fit value already did its one job, placing the eye.
    distance = dist;
  }

  const halfFov = (fovDeg * Math.PI) / 360;
  return {
    label:
      spec.label ??
      (targetName
        ? `${targetName} from ${compassName(azimuthDeg ?? 0)}`
        : `facing ${compassName(headingDeg)}`),
    eye,
    forward,
    headingDeg,
    pitchDeg,
    facing: compassName(headingDeg),
    ...(targetName !== undefined ? { targetName } : {}),
    ...(target !== undefined ? { target } : {}),
    ...(distance !== undefined ? { distance } : {}),
    ...(targetSize !== undefined ? { targetSize } : {}),
    ...(targetRadius !== undefined ? { targetRadius } : {}),
    ...(azimuthDeg !== undefined ? { azimuthDeg } : {}),
    ...(elevationDeg !== undefined ? { elevationDeg } : {}),
    ...(azimuthDeg !== undefined ? { name: compassName(azimuthDeg) } : {}),
    fovDeg,
    ...(distance !== undefined ? { frameSpanM: 2 * distance * Math.tan(halfFov) } : {}),
    notes,
  };
}

/**
 * Resolve a shot `frames` times, advancing time and/or any ranged pose scalar.
 *
 * Each sample RE-RESOLVES the whole spec rather than interpolating between two
 * endpoint poses. That is the difference between a camera that rides a moving
 * part and one that slides along the chord between where the part started and
 * where it ended.
 *
 * `t_i = i / frames` (not `i / (frames − 1)`), matching the turntable: the last
 * sample stops one step short of the first, so a full 360° sweep loops without
 * a doubled pose.
 */
export function resolveSweep(spec: ShotSpec, census: Census): ResolvedPose[] {
  const sweep = spec.sweep;
  if (!sweep) return [resolveShot(spec, census)];
  const frames = Math.floor(sweep.frames);
  if (!Number.isFinite(frames) || frames < 1) {
    throw new ShotResolveError(`sweep frames ${sweep.frames} must be a positive integer`, []);
  }
  const over = sweep.over ?? {};
  for (const [key, range] of Object.entries(over)) {
    if (!POSE_SCALARS.includes(key as PoseScalar)) {
      throw new ShotResolveError(
        `'${key}' is not a pose scalar — sweep over one of ${POSE_SCALARS.join(", ")}`,
        [],
      );
    }
    if (!Array.isArray(range) || range.length !== 2 || !range.every((n) => Number.isFinite(n))) {
      throw new ShotResolveError(`sweep over.${key} must be a [start, end] pair of numbers`, []);
    }
  }
  /* The timeline range this sweep samples, when it samples one. `true` means
     "the scene's own range", which is a MEASURED fact on the census rather than
     an assumption — a scene with no animation has start === end, and the sweep
     then correctly holds one instant instead of inventing motion. */
  let timeRange: [number, number] | null = null;
  if (sweep.time !== undefined) {
    if (sweep.time === true) {
      const anim = census.animation;
      const start = anim?.frameStart;
      const end = anim?.frameEnd;
      if (typeof start !== "number" || typeof end !== "number") {
        throw new ShotResolveError(
          "sweep time:true needs the scene's frame range, which this census does not carry — give an explicit [start, end]",
          [],
        );
      }
      timeRange = [start, end];
    } else if (
      Array.isArray(sweep.time) &&
      sweep.time.length === 2 &&
      sweep.time.every((n) => Number.isFinite(n))
    ) {
      timeRange = [sweep.time[0], sweep.time[1]];
    } else {
      throw new ShotResolveError(
        `sweep time must be true or a [start, end] pair of frame numbers`,
        [],
      );
    }
  }

  /* A station standing at a part is measured from the census, which holds ONE
     timeline state. Sweeping time therefore advances the scene under a camera
     that stays where the part is in that state — useful (a fixed eye watching
     motion) but not the same as riding the part, so it is stated rather than
     left for the frames to imply. Riding needs the box measured per frame; see
     ARCHITECTURE.md's known gaps. */
  const fixedStation =
    timeRange !== null && spec.station !== undefined && "at" in spec.station
      ? `station stays at '${spec.station.at}' as the census measured it — sweeping time moves the scene, not this camera`
      : null;

  const out: ResolvedPose[] = [];
  for (let i = 0; i < frames; i++) {
    const t = i / frames;
    const at = (key: PoseScalar): number | undefined => {
      const r = over[key];
      return r ? r[0] + (r[1] - r[0]) * t : undefined;
    };
    const pose = resolveShot(withScalars(spec, at), census);
    if (fixedStation) pose.notes.push(fixedStation);
    out.push({
      ...pose,
      sampleIndex: i,
      // Sampled with the runner's OWN expression, so a swept shot and a
      // turntable of the same length land on the same instants: the proof's
      // `anim_start + round(span * i / steps)`.
      ...(timeRange
        ? { timeFrame: timeRange[0] + Math.round((timeRange[1] - timeRange[0]) * t) }
        : {}),
    });
  }
  return out;
}

/**
 * A spec with its swept scalars substituted.
 *
 * Written as a spec rewrite rather than a post-hoc edit of the resolved record
 * on purpose: substituting into the SPEC means the resolver runs with the
 * sample's own numbers, so a swept distance re-derives the eye, and a swept
 * azimuth re-derives it around whatever the subject's box measures at that
 * sample. Editing the record afterwards would leave `eye` describing the first
 * sample forever.
 */
function withScalars(spec: ShotSpec, at: (key: PoseScalar) => number | undefined): ShotSpec {
  const out: ShotSpec = { ...spec };
  delete out.sweep;

  const az = at("azimuthDeg");
  const el = at("elevationDeg");
  const dist = at("distance");
  if (az !== undefined || el !== undefined || dist !== undefined) {
    const station = spec.station ?? { orbit: { azimuthDeg: 0 } };
    if (!("orbit" in station)) {
      throw new ShotResolveError(
        "sweeping azimuthDeg/elevationDeg/distance needs an orbit station — a station standing at a part or a point has no orbit to advance (sweep headingDeg/pitchDeg to turn in place)",
        [],
      );
    }
    out.station = {
      orbit: {
        ...station.orbit,
        ...(az !== undefined ? { azimuthDeg: az } : {}),
        ...(el !== undefined ? { elevationDeg: el } : {}),
        ...(dist !== undefined ? { distance: dist } : {}),
      },
    };
  }

  const heading = at("headingDeg");
  const pitch = at("pitchDeg");
  if (heading !== undefined || pitch !== undefined) {
    const gaze = spec.gaze ?? {};
    if (!("heading" in gaze)) {
      throw new ShotResolveError(
        "sweeping headingDeg/pitchDeg needs a heading gaze — a gaze aimed at a part is already pointed by that part (sweep azimuthDeg to orbit it instead)",
        [],
      );
    }
    out.gaze = {
      heading: heading ?? gaze.heading,
      ...(pitch !== undefined ? { pitchDeg: pitch } : gaze.pitchDeg !== undefined ? { pitchDeg: gaze.pitchDeg } : {}),
    };
  }

  const fov = at("fovDeg");
  if (fov !== undefined) out.lens = { ...(spec.lens ?? {}), fovDeg: fov };
  return out;
}

/**
 * Nudge a resolved pose and get another resolved pose.
 *
 * These are the "move the camera a bit" verbs, and they are pure functions of
 * the record rather than mutations of a stored camera: the caller always holds
 * a complete absolute pose, so it can re-issue, diff or discard one without the
 * compiler remembering anything.
 *
 * The ops that need a subject REFUSE when there is none, by name. Silently
 * ignoring an orbit on a turn-in-place shot is how an agent concludes the
 * camera is broken; saying "there is nothing to orbit" is how it learns which
 * verb it wanted.
 */
export function nudgePose(
  pose: ResolvedPose,
  delta: {
    /** Turn the gaze — always defined, subject or not. */
    turnDeg?: number;
    tiltDeg?: number;
    /** Swing the station around its subject; needs one. */
    orbitDeg?: number;
    riseDeg?: number;
    /** Multiply the range to the subject; needs one. */
    dolly?: number;
    fovDeg?: number;
    /**
     * Translate the STATION in the pose's own screen basis: step right, step
     * up, step forward, without turning. It lives here rather than in
     * `StationSpec` because a camera-relative offset in the SPEC would depend
     * on the gaze, which may itself depend on the station — after resolution
     * the basis is known, so the cycle cannot form.
     */
    truck?: number;
    pedestal?: number;
    advance?: number;
  },
): ResolvedPose {
  const notes: string[] = [];
  const fovDeg = delta.fovDeg ?? pose.fovDeg;
  if (!(fovDeg > 0 && fovDeg < 180)) {
    throw new ShotResolveError(`fov ${fovDeg}° is not a lens (0 < fov < 180)`, []);
  }
  const clampPitch = (deg: number, what: string): number => {
    const c = Math.max(-89.9, Math.min(89.9, deg));
    if (c !== deg) notes.push(`${what} clamped to ${c}° (${deg.toFixed(1)}° is past the pole)`);
    return c;
  };

  const orbits = delta.orbitDeg !== undefined || delta.riseDeg !== undefined || delta.dolly !== undefined;
  if (orbits && (pose.target === undefined || pose.distance === undefined)) {
    throw new ShotResolveError(
      "orbit/rise/dolly need a subject to move around — this shot turns in place (use turnDeg/tiltDeg, or truck/pedestal/advance to step)",
      [],
    );
  }

  let eye: Vec3 = [...pose.eye] as Vec3;
  let target = pose.target ? ([...pose.target] as Vec3) : undefined;
  let azimuthDeg = pose.azimuthDeg;
  let elevationDeg = pose.elevationDeg;
  let distance = pose.distance;

  if (orbits) {
    const dolly = delta.dolly ?? 1;
    if (!(dolly > 0) || !Number.isFinite(dolly)) {
      throw new ShotResolveError(`dolly ${dolly} must be a positive multiplier`, []);
    }
    azimuthDeg = wrap360((azimuthDeg ?? 0) + (delta.orbitDeg ?? 0));
    elevationDeg = clampPitch((elevationDeg ?? 0) + (delta.riseDeg ?? 0), "elevation");
    distance = distance! * dolly;
    const dir = orbitEye(azimuthDeg, elevationDeg);
    eye = [
      target![0] + dir[0] * distance,
      target![1] + dir[1] * distance,
      target![2] + dir[2] * distance,
    ];
  }

  // Screen-basis translation, applied to whatever the station is now. Stepping
  // aside from a subject-aimed shot keeps aiming at it (the gaze is re-derived
  // below), which is what "step right and keep looking at it" means.
  const translated =
    delta.truck !== undefined || delta.pedestal !== undefined || delta.advance !== undefined;
  if (translated) {
    const f = pose.forward;
    // Screen-right is forward × world-up, degenerating to world +X when the
    // camera looks straight up or down — the same fallback `screenBasis` takes.
    // forward × world-up, simplified: the z terms of the cross product drop
    // out against (0,0,1), leaving (f.y, -f.x, 0).
    let right: Vec3 = [f[1], -f[0], 0];
    const rl = len(right);
    right = rl < 1e-9 ? [1, 0, 0] : [right[0] / rl, right[1] / rl, 0];
    const up: Vec3 = [
      right[1] * f[2] - right[2] * f[1],
      right[2] * f[0] - right[0] * f[2],
      right[0] * f[1] - right[1] * f[0],
    ];
    const t = delta.truck ?? 0;
    const p = delta.pedestal ?? 0;
    const a = delta.advance ?? 0;
    if (![t, p, a].every((n) => Number.isFinite(n))) {
      throw new ShotResolveError("truck/pedestal/advance must be finite metres", []);
    }
    eye = [
      eye[0] + right[0] * t + up[0] * p + f[0] * a,
      eye[1] + right[1] * t + up[1] * p + f[1] * a,
      eye[2] + right[2] * t + up[2] * p + f[2] * a,
    ];
  }

  /* --- re-derive the gaze from the (possibly moved) station ------------- */
  let forward: Vec3;
  let headingDeg: number;
  let pitchDeg: number;
  if (target) {
    const d: Vec3 = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
    const dist = len(d);
    if (dist < 1e-9) {
      throw new ShotResolveError("that move puts the camera on its own subject — no direction to look along", []);
    }
    forward = [d[0] / dist, d[1] / dist, d[2] / dist];
    const ang = anglesOf(forward);
    headingDeg = ang.headingDeg;
    pitchDeg = ang.pitchDeg;
    distance = dist;
    // Re-derive the station angles ONLY when the station actually moved off
    // its orbit. On a pure orbit/rise/dolly the angles computed above are the
    // authority: round-tripping them through the direction vector and back
    // returns 89.8999999999998 for a clamp set to precisely 89.9, so a derived
    // value would overwrite the exact one it came from.
    if (translated || azimuthDeg === undefined) {
      const s = anglesOf([-forward[0], -forward[1], -forward[2]]);
      azimuthDeg = s.headingDeg;
      elevationDeg = s.pitchDeg;
    }
    // A turn would fight the aim, so it is refused rather than dropped.
    if (delta.turnDeg !== undefined || delta.tiltDeg !== undefined) {
      throw new ShotResolveError(
        "turn/tilt would fight this shot's aim — it points at a subject, so use orbitDeg/riseDeg to move around it",
        [],
      );
    }
  } else {
    headingDeg = wrap360(pose.headingDeg + (delta.turnDeg ?? 0));
    pitchDeg = clampPitch(pose.pitchDeg + (delta.tiltDeg ?? 0), "pitch");
    forward = orbitEye(headingDeg, pitchDeg);
  }

  const halfFov = (fovDeg * Math.PI) / 360;
  return {
    ...pose,
    label: target && azimuthDeg !== undefined
      ? `${pose.targetName ?? "subject"} from ${compassName(azimuthDeg)}`
      : `facing ${compassName(headingDeg)}`,
    eye,
    forward,
    headingDeg,
    pitchDeg,
    facing: compassName(headingDeg),
    ...(target !== undefined ? { target } : {}),
    ...(distance !== undefined ? { distance } : {}),
    ...(azimuthDeg !== undefined ? { azimuthDeg, name: compassName(azimuthDeg) } : {}),
    ...(elevationDeg !== undefined ? { elevationDeg } : {}),
    fovDeg,
    ...(distance !== undefined ? { frameSpanM: 2 * distance * Math.tan(halfFov) } : {}),
    notes,
  };
}

/** One resolved pose as a compact line — the echo a caller reads to know
 *  exactly where it is standing, and enough to re-issue the shot verbatim. */
export function poseLabel(pose: ResolvedPose): string {
  const m = (n: number): string => `${Math.round(n * 1000) / 1000}`;
  const head = `${pose.label}: `;
  if (pose.targetName && pose.target && pose.distance !== undefined) {
    return (
      `${head}at ${pose.targetName} (${pose.target.map(m).join(", ")}) ` +
      `· ${pose.name} az ${Math.round(pose.azimuthDeg ?? 0)}° el ${Math.round(pose.elevationDeg ?? 0)}° ` +
      `· ${m(pose.distance)}m · fov ${Math.round(pose.fovDeg)}°`
    );
  }
  return (
    `${head}from (${pose.eye.map(m).join(", ")}) ` +
    `· facing ${pose.facing} ${Math.round(pose.headingDeg)}° pitch ${Math.round(pose.pitchDeg)}° ` +
    `· fov ${Math.round(pose.fovDeg)}°`
  );
}

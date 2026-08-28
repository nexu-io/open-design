/**
 * Where each proof frame was photographed from.
 *
 * This is the fact the compiler always knew and never said. The runner orbits
 * the camera on a fixed, documented path — and then wrote eight PNGs whose
 * only distinguishing mark was a serial number. An agent handed
 * `proof-<hash>-003.png` had no way to learn it was looking at the back-right
 * of its own model, so "check the back" was not a move it could make; every
 * report of a defect on one side was a report about an unidentified side.
 *
 * The geometry below is a restatement of `orbit_offset` and `aim_camera` in
 * `scripts/blender/runner.py`, and it must stay one. Anything derived from a
 * camera pose — the compass name in the report, the labels and the axis
 * gnomon on the contact sheet, the `views` array in the manifest — comes from
 * here, so the picture and the prose cannot disagree about which way is front.
 */

/** Blender is Z-up. Every vector in this module is world space, metres. */
export type Vec3 = readonly [number, number, number];

/**
 * The orbit's elevation, in degrees above the horizon.
 *
 * `_proof_frames` hardcodes `elevation = math.radians(30.0)`. It is repeated
 * here rather than threaded through the runner's output because the runner
 * does not report it, and a wrong-but-plausible default would silently skew
 * every projected axis on the sheet. If the runner ever learns to vary it,
 * it must report it and this constant must go.
 */
export const PROOF_ELEVATION_DEG = 30;

export interface ProofView {
  /** Frame index, matching the `-NNN` suffix on the frame's filename. */
  index: number;
  /** Degrees around +Z from the front. Frame i of n is `i * 360 / n`. */
  azimuthDeg: number;
  /** Degrees above the horizon. */
  elevationDeg: number;
  /**
   * The compass name — `front`, `back-right`, and so on.
   *
   * Named against the SUBJECT, not the camera: `front` is the view a reader
   * gets when standing in front of the model, which is the camera sitting on
   * −Y. This is the same sense Blender's own numpad views use, so "frame 0 is
   * the front view" means the thing an author expects it to mean.
   */
  name: string;
  /** Where the camera stands, as a unit vector from the subject's centre. */
  eye: Vec3;
}

/**
 * The eight compass points, indexed by 45° octant.
 *
 * Azimuth 0 puts the camera on −Y — Blender's front view, its Numpad-1 — and
 * azimuth increases toward +X. So the sweep is front → right → back → left,
 * which is a clockwise orbit seen from above.
 */
const COMPASS = [
  "front",
  "front-right",
  "right",
  "back-right",
  "back",
  "back-left",
  "left",
  "front-left",
] as const;

/**
 * The compass name for an azimuth.
 *
 * Snapped to the nearest octant, and marked with `~` when it is not actually
 * on one. A 6-step turntable lands on 60° — genuinely between `front-right`
 * and `right` — and printing a bare `front-right` there would state a
 * precision the frame does not have. The number beside it is always exact.
 */
export function compassName(azimuthDeg: number): string {
  const wrapped = ((azimuthDeg % 360) + 360) % 360;
  const octant = wrapped / 45;
  const nearest = Math.round(octant) % 8;
  const exact = Math.abs(octant - Math.round(octant)) < 1e-6;
  return exact ? COMPASS[nearest]! : `~${COMPASS[nearest]!}`;
}

/** The unit vector from the subject to the camera, for one orbit position. */
export function orbitEye(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(az), -Math.cos(el) * Math.cos(az), Math.sin(el)];
}

/**
 * The camera poses a turntable of `steps` frames photographs from.
 *
 * `i / steps` (not `i / (steps - 1)`) because the runner steps that way: the
 * last frame stops one step short of the first so looped playback does not
 * repeat a pose.
 */
export function turntableViews(steps: number, elevationDeg = PROOF_ELEVATION_DEG): ProofView[] {
  const n = Math.max(1, Math.floor(steps));
  return Array.from({ length: n }, (_, index) => {
    const azimuthDeg = (index * 360) / n;
    return {
      index,
      azimuthDeg,
      elevationDeg,
      name: compassName(azimuthDeg),
      eye: orbitEye(azimuthDeg, elevationDeg),
    };
  });
}

/**
 * The one view a still (no turntable) photographs.
 *
 * A still through the AUTHOR'S camera is not on the orbit at all, and this
 * function must not be used to describe one — see `describeProofViews`, which
 * is what decides whether the poses are knowable.
 */
export function stillView(elevationDeg = PROOF_ELEVATION_DEG): ProofView[] {
  return turntableViews(1, elevationDeg);
}

/**
 * The screen basis for a view: which way world axes run across the picture.
 *
 * A Blender camera looks down its local −Z, and `aim_camera` builds its
 * rotation with `offset.to_track_quat("Z", "Y")` — local +Z along the vector
 * from subject to camera, local +Y as close to world up as it can be. So
 * local +X is screen-right and local +Y is screen-up, and projecting a world
 * direction onto those two is exactly what the gnomon draws.
 *
 * Degenerate straight-down and straight-up views have no defined screen-right
 * (every azimuth is the same picture); the fallback keeps world +X on the
 * right there, which is what a plan view conventionally shows.
 */
export function screenBasis(eye: Vec3): { right: Vec3; up: Vec3 } {
  const n = normalize(eye);
  let right = cross([0, 0, 1], n);
  if (length(right) < 1e-6) right = [1, 0, 0];
  right = normalize(right);
  return { right, up: cross(n, right) };
}

/**
 * A world direction as a screen offset, +x right and +y DOWN.
 *
 * Y is flipped here rather than at each call site: every consumer draws into
 * an image, images count rows downward, and flipping in three places is how
 * a gnomon ends up pointing at the floor.
 */
export function projectDirection(dir: Vec3, eye: Vec3): { x: number; y: number } {
  const basis = screenBasis(eye);
  return { x: dot(dir, basis.right), y: -dot(dir, basis.up) };
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length(v: Vec3): number {
  return Math.sqrt(dot(v, v));
}

function normalize(v: Vec3): Vec3 {
  const len = length(v);
  return len < 1e-12 ? [0, -1, 0] : [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * The poses behind a set of proof frames, or `undefined` when they are not
 * derivable.
 *
 * The honesty gate for this whole module. The orbit is knowable only when the
 * proof actually orbited: a compile that rendered one still through a camera
 * the AUTHOR placed has a pose the compiler never measured, and labelling
 * that frame `front · az 0°` would be a confident lie about the one case
 * where the reader most needs the truth. Absent beats wrong.
 */
export function describeProofViews(input: {
  frameCount: number;
  turntable: boolean;
  /** True when the frames came from a camera the author placed. */
  authoredCamera?: boolean;
  /** The author-placed camera's MEASURED pose (from the census), if the runner
   *  derived one — used to give an authored still an honest compass name. */
  authoredAzimuthDeg?: number;
  authoredElevationDeg?: number;
  /** Elevation the turntable actually orbited at. Defaults to the 30° the
   *  proof uses when a scene authors no camera; an authored
   *  `camera.elevationDeg` steers it, and the SAME value reaches the runner,
   *  so the compass names describe the pose that was rendered. */
  orbitElevationDeg?: number;
}): ProofView[] | undefined {
  if (input.frameCount <= 0) return undefined;
  if (input.authoredCamera) {
    // Absent beats a confident wrong name — UNLESS the runner actually MEASURED
    // the placed camera's pose, in which case that measurement IS the truth, so
    // name it. Only for a single still: an authored multi-frame render is not an
    // orbit whose per-frame poses we can label.
    if (input.frameCount === 1 && input.authoredAzimuthDeg !== undefined) {
      const az = ((input.authoredAzimuthDeg % 360) + 360) % 360;
      const el = input.authoredElevationDeg ?? PROOF_ELEVATION_DEG;
      return [{ index: 0, azimuthDeg: az, elevationDeg: el, name: compassName(az), eye: orbitEye(az, el) }];
    }
    return undefined;
  }
  const orbitEl = input.orbitElevationDeg ?? PROOF_ELEVATION_DEG;
  if (!input.turntable) return input.frameCount === 1 ? stillView(orbitEl) : undefined;
  return turntableViews(input.frameCount, orbitEl);
}

/** One view as a compact label: `[3] back-right · az 135°`. */
export function viewLabel(view: ProofView): string {
  return `[${view.index}] ${view.name} · az ${Math.round(view.azimuthDeg)}°`;
}

// The camera factored into station × gaze × lens × sweep.
//
// `look.test.ts` is the acceptance gate for the refactor: it passes unmodified,
// proving the aimed shot still resolves to the same numbers. THIS file covers
// what the factoring bought — the shots the welded version could not express at
// all (turning in place, riding a moving part) and the property that makes the
// whole thing trustworthy: the primitives compose into machinery that already
// existed, without being told about it.

import { describe, expect, it } from "vitest";
import type { Census } from "../src/types.js";
import {
  nudgePose,
  poseLabel,
  resolveShot,
  resolveSweep,
  ShotResolveError,
  type ShotSpec,
} from "../src/read/shot.js";
import { compassName, orbitEye, turntableViews } from "../src/read/views.js";

type V3 = [number, number, number];

function census(boxes: Array<{ name: string; min: V3; max: V3 }>): Census {
  return {
    objects: boxes.map((b) => ({ name: b.name, type: "MESH", worldMin: b.min, worldMax: b.max })),
    meshes: boxes.map((b) => ({ object: b.name, spatial: { worldMin: b.min, worldMax: b.max } })),
  } as unknown as Census;
}

/** A room: a floor, a counter along one wall, a stool in front of it. */
const room = census([
  { name: "prp_floor", min: [-4, -4, -0.1], max: [4, 4, 0] },
  { name: "prp_counter", min: [-2, 2, 0], max: [2, 3, 1.1] },
  { name: "prp_stool", min: [-0.2, 0.5, 0], max: [0.2, 0.9, 0.75] },
]);

const near = (a: number, b: number, eps = 1e-9): void => expect(Math.abs(a - b)).toBeLessThan(eps);
const len = (v: V3): number => Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);

describe("the factoring: a shot with no subject at all", () => {
  it("turns in place — a station, a heading, and nothing to frame", () => {
    // The shot the welded version could not express: standing somewhere and
    // looking a direction. There is no target, so there is no distance and no
    // framing — and the record says so by ABSENCE rather than by a zero that
    // would read as a measurement.
    const pose = resolveShot(
      { station: { at: "prp_stool", offset: [0, 0, 1.2] }, gaze: { heading: "back" } },
      room,
    );
    expect(pose.eye).toEqual([0, 0.7, 1.95]); // stool top-centre, 1.2m up
    expect(pose.targetName).toBeUndefined();
    expect(pose.target).toBeUndefined();
    expect(pose.distance).toBeUndefined();
    expect(pose.targetRadius).toBeUndefined();
    expect(pose.frameSpanM).toBeUndefined();
    // It still knows exactly where it points.
    expect(pose.headingDeg).toBe(180);
    expect(pose.facing).toBe("back");
    // forward === orbitEye(heading, pitch) — the one pose convention, used for
    // the gaze exactly as it is used for the station.
    const dir = orbitEye(180, 0);
    for (let i = 0; i < 3; i++) near(pose.forward[i]!, dir[i]!);
  });

  it("names a heading by degrees as readily as by word", () => {
    const spec = (h: string | number): ShotSpec => ({
      station: { point: [0, 0, 1.6] },
      gaze: { heading: h },
    });
    expect(resolveShot(spec("right"), room).headingDeg).toBe(90);
    expect(resolveShot(spec(90), room).headingDeg).toBe(90);
    expect(resolveShot(spec(-30), room).headingDeg).toBe(330); // wrapped
    expect(resolveShot(spec(-30), room).facing).toBe("~front-left");
  });

  it("a heading gaze can pitch up and down without a subject", () => {
    const up = resolveShot(
      { station: { point: [0, 0, 1] }, gaze: { heading: "front", pitchDeg: 40 } },
      room,
    );
    expect(up.pitchDeg).toBe(40);
    expect(up.forward[2]).toBeGreaterThan(0); // genuinely looking up
    expect(() =>
      resolveShot({ station: { point: [0, 0, 1] }, gaze: { heading: "front", pitchDeg: 120 } }, room),
    ).toThrow(/outside ±90/);
  });
});

describe("the factoring: station and gaze are genuinely independent", () => {
  it("stands at one part and aims at another — each derived from its own box", () => {
    const pose = resolveShot(
      { station: { at: "prp_stool", offset: [0, 0, 0.5] }, gaze: { at: "prp_counter" } },
      room,
    );
    expect(pose.eye).toEqual([0, 0.7, 1.25]);
    expect(pose.targetName).toBe("prp_counter");
    expect(pose.target).toEqual([0, 2.5, 0.55]);
    // Distance and angles are MEASURED between the two, not supplied.
    const d: V3 = [
      pose.eye[0] - pose.target![0],
      pose.eye[1] - pose.target![1],
      pose.eye[2] - pose.target![2],
    ];
    near(pose.distance!, len(d));
    // The counter is at +Y from the stool, so the camera stands on its front.
    expect(pose.azimuthDeg).toBe(0);
    expect(pose.name).toBe("front");
    // …and it reports BOTH sides of the same fact: where it stands (`name`)
    // and where it points (`facing`), which are opposite by construction.
    expect(pose.facing).toBe("back");
    near(pose.headingDeg, 180);
  });

  it("orbits a DIFFERENT subject than it aims at", () => {
    // Stand off the counter, but aim at the stool: `of` and `at` are separate
    // knobs precisely because the thing you stand relative to and the thing you
    // point at need not be the same thing.
    const pose = resolveShot(
      { station: { orbit: { of: "prp_counter", azimuthDeg: 0, elevationDeg: 0 } }, gaze: { at: "prp_stool" } },
      room,
    );
    expect(pose.targetName).toBe("prp_stool");
    // The eye stands off the COUNTER's centre, on its front.
    expect(pose.eye[0]).toBe(0);
    expect(pose.eye[1]).toBeLessThan(2.5);
    near(pose.eye[2], 0.55); // the counter's centre height, level orbit
  });

  it("the coordinate escape hatches exist but are not the path", () => {
    const pose = resolveShot({ station: { point: [1, 2, 3] }, gaze: { toward: [1, 2, 0] } }, room);
    expect(pose.eye).toEqual([1, 2, 3]);
    expect(pose.forward).toEqual([0, 0, -1]); // straight down
    expect(pose.pitchDeg).toBe(-90);
    expect(pose.targetName).toBeUndefined(); // a raw point is not a named subject
  });
});

describe("the factoring validates itself: the proof turntable falls out of it", () => {
  it("orbit + sweep over azimuth reproduces turntableViews exactly", () => {
    // The strongest evidence the primitives are the right ones: machinery that
    // predates this file by a long way is expressible as a composition, and the
    // numbers agree to the last bit — without either side being told about the
    // other. If the factoring were invented rather than discovered, this would
    // not line up.
    const steps = 8;
    const poses = resolveSweep(
      {
        station: { orbit: { azimuthDeg: 0, elevationDeg: 30 } },
        gaze: { at: "prp_counter" },
        sweep: { frames: steps, over: { azimuthDeg: [0, 360] } },
      },
      room,
    );
    const views = turntableViews(steps);
    expect(poses).toHaveLength(steps);
    for (let i = 0; i < steps; i++) {
      expect(poses[i]!.azimuthDeg).toBe(views[i]!.azimuthDeg);
      expect(poses[i]!.name).toBe(views[i]!.name);
      // The eye direction from the subject is the view's own unit vector.
      const p = poses[i]!;
      const unit = [
        (p.eye[0] - p.target![0]) / p.distance!,
        (p.eye[1] - p.target![1]) / p.distance!,
        (p.eye[2] - p.target![2]) / p.distance!,
      ];
      for (let k = 0; k < 3; k++) near(unit[k]!, views[i]!.eye[k]!, 1e-9);
    }
  });

  it("sweeps stop one step short of a full turn, so a loop has no doubled pose", () => {
    const poses = resolveSweep(
      {
        station: { orbit: { azimuthDeg: 0 } },
        gaze: { at: "prp_counter" },
        sweep: { frames: 4, over: { azimuthDeg: [0, 360] } },
      },
      room,
    );
    expect(poses.map((p) => p.azimuthDeg)).toEqual([0, 90, 180, 270]);
  });
});

describe("panorama: station.at + gaze.heading + sweep over heading", () => {
  it("turns all the way around one spot without ever moving the eye", () => {
    // The composition the user asked for, spelled out. No new code path: it is
    // the same resolver, called with a heading gaze and a swept scalar.
    const poses = resolveSweep(
      {
        station: { at: "prp_stool", offset: [0, 0, 1.2] },
        gaze: { heading: 0 },
        lens: { fovDeg: 60 },
        sweep: { frames: 6, over: { headingDeg: [0, 360] } },
      },
      room,
    );
    expect(poses).toHaveLength(6);
    expect(poses.map((p) => Math.round(p.headingDeg))).toEqual([0, 60, 120, 180, 240, 300]);
    // The station never moves — that is what "in place" means.
    for (const p of poses) {
      expect(p.eye).toEqual([0, 0.7, 1.95]);
      expect(p.fovDeg).toBe(60);
      expect(p.sampleIndex).toBeDefined();
    }
    // Six 60° samples at a 60° lens tile the circle exactly once.
    expect(poses[0]!.facing).toBe("front");
    expect(poses[3]!.facing).toBe("back");
  });

  it("refuses to sweep a heading on a shot that is aimed at a subject", () => {
    // Turning a shot that points at a part would fight its own aim. Refuse by
    // name and say which verb was wanted — silently ignoring it is how an agent
    // concludes the camera is broken.
    expect(() =>
      resolveSweep(
        {
          station: { orbit: { azimuthDeg: 0 } },
          gaze: { at: "prp_counter" },
          sweep: { frames: 4, over: { headingDeg: [0, 360] } },
        },
        room,
      ),
    ).toThrow(/needs a heading gaze.*sweep azimuthDeg/s);
  });

  it("refuses to sweep an orbit scalar on a shot with no orbit", () => {
    expect(() =>
      resolveSweep(
        {
          station: { at: "prp_stool" },
          gaze: { heading: 0 },
          sweep: { frames: 4, over: { azimuthDeg: [0, 360] } },
        },
        room,
      ),
    ).toThrow(/needs an orbit station/);
  });
});

describe("sweep is re-resolution, not interpolation", () => {
  it("a swept distance re-derives the eye at every sample", () => {
    // If sweep interpolated two endpoint poses, a swept distance would slide
    // the eye along the chord between them. Re-resolving means every sample's
    // eye sits at exactly its own radius from the subject.
    const poses = resolveSweep(
      {
        station: { orbit: { azimuthDeg: 90, elevationDeg: 0, distance: 2 } },
        gaze: { at: "prp_stool" },
        sweep: { frames: 4, over: { distance: [2, 10] } },
      },
      room,
    );
    expect(poses.map((p) => p.distance)).toEqual([2, 4, 6, 8]);
    for (const p of poses) {
      const d: V3 = [
        p.eye[0] - p.target![0],
        p.eye[1] - p.target![1],
        p.eye[2] - p.target![2],
      ];
      near(len(d), p.distance!, 1e-9);
    }
  });

  it("a swept fov changes what each sample frames, not just its label", () => {
    const poses = resolveSweep(
      {
        station: { orbit: { azimuthDeg: 0 } },
        gaze: { at: "prp_counter" },
        sweep: { frames: 3, over: { fovDeg: [30, 90] } },
      },
      room,
    );
    expect(poses.map((p) => Math.round(p.fovDeg))).toEqual([30, 50, 70]);
    // A wider lens fits the same subject from closer in — the distance is
    // re-fitted per sample rather than carried from the first.
    expect(poses[0]!.distance!).toBeGreaterThan(poses[2]!.distance!);
  });

  it("rejects a scalar that is not part of a pose, naming the ones that are", () => {
    expect(() =>
      resolveSweep(
        { gaze: { at: "prp_counter" }, sweep: { frames: 2, over: { zoom: [0, 1] } as never } },
        room,
      ),
    ).toThrow(/not a pose scalar.*azimuthDeg/s);
  });

  it("a shot with no sweep resolves to exactly one pose", () => {
    expect(resolveSweep({ gaze: { at: "prp_counter" } }, room)).toHaveLength(1);
  });

  it("is deterministic — the same sweep twice is byte-identical", () => {
    const spec: ShotSpec = {
      station: { orbit: { azimuthDeg: 12 } },
      gaze: { at: "prp_counter" },
      sweep: { frames: 5, over: { azimuthDeg: [12, 372] } },
    };
    expect(JSON.stringify(resolveSweep(spec, room))).toBe(JSON.stringify(resolveSweep(spec, room)));
  });
});

describe("sweep.time: sampling the timeline", () => {
  /** A census that also carries an animation frame range. */
  const animated = (start: number, end: number): Census =>
    ({
      objects: [{ name: "prp_fan", type: "MESH", worldMin: [-1, -1, 0], worldMax: [1, 1, 1] }],
      meshes: [{ object: "prp_fan", spatial: { worldMin: [-1, -1, 0], worldMax: [1, 1, 1] } }],
      animation: { fps: 24, frameStart: start, frameEnd: end, keyframedObjects: ["prp_fan"] },
    }) as unknown as Census;

  it("time:true reads the scene's OWN measured range", () => {
    const poses = resolveSweep(
      { gaze: { at: "prp_fan" }, sweep: { frames: 4, time: true } },
      animated(1, 41),
    );
    // frame_i = start + round(span · i/frames) — the runner's own expression,
    // so a swept shot and a turntable of the same length land on the same
    // instants rather than on two nearly-identical timelines.
    expect(poses.map((p) => p.timeFrame)).toEqual([1, 11, 21, 31]);
  });

  it("an explicit range is honoured, and can be a sub-range of the clip", () => {
    const poses = resolveSweep(
      { gaze: { at: "prp_fan" }, sweep: { frames: 3, time: [10, 16] } },
      animated(1, 100),
    );
    expect(poses.map((p) => p.timeFrame)).toEqual([10, 12, 14]);
  });

  it("a scene with no animation range refuses time:true rather than inventing one", () => {
    // Silently substituting [0,0] would render N identical frames and read as
    // "the animation does not move", which is a claim about the scene the
    // compiler has no measurement for.
    expect(() =>
      resolveSweep({ gaze: { at: "prp_counter" }, sweep: { frames: 4, time: true } }, room),
    ).toThrow(/frame range.*explicit \[start, end\]/s);
  });

  it("time composes with a pose sweep — both advance across the same samples", () => {
    const poses = resolveSweep(
      {
        station: { orbit: { azimuthDeg: 0 } },
        gaze: { at: "prp_fan" },
        sweep: { frames: 4, time: true, over: { azimuthDeg: [0, 360] } },
      },
      animated(0, 40),
    );
    expect(poses.map((p) => p.timeFrame)).toEqual([0, 10, 20, 30]);
    expect(poses.map((p) => p.azimuthDeg)).toEqual([0, 90, 180, 270]);
  });

  it("a sweep without time leaves timeFrame absent, never zero", () => {
    // Zero is a real frame number. A shot that does not sweep time has no
    // opinion about the timeline, and must say so by absence.
    const poses = resolveSweep(
      { gaze: { at: "prp_counter" }, sweep: { frames: 2, over: { fovDeg: [30, 60] } } },
      room,
    );
    expect(poses.every((p) => p.timeFrame === undefined)).toBe(true);
  });

  it("says outright that a station at a part does NOT ride it through a time sweep", () => {
    // The census holds one timeline state, so the station is measured once: the
    // scene plays under a fixed eye. That is a useful shot and a different one
    // from riding the part, and the difference is invisible in the frames —
    // so every sample states it rather than leaving the reader to infer it.
    const poses = resolveSweep(
      { station: { at: "prp_fan", offset: [0, 0, 1] }, gaze: { heading: 0 }, sweep: { frames: 3, time: true } },
      animated(1, 25),
    );
    for (const p of poses) {
      expect(p.notes.join(" ")).toContain("sweeping time moves the scene, not this camera");
      expect(p.eye).toEqual(poses[0]!.eye);
    }
  });

  it("does not add that note when the station has no part to ride", () => {
    const poses = resolveSweep(
      { station: { orbit: { azimuthDeg: 0 } }, gaze: { at: "prp_fan" }, sweep: { frames: 2, time: true } },
      animated(1, 9),
    );
    expect(poses.every((p) => !p.notes.join(" ").includes("not this camera"))).toBe(true);
  });

  it("rejects a malformed time range", () => {
    expect(() =>
      resolveSweep({ gaze: { at: "prp_fan" }, sweep: { frames: 2, time: [1] as never } }, animated(1, 10)),
    ).toThrow(/true or a \[start, end\] pair/);
  });
});

describe("attachment: a station on a part is re-derived, never stored", () => {
  it("the same spec against a moved census puts the camera where the part now is", () => {
    // "Parented to a part" is a per-request DERIVATION, not a stored
    // relationship. The proof is that the identical spec, resolved against a
    // census where the part has moved, produces a station that moved with it —
    // which is exactly what riding an animated part will mean once the runner
    // measures per-frame boxes.
    const spec: ShotSpec = {
      station: { at: "prp_stool", offset: [0, 0, 1.2] },
      gaze: { at: "prp_counter" },
    };
    const before = resolveShot(spec, room);
    const moved = census([
      { name: "prp_floor", min: [-4, -4, -0.1], max: [4, 4, 0] },
      { name: "prp_counter", min: [-2, 2, 0], max: [2, 3, 1.1] },
      // the stool has been pushed 3m along +X and lifted onto a step
      { name: "prp_stool", min: [2.8, 0.5, 0.4], max: [3.2, 0.9, 1.15] },
    ]);
    const after = resolveShot(spec, moved);
    expect(before.eye).toEqual([0, 0.7, 1.95]);
    // (1.15 + 1.2 is not exactly 2.35 in binary floating point — the station is
    // the part's measured top plus the offset, so it inherits that arithmetic.)
    near(after.eye[0], 3);
    near(after.eye[1], 0.7);
    near(after.eye[2], 2.35, 1e-12);
    // And the aim followed: it still points at the counter, from a new side.
    expect(after.targetName).toBe("prp_counter");
    expect(after.azimuthDeg).not.toBe(before.azimuthDeg);
  });
});

describe("nudgePose: the ops that need a subject refuse by name when there is none", () => {
  const aimed = resolveShot(
    { station: { orbit: { azimuthDeg: 0, elevationDeg: 0 } }, gaze: { at: "prp_counter" } },
    room,
  );
  const turning = resolveShot(
    { station: { at: "prp_stool", offset: [0, 0, 1.2] }, gaze: { heading: "front" } },
    room,
  );

  it("orbit/rise/dolly refuse on a turn-in-place shot, and say which verb to use", () => {
    expect(() => nudgePose(turning, { orbitDeg: 30 })).toThrow(/turns in place.*turnDeg/s);
    expect(() => nudgePose(turning, { dolly: 2 })).toThrow(/turns in place/);
  });

  it("turn/tilt refuse on an aimed shot, and say which verb to use", () => {
    expect(() => nudgePose(aimed, { turnDeg: 30 })).toThrow(/would fight this shot's aim.*orbitDeg/s);
  });

  it("turn and tilt work on a turn-in-place shot without moving the eye", () => {
    const turned = nudgePose(turning, { turnDeg: 90, tiltDeg: -15 });
    expect(turned.eye).toEqual(turning.eye); // turning is not walking
    expect(turned.headingDeg).toBe(90);
    expect(turned.pitchDeg).toBe(-15);
    expect(turned.facing).toBe("right");
  });

  it("truck/pedestal/advance step in the shot's OWN basis, keeping the aim", () => {
    // "Step two metres to my right, keep looking at it" — the aim is re-derived
    // from the new station, which is what makes this a camera move rather than
    // a teleport that also spins.
    const stepped = nudgePose(aimed, { truck: 2 });
    expect(stepped.targetName).toBe("prp_counter");
    // The eye moved 2m, perpendicular to the original view direction.
    const moved: V3 = [
      stepped.eye[0] - aimed.eye[0],
      stepped.eye[1] - aimed.eye[1],
      stepped.eye[2] - aimed.eye[2],
    ];
    near(len(moved), 2, 1e-9);
    const dotWithForward =
      moved[0] * aimed.forward[0] + moved[1] * aimed.forward[1] + moved[2] * aimed.forward[2];
    near(dotWithForward, 0, 1e-9); // strictly sideways
    // Still aimed at the same point, from a new angle — both facts updated.
    expect(stepped.target).toEqual(aimed.target);
    expect(stepped.azimuthDeg).not.toBe(aimed.azimuthDeg);
  });

  it("pedestal lifts without changing plan position", () => {
    const up = nudgePose(turning, { pedestal: 1 });
    near(up.eye[0], turning.eye[0], 1e-9);
    near(up.eye[1], turning.eye[1], 1e-9);
    near(up.eye[2], turning.eye[2] + 1, 1e-9);
  });

  it("is pure — the pose it was handed is untouched", () => {
    const before = JSON.stringify(aimed);
    nudgePose(aimed, { orbitDeg: 33, dolly: 0.5, truck: 1 });
    expect(JSON.stringify(aimed)).toBe(before);
  });

  it("refuses a step that lands the camera on its own subject", () => {
    expect(() => nudgePose(aimed, { advance: aimed.distance! })).toThrow(/on its own subject/);
  });
});

describe("frameSpanM: the one fact pixels cannot carry", () => {
  it("reports the metres the frame spans at the aim depth", () => {
    // An image of a 2mm screw and an image of a 2m door are the same picture.
    // The span is exact — 2·d·tan(fov/2) — so a reader can size what it sees.
    const pose = resolveShot(
      { gaze: { at: "prp_counter" }, station: { orbit: { azimuthDeg: 0 } }, lens: { fovDeg: 60 } },
      room,
    );
    near(pose.frameSpanM!, 2 * pose.distance! * Math.tan((60 * Math.PI) / 360), 1e-9);
  });

  it("is absent when there is no aim depth to measure at", () => {
    const pose = resolveShot({ station: { point: [0, 0, 1] }, gaze: { heading: 0 } }, room);
    expect(pose.frameSpanM).toBeUndefined();
  });
});

describe("refusals name what was available", () => {
  it("an unknown part to stand at, to orbit, or to aim at", () => {
    expect(() => resolveShot({ station: { at: "nope" }, gaze: { at: "prp_counter" } }, room)).toThrow(
      /no mesh named 'nope' to stand at.*prp_counter/s,
    );
    expect(() =>
      resolveShot({ station: { orbit: { of: "nope", azimuthDeg: 0 } } }, room),
    ).toThrow(/no mesh named 'nope' to orbit/);
    expect(() => resolveShot({ gaze: { at: "nope" } }, room)).toThrow(/no mesh named 'nope' to look at/);
  });

  it("an orbit with nothing to stand off", () => {
    // An orbit needs a subject; a heading gaze gives it none, and `of` was not
    // supplied. Refuse with both remedies named.
    expect(() =>
      resolveShot({ station: { orbit: { azimuthDeg: 0 } }, gaze: { heading: 0 } }, room),
    ).toThrow(/needs something to stand off.*`of`/s);
  });

  it("a station standing exactly on its own aim point", () => {
    const stack = census([
      { name: "shell", min: [-1, -1, 0], max: [1, 1, 2] },
      { name: "pedestal", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 1] },
    ]);
    expect(() => resolveShot({ station: { at: "pedestal" }, gaze: { at: "shell" } }, stack)).toThrow(
      /no direction to look along/,
    );
  });

  it("nonsense frames, lenses and points", () => {
    expect(() =>
      resolveSweep({ gaze: { at: "prp_counter" }, sweep: { frames: 0 } }, room),
    ).toThrow(/must be a positive integer/);
    expect(() => resolveShot({ gaze: { at: "prp_counter" }, lens: { fovDeg: 0 } }, room)).toThrow(
      /not a lens/,
    );
    expect(() =>
      resolveShot({ station: { point: [0, 0, Number.NaN] }, gaze: { heading: 0 } }, room),
    ).toThrow(/must be three numbers/);
  });

  it("every refusal is a ShotResolveError carrying the available names", () => {
    let err: ShotResolveError | undefined;
    try {
      resolveShot({ gaze: { at: "nope" } }, room);
    } catch (e) {
      err = e as ShotResolveError;
    }
    expect(err).toBeInstanceOf(ShotResolveError);
    expect(err!.available).toEqual(["prp_counter", "prp_floor", "prp_stool"]);
  });
});

describe("the echo", () => {
  it("a turn-in-place pose reports its station and facing, not a fake target", () => {
    const line = poseLabel(
      resolveShot({ station: { at: "prp_stool", offset: [0, 0, 1.2] }, gaze: { heading: "left" } }, room),
    );
    expect(line).toContain("facing left");
    expect(line).toContain("0, 0.7, 1.95");
    expect(line).not.toContain("NaN");
  });

  it("an aimed pose reports its subject and where it stands", () => {
    const line = poseLabel(
      resolveShot({ station: { orbit: { azimuthDeg: 270 } }, gaze: { at: "prp_counter" } }, room),
    );
    expect(line).toContain("prp_counter");
    expect(line).toContain("az 270°");
    expect(line).toContain(compassName(270));
  });
});

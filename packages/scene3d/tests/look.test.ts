// The viewport camera: a semantic shot ("the counter, from the left") resolved
// to an exact pose against the measured census. The point is that an agent aims
// by NAMING things, never by guessing coordinates — so these pin that the
// resolution is pure arithmetic over measured boxes, that the pose convention
// is the one `views.ts` owns, and that every substitution is stated.

import { describe, expect, it } from "vitest";
import type { Census } from "../src/types.js";
import {
  DEFAULT_LOOK_FOV_DEG,
  DEFAULT_LOOK_MARGIN,
  LookResolveError,
  lookLabel,
  nudgeLook,
  resolveLook,
} from "../src/read/look.js";
import { compassName, orbitEye } from "../src/read/views.js";

type V3 = [number, number, number];

/** A census with just the fields the resolver reads (world AABBs). */
function census(boxes: Array<{ name: string; min: V3; max: V3 }>): Census {
  return {
    objects: boxes.map((b) => ({ name: b.name, type: "MESH", worldMin: b.min, worldMax: b.max })),
    meshes: boxes.map((b) => ({ object: b.name, spatial: { worldMin: b.min, worldMax: b.max } })),
  } as unknown as Census;
}

/** A two-part bar: a long counter and a stool standing off its front-left. */
const bar = census([
  { name: "prp_counter", min: [-2, -0.5, 0], max: [2, 0.5, 1.1] },
  { name: "prp_stool", min: [-1.2, -1.7, 0], max: [-0.8, -1.3, 0.75] },
]);

const near = (a: number, b: number, eps = 1e-9): void => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("resolveLook: aiming by name, never by coordinate", () => {
  it("aims at a named part's measured centre and frames its whole box", () => {
    const pose = resolveLook({ at: "prp_counter", from: "front" }, bar);
    expect(pose.targetName).toBe("prp_counter");
    expect(pose.target).toEqual([0, 0, 0.55]); // the box centre, measured
    expect(pose.targetSize).toEqual([4, 1, 1.1]);
    // The framing radius is half the box diagonal — so the part fits from EVERY
    // direction, which is what makes two looks at one part comparable.
    near(pose.targetRadius, Math.sqrt(4 ** 2 + 1 ** 2 + 1.1 ** 2) / 2);
  });

  it("puts the camera exactly where the pose convention says, at the fitted distance", () => {
    const pose = resolveLook({ at: "prp_counter", from: "front", elevation: "level" }, bar);
    expect(pose.azimuthDeg).toBe(0);
    expect(pose.elevationDeg).toBe(0);
    // Distance fits the bounding sphere in the lens, then backs off by the margin.
    const expected =
      (pose.targetRadius / Math.sin((DEFAULT_LOOK_FOV_DEG * Math.PI) / 360)) * DEFAULT_LOOK_MARGIN;
    near(pose.distance, expected);
    // `eye` is target + the orbit direction × distance — same orbitEye the
    // runner and the contact sheet use, not a second derivation.
    const dir = orbitEye(0, 0);
    near(pose.eye[0], pose.target[0] + dir[0] * pose.distance);
    near(pose.eye[1], pose.target[1] + dir[1] * pose.distance);
    near(pose.eye[2], pose.target[2] + dir[2] * pose.distance);
    // Azimuth 0 is −Y: the camera stands in FRONT of the subject.
    expect(pose.eye[1]).toBeLessThan(pose.target[1]);
  });

  it("maps every compass word to the azimuth views.ts names it by", () => {
    for (const [word, az] of [
      ["front", 0], ["front-right", 45], ["right", 90], ["back-right", 135],
      ["back", 180], ["back-left", 225], ["left", 270], ["front-left", 315],
    ] as const) {
      const pose = resolveLook({ at: "prp_counter", from: word }, bar);
      expect(pose.azimuthDeg).toBe(az);
      // The name round-trips through the SAME function the report and the
      // contact sheet label frames with — picture and prose cannot disagree.
      expect(pose.name).toBe(compassName(az));
      expect(pose.name).toBe(word);
    }
  });

  it("aims at the whole scene when no part is named", () => {
    const pose = resolveLook({}, bar);
    expect(pose.targetName).toBe("scene");
    // The union of both boxes: x −2..2, y −1.7..0.5, z 0..1.1.
    expect(pose.target).toEqual([0, -0.6, 0.55]);
    expect(pose.targetSize).toEqual([4, 2.2, 1.1]);
  });

  it("an explicit angle pair is honoured exactly and wrapped into [0,360)", () => {
    const pose = resolveLook({ at: "prp_counter", from: { azimuthDeg: -30, elevationDeg: 12 } }, bar);
    expect(pose.azimuthDeg).toBe(330);
    expect(pose.elevationDeg).toBe(12);
    // 330° is not on an octant, so the compass name is marked approximate
    // rather than claiming a precision the shot does not have.
    expect(pose.name).toBe("~front-left");
  });

  it("an explicit distance overrides the fit", () => {
    const pose = resolveLook({ at: "prp_counter", from: "left", distance: 3 }, bar);
    expect(pose.distance).toBe(3);
  });

  it("a larger margin pulls back, a smaller one crops in — monotonic", () => {
    const wide = resolveLook({ at: "prp_counter", margin: 2 }, bar);
    const tight = resolveLook({ at: "prp_counter", margin: 0.5 }, bar);
    expect(wide.distance).toBeGreaterThan(tight.distance);
    // and a narrower lens must stand further back for the same subject
    const longLens = resolveLook({ at: "prp_counter", fovDeg: 20 }, bar);
    const wideLens = resolveLook({ at: "prp_counter", fovDeg: 80 }, bar);
    expect(longLens.distance).toBeGreaterThan(wideLens.distance);
  });
});

describe("resolveLook: standing at a part — viewpoint as a fact about the scene", () => {
  it("measures the pose from the two boxes rather than taking one on faith", () => {
    // Stand at the stool, look at the counter. The stool is at (−1, −1.5) and
    // the counter's centre at (0, 0), so the camera is to the −X/−Y side of it:
    // azimuth is measured, not supplied.
    const pose = resolveLook({ at: "prp_counter", from: { part: "prp_stool" } }, bar);
    expect(pose.targetName).toBe("prp_counter");
    // eye sits above the stool's TOP (z 0.75), at its centre in x/y.
    expect(pose.eye).toEqual([-1, -1.5, 0.75]);
    // The measured direction really points from the target to the eye.
    const d: V3 = [
      pose.eye[0] - pose.target[0],
      pose.eye[1] - pose.target[1],
      pose.eye[2] - pose.target[2],
    ];
    near(pose.distance, Math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2));
    // atan2(dx, −dy) with dx<0, dy<0 ⇒ the front-left quadrant (270..360).
    expect(pose.azimuthDeg).toBeGreaterThan(270);
    expect(pose.azimuthDeg).toBeLessThan(360);
    // The stool's top (z 0.75) is above the counter's centre (z 0.55), so the
    // camera stands ABOVE its subject: elevation is positive and the shot looks
    // slightly down. A seat lower than the counter would report the opposite —
    // the sign is measured, never assumed.
    expect(pose.elevationDeg).toBeGreaterThan(0);
    near(pose.elevationDeg, (Math.asin(0.2 / pose.distance) * 180) / Math.PI, 1e-9);
    expect(pose.notes.join(" ")).toContain("stood at 'prp_stool'");
  });

  it("re-deriving the eye from the measured angles lands back on the same point", () => {
    // The pose the resolver reports must be SELF-CONSISTENT: walking the
    // reported azimuth/elevation/distance out from the target has to reproduce
    // the reported eye, or the echo the agent reads is not the shot it gets.
    const pose = resolveLook({ at: "prp_counter", from: { part: "prp_stool" } }, bar);
    const dir = orbitEye(pose.azimuthDeg, pose.elevationDeg);
    near(pose.target[0] + dir[0] * pose.distance, pose.eye[0], 1e-9);
    near(pose.target[1] + dir[1] * pose.distance, pose.eye[1], 1e-9);
    near(pose.target[2] + dir[2] * pose.distance, pose.eye[2], 1e-9);
  });

  it("eyeHeight lifts the camera above the part it stands on", () => {
    const on = resolveLook({ at: "prp_counter", from: { part: "prp_stool" } }, bar);
    const up = resolveLook({ at: "prp_counter", from: { part: "prp_stool" }, eyeHeight: 1.2 }, bar);
    near(up.eye[2] - on.eye[2], 1.2);
    expect(up.notes.join(" ")).toContain("1.2m above its top");
  });
});

describe("resolveLook: it states what it substituted and refuses what it cannot resolve", () => {
  it("names every default it applied", () => {
    const pose = resolveLook({ at: "prp_counter" }, bar);
    const notes = pose.notes.join(" | ");
    expect(notes).toContain("fov defaulted");
    expect(notes).toContain("from defaulted to front");
    expect(notes).toContain("elevation defaulted");
  });

  it("substitutes a distance for a zero-extent target and SAYS so", () => {
    const point = census([{ name: "prp_point", min: [1, 1, 1], max: [1, 1, 1] }]);
    const pose = resolveLook({ at: "prp_point" }, point);
    expect(pose.distance).toBe(1);
    expect(pose.notes.join(" ")).toContain("zero extent");
    // and it is a real pose, not a NaN one
    expect(pose.eye.every(Number.isFinite)).toBe(true);
  });

  it("an unknown part is refused WITH the names that do exist", () => {
    let err: LookResolveError | undefined;
    try {
      resolveLook({ at: "prp_tabel" }, bar);
    } catch (e) {
      err = e as LookResolveError;
    }
    expect(err).toBeInstanceOf(LookResolveError);
    // The rejection has to close the loop in one step, not restart the guessing.
    expect(err!.message).toContain("prp_tabel");
    expect(err!.message).toContain("prp_counter");
    expect(err!.available).toEqual(["prp_counter", "prp_stool"]);
  });

  it("an unknown direction word is refused and the legal ones are listed", () => {
    expect(() => resolveLook({ at: "prp_counter", from: "norhtwest" }, bar)).toThrow(
      /not a direction.*front-left/s,
    );
  });

  it("a viewpoint coincident with its aim point is refused, not emitted as NaN", () => {
    // The pedestal's top-centre lands exactly on the shell's centre, so the eye
    // and the aim point are the same point and there is no direction to look
    // along. That must be a named refusal, not a NaN pose that renders black.
    const coincident = census([
      { name: "shell", min: [-1, -1, 0], max: [1, 1, 2] }, // centre (0, 0, 1)
      { name: "pedestal", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 1] }, // top-centre (0, 0, 1)
    ]);
    let err: Error | undefined;
    try {
      resolveLook({ at: "shell", from: { part: "pedestal" } }, coincident);
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(LookResolveError);
    expect(err!.message).toContain("no direction to look along");
    // Lifting the eye off that point makes it a legal shot again.
    const lifted = resolveLook(
      { at: "shell", from: { part: "pedestal" }, eyeHeight: 0.5 },
      coincident,
    );
    expect(lifted.eye.every(Number.isFinite)).toBe(true);
    near(lifted.distance, 0.5);
  });

  it("standing on a part and looking at that same part is legal — its own top", () => {
    const solo = census([{ name: "solo", min: [-1, -1, -1], max: [1, 1, 1] }]);
    const pose = resolveLook({ at: "solo", from: { part: "solo" } }, solo);
    // eye is its top-centre (0,0,1), target its centre (0,0,0): straight down.
    expect(pose.eye).toEqual([0, 0, 1]);
    near(pose.distance, 1);
    near(pose.elevationDeg, 90);
  });

  it("refuses a nonsense lens, margin or elevation rather than rendering nonsense", () => {
    expect(() => resolveLook({ at: "prp_counter", fovDeg: 0 }, bar)).toThrow(/not a lens/);
    expect(() => resolveLook({ at: "prp_counter", fovDeg: 200 }, bar)).toThrow(/not a lens/);
    expect(() => resolveLook({ at: "prp_counter", margin: -1 }, bar)).toThrow(/margin/);
    expect(() => resolveLook({ at: "prp_counter", distance: 0 }, bar)).toThrow(/distance/);
    expect(() =>
      resolveLook({ at: "prp_counter", from: { azimuthDeg: 0, elevationDeg: 120 } }, bar),
    ).toThrow(/outside ±90/);
  });

  it("refuses to look at an empty census instead of inventing a subject", () => {
    expect(() => resolveLook({}, census([]))).toThrow(/nothing to look at/);
  });
});

describe("nudgeLook: relative moves are pure rewrites, never hidden state", () => {
  const base = resolveLook({ at: "prp_counter", from: "front", elevation: "level" }, bar);

  it("orbiting adds to the azimuth and re-derives a consistent eye", () => {
    const moved = nudgeLook(base, { orbitDeg: 90 });
    expect(moved.azimuthDeg).toBe(90);
    expect(moved.name).toBe("right");
    expect(moved.distance).toBe(base.distance); // an orbit does not change range
    const dir = orbitEye(moved.azimuthDeg, moved.elevationDeg);
    near(moved.eye[0], moved.target[0] + dir[0] * moved.distance);
    near(moved.eye[1], moved.target[1] + dir[1] * moved.distance);
  });

  it("is pure — the pose it was given is untouched", () => {
    const before = JSON.stringify(base);
    nudgeLook(base, { orbitDeg: 33, dolly: 0.5, riseDeg: 10 });
    expect(JSON.stringify(base)).toBe(before);
  });

  it("four nudges compose to exactly the pose one absolute request would give", () => {
    // This is the property that lets an agent iterate without drift: nudging is
    // arithmetic on the record, so a chain of moves is not an accumulating
    // approximation of anything.
    const chained = nudgeLook(nudgeLook(nudgeLook(base, { orbitDeg: 45 }), { orbitDeg: 45 }), {
      orbitDeg: 45,
    });
    const direct = resolveLook(
      { at: "prp_counter", from: { azimuthDeg: 135, elevationDeg: 0 } },
      bar,
    );
    expect(chained.azimuthDeg).toBe(direct.azimuthDeg);
    near(chained.distance, direct.distance);
    for (let i = 0; i < 3; i++) near(chained.eye[i]!, direct.eye[i]!, 1e-9);
  });

  it("dolly scales range multiplicatively; fov replaces the lens", () => {
    const inCloser = nudgeLook(base, { dolly: 0.5 });
    near(inCloser.distance, base.distance / 2);
    expect(nudgeLook(base, { fovDeg: 24 }).fovDeg).toBe(24);
    expect(() => nudgeLook(base, { dolly: 0 })).toThrow(/dolly/);
    expect(() => nudgeLook(base, { fovDeg: 400 })).toThrow(/not a lens/);
  });

  it("clamps at the pole and says it clamped", () => {
    const up = nudgeLook(base, { riseDeg: 200 });
    expect(up.elevationDeg).toBe(89.9);
    expect(up.notes.join(" ")).toContain("past the pole");
    // and the clamped pose is still finite/usable
    expect(up.eye.every(Number.isFinite)).toBe(true);
  });
});

describe("the echo: a caller always knows exactly where it is standing", () => {
  it("labels a pose with everything needed to re-issue it", () => {
    const pose = resolveLook({ at: "prp_counter", from: "left" }, bar);
    const line = lookLabel(pose);
    expect(line).toContain("prp_counter");
    expect(line).toContain("left");
    expect(line).toContain("az 270°");
    expect(line).toMatch(/fov \d+°/);
    expect(line).toMatch(/[\d.]+m/);
  });

  it("is deterministic — the same census and spec give byte-identical output", () => {
    const a = resolveLook({ at: "prp_stool", from: "back-right" }, bar);
    const b = resolveLook({ at: "prp_stool", from: "back-right" }, bar);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(lookLabel(a)).toBe(lookLabel(b));
  });
});

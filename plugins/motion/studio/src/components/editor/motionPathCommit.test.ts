// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/parsers/gsap-parser";
import { editableAnimationId } from "./motionPathSelection";
import {
  commitNode,
  commitAddWaypoint,
  commitAddKeyframe,
  commitRemoveWaypoint,
  commitCreatePath,
} from "./motionPathCommit";

const anim = (over: Partial<GsapAnimation>): GsapAnimation =>
  ({
    id: "a1",
    targetSelector: "#el",
    method: "to",
    position: 0,
    properties: {},
    ...over,
  }) as GsapAnimation;

// The element the default `#el` tweens target.
const elSel = { id: "el" } as never;

describe("editableAnimationId", () => {
  it("picks the arc animation for an arc path", () => {
    const arc = anim({ id: "arc1", arcPath: { enabled: true, autoRotate: false, segments: [] } });
    expect(editableAnimationId([anim({ id: "other" }), arc], "arc", elSel)).toBe("arc1");
  });

  it("picks a position-keyframe animation for a linear path", () => {
    const kf = anim({
      id: "kf1",
      propertyGroup: "position",
      keyframes: {
        format: "percentage",
        keyframes: [{ percentage: 0, properties: { x: 0, y: 0 } }],
      } as never,
    });
    expect(editableAnimationId([kf], "linear", elSel)).toBe("kf1");
  });

  it("returns null for dynamic (unresolved) tweens — read-only", () => {
    const dyn = anim({
      id: "dyn",
      arcPath: { enabled: true, autoRotate: false, segments: [] },
      hasUnresolvedKeyframes: true,
    });
    expect(editableAnimationId([dyn], "arc", elSel)).toBeNull();
  });

  it("returns null for non-literal (helper) provenance — read-only", () => {
    const helper = anim({
      id: "h",
      arcPath: { enabled: true, autoRotate: false, segments: [] },
      provenance: { kind: "helper" } as never,
    });
    expect(editableAnimationId([helper], "arc", elSel)).toBeNull();
  });

  it("leaves a tween that also moves the element's siblings read-only", () => {
    document.body.innerHTML = `<span class="w" data-hf-id="w0">How</span><span class="w" data-hf-id="w1">we</span>`;
    const word = document.querySelector<HTMLElement>('[data-hf-id="w0"]')!;
    const stagger = anim({
      id: "stagger",
      targetSelector: ".w",
      propertyGroup: "position",
      keyframes: {
        format: "percentage",
        keyframes: [{ percentage: 0, properties: { x: 0, y: 0 } }],
      } as never,
    });
    const wordSel = { selector: ".w", selectorIndex: 0, hfId: "w0", element: word } as never;
    expect(editableAnimationId([stagger], "linear", wordSel)).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(editableAnimationId([anim({ id: "x" })], "linear", elSel)).toBeNull();
  });
});

describe("commitNode", () => {
  it("routes a keyframe node to update-keyframe by percentage", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    await commitNode({ type: "keyframe", pct: 50 }, 120, 30, "a1", commit);
    expect(commit).toHaveBeenCalledWith(
      { type: "update-keyframe", animationId: "a1", percentage: 50, properties: { x: 120, y: 30 } },
      expect.objectContaining({ softReload: true }),
    );
  });

  it("routes a waypoint node to update-motion-path-point by index", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    await commitNode({ type: "waypoint", index: 2 }, 80, 40, "a1", commit);
    expect(commit).toHaveBeenCalledWith(
      { type: "update-motion-path-point", animationId: "a1", pointIndex: 2, x: 80, y: 40 },
      expect.objectContaining({ softReload: true }),
    );
  });
});

describe("commitAddWaypoint / commitRemoveWaypoint", () => {
  it("adds a waypoint at an index with coordinates", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    await commitAddWaypoint("a1", 1, 120, -40, commit);
    expect(commit).toHaveBeenCalledWith(
      { type: "add-motion-path-point", animationId: "a1", index: 1, x: 120, y: -40 },
      expect.objectContaining({ softReload: true }),
    );
  });

  it("removes a waypoint by index", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    await commitRemoveWaypoint("a1", 2, commit);
    expect(commit).toHaveBeenCalledWith(
      { type: "remove-motion-path-point", animationId: "a1", index: 2 },
      expect.objectContaining({ softReload: true }),
    );
  });
});

describe("commitAddKeyframe", () => {
  it("inserts an x/y keyframe at a tween-relative percentage", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    await commitAddKeyframe("a1", 42.5, 80, -20, commit);
    expect(commit).toHaveBeenCalledWith(
      { type: "add-keyframe", animationId: "a1", percentage: 42.5, properties: { x: 80, y: -20 } },
      expect.objectContaining({ softReload: true }),
    );
  });
});

describe("commitCreatePath", () => {
  it("authors a new motionPath to a destination at a given time", async () => {
    const commit = vi.fn().mockResolvedValue(undefined);
    await commitCreatePath("#title", 2.0, 300, -120, commit);
    expect(commit).toHaveBeenCalledWith(
      {
        type: "add-motion-path",
        targetSelector: "#title",
        position: 2.0,
        duration: 1.5,
        x: 300,
        y: -120,
      },
      expect.objectContaining({ softReload: true }),
    );
  });
});

vi.mock("../../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
import { trackStudioEvent } from "../../utils/studioTelemetry";
import type { CommitFn } from "./motionPathCommit";
beforeEach(() => vi.clearAllMocks());
describe("motion path usage at the writer", () => {
  it("counts a changed drag once without coordinates or target ids", async () => {
    const commit: CommitFn = async (_mutation, options) => {
      options.onResult?.({ ok: true, changed: true });
    };
    await commitNode({ type: "keyframe", pct: 50 }, 120, 30, "private-target", commit);
    expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("feature_used", {
      feature: "motion_path",
      surface: "preview",
      method: "drag",
    });
  });
  it.each([undefined, { ok: true }, { ok: true, changed: false }, { ok: false, changed: true }])(
    "does not count absent or unsuccessful results (%j)",
    async (result) => {
      const commit: CommitFn = async (_mutation, options) => {
        if (result) options.onResult?.(result);
      };
      await commitAddWaypoint("private-target", 1, 20, 40, commit);
      expect(trackStudioEvent).not.toHaveBeenCalled();
    },
  );
});
